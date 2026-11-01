# Foundry: a stage-aware skill for growing a product with agents

**Date:** 2026-11-01. **Status:** approved by the owner on 2026-11-01.
**Evidence:** the owner's agent history from 2026-09-24 to 2026-11-01, his repos, his saved sources, and two research rounds. It is summarised below. For each choice, [2026-11-01-foundry-sources.md](2026-11-01-foundry-sources.md) gives where it comes from, with links.

## Why

The owner builds several greenfield products a month with agents: chineur, kerdoscope, skeuograph, AIRI, Specifica, and a thesis platform before them. Superpowers (brainstorming → writing-plans → subagent-driven-development) runs nearly every change and works well for one feature at a time. What goes wrong is the level above the feature.

Evidence from his history:

- **Projects start inside long chats, and the decisions stay there.** chineur, AIRI, skeuograph and kerdoscope each began in a zhomelab chat of 110 to 155 messages, before they had a repo.
- **Durable docs come late or never.** chineur's AGENTS.md arrived on day 15 and is 13 lines about release notes. kerdoscope and skeuograph have only Impeccable's PRODUCT.md and DESIGN.md. None of his own repos has an architecture doc.
- **Specifica reconstructed its docs on day 3.**
  - Day 1: research, brainstorm, plan, and subagents building.
  - Day 2: the owner said the screens "look super cheap".
  - Day 3: he asked "did we record our design?" and "why no password rules, is our implementation just naive?"
  - Decision 0040 then says: "Decisions were scattered across the brief, specs, PRs and chat context." docs/product (vision, glossary, 47 decisions) was written after the fact.
- **The thesis platform was rewritten four times** in three weeks (v1 to v4).
- **Skills built for this level go unused.** Across his CLI and Agent Host sessions, brainstorming ran 52 times and writing-plans 44 times. wayfinder, grill-with-docs, to-spec, to-tickets, documentation-and-adrs, constraint-driven-development, codebase-design and prototype ran zero times, and domain-modeling once.
- **The counterexample is runnerd** (ayagmar's repo).
  - From day one it had AGENTS.md (the check commands and where code goes), ARCHITECTURE.md, ADRs, and boundary rules enforced by scripts.
  - Over 8 days it wrote 82 ADRs, and 62 commits touched ARCHITECTURE.md.
  - 22% of its commits are fixes, against 24% to 46% in the owner's repos.

What the research says (citations in the session notes):

- **Strong models need less structure, but only for short work.** With frontier models, spec format "barely matters" for short work. Anthropic dropped sprint planning for Opus 4.6. So exploring stays light.
- **Agent-built code degrades over time.** Agents solve up to 13.1% fewer tasks on code other agents wrote. In the Cursor study, the speed gain faded while complexity persisted. Long-lived products need more than prompts.
- **Rules work when they run as checks.** Compliance was 88% for executable checks against 67% for prose. Pocock's order of what makes agent output trustworthy is architecture, then static analysis, then rules, then skills, then style guide.
- **Context files alone barely help, and stale ones hurt.** Files written by an LLM lowered task success. Agents followed a stale instruction file over the code 90% of the time. One sentence giving the code precedence moved code-following from 4.2% to 91.4%.
- **A short definition of done beats a long checklist.** A short "production-ready" criterion cut reintroduced vulnerabilities by 14.8 points. A detailed technical spec made them 20 points worse. 91% of 200 deployed vibe-coded apps had at least one vulnerability, mostly broken access control.
- **Small batched edits beat incident-driven rules.** Learning an AGENTS.md from session logs in batches, with small edits under a token budget, matches ACE and GEPA. The gains are real but small per repo.
- **Variants beat a single thread for design.** Generating several variants and then picking one beats refining one design, which tends to fixate on its first idea.

## What foundry is

One skill, `foundry`, in this repository, shaped like Impeccable: a router `SKILL.md`, one reference file per command, and a bundled dependency-free Node script for the exact parts.

1. **It gives a repo a stage.** It works out the stage from the repo's own state, the owner confirms it, and it records the stage in the repo.
2. **Each stage names the themes the repo needs covered**, such as product intent, decisions, design system, quality bar, verification and security.
3. **For each theme, it finds a provider among the skills and tools the agent actually has.** It falls back to its own minimal template when there is none, and recommends a skill to install when a fallback isn't good enough.
4. **It writes the minimum skeleton the stage needs.** That skeleton includes a check script committed to the repo, which works without the skill.
5. **It keeps the skeleton true over time:** freshness checks, gardening passes, and an AGENTS.md tuned from the agents' own sessions.

Superpowers stays the per-feature loop. Foundry decides what surrounds that loop and makes sure decisions taken during it land in durable files.

## Goals

- A new repo has, from its first session, what its stage needs. An agent can then work without a chat that remembers.
- A product-level decision made anywhere (a brainstorm, a review, a fix round) ends up in a file the next agent reads.
- The rules of the repo are scripts that fail, wherever a script can express them.
- Moving to the next stage is proposed from evidence; the owner never has to declare it unprompted.
- It works with any skill set: the owner's library, someone else's, or none.
- It works in Claude Code, GitHub Copilot CLI and VS Code, like the other skills here.

## Non-goals for v1

- Sparklin and other repos with outside contributors and existing conventions (later).
- Autopilot: unattended runs, triggers, merge without review (project 3).
- A live attack harness, a feature map, or an app-driving CLI for verification (project 2). v1 records how an agent verifies its work and which tool it uses; it does not build that tooling.
- Reading VS Code local chat sessions (workspaceStorage) for `tune`.
- Issue-tracker integration beyond what provider skills already do.

## Anti-goals: it fails if it does any of these, even if it works

- **It becomes a cookie-cutter.** Every repo ends up with the same files whether it needs them or not.
- **It becomes a ceremony.** The owner reviews more markdown than code. Böckeler: "I'd rather review code than all these markdown files."
- **It writes long docs nobody reads.** Or it lets AGENTS.md grow by appending a rule after every incident.
- **It installs skills on its own.** It must not pull code or agent-steering text from outside without review.
- **It runs expensive work on every change.** No pentests or full audits on every commit.
- **It becomes a second BMAD.** No personas, no phases that block small changes.

## Constraints

- **One entry in the skill list, with a short description.** The skill list is already crowded: in the ZAC-215 test, adding more entries made agents choose skills less reliably.
- **The script is plain Node with no dependencies, like `strategic-programming/scripts/sp.mjs`, and has tests (`node --test`).**
- **Generated checks must run in CI with no skill installed.** They are committed into the repo, not called from the skill folder.
- **It never prints secrets** (the owner's rule: report lengths or key names only).
- **MIT, like the rest of the repo.** Any provider with a restrictive license gets that license named when recommended (Shannon is AGPL-3.0; Trail of Bits skills are CC-BY-SA-4.0).

## Approaches considered

1. **A router skill that tailors a skeleton per project (chosen).** The skill reads the repo, proposes a stage, hands each missing theme to an existing skill, and writes real check scripts into the repo.
   - For: it fits a project that changes all the time; it uses the library the owner already has; it works on existing repos.
   - Against: a router is prose and has to prove its value, so v1 includes a replay evaluation.
2. **Template repos per stack with the checks built in.**
   - For: guaranteed checks on day one, like runnerd.
   - Against: cookie-cutter (an anti-goal); one template per stack; does nothing for repos that already exist.
   - The one idea we keep: the checks are real scripts in the repo.
3. **Adopt BMAD v6 or OpenSpec and plug the skills into it.**
   - For: maintained by others, and OpenSpec keeps specs current after each change.
   - Against: overlaps superpowers, adds the ceremony critics report, and largely bypasses the owner's library.

**Several skills, or one skill with commands?** One. Several skills would compete for the same requests ("start a project", "audit this repo"). They would also need to share the stage, and they would add entries to an already crowded skill list. Impeccable shows the pattern: one entry, about 40 commands, a router and a script.

## Decisions taken with the owner

### Stages

| Stage | What it is | Skeleton it needs (in addition to the previous stage) |
|---|---|---|
| **Explore** | Spikes and variants to find out what to build. Code quality doesn't matter yet. | A ~10-line AGENTS.md: what this is, how to run it, how to test it. Nothing else. |
| **Product** | Someone relies on it, or it will be built on for weeks. | PRODUCT.md (intent, users, non-goals, rules that hold everywhere); decisions folder with an index; glossary; ARCHITECTURE.md plus the code map; DESIGN.md before screens are built; CONSTRAINTS.md; one `check` command; a "how to verify" section naming the command that starts the app and the tool an agent uses to check it (browser, mobile, HTTP); a security pass in review. That pass is a line in AGENTS.md's workflow rule: the reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed. Nothing is added to CI at this stage (my call). |
| **Live** | Deployed and used by people other than the owner. | Readiness tier 1 (below) as a short definition of done; a threat model; per-change static security scanning in CI (semgrep or the stack's equivalent, plus a dependency scan); per-release live pentest (recommended provider, run by the owner); runbooks for what can break; error tracking and backups with a tested restore. |
| **Scale** | Paying or enterprise users, more contributors, or many agents working at once. | Readiness tiers 2 and 3; scheduled gardening; performance budgets. |

The stage is a proposal with its reasons. The script gathers the signals:

- whether the docs and checks exist;
- whether the project is deployed: a deploy workflow, a compose or Docker file with a public route, an inventory entry, or a URL in README;
- whether it has auth or tenancy code;
- the commit count and its age;
- how many agent sessions in the local transcript store mention this repo.

The agent states the proposed stage and the evidence; the owner confirms or corrects; the result is recorded with the date and a one-line reason. The stage can go back as well as forward.

### Themes and providers

Themes come from the stage, not from what is installed. For each theme, the `providers` command looks in this order:

1. **The agent's own list of skills and MCP tools,** matched by description. Only the agent can see this list; the script can't.
   - MCP servers count as providers in their own right, because several themes are about what the agent can *do*, not what it knows. Examples from the owner's setup:
     - verification: headless browser and DevTools, mobile emulator, desktop and computer use;
     - design references: Mobbin, Higgsfield;
     - research: papers and books, web search, scraper;
     - tracking: Linear, GitHub;
     - errors: Sentry.
   - A tool behind a search gateway (`mcp_tool_search`, `local_tool_search`) counts once the agent has searched for it.
   - The "how to verify" section names the tool the agent uses, by its MCP name.
2. **A seed table in `reference/providers.md`** of known good providers per theme, so the matching doesn't depend on wording.
3. **Foundry's own fallback** for that theme: a minimal template and the questions to ask. It is good enough to get started.

Seed providers from the owner's library and stars, to be confirmed by the builder:

| Theme | Providers |
|---|---|
| Intent and scope | interview-me, grill-me, grill-with-docs, pm `create-prd`, `identify-assumptions-new`, `pre-mortem` |
| Variants and spikes | Matt Pocock `prototype`, Impeccable `shape`, taste-skill |
| Domain language and decisions | `domain-modeling`, `documentation-and-adrs`, `grill-with-docs` |
| Architecture | `codebase-design`, `strategic-programming` (code map), `improve-codebase-architecture` |
| Design system | Impeccable `init` and `document`, ui-ux-pro-max `design-system` |
| Quality bar | `constraint-driven-development` |
| Tests and verification | `derive-tests`, `tdd`, `webapp-testing`, `browser-testing-with-devtools`, `mobile-automation` |
| Security, per change | `security-audit-static`, Cloudflare `security-audit`, `security-and-hardening`, Trail of Bits `differential-review` / `semgrep` / `supply-chain-risk-auditor`, the harness's security-review agent |
| Security, threat model | Anthropic defending-code `/threat-model` |
| Security, live | Shannon, Strix (per release; run by the owner) |
| Adversarial review | `doubt-driven-development`, `red-team-prd`, `strategy-red-team`, agency-agents `testing-reality-checker` and `security-ai-generated-code-auditor` used as reviewer briefs |
| Readiness | `ship-check`, `shipping-and-launch`, `observability-and-instrumentation`, sentry skills |
| Upkeep | `document-app check`, `derive-tests check`, `retro` |

**Missing provider.** When the fallback isn't good enough for a theme, foundry recommends a skill: its name, why, a link, and its license. It never installs anything.
- On the owner's machine (an agent-skills store is present: `~/.agent-skills/sources.yaml` or `/opt/agent-skills`), it proposes the change as a PR to that store, so the store's held-code review applies before any agent loads the skill.
- Elsewhere it recommends only, and points to `npx skills find` / skills.sh.

### One owner per file

Foundry never creates a file that a provider already owns. It calls the provider, and uses its own template for the same filename only as the fallback.

| File | Owner | Holds |
|---|---|---|
| PRODUCT.md, DESIGN.md | Impeccable (format kept compatible) | intent, users, non-goals, product rules; the design system |
| CONSTRAINTS.md | constraint-driven-development | the quality bar and its thresholds |
| `.agents/code-map.md` | strategic-programming | where each shared concept lives, and the code invariants |
| GLOSSARY.md and `docs/decisions/` | domain-modeling / documentation-and-adrs | domain language; one file per decision, plus an index |
| ARCHITECTURE.md | foundry (fallback template, in matklad's style); `codebase-design` when present | the short narrative of boundaries, linking to the code map rather than repeating it |
| AGENTS.md | foundry | a map only (see below) |
| `.agents/foundry.json` | foundry | stage, date and reason; chosen provider per theme; AGENTS.md budget; readiness tier |

### AGENTS.md is a map with a budget

- **It contains:** what the repo is, the `check` command, how to verify, where things are (links to the files above), and the workflow rule. That rule says a product-level decision made in any brainstorm, spec, review or fix round gets a decision file and an update to PRODUCT.md or the roadmap in the same change; code-level choices stay in the spec or PR. This is what keeps superpowers' decisions out of the chat.
- **It also contains one sentence: when this file and the code disagree, the code wins, and the agent says so.**
- **Budget:** about 100 lines, with the number recorded in `foundry.json`. `check` fails when the file goes over. Once at the budget, every addition names the removal or the move to a skill that pays for it.
- **A repo that already has an AGENTS.md** (my call): `init` never rewrites it on its own.
  - It proposes a migration as a diff the owner approves: keep what belongs in the map; move each other section to the file that owns it, or to a skill; list what it would delete and why.
  - Until the owner approves, `foundry.json` records `agents_md: "unmigrated"`, and the budget rule reports a warning instead of failing. That way adopting foundry never turns `check` red on day one.

### The check gate

`foundry init` and `grow` add a `check` entry point in the repo's own tooling (an npm/pnpm script, `mise` task, Makefile or `cargo xtask`, whichever the repo uses). It runs the repo's build, lint and tests, plus a vendored doc-check script committed in the repo.

The doc check is one POSIX `sh` script using only standard tools (`grep`, `sed`, `find`), so it runs in a Rust, Python or Ansible repo's CI without adding Node (my call). Its tests live in this repo and run it against fixture repos with `node --test`. The copy in a repo carries a version line, and `audit` reports when it is older than the skill's.

The doc check fails when:

- a link in AGENTS.md, PRODUCT.md, ARCHITECTURE or the decisions index points to nothing;
- a command named in AGENTS.md doesn't exist;
- the decisions index and the decisions folder disagree;
- AGENTS.md is over budget;
- a file the stage requires is missing.

CI runs the same command. Each rule in CONSTRAINTS.md that a script can express is added to the gate when it is written. The ones a script can't express are listed as such, so it is visible which rules rely on review.

### Readiness tiers

`reference/readiness.md` groups the production-readiness items into tiers. Each item gets one line and the way it is checked (script, test, or review).

- **Tier 1, real users:** designed schema, authorization per object, server-side validation, secrets out of repo and chat, dependency scanning, backups with a tested restore, migrations that roll back, structured logs, error tracking, uptime check.
- **Tier 2, paying users:** idempotency, money as integers, rate limits, audit trail, email deliverability, rollbacks, cost alerts.
- **Tier 3, enterprise:** SSO/SAML, SCIM, tenant isolation proofs, data residency, retention and deletion everywhere, compliance evidence.

Only a short definition of done for the current tier goes into AGENTS.md. The full list is read by `audit`, never pasted into a build prompt, because a detailed spec made agents less safe in the research above.

### Commands

| Command | Does | Writes |
|---|---|---|
| `foundry` (no argument) | Proposes the stage with its evidence, lists uncovered themes and stale files, offers the next step. Never runs a command by itself. | nothing |
| `foundry init` | First skeleton for the confirmed stage. It runs one interview now, for intent, which fills PRODUCT.md, because every other theme depends on it. It writes what a script can fill: AGENTS.md map, `foundry.json`, `check`, doc check, and empty decisions index. The other interviews (design brief, glossary, quality bar, threat model) are queued in `foundry.json`, each with the moment it matters, such as "design brief: before the first screen". The router offers a queued interview when that moment arrives. | PRODUCT.md, the scripted files, the queue |
| `foundry audit` | Compares the repo with its stage: missing themes, stale docs, readiness gaps, rules that are prose but could be checks. | a report only |
| `foundry grow` | Moves to the next stage, adding only what that stage adds. | the new stage's files |
| `foundry providers` | Maps themes to providers; recommends what is missing (store PR on the owner's machine). | `foundry.json` providers; optionally a store PR |
| `foundry check` | Runs the repo's gate and reports. | nothing |
| `foundry garden` | Reads the changes since the last garden. Looks for drift: patterns copied from a workaround, comments excusing a problem instead of fixing it, duplicated helpers, rules broken without a check catching them. Proposes fixes as issues or a short list; for each recurring one, proposes a check that would have caught it. Meant to run on a schedule the owner sets up; foundry doesn't schedule it. | a report; optionally issues |
| `foundry tune` | The AGENTS.md backward pass. Collects this repo's agent sessions. For the harnesses backpass reads, it uses [backpass](https://github.com/kunchenguid/backpass) (MIT, run with `npx -y backpass`; reads Claude Code, Codex, pi, opencode, grok, Cursor CLI and Hermes from disk). If backpass is missing or fails, `tune` reports which sessions it couldn't read; it does not reimplement those readers. For GitHub Copilot CLI and the VS Code Agent Host, which backpass doesn't read, the script reduces `~/.copilot/session-state/*/events.jsonl` sessions matched by cwd or repository to a short digest. Then it applies the method: needs a batch of sessions (not one), at most five edits per pass, every edit backed by a quoted line from a session, within the budget; a narrow rule becomes a skill or is deleted. The owner approves the edits. | a proposed AGENTS.md diff |

The router (no argument) is the only automatic entry. A small SessionStart hook, active only in repos that have `.agents/foundry.json`, prints one line when something the stage requires is missing or stale, and nothing otherwise.

## How we know it works

- **Script tests** with `node --test`: stage signals on fixture repos; each doc-check rule fails on a broken copy and passes on a fixed one (a check that can't fail proves nothing); the Copilot transcript digest on a fixture `events.jsonl`.
- **Replay on history.** Run `foundry` and `foundry audit` on three snapshots:
  - Specifica at its scaffold commit (2026-10-24, before docs/product), from `/Users/Shared/code/sparklin/Specifica`;
  - chineur around day 7, from `razakiau/chineur`;
  - kerdoscope around day 7, from `razakiau/kerdoscope`.

  Use throwaway worktrees or clones.

  **The "needed later" list** for each repo is built from its later history:
  - every file foundry would own that the repo added after the snapshot;
  - every decision file;
  - every AGENTS.md rule;
  - the owner's corrections in chats. Specifica examples: "looks super cheap", "did we record our design?", "why no password rules?".

  **Scoring** (my call): the builder fills a table of caught / missed / noise with one line of evidence per row. The owner scores it before v1 is released. This is a release gate, not a merge gate.
- **Trigger test.** The description triggers on "start a new project", "audit this repo's setup", and "is this ready for users". It does not trigger on a plain feature request in a repo already set up. Tested with the same replay method used in ZAC-215, with the superpowers SessionStart text included.

## Left to the builder

- The exact signals and thresholds for proposing a stage, provided each is shown to the owner with its value.
- The template wording for each fallback, and the layout of `foundry.json`.
- How `check` is wired per stack, and how the vendored doc check is versioned.
- The exact seed provider table: confirm each entry exists and fits.
- Whether `garden` and `tune` ship in the first PR or a follow-up, as long as both are in v1.
- Updating this repo's README and plugin description to list the third skill.

## What comes after

- **Project 2, verification.** A feature map and an app-driving CLI per surface (Pocock's verification skills), and the attacker run against a live app per release.
- **Project 3, autopilot.** Unattended runs in sandboxes with Stripe-style steps the model can't skip, Pocock's three brakes (checks, automated review, human review), and one trigger at a time.
