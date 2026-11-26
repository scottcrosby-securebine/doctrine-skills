# doctrine-code

Use it for general coding work done with the doctrine: building a feature, wiring modules, or implementing a spec or tickets, on the backend, the frontend or the UI. Parallel agents build the work, and a code review, and then a red team from another model family, stand between it and delivery.

![The doctrine-code shape: questions settle a requirements file and the test seams, the fixed point is pinned, wave agents build test-first in their own worktrees, and the phase gate runs simplification first, then native checks, matts-code-review and a red team, run twice at most by default.](doctrine-code.png)

The figure shows the order this page walks through: the questions, the build, then the gate, where simplification runs first in every pass.

## When to use it, and when not

Use it when the request is to build something. The boundary against the other wrappers is the shape of the request, not the language or the layer:

- Something is broken, throwing, failing or slow and you want it diagnosed: [doctrine-debug](doctrine-debug.md).
- You want defects found rather than a feature built: [doctrine-audit](doctrine-audit.md).
- The deliverable is web design judged on the rendered page: [doctrine-gauntlet](doctrine-gauntlet.md). doctrine-code does UI work too, but it judges it with a visual check against the running app, not a builder-and-critic loop against a reference.
- A documentation sweep: [doctrine-docs](doctrine-docs.md). A proposal, brief, PRD or report: [doctrine-write](doctrine-write.md).

The doctrine is not for a one-off question or a one-off edit to a single file nothing else reads.

doctrine-code is a wrapper. The [`doctrine`](doctrine.md) hub supplies the posture: phases and waves, the native checks, the red team, the loop and its alarms, simplification, delivery, and a fallback for every missing skill. This page covers what the wrapper adds: the build discipline, the designated review and its inputs, the red team's axes, and where the record lives.

## What it asks you first

The questions step is the hub's step 1, in one of two forms.

- **You have a spec or tickets.** The agent asks only what the spec leaves open.
- **You have no spec.** It runs `superpowers:brainstorming`, and that interview is the questions step, so you are not asked twice. Without superpowers, the agent interviews you itself.

Where Matt Pocock's `implement` skill is not installed, expect to be asked where the test seams go, unless your spec settles it. The seams are the points where tests are written first, and they are also the module contract: the exports that two agents in separate worktrees must agree on are fixed here, before any agent starts, because isolated agents cannot agree on a name while they run.

Your answers go into a requirements file before wave 1: the spec's own path, or a new file under `docs/`, `specs/` or `.scratch/`. Those three directories are where `matts-code-review` looks for a spec. With none there, its Spec reviewer skips and reports "no spec available", and the gate reviews the code against nothing you asked for. Reviews get the file as it stood at wave 1. A later ruling goes in the run record, never into this file.

The run record is a separate file. Where a `docs/PROJECT.md` tracks the phase, [doctrine-project](doctrine-project.md) says where the record goes. Otherwise it goes under `.doctrine/records/` in the repo root, and the agent adds the line `/.doctrine/records/` to the file that `git rev-parse --path-format=absolute --git-path info/exclude` prints, so no tracked file changes. It never goes under the three spec directories, where the review would read run state as the spec. The record opens with your request in your own words, verbatim, as the anchor every reviewer grades against.

## How the work runs

**Build.** The agent works per Matt Pocock's `implement` skill where it is installed, read from your host's skill directory. Where it is not installed, which the wrapper treats as the normal case, the build runs `tdd` at the agreed seams: typecheck regularly, single test files regularly, the full suite once at the end.

**Waves.** The plan is split into phases, and independent slices run as parallel waves. Each wave agent's prompt carries the seams it owns, test-first. Disjoint files are not enough isolation: two agents on separate component files that share one `.next` directory and one dev port both keep answering 200 while the second build overwrites the first. So each agent that writes code gets its own worktree, output directory and port, with dependencies hardlinked rather than symlinked. Where a seam imports a module another agent is writing, the agent gets that module's agreed exports as a stub, or its work waits for a later wave.

**Commits.** `implement` ends with review and then commit, and both belong to the orchestrator, the agent running the phase, not to a wave agent. A wave agent never commits on the branch the run ships from. In a shared tree it returns its diff uncommitted. In its own worktree it commits on that worktree's branch and hands the branch over. Everything a gate pass reads is committed before the pass opens: the integrated wave output, then every repair and simplification diff. `matts-code-review` reads `git diff <fixed-point>...HEAD`, so an uncommitted repair is invisible to it, and an empty diff fails it. The agent reads your repo's delivery norm before wave 1, since it decides which branch carries those commits.

## The phase gate

Each pass runs in this order:

1. **Simplification**: `/ponytail-review` where installed, otherwise `/simplify` or a manual YAGNI pass, finished and committed before the checks start, so its diff is inside what the pass certifies. A repair is simplified before the pass that re-checks it.
2. **Native checks**: every check your project documents as a gate, in its CLAUDE.md, AGENTS.md, README, review checklist or task runner, as they read at the fixed point. A check the change adds or tightens also runs and counts. Before any pass is clean, one complete path has also run end to end in the real environment, or the nearest one that runs the real code.
3. **`matts-code-review`**, the designated review, along two axes: Standards and Spec.
4. **The red team**, from the other model family.

By default the phase then runs one pass that reads only the repair, and stops there, clean or not. On the full gate the loop repeats until one pass comes clean.

### What the review needs

`matts-code-review` needs four things from the agent that nothing else in the flow supplies:

- **A pinned fixed point**: the SHA the phase started from, taken with `git rev-parse HEAD` before wave 1. Dispatched without one, the review stops to ask you for it, twice a phase, every phase. Pointed at `main` or the merge-base, it re-reviews phases already closed and files their findings again, which the hub counts as outstanding, so no pass can come clean.
- **A spec source**: the requirements file, by path. A spec that refers to issues by number also needs Matt's `docs/agents/issue-tracker.md`. Where that file is missing, the agent hands a path instead of a `#N`.
- **The standards as they read at the fixed point.** The review would otherwise read your standards files in the changed tree, so a diff that loosens a standard would be judged against the loosened one. The agent hands it each file as `git show <fixed point>:<path>` prints it, pasted or as a copy beside the record and outside the diff, and tells it to give its Standards sub-agent those in place of the paths.
- **The hub's finding split.** The Standards axis returns judgement calls, such as a rename or a "possible Feature Envy", beside breaches of a documented standard. A suggestion declined with a stated reason is non-blocking. A naming or wording note that changes neither what the code does nor what it is for is not a finding at all. If every note is treated as blocking, the phase grinds into the round alarm.

### What the red team attacks

On Claude Code the red team is Codex, run through the codex plugin's `codex:codex-rescue` subagent. On Codex CLI it is Claude, run through the Claude Code CLI. It must answer on five axes:

- a break in a contract or seam agreed before wave 1;
- an agreed seam with no test;
- behaviour that differs from the requirements file as it stood at wave 1;
- anything that duplicates a module or component already in the tree, which the review cannot see because it reads only the diff;
- a breach of your project's documented law.

It also gets the requirements file as it stood at wave 1, the same fixed-point standards the review gets, the path of the installed `matts-code-review` SKILL.md for its list of code smells, and the test-first standard the wave agents worked to, which it grades against and never runs. A smell blocks only where the hub's blocking test holds on its own. Where that SKILL.md is not installed, the red team works from your documented standards alone, and the report says so. The agent requires its return to separate blocking from non-blocking findings and to list what it attacked and could not break, and a return without that list counts as a failed review. The agent verifies every finding from source before acting on it.

## UI work

UI work runs the same flow, plus a block that goes into every wave agent's prompt, because the agent that styles the component is the one who must follow it:

- Reuse the project's existing color patterns, component library and layout conventions.
- Grep for a sibling component before styling anything new, and return the grep with the work.
- Verify visually against the running app, with the `run` skill or browser tools, before claiming done. Tests alone do not prove UI.

A wave agent cannot call the `run` skill by name, so the agent running the phase writes your project's actual launch command into the prompt instead. Where your project cannot run authenticated UI locally, the visual check is deferred to integration, each wave agent's prompt says so, and it runs once, by the agent running the phase, against your documented post-deploy check, since several agents checking one deployed site is the shared-environment failure the hub forbids.

On UI work the red team also gets the reuse rule, every wave agent's grep, and the renders or visual-check output.

## How it ends

The exit is the hub's. By default that is the standard gate: one pass of the full gate, the repairs, and one pass that reads only the repair. A clean pass on one identified revision, with nothing blocking left open and the real-environment run on record, is the exit. If the second pass is not clean the phase stops and puts what is left to you, and you ship with it or choose the full gate. On the full gate the loop repeats until one pass comes clean, and two alarms stop it and put a diagnosis to you: the round alarm, at every fourth round that found a blocking finding, and the time alarm, at two hours without a round closing. Your request can set other figures for both. Only a ruling you give after an alarm fires restarts the loop.

The hub's reduced gate is open to this wrapper. The agent checks how far the change reaches and proposes a gate. Only your choice puts a phase on the reduced one. That gate runs the native checks, the real-environment run and one red-team review. A blocking finding from the review is repaired and the review re-run on the repair, and a blocking finding from that re-run moves the phase to the standard gate. It has no loop, no designated review and no alarms.

A phase ends in one of five states: Exited, the only clean one; Stopped, when you end the loop; Shipped at an escalation, when you choose to deliver from an alarm or from the standard gate's stop; Blocked, when the session ends with a question about direction, one only you can answer, still open; and Unable, when the run cannot resume by itself.

Delivery follows your repo's norm: commit, then push and open a PR only where that norm or you say to. Where no norm is documented, the agent commits locally and asks. The report opens with one line: whether the shipping revision is certified, which blocking findings are open, the difference between the certified and shipping revisions where they differ, and any punch list.

## How to invoke it

Name the skill:

```text
use doctrine-code to implement docs/specs/csv-export.md; the work lands as a PR
```

Naming the spec path gives the questions step its source and the review its Spec axis. Naming the delivery norm saves a question where your repo documents none.

## Requirements

The wrapper runs with none of these installed. Each external skill has a fallback, and the record names any substitution. [requirements.md](../requirements.md) has the install commands.

- **Matt Pocock's `implement`**: without it, `tdd` at the agreed seams, as above.
- **Matt's `tdd`**: without it, an inline red-green-refactor.
- **`matts-code-review`**: Matt's `code-review`, which you copy in under that name yourself, since the plugin does not bundle it. Without it, `/code-review`, or two parallel subagents, Standards and Spec, handed the fixed point, the spec, the diff command and the standards sources.
- **superpowers**: brainstorming, parallel dispatch and worktrees. Without it, the agent interviews you itself, dispatches parallel agents directly, and uses `git worktree add`.
- **The codex plugin**: the red team from the other model family. Without it, a fresh-context subagent prompted to refute the work, which the report names as same-model.
- **The Claude Code CLI**, on a Codex CLI host: the red team from the other model family there. Without it, the same-model substitute.
- **ponytail**: without it, `/simplify` or a manual YAGNI pass.
- **herdr**: optional, for watching each agent in its own pane. See [watching a run](../watching-a-run.md).

## Red flags

If you see one of these in a run, it has drifted from the flow:

- Two wave agents on disjoint files but one `.next` and one port, and a screenshot offered as proof that shows the other agent's build.
- A component styled from scratch because the reuse rule never reached the wave agent's prompt.
- `matts-code-review` dispatched with no fixed point: it stops to ask you, or takes `main` and re-files findings from closed phases.
- Requirements from a brainstorm that live only in the conversation, and a Spec axis reporting "no spec available" while the gate reads clean.
- A naming suggestion treated as blocking, so no pass comes clean.
- `tdd` started at seams nobody agreed, each agent guessing differently.
- UI declared done on green tests, with nothing rendered.
- A push, or a PR opened, with no repo norm and no instruction from you saying to.

The specification is [`skills/doctrine-code/SKILL.md`](../../skills/doctrine-code/SKILL.md). Trust it over this page wherever the two disagree.
