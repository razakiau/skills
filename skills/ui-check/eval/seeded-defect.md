# Seeded-defect check for the reviewer

This check asks one question: does a fresh reviewer, given only the brief in [reviewer.md](../reference/reviewer.md), catch two planted visual defects, and does it leave a clean screen alone?

It has two arms with the same inputs, except for one capture:

- **clean**: the home capture is taken from `home.html`.
- **defect**: the home capture is taken from `home-defect.html`, which is `home.html` with two defects.

The approved mockup, `mockup/home-360-light.png`, is a capture of the clean `home.html` at 360 px, light theme.

## The defects

Both are visible in a capture and contradict `tokens.css`, the design source. The fixture names neither of them.

| Element | Defect | What `tokens.css` sets |
| --- | --- | --- |
| card list | the gap between cards is a hard-coded `13px` | `gap: var(--space-3)`, 16px; the scale is 4, 8, 16 and 24 px |
| tab bar | the background is a hard-coded `#f2d7a6`, a tan | `background: var(--surface)`, `#ffffff` in the light theme; no tan in the file |

## Prepare the inputs

You need Node.js 18 or later and Playwright. Set `UICHECK_PLAYWRIGHT_FROM` to a folder whose `node_modules` has `playwright`. Run from the repo top:

```sh
S=skills/ui-check/scripts/uicheck.mjs
D=skills/ui-check/scripts/fixtures/demo
E=<an empty folder outside the repo, or a gitignored one>
for arm in clean defect; do
  page=home.html; [ "$arm" = defect ] && page=home-defect.html
  node $S capture --url "file://$PWD/$D/$page" --screen home --widths 360 --themes light --out "$E/$arm"
  node $S capture --url "file://$PWD/$D/report.html" --screen report --widths 360 --themes light --out "$E/$arm"
  mkdir -p "$E/$arm/mockup"
  cp $D/mockup/home-360-light.png "$E/$arm/mockup/"
  cp $D/tokens.css "$E/$arm/"
done
```

Each arm then holds the same four file names, so a reviewer cannot tell the arm from them:

```text
home-360-light.png
mockup/home-360-light.png
report-360-light.png
tokens.css
```

To refresh the mockup after a change to `home.html` or `tokens.css`, capture `home.html` the same way and copy it to `$D/mockup/home-360-light.png`.

## Run

For each run, start a fresh subagent that has seen nothing of this check. Give it the brief from reviewer.md, verbatim, with these inputs, `<arm dir>` being the absolute path of `$E/clean` or `$E/defect`:

```text
- Intent: the home screen lists today's tasks as cards above the tab bar
- Captures: <arm dir>/home-360-light.png
- Approved mockup: <arm dir>/mockup/home-360-light.png
- Sibling captures: <arm dir>/report-360-light.png
- Design source: <arm dir>/tokens.css
- Previous review: none
```

Do not tell the reviewer which arm it is in, that defects were planted, or how many. Give it nothing else.

Run each arm 3 times, a fresh subagent each time. Keep each reply as it came.

## Pass

- **defect arm**: the first line is `disposition: fix` and there are `fix` items naming the card spacing and the tab bar colour, in 3 of 3 runs.
- **clean arm**: the first line is `disposition: ship`, with no `fix` item, in at least 2 of 3 runs.

A defect counts as named when a `fix` item points at that element (the gap between the cards; the tab bar background). An item tagged `ask` or `adaptation` does not count.

When a run fails, change reviewer.md, rerun all 6 runs, and add the new runs to the table with the reviewer.md commit they used.

## Results

| Run | Date | Model | reviewer.md commit | Arm | Disposition | Defects named |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-02 | claude-opus-5-5 | 944dc2a | clean | ship | none |
| 2 | 2026-11-02 | claude-opus-5-5 | 944dc2a | defect | fix | tab bar background, card gap |
| 3 | 2026-11-02 | claude-opus-5-5 | 944dc2a | defect | fix | tab bar background, card gap |
| 4 | 2026-11-02 | claude-opus-5-5 | 944dc2a | clean | ship | none |
| 5 | 2026-11-02 | claude-opus-5-5 | 944dc2a | clean | ship | none |
| 6 | 2026-11-02 | claude-opus-5-5 | 944dc2a | defect | fix | tab bar background, card gap |

The six runs were blind: each reviewer got a folder named `r1` to `r6`, with the arms shuffled at random. Defect arm: both defects named in 3 of 3. Clean arm: `ship` in 3 of 3. Every defect run measured the gap as about 14 px against 16 px from card positions, and read the tan as off-token from `tokens.css`. No reviewer reported an item the fixtures did not plant.
