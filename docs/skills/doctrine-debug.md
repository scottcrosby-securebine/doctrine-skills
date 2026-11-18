# doctrine-debug

Diagnose and fix one reported defect under the doctrine. The run builds a command that fails on the bug, tests hypotheses in parallel against it, red-teams the diagnosis before any fix is written, and then gates the fix.

![doctrine-debug in two phases. Diagnosis: ask, build the feedback loop, a wave of isolated probes with one hypothesis each, a new list when all die, then a red team on the root-cause claim. Fix: regression test first, minimal fix, simplification, then the gate of loop, project checks, matts-code-review and red team, repeated until one pass comes clean, then delivery.](doctrine-debug.png)

## When it fires

Use it when something is broken, throwing, failing or slow and you want it diagnosed and fixed with the doctrine. It is a wrapper: it loads the [`doctrine`](doctrine.md) hub, which supplies the posture (the anchor, the gate, the red team, the alarms and delivery), and adds the shape of a debugging run.

Pick another skill when the work is not one known defect. A hunt for bugs you have not seen yet is [`doctrine-audit`](doctrine-audit.md). A feature, spec or ticket is [`doctrine-code`](doctrine-code.md). A documentation sweep is [`doctrine-docs`](doctrine-docs.md), and a proposal, brief or report is [`doctrine-write`](doctrine-write.md). The hub is not meant for a one-off question or a one-off edit to a single file nothing else reads.

## What it asks you

It starts with the open questions about the bug: how to reproduce it, when it last worked, and the environment it fails in. Your answers go into the run's record verbatim as the anchor, and every reviewer gets them, so the fix is judged against what you said was wrong.

Two other things are yours to set. If the bug lives on a host the agent must log into (a router, a switch, a console, a box over SSH), say whether you want a [`doctrine-pane`](doctrine-pane.md) session to watch and take over. The agent opens one only if you ask. Otherwise it runs the commands non-interactively and the report says a pane would have shown more. You can also set the two alarm figures. One is how many review rounds may find a blocking problem before the run stops and asks you, which it does again at each multiple of that figure. The other is a time budget, counted from when the last round closed, or from the start of the phase before any has. Without them the hub's defaults apply, 4 rounds and two hours. Only a ruling you give after an alarm fires restarts the run.

## How a run goes

The core discipline is Matt Pocock's `diagnosing-bugs` skill, followed phase by phase. This wrapper splits it into two doctrine phases: the diagnosis, from building the loop through testing hypotheses, and the fix.

### Phase one: the diagnosis

**Build the feedback loop.** The wrapper tells the agent to spend disproportionate effort here. The loop is done only when the agent can name one command, already run, that goes red on this bug. Without a local way to reproduce it (no local database, a UI behind a login), the agent uses your project's documented CI or production-probe paths, or stops and asks you. It does not guess at causes without a loop.

**Test hypotheses as a wave.** When more than one cause is live, the agent sends one probe per hypothesis, in parallel. Each probe's prompt carries the loop command, the output already in hand, the symptom, the one hypothesis it owns, and its isolation, with read-only stated in the prompt itself. A probe handed only "test hypothesis 3" reads code and calls that evidence, which is why the command goes in every prompt. Hypotheses die on evidence from the loop. If all of them die, the agent builds a new list from what it learned rather than reusing the old one.

**Count the waves that fail.** This phase runs no review gate, so the hub's round alarm would never fire here. The wrapper counts instead: one for every wave that ends without a confirmed root cause, whether every hypothesis died, a survivor could not be proved, or the evidence was inconclusive. The count is kept on disk. When it reaches a multiple of the rounds figure, the run stops and asks you whether to go on, with the diagnosis described under [How it ends](#how-it-ends) and this count where the round count would be. The hub's time alarm applies as written.

**Red-team the diagnosis before any fix.** The red team gets the symptom, the loop, the root-cause claim, the surviving probe's return, each killed hypothesis with its evidence, and Phase 1 of `diagnosing-bugs` as the standard for the loop. It is asked to refute the claim on two points: does the loop reproduce the symptom you reported, not a neighbouring one, and did every rival hypothesis die on evidence from the loop rather than on code-reading. The agent checks each counter-claim against source.

The diagnosis phase ends when the claim survives that red team and the agent's own trace through the source. The agent then writes the claim down where the fix will land, in one paragraph: the symptom, the loop command, the root cause and the source evidence. That paragraph is the phase's deliverable, the point a later session resumes from, and the spec the fix's review reads.

### Phase two: the fix

**Test first, then the smallest fix.** Per `diagnosing-bugs` Phase 5, the agent writes a regression test that fails, then the minimal change that makes it pass.

**Simplify before the gate.** A simplification review of the fix runs and is committed before the gate's checks start, and again on each repair before the pass that re-checks it. The wrapper's rule of thumb: a bug fix that adds a new abstraction is usually the wrong fix.

**Gate the fix.** By default each pass runs four checks: the loop (which must be green), the project's own documented checks, `matts-code-review` on the fix diff, and a red team on the diff. A pass is clean when it finds no blocking problem, none stands open from an earlier pass, and one complete path has run end to end on the real code for that revision, where the work ships or the nearest place that runs the real code. A unit-test fake does not count, and where no such place is reachable the run is recorded as not run and the pass is not called clean. The phase exits on one clean pass.

A pass that finds a blocking problem leads to a repair and another pass, aimed at the repair first. For each blocking problem the agent also asks where else the same fault would show, repairs every such site it may touch, and reports the sites outside its scope rather than fixing or dropping them silently. For an intermittent bug, green means the full stress run clean, sized against the reproduction rate Phase 1 measured, never one lucky run.

The fix's red team also gets the written root-cause claim, that reproduction rate (or word that the loop is deterministic), and your project's standards as they read before the fix. It answers three questions: does the regression test fail without the fix, is the fix minimal, and do other callers carry the same fault.

You can choose a lighter gate for the fix. The agent searches for what reads or calls the code the fix changes, proposes a gate with that evidence, and you choose: the full gate above, or a reduced one of the project's checks and one adversarial review by a context that did not write the fix, repeated on any repair. No answer means the full gate, and if a re-run of that review finds another blocking problem, the phase moves to the full gate. The end-to-end run is required either way.

Every reviewer works under the same limits. It changes nothing it reviews, and a reviewer that did would void the pass. It gets the questions you have closed and the claims already refuted, so it does not reopen them, and it never sees the run's counters. It loads no doctrine skill. A reviewer that reports "no findings" without listing what it attacked has failed, and no pass counts clean on it.

### How the review is pointed

The agent gives `matts-code-review` three things so it reviews the fix and nothing else:

- **The fixed point.** The agent reads `git rev-parse HEAD` before writing the regression test and passes that commit. Sent without one, the review stops to ask you for it, twice a phase. Given `main` or the merge-base, it re-files findings from work already merged, and the gate counts them against the current pass.
- **A spec.** The bug's tracker issue, or the root-cause paragraph. Without one, its Spec reviewer skips with "no spec available" and the review covers one axis of two. An issue reference resolves only where `docs/agents/issue-tracker.md` exists, so otherwise the agent passes a file path.
- **The standards as they were.** Each standards file as it read at the fixed point, from `git show <sha>:<path>` or a worktree kept at that commit until the review returns. If the review read the standards from the changed tree, a fix that loosened a standard would be judged by the loosened version.

## How it ends

Delivery follows your repository's norm, a commit or a pull request. The report opens with one line saying whether the shipping revision passed the gate clean and what is still open, for example:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
```

Below that line the report names what filled each slot of the gate, lists the improvements it deferred, gives the path of the run's record (kept beside the work, outside version control), and walks your original request item by item, saying where each landed or why it was deferred.

Each phase ends in one of the hub's five states: Exited (certified, the only clean ending), Stopped (you ended it), Shipped at an escalation (you chose to deliver when an alarm stopped it), Blocked (a question to you is unanswered), or Unable (it cannot resume by itself, for example because credentials are gone).

A run that an alarm stops asks you whether to continue or ship, with a diagnosis in three parts: what shipping now would mean and what continuing would cost, why the loop has not closed, and whether its exit can be reached at all. Where the gate has stopped telling good work from bad, the diagnosis proposes a narrower definition of a blocking problem for you to rule on.

## How to invoke it

Say what fails and what you know about when it broke. Those are the first questions it would ask.

```text
use doctrine-debug: `npm run export -- --since=2026-09-01` throws `TypeError: Cannot read properties of undefined` since last week, passed on the 3rd, same trace in CI. Diagnose and fix it.
```

## Requirements

Nothing must be installed. Each dependency has a fallback:

- Matt Pocock's `diagnosing-bugs`: the core discipline. Without it, the agent works inline: reproduce first, regression test before the fix.
- `matts-code-review`: the review on the fix. You install it yourself as a renamed copy of Matt Pocock's `code-review`. Without it, `/code-review` or two parallel reviewers, one for standards and one for the spec.
- A red team from the other model family: on Claude Code, the `codex:codex-rescue` subagent from OpenAI's codex plugin. Without it, a fresh-context subagent of the same model, and the report says so.
- superpowers, for the parallel probe wave. Without it, parallel subagents, each with its prompt written out in full.
- ponytail, for the simplification review. Without it, `/simplify` or a manual pass that deletes what nobody asked for.
- `doctrine-pane` and [herdr](https://herdr.dev) 0.8.2 or later, only for a pane you asked for. Without them the agent runs the commands non-interactively and records the interactive step as not run.

Every substitution is written in the record and named in the exit statement. Install commands are in [requirements](../requirements.md).

Optionally, run it inside herdr and every probe and reviewer gets a live pane you can read while it works: [watching a run](../watching-a-run.md).

## Red flags

If you see one of these, the run has left its own rules:

- A fix appears before the loop has gone red on this bug.
- A root cause is accepted because the red team agreed, with no trace through the source behind it.
- An intermittent bug is declared fixed after one green run.
- Probes go out with "test hypothesis N" and no command to run.
- Hypothesis waves keep failing, nobody counts them, and you are never asked whether to go on.
- `matts-code-review` runs against `main` and re-files findings from work that shipped long ago.

The specification is [`skills/doctrine-debug/SKILL.md`](../../skills/doctrine-debug/SKILL.md). Where this page and it disagree, trust the specification.
