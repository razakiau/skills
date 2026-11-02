# Themes

A theme is a kind of work the repo needs. Themes come from the stage, not from what is installed.
`providers` maps each theme to a provider from [providers.md](providers.md), or to foundry's fallback.
A theme opens at its stage and stays open at every later stage.

| Theme | Stage | Why |
|---|---|---|
| intent | explore or product | Every other theme depends on knowing what this is, who it is for, and what it won't do. |
| variants | explore or product | Spikes and side-by-side variants find out what to build before code quality matters. |
| decisions | explore or product | A product decision kept in a chat is lost. One file per decision, plus an index, keeps it. |
| glossary | explore or product | Agents and people need one name for each domain concept. |
| architecture | explore or product | A short map of boundaries and where shared concepts live stops agents from duplicating them. |
| specs | product | A change bigger than a day gets a short spec next to its ticket, kept with the code, so the reviewer and the next agent read what was meant, not only what was done. |
| design-system | product | A written design system keeps screens consistent. Write it before the first screen. |
| screens | product | Only with UI. A map of the screens with their approved mockups, kept true by a check after each UI change, so the agent looks at a screen before the owner does. |
| quality-bar | product | The thresholds a change must meet, written once, so each review doesn't invent them. |
| verification | product | An agent must show that a change works: the command that starts the app and the tool that checks it. |
| security-review | product | The reviewer of each change reads it for access control, input handling and secrets. |
| threat-model | live | Once others use it, name what an attacker wants and where they would get in. |
| security-scan | live | Static and dependency scans on each change catch what review misses. |
| pentest | live | A live app needs an attack on the running system each release, run by the owner. |
| changes | live | Users need to know what changed. Change notes written with each change, and one release command that versions, tags and publishes them. |
| readiness | live | Real users need the tier 1 items in [readiness.md](readiness.md). |
| observability | live | When it breaks, errors, logs and runbooks say what happened and what to do. |
| gardening | product and later | Drift builds up: copied workarounds, duplicated helpers, rules broken without a check. |
| tuning | product and later | AGENTS.md improves only from evidence in real sessions, within its budget. |
| performance | scale | Budgets for speed and cost matter once usage grows. |
