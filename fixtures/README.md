# Generality fixtures

`doctrine-gauntlet` was developed against one design system, which is how a skill
acquires rules that only make sense for that system without anyone noticing. These
three cases are the standing test that it did not.

Run a change against all three. Each proves something the others cannot:

| Case | Proves |
|---|---|
| `bare.html` — a page with no system, no repo, no package.json | nothing became mandatory: a run with no house system is the ordinary path, not a degraded one |
| `shadcn.sh` — a stock Next + shadcn install | nothing encoded one house's taste, **and** the single-repo topology works (the system lives inside the deliverable) |
| a real bound system | the skill still fits the system actually being shipped against |

**The recipe is checked in; the app is not.** Vendoring a Next tree into a
pure-markdown plugin would contradict the portability the harness already has. Build on
demand:

```bash
fixtures/shadcn.sh /tmp/fixture-shadcn      # ~2 min, needs network
```

Versions are pinned deliberately. Unpinned, the fixture rebuilds into a *different*
system in three months and every regression it reports is weather rather than signal.
A rebuild that differs under these pins is itself information.

## What these three found

Landed in v1.15.0, none of it visible from a single-system audit:

- the harness measured **the wrong website** through two complete runs and printed a
  clean floor — another dev server held the port, the fixture moved, nothing checked
- the inner-clip check read `.sr-only` as a blocking layout defect, which fires on
  essentially every modern site
- the frozen-type check measured the page wrapper rather than the reading column, so it
  fired on a stock page whose `<main>` was capped at `max-w-3xl`
- precedence made a scaffold's zero-chroma defaults outrank the brief, shipping a grey,
  single-typeface page marked house-compliant

The theme probe is the sharpest illustration: it reports "nothing reachable" on a kit
card (a **false** alarm — the Design pane owns theming) and on a stock shadcn app (a
**true** one — `.dark` styles ship with no toggle). Identical output, opposite correct
answers. Only having both cases in front of you shows that.
