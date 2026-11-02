# The screen map

One file lists the app's screens: `docs/ui/screens.md`. When AGENTS.md has a line that starts with `Screen map: <path>` (a list marker before it is fine), the map lives at that path instead. A path outside the repo is refused.

Read the map before you change a screen. Query it with the script instead of grepping routes or taking screenshots at random.

## The marker

The first line of the file is exactly:

```text
<!-- ui-check screen map v1 -->
```

Every command that reads or edits the map checks it. A file without it belongs to another tool, and every command stops with:

```text
ui-check: docs/ui/screens.md is not a ui-check screen map; set "Screen map: <path>" in AGENTS.md
```

When you see this, do not edit that file and do not move it. Ask the owner for a `Screen map: <path>` line in AGENTS.md, then run `init`.

`init` writes the empty map from [the template](../templates/screens.md) and adds `.ui-check/` to `.gitignore`. It prints `wrote <path>`, or `kept <path> (exists)` when the map is already there, then `added .ui-check/ to .gitignore` when it had to add the line.

## An entry

One `## <screen name>` heading per screen, followed by `key: value` lines:

```text
## home
route: /
file: src/home.tsx
purpose: today's summary and a link to the report
family: tab-root
states: empty, loaded, error
mockup: docs/ui/mockups/home-360-light.png (approved 2026-01-15, owner)
design-source: docs/ui/tokens.css
siblings: report, settings
last-capture: 2026-01-20 sha256:3f2a9c1d0e4b 1440-dark 1440-light 360-dark 360-light
approved: docs/ui/approved/home-1440-light.png docs/ui/approved/home-360-light.png (2026-01-20, owner)
```

The screen name can be any text. The script matches it by its slug, so `map settings-billing` finds `## Settings / Billing`. Two entries with the same slug are an error, never a silent pick.

Other lines are allowed: prose, blank lines, unknown keys, CRLF endings. `record` and `approve` change only their own line and leave every other byte as it was. A file that mixes CRLF and LF endings is refused until it is normalised.

## Fields and who writes them

| Field | Holds | Written by |
| --- | --- | --- |
| `route` | The URL path, or the native screen name | The loop |
| `file` | The files that render the screen, comma-separated, relative to the repo top | The loop |
| `purpose` | What the screen is for, in one line | The loop |
| `family` | The layout family, such as `tab-root` or `detail`; comma-separated when there are several | The loop |
| `states` | The states worth capturing: `empty`, `loaded`, `error`, `long content` | The loop |
| `siblings` | Screens that should look like this one, comma-separated | The loop |
| `last-capture` | `<YYYY-MM-DD> sha256:<12 hex> <variant> [<variant>...]` | `record` |
| `mockup` | The approved mockup: `<path> (approved <date>, <name>)` | `approve --mockup`, on the owner's words only |
| `approved` | The approved captures: `<path> [<path>...] (<date>, <name>)` | `approve --captures`, on the owner's words only |
| `design-source` | The DESIGN.md or tokens file that sets the values | From AGENTS.md or DESIGN.md: copy the path they name |

The loop writes the first six by hand, the first time it touches a screen. There is no upfront crawl. Fill `route` and `file` from the framework's route table when it has one, and from reading the code when it does not.

An agent never writes `mockup` or `approved` itself, and never runs `approve` until the owner says, in words, that a mockup or capture is approved.

## Queries

Run these instead of grepping:

| Question | Command |
| --- | --- |
| Which screens are there? | `node <skill dir>/scripts/uicheck.mjs map` |
| What does the map say about settings? Its mockup? | `node <skill dir>/scripts/uicheck.mjs map settings` |
| Which screens use the tab bar layout? | `node <skill dir>/scripts/uicheck.mjs map --family tab-root` |
| What are the siblings of report? | `node <skill dir>/scripts/uicheck.mjs map --sibling-of report` |
| Which screens does my change touch? | `node <skill dir>/scripts/uicheck.mjs touched` |
| Which entries are out of date? | `node <skill dir>/scripts/uicheck.mjs stale` |

Give at most one of `<screen>`, `--family` and `--sibling-of`.

What `map` prints:

- `map`: every screen name, one per line, as written in its heading.
- `map <screen>`: the entry's lines as written, from its `## ` heading to its last line, without trailing blank lines.
- `map --family <family>`: the names of the screens whose `family:` lists that family.
- `map --sibling-of <screen>`: the names in that screen's `siblings:` line, as written, one per line, including names with no entry.

With `--json`, each form prints `{"screens": [...]}` instead, where each element is:

```json
{ "name": "home", "slug": "home", "fields": { "route": "/", "file": "src/home.tsx" }, "line": 4 }
```

`line` is the 0-based line number of the entry's heading. For `map --json <screen>`, `screens` holds that one entry. For `map --json --sibling-of <screen>`, it holds the entries of the siblings that exist in the map; a sibling with no entry is left out.

An unknown screen exits 1 with `ui-check: unknown screen <name>`. A missing map exits 1 with `ui-check: no screen map at <path>; run init`.

## Staleness

```sh
node <skill dir>/scripts/uicheck.mjs stale --routes routes.json
```

`stale` reads the map and edits nothing. It prints:

- `stale <name> (<file field> changed since <date>)`: the hash of the entry's files no longer matches its `last-capture:`. The parentheses hold the whole `file:` field, not only the file that changed.
- `gone <name> (<files>)`: a listed file is missing, or its path resolves outside the repo top.
- `unmapped <route>`: a route in the routes file that no entry's `route:` matches exactly.
- `routes: not checked (pass --routes)`, when you gave no routes file.
- A last line: `stale: <n>, gone: <n>, unmapped: <n>`.

It exits 0 whatever it finds. A routes file that is missing, or JSON that is not an array of strings or `{"path": ...}` objects, exits 2. The routes path is taken from the current directory, not the repo top. `--routes -` reads the JSON from stdin.

An entry with no `file:` line is skipped. An entry with no `last-capture:` cannot be stale; only `gone` applies to it. To clear a `stale` line, run the loop on the screen and `record` it.

The hash is `sha256:` and the first 12 hex digits of SHA-256 over the entry's files, sorted by path and joined with a NUL byte. It covers content, not commits, because captures happen before the commit.

## Route tables

`stale --routes` needs a JSON array of full route paths, such as `["/", "/report", "/settings"]`. Build it from the framework's route table, or by reading the router code when there is none:

| Framework | Where the routes are |
| --- | --- |
| React Router (framework mode) | `npx react-router routes --json` prints a nested tree; join each `path` with its parents' paths |
| Next.js | The folders under `app/` that hold a `page` file, or the files under `pages/`; drop route groups in parentheses |
| Nuxt | The files under `pages/`; with nuxt-mcp-dev running, ask it for the routes |
| TanStack Router | The generated route tree, usually `src/routeTree.gen.ts` |
| Expo Router | The files under `app/`; drop groups in parentheses and `_layout` files |
| SvelteKit | The folders under `src/routes/` that hold a `+page` file |
| Anything else | The router's configuration in the code |

Dynamic segments (`/report/:id`, `/report/[id]`) are kept as written. Write the same form in the entry's `route:`, since `unmapped` compares strings exactly.

## Captures

Working captures live in `.ui-check/captures/`, which `init` gitignores. Approved captures live in `docs/ui/approved/` and are committed.

- `record <screen>` reads only files named `<slug>-<width>-<theme>[-<state>].png` in the capture folder, where `<width>` is digits and `<theme>` is `light` or `dark`. Other files are ignored. It records every matching file there, so clear older captures before a run ([loop.md, step 2](loop.md#2-capture)).
- `record` needs a `file:` line, and refuses an entry whose files are missing or outside the repo top (exit 1).
- `approve --captures` copies the same files to `docs/ui/approved/`. It overwrites files of the same name there, and it does not delete older approved files the new set lacks. Delete those by hand, with the owner's yes, when a variant is dropped.
- `--out <dir>` points `record`, `approve` and `capture` at another capture folder. A relative path is taken from the repo top.
