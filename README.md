# Doctrine Skills

An execution posture for substantial agent work in Claude Code: **parallel agents in phases and waves, adversarial red-teaming, looping until confident, ruthless simplicity.**

Five skills:

| Skill | Use for |
|---|---|
| `doctrine` | The shared posture. Wrappers invoke it; you can also ask for any task "with the doctrine". |
| `doctrine-code` | General coding (backend, frontend, UI): specs, tickets, features. |
| `doctrine-debug` | Anything broken, throwing, failing, or slow. |
| `doctrine-audit` | Bug hunts and deep code audits: drift, logic issues, over-engineering. |
| `doctrine-docs` | Documentation sweeps: stale docs, undocumented features, then a PR. |

## The posture

1. **Ask questions first**, in plain prose, one topic at a time. Never ask what the request already answered or what source can confirm.
2. **Phases and waves**: independent work runs as parallel agents; mutating agents get disjoint files or worktrees.
3. **Combat drift**: every phase ends with typecheck, targeted tests, and a designated review skill; done is claimed only with the check output shown.
4. **Red team**: an adversarial reviewer attacks each phase's diff or findings. Every red-team finding is verified from source before acting; adversarial reviewers produce false positives.
5. **Loop until confident**: a phase exits on two consecutive clean passes of the full gate. Any diff change resets the counter. Four loops without exit escalates to the user.
6. **Simplify early and often**: a YAGNI/dead-code pass at every phase exit; reuse before reinventing.
7. **Deliver**: work ends with commit/push/PR per the repo's norms, never with "the loop is clean."

## Install

```
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

## Prerequisites

The doctrine composes with other tooling and **degrades gracefully when something is missing** (each skill states its fallback), but it works best with:

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) — `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content.
- [superpowers](https://github.com/obra/superpowers) — brainstorming, dispatching-parallel-agents, verification-before-completion.
- [OpenAI codex plugin](https://github.com/openai/codex) — the default red team (`codex:codex-rescue`). Fallback: a fresh-context subagent prompted to refute.
- [ponytail](https://github.com/DietrichGebert/ponytail) — simplification review/audit. Fallback: `/simplify` or a manual YAGNI pass.
- `matts-code-review` — a two-axis (Standards + Spec) review skill. Fallback: `/code-review` or two parallel review subagents.

## Design notes

- The doctrine is a **layer, not a fork**: it wraps other authors' skills at runtime, so their upstream updates flow through untouched.
- The two-clean-pass gate defines what a "finding" is (anything requiring a diff change), so declined nitpicks don't loop forever, and a 4-loop escalation valve prevents grinding.
- These skills were built test-first: fresh-context agents ran each wrapper against realistic scenarios, and every ambiguity they hit was patched before release.

## License

MIT
