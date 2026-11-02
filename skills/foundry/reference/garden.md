# Garden

Finds the drift that piles up between passes: copied workarounds, duplicated helpers, rules broken with no check failing.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.
Garden reports. It changes no code and opens nothing without the owner's yes.

### 1. Read the range

Run `node <skill dir>/scripts/foundry.mjs garden-range`. It prints `garden-range: <from>..<to> (<n> commits)`: the commits since `garden_last` in the state, or the last 50 when `garden_last` is null.
Then read the diff with `git diff <from>..<to>` and the messages with `git log <from>..<to>`.
Done: you have read every commit in the range, or you said it holds none.

### 2. Look for drift

Read AGENTS.md, CONSTRAINTS.md and `.agents/code-map.md` when they exist. In the range, look for:

- a workaround copied to a new place;
- a comment that excuses a problem instead of fixing it, such as "hack" or "temporary";
- near-duplicate helpers, a new one beside an old one that does the same job;
- a rule in AGENTS.md, CONSTRAINTS.md or the code map that the range breaks while no check fails.

Done: each kind is listed with its findings, or as "none".

### 3. Stale screens

Only when the state has `has_ui: true` and check-screens is installed. `<check-screens dir>` is the folder holding check-screens' SKILL.md. Run `node <check-screens dir>/scripts/check-screens.mjs stale` from the repo. Each `stale`, `gone` or `unmapped` line it prints is a finding; report them with the others in step 4.
Without check-screens, say the screen map was not checked and name check-screens as its provider.
Done: the stale lines are in the findings, or you said why the map was not checked.

### 4. Report with evidence

Give each finding with `file:line` evidence from the range and one line on why it matters.
For each finding that recurs, in two places or more, propose the check that would have caught it: a script, a lint rule or a test, and where it runs.
Done: every finding has `file:line` evidence, and every recurring one has a proposed check.

### 5. Offer issues

Read `providers` in the state. When a tracker provider is recorded for gardening, such as the Linear or GitHub MCP, offer to open one issue per finding. Open them only on the owner's yes.
With no tracker, say the report is the record.
Done: issues are offered, or you said there is no tracker.

### 6. Mark the pass

After the owner has read the report, run `node <skill dir>/scripts/foundry.mjs garden-range --mark`. It sets `garden_last` to HEAD, so the next pass starts here.
Done: the script printed `garden_last: <sha>`.

### 7. Scheduling

The schedule is the owner's. Say that this pass can run from CI or a cron, and that it reports the same way there.
Done: the owner knows it can be scheduled.
