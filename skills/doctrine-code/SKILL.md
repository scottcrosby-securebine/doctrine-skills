---
name: doctrine-code
description: Use when the user asks for general coding work (backend, frontend, or UI) done with the doctrine: building features, wiring modules, implementing a spec or tickets with parallel agents, red-teaming, and looping.
---

# Doctrine Code

General coding under the doctrine.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first: it defines phases/waves, the red-team gate, the two-clean-pass loop exit, simplification cadence, and the fallbacks for missing prerequisite skills. Designated review skill for this wrapper: `matts-code-review` (inside the phase gate; its findings reset the counter like any other).

## Flow

1. If there's a spec or tickets, ask the user only the questions the spec leaves open (doctrine step 1), then proceed. If there's none, run superpowers:brainstorming; its interview IS the questions step, don't interrogate twice.
2. Execute per Matt Pocock's `implement` skill (Read `~/.claude/skills/implement/SKILL.md` if installed; inline fallback: `tdd` at pre-agreed seams, typecheck regularly, single test files regularly, full suite once at the end, review at the end).
3. Split the plan into phases; run independent slices as parallel waves per the doctrine (disjoint files or worktrees).
4. Phase exit: native checks → `matts-code-review` → red team → loop to two consecutive clean passes → simplification review once per phase (its diff changes re-enter the gate; don't re-run it on the re-entry passes).
5. Deliver per the repo's norms (doctrine step 7): commit, push, PR.

## UI work

Same flow, plus: reuse the project's existing UI color patterns, component library, and layout conventions: grep for a sibling component before styling anything new. Verify visually with the `run` skill or browser tools before claiming done; tests alone don't prove UI. If the project can't run authenticated UI locally, say so and use its documented post-deploy verification path instead of skipping the visual check.
