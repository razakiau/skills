# Stages

A repo is in one of four stages. Each stage keeps everything the previous one needs and adds its own files.
The required lists below match `REQUIRED` in `scripts/foundry.mjs` and `check_required` in `templates/doc-check.sh`. A test keeps the three in step.
The stage is a proposal. `foundry` states it with its evidence, and the owner confirms or corrects it. It can go back as well as forward.
The themes each stage opens are in [themes.md](themes.md).

## explore

Spikes and variants to find out what to build. Code quality doesn't matter yet.

Required files:

- `AGENTS.md`

It adds a short AGENTS.md: what this is, how to run it, how to test it. Nothing else.

## product

Someone relies on it, or it will be built on for weeks.

Required files:

- `AGENTS.md`
- `PRODUCT.md`
- `docs/decisions/index.md`
- `GLOSSARY.md`
- `ARCHITECTURE.md`
- `docs/code-map.md`
- `DESIGN.md` (only with UI)
- `docs/ui/screens.md` (only with UI)
- `CONSTRAINTS.md`

It adds:

- PRODUCT.md: intent, users, non-goals, and the rules that hold everywhere.
- A decisions folder with an index, and a glossary.
- ARCHITECTURE.md plus the code map.
- DESIGN.md before the first screen is built. It may live below the top, such as `web/DESIGN.md`: record the path with `state --set design_md=<path>`, and every check reads it there.
- With UI, a screen map in `docs/ui/screens.md`: each screen, its approved mockup and when it was last checked. check-screens keeps it true; AGENTS.md gets the line "After any UI change, run check-screens before reporting done."
- CONSTRAINTS.md, the quality bar.
- One `check` command that runs the build, lint, tests and the doc check.
- A "how to verify" section in AGENTS.md. It names the command that starts the app and the tool an agent uses to check it (browser, mobile, HTTP).
- A security pass in review. The reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed.
- A short spec for any change bigger than a day, kept next to the code, before the work starts.

Nothing is added to CI at this stage.

## live

Deployed and used by people other than the owner.

Required files:

- `AGENTS.md`
- `PRODUCT.md`
- `docs/decisions/index.md`
- `GLOSSARY.md`
- `ARCHITECTURE.md`
- `docs/code-map.md`
- `DESIGN.md` (only with UI)
- `docs/ui/screens.md` (only with UI)
- `CONSTRAINTS.md`
- `docs/threat-model.md`
- `docs/runbooks/`

It adds:

- Readiness tier 1 from [readiness.md](readiness.md), as a short definition of done in AGENTS.md.
- A threat model.
- Static security scanning on each change in CI, plus a dependency scan.
- A live pentest per release, run by the owner with the recommended provider.
- Runbooks for what can break.
- Error tracking, and backups with a tested restore.
- Change notes written with each change, and one release command that versions, tags and publishes them.

## scale

Paying or enterprise users, more contributors, or many agents working at once.

Required files:

- `AGENTS.md`
- `PRODUCT.md`
- `docs/decisions/index.md`
- `GLOSSARY.md`
- `ARCHITECTURE.md`
- `docs/code-map.md`
- `DESIGN.md` (only with UI)
- `docs/ui/screens.md` (only with UI)
- `CONSTRAINTS.md`
- `docs/threat-model.md`
- `docs/runbooks/`

It adds no required file. `audit` checks the rest:

- Readiness tiers 2 and 3.
- Scheduled gardening.
- Performance budgets.
