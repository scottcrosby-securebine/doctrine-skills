# Doctrine Skills

An execution posture for substantial agent work in Claude Code: **parallel agents in phases and waves, adversarial red-teaming, looping until confident, ruthless simplicity.**

Seven skills:

| Skill | Use for |
|---|---|
| `doctrine` | The shared posture; the six wrappers invoke it. |
| `doctrine-code` | General coding (backend, frontend, UI): specs, tickets, features. |
| `doctrine-debug` | Anything broken, throwing, failing, or slow. |
| `doctrine-audit` | Bug hunts and deep code audits: drift, logic issues, over-engineering. |
| `doctrine-docs` | Documentation sweeps: stale docs, undocumented features, then a PR. |
| `doctrine-research` | Deep multi-source research questions that need a fact-checked recommendation. |
| `doctrine-write` | Important documents, written or rewritten: proposals, briefs, PRDs, reports. |

## The posture

1. **Ask questions first**, in plain prose, one topic at a time. Never ask what the request already answered or what a source can confirm.
2. **Phases and waves**: work splits into phases, each with a verifiable exit gate; inside a phase, independent tasks run as waves of parallel agents. Mutating agents get disjoint files or worktrees.
3. **Combat drift**: every phase ends with native checks (typecheck and targeted tests for code, claim re-verification for prose) and a designated review skill; done means showing check output, not asserting it.
4. **Red team**: an adversarial reviewer attacks each phase's diff or findings. Verify every red-team finding from source before acting on it; adversarial reviewers produce false positives.
5. **Loop until confident**: a phase exits on two consecutive clean passes of the full gate. Any diff change resets the counter. Four loops without exit escalate to the user.
6. **Simplify early and often**: a YAGNI/dead-code pass at every phase exit; reuse before reinventing.
7. **Deliver**: work ends with commit/push/PR per the repo's norms, never with "the loop is clean."

## Install

```
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

One install brings all seven skills; the `doctrine-*` skills then appear in your skills list. Ask in task terms ("hunt bugs in the payments module with the doctrine") or name a wrapper ("use doctrine-debug on this flaky test").

## Prerequisites

Everything below is optional (each skill states its fallback), but the doctrine works best with these. Plugins install with `/plugin marketplace add <owner/repo>` then `/plugin install <name>@<marketplace>`; standalone skills copy into `~/.claude/skills/<name>/`.

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) (standalone: copy the `skills/engineering/<name>/` folders): `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content. One special case: install `code-review` as `matts-code-review` (copy it into `~/.claude/skills/matts-code-review/` and set the frontmatter `name:` to match) because the original name collides with Claude Code's native `/code-review`. It's a copy, not a symlink: re-sync it after updating his repo. Fallbacks: the `doctrine` skill's table lists a fallback for each; `matts-code-review` degrades to `/code-review` or two parallel review subagents.
- [superpowers](https://github.com/obra/superpowers) (plugin): brainstorming, dispatching-parallel-agents, verification-before-completion. Fallback: parallel Agent calls with check output pasted before claiming done; for brainstorming, interview the user one question at a time before designing.
- [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc) (plugin; also needs the Codex CLI installed and logged in: run `codex:setup` to verify): the default red team (`codex:codex-rescue`) and `doctrine-research`'s second research engine. Fallback: a fresh-context subagent prompted to refute (research loses cross-model diversity and says so in the report).
- [ponytail](https://github.com/DietrichGebert/ponytail) (see its repo for install): simplification review/audit. Fallback: `/simplify` or a manual YAGNI pass.
- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely) (standalone): Strunk's Elements of Style; the clarity lens in `doctrine-write` and the editing pass in `doctrine-docs`. Fallback: a lens prompted with Strunk's core rules.
- Claude Code's bundled `deep-research` workflow: `doctrine-research`'s first engine (confirm `deep-research` appears in your skills list). Fallback: a fan-out of web-search agents with per-claim adversarial verification.

## Design notes

- The doctrine is a **layer, not a fork**: it wraps other authors' skills at runtime, so their upstream updates flow through untouched (one exception: the renamed `matts-code-review` copy, see Prerequisites).
- The two-clean-pass gate defines what a "finding" is (anything requiring a diff change), so declined nitpicks don't loop forever, and a four-loop escalation valve prevents grinding.
- The doctrine trades tokens for confidence: waves, red teams, and loops multiply agent usage. Point it at work that matters, not one-off edits.
- These skills were built test-first: fresh-context agents ran each wrapper against realistic scenarios, and every ambiguity they hit was patched before release.

## License

MIT
