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
scale across widths, and runs axe when it can resolve it. Two more checks **gate** and were
missing from this list: **uncaught page errors** — a `pageerror` fails that configuration,
while console errors are printed as noise and never gate — and a **reduced-motion pass**,
which fails on text still hidden under `prefers-reduced-motion` and on any CSS or WAAPI
animation still running.

**It writes screenshots, and their paths are what everything downstream grades.** Every
configuration writes a full-page PNG to `<outPrefix>-<theme>-<width>.png` — so
`<outPrefix>-dark-360.png`, `-768`, `-1440`, `-2560`, and the same four in `light` —
plus `<outPrefix>-reducedmotion-<theme>.png` per theme, and
`<outPrefix>-<theme>-<width>-crop.png` for every configuration where `--crop` matched
something. The critic brief requires the orchestrator to hand over this round's renders
at 360/768/1440/2560 in every theme: those eight files are it.

**The reduced-motion pass runs in every theme, at 1440 only**, writing
`<outPrefix>-reducedmotion-<theme>.png` per theme. Per-theme because a reveal scoped to one
palette is invisible in the other — a single pass in the first theme gated one and certified
two — and `SKILL.md` tells the builder "both themes get all of this". 1440 only because a
reduced-motion defect is almost always CSS-scoped rather than width-scoped, so a defect
firing at 360 alone is still unmeasured here and nothing in the output says so. That residue
is the hard case for the rule under **Changing it**: a check that measures *nothing* prints
what a passing check prints, and a check that measures *most* prints it with a real result
behind it.

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

  **It is a single-shot check, and knowing where it looks is how you pick a marker that
  works.** Both this and the 30-character refusal run **once**, in the first theme at the
  first width — `dark` at `360px` — against the page's title, its first `h1`, and its
  whole `document.body.innerText`. Three consequences. A marker inside an element hidden
  at 360 fails, because `innerText` skips `display: none`. A marker that renders only in
  `light`, or only at desktop, fails. And failure is **exit 2 / CANNOT RUN**, which stops
  the whole gate — so pick something the page shows in every theme at every width. The
  title is the safe choice, and the run prints it for you.

  **It asserts identity, never freshness, and it cannot honestly be made to.** A server
  still holding a build you deleted an hour ago serves the same title and the same `h1`,
  and passes. Nothing observable from inside a rendered page says "this is the current
  build" unless the build itself put it there, so a freshness flag would be measuring the
  caller's promise rather than the artifact — the one thing this harness refuses to do.
  Closing the gap costs no code: **point `--expect` at a string that changes with the
  build** — a version or date the page renders, or simply a phrase from the copy you just
  edited. That turns the same single-shot check into a freshness gate, and it is already
  the browser-side assertion the deliverable's own rule asks for ("gate every browser
  measurement on a computed style, never on a status code") rather than a second mechanism
  beside it. One residue: where the change is purely visual, `--expect` cannot see it at
  all. Rebuild against a stopped server, or restart the server after building.
- `--fragment` — the target is **owned by a host page** that supplies theme switching and
  the type scale: a design-system card specimen, a partial, anything rendered inside
  something else. A missing `h1` is not a defect (exactly one is still fine), and the
  theme-reachability and frozen-type judgements are suppressed because neither is this
  file's to answer. Read the flag by ownership, not by the `h1` clause alone — a card
  that requires exactly one `h1` still wants this flag. **It suppresses no `[UNMEASURED]`
  line, and the one-theme line included**: that push is gated on `--single-theme` alone
  and never consults `--fragment`, so a single-theme card shot with `--fragment` by itself
  reports its other theme missing, exits 3, and blocks the gate with no hint why. Pass
  both flags.
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

Every line the run prints carries a prefix, and there are more than two of them:

| Prefix | Stream | What it is |
|---|---|---|
| `[<theme> <width>px]` | stdout | header for one configuration, then `FAIL` or `ok` and the page height |
| `[reduced-motion <theme>]` | stdout | header for one reduced-motion pass (1440 only) |
| `!` | stdout | a **gating** finding, inside the configuration above it |
| `~` | stdout | console noise — printed, never gated |
| `?` | stdout | images that finished loading with no pixels in that configuration |
| `…` | stdout | a display cap firing: how many were withheld, and the total |
| `[UNMEASURED]` | stdout | a gap in this run. **Not clean** |
| `[JUDGE]` | stdout | a question handed to eyes. Never gates by itself |
| `[MEASURED]` | stdout | what this run actually looked at — URL, title, first `h1`, characters of text. Prints on every run that rendered anything, and is the line that catches a server holding the wrong artifact |
| `=== TECHNICAL FLOOR: … ===` | stdout | the verdict |
| `FLOOR: CANNOT RUN` | **stderr** | nothing was measured at all; exit 2 |

**The verdict line has exactly three forms**, and none of them can be misread as a pass:

- `=== TECHNICAL FLOOR: PASS ===` — exit 0.
- `=== TECHNICAL FLOOR: NOT CLEAN — nothing failed, but N item(s) went unmeasured ===` —
  exit 3. It says NOT CLEAN, and not "PASS on what was measured" as it once did, because
  what a critic is handed is the **text report** and not the exit code.
- `=== TECHNICAL FLOOR: N failing configuration(s) ===` — exit 1.

The two markers that carry gate law:

- **`[UNMEASURED]`** — a gap in this run that should not be there. **It is not clean.**
  The complete list of what pushes one: axe could not be resolved at all; axe threw or
  **timed out** — it is raced against 45 seconds in every configuration; **contrast that
  axe ran but could not determine**; a theme switch that had no effect; only one theme
  rendered without `--single-theme`; images that finished loading carrying no pixels; a
  runtime with no `document.getAnimations`.
- **`[JUDGE]`** — work the harness never does because it needs eyes. **Three of the nine
  print on every run; the other six print only under their own condition**, and the
  difference is gate law: a critic told to expect a line it never receives has grounds to
  declare an abstention, and an abstention blocks exactly like an unmeasured floor item.
  Unconditional, every run: **non-text contrast** (WCAG 1.4.11), **visible focus**, and
  **rAF/canvas-driven motion** under reduced motion. Conditional, each with its condition:
  **theme reachability** — two themes rendered, and neither `--single-theme` nor
  `--fragment`; **content hidden inside scrollable components** — something clipped;
  **undersized-but-spec-exempt targets** — there were some; **type frozen above 1440** —
  not `--fragment`, *and* the container grew over 5% from 1440 to 2560, *and* the median
  functional type did not grow at all; **a region `--crop` could not shoot** — `--crop`
  was passed and missed; **axe's other undecided rules** — its `incomplete` bucket held
  something that was not contrast. **The printed line never gates; the
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

  **axe's `incomplete` bucket is read, and split.** axe returns three buckets, and the
  third — "needs review" — is the instrument saying it ran the rule and could not decide.
  `color-contrast` lands there whenever the background is an image, a gradient, or
  otherwise undeterminable. Discarding it is how a live production page returned **124
  undeterminable text pairs at 1440 in both themes** under a clean `PASS` with no contrast
  line printed at all, while the skill told the orchestrator contrast had been measured
  and not assumed. **Contrast ids go to `[UNMEASURED]`** — the floor list requires text
  contrast measured, so a contrast nobody could compute is a floor item this run does not
  have — **and every other id goes to `[JUDGE]`**, because the rest of that bucket names no
  floor item, carries real noise, and a blanket block on it would leave the gate unclosable
  on ordinary pages, which teaches people to waive `[UNMEASURED]` by reflex. Both forms
  name the rule id and the node count. That count is only honest because `incomplete` is
  named in axe's `resultTypes`: without it axe still returns the bucket but truncates every
  entry to a single node, reporting `color-contrast x1` where the truth was 124.

  **Images that loaded no pixels are `[UNMEASURED]`, and print `?` per configuration.**
  An `<img>` that is `complete` with `naturalWidth` 0 asked for a resource and got nothing.
  The harness cannot tell a page that ships broken images from a dev server that failed to
  serve good ones — but under either reading **the renders every critic is about to grade
  are not the artifact**, which is a gap in this run rather than a design question, so it
  blocks and the user fixes it or waives it. Graded as design instead, it becomes the
  campaign whose client's eventual complaint was that the pages had no identifiable
  photographs. Two cases are deliberately not counted, both verified in Chromium: an
  `<img>` with no `src` (or `src=""`) is deliberate blank markup rather than a 404, and a
  sizeless SVG reports the 150x150 default rather than 0. The lazy-loading mitigation under
  **Render honesty** below is the other half of this — a blank image only counts after the
  page has been scrolled and given time to settle, which the run does before it looks.

  **Every finding list is capped, and every cap declares itself.** Per configuration: 6
  crowded undersized targets, 3 clipped elements, 3 distinct page errors, 2 distinct
  console errors, 6 elements still hidden under reduced motion. Across the whole run: 8
  spec-exempt lone targets. axe caps at 4 failure-reason groups per rule and 400 characters
  per line. Whenever a cap bites, the next line says how many were withheld and what the
  total was — `… 24 more not shown (32 total across the run)`. A silent cap is how a
  builder fixes "the 6 undersized targets", ships the seventh, and reads the next round's
  identically-capped report as a fresh finding; that exact number is real, from a live run
  whose eight printed lone targets were eight of thirty-two, all eight in one theme.

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

**A repo may vendor axe instead of depending on it, and the harness looks for that before
giving up.** After `require('axe-core')` fails from every root it knows, it reads the first
of `<root>/axe-core/axe.min.js`, `<root>/axe.min.js` or `<root>/harness/axe.min.js` that
exists — for each of the same roots: the working directory, the harness's own directory,
every `NODE_PATH` entry, and whatever `npm root` and `npm root -g` report. That path exists
for the reader the `npm i -D axe-core` hint cannot help: a static design system with no
`package.json`, which can still drop `axe.min.js` beside the harness and have accessibility
measured rather than unmeasured.

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
