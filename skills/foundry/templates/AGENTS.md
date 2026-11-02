# Working on {{name}}

When this file and the code disagree, the code wins: say so, and propose the fix to this file.

## Check

Run this before you call a change done. It must pass.

```sh
{{check}}
```

## Verify

Show that the change works: run it, or add a test that fails without it, and quote the output.
The reviewer of each change also reads it for access control, input handling and secrets, using the security provider when one is installed.
After any UI change, run check-screens before reporting done.

## Where things are

{{links}}

## Workflow

A product-level decision made anywhere (a brainstorm, a spec, a review, a fix round) gets a decision file in docs/decisions/ and an update to PRODUCT.md in the same change. Code-level choices stay in the spec or the PR.
