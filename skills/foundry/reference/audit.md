# Audit

Reports what the repo has and lacks for its stage. Audit writes nothing.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.

### 1. Gather the facts

Run `node <skill dir>/scripts/foundry.mjs signals --json` and `node <skill dir>/scripts/foundry.mjs state`.
Then run the repo's check, as in [check.md](check.md). Keep every `doc-check: FAIL <rule>: <detail>` and `doc-check: WARN <rule>: <detail>` line.
Done: you have the signals, the state, and the check output.

### 2. Read the themes for the stage

Read [themes.md](themes.md). A theme opens at its stage and stays open later. List the themes open at the recorded stage.
Done: the list of open themes is written down.

### 3. Report each theme

For each open theme, say one of:

- covered: name the file that holds it, or the provider recorded in `providers` in the state;
- missing: no file and no provider;
- stale: the file exists but the check flags it, or it contradicts the code you read. A code map still at `.agents/code-map.md` (`code_map_legacy` in the signals) is stale: grow moves it to `docs/code-map.md`.

Done: every open theme has one of the three, with its evidence.

### 4. Find prose rules a script could check

Read CONSTRAINTS.md and AGENTS.md. List each rule written as prose that a script, a lint rule or a test could check, such as "no file over 400 lines". For each, propose the check and where it would run.
Done: each such rule is listed with its proposed check, or you said there are none.

### 5. Report readiness gaps

Read `readiness_tier` from the state. Read [readiness.md](readiness.md) and check each item of that tier and below. Report each gap with the way it is checked. At tier 0, say there is no tier yet.
Read it; never paste it into a build prompt.
Done: each item of the tier is met or a gap.

### 6. Report doc-check version drift

Compare line 2 of `.agents/doc-check.sh` with line 2 of `<skill dir>/templates/doc-check.sh`. Both read `# foundry doc-check v<semver>`. Report the two versions when they differ.
Do not run `vendor-check` here: it writes. The copy happens in grow, in [grow.md](grow.md), or when the owner says yes.
Done: the versions are stated as equal or different.

### 7. Report

Give the findings in one list, missing and stale first. For each, name the command that fixes it. Change nothing.
Done: the report is shown and no file changed.
