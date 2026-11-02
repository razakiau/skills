---
name: check-screens
description: Use after changing any screen, page or UI component, before saying it is done. Captures the running app at phone and desktop sizes, has a fresh reviewer compare it with the approved mockup and sibling screens, and keeps the screen map. Backend-only changes skip it.
license: MIT
metadata:
  version: "1.0.0"
---

# check-screens

Run this after any change that touches a screen, and before you say the change is done. You look at your own result first, at phone and desktop sizes, so the owner does not have to.
The screen map, `docs/ui/screens.md`, records each screen's route, files, siblings, approved mockup and last capture ([reference/map.md](reference/map.md)). Read it instead of grepping routes.

## Setup

`<skill dir>` below is the folder holding this file. Call the script with `node`, exactly as written: `node <skill dir>/scripts/check-screens.mjs map` lists the screens in the map. The script needs Node.js 18 or later. `touched` needs git, and `capture` needs Playwright in the app; without it, use a browser MCP ([reference/providers.md](reference/providers.md)).

## The loop

First pick the size of the loop from the table in [reference/loop.md](reference/loop.md#sizes). Then:

1. Find the screens the change touches, with `touched` and the map ([loop.md, step 1](reference/loop.md#1-find-the-screens)).
2. Capture them at 360 px and 1440 px, light and dark, plus each state the change affects ([loop.md, step 2](reference/loop.md#2-capture)).
3. Compare with the approved mockup, one or two siblings and the design source ([loop.md, step 3](reference/loop.md#3-compare)).
4. Hand the captures to a fresh reviewer with [reference/reviewer.md](reference/reviewer.md) ([loop.md, step 4](reference/loop.md#4-review)).
5. Fix the `fix` items, capture again and review again, at most 3 rounds ([loop.md, step 5](reference/loop.md#5-fix-and-repeat)).
6. Report with the final captures inline, then record them in the map ([loop.md, step 6](reference/loop.md#6-report-and-record)).

## Commands

| Command | What it does | Exits 1 when |
| --- | --- | --- |
| `map [--json] [<screen> \| --family <family> \| --sibling-of <screen>]` | Prints screen names, one entry, a family or the siblings of a screen | the screen is unknown |
| `init` | Writes `docs/ui/screens.md` from [templates/screens.md](templates/screens.md) and adds `.check-screens/` to `.gitignore` | the file at that path is not a check-screens map |
| `capture --url <url> --screen <name> [--widths 360,1440] [--themes light,dark] [--state <s>] [--out .check-screens/captures]` | Writes one PNG per width and theme; exits 3 with no Playwright | the URL fails, or a page is blank or shows an error overlay |
| `touched [<base>]` | Lists the screens and shared UI files changed since `<base>` (default `HEAD`) | git cannot diff against `<base>`; outside a git repo it exits 2 (`touched needs git`) |
| `record <screen> [--out .check-screens/captures]` | Writes `last-capture:` with today, the file hash and the variants found | there are no captures, or a `file:` is missing or outside the repo |
| `approve <screen> --by <name> (--mockup <path> \| --captures) [--out .check-screens/captures]` | Records the owner's approval; `--captures` copies to `docs/ui/approved/` | the mockup or the captures are missing |
| `stale [--routes <file\|->]` | Reports `stale`, `gone` and `unmapped` entries; edits nothing | never for findings; a bad routes file exits 2 |

Every command exits 0 on success and 2 on a usage error. Every command but `init` and `capture` also exits 1 when the map is missing or foreign. On any failure, the first line on stderr starts with `check-screens: `; a usage error (exit 2) then prints the usage text. A missing or unknown command prints only the usage text.

## Rules

- Never approve for the owner. Run `approve` only after the owner says, in words, that the mockup or capture is approved, and pass the owner's name to `--by`.
- Never say a screen was checked without a capture of it from this change. With no browser, say "not checked" ([reference/providers.md](reference/providers.md#no-browser)).
- At most 3 review rounds. After the third, stop and report what is left.
- The report shows the final captures inline, not only their paths.
- A screen map without the marker line belongs to another tool. Stop and ask the owner for a `Screen map: <path>` line in AGENTS.md.
