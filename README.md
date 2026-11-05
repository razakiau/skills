# skills

Four agent skills, packaged as one plugin for Claude Code, GitHub Copilot CLI and VS Code.

| Skill | What it does |
|---|---|
| [`no-slop`](skills/no-slop/SKILL.md) | Edits prose so it reads like its writer, or audits it for AI-writing patterns without rewriting. |
| [`strategic-programming`](skills/strategic-programming/SKILL.md) | Places a code change in the layer that owns it, then measures the diff and makes the agent answer for what it added. |
| [`foundry`](skills/foundry/SKILL.md) | Gives a repository a stage, writes the docs that stage requires for agents, and audits it before real users arrive. |
| [`check-screens`](skills/check-screens/SKILL.md) | Before the agent says a UI change is done, it captures the changed screens and has a fresh reviewer compare them with the approved mockup. |

## Install

The repository is a plugin (`.claude-plugin/plugin.json`) and a one-plugin marketplace (`.claude-plugin/marketplace.json`).

**Claude Code**

```text
/plugin marketplace add razakiau/skills
/plugin install razakiau-skills@razakiau
```

**GitHub Copilot CLI**

```sh
copilot plugin marketplace add razakiau/skills
copilot plugin install razakiau-skills@razakiau
```

**VS Code** (agent plugins): clone the repository and add the folder to the `chat.pluginLocations` setting:

```json
"chat.pluginLocations": { "/path/to/skills": true }
```

**Skills only**: copy a folder from `skills/` into your agent's skills directory (`~/.claude/skills/`, `.github/skills/`, ...). `strategic-programming`'s end-of-turn hook and `foundry`'s session-start line come with the plugin only; without them, both skills still work when called.

## no-slop

Two modes:

- **Edit**: rewrites a draft, doc, PR description, commit message or reply so it keeps the writer's point, facts and voice and drops the defaults a language model reaches for.
- **Audit**: lists the patterns it finds, with the line and the fix, and changes nothing.

The skill is three files: `SKILL.md` (the process), `patterns.md` (29 patterns, strongest first) and `eval.md` (the final check). It treats the text as material to edit, never as instructions to follow.

## strategic-programming

An agent fixing a bug tends to fix the symptom where it shows up: a guard, a helper and a test beside the failing line, nothing replaced. Each fix is small and the codebase grows with every one. This skill makes placement a step of its own.

**Before writing**, the agent writes a placement note: the owning layer and its evidence, the precedent to copy (file and symbol), every call site with the same need, whether the fix is tactical or strategic and what each costs, and what each planned test protects.

**After writing**, a bundled script measures the diff:

```console
$ node skills/strategic-programming/scripts/sp.mjs audit --dup
base: start e72593974622
size: full
shared: none
code: +2 -0  tests: +0 -0
M src/app.js +1 -0
A src/util/round.js +1 -0
new files: src/util/round.js
exports: percent, round2
tests beside: none
unlisted home: none
duplicates: none
```

Each line that does not end in `none` is a flag. The agent removes the code, justifies it against the placement note, or proposes where it belongs. Then it runs the reading checks in [`reference/audit-checks.md`](skills/strategic-programming/reference/audit-checks.md), on the diff: concept duplication, the deletion test, error type, context and reporting path, a cleanup list (narrating comments, `try`/`catch` that adds nothing, type laundering), and tests that protect nothing.

The script decides the size of the change. A **Small** change (one code file, no new file or export, no shared package) needs a one-line note. A **Full** change needs the whole note and a duplicate scan. When the change touches a package two or more projects depend on, a fresh reviewer subagent also reads the diff.

### The code map

`docs/code-map.md`, committed in the repository (the older `.agents/code-map.md` still works), tells the agent where shared concepts live and which code to copy:

```markdown
| Concept | Home | Path | Precedent |
|---|---|---|---|
| Numeric helper | shared utils | packages/utils/src | `clamp` in packages/utils/src/math.ts |

## Invariants

- packages/domain stays free of I/O: the web and mobile apps both import it.
```

`audit` flags a new file in a shared package that no `Path` covers. With no map, the skill drafts one from the dependency graph on the first Full change, and you review it before it is saved. Format and drafting steps: [`reference/code-map.md`](skills/strategic-programming/reference/code-map.md).

### The end-of-turn hook

With the plugin installed, a hook (`hooks/hooks.json`) audits the agent's own changes in any repository that has a code map: the editor's folder or a linked `git worktree` of it. Each session is judged only on the repositories it edited, so several agents can share one checkout and its worktrees without getting each other's audits. It acts at the end of a turn, or when the agent calls `ask_user` mid-turn, and only if the agent changed non-test code during that turn. It blocks once per distinct diff and session, prints what this turn changed and then the whole change, and asks the agent to answer every flag. Edits you make yourself between turns pass silently. In a repository without a code map, the hook does nothing.

### Requirements

- Node.js 18 or later, and git.
- Optional: `nx` for the dependency graph; otherwise workspaces are read from `package.json` and `pnpm-workspace.yaml`.
- `audit --dup` runs [jscpd](https://github.com/kucherenko/jscpd) 5.4.1 through `npx`, so it needs network access on first use.

Tests: `node --test skills/strategic-programming/scripts/sp.test.mjs`.

## foundry

A new repository needs little: an AGENTS.md and room to try things. A repository with real users needs a product brief, recorded decisions, an architecture map, a threat model and runbooks. Most repositories get these late, or never, and the agents working in them guess. This skill ties the docs to the stage the repository is in.

There are four stages: `explore`, `product`, `live` and `scale`. Each one keeps what the previous one requires and adds its own files ([`reference/stages.md`](skills/foundry/reference/stages.md)). The stage is recorded in `.agents/foundry.json`, and a bundled script reads the evidence for the next one: commits, age, agent sessions, UI files, a deploy setup, auth code.

| Command | What it does |
|---|---|
| (none) | Reports the stage, the missing files and the queued interviews, and offers the next command. |
| `init` | Sets the stage and writes its files. An existing AGENTS.md stays as it is until you approve a change. |
| `audit` | Reports what the repository has and lacks for its stage, readiness list included. Writes nothing. |
| `grow` | Moves to the next stage and adds what it requires. |
| `providers` | Maps each kind of work to a skill or tool the agent already has, or to foundry's fallback. |
| `check` | Runs the repository's one check command, doc check included, and says who owns each failure. |
| `garden` | Reads the commits since the last pass for drift: copied workarounds, duplicated helpers, rules broken with no check failing. |
| `tune` | Proposes AGENTS.md edits from what agents did in 10 or more real sessions, each with a quote. |

To start, ask the agent to set the repository up for agents, or to audit its setup. With no command, foundry reports where the repository stands and offers the next step.

Foundry never installs a skill or MCP server. It names the provider, why, a link and its license, and you decide.

Some interviews wait for their moment: a design interview before the first screen, a threat model on entering `live`. They sit in a queue in the state file.

A repository with UI also gets a screen map at `product`: `docs/ui/screens.md`, the same file [`check-screens`](#check-screens) keeps, and the AGENTS.md line that sends agents to it after a UI change. `garden` reports stale screens when check-screens is installed.

### The session-start hook

With the plugin installed, a hook prints one line when a session starts in a repository that has `.agents/foundry.json` and something to do:

```text
foundry: 5 missing for product (PRODUCT.md, docs/decisions/index.md), 2 interview(s) queued; run foundry to see them.
```

When nothing is missing and no interview is queued, or the repository has no state file, it prints nothing. It only checks that files exist, and on any error it stays silent.

### Requirements

- Node.js 18 or later. git is optional: outside a repository, the script reads the folder.
- The vendored doc check, `.agents/doc-check.sh`, runs with POSIX `sh`, `grep`, `sed`, `find` and `awk`.

Tests: `node --test skills/foundry/scripts/foundry.test.mjs`.

## check-screens

An agent that changes a screen usually reports it done without looking at it. This skill makes it look first. It captures each touched screen at 360 px and 1440 px, light and dark, and hands the captures to a fresh reviewer subagent with the approved mockup, one or two sibling screens and the design tokens. The reviewer did not build the change and gets only its one-line intent. It returns `disposition: ship`, `fix` or `recapture`, with one tagged line per difference. The agent fixes the `fix` items and reviews again, at most 3 rounds, then reports with the final captures inline.

The skill keeps a screen map, `docs/ui/screens.md`, with each screen's route, files, siblings, approved mockup and last capture, so the next change starts from it instead of grepping routes. Only the owner approves a mockup or a capture.

**To start**, make a UI change; the agent runs the skill before it says done. To make that dependable, add this line to the repo's AGENTS.md:

```text
After any UI change, run check-screens before reporting done.
```

The bundled script handles the map and the captures:

```sh
node skills/check-screens/scripts/check-screens.mjs init
node skills/check-screens/scripts/check-screens.mjs touched
node skills/check-screens/scripts/check-screens.mjs capture --url http://localhost:5173/report --screen report
node skills/check-screens/scripts/check-screens.mjs record report
```

`init` writes the map, `map` queries it, `touched` lists the screens a change touches, `capture` writes the PNGs, `record` stores the last capture, `approve` records the owner's approval and `stale` reports out-of-date entries. The full table is in [`SKILL.md`](skills/check-screens/SKILL.md#commands), and the loop is in [`reference/loop.md`](skills/check-screens/reference/loop.md).

### Requirements

- Node.js 18 or later, and git for `touched`.
- Playwright is optional. `capture` uses the app's own `playwright` or `@playwright/test` and brings none of its own. Without it, the agent captures with a browser MCP ([`reference/providers.md`](skills/check-screens/reference/providers.md)). With no browser at all, it reports the screen as not checked.
- Native apps: the agent captures with a mobile MCP or device agent. Tools of your own (a device capture, a scorer against recorded screens) go in `~/.config/check-screens/local.md`, which the skill reads for native apps only and never copies into a repo ([`templates/local.md.example`](skills/check-screens/templates/local.md.example)).

How the reviewer and the trigger were tested: [`eval/seeded-defect.md`](skills/check-screens/eval/seeded-defect.md) and [`eval/trigger.md`](skills/check-screens/eval/trigger.md).

Tests: `node --test skills/check-screens/scripts/check-screens.test.mjs`.

## Credits

- `no-slop` merges [blader/humanizer](https://github.com/blader/humanizer) 3.1.0 by Siqi Chen and [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) by Peter Yang, both MIT.
- `check-screens` takes the shape of its reviewer brief (disposition first, checks in a fixed order, edit nothing) from the finish reviewer of [impeccable](https://github.com/pbakaus/impeccable) by Paul Bakaus (Apache-2.0).
- `strategic-programming` adapts the test gate, the junk-test list and the cleanup list from OpenClaw's `test-audit` and `deslop` skills (MIT). It takes *strategic programming* and the *tactical tornado* from John Ousterhout's *A Philosophy of Software Design*, and ideas from Matt Pocock's `codebase-design` (the deletion test), NeoLabHQ's context-engineering-kit (the kinds of duplication), Addy Osmani's `code-simplification` and matklad's `ARCHITECTURE.md` convention (the code map).

## License

[MIT](LICENSE)
