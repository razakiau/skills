import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CODE_EXT = new Set('ts tsx js jsx mjs cjs py go rs java kt swift rb php cs vue svelte'.split(' '));
const TEST_RE = [/(^|\/)(__tests__|tests?|e2e|spec)\//, /\.(test|spec)\.[a-z]+$/, /(^|\/)test_[^/]+\.py$/];

function git(args, opts = {}) {
  return execFileSync('git', ['--no-optional-locks', ...args], {
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
  return { top, state, anchor: `refs/strategic-programming/${hash}` };
}

// Hashes the whole working tree (untracked included) into a tree, through a private copy of the index.
function snapshotTree({ top, state }) {
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

function emptyTree(top) {
  return git(['hash-object', '-t', 'tree', '--stdin'], { cwd: top, input: '', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

function start() {
  const paths = repoPaths();
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

function readDiff(top, base, tree) {
  const range = [base, tree];
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
    i += inline === '' ? 3 : 1;
    if (added === '-' || !isCode(path)) continue;
    files.push({ path, added: +added, removed: +removed, test: isTest(path), status: status.get(path) });
  }
  const gen = generated(top, files.map((f) => f.path));
  return files.filter((f) => !gen.has(f.path));
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
    `base: ${r.base.kind} ${r.base.ref.slice(0, 12)}${r.base.note ? ` (${r.base.note})` : ''}`,
    `size: ${r.size}`,
    `code: +${r.code.added} -${r.code.removed}  tests: +${r.tests.added} -${r.tests.removed}`,
    ...r.files.map((f) => `${f.status} ${f.path} +${f.added} -${f.removed}`),
    `new files: ${r.newFiles.length ? r.newFiles.join(', ') : 'none'}`,
  ].join('\n') + '\n';
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'start') start();
  else if (cmd === 'audit') audit(rest);
  else {
    process.stderr.write('usage: node sp.mjs start | audit [--json] [--dup]\n');
    process.exitCode = 2;
  }
} catch (err) {
  process.stderr.write(`sp: ${String(err.message).split('\n')[0]}\n`);
  process.exitCode = 0;
}
