# Replay evaluation

Run foundry on a repo as it was early on, then check whether it named what the repo needed later. This is the release gate for a new version, and the repo's owner scores it.

## Snapshots

Pick two or three of your own repos that have since gone further, and check each out at an early commit: the scaffold commit, or the last commit on or before a chosen date (`git rev-list -1 --before=<date>T23:59:59 HEAD`).
Each snapshot is a throwaway clone under `mktemp -d`. Never use your working checkout.

## In each snapshot

1. Run `node <skill dir>/scripts/foundry.mjs signals --json` and keep the JSON.
2. Follow [../reference/audit.md](../reference/audit.md) step by step, as an agent would. If the repo has no check command, run `sh <skill dir>/templates/doc-check.sh` from the repo top; it only reads. Audit writes nothing, so `git status` stays clean.
3. Keep the audit report.

Score a snapshot at the stage you were actually working at. Next to it, record the stage `signals --as-of <snapshot commit>` gives. With `--as-of`, `signals` reads that commit's tree and measures `age_days` at that point: the commit's own date, or the end of the day you gave, and it leaves sessions out, since it cannot tell which sessions existed then.

## The "needed later" list

Build it from the history after the snapshot:

- `git log --diff-filter=A --name-only <snapshot>..origin/HEAD`, kept to the files foundry would own: AGENTS.md, PRODUCT.md, DESIGN.md, decisions, glossary, architecture, constraints, threat model, runbooks, check wiring;
- every file in `docs/decisions` or `docs/product/decisions`;
- every AGENTS.md line added later;
- commit subjects that show work a theme or a readiness item names (auth, rollback, design drift, money rules);
- corrections you remember making by hand after the snapshot, such as "the design was never written down" or "there were no password rules".

## Scoring

One table per repo, one line of evidence per row:

| Needed later | Caught by foundry (where) | Missed | Noise |
|---|---|---|---|

- Caught: the audit names it as a required file, a check failure, an open theme or a readiness item. Say which.
- Missed: nothing in the audit points to it.
- Noise: the audit asks for it, and nothing in the later history needed it.

Where the call is a judgement, the row says "owner to score". Keep the tables with the repos if they are private; publish only counts.

## Trigger test

The harness replays the agent's real system prompt with the skill list for each arm, sends one prompt, and scores the first skill the model loads. Two arms: `arm0` is your usual skill folders; `foundry` is the same plus this plugin's folder.

Prompts, each run 3 times on the default model:

- 6 positives, expecting `foundry`: "start a new project for X", "set this repo up for agents", "audit this repo's setup", "is this ready for real users", "what's missing before we launch", "make this repo agent friendly";
- 6 negatives, expecting no `foundry`: "add a dark mode toggle", "fix this failing test", "rename this function", "write a PR body", "debug why login 500s", "brainstorm a new filter";
- 10 core prompts that already route to your other skills, to catch foundry stealing them.

Pass: positives load `foundry` first 80% of the time or more; negatives load it 10% of the time or less; the core hit rate drops by 5 points or less against `arm0`.

Three descriptions were measured on the author's setup. The first named another plugin's brainstorming skill; the published one names none.

| Description | Tuned positives | Tuned negatives | Core vs `arm0` | Held-out positives | Held-out negatives |
|---|---|---|---|---|---|
| first, naming the other skill | 18/18 | 0/18 | within noise | 15/18 | 0/12 |
| neutral, no ordering | 16/18 | 0/18 | +0 | 11/18 (fail) | 0/12 |
| published: "Use first, before any brainstorming or planning" | 18/18 | 0/18 | +0 | 15/18 | 0/12 |

The held-out set is 6 paraphrased positives and 4 negatives, written after the first tuning and before any result on them. `arm0` loaded `foundry` on none of them. Without the word "first" and an ordering, "start a new project" prompts went to a general brainstorming skill. With the published description, the 3 held-out misses all went to a launch checklist skill ("are we actually ready", "what gaps do we still have").

Limits. The 18 tuned positives are 6 prompts repeated 3 times, and repeats of one prompt are correlated. The description was tuned on those same 6 prompts, so 18/18 is a score on the training set. The held-out 15/18 (83%) is the fairer number, and it is one miss over the bar. Three descriptions were tried against the same held-out set, so it is no longer fully held out either. The core difference was one prompt in 30, the same size as `arm0`'s own swing between runs: it is within noise, not evidence of no regression. All runs used one model.
