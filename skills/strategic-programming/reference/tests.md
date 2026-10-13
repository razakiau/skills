# Tests: the gate, the junk list, replace-don't-layer

A test is code too: each one protects a named behaviour, at the boundary that owns it.

## The gate

Before writing or changing a test, answer three questions in the placement note:

1. **Protected behaviour**: which observable behaviour, invariant or contract does it protect?
2. **Credible regression**: which plausible change to the code makes it fail? A bug fix always has one: the bug.
3. **Why existing proof misses it**: name the nearest existing test and why that regression passes it.

With all three answered, place the test:

- **One owner at the strongest boundary.** Each contract gets one primary test at the boundary that owns it (an entity spec for an entity getter, a lib spec for a helper). A second layer earns its own test only when it carries a distinct risk (transport, lifecycle, persistence).
- **Extend before creating.** Add a row to an existing table test, or a case built from the shared fixtures and factories, before opening a new test file. `audit` reports a new test file beside an existing one under `tests beside:`; answer it with the reason the existing file is the wrong home.
- **Every seam has a production caller.** Each export, flag, wrapper or injection point the change adds is called by production code. When a test seems to need one, move the test to the real boundary instead.
- **Red, then green.** The regression fails before the fix, for the reason the bug gives, and passes after it.

An unanswered question means the test protects nothing new: the change ships with the tests it already has.

## The junk list

Rewrite each of these against the real boundary, or drop it:

- assertion-free probes, and assertions that compare a value with itself;
- expected values computed by the code under test;
- copied inventories: a list of exports, routes or keys pasted into the test;
- greps of source text, imports or exact strings;
- call-shape assertions (called with these arguments, this many times) where the result is observable;
- mocks that supply the behaviour the test then asserts;
- fixtures that fabricate what the owner should produce (ordering, receipts, persisted state the code never writes);
- negative controls that pass on an unrelated guard;
- names that promise behaviour the inputs never exercise;
- test-only exports, globals and wrappers.

## Replace, don't layer

A test at a deeper interface makes the shallower tests of the same contract redundant: the change deletes them in the same diff. Report the tests removed and the contract that now owns them. A behaviour-preserving refactor keeps its tests green unchanged; when one breaks, it was testing the implementation, and it moves to the boundary.

Adapted from openclaw `test-audit` (MIT) and Matt Pocock's `codebase-design`.
