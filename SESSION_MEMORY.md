# State [doctrine-gauntlet v1.15.0; generality-tested against three topologies | 2026-08-13]

## Resume

Auditing `doctrine-gauntlet` against the upgraded `securebine-design` produced a bigger
result than the audit: **Scott ruled the skill must also work with no design language, or
a different one.** The standing test is now "prove nothing here is kit-shaped", not "fit
this kit". Three fixtures encode it — `fixtures/README.md` says what each proves — and
they paid out within minutes: the harness had been measuring the **wrong website** through
two clean runs (port conflict), `.sr-only` read as a blocking layout defect, frozen-type
measured the page wrapper instead of the reading column, and a scaffold's zero-chroma
defaults outranked the brief. Fixes and reasoning: `e5fdf91` (harness), `01e14f8`
(binding, v1.15.0), `6d41669` (fixtures); local memory `[[generality-fixtures]]`.

Nothing is stranded — all work committed and pushed. **Two findings registers went to the
sibling repos and Scott confirms both are acting on them**; do not re-report them as new.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The gate never formally closed — 4 loops, ~50 findings, converging (26 → 15 → 3 → 9+9) but not provably terminated. The last round of mechanical fixes is **unverified**. A real gauntlet run beats a fifth synthetic one | — | 🟡 | `skills/doctrine-gauntlet/SKILL.md` |
| **law-as-critic-axis** untested — no critic has run against a bound system's law with the law named by path | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| The fused gate has never run to exit locally. Pure gauntlet has, in production (wave 10) | — | ⏳ | `website_v3/docs/RESTYLE-DOCKET.md` #84 (cross-repo; not a `gh` issue here) |
| Trigger, not a task: hoist docket/counter machinery to the hub when a second wrapper needs it. Claim ledger is a second candidate | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` | PRs: none | open issues: none | CI: none configured
- Substantive commits this session: `e5fdf91` · `01e14f8` · `6d41669` — all pushed
- **HEAD is the backup commit that wrote this file**, so it always sits one ahead of the
  last substantive commit. Compare against the list above, not against HEAD — a one-commit
  gap whose message is `docs(session):` is the design, not drift.

## Gotchas

- **Run every change against all three fixtures.** The shadcn app is built on demand and
  pinned; a rebuild that differs under those pins is information, not noise.
- **The theme probe is wrong in both directions, and that is the point.** It reports
  "nothing reachable" on a kit card (false — the pane owns theming) and on a stock shadcn
  app (true — `.dark` ships with no toggle). Identical output, opposite correct answers.
  Driving the control is the only fix; pattern-matching labels is not.
- **The dominant defect class is placement, not content.** Six of the last nine, and most
  of the ~50, were a correct rule sitting where the agent who must obey it never reads.
  Ask "is this rule reachable from the prompt that needs it?" before asking if it is right.
- **Scenario testing cannot find seams.** Three rounds of three-fixture waves kept missing
  contradictions between new text and distant paragraphs; one adversary reading the diff
  against the *whole file* found 15, two critical.
- **Three claims I stated this session were false**, each adopted from an agent without
  re-deriving. Verify before writing a claim into a rule — a wrong sentence in a report is
  corrected next turn; in a skill it ships.
- `pkill -f "codex exec"` **kills your own wrapper shell** (its command line contains the
  string); `codex exec` in a non-TTY context blocks on stdin unless you redirect
  `< /dev/null`; `/codex:status` is user-invocation only — the fresh-context fallback is
  the agent's path and it performed well.

## Next Session Kickoff

1. Ask which board item Scott wants; do not assume.
2. **Do not re-litigate the sibling-repo findings.** Both repos have them and are acting.
3. If touching `SKILL.md`: three fixtures, then the diff-versus-whole-file adversary.
   Skipping the second is how the last 15 got in.
4. Read the repo's `skills/doctrine-gauntlet/SKILL.md`, not the plugin cache.
5. Standing rule: everything outside `doctrine-skills` is read-only. Design deficits are
   reported, never fixed.
6. Skills to invoke: `doctrine` (hub) before any `doctrine-*` wrapper; `doctrine-audit`
   for a fresh sweep; `doctrine-gauntlet` for the real run item 1 wants.
