import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as foundry from './foundry.mjs';
import { readState, writeState, signals, REQUIRED, UI_ONLY, requiredFor, digest, gardenRange } from './foundry.mjs';

const FOUNDRY = join(dirname(fileURLToPath(import.meta.url)), 'foundry.mjs');

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com',
});

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function write(repo, path, content) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function makeRepo(files = { 'README.md': 'hi\n' }) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'user.email', 't@example.com');
  for (const [p, c] of Object.entries(files)) write(repo, p, c);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function run(repo, args, stdin, env) {
  const r = spawnSync('node', [FOUNDRY, ...args], { cwd: repo, input: stdin, encoding: 'utf8', env: { ...process.env, ...env } });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status };
}

const STATE = {
  version: 1,
  stage: 'explore',
  stage_set: '2026-01-01',
  stage_reason: 'just started',
  has_ui: false,
  agents_md: { budget_lines: 100, state: 'migrated' },
  readiness_tier: 0,
  providers: {},
  queue: [],
  garden_last: null,
  doc_check_version: '1.0.0',
};

const withState = (state = STATE) => makeRepo({ '.agents/foundry.json': JSON.stringify(state, null, 2) + '\n' });

test('state: missing file exits 1 with message', () => {
  const repo = makeRepo();
  const r = run(repo, ['state']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no \.agents\/foundry\.json/);
  assert.equal(r.stdout, '');
});

test('state: prints the state as JSON', () => {
  const repo = withState();
  const r = run(repo, ['state']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), STATE);
});

test('state: --set stage records date and reason', () => {
  const repo = withState();
  const r = run(repo, ['state', '--set', 'stage=product', '--set', 'stage_reason=relied on daily']);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.stage, 'product');
  assert.equal(s.stage_reason, 'relied on daily');
  assert.match(s.stage_set, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(s.stage_set, '2026-01-01');
  assert.deepEqual(readState(repo), s, 'the change is written to the file');
});

test('state: --set the same stage keeps stage_set', () => {
  const repo = withState();
  const r = run(repo, ['state', '--set', 'stage=explore']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).stage_set, '2026-01-01');
});

test('state: --set typed keys', () => {
  const repo = withState();
  const r = run(repo, ['state', '--set', 'readiness_tier=2', '--set', 'has_ui=true', '--set', 'agents_md.state=unmigrated']);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.readiness_tier, 2);
  assert.equal(s.has_ui, true);
  assert.deepEqual(s.agents_md, { budget_lines: 100, state: 'unmigrated' });
});

test('state: rejects unknown stage', () => {
  const repo = withState();
  const r = run(repo, ['state', '--set', 'stage=beta']);
  assert.equal(r.code, 2);
  assert.equal(r.stderr, 'foundry: stage must be one of explore, product, live, scale\n');
  assert.deepEqual(readState(repo), STATE, 'a rejected set writes nothing');
});

test('state: rejects bad values and unknown keys, exit 2', () => {
  const repo = withState();
  for (const [arg, msg] of [
    ['has_ui=yes', 'foundry: has_ui must be true or false\n'],
    ['readiness_tier=x', 'foundry: readiness_tier must be a whole number\n'],
    ['agents_md.state=old', 'foundry: agents_md.state must be one of migrated, unmigrated\n'],
    ['version=2', 'foundry: --set accepts stage, stage_reason, readiness_tier, agents_md.state, has_ui, design_md\n'],
    ['stage', 'foundry: --set needs key=value\n'],
  ]) {
    const r = run(repo, ['state', '--set', arg]);
    assert.equal(r.code, 2, arg);
    assert.equal(r.stderr, msg, arg);
  }
  assert.deepEqual(readState(repo), STATE);
});

test('state: works outside git from the cwd', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-nogit-')));
  write(dir, '.agents/foundry.json', JSON.stringify(STATE));
  const r = run(dir, ['state']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), STATE);
});

test('state: run from a subdirectory uses the repo top', () => {
  const repo = withState();
  mkdirSync(join(repo, 'sub'));
  const r = run(join(repo, 'sub'), ['state']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).stage, 'explore');
});

test('writeState writes 2-space JSON with a trailing newline; readState reads it back', () => {
  const repo = makeRepo();
  assert.equal(readState(repo), null);
  writeState(repo, STATE);
  assert.equal(readFileSync(join(repo, '.agents/foundry.json'), 'utf8'), JSON.stringify(STATE, null, 2) + '\n');
  assert.deepEqual(readState(repo), STATE);
});

test('unknown command prints usage, exit 2', () => {
  const repo = makeRepo();
  for (const args of [[], ['bogus']]) {
    const r = run(repo, args);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^usage: node foundry\.mjs /);
    assert.equal(r.stdout, '');
  }
});

// A sessions root that doesn't exist, so the owner's real Copilot sessions never leak into a test.
const NO_SESSIONS = { sessionsRoot: '/nonexistent/foundry-sessions' };

function sessionsRoot(entries) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-sessions-')));
  entries.forEach((lines, i) => write(root, `s${i}/workspace.yaml`, lines.join('\n') + '\n'));
  return root;
}

test('REQUIRED: cumulative per stage, in order', () => {
  const product = ['AGENTS.md', 'PRODUCT.md', 'docs/decisions/index.md', 'GLOSSARY.md', 'ARCHITECTURE.md', '.agents/code-map.md', 'DESIGN.md', 'docs/ui/screens.md', 'CONSTRAINTS.md'];
  const live = [...product, 'docs/threat-model.md', 'docs/runbooks/'];
  assert.deepEqual(REQUIRED, { explore: ['AGENTS.md'], product, live, scale: live });
  assert.deepEqual(UI_ONLY, ['DESIGN.md', 'docs/ui/screens.md']);
  assert.deepEqual(requiredFor('product', false), product.filter((f) => !UI_ONLY.includes(f)));
  assert.deepEqual(requiredFor('product', true), product);
});

test('signals: empty repo proposes explore', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const s = signals(repo, NO_SESSIONS);
  assert.equal(s.proposed, 'explore');
  assert.equal(s.commits, 1);
  assert.equal(s.has_ui, false);
  assert.equal(s.age_days, 0);
  assert.match(s.first_commit, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(s.deployed, []);
  assert.deepEqual(s.auth_code, []);
  assert.equal(s.sessions, null);
  assert.deepEqual(s.files, { 'AGENTS.md': false });
});

test('signals: non-git dir', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-nogit-')));
  write(dir, 'AGENTS.md', 'x\n');
  const s = signals(dir, NO_SESSIONS);
  assert.equal(s.commits, 0);
  assert.equal(s.first_commit, null);
  assert.equal(s.age_days, 0);
  assert.equal(s.proposed, 'explore');
  assert.deepEqual(s.files, { 'AGENTS.md': true });
});

test('signals: a non-git walk skips node_modules', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-nogit-')));
  write(dir, 'node_modules/pkg/App.tsx', 'x');
  write(dir, 'node_modules/pkg/src/auth.ts', 'x');
  const s = signals(dir, NO_SESSIONS);
  assert.equal(s.has_ui, false);
  assert.deepEqual(s.auth_code, []);
});

test('signals: a folder without git inside another repo has no history of its own', () => {
  const parent = makeRepo({ 'a.txt': 'x' });
  for (let i = 0; i < 31; i++) git(parent, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
  write(parent, 'sub/AGENTS.md', 'x\n');
  const s = signals(join(parent, 'sub'), NO_SESSIONS);
  assert.equal(s.commits, 0);
  assert.equal(s.first_commit, null);
  assert.equal(s.proposed, 'explore');
  assert.deepEqual(s.files, { 'AGENTS.md': true });
  assert.equal(s.behind, null);
});

test('signals: a deploy workflow is found whatever its case', () => {
  const repo = makeRepo({ '.github/workflows/ship.yml': 'jobs:\n  Deploy:\n    runs-on: x\n', 'src/auth/login.ts': 'x' });
  const s = signals(repo, NO_SESSIONS);
  assert.deepEqual(s.deployed, ['.github/workflows/ship.yml']);
  assert.equal(s.proposed, 'live');
});

test('signals --as-of reads the tree and the age of a past commit', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const env = { GIT_AUTHOR_DATE: '2026-01-01T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T12:00:00Z' };
  execFileSync('git', ['commit', '-q', '--amend', '--no-edit', '--reset-author'], { cwd: repo, env: { ...process.env, ...env } });
  const at = (d) => ({ ...process.env, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
  write(repo, 'src/App.tsx', 'x');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'ui'], { cwd: repo, env: at('2026-01-10T12:00:00Z') });
  write(repo, 'PRODUCT.md', 'p');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'product'], { cwd: repo, env: at('2026-02-01T12:00:00Z') });
  const early = signals(repo, { ...NO_SESSIONS, asOf: '2026-01-05' });
  assert.equal(early.commits, 1);
  assert.equal(early.age_days, 4);
  assert.equal(early.has_ui, false);
  assert.equal(early.proposed, 'explore');
  assert.equal(early.sessions, null);
  const mid = signals(repo, { ...NO_SESSIONS, asOf: '2026-01-10' });
  assert.equal(mid.has_ui, true);
  assert.equal(mid.proposed, 'product', 'nine days old');
  assert.equal(mid.files['PRODUCT.md'], false, 'PRODUCT.md came later');
  const sha = git(repo, 'rev-parse', 'HEAD~1');
  assert.equal(signals(repo, { ...NO_SESSIONS, asOf: sha }).as_of, sha);
  const cli = run(repo, ['signals', '--as-of', '2026-01-05']);
  assert.equal(cli.stdout, `proposed stage as of ${git(repo, 'rev-parse', 'HEAD~2').slice(0, 7)}: explore\n- no signal beyond explore\n`);
  const bad = run(repo, ['signals', '--as-of', '2025-01-01']);
  assert.deepEqual([bad.code, bad.stderr], [2, 'foundry: --as-of 2025-01-01: no commit on or before that date\n']);
  assert.equal(run(repo, ['signals', '--as-of']).code, 2);
});

test('signals: a checkout far behind its upstream says so', () => {
  const origin = makeRepo({ 'a.txt': 'x' });
  const clone = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-clone-')));
  execFileSync('git', ['clone', '-q', origin, clone]);
  for (let i = 0; i < 10; i++) git(origin, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
  git(clone, 'fetch', '-q');
  const s = signals(clone, NO_SESSIONS);
  assert.deepEqual(s.behind, { ref: 'origin/main', commits: 10 });
  assert.match(run(clone, ['signals']).stdout, /^warn: 10 commits behind origin\/main; pull before trusting the files list$/m);
  assert.equal(signals(origin, NO_SESSIONS).behind, null, 'no upstream');
});

test('signals: git repo with no commits yet', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'src/App.tsx', 'x');
  const s = signals(repo, NO_SESSIONS);
  assert.equal(s.commits, 0);
  assert.equal(s.proposed, 'explore');
  assert.equal(s.has_ui, true, 'untracked files count');
});

test('signals: 30 commits proposes product', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  for (let i = 1; i < 30; i++) {
    write(repo, 'a.txt', String(i));
    git(repo, 'commit', '-q', '-am', `c${i}`);
  }
  const s = signals(repo, NO_SESSIONS);
  assert.equal(s.commits, 30);
  assert.equal(s.proposed, 'product');
  assert.ok(s.reasons.includes('30 commits'), s.reasons.join('; '));
  assert.equal(s.files['PRODUCT.md'], false);
  assert.equal('DESIGN.md' in s.files, false, 'DESIGN.md only with UI');
  assert.equal('docs/ui/screens.md' in s.files, false, 'the screen map only with UI');
});

test('signals: age and PRODUCT.md propose product', () => {
  const dated = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-test-')));
  git(dated, 'init', '-q', '-b', 'main');
  write(dated, 'a.txt', 'x');
  git(dated, 'add', '-A');
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dated, env: { ...process.env, GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z', GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z' } });
  const s = signals(dated, NO_SESSIONS);
  assert.equal(s.proposed, 'product');
  assert.ok(s.age_days > 365);
  assert.ok(s.reasons.includes(`${s.age_days} days since the first commit`), s.reasons.join('; '));

  const p = signals(makeRepo({ 'PRODUCT.md': '# p\n' }), NO_SESSIONS);
  assert.equal(p.proposed, 'product');
  assert.ok(p.reasons.includes('PRODUCT.md exists'), p.reasons.join('; '));
  assert.equal(p.files['PRODUCT.md'], true);
});

test('signals: deploy workflow + auth proposes live', () => {
  const repo = makeRepo({
    '.github/workflows/ci.yml': 'steps:\n  - uses: docker/build-push-action@v6\n',
    'src/auth/login.ts': 'export {}\n',
  });
  const s = signals(repo, NO_SESSIONS);
  assert.equal(s.proposed, 'live');
  assert.deepEqual(s.deployed, ['.github/workflows/ci.yml']);
  assert.deepEqual(s.auth_code, ['src/auth/login.ts']);
  assert.ok(s.reasons.includes('deployed: .github/workflows/ci.yml'), s.reasons.join('; '));
  assert.ok(s.reasons.includes('auth code: src/auth/login.ts'), s.reasons.join('; '));
  assert.deepEqual(Object.keys(s.files), REQUIRED.live.filter((f) => !UI_ONLY.includes(f)));
});

test('signals: deploy evidence kinds; deployed alone is not live', () => {
  const repo = makeRepo({
    'compose.yaml': 'services:\n  web:\n    ports:\n      - "80:80"\n',
    'docker-compose.yml': 'services: {}\n',
    'Dockerfile': 'FROM node\n',
    'README.md': 'See https://github.com/x/y and https://app.example.com\n',
    '.github/workflows/test.yml': 'run: npm test\n',
  });
  const s = signals(repo, NO_SESSIONS);
  assert.deepEqual(s.deployed, ['compose.yaml', 'Dockerfile', 'README.md: https://app.example.com']);
  assert.equal(s.proposed, 'explore');
  const users = makeRepo({ 'Dockerfile': 'FROM node\n', 'README.md': 'Built for our users.\n' });
  const u = signals(users, NO_SESSIONS);
  assert.equal(u.proposed, 'live');
  assert.ok(u.reasons.includes('README names users'), u.reasons.join('; '));
});

test('signals: auth_code lists the first 5', () => {
  const files = { 'node_modules/auth/x.js': 'x' };
  for (const n of ['auth', 'session', 'login', 'tenant', 'rbac', 'permission']) files[`src/${n}.ts`] = 'x';
  const s = signals(makeRepo(files), NO_SESSIONS);
  assert.equal(s.auth_code.length, 5);
  assert.ok(s.auth_code.every((p) => p.startsWith('src/')));
});

test('signals: sessions counted by cwd', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const root = sessionsRoot([
    [`cwd: ${repo}`, `git_root: ${repo}`, 'branch: main'],
    [`cwd: ${repo}/sub`, 'branch: main'],
    [`cwd: ${repo}bar`, `git_root: ${repo}bar`],
  ]);
  assert.equal(signals(repo, { sessionsRoot: root }).sessions, 2);
});

test('signals: sessions by git_root, origin slug, and through a symlinked path', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  git(repo, 'remote', 'add', 'origin', 'git@github.com:acme/widget.git');
  const root = sessionsRoot([
    ['cwd: /elsewhere', `git_root: ${repo}`],
    ['cwd: /elsewhere', 'repository: acme/widget'],
    ['cwd: /elsewhere', 'repository: acme/other'],
    [`cwd: ${repo.replace(/^\/private\/var\//, '/var/')}`],
  ]);
  const s = signals(repo, { sessionsRoot: root });
  assert.equal(s.sessions, 3, 'the /var path resolves to the repo on macOS');
  const three = sessionsRoot([[`cwd: ${repo}`], [`cwd: ${repo}`], [`cwd: ${repo}`]]);
  const t = signals(repo, { sessionsRoot: three });
  assert.equal(t.proposed, 'product');
  assert.ok(t.reasons.includes('3 Copilot sessions'), t.reasons.join('; '));
});

test('signals: never proposes lower than recorded', () => {
  const repo = withState({ ...STATE, stage: 'live' });
  const s = signals(repo, NO_SESSIONS);
  assert.equal(s.proposed, 'live');
  assert.ok(s.reasons.includes('recorded stage is higher; propose a lower one only with the owner'), s.reasons.join('; '));
  const scale = signals(withState({ ...STATE, stage: 'scale' }), NO_SESSIONS);
  assert.equal(scale.proposed, 'scale');
});

test('signals: has_ui from tsx', () => {
  const s = signals(makeRepo({ 'src/App.tsx': 'x' }), NO_SESSIONS);
  assert.equal(s.has_ui, true);
  assert.equal(s.files['DESIGN.md'], undefined, 'explore requires no DESIGN.md');
  assert.equal(s.files['docs/ui/screens.md'], undefined, 'explore requires no screen map');
});

test('signals: has_ui ignores test paths, sees UI directories', () => {
  assert.equal(signals(makeRepo({ 'test/fixture.html': 'x', 'src/a.spec.tsx': 'x', 'tests/x.vue': 'x' }), NO_SESSIONS).has_ui, false);
  for (const dir of ['web', 'apps/web', 'frontend']) {
    assert.equal(signals(makeRepo({ [`${dir}/main.go`]: 'x' }), NO_SESSIONS).has_ui, true, dir);
  }
  const s = signals(makeRepo({ 'src/App.svelte': 'x', 'PRODUCT.md': 'p' }), NO_SESSIONS);
  assert.equal(s.files['DESIGN.md'], false, 'product with UI requires DESIGN.md');
  assert.equal(s.files['docs/ui/screens.md'], false, 'product with UI requires the screen map');
});

test('signals CLI: --json and the summary', () => {
  const repo = makeRepo({ 'PRODUCT.md': 'p' });
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-home-')));
  const j = run(repo, ['signals', '--json'], undefined, { HOME: home });
  assert.equal(j.code, 0, j.stderr);
  const s = JSON.parse(j.stdout);
  assert.equal(s.proposed, 'product');
  assert.equal(s.sessions, null);
  const h = run(repo, ['signals'], undefined, { HOME: home });
  assert.equal(h.code, 0, h.stderr);
  assert.equal(h.stdout, 'proposed stage: product\n- PRODUCT.md exists\n');
  const bad = run(repo, ['signals', '--yaml'], undefined, { HOME: home });
  assert.equal(bad.code, 2);
  assert.equal(bad.stderr, 'foundry: unknown argument --yaml\n');
});

// ---- doc-check.sh (templates/doc-check.sh, vendored into user repos) ----

const DOC_CHECK = join(dirname(FOUNDRY), '..', 'templates', 'doc-check.sh');
const PRECEDENCE = 'When this file and the code disagree, the code wins: say so, and propose the fix to this file.';

const AGENTS_OK = [
  '# Agents', '', PRECEDENCE, '',
  'See [product](PRODUCT.md) and [architecture](ARCHITECTURE.md#layers).', '',
  '## Check', '', '```sh', '# run the doc check', 'sh .agents/doc-check.sh', '', 'cd .', '```', '',
].join('\n');

function docState(over = {}) {
  const { agents_md, ...rest } = over;
  return { ...STATE, stage: 'product', ...rest, agents_md: { ...STATE.agents_md, ...agents_md } };
}

// A product-stage repo that passes every rule. `files` overrides or (with null) deletes entries.
function docRepo(files = {}, state = {}) {
  const base = {
    '.agents/foundry.json': JSON.stringify(docState(state), null, 2) + '\n',
    '.agents/doc-check.sh': readFileSync(DOC_CHECK, 'utf8'),
    'AGENTS.md': AGENTS_OK,
    'docs/decisions/index.md': '# Decisions\n\n- [start](0001-start.md)\n- [product](../../PRODUCT.md#goals)\n',
    'docs/decisions/0000-template.md': '# NNNN title\n',
    'docs/decisions/0001-start.md': '# 0001 start\n',
  };
  for (const f of REQUIRED.product) if (!UI_ONLY.includes(f) && !(f in base)) base[f] = `# ${f}\n`;
  const all = { ...base, ...files };
  for (const k of Object.keys(all)) if (all[k] === null) delete all[k];
  return makeRepo(all);
}

function docCheck(repo, { shell = 'sh', cwd } = {}) {
  const args = cwd ? [DOC_CHECK] : [DOC_CHECK, repo];
  const r = spawnSync(shell, args, { cwd: cwd ?? tmpdir(), encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(Boolean);
  return { stdout: r.stdout, stderr: r.stderr, code: r.status, lines, last: lines.at(-1) };
}

const findings = (r, rule) => r.lines.filter((l) => l.startsWith(`doc-check: FAIL ${rule}:`) || l.startsWith(`doc-check: WARN ${rule}:`));

test('doc-check: second line carries the version', () => {
  assert.match(readFileSync(DOC_CHECK, 'utf8').split('\n')[1], /^# foundry doc-check v\d+\.\d+\.\d+$/);
});

test('doc-check: clean product repo passes', () => {
  const repo = docRepo();
  const r = docCheck(repo, { cwd: repo });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(r.lines, ['doc-check: 0 fail, 0 warn']);
  assert.equal(docCheck(repo).code, 0, 'repo_root argument works from another cwd');
});

test('doc-check: broken link fails', () => {
  const r = docCheck(docRepo({ 'AGENTS.md': AGENTS_OK + 'And [x](docs/missing.md).\n' }));
  assert.equal(r.code, 1);
  assert.ok(r.lines.includes('doc-check: FAIL link: AGENTS.md -> docs/missing.md'), r.stdout);
  assert.equal(r.last, 'doc-check: 1 fail, 0 warn');
});

test('doc-check: anchor and ../ resolve', () => {
  const r = docCheck(docRepo({ 'GLOSSARY.md': '# Glossary\n\n[up](docs/../PRODUCT.md#top) [self](#here)\n' }));
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(findings(r, 'link'), []);
  const bad = docCheck(docRepo({ 'docs/decisions/index.md': '- [start](0001-start.md)\n- [p](../PRODUCT.md#goals)\n' }));
  assert.ok(bad.lines.includes('doc-check: FAIL link: docs/decisions/index.md -> ../PRODUCT.md'), bad.stdout);
});

test('doc-check: URLs skipped', () => {
  const r = docCheck(docRepo({ 'PRODUCT.md': '# P\n\n[s](https://example.com/x) [h](http://e.com) [m](mailto:a@b.c)\n' }));
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(findings(r, 'link'), []);
});

test('doc-check: unknown command fails', () => {
  const agents = AGENTS_OK + '## Commands\n\n```sh  \nfoo-not-a-command --x\nnode scripts/missing.mjs\n```\n\n## Other\n\n```sh\nbar-not-checked\n```\n';
  const r = docCheck(docRepo({ 'AGENTS.md': agents }));
  assert.equal(r.code, 1);
  const cmd = findings(r, 'command');
  assert.equal(cmd.length, 2, r.stdout);
  assert.match(cmd[0], /^doc-check: FAIL command: AGENTS\.md:\d+ foo-not-a-command not found$/);
  assert.match(cmd[1], /^doc-check: FAIL command: AGENTS\.md:\d+ node script missing: scripts\/missing\.mjs$/);
});

test('doc-check: decision not in index fails', () => {
  const r = docCheck(docRepo({ 'docs/decisions/0002-orphan.md': '# 0002\n' }));
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r, 'decisions'), ['doc-check: FAIL decisions: docs/decisions/0002-orphan.md not linked from docs/decisions/index.md']);
  const gone = docCheck(docRepo({ 'docs/decisions/0001-start.md': null }));
  assert.equal(gone.code, 1);
  assert.deepEqual(findings(gone, 'decisions'), ['doc-check: FAIL decisions: docs/decisions/index.md -> 0001-start.md missing']);
  assert.deepEqual(findings(gone, 'link'), [], 'reported once, by the decisions rule');
});

test('doc-check: filenames with spaces are handled', () => {
  const r = docCheck(docRepo({
    'docs/decisions/0002-with space.md': '# 0002\n',
    'docs/decisions/0003-also spaced.md': '# 0003\n',
    'docs/decisions/index.md': '- [start](0001-start.md)\n- [two](<0002-with space.md>)\n',
  }));
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(findings(r, 'decisions'), ['doc-check: FAIL decisions: docs/decisions/0003-also spaced.md not linked from docs/decisions/index.md']);
});

test('doc-check: over budget fails when migrated, warns when unmigrated', () => {
  const long = AGENTS_OK + 'filler\n'.repeat(150 - AGENTS_OK.split('\n').length + 1);
  assert.equal(long.split('\n').length - 1, 150);
  const m = docCheck(docRepo({ 'AGENTS.md': long }));
  assert.equal(m.code, 1);
  assert.deepEqual(findings(m, 'budget'), ['doc-check: FAIL budget: AGENTS.md has 150 lines, budget 100']);
  const u = docCheck(docRepo({ 'AGENTS.md': long }, { agents_md: { state: 'unmigrated' } }));
  assert.equal(u.code, 0, u.stdout);
  assert.deepEqual(findings(u, 'budget'), ['doc-check: WARN budget: AGENTS.md has 150 lines, budget 100']);
  assert.equal(u.last, 'doc-check: 0 fail, 1 warn');
  const big = docCheck(docRepo({ 'AGENTS.md': long }, { agents_md: { budget_lines: 200 } }));
  assert.equal(big.code, 0, 'budget_lines is read from the state');
});

test('doc-check: DESIGN.md and the screen map required only with UI', () => {
  assert.equal(docCheck(docRepo()).code, 0);
  const r = docCheck(docRepo({}, { has_ui: true }));
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r, 'required'), ['doc-check: FAIL required: DESIGN.md', 'doc-check: FAIL required: docs/ui/screens.md']);
  const noMap = docCheck(docRepo({ 'DESIGN.md': '# D\n' }, { has_ui: true }));
  assert.deepEqual(findings(noMap, 'required'), ['doc-check: FAIL required: docs/ui/screens.md']);
  assert.equal(docCheck(docRepo({ 'DESIGN.md': '# D\n', 'docs/ui/screens.md': '# S\n' }, { has_ui: true })).code, 0);
});

test('doc-check: required lists REQUIRED[stage] in order', () => {
  const empty = Object.fromEntries(REQUIRED.live.map((f) => [f, null]));
  const r = docCheck(docRepo({ ...empty, 'docs/decisions/0001-start.md': null, 'docs/decisions/0000-template.md': null }, { stage: 'live', has_ui: true }));
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r, 'required').map((l) => l.replace('doc-check: FAIL required: ', '')), REQUIRED.live);
  const runbookFile = docCheck(docRepo({ 'docs/threat-model.md': '# T\n', 'docs/runbooks': 'not a dir\n' }, { stage: 'live' }));
  assert.deepEqual(findings(runbookFile, 'required'), ['doc-check: FAIL required: docs/runbooks/']);
  const ok = docCheck(docRepo({ 'docs/threat-model.md': '# T\n', 'docs/runbooks/deploy.md': '# D\n' }, { stage: 'scale' }));
  assert.equal(ok.code, 0, ok.stdout);
});

test('doc-check: a state file on one line warns instead of reading as explore', () => {
  const r = docCheck(docRepo({ '.agents/foundry.json': JSON.stringify(docState()) + '\n' }));
  assert.deepEqual(findings(r, 'state'), ['doc-check: WARN state: .agents/foundry.json has no stage on its own line; write it 2-space, one key per line']);
});

test('doc-check: a command continued with a backslash is one command', () => {
  const agents = AGENTS_OK.replace('cd .\n```', 'cd .\nsh \\\n  .agents/doc-check.sh\nnot-a-real-cmd-x \\\n  --flag\n```');
  const r = docCheck(docRepo({ 'AGENTS.md': agents }));
  assert.deepEqual(findings(r, 'command').map((l) => l.replace(/:\d+ /, ':N ')), ['doc-check: FAIL command: AGENTS.md:N not-a-real-cmd-x not found']);
});

test('doc-check: links inside ~~~ fences and code spans are not checked; ./ decision links count once', () => {
  const agents = AGENTS_OK + '\n~~~\n[x](nope.md)\n~~~\n\nUse `[y](nope2.md)` here.\n';
  const r = docCheck(docRepo({ 'AGENTS.md': agents, 'docs/decisions/index.md': '# Decisions\n\n- [start](./0001-start.md)\n- [gone](./0002-gone.md)\n' }));
  assert.deepEqual(findings(r, 'link'), []);
  assert.deepEqual(findings(r, 'decisions'), ['doc-check: FAIL decisions: docs/decisions/index.md -> 0002-gone.md missing']);
});

test('doc-check: missing state file means explore, budget 100, migrated', () => {
  const files = { 'AGENTS.md': AGENTS_OK + 'filler\n'.repeat(120), 'PRODUCT.md': '# P\n', 'ARCHITECTURE.md': '# A\n' };
  const r = docCheck(makeRepo(files));
  assert.equal(r.code, 1);
  assert.deepEqual(r.lines.filter((l) => l.includes(' FAIL ')).sort(), [
    `doc-check: FAIL budget: AGENTS.md has ${AGENTS_OK.split('\n').length - 1 + 120} lines, budget 100`,
    'doc-check: FAIL command: AGENTS.md:11 sh script missing: .agents/doc-check.sh',
  ], 'explore requires only AGENTS.md');
  assert.equal(r.last, 'doc-check: 2 fail, 0 warn');
});

test('doc-check: missing precedence sentence fails', () => {
  const agents = AGENTS_OK.replace(PRECEDENCE, 'The code wins.');
  const r = docCheck(docRepo({ 'AGENTS.md': agents }));
  assert.equal(r.code, 1);
  assert.deepEqual(findings(r, 'precedence'), ['doc-check: FAIL precedence: AGENTS.md lacks the precedence sentence']);
  const u = docCheck(docRepo({ 'AGENTS.md': agents }, { agents_md: { state: 'unmigrated' } }));
  assert.equal(u.code, 0);
  assert.deepEqual(findings(u, 'precedence'), ['doc-check: WARN precedence: AGENTS.md lacks the precedence sentence']);
});

test('doc-check: unmigrated still fails link, command, decisions, required', () => {
  const r = docCheck(docRepo({
    'AGENTS.md': AGENTS_OK + '[x](nope.md)\n\n## Check\n\n```sh\nfoo-not-a-command\n```\n',
    'docs/decisions/0002-orphan.md': '# 0002\n',
    'CONSTRAINTS.md': null,
  }, { agents_md: { state: 'unmigrated' } }));
  assert.equal(r.code, 1);
  for (const rule of ['link', 'command', 'decisions', 'required']) {
    assert.ok(findings(r, rule).every((l) => l.includes(' FAIL ')) && findings(r, rule).length === 1, `${rule}: ${r.stdout}`);
  }
});

test('doc-check: runs under dash', (t) => {
  const shell = ['/bin/dash', '/usr/bin/dash'].find((p) => existsSync(p));
  const busybox = !shell && spawnSync('busybox', ['sh', '-c', 'true']).status === 0;
  if (!shell && !busybox) return t.skip('no dash');
  const repo = docRepo();
  const r = shell
    ? docCheck(repo, { shell })
    : (() => { const x = spawnSync('busybox', ['sh', DOC_CHECK, repo], { encoding: 'utf8' }); return { code: x.status, stdout: x.stdout, stderr: x.stderr }; })();
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /doc-check: 0 fail, 0 warn\n$/);
  const ui = shell ? docCheck(docRepo({}, { has_ui: true }), { shell }) : null;
  if (ui) assert.deepEqual(findings(ui, 'required'), ['doc-check: FAIL required: DESIGN.md', 'doc-check: FAIL required: docs/ui/screens.md']);
});

// ---- init-files ----

const TEMPLATE_VERSION = readFileSync(DOC_CHECK, 'utf8').split('\n')[1].replace('# foundry doc-check v', '');
const read = (repo, p) => readFileSync(join(repo, p), 'utf8');
const exists = (repo, p) => existsSync(join(repo, p));
const init = (repo, ...args) => run(repo, ['init-files', ...args]);
const repoCheck = (repo) => {
  const r = spawnSync('sh', ['.agents/doc-check.sh'], { cwd: repo, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, lines: r.stdout.split('\n').filter(Boolean) };
};

test('init-files: explore writes AGENTS.md, state, doc check only', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const r = init(repo, '--stage', 'explore');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, '');
  for (const f of ['AGENTS.md', '.agents/foundry.json', '.agents/doc-check.sh']) assert.ok(exists(repo, f), f);
  for (const f of ['PRODUCT.md', 'ARCHITECTURE.md', 'GLOSSARY.md', 'CONSTRAINTS.md', 'docs']) assert.ok(!exists(repo, f), f);
  const agents = read(repo, 'AGENTS.md');
  assert.match(agents, new RegExp(`^# Working on ${repo.split('/').at(-1)}\n`));
  for (const h of ['## Check', '## Verify', '## Where things are', '## Workflow']) assert.ok(agents.includes(`\n${h}\n`), h);
  assert.ok(agents.includes(PRECEDENCE));
  assert.ok(agents.includes('A product-level decision made anywhere (a brainstorm, a spec, a review, a fix round) gets a decision file in docs/decisions/ and an update to PRODUCT.md in the same change. Code-level choices stay in the spec or the PR.'));
  assert.ok(!agents.includes('The reviewer of each change also reads it'), 'no security line at explore');
  assert.ok(!agents.includes('{{'), 'placeholders filled');
  assert.ok(agents.includes('```sh\nsh .agents/check.sh\n```'), agents);
  const s = readState(repo);
  assert.equal(s.stage, 'explore');
  assert.equal(s.stage_reason, 'init');
  assert.match(s.stage_set, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.has_ui, false);
  assert.deepEqual(s.agents_md, { budget_lines: 100, state: 'migrated' });
  assert.equal(s.readiness_tier, 0);
  assert.deepEqual(s.providers, {});
  assert.deepEqual(s.queue, []);
  assert.equal(s.garden_last, null);
  assert.equal(s.doc_check_version, TEMPLATE_VERSION);
  assert.ok(r.stdout.split('\n').includes('created AGENTS.md'), r.stdout);
  assert.ok(r.stdout.split('\n').includes('doc-check created'), r.stdout);
  const c = repoCheck(repo);
  assert.equal(c.code, 0, c.stdout + c.stderr);
});

test('init-files: product on node repo wires package.json check', () => {
  const pkg = '{\n    "name": "x",\n    "scripts": {\n        "test": "node --test"\n    },\n    "type": "module"\n}\n';
  const repo = makeRepo({ 'package.json': pkg });
  const r = init(repo, '--stage', 'product', '--name', 'demo');
  assert.equal(r.code, 0, r.stderr);
  const text = read(repo, 'package.json');
  const p = JSON.parse(text);
  assert.equal(p.scripts.check, 'npm test && sh .agents/doc-check.sh');
  assert.deepEqual(Object.keys(p), ['name', 'scripts', 'type'], 'key order kept');
  assert.ok(text.includes('\n    "name"') && text.endsWith('}\n'), 'indent and trailing newline kept');
  assert.ok(r.stdout.split('\n').includes('wired check in package.json'), r.stdout);
  const agents = read(repo, 'AGENTS.md');
  assert.match(agents, /^# Working on demo\n/);
  assert.ok(agents.includes('```sh\nnpm run check\n```'));
  assert.ok(agents.includes('The reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed.'));
  assert.ok(!exists(repo, '.agents/check.sh'));
  const lint = makeRepo({ 'package.json': JSON.stringify({ scripts: { lint: 'eslint .', test: 't' } }) });
  init(lint, '--stage', 'explore');
  assert.equal(JSON.parse(read(lint, 'package.json')).scripts.check, 'npm run lint && npm test && sh .agents/doc-check.sh');
  assert.ok(!read(lint, 'package.json').endsWith('\n'), 'no trailing newline added');
  const none = makeRepo({ 'package.json': '{"name":"n"}\n' });
  init(none, '--stage', 'explore');
  assert.equal(read(none, 'package.json'), '{"name":"n","scripts":{"check":"sh .agents/doc-check.sh"}}\n', 'one-line file stays one line');
  const tabs = makeRepo({ 'package.json': '{\n\t"name": "t"\n}\n' });
  init(tabs, '--stage', 'explore');
  assert.equal(read(tabs, 'package.json'), '{\n\t"name": "t",\n\t"scripts": {\n\t\t"check": "sh .agents/doc-check.sh"\n\t}\n}\n');
});

test('init-files: keeps existing AGENTS.md byte-identical', () => {
  const long = Array.from({ length: 400 }, (_, i) => `line ${i} - [gone](nowhere.md)`).join('\n') + '\n';
  const repo = makeRepo({ 'AGENTS.md': long });
  const r = init(repo, '--stage', 'product');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(repo, 'AGENTS.md'), long);
  assert.equal(readState(repo).agents_md.state, 'unmigrated');
  assert.ok(r.stdout.split('\n').includes('kept AGENTS.md (exists, unmigrated)'), r.stdout);
  assert.ok(!r.stdout.includes('agents-md:'), r.stdout);
});

test('init-files: grow keeps a migrated AGENTS.md and lists what the stage adds', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  assert.equal(init(repo, '--stage', 'explore').code, 0);
  const before = read(repo, 'AGENTS.md');
  assert.equal(run(repo, ['state', '--set', 'stage=product', '--set', 'stage_reason=grow']).code, 0);
  const SEC = 'The reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed.';
  const links = ['PRODUCT.md', 'ARCHITECTURE.md', 'GLOSSARY.md', 'CONSTRAINTS.md', 'docs/decisions/index.md'];
  const dry = init(repo, '--stage', 'product', '--dry-run');
  assert.ok(dry.stdout.split('\n').includes('would agents-md: add link to PRODUCT.md'), dry.stdout);
  const r = init(repo, '--stage', 'product');
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.split('\n');
  assert.ok(lines.includes('kept AGENTS.md (exists)'), r.stdout);
  assert.ok(!r.stdout.includes('unmigrated'), r.stdout);
  assert.deepEqual(lines.filter((l) => l.startsWith('agents-md:')), [
    ...links.map((f) => `agents-md: add link to ${f}`), `agents-md: add line: ${SEC}`,
  ]);
  assert.equal(read(repo, 'AGENTS.md'), before);
  assert.equal(readState(repo).agents_md.state, 'migrated');
  // Apply the suggestions by hand, as grow step 4 would after the owner's yes.
  const added = links.map((f) => `- [${f}](${f}): x.`).join('\n');
  const applied = before
    .replace('\n## Workflow', `${added}\n\n## Workflow`)
    .replace('quote the output.\n', `quote the output.\n${SEC}\n`);
  writeFileSync(join(repo, 'AGENTS.md'), applied);
  const again = init(repo, '--stage', 'product');
  assert.ok(again.stdout.split('\n').includes('kept AGENTS.md (exists)'), again.stdout);
  assert.ok(!again.stdout.includes('agents-md:'), again.stdout);
  assert.deepEqual(repoCheck(repo).lines.filter((l) => l.includes(' FAIL ')), ['doc-check: FAIL required: .agents/code-map.md']);
});

test('init-files: existing check script untouched', () => {
  const pkg = '{\n  "scripts": {\n    "test": "t",\n    "check": "custom"\n  }\n}\n';
  const repo = makeRepo({ 'package.json': pkg });
  const r = init(repo, '--stage', 'explore');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(read(repo, 'package.json'), pkg);
  assert.ok(r.stdout.split('\n').includes('kept package.json check (exists)'), r.stdout);
});

test('init-files: mise.toml and Makefile get a check task', () => {
  const mise = makeRepo({ 'mise.toml': '[tasks.test]\nrun = "pytest"\n' });
  const m = init(mise, '--stage', 'explore');
  assert.equal(m.code, 0, m.stderr);
  assert.equal(read(mise, 'mise.toml'), '[tasks.test]\nrun = "pytest"\n\n[tasks.check]\nrun = "mise run test && sh .agents/doc-check.sh"\n');
  assert.ok(read(mise, 'AGENTS.md').includes('```sh\nmise run check\n```'));
  assert.ok(m.stdout.split('\n').includes('wired check in mise.toml'), m.stdout);
  const plain = makeRepo({ 'mise.toml': '[tools]\nnode = "22"' });
  init(plain, '--stage', 'explore');
  assert.equal(read(plain, 'mise.toml'), '[tools]\nnode = "22"\n\n[tasks.check]\nrun = "sh .agents/doc-check.sh"\n');
  const kept = makeRepo({ 'mise.toml': '[tasks.check]\nrun = "x"\n' });
  const k = init(kept, '--stage', 'explore');
  assert.equal(read(kept, 'mise.toml'), '[tasks.check]\nrun = "x"\n');
  assert.ok(k.stdout.split('\n').includes('kept mise.toml check (exists)'), k.stdout);
  const make = makeRepo({ Makefile: 'test:\n\tgo test ./...\n' });
  init(make, '--stage', 'explore');
  assert.equal(read(make, 'Makefile'), 'test:\n\tgo test ./...\n\ncheck:\n\t$(MAKE) test\n\tsh .agents/doc-check.sh\n');
  assert.ok(read(make, 'AGENTS.md').includes('```sh\nmake check\n```'));
  const bare = makeRepo({ Makefile: 'all:\n\techo hi\n' });
  init(bare, '--stage', 'explore');
  assert.equal(read(bare, 'Makefile'), 'all:\n\techo hi\n\ncheck:\n\tsh .agents/doc-check.sh\n');
  const mk = makeRepo({ Makefile: 'check:\n\tmine\n' });
  const mr = init(mk, '--stage', 'explore');
  assert.equal(read(mk, 'Makefile'), 'check:\n\tmine\n');
  assert.ok(mr.stdout.split('\n').includes('kept Makefile check (exists)'), mr.stdout);
  const inline = makeRepo({ 'mise.toml': '[tasks]\ntest = "pytest"\n\n[tools]\nnode = "22"\n' });
  init(inline, '--stage', 'explore');
  assert.match(read(inline, 'mise.toml'), /\[tasks\.check\]\nrun = "mise run test && sh \.agents\/doc-check\.sh"\n$/, 'an inline test task counts');
  const inlineCheck = makeRepo({ 'mise.toml': '[tasks]\ncheck = "make all"\n' });
  const ic = init(inlineCheck, '--stage', 'explore');
  assert.equal(read(inlineCheck, 'mise.toml'), '[tasks]\ncheck = "make all"\n');
  assert.ok(ic.stdout.split('\n').includes('kept mise.toml check (exists)'), ic.stdout);
  const other = makeRepo({ 'mise.toml': '[tasks]\nbuild = "x"\n\n[env]\ntest = "1"\n' });
  init(other, '--stage', 'explore');
  assert.match(read(other, 'mise.toml'), /run = "sh \.agents\/doc-check\.sh"\n$/, 'a test key outside [tasks] is not a task');
});

test('init-files: a name with $ patterns is written as given', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  init(repo, '--stage', 'explore', '--name', "a$&b$'c$1");
  assert.match(read(repo, 'AGENTS.md'), /^# Working on a\$&b\$'c\$1\n/);
});

test('init-files: --stage other than the recorded stage warns', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  init(repo, '--stage', 'explore');
  const r = init(repo, '--stage', 'product');
  assert.ok(r.stdout.split('\n').includes('warn --stage product differs from the recorded stage explore; the state keeps explore, so set it with state --set stage=product first'), r.stdout);
  run(repo, ['state', '--set', 'stage=product']);
  assert.ok(!init(repo, '--stage', 'product').stdout.includes('differs'));
});

test('init-files: a recorded design_md is linked, and DESIGN.md is not asked for at the top', () => {
  const repo = makeRepo({ 'web/App.tsx': 'x', 'web/DESIGN.md': '# D\n' });
  init(repo, '--stage', 'explore');
  assert.equal(signals(repo, NO_SESSIONS).design_md_found, 'web/DESIGN.md');
  run(repo, ['state', '--set', 'design_md=web/DESIGN.md', '--set', 'stage=product']);
  assert.equal(signals(repo, NO_SESSIONS).design_md_found, null);
  assert.equal(signals(repo, NO_SESSIONS).files['web/DESIGN.md'], true);
  assert.equal(signals(repo, NO_SESSIONS).files['DESIGN.md'], undefined);
  const r = init(repo, '--stage', 'product');
  assert.ok(r.stdout.split('\n').includes('agents-md: add link to web/DESIGN.md'), r.stdout);
  assert.ok(!repoCheck(repo).lines.some((l) => l.endsWith('required: DESIGN.md')), 'doc-check reads design_md');
  assert.ok(!repoCheck(repo).lines.some((l) => l.endsWith('required: web/DESIGN.md')));
  const bad = run(repo, ['state', '--set', 'design_md=../x/DESIGN.md']);
  assert.equal(bad.code, 2);
  assert.equal(run(repo, ['state', '--set', 'design_md=web/notes.md']).code, 2);
});

test('init-files: rust repo without runner gets .agents/check.sh', () => {
  const repo = makeRepo({ 'Cargo.toml': '[package]\nname = "r"\n' });
  const r = init(repo, '--stage', 'explore');
  assert.equal(r.code, 0, r.stderr);
  const sh = read(repo, '.agents/check.sh');
  assert.match(sh, /^#!\/bin\/sh\nset -eu\n/);
  assert.ok(sh.includes('cargo fmt --check && cargo clippy -- -D warnings && cargo test && sh .agents/doc-check.sh'));
  assert.ok(!exists(repo, 'package.json'));
  assert.ok(r.stdout.split('\n').includes('created .agents/check.sh'), r.stdout);
  const plain = makeRepo({ 'a.txt': 'x' });
  init(plain, '--stage', 'explore');
  assert.ok(read(plain, '.agents/check.sh').includes('sh .agents/doc-check.sh'));
  assert.ok(!read(plain, '.agents/check.sh').includes('cargo'));
  const own = makeRepo({ '.agents/check.sh': 'mine\n' });
  const o = init(own, '--stage', 'explore');
  assert.equal(read(own, '.agents/check.sh'), 'mine\n');
  assert.ok(o.stdout.split('\n').includes('kept .agents/check.sh (exists)'), o.stdout);
});

test('init-files: dry-run writes nothing', () => {
  const pkg = '{"scripts":{"test":"t"}}\n';
  const repo = makeRepo({ 'package.json': pkg });
  const before = git(repo, 'status', '--porcelain', '--untracked-files=all');
  const r = init(repo, '--stage', 'live', '--dry-run');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), before);
  assert.equal(read(repo, 'package.json'), pkg);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.ok(lines.length > 0 && lines.every((l) => l.startsWith('would ')), r.stdout);
  assert.ok(lines.includes('would created AGENTS.md'), r.stdout);
  assert.ok(lines.includes('would wired check in package.json'), r.stdout);
  assert.ok(lines.includes('would doc-check created'), r.stdout);
});

test('init-files: product skeleton fails doc-check only on the provider-owned file', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const r = init(repo, '--stage', 'product');
  assert.equal(r.code, 0, r.stderr);
  for (const f of ['PRODUCT.md', 'ARCHITECTURE.md', 'GLOSSARY.md', 'CONSTRAINTS.md', 'docs/decisions/index.md', 'docs/decisions/0000-template.md']) {
    assert.ok(exists(repo, f), f);
    assert.ok(r.stdout.split('\n').includes(`created ${f}`), f);
  }
  assert.ok(!exists(repo, 'docs/threat-model.md'));
  const c = repoCheck(repo);
  assert.equal(c.code, 1, c.stdout);
  assert.deepEqual(c.lines.filter((l) => l.includes(' FAIL ')), ['doc-check: FAIL required: .agents/code-map.md']);
  assert.deepEqual(c.lines.filter((l) => / (FAIL|WARN) link:/.test(l)), []);
  const agents = read(repo, 'AGENTS.md');
  assert.ok(agents.includes('](docs/decisions/index.md)') && !agents.includes('0000-template.md'));
  assert.ok(read(repo, 'ARCHITECTURE.md').includes('`.agents/code-map.md`'));
  const live = makeRepo({ 'a.txt': 'x' });
  init(live, '--stage', 'live');
  for (const f of ['docs/threat-model.md', 'docs/runbooks/README.md']) assert.ok(exists(live, f), f);
  assert.deepEqual(repoCheck(live).lines.filter((l) => l.includes(' FAIL ')), ['doc-check: FAIL required: .agents/code-map.md']);
});

test('init-files: templates are short and free of dashes', () => {
  const dir = join(dirname(FOUNDRY), '..', 'templates');
  for (const f of ['AGENTS.md', 'PRODUCT.md', 'ARCHITECTURE.md', 'GLOSSARY.md', 'decision.md', 'decisions-index.md', 'CONSTRAINTS.md', 'threat-model.md', 'runbook.md']) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.ok(text.split('\n').length - 1 < 40, `${f} under 40 lines`);
    assert.ok(!/[\u2013\u2014]/.test(text), `${f} has no em or en dash`);
    if (f !== 'AGENTS.md') assert.ok(!text.includes('{{'), `${f} has no placeholder`);
  }
  const repo = makeRepo({ 'a.txt': 'x' });
  init(repo, '--stage', 'live');
  assert.ok(read(repo, 'AGENTS.md').split('\n').length - 1 < 40);
});

const UI_LINE = 'After any UI change, run check-screens before reporting done.';

test('init-files: a UI repo at product gets the screen map, its link and the check-screens line', () => {
  const repo = makeRepo({ 'web/App.tsx': 'x' });
  const r = init(repo, '--stage', 'product');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.split('\n').includes('created docs/ui/screens.md'), r.stdout);
  const map = read(repo, 'docs/ui/screens.md');
  assert.equal(map.split('\n')[0], '<!-- check-screens map v1 -->', 'check-screens accepts the file as its own');
  assert.equal(map, readFileSync(join(dirname(FOUNDRY), '..', '..', 'check-screens', 'templates', 'screens.md'), 'utf8'), 'same template as check-screens');
  const agents = read(repo, 'AGENTS.md');
  assert.ok(agents.includes('](docs/ui/screens.md)'), agents);
  assert.ok(agents.includes(`${UI_LINE}\n`), agents);
  assert.deepEqual(repoCheck(repo).lines.filter((l) => l.includes(' FAIL ')).sort(), ['doc-check: FAIL required: .agents/code-map.md', 'doc-check: FAIL required: DESIGN.md']);
});

test('init-files: no screen map or check-screens line without UI, or at explore', () => {
  const plain = makeRepo({ 'a.txt': 'x' });
  init(plain, '--stage', 'product');
  assert.ok(!exists(plain, 'docs/ui/screens.md'));
  assert.ok(!read(plain, 'AGENTS.md').includes(UI_LINE));
  const early = makeRepo({ 'web/App.tsx': 'x' });
  init(early, '--stage', 'explore');
  assert.ok(!exists(early, 'docs/ui/screens.md'));
  assert.ok(!read(early, 'AGENTS.md').includes(UI_LINE));
});

test('init-files: keeps an existing screen map; grow lists the check-screens line for a kept AGENTS.md', () => {
  const repo = makeRepo({ 'web/App.tsx': 'x' });
  init(repo, '--stage', 'explore');
  write(repo, 'docs/ui/screens.md', '<!-- check-screens map v1 -->\n# mine\n');
  const r = init(repo, '--stage', 'product');
  assert.equal(r.code, 0, r.stderr);
  const out = r.stdout.split('\n');
  assert.ok(out.includes('kept docs/ui/screens.md (exists)'), r.stdout);
  assert.equal(read(repo, 'docs/ui/screens.md'), '<!-- check-screens map v1 -->\n# mine\n');
  assert.ok(out.includes('agents-md: add link to docs/ui/screens.md'), r.stdout);
  assert.ok(out.includes(`agents-md: add line: ${UI_LINE}`), r.stdout);
});

test('init-files: the recorded has_ui wins over the file scan', () => {
  const repo = makeRepo({ 'web/App.tsx': 'x' });
  init(repo, '--stage', 'explore');
  run(repo, ['state', '--set', 'has_ui=false']);
  init(repo, '--stage', 'product');
  assert.ok(!exists(repo, 'docs/ui/screens.md'), 'the owner said this repo has no UI');
});

test('init-files: never writes DESIGN.md or code-map.md', () => {
  const repo = makeRepo({ 'web/App.tsx': 'x' });
  const r = init(repo, '--stage', 'scale');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!exists(repo, 'DESIGN.md'));
  assert.ok(!exists(repo, '.agents/code-map.md'));
  assert.equal(readState(repo).has_ui, true);
  const agents = read(repo, 'AGENTS.md');
  assert.ok(!agents.includes('](DESIGN.md)') && !agents.includes('](.agents/code-map.md)'));
  const has = makeRepo({ 'DESIGN.md': '# D\n', '.agents/code-map.md': '# M\n' });
  init(has, '--stage', 'product');
  const a = read(has, 'AGENTS.md');
  assert.ok(a.includes('](DESIGN.md)') && a.includes('](.agents/code-map.md)'), 'existing files are linked');
});

test('init-files: --skip GLOSSARY.md leaves it out', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const r = init(repo, '--stage', 'product', '--skip', 'GLOSSARY.md,CONSTRAINTS.md');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!exists(repo, 'GLOSSARY.md') && !exists(repo, 'CONSTRAINTS.md'));
  assert.ok(exists(repo, 'PRODUCT.md'));
  const agents = read(repo, 'AGENTS.md');
  assert.ok(!agents.includes('GLOSSARY.md') && !agents.includes('CONSTRAINTS.md'));
  assert.deepEqual(findings({ lines: repoCheck(repo).lines }, 'link'), []);
});

test('init-files: existing state keeps its fields, refreshes doc_check_version', () => {
  const old = { ...STATE, stage: 'product', stage_reason: 'kept', doc_check_version: '0.9.0', queue: [{ interview: 'x', when: 'now', done: false }] };
  const repo = makeRepo({ '.agents/foundry.json': JSON.stringify(old, null, 2) + '\n' });
  const r = init(repo, '--stage', 'explore');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(readState(repo), { ...old, doc_check_version: TEMPLATE_VERSION });
  assert.ok(r.stdout.split('\n').includes('kept .agents/foundry.json (exists)'), r.stdout);
});

test('init-files: bad arguments exit 2', () => {
  const repo = makeRepo();
  for (const args of [[], ['--stage', 'nope'], ['--stage', 'explore', '--bogus']]) {
    const r = init(repo, ...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.stderr, /^foundry: /);
  }
  assert.ok(!exists(repo, 'AGENTS.md'));
});

test('vendorDocCheck: current/updated', async () => {
  const { vendorDocCheck } = await import('./foundry.mjs');
  const repo = makeRepo();
  assert.equal(vendorDocCheck(repo), 'created');
  assert.equal(read(repo, '.agents/doc-check.sh'), readFileSync(DOC_CHECK, 'utf8'));
  assert.equal(statSync(join(repo, '.agents/doc-check.sh')).mode & 0o777, 0o755);
  assert.equal(vendorDocCheck(repo), 'current');
  write(repo, '.agents/doc-check.sh', '#!/bin/sh\n# foundry doc-check v0.0.1\n');
  assert.equal(vendorDocCheck(repo), 'updated');
  assert.equal(read(repo, '.agents/doc-check.sh'), readFileSync(DOC_CHECK, 'utf8'));
});

test('init-files: warns for a globally gitignored AGENTS.md', () => {
  const repo = makeRepo({ 'a.txt': 'x' });
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-global-')));
  write(dir, 'ignore', 'AGENTS.md\n');
  write(dir, 'config', `[core]\n\texcludesfile = ${join(dir, 'ignore')}\n`);
  const env = { GIT_CONFIG_GLOBAL: join(dir, 'config') };
  const r = run(repo, ['init-files', '--stage', 'explore'], undefined, env);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(exists(repo, 'AGENTS.md'));
  const warns = r.stdout.split('\n').filter((l) => l.startsWith('warn '));
  assert.deepEqual(warns, [`warn AGENTS.md is gitignored (${join(dir, 'ignore')}:1): add it with git add -f`]);
  const dry = run(makeRepo({ 'a.txt': 'x' }), ['init-files', '--stage', 'explore', '--dry-run'], undefined, env);
  assert.deepEqual(dry.stdout.split('\n').filter((l) => l.startsWith('warn ')), warns, 'dry-run warns too, without the would prefix');
});

test('init-files: no warn line when nothing is ignored', () => {
  const repo = makeRepo({ '.gitignore': 'node_modules/\n', 'package.json': '{"scripts":{"test":"t"}}\n' });
  const r = init(repo, '--stage', 'live');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('warn '), r.stdout);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-nogit-')));
  const o = init(outside, '--stage', 'explore');
  assert.equal(o.code, 0, o.stderr);
  assert.equal(o.stderr, '');
  assert.ok(!o.stdout.includes('warn '), 'outside git the check is skipped');
});

test('init-files: repo .gitignore of .agents/ warns for each .agents file', () => {
  const repo = makeRepo({ '.gitignore': '.agents/\n', 'Makefile': 'all:\n\techo\n' });
  const r = init(repo, '--stage', 'explore');
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith('warn ')).sort(), [
    'warn .agents/doc-check.sh is gitignored (.gitignore:1): add it with git add -f',
    'warn .agents/foundry.json is gitignored (.gitignore:1): add it with git add -f',
  ]);
  const sh = makeRepo({ '.gitignore': '.agents/\n' });
  const s = init(sh, '--stage', 'explore');
  assert.ok(s.stdout.includes('warn .agents/check.sh is gitignored (.gitignore:1): add it with git add -f'), s.stdout);
  const neg = makeRepo({ '.gitignore': '.agents/*\n!.agents/foundry.json\n' });
  const n = init(neg, '--stage', 'explore');
  assert.ok(!n.stdout.includes('warn .agents/foundry.json'), 'a negated path is not ignored');
});

// Knowledge references: the tables the commands read must agree with the script and each other.
const REFS = join(dirname(FOUNDRY), '..', 'reference');
const ref = (name) => readFileSync(join(REFS, name), 'utf8');
const STAGES = ['explore', 'product', 'live', 'scale'];

// Rows of every Markdown table whose header row starts with `| <first> |`, as arrays of trimmed cells.
function tableRows(md, first) {
  const rows = [];
  let inTable = false;
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) { inTable = false; continue; }
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (!inTable) { inTable = cells[0] === first ? 'header' : 'other'; continue; }
    if (inTable === 'header') { inTable = 'body'; continue; } // the |---| line
    if (inTable === 'body') rows.push(cells);
  }
  return rows;
}

test('refs: stages.md required files match REQUIRED', () => {
  const md = ref('stages.md');
  const got = {};
  let stage = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^## (\S+)\s*$/);
    if (h) { stage = h[1]; got[stage] = []; continue; }
    const b = line.match(/^- `([^`]+)`/);
    if (stage && b) got[stage].push(b[1]);
  }
  assert.deepEqual(Object.keys(got), STAGES);
  assert.deepEqual(got, REQUIRED);
});

test('refs: every theme in themes.md has a fallback row in providers.md', () => {
  const themes = tableRows(ref('themes.md'), 'Theme').map((r) => r[0]);
  assert.ok(themes.length >= 17, `themes: ${themes}`);
  assert.equal(new Set(themes).size, themes.length, 'themes are unique');
  const rows = tableRows(ref('providers.md'), 'Theme');
  for (const t of themes) {
    const fallbacks = rows.filter((r) => r[0] === t && r[2] === 'fallback');
    assert.equal(fallbacks.length, 1, `theme ${t} has ${fallbacks.length} fallback rows`);
    assert.match(fallbacks[0][1], /^(`templates\/[^`]+`|ask the owner)$/, `theme ${t} fallback names a template or the owner`);
  }
  for (const r of rows) assert.ok(themes.includes(r[0]), `providers.md theme ${r[0]} is in themes.md`);
});

test('refs: every provider row has a license and link', () => {
  const rows = tableRows(ref('providers.md'), 'Theme');
  assert.ok(rows.length > 17);
  for (const r of rows) {
    assert.equal(r.length, 6, `six cells: ${r.join(' | ')}`);
    const [theme, provider, kind, license, link] = r;
    assert.ok(provider, `provider in ${theme}`);
    assert.ok(['skill', 'mcp', 'tool', 'fallback'].includes(kind), `kind ${kind} for ${provider}`);
    assert.ok(license, `license for ${provider}`);
    assert.ok(link, `link for ${provider}`);
    assert.doesNotMatch(link, /\b(\d{1,3}\.){3}\d{1,3}\b|\.(lan|local|internal)\b/, `no internal host in ${link}`);
  }
});

test('refs: readiness.md has three tiers checked by script, test or review', () => {
  const md = ref('readiness.md');
  const tables = md.split(/^## /m).slice(1).map((s) => tableRows(s, 'Item'));
  assert.deepEqual(tables.map((t) => t.length), [10, 7, 6]);
  for (const r of tables.flat()) assert.match(r[1], /^(script|test|review)\b/, `${r[0]}: ${r[1]}`);
});

const KNOWLEDGE_REFS = ['providers.md', 'readiness.md', 'stages.md', 'themes.md'];
const COMMAND_REFS = ['routing.md', 'init.md', 'audit.md', 'grow.md', 'providers-cmd.md', 'check.md', 'garden.md', 'tune.md'];

test('refs: every \'node <skill dir>/scripts/foundry.mjs <cmd>\' in reference/*.md names a real command', () => {
  assert.deepEqual(foundry.COMMANDS, ['state', 'signals', 'init-files', 'vendor-check', 'digest', 'garden-range', 'hook']);
  let mentions = 0;
  for (const f of readdirSync(REFS).filter((n) => n.endsWith('.md'))) {
    for (const m of ref(f).matchAll(/node <skill dir>\/scripts\/foundry\.mjs(?: +([^\s`]+))?/g)) {
      mentions++;
      assert.ok(foundry.COMMANDS.includes(m[1]), `${f}: unknown command ${m[1]}`);
    }
  }
  assert.ok(mentions >= COMMAND_REFS.length, `mentions: ${mentions}`);
});

test('refs: every relative link in reference/*.md resolves', () => {
  for (const f of readdirSync(REFS).filter((n) => n.endsWith('.md'))) {
    const prose = ref(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      assert.ok(existsSync(join(REFS, target.split('#')[0])), `${f} -> ${target}`);
    }
  }
});

test('refs: command references are short procedures with a Done line per step', () => {
  for (const f of COMMAND_REFS) {
    const md = ref(f);
    assert.ok(md.split('\n').length <= 80, `${f} has ${md.split('\n').length} lines`);
    const steps = md.split(/^### /m).slice(1);
    assert.ok(steps.length >= 1, `${f} has numbered steps`);
    for (const s of steps) assert.match(s, /^\d+\. /, `${f}: step heading is numbered: ${s.split('\n')[0]}`);
    for (const s of steps) assert.match(s, /\bDone: /, `${f}: step ${s.split('\n')[0]} has a Done line`);
  }
});

test('vendor-check prints created/current', () => {
  const repo = makeRepo();
  const first = run(repo, ['vendor-check']);
  assert.deepEqual([first.stdout, first.stderr, first.code], ['doc-check created\n', '', 0]);
  assert.equal(read(repo, '.agents/doc-check.sh'), readFileSync(DOC_CHECK, 'utf8'));
  assert.equal(run(repo, ['vendor-check']).stdout, 'doc-check current\n');
  write(repo, '.agents/doc-check.sh', '#!/bin/sh\n# foundry doc-check v0.0.1\n');
  assert.equal(run(repo, ['vendor-check']).stdout, 'doc-check updated\n');
  assert.equal(read(repo, '.agents/doc-check.sh'), readFileSync(DOC_CHECK, 'utf8'));
  const bad = run(repo, ['vendor-check', '--x']);
  assert.deepEqual([bad.stderr, bad.code], ['foundry: unknown argument --x\n', 2]);
  assert.match(run(repo, []).stderr, /\| vendor-check \| digest \[--limit N\] \[--json\] \| garden-range \[--mark\] \[--json\] \| hook\n$/);
});

test('refs: the provider steps read the local overlay, and its example exists', () => {
  for (const f of ['providers.md', 'providers-cmd.md', 'routing.md']) assert.ok(ref(f).includes('~/.config/foundry/local.md'), `${f} names the overlay`);
  const example = join(dirname(FOUNDRY), '..', 'templates', 'local.md.example');
  assert.ok(existsSync(example), 'templates/local.md.example exists');
  const text = readFileSync(example, 'utf8');
  assert.ok(text.includes('store:'), 'the example has a store line');
  assert.doesNotMatch(text, /[\u2013\u2014]| -- /, 'the example has no dashes');
});

test('refs: no prose dashes', () => {
  const files = readdirSync(REFS).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files.sort(), [...KNOWLEDGE_REFS, ...COMMAND_REFS].sort());
  for (const f of files) {
    const prose = ref(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    prose.split('\n').forEach((line, i) => assert.doesNotMatch(line, /[\u2014\u2013]| -- /, `${f}:${i + 1}`));
  }
});

test('doc-check: required list matches REQUIRED', () => {
  for (const stage of STAGES) {
    const repo = makeRepo({ '.agents/foundry.json': JSON.stringify(docState({ stage, has_ui: true }), null, 2) + '\n' });
    const r = docCheck(repo);
    const req = r.lines.filter((l) => l.startsWith('doc-check: FAIL required: ')).map((l) => l.replace('doc-check: FAIL required: ', ''));
    assert.deepEqual(req, REQUIRED[stage], `stage ${stage}`);
  }
});

// ---- digest: Copilot transcripts, reduced to what tune may read ----

const FIXTURE = join(dirname(FOUNDRY), 'fixtures', 'copilot-session');

// A sessions root holding copies of the fixture session; each entry overrides workspace.yaml lines and events.
function copilotRoot(sessions) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-sessions-')));
  for (const { id, workspace, events } of sessions) {
    cpSync(FIXTURE, join(root, id), { recursive: true });
    if (workspace) write(root, `${id}/workspace.yaml`, workspace.join('\n') + '\n');
    if (events) write(root, `${id}/events.jsonl`, events.map((e) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n') + '\n');
  }
  return root;
}

const fixtureFor = (repo) => copilotRoot([{ id: 'fixture', workspace: [`cwd: ${repo}`, `git_root: ${repo}`, 'branch: main', 'created_at: 2026-03-04T09:59:59.000Z'] }]);

test('digest: reads user messages, tool names and arg keys', () => {
  const repo = makeRepo();
  const [d, ...rest] = digest(repo, { sessionsRoot: fixtureFor(repo) });
  assert.equal(rest.length, 0);
  assert.equal(d.id, 'fixture');
  assert.equal(d.started, '2026-03-04T10:00:00.000Z', 'from session.start data.startTime');
  assert.equal(d.user[0], 'Add a health endpoint to the API');
  assert.equal(d.user.length, 2, 'the broken JSON line is skipped');
  assert.equal(d.user[1].length, 500, 'cut to 500 characters');
  assert.ok(d.user[1].startsWith('Now write the tests. '));
  assert.ok(d.tools.includes('bash(command,description)'), d.tools.join(' '));
  assert.ok(d.tools.includes('skill(skill)'), d.tools.join(' '));
  assert.ok(d.tools.includes('search-mcp_tool_call(tool_name,arguments)'), d.tools.join(' '));
  assert.deepEqual(d.skills, ['brainstorming']);
  assert.equal(d.compactions, 1);
  assert.deepEqual(Object.keys(d), ['id', 'started', 'user', 'tools', 'skills', 'compactions']);
});

test('digest: never includes tool output', () => {
  const repo = makeRepo();
  const out = JSON.stringify(digest(repo, { sessionsRoot: fixtureFor(repo) }));
  assert.ok(readFileSync(join(FIXTURE, 'events.jsonl'), 'utf8').includes('SECRET_TOKEN_abc123'), 'the fixture holds the secret');
  assert.ok(!out.includes('SECRET_TOKEN_abc123'), out);
  for (const hidden of ['INJECTED_CONTEXT_xyz', 'ASSISTANT_TEXT_qrs', 'HOOK_INPUT_hidden']) assert.ok(!out.includes(hidden), hidden);
});

test('digest: never includes argument values', () => {
  const repo = makeRepo();
  const out = JSON.stringify(digest(repo, { sessionsRoot: fixtureFor(repo) }));
  assert.ok(readFileSync(join(FIXTURE, 'events.jsonl'), 'utf8').includes('ghp_shouldnotappear'), 'the fixture holds the value');
  assert.ok(!out.includes('ghp_shouldnotappear'), out);
  assert.ok(!out.includes('echo hi'), out);
  assert.ok(!out.includes('github-get_file_contents'), 'nested MCP values stay out');
});

test('digest: matches by cwd and repository, skips others', () => {
  const repo = makeRepo();
  git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');
  const start = (t) => ({ type: 'session.start', data: { sessionId: 'x', startTime: t, context: {} }, id: 'e1', timestamp: t, parentId: null });
  const msg = (text) => ({ type: 'user.message', data: { content: text }, id: 'e2', timestamp: '2026-01-01T00:00:00Z', parentId: 'e1' });
  const root = copilotRoot([
    { id: 'by-cwd', workspace: [`cwd: ${repo}/sub`], events: [start('2026-02-01T00:00:00.000Z'), msg('one')] },
    { id: 'by-repo', workspace: ['cwd: /elsewhere', 'repository: acme/widget'], events: [start('2026-03-01T00:00:00.000Z'), msg('two')] },
    { id: 'no-start', workspace: [`cwd: ${repo}`, 'created_at: 2026-01-15T00:00:00.000Z'], events: [msg('three')] },
    { id: 'sibling', workspace: [`cwd: ${repo}bar`], events: [start('2026-04-01T00:00:00.000Z')] },
    { id: 'other-repo', workspace: ['cwd: /elsewhere', 'repository: acme/other'], events: [start('2026-04-01T00:00:00.000Z')] },
  ]);
  const all = digest(repo, { sessionsRoot: root });
  assert.deepEqual(all.map((d) => d.id), ['by-repo', 'by-cwd', 'no-start'], 'newest first');
  assert.equal(all[2].started, '2026-01-15T00:00:00.000Z', 'falls back to created_at');
  assert.deepEqual(digest(repo, { sessionsRoot: root, limit: 1 }).map((d) => d.id), ['by-repo']);
  assert.equal(signals(repo, { sessionsRoot: root }).sessions, 3, 'digest and signals agree');
  assert.deepEqual(digest(repo, NO_SESSIONS), []);
});

test('digest CLI: summary lines, --json, --limit and bad arguments', () => {
  const repo = makeRepo();
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-home-')));
  cpSync(fixtureFor(repo), join(home, '.copilot', 'session-state'), { recursive: true });
  const env = { HOME: home };
  const h = run(repo, ['digest'], undefined, env);
  assert.deepEqual([h.stdout, h.stderr, h.code], ['fixture 2026-03-04T10:00:00.000Z 2 user msgs, 3 tools, skills: brainstorming\n', '', 0]);
  const j = run(repo, ['digest', '--json', '--limit', '5'], undefined, env);
  assert.equal(j.code, 0, j.stderr);
  assert.deepEqual(JSON.parse(j.stdout), digest(repo, { sessionsRoot: join(home, '.copilot', 'session-state') }));
  assert.ok(!j.stdout.includes('SECRET_TOKEN_abc123'));
  for (const args of [['--limit', '0'], ['--limit'], ['--limit', 'x'], ['--yaml']]) {
    const bad = run(repo, ['digest', ...args], undefined, env);
    assert.equal(bad.code, 2, args.join(' '));
    assert.match(bad.stderr, /^foundry: /);
  }
});

// ---- garden-range ----

function commitN(repo, n) {
  for (let i = 0; i < n; i++) {
    write(repo, 'g.txt', `${i}\n`);
    git(repo, 'add', 'g.txt');
    git(repo, 'commit', '-q', '-m', `g${i}`);
  }
}

test('garden-range: null last means last 50; --mark records HEAD', () => {
  const repo = withState();
  commitN(repo, 54);
  const head = git(repo, 'rev-parse', 'HEAD');
  const back50 = git(repo, 'rev-parse', 'HEAD~50');
  assert.deepEqual(gardenRange(repo), { from: back50, to: head, commits: 50 });
  const r = run(repo, ['garden-range']);
  assert.deepEqual([r.stdout, r.stderr, r.code], [`garden-range: ${back50}..${head} (50 commits)\n`, '', 0]);
  assert.deepEqual(JSON.parse(run(repo, ['garden-range', '--json']).stdout), { from: back50, to: head, commits: 50 });
  assert.equal(readState(repo).garden_last, null, 'reading writes nothing');

  const m = run(repo, ['garden-range', '--mark']);
  assert.equal(m.code, 0, m.stderr);
  assert.equal(m.stdout, `garden-range: ${back50}..${head} (50 commits)\ngarden_last: ${head}\n`);
  assert.deepEqual(readState(repo), { ...STATE, garden_last: head });
  assert.deepEqual(gardenRange(repo), { from: head, to: head, commits: 0 });
  commitN(repo, 2);
  assert.deepEqual(gardenRange(repo), { from: head, to: git(repo, 'rev-parse', 'HEAD'), commits: 2 });
});

test('garden-range: fewer than 50 commits starts at the root; errors', () => {
  const repo = withState();
  commitN(repo, 3);
  const root = git(repo, 'rev-list', '--max-parents=0', 'HEAD');
  assert.deepEqual(gardenRange(repo), { from: root, to: git(repo, 'rev-parse', 'HEAD'), commits: 3 });
  const noState = makeRepo();
  assert.equal(run(noState, ['garden-range']).code, 0, 'reading works without a state file');
  const mark = run(noState, ['garden-range', '--mark']);
  assert.deepEqual([mark.stderr, mark.code], ['foundry: no .agents/foundry.json\n', 1]);
  const gone = withState({ ...STATE, garden_last: '1234567890123456789012345678901234567890' });
  const g = run(gone, ['garden-range']);
  assert.equal(g.code, 1);
  assert.match(g.stderr, /^foundry: garden_last 1234567 is not in this history/);
  const bad = run(repo, ['garden-range', '--x']);
  assert.deepEqual([bad.stderr, bad.code], ['foundry: unknown argument --x\n', 2]);
});

// ---- hook, SKILL.md and packaging ----

const HOOK_LINE = /^foundry: \d+ missing for product \(.+\), \d+ interview\(s\) queued; run foundry to see them\.\n$/;
const ROOT = join(dirname(FOUNDRY), '..', '..', '..');
const SKILL = join(dirname(FOUNDRY), '..', 'SKILL.md');
const PRODUCT_DOCS = ['AGENTS.md', 'PRODUCT.md', 'docs/decisions/index.md', 'GLOSSARY.md', 'ARCHITECTURE.md', '.agents/code-map.md', 'CONSTRAINTS.md'];
const hookRepo = (state, files = []) => makeRepo({
  '.agents/foundry.json': JSON.stringify({ ...STATE, ...state }, null, 2) + '\n',
  ...Object.fromEntries(files.map((f) => [f, 'x\n'])),
});

test('hook: silent without foundry.json', () => {
  const r = run(makeRepo(), ['hook']);
  assert.deepEqual([r.stdout, r.stderr, r.code], ['', '', 0]);
});

test('hook: silent when complete', () => {
  const r = run(hookRepo({ stage: 'explore', queue: [{ interview: 'design', when: 'later', done: true }] }, ['AGENTS.md']), ['hook']);
  assert.deepEqual([r.stdout, r.stderr, r.code], ['', '', 0]);
  const product = run(hookRepo({ stage: 'product' }, PRODUCT_DOCS), ['hook']);
  assert.deepEqual([product.stdout, product.code], ['', 0]);
});

test('hook: one line when product files missing', () => {
  const queue = [
    { interview: 'design', when: 'before the first screen', done: false },
    { interview: 'threat', when: 'on entering live', provider: 'shannon', done: false },
    { interview: 'old', when: 'x', done: true },
  ];
  const r = run(hookRepo({ stage: 'product', queue }, ['AGENTS.md', 'GLOSSARY.md']), ['hook']);
  assert.match(r.stdout, HOOK_LINE);
  assert.equal(r.stdout, 'foundry: 5 missing for product (PRODUCT.md, docs/decisions/index.md), 2 interview(s) queued; run foundry to see them.\n');
  assert.deepEqual([r.stderr, r.code], ['', 0]);
});

test('hook: one missing names it alone; DESIGN.md counts only when the state has UI', () => {
  const docs = PRODUCT_DOCS.filter((f) => f !== 'CONSTRAINTS.md');
  const one = run(hookRepo({ stage: 'product' }, docs), ['hook']);
  assert.equal(one.stdout, 'foundry: 1 missing for product (CONSTRAINTS.md), 0 interview(s) queued; run foundry to see them.\n');
  const ui = run(hookRepo({ stage: 'product', has_ui: true }, PRODUCT_DOCS), ['hook']);
  assert.equal(ui.stdout, 'foundry: 2 missing for product (DESIGN.md, docs/ui/screens.md), 0 interview(s) queued; run foundry to see them.\n');
  const map = run(hookRepo({ stage: 'product', has_ui: true }, [...PRODUCT_DOCS, 'DESIGN.md']), ['hook']);
  assert.equal(map.stdout, 'foundry: 1 missing for product (docs/ui/screens.md), 0 interview(s) queued; run foundry to see them.\n');
});

test('hook: nothing missing but an open interview prints (none)', () => {
  const r = run(hookRepo({ stage: 'product', queue: [{ interview: 'design', when: 'x', done: false }] }, PRODUCT_DOCS), ['hook']);
  assert.match(r.stdout, HOOK_LINE);
  assert.equal(r.stdout, 'foundry: 0 missing for product (none), 1 interview(s) queued; run foundry to see them.\n');
});

test('hook: live counts docs/runbooks/ only as a directory', () => {
  const repo = hookRepo({ stage: 'live' }, [...PRODUCT_DOCS, 'docs/threat-model.md', 'docs/runbooks']);
  assert.equal(run(repo, ['hook']).stdout, 'foundry: 1 missing for live (docs/runbooks/), 0 interview(s) queued; run foundry to see them.\n');
});

test('hook: any error exits 0 and prints nothing', () => {
  const corrupt = makeRepo({ '.agents/foundry.json': '{ not json' });
  for (const state of [null, { stage: 'nope' }, { stage: 'product', queue: 'x' }]) {
    const repo = state ? hookRepo(state) : corrupt;
    const r = run(repo, ['hook']);
    assert.deepEqual([r.stdout, r.stderr, r.code], ['', '', 0], JSON.stringify(state));
  }
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'foundry-test-')));
  write(bare, '.agents/foundry.json', '[]');
  const r = spawnSync(process.execPath, [FOUNDRY, 'hook'], { cwd: bare, encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  const nogit = { stdout: r.stdout, stderr: r.stderr, code: r.status };
  assert.deepEqual([nogit.stdout, nogit.stderr, nogit.code], ['', '', 0]);
});

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter');
  const fm = {};
  let parent = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\s*)([\w.-]+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[3].replace(/^"(.*)"$/, '$1');
    if (kv[1]) fm[`${parent}.${kv[2]}`] = value;
    else { parent = kv[2]; fm[kv[2]] = value; }
  }
  return fm;
}

test('skill: description ≤ 300 chars and names start/audit/ready', () => {
  const fm = frontmatter(readFileSync(SKILL, 'utf8'));
  assert.equal(fm.name, 'foundry');
  assert.equal(fm.license, 'MIT');
  assert.equal(fm['metadata.version'], '1.0.0');
  assert.ok(fm.description.length <= 300, `description has ${fm.description.length} chars`);
  for (const re of [/project/, /audit/, /ready/]) assert.match(fm.description, re);
  assert.match(fm.description, /feature|bug/, 'says what skips it');
});

test('skill: SKILL.md under 80 lines, every link resolves', () => {
  const md = readFileSync(SKILL, 'utf8');
  assert.ok(md.split('\n').length < 80, `${md.split('\n').length} lines`);
  const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((t) => !/^(https?:|mailto:|#)/.test(t));
  for (const t of links) assert.ok(existsSync(join(dirname(SKILL), t.split('#')[0])), t);
  for (const f of [...COMMAND_REFS, ...KNOWLEDGE_REFS]) assert.ok(links.includes(`reference/${f}`), `links reference/${f}`);
  const rows = md.split('\n').filter((l) => /^\| .*\[reference\/(routing|init|audit|grow|providers-cmd|check|garden|tune)\.md\]/.test(l));
  assert.equal(rows.length, 8);
  for (const m of md.matchAll(/node <skill dir>\/scripts\/foundry\.mjs(?: +([^\s`]+))?/g)) assert.ok(foundry.COMMANDS.includes(m[1]), m[1]);
  prose.split('\n').forEach((line, i) => assert.doesNotMatch(line, /[\u2014\u2013]| -- /, `SKILL.md:${i + 1}`));
});

test('hooks.json is valid JSON and keeps the four existing strategic-programming hooks', () => {
  const { hooks } = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const sp = (verb) => `node "\${CLAUDE_PLUGIN_ROOT}/skills/strategic-programming/scripts/sp.mjs" ${verb}`;
  assert.deepEqual(hooks.UserPromptSubmit, [{ hooks: [{ type: 'command', command: sp('turn'), timeout: 10 }] }]);
  assert.deepEqual(hooks.PreToolUse, [{ matcher: 'ask_user', hooks: [{ type: 'command', command: sp('ask'), timeout: 30 }] }]);
  assert.deepEqual(hooks.PostToolUse, [{ matcher: 'ask_user', hooks: [{ type: 'command', command: sp('asked'), timeout: 10 }] }]);
  assert.deepEqual(hooks.Stop, [{ hooks: [{ type: 'command', command: sp('hook'), timeout: 30 }] }]);
  assert.deepEqual(hooks.SessionStart, [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/skills/foundry/scripts/foundry.mjs" hook', timeout: 10 }] }]);
});

test('packaging: README and plugin descriptions name all three skills', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /^\| \[`foundry`\]\(skills\/foundry\/SKILL\.md\) \| /m);
  assert.match(readme, /^## foundry$/m);
  for (const f of ['plugin.json', 'marketplace.json']) {
    const json = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', f), 'utf8'));
    const desc = f === 'plugin.json' ? json.description : json.plugins[0].description;
    for (const name of ['no-slop', 'strategic-programming', 'foundry']) assert.ok(desc.includes(name), `${f}: ${name}`);
  }
});
