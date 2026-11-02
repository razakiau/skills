---
name: foundry
description: Use first, before any brainstorming or planning, when starting a new project, setting a repo up for agents, auditing a repo's agent setup, or asking if it is ready for real users or what is missing before launch. It sets the repo's stage and docs. A plain feature or bug request skips it.
license: MIT
metadata:
  version: "1.1.0"
---

# Foundry

A repo grows through four stages: `explore`, `product`, `live` and `scale` ([reference/stages.md](reference/stages.md)). Each stage requires its own files, from AGENTS.md at the start to a threat model and runbooks once real users arrive.
Foundry records the stage in `.agents/foundry.json`, writes what the stage lacks, maps each kind of work ([reference/themes.md](reference/themes.md)) to a provider the agent already has ([reference/providers.md](reference/providers.md)), and audits the repo against the readiness list ([reference/readiness.md](reference/readiness.md)).
It proposes; the owner decides. Nothing in AGENTS.md or CI changes without the owner's yes.

## Setup

`<skill dir>` below is the folder holding this file. Call the script with `node`, exactly as written: `node <skill dir>/scripts/foundry.mjs state` prints the recorded state. The script needs Node.js 18 or later; git is optional.

With the plugin installed, a SessionStart hook prints one line when the stage's files are missing or an interview is queued, and nothing otherwise.

## Commands

| Command | What it does | Reference |
| --- | --- | --- |
| (no argument) | Reads the signals and the state, reports where the repo stands, offers the next command | [reference/routing.md](reference/routing.md) |
| `init` | Sets the stage, writes PRODUCT.md and the stage's files, queues the interviews, records AGENTS.md | [reference/init.md](reference/init.md) |
| `audit` | Reports what the repo has and lacks for its stage, readiness included; writes nothing | [reference/audit.md](reference/audit.md) |
| `grow` | Moves the repo to its next stage and adds what that stage requires | [reference/grow.md](reference/grow.md) |
| `providers` | Maps each theme of the stage to a provider, or to foundry's fallback | [reference/providers-cmd.md](reference/providers-cmd.md) |
| `check` | Runs the repo's one check command and says who owns each failure | [reference/check.md](reference/check.md) |
| `garden` | Finds the drift since the last pass: copied workarounds, duplicated helpers, broken rules | [reference/garden.md](reference/garden.md) |
| `tune` | Tunes AGENTS.md against what agents did in 10 or more real sessions | [reference/tune.md](reference/tune.md) |

## No argument

Read [reference/routing.md](reference/routing.md) and follow it. It runs `signals` and `state`, judges the queued interviews, reports, and offers one command.

With a command, read its reference and follow its steps in order. Each step ends with a `Done:` line; do not start the next step before it holds.

## Rules

- Never install a skill or MCP server. Name the provider, why, a link and its license; the owner installs it.
- Never rewrite AGENTS.md without the owner's approval. An existing AGENTS.md stays byte-identical until the owner says yes.
- Never print secrets: no tokens, keys, passwords or connection strings, from files, env or session transcripts.
- The full readiness list is read, never pasted into a build prompt. Name only the items that apply to the change.
