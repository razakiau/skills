# Ladder

The rungs the check climbs, in order. The quality-bar interview proposes them; the check command runs them. Each rung is a tool that fails the check, never a sentence in AGENTS.md: an agent skips prose under pressure, and a failing command it cannot skip.

### Rungs

| Rung | Catches | TypeScript / JavaScript | Python | Go |
|---|---|---|---|---|
| types | wrong shapes | `tsc --noEmit` | `mypy` or `pyright` | `go vet` |
| lint | known bad patterns | eslint, biome | ruff | staticcheck, golangci-lint |
| complexity | functions too tangled to change | eslint `complexity`, `max-depth` | ruff `C901`, `PLR0912` | gocyclo |
| size | files and functions too long to read whole | eslint `max-lines`, `max-lines-per-function` | ruff `PLR0915`, a line-count script | a line-count script |
| unused | dead files, exports and dependencies | knip | vulture, deptry | `deadcode`, staticcheck `U1000` |
| duplication | copied blocks | jscpd | jscpd, pylint `duplicate-code` | jscpd, dupl |
| boundaries | imports that cross a module line | dependency-cruiser, eslint `no-restricted-imports` | import-linter | `go list` script, depguard |
| patterns | the project's own banned calls | semgrep, ast-grep | semgrep, ast-grep | semgrep, ast-grep |
| tests | behavior | the test runner | pytest | `go test` |
| docs | the maps match the code | `.agents/doc-check.sh` | same | same |

Other languages: the same rungs, with the ecosystem's tools. Name the tool in CONSTRAINTS.md.

### Picking the numbers

Measure today, then hold the line. Run each rung on the code as it is and set the threshold at the worst current value, or list the current offenders as exceptions. The check passes on day one, and nothing gets worse from there. Lower a threshold when a change brings the worst case down; never raise one to make a change pass without the owner's yes.

A repo with no number in mind can start from these: complexity 10 per function, 400 lines per file, 60 per function, duplication over 50 tokens. constraint-driven-development has more defaults when it is installed.

### Which rungs, when

- explore: none. Spikes are thrown away.
- product: types, lint, tests and docs from the start. Add complexity, size, unused and duplication at the quality-bar interview. Add boundaries once the code map names two modules that must not import each other.
- live: all rungs that apply, and patterns for each incident whose cause a rule could have caught.

Record each rung and its number in CONSTRAINTS.md under `## Code structure`, with where the number came from (measured on a date, or a default). The check command runs them all; CI runs the same command.
