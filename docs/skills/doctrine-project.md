# doctrine-project

The tracking wrapper: it gives a repo one uniform way to know when the whole project is done and when the epic being built is done, recorded in the repo itself, with a ruled end state, epic records whose Done means can be checked, exit passes run by a context that did not build the work, and a cutover from whatever tracked the work before.

## When to use it, and when not

Use it to start tracking a new project, or to adopt an existing repo into project and epic tracking. It has two modes:

- **start**, for a repo with no tracking yet: the end state, the scope list and the first epic's Done means are ruled before the first phase opens.
- **adopt**, for a repo that already tracks work somewhere: markdown trackers, PRDs, plans, an issue tracker or nothing at all. Adoption is forward-only.

It does not build the epic. Phases are still run by the wrapper that fits their shape, `doctrine-code`, `doctrine-debug` and the rest. Once a repo carries `docs/PROJECT.md`, the hub's step 1 sends every phase there through this wrapper's lifecycle procedure, so you do not need to invoke it again for each phase.

Do not use it for a one-off question or a single edit to a tracker file. The hub says not to use the doctrine for those.

## What it asks you first

Doctrine step 1 runs as an interview through `superpowers:brainstorming`, or an interview the agent runs itself where superpowers is not installed. The agent proposes and you rule.

In start mode it proposes the end state, a "never becomes" list of what the project is not, and the first epic's Done means. In adopt mode it drafts the end state from what the repo already says and asks where the repo says nothing.

Every Done means item, and every end-state item, passes one admission test before it is put to you: "Can [requirement] be objectively measured/verified?" If not, it becomes an owner-judgement item that names you as the judge. An item that joins two requirements is split into two. The fields every item carries are defined in [formats.md, "Item fields"](../../skills/doctrine-project/formats.md#item-fields).

Until you rule on an item it binds nothing: no seat treats it as a constraint and no reviewer grades against it.

## How the work runs

**Two tracked files.** The project lives in `docs/PROJECT.md`, and each epic in `docs/epics/<ID>.md`. Both are committed. The project file holds the end state, the never-becomes list, the epic roster, the current epic, every open issue's destination, a linked index of history, and the owner's rulings and exit-pass returns. An epic record holds what the epic is, its Done means, its member phases and issues, and its own rulings and returns. The exact format is [`skills/doctrine-project/formats.md`](../../skills/doctrine-project/formats.md). Run state for each phase stays where the hub puts it, private and out of version control.

**States.** An epic is Proposed, Not started, Open, Done, Dropped or Superseded. Your ruling on its Done means moves it from Proposed to Not started, and its first member phase opens it. It reaches Done only on an exit return from a context that did not build the work, with a PASS for every Done means item, and only a return that counts under [formats.md, "Entries"](../../skills/doctrine-project/formats.md#entries) moves it. A later regression against a Done means item reopens the epic. The project is Proposed until you rule its end state, then Ruled, and Done only when every epic on the roster is Done, Dropped or Superseded and a project exit return passes every end-state item.

**Adopting a repo.** Adoption looks forward, not back:

- You rule the end state.
- Epic records are written only for live work that covers it.
- Every open issue gets one destination: a member of an epic, out of scope, or the post-done backlog.
- History is kept as one linked index. No record is written for a past epic and nothing is deleted.
- A cutover step rewrites the instructions that route tracking somewhere else. Each cutover edit is put to you and ruled one at a time. Trackers another plugin generates are reported and never edited. Edits to `CLAUDE.md` or `AGENTS.md` are flagged separately. GitHub Projects boards are reported as a tracking surface the run could not read.

It works with whatever tracker the repo names, and with none. Issue numbers are recorded as written and never looked up. Both modes pick up after a crash where they stopped, detect a project file or an earlier adoption already in place, and allow one writer at a time.

**The format check.** At every state change, and at the start of every session in a tracked repo, the orchestrator runs:

```text
node <plugin-root>/hooks/dctr-project.mjs check
```

It reads the project file and every epic record offline and exits 0 with no findings, 1 with one finding per line, or 2 when `docs/PROJECT.md` is missing. Adopted repos get no CI step for it. A hand edit made between sessions is caught at the next session start. `node <plugin-root>/hooks/dctr-project.mjs status` prints the project, each end-state item's progress, the roster, the current epic, open phases, pending gate transcripts, and any return that no longer counts, labelled with its baseline and revision. Any field it cannot read prints `unknown`.

**Watching it.** Inside herdr the orchestrator publishes `$epic` and `$phase` on its pane, and adds `·owed` to the `$doctrine` token while a ruling waits on you. [Watching a run](../watching-a-run.md) has the config row and the conditions under which it renders.

## What the gate is for this shape

The hub leaves four slots to the wrapper.

**Core discipline.** The lifecycle procedure above: who writes epics and membership, who dispatches and records exit passes, when the current-epic pointer moves, and the format check at each state change.

**Designated review.** The hub's default: a fresh-context review of the deliverable against the anchor. An exit pass grades the Done means items at one revision. A reviewer is handed a project file or epic record with its return and regression entries removed, and its search scope excludes those entries too, so no reviewer sees how earlier passes went. Your rulings stay in, because an owner-judgement item is checked by finding your ruling.

**Red team.** The hub's step 4 seat, on the axes the specification names.

**The record.** Run state goes where the hub puts it. The two tracked files are the project's contracts and are not the run record. Adopt mode's records are prose, so they run under the hub's prose-deliverable exit, which this wrapper adopts by name.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You type `use doctrine-project to adopt this repo`. The repo has a `PROGRESS.md` whose state column has grown into a history log, and four open issues.

The agent drafts three end-state items from the README and `PROGRESS.md`, and asks about the one area the repo says nothing on. One draft item reads "the importer is fast and correct". The admission test splits it into a T3 item with a pass line and a T1 behaviour item. You rule the end state. The agent writes one epic record, `IMPORT`, for the importer work already in progress, and puts its Done means to you. You rule them.

It proposes a destination for each open issue: two members of `IMPORT`, one out of scope, one post-done backlog. You accept three and move the fourth. `PROGRESS.md` goes into the history index unchanged. The cutover finds one line in `CLAUDE.md` telling agents to update `PROGRESS.md`. That edit is flagged as an instruction-file change and put to you, and you approve it. The format check exits 0.

Weeks later a `doctrine-code` phase closes the last member of `IMPORT`. An exit pass from a fresh context returns PASS with evidence for every Done means item at the recorded certification target, and the epic moves to Done.

## How to invoke it

```text
use doctrine-project to start tracking this repo
```

```text
use doctrine-project to adopt this repo; the tracker is GitHub issues
```

## Requirements

Nothing has to be installed. `superpowers:brainstorming` runs the interview where it is installed, and without it the agent interviews you one question at a time. The format check is plain Node with no network call. herdr is optional and only adds the sidebar tokens. [docs/requirements.md](../requirements.md) has the install commands.

## Red flags

- An epic moved to Done by the context that built it, or on a return with no evidence for an item.
- A reviewer handed a project file or epic record with a return or regression entry still in it.
- A Done means item graded, or used as a constraint, before you ruled it.
- A cutover edit made without your ruling on that edit, or a plugin-generated tracker edited.
- An open issue left with no destination, or history rewritten or deleted during adoption.
- The current-epic pointer moved because a regression reopened an epic.
- A state changed with no format check run after it.
- Epic or phase tokens published by a seat instead of the session's orchestrator.

The hub's page is [doctrine.md](doctrine.md).

The specification is [`skills/doctrine-project/SKILL.md`](../../skills/doctrine-project/SKILL.md); trust it over this page wherever the two disagree.
