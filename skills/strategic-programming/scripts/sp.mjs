import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return git(['hash-object', '-w', '-t', 'tree', '--stdin'], { cwd: top, input: '', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
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
  const file = join(state, `graph-${head}.json`);
  const failed = `${file}.failed`;
  if (existsSync(failed)) return null;
  if (!existsSync(file)) {
    for (const f of readdirSync(state)) if (f.startsWith('graph-')) rmSync(join(state, f), { force: true });
    try {
      execFileSync(bin, ['graph', `--file=${file}`], { cwd: top, stdio: 'ignore', timeout });
    } catch { /* checked below */ }
  }
  const graph = readJson(file)?.graph;
  if (!graph?.nodes || !graph?.dependencies) {
    rmSync(file, { force: true });
    writeFileSync(failed, '');
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

function audit(args) {
  const paths = repoPaths();
  const base = findBase(paths);
  const tree = snapshotTree(paths);
  const files = readDiff(paths.top, base.ref, tree);
  const sum = (fs) => fs.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
  const code = files.filter((f) => !f.test);
  const newFiles = code.filter((f) => f.status === 'A').map((f) => f.path);
  const owners = sharedOwners(paths, code.map((f) => f.path));
  const shared = [...new Set((owners ?? []).filter(Boolean))].sort();
  const exports = measured('exports', () => readExports(paths.top, base.ref, tree, files), null);
  const codeMap = measured('code map', () => readCodeMap(paths.top), null);
  // Why unlisted home is null, for the text report: no map, no Path column, or no graph.
  const unmeasured = codeMap === null ? 'code map: none' : codeMap === 'no-path' ? 'code map: no Path column'
    : owners === null ? 'unlisted home: not measured (graph)' : null;
  const unlistedHome = unmeasured ? null : code
    .filter((f, i) => f.status === 'A' && owners[i] && !codeMap.some((e) => mapCovers(e, f.path)))
    .map((f) => f.path);
  const small = code.length <= 1 && newFiles.length === 0 && exports?.length === 0;
  const report = {
    base,
    size: shared.length ? 'full+reviewer' : small ? 'small' : 'full',
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
  process.stdout.write(args.includes('--json') ? JSON.stringify(report) + '\n' : formatText(report, unmeasured));
}

function formatText(r, unmeasured) {
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
    `shared: ${r.shared.length ? r.shared.join(', ') : 'none'}`,
    `code: +${r.code.added} -${r.code.removed}  tests: +${r.tests.added} -${r.tests.removed}`,
    ...r.files.map((f) => `${f.status} ${f.path} +${f.added} -${f.removed}`),
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
  else {
    process.stderr.write('usage: node sp.mjs start | audit [--json] [--dup]\n');
    process.exitCode = 2;
  }
} catch (err) {
  process.stderr.write(`sp: ${String(err.message).split('\n')[0]}\n`);
  process.exitCode = 0;
}
