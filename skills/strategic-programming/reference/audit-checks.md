# Reading checks: what the script cannot see

`audit` measures the diff's shape; these checks need the diff read against the placement note. Run each one on the lines this change adds or edits; leave the rest of the file alone.

## Concept duplication

One rule, written at several call sites: a `?? ""` at every read of a field, the same mapping in three services, the same date arithmetic in two components. The rule belongs once, in the owning layer, with the call sites calling it. jscpd misses this when the copies differ in names or formatting, so compare what each copy computes. Found one: move the rule to the owning layer, or justify the copies against part 4 of the note (a stated tactical choice).

## The deletion test

For each new helper, function or module: imagine deleting it and inlining its body. If complexity comes back at several call sites, it earns its place. If it comes back at one call site in the same layer, inline it there. A rule the note places in the owning layer stays there with one caller: that is the precedent's shape, not a speculative helper. Name a helper for its domain concept (`isOverdue`); a name taken from the first call site (`getInvoiceRowBadge`) marks a helper that sits in the wrong layer.

## One adapter is a hypothetical seam

An interface, option, parameter or strategy with one implementation and one caller is a guess about the future. Write the concrete code, and add the seam in the change that brings its second user.

## The cleanup list

Only on lines this change adds. Remove narrating comments, one-use variables and type laundering directly. For `try`/`catch`, defensive checks, retries and fallbacks this change added, remove one only when you can name where the state is ruled out (the owning layer's check, a type the compiler enforces). Anything else goes in your reply as a note for the owner.

- comments that narrate or restate the code;
- `try`/`catch` that recovers nothing, translates nothing and adds no context: errors propagate to the existing handler;
- defensive checks this change added for a state the owning layer already rules out (name where);
- type laundering: `as any`, `as unknown as T`, widening then asserting;
- one-use intermediate variables that add no domain meaning;
- compatibility shims, aliases, retries and fallbacks with no named contract behind them;
- naming, imports and control flow that differ from the surrounding file.

## Tests

The junk list and replace-don't-layer in [tests.md](tests.md), applied to every test the diff adds or changes.

## `--dup`

`audit --dup` runs jscpd through `npx` (network on first use, up to 120 s). It checks the base out in a temporary git worktree, so the repo's post-checkout hooks and Git LFS filters run there; the checkout is removed afterwards. It reports only clone blocks that are new since the base and touch a changed file. A `duplicates: not measured (<why>)` line means jscpd did not run: say so in your reply, and do the concept duplication check by reading.

## Fresh reviewer

On Full + reviewer, dispatch a subagent that has not seen the conversation. Give it:

1. the placement note, verbatim;
2. the `audit --dup` output;
3. the diff `audit` measured: `git diff <sha on its base: line>`, plus the content of each new untracked file;
4. the prompt below, followed by this file's sections from "Concept duplication" to "The cleanup list", and the full text of tests.md's junk list.

Prompt:

> You review one code change against the plan its author wrote before writing it. Read the placement note, the audit output and the diff. Report, one line each with file and line: (a) code outside the owning layer the note names; (b) code shaped differently from the precedent the note names (file, naming, signature); (c) call sites the note lists that the diff leaves unchanged, and call sites with the same need the note missed (search the repo); (d) audit flags the diff leaves unexplained; (e) items from the reading checks below. Return findings only, or the single word `none`.

Answer each finding like an audit flag. A `none` is reported as such; a reply with no text means you say so and do the review yourself, without retrying.

Adapted from openclaw `deslop` (MIT), Matt Pocock's `codebase-design`, and NeoLabHQ context-engineering-kit.
