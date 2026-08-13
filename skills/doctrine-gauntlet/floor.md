# Harness reference — `harness/floor.mjs`

Operating detail for the shipped technical-floor harness. The skill itself carries
the floor **list** and the gate semantics; this file is how to drive the tool.

Use whichever harness can render **the deliverable**. A design-system repo's harness
may only shoot that system's own file format, which makes it useless for the site you
are building. Otherwise use this one, run from the project so it resolves that
project's Playwright and axe.

```bash
node <this-skill-dir>/harness/floor.mjs <url-or-file> <outPrefix> [dark|light|both]
              [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR] [--expect=TEXT]
```

## What it does

Renders 360/768/1440/**2560** in the themes asked for, scrolls first so lazy images load,
hides dev-server overlays, checks heading structure, layout and target size, compares type
scale across widths, and runs axe when it can resolve it.

**2560 is in the ladder because a whole defect class lives above 1440**: fixed-pixel type
stays byte-identical while the sheet keeps expanding, so the pictures grow and the words
do not. That costs two extra configurations per run and is the only thing that finds it —
seven gauntlet rounds at 360/768/1440 passed a page whose nav was 13px at every resolution
up to 4K.

**Two width constants, and they are not the same one.** `WIDEST` (2560) is the top of the
ladder. `DESKTOP` (1440) is the reference for judgements about having enough room — the
inner-clip discriminator uses it, so a component clipping at 1440 but fitting at 2560 is
still reported as a defect. Anchoring that judgement to `WIDEST` is the trap: it would
silently re-rule every 1440 clip as a deliberate responsive scroller.

## Flags

- `--expect=TEXT` — refuse to measure unless `TEXT` appears in the page's **rendered
  text**. Use it on any `http://` target. A URL answering 200 is not evidence it served
  what you meant: a dev server already holding the port sends the next one elsewhere
  without failing, and two complete runs once measured **a different site** and printed
  a clean floor. Matching rendered text and not source is deliberate — source would hit
  the JS bundle and pass on a string no reader ever sees. The run also refuses a page
  with under 30 characters of text, because a negative check ("is not the other site")
  is satisfied by an empty response. Identity — title, first `h1`, text length — prints
  on every run whether or not you pass this.
- `--fragment` — the target is **owned by a host page** that supplies theme switching and
  the type scale: a design-system card specimen, a partial, anything rendered inside
  something else. A missing `h1` is not a defect (exactly one is still fine), and the
  theme-reachability and frozen-type judgements are suppressed because neither is this
  file's to answer. Read the flag by ownership, not by the `h1` clause alone — a card
  that requires exactly one `h1` still wants this flag.
- `--theme-class=NAME` — toggles a class on `<html>` for projects that theme that way
  (Tailwind's `dark`). Without it, `data-theme` alone leaves those projects
  unswitchable and the run reports a false "theme switch had no effect".
- `--crop=SELECTOR` — also shoots that element at 1:1 per width and theme, as
  `<outPrefix>-<theme>-<width>-crop.png`. A full-page screenshot of a long page is
  read scaled to fit, so a figure occupying a tenth of it is reviewed at a tenth of
  its size; this is how anyone actually sees it at shipped size. A selector matching
  nothing is `[JUDGE]`, not silence — it is never `[UNMEASURED]`, and the two are
  different gate law. The harness saw the page; what it could not do is put a region in
  front of eyes, so it hands the question over rather than blocking. The block, when there
  is one, comes from the critic: critic brief item 5 makes it say it had no way to crop,
  and Modes makes that abstention blocking.
- `--single-theme`, with the one theme named — declares that the project genuinely
  ships one theme. **A single-theme site is not a floor failure.** Without this flag
  its missing theme is an `[UNMEASURED]` that can never clear, so the gate could never
  close.

## Output

Two markers, and the difference matters:

- **`[UNMEASURED]`** — a gap that should not be there: axe missing, a theme switch that
  did nothing, only one theme rendered. **It is not clean.**
- **`[JUDGE]`** — work the harness never does because it needs eyes: non-text contrast,
  focus visibility, canvas or rAF-driven motion, **theme reachability**, content hidden
  inside scrollable components, **undersized-but-spec-exempt targets**, **type frozen
  above 1440**, and any region `--crop` could not shoot. These always print. **The printed line never gates; the
  critic's answer to it does** — non-text contrast, visible focus and a reachable second
  theme are all floor items, so a critic finding any of them failing is a floor failure
  and blocks. `[JUDGE]` means the harness handed you the question, never that the
  question is optional.

  **Theme reachability** is here rather than in `[UNMEASURED]` on purpose. Both themes
  really were rendered, so nothing went unmeasured; the possible defect is that one of
  them ships to nobody, because this harness applies the theme itself. The probe reports
  what it found — a media query, a toggle, a script, weak signals, or nothing — and no
  probe can separate a real switch from a nav link named "Themes", so the verdict is the
  critic's. It also matters that `[UNMEASURED]` is waivable and a floor failure is not:
  a genuinely dead palette must not be waivable. `--single-theme` remains the honest
  answer for a page that really ships one.

  **Target size** is deliberately split across both halves. WCAG 2.5.8's 24x24 minimum is
  measured on every control, and the spec's own exceptions are implemented: an undersized
  target that is *inline in a sentence* is dropped entirely, one that is *isolated* —
  nothing within a 24px-diameter circle — is spec-compliant and prints as `[JUDGE]`, and
  only a **crowded** undersized target fails and gates. That split is not hedging: the
  spec really does clear an isolated 145x14px link, and that link was a live campaign's
  primary call to action which the client rejected on sight. The harness must not invent a
  rule, so it hands you the ones the spec forgives. **A bound system that has ruled "every
  control clears 24x24" has already answered them** — its law binds ahead of this.

  **Type frozen above 1440** compares the widest render against the desktop one and prints
  only when the container grew more than 5% and the median functional type did not grow at
  all. It is a comparison, not a measurement at a width, which is why no single render —
  and therefore no critic handed one — can find it. Decorative type is out of scope by
  construction: the sample is `p, li, a, button, label, input, td`. Suppressed under
  `--fragment`, for the same reason reachability is: a card specimen has no max-width of
  its own, so its container grows to every viewport and the check would fire on every card
  in every kit. Type scale is a page decision.

  **"Container" means the reading column, not the page wrapper**, and the distinction is
  the whole check. Measuring the widest laid-out block reports growth on every full-bleed
  layout: a stock shadcn page reported "the layout grew 78%" while its `<main>` was capped
  at `max-w-3xl` and the reader's column never moved. The sample is block-level text
  elements, which fill their column, so what is measured is the box whose growth would
  actually force the type to follow. A page with no running text leaves it unmeasured
  rather than guessed.

  **Content hidden inside scrollable components** exempts the visually-hidden pattern —
  an absolutely positioned ~1px box, or `clip-path: inset(50%)`. `.sr-only` hides its
  whole string by design and sits on most modern pages; without the exemption the check
  reports "hides 555px … treat as blocking" against standard screen-reader markup. A real
  scrollable component is never 1px in either axis.

Exit codes: `0` clean · `1` failing configurations · `2` could not run ·
**`3` nothing failed but something went unmeasured** — which is not a pass.

## Changing it

**Every new check ships with a tamper test, both halves.** Break what it measures and
confirm it trips; then run it against a known-good artifact and confirm it stays quiet. A
check that silently measures nothing prints exactly what a passing check prints — a
sibling repo's contrast gate keyed pair discovery on `endswith('-foreground')`, which
never matches `foreground`, and the most-used text pair on every page went unmeasured
behind a green report. The second half matters as much: it is what separated a genuine
desktop layout defect from a design system's deliberate responsive scrollers.

**If you ever add a focus check, do not use `el.focus()`.** A programmatic focus does not
arm `:focus-visible` once the run has clicked anything, and this harness clicks. A sibling
battery reported all 32 tiles ringless on light — it had clicked the theme toggle to get
there — while the identical dark pass passed and nothing was wrong with the page. Drive
the keyboard and read `document.activeElement`.

## Resolution and portability

It refuses to run when no browser is available, printing the install line rather than a
verdict. Nothing in it is machine-specific; `NODE_PATH` points it at an existing install
when the project has no `node_modules` of its own. **Do not hardcode a path into a copy
of it.**

If the page renders but axe cannot be obtained, accessibility is **unmeasured, not
passed**: say so and let the user waive it or stop.

Any new theme-application site in the code must go through the shared `applyTheme()`
helper — a second call site setting `data-theme` directly is how the reduced-motion pass
silently measured the wrong theme.

## Render honesty

Prove the render is honest before anyone grades it. Two artifacts are otherwise judged
as design:

- A dev server injects overlays — error badges, refresh indicators — that land in the
  screenshot, and emits hydration warnings that a floor gating JS errors would count as
  failures the built page never has. This harness hides the overlays and reports those
  warnings as noise rather than gating them. Serve production output where you can, and
  tell critics which marks are the harness.
- A full-page screenshot does not trigger lazy loading, so a long page comes back with
  its lower images blank. Scroll to the bottom and wait for images to settle before
  shooting, or a critic will reject content that is actually there. One campaign's
  earlier waves under-reported their own imagery this way, and the client's eventual
  rejection was that the pages had no identifiable photographs.

Look at the first render yourself before dispatching a single critic. Blank regions and
stray badges are usually the harness, not the build.
