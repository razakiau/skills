# Check

Runs the repo's one check command and says who owns each failure.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.

### 1. Find the check command

Use the first that exists, as init wires it:

- `package.json` with a `check` script: `npm run check`.
- `mise.toml` with `[tasks.check]`: `mise run check`.
- `Makefile` with a `check:` target: `make check`.
- Otherwise: `sh .agents/check.sh`.

AGENTS.md names the same command under `## Check`. Say so when they differ.
With none of them, run `sh .agents/doc-check.sh` and suggest init, in [init.md](init.md).
With no `.agents/doc-check.sh` either, offer `node <skill dir>/scripts/foundry.mjs vendor-check`, which copies it in. Run it only on the owner's yes.
Done: you named the command and where it came from.

### 2. Run it

Run the command from the repo top. Quote its output. The doc check prints `doc-check: FAIL <rule>: <detail>` or `doc-check: WARN <rule>: <detail>` per finding, then `doc-check: <n> fail, <n> warn`. It exits 1 on any FAIL.
Done: the output and the exit code are quoted.

### 3. Name the owner of each FAIL

For each FAIL, name the file that owns the fix:

- `link`: the file before `->`; fix the link or create the target.
- `command`: AGENTS.md at the line it names.
- `decisions`: `docs/decisions/index.md`.
- `required`: the missing file itself. When a provider owns it, as with `DESIGN.md` or `docs/code-map.md`, name the queued interview. A missing `docs/ui/screens.md` is fixed by `node <check-screens dir>/scripts/check-screens.mjs init` (the folder holding check-screens' SKILL.md) when check-screens is installed, else by grow.
- `state`: `.agents/foundry.json`.
- `budget` or `precedence`: AGENTS.md. A WARN there means `agents_md.state` is `unmigrated`; migrate it as in [init.md](init.md).
- A build, lint or test failure: the source file it names.

Done: each FAIL names one file, and you changed nothing unless the owner asked.
