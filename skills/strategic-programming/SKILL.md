---
name: strategic-programming
description: Use when fixing a bug, adding a feature or refactoring code, or when the strategic-programming audit blocks your turn. Before writing, a placement note names the owning layer, the precedent and the call sites, and states tactical or strategic. After, a bundled audit script measures the diff and each flag gets an answer. Doc- and config-only changes skip it.
license: MIT
metadata:
  version: "1.1.0"
---

# Strategic programming

A change lands in the **owning layer** of its concept, shaped like the **precedent** that already solves the same kind of problem, and covers every **call site** with the same need. The *tactical tornado* fixes each symptom where it shows up: a guard, a helper and a test beside the failing line, nothing replaced, so the codebase grows with every fix. *Strategic* is the default here; *tactical* is a choice you state, with its reason and its cost.

`<skill dir>` below is the folder holding this file. Call the script with `node`, exactly as written.

## Sizes

The script decides the size. You predict it from your plan and state it before writing; when `audit` reports a bigger size, the bigger size applies from that moment: write the full note then, and run the steps that size adds.

| Size | The change | Before | After |
| --- | --- | --- | --- |
| Small | at most one non-test code file, no new code file, no new export, no shared package (test files anywhere are fine) | `start`, then one line: `owner: <path>, precedent: <file:symbol>, call sites: <n> (<where searched>)` | `audit`, answer its flags |
| Full | anything else | `start`, then the five-part placement note | `audit --dup`, answer every flag, the reading checks |
| Full + reviewer | Full, and it touches a shared package (or the owner asks) | as Full | as Full, plus a fresh reviewer |

Only code files count: the extensions `ts tsx js jsx mjs cjs py go rs java kt swift rb php cs vue svelte`, generated files excluded. JSON, i18n catalogues, YAML and Markdown never count toward the size.

A *shared package* is a workspace project that two or more other projects depend on, read from the dependency graph (nx, or `package.json` / `pnpm-workspace.yaml` workspaces). A repo with no workspace has none, and a folder inside one app (`apps/backend/src/libs`) belongs to that app whatever its name. When the script cannot read the graph it prints `shared: not measured (graph)`, and the size is at least Full.

## Steps

### 1. Record the start

Run `node <skill dir>/scripts/sp.mjs start` before your first edit of this change, at every size. It prints `start: <sha> (<n> uncommitted files)` and records that point, uncommitted work included, so `audit` measures this change only. If you have already edited code for this change, leave `start` for the next change: `audit` then measures from the merge base (or an earlier `start`), and you say so. If you cannot run the script (a read-only session, or you were told not to), say so; `audit` falls back to the merge base. Outside git, `start` prints `sp: not a git repository`: skip the script steps, say so, and still run step 6's reading checks. Done: the `start:` line is printed, or you said why not.

### 2. Read the code map

Read `.agents/code-map.md` at the repo top: concept rows (concept, home, path, precedent) and the **Invariants**, rules no graph shows. A row's precedent can be stale: open its file and find the symbol before you copy it. When it is missing, say so in the note, use the nearest real code as the precedent, and propose the row fix. With no map, a Full change drafts one with [reference/code-map.md](reference/code-map.md) and the owner reviews it before it is saved. Done: you know which row, if any, covers the concept, its precedent exists or you said it does not, and you know every invariant that applies.

### 3. Write the placement note

In chat, before any code: state the predicted size, then the note for that size. A Small change writes the one line from the table. Full writes all five parts.

For a bug, first locate the line that produces the symptom, by reproducing it or reading to it, and say whether the code matches the report. When it does not (the code would throw where the report says it prints), ask the owner before going on, with the size you would predict for each reading of the report.

1. **Owning layer**, with evidence: the code map row first, then the dependency graph (`nx graph --file=<tmp file>`, `graphify query "<concept>"`, or package manifests plus an import search). Rules placed in a shared package reach every consumer. A concept can span layers: a fact derived in the domain, its mapping in a lib, its label in presentation. Name the owning layer of each piece the change touches; the invariants decide (no i18n in the domain, for example).
2. **Precedent**: the nearest existing code that solves the same kind of problem, as file and symbol. Search for the concept's name, then its siblings (other getters, other mappers of the same entity). The change copies the precedent's shape: its file, naming and signature style.
3. **Call sites**: every place in the repo with the same bug or need, found by search. List them all, or name the areas you could not search (search covered only the open workspace, a tool was missing). A type checker misses many (loose null checks, `any`, dynamic access).
4. **Tactical or strategic**, with the cost of each. Strategic is the default. Tactical states its reason (urgency, a risky shared layer) and one line naming the root-cause fix for later; the tactical tornado makes the same fix with neither.
5. **Tests**: for each test you plan, the behaviour it protects, the credible regression that fails it, and why the existing tests miss that regression. The gate and its rules are in [reference/tests.md](reference/tests.md); read it before the first test of the change.

Done: the predicted size is stated; parts 1 to 3 each name a file, a symbol or a search result; part 4 names one choice; part 5 answers the three questions for every planned test.

### 4. Ask the owner when the note says so

Stop and ask, showing the note, when:

- the code does not match the reported symptom;
- the change lands in a shared package;
- it needs a new file with no precedent;
- the strategic fix is much bigger than the tactical one: at least twice the files, or a shared package the tactical fix leaves alone. Count files, not net lines: a strategic fix that removes a copy can touch more files and still remove more lines than it adds.

Done: no condition holds, or the owner answered.

### 5. Write the change

Extend the precedent in the owning layer and fix every call site from part 3. With a TDD skill loaded: for a bug, the first failing test is its regression, written as an extension of the owning test at the owning boundary (it passes the gate by construction); every other test, and a feature's first test, passes the gate in part 5. Done: the code and its tests are written and the tests pass.

### 6. Audit and answer every flag

Run `node <skill dir>/scripts/sp.mjs audit`; for Full, run `audit --dup` instead (the same report plus new duplicates). It prints, line by line:

```
base: start <sha>          (or merge-base / root, when no start was recorded)
size: small | full | full+reviewer
shared: <projects> | none | not measured (graph)
code: +A -R  tests: +A -R
<status> <path> +A -R      (one line per code file: A added, M modified, R renamed, D deleted)
new files: <paths> | none
exports: <names> | none | not measured (<why>)   (read in TS/JS; other languages add: ; not measured (py))
tests beside: <new test> (next to <existing test>) | none
unlisted home: <paths> | none     (or: code map: none / code map: no Path column / unlisted home: not measured (graph))
duplicates: run audit --dup | none | <n> new (<a> ~ <b>) | not measured (<why>)
```

The `base:` sha after `start` is the snapshot's, not the HEAD sha step 1 printed, when there were uncommitted files; `(start point missing)` after it means the recorded start was lost.

A **flag** is any line not ending in `none`: a `size:` above your prediction, each `shared:` project, a `code:` line where added far exceeds removed, each new file, export, tests-beside pair, unlisted home and duplicate, and every `not measured`. `base:`, the per-file lines, `code map: none` and a Small change's `duplicates: run audit --dup` are facts. When the numbers include work from before this change (a `base:` other than `start`, or a `start` left from an earlier change), say so, and run `start` before your next change.

Answer each flag in your reply in one of three ways:

- **remove** the code;
- **justify** it against the placement note (which part of the note calls for it);
- for an **unlisted home**: propose a code-map row (the owner approves it) or move the file under a mapped path.

`unlisted home` covers new files in **shared** packages only. A new file anywhere else is never flagged there: check its path against the code map yourself, and answer a mismatch like an unlisted home.

The numbers stand. `+300 -20` asks "why did nothing get replaced?"; a new file asks "why is the precedent's file the wrong home?"; a new export asks "who besides this change calls it?". For a feature, "new behaviour; the precedent was extended, nothing duplicates it" is a complete answer. Lines are a signal to explain: a diff gets smaller by replacing code in the owning layer, and every line that carries behaviour stays.

Then run the reading checks in [reference/audit-checks.md](reference/audit-checks.md) on the diff. Done: each flag has one answer (remove, justify, or row/move) and every reading check has run.

### 7. Reviewer (Full + reviewer)

Dispatch a fresh subagent with the prompt in [reference/audit-checks.md](reference/audit-checks.md#fresh-reviewer). Answer its findings like flags. Done: findings answered; a `none` is reported as such; a reply with no text means you say so and do the review yourself, without retrying.

### 8. Before the pull request

A branch that holds several changes, or work from before this skill was loaded, gets one more pass before the pull request: run `audit --dup` from the merge base (no `start`), answer its flags, run the reading checks, and, for Full + reviewer, a fresh reviewer on that whole diff. Done: the branch's whole diff has been audited and reviewed once.

## The end-of-turn hook

The hook runs only in repos with `.agents/code-map.md` at the top, the editor's folder or a linked worktree of it (`git worktree add`); elsewhere step 6 is the only audit. It speaks after a turn in which you changed non-test code: at the end of the turn, or when you call `ask_user` mid-turn. It blocks at most once per distinct diff. The block starts `strategic-programming audit (see the strategic-programming skill):`, then a `repo:` line when the code is in a worktree, then the `audit` lines (at most 40 file lines, no duplicates line). Answer every flag as in step 6, then finish, or call `ask_user` again. The owner's edits between turns, and while you wait on `ask_user`, pass silently; without a turn record (no session id) it judges the editor's repo on its whole diff since the base.
