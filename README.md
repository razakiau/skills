# skills

Two agent skills, each self-contained in its folder:

- `skills/no-slop/`: edits prose so it reads like its writer, or audits it for AI-writing patterns without rewriting.
- `skills/strategic-programming/`: places a code change in its owning layer before writing it, then measures the diff with a bundled audit script, plus an end-of-turn hook (`hooks/hooks.json`) in repos that have a `.agents/code-map.md`.

no-slop is merged from [blader/humanizer](https://github.com/blader/humanizer) 3.1.0 and [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop), both MIT. The skill is in `skills/no-slop/`: `SKILL.md` (process), `patterns.md` (29 patterns, strongest first), `eval.md` (final check).
