# Routing

Read this first on every foundry request. It says where the repo stands and which command comes next.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.
The router proposes. It never runs a command without the owner's yes.

### 1. Read the signals

Run `node <skill dir>/scripts/foundry.mjs signals --json` from the repo. It prints one JSON object:

- `proposed`: the stage to propose, one of `explore`, `product`, `live`, `scale`.
- `reasons`: every reason for it, such as `34 commits` or `deployed: Dockerfile`. With none, it says `no signal beyond explore`.
- `files`: each file the proposed stage requires, `true` when present.
- `commits`, `age_days`, `sessions`, `has_ui`, `deployed`, `auth_code`: the evidence.

Then run `node <skill dir>/scripts/foundry.mjs state`. It prints `.agents/foundry.json`, or `foundry: no .agents/foundry.json` with exit 1 when foundry was never set up here.

Done: you have the signals object, and the state or the fact that there is none.

### 2. Judge the queued interviews

Each entry of `queue` in the state is `{interview, when, provider?, done}`. The script only stores `when` as text. You judge it.
For each entry with `done: false`, read `when` against the repo as it is now and the owner's request. Examples:

- `before the first screen`: has come when the request builds a screen, or a UI file exists and DESIGN.md does not.
- `at the first change that touches two modules`: has come when the planned change spans two modules.
- `on entering live`: has come when the stage is moving to `live`.

When unsure, say the moment may have come and let the owner decide.
Done: each open entry is marked as come or not yet, with one line of evidence.

### 3. Report

Tell the owner, in this order:

1. The proposed stage and the recorded stage, if any. Say when they differ.
2. Every reason from `reasons`, quoted.
3. Each required file whose value in `files` is `false`.
4. Each queued interview whose moment has come, with its provider. When the entry names none, take one from `~/.config/foundry/local.md` if that file exists, then from [providers.md](providers.md).
5. The AGENTS.md state: missing, `migrated`, or `unmigrated` from `agents_md.state`.

Done: all five are stated, even when one is "none".

### 4. Offer the next command

Pick one and say why:

- No state file: init, in [init.md](init.md).
- The proposed stage is above the recorded one: grow, in [grow.md](grow.md).
- A queued interview has come: run that interview, then set its `done` to `true`.
- Missing files or a failing check: audit, in [audit.md](audit.md), or check, in [check.md](check.md).
- A theme with no provider recorded: providers, in [providers-cmd.md](providers-cmd.md). It reads `~/.config/foundry/local.md` first when that file exists.
- Commits since the last garden pass, from `node <skill dir>/scripts/foundry.mjs garden-range`: garden, in [garden.md](garden.md). With 10 or more `sessions`: tune, in [tune.md](tune.md).
- Otherwise: nothing is due. Say so.

Wait for the owner's yes before you run it.
Done: one command is offered with its reason, and the owner has answered.
