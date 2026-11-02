import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGES = ['explore', 'product', 'live', 'scale'];
const STATE_FILE = '.agents/foundry.json';
const AGENTS_MD_STATES = ['migrated', 'unmigrated'];

// An error the user caused: printed as `foundry: <message>` with its own exit code.
class FoundryError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// The repo top, or the cwd outside git.
export function repoTop(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || cwd;
  } catch {
    return cwd;
  }
}

export function readState(top) {
  const path = join(top, STATE_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeState(top, state) {
  const path = join(top, STATE_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

// Required files per stage, cumulative. The UI_ONLY files apply only when the repo has UI.
const EXPLORE_FILES = ['AGENTS.md'];
const PRODUCT_FILES = [...EXPLORE_FILES, 'PRODUCT.md', 'docs/decisions/index.md', 'GLOSSARY.md', 'ARCHITECTURE.md', '.agents/code-map.md', 'DESIGN.md', 'docs/ui/screens.md', 'CONSTRAINTS.md'];
const LIVE_FILES = [...PRODUCT_FILES, 'docs/threat-model.md', 'docs/runbooks/'];
export const REQUIRED = { explore: EXPLORE_FILES, product: PRODUCT_FILES, live: LIVE_FILES, scale: LIVE_FILES };
export const UI_ONLY = ['DESIGN.md', 'docs/ui/screens.md'];
export const requiredFor = (stage, hasUi) => REQUIRED[stage].filter((f) => hasUi || !UI_ONLY.includes(f));

// A repo may keep DESIGN.md below the top (web/DESIGN.md); the state records where as design_md.
const designPath = (state) => (typeof state?.design_md === 'string' && state.design_md ? state.design_md : 'DESIGN.md');
const asRecorded = (state) => (f) => (f === 'DESIGN.md' ? designPath(state) : f);

const COPILOT_SESSIONS = () => join(homedir(), '.copilot', 'session-state');

// v1 thresholds for proposing the product stage.
const PRODUCT_COMMITS = 30;
const PRODUCT_AGE_DAYS = 7;
const PRODUCT_SESSIONS = 3;
const AUTH_LIMIT = 5;
const DAY_MS = 86_400_000;

const UI_FILE = /\.(tsx|jsx|vue|svelte|html)$/;
const UI_DIRS = ['web/', 'apps/web/', 'frontend/'];
const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|e2e|fixtures?)\/|\.(test|spec)\.[^/]+$/;
const AUTH_PATH = /(auth|session|login|tenant|rbac|permission)/i;
const DEPLOY_WORKFLOW = /deploy|docker\/build-push-action|ghcr\.io/i;
const COMPOSE_FILE = /^(docker-)?compose\.y[a-z]*ml$/;
const NAMES_USERS = /\busers?\b/i;

function gitOut(top, args) {
  try {
    return execFileSync('git', args, { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const real = (path) => { try { return realpathSync(path); } catch { return path; } };

const SKIP_DIRS = new Set(['node_modules', '.git']);
const skipped = (path) => path.split('/').some((part) => SKIP_DIRS.has(part));

// Every file under dir, repo-relative; never descends into node_modules or .git.
function walk(top, dir = top, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of entries) {
    if (SKIP_DIRS.has(d.name)) continue;
    const path = join(dir, d.name);
    if (d.isDirectory()) walk(top, path, out);
    else if (d.isFile()) out.push(path.slice(top.length + 1));
  }
  return out;
}

// Is top the work tree's own top? A folder without git of its own inside another repo is not.
const ownRepo = (top) => {
  const t = gitOut(top, ['rev-parse', '--show-toplevel']);
  return t !== null && real(t) === real(top);
};

// Where signals reads the repo from: the work tree, or the tree of one commit (--as-of).
function worktreeSource(top) {
  const git = ownRepo(top);
  const out = git ? gitOut(top, ['ls-files', '--cached', '--others', '--exclude-standard']) : null;
  const files = (out !== null ? out.split('\n').filter(Boolean) : walk(top)).filter((f) => !skipped(f)).sort();
  return { git, rev: 'HEAD', files, read: (f) => readText(join(top, f)), has: (f) => present(top, f) };
}

function commitSource(top, rev) {
  const out = gitOut(top, ['ls-tree', '-r', '--name-only', '-z', rev]);
  if (out === null) throw new FoundryError(`--as-of ${rev} is not a commit in this repo`, 2);
  const files = out.split('\0').filter(Boolean).filter((f) => !skipped(f)).sort();
  const set = new Set(files);
  const has = (f) => (f.endsWith('/') ? files.some((x) => x.startsWith(f)) : set.has(f));
  const read = (f) => (set.has(f) ? gitOut(top, ['show', `${rev}:${f}`]) ?? '' : '');
  return { git: true, rev, files, read, has };
}

// The first commit at or before an ISO date or a commit-ish.
function resolveAsOf(top, asOf) {
  if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) {
    // A bare date means the end of that day, local time, as git reads --before.
    const when = asOf.length === 10 ? `${asOf}T23:59:59` : asOf;
    const date = Date.parse(when);
    if (Number.isNaN(date)) throw new FoundryError(`--as-of ${asOf} is not a date`, 2);
    const sha = gitOut(top, ['rev-list', '-1', `--before=${when}`, 'HEAD']);
    if (!sha) throw new FoundryError(`--as-of ${asOf}: no commit on or before that date`, 2);
    return { sha, date };
  }
  const sha = gitOut(top, ['rev-parse', '--verify', '-q', `${asOf}^{commit}`]);
  if (!sha) throw new FoundryError(`--as-of ${asOf} is not a commit in this repo`, 2);
  return { sha, date: Date.parse(gitOut(top, ['show', '-s', '--format=%cI', sha])) };
}

// Commits on the upstream (or origin's default branch) that HEAD lacks, from the last fetch; null when unknown.
function behindUpstream(top) {
  const up = gitOut(top, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
    ?? gitOut(top, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']);
  if (!up) return null;
  const n = Number(gitOut(top, ['rev-list', '--count', `HEAD..${up}`]));
  return Number.isFinite(n) ? { ref: up, commits: n } : null;
}

const within = (path, top) => path === top || path.startsWith(top + '/');

// `owner/repo` from the origin URL (https or scp-style), or null.
function originSlug(top) {
  const url = gitOut(top, ['remote', 'get-url', 'origin']);
  const m = url?.match(/[:/]([^/:]+\/[^/]+?)(\.git)?\/?$/);
  return m ? m[1] : null;
}

const yamlValue = (text, key) => {
  const m = text.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : null;
};

// Copilot session dir names whose workspace is this repo or inside it, sorted; null without a sessions root.
function matchingSessions(top, root) {
  if (!existsSync(root)) return null;
  const tops = [...new Set([top, real(top)])];
  const slug = originSlug(top);
  const ids = [];
  for (const id of readdirSync(root).sort()) {
    const text = readText(join(root, id, 'workspace.yaml'));
    if (!text) continue;
    const paths = [yamlValue(text, 'cwd'), yamlValue(text, 'git_root')].filter(Boolean);
    const byPath = paths.some((p) => [p, real(p)].some((q) => tops.some((t) => within(q, t))));
    const repository = yamlValue(text, 'repository');
    if (byPath || (slug && repository === slug)) ids.push(id);
  }
  return ids;
}

function deployEvidence(src) {
  const { files, read } = src;
  const found = [];
  for (const f of files) {
    if (/^\.github\/workflows\/[^/]+$/.test(f) && DEPLOY_WORKFLOW.test(read(f))) found.push(f);
  }
  for (const f of files) {
    if (COMPOSE_FILE.test(f) && /^\s*ports:/m.test(read(f))) found.push(f);
  }
  if (files.includes('Dockerfile')) found.push('Dockerfile');
  for (const url of read('README.md').match(/https:\/\/[^\s)<>\]"'`]+/g) ?? []) {
    let host = '';
    try { host = new URL(url).hostname; } catch { continue; }
    if (host !== 'github.com' && !host.endsWith('.github.com')) { found.push(`README.md: ${url}`); break; }
  }
  return found;
}

function present(top, file) {
  const path = join(top, file);
  if (!existsSync(path)) return false;
  return file.endsWith('/') ? statSync(path).isDirectory() : true;
}

// What the repo shows about its stage, and the stage to propose. The owner decides.
// opts.asOf (an ISO date or a commit) reads the repo as it was then; sessions are then left out.
export function signals(top, opts = {}) {
  const sessionsRoot = opts.sessionsRoot ?? COPILOT_SESSIONS();
  const asOf = opts.asOf ? resolveAsOf(top, opts.asOf) : null;
  const src = asOf ? commitSource(top, asOf.sha) : worktreeSource(top);
  const recorded = asOf ? null : readState(top);
  const { files } = src;
  const now = asOf ? asOf.date : Date.now();

  const commits = src.git ? Number(gitOut(top, ['rev-list', '--count', src.rev]) ?? 0) || 0 : 0;
  const roots = commits ? (gitOut(top, ['log', '--max-parents=0', '--format=%cI', src.rev]) ?? '').split('\n').filter(Boolean).sort() : [];
  const first_commit = roots[0] ?? null;
  const age_days = first_commit ? Math.max(0, Math.floor((now - Date.parse(first_commit)) / DAY_MS)) : 0;

  const has_ui = files.some((f) => UI_FILE.test(f) && !TEST_PATH.test(f))
    || UI_DIRS.some((d) => files.some((f) => f.startsWith(d)) || src.has(d));
  const deployed = deployEvidence(src);
  const auth_code = files.filter((f) => AUTH_PATH.test(f)).slice(0, AUTH_LIMIT);
  const sessions = asOf ? null : matchingSessions(top, sessionsRoot)?.length ?? null;
  const hasProduct = src.has('PRODUCT.md');
  const namesUsers = NAMES_USERS.test(src.read('README.md'));

  const productReasons = [
    commits >= PRODUCT_COMMITS && `${commits} commits`,
    age_days >= PRODUCT_AGE_DAYS && `${age_days} days since the first commit`,
    sessions !== null && sessions >= PRODUCT_SESSIONS && `${sessions} Copilot sessions`,
    hasProduct && 'PRODUCT.md exists',
  ].filter(Boolean);
  const liveReasons = deployed.length
    ? [...deployed.map((d) => `deployed: ${d}`), ...auth_code.map((a) => `auth code: ${a}`), ...(namesUsers ? ['README names users'] : [])]
    : [];
  const reasons = [...productReasons, ...liveReasons];

  let proposed = 'explore';
  if (deployed.length && (auth_code.length || namesUsers)) proposed = 'live';
  else if (productReasons.length) proposed = 'product';

  const stage = recorded?.stage;
  if (stage === 'scale' && proposed !== 'scale') {
    proposed = 'scale';
    reasons.push('recorded stage is scale');
  } else if (STAGES.indexOf(stage) > STAGES.indexOf(proposed)) {
    proposed = stage;
    reasons.push('recorded stage is higher; propose a lower one only with the owner');
  }
  if (!reasons.length) reasons.push('no signal beyond explore');

  const required = requiredFor(proposed, has_ui).map(asRecorded(recorded));
  const fileMap = Object.fromEntries(required.map((f) => [f, src.has(f)]));
  const behind = asOf || !src.git ? null : behindUpstream(top);
  // An unrecorded DESIGN.md one folder down, for the owner to record with state --set design_md=<path>.
  const design_md_found = has_ui && !recorded?.design_md && !src.has('DESIGN.md')
    ? files.find((f) => /^[^/]+\/DESIGN\.md$/.test(f)) ?? null
    : null;

  const out = { commits, first_commit, age_days, files: fileMap, has_ui, deployed, auth_code, sessions, proposed, reasons, behind, design_md_found };
  if (asOf) out.as_of = asOf.sha;
  return out;
}

// A checkout this far behind its upstream may be missing the docs it is asked about.
const BEHIND_WARN = 10;

function signalsCmd(args) {
  let asOf = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--as-of') {
      asOf = args[++i];
      if (!asOf) throw new FoundryError('--as-of needs a date or a commit', 2);
    } else throw new FoundryError(`unknown argument ${args[i]}`, 2);
  }
  const s = signals(repoTop(), { asOf });
  if (json) { process.stdout.write(JSON.stringify(s, null, 2) + '\n'); return; }
  const head = s.as_of ? `proposed stage as of ${s.as_of.slice(0, 7)}: ${s.proposed}` : `proposed stage: ${s.proposed}`;
  const warn = s.behind && s.behind.commits >= BEHIND_WARN ? `warn: ${s.behind.commits} commits behind ${s.behind.ref}; pull before trusting the files list\n` : '';
  process.stdout.write(`${head}\n${s.reasons.map((r) => `- ${r}\n`).join('')}${warn}`);
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Each settable key parses its value or throws; `apply` writes it into the state.
const SETTERS = {
  stage: (s, v) => {
    if (!STAGES.includes(v)) throw new FoundryError(`stage must be one of ${STAGES.join(', ')}`, 2);
    if (s.stage !== v) s.stage_set = today();
    s.stage = v;
  },
  stage_reason: (s, v) => { s.stage_reason = v; },
  readiness_tier: (s, v) => {
    if (!/^\d+$/.test(v)) throw new FoundryError('readiness_tier must be a whole number', 2);
    s.readiness_tier = Number(v);
  },
  'agents_md.state': (s, v) => {
    if (!AGENTS_MD_STATES.includes(v)) throw new FoundryError(`agents_md.state must be one of ${AGENTS_MD_STATES.join(', ')}`, 2);
    s.agents_md = { ...s.agents_md, state: v };
  },
  has_ui: (s, v) => {
    if (v !== 'true' && v !== 'false') throw new FoundryError('has_ui must be true or false', 2);
    s.has_ui = v === 'true';
  },
  design_md: (s, v) => {
    if (!/^[^/\s][^\s]*DESIGN\.md$/.test(v) || v.split('/').includes('..')) throw new FoundryError('design_md must be a repo path ending in DESIGN.md', 2);
    s.design_md = v;
  },
};

function parseSets(args) {
  const sets = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--set') throw new FoundryError(`unknown argument ${args[i]}`, 2);
    const pair = args[++i];
    const eq = pair?.indexOf('=') ?? -1;
    if (eq < 1) throw new FoundryError('--set needs key=value', 2);
    const key = pair.slice(0, eq);
    if (!Object.hasOwn(SETTERS, key)) throw new FoundryError(`--set accepts ${Object.keys(SETTERS).join(', ')}`, 2);
    sets.push([key, pair.slice(eq + 1)]);
  }
  return sets;
}

function state(args) {
  const sets = parseSets(args);
  const top = repoTop();
  const current = readState(top);
  if (!current) throw new FoundryError(`no ${STATE_FILE}`, 1);
  if (sets.length) {
    // Every value is checked before anything is written.
    const next = structuredClone(current);
    for (const [key, value] of sets) SETTERS[key](next, value);
    writeState(top, next);
    process.stdout.write(JSON.stringify(next, null, 2) + '\n');
  } else {
    process.stdout.write(JSON.stringify(current, null, 2) + '\n');
  }
}

// ---- init-files ----

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const DOC_CHECK = '.agents/doc-check.sh';
const CHECK_SH = '.agents/check.sh';
const SECURITY_LINE = 'The reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed.';
const UI_LINE = 'After any UI change, run check-screens before reporting done.';

// Files init-files writes per stage, as [repo path, template]. DESIGN.md and .agents/code-map.md belong to providers.
const PRODUCT_TEMPLATES = [
  ['PRODUCT.md', 'PRODUCT.md'], ['ARCHITECTURE.md', 'ARCHITECTURE.md'], ['GLOSSARY.md', 'GLOSSARY.md'],
  ['docs/decisions/index.md', 'decisions-index.md'], ['docs/decisions/0000-template.md', 'decision.md'],
  ['CONSTRAINTS.md', 'CONSTRAINTS.md'],
];
const LIVE_TEMPLATES = [...PRODUCT_TEMPLATES, ['docs/threat-model.md', 'threat-model.md'], ['docs/runbooks/README.md', 'runbook.md']];
const STAGE_TEMPLATES = { explore: [], product: PRODUCT_TEMPLATES, live: LIVE_TEMPLATES, scale: LIVE_TEMPLATES };
// Written only when the repo has UI. The same template ships with check-screens, which keeps the map true.
const UI_TEMPLATES = [['docs/ui/screens.md', 'screens.md']];

// What `## Where things are` may link to, in order, when the file will exist.
const LINKS = [
  ['README.md', 'what this is and how to run it'],
  ['PRODUCT.md', 'who it is for and what it must do'],
  ['ARCHITECTURE.md', 'how the code is laid out'],
  ['.agents/code-map.md', 'the module by module map'],
  ['GLOSSARY.md', 'the words this project uses'],
  ['DESIGN.md', 'the visual design system'],
  ['docs/ui/screens.md', 'every screen, its approved mockup and its last check'],
  ['CONSTRAINTS.md', 'the limits the project works within'],
  ['docs/decisions/index.md', 'product-level decisions'],
  ['docs/threat-model.md', 'what we protect and from whom'],
  ['docs/runbooks/README.md', 'operations under pressure'],
];

const template = (name) => readFileSync(join(TEMPLATES, name), 'utf8');
const versionOf = (text) => text.split('\n')[1]?.match(/^# foundry doc-check v(\S+)$/)?.[1] ?? null;

// Copies the doc check into the repo when missing or at another version.
export function vendorDocCheck(top, { dryRun = false } = {}) {
  const text = template('doc-check.sh');
  const path = join(top, DOC_CHECK);
  const result = !existsSync(path) ? 'created' : versionOf(readText(path)) !== versionOf(text) ? 'updated' : 'current';
  if (result !== 'current' && !dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    chmodSync(path, 0o755);
  }
  return result;
}

const hasScript = (pkg, name) => typeof pkg.scripts?.[name] === 'string';

// The edit that adds a `check` task to the runner the repo already uses: {file, text|null, command, line}.
function planCheck(top) {
  const pkgPath = join(top, 'package.json');
  if (existsSync(pkgPath)) {
    const text = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(text);
    const command = 'npm run check';
    if (hasScript(pkg, 'check')) return { file: 'package.json', text: null, command };
    const parts = [hasScript(pkg, 'lint') && 'npm run lint', hasScript(pkg, 'test') && 'npm test', `sh ${DOC_CHECK}`].filter(Boolean);
    // Keep the file's indent; a one-line file stays on one line.
    const indent = text.trim().includes('\n') ? (text.match(/^\{[ \t]*\n([ \t]+)"/)?.[1] ?? '  ') : '';
    const next = { ...pkg, scripts: { ...pkg.scripts, check: parts.join(' && ') } };
    const out = JSON.stringify(next, null, indent || undefined) + (text.endsWith('\n') ? '\n' : '');
    return { file: 'package.json', text: out, command };
  }
  const misePath = join(top, 'mise.toml');
  if (existsSync(misePath)) {
    const text = readFileSync(misePath, 'utf8');
    const command = 'mise run check';
    // A task is a [tasks.x] table, or an x = ... key inside [tasks].
    const tasksBody = text.match(/^\[tasks\][ \t]*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1] ?? '';
    const hasTask = (t) => new RegExp(`^\\[tasks\\.${t}\\]`, 'm').test(text) || new RegExp(`^[ \\t]*"?${t}"?[ \\t]*=`, 'm').test(tasksBody);
    if (hasTask('check')) return { file: 'mise.toml', text: null, command };
    const run = hasTask('test') ? `mise run test && sh ${DOC_CHECK}` : `sh ${DOC_CHECK}`;
    return { file: 'mise.toml', text: `${text.replace(/\n*$/, '\n')}\n[tasks.check]\nrun = "${run}"\n`, command };
  }
  const makePath = join(top, 'Makefile');
  if (existsSync(makePath)) {
    const text = readFileSync(makePath, 'utf8');
    const command = 'make check';
    if (/^check\s*:/m.test(text)) return { file: 'Makefile', text: null, command };
    const recipe = [/^test\s*:/m.test(text) && '\t$(MAKE) test', `\tsh ${DOC_CHECK}`].filter(Boolean).join('\n');
    return { file: 'Makefile', text: `${text.replace(/\n*$/, '\n')}\ncheck:\n${recipe}\n`, command };
  }
  const cargo = existsSync(join(top, 'Cargo.toml')) ? 'cargo fmt --check && cargo clippy -- -D warnings && cargo test && ' : '';
  return { file: CHECK_SH, script: `#!/bin/sh\nset -eu\n${cargo}sh ${DOC_CHECK}\n`, command: `sh ${CHECK_SH}` };
}

// The `## Where things are` entries for the files that will exist.
const linkedFiles = (willExist, rename = (f) => f) => LINKS.map(([f, what]) => [rename(f), what]).filter(([f]) => willExist(f));
const hasSecurityLine = (stage) => stage !== 'explore';

const hasUiLine = (stage, hasUi) => hasUi && stage !== 'explore';

function agentsMd(stage, name, check, willExist, hasUi, rename) {
  const links = linkedFiles(willExist, rename).map(([f, what]) => `- [${f}](${f}): ${what}.`);
  let text = template('AGENTS.md')
    .replace('{{name}}', () => name)
    .replace('{{check}}', () => check)
    .replace('{{links}}', () => (links.length ? links.join('\n') : 'Nothing yet beyond this file.'));
  if (!hasSecurityLine(stage)) text = text.replace(`${SECURITY_LINE}\n`, '');
  if (!hasUiLine(stage, hasUi)) text = text.replace(`${UI_LINE}\n`, '');
  return text;
}

// What a kept AGENTS.md lacks against the one agentsMd would write at this stage, as `agents-md:` lines.
function agentsMdGaps(text, stage, willExist, hasUi, rename) {
  const linked = (f) => text.includes(`](${f})`) || text.includes(`](./${f})`) || text.includes(`](${f}#`);
  const gaps = linkedFiles(willExist, rename).filter(([f]) => !linked(f)).map(([f]) => `agents-md: add link to ${f}`);
  if (hasSecurityLine(stage) && !text.includes(SECURITY_LINE)) gaps.push(`agents-md: add line: ${SECURITY_LINE}`);
  if (hasUiLine(stage, hasUi) && !text.includes(UI_LINE)) gaps.push(`agents-md: add line: ${UI_LINE}`);
  return gaps;
}

// Ignore rules matching each path, as `warn` lines; none outside a git work tree.
// Without --no-index, tracked paths are never reported: they already reach other clones.
function ignoredWarnings(top, paths) {
  if (!paths.length || gitOut(top, ['rev-parse', '--is-inside-work-tree']) !== 'true') return [];
  const r = spawnSync('git', ['check-ignore', '-v', '-z', '--stdin'], {
    cwd: top, input: paths.join('\0') + '\0', encoding: 'utf8',
  });
  // 1 means nothing is ignored; anything else is git failing, which must not read as "nothing ignored".
  if (r.status === 1 || (r.status === 0 && !r.stdout)) return [];
  if (r.status !== 0) return [`warn could not check ignore rules: ${(r.stderr || `git exited ${r.status}`).trim().split('\n')[0]}`];
  const f = r.stdout.split('\0');
  const out = [];
  for (let i = 0; i + 3 < f.length; i += 4) {
    const [source, line, pattern, path] = f.slice(i, i + 4);
    // -v also prints paths matched by a negation (`!x`), which are not ignored.
    if (source && !pattern.startsWith('!')) out.push(`warn ${path} is gitignored (${source}:${line}): add it with git add -f`);
  }
  return out;
}

// Writes the stage's missing docs, the state, the doc check and the check task. Returns the report lines.
export function initFiles(top, { stage, name = basename(top), skip = [], dryRun = false } = {}) {
  if (!STAGES.includes(stage)) throw new FoundryError(`--stage must be one of ${STAGES.join(', ')}`, 2);
  const lines = [];
  const writes = [];
  const reported = [];
  const exists = (f) => existsSync(join(top, f));
  const current = readState(top);
  const hasUi = current ? current.has_ui === true : signals(top).has_ui;
  const uiDocs = hasUi && stage !== 'explore' ? UI_TEMPLATES : [];
  const docs = [...STAGE_TEMPLATES[stage], ...uiDocs].filter(([f]) => !skip.includes(f));
  const written = new Set(docs.filter(([f]) => !exists(f)).map(([f]) => f));
  const willExist = (f) => !skip.includes(f) && (written.has(f) || exists(f));
  const check = planCheck(top);

  const agentsExisted = exists('AGENTS.md');
  if (current && current.stage !== stage) lines.push(`warn --stage ${stage} differs from the recorded stage ${current.stage}; the state keeps ${current.stage}, so set it with state --set stage=${stage} first`);
  reported.push('AGENTS.md', ...docs.map(([f]) => f), STATE_FILE, check.file, DOC_CHECK);
  // Never rewrite an existing AGENTS.md. When foundry wrote it, name what this stage adds so grow can propose it.
  if (agentsExisted && current?.agents_md?.state === 'migrated') {
    lines.push('kept AGENTS.md (exists)', ...agentsMdGaps(readText(join(top, 'AGENTS.md')), stage, willExist, hasUi, asRecorded(current)));
  } else if (agentsExisted) lines.push('kept AGENTS.md (exists, unmigrated)');
  else {
    writes.push(['AGENTS.md', agentsMd(stage, name, check.command, willExist, hasUi, asRecorded(current))]);
    lines.push('created AGENTS.md');
  }
  for (const [f, t] of docs) {
    if (written.has(f)) { writes.push([f, template(t)]); lines.push(`created ${f}`); }
    else lines.push(`kept ${f} (exists)`);
  }

  const docCheckVersion = versionOf(template('doc-check.sh'));
  const nextState = current
    ? { ...current, doc_check_version: docCheckVersion }
    : {
      version: 1, stage, stage_set: today(), stage_reason: 'init', has_ui: hasUi,
      agents_md: { budget_lines: 100, state: agentsExisted ? 'unmigrated' : 'migrated' },
      readiness_tier: 0, providers: {}, queue: [], garden_last: null, doc_check_version: docCheckVersion,
    };
  lines.push(current ? `kept ${STATE_FILE} (exists)` : `created ${STATE_FILE}`);

  if (check.script !== undefined) {
    if (exists(check.file)) lines.push(`kept ${check.file} (exists)`);
    else { writes.push([check.file, check.script, 0o755]); lines.push(`created ${check.file}`); }
  } else if (check.text === null) lines.push(`kept ${check.file} check (exists)`);
  else { writes.push([check.file, check.text]); lines.push(`wired check in ${check.file}`); }

  lines.push(`doc-check ${vendorDocCheck(top, { dryRun: true })}`);

  if (!dryRun) {
    for (const [f, text, mode] of writes) {
      mkdirSync(dirname(join(top, f)), { recursive: true });
      writeFileSync(join(top, f), text);
      if (mode) chmodSync(join(top, f), mode);
    }
    writeState(top, nextState);
    vendorDocCheck(top);
  }
  const warns = ignoredWarnings(top, reported);
  return [...(dryRun ? lines.map((l) => `would ${l}`) : lines), ...warns];
}

function initFilesCmd(args) {
  const opts = { skip: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => {
      const v = args[++i];
      if (v === undefined) throw new FoundryError(`${a} needs a value`, 2);
      return v;
    };
    if (a === '--stage') opts.stage = value();
    else if (a === '--name') opts.name = value();
    else if (a === '--skip') opts.skip.push(...value().split(',').map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean));
    else if (a === '--dry-run') opts.dryRun = true;
    else throw new FoundryError(`unknown argument ${a}`, 2);
  }
  if (!opts.stage) throw new FoundryError('init-files needs --stage', 2);
  const lines = initFiles(repoTop(), opts);
  process.stdout.write(lines.map((l) => l + '\n').join(''));
}

function vendorCheckCmd(args) {
  for (const a of args) throw new FoundryError(`unknown argument ${a}`, 2);
  process.stdout.write(`doc-check ${vendorDocCheck(repoTop())}\n`);
}

// ---- digest ----

const DIGEST_LIMIT = 30;
const USER_CHARS = 500;
const CHUNK = 1 << 20;
const NEWLINE = 0x0a;
// Tool output can hold secrets. Its lines are dropped on these bytes, before any decoding or parsing.
const TOOL_OUTPUT = Buffer.from('"tool.execution_complete"');

// Each line of a file, as a Buffer, read in chunks so a large transcript never sits in memory whole.
function* lines(path) {
  let fd;
  try { fd = openSync(path, 'r'); } catch { return; }
  try {
    const buf = Buffer.alloc(CHUNK);
    let rest = Buffer.alloc(0);
    for (let n; (n = readSync(fd, buf, 0, CHUNK, null)) > 0;) {
      let chunk = Buffer.concat([rest, buf.subarray(0, n)]);
      for (let nl; (nl = chunk.indexOf(NEWLINE)) !== -1; chunk = chunk.subarray(nl + 1)) yield chunk.subarray(0, nl);
      rest = Buffer.from(chunk);
    }
    if (rest.length) yield rest;
  } finally {
    closeSync(fd);
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// One session reduced to what tune may read: user text, tool names with argument key names, skill names, compactions.
function digestSession(dir, id) {
  const workspace = readText(join(dir, 'workspace.yaml'));
  let started = null;
  const user = [];
  const tools = new Set();
  const skills = new Set();
  let compactions = 0;
  for (const raw of lines(join(dir, 'events.jsonl'))) {
    if (raw.includes(TOOL_OUTPUT)) continue;
    let e;
    try { e = JSON.parse(raw.toString('utf8')); } catch { continue; }
    if (!isObject(e) || !isObject(e.data)) continue;
    // The type decides which one field is read; nothing else in the event is touched.
    if (e.type === 'session.start') {
      if (started === null && typeof e.data.startTime === 'string') started = e.data.startTime;
    } else if (e.type === 'user.message') {
      if (typeof e.data.content === 'string') user.push(Array.from(e.data.content).slice(0, USER_CHARS).join(''));
    } else if (e.type === 'tool.execution_start') {
      const name = e.data.toolName;
      if (typeof name !== 'string') continue;
      const args = isObject(e.data.arguments) ? e.data.arguments : {};
      tools.add(`${name}(${Object.keys(args).join(',')})`);
      if (name === 'skill' && typeof args.skill === 'string') skills.add(args.skill);
    } else if (e.type === 'session.compaction_start') {
      compactions++;
    }
  }
  started ??= yamlValue(workspace, 'created_at');
  return { id, started, user, tools: [...tools], skills: [...skills], compactions };
}

// The Copilot sessions of this repo, newest first by start time.
export function digest(top, { sessionsRoot = COPILOT_SESSIONS(), limit = DIGEST_LIMIT } = {}) {
  const ids = matchingSessions(top, sessionsRoot) ?? [];
  const all = ids.map((id) => digestSession(join(sessionsRoot, id), id));
  const time = (d) => Date.parse(d.started ?? '') || 0;
  all.sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
  return all.slice(0, limit);
}

function digestCmd(args) {
  let limit = DIGEST_LIMIT;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--limit') {
      const v = args[++i];
      if (!/^[1-9]\d*$/.test(v ?? '')) throw new FoundryError('--limit needs a whole number above 0', 2);
      limit = Number(v);
    } else throw new FoundryError(`unknown argument ${args[i]}`, 2);
  }
  const ds = digest(repoTop(), { limit });
  if (json) process.stdout.write(JSON.stringify(ds, null, 2) + '\n');
  else process.stdout.write(ds.map((d) => `${d.id} ${d.started} ${d.user.length} user msgs, ${d.tools.length} tools, skills: ${d.skills.join(',')}\n`).join(''));
}

// ---- garden-range ----

const GARDEN_DEFAULT = 50;

// The commits since the last garden pass, or the last 50 (from the root when there are fewer), as git's from..to.
export function gardenRange(top) {
  const to = gitOut(top, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']);
  if (!to) throw new FoundryError('no commits yet', 1);
  const last = readState(top)?.garden_last ?? null;
  let from;
  if (last !== null) {
    const known = gitOut(top, ['rev-parse', '--verify', '-q', `${last}^{commit}`]);
    if (!known || gitOut(top, ['merge-base', '--is-ancestor', known, to]) === null) {
      throw new FoundryError(`garden_last ${String(last).slice(0, 7)} is not in this history; set it with garden-range --mark after a full pass`, 1);
    }
    from = known;
  } else {
    from = gitOut(top, ['rev-parse', '--verify', '-q', `HEAD~${GARDEN_DEFAULT}^{commit}`])
      ?? gitOut(top, ['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0];
  }
  const commits = Number(gitOut(top, ['rev-list', '--count', `${from}..${to}`])) || 0;
  return { from, to, commits };
}

function gardenRangeCmd(args) {
  for (const a of args) if (a !== '--mark' && a !== '--json') throw new FoundryError(`unknown argument ${a}`, 2);
  const top = repoTop();
  const r = gardenRange(top);
  let current = null;
  if (args.includes('--mark')) {
    current = readState(top);
    if (!current) throw new FoundryError(`no ${STATE_FILE}`, 1);
  }
  if (args.includes('--json')) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  else process.stdout.write(`garden-range: ${r.from}..${r.to} (${r.commits} commits)\n`);
  if (current) {
    writeState(top, { ...current, garden_last: r.to });
    if (!args.includes('--json')) process.stdout.write(`garden_last: ${r.to}\n`);
  }
}

// ---- hook ----

// The SessionStart line, or null when nothing is missing and no interview is open. Existence checks only:
// the hook has 10 s, so it never walks the tree or reads sessions.
export function hookLine(top) {
  const s = readState(top);
  if (!s) return null;
  if (!Object.hasOwn(REQUIRED, s.stage)) throw new FoundryError(`unknown stage ${s.stage}`, 1);
  const queue = s.queue ?? [];
  if (!Array.isArray(queue)) throw new FoundryError('queue is not a list', 1);
  const missing = requiredFor(s.stage, s.has_ui === true).map(asRecorded(s)).filter((f) => !present(top, f));
  const open = queue.filter((q) => q && q.done === false).length;
  if (!missing.length && !open) return null;
  const names = missing.length ? missing.slice(0, 2).join(', ') : 'none';
  return `foundry: ${missing.length} missing for ${s.stage} (${names}), ${open} interview(s) queued; run foundry to see them.\n`;
}

// SessionStart hook: prints its line or nothing. Always exits 0 and stays silent on any error.
function hook() {
  try {
    const line = hookLine(repoTop());
    if (line) process.stdout.write(line);
  } catch {
    // A session must start whatever state the repo is in.
  }
  process.exitCode = 0;
}

const DISPATCH = { state, signals: signalsCmd, 'init-files': initFilesCmd, 'vendor-check': vendorCheckCmd, digest: digestCmd, 'garden-range': gardenRangeCmd, hook };
// The CLI command names; the references may only mention these.
export const COMMANDS = Object.keys(DISPATCH);

function main([cmd, ...rest]) {
  try {
    if (Object.hasOwn(DISPATCH, cmd)) DISPATCH[cmd](rest);
    else {
      process.stderr.write('usage: node foundry.mjs state [--set key=value ...] | signals [--json] | init-files --stage <stage> [--name <name>] [--skip <path>,...] [--dry-run] | vendor-check | digest [--limit N] [--json] | garden-range [--mark] [--json] | hook\n');
      process.exitCode = 2;
    }
  } catch (err) {
    process.stderr.write(`foundry: ${String(err.message).split('\n')[0]}\n`);
    process.exitCode = err instanceof FoundryError ? err.code : 1;
  }
}

// Run only as a script, so the tests and later commands can import the functions.
const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : null;
if (entry === self) main(process.argv.slice(2));
