---
name: doctrine-code
description: Use when the user asks for general coding work (backend, frontend, or UI) done with the doctrine: building features, wiring modules, implementing a spec or tickets with parallel agents, red-teaming, and looping.
---

# Doctrine Code

General coding under the doctrine.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first: it defines phases/waves, the red-team gate, the two-clean-pass loop exit, simplification cadence, and the fallbacks for missing prerequisite skills. Designated review skill for this wrapper: `matts-code-review`, inside the phase gate. Three things it needs that no other step of this flow supplies:

- **A fixed point, pinned by you.** Its first process step is "whatever the user said is the fixed point — if they didn't specify one, ask for it", so a gate that dispatches it bare stops and asks the user, twice a phase, every phase. Pin **the SHA the phase started from** (`git rev-parse HEAD` before wave 1), not `main` or the merge-base: against either of those it re-reviews every phase already closed and re-files their findings, which doctrine step 5 counts as *outstanding* against the pass you are in — so the phase can never reach two clean passes.
- **A spec source.** With none it skips the Spec sub-agent and reports "no spec available", and the phase gate's designated review runs one axis of two. Step 1 produces that source; pass its path. Issue-referenced specs additionally need Matt's `docs/agents/issue-tracker.md` — where that file is missing, issue numbers in commit messages won't resolve, so hand it a path rather than a `#N`.
- **The hub's finding split.** Its Standards axis returns labelled judgement calls freely ("possible Feature Envy", a rename suggestion) on top of documented-standard breaches. Grade everything it returns by doctrine step 5: blocking only where the deliverable is wrong or unfinished without the change; a suggestion you decline with a stated reason is non-blocking and does **not** reset the counter. Treat them all as blocking and a thorough review grinds the phase into the escalation valve — an undeclared counter alteration, which the hub permits only when stated.

## Flow

1. If there's a spec or tickets, ask the user only the questions the spec leaves open (doctrine step 1), then proceed. If there's none, run superpowers:brainstorming; its interview IS the questions step, don't interrogate twice. **Either way, write the settled requirements to a file before wave 1** (doctrine step 1: write the answers down where the work lands) — the existing spec's own path, or a new file under the project's `docs/`, `specs/` or `.scratch/`. Those three directories are not arbitrary: they are where `matts-code-review` looks for a spec, and finding nothing there its Spec sub-agent skips and reports "no spec available" — so on the brainstormed path, the path this wrapper explicitly supports, the phase gate's designated review checks the code against nothing the user asked for and reports clean on one axis of two. Hand that path to every review you dispatch.
2. Execute per Matt Pocock's `implement` skill (Read `~/.claude/skills/implement/SKILL.md` if installed; inline fallback — and this is the default whenever `implement` isn't installed, not an edge case: `tdd` at **test seams you name and get agreed before wave 1**. Add them to step 1's questions; nothing else in this flow produces them, and "pre-agreed" with no agreement step means each wave agent picks its own. **Then put them in each wave agent's prompt — the seams that agent owns, test-first at those seams**: the wave agent is the one writing the tests, and seams agreed with the user, written to a file and handed only to reviews reach nobody who writes one. Then typecheck regularly, single test files regularly, full suite once at the end, review at the end).
3. Split the plan into phases; run independent slices as parallel waves **per doctrine step 2's isolation rule, which you read there in full rather than from this line**. Disjoint files are the floor, not the bar, and the part this wrapper depends on is the rest of it: two agents on disjoint component files sharing one `.next` and one dev port both keep answering 200 while the second build overwrites the first, and the UI section's visual check below then passes on the other agent's build. Own worktree, own output directory, own port, dependencies hardlinked rather than symlinked.
4. Phase exit: native checks → `matts-code-review` → red team → simplification review once per phase (doctrine step 6: before the certifying passes) → loop to doctrine step 5's exit condition for this phase.
5. Deliver per the repo's norms (doctrine step 7): commit — then **push and open a PR only where that norm says to, or where the user has said to.** Some repos' convention is explicitly the opposite, and where nothing documents a norm there is nothing to defer to: commit locally and ask.

## UI work

Same flow, plus the following — **and put it in each wave agent's prompt, not only here. The agent that styles the component is a wave agent; a rule sitting where only the dispatcher reads it reaches nobody who writes CSS.** One line in it needs resolving before you paste: the visual check names the `run` skill, and a skill name resolves to nothing from inside a seat — put the project's actual launch command (or the check's concrete steps) into the prompt beside the block, or the check degrades silently to whatever browser tooling the seat happens to have. Where the project cannot run authenticated UI locally there is no command to resolve, and the block's post-deploy branch must not fan out — N seats verifying one deployed surface is the shared-environment failure step 2 forbids — so the visual check becomes yours, run once against the documented post-deploy path after integration, and each wave agent's prompt says the visual check is deferred to integration.

Reuse the project's existing UI color patterns, component library, and layout conventions: grep for a sibling component before styling anything new, and **return the grep you ran** alongside the work, since the dispatcher has no other way to know what was searched for. Left in this file, four wave agents each style from scratch and the run ships four button treatments plus a duplicate of a component that already existed — and the phase gate won't catch the second one: `matts-code-review` reads the diff, so a component the diff duplicates from elsewhere in the tree is outside what its Standards axis can see. Verify visually with the `run` skill or browser tools before claiming done; tests alone don't prove UI. If the project can't run authenticated UI locally, say so and use its documented post-deploy verification path instead of skipping the visual check.

## Red flags

- Two wave agents on disjoint files, one `.next` and one port — and a screenshot taken as proof, showing the other agent's build.
- A wave agent that styled from scratch because the reuse rule stayed in this file and never entered its prompt.
- `matts-code-review` dispatched with no fixed point: it stops and asks the user mid-phase, or it takes `main` and re-files the findings of phases that closed last week.
- Requirements from a brainstorm that live only in the conversation, and a Spec axis reporting "no spec available" while the gate reads clean.
- A naming suggestion treated as blocking, so the phase cannot reach two clean passes and grinds to the escalation valve.
- `tdd` started at seams nobody agreed, each agent's guess different.
- UI declared done on green tests, with nothing rendered.
- Pushed, or a PR opened, with no repo norm and no instruction saying to.
