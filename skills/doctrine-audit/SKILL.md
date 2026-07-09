---
name: doctrine-audit
description: Use when the user asks for a bug hunt or deep code audit of the codebase: finding drift, feature gaps, logic issues, over-engineering, and bugs with parallel finder waves, red-teaming, and looping until dry.
---

# Doctrine Audit

Codebase audit under the doctrine: find real issues, verify them, fix the confirmed ones.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. Designated review skill for fix phases: `matts-code-review`.

## Flow

1. Ask the user the scope questions their request didn't already answer: target area, fix-as-we-go vs report-first, and the severity/effort line above which issues get filed instead of fixed.
2. **Find**: parallel finder waves, each with a distinct lens: simplicity (over-engineering, dead code: apply /ponytail-audit's posture if installed, scoped to the target area, not the whole repo), logic/correctness, drift (docs/config vs code), feature gaps, security-sensitive paths. Every finding needs file:line evidence. Dedupe across waves.
3. **Verify**: every finding is confirmed from source before it counts. Hunt-style findings have a high false-positive rate; a finding nobody traced to a line is noise. PLAUSIBLE-only items don't get fixed; they go to the report's appendix (or a tracker issue marked unverified).
4. **Red team**: hand the confirmed list to the red team (doctrine step 4) to refute and to extend. Verify anything it adds.
5. **Fix**: confirmed issues in phases, highest severity first, each phase under the doctrine gate (two consecutive clean passes). Use Matt Pocock's `diagnosing-bugs` for anything with a non-obvious root cause. File the rest on the project's tracker (whatever its CLAUDE.md names) rather than letting them rot in a report.
6. **Loop until dry**: repeat find→verify with fresh lenses until two consecutive rounds surface nothing new (post-verification). New round findings start new fix phases; they don't reopen closed ones. If you run out of meaningful lenses before two dry rounds, say so and stop; don't invent junk lenses to satisfy the counter.
7. Deliver per doctrine step 7. Report-first mode: write the report where the project keeps them (check its conventions; ask if none exist).

Bigger architectural refactors surfaced along the way go through Matt Pocock's `improve-codebase-architecture` (Read `~/.claude/skills/improve-codebase-architecture/SKILL.md` if installed; otherwise file them as tracker issues), not ad-hoc rewrites mid-audit.
