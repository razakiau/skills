# Init

Sets foundry up in a repo: the stage, PRODUCT.md, the stage's files, the interview queue, and AGENTS.md.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.

### 1. Confirm the stage

Run `node <skill dir>/scripts/foundry.mjs signals` and show its output: `proposed stage: <stage>`, then one `- <reason>` line each.
Ask the owner to confirm the stage or name another. The stages are in [stages.md](stages.md).
Done: the owner named the stage.

### 2. Write PRODUCT.md

Skip this step at `explore` unless the owner asks for it.
Run the intent interview with the provider recorded for `intent`, or one from [providers.md](providers.md) the agent already has. With none, ask the questions under each heading of `<skill dir>/templates/PRODUCT.md`, one at a time.
Write the answers into PRODUCT.md under the template's headings. Show it to the owner before you save it.
Done: PRODUCT.md exists and the owner has read it.

### 3. Write the stage's files

List the files whose provider is installed and will write them, such as `GLOSSARY.md` when a glossary skill is present. Then run:

`node <skill dir>/scripts/foundry.mjs init-files --stage <stage> --skip <file>,<file>`

Leave out `--skip` when the list is empty. Add `--dry-run` first if the owner wants to see the plan. Each line is `created <path>`, `kept <path> (exists)`, `wired check in <file>` or `doc-check <created|updated|current>`.
A line `warn <path> is gitignored (<source>:<line>): add it with git add -f` means the file will not reach other clones. Show each one to the owner and offer `git add -f <path>`. Never force-add without a yes.
Done: the output is shown, and each `warn` line has the owner's answer.

### 4. Queue the other interviews

The script does not write the queue. Edit `.agents/foundry.json` yourself and append to `queue`. Keep 2-space JSON with one key per line, as the script writes it: `.agents/doc-check.sh` reads the file line by line.
Each entry is `{"interview": ..., "when": ..., "provider": ..., "done": false}`. Leave out `provider` when only the fallback applies. Queue what the stage opens, at the stage named on each line:

- product: `design brief and DESIGN.md`, when `before the first screen`, only with UI. Provider: Impeccable `init` and `document`, else the fallback questions. The screen map, `docs/ui/screens.md`, needs no interview: `init-files` writes it at product with UI, and check-screens fills it in as screens are built.
- product: `code map`, when `at the first change that touches two modules`. Provider: strategic-programming, else its `reference/code-map.md` template.
- product: `glossary`, when `when a second domain term is disputed, or at the first decision`.
- product: `quality bar`, when `before the first PR at product`.
- live: `threat model`, when `on entering live`.

The router in [routing.md](routing.md) judges when each moment has come. The script only stores the text.
Done: each entry is in `queue` with `done: false`, and `node <skill dir>/scripts/foundry.mjs state` prints the file without error.

### 5. Migrate an existing AGENTS.md

Init never rewrites an existing AGENTS.md. `init-files` printed `kept AGENTS.md (exists, unmigrated)`. Propose a migration as a diff:

- Keep the map items: what this is, how to run and test it, where things are.
- Move each other section to the file that owns it (PRODUCT.md, CONSTRAINTS.md, GLOSSARY.md, a decision) or to a skill.
- List each deletion with its reason.
- Add the precedence sentence and the workflow rule from `<skill dir>/templates/AGENTS.md`.

Apply it only after the owner approves. Then run `node <skill dir>/scripts/foundry.mjs state --set agents_md.state=migrated`.
Done: the owner approved and the state says `migrated`, or declined and it stays `unmigrated`.
