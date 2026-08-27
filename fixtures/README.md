# Generality fixtures

`doctrine-gauntlet` was developed against one design system, which is how a skill
acquires rules that only make sense for that system without anyone noticing. These
three cases are the standing test that it did not.

Run a change against all three. Each proves something the others cannot:

| Case | Proves |
|---|---|
| `bare.html` — a page with no system, no repo, no package.json (copy it out of this tree first, below) | nothing became mandatory: a run with no house system is the ordinary path, not a degraded one |
| `shadcn.sh` — a stock Next + shadcn install | nothing encoded one house's taste, **and** the single-repo topology works (the system lives inside the deliverable) |
| a real bound system — **not in this repo, and cannot be** | the skill still fits the system actually being shipped against |

Only the first two cases are runnable from here. The third is whatever bound design
system you are actually shipping against; a plugin repo has none, and vendoring
someone's system to get one would defeat the purpose of the case. Supply it from the
project you are working in. A change run against cases 1 and 2 alone has proved
two-thirds of what this suite exists to prove — say so rather than reporting the suite
clean.

**The recipe is checked in; the app is not.** Vendoring a Next tree into a
pure-markdown plugin would contradict the portability the harness already has. Build on
demand:

```bash
fixtures/shadcn.sh /tmp/fixture-shadcn      # ~2 min, needs network
```

## How to run each case, and what it printed last time

**A regression suite with no recorded output cannot detect a regression** — someone has
to re-derive the right answer every time, and the answer they derive is the one they
just saw. These are the invocations and the exit codes, measured 2026-08-14 on the
harness as it stood that day. A run that differs is the thing to explain.

`node .../floor.mjs` below is `skills/doctrine-gauntlet/harness/floor.mjs`. Both cases
need Playwright and axe resolvable — see `floor.md`; on a host where they are only
installed globally, prefix with `NODE_PATH=$(npm root -g)`.

**Case 1 — `bare.html`.** Copy it out of this repo before a gauntlet run: it lives
under a repo whose root `CLAUDE.md` law discovery finds by walking up, and "no repo, no package.json" is the
whole property being tested. Serve the copy and point the harness at it.

```bash
mkdir -p /tmp/bare && cp fixtures/bare.html /tmp/bare/
(cd /tmp/bare && python3 -m http.server 8712 --bind 127.0.0.1 &)
node .../floor.mjs http://127.0.0.1:8712/bare.html out/bare --single-theme light
```

Expect **PASS, exit 0**. `--single-theme light` is required and not optional decoration:
without it the page ships one theme, the run reports the switch had no effect, and it
exits **3**. That exit-3 is the correct answer to the wrong question, and it is the most
common way to mistake this case for broken.

**Case 2 — the shadcn app.** Run the recipe above, then `npm run build` and serve the
production output (`npx next start -p 3117`) — not `next dev`, whose HMR client is one
more moving part in the render every critic is about to grade. Then:

```bash
node .../floor.mjs http://127.0.0.1:3117/ out/shadcn --theme-class=dark
```

Expect **exit 1 — 2 failing configurations**, and the failures are the point. All of
this came from stock shadcn, not from the fixture page:

- `axe serious: scrollable-region-focusable` on the table's own `overflow-x-auto`
  container, at 360px in both themes — a real keyboard defect that shipped in the
  component, found by pointing the harness at an unmodified install
- `[UNMEASURED] TEXT CONTRAST` — axe cannot resolve `.border-border` and the translucent
  table borders, so contrast there is not measured
- `[JUDGE] content hidden inside scrollable components` — the table hides 184px at
  360px and nothing at 1440, which is the deliberate-responsive-scroller signature
- `[JUDGE] theme reachability` — see below
- **no target-size line at all — and this silence is a measurement, not a gap.** The
  page renders a 16x16 checkbox beside a 212x14 label. shadcn's checkbox ships a
  pointer-area expander (`after:-inset-x-3 after:-inset-y-2`), so its real hit area is
  **38x30**: all eight of `clears24`'s ring points at radius 11.5 land on the control's
  own pseudo-element, it clears 24x24, and the check correctly says nothing. WCAG 2.5.8
  governs the pointer target, not the painted box.

  **That makes this case a live regression test for the ring probe itself.** Replace the
  hit-test with a `getBoundingClientRect()` size gate — the obvious "simplification" —
  and this fixture starts printing a false `16x16` finding. Measured proof the check is
  not merely blind: the same markup with the expander removed prints
  `[JUDGE] … EXEMPTS … span.cb 18x18px` at all four widths.

  Round 20 filed the silence as a suspected blind spot and **the measurement refuted
  it**; recorded here so the next pass does not file it again. Note also that base-ui
  emits a second, `aria-hidden` 1x1 input for the same control, correctly excluded by
  the `aria-hidden` filter — if a target-size finding ever appears here, check that
  filter before assuming the label logic moved.

## What is pinned, and what is not

Only the two scaffolders are pinned: `create-next-app@16.3.0` and `shadcn@4.17.0`. What
they generate is not. `create-next-app` writes `"tailwindcss": "^4"`, `"typescript":
"^5"`, `"@base-ui/react": "^1.7.0"` and the rest as floating ranges, and no lockfile is
kept, because the app is deliberately not vendored — so every transitive version
resolves to whatever npm serves on the day you build. Tailwind resolved to 4.3.3 on
2026-08-14.

That matters most for theming: how the `dark` variant is emitted is a Tailwind 4.x
implementation detail, and a minor bump can move it under you. So reading a diff takes
one extra step rather than none. Changed *scaffolding* — different files, different
component source, a different `globals.css` shape — is signal, because the scaffolders
are fixed. Changed *behaviour with identical scaffolding* is a resolved-dependency
question first: check `npm ls tailwindcss next react` in the built tree before treating
it as a harness regression. If you need a hard baseline for a comparison, keep the built
tree's `package-lock.json` beside the run you are comparing against; the recipe alone
does not give you one.

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

## The theme probe, and why the old illustration is retired

This file used to say the probe printed "nothing reachable" on both a kit card and a
stock shadcn app — identical output, opposite correct answers — and offered that as the
sharpest reason to keep all three cases. **Neither half of that is true of the harness as
it stands, and the passage was left in place long after the outputs moved.**

Measured 2026-08-14, against the harness as this commit ships it — production `next start`
build, not `next dev`:

```
[JUDGE] theme reachability — this harness APPLIED the theme itself, so both renders exist
whether or not the page can switch. Probing the page found no theme mechanism in what it
could read; it did not look inside 7 external script(s) whose source this harness cannot
read — a switch living in there is invisible to this probe. ...
```

And a kit card shot with `--fragment`, which is the right flag for a design-system specimen,
gets no reachability line at all, because the host page owns theming. Two outputs that were
never going to be identical again.

**This line has now been recorded wrong twice, both times the same way**, so read the next
sentence before you trust it. The first version described a probe two harness revisions old.
The second was measured accurately and then *invalidated by a probe fix landing in the same
commit* — the author measured before the change, and nothing forced a re-measure. If you
change the probe, the shipped harness's output for this case is the thing you re-record, and
`floor.md` deliberately holds no copy of it so there is exactly one place to update.

**The premise underneath it is still true and still worth a case.** A stock shadcn
install ships `@custom-variant dark (&:is(.dark *))` and a `.dark` block in
`src/app/globals.css`, zero `prefers-color-scheme` anywhere in `src/`, and no toggle —
so its entire dark palette is unreachable by any user. That is a genuine defect in a
system nobody would think to suspect, and only case 2 puts it in front of you.

**The lesson is still true and is the reason for three cases.** One probe line can be a
false alarm on one system and a real defect on another, and no amount of re-reading the
line separates them; only running it against systems that differ does. What is *not*
established today is a current, measured pair that demonstrates it. A harness change to
this probe is landing alongside this edit, so **re-run both cases after it lands and
write the pair back in from what they actually print** — or, if the outputs no longer
make the pair, say so here rather than keeping a story the runs do not support. That is
what went wrong the first time.
