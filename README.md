# Doctrine Skills

Eight skills for Claude Code that make an agent work like a small team with a QA gate, instead of one confident pass.

## The problem this solves

Claude Code is good at the work. What it is bad at is knowing when the work is not finished.

Hand it something substantial and the same handful of failures recur. None of them look like failures:

- **It answers the request it inferred.** Your ask was ambiguous somewhere. It picked a reading, didn't tell you, and nothing later compares the result against what you actually wanted.
- **It reviews its own work.** The same context that wrote the code reads it back, finds it reasonable, and reports done. A reviewer holding the author's assumptions cannot see the author's blind spot.
- **It stops at the checks it happened to think of.** Typecheck and tests pass, so it ships. Your repo also has a linter, a schema check and a content lint. None of them ran.
- **It builds more than you asked for.** Three abstractions, a config layer, and an extension point for a feature with one caller.
- **It loses the thread on long runs.** The context window fills, gets compacted, and the running tally of what still fails goes with it. The next message says the loop is clean.

In every case the output is indistinguishable from finished work. That is the whole problem.

## What the doctrine does about it

Seven rules, applied to every job:

1. **Ask before building.** Open questions come to you in plain prose, one topic at a time, before any agent starts. Your answers get written down verbatim and handed to every agent later asked to judge the result, so the work is graded against your words rather than against itself.
2. **Split the work and run it in parallel.** A job becomes phases, each with an exit gate you can check. Inside a phase, independent tasks run as simultaneous agents.
3. **Run every gate the project documents**, not only the ones an agent would think of. A gate passes on its exit status. A check that did not run is recorded as not run, never as clean.
4. **Send an adversary.** A fresh-context reviewer, by default a different model, attacks each phase's diff and tries to break it. Its findings are checked against the source before anyone acts on them, because adversarial reviewers also invent things.
5. **Loop until two consecutive passes come back clean.** Any change to the deliverable resets the count to zero. A second counter never resets, and every fourth unresolved round it stops and hands you a decision rather than grinding.
6. **Cut what nobody asked for**, once per phase, before the passes that certify what ships.
7. **Deliver the way the repo delivers**, and say plainly whether the shipped revision earned two clean passes or was shipped at an escalation.

## What using it looks like

You say: *"audit the payments module for bugs with the doctrine."*

1. It comes back with two or three questions before doing anything. What counts as in scope. Whether the legacy adapter is fair game. What you mean by "bug" here. It will not guess on a question that changes the direction of the work.
2. Your answers are written to a durable record. Phase 1 opens.
3. Several agents read different parts of the module at the same time and report what they find.
4. It runs whatever the project documents as a gate, not only typecheck and tests: the scripts in `package.json`, the CI config, whatever `CONTRIBUTING` names.
5. The diff goes to an adversarial reviewer with no memory of having written it.
6. Blocking findings get fixed. Each one is then asked where else the same mistake appears, so it is fixed as a class instead of one instance.
7. The gate runs again. Two clean rounds in a row and the phase exits. Four unresolved rounds and it stops to tell you what shipping as-is would actually mean.
8. Delivery leads with which of those two happened.

Step 8 is the point of the whole thing. A run that never got clean says so in its first line, instead of summarising the work and letting you assume.

## What it tells you at the end

Every run opens its delivery report with one line about the gate, before anything about the work. Either this:

```
Gate: two consecutive clean passes on 4a3e4ca. No blockers open.
```

or this:

```
Gate: shipped at an escalation, round 6, zero clean passes.
Open: 2 blocking findings, both in the migration path.
```

The wording is the run's own. What the line has to contain is not optional, and there is no third form where a run that never got clean gets summarised as finished. After that line it walks your original request item by item and says where each one landed.

## Where these rules came from

Each rule here replaced a specific failure rather than a theory about good process. Two examples:

- `doctrine-gauntlet` renders every page at four widths up to 2560px, because seven earlier review rounds all passed a page whose navigation rendered at 13px at every resolution up to 4K. No number of rounds below a width can see a defect that lives above it.
- Its harness, the automated floor a page must clear before any critic looks at it, prints `=== TECHNICAL FLOOR: PASS ===` only when every check actually ran. If one could not, it prints `NOT CLEAN`, names what went unmeasured, and exits `3` rather than `0`, so no caller can read "nothing failed" as "it passed".

That is also the honest limit of the evidence. These rules came out of real work, but the failures documented here are ones the author hit. There is no third-party benchmark and no published before-and-after on someone else's codebase.

## What it costs

The doctrine trades tokens and wall-clock time for confidence. One data point rather than a cost model: a `doctrine-docs` run over a small repository took roughly 50 minutes and 236k tokens end to end. Parallel agents, red teams and repeated review rounds multiply usage, and the figure scales with the size of the job.

Point it at work where being wrong is expensive. Do not point it at a one-line fix, a question, or a single-file edit. There is no lighter mode.

**Language and stack.** The doctrine itself is language-agnostic. It runs whatever your project documents as a gate, so a Python repo's `pytest` and `ruff` are its gate exactly as an npm script would be. Only `doctrine-gauntlet`'s browser harness is Node, because it drives Playwright.

## Install

```
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

One install brings all eight skills; the `doctrine-*` skills then appear in your skills list. Ask in task terms ("hunt bugs in the payments module with the doctrine") or name a wrapper ("use doctrine-debug on this flaky test").

## The eight skills

| Skill | Use for |
|---|---|
| `doctrine` | The shared posture; the seven wrappers invoke it. |
| `doctrine-code` | General coding (backend, frontend, UI): specs, tickets, features. |
| `doctrine-gauntlet` | Web design: pages, heroes, design-system cards, built builder-vs-critic against a reference where there is one. Visual work only — the logic behind the page is `doctrine-code`. |
| `doctrine-debug` | Anything broken, throwing, failing, or slow. |
| `doctrine-audit` | Bug hunts and deep code audits: drift, logic issues, over-engineering. |
| `doctrine-docs` | Documentation sweeps: stale docs, undocumented features, landed by the repo's norm. |
| `doctrine-research` | Deep multi-source research questions that need a fact-checked recommendation. |
| `doctrine-write` | Important documents, written or rewritten: proposals, briefs, PRDs, reports. |

## Prerequisites

**Nothing here is needed to install the plugin.** All eight skills load and run without any of it, and every entry below states what happens in its absence.

One skill has a real runtime dependency: `doctrine-gauntlet` judges rendered pages, so it needs a browser, and without one its harness refuses to run rather than reporting a pass. See the Playwright entry.

Two of these are one-command plugin installs and three are already part of Claude Code. The two standalone skills are manual copies into `~/.claude/skills/`, and the Matt Pocock set carries a rename caveat worth reading before you start.

Plugins install with `/plugin marketplace add <owner/repo>` then `/plugin install <name>@<marketplace>`; standalone skills copy into `~/.claude/skills/<name>/`.

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) (standalone: copy the `skills/engineering/<name>/` folders): `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content. **Install them standalone, not as his `mattpocock-skills` plugin**: the wrappers (and the `doctrine` skill's fallbacks) invoke them by bare name and read `~/.claude/skills/<name>/SKILL.md`, neither of which a plugin install provides — its skills are namespaced `mattpocock-skills:<name>`. One special case: install `code-review` as `matts-code-review` (copy it into `~/.claude/skills/matts-code-review/` and set the frontmatter `name:` to match) because the original name collides with Claude Code's native `/code-review`. It's a copy, not a symlink: re-sync it after updating his repo. Fallbacks: the `doctrine` skill's table lists a fallback for each; `matts-code-review` degrades to `/code-review` or two parallel review subagents.
- [superpowers](https://github.com/obra/superpowers) (plugin): brainstorming, dispatching-parallel-agents, verification-before-completion, using-git-worktrees. Fallback: parallel Agent calls with check output pasted before claiming done; `git worktree add` directly for isolation; for brainstorming, interview the user one question at a time before designing.
- [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc) (plugin; also needs the Codex CLI installed and logged in: run `codex:setup` to verify): the default red team (`codex:codex-rescue`), `doctrine-research`'s second research engine, and — via the Codex CLI directly — `doctrine-gauntlet`'s image generation and image-seeing red team. Fallback: a fresh-context subagent prompted to refute (research loses cross-model diversity and says so in the report; the gauntlet directs native CSS/SVG/canvas art instead of generated assets).
- [ponytail](https://github.com/DietrichGebert/ponytail) (see its repo for install): the simplification review of your own diff, and the scoped audit lens in `doctrine-audit`. Fallback: the `doctrine` skill's table gives a **different** substitute for each of those two uses — `/simplify` for the first, and for the audit lens a manual, report-only YAGNI read of the target area. Never `/simplify` there: it is scoped to the diff rather than the target area, and it mutates the repo.
- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely) (standalone): Strunk's Elements of Style; the clarity lens in `doctrine-write` and the editing pass in `doctrine-docs`. Fallback: a lens prompted with Strunk's core rules.
- Claude Code's bundled `deep-research` workflow: `doctrine-research`'s first engine. It's a workflow, not a skill — `doctrine-research` invokes it through the Workflow tool, so it won't show up in your skills list. Fallback: a fan-out of web-search agents with per-claim adversarial verification.
- Claude Code's Workflow tool, optionally: `doctrine-gauntlet` is the only skill that ships its own workflow script — one gauntlet round can run as a journaled, crash-resumable script (`skills/doctrine-gauntlet/workflow.md`) — while `doctrine-research` runs the bundled `deep-research` workflow through the same tool. Fallback: the prose flow in the skill is the round, unchanged.
- Claude Design (the `DesignSync` tool, on a claude.ai login): `doctrine-gauntlet` uses it to push work-in-progress rounds you can watch in the Design pane and to deliver the approved set (a Design project is a rendering, never a design-system binding — the system is bound in the repo). Fallback: the repo alone is the design system and the source of record.
- Playwright, for `doctrine-gauntlet` only: its critics judge rendered output, so the floor needs a browser. The skill **ships its own harness** at `skills/doctrine-gauntlet/harness/floor.mjs`; run it from the project and it resolves that project's Playwright and axe — nothing in it is machine-specific. In a project that has neither: `npm i -D playwright-core axe-core && npx playwright install chromium`. Without a browser the harness refuses to run rather than reporting a pass, because a critic that cannot look has reviewed nothing. Without axe, accessibility reports as unmeasured, never as clean.

## Reference: the gate in full

Everything above is the summary. Below is the exact wording, for when you are running the doctrine on real work and need to know what the gate will and will not accept.

### The posture, stated precisely

1. **Ask questions first**, in plain prose, one topic at a time. Never ask what the request already answered or what a source can confirm. Write the answers down verbatim before wave 1 — that record is **the anchor**, and every agent sent to judge the work is handed it. An unanswered question about direction blocks the phase; it doesn't become a default.
2. **Phases and waves**: work splits into phases, each with a verifiable exit gate; inside a phase, independent tasks run as waves of parallel agents. Agents that mutate files need real isolation — read the `doctrine` skill's step 2 for what that takes, because disjoint files alone are not it.
3. **Combat drift**: every phase ends with native checks — **every check the project documents as a gate**, not only typecheck and tests, since a linter, schema check or content law is read out of the run by a compiler-noun definition — plus a designated review skill; a gate passes on its exit status, the output is what you show for it rather than what you judge it by, and an unrun check is recorded as unrun rather than reported clean.
4. **Red team**: an adversarial reviewer attacks each phase's diff or findings. Verify every red-team finding from source before acting on it; adversarial reviewers produce false positives.
5. **Loop until confident**: a phase exits on two consecutive clean passes of the full gate. Any diff change resets the counter to zero, simplification included. A separate valve counts unresolved rounds and never resets, escalating at every multiple of four and re-arming rather than being spent; both counters go to disk, because a compaction zeroes an in-context counter and tells nobody. A phase that ends any other way — stopped by the user, shipped at an escalation, ended with a direction question unanswered, or unable to continue — is recorded as that state, never as clean, and a phase still running is recorded as open, so that a record with no state means the write was lost. Every blocking finding is asked where else the same mark would be, and fixed as a class rather than an instance. Where a class can be caught mechanically, the check is built before another review round runs. The valve's escalation reports where the findings landed and why, not a bare count, and says whether the exit condition is reachable at all: where a gate has stopped discriminating it may propose a narrowed blocking definition for the user to rule on. The pass after a repair is pointed at the repair, because a fix is the least reviewed text in the deliverable at the moment the next pass opens.
6. **Simplify early and often**: a YAGNI/dead-code pass once per phase, before the two clean passes that certify the shipping revision — never after them, or the count the phase just earned resets; reuse before reinventing.
7. **Deliver**: work ends with the repo's delivery norm, never with "the loop is clean." Commit — then push or open a PR **only where that norm says to, or where the user has said to**; where nothing documents a norm there is nothing to defer to, so commit locally and ask. Whatever triggers delivery, one line goes first: whether the shipping revision carries two confirming clean passes, and what blockers remain open. Close by walking the original request item by item and naming where each one landed.

### Design notes

- The doctrine is a **layer, not a fork**: it wraps other authors' skills at runtime, so their upstream updates flow through untouched (one exception: the renamed `matts-code-review` copy, see Prerequisites).
- The two-clean-pass gate splits findings into **blocking** (the deliverable is wrong or unfinished without a change) and **non-blocking**, so only the first resets the counter and declined nitpicks don't loop forever. A pass is clean when it leaves nothing outstanding — including a finding carried over from an earlier pass, which "no *new* findings" would have waved through. A four-loop escalation valve prevents grinding, and what it reports at each stop leads with what shipping now would mean, before anything about the loop — the `doctrine` skill's step 5 says what goes in it.
- `doctrine-gauntlet` folds in the [gauntlet loop](https://somethingbig.ai/gauntlet-loop) (Matt Shumer): builder agents paired with harsh critics that judge rendered output blind against a reference. Its two modes keep both halves honest — the **fused gate** bounds the loop the doctrine way (blocking findings loop, polish goes to a docket, four rounds escalate), while **pure gauntlet** hands the stop decision to the critic and runs open-ended. A gauntlet optimizes whatever direction it is given, so the skill binds a design system and verifies the reference render before the first comparison.
- **How these are tested.** Most of the skills' prose has no suite to run; two things stand in for one, one part of it now has a gate of its own, and the code carries real gates. Fresh-context agents are run through each wrapper against realistic scenarios and every ambiguity they hit is patched — that is validate-then-repair, not TDD, and it is periodic rather than per-commit, so edits can be ahead of the last full run. And [`fixtures/`](fixtures/) is a standing regression suite for `doctrine-gauntlet`: three generality cases, each proving something the other two cannot, run against any change to the gauntlet or its harness. The harness code itself (`floor.mjs`, `round.workflow.mjs`) carries manual gates, rerun by hand after any harness change: a syntax gate and three-clause tamper fixtures for the round script, defined in `skills/doctrine-gauntlet/workflow.md`, and `floor.md`'s own tamper discipline for the floor's checks. **The skills' own documents** have a gate too — `node tools/doc-check.mjs` reads every skill's markdown against `doctrine-gauntlet`'s fixture file, and fails on a stale fixture reference in a document that names a live hyphenated one, a roster of fixture names inside one sentence, a claim restated in two places through any difference of emphasis, capitalisation or line wrapping, a fixture the docs' derivation rule cannot classify, and an attributed citation that no longer resolves in the document or the corpus it points at; it carries its own self-test, states its blind spots in its header, and is loaded by no skill.
- **On the case narratives.** `doctrine-gauntlet` cites incidents — a critic that manufactured a finding, a harness that measured the wrong theme, a brief of four items that shipped three. They are drawn from real engagements and deliberately anonymized: no client, product, person or repository is named, and identifying detail is removed rather than obscured. They are mnemonics for the rule beside them, not citations you can follow.

## License

MIT
