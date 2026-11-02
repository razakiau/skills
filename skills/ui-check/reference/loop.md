# The loop

Run it after any change that touches a screen, before you report the change as done. The examples use a demo app with three screens: `home`, `report` and `settings`.

Run every command from the repo top, as `node <skill dir>/scripts/uicheck.mjs <command>`. There is no `uicheck` binary.

## Sizes

Pick the row that fits the change before you start. Do not run the full loop on a colour tweak.

| Change | What to run |
| --- | --- |
| Style tweak on one screen | Capture that screen at 360 light, compare with its mockup, report (no reviewer) |
| One screen's layout or content | Full loop, that screen |
| New screen or shared component | Full loop, every touched screen plus 1 sibling each |

For a style tweak: run step 2 with `--widths 360 --themes light`, compare the capture with the screen's mockup yourself, then do step 6. Skip steps 4 and 5. When the screen has no approved mockup, compare with one sibling capture instead.

## 1. Find the screens

```sh
node <skill dir>/scripts/uicheck.mjs touched
```

It compares the work tree with `HEAD` and counts untracked files too. On a branch, pass the point where it left main: `touched $(git merge-base main HEAD)`. A plain `touched main` also lists the files main changed since then. It prints one line per hit:

```text
screen home (src/home.tsx)
shared src/components/tab-bar.tsx
  used by home
  used by report
```

- `screen <name> (<files>)`: a screen whose `file:` the change edits.
- `shared <file>`: a changed UI file (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`) that no entry owns.
- `  used by <name>`: a screen whose own files import that shared file by name. This is a hint. It does not follow path aliases, index files or re-exports. When a `shared` line has no `used by` line under it, search the code for its importers yourself.

Every screen listed is touched. A touched screen with no entry gets one now: add a `## <name>` heading with `route:`, `file:`, `purpose:`, `family:`, `states:` and `siblings:` ([map.md](map.md)). When the repo has no map file, run `init` first.

For a new screen or a shared component, add 1 sibling for each touched screen:

```sh
node <skill dir>/scripts/uicheck.mjs map --sibling-of report
node <skill dir>/scripts/uicheck.mjs map --family tab-root
```

Done: you have a list of screens to capture, and each one has an entry in the map.

## 2. Capture

Start the app's dev server and keep it running. Use real or seeded data, not lorem ipsum. Clear the older captures of each screen you capture, siblings included, so the review and step 6 see only this run, then capture. The pattern uses the screen's slug; run the `find` once per screen:

```sh
mkdir -p .ui-check/captures && find .ui-check/captures -name 'report-[0-9]*.png' -delete
node <skill dir>/scripts/uicheck.mjs capture --url http://localhost:5173/report --screen report
```

The `[0-9]` in the pattern spares the captures of another screen whose name starts the same way, such as `report-archive`.

- The defaults are `--widths 360,1440 --themes light,dark`. The viewport is 800 px high below 1024 px wide and 900 px high from 1024 px. Each capture is a full page, with reduced motion and a 300 ms settle after the network goes idle.
- When the screen's mockup has another phone width, add it: `--widths 360,390,1440`.
- When the app has one theme only, pass `--themes light`.
- For each state the change affects (empty, loading, error, long content), bring the app into that state at a URL and capture it with `--state <s>`, for example `--state empty`.
- Files go to `.ui-check/captures/<screen>-<width>-<theme>[-<state>].png`, with the screen and state as slugs (`Settings / Billing` becomes `settings-billing`). Each file written prints `wrote <file>`.

When `capture` fails:

| Output | Meaning | Do |
| --- | --- | --- |
| `ui-check: could not reach <url>` (exit 1) | Nothing answered at the URL. No PNG was written. | Start the dev server or fix the URL, then capture again. |
| `ui-check: could not load <url>: <reason>` (exit 1) | The page did not finish loading. | Fix the page or the URL, then capture again. |
| `warn <file>: error overlay` or `warn <file>: empty page`, then `ui-check: 1 capture not valid; fix the page and capture again` (exit 1) | The page showed a framework error overlay, or no text. That file was not written, and an older file of that name was deleted. | Fix the page, then capture again. |
| `ui-check: no playwright in <dir>; capture with the browser MCP instead (reference/providers.md)` (exit 3) | The app has no `playwright` or `@playwright/test` package. | Capture with a browser MCP ([providers.md](providers.md#capture-with-a-browser-mcp)). |
| `ui-check: playwright in <dir> could not launch chromium: <reason>` (exit 3) | Playwright is there, its browser is not. | Run `npx playwright install chromium` in the app if the owner allows it, or capture with a browser MCP. |

With no browser of any kind, stop here and say "not checked" in the report ([providers.md](providers.md#no-browser)).

Done: every screen on the list has a valid PNG for each width, theme and state, all from this run.

## 3. Compare

For each captured screen, read its entry:

```sh
node <skill dir>/scripts/uicheck.mjs map report
```

This prints the entry's lines as written in the map. From it, take:

- `mockup:` the approved mockup, when the line exists. The path is the part before ` (approved `. Never use a mockup the owner has not approved.
- `approved:` the approved captures of the built screen, when the line exists.
- `siblings:` capture 1 or 2 of them in this same run, at the same widths and themes, so the comparison is like for like.
- `design-source:` the DESIGN.md or tokens file. When the line is missing, use the design source that AGENTS.md or DESIGN.md names.

Without an approved mockup, the comparison uses the siblings and the design source only.

Done: each screen has its captures, its mockup or a note that it has none, its sibling captures and its design source.

## 4. Review

Start a fresh subagent that did not build the change. Give it the brief in [reviewer.md](reviewer.md), verbatim, with its inputs filled in: the capture paths, the mockup path, the sibling capture paths, the design source path and the change's intent in one line. Give it nothing else from the build thread: no plan, no diff, no summary of what you did.

When your harness cannot start a subagent, say so in the report and do not call the result reviewed.

Done: the reviewer returned a disposition line and its list.

## 5. Fix and repeat

Read the first line of the reply:

- `disposition: recapture`: a capture is missing or not valid. Capture the files it names again (step 2) and review again.
- `disposition: fix`: fix every `fix` item, capture the touched screens again, and start a new fresh reviewer with the same brief, the new captures and the previous list.
- `disposition: ship`: go to step 6.

Keep `adaptation` items: they are intended differences, reported with their reason. `ask` items are for the owner; do not decide them yourself.

Each review is one round, `recapture` included. After round 3, stop even if `fix` items remain, and report them as open.

Done: the disposition is `ship`, or 3 rounds have run.

## 6. Report and record

Report to the owner:

1. The final captures, inline as images, phone first. Paths alone are not enough.
2. The differences found and fixed, one line each.
3. The `adaptation` items, each with its reason.
4. The `ask` items, as questions.
5. What was not checked, and why: no dark theme, no browser, the round limit.

Then record each screen the change touched, once its files stop changing. Do not record the siblings you captured only to compare:

```sh
node <skill dir>/scripts/uicheck.mjs record report
```

It prints `recorded report: 1440-dark 1440-light 360-dark 360-light` and writes `last-capture:` in the map. Commit the map with the change.

Only when the owner says in words that a capture or a mockup is approved:

```sh
node <skill dir>/scripts/uicheck.mjs approve report --by <owner name> --captures
node <skill dir>/scripts/uicheck.mjs approve report --by <owner name> --mockup docs/ui/mockups/report-360-light.png
```

`--captures` copies the screen's captures to `docs/ui/approved/` and prints `copied <path>` for each one. Commit them. `--mockup` takes a path relative to the repo top, and the file must exist; it prints `approved mockup <path> for <screen>`.

Done: the owner has the report with the captures inline, and the map records this run.
