import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The first line of every screen map. A file without it belongs to someone else.
export const MARKER = '<!-- ui-check screen map v1 -->';
const DEFAULT_MAP = 'docs/ui/screens.md';
const IGNORE_LINE = '.ui-check/';
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'screens.md');

// One line per command. Later commands add their own line here.
export const USAGE = [
  'usage:',
  '  node uicheck.mjs map [--json] [<screen> | --family <family> | --sibling-of <screen>]',
  '  node uicheck.mjs init',
  '  node uicheck.mjs capture --url <url> --screen <name> [--widths 360,1440] [--themes light,dark] [--state <s>] [--out .ui-check/captures]',
  '',
].join('\n');

// An error the user caused: printed as `ui-check: <message>` with its own exit code.
export class UiCheckError extends Error {
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

// Today as YYYY-MM-DD in local time, for the dates the map records.
export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A screen name as a file-safe slug: 'Settings / Billing' -> 'settings-billing'.
export function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEADING = /^## (.+)$/;
const FIELD = /^([a-z][a-z0-9-]*):[ \t]*(.*)$/;

// Splits the map into lines and marks which ones hold a heading or a field.
// Lines inside a multi-line HTML comment (the template's example) are neither.
function scan(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const screens = [];
  let current = null;
  let inComment = false;
  lines.forEach((raw, i) => {
    if (inComment) {
      if (raw.includes('-->')) inComment = false;
      return;
    }
    if (raw.includes('<!--') && !raw.slice(raw.lastIndexOf('<!--')).includes('-->')) {
      inComment = true;
      return;
    }
    const h = HEADING.exec(raw);
    if (h) {
      const name = h[1].trim();
      current = { name, slug: slug(name), fields: {}, line: i, fieldLines: {}, lastField: i, end: i };
      screens.push(current);
      return;
    }
    if (!current) return;
    current.end = i;
    const f = FIELD.exec(raw);
    if (!f) return;
    current.lastField = i;
    // The first line of a repeated key wins, for reading and for setField alike.
    if (Object.hasOwn(current.fields, f[1])) return;
    current.fields[f[1]] = f[2].trim();
    current.fieldLines[f[1]] = i;
  });
  return { eol, lines, screens };
}

// The map's entries. `line` is the 0-based index of the entry's `## ` heading in text.split(eol).
export function parseMap(text) {
  const { eol, screens } = scan(text);
  return { eol, screens: screens.map(({ name, slug: s, fields, line }) => ({ name, slug: s, fields, line })) };
}

function find(screens, name) {
  const want = slug(name);
  const hit = screens.find((s) => s.name === name) ?? screens.find((s) => s.slug === want);
  if (!hit) throw new UiCheckError(`unknown screen ${name}`, 1);
  return hit;
}

// Sets one field of one entry and leaves every other byte of the map as it was.
export function setField(text, screen, key, value) {
  const { eol, lines, screens } = scan(text);
  const entry = find(screens, screen);
  const line = `${key}: ${value}`;
  const at = entry.fieldLines[key];
  if (at !== undefined) lines[at] = line;
  else lines.splice(entry.lastField + 1, 0, line);
  return lines.join(eol);
}

// docs/ui/screens.md, unless AGENTS.md names another path on a `Screen map:` line.
export function mapPath(top) {
  const agents = join(top, 'AGENTS.md');
  if (existsSync(agents)) {
    const m = /screen map:\s*`?([^`\s]+)`?/i.exec(readFileSync(agents, 'utf8'));
    if (m) return join(top, m[1]);
  }
  return join(top, DEFAULT_MAP);
}

const isOurs = (text) => text.split(/\r?\n/, 1)[0] === MARKER;
const notOurs = (top, path) => new UiCheckError(
  `${relative(top, path)} is not a ui-check screen map; set "Screen map: <path>" in AGENTS.md`, 1);

// The map file, refused when it is missing or belongs to another tool.
export function readMap(top) {
  const path = mapPath(top);
  if (!existsSync(path)) throw new UiCheckError(`no screen map at ${relative(top, path)}; run init`, 1);
  const text = readFileSync(path, 'utf8');
  if (!isOurs(text)) throw notOurs(top, path);
  return { path, text };
}

// Reads `--flag value` options and positionals; anything unknown is a usage error.
function parseArgs(args, { flags = [], options = [], positionals = 0 }) {
  const out = { flags: {}, options: {}, positionals: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flags.includes(a)) out.flags[a] = true;
    else if (options.includes(a)) {
      if (i + 1 >= args.length) throw new UiCheckError(`${a} needs a value`, 2);
      out.options[a] = args[++i];
    } else if (a.startsWith('--') || out.positionals.length >= positionals) throw new UiCheckError(`unknown argument ${a}`, 2);
    else out.positionals.push(a);
  }
  return out;
}

const list = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function mapCmd(args) {
  const { flags, options, positionals } = parseArgs(args, { flags: ['--json'], options: ['--family', '--sibling-of'], positionals: 1 });
  const family = options['--family'];
  const siblingOf = options['--sibling-of'];
  if ([positionals.length > 0, family !== undefined, siblingOf !== undefined].filter(Boolean).length > 1) {
    throw new UiCheckError('give one of <screen>, --family, --sibling-of', 2);
  }
  const { text } = readMap(repoTop());
  const { lines, screens: scanned } = scan(text);
  const screens = parseMap(text).screens;
  const json = flags['--json'];
  const print = (picked) => process.stdout.write(json
    ? JSON.stringify({ screens: picked }, null, 2) + '\n'
    : picked.map((s) => `${s.name}\n`).join(''));

  if (positionals.length) {
    const entry = find(scanned, positionals[0]);
    if (json) return print([screens.find((s) => s.line === entry.line)]);
    let end = entry.end;
    while (end > entry.line && lines[end].trim() === '') end--;
    return process.stdout.write(lines.slice(entry.line, end + 1).map((l) => `${l}\n`).join(''));
  }
  if (siblingOf !== undefined) {
    const names = list(find(screens, siblingOf).fields.siblings);
    if (json) return print(screens.filter((s) => names.some((n) => n === s.name || slug(n) === s.slug)));
    return process.stdout.write(names.map((n) => `${n}\n`).join(''));
  }
  if (family !== undefined) return print(screens.filter((s) => list(s.fields.family).includes(family)));
  return print(screens);
}

function initCmd(args) {
  parseArgs(args, {});
  const top = repoTop();
  const path = mapPath(top);
  const rel = relative(top, path);
  if (existsSync(path)) {
    if (!isOurs(readFileSync(path, 'utf8'))) throw notOurs(top, path);
    process.stdout.write(`kept ${rel} (exists)\n`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(TEMPLATE, 'utf8'));
    process.stdout.write(`wrote ${rel}\n`);
  }
  const ignore = join(top, '.gitignore');
  const current = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const known = current.split(/\r?\n/).some((l) => ['.ui-check', '.ui-check/', '/.ui-check', '/.ui-check/'].includes(l.trim()));
  if (!known) {
    const sep = current && !current.endsWith('\n') ? eol : '';
    writeFileSync(ignore, `${current}${sep}${IGNORE_LINE}${eol}`);
    process.stdout.write(`added ${IGNORE_LINE} to .gitignore\n`);
  }
}

// The Playwright entry point the target app has installed, or null.
// UICHECK_PLAYWRIGHT_FROM overrides fromDir.
export function findPlaywright(fromDir) {
  const dir = process.env.UICHECK_PLAYWRIGHT_FROM ?? fromDir;
  const req = createRequire(join(resolve(dir), 'package.json'));
  for (const name of ['playwright', '@playwright/test']) {
    try { return req.resolve(name); } catch { /* try the next one */ }
  }
  return null;
}

// `<screen>-<width>-<theme>[-<state>].png`, with the screen and state as slugs.
export function captureName(screen, width, theme, state) {
  return `${slug(screen)}-${width}-${theme}${state ? '-' + slug(state) : ''}.png`;
}

const PHONE_HEIGHT = 800;
const DESKTOP_HEIGHT = 900;
const DESKTOP_FROM = 1024;
const SETTLE_MS = 300;
const THEMES = ['light', 'dark'];
const OVERLAYS = ['vite-error-overlay', 'nextjs-portal', '#webpack-dev-server-client-overlay', '[data-nextjs-dialog]'];
// Navigation errors that mean nothing answered at the URL (a dev server that is not running).
// UNSAFE_PORT: Chromium never connects to ports like 9, so nothing there can be reached either.
const UNREACHABLE = /net::ERR_(CONNECTION_(REFUSED|RESET|CLOSED|FAILED|TIMED_OUT)|ADDRESS_UNREACHABLE|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|FILE_NOT_FOUND|EMPTY_RESPONSE|UNSAFE_PORT)/;

async function captureCmd(args) {
  const { options } = parseArgs(args, { options: ['--url', '--screen', '--widths', '--themes', '--state', '--out'] });
  const url = options['--url'];
  const screen = options['--screen'];
  if (!url || !screen) throw new UiCheckError('capture needs --url and --screen', 2);
  if (!slug(screen)) throw new UiCheckError(`screen name ${screen} has no letters or digits`, 2);
  const widths = list(options['--widths'] ?? '360,1440').map((w) => {
    if (!/^[1-9][0-9]*$/.test(w)) throw new UiCheckError(`bad width ${w}`, 2);
    return Number(w);
  });
  const themes = list(options['--themes'] ?? 'light,dark');
  for (const t of themes) if (!THEMES.includes(t)) throw new UiCheckError(`bad theme ${t}; use light or dark`, 2);
  if (!widths.length || !themes.length) throw new UiCheckError('give at least one width and one theme', 2);
  const state = options['--state'];

  const top = repoTop();
  const outOpt = options['--out'] ?? '.ui-check/captures';
  const out = isAbsolute(outOpt) ? outOpt : join(top, outOpt);
  const shown = (path) => (relative(top, path).startsWith('..') ? path : relative(top, path));

  const from = process.env.UICHECK_PLAYWRIGHT_FROM ?? top;
  const resolved = findPlaywright(top);
  if (!resolved) throw new UiCheckError(`no playwright in ${from}; capture with the browser MCP instead (reference/providers.md)`, 3);
  const pw = await import(pathToFileURL(resolved).href);
  const chromium = pw.chromium ?? pw.default?.chromium;
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw new UiCheckError(`playwright in ${from} could not launch chromium: ${String(err.message).split('\n')[0]}`, 3);
  }

  let bad = 0;
  try {
    for (const width of widths) {
      for (const theme of themes) {
        const file = join(out, captureName(screen, width, theme, state));
        const context = await browser.newContext({
          viewport: { width, height: width >= DESKTOP_FROM ? DESKTOP_HEIGHT : PHONE_HEIGHT },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          try {
            await page.goto(url, { waitUntil: 'networkidle' });
          } catch (err) {
            if (UNREACHABLE.test(String(err.message))) throw new UiCheckError(`could not reach ${url}`, 1);
            throw new UiCheckError(`could not load ${url}: ${String(err.message).split('\n')[0]}`, 1);
          }
          await page.waitForTimeout(SETTLE_MS);
          const { empty, overlay } = await page.evaluate((selectors) => ({
            empty: !(document.body?.innerText ?? '').trim(),
            overlay: selectors.some((s) => document.querySelector(s)),
          }), OVERLAYS);
          if (overlay || empty) {
            // Not a valid capture: say why and drop any older file of the same name.
            if (overlay) process.stderr.write(`warn ${shown(file)}: error overlay\n`);
            if (empty) process.stderr.write(`warn ${shown(file)}: empty page\n`);
            rmSync(file, { force: true });
            bad++;
            continue;
          }
          const png = await page.screenshot({ fullPage: true });
          // The out dir appears only once a capture succeeds.
          mkdirSync(out, { recursive: true });
          writeFileSync(file, png);
          process.stdout.write(`wrote ${shown(file)}\n`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (bad) throw new UiCheckError(`${bad} capture${bad > 1 ? 's' : ''} not valid; fix the page and capture again`, 1);
}

const DISPATCH = { map: mapCmd, init: initCmd, capture: captureCmd };
// The CLI command names; SKILL.md may only mention these.
export const COMMANDS = Object.keys(DISPATCH);

async function main([cmd, ...rest]) {
  try {
    if (Object.hasOwn(DISPATCH, cmd)) await DISPATCH[cmd](rest);
    else {
      process.stderr.write(USAGE);
      process.exitCode = 2;
    }
  } catch (err) {
    process.stderr.write(`ui-check: ${String(err.message).split('\n')[0]}\n`);
    if (err.code === 2) process.stderr.write(USAGE);
    process.exitCode = err instanceof UiCheckError ? err.code : 1;
  }
}

// Run only as a script, so the tests and later commands can import the functions.
const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : null;
if (entry === self) main(process.argv.slice(2));
