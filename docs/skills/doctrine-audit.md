# doctrine-audit

A bug hunt or deep code audit under the doctrine. Parallel finders sweep an area of your codebase, every finding is confirmed against source before it counts, a red team attacks the confirmed list, and the run either fixes what it confirmed or hands you a report, whichever you chose. The hunt stops after two rounds in a row find nothing new.

![Scope questions feed five parallel finder lenses into one confirmed list on disk; from that list a red team refutes and extends, fix phases run highest severity first under the hub's gate, the rest is filed, and fresh rounds loop back until two come back dry, then the report goes through its own gate. The Dry? box sends the run back to fresh lenses until two rounds confirm nothing new.](doctrine-audit.png)

The figure reads top to bottom. The top row finds and verifies: your scope answers go to five finder lenses, and their findings, once confirmed, land in one list. The bottom row reads that list: the red team, the fix phases, the filing, and the dry-round test. The report closes the run and passes a gate of its own.

## When to use it

Use it when you suspect a region of the codebase and want it swept for drift, feature gaps, logic issues, over-engineering and bugs. You start from a scope, not a symptom.

Use a neighbouring skill when the job is different:

- Something is already broken, throwing, failing or slow: `doctrine-debug`, which starts from the symptom.
- A feature or a spec to build: `doctrine-code`.
- A sweep that brings all your documentation up to date: `doctrine-docs`. The audit has a drift lens that finds where docs or config disagree with code, but a documentation sweep is a different job with a different gate.

It is not for a one-off question or a one-off edit to a single file nothing else reads. A one-file scope is fine for a first audit.

It is a wrapper. It loads the hub, [`doctrine`](doctrine.md), and adds only the shape of an audit. The hub supplies the posture: the anchor, the gate every phase passes, the red team's rules, the alarms and the delivery line. This page says what the audit adds.

## What it asks you first

Before any finder goes out, it asks whatever your request left open about:

- **Target area**: what it sweeps.
- **Fix-as-we-go or report-first**: whether it fixes confirmed issues or only reports them.
- **Read-only or not**: whether it may write anything to the repo, the working tree included.
- **The filing line**: the severity or effort above which an issue is filed on your tracker instead of fixed.

Report-first and read-only are separate questions, and it asks both. Report-first means do not fix. Read-only means do not write. If you say "report only, don't touch the repo", you have answered both, and it must not commit a report file into that repo. Under read-only, or where it has no write authority, it builds the report in its scratch space and hands it to you.

These are direction questions under the hub's rule. An open one blocks the run until you answer, even where every answer would satisfy your request, because your answers decide what the audit changes and what it delivers. It never runs on the narrower reading instead.

Your answers are written to disk before the first wave, in the same file as the confirmed list. The rulings that bind a seat's conduct (scope, report-first, read-only) go into every finder, fixer and reviewer prompt, so even a finder knows when the tree is read-only.

## How the run goes

**Find.** Finder waves go out in parallel, one lens per seat:

- simplicity: over-engineering and dead code
- logic and correctness
- drift: docs and config against code
- feature gaps
- security-sensitive paths

The simplicity lens applies ponytail's `/ponytail-audit` posture, scoped to your target area and not the whole repo. Without ponytail, it gets the hub's substitute, a read that reports and changes nothing. Every finding needs `file:line` evidence, and duplicates across waves are merged.

**Verify.** A finding counts only once it is confirmed from source. Hunt-style findings have a high false-positive rate, and a finding nobody traced to a line is noise. Items that stay only plausible are never fixed. They go to the report's appendix, or to a tracker issue marked unverified.

Confirmed findings are written to a file as they are verified: the report's own path if you settled one, otherwise a run-state file beside the work or in scratch space, named in the report. Each line holds an id, `file:line`, severity, the evidence that confirmed it, and a state: confirmed, red-teamed, fixed, filed or declined. A second file beside it, read only by the orchestrating agent, holds the counters, including the dry-round count. Both live on disk because a long audit outlasts the agent's working memory, which is summarised and cleared between rounds. A list kept only in memory comes back empty: round 3 re-files what round 1 fixed, and the dry count silently restarts at zero.

**Red team.** The confirmed list goes to the red team to refute and to extend. It also gets every finder's raw output, plausible and rejected items included, each with the reason verify set it aside, since a real defect dismissed at verify shows up nowhere else. It never sees the counters. Its extend half covers the five lenses by name, and for simplicity it gets the same ponytail posture or substitute the finder had. Anything it adds is verified the same way before it counts.

**Fix or file.** In fix-as-we-go mode, confirmed issues are fixed in phases, highest severity first, each phase under the hub's gate. Anything with a non-obvious root cause goes through Matt Pocock's `diagnosing-bugs`. Everything above your filing line is filed on the tracker your project's AGENTS.md or CLAUDE.md names.

In report-first mode no fix touches the repo and no fix phase opens, but filing still runs, because filing writes to a tracker and fixes nothing. Every confirmed issue is filed. If the tracker lives inside the repo and you ruled read-only, filing there is a repo write, so those items go in the report as unfiled, said plainly.

If there is no tracker to file on (none named, its CLI such as `gh` not signed in, or you never said where issues go), it checks your project's conventions and asks you if they say nothing. Failing that, it carries the full list in the report and states that nothing was filed. It never invents an issue number and never drops a finding for having nowhere to go.

Larger architectural refactors found along the way are not rewritten mid-audit. They go through Matt Pocock's `improve-codebase-architecture` where it is installed, or are filed as issues.

**Loop until dry.** Find and verify repeat with fresh lenses until two rounds in a row confirm no new issue. Findings from a later round open new fix phases, or new report entries in report-first mode. They never reopen closed phases. If it runs out of meaningful lenses before two dry rounds, it says so and stops rather than inventing lenses to reach the count.

"Nothing new" is the test for this outer loop only. Inside each fix phase the hub's gate applies as written, and a pass is clean only when nothing is outstanding, old or new.

## The gates

**Each fix phase** passes the hub's gate: your project's documented checks, a designated review, and a red team, looping until one pass comes clean. Before a phase, the hub has the agent search what the change reaches and propose a gate. Only you can put a phase on the hub's reduced gate, which drops the loop, the designated review and the alarms, and with no answer the phase runs the full gate. The hub's two alarms bound every phase: the round alarm, every fourth round that found a blocking finding unless you set another figure, and the time alarm, two hours unless you set another budget. Either alarm stops the loop and puts a diagnosis to you for a ruling. The hub's simplification review runs inside each phase, before the pass that certifies it.

The designated review for fix phases is `matts-code-review`. The audit points it with three things, each of which prevents a failure:

- **A fixed point**: the SHA the fix phase started from, taken with `git rev-parse HEAD` before the phase's first edit. Never `main` and never the merge-base. With no fixed point the review stops and asks you, twice a phase, every phase. With a branch ref it re-reviews fix phases that already closed and re-files their findings, which the gate counts as outstanding, so no pass can come clean.
- **A spec source**: the confirmed-list entries this phase fixes, or the tracker issues filed for them. Without one, the review's Spec half skips and it reviews on one axis of two. Issue references resolve only where Matt's `docs/agents/issue-tracker.md` exists. Otherwise it passes the file path.
- **What the work rests on**, handed to the review and to each fix phase's red team alike:
  - your standards sources as they read at the fixed point, so a diff that loosens a standard is not judged against its own loosening
  - the `diagnosing-bugs` evidence behind each non-obvious root cause the phase fixes, so the fix is not judged against the symptom
  - for a refactor run through `improve-codebase-architecture`, that skill's SKILL.md, or word that its fallback was taken and the refactor filed instead

**The report** is a deliverable in both modes, so it gets a phase of its own, after the last fix phase in fix-as-we-go mode. That phase runs under the hub's prose-deliverable exit: one clean pass by default. If no pass has come clean when the round alarm first fires, one closing round runs, scoped to what changed since the last fully reviewed revision (or to the whole report if no revision was), and the report ships with a punch list of what was not fixed. Its gate has three parts:

- **Native checks**: every claim in the report re-verified against source, plus a path check.
- **The designated review**: a fresh-context review of the finished report against your words and the confirmed list. `matts-code-review` reviews code against standards and a spec, not a prose report.
- **The red team**: handed the finished report as well as the confirmed list.

The red team in every gate is the `codex:codex-rescue` seat, a model from a different family. Where the codex plugin is absent, a fresh-context subagent told to refute stands in, and the run names it as a same-model substitute. Its return must separate blocking from non-blocking findings and list what it attacked and could not break. "No findings" with no such list counts as a failed seat.

## How it ends

The run ends with your repo's delivery norm, a commit or a pull request, never with "the loop is clean". Under read-only it ends instead with the report handed to you, uncommitted. In report-first mode the report goes where your project keeps reports, and if there is no such place it asks you. The report, the confirmed list and anything filed are delivered together, and the report names what was left unfiled.

The report opens with one line saying whether the shipping revision is certified and which blocking findings are still open. The README shows two of its forms:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
Gate: shipped at an escalation, round 6, zero clean passes. Open: 2 blocking findings.
```

Then it walks your request item by item, saying where each landed or why it was deferred, and lists the non-blocking improvements it found and deferred.

Each phase ends in one of the hub's five states, and only Exited is clean. Exited means a pass came clean. Stopped means you ended the loop. Shipped at an escalation means delivery after an alarm, or after the report's closing round, with a punch list. Blocked means a question put to you is still unanswered. Unable means the run cannot resume by itself, for example because write access went away.

## A worked example

This example is illustrative. It shows the shape of a run, not a recorded one.

You type `use doctrine-audit on src/importer.ts (scope is that file only)`. The target is settled, so it asks the rest: fix as you go or report first, read-only or not, and the filing line. You answer fix as you go, writes allowed, and file anything that needs a schema change. It writes your answers to disk and dispatches five finders, each prompt carrying the scope ruling.

The finders return findings with `file:line` evidence. Two are confirmed and one stays plausible:

```text
A1  src/importer.ts:88   high  duplicate header silently overwrites a field  confirmed
A2  src/importer.ts:140  low   dead branch, needs a schema change to remove   confirmed
```

The plausible item goes to the appendix. The red team refutes nothing and adds A3, a null path at line 61, which is traced and confirmed. A2 needs a schema change, which you ruled is filed, so it goes to your tracker. A fix phase opens on A1 and A3, its review pinned to the SHA it started from, and loops through the gate until a pass comes clean. Rounds 2 and 3 use fresh lenses and confirm nothing new, so the hunt is dry. The report then passes its own gate and ships with the commit.

## How to invoke it

Ask for a bug hunt or a deep code audit done with the doctrine, and name the area. The README suggests starting small:

```text
use doctrine-audit on src/whatever.ts (scope is that file only)
```

A fuller request answers most of the scope questions up front, leaving only the filing line to ask: `Run doctrine-audit on packages/billing, report-first, read-only. I want drift between the docs and the code, and anything that writes a price.`

## Requirements

Nothing has to be installed. Each external skill has a fallback, in the hub's fallback table or in this skill's own text:

- `matts-code-review`, your renamed copy of Matt Pocock's `code-review`. Without it: `/code-review`, or two parallel review subagents (Standards and Spec) given the same inputs.
- Matt Pocock's `diagnosing-bugs`. Without it: reproduce first, and write the regression test before the fix.
- Matt Pocock's `improve-codebase-architecture`. Without it: architectural refactors are filed as issues.
- ponytail, for the simplicity lens and the simplification review. Without it: a read that reports and changes nothing for the lens, and `/simplify` or a manual pass for the review.
- OpenAI's codex plugin, for the red team from a different model family. Without it: a fresh-context subagent told to refute.
- superpowers, for parallel dispatch and worktrees. Without it: parallel seat dispatches, each with its own assembled prompt.

Install commands and the full list are in [`docs/requirements.md`](../requirements.md). To watch the seats while they run, see [watching a run](../watching-a-run.md).

## Red flags

Signs a run has gone wrong:

- You said report-first, and the repo has changes beyond the report and what was filed.
- A report file was committed into a repo you said not to touch.
- The confirmed list never reached disk, so round 3 re-filed what round 1 fixed and every round looked productive.
- A compaction reset the dry-round count, so "two dry rounds" was one.
- The report cites an issue number that was never filed.
- A finding vanished because your project named no tracker.
- A plausible item was fixed as though it were confirmed.
- Lenses were invented to reach two dry rounds.
- `matts-code-review` was pointed at `main` and re-filed findings from fix phases that already closed.

The specification is [`skills/doctrine-audit/SKILL.md`](../../skills/doctrine-audit/SKILL.md). Where this page and the specification disagree, trust the specification.
