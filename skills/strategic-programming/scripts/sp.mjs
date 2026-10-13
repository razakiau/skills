import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_EXT = new Set('ts tsx js jsx mjs cjs py go rs java kt swift rb php cs vue svelte'.split(' '));
const TEST_RE = [/(^|\/)(__tests__|tests?|e2e|spec)\//, /\.(test|spec)\.[a-z]+$/, /(^|\/)test_[^/]+\.py$/];
// The code files only, so untracked non-code dumps are never hashed by a snapshot.
const CODE_SPECS = [...CODE_EXT].map((e) => `:(glob)**/*.${e}`);

// These would turn the `:(glob)` pathspecs into literal (or case-folded) ones and hide changes.
const PATHSPEC_ENV = ['GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS'];

function git(args, opts = {}) {
  const env = { ...(opts.env ?? process.env) };
  for (const v of PATHSPEC_ENV) delete env[v];
  return execFileSync('git', ['--no-optional-locks', ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28, ...opts, env,
  });
}

function tryGit(args, opts) {
  try { return git(args, opts).trim(); } catch { return null; }
}

// null outside a git repository (start and audit then say so; the hook stays silent).
// `mkdir: false` leaves the state dir uncreated (turn and hook before the repo opted in).
function repoPaths(cwd = process.cwd(), { mkdir = true } = {}) {
  const top = tryGit(['rev-parse', '--show-toplevel'], { cwd });
  if (!top) return null;
  const common = resolve(top, git(['rev-parse', '--git-common-dir'], { cwd: top }).trim());
  const hash = createHash('sha1').update(top).digest('hex').slice(0, 12);
  const state = join(common, 'strategic-programming', hash);
  if (mkdir) mkdirSync(state, { recursive: true });
  return { top, state, anchor: `refs/strategic-programming/${hash}` };
}

// A killed run leaves its private index (and lock) behind; any older than a minute goes.
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Private indexes left by a killed run: older than 60 s and their process gone.
function pruneSnapshots(state) {
  for (const f of readdirSync(state)) {
    const m = f.match(/^snapshot\.(\d+)\.index/);
    if (!m || alive(Number(m[1]))) continue;
    try {
      if (Date.now() - statSync(join(state, f)).mtimeMs > 60_000) rmSync(join(state, f), { force: true });
    } catch { /* removed meanwhile */ }
  }
}

// Hashes the whole working tree (untracked included) into a tree, through a private copy of the index.
function snapshotTree({ top, state }) {
  pruneSnapshots(state);
  const index = join(state, `snapshot.${process.pid}.index`);
  const real = resolve(top, git(['rev-parse', '--git-path', 'index'], { cwd: top }).trim());
  try {
    if (existsSync(real)) copyFileSync(real, index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '-A'], { cwd: top, env });
    return git(['write-tree'], { cwd: top, env }).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

// The index with every code file's working-tree content (untracked included, ignored not):
// the same code entries `snapshotTree` gives, without hashing anything else.
// (`git add -A -- <pathspecs>` fails when one extension matches nothing, so ls-files feeds update-index.)
// Any path still unmerged (a conflict on a non-code file too) is then taken as it is on disk,
// or write-tree would fail.
function codeSnapshot({ top, state }) {
  pruneSnapshots(state);
  const index = join(state, `snapshot.${process.pid}.index`);
  const real = resolve(top, git(['rev-parse', '--git-path', 'index'], { cwd: top }).trim());
  try {
    if (existsSync(real)) copyFileSync(real, index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const update = (input) => git(['update-index', '-z', '--add', '--remove', '--stdin'],
      { cwd: top, env, input, stdio: ['pipe', 'pipe', 'ignore'] });
    const changed = git(['ls-files', '-z', '-m', '-d', '-o', '--exclude-standard', '--', ...CODE_SPECS], { cwd: top, env });
    if (changed) update(changed);
    const unmerged = new Set(git(['ls-files', '-z', '-u'], { cwd: top, env }).split('\0').filter(Boolean)
      .map((e) => e.slice(e.indexOf('\t') + 1)));
    if (unmerged.size) update([...unmerged].join('\0') + '\0');
    return git(['write-tree'], { cwd: top, env }).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

function emptyTree(top) {
  return git(['hash-object', '-w', '-t', 'tree', '--stdin'], { cwd: top, input: '', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

function needRepo() {
  const paths = repoPaths();
  if (!paths) {
    process.stderr.write('sp: not a git repository\n');
    process.exit(0);
  }
  return paths;
}

function start() {
  const paths = needRepo();
  const { top, state, anchor } = paths;
  const head = tryGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: top }) ?? emptyTree(top);
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], { cwd: top }).split('\n').filter(Boolean).length;
  let stash = head;
  if (dirty) {
    const tree = snapshotTree(paths);
    const parent = head === emptyTree(top) ? [] : ['-p', head];
    stash = git(['commit-tree', tree, ...parent, '-m', 'strategic-programming start'], { cwd: top }).trim();
  }
  // Keeps the start snapshot from being garbage-collected.
  git(['update-ref', anchor, stash], { cwd: top });
  writeFileSync(join(state, 'start.json'), JSON.stringify({ head, stash, at: new Date().toISOString() }) + '\n');
  process.stdout.write(`start: ${head.slice(0, 12)} (${dirty} uncommitted files)\n`);
  if (existsSync(join(top, 'nx.json'))) {
    try { nxGraph(top, state, 60_000); } catch { /* audit falls back */ }
  }
}

function defaultBranch(top) {
  const refs = [
    tryGit(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'], { cwd: top }),
    'refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master',
  ];
  return refs.find((r) => r && tryGit(['rev-parse', '--verify', '-q', r], { cwd: top })) ?? null;
}

function findBase({ top, state }) {
  const file = join(state, 'start.json');
  let note;
  if (existsSync(file)) {
    const { stash } = JSON.parse(readFileSync(file, 'utf8'));
    if (tryGit(['cat-file', '-e', stash], { cwd: top }) !== null) return { ref: stash, kind: 'start' };
    note = 'start point missing';
  }
  const withNote = (base) => (note ? { ...base, note } : base);
  if (!tryGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: top })) return withNote({ ref: emptyTree(top), kind: 'root' });
  const branch = defaultBranch(top);
  const mb = branch && tryGit(['merge-base', 'HEAD', branch], { cwd: top });
  if (mb) return withNote({ ref: mb, kind: 'merge-base' });
  return withNote({ ref: git(['rev-list', '--max-parents=0', 'HEAD'], { cwd: top }).trim().split('\n').pop(), kind: 'root' });
}

function isTest(path) {
  return TEST_RE.some((re) => re.test(path));
}

function isCode(path) {
  const m = /\.([^./]+)$/.exec(path);
  return Boolean(m && CODE_EXT.has(m[1])) && !/(^|\/)\.pnp\.(cjs|loader\.mjs)$/.test(path);
}

function generated(top, paths) {
  if (!paths.length) return new Set();
  const out = git(['check-attr', '-z', '--stdin', 'linguist-generated'], {
    cwd: top, input: paths.join('\0') + '\0', stdio: ['pipe', 'pipe', 'ignore'],
  }).split('\0');
  const gen = new Set();
  for (let i = 0; i + 2 < out.length; i += 3) {
    if (!['unspecified', 'unset', 'false'].includes(out[i + 2])) gen.add(out[i]);
  }
  return gen;
}

// Code paths only, on both sides: a rename pairs two code files, never a code file with
// a non-code one (`a.ts` -> `a.md` is a deletion, `x.ts.orig` is no source for `y.ts`).
function readDiff(top, base, tree) {
  const range = [base, tree, '--', ...CODE_SPECS];
  const status = new Map();
  const ns = git(['diff-tree', '-r', '-M', '-z', '--name-status', ...range], { cwd: top }).split('\0');
  for (let i = 0; i + 1 < ns.length;) {
    const code = ns[i][0];
    const path = 'RC'.includes(code) ? ns[i + 2] : ns[i + 1];
    status.set(path, code === 'R' ? 'R' : code === 'A' || code === 'C' ? 'A' : code === 'D' ? 'D' : 'M');
    i += 'RC'.includes(code) ? 3 : 2;
  }
  const files = [];
  const num = git(['diff-tree', '-r', '-M', '-z', '--numstat', ...range], { cwd: top }).split('\0');
  for (let i = 0; i < num.length && num[i];) {
    const [added, removed, inline] = num[i].split('\t');
    const path = inline === '' ? num[i + 2] : inline;
    // A rename or copy also keeps its source path, so the export read can see what left it.
    const from = inline === '' ? num[i + 1] : undefined;
    i += inline === '' ? 3 : 1;
    if (added === '-' || !isCode(path)) continue;
    files.push({
      path, added: +added, removed: +removed, test: isTest(path), status: status.get(path), ...(from !== undefined && { from }),
    });
  }
  const gen = generated(top, files.map((f) => f.path));
  return files.filter((f) => !gen.has(f.path));
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// Workspace globs: `*` and `?` match within one path segment, `**` any depth. No braces.
function expand(top, pattern) {
  let dirs = [''];
  for (const seg of pattern.replace(/^\.\//, '').split('/').filter(Boolean)) {
    const re = new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
    const sub = (dir) => readdirSync(join(top, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
      .map((e) => (dir ? `${dir}/${e.name}` : e.name));
    const deep = (dir) => [dir, ...sub(dir).flatMap(deep)];
    dirs = dirs.flatMap((dir) => {
      if (seg === '**') return deep(dir);
      if (!/[*?]/.test(seg)) return existsSync(join(top, dir, seg)) ? [dir ? `${dir}/${seg}` : seg] : [];
      return sub(dir).filter((d) => re.test(d.slice(d.lastIndexOf('/') + 1)));
    });
  }
  return dirs;
}

// pnpm-workspace.yaml's `packages:` list, read line by line (no YAML parser).
function pnpmPatterns(top) {
  let text;
  try { text = readFileSync(join(top, 'pnpm-workspace.yaml'), 'utf8'); } catch { return []; }
  const out = [];
  let inList = false;
  for (const line of text.split('\n')) {
    if (/^packages\s*:/.test(line)) { inList = true; continue; }
    if (inList && /^\S/.test(line)) break;
    const m = inList && line.match(/^\s*-\s*(['"]?)([^'"#]+?)\1\s*(#.*)?$/);
    if (m) out.push(m[2]);
  }
  return out;
}

function packageGraph(top) {
  const ws = readJson(join(top, 'package.json'))?.workspaces;
  const patterns = Array.isArray(ws) ? ws : Array.isArray(ws?.packages) ? ws.packages : pnpmPatterns(top);
  const excluded = new Set(patterns.filter((p) => p.startsWith('!')).flatMap((p) => expand(top, p.slice(1))));
  const roots = new Set(patterns.filter((p) => !p.startsWith('!')).flatMap((p) => expand(top, p)));
  const pkgs = [...roots].filter((r) => !excluded.has(r))
    .map((root) => ({ root, pkg: readJson(join(top, root, 'package.json')) }))
    .filter(({ pkg }) => typeof pkg?.name === 'string');
  const names = new Set(pkgs.map(({ pkg }) => pkg.name));
  return pkgs.map(({ root, pkg }) => ({
    name: pkg.name,
    root,
    deps: ['dependencies', 'devDependencies', 'peerDependencies']
      .flatMap((k) => Object.keys(pkg[k] ?? {})).filter((d) => names.has(d)),
  }));
}

// The repo's own installed nx only: no npx (it may hit the registry), and a failure
// is remembered per HEAD so the Stop hook (30 s budget) never pays it twice.
// `start` builds it with the larger budget: a cold graph of a large monorepo took 26 s.
function nxGraph(top, state, timeout = 20_000) {
  const bin = join(top, 'node_modules', '.bin', 'nx');
  if (!existsSync(bin)) return null;
  const head = tryGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: top })?.slice(0, 12) ?? 'none';
  const name = `graph-${head}.json`;
  const file = join(state, name);
  const failed = `${file}.failed`;
  if (existsSync(failed)) return null;
  let wrote = false;
  if (!existsSync(file)) {
    // Other HEADs' graphs go; another process's temp file goes only once it is a minute old.
    for (const f of readdirSync(state)) {
      if (!f.startsWith('graph-') || f === name) continue;
      const temp = /^graph-[^.]+\.\d+\.json$/.test(f);
      try {
        if (!temp || Date.now() - statSync(join(state, f)).mtimeMs > 60_000) rmSync(join(state, f), { force: true });
      } catch { /* removed meanwhile */ }
    }
    // nx writes a private file, renamed into place: a reader never sees half a graph.
    const temp = join(state, `graph-${head}.${process.pid}.json`);
    try {
      execFileSync(bin, ['graph', `--file=${temp}`], { cwd: top, stdio: 'ignore', timeout });
    } catch {
      rmSync(temp, { force: true });
      writeFileSync(failed, '');
      return null;
    }
    try { renameSync(temp, file); wrote = true; } catch { rmSync(temp, { force: true }); }
  }
  const graph = readJson(file)?.graph;
  if (!graph?.nodes || !graph?.dependencies) {
    // Our own nx output that does not parse is a failure for this HEAD; a file another
    // process wrote may still be in progress or be fixed by it, so it is left unmarked.
    if (wrote) writeFileSync(failed, '');
    return null;
  }
  return Object.entries(graph.nodes).map(([name, node]) => ({
    name,
    root: String(node.data?.root ?? '').replace(/^\.(\/|$)|\/$/g, ''),
    // An e2e project depends on the app it tests; that does not make the app shared.
    e2e: node.type === 'e2e',
    deps: (graph.dependencies[name] ?? []).map((d) => d.target).filter((t) => t in graph.nodes),
  }));
}

// For each path, the name of the shared project (two or more other projects depend on it) that owns it, or null.
// A graph it cannot read gives null (not measured) and the report still prints.
function sharedOwners({ top, state }, paths) {
  if (!paths.length) return [];
  try {
    const projects = (existsSync(join(top, 'nx.json')) && nxGraph(top, state)) || packageGraph(top);
    const dependents = new Map();
    for (const p of projects) {
      if (p.e2e) continue;
      for (const d of new Set(p.deps)) if (d !== p.name) dependents.set(d, (dependents.get(d) ?? 0) + 1);
    }
    const owner = (path) => projects
      .filter((p) => !p.root || path === p.root || path.startsWith(`${p.root}/`))
      .sort((a, b) => b.root.length - a.root.length)[0];
    return paths.map((path) => {
      const p = owner(path);
      return p && (dependents.get(p.name) ?? 0) >= 2 ? p.name : null;
    });
  } catch {
    return null;
  }
}

const JS_EXT = new Set('ts tsx js jsx mjs cjs'.split(' '));
const ext = (path) => /\.([^./]+)$/.exec(path)?.[1] ?? '';
const EXPORT_DECL = /^export\s+(declare\s+)?(default\s+)?(async\s+)?((const\s+)?enum|function\*?|class|const|let|var|interface|type|abstract\s+class)\s+(?<name>[A-Za-z_$][\w$]*)/;
const EXPORT_STAR = /^export\s*\*\s*as\s+(?<name>[A-Za-z_$][\w$]*)/;
const EXPORT_LIST = /^export\s*(type\s*)?\{/;
// `export default class extends Base` has no name; these words are never one.
const NOT_A_NAME = new Set(['extends', 'implements', 'enum']);

// Undoes git's C-style quoting of a path in a patch header (\" \\ \t \n and octal bytes).
function unquote(s) {
  if (!s.startsWith('"')) return s;
  const bytes = [];
  const esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] !== '\\') { bytes.push(...Buffer.from(s[i])); continue; }
    const c = s[++i];
    if (/[0-7]/.test(c)) { bytes.push(parseInt(s.slice(i, i + 3), 8)); i += 2; }
    else bytes.push(esc[c] ?? c.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

// Names in `export { a, b as c }`, possibly spread over several added lines; the exported name wins.
function listNames(text) {
  return text.replace(EXPORT_LIST, '').replace(/\}.*$/s, '').split(',')
    .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
}

// Export names on one patch line; a multi-line `export {` list carries over in `side.pending`.
function scanExport(side, text, emit) {
  if (side.pending !== null) {
    side.pending += ` ${text}`;
    if (text.includes('}')) { listNames(side.pending).forEach(emit); side.pending = null; }
    return;
  }
  const decl = EXPORT_DECL.exec(text) ?? EXPORT_STAR.exec(text);
  if (decl) { if (!NOT_A_NAME.has(decl.groups.name)) emit(decl.groups.name); }
  else if (EXPORT_LIST.test(text)) {
    if (text.includes('}')) listNames(text).forEach(emit);
    else side.pending = text;
  }
}

// New exports of the TS/JS files among `files`: names on added lines (-U0) that no removed
// line of the whole diff exported, so an edited signature or a move between files adds none.
// The patch covers only those files and rename sources (-M). Header paths are checked
// against the -z file list; `---`/`+++` are headers only between `diff --git` and the first `@@`.
function readExports(top, base, tree, files) {
  const js = files.filter((f) => !f.test && JS_EXT.has(ext(f.path)));
  if (!js.some((f) => f.added)) return [];
  const newPaths = new Set(js.map((f) => f.path));
  const oldPaths = new Set([...js.map((f) => f.from ?? f.path), ...files.map((f) => f.from).filter((p) => p && JS_EXT.has(ext(p)))]);
  const pathspecs = [...new Set([...newPaths, ...oldPaths])];
  const patch = git(['--literal-pathspecs', '-c', 'core.quotePath=true', 'diff-tree', '-r', '-M', '-p', '-U0', '--no-color',
    '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', base, tree, '--', ...pathspecs], { cwd: top });
  const found = [];
  const removed = new Set();
  const header = (line, prefix, wanted) => {
    const p = unquote(line.slice(4).replace(/\t$/, ''));
    return p.startsWith(prefix) && wanted.has(p.slice(2)) ? p.slice(2) : null;
  };
  let inHeader = false;
  let oldPath = null;
  let newPath = null;
  const add = { pending: null };
  const del = { pending: null };
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) { inHeader = true; oldPath = newPath = add.pending = del.pending = null; continue; }
    if (inHeader) {
      if (line.startsWith('--- ')) oldPath = header(line, 'a/', oldPaths);
      else if (line.startsWith('+++ ')) newPath = header(line, 'b/', newPaths);
      else if (line.startsWith('@@')) inHeader = false;
      continue;
    }
    const text = line.slice(1).trim();
    if (line.startsWith('+') && newPath) { del.pending = null; scanExport(add, text, (name) => found.push({ path: newPath, name })); }
    else if (line.startsWith('-') && oldPath) { add.pending = null; scanExport(del, text, (name) => removed.add(name)); }
    else add.pending = del.pending = null;
  }
  return found.filter((e) => !removed.has(e.name));
}

// Each added test file whose directory already held a test file at the base.
function readTestBeside(top, base, files) {
  const out = [];
  const cache = new Map();
  for (const f of files) {
    if (!f.test || f.status !== 'A') continue;
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    if (!cache.has(dir)) {
      const listing = tryGit(['ls-tree', '-z', dir ? `${base}:${dir}` : base], { cwd: top }) ?? '';
      cache.set(dir, listing.split('\0').filter(Boolean)
        .map((e) => ({ type: e.split(' ')[1], path: (dir ? `${dir}/` : '') + e.slice(e.indexOf('\t') + 1) }))
        .filter((e) => e.type === 'blob' && isTest(e.path) && isCode(e.path))
        .map((e) => e.path).sort());
    }
    const existing = cache.get(dir).find((p) => p !== f.path);
    if (existing) out.push({ added: f.path, existing });
  }
  return out;
}

// Path entries of the first Markdown table in .agents/code-map.md whose header has a Path
// column (any case), outside ``` and ~~~ fences. null when the file is missing, 'no-path'
// when it has no such table.
function readCodeMap(top) {
  let text;
  try { text = readFileSync(join(top, '.agents', 'code-map.md'), 'utf8'); } catch { return null; }
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const rows = text.split('\n');
  let fence = null;
  for (let i = 0; i + 1 < rows.length; i++) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(rows[i])?.[1];
    if (fence) { if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null; continue; }
    if (mark) { fence = mark; continue; }
    if (!/^\s*\|/.test(rows[i]) || !cells(rows[i + 1]).every((c) => /^:?-+:?$/.test(c))) continue;
    const col = cells(rows[i]).findIndex((c) => c.replace(/[*_`]/g, '').toLowerCase() === 'path');
    if (col < 0) continue;
    const entries = [];
    for (let j = i + 2; j < rows.length && /^\s*\|/.test(rows[j]); j++) {
      for (const e of (cells(rows[j])[col] ?? '').split(',')) {
        const entry = e.trim().replace(/`/g, '').trim().replace(/^\.?\//, '').replace(/\/+$/, '');
        if (entry) entries.push(entry);
      }
    }
    return entries;
  }
  return 'no-path';
}

// A directory or file entry covers itself and everything under it; `*` and `?` stay in a segment,
// `**` crosses them and `**/` also matches no directory. No braces.
function mapCovers(entry, path) {
  const re = entry.split(/(\*\*\/|\*\*|\*|\?)/).map((part) => (part === '**/' ? '(?:.*/)?' : part === '**' ? '.*'
    : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${re}(/.*)?$`).test(path);
}

function measured(what, fn, fallback) {
  try { return fn(); } catch (err) {
    process.stderr.write(`sp: ${what} not measured: ${String(err.message).split('\n')[0]}\n`);
    return fallback;
  }
}

// The audit object, its text form, and the snapshot tree it measured (code files only:
// every measure below reads code paths). `tree` reuses a snapshot the caller just took.
function buildReport(paths, tree = codeSnapshot(paths)) {
  const base = findBase(paths);
  const files = readDiff(paths.top, base.ref, tree);
  const sum = (fs) => fs.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
  const code = files.filter((f) => !f.test);
  const newFiles = code.filter((f) => f.status === 'A').map((f) => f.path);
  const owners = sharedOwners(paths, code.map((f) => f.path));
  // null: the graph was not read, so no change can be proven outside a shared package.
  const shared = owners === null ? null : [...new Set(owners.filter(Boolean))].sort();
  const exports = measured('exports', () => readExports(paths.top, base.ref, tree, files), null);
  const codeMap = measured('code map', () => readCodeMap(paths.top), null);
  // Why unlisted home is null, for the text report: no map, no Path column, or no graph.
  const unmeasured = codeMap === null ? 'code map: none' : codeMap === 'no-path' ? 'code map: no Path column'
    : owners === null ? 'unlisted home: not measured (graph)' : null;
  const unlistedHome = unmeasured ? null : code
    .filter((f, i) => f.status === 'A' && owners[i] && !codeMap.some((e) => mapCovers(e, f.path)))
    .map((f) => f.path);
  const small = shared !== null && code.length <= 1 && newFiles.length === 0 && exports?.length === 0;
  const report = {
    base,
    size: shared?.length ? 'full+reviewer' : small ? 'small' : 'full',
    code: sum(code),
    tests: sum(files.filter((f) => f.test)),
    files: files.map(({ from, ...f }) => f),
    newFiles,
    exports,
    shared,
    testBeside: measured('tests beside', () => readTestBeside(paths.top, base.ref, files), null),
    unlistedHome,
    duplicates: null,
  };
  return { report, unmeasured, tree };
}

const JSCPD = 'jscpd@5.4.1';
const DUP_TIMEOUT = Number(process.env.SP_DUP_TIMEOUT_MS) > 0 ? Number(process.env.SP_DUP_TIMEOUT_MS) : 120_000;

// `--baseline-from-ref` checks the base out as a worktree in <tmpdir>/cpd-base-ref-*; a killed
// jscpd leaves it registered. Only those go, never another worktree.
function removeBaseWorktrees(top) {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const prefixes = [join(tmpdir(), 'cpd-base-ref-'), join(real(tmpdir()), 'cpd-base-ref-')];
  const list = tryGit(['worktree', 'list', '--porcelain'], { cwd: top }) ?? '';
  for (const line of list.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const path = line.slice('worktree '.length);
    if (![path, real(path)].some((p) => prefixes.some((pre) => p.startsWith(pre)))) continue;
    tryGit(['worktree', 'remove', '--force', path], { cwd: top });
  }
  tryGit(['worktree', 'prune'], { cwd: top });
}

// Run dirs of audits that were killed: their process is gone (or the pre-pid `dup`).
function pruneDupDirs(state) {
  for (const f of readdirSync(state)) {
    const m = f.match(/^dup(?:\.(\d+))?$/);
    if (m && !(m[1] && alive(Number(m[1])))) rmSync(join(state, f), { recursive: true, force: true });
  }
}

// Runs jscpd from <run>: npm takes the nearest package.json as the project and reads that
// project's .npmrc, so <run> gets an empty one of its own (the state dir sits inside the repo).
// `--config` with `{}` keeps the repo's .jscpd.json / package.json `jscpd` key out. jscpd runs in
// its own process group so a timeout kills npx, node and jscpd alike.
function runJscpd(top, run, base) {
  writeFileSync(join(run, 'package.json'), '{}\n');
  writeFileSync(join(run, 'jscpd.json'), '{}\n');
  const exts = [...CODE_EXT].join(',');
  const args = ['-y', JSCPD, '--config', join(run, 'jscpd.json'), '--baseline-from-ref', base,
    '--pattern', `**/*.{${exts}}`, '--ignore', '**/node_modules/**,**/.git/**',
    '-r', 'json', '-o', run, '--report-name', 'report', '-s', '--no-tips', top];
  const r = spawnSync('npx', args, {
    cwd: run, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', timeout: DUP_TIMEOUT,
    killSignal: 'SIGKILL', detached: true, maxBuffer: 1 << 26, env: { ...process.env, JSCPD_NO_TIPS: '1' },
  });
  if (r.error?.code === 'ENOENT') return 'npx not found';
  if (r.error?.code === 'ETIMEDOUT' || r.signal) {
    // spawnSync killed npx only; its children (node, the jscpd binary) share its group.
    if (r.pid) { try { process.kill(-r.pid, 'SIGKILL'); } catch { /* group already gone */ } }
    return `jscpd timed out after ${DUP_TIMEOUT / 1000} s`;
  }
  if (r.error) return `jscpd failed: ${String(r.error.message).split('\n')[0].slice(0, 160)}`;
  if (r.status !== 0) {
    const msg = String(r.stderr ?? '').split('\n').find((l) => l.trim()) ?? `exit ${r.status}`;
    return `jscpd failed: ${msg.trim().slice(0, 160)}`;
  }
  return null;
}

// New duplicate blocks touching a changed (A/M/R) non-test code file, from jscpd's own baseline:
// `--baseline-from-ref <base>` scans the base's tree with the same options and marks each clone of
// the working tree `isNew` when the base had no such clone. The whole repo is scanned (code files
// only, .gitignore respected) so a copy of an unchanged file is found; the report is then cut to
// clones naming a changed file. Never `--changed`/`--update-baseline`: they write in the repo root.
// Returns `{ duplicates, why }`: duplicates null and a reason when not measured.
function readDuplicates({ top, state }, report) {
  const changed = new Set(report.files.filter((f) => !f.test && f.status !== 'D').map((f) => f.path));
  if (!changed.size) return { duplicates: { count: 0, clones: [] }, why: null };
  let base = report.base.ref;
  // jscpd takes a commit, not a tree: the empty-tree root gets a parentless commit of it.
  if (tryGit(['cat-file', '-t', base], { cwd: top }) === 'tree') {
    base = git(['commit-tree', base, '-m', 'strategic-programming dup base'], { cwd: top }).trim();
  }
  pruneDupDirs(state);
  const run = join(state, `dup.${process.pid}`);
  rmSync(run, { recursive: true, force: true });
  mkdirSync(run);
  let json = null;
  let failed;
  try {
    failed = runJscpd(top, run, base);
    if (!failed) json = readJson(join(run, 'report.json'));
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
  if (!failed && !Array.isArray(json?.duplicates)) failed = 'jscpd report unreadable';
  if (failed) {
    removeBaseWorktrees(top);
    return { duplicates: null, why: failed };
  }
  const tops = [top, realpathSync(top)];
  const rel = (name) => {
    let p = String(name ?? '');
    if (isAbsolute(p)) {
      const t = tops.find((x) => p.startsWith(`${x}/`));
      p = t ? p.slice(t.length + 1) : relative(top, p);
    }
    return p.replace(/^(\.\/)+/, '');
  };
  const loc = (f) => ({ path: rel(f?.name), start: f?.start, end: f?.end });
  const clones = json.duplicates
    .filter((d) => d.isNew === true)
    .map((d) => ({ a: loc(d.firstFile), b: loc(d.secondFile), lines: d.lines }))
    .filter((c) => changed.has(c.a.path) || changed.has(c.b.path));
  return { duplicates: { count: clones.length, clones }, why: null };
}

function dupLine(dup, why) {
  if (why) return `duplicates: not measured (${why})`;
  if (!dup) return 'duplicates: run audit --dup';
  if (!dup.count) return 'duplicates: none';
  const at = (l) => `${l.path}:${l.start}-${l.end}`;
  const shown = dup.clones.slice(0, 5).map((c) => `${at(c.a)} ~ ${at(c.b)}`);
  return `duplicates: ${dup.count} new (${shown.join('; ')}${dup.count > 5 ? '; …' : ''})`;
}

function audit(args) {
  const paths = needRepo();
  const { report, unmeasured } = buildReport(paths);
  let why = null;
  if (args.includes('--dup')) {
    try { ({ duplicates: report.duplicates, why } = readDuplicates(paths, report)); }
    catch (err) { why = String(err.message).split('\n')[0].slice(0, 160); }
    if (why) report.duplicatesNote = why;
  }
  process.stdout.write(args.includes('--json') ? JSON.stringify(report) + '\n'
    : `${formatText(report, unmeasured)}${dupLine(report.duplicates, why)}\n`);
}

// Identifies the changed code and test content: the measured paths with their status and
// their blob in the snapshot tree (none when deleted). Other files never move it.
function fingerprint(top, report, tree) {
  const paths = report.files.map((f) => f.path);
  const blobs = git(['--literal-pathspecs', 'ls-tree', '-r', '-z', tree, '--', ...paths], { cwd: top });
  // A new `start` is a new change point; a merge base or root moving under the same content is not.
  const h = createHash('sha1').update(report.base.kind === 'start' ? `${report.base.ref}\0` : '\0');
  for (const f of report.files) h.update(`${f.status}\0${f.path}\0`);
  return h.update(blobs).digest('hex');
}

const SELF = fileURLToPath(import.meta.url);

// The hook payload, or null: a terminal, an unreadable stdin (EAGAIN), bad JSON or a non-object are no input.
function readPayload() {
  if (process.stdin.isTTY) return null;
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { return null; }
  try {
    const payload = JSON.parse(input);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

// The payload's repo, only when it opted in: a code map at the top. A recorded start is not
// enough, because `start` runs in every repo the skill touches, personal ones included.
// The state dir is created only then.
function optedIn(payload) {
  const paths = repoPaths(typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd(), { mkdir: false });
  if (!paths) return null;
  if (!existsSync(join(paths.top, '.agents', 'code-map.md'))) return null;
  mkdirSync(paths.state, { recursive: true });
  return paths;
}

// One turn-start record per session (VS Code sends session_id, Copilot CLI sessionId);
// null without an id: an id-less turn cannot be told apart from another session's.
function turnFile({ state }, payload) {
  const id = [payload.session_id, payload.sessionId, payload.SessionId].find((v) => typeof v === 'string' && v);
  return id ? join(state, `turn-${createHash('sha1').update(id).digest('hex').slice(0, 12)}`) : null;
}

function silently(fn) {
  let out = {};
  try { out = fn() ?? {}; } catch { out = {}; }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = 0;
}

// UserPromptSubmit: records the code snapshot the agent's turn starts from. Prints {}.
function turn() {
  silently(() => {
    const payload = readPayload();
    const paths = payload && optedIn(payload);
    const file = paths && turnFile(paths, payload);
    if (file) writeFileSync(file, `${codeSnapshot(paths)}\n`);
  });
}

// `{ changed, tree }`: whether a non-test, non-generated code file differs between the
// turn-start tree and `tree` (the code snapshot now); null when the session has no usable record.
function turnChangedCode(paths, payload) {
  const file = turnFile(paths, payload);
  if (!file) return null;
  let from;
  try { from = readFileSync(file, 'utf8').trim(); } catch { return null; }
  if (!/^[0-9a-f]{40,64}$/.test(from) || tryGit(['cat-file', '-e', `${from}^{tree}`], { cwd: paths.top }) === null) return null;
  const tree = codeSnapshot(paths);
  const code = git(['diff-tree', '-r', '-z', '--no-renames', '--name-only', from, tree], { cwd: paths.top })
    .split('\0').filter((p) => p && isCode(p) && !isTest(p));
  const gen = generated(paths.top, code);
  return { changed: code.some((p) => !gen.has(p)), tree };
}

const MAX_HOOK_FILES = 40;

// Stop hook: blocks once per distinct code diff with the audit, but only after a turn in which
// the agent changed code (or when there is no turn record: no session id, or the harness never
// sent the turn start). Always exits 0.
function hook() {
  silently(() => {
    const payload = readPayload();
    if (!payload || payload.stop_hook_active || payload.stopHookActive) return null;
    const paths = optedIn(payload);
    if (!paths) return null;
    const turned = turnChangedCode(paths, payload);
    if (turned && !turned.changed) return null;
    const built = buildReport(paths, turned?.tree);
    if (!built.report.files.some((f) => !f.test)) return null;
    const print = fingerprint(paths.top, built.report, built.tree);
    const file = join(paths.state, 'hook-fingerprint');
    let last = null;
    try { last = readFileSync(file, 'utf8').trim(); } catch { /* never blocked */ }
    if (print === last) return null;
    const reason = 'strategic-programming audit (see the strategic-programming skill):\n'
      + `${formatText(built.report, built.unmeasured, MAX_HOOK_FILES)}\nAnswer every flag above against your `
      + 'placement note: remove the code, justify it, or (unlisted home) add a code-map row or move the file. The numbers stand.'
      + (built.report.size === 'small' ? '' : ` For a Full change also run \`node "${SELF}" audit --dup\`.`);
    writeFileSync(file, `${print}\n`);
    return { decision: 'block', reason, hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason } };
  });
}

function formatText(r, unmeasured, maxFiles = Infinity) {
  // TS/JS files give names or "none"; other languages are named as not measured.
  const code = r.files.filter((f) => !f.test);
  const other = [...new Set(code.map((f) => ext(f.path)).filter((e) => !JS_EXT.has(e)))].sort();
  const js = code.some((f) => JS_EXT.has(ext(f.path)));
  const exportsLine = r.exports === null ? 'not measured (error)'
    : [js || !other.length ? (r.exports.map((e) => e.name).join(', ') || 'none') : '',
      other.length ? `not measured (${other.join(', ')})` : ''].filter(Boolean).join('; ');
  return [
    `base: ${r.base.kind} ${r.base.ref.slice(0, 12)}${r.base.note ? ` (${r.base.note})` : ''}`,
    `size: ${r.size}`,
    `shared: ${r.shared === null ? 'not measured (graph)' : r.shared.length ? r.shared.join(', ') : 'none'}`,
    `code: +${r.code.added} -${r.code.removed}  tests: +${r.tests.added} -${r.tests.removed}`,
    ...r.files.slice(0, maxFiles).map((f) => `${f.status} ${f.path} +${f.added} -${f.removed}`),
    ...(r.files.length > maxFiles ? [`… and ${r.files.length - maxFiles} more (run audit for the full list)`] : []),
    `new files: ${r.newFiles.length ? r.newFiles.join(', ') : 'none'}`,
    `exports: ${exportsLine}`,
    `tests beside: ${r.testBeside === null ? 'not measured (error)'
      : r.testBeside.length ? r.testBeside.map((t) => `${t.added} (next to ${t.existing})`).join(', ') : 'none'}`,
    r.unlistedHome === null ? unmeasured : `unlisted home: ${r.unlistedHome.length ? r.unlistedHome.join(', ') : 'none'}`,
  ].join('\n') + '\n';
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'start') start();
  else if (cmd === 'audit') audit(rest);
  else if (cmd === 'hook') hook();
  else if (cmd === 'turn') turn();
  else {
    process.stderr.write('usage: node sp.mjs start | audit [--json] [--dup] | hook | turn\n');
    process.exitCode = 2;
  }
} catch (err) {
  process.stderr.write(`sp: ${String(err.message).split('\n')[0]}\n`);
  process.exitCode = 0;
}
