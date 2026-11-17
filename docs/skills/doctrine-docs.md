# doctrine-docs

A documentation sweep. The agent checks your docs against the code, fixes every claim the code no longer bears out, writes up shipped behaviour no doc mentions, and lands the result the way your repo ships work. It changes docs only.

![The doctrine-docs flow. Scope questions and an inventory of doc areas fan out to parallel Accuracy and Coverage seats per area, which merge, with the code deciding facts. Then verify, edit, native checks, one red team that is also the review, and delivery by the repo's norm.](doctrine-docs.png)

## When to use it

Use it when the docs should match the implementation and the implementation should stay as it is. It fires on a request for a documentation sweep: review the codebase so the docs reflect the current implementation, update stale docs, cover undocumented features, and land the sweep by the repo's delivery norm, a PR where that is the norm.

It does not fix code. When a doc and the code disagree because the code is wrong, the run files the bug on the project's tracker and rewrites the doc to say what the code does today, with an annotation: "currently does Y, see issue #N; intended X". Where it cannot file the issue, because your CLAUDE.md names no tracker, `gh` is not authenticated, or you have not said where issues go, the annotation goes in without a number ("currently does Y; intended X — unfiled, listed in the sweep summary") and the bug is listed in the summary instead. It never invents an issue number, never drops the annotation, and never stalls on a tracker.

Use another skill for these:

- Bug hunts: `doctrine-audit`. Code changes: `doctrine-code`.
- A document that is itself the deliverable, such as a proposal, brief or report: `doctrine-write`. Its boundary line gives codebase-doc sweeps to this skill.
- A one-off edit to one file nothing else reads needs no wrapper.

`doctrine-docs` is a wrapper. It loads the [`doctrine`](doctrine.md) skill first, which supplies the gate, the anchor, the record, the two alarms and the end states, and it adds the task shape described here.

## What it asks you first

It asks only what your request left open and the repository cannot answer:

1. **Which doc trees count**: README, `docs/`, CLAUDE.md, playbooks, or a subset.
2. **The Coverage horizon**: the point in history after which the run looks for undocumented changes. It asks only where history does not settle this. Where the repository offers more than one defensible horizon, the run takes the widest, never the nearest: the last commit to touch the docs says when somebody last wrote, not when the code last changed. Where the candidates do not order, as with two branches neither of which contains the other, it gives each its own range. It becomes a question for you only where even that coverage would still be a guess about what you want covered. No Coverage seat goes out until the horizon is a concrete ref: a SHA, a tag or a date.
3. **How the sweep lands**: whether you want a PR at all, and if so one PR or one per area. The default is one PR where your repo's norm is PRs.

Your words become the anchor, which the doctrine writes to disk verbatim and hands to every agent that judges the work. It also records the two alarm bounds: a round count, 4 by default, and a time budget, two hours by default.

Two things can come back to you later. When the two axes agree on what the code does and disagree on what the doc should say about it, the run puts that through the doctrine's direction test: if only you can answer it and the doc reads differently either way, it waits for you; otherwise it decides and writes the ruling and its reason into the record. And before the loop it proposes which gate the sweep earns (below).

## How a sweep runs

1. **Scope.** The questions above, with the horizon settled as a concrete ref before anything is dispatched.
2. **Inventory and waves.** The run splits the doc surface into areas and, for each area, dispatches two seats in parallel so neither pollutes the other's context:
   - **Accuracy** checks every checkable claim in each doc (paths, commands, environment variables, endpoints, flags, behaviour) against the current source, and reports each stale one as `doc-file:line` with the evidence in code.
   - **Coverage** walks the merges since the horizon and the module list, and reports each shipped feature or behaviour change that no doc mentions, with the code evidence a writer needs.

   The two lists are merged and deduplicated per area before any edit. Where they disagree on a fact, the code decides. Where they agree on the fact and disagree on what to do, the code decides nothing, and the direction test above applies.
3. **Verify.** Every finding is checked against source before an edit. The false positive this skill fears most is a "stale" claim that was right, rewritten so the code loses an argument nobody checked.
4. **Edit.** Accuracy findings are fixed and Coverage gaps written, each in the voice and structure of the doc it lands in, using `writing-clearly-and-concisely` if you have it and Strunk's core rules otherwise (omit needless words, active voice, definite concrete language). Redundant docs are deleted rather than kept in step. An edit to CLAUDE.md or AGENTS.md changes how agents behave, so it is flagged separately in the PR.
5. **Native checks, red team, loop.** Described in the next section.
6. **Simplify.** The doctrine's simplification review runs before the pass expected to certify the result, so its changes are inside what that pass certifies.
7. **Deliver.** By the repository's norm, with a sweep summary: docs touched, stale claims fixed, gaps filled, bugs filed, and bugs not filed. Where the norm is a PR, it opens one and flags agent-instruction files separately. Where the norm is a patch, it hands over the diff and says so. Where there is no remote, no `gh`, or you said local-only, it commits locally and asks before pushing.

## The gate

**Native checks.** Every check your project documents as a gate, in its CLAUDE.md, README, review doc or task runner, runs first: `vale`, `markdownlint`, `mkdocs build --strict`, a link checker, whatever is there. A project with no build step still has gates, so the run reads `package.json` scripts or their equivalent itself. Three checks are added to yours, never substituted for them: every edited claim re-verified against source, a link and path check, and a command check.

**The command check never runs the command.** It confirms that the command still resolves: the binary exists, the script name is in the task runner, the flags match `--help`. The run never executes a documented command for its effects, such as `npm run migrate` or `terraform apply`. Where only running a command could verify a claim, the claim is marked unverified and the summary says so. This boundary is written into every Accuracy prompt and every red-team brief, because the seat told to verify a command is the one that would otherwise run it. For a deliverable that does not execute, the doctrine counts these checks as the run in the real environment its gate requires.

**The red team is also the review.** This skill names no separate review. One adversarial pass per round fills both slots, so its brief is the whole review. It gets the doc diff with each edited doc whole beside it; what the sweep was meant to do; the Accuracy and Coverage findings already cleared; the evidence those seats worked from (the `--help` output and other command evidence, and the merge and module history over the horizon); the annotation rule and the rule that a CLAUDE.md or AGENTS.md edit is flagged; the clarity method, with word that a doc's own voice and structure win over it; the command boundary; and the scope you settled. It answers on four axes: claims still wrong, errors the edit introduced, coverage the sweep missed, and each doc's voice and structure. Its return comes back sorted into blocking, non-blocking, and what it attacked and could not break. Every finding is verified against source before anything changes.

The red team comes from the other model family where it can: the codex plugin's `codex:codex-rescue` seat on Claude Code, and the Claude Code CLI on Codex CLI. Without it, a fresh-context subagent of the same model takes the seat, and the report names the substitution.

**Which gate.** Before the loop, the run searches who reads the docs in scope and proposes a gate to you: the full gate, or the doctrine's reduced gate, which is your project's checks plus one adversarial review re-run on any repair, with no loop and no alarms; a second blocking finding moves it to the full gate. Only your choice puts the sweep on the reduced gate, and with no answer it runs the full one.

**Exit.** On the full gate, the sweep exits on one clean pass: no blocking finding, none left open from an earlier pass, and the checks above on record for that revision. A finding blocks when someone acting on the docs as they stand would do the wrong thing; a false claim about what the product does is the standing case. The skill adopts the doctrine's prose-deliverable exit: where no pass has come clean by the round alarm's first firing, one closing round reviews only what changed since the last fully reviewed revision, or the whole sweep where none was, and the sweep then ships at an escalation with a punch list of what it did not fix. The doctrine's rule that documentation waits until a phase exits does not apply, because the docs are the deliverable.

The report opens with a gate line in the form the README shows, for example `Gate: clean pass on b71c2e0, real run on record. No blockers open.`

**The record** lives where the doctrine puts it by default: beside the work in your repo, excluded from version control and from every reviewer's diff, with its path named in the report.

## An example

This is illustrative, not a recorded run.

In a Node project whose `package.json` has a `lint:docs` script, you type `use doctrine-docs on this repo; the API docs are behind the code`. The run asks which trees count and how to land; you answer README and `docs/`, one PR. It does not ask the horizon, because the repo has release tags and it takes the widest defensible one. Four seats go out, Accuracy and Coverage for each of two areas. Of seven findings, verification drops one as a false positive and turns one into a filed bug with an annotated doc. After the edits, `npm run lint:docs` passes and every edited claim, link and command is checked, none executed. The first red-team pass finds the new text names an environment variable the code reads under another name; the fix is verified and the second pass comes back clean. One PR opens, with the gate line first and the sweep summary under it.

## How to invoke it

Ask for a documentation sweep, or run `/doctrine:doctrine-docs`. Naming the trees, the horizon and the landing up front answers every scope question, so the run asks nothing before it starts:

```text
use doctrine-docs: sweep README and docs/ against the code since v2.3.0, one PR
```

## Requirements

Nothing beyond the plugin has to be installed. Each of these has a fallback:

- `writing-clearly-and-concisely`, which this skill names for the editing pass and the red team's clarity method. Without it, Strunk's core rules inline.
- The codex plugin on Claude Code, or the Claude Code CLI on Codex CLI, for the red team from the other model family. Without it, a same-model subagent, named as such.
- superpowers and ponytail, which the doctrine uses for parallel dispatch and the simplification review. Without them, plain parallel seats and `/simplify` or a manual pass.

The full list is in [`docs/requirements.md`](../requirements.md). Watching seats run in panes needs herdr: see [Watching a run](../watching-a-run.md).

## Red flags

Signs a run went wrong:

- The report says claims were re-verified, but your repo's `vale`, `markdownlint` or docs build never ran.
- A documented command was executed to check it, and changed state.
- An annotation carries an issue number nobody filed, or was dropped because no number existed.
- Coverage seats went out before the horizon was a concrete ref.
- The red team got the diff alone, returned taste, reopened scope you settled, and still counted as the review.
- A PR was opened in a repo whose norm is a local commit or a patch.
- A correct "stale" claim was rewritten.
- CLAUDE.md or AGENTS.md changed with nothing flagging it.

The specification is [`skills/doctrine-docs/SKILL.md`](../../skills/doctrine-docs/SKILL.md). Where this page and it disagree, trust the specification.
