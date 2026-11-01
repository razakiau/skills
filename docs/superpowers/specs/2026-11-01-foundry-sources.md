# Foundry: where each design choice comes from

Companion to [2026-11-01-foundry-design.md](2026-11-01-foundry-design.md). Each choice in the design is listed with the evidence behind it. A choice is a **call** when the evidence was thin or split.

The evidence comes from three places:

- **History:** the owner's own agent sessions and repos, 2026-09-24 to 2026-11-01. That is 303 Copilot CLI and Agent Host sessions, 160 VS Code chats, the Specifica sessions on the CDE, and eight repos.
- **Saved sources:** the five the owner bookmarked in Karakeep (tagged A to E below).
- **Research:** two literature rounds with cited papers and practitioner posts. Many of the 2026 arXiv papers are preprints, and several are small-sample or single-author; treat those numbers as indicative.

## Saved sources

| | Source | What we took | What we didn't |
|---|---|---|---|
| A | *I talked to 50 people building with AI. It's a mess.* (Less Bitter, [YouTube](https://www.youtube.com/watch?v=jDG7L5HuBnk)) | The Explore stage stays light: a 10-line AGENTS.md, spikes, no spec. AGENTS.md rules are added only for repeated misbehaviour. A new chat per feature. Variants before building ("workshop"). | "Code is the only context" and "skip specs" for long-lived products: the research shows agent-built code degrades without structure (see 2, 3). "No worktrees, commit on main": nothing supports it either way, and parallel or unattended runs need isolation. |
| B | Matt Pocock, *Architecting trust* (X, 2,000 PRs a month) | Rules become checks (`check`, the doc check, CONSTRAINTS rules as scripts). His trust order, architecture → static analysis → rules → skills → style, decides what goes in scripts and what stays in prose. The gardener becomes `foundry garden`. Verification tooling and a feature map are recorded as project 2. | `Dune` and `Control Glass` aren't public, so only the ideas are used. |
| C | Mark Ajzenstadt, production-readiness checklist (X) | The items become `reference/readiness.md`, split into tiers by stage, each with how it is checked. | Pasting the whole list into prompts: research found detailed technical specs made agents less safe (see 6). |
| D | Kun Chen, [*Your AGENTS.md is a Neural Net*](https://blog.kunchenguid.com/p/your-agentsmd-is-a-neural-net) | `foundry tune`: a size budget; evidence from session transcripts, batched, at most five edits per pass, each backed by a quote. Narrow rules become skills or are deleted. A handwritten user-level file. Uses [backpass](https://github.com/kunchenguid/backpass). | nothing left out |
| E | Stripe, [*Minions*](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) | Steps the model can't skip, wired between the agent's own steps, and rules that load per directory. These go into project 3 (autopilot). Humans still review every minion PR, which supports keeping a human on merge for now. | nothing left out |

## Choices and their evidence

### 1. A stage per repo, and Explore stays light

- **History:**
  - chineur, AIRI, skeuograph and kerdoscope began inside 110- to 155-message chats, before any repo existed.
  - Specifica built its docs on day 3, after the fact (its decision 0040: "Decisions were scattered across the brief, specs, PRs and chat context").
  - The thesis platform was rewritten four times.
- **Research:**
  - Structure matters less as models get stronger: "inversely proportional to model strength" ([2608.21747](https://arxiv.org/abs/2608.21747)). Complex harnesses give diminishing gains on repair tasks ([2609.32459](https://arxiv.org/abs/2609.32459)).
  - Anthropic dropped sprint planning for Opus 4.6 ([harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)). That argues for a light start.
  - Agent-built code costs later agents up to 13.1% of tasks ([2606.21804](https://arxiv.org/abs/2606.21804)). In Cursor adopters, complexity persists while the speed gain fades ([2511.04427](https://arxiv.org/abs/2511.04427)). That argues for structure later.
  - BMAD v6's "right-sized process" is the closest framework precedent.
- **Call:** the stage is proposed from evidence and confirmed by the owner. He said he can't tell when a project becomes real, so it must never depend on him declaring it.

### 2. AGENTS.md is a map with a budget, and the code wins

- **Research:**
  - LLM-written context files lowered task success by 0.5 to 2% and raised cost by about 20%. Human-written files gave +2.4%, which isn't significant. Repository overviews "are not helpful" ([2602.11988](https://arxiv.org/abs/2602.11988)).
  - Agents followed a stale instruction file over the code 90.1% of the time. One sentence giving the code precedence moved code-following from 4.2% to 91.4% ([2610.30571](https://arxiv.org/abs/2610.30571)).
  - OpenAI keeps AGENTS.md around 100 lines as a table of contents, because "one big AGENTS.md… rots instantly" ([harness engineering](https://openai.com/index/harness-engineering/)).
  - Context Bloat is found in 42% of repos ([2606.15828](https://arxiv.org/abs/2606.15828)).
  - Claude Code's guidance: don't describe what the agent can read in the code ([best practices](https://code.claude.com/docs/en/best-practices)).
- **Saved sources:** A (delete rules nobody needs), D (the budget).

### 3. Rules as checks that run in CI

- **History:** runnerd enforces its boundaries with scripts (`check-boundaries.sh`); its fix-commit share is 22%, against 24% to 46% in the owner's repos.
- **Research:**
  - Constraint compliance was 88.3% with enforcement, against 67.0% prompt-only ([ContextCov, 2603.00822](https://arxiv.org/abs/2603.00822)).
  - Only the lint check reliably stopped a recurring failure ([2610.32578](https://arxiv.org/abs/2610.32578)).
  - Agents breach 43.1% of applicable repo policies even when their patches work ([SWE-CC, 2610.06193](https://arxiv.org/abs/2610.06193)).
  - OpenAI uses custom lints whose messages carry the fix.
- **Saved source:** B's trust order.
- **Call:** the doc check is POSIX `sh`, so it adds no toolchain to CI.

### 4. Decisions, glossary, architecture and product intent in files

- **History:** Specifica's day-3 docs, and the owner's questions "did we record our design?" and "is our implementation naive?". runnerd wrote 82 ADRs in 8 days, and 62 commits touched ARCHITECTURE.md.
- **Research:**
  - Spec quality correlates with fewer fix commits: 11.8% against 20.4% ([EPIC, 2610.07534](https://arxiv.org/abs/2610.07534)). That is a correlation, not proof.
  - Spec value for solo builders comes "from clarifying intent before delegation" ([2608.25202](https://arxiv.org/abs/2608.25202)).
  - OpenSpec merges each change back into living specs.
  - [matklad's ARCHITECTURE.md](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html) is the model for a short architecture narrative.
- **Against:** Böckeler finds heavy SDD "verbose and tedious to review" ([martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)). That is why each file is small and has one owner.

### 5. DESIGN.md before screens, and variants before building

- **History:**
  - Specifica day 2: the screens "look super cheap".
  - Day 3: the email templates didn't follow the design chosen earlier.
  - The chineur Settings screen didn't match the approved mock.
- **Research:**
  - Parallel prototyping beat serial iteration, which fixated on its first idea ([Dow et al. 2010](https://doi.org/10.1145/1879831.1879836)).
  - A critic loop on rendered screenshots improved results by up to 17.8% ([2604.05839](https://arxiv.org/abs/2604.05839)).
  - Anthropic's evaluator loop grades screenshots. [DESIGN.md](https://github.com/google-labs-code/design.md) and [Impeccable](https://github.com/pbakaus/impeccable) define the design files.
- **Saved source:** A's "workshop".

### 6. Readiness by tier, as a short definition of done

- **Research:**
  - 91% of 200 deployed vibe-coded apps had at least one vulnerability, mostly broken access control, injection and auth ([2606.23130](https://arxiv.org/abs/2606.23130)).
  - In the same paper, a "production-ready" completion criterion cut reintroduced vulnerabilities by 14.8 points, and a security skill by 13.8.
  - A detailed technical spec made results 20 points worse, because the agent followed it literally.
  - Security prompting alone redistributes weaknesses instead of reducing them ([2605.24298](https://arxiv.org/abs/2605.24298), [2608.24857](https://arxiv.org/abs/2608.24857)).
- **Saved source:** C, for the items.

### 7. Security that grows with the stage

- **Owner:** reviewers and static audits early; a pentest once the product is live, so as not to spend tokens on every change.
- **Research:** the same vulnerability data (6) puts access control first, so that is the first thing a review checks.
- **Stars:** the providers come from what the owner has starred:
  - [Shannon](https://github.com/KeygraphHQ/shannon) and [Strix](https://github.com/usestrix/strix), AI pentesters for a live app;
  - [Trail of Bits skills](https://github.com/trailofbits/skills), [Anthropic's defending-code harness](https://github.com/anthropics/defending-code-reference-harness) (threat model, scan, triage), [Cloudflare security-audit](https://github.com/cloudflare/security-audit-skill);
  - [agency-agents](https://github.com/msitarzewski/agency-agents) reviewer roles.

### 8. Providers by theme, with fallbacks

- **Owner:** it has to work for someone without his skills, and group by themes.
- **Research:** Tessl's pivot to evaluating skills with and without context ([docs](https://docs.tessl.io/)) supports judging providers by outcome rather than by name.
- **Call:** recommendations on the owner's machine go through his skills store, whose held-code review covers text that steers agents. This follows his store's rule from ZAC-171.

### 9. One skill with commands

- **Precedent:** Impeccable is one skill with about 40 commands, a router and a script.
- **History:** in the owner's ZAC-215 test, adding more entries to the skill list made agents choose skills less reliably.

### 10. Gardening and tuning

- **Saved sources:** B (the gardener), D (tune).
- **Research:**
  - Agents copy bad patterns: LLM code has 63% more smells ([2510.03029](https://arxiv.org/abs/2510.03029)). OpenAI found agents replicate "even uneven or suboptimal" patterns and runs scheduled cleanup.
  - Stale code references appear in 23% of repos ([2606.09090](https://arxiv.org/abs/2606.09090)).
  - Learning context from transcripts works in research: ACE gained +10.6% ([2510.04618](https://arxiv.org/abs/2510.04618)), GEPA ([2507.19457](https://arxiv.org/abs/2507.19457)). Per repo the gains are small and noisy ([Skill Issue, 2609.12742](https://arxiv.org/abs/2609.12742)). That is why tune requires a batch and the owner's approval.
- **Practitioner:** [Addy Osmani, *Audit your agent files*](https://addyosmani.com/blog/audit-your-agent-files/).

### 11. A separate reviewer, and a human on merge

- **Research:**
  - "Agents reliably skew positive when grading their own work" ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)).
  - METR: developers were 19% slower with AI while believing they were 20% faster ([2507.09089](https://arxiv.org/abs/2507.09089)). Felt speed isn't evidence.
- **Saved sources:** E (Stripe keeps human review), B ("accelerators without brakes make a slop cannon", from Pocock's software-factory notes in [mattpocock/skills](https://github.com/mattpocock/skills)).

## Frameworks looked at and not adopted

| Framework | What we kept | Why not adopted |
|---|---|---|
| [spec-kit](https://github.com/github/spec-kit) | the idea of a constitution, held here by PRODUCT.md and CONSTRAINTS.md | heavy markdown per feature; overlaps superpowers |
| [Kiro](https://kiro.dev/docs/specs/) | testable acceptance criteria | spec-first; oversized for small changes |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | right-sizing by stage | personas and phases; changing fast |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | living specs updated after each change | a second spec system beside superpowers |
| [Sandcastle](https://github.com/mattpocock/sandcastle) | a candidate runner for project 3 | it runs agents; it is not a method |
| [Ralph](https://ghuntley.com/ralph/) / [Anthropic long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | progress file, feature list and fresh context per run, for project 3 | autopilot is out of v1 |
