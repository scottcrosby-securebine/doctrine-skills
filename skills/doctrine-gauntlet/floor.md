# Harness reference — `harness/floor.mjs`

Operating detail for the shipped technical-floor harness. The skill itself carries
the floor **list** and the gate semantics; this file is how to drive the tool.

Use whichever harness can render **the deliverable**. A design-system repo's harness
may only shoot that system's own file format, which makes it useless for the site you
are building. Otherwise use this one, run from the project so it resolves that
project's Playwright and axe.

```bash
node <this-skill-dir>/harness/floor.mjs <url-or-file> <outPrefix> [dark|light|both]
              [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR]
```

## What it does

Renders 360/768/1440 in the themes asked for, scrolls first so lazy images load, hides
dev-server overlays, checks heading structure and layout, and runs axe when it can
resolve it.

## Flags

- `--fragment` — the target is a card or partial, not a whole page, so a missing `h1`
  is not a defect.
- `--theme-class=NAME` — toggles a class on `<html>` for projects that theme that way
  (Tailwind's `dark`). Without it, `data-theme` alone leaves those projects
  unswitchable and the run reports a false "theme switch had no effect".
- `--crop=SELECTOR` — also shoots that element at 1:1 per width and theme, as
  `<outPrefix>-<theme>-<width>-crop.png`. A full-page screenshot of a long page is
  read scaled to fit, so a figure occupying a tenth of it is reviewed at a tenth of
  its size; this is how anyone actually sees it at shipped size. A selector matching
  nothing is `[UNMEASURED]`, not silence.
- `--single-theme`, with the one theme named — declares that the project genuinely
  ships one theme. **A single-theme site is not a floor failure.** Without this flag
  its missing theme is an `[UNMEASURED]` that can never clear, so the gate could never
  close.

## Output

Two markers, and the difference matters:

- **`[UNMEASURED]`** — a gap that should not be there: axe missing, a theme switch that
  did nothing, only one theme rendered. **It is not clean.**
- **`[JUDGE]`** — work the harness never does because it needs eyes: non-text contrast,
  focus visibility, canvas or rAF-driven motion, **theme reachability**, and any region
  `--crop` could not shoot. These always print. **The printed line never gates; the
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

Exit codes: `0` clean · `1` failing configurations · `2` could not run ·
**`3` nothing failed but something went unmeasured** — which is not a pass.

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
