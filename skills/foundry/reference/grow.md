# Grow

Moves the repo to its next stage and adds what that stage requires.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.

### 1. Confirm the next stage

Run `node <skill dir>/scripts/foundry.mjs signals` and show the `proposed stage:` line and every reason.
Name the next stage after the recorded one: `explore`, `product`, `live`, `scale`. Ask the owner to confirm it, and ask for the reason in one line.
Done: the owner confirmed the stage and gave the reason.

### 2. Record it

Run `node <skill dir>/scripts/foundry.mjs state --set stage=<next> --set stage_reason="<reason>"`. It prints the new state, with `stage_set` at today's date.
Done: the printed state shows the new stage.

### 3. Write the new files

Run `node <skill dir>/scripts/foundry.mjs init-files --stage <next>`. Add `--skip <file>,<file>` for files an installed provider writes. Existing files print `kept <path> (exists)`.
Handle each `warn <path> is gitignored` line as in [init.md](init.md): show it and offer `git add -f <path>`.
Then run `node <skill dir>/scripts/foundry.mjs vendor-check`. It prints `doc-check created`, `doc-check updated` or `doc-check current`, and copies the newer doc check when needed.
Queue the interviews the new stage opens, as in step 4 of [init.md](init.md).
Done: the output is shown and each new theme has a queue entry or a file.

### 4. Bring AGENTS.md up to the stage

init-files never rewrites an existing AGENTS.md. When it printed `agents-md:` lines, the kept file lacks what this stage adds.
Propose them to the owner as one diff to AGENTS.md: each `agents-md: add link to <path>` becomes `- [<path>](<path>): <what it holds>.` under `## Where things are`, replacing `Nothing yet beyond this file.` when it is there, and `agents-md: add line: <line>` goes under `## Verify`, after the line that asks for quoted output, as in the template.
Apply the diff only after the owner approves it.
Done: there were no `agents-md:` lines, or the owner answered the diff.

### 5. On entering live

Only when the next stage is `live`:

- Queue the threat model: `{"interview": "threat model", "when": "on entering live", "done": false}`, with the provider when one is installed. Its moment has come now.
- Run `node <skill dir>/scripts/foundry.mjs state --set readiness_tier=1`.
- Propose the CI security scan as a diff to the repo's CI: semgrep or the stack's equivalent on each change, plus a dependency scan (`npm audit`, `cargo audit`, `pip-audit` or the like). Name each tool's license.

Apply the CI diff only after the owner approves it.
Done: the threat model is queued, the tier is 1, and the owner answered the CI diff.

### 6. Check

Run the repo's check, as in [check.md](check.md). New skeleton files are expected to fail only where a provider still owes a file.
Done: the check output is shown, and each FAIL is explained.
