# Tune

Tunes AGENTS.md against what agents did in real sessions: what helped, what was ignored, what was missing.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.
Tune proposes a diff. Nothing is applied before the owner approves it.

### 1. Collect sessions

Run `npx -y backpass` from the repo. It reads the sessions of its seven harnesses. When it is unavailable, say so and go on.
backpass does not read Copilot, which is why digest exists. Run `node <skill dir>/scripts/foundry.mjs digest --json`. It prints one entry per Copilot session of this repo, newest first, at most 30: `id`, `started`, `user` (each message cut to 500 characters), `tools` as `name(argKey,...)`, `skills` and `compactions`.
Read only these fields. Never print or quote other transcript content: tool output and argument values can hold secrets.
Done: you have the sessions from backpass, or the fact that it is unavailable, and the digest.

### 2. Count the sessions

Tune needs at least 10 sessions across both sources. With fewer, stop and say how many there are.
Done: there are 10 sessions or more, or you stopped and gave the count.

### 3. Score each section

For each section of AGENTS.md, count the sessions where it mattered, where it was followed, where it was violated and where it was wrong.
Then list what agents rediscovered that no section covers, such as a command they searched for or a path they kept asking about.
Done: every section has its four counts, and the rediscoveries are listed or "none".

### 4. Propose edits

Propose at most 5 edits. Each one adds, removes, rewrites, or moves a rule to a skill. Each carries a verbatim quote from a session and that session's id. Quote only from `user` in the digest, or from the user turns backpass shows.
Stay within `agents_md.budget_lines` from the state. At the budget, every addition names the line it removes.
Done: each edit has a quote and a session id, and the result fits the budget.

### 5. Sort narrow rules

A narrow rule that applies only at a clear trigger, such as "when touching migrations", becomes a skill. A narrow rule with no trigger is a deletion candidate.
Done: each narrow rule is marked as a skill or a deletion candidate.

### 6. Get approval

Show the owner the proposed AGENTS.md diff before anything is applied. Apply it only after the owner approves it, then run the repo's check, as in [check.md](check.md).
Done: the owner approved the diff and the check passes, or the owner declined and nothing changed.
