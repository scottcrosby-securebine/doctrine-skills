# doctrine-code

The coding wrapper: it takes a feature, a spec or a set of tickets and runs the build through the doctrine's phases, waves and gate, with a code review and an adversary that did not write the code standing between the work and delivery.

![A build split into phases, each phase fanning out into parallel wave seats in their own worktrees, then closing through native checks, a code review pinned to the phase's starting commit, a red team, and a simplification pass before one clean pass certifies it.](doctrine-code.png)

The figure shows the shape of one phase: the requirements file at the top, the wave seats under it, and the gate they all funnel into.

## When to use it, and when not

Use it when you want general coding work done with the doctrine: backend, frontend or UI, building features, wiring modules, implementing a spec or tickets, with parallel agents, red-teaming and looping. The README's table puts it as "Features, specs and tickets."

The boundary against the other wrappers is the shape of the request, not the language or the layer:

- Something is broken, throwing, failing or slow and you want it diagnosed: [doctrine-debug](doctrine-debug.md).
- You want defects found rather than a feature built: [doctrine-audit](doctrine-audit.md).
- The deliverable is a rendered page judged by how it looks: [doctrine-gauntlet](doctrine-gauntlet.md). doctrine-code does cover UI work, but it judges it by a visual check against the running app, not by a builder-and-critic loop against a reference.
- A documentation sweep: [doctrine-docs](doctrine-docs.md). A proposal, brief, PRD or report: [doctrine-write](doctrine-write.md).

If the work is a one-off question or a single-file edit, the hub says not to use the doctrine at all.

## What it asks you first

Doctrine step 1 runs before any work is aimed, and this wrapper shapes it in one of two ways.

With a spec or tickets, the agent asks only the questions the spec leaves open. It does not re-ask what the spec already settles.

With no spec, it runs `superpowers:brainstorming`, and that interview is the questions step. You are not interviewed twice. Without superpowers installed, the agent interviews you itself.

Either way, when Matt Pocock's `implement` skill is not installed, which the wrapper calls the default rather than an edge case, the build runs `tdd` at test seams you name and agree before wave 1. The wrapper adds those seams to the questions of step 1 because nothing else in the flow produces them, so unless your spec already settles them, expect to be asked where the tests go.

The settled answers are written to a file before wave 1: the spec's own path, or a new file under your project's `docs/`, `specs/` or `.scratch/`. Those three directories are where `matts-code-review` looks for a spec. A brainstorm whose requirements stay in the conversation leaves the review's Spec axis with nothing to check the code against, and it reports "no spec available" while the gate reads clean on one axis of two. The sources list the categories of question, not the questions themselves; what you are asked depends on what your spec leaves open.

## How the work runs

The wrapper maps its flow onto the hub's steps like this.

**Requirements** (doctrine step 1): the questions above, the answers written to disk, and the anchor, your own words for what the work is for, recorded verbatim for every reviewer.

**Build discipline**: the agent executes per Matt Pocock's `implement` skill where it is installed, and otherwise per the inline fallback: `tdd` at the agreed seams, then typecheck regularly, single test files regularly, the full suite once at the end, review at the end. The seams go into each wave agent's prompt, since the wave agent is the one writing the tests. `implement` ends with review and commit, and those two lines belong to the orchestrator, not the wave agent: a wave agent never commits on the branch the run ships from. In a shared tree it returns its diff uncommitted; in its own worktree it commits on that worktree's branch and hands it over.

**Phases and waves** (doctrine step 2): the plan is split into phases, and independent slices run as parallel waves under the hub's isolation rule. Disjoint files are the floor, not the bar. Two agents on separate component files sharing one `.next` directory and one dev port both keep answering 200 while the second build overwrites the first, so each mutating seat gets its own worktree, output directory and port, with dependencies hardlinked rather than symlinked.

**Phase exit** (doctrine steps 3 to 6): native checks, then `matts-code-review`, then the red team, then the simplification review, then the loop to the hub's exit condition. Work the agent shows to have small reach takes the hub's smaller gate instead, native checks and the red team with any blocking finding repaired and re-reviewed, and the record says it was judged small. The next section says what fills each of those slots.

**Delivery** (doctrine step 7): commit, then push and open a PR only where your repo's norm says to or you have said to. Where nothing documents a norm, the agent commits locally and asks. The agent reads that norm before wave 1, not after the commits exist, because what a gate pass reads must already be committed on the branch it reviews.

For UI work the same flow runs, plus a block that goes into every wave agent's prompt: reuse the project's existing color patterns, component library and layout conventions; grep for a sibling component before styling anything new and return the grep; verify visually against the running app before claiming done, since tests alone do not prove UI. The visual check names the `run` skill, and a skill name resolves to nothing inside a seat, so the orchestrator puts the project's actual launch command into the prompt. Where the project cannot run authenticated UI locally, the visual check is deferred to integration and run once, by the orchestrator, against the documented post-deploy path. The sources do not say where the `run` skill comes from.

## What the gate is for this shape

The hub leaves four slots to the wrapper, and this is what doctrine-code puts in them.

**Core discipline.** Matt Pocock's `implement`, read from `~/.claude/skills/implement/SKILL.md` when present. Without it, the inline fallback above.

**Designated review.** `matts-code-review`, inside the phase gate, with three inputs the wrapper is responsible for because nothing else supplies them:

1. A fixed point: the SHA the phase started from, taken with `git rev-parse HEAD` before wave 1. Dispatched bare, the review stops and asks you for one, twice a phase, every phase. Pointed at `main` or the merge-base, it re-reviews every phase already closed and re-files their findings, which the hub counts as outstanding, so no pass can come clean.
2. A spec source: the requirements file from step 1, by path. Specs that reference issues by number need Matt's `docs/agents/issue-tracker.md`; where that is missing the agent hands a path rather than a `#N`.
3. The hub's finding split. The review's Standards axis returns labelled judgement calls, a rename suggestion or a "possible Feature Envy", on top of documented-standard breaches. Each is graded by the hub's test: a suggestion declined with a stated reason is non-blocking, and a naming or wording note that changes neither what the code does nor what it is for is not a finding at all. Treating them all as blocking grinds the phase into the round alarm.

The review reads `git diff <fixed-point>...HEAD`. An empty diff fails it, and an uncommitted repair is invisible to it, which is why every repair and simplification diff is committed before a pass opens.

**Red team.** The hub's: `codex:codex-rescue` through the Agent tool, handed the diff, the anchor, the blocking definition and the closed questions, and required to separate blocking from non-blocking and list what it attacked and could not break. Every finding is verified from source before it is acted on. The wrapper names no axes of its own, so the red team's axes are drawn from the anchor.

**Simplification.** `/ponytail-review` where installed, otherwise `/simplify` or a YAGNI pass, run before the pass expected to certify the shipping revision so its diff is inside what that pass certifies.

**The record.** The wrapper is silent on where it lives, so the hub's default applies: beside the work in the target repo, excluded from version control and from every reviewer's diff and search, its path named in the report. The requirements file is handed to reviewers by path, so run state goes in a separate file.

**Exit.** The hub's, unchanged: one clean pass of the full gate on one identified revision (or of the smaller gate, for work shown to have small reach), no blocking finding open from any earlier pass, and the real-environment run on record. The round alarm fires at every multiple of 4 rounds that found a blocker, and the time alarm at two hours without a round closing, unless your anchor sets other figures. A phase ends in one of five states, and only Exited is clean.

Where a dependency is missing, the slot is filled from the hub's Fallbacks table, the substitution is recorded, and the exit statement names it. The Requirements section below lists each one.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one. The feature, the SHAs and the counts are invented.

You have a spec for a CSV export: a new endpoint that writes the current filtered list, and a button that calls it. You type `use doctrine-code on docs/specs/csv-export.md`.

The agent reads the spec and asks two things it leaves open: whether the export should honour the list's active filter, and where the test seams are. You say yes to the filter and agree two seams, the serializer and the HTTP handler. It writes both answers to `.scratch/csv-export-requirements.md`, opens the record beside it, records your request verbatim as the anchor, and reads your CLAUDE.md, which says work lands as a PR. It pins the fixed point: `git rev-parse HEAD` returns `7c1d2e9`.

Wave 1 is two seats, one for the endpoint and one for the button, each in its own worktree on its own port, each prompt carrying its seam and the UI reuse block with your dev server command in place of the `run` skill. Each returns a diff and its test output, and the button seat returns the grep it ran for a sibling export button. The agent applies both diffs to the phase branch, commits, and re-runs the checks itself.

Round 1 opens on that revision. Native checks: the lint, typecheck and test commands your CLAUDE.md names, all green. The real-environment run: the dev server up, the endpoint hit over the wire, the file opened and read. `matts-code-review`, fixed point `7c1d2e9`, spec path passed, returns two things: a rename suggestion on the serializer, declined with a reason and graded non-blocking, and a Spec finding that the export ignores the active filter, blocking. The red team, `codex:codex-rescue`, returns one blocking finding of its own, that the handler returns 200 with an empty body when the list is empty, verified from source, and lists three attacks that did not land. Round 1 closes with 2 blockers.

The class question on the filter finding turns up one other handler that reads the same list without the filter. It is inside the scope you allowed, so the fix goes into the shared query both call. The repairs are committed. `/ponytail-review` runs and deletes a speculative delimiter option nobody asked for, and that diff is committed too. The revision is now `3f8a1c2`.

Round 2 runs the full gate on `3f8a1c2`, the repair diff handed to each seat beside the full one. Native checks green, the real run on record, the review clean with the rename still declined, the red team with no blocking finding and its attack list attached. The pass is clean and the phase is Exited.

The report opens with the gate line:

```text
Gate: clean pass on 3f8a1c2, real run on record. No blockers open.
```

Under it: what filled each slot (native checks, the three commands; designated review, `matts-code-review`; red team, `codex:codex-rescue`; simplification, `/ponytail-review`), no substitutions, the deferred list with the one rename, the record's path, and the original request walked item by item: endpoint landed, filter landed, button landed. Then delivery per your norm: commit, push, PR opened.

Had round 4 closed with a blocker still open, the round alarm would have stopped the loop and put a diagnosis to you instead, and had you chosen to ship from there, the line would take the README's other form:

```text
Gate: shipped at an escalation, round 4, zero clean passes. Open: 1 blocking finding.
```

## How to invoke it

The trigger is the description's: general coding work (backend, frontend, or UI) done with the doctrine. Naming the skill is the surest way to fire it.

A sample prompt:

```text
use doctrine-code to implement docs/specs/csv-export.md; the work lands as a PR
```

Naming the spec path gives step 1 its source and the review its Spec axis. Naming the delivery norm saves a question where your repo documents none.

## Requirements

Nothing here needs to be installed for the wrapper to run. Each external skill it names has a fallback, and the run records which one it used. [docs/requirements.md](../requirements.md) has the install commands.

- **Matt Pocock's `implement`**: read from `~/.claude/skills/implement/SKILL.md` if present. Without it, the inline fallback: `tdd` at agreed seams, typecheck and single test files regularly, full suite once at the end.
- **Matt's `tdd`**: without it, inline red-green-refactor.
- **`matts-code-review`**: your own renamed copy of Matt's `code-review`, which the plugin does not bundle. Without it, `/code-review`, or two parallel subagents, Standards and Spec, handed the fixed point, the spec, the diff command and the repo's standards sources.
- **superpowers**: for brainstorming, parallel dispatch and worktrees. Without it, the agent interviews you itself, dispatches parallel Agent tool calls, and uses `git worktree add`.
- **codex plugin**: the different-model red team. Without it, a fresh-context subagent prompted to refute the work, and the report names it as same-model.
- **ponytail**: without it, `/simplify` or a manual YAGNI pass.
- **session-memory**: for handoffs. Without it, the agent writes the handoff itself.
- **herdr**: optional, for watching the seats in panes. See [watching a run](../watching-a-run.md).

## Red flags

These are the wrapper's own, in reader terms. If you see one in a run, the run has drifted from the flow.

- Two wave agents on disjoint files but one `.next` and one port, and a screenshot offered as proof that shows the other agent's build.
- A component styled from scratch because the reuse rule stayed in the skill file and never entered the wave agent's prompt.
- `matts-code-review` dispatched with no fixed point: it stops mid-phase to ask you, or it takes `main` and re-files findings from phases that closed last week.
- Requirements from a brainstorm that live only in the conversation, with the Spec axis reporting "no spec available" while the gate reads clean.
- A naming suggestion treated as blocking, so no pass comes clean and the phase grinds to the round alarm.
- `tdd` started at seams nobody agreed, each agent's guess different.
- UI declared done on green tests with nothing rendered.
- A push, or a PR opened, with no repo norm and no instruction from you saying to.

The specification is [`skills/doctrine-code/SKILL.md`](../../skills/doctrine-code/SKILL.md); trust it over this page wherever the two disagree.
