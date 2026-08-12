# State [doctrine-gauntlet v1.13.0; first field use mined, three harness gaps closed | 2026-08-12]

## Resume

`doctrine-gauntlet` **ran in production for the first time** — not by this
session. Another session used it for website_v3's wave 10: **seven pure-gauntlet
rounds**, fresh blind critics, mapping withheld, letters re-randomised per round.
It worked — the candidate won every round on both pages, two critics failed the
live site outright, and thirteen real defects were caught. Then the client
looked at the shipped result and named a defect class the whole apparatus was
structurally blind to.

Mining 24 hours of `website_v3` + `securebine-design` logs produced three
instrument gaps, all now closed in `d6c6b7b`:

1. **A defect class lives above 1440 and no rounds below it can see the class at
   all.** Nav 13px and an 11px primary CTA, byte-identical at 1440/1920/2560/3840
   while the sheet reached 1848px and card figures 674px tall. 2560 joins the
   ladder — and since neither defect shows in any *single* render, the harness
   reports the **delta** between 1440 and 2560.
2. **WCAG 2.5.8 target size was measured by nothing** — axe does not test it, a
   screenshot cannot show it, and a 145x14px call to action survived seven rounds
   of critics who were looking straight at it.
3. **Adding a wider width silently re-rules F14.** The inner-clip discriminator
   asked "does it clip at the *widest* width tested"; it now asks about
   `DESKTOP` (1440), so a component clipping at 1440 and fitting at 2560 is
   still a defect.

Also landed as rules: the moved-content sweep, the moving-instrument void, and
**the tamper test — both halves — as law**.

**Correction carried forward:** the pure-gauntlet exit criterion is **NOT**
broken. An early read of this session said a three-round win streak would have
exited before the best findings; re-reading, the streak is conjoined with "no
blocking findings" and resets on any, so the seven rounds were the mode working.
**No counter was changed.** The real lesson was an unnamed *axis*, and it went to
the builder law and critic brief instead. Do not re-open the counters on this.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The gate has run **one round**, not to exit. Two clean passes, the four-round valve, simplification re-entry and delivery are still unexercised **by this session** — wave 10 exercised pure gauntlet to a real exit, and that record is readable | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md`, `website_v3/docs/RESTYLE-DOCKET.md` #84 |
| The law-as-critic-axis is still untested — a bound design system exists, and no critic has been run against its law | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| **PhaseMU migration deficits — PARTLY STALE.** `securebine-design/docs/APP-SURFACE.md` now exists and independently closes D1 and prices several others. Re-read it before treating the handed-over file as current | — | 🟡 | `securebine-design/docs/APP-SURFACE.md` |
| Trigger, not a task: docket/counter machinery to the hub when a second wrapper needs it. The claim ledger is a second candidate | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` @ `d6c6b7b` | clean | pushed | PRs: none | CI: none configured
- Session commits: `d6c6b7b` (one commit; v1.12.0 → v1.13.0)

## Gotchas

- **Lane: develop the skills; everything outside this repo is read-only.**
  Design deficits are reported, never fixed. Nothing was written to
  `website_v3`, `securebine-design` or `pdd-generator` this session.
- **The sibling repos are the highest-yield source of skill findings**, and they
  move fast — four waves shipped in the 24 hours mined here. `git log --since`
  plus the docket and any `REDTEAM-*.md` is the sweep.
- **Two width constants now, and conflating them is a live trap.** `WIDEST`
  (2560) is the top of the ladder; `DESKTOP` (1440) is the "enough room
  available" reference. The inner-clip discriminator must stay on `DESKTOP`.
- **Target size is split across the gate and `[JUDGE]` deliberately.** WCAG
  2.5.8's exceptions are real — an isolated undersized target and an inline link
  are both spec-compliant — so only a *crowded* one gates. Do not flatten it to
  a 24x24 gate; that invents a rule the spec does not carry.
- **Every new check needs a tamper test, both halves.** Writing the fixtures
  caught two flaws before a single run, and the known-good half caught a third
  (frozen-type fires on every card in every kit — now suppressed under
  `--fragment`). This is the second time the known-good half found what the
  broken case could not.
- **The Skill tool resolves `doctrine:*` to a stale plugin cache.** Test against
  the repo copies.
- **A full-page screenshot is read scaled** — use `--crop=SELECTOR` — **and a
  canvas caught mid-draw voids findings.** One round lost its five gravest
  findings to a drawing screenshotted at position 6 of 18.

## Next Session Kickoff

1. Ask which board item Scott wants; do not assume.
2. **The law-as-critic-axis is still the cheapest untested thing in the skill.**
   Nothing this session touched it. A bound design system exists
   (`securebine-design`, `USAGE.md` is the law) and no critic has been run
   against it with the law named by path, per critic brief item 3.
3. **Re-mine the sibling repos before anything else** — that is what produced
   this session's entire yield, and wave 11+ will have run since.
   `securebine-design` is mid-registry work (shadcn, fontsource) that has
   already found two of its own instrument holes worth stealing.
4. Read the repo's `skills/doctrine-gauntlet/SKILL.md`, not the plugin cache.
5. Do not re-open the pure-gauntlet counters — see the Resume correction.
