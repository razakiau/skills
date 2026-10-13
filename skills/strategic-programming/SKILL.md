---
name: strategic-programming
description: Use when fixing a bug, adding a feature, or refactoring code in a repo. Before writing, a placement note names the owning layer, the precedent and every call site, and chooses tactical or strategic out loud; after, a bundled audit script measures the diff and every flag gets an answer. Doc-only and config-only changes go ahead without it.
license: MIT
metadata:
  version: "1.0.0"
  sources: "openclaw test-audit and deslop (MIT); Ousterhout, A Philosophy of Software Design, ch. 3"
---

# Strategic programming

A change lands in the **owning layer** of its concept, shaped like the **precedent** that already solves the same kind of problem, and covers every **call site** with the same need. The *tactical tornado* fixes each symptom where it shows up: a guard, a helper and a test beside the failing line, nothing replaced, so the codebase grows with every fix. *Strategic* is the default here; *tactical* is a choice you state, with its reason and its cost.

`<skill dir>` below is the folder holding this file. Call the script with `node`, exactly as written.

## Sizes

The script decides the size; you predict it from your plan before writing.

| Size | The change | Before | After |
| --- | --- | --- | --- |
| Small | exactly one non-test code file, no new code file, no new export, outside any shared package (test files beside it are fine) | one line: `owner: <layer>, precedent: <file:symbol>` | `audit`, answer its flags |
| Full | anything else | the five-part placement note | `audit` and `audit --dup`, answer every flag, the reading checks |
| Full + reviewer | Full, and it touches a shared package (or the owner asks) | as Full | as Full, plus a fresh reviewer |

A *shared package* is a workspace project that two or more other projects depend on, read from the dependency graph (nx, or `package.json` / `pnpm-workspace.yaml` workspaces). A repo with no workspace has none.

When `audit` reports a bigger size than you predicted, the bigger size applies from that moment: write the full note then, and run the steps that size adds.

## Steps

### 1. Record the start

Run `node <skill dir>/scripts/sp.mjs start` once per change, before writing any code. It prints `start: <sha> (<n> uncommitted files)` and records that point, uncommitted work included, so `audit` measures this change only. Done: the `start:` line is printed.

### 2. Read the code map

Read `.agents/code-map.md` at the repo root: concept rows (concept, home, path, precedent) and the **Invariants**, rules no graph shows. With no map, a Full change drafts one with [reference/code-map.md](reference/code-map.md) and the owner reviews it before it is saved. Done: you know which row, if any, covers the concept, and every invariant that applies.

### 3. Write the placement note

In chat, before any code. A Small change writes the one line from the table. Full writes all five parts:

1. **Owning layer**, with evidence: the code map row first, then the dependency graph (`nx graph --file=<tmp file>`, `graphify query "<concept>"`, or package manifests plus an import search). Rules placed in a shared package reach every consumer.
2. **Precedent**: the nearest existing code that solves the same kind of problem, as file and symbol. Search for the concept's name, then its siblings (other getters, other mappers of the same entity). The change copies the precedent's shape: its file, naming and signature style.
3. **Call sites**: every place in the repo with the same bug or need, found by search. List them all; a type checker misses many (loose null checks, `any`, dynamic access).
4. **Tactical or strategic**, with the cost of each. Strategic is the default. Tactical states its reason (urgency, a risky shared layer) and one line naming the root-cause fix for later.
5. **Tests**: for each test you plan, the behaviour it protects, the credible regression that fails it, and why the existing tests miss that regression. The gate and its rules are in [reference/tests.md](reference/tests.md); read it before the first test of the change.

Done: parts 1 to 3 each name a file, a symbol or a search result; part 4 names one choice; part 5 answers the three questions for every planned test.

### 4. Ask the owner when the note says so

Stop and ask, showing the note, when:

- the change lands in a shared package;
- it needs a new file with no precedent;
- the strategic fix is much bigger than the tactical one.

Done: no condition holds, or the owner answered.

### 5. Write the change

Extend the precedent in the owning layer and fix every call site from part 3. With a TDD skill loaded, the order is: the first failing test is the bug's regression, written as an extension of the owning test at the owning boundary; the gate in part 5 governs every test after that one. Done: the code and its tests are written and the tests pass.

### 6. Audit and answer every flag

Run `node <skill dir>/scripts/sp.mjs audit`; for Full, also `node <skill dir>/scripts/sp.mjs audit --dup`. It prints, line by line:

```
base: start <sha>          (or merge-base / root, when no start was recorded)
size: small | full | full+reviewer
shared: <projects> | none
code: +A -R  tests: +A -R
<status> <path> +A -R      (one line per code file: A added, M modified, R renamed, D deleted)
new files: ...
exports: <names> | none | not measured (<why>)
tests beside: <new test> (next to <existing test>) | none
unlisted home: <paths> | none     (or: code map: none / code map: no Path column / unlisted home: not measured (graph))
duplicates: run audit --dup | none | <n> new (<a> ~ <b>) | not measured (<why>)
```

A `base:` other than `start` means the numbers include earlier work on the branch: say so, and run `start` at the next change.

Answer each flag in your reply in one of three ways:

- **remove** the code;
- **justify** it against the placement note (which part of the note calls for it);
- for an **unlisted home**: propose a code-map row (the owner approves it) or move the file under a mapped path.

The numbers stand. `+300 -20` asks "why did nothing get replaced?"; a new file asks "why is the precedent's file the wrong home?"; a new export asks "who besides this change calls it?". Answer the question. Lines are a signal to explain: a diff gets smaller by replacing code in the owning layer, and every line that carries behaviour stays.

Then run the reading checks in [reference/audit-checks.md](reference/audit-checks.md) on the diff. Done: every flag line has an answer and every reading check has run.

### 7. Reviewer (Full + reviewer)

Dispatch a fresh subagent with the prompt in [reference/audit-checks.md](reference/audit-checks.md#fresh-reviewer). Answer its findings like flags. Done: its findings are answered, or it came back empty and you said so and did that review yourself.

## The end-of-turn hook

In a repo that opted in (a `.agents/code-map.md` at the root, or a recorded `start`), a hook runs at the end of each turn in which you changed non-test code. It may block once, handing you the `audit` output and asking you to answer every flag. Answer them as in step 6 and finish; the same diff does not block twice. A turn with no code change, or the owner's own edits between turns, passes silently.

## Out of scope

- Prose, comment and commit-message wording: the `no-slop` skill.
- A cleanup pass over code this change did not touch: `code-simplification`.
- Redesigning module boundaries: `improve-codebase-architecture`.
