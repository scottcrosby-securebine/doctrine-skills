# State [doctrine-gauntlet v1.15.0; generality-tested against three topologies | 2026-08-13]

## Resume

`securebine-design` was heavily upgraded, and auditing `doctrine-gauntlet` against it
produced a bigger result than the audit: **Scott ruled that the skill must also work
with no design language, or a different one.** That constraint changed the work from
"fit this kit" to "prove nothing here is kit-shaped", and it is now the standing test.

**Three fixtures, checked in as `fixtures/` — the recipe, not the app.** Bare page
(nothing became mandatory), stock Next+shadcn (nothing encoded one house's taste, and
the single-repo topology works), real bound system. Scott's suggestion; strictly better
than the synthetic inverted fixture I had proposed, because inventing a house's taste is
weaker evidence than a real one, and only shadcn supplies the topology where the design
system lives **inside** the deliverable.

They paid out within minutes and kept paying:

1. **The harness measured the wrong website through two complete runs** and printed a
   clean floor — another session held port 3000, the fixture silently moved to 3001. The
   skill has warned about this in prose for months; nothing checked it at the point of
   measurement. Identity now prints every run; `--expect=TEXT` gates it.
2. **`.sr-only` read as a blocking layout defect** by the inner-clip check — standard
   accessibility markup, on most modern sites.
3. **Frozen-type measured the page wrapper, not the reading column**, so it fired on a
   stock page whose `<main>` was capped at `max-w-3xl`.
4. **Precedence made a scaffold's zero-chroma defaults outrank the brief**, shipping a
   grey, single-typeface page marked house-compliant — the exact generic page the skill
   exists to prevent. Fixed with "a value nobody ruled is not law", plus an *instrument*
   for it: provenance, internal inconsistency, and the generator's own stock output.

Binding got the deepest rework. The sweep now runs **before** the ladder with an
ownership test; each rung is tested against every surviving candidate; the snapshot
probes attach to the **condition** rather than to rung 3, and probe 4 decides. Root
cause: pointed at `website_v3`, the ladder bound a frozen concept directory the source
of record explicitly demotes.

**Two registers were handed to the sibling repos and Scott confirms both are acting on
them** — do not re-report those findings as new.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The gate never formally closed — 4 loops, ~50 findings, converging (26 → 15 → 3 → 9+9) but not provably terminated. The last round of mechanical fixes is **unverified**. Next real gauntlet run is a better test than a fifth synthetic one | — | 🟡 | `skills/doctrine-gauntlet/SKILL.md` |
| A1/A2-class work is done; the **law-as-critic-axis** is still untested — no critic has ever run against a bound system's law with the law named by path | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| The fused gate has still never run to exit locally. Pure gauntlet has, in production (wave 10) | — | ⏳ | `website_v3/docs/RESTYLE-DOCKET.md` #84 |
| Trigger, not a task: hoist docket/counter machinery to the hub when a second wrapper needs it. Claim ledger is a second candidate | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` @ `6d41669` | clean | pushed | PRs: none | CI: none configured
- Session commits: `e5fdf91` (harness), `01e14f8` (binding, v1.15.0), `6d41669` (fixtures)

## Gotchas

- **Run every change against all three fixtures.** `fixtures/README.md` says what each
  proves. The shadcn app is built on demand and pinned; a rebuild that differs under
  those pins is information, not noise.
- **The theme probe is wrong in both directions and that is the point.** It reports
  "nothing reachable" on a kit card (false — the pane owns theming) and on a stock
  shadcn app (true — `.dark` ships with no toggle). Identical output, opposite correct
  answers. Driving the control is the only fix; pattern-matching labels is not.
- **The dominant defect class is placement, not content.** Six of the last nine, and
  most of the ~50, were a correct rule sitting where the agent who must obey it never
  reads. Same taxonomy as the first gauntlet run. Ask "is this rule reachable from the
  prompt that needs it?" before asking whether it is right.
- **Scenario testing cannot find seams.** Three rounds of three-fixture waves kept
  missing contradictions between new text and distant paragraphs. One adversary reading
  the diff against the *whole file* found 15, two critical. Run that one every time.
- **I stated three things this session that were false**, each adopted from an agent
  without re-deriving: "four of four signals", "the gauntlet cannot close on a kit
  card", "the copy gate appears in no doc". Verify before writing a claim into a rule —
  a wrong sentence in a report gets corrected next turn; in a skill it ships.
- **`pkill -f "codex exec"` kills your own wrapper shell**, whose command line contains
  that string. Cost three background runs. And `codex exec` in a non-TTY context blocks
  on stdin forever unless you redirect `< /dev/null`.
- `/codex:status` is user-invocation only. The doctrine's fresh-context fallback is the
  live path for an agent, and it performed well.

## Next Session Kickoff

1. Ask which board item Scott wants; do not assume.
2. **Do not re-litigate the sibling-repo findings.** Both repos have them and are acting.
3. If touching `SKILL.md`: three fixtures, then the diff-versus-whole-file adversary.
   Skipping the second is how the last 15 got in.
4. Read the repo's `skills/doctrine-gauntlet/SKILL.md`, not the plugin cache.
5. Standing rule: everything outside `doctrine-skills` is read-only. Design deficits are
   reported, never fixed.
