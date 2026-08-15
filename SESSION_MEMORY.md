# State [doctrine-skills; roll call shipped v1.20.0, and the repo got its first issue | 2026-08-15]

## Resume

Phase 2 was **re-aimed by the user twice**: first at a video's answer-key pattern (AI LABS,
`D_uojDHkbw4`), then — after I drifted into adjudicating website_v3's home page — sharply back:
**website_v3 is read-only test fodder; a separate session updates it USING this skill. Don't
cross the streams.** The improvement landed: critic brief **item 8 now opens with a roll call**
(one line per axis, `CLEAR` / `BLOCKING` / `CANNOT JUDGE`), Modes counts abstentions off it
instead of parsing prose, and a missing line is itself blocking. **Driven, not just audited**:
one fresh-context critic ran the edited brief against a pinned fixture — all 5 pre-registered
criteria passed, 9/9 floor lines mapped, and the run found a real defect (an honest critic
folded two axes sharing one missing artifact; the counting rule would have filed a false
blocking finding) — fixed before commit. Shipped as `72c2005`, v1.20.0. Late in session:
answered "does the gauntlet have ultracode?" (**no, deliberately** — the skill structures its
own waves instead of delegating to the harness keyword) and filed the repo's **first GitHub
issue** to track scripting the waves via the Workflow tool.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| **Carve-out restructure** — collapse five scattered exemptions (inherited/fragment/single-theme/stale/section-scope) into one pre-enumerated not-gradeable set. Video-derived, deliberately NOT taken; needs its own round, fresh author | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| **Red team brief has no roll call** — item 8's fix was critic-only; the red team's return (brief item 5) still sorts prose | — | ⏳ | same file, `## The red team brief` |
| **Wire the waves to the Workflow tool** — scripted orchestration, crash-resumable, journaled. Blocked behind the carve-out restructure; filed to track, not schedule | #1 | ⏸ | `skills/doctrine-gauntlet/SKILL.md` |
| Docket-on-GitHub-issues via stock wayfinder — parked at re-scope; needs fallback + README prereq bullet; wayfinder is `disable-model-invocation` | — | ⏸ | `skills/doctrine-gauntlet/SKILL.md` docket section |
| Format drift, recorded not acted: validated critic invented a middle category ("Escalations / verify") between blocking and polish | — | ⏸ | scratchpad `phase2/VALIDATION-CRITERIA.md` |
| Unread primaries: Opus 5 System Card, arXiv 2607.03048 / 2603.15401 / 2606.08878 | — | ⏸ | dossier §EXTENSIONS |

## Git State

- `main` @ `72c2005` | clean, 0 tracked dirty | in sync | PRs: none | issues: none | CI: none

## Gotchas

- **Don't cross the streams**: website_v3 findings are fixture output, never recommendations.
  It also **moves under you mid-run** (three HEADs in one session) — pin with
  `git archive <SHA>`, never rsync a live tree.
- Two servers on identical source serve different bytes (CSP nonce + build hashes); rendered
  *text* was identical. Normalize before calling divergence. Same family: naive substring on
  rendered HTML false-fails on `<b>`/`&nbsp;` splits — strip markup first.
- **A verdict vocabulary must sit inside the dispatched numbered list** — round-15's boundary
  failure (vocabulary outside the assembled set → bound inert) is why the critic's lives
  inside item 8. do-not-merge has the entry; the two vocabularies share `CLEAR` and must not merge.
- **Driving finds what auditing can't**: the fold defect was invisible to consistency reading.
- Carried, still true: check denominators; REPORTED ≠ VERIFIED; capability sentence ≠
  endorsement; restatement worse than silence; kill by PID.

## Next Session Kickoff

1. Read `UNAUDITED.md` + `do-not-merge.md` before touching the gauntlet; the new vocabulary
   entry is at the tail.
2. Row 1 (carve-outs) is the biggest open candidate — five polarity arguments with different
   defaults; a ride-along edit flips one silently. Fresh author, own round, then a driven run
   like this session's (criteria frozen on disk BEFORE dispatch).
3. Validation fixture survives at scratchpad `phase2/runs/round0-pinned/` (pinned SHA in
   `PINNED-SHA.txt`) — reusable for row 2.
4. Repo `skills/`, never the plugin cache. Everything outside doctrine-skills is read-only.
