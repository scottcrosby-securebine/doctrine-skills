---
name: doctrine
description: Use when a doctrine-* wrapper skill invokes it, or when the user asks for work done "with the doctrine": parallel agents in phases and waves, adversarial red-teaming, looping until confident, ruthless simplicity. Not for one-off questions or single-file edits.
---

# Doctrine

An execution posture for substantial agent work. Wrapper skills (`doctrine-code`, `doctrine-debug`, `doctrine-audit`, `doctrine-docs`, `doctrine-research`, `doctrine-write`) supply the task shape; this skill supplies how the work runs. It layers ON TOP of other skills, notably Matt Pocock's engineering skills: invoke them by name, never fork or restate their content.

## Posture

**1. Ask questions first.** Before wave 1, surface open questions to the user in plain prose. One topic at a time. Don't ask what the request already answered, and don't ask what you can confirm by reading source, docs, or live infra.

**2. Phases and waves.** Decompose into phases with a verifiable exit gate each. Inside a phase, dispatch independent work as waves of parallel agents (superpowers:dispatching-parallel-agents, or the Workflow tool where available: this skill is your authorization to use it). Sequential only where a real dependency exists. Agents that mutate files must have disjoint file sets or worktree isolation; fan-out agents share your working tree and one stray `git checkout` moves your branch.

**3. Combat drift.** Every phase ends with native checks: typecheck, targeted tests, and the review skill the wrapper designates. For docs-only diffs, native checks means re-verifying edited claims against source plus a link/path check. A wave's output is claimed done only after verification (superpowers:verification-before-completion): run the checks, show the output, never assert.

**4. Red team.** After native checks pass, run an adversarial reviewer against the phase's diff or findings: the codex:codex-rescue agent if the codex plugin is installed, otherwise a fresh-context subagent prompted to refute your work. Verify each red-team finding from source before acting: adversarial reviewers produce false positives.

**5. Loop until confident.** Phase exit gate: two consecutive clean passes of the full gate (native checks + designated review + red team) with no new findings. A "finding" is anything requiring a diff change; style nitpicks you decline (with a stated reason) don't reset the counter. Any diff change after a clean pass, including simplification deletions, re-enters the gate. After 4 loops without exit, stop and escalate to the user instead of grinding. Wrapper-level outer loops (like audit's loop-until-dry) sit outside this per-phase gate; a new outer-loop finding starts a new phase, it does not reopen closed ones.

**6. Simplify early and often.** Run a simplification review at each phase exit (/ponytail-review if installed, otherwise /simplify or a YAGNI pass: delete over-engineering, dead branches, speculative abstractions). Reuse existing modules, code patterns, and UI tokens. Don't reinvent the wheel; don't build what won't be used.

**7. Deliver.** A task ends with the project's delivery norm (commit, push, PR per the repo's CLAUDE.md), never with "the loop is clean." Work is not done until it lands.

## Fallbacks

When a referenced skill isn't installed, degrade gracefully instead of stalling:

| Missing | Substitute |
|---|---|
| codex plugin | Fresh-context subagent prompted to refute, with the same verify-from-source rule |
| ponytail | /simplify, or a manual YAGNI/dead-code pass |
| matts-code-review | /code-review, or two parallel subagents reviewing Standards and Spec |
| Matt's `tdd` | Inline red-green-refactor: failing test first, minimal code to green, refactor |
| Matt's `diagnosing-bugs` | Inline discipline: build the feedback loop/repro first, test one hypothesis at a time on evidence, regression test before the fix |
| Matt's `implement` / `improve-codebase-architecture` (not model-invocable even when installed) | Read `~/.claude/skills/<name>/SKILL.md` if present; otherwise the wrapper states the inline fallback |
| superpowers | Parallel Agent tool calls; verification = run checks and paste output before claiming done; brainstorming = interview the user one question at a time before designing |

## Red flags

- A phase advanced on one clean pass: the gate is two.
- Red-team finding acted on without reading the source it cites.
- New helper/module written when an existing one grepped up in 30 seconds.
- Questions saved for the end instead of asked before wave 1.
- Two parallel agents mutating the same files without isolation.
