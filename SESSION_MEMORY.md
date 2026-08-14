# State [doctrine-skills; research round — the ruler was broken, both sides lost exhibits | 2026-08-15]

## Resume

A discarded research run was **restarted from scratch on the user's order**, re-aimed to: *is
`doctrine-gauntlet` over-developed, and how to refactor it for Opus 5 + Fable 5?* Five engines (two
blind Opus/Fable pairs + codex repo inventory), then the **phase-1 gate, which FAILED** — native
checks passed, logic critique and red team both blocking. Committed and pushed (`5a81d26`);
`skills/` untouched. **Neither side's evidence survived**: the "gauntlet is densest" finding was a
**ruler artifact** (per-line density, but its lines are 445 chars vs 170–296 elsewhere — normalised
it is second-*least* dense, the **hub** is densest), and the counter-case cited arXiv:2601.22025
**backwards** (its collapse came from *adding* rules). Verdict given: gauntlet **is shippable**,
don't refactor for size. **Next step is phase 2: measure, don't read.**

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| 🔴 **Phase 2 unaimed — user asked to choose, hasn't.** (a) conjunction width + compaction byte-split, or (b) "which rules fire" | — | 🔴 | `docs/research/2026-08-14-gauntlet-refactor.dossier.md` |
| Test the gate un-retired: two critic briefs (taxonomy vs "report everything"), one defective fixture, compare counts | — | ⏳ | `fixtures/` |
| **Gate never closes — 0 clean passes in 20 rounds.** May be predicted by conjunction arithmetic, not a defect | — | ⏳ | `skills/doctrine/SKILL.md` |
| Unread primaries the gate found: **Opus 5 System Card** (2026-07-24), arXiv 2607.03048 / 2603.15401 / 2606.08878 | — | ⏳ | dossier §EXTENSIONS |
| 7 of 8 skills have **no per-file analysis**; anchor said all eight | — | ⏸ | `skills/*/SKILL.md` |

## Git State

- Branch `main` @ `5a81d26` | clean, 0 tracked dirty | in sync with origin | PRs: none | issues: none | **CI: none**

## Gotchas

- **Check the denominator before believing a density.** Per-line metrics saturate at one hit/line;
  445-char lines vs 296 inverted the whole finding. Normalise by words. Related: `p` vs `p^n` —
  two "conflicting" benchmarks (~2,000 vs N=80) measure per-item capacity and all-hold conjunction,
  the two ends of one scissors. Calling a field "unsettled" can be a way to keep spending both.
- **A claim of verification can be manufactured by a summariser.** Twice this session a summary said
  "verified" before the verifier ran; timestamps disproved both. Tag `REPORTED` vs `VERIFIED` by
  **who fetched it**. And verify by reading *around* the quote — the run's biggest answer sat two
  paragraphs above a line both engines had already pulled.
- **A capability sentence is not an endorsement**, and **never retire a cheap local test on the
  strength of a re-read**. Also: gate results held only in context die with the process (a
  `/compact` crash took two in-flight agents; transcript JSONL on disk recovered their prompts).
- Carried forward, still true: shared base can depend on its dependents; restatement worse than
  silence; consistency ≠ correctness; tamper test's third clause pays; a quieter fix can overshoot
  into a confident wrong answer; record why, never where or how many; fresh authors beat fresh
  reviewers; `pkill -f` kills your own shell — kill by PID.

## Next Session Kickoff

1. **Ask the user to aim phase 2** (row 1) — the only thing blocking work.
2. **Phase 2 is measurement.** 20 audit rounds never observed a rule fire. Cheapest first: the
   **byte split** (what fraction of gauntlet SKILL.md is Fable-read flow vs Opus-read payload —
   settles the compaction argument with a number), then **conjunction width**, then the
   **taxonomy A/B**. Use `skill-creator`'s snapshot method: old version as control arm.
3. **Read the dossier's gate sections first** — they govern where they contradict the claim table.
4. `UNAUDITED.md` + `do-not-merge.md` before proposing any merge; `doctrine` hub before any wrapper.
5. Repo `skills/`, never the plugin cache. Everything outside `doctrine-skills` is read-only.
