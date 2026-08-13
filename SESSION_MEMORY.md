# State [doctrine-skills; rounds 17–19 — every skill audited at least once | 2026-08-14]

## Resume

Three widened rounds. **17** (~51 findings) audited the gauntlet's cold ground. **18** reviewed
17's own diff, gave the **hub** its first audit ever (**5 HIGH**), audited `tools.md` (8), and ran
an *adversarial* pass at the harness that found **5 HIGH the doc-versus-code lens could not see**.
**19** audited the **six remaining wrappers**, also never read critically (~43 findings, 9 HIGH).
All fixed. v1.18.0.

**Every skill in the plugin has now been audited at least once.** That was not true this morning.

**🔴 Nineteen commits are unpushed.** Push was asked for three times across the session and never
answered. Tree clean.

**The widened gate has had zero clean passes; its exit is two.** Yield has not decayed —
51, ~40, ~43 — so "all fixed" is not "closed". The doctrine's own valve fired at 16 and was
overridden by the user at 18; it re-arms at 20.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| 🔴 Nineteen commits unpushed — asked three times, never answered | — | 🔴 | — |
| Gate needs **two consecutive clean passes**, has **zero** | — | 🟡 | `skills/doctrine-gauntlet/SKILL.md` |
| Cold ground left: `fixtures/`, README as a document, both `.claude-plugin/*.json` descriptions vs what the skills now do | — | ⏳ | `fixtures/`, `README.md`, `.claude-plugin/` |
| Hoist candidates named, **not** acted on: the `anchor` (2 wrappers + an undefined hub reference — trigger met), and `matts-code-review`'s fixed-point rule (3 wrappers) | — | ⏸ | `skills/doctrine/SKILL.md` |
| Frames unmeasured by design; canvas covers 2D `fillText` only. Honest limits, not fixes | — | ⏸ | `harness/floor.mjs` |

## Git State

- Branch `main` | tree clean | **ahead 19, unpushed** | PRs: none | issues: none | CI: none
- R17 `1272237` `7564aa0` `569aaf6` `e2f06ea` · R18 `0d2e605` `8ee2826` `360ee2c` `da9b44b` `435cbac` · R19 `d434e92`
- HEAD is always the backup commit; compare against the list, not HEAD.

## Gotchas

- **Attention follows the work, so the shared base gets none.** The hub had zero audits against
  the gauntlet's eighteen — and **eight of its nine defects were fixes the gauntlet had already
  written and never sent up**. Grep for wrapper-local workarounds: each is a base bug with its fix
  already in the repo.
- **A restatement is worse than silence.** Silence inherits the base rule correctly; a truncated
  echo reads as authoritative and stops the reader going to the source. `doctrine-code` said
  "disjoint files or worktrees" and stopped one clause before the correction that matters.
- **Consistency is not correctness.** "Does the code match the docs?" → 13 drift findings. "Where
  does this lie?" → 5 HIGH, four invisible to the first, because code and docs agreed perfectly
  about checks that did not work.
- **The tamper test has three clauses.** Break it; run known-good; **and prove the broken fixture
  really carries the defect, independently of the instrument.** The reduced-motion check passed the
  first two and certified a blank page; its fixture was hiding content in *both* renders.
  Corollary: a change making an instrument **quieter** needs the same proof — a vanished finding
  and a new blind spot print identically.
- **A register is a lens; a wrong one is worse than none.** `do-not-merge.md` certified a placement
  the document lacked — and the round-17 *rewrite carried a new false one*. Record **why** a rule
  exists, never **where** it sits.
- **Verify a premise, don't assert it.** `doctrine-research` claimed engine 2 had "its own web
  tools"; it declares `tools: Bash`. "Agree" then meant one search plus one recollection — worse
  than one engine, because the report says corroborated.
- **Fresh authors beat fresh reviewers**, decisively: authors overturned my briefs **eleven times**
  this session and were right every time — including catching that my own grep matched "push back
  on" and that a number I reported was a truncation artifact of my own options object.
- `pkill -f <pattern>` kills your own shell when it matches your command line — **twice today**.
  Kill by PID from `ss -ltnp`. And Node refuses any ESM extension but `.mjs`: a `floor.mjs.bak`
  or `.pre-r18harness` copy exits 1 and looks exactly like the harness failing — **also twice**.

## Next Session Kickoff

1. **Ask whether to push the nineteen commits.** Asked three times; never answered.
2. If the gate continues: the cold ground is `fixtures/`, `README.md` as a document, and the two
   plugin JSON descriptions against what the skills now actually do. The valve is due at round 20.
3. Consider the two named hoists before adding anything else to the wrappers — the `anchor` one
   has a hub reference with no definition behind it.
4. Read `UNAUDITED.md` and `do-not-merge.md` **before** proposing any merge or simplification; both
   carry round 17/18/19 sections and one entry records itself as having been stale.
5. Repo `skills/`, never the plugin cache. Everything outside `doctrine-skills` is read-only;
   design deficits are reported, never fixed.
6. `doctrine` (hub) before any wrapper — it changed substantially in round 18, so read it fresh
   rather than from memory. All seven wrappers changed in round 19.
