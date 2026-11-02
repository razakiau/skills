import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { slug, parseMap, setField, mapPath, readMap, MARKER, USAGE, CheckScreensError, findPlaywright, captureName, fileHash, today } from './check-screens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_SCREENS = join(HERE, 'check-screens.mjs');
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
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'check-screens-test-')));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'user.email', 't@example.com');
  for (const [p, c] of Object.entries(files)) write(repo, p, c);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function run(repo, args, stdin, env) {
  const r = spawnSync('node', [CHECK_SCREENS, ...args], { cwd: repo, input: stdin, encoding: 'utf8', env: { ...process.env, ...env } });
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
const REFUSED = 'check-screens: docs/ui/screens.md is not a check-screens map; set "Screen map: <path>" in AGENTS.md\n';

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
    assert.ok(err instanceof CheckScreensError);
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
  assert.equal(bad.stderr, 'check-screens: unknown screen nowhere\n');
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
  const r = spawnSync('node', [CHECK_SCREENS, 'map'], { cwd: join(repo, 'src'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'Home\nReport\nSettings / Billing\n');
});

test('init: writes the template and gitignores .check-screens/', () => {
  const repo = makeRepo({ '.gitignore': 'node_modules/' });
  const r = run(repo, ['init']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), readFileSync(TEMPLATE, 'utf8'));
  assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), 'node_modules/\n.check-screens/\n');
  assert.match(r.stdout, /^wrote docs\/ui\/screens\.md$/m);

  const again = run(repo, ['init']);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /^kept docs\/ui\/screens\.md \(exists\)$/m);
  assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), 'node_modules/\n.check-screens/\n');

  const fresh = makeRepo();
  assert.equal(run(fresh, ['init']).code, 0);
  assert.equal(readFileSync(join(fresh, '.gitignore'), 'utf8'), '.check-screens/\n');
});

test('map: no map file exits 1 with "no screen map at <path>; run init"', () => {
  const repo = makeRepo();
  const r = run(repo, ['map']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: no screen map at docs/ui/screens.md; run init\n');
  assert.throws(() => readMap(repo), (err) => err instanceof CheckScreensError && err.code === 1);
});

test('map: a screens.md without the marker is refused', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': FOREIGN });
  for (const args of [['map'], ['map', '--json'], ['map', 'home']]) {
    const r = run(repo, args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.stderr, REFUSED);
  }
  // record and approve would edit the map; they must refuse before touching any byte.
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  write(repo, 'docs/ui/mockup.png', 'png');
  for (const args of [['record', 'home'], ['approve', 'home', '--by', 'owner', '--captures'],
    ['approve', 'home', '--by', 'owner', '--mockup', 'docs/ui/mockup.png'], ['stale'], ['touched']]) {
    const r = run(repo, args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.stderr, REFUSED, args.join(' '));
  }
  assert.equal(existsSync(join(repo, 'docs/ui/approved')), false);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), FOREIGN);
  assert.throws(() => readMap(repo), (err) => err instanceof CheckScreensError && err.code === 1);
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
  for (const cmd of ['map', 'init', 'capture', 'touched', 'record', 'approve', 'stale']) assert.match(USAGE, new RegExp(`^  node check-screens\\.mjs ${cmd}\\b`, 'm'));
});

// Browser tests need Playwright; point CHECK_SCREENS_PLAYWRIGHT_FROM at a project that has it installed.
const PW_FROM = process.env.CHECK_SCREENS_PLAYWRIGHT_FROM;
const noBrowser = !(PW_FROM && findPlaywright(PW_FROM)) && 'set CHECK_SCREENS_PLAYWRIGHT_FROM to a project with playwright';
const DEMO = join(HERE, 'fixtures', 'demo');
const demoUrl = (page) => pathToFileURL(join(DEMO, page)).href;
const pngWidth = (buf) => buf.readUInt32BE(16);
const isPng = (buf) => buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : []);

test('capture: names', () => {
  assert.equal(captureName('Settings / Billing', 360, 'dark', 'Empty'), 'settings-billing-360-dark-empty.png');
  assert.equal(captureName('Home', 1440, 'light'), 'home-1440-light.png');
});

test('capture: no playwright exits 3', () => {
  const repo = makeRepo();
  const empty = realpathSync(mkdtempSync(join(tmpdir(), 'check-screens-nopw-')));
  const r = run(repo, ['capture', '--url', demoUrl('home.html'), '--screen', 'Home'], undefined, { CHECK_SCREENS_PLAYWRIGHT_FROM: empty });
  assert.equal(r.code, 3);
  assert.equal(r.stderr, `check-screens: no playwright in ${empty}; capture with the browser MCP instead (reference/providers.md)\n`);
  assert.equal(existsSync(join(repo, '.check-screens')), false);
});

test('capture: a missing --url or --screen is a usage error', () => {
  const repo = makeRepo();
  assert.equal(run(repo, ['capture', '--screen', 'Home']).code, 2);
  assert.equal(run(repo, ['capture', '--url', demoUrl('home.html')]).code, 2);
});

test('capture: writes widths x themes', { skip: noBrowser }, () => {
  const repo = makeRepo();
  const r = run(repo, ['capture', '--url', demoUrl('home.html'), '--screen', 'Home']);
  assert.equal(r.code, 0, r.stderr);
  const out = join(repo, '.check-screens', 'captures');
  const want = ['home-1440-dark.png', 'home-1440-light.png', 'home-360-dark.png', 'home-360-light.png'];
  assert.deepEqual(pngs(out), want);
  for (const f of want) {
    assert.ok(isPng(readFileSync(join(out, f))), f);
    assert.match(r.stdout, new RegExp(`^wrote .*${f.replace('.', '\\.')}$`, 'm'));
  }
  assert.equal(pngWidth(readFileSync(join(out, 'home-360-light.png'))), 360);
  assert.equal(pngWidth(readFileSync(join(out, 'home-1440-light.png'))), 1440);
});

test('capture: dark theme differs from light', { skip: noBrowser }, () => {
  const repo = makeRepo();
  const r = run(repo, ['capture', '--url', demoUrl('home.html'), '--screen', 'Home', '--widths', '360', '--state', 'Default']);
  assert.equal(r.code, 0, r.stderr);
  const out = join(repo, '.check-screens', 'captures');
  assert.deepEqual(pngs(out), ['home-360-dark-default.png', 'home-360-light-default.png']);
  assert.ok(!readFileSync(join(out, 'home-360-light-default.png')).equals(readFileSync(join(out, 'home-360-dark-default.png'))));
});

test('capture: --out relative to the repo top, from a subdirectory', { skip: noBrowser }, () => {
  const repo = makeRepo({ 'README.md': 'demo\n', 'src/x.txt': 'x\n' });
  const r = spawnSync('node', [CHECK_SCREENS, 'capture', '--url', demoUrl('report.html'), '--screen', 'Report', '--widths', '360', '--themes', 'light', '--out', 'shots'],
    { cwd: join(repo, 'src'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pngs(join(repo, 'shots')), ['report-360-light.png']);
});

test('capture: refused url writes nothing', { skip: noBrowser }, () => {
  const repo = makeRepo();
  write(repo, 'docs/ui/screens.md', MAP);
  const r = run(repo, ['capture', '--url', 'http://127.0.0.1:9/', '--screen', 'Home']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /could not reach http:\/\/127\.0\.0\.1:9\//);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(join(repo, '.check-screens')), false);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), MAP);
});

test('capture: a closed port is refused and writes nothing', { skip: noBrowser }, async () => {
  const { createServer } = await import('node:net');
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  await new Promise((ok) => srv.close(ok));
  const repo = makeRepo();
  const url = `http://127.0.0.1:${port}/`;
  const r = run(repo, ['capture', '--url', url, '--screen', 'Home']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, `check-screens: could not reach ${url}\n`);
  assert.equal(existsSync(join(repo, '.check-screens')), false);
});

test('capture: error overlay is not a capture', { skip: noBrowser }, () => {
  const repo = makeRepo();
  const r = run(repo, ['capture', '--url', demoUrl('error.html'), '--screen', 'Broken', '--widths', '360', '--themes', 'light']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /warn \S*broken-360-light\.png: error overlay/);
  assert.deepEqual(pngs(join(repo, '.check-screens', 'captures')), []);
});

test('capture: an empty page is not a capture', { skip: noBrowser }, () => {
  const repo = makeRepo();
  const r = run(repo, ['capture', '--url', 'data:text/html,<html><body>  </body></html>', '--screen', 'Blank', '--widths', '360', '--themes', 'light']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /warn \S*blank-360-light\.png: empty page/);
  assert.deepEqual(pngs(join(repo, '.check-screens', 'captures')), []);
});

test('capture: only the dark theme shows an overlay', { skip: noBrowser }, () => {
  const repo = makeRepo();
  const r = run(repo, ['capture', '--url', demoUrl('error-dark.html'), '--screen', 'Home', '--widths', '360']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /warn \S*home-360-dark\.png: error overlay/);
  assert.doesNotMatch(r.stderr, /home-360-light\.png/);
  assert.deepEqual(pngs(join(repo, '.check-screens', 'captures')), ['home-360-light.png']);
});

// Review fixes on the map layer.

test('map: setField refuses a value with a line break', () => {
  for (const value of ['a\nb', 'a\rb', 'a\r\nb']) {
    assert.throws(() => setField(MAP, 'home', 'route', value), (err) => {
      assert.ok(err instanceof CheckScreensError);
      assert.equal(err.code, 2);
      assert.equal(err.message, 'value must be one line');
      return true;
    });
  }
});

test('map: two entries with the same slug are ambiguous', () => {
  const text = [MARKER, '', '## Home', 'route: /', '', '## home', 'route: /home', ''].join('\n');
  for (const name of ['Home', 'home', 'HOME']) {
    assert.throws(() => setField(text, name, 'route', '/x'), (err) => {
      assert.ok(err instanceof CheckScreensError);
      assert.equal(err.code, 1);
      assert.equal(err.message, `ambiguous screen ${name}: 2 entries`);
      return true;
    });
  }
  const repo = makeRepo({ 'docs/ui/screens.md': text });
  const r = run(repo, ['map', 'home']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: ambiguous screen home: 2 entries\n');
});

test('map: a leading BOM is not a foreign file, and record keeps it', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': '\uFEFF' + MAP, 'src/home.html': '<p>home</p>\n' });
  assert.equal(readMap(repo).text, MAP);
  const r = run(repo, ['map']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'Home\nReport\nSettings / Billing\n');
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  const rec = run(repo, ['record', 'Home']);
  assert.equal(rec.code, 0, rec.stderr);
  const after = readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8');
  assert.ok(after.startsWith('\uFEFF' + MARKER));
});

test('map: mixed CRLF and LF is refused', () => {
  const text = MARKER + '\r\n\r\n## Home\nroute: /\r\n';
  const repo = makeRepo({ 'docs/ui/screens.md': text, 'src/home.html': 'x' });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  for (const args of [['map'], ['record', 'Home']]) {
    const r = run(repo, args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.stderr, 'check-screens: docs/ui/screens.md mixes CRLF and LF line endings; normalise it first\n');
  }
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), text);
});

test('map: AGENTS.md prose that mentions a screen map does not move it', () => {
  const repo = makeRepo({ 'AGENTS.md': '# Agents\n\nKeep the screen map: up to date after each change.\n' });
  assert.equal(mapPath(repo), join(repo, 'docs/ui/screens.md'));
  const listed = makeRepo({ 'AGENTS.md': '# Agents\n\n- Screen map: `ui/screens.md`\n' });
  assert.equal(mapPath(listed), join(listed, 'ui/screens.md'));
});

test('map: AGENTS.md pointing outside the repo is refused', () => {
  for (const target of ['../elsewhere.md', '/tmp/screens.md']) {
    const repo = makeRepo({ 'AGENTS.md': `Screen map: \`${target}\`\n` });
    assert.throws(() => mapPath(repo), (err) => err instanceof CheckScreensError && err.code === 1);
    const r = run(repo, ['map']);
    assert.equal(r.code, 1);
    assert.equal(r.stderr, `check-screens: screen map path ${target} is outside the repo\n`);
  }
});

// touched

const HOME_MAP = [MARKER, '', '## home', 'route: /', 'file: src/home.tsx', ''].join('\n');

test('touched: screen file changed', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': HOME_MAP, 'src/home.tsx': 'export default 1;\n' });
  write(repo, 'src/home.tsx', 'export default 2;\n');
  const r = run(repo, ['touched']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^screen home \(src\/home\.tsx\)$/m);
});

test('touched: shared component lists its users', () => {
  const repo = makeRepo({
    'docs/ui/screens.md': HOME_MAP,
    'src/home.tsx': "import TabBar from './TabBar';\nexport default TabBar;\n",
    'src/TabBar.tsx': 'export default 1;\n',
  });
  write(repo, 'src/TabBar.tsx', 'export default 2;\n');
  const r = run(repo, ['touched']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'shared src/TabBar.tsx\n  used by home\n');
});

test('touched: untracked files count, against a base', () => {
  const repo = makeRepo({
    'docs/ui/screens.md': [MARKER, '', '## home', 'file: src/home.tsx', '', '## report', 'file: src/report.tsx', ''].join('\n'),
    'src/home.tsx': "import './theme.css';\n",
    'src/report.tsx': 'export default 1;\n',
  });
  write(repo, 'src/report.tsx', 'export default 2;\n');
  execFileSync('git', ['commit', '-qam', 'report'], { cwd: repo });
  write(repo, 'src/theme.css', 'body{}\n');
  const r = run(repo, ['touched', 'HEAD~1']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'screen report (src/report.tsx)\nshared src/theme.css\n  used by home\n');
});

test('touched: not git exits 2', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'check-screens-nogit-')));
  write(dir, 'docs/ui/screens.md', HOME_MAP);
  const r = run(dir, ['touched'], undefined, { GIT_CEILING_DIRECTORIES: dirname(dir) });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^check-screens: touched needs git$/m);
});

// record

const AB_MAP = [MARKER, '', '## home', 'route: /', 'file: src/home.tsx', '', '## Settings / Billing', 'route: /settings/billing', 'file: src/b.tsx, src/a.tsx', ''].join('\n');

test('fileHash: sorted files, null when one is missing', () => {
  const repo = makeRepo({ 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  const h = fileHash(repo, 'src/b.tsx, src/a.tsx');
  assert.match(h, /^sha256:[0-9a-f]{12}$/);
  assert.equal(h, fileHash(repo, 'src/a.tsx,src/b.tsx'));
  assert.equal(h, 'sha256:' + createHash('sha256').update('A\0B').digest('hex').slice(0, 12));
  assert.equal(fileHash(repo, 'src/a.tsx, src/gone.tsx'), null);
});

test('record: writes hash and variants', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  write(repo, '.check-screens/captures/home-1440-light.png', 'png');
  write(repo, '.check-screens/captures/report-360-light.png', 'png');
  const r = run(repo, ['record', 'home']);
  assert.equal(r.code, 0, r.stderr);
  const text = readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith('last-capture:'));
  assert.match(line, /^last-capture: \d{4}-\d{2}-\d{2} sha256:[0-9a-f]{12} 1440-light 360-light$/);
  assert.ok(line.startsWith(`last-capture: ${today()} ${fileHash(repo, 'src/home.tsx')} `));
  // Only that one line was added, right after the entry's last field.
  const lines = text.split('\n');
  assert.equal(lines[5], line);
  assert.deepEqual([...lines.slice(0, 5), ...lines.slice(6)], AB_MAP.split('\n'));
});

test('record: a name that is not a slug, with states and a custom --out', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  write(repo, 'shots/settings-billing-360-dark-empty.png', 'png');
  write(repo, 'shots/settings-billing-360-light.png', 'png');
  write(repo, 'shots/settings-other-360-light.png', 'png');
  const r = run(repo, ['record', 'Settings / Billing', '--out', 'shots']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'),
    new RegExp(`^last-capture: ${today()} ${fileHash(repo, 'src/a.tsx, src/b.tsx')} 360-dark-empty 360-light$`, 'm'));
});

test('record: no captures exits 1', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'src/home.tsx': 'x' });
  const r = run(repo, ['record', 'home']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: no captures for home in .check-screens/captures\n');
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), AB_MAP);
});

test('record: unknown screen exits 1, map unchanged', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'src/home.tsx': 'x' });
  write(repo, '.check-screens/captures/nowhere-360-light.png', 'png');
  const before = readFileSync(join(repo, 'docs/ui/screens.md'));
  const r = run(repo, ['record', 'nowhere']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: unknown screen nowhere\n');
  assert.ok(readFileSync(join(repo, 'docs/ui/screens.md')).equals(before));
});

test('record: keeps CRLF and every other byte', () => {
  const crlf = AB_MAP.replace(/\n/g, '\r\n');
  const repo = makeRepo({ 'docs/ui/screens.md': crlf, 'src/home.tsx': 'x' });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  assert.equal(run(repo, ['record', 'home']).code, 0);
  const after = readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8').split('\r\n');
  assert.equal(after.length, crlf.split('\r\n').length + 1);
  assert.match(after[5], /^last-capture: /);
  assert.deepEqual([...after.slice(0, 5), ...after.slice(6)], crlf.split('\r\n'));
});

// approve

test('approve: needs --by', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  for (const args of [['approve', 'home', '--captures'], ['approve', 'home', '--by', 'owner'],
    ['approve', 'home', '--by', 'owner', '--captures', '--mockup', 'x.png'], ['approve', '--by', 'owner', '--captures']]) {
    const r = run(repo, args);
    assert.equal(r.code, 2, args.join(' '));
  }
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), AB_MAP);
  assert.equal(existsSync(join(repo, 'docs/ui/approved')), false);
  // A usage error wins over a foreign map: the arguments are checked first.
  const foreign = makeRepo({ 'docs/ui/screens.md': FOREIGN });
  assert.equal(run(foreign, ['approve', 'home', '--captures']).code, 2);
});

test('approve: --by with a line break is a usage error', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  const r = run(repo, ['approve', 'home', '--by', 'owner\nroute: /evil', '--captures']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^check-screens: value must be one line$/m);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), AB_MAP);
  assert.equal(existsSync(join(repo, 'docs/ui/approved')), false);
});

test('approve --mockup missing path exits 1', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP });
  const r = run(repo, ['approve', 'home', '--by', 'owner', '--mockup', 'docs/ui/mockups/home.png']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: no file at docs/ui/mockups/home.png\n');
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), AB_MAP);
});

test('approve --mockup records the path and the approver', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'docs/ui/mockups/home.png': 'png' });
  const r = run(repo, ['approve', 'home', '--by', 'owner', '--mockup', 'docs/ui/mockups/home.png']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'),
    new RegExp(`^mockup: docs/ui/mockups/home\\.png \\(approved ${today()}, owner\\)$`, 'm'));
});

test('approve --captures copies and records', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP });
  write(repo, '.check-screens/captures/home-360-light.png', 'light');
  write(repo, '.check-screens/captures/home-1440-light.png', 'wide');
  write(repo, '.check-screens/captures/report-360-light.png', 'other');
  const r = run(repo, ['approve', 'home', '--by', 'owner', '--captures']);
  assert.equal(r.code, 0, r.stderr);
  const dir = join(repo, 'docs/ui/approved');
  assert.deepEqual(readdirSync(dir).sort(), ['home-1440-light.png', 'home-360-light.png']);
  assert.equal(readFileSync(join(dir, 'home-360-light.png'), 'utf8'), 'light');
  assert.match(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'),
    new RegExp(`^approved: docs/ui/approved/home-1440-light\\.png docs/ui/approved/home-360-light\\.png \\(${today()}, owner\\)$`, 'm'));
});

test('approve writes the same line shapes as the template example', () => {
  // The template's commented example must not drift from what approve writes.
  const example = readFileSync(TEMPLATE, 'utf8').split('\n');
  const shape = (line) => line.replace(/\d{4}-\d{2}-\d{2}/g, 'DATE').replace(/[^ ()]+\.png/g, 'FILE').replace(/, [^)]+\)$/, ', NAME)');
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP, 'docs/ui/mockups/home-360-light.png': 'png', 'src/home.tsx': 'x' });
  write(repo, '.check-screens/captures/home-360-light.png', 'light');
  write(repo, '.check-screens/captures/home-1440-light.png', 'wide');
  assert.equal(run(repo, ['record', 'home']).code, 0);
  assert.equal(run(repo, ['approve', 'home', '--by', 'Some Owner', '--mockup', 'docs/ui/mockups/home-360-light.png']).code, 0);
  assert.equal(run(repo, ['approve', 'home', '--by', 'owner', '--captures']).code, 0);
  const written = readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8').split('\n');
  for (const key of ['mockup', 'approved']) {
    const want = example.find((l) => l.startsWith(`${key}: `));
    const got = written.find((l) => l.startsWith(`${key}: `));
    assert.equal(shape(got), shape(want), key);
  }
  // last-capture: same shape, variants in the same (sorted) order as record writes them.
  const capShape = (line) => line.replace(/\d{4}-\d{2}-\d{2}/g, 'DATE').replace(/sha256:[0-9a-f]{12}/g, 'HASH');
  const wantCap = example.find((l) => l.startsWith('last-capture: '));
  const gotCap = written.find((l) => l.startsWith('last-capture: '));
  assert.equal(capShape(gotCap), capShape(wantCap), 'last-capture');
  const hash = example.find((l) => l.startsWith('last-capture: ')).split(' ')[2];
  assert.match(hash, /^sha256:[0-9a-f]{12}$/);
  assert.notEqual(hash, 'sha256:000000000000');
});

test('approve: unknown screen exits 1 and copies nothing', () => {
  const repo = makeRepo({ 'docs/ui/screens.md': AB_MAP });
  write(repo, '.check-screens/captures/nowhere-360-light.png', 'png');
  const r = run(repo, ['approve', 'nowhere', '--by', 'owner', '--captures']);
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'check-screens: unknown screen nowhere\n');
  assert.equal(existsSync(join(repo, 'docs/ui/approved')), false);
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), AB_MAP);
});

// stale

function recorded(files, map = AB_MAP) {
  const repo = makeRepo({ 'docs/ui/screens.md': map, ...files });
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  write(repo, '.check-screens/captures/settings-billing-360-light.png', 'png');
  for (const name of ['home', 'Settings / Billing']) assert.equal(run(repo, ['record', name]).code, 0);
  return repo;
}

test('stale: fresh entries report nothing', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  const r = run(repo, ['stale']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'routes: not checked (pass --routes)\nstale: 0, gone: 0, unmapped: 0\n');
});

test('stale: edit after record is stale', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  write(repo, 'src/home.tsx', 'y');
  const r = run(repo, ['stale']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^stale home \\(src/home\\.tsx changed since ${today()}\\)$`, 'm'));
  assert.match(r.stdout, /^stale: 1, gone: 0, unmapped: 0\n$/m);
});

test('stale: deleted file is gone', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  rmSync(join(repo, 'src/home.tsx'));
  const r = run(repo, ['stale']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^gone home \(src\/home\.tsx\)$/m);
  assert.ok(r.stdout.endsWith('stale: 0, gone: 1, unmapped: 0\n'));
});

test('stale: multi-file entry', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  write(repo, 'src/b.tsx', 'B2');
  let r = run(repo, ['stale']);
  assert.match(r.stdout, new RegExp(`^stale Settings / Billing \\(src/b\\.tsx, src/a\\.tsx changed since ${today()}\\)$`, 'm'));
  assert.ok(r.stdout.endsWith('stale: 1, gone: 0, unmapped: 0\n'));
  // Restoring b makes it fresh again: the hash covers content, not mtimes.
  write(repo, 'src/b.tsx', 'B');
  assert.ok(run(repo, ['stale']).stdout.endsWith('stale: 0, gone: 0, unmapped: 0\n'));
  rmSync(join(repo, 'src/a.tsx'));
  r = run(repo, ['stale']);
  assert.match(r.stdout, /^gone Settings \/ Billing \(src\/a\.tsx\)$/m);
  assert.ok(r.stdout.endsWith('stale: 0, gone: 1, unmapped: 0\n'));
});

test('stale: routes from stdin', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  const r = run(repo, ['stale', '--routes', '-'], JSON.stringify(['/', { path: '/settings' }, '/settings/billing']));
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'unmapped /settings\nstale: 0, gone: 0, unmapped: 1\n');
});

test('stale: routes from a file', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  write(repo, 'routes.json', JSON.stringify(['/', '/settings']));
  const r = run(repo, ['stale', '--routes', 'routes.json']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'unmapped /settings\nstale: 0, gone: 0, unmapped: 1\n');
});

test('stale: without routes says not checked', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  const r = run(repo, ['stale']);
  assert.match(r.stdout, /^routes: not checked \(pass --routes\)$/m);
});

// fixes left from Task 3

test('stale: a routes file that is missing or not JSON is a usage error', () => {
  const repo = recorded({ 'src/home.tsx': 'x', 'src/a.tsx': 'A', 'src/b.tsx': 'B' });
  const missing = run(repo, ['stale', '--routes', 'nope.json']);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /^check-screens: no routes file at nope\.json\n/);
  const notJson = run(repo, ['stale', '--routes', '-'], '[/, oops');
  assert.equal(notJson.code, 2);
  assert.match(notJson.stderr, /^check-screens: routes are not JSON: /);
  const notArray = run(repo, ['stale', '--routes', '-'], '{"not": "an array"}');
  assert.equal(notArray.code, 2);
  assert.match(notArray.stderr, /^check-screens: routes must be a JSON array/);
  // Findings are not errors: an unmapped route still exits 0.
  assert.equal(run(repo, ['stale', '--routes', '-'], '["/nowhere"]').code, 0);
});

test('fileHash, stale, record: a file outside the repo top counts as gone', () => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'check-screens-outside-')));
  writeFileSync(join(outside, 'x.tsx'), 'x');
  const map = [MARKER, '', '## home', 'route: /', `file: ../${outside.split('/').pop()}/x.tsx`, '',
    '## report', 'route: /report', `file: ${join(outside, 'x.tsx')}`, ''].join('\n');
  const repo = makeRepo({ 'docs/ui/screens.md': map });
  // The sibling temp dir is reachable as ../<name> only when both sit in the same tmpdir.
  assert.equal(existsSync(join(repo, '..', outside.split('/').pop(), 'x.tsx')), true);
  for (const field of [`../${outside.split('/').pop()}/x.tsx`, join(outside, 'x.tsx')]) {
    assert.equal(fileHash(repo, field), null, field);
  }
  write(repo, '.check-screens/captures/home-360-light.png', 'png');
  write(repo, '.check-screens/captures/report-360-light.png', 'png');
  const before = readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8');
  for (const name of ['home', 'report']) {
    const r = run(repo, ['record', name]);
    assert.equal(r.code, 1, name);
    assert.match(r.stderr, new RegExp(`^check-screens: a file of ${name} is outside the repo: `));
  }
  assert.equal(readFileSync(join(repo, 'docs/ui/screens.md'), 'utf8'), before);
  const r = run(repo, ['stale']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^gone home \(\.\.\/.+\/x\.tsx\)$/m);
  assert.match(r.stdout, /^gone report \(\/.+\/x\.tsx\)$/m);
  assert.ok(r.stdout.endsWith('stale: 0, gone: 2, unmapped: 0\n'));
});

// the skill and its references

const SKILL_DIR = join(HERE, '..');
const readSkill = (rel) => readFileSync(join(SKILL_DIR, rel), 'utf8');

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'SKILL.md starts with frontmatter');
  const fields = {};
  for (const line of m[1].split('\n')) {
    const f = /^([a-z]+):[ \t]*(.*)$/.exec(line);
    if (f) fields[f[1]] = f[2].replace(/^"(.*)"$/, '$1');
  }
  return fields;
}

test('skill: description ≤ 300 chars, names screen and mockup, says what skips it', () => {
  const text = readSkill('SKILL.md');
  const fm = frontmatter(text);
  assert.equal(fm.name, 'check-screens');
  assert.equal(fm.license, 'MIT');
  assert.match(text, /^metadata:\n  version: "1\.0\.0"$/m);
  const d = fm.description;
  assert.ok(d && d.length <= 300, `description is ${d?.length} chars`);
  assert.match(d, /screen/i);
  assert.match(d, /mockup/i);
  const skip = d.split(/(?<=\.)\s+/).find((s) => /skip/i.test(s));
  assert.ok(skip, 'a sentence says what skips it');
  assert.match(skip, /backend/i);
  assert.ok(text.split('\n').length < 60, 'SKILL.md is under 60 lines');
});

test('skill: every reference link resolves', () => {
  const text = readSkill('SKILL.md');
  const links = [...text.matchAll(/\]\(((?:reference|templates)\/[^)#\s]+)/g)].map((m) => m[1]);
  for (const ref of ['reference/loop.md', 'reference/map.md', 'reference/reviewer.md', 'reference/providers.md']) {
    assert.ok(links.includes(ref), `SKILL.md links ${ref}`);
  }
  for (const link of links) assert.ok(existsSync(join(SKILL_DIR, link)), `${link} exists`);
  // The references link each other and the template the same way.
  for (const ref of readdirSync(join(SKILL_DIR, 'reference'))) {
    for (const m of readSkill(`reference/${ref}`).matchAll(/\]\(((?:\.\.\/)?[a-z-]+(?:\/[a-z-]+)*\.(?:md|mjs))\)/g)) {
      assert.ok(existsSync(join(SKILL_DIR, 'reference', m[1])), `reference/${ref} links ${m[1]}`);
    }
  }
});

test('skill: command table matches the CLI', () => {
  const text = readSkill('SKILL.md');
  const section = text.split(/^## Commands$/m)[1]?.split(/^## /m)[0] ?? '';
  const inTable = section.split('\n')
    .map((l) => /^\| `([a-z]+)\b[^`]*` \|/.exec(l)?.[1]).filter(Boolean);
  const inUsage = USAGE.split('\n')
    .filter((l) => l.startsWith('  node check-screens.mjs '))
    .map((l) => l.slice('  node check-screens.mjs '.length).split(' ')[0]);
  assert.ok(inUsage.length > 0);
  assert.deepEqual([...new Set(inTable)].sort(), [...new Set(inUsage)].sort());
});

test('reviewer: brief names the three dispositions and three tags', () => {
  const text = readSkill('reference/reviewer.md');
  const output = text.split(/^## Output$/m)[1]?.split(/^## /m)[0] ?? '';
  assert.ok(output, 'reviewer.md has an ## Output section');
  const dispositions = ['ship', 'fix', 'recapture'];
  const tags = ['fix', 'adaptation', 'ask'];
  // Exactly these dispositions, each as `disposition: <word>`.
  const offered = new Set([...output.matchAll(/disposition: ([a-z]+)/g)].map((m) => m[1]));
  assert.deepEqual([...offered].sort(), [...dispositions].sort());
  // Exactly these tags, each in backticks; no other bare word is offered.
  const words = new Set([...output.matchAll(/`([a-z]+)`/g)].map((m) => m[1]));
  assert.deepEqual([...words].sort(), [...tags].sort());
  assert.match(output, /^`?<tag> <element>: saw <x>, expected <y> \(<evidence file>\)`?$/m);
  assert.match(text, /https:\/\/github\.com\/pbakaus\/impeccable/);
  assert.match(text, /Apache-2\.0/);
});
