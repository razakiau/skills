# The code map: `docs/code-map.md`

It lives in `docs/` because search tools such as ripgrep skip hidden folders. A map still at `.agents/code-map.md` is read too; move it with `git mv .agents/code-map.md docs/code-map.md`, and its `AGENTS.md` pointer with it. When both exist, `docs/code-map.md` wins.

A committed file, read before every code change: where each shared concept lives and which code to copy. Rows are concepts ("a fact derived from an entity"), not folders. Feature code goes in its feature's folder and needs no row; a row exists where the home is non-obvious or shared.

## Template

```markdown
# Code map

<One line: what this repo is.>

| Concept | Home | Path | Precedent |
|---|---|---|---|
| <a kind of change, e.g. "fact derived from an entity"> | <where it goes, in words> | <dirs or globs> | <file and symbol to copy> |

## Invariants

- <A rule no dependency graph shows, and why: e.g. "packages/domain stays free of I/O, because the frontends consume it".>
```

**Path** is a comma-separated list of directories or globs relative to the repo root. `*` matches within one path segment, `**` across segments; no braces. A directory covers everything under it. Leave Path empty when the home is not a fixed place ("the sibling controller"); that row guides placement and the script skips it.

`audit` reads the first table whose header has a `Path` column. It flags, under `unlisted home:`, a **new** code file inside a **shared** package that no Path covers. New files in an app's own folders, and edits to existing files, are never flagged this way.

The map is also the opt-in: the end-of-turn hook runs only in a repo with a code map at the top.

## Drafting a map

For a repo with none, on the first Full change:

1. **Read the graph**: `nx graph --file=<tmp file>`, `graphify query`, or the workspace manifests. List the shared packages: those two or more other projects depend on.
2. **One row per shared package with a real precedent**: open the package, find the code a typical change there would copy, and write the concept it stands for, its home, its Path and the precedent as file and symbol. A package with no clear precedent gets no row yet.
3. **Invariants**: rules you found that no graph shows (a package kept framework-free, a compiler setting that hides a class of bug), and how each runtime reports an error: which handler logs and tracks a failure in an HTTP handler, a queue worker, a scheduled job.
4. **The owner reviews** the draft before it is saved.
5. **One pointer line** in the repo's `AGENTS.md`: `Where code goes: docs/code-map.md (read by the strategic-programming skill).`

## Keeping it current

Propose a new row when a placement was non-obvious or the owner corrected it, and fold it into that change. An unmapped concept falls back to the graph and the precedent search, which is the normal case.
