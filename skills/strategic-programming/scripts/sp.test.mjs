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

function makeWorkspace(workspaces) {
  const pkg = (name, deps = {}) => JSON.stringify({ name, version: '1.0.0', ...deps }) + '\n';
  return makeRepo({
    'package.json': JSON.stringify({ name: 'root', private: true, workspaces }) + '\n',
    'packages/utils/package.json': pkg('utils'),
    'packages/utils/index.ts': lines(3),
    'packages/solo/package.json': pkg('solo'),
    'packages/solo/index.ts': lines(3),
    'apps/a/package.json': pkg('a', { dependencies: { utils: '*', solo: '*' } }),
    'apps/a/index.ts': lines(3),
    'apps/b/package.json': pkg('b', { devDependencies: { utils: '*' } }),
    'apps/b/index.ts': lines(3),
  });
}

test('a change in a package two projects depend on needs the reviewer', () => {
  for (const workspaces of [['packages/*', 'apps/*'], { packages: ['packages/*', 'apps/*'] }]) {
    const repo = makeWorkspace(workspaces);
    run(repo, ['start']);
    write(repo, 'packages/utils/index.ts', lines(4));
    const a = audit(repo);
    assert.deepEqual(a.shared, ['utils'], JSON.stringify(workspaces));
    assert.equal(a.size, 'full+reviewer');
    const lines_ = run(repo, ['audit']).stdout.split('\n');
    assert.deepEqual(lines_.slice(1, 3), ['size: full+reviewer', 'shared: utils']);
  }
});

test('a package one project depends on is not shared', () => {
  const repo = makeWorkspace(['packages/*', 'apps/*']);
  run(repo, ['start']);
  write(repo, 'packages/solo/index.ts', lines(4));
  const a = audit(repo);
  assert.deepEqual(a.shared, []);
  assert.equal(a.size, 'small');
  assert.equal(run(repo, ['audit']).stdout.split('\n')[2], 'shared: none');
});
