import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SP = join(dirname(fileURLToPath(import.meta.url)), 'sp.mjs');

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

const lines = (n, tag = 'l') => Array.from({ length: n }, (_, i) => `${tag}${i}\n`).join('');

function makeRepo(files = { 'a.ts': lines(5) }) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sp-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'user.email', 't@example.com');
  for (const [p, c] of Object.entries(files)) write(repo, p, c);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function run(repo, args, stdin) {
  const r = spawnSync('node', [SP, ...args], { cwd: repo, input: stdin, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status };
}

function audit(repo) {
  const r = run(repo, ['audit', '--json']);
  assert.equal(r.code, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('start then audit counts only the change since start', () => {
  const repo = makeRepo();
  write(repo, 'pre.ts', lines(9));
  const s = run(repo, ['start']);
  assert.equal(s.code, 0, s.stderr);
  assert.match(s.stdout, /^start: [0-9a-f]{12} \(1 uncommitted files\)\n$/);
  assert.equal(git(repo, 'status', '--porcelain'), '?? pre.ts', 'start writes nothing in the working tree');

  write(repo, 'a.ts', 'new0\nl1\nl2\nl3\nl4\nnew5\nnew6\n');
  write(repo, 'a.test.ts', lines(4, 't'));
  const a = audit(repo);
  assert.equal(a.base.kind, 'start');
  assert.deepEqual(a.code, { added: 3, removed: 1 });
  assert.deepEqual(a.tests, { added: 4, removed: 0 });
  assert.deepEqual(a.newFiles, []);
  assert.deepEqual(a.files.find((f) => f.path === 'a.test.ts'), {
    path: 'a.test.ts', added: 4, removed: 0, test: true, status: 'A',
  });
  assert.equal(a.size, 'small');
  assert.deepEqual(
    [a.exports, a.shared, a.testBeside, a.unlistedHome, a.duplicates],
    [[], [], [], null, null],
  );
});

test('audit without start uses the merge base and says so', () => {
  const repo = makeRepo();
  write(repo, 'a.ts', lines(6));
  const r = run(repo, ['audit']);
  assert.equal(r.code, 0, r.stderr);
  const [first, ...rest] = r.stdout.split('\n');
  assert.match(first, /^base: merge-base [0-9a-f]{12}$/);
  assert.ok(rest.includes('M a.ts +1 -0'), r.stdout);
  assert.deepEqual(audit(repo).base, { ref: git(repo, 'rev-parse', 'HEAD'), kind: 'merge-base' });
});

test('with no default branch the base is the root commit', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sp-test-')));
  git(repo, 'init', '-q', '-b', 'trunk');
  write(repo, 'a.ts', lines(2));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  write(repo, 'a.ts', lines(3));
  assert.deepEqual(audit(repo).base, { ref: git(repo, 'rev-parse', 'HEAD'), kind: 'root' });
});

test('a branch made from origin/main with no local main audits from origin/main', () => {
  const up = makeRepo();
  write(up, 'old.ts', lines(4));
  git(up, 'add', '-A');
  git(up, 'commit', '-q', '-m', 'main 2');
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'sp-bare-')));
  git(bare, 'clone', '-q', '--bare', up, '.');
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sp-clone-')));
  git(repo, 'clone', '-q', bare, '.');
  git(repo, 'switch', '-q', '-c', 'feat', 'origin/main');
  git(repo, 'branch', '-q', '-D', 'main');
  write(repo, 'b.ts', lines(2));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'feat');
  const expected = { ref: git(repo, 'rev-parse', 'origin/main'), kind: 'merge-base' };
  for (const unsetHead of [false, true]) {
    if (unsetHead) git(repo, 'remote', 'set-head', 'origin', '-d');
    const a = audit(repo);
    assert.deepEqual(a.base, expected, `origin/HEAD unset: ${unsetHead}`);
    assert.deepEqual(a.files.map((f) => f.path), ['b.ts']);
  }
});

test('detached HEAD on a branch audits from the merge base with main', () => {
  const repo = makeRepo();
  write(repo, 'z.md', 'second\n');
  git(repo, 'add', 'z.md');
  git(repo, 'commit', '-q', '-m', 'main 2');
  const mainSha = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', '-c', 'feat');
  write(repo, 'b.ts', lines(2));
  git(repo, 'add', 'b.ts');
  git(repo, 'commit', '-q', '-m', 'feat');
  git(repo, 'switch', '-q', '--detach');
  const a = audit(repo);
  assert.deepEqual(a.base, { ref: mainSha, kind: 'merge-base' });
  assert.deepEqual(a.newFiles, ['b.ts']);
});

test('an empty repo audits from the empty tree as root', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sp-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'a.ts', lines(2));
  const a = audit(repo);
  assert.equal(a.base.kind, 'root');
  assert.deepEqual(a.newFiles, ['a.ts']);
});

test('audit outside a git repository says so and exits 0', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sp-norepo-')));
  const r = run(dir, ['audit']);
  assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', 'sp: not a git repository\n']);
});

test('lockfiles, json and binary files are not counted', () => {
  const repo = makeRepo({ 'a.ts': lines(5), 'package-lock.json': '{}\n', 'x.json': '{}\n' });
  run(repo, ['start']);
  write(repo, 'package-lock.json', '{"a":1}\n');
  write(repo, 'x.json', '{"b":2}\n');
  writeFileSync(join(repo, 'img.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
  const a = audit(repo);
  assert.deepEqual(a.files, []);
  assert.deepEqual(a.code, { added: 0, removed: 0 });
  assert.equal(a.size, 'small');
});

test('a rename is not a new file', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  git(repo, 'mv', 'a.ts', 'b.ts');
  const a = audit(repo);
  assert.deepEqual(a.newFiles, []);
  assert.deepEqual(a.files, [{ path: 'b.ts', added: 0, removed: 0, test: false, status: 'R' }]);
  assert.equal(a.size, 'small');
});

test('paths with spaces and accents are read whole', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  write(repo, 'src/é dir/a b.ts', lines(3));
  const a = audit(repo);
  assert.deepEqual(a.newFiles, ['src/é dir/a b.ts']);
  assert.deepEqual(a.code, { added: 3, removed: 0 });
  assert.ok(run(repo, ['audit']).stdout.includes('A src/é dir/a b.ts +3 -0\n'));
});

test('the start point survives gc, and a lost one falls back to the merge base', () => {
  const repo = makeRepo();
  write(repo, 'pre.ts', lines(9));
  run(repo, ['start']);
  git(repo, 'gc', '-q', '--prune=now');
  assert.equal(audit(repo).base.kind, 'start');

  for (const ref of git(repo, 'for-each-ref', '--format=%(refname)', 'refs/strategic-programming/').split('\n')) {
    if (ref) git(repo, 'update-ref', '-d', ref);
  }
  git(repo, 'gc', '-q', '--prune=now');
  const r = run(repo, ['audit']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout.split('\n')[0], /^base: merge-base [0-9a-f]{12} \(start point missing\)$/);
  assert.equal(audit(repo).base.kind, 'merge-base');
});

test('an error is reported on stderr and audit still exits 0', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  const hash = createHash('sha1').update(repo).digest('hex').slice(0, 12);
  writeFileSync(join(repo, '.git', 'strategic-programming', hash, 'start.json'), '{not json');
  const r = run(repo, ['audit']);
  assert.equal(r.code, 0);
  assert.match(r.stderr, /^sp: .+\n$/);
});

test('start and audit leave the real index alone and no private index behind', () => {
  const repo = makeRepo({ 'a.ts': lines(5), 'b.ts': lines(5) });
  write(repo, 'a.ts', lines(6));
  git(repo, 'add', 'a.ts');
  utimesSync(join(repo, 'b.ts'), 1e9, 1e9); // same content, new mtime: a status refresh would rewrite the index
  const index = join(repo, '.git', 'index');
  const before = [git(repo, 'diff', '--cached', '--name-only'), readFileSync(index).toString('hex')];
  run(repo, ['start']);
  utimesSync(join(repo, 'b.ts'), 2e9, 2e9);
  audit(repo);
  assert.deepEqual([git(repo, 'diff', '--cached', '--name-only'), readFileSync(index).toString('hex')], before);
  const hash = createHash('sha1').update(repo).digest('hex').slice(0, 12);
  assert.deepEqual(readdirSync(join(repo, '.git', 'strategic-programming', hash)), ['start.json']);
});

test('ignored and generated files are not counted', () => {
  const repo = makeRepo({ 'a.ts': lines(5), '.gitignore': 'out/\n', '.gitattributes': 'gen/*.ts linguist-generated\n' });
  run(repo, ['start']);
  write(repo, 'out/x.ts', lines(3));
  write(repo, 'gen/x.ts', lines(3));
  write(repo, '.pnp.cjs', lines(3));
  write(repo, '.pnp.loader.mjs', lines(3));
  write(repo, 'a.ts', lines(6));
  const a = audit(repo);
  assert.deepEqual(a.files.map((f) => f.path), ['a.ts']);
  assert.deepEqual(a.newFiles, []);
});

test('two code files or a new code file is full', () => {
  const two = makeRepo({ 'a.ts': lines(5), 'b.py': lines(5) });
  run(two, ['start']);
  write(two, 'a.ts', lines(6));
  write(two, 'b.py', lines(4));
  assert.equal(audit(two).size, 'full');

  const added = makeRepo();
  run(added, ['start']);
  write(added, 'c.go', lines(1));
  const a = audit(added);
  assert.deepEqual(a.newFiles, ['c.go']);
  assert.equal(a.size, 'full');
});

test('start in a repo with no commits, then audit reports', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sp-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  const s = run(repo, ['start']);
  assert.deepEqual([s.code, s.stderr], [0, '']);
  write(repo, 'a.ts', lines(2));
  const r = run(repo, ['audit']);
  assert.deepEqual([r.code, r.stderr], [0, '']);
  assert.match(r.stdout, /^base: start [0-9a-f]{12}\n/);
  assert.ok(r.stdout.includes('A a.ts +2 -0\n'), r.stdout);
});

function makeWorkspace(workspaces, extra = {}) {
  const pkg = (name, deps = {}) => JSON.stringify({ name, version: '1.0.0', ...deps }) + '\n';
  return makeRepo({
    'package.json': JSON.stringify({ name: 'root', private: true, ...(workspaces && { workspaces }) }) + '\n',
    'packages/utils/package.json': pkg('utils'),
    'packages/utils/index.ts': lines(3),
    'packages/utils-x/package.json': pkg('utils-x'),
    'packages/utils-x/index.ts': lines(3),
    'packages/solo/package.json': pkg('solo'),
    'packages/solo/index.ts': lines(3),
    'apps/a/package.json': pkg('a', { dependencies: { utils: '*', solo: '*' } }),
    'apps/a/index.ts': lines(3),
    'apps/b/package.json': pkg('b', { devDependencies: { utils: '*' } }),
    'apps/b/index.ts': lines(3),
    ...extra,
  });
}

test('a change in a package two projects depend on needs the reviewer', () => {
  const pnpm = { 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - \"apps/*\"\n" };
  for (const [workspaces, extra] of [[['packages/*', 'apps/*']], [{ packages: ['packages/*', 'apps/*'] }], [null, pnpm]]) {
    const repo = makeWorkspace(workspaces, extra);
    run(repo, ['start']);
    write(repo, 'packages/utils/index.ts', lines(4));
    const a = audit(repo);
    assert.deepEqual(a.shared, ['utils'], JSON.stringify(workspaces ?? extra));
    assert.equal(a.size, 'full+reviewer');
    assert.ok(run(repo, ['audit']).stdout.includes('\nsize: full+reviewer\nshared: utils\n'));
  }
});

test('a package one project depends on is not shared', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/solo/index.ts', lines(4));
  const a = audit(repo);
  assert.deepEqual(a.shared, []);
  assert.equal(a.size, 'small');
  assert.ok(run(repo, ['audit']).stdout.includes('\nshared: none\n'));
});

test('a file belongs to its own package, not one whose name it starts with', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/utils-x/index.ts', lines(4));
  assert.deepEqual(audit(repo).shared, []);
});

test('an excluded workspace is not a project', () => {
  const repo = makeWorkspace(['packages/*', '!packages/utils', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/utils/index.ts', lines(4));
  assert.deepEqual(audit(repo).shared, []);
});

test('a workspace list it cannot read still gives the report', () => {
  const repo = makeWorkspace([42, 'packages/*', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/utils/index.ts', lines(4));
  const r = run(repo, ['audit']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^base: start /);
  assert.ok(r.stdout.includes('\nshared: none\n'), r.stdout);
});

test('new exports are listed, moved ones are not', () => {
  const repo = makeRepo({ 'a.ts': lines(5), 'm.ts': 'export function moved() {}\n', 'b.py': lines(2) });
  run(repo, ['start']);
  write(repo, 'a.ts', lines(5) + 'export function toRange() {}\nexport { a };\n');
  const a = audit(repo);
  assert.deepEqual(a.exports, [{ path: 'a.ts', name: 'toRange' }, { path: 'a.ts', name: 'a' }]);
  assert.ok(run(repo, ['audit']).stdout.includes('\nexports: toRange, a\n'));

  git(repo, 'checkout', '-q', '--', 'a.ts');
  git(repo, 'mv', 'm.ts', 'moved.ts');
  const m = audit(repo);
  assert.deepEqual(m.files.map((f) => [f.path, f.status]), [['moved.ts', 'R']]);
  assert.deepEqual(m.exports, []);
  assert.ok(run(repo, ['audit']).stdout.includes('\nexports: none\n'));

  write(repo, 'b.py', lines(3));
  assert.ok(run(repo, ['audit']).stdout.includes('\nexports: none; not measured (py)\n'));
  git(repo, 'reset', '-q', '--hard');
  write(repo, 'b.py', lines(3));
  assert.ok(run(repo, ['audit']).stdout.includes('\nexports: not measured (py)\n'));
});

test('exports are read from paths with spaces and accents', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  write(repo, 'src/é dir/a "b".ts', 'export class Range {}\nexport type { T as U } from "./t";\n');
  assert.deepEqual(audit(repo).exports, [
    { path: 'src/é dir/a "b".ts', name: 'Range' },
    { path: 'src/é dir/a "b".ts', name: 'U' },
  ]);
});

test('a new export makes a one-file change not small', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  write(repo, 'a.ts', lines(5) + 'export const x = 1;\nexport{y,\n  z as w}\n');
  const a = audit(repo);
  assert.deepEqual(a.exports, [{ path: 'a.ts', name: 'x' }, { path: 'a.ts', name: 'y' }, { path: 'a.ts', name: 'w' }]);
  assert.equal(a.size, 'full');
});

test('a new test file beside an existing one is flagged', () => {
  const repo = makeRepo({ 'src/a.ts': lines(3), 'src/a.test.ts': lines(3), 'lib/c.ts': lines(3) });
  run(repo, ['start']);
  write(repo, 'src/b.test.ts', lines(2));
  write(repo, 'lib/c.test.ts', lines(2));
  const a = audit(repo);
  assert.deepEqual(a.testBeside, [{ added: 'src/b.test.ts', existing: 'src/a.test.ts' }]);
  assert.ok(run(repo, ['audit']).stdout.includes('\ntests beside: src/b.test.ts (next to src/a.test.ts)\n'));

  const none = makeRepo();
  run(none, ['start']);
  write(none, 'a.ts', lines(6));
  assert.deepEqual(audit(none).testBeside, []);
  assert.ok(run(none, ['audit']).stdout.includes('\ntests beside: none\n'));
});

const CODE_MAP = [
  '# Code map', '',
  '| Concept | Home |', '|---|---|', '| dates | utils |', '',
  '| Concept | Home | Path | Precedent |', '|---|---|---|---|',
  '| date ranges | utils | `packages/utils/src/lib/js`, `docs/x` | toRange |',
  '| empty | none | | |', '',
].join('\n');

test('a new file in a shared package outside the map is flagged', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*'], { '.agents/code-map.md': CODE_MAP });
  run(repo, ['start']);
  write(repo, 'packages/utils/src/other/x.ts', lines(2));
  write(repo, 'packages/utils/src/lib/js/y.ts', lines(2));
  write(repo, 'apps/a/src/z.ts', lines(2));
  const a = audit(repo);
  assert.deepEqual(a.unlistedHome, ['packages/utils/src/other/x.ts']);
  assert.ok(run(repo, ['audit']).stdout.includes('\nunlisted home: packages/utils/src/other/x.ts\n'));
});

test('no code map means unlisted home is not measured', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/utils/src/other/x.ts', lines(2));
  assert.equal(audit(repo).unlistedHome, null);
  const text = run(repo, ['audit']).stdout;
  assert.ok(text.includes('\ncode map: none\n'), text);
  assert.ok(!text.includes('unlisted home'), text);
});

test('an edited export is not new', () => {
  const repo = makeRepo({ 'a.ts': 'export function foo(a) {}\n' + lines(3) });
  run(repo, ['start']);
  write(repo, 'a.ts', 'export function foo(a, b) {}\n' + lines(3));
  const a = audit(repo);
  assert.deepEqual(a.exports, []);
  assert.equal(a.size, 'small');
});

test('an export moved into another existing file is not new', () => {
  const repo = makeRepo({ 'a.ts': lines(3) + 'export function f() {}\n', 'b.ts': lines(3) });
  run(repo, ['start']);
  write(repo, 'a.ts', lines(3));
  write(repo, 'b.ts', lines(3) + 'export function f() {}\n');
  assert.deepEqual(audit(repo).exports, []);
});

test('an added line starting with ++ is not a file header', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  write(repo, 'a.ts', lines(5) + '++ x\nexport const later = 1;\n');
  assert.deepEqual(audit(repo).exports, [{ path: 'a.ts', name: 'later' }]);
});

test('export forms: declare, const enum, export * as, and no keyword taken for a name', () => {
  const repo = makeRepo();
  run(repo, ['start']);
  write(repo, 'a.ts', lines(5) + [
    'export default class extends Base {}',
    'export const enum Dir {}',
    "export * as ns from './x';",
    'export declare function d(): void;',
    'export class C implements I {}',
  ].join('\n') + '\n');
  assert.deepEqual(audit(repo).exports.map((e) => e.name), ['Dir', 'ns', 'd', 'C']);
});

// Workspace where packages/lib is shared too (apps a and b both depend on it).
function makeLibWorkspace(map) {
  const pkg = (name, deps = {}) => JSON.stringify({ name, version: '1.0.0', ...deps }) + '\n';
  return makeWorkspace(['packages/*', 'apps/*'], {
    'packages/lib/package.json': pkg('lib'),
    'packages/lib/index.ts': lines(3),
    'apps/a/package.json': pkg('a', { dependencies: { utils: '*', solo: '*', lib: '*' } }),
    'apps/b/package.json': pkg('b', { devDependencies: { utils: '*', lib: '*' } }),
    '.agents/code-map.md': map,
  });
}

test('map paths: * stays in a segment, **/ matches zero or more directories, a leading / is ignored', () => {
  const repo = makeLibWorkspace('| Concept | Path |\n|---|---|\n| src | `packages/*/src` |\n| libs | `/packages/**/lib` |\n');
  run(repo, ['start']);
  for (const p of ['packages/utils/src/x.ts', 'packages/utils/lib/x.ts', 'packages/lib/x.ts', 'packages/utils/other/x.ts']) {
    write(repo, p, lines(2));
  }
  assert.deepEqual(audit(repo).unlistedHome, ['packages/utils/other/x.ts']);
});

test('a map path covers its own directory, not one whose name it starts with', () => {
  const repo = makeLibWorkspace('| Concept | Path |\n|---|---|\n| js | packages/utils/src/lib/js |\n');
  run(repo, ['start']);
  write(repo, 'packages/utils/src/lib/js/y.ts', lines(2));
  write(repo, 'packages/utils/src/lib/jsx/y.ts', lines(2));
  assert.deepEqual(audit(repo).unlistedHome, ['packages/utils/src/lib/jsx/y.ts']);
});

test('a fenced example table is not the code map', () => {
  const map = [
    '# Code map', '', 'Example:', '', '```md',
    '| Concept | Path |', '|---|---|', '| x | packages/utils/src/other |',
    '```', '', '~~~',
    '| Concept | Path |', '|---|---|', '| y | packages/utils/src/other |',
    '~~~', '',
    '| Concept | path |', '| :- | -: |', '| dates | packages/utils/src/lib |', '',
  ].join('\n');
  const repo = makeWorkspace(['packages/*', 'apps/*'], { '.agents/code-map.md': map });
  run(repo, ['start']);
  write(repo, 'packages/utils/src/other/x.ts', lines(2));
  write(repo, 'packages/utils/src/lib/y.ts', lines(2));
  assert.deepEqual(audit(repo).unlistedHome, ['packages/utils/src/other/x.ts']);
});

test('a code map without a Path column says so', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*'], {
    '.agents/code-map.md': '| Concept | Home |\n|---|---|\n| dates | utils |\n',
  });
  run(repo, ['start']);
  write(repo, 'packages/utils/src/other/x.ts', lines(2));
  assert.equal(audit(repo).unlistedHome, null);
  const text = run(repo, ['audit']).stdout;
  assert.ok(text.includes('\ncode map: no Path column\n'), text);
  assert.ok(!text.includes('code map: none'), text);
});

test('a graph it cannot read leaves unlisted home not measured', () => {
  // 42 in the workspace list makes packageGraph throw (42.startsWith).
  const repo = makeWorkspace([42, 'packages/*', 'apps/*'], { '.agents/code-map.md': CODE_MAP });
  run(repo, ['start']);
  write(repo, 'packages/utils/src/other/x.ts', lines(2));
  assert.equal(audit(repo).unlistedHome, null);
  const r = run(repo, ['audit']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes('\nunlisted home: not measured (graph)\n'), r.stdout);
});

test('a modified file or a new test file in a shared package outside the map is not flagged', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*'], { '.agents/code-map.md': CODE_MAP });
  run(repo, ['start']);
  write(repo, 'packages/utils/index.ts', lines(4));
  write(repo, 'packages/utils/src/other/x.test.ts', lines(2));
  const a = audit(repo);
  assert.deepEqual(a.shared, ['utils']);
  assert.deepEqual(a.unlistedHome, []);
});
