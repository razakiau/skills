import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CODE_EXT = new Set('ts tsx js jsx mjs cjs py go rs java kt swift rb php cs vue svelte'.split(' '));
const TEST_RE = [/(^|\/)(__tests__|tests?|e2e|spec)\//, /\.(test|spec)\.[a-z]+$/, /(^|\/)test_[^/]+\.py$/];

function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28, ...opts,
  });
}

function tryGit(args, opts) {
  try { return git(args, opts).trim(); } catch { return null; }
}

function repoPaths() {
  const top = tryGit(['rev-parse', '--show-toplevel']);
  if (!top) {
    process.stderr.write('sp: not a git repository\n');
    process.exit(0);
  }
  const common = resolve(top, git(['rev-parse', '--git-common-dir'], { cwd: top }).trim());
  const hash = createHash('sha1').update(top).digest('hex').slice(0, 12);
  const state = join(common, 'strategic-programming', hash);
  mkdirSync(state, { recursive: true });
  return { top, state };
}

// Hashes the whole working tree (untracked included) into a tree, through a private copy of the index.
function snapshotTree({ top, state }) {
  const index = join(state, 'snapshot.index');
  const real = resolve(top, git(['rev-parse', '--git-path', 'index'], { cwd: top }).trim());
  rmSync(index, { force: true });
  if (existsSync(real)) copyFileSync(real, index);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  git(['add', '-A'], { cwd: top, env });
  const tree = git(['write-tree'], { cwd: top, env }).trim();
  rmSync(index, { force: true });
  return tree;
}

function emptyTree(top) {
  return git(['hash-object', '-t', 'tree', '--stdin'], { cwd: top, input: '', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

function start() {
  const paths = repoPaths();
  const { top, state } = paths;
  const head = tryGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: top }) ?? emptyTree(top);
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], { cwd: top }).split('\n').filter(Boolean).length;
  let stash = head;
  if (dirty) {
    const tree = snapshotTree(paths);
    const parent = head === emptyTree(top) ? [] : ['-p', head];
    stash = git(['commit-tree', tree, ...parent, '-m', 'strategic-programming start'], { cwd: top }).trim();
  }
  writeFileSync(join(state, 'start.json'), JSON.stringify({ head, stash, at: new Date().toISOString() }) + '\n');
  process.stdout.write(`start: ${head.slice(0, 12)} (${dirty} uncommitted files)\n`);
}

function defaultBranch(top) {
  const origin = tryGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: top });
  if (origin) return origin.replace(/^origin\//, '');
  for (const b of ['main', 'master']) {
    if (tryGit(['rev-parse', '--verify', '-q', `refs/heads/${b}`], { cwd: top })) return b;
  }
  return null;
}

function findBase({ top, state }) {
  const file = join(state, 'start.json');
  if (existsSync(file)) return { ref: JSON.parse(readFileSync(file, 'utf8')).stash, kind: 'start' };
  if (!tryGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: top })) return { ref: emptyTree(top), kind: 'root' };
  const branch = defaultBranch(top);
  const mb = branch && tryGit(['merge-base', 'HEAD', branch], { cwd: top });
  const ref = mb || git(['rev-list', '--max-parents=0', 'HEAD'], { cwd: top }).trim().split('\n').pop();
  const isRoot = !tryGit(['rev-parse', '--verify', '-q', `${ref}^`], { cwd: top });
  return { ref, kind: isRoot ? 'root' : 'merge-base' };
}

function isTest(path) {
  return TEST_RE.some((re) => re.test(path));
}

function isCode(path) {
  const m = /\.([^./]+)$/.exec(path);
  return Boolean(m && CODE_EXT.has(m[1]));
}

function readDiff(top, base, tree) {
  const range = [base, tree];
  const status = new Map();
  const ns = git(['diff', '-M', '-z', '--name-status', ...range], { cwd: top }).split('\0');
  for (let i = 0; i + 1 < ns.length;) {
    const code = ns[i][0];
    const path = 'RC'.includes(code) ? ns[i + 2] : ns[i + 1];
    status.set(path, code === 'R' ? 'R' : code === 'A' || code === 'C' ? 'A' : code === 'D' ? 'D' : 'M');
    i += 'RC'.includes(code) ? 3 : 2;
  }
  const files = [];
  const num = git(['diff', '-M', '-z', '--numstat', ...range], { cwd: top }).split('\0');
  for (let i = 0; i < num.length && num[i];) {
    const [added, removed, inline] = num[i].split('\t');
    const path = inline === '' ? num[i + 2] : inline;
    i += inline === '' ? 3 : 1;
    if (added === '-' || !isCode(path)) continue;
    files.push({ path, added: +added, removed: +removed, test: isTest(path), status: status.get(path) });
  }
  return files;
}

function audit(args) {
  const paths = repoPaths();
  const base = findBase(paths);
  const files = readDiff(paths.top, base.ref, snapshotTree(paths));
  const sum = (fs) => fs.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
  const code = files.filter((f) => !f.test);
  const newFiles = code.filter((f) => f.status === 'A').map((f) => f.path);
  const report = {
    base,
    size: code.length <= 1 && newFiles.length === 0 ? 'small' : 'full',
    code: sum(code),
    tests: sum(files.filter((f) => f.test)),
    files,
    newFiles,
    exports: [],
    shared: [],
    testBeside: [],
    unlistedHome: null,
    duplicates: null,
  };
  process.stdout.write(args.includes('--json') ? JSON.stringify(report) + '\n' : formatText(report));
}

function formatText(r) {
  return [
    `base: ${r.base.kind} ${r.base.ref.slice(0, 12)}`,
    `size: ${r.size}`,
    `code: +${r.code.added} -${r.code.removed}  tests: +${r.tests.added} -${r.tests.removed}`,
    ...r.files.map((f) => `${f.status} ${f.path} +${f.added} -${f.removed}`),
    `new files: ${r.newFiles.length ? r.newFiles.join(', ') : 'none'}`,
  ].join('\n') + '\n';
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'start') start();
else if (cmd === 'audit') audit(rest);
else {
  process.stderr.write('usage: node sp.mjs start | audit [--json] [--dup]\n');
  process.exitCode = 2;
}
