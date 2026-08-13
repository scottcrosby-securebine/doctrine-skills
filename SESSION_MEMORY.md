# State [doctrine-skills; rounds 17–18 — the hub audited, the harness caught lying | 2026-08-14]

## Resume

Two more widened rounds ran. **Round 17** (~51 findings) audited the gauntlet's own cold
ground. **Round 18** reviewed round 17's diff and then audited two files nobody had ever
looked at — `skills/doctrine/SKILL.md` (the hub, **5 HIGH**) and `tools.md` (8) — and ran an
*adversarial* pass at the harness that found **5 HIGH the round-17 doc-versus-code lens could
not see**. All fixed. Version 1.17.0.

**🔴 Seventeen commits are unpushed.** Push was never authorised in either round; it is asked
for and unanswered. Tree clean.

**The widened gate has had zero clean passes and its exit condition is two.** Both rounds
produced HIGH findings and round 18 out-yielded round 17. Do not read "all fixed" as "closed".

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| 🔴 Seventeen commits unpushed — asked twice, never answered | — | 🔴 | — |
| Gate needs **two consecutive clean passes**, has **zero**. Every widening has paid so far | — | 🟡 | `skills/doctrine-gauntlet/SKILL.md` |
| The other six wrappers were never audited — only the hub and gauntlet have been | — | ⏳ | `skills/doctrine-{code,debug,audit,docs,research,write}/` |
| Frames are unmeasured by design; canvas covers 2D `fillText` only. Honest limits, not fixes | — | ⏸ | `harness/floor.mjs`, `floor.md` |
| Render breadth unscoped at section level — 8 renders per section per retry. Cost, not correctness | — | ⏸ | `SKILL.md` critic item 1 |

## Git State

- Branch `main` | tree clean | **ahead 17, unpushed** | PRs: none | issues: none | CI: none
- Round 17: `1272237` `7564aa0` `569aaf6` `e2f06ea` · Round 18: `0d2e605` `8ee2826` `360ee2c` `da9b44b` `435cbac`
- HEAD is always the backup commit; compare against the list, not HEAD.

## Gotchas

- **Attention follows the work, so the shared foundation gets none.** The hub had zero audits
  against the gauntlet's seventeen — and **eight of its nine defects were fixes the gauntlet had
  already written and never sent up**. Grep for wrapper-local workarounds: each is a base-layer
  bug with its fix already in the repo.
- **Consistency is not correctness.** "Does the code match the docs?" returned 13 drift findings.
  "Where does this lie?" returned 5 HIGH, four invisible to the first — because the code and the
  docs agreed perfectly about checks that did not work.
- **The tamper test has three clauses now.** Break it; run known-good; **and prove the broken
  fixture really carries the defect, independently of the instrument.** The reduced-motion check
  passed the first two and certified a blank page. Its fixture was hiding content in *both*
  renders. Corollary: a change that makes an instrument **quieter** needs the same proof —
  a vanished finding and a new blind spot print identically.
- **A register is a lens; a wrong one is worse than none.** `do-not-merge.md` certified a
  placement the document lacked, which stopped anyone looking for two rounds — and the round-17
  *rewrite carried a new false one*. Record **why** a rule exists, never **where** it sits.
- **Fresh authors beat fresh reviewers**, still, decisively: this session's authors overturned my
  briefs seven times and were right every time — including proving one of my own measurements was
  a truncation artifact of my own options object.
- `pkill -f <pattern>` kills your own shell when the pattern matches your command line. **I did
  this twice today.** Kill by PID from `ss -ltnp`.
- Scope is a filter on where people look, not on what is wrong. Documents stratify by age.

## Next Session Kickoff

1. **Ask whether to push the seventeen commits.** Asked twice this session, never answered.
2. The gate's next pass. Point it at **the six unaudited wrappers** — that is the cold ground now,
   and the hub audit is the evidence that cold ground pays.
3. Re-read `UNAUDITED.md` and `do-not-merge.md` **before** proposing any merge or simplification;
   both now carry round-17/18/19 sections, and one entry records itself as having been stale.
4. Repo `skills/doctrine-gauntlet/`, never the plugin cache. Everything outside `doctrine-skills`
   is read-only; design deficits are reported, never fixed.
5. Skills: `doctrine` (hub) before any `doctrine-*` wrapper. The hub changed substantially — read
   it fresh rather than from memory.
