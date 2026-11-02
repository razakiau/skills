# Trigger check

This check asks whether a model loads check-screens on the tasks it is for, and leaves it alone on the others.

## Protocol

A harness replays the agent's system prompt with the installed skill list, sends one user prompt, and records which skill the model loads first. There are two prompt sets, tuned and held-out. Each set holds 36 prompts:

- 18 UI prompts. In the tuned set they were used while writing the description. In the held-out set they were written before reading the skill, and never used to tune it.
- 12 negatives: backend-only and other non-UI tasks, where check-screens must not load.
- 6 foundry prompts: tasks that must still load foundry, a sibling skill that sets a repo up for agents (proposed in razakiau/skills#2), so the new description does not take them over.

A UI prompt counts when check-screens is the first skill loaded, unless a row says otherwise. A negative counts when check-screens loads at all, so 0 is the target there. A foundry prompt counts when foundry loads. All rounds used deepseek-v4-pro, and each run checked that the served model was that one.

How to read the denominators: each prompt runs once per repeat. The Tuned and Held-out columns count the UI prompts of one set, so 18 per repeat. The Negatives and Foundry columns add up both sets, so 24 and 12 per repeat. Round 3 ran 3 repeats: 54 UI rows per set, 2 x 12 x 3 = 72 negative rows and 2 x 6 x 3 = 36 foundry rows. Round 4 ran 1 repeat and was stopped before the last held-out row, a foundry prompt, so its Foundry column has 6 tuned + 5 held-out = 11 rows.

## Results

| Round | Description | Repeats | Tuned | Held-out | Negatives | Foundry |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | name `ui-check` | 1 | 3/18 | 5/18 | 0/24 | 12/12 |
| 2 | renamed, first description | 1 | 11/18 | 5/18 | 0/24 | 12/12 |
| 3 | "load first, before brainstorming" | 3 | 50/54 | 42/54 | 0/72 | 34/36 |
| 4 | shipped | 1, stopped early | 10/18 | 9/18 | 0/24 | 10/11 |

Round 1 failed on the skill list, not the description. The harness sorts skills by name and describes only about the first 30,000 characters of the list. With about 120 skills installed, `ui-check` fell past that point and was listed by name only. The skill was renamed so it sorts into the described part.

The round 3 wording scored well, but it displaced brainstorming on UI feature prompts: brainstorming loaded first in 6 of 108 runs, against 20 of 108 without the skill. It was rejected for that reason.

In round 4, the shipped description was loaded first on 10 of 18 tuned and 9 of 18 held-out prompts, and loaded at some point on 14 of 18 tuned prompts. The round was stopped early.

## Limits

The shipped description does not reach 80% as the first skill loaded. That is deliberate: check-screens runs at the end of a UI change, so brainstorming and debugging keep the first slot. The dependable trigger is a line in the repo's AGENTS.md:

```text
After any UI change, run check-screens before reporting done.
```
