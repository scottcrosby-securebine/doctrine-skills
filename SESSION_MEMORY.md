# State [doctrine-skills; rounds 17–20 — cold ground closed, everything pushed | 2026-08-14]

## Resume

Four widened rounds. **17** (~51) audited the gauntlet's cold ground. **18** reviewed 17's own
diff, gave the **hub** its first audit ever, and found **5 HIGH the doc-versus-code lens could
not see**. **19** audited the **six remaining wrappers** (~43, 9 HIGH). **20** took the last
never-opened ground — `fixtures/`, `README.md` as a document, both plugin manifests — plus the
render-breadth item deferred since round 9. v1.19.0, `859748d`, **pushed**.

**Every file in the repo has now been audited at least once.** No cold ground remains.

**The gate has had zero clean passes; its exit is two.** Yield: 51, ~40, ~43, ~34. The reason it
does not converge is the finding of round 20: **the red team produced four blocking defects
against round 20's own fixes.** Every fix is new unaudited surface, and four rounds of the same
instrument — reading — refill the well they drain.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| **Round 21 should change instrument**: drive fresh agents through each wrapper against real scenarios. The documented test, never once rerun | — | ⏳ | all `skills/*/SKILL.md` |
| Gate needs **two consecutive clean passes**, has **zero**; valve fired at 20, re-armed to **24** | — | 🟡 | `skills/doctrine/SKILL.md` |
| Codex red team on the r20 diff was backgrounded and never read: `/codex:status task-mss771fl-1lfcwl` (user-invocable only) | — | ⏸ | — |
| Hoist candidates named, **not** taken: the docket/counter machinery, and `matts-code-review`'s fixed-point rule (3 wrappers) | — | ⏸ | `skills/doctrine-gauntlet/SKILL.md` |
| Frames unmeasured by design; canvas covers 2D `fillText` only. Honest limits, not fixes | — | ⏸ | `harness/floor.mjs` |

## Git State

- Branch `main` | tree clean | **in sync with origin** | PRs: none | issues: none | CI: none
- R17 `1272237` `7564aa0` `569aaf6` `e2f06ea` · R18 `0d2e605`…`435cbac` · R19 `d434e92` · **R20 `859748d`**

## Gotchas

- **A shared base can depend on its dependents.** R19 found wrappers forking the hub downward;
  R20 found the hub using "the anchor" in two steps while only 2 of 7 wrappers defined it — five
  were told to hand a red team an artifact nothing in their flow produced. **Two hoist triggers
  exist, pointing opposite ways**, and the recorded one would never have caught this.
- **A restatement is worse than silence.** Silence inherits; a truncated echo reads as
  authoritative and stops the reader going to the source. R20 found three fresh instances —
  *including two inside its own fixes.* When you correct a base rule, grep every dependent.
- **Consistency is not correctness.** "Does the code match the docs?" → drift findings. "Where
  does this lie?" → the defects both texts agreed about.
- **The tamper test has three clauses**, and the third is the one that pays: prove the broken
  fixture carries the defect *independently of the instrument*. A change making an instrument
  **quieter** needs the same proof — a vanished finding and a new blind spot print identically.
- **A quieter fix can overshoot into a confident wrong answer.** R20's theme-probe fix went from
  "says nothing useful" to flatly asserting absence on pages that *do* theme. Caught only by a
  red team that drove the code rather than reading it.
- **Record why, never where or how many.** `do-not-merge.md` certified a false placement twice;
  `CLAUDE.md` carried "don't re-derive it" on a rotting count. "Already handled" is the claim
  most worth re-testing.
- **Verify a premise, don't assert it.** And measurement beats argument: R20's target-size
  finding was mine, was well-reasoned, and was **refuted** — shadcn's checkbox ships a
  pointer-area expander, so 16x16 painted is 38x30 targeted.
- **Fresh authors beat fresh reviewers.** Across the session, authors and red teams overturned my
  briefs ~15 times and were right every time, twice on my own arithmetic.
- `pkill -f <pattern>` kills your own shell — **three times this session**. Kill by PID from
  `ss -ltnp`. Node refuses any ESM extension but `.mjs`: a `floor.mjs.bak` exits 1 and looks
  exactly like the harness failing. And `EXIT=$?` after a pipe reports the *last* command's
  status, not the one you care about.

## Next Session Kickoff

1. **Round 21 is a different instrument, not another read.** Drive a fresh-context agent through
   each wrapper against a realistic scenario and patch what it cannot act on. `CLAUDE.md` names
   this as the test to rerun on any flow change; `git log` shows it never has been, across three
   rounds that rewrote the hub and all seven wrappers.
2. Optionally first: read the backgrounded codex red team on the r20 diff (see Active Work) —
   it is the only cross-model view of that work and nobody has seen it.
3. Read `UNAUDITED.md` and `do-not-merge.md` **before** proposing any merge or simplification.
   `UNAUDITED.md` now carries rounds 17–20, the render-breadth ruling, and one refuted finding.
4. Repo `skills/`, never the plugin cache. Everything outside `doctrine-skills` is read-only;
   design deficits are reported, never fixed.
5. `doctrine` (hub) before any wrapper — it gained the anchor definition in round 20.
