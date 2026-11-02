import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug, parseMap, setField, mapPath, readMap, MARKER, USAGE, UiCheckError } from './uicheck.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UICHECK = join(HERE, 'uicheck.mjs');
const TEMPLATE = join(HERE, '..', 'templates', 'screens.md');

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

function makeRepo(files = { 'README.md': 'demo\n' }) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'uicheck-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'user.email', 't@example.com');
  for (const [p, c] of Object.entries(files)) write(repo, p, c);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function run(repo, args, stdin, env) {
  const r = spawnSync('node', [UICHECK, ...args], { cwd: repo, input: stdin, encoding: 'utf8', env: { ...process.env, ...env } });
  return { stdout: r.stdout, stderr: r.stderr, code: r.status };
}

const MAP = [
  MARKER,
  '',
  'Screens of the demo app.',
  '',
  '## Home',
  'route: /',
  'file: src/home.html',
  'family: tab-root',
  'siblings: report',
  '',
  '## Report',
  'route: /report',
  'file: src/report.html',
  'family: tab-root',
  'siblings: home',
  '',
  '## Settings / Billing',
  'route: /settings/billing',
  'family: detail',
  'siblings: settings',
  '',
].join('\n');

const FOREIGN = '# Screens\n\nA list kept by another tool.\n\n## Home\nowner: someone else\n';
const REFUSED = 'ui-check: docs/ui/screens.md is not a ui-check screen map; set "Screen map: <path>" in AGENTS.md\n';

test('slug: names to file-safe slugs', () => {
  assert.equal(slug('Settings / Billing'), 'settings-billing');
  assert.equal(slug('  Home '), 'home');
});

test('map: parses entries and fields', () => {
  const text = [MARKER, '', '## Home', 'route: /', 'siblings: report', '', '## Report', 'route: /report', 'siblings: home', ''].join('\n');
  const map = parseMap(text);
  assert.equal(map.eol, '\n');
  assert.equal(map.screens.length, 2);
  assert.equal(map.screens[0].name, 'Home');
  assert.equal(map.screens[0].slug, 'home');
  assert.equal(map.screens[0].fields.route, '/');
  assert.equal(map.screens[0].line, 2);
  assert.equal(map.screens[1].line, 6);
  assert.equal(map.screens[1].fields.siblings, 'home');
});

test('map: the template parses to no screens and lists every field', () => {
  const text = readFileSync(TEMPLATE, 'utf8');
  assert.equal(text.split('\n')[0], MARKER);
  assert.deepEqual(parseMap(text).screens, []);
  for (const key of ['route', 'file', 'purpose', 'family', 'states', 'mockup', 'design-source', 'siblings', 'last-capture', 'approved']) {
    assert.match(text, new RegExp(`^${key}: `, 'm'), `template example lacks ${key}`);
  }
  assert.doesNotMatch(text, /[\u2013\u2014]/);
});

test('map: round trip keeps unknown lines and CRLF', () => {
  const text = [
    MARKER,
    '',
    'Hand-written notes about the demo app.',
    'They span two lines.',
    '',
    '## Home',
    'route: /',
    'owner-note: x',
    'A loose line of prose inside the entry.',
    'last-capture: 2026-01-01 sha256:000000000000 360-light',
    '',
    '',
    '## Report',
    'route: /report',
    '',
  ].join('\r\n');
  const out = setField(text, 'home', 'last-capture', '2026-11-02 sha256:abcdefabcdef 360-light 1440-dark');
  const before = text.split('\r\n');
  const after = out.split('\r\n');
  assert.equal(after.length, before.length);
  const diff = before.map((l, i) => (l === after[i] ? -1 : i)).filter((i) => i >= 0);
  assert.deepEqual(diff, [9]);
  assert.equal(after[9], 'last-capture: 2026-11-02 sha256:abcdefabcdef 360-light 1440-dark');
  assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/);

  // A missing key goes right after the entry's last field line: one line added, nothing else moves.
  const ins = setField(text, 'Report', 'approved', '2026-11-02 by owner').split('\r\n');
  assert.equal(ins.length, before.length + 1);
  assert.equal(ins[14], 'approved: 2026-11-02 by owner');
  assert.deepEqual([...ins.slice(0, 14), ...ins.slice(15)], before);
});

test('map: setField on unknown screen throws code 1', () => {
  assert.throws(() => setField(MAP, 'nowhere', 'route', '/x'), (err) => {
    assert.ok(err instanceof UiCheckError);
    assert.equal(err.code, 1);
    assert.equal(err.message, 'unknown screen nowhere');
    return true;
  });
  // A name that isn't a slug still matches by its slug.
  assert.match(setField(MAP, 'settings-billing', 'route', '/billing'), /^route: \/billing$/m);
});

test('map --family tab-root prints only those names', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': MAP });
  const r = run(repo, ['map', '--family', 'tab-root']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'Home\nReport\n');
});

test('map --sibling-of report prints the siblings of report', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': MAP });
  const r = run(repo, ['map', '--sibling-of', 'report']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'home\n');
});

test('map --json prints {screens:[...]}', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': MAP });
  const r = run(repo, ['map', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.screens.map((s) => s.slug), ['home', 'report', 'settings-billing']);
  assert.equal(out.screens[2].fields.family, 'detail');
});

test('map <screen> prints that entry; an unknown screen exits 1', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': MAP });
  const r = run(repo, ['map', 'Settings / Billing']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '## Settings / Billing\nroute: /settings/billing\nfamily: detail\nsiblings: settings\n');
  const bad = run(repo, ['map', 'nowhere']);
  assert.equal(bad.code, 1);
  assert.equal(bad.stderr, 'ui-check: unknown screen nowhere\n');
});

test('map: AGENTS.md can move the map', () => {
  const repo = makeRepo({ 'AGENTS.md': '# Agents\n\nScreen map: `ui/screens.md`\n', 'ui/screens.md': MAP });
  assert.equal(mapPath(repo), join(repo, 'ui/screens.md'));
  assert.equal(readMap(repo).path, join(repo, 'ui/screens.md'));
  const r = run(repo, ['map']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'Home\nReport\nSettings / Billing\n');
  const plain = makeRepo();
  assert.equal(mapPath(plain), join(plain, 'docs/ui/screens.md'));
});

test('map: runs from a subdirectory of the repo', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': MAP, 'src/x.txt': 'x\n' });
  const r = spawnSync('node', [UICHECK, 'map'], { cwd: join(repo, 'src'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'Home\nReport\nSettings / Billing\n');
});

test('init: writes the template and gitignores .ui-check/', () => {
  const repo = makeRepo({ '.gitignore': 'node_modules/' });
  const r = run(repo, ['init']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), readFileSync(TEMPLATE, 'utf8'));
  assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), 'node_modules/\n.ui-check/\n');
  assert.match(r.stdout, /^wrote docs\/ui\/screens\.md$/m);

  const again = run(repo, ['init']);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /^kept docs\/ui\/screens\.md \(exists\)$/m);
  assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), 'node_modules/\n.ui-check/\n');

  const fresh = makeRepo();
  assert.equal(run(fresh, ['init']).code, 0);
  assert.equal(readFileSync(join(fresh, '.gitignore'), 'utf8'), '.ui-check/\n');
});

test('map: no map file exits 1 with "no screen map at <path>; run init"', () => {
  const repo = makeRepo();
  const r = run(repo, ['map']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'ui-check: no screen map at docs/ui/screens.md; run init\n');
  assert.throws(() => readMap(repo), (err) => err instanceof UiCheckError && err.code === 1);
});

test('map: a screens.md without the marker is refused', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': FOREIGN });
  for (const args of [['map'], ['map', '--json'], ['map', 'home']]) {
    const r = run(repo, args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.stderr, REFUSED);
  }
  // `record` joins this loop in Task 3, when the command exists.
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), FOREIGN);
  assert.throws(() => readMap(repo), (err) => err instanceof UiCheckError && err.code === 1);
});

test('init: never takes over a foreign file', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': FOREIGN });
  const r = run(repo, ['init']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, REFUSED);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), FOREIGN);
  assert.equal(existsSync(join(repo, '.gitignore')), false);
});

test('cli: a bad or missing command prints USAGE and exits 2', () => {
  const repo = makeRepo();
  for (const args of [[], ['nope'], ['map', '--bogus'], ['init', 'extra']]) {
    const r = run(repo, args);
    assert.equal(r.code, 2, args.join(' '));
  }
  assert.equal(run(repo, []).stderr, USAGE);
  for (const cmd of ['map', 'init']) assert.match(USAGE, new RegExp(`^  node uicheck\\.mjs ${cmd}\\b`, 'm'));
});
