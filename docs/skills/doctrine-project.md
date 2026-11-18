# doctrine-project

Use it to give a repo one way to know when the whole project is done and when each epic is done, the same in every repo. The agent proposes, you rule, and only an exit pass by a context that did not build the work moves an epic or the project to Done.

![The doctrine-project shape: start or adopt runs an interview, puts every item through the admission test and ends with the owner's rulings and a clean format check; an epic then moves from Proposed to Not started on the owner's ruling, to Open with its first phase, and to Done only on an exit pass by a context that did not build it, counted by the accounting check.](doctrine-project.png)

The figure shows the two halves this page walks through: setting tracking up, in start or adopt mode, and the lifecycle every later phase in the repo follows.

## When to use it, and when not

The trigger is a request to start tracking a project, or to adopt an existing repo into uniform project and epic tracking, with the doctrine. You get a ruled end state, epic records whose Done means can be checked, exit passes by a context that did not build the work, and a cutover from whatever tracked the work before.

It does not build an epic. Each phase still runs under the wrapper that fits its shape, such as `doctrine-code` or `doctrine-write`. Once a repo carries `docs/PROJECT.md`, the hub's step 1 sends every phase there through this skill's lifecycle procedure, whichever wrapper runs it, so you invoke `doctrine-project` once and not per phase.

It is not for a one-off question, or a one-off edit to a single file nothing else reads, which the hub says needs no doctrine. A project file or an epic record is read by every later phase, so an edit to one is not that case.

## The two modes

**Start**, for a repo with no project file. The agent interviews you, then proposes, all in the `Proposed` state: the end-state items, a "never becomes" list of what the project is not, the first epic with its Done means, and the coverage map. It drafts the never-becomes entries itself, and you strike the wrong ones or add your own, each strike or addition recorded as a `scope` ruling. You rule on all of it before the first phase opens.

**Adopt**, for a repo that already tracks work some other way. Adoption looks forward, not back:

1. The agent inventories every tracking surface: goals, plans, PRDs, markdown trackers and work-item trackers. A GitHub Projects board is reported as a surface it did not read, never as empty.
2. It drafts the end state from what the repo already says and interviews you where the repo says nothing. You rule the end state.
3. It writes epic records only for live work that covers the end state. Past work gets no record, only a link in one `## History` index.
4. It proposes a destination for every open item in a markdown tracker the repo uses and every open issue it read from a work-item tracker: a member of an epic, out of scope, or the post-done backlog. You rule each, and the project file records the ruling and a row. Nothing else gets a row: not a remote issue you declined, and not an issue in a tracker that could not be read.
5. It cuts over. This step is mandatory: every instruction that routes tracking somewhere else is rewritten, and each rewrite is put to you as its own ruling, one at a time. A tracker another plugin generates is reported and never edited. Any edit to `CLAUDE.md` or `AGENTS.md` is flagged separately in the delivery, because it changes how agents behave.
6. It deletes nothing and repairs no history. The diff removes only the routing lines you ruled.

**Finding the tracker.** It reads the work-item tracker from the repo's own instructions: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md` and the README. Where the remote has open issues those instructions do not name as the tracker, it asks whether to track them, even when another tracker is named. Adoption still runs where no tracker is named and the remote has no open issues, where you decline the remote's issues, or where a tracker cannot be read because its CLI is missing or unauthenticated or the session is contained. The report says which surfaces were read, which you declined and which could not be read. Issue numbers are never invented.

**Restart and collision.** Both modes resume after a crash or a compaction from the run record and never inventory twice. A project file with no run record to explain it means the repo is already adopted: the agent switches to the lifecycle procedure and asks you before re-drafting anything. One session writes at a time. A session that finds an Open run record it did not write writes nothing and asks you.

## What it asks you

The hub's step 1 runs as an interview through `superpowers:brainstorming`, or as the agent's own interview where superpowers is not installed. Each question and your answer go into the run record verbatim as the interview goes.

Every item has seven fields: an ID, an Outcome, a Type, a Check (what a context that did not build the work runs), a Control (how the Check is shown able to fail), the Evidence a result must cite, and its Coverage. The Type is T1 behaviour, T2 an artifact property, T3 a threshold with a pass line, or T4 owner judgement.

Every end-state and Done means item passes one admission test before it reaches you: "Can [requirement] be objectively measured/verified?" An item that cannot is type T4, owner judgement, and its check verifies that your ruling on a named revision exists, never the taste. An item that joins two requirements is split in two. An item missing any field is not put to you.

Where an item's Check can run at the revision it is admitted at, the agent runs its Control and its Check there and keeps both transcripts as the item's admission evidence. The Control has to fail for the reason the Check measures, or the Check is repaired before the item goes anywhere. Where the Check already passes, something other than that Check settles whether the Outcome is present. Where it is, and the Control failed for the reason the Check measures, the item is not live work: it is history, or you rule it `preserve` for the phase that must keep it passing. Where the Outcome is absent, the Check cannot tell present from absent and is repaired. A run that fell over before it measured anything has not run. Where the Check cannot run yet, its Control line carries the mark `not yet shown failing:` and what it needs to run, and the mark comes off only once the Control has been run and shown failing.

What you rule, besides each item:

- the coverage map, which names for each end-state item exactly one epic that satisfies it, or a project-level ruling, and for each epic its planned member phases, each phase carrying one obligation toward each item it serves: satisfy, contribute or preserve. A phase opened for an epic takes one of those planned names or comes with a `coverage` ruling that adds it, and the planned names and the epic's `## Members` phases stay one set;
- each epic's `Combined check:` line, which runs across the seams between its member phases, ruled with its Done means;
- in adopt, each open item's destination and each cutover edit.

Until you rule an item it binds nothing: no seat (an agent the run dispatches) treats it as a constraint and no reviewer grades against it.

## How the work runs

**Two tracked files.** The project lives in `docs/PROJECT.md` and each epic in `docs/epics/<ID>.md`, both committed and never gitignored. The project file holds the end state, the never-becomes list, the epic roster, the current epic, a row for each open item adoption took in, the history index, and your rulings and the exit-pass returns. An epic record holds what the epic is, its Done means, its members and its own rulings and returns. The exact format, every ruling kind included, is in [`skills/doctrine-project/formats.md`](../../skills/doctrine-project/formats.md). Each phase's run record stays out of version control, under the path the project file's `Records:` line names, `.doctrine/records` unless the repo names another. An optional `Tracks:` line names another repo when the tracking files live apart from the work, and `status` then reads live seats and Codex jobs for that repo.

**Epic states.** An epic is Proposed, Not started, Open, Done, Dropped or Superseded.

| From | To | Who moves it |
|---|---|---|
| (new) | Proposed | the agent, writing a roster line and a record |
| Proposed | Not started | you, ruling the Done means, the coverage map and the combined check |
| Not started | Open | the agent, opening the first member phase |
| Open | Done | an epic exit pass whose return counts |
| Done | Open | the agent, on a ruled Done means change, a ruled combined check change, or a recorded regression |
| Proposed, Not started, Open or Done | Dropped | you, by a `drop` ruling |
| Proposed, Not started, Open or Done | Superseded | you, by a `supersede` ruling naming the successor |

The project is Proposed until you rule its end state, then Ruled, and Done only when every epic on the roster is Done, Dropped or Superseded and a project exit pass returns a result that counts. A new end-state ruling, a regression, an epic leaving a terminal state or a new roster line puts it back to Ruled.

**Exit passes.** The agent opens an epic's exit pass once its member phases have exited, and the project's once every roster epic is terminal. It writes the revision on the `Certification target:` line, then dispatches a seat that did not build the work. That seat gets the record with every `return` and `regression` entry removed, and its search excludes them in every tracked file, so it never sees how earlier passes went. Your rulings stay in, so it can find the ruling a T4 item needs. The same exclusion applies to every phase reviewer and red team in an adopted repo. The seat's brief pastes the item types, the evidence kinds, the current-baseline rule, the rule for when a return counts, the admission test, and the admission evidence of each item not marked `not yet shown failing:`. Where a check runs a command, the seat is one that can run commands. It returns PASS, FAIL or UNVERIFIED per item with an evidence reference, and for an epic it also runs the `Combined check:` line. Missing evidence is UNVERIFIED, never PASS. An item still marked `not yet shown failing:` gets PASS only once its Control has been run and shown failing at the certification target. Admission evidence that does not show the Control failing for the reason the Check measures makes the item UNVERIFIED, or FAIL where its Check fails. An item admitted before admission runs were kept is graded by its Check and named apart, and that absence alone does not make it UNVERIFIED.

**The accounting check.** The agent, never a seat, decides whether a return counts: it runs `check` and `status` and reads each PASS's evidence reference against the item's Type and Evidence lines. A return counts only when the target is set, its baseline is the current one, its revision is the target, and no regression against its items follows it. Where more than one return counts, the latest decides. Only a counting return moves a state.

**A failed item.** A failing end-state item gets a regression recorded against each Done means item that serves it, or against every Done means item where those cannot be named, in the epic that satisfies it. Where that epic was superseded, the agent first puts you a `coverage` ruling naming the Done epic at the end of its successor chain, and records the regressions there. That epic alone reopens, in the same write. A failing item ruled project-level may be fixed by a phase outside any epic. The project exit pass then reruns. The `Current epic:` pointer moves only when a member phase opens an epic, never on such a reopen.

**Changes after a ruling.** A Done means change needs your `impact` ruling, and the evidence behind the changed items must be gathered again. A change to what a ruled combined check runs, or to its pass rule, needs a new `baseline` ruling, which stops older returns counting and moves a Done epic back to Open. A repair that leaves both doing the same thing, such as a typo, gets no ruling, since a `baseline` ruling would void good returns. The test is what the check now does, not whether its words moved: unchanged words that now run something else are a change. `check` sees neither mistake. A decision that moves nothing, such as an escalation you rule when an alarm fires, is recorded as a `note` ruling, which voids nothing.

**Work nothing covers.** A successor covers an end-state item only once it is Done. Where a successor chain ends at an epic that is Proposed, Not started or Open, the repair is a `coverage` ruling naming that epic as the item's satisfy epic. Where it ends at a Dropped epic, loops, or leaves the roster, the repair is a new epic on the roster and a `coverage` ruling naming it. That ruling comes first whenever a reopen reaches the Done end of a superseded epic's chain.

**Records older than the combined check result.** `check` reports an epic whose deciding return predates the `Combined check result:` line. An epic that can still take a pass gets a `baseline` ruling re-approving the same `Combined check:` line, which reopens it, and a fresh exit pass, and a Done project goes back to Ruled meanwhile. A Dropped or Superseded epic instead gets `Certification target: none`, after which no return in it counts. Nobody writes a result into a return a seat already gave.

**In an orchestrated run.** In a [`doctrine-orchestrate`](doctrine-orchestrate.md) run only the orchestrator writes the project file and the epic records. A lane that needs a lifecycle write sends a request, `node <plugin-root>/hooks/dctr-send.mjs report request '<text>'` with each `'` in the text written as `'\''`, and waits for the orchestrator's answer in its held folder before any step that needs it.

## The commands

`<plugin-root>` is two directories above the skill's base directory.

```text
node <plugin-root>/hooks/dctr-project.mjs check
```

The format check. It runs first in every phase of a tracked repo and again after every write that changes a state, a ruling, a return, the roster, a membership or the pointer, before that write is committed. It reads the project file and every epic record offline and makes no network call. Exit 0 is clean. Exit 1 prints one finding per line, and the findings are fixed before any further state change. Exit 2 means the project file is missing or unreadable or the arguments were malformed. Adoption adds no CI step for it. A hand edit made between sessions is caught at the next session's first check, so far as the file as it stands shows it: `check` keeps no history of any line, so an edit to a `Coverage:` or `Combined check:` line is not caught.

```text
node <plugin-root>/hooks/dctr-project.mjs status
```

The read-only progress view: the project, each end-state item, the roster, the current epic, the open records it searches and any return that no longer counts, labelled obsolete with its baseline and revision. A field it cannot read prints `unknown`, which means it could not look, not that nothing is there. It searches records directly under `Records:`, one directory down where a record carries a `wrapper:` line, and wherever an epic's Members line names one.

```text
node <plugin-root>/hooks/dctr-token.mjs <round> <exit-count> <valve> --epic <ID> --phase <name> [--owed]
```

Inside herdr, the orchestrator publishes the phase's round, exit and alarm counters with the `$epic` and `$phase` tokens, and adds `--owed`, shown as `·owed` on the `$doctrine` token, while an alarm awaits your ruling, a direction question is open or a closing round has finished. Only the session's orchestrator writes these tokens, and it re-publishes them whenever a value changes and at least once an hour, or they expire. It never runs `herdr pane report-agent`, which would replace herdr's own `blocked` and `done` detection for the pane. [Watching a run](../watching-a-run.md) has the herdr config rows and the conditions under which they render.

## What the gate is for this shape

The hub ([doctrine.md](doctrine.md)) supplies the posture, the gate, the alarms and the record. This skill fills its four slots:

- **Core discipline:** the lifecycle procedure above, with the interview run through `superpowers:brainstorming`.
- **Designated review:** none is named, so the hub's default fills it: a fresh-context review against the anchor. For a start or adopt deliverable, its brief pastes that mode's end conditions and your interview questions and answers.
- **Red team:** the hub's step 4 seat, attacking six things: an end-state item with no live epic to satisfy it, or a Superseded epic's successor counted before it is Done; an item typed T1 to T3 that fails the admission test, or a conjunction left unsplit; an open item with no destination ruling or row, or an issue number nobody read from a tracker; an instruction still routing tracking elsewhere after cutover; history deleted or rewritten, or a plugin-generated tracker edited; and a return, a regression or run state inside a seat's prompt or search scope. Its brief pastes the same definitions the exit seat gets and, for a start or adopt deliverable, your interview questions and answers, and in adopt also the tracking-surface inventory and what each tracker read returned.
- **The record:** under the `Records:` path, excluded from version control. Before a project file exists it goes under `.doctrine/records/`, excluded through the file `git rev-parse --git-path info/exclude` names, so no tracked file changes.

## How it ends

Start ends when the project is Ruled, the first epic is Not started with its Done means, coverage map and combined check ruled, and `check` exits 0. Adopt ends when the project is Ruled, every live epic is Not started or Open, every open item has its destination ruling and row, every cutover edit is ruled and committed, any GitHub Projects board is reported unread, and `check` exits 0. Both deliverables are prose, so both phases exit under the hub's prose-deliverable exit: one clean pass, or, where none has come clean when the round alarm first fires, one closing round and delivery with the punch list ([doctrine.md](doctrine.md)).

An epic ends Done when the latest counting exit return carries PASS for every Done means item and for its combined check. The project ends Done the same way, on a project exit pass, once every roster epic is terminal.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You type `use doctrine-project to adopt this repo`. The repo has a `PROGRESS.md` whose state column has grown into a history log, and four open issues.

The agent drafts three end-state items from the README and `PROGRESS.md`, and asks about the one area the repo says nothing on. One draft item reads "the importer is fast and correct". The admission test splits it into a T3 item with a pass line and a T1 behaviour item. You rule the end state. The agent writes one epic record, `IMPORT`, for the importer work already in progress, and puts its Done means and combined check to you. You rule them.

It proposes a destination for each open issue: two members of `IMPORT`, one out of scope, one post-done backlog. You accept three and move the fourth. `PROGRESS.md` goes into the history index unchanged. The cutover finds one line in `CLAUDE.md` telling agents to update `PROGRESS.md`. That edit is flagged as an instruction-file change and put to you, and you approve it. The format check exits 0.

Weeks later a `doctrine-code` phase closes the last member of `IMPORT`. An exit pass from a fresh context runs the epic's combined check and returns PASS with evidence for it and for every Done means item at the certification target. The agent writes the return, runs the accounting check, which counts it, and the epic moves to Done.

## How to invoke it

```text
use doctrine-project to start tracking this repo
```

```text
use doctrine-project to adopt this repo; the tracker is GitHub issues
```

## Requirements

Nothing has to be installed. `superpowers:brainstorming` runs the interview where it is installed, and without it the agent runs the interview itself. The format check is plain Node. herdr is optional: it adds the sidebar tokens, and the live seat panes [Watching a run](../watching-a-run.md) describes. [docs/requirements.md](../requirements.md) has the install commands.

## Red flags

- An epic moved to Done by the session that built it, with no return from another context.
- A return recorded against a revision other than the certification target, and counted.
- `Current epic:` moved when a regression reopened an older epic.
- A cutover that rewrote five routing lines on one ruling, or a plugin-generated tracker hand-edited.
- Every issue in a closed milestone read as an epic being Done.
- A GitHub Projects board reported as holding nothing, when nobody read it.
- A second session re-running an adoption the first session left Open.
- `docs/PROJECT.md` gitignored because an orchestrator took it for the run record.
- An exit seat handed the epic record whole, including last month's FAIL.
- A state change committed with no `check` run after it.
- A `herdr pane report-agent` call, or epic and phase tokens published by a seat instead of the orchestrator.
- An epic's combined check rewritten with no ruling, or a `baseline` ruling written for a typo in it.

The specification is [`skills/doctrine-project/SKILL.md`](../../skills/doctrine-project/SKILL.md). Trust it over this page wherever the two disagree.
