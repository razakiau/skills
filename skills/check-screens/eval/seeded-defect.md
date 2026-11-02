# Seeded-defect check for the reviewer

This check tests whether a fresh reviewer, given only the brief in [reviewer.md](../reference/reviewer.md), catches two planted visual defects and leaves a clean screen alone.

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

You need Node.js 18 or later and Playwright. Set `CHECK_SCREENS_PLAYWRIGHT_FROM` to a folder whose `node_modules` has `playwright`. Run from the repo top:

```sh
S=skills/check-screens/scripts/check-screens.mjs
D=skills/check-screens/scripts/fixtures/demo
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

## Blind the folders

The arm name is in the path of `$E/clean` and `$E/defect`, so do not hand those paths to a reviewer. Copy the arms into six neutral folders first, 3 clean and 3 defect, in shuffled order, and keep the key where no reviewer can read it:

```sh
B=<an empty folder outside the repo, not inside $E>
K=<a key file outside $B, never shown to a reviewer>
arms=$(printf 'clean\nclean\nclean\ndefect\ndefect\ndefect\n' | node -e 'const a=require("fs").readFileSync(0,"utf8").trim().split("\n");for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}console.log(a.join(" "))')
n=0
for arm in $arms; do
  n=$((n+1))
  cp -R "$E/$arm" "$B/r$n"
  echo "r$n $arm"
done > "$K"
```

Do not open `$K` until all six reviewers have replied.

## Run

For each folder `r1` to `r6`, start a fresh subagent that has seen nothing of this check. Give it the brief from reviewer.md, verbatim, with these inputs, `<run dir>` being the absolute path of that folder, `$B/r1` to `$B/r6`:

```text
- Intent: the home screen lists today's tasks as cards above the tab bar
- Captures: <run dir>/home-360-light.png
- Approved mockup: <run dir>/mockup/home-360-light.png
- Sibling captures: <run dir>/report-360-light.png
- Design source: <run dir>/tokens.css
- Previous review: none
```

Do not tell the reviewer which arm it is in, that defects were planted, or how many. Give it nothing else.

That makes 3 runs per arm, a fresh subagent each time. Keep each reply as it came. When all six have replied, open `$K` and match each reply to its arm.

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

Recorded before the skill was renamed from ui-check; the reviewer brief was the same text.

The six runs were blind: each reviewer got a folder named `r1` to `r6`, with the arms shuffled at random. Defect arm: both defects named in 3 of 3. Clean arm: `ship` in 3 of 3. Every defect run measured the gap as about 14 px against 16 px from card positions, and read the tan as off-token from `tokens.css`. No reviewer reported an item the fixtures did not plant.

## Negative control

On 2026-11-02, six more fresh subagents got the same inputs with a weak prompt instead of the brief: the five inputs, "Does it look right?", and the output format (`disposition: ship` or `disposition: fix`, then one `fix` line per problem, or `none`). They had no checks, no tags and no order. They ran on claude-opus-5-5, as a general review agent whose own instructions ask for evidence. The weak runs were not blind: n1 to n3 got the defect arm and n4 to n6 the clean arm, in that order.

| Run | Prompt | Arm | Disposition | Defects named |
| --- | --- | --- | --- | --- |
| n1 | weak | defect | fix | tab bar background, card gap |
| n2 | weak | defect | fix | tab bar background, card gap |
| n3 | weak | defect | fix | tab bar background, card gap |
| n4 | weak | clean | ship | none |
| n5 | weak | clean | ship | none |
| n6 | weak | clean | ship | none |

The weak prompt scored the same as the brief: both defects named in 3 of 3, `ship` on the clean screen in 3 of 3. On this model, these two defects are too visible to show what the brief adds: a hard-coded colour and a 3 px gap, against a mockup of the same size. The results above show the brief does not hurt detection or raise false `fix` items; they do not show it finds more. The weak clean runs listed what they could not check (dark theme, wider widths, a long list) as prose, where the brief would make them `ask` items or leave them out.

## Limits

A harder fixture is needed to tell the brief from a plain prompt: a defect only a sibling shows, a dark-theme-only one, or an overflow with a long real value. Until then, the case for the brief rests on its fixed output, which the loop parses, and its rule that the reviewer edits and renders nothing.

## Replies

The three clean runs (r1, r4, r5) each returned `disposition: ship`, then `none`. The `fix` lines of the three defect runs, as they came:

r2:

```text
fix tab bar background: saw a tan/beige fill (about #f0d8a8) and no visible top border, expected the white surface with a 1px border on top, as in the mockup and the Report screen. Tan is not one of the colours in tokens.css (tokens.css `.tabs` sets `background: var(--surface)` = #ffffff) (r2/home-360-light.png)
fix gap between task cards: saw about 14px (cards start at y≈79/178/277/376), expected 16px (mockup cards start at y≈79/181/283/385; Report screen gap matches the mockup). 14px is not on the 4/8/16/24 spacing scale (tokens.css `.cards` `gap: var(--space-3)` = 16px) (r2/home-360-light.png)
```

r3:

```text
fix tab bar background: saw a tan/beige fill (about #f0d8a8) and no top border line. Expected the white surface (#ffffff) with a 1px #dde1e7 top border, as in the mockup and the report screen (r3/home-360-light.png; r3/mockup/home-360-light.png; r3/report-360-light.png; tokens.css .tabs, where background is var(--surface) and border-top is 1px solid var(--border)). The tan colour is not one of the design source's colour values.
fix gap between task cards: saw about 14px between cards (each card starts about 99px below the last). Expected 16px, as in the mockup and the report screen, where each card starts about 102px below the last (r3/home-360-light.png; r3/mockup/home-360-light.png; tokens.css .cards gap: var(--space-3) = 16px). This is a guess from measuring pixels by eye.
```

r6:

```text
fix tab bar background: saw a tan/beige fill (#f0d9a8-ish) with no visible top border, expected white surface (#ffffff) with a 1px #dde1e7 top border as in mockup and Report sibling (r6/home-360-light.png, tokens.css .tabs background: var(--surface); border-top)
fix gap between task cards: saw about 14px (cards start at y≈79, 178, 277, 376, about 85px tall), expected 16px per --space-3, cards at y≈79, 181, 283, 385 as in mockup and Report (r6/home-360-light.png, tokens.css .cards gap: var(--space-3))
```
