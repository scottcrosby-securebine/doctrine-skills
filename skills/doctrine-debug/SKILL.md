---
name: doctrine-debug
description: Use when the user reports something broken, throwing, failing, or slow and wants it diagnosed and fixed with the doctrine: parallel hypothesis agents, red-teaming the diagnosis, and looping until the signal stays green.
---

# Doctrine Debug

Debugging under the doctrine.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. The core discipline is Matt Pocock's `diagnosing-bugs` skill: follow its phases exactly; this wrapper only adds the doctrine posture around it. The diagnosis phases (loop-building through hypothesis testing) are ONE doctrine phase; the fix is a second. The diagnosis phase exits when the root-cause claim survives both red-team refutation and your own source-level trace. The two-clean-pass gate applies to the fix phase; its designated review skill is `matts-code-review` on the fix diff.

## Flow

1. Ask the user any open questions (repro steps, when it last worked, environment).
2. Build the feedback loop per `diagnosing-bugs` Phase 1. This is the skill: spend disproportionate effort here. If no local repro seam exists (no local DB, auth-blocked UI), use the project's documented CI or prod-probe paths, or stop and ask; don't hypothesize without a loop.
3. When multiple hypotheses are live, test them as a parallel wave: one agent per hypothesis, each reporting evidence for/against. Probes must be isolated (read-only analysis, separate harness instances, or worktrees) so one-variable-at-a-time still holds. Kill hypotheses on evidence, not vibes. If every hypothesis dies, regenerate from the new evidence; don't recycle the old list.
4. Red-team the surviving diagnosis BEFORE writing the regression test or fix: give the red team (doctrine step 4) the symptom, the feedback loop, and your root-cause claim; ask it to refute. Verify its counter-claims from source. No point locking in a test for a refuted diagnosis.
5. Fix per `diagnosing-bugs` Phase 5 (regression test first, minimal fix), then loop: feedback loop green + native checks + `matts-code-review` + red team on the diff, two consecutive clean passes. For an intermittent bug, "green" means the full stress run clean (enough iterations that the old failure rate would almost surely have fired), not one lucky pass.
6. Simplification review on the fix: a bug fix that adds a new abstraction is usually the wrong fix. Deliver per doctrine step 7.

## Red flags

- Fix written before the feedback loop goes red on this bug.
- Root cause accepted because the red team agreed, without a source-level trace.
- A flaky bug declared fixed after a single green run.
