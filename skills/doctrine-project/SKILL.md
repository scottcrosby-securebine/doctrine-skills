---
name: doctrine-project
description: Use when the user asks to start tracking a project, or to adopt an existing repo into uniform project and epic tracking, with the doctrine: a ruled end state, epic records with checkable Done means, independent exit passes, and cutover from other trackers.
---

# Doctrine Project

One way to know when a project is done and when each epic is done, the same in every repo. The agent proposes and the owner rules. Only an exit pass by a context that did not build the work moves an epic or the project to Done.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. What this wrapper supplies to it:

- **Core discipline.** The lifecycle procedure below. The owner's interview runs through `superpowers:brainstorming`, whose fallback is the hub's Fallbacks row.
- **Designated review.** None is named, so the hub default fills the slot (doctrine step 5): a fresh-context review of the deliverable against the anchor. For an exit pass, what it grades is the Done means or end-state items.
- **Red team axes.** The list under "Red team axes" below.
- **Where the record lives.** The run record for a phase goes under the path on the project file's `Records:` line, excluded from version control, per doctrine step 1. `docs/PROJECT.md` and `docs/epics/<ID>.md` are tracked contracts, not the record. Never gitignore them.

The file formats, and the rule for when a return counts, are in `formats.md` beside this file. Read it before writing either file. `<plugin-root>` below means two directories above this skill's base directory, the one this file loaded from.

## Modes

**Start**, for a repo with no project file. Interview the owner, then propose, in `Proposed` state: the end state items, the never-becomes list (propose entries yourself and let the owner strike the wrong ones), the first epic with its Done means, and the coverage map (W1 below). The owner rules on all of it before the first phase opens.

**Adopt**, for a repo that already tracks work some other way. Adoption is forward-only:

1. Inventory every tracking surface the repo uses: goals, plans, PRDs, markdown trackers, and the work-item tracker its CLAUDE.md or AGENTS.md names. Report any GitHub Projects board as an unread tracking surface. Never report it as empty or as having been read.
2. Draft the end state from what the repo already says. Where it says nothing, interview the owner. The owner rules it.
3. Write epic records only for live work that covers the end state. Past work gets no epic record and no archive ruling. List its sources as links under `## History`, one index, and nothing more.
4. Give every open issue a destination: a member of an epic, out of scope, or the post-done backlog.
5. Cut over. This step is mandatory. Find every instruction that routes tracking somewhere else and put each rewrite to the owner as its own ruling, one at a time. A tracker a plugin generates is reported and left alone: it is not cut over and never edited. Flag every CLAUDE.md or AGENTS.md edit separately in the delivery, since it changes agent behaviour.
6. Delete nothing and repair no history. The diff removes only the routing lines the owner ruled.

Adopt mode's deliverable is prose (the project file, the epic records, the cutover diff), so its phase runs under the hub's prose-deliverable exit, adopted here by name.

**Restart and collision.** Both modes resume after a crash or compaction. Before the first write, look for an existing `docs/PROJECT.md` and for an adoption or start run record under its `Records:` path, or under the hub's default location where no project file exists yet. If a run record exists, resume from it and never re-inventory. If a project file exists and no run record explains it, the repo is already adopted: switch to the lifecycle procedure, and ask the owner before re-drafting anything. One writer at a time: the run record names the session writing the project files. A session that finds an Open run record it did not write writes nothing and asks the owner.

**Trackers.** Work with whatever tracker the repo's CLAUDE.md or AGENTS.md names. The no-tracker branch applies where none is named, the tracker CLI is missing or unauthenticated, or the session is contained. In that branch, adoption still runs, `## Open issues` records only items you actually read, and the report says plainly that no tracker was read. Never invent an issue number. The format check makes no network call and never reads the tracker, so a closed issue or a merged PR is a member's closure, never acceptance.

## Lifecycle procedure

This procedure applies to every phase in a repo that carries `docs/PROJECT.md`, whichever wrapper runs the phase.

### The format check

Run `node <plugin-root>/hooks/dctr-project.mjs check` as your first action in such a phase, and again after every write that changes a state, a ruling, a return, the roster, a membership or the pointer. Run it before committing that write. Exit 0 is clean. Exit 1 lists findings: fix them before any further state change. Exit 2 means the project file is absent or unreadable, or the arguments were malformed. This is the stated way the check runs in a target repo. Add no CI step to an adopted repo. A hand edit made between sessions is caught at the next session's first check, and that gap is ruled and known.

`node <plugin-root>/hooks/dctr-project.mjs status` is read-only and prints the project's progress view. It prints `unknown` for any source it cannot read. Read an `unknown` as "could not look", never as "nothing there". A return it labels obsolete is history, never current evidence.

Name every gate transcript written under `Records:` with the extension `.out`, so its `.out.result` sibling is found. `status` detects pending gates only by that convention.

### States and who moves them

Epic states are `Proposed`, `Not started`, `Open`, `Done`, `Dropped` and `Superseded`. The terminal states are `Done`, `Dropped` and `Superseded`, and only `Done` has an exit. The evidence each state needs is what `check` enforces.

| Epic from | To | Who moves it |
|---|---|---|
| (new) | Proposed | you, writing a roster line and a record |
| Proposed | Not started | the owner, ruling the baseline Done means and the coverage map |
| Not started | Open | you, opening the first member phase |
| Open | Done | an epic exit pass whose return counts |
| Done | Open | you, on a `done-means-change` ruling or a recorded regression |
| Proposed, Not started, Open or Done | Dropped | the owner, by a `drop` ruling |
| Proposed, Not started, Open or Done | Superseded | the owner, by a `supersede` ruling naming the successor |

| Project from | To | Who moves it |
|---|---|---|
| (new) | Proposed | you, writing end state items |
| Proposed | Ruled | the owner, ruling the baseline end state |
| Ruled | Done | a project exit pass whose return counts, with every roster epic terminal |
| Done | Ruled | you, on an end-state ruling, a regression, an epic leaving a terminal state, or a new roster line |

- **Epics.** You create each epic in `Proposed` and record each member phase and issue under `## Members` when it joins.
- **The pointer.** Move `Current epic:` only when a member phase opens an epic. Never move it when a regression reopens an epic.
- **A Done means change.** On a `Not started` or `Open` epic it is allowed. On any epic it needs an `impact` ruling from the owner listing the same items (W3), and every phase contribution to those items needs fresh evidence. On a `Done` epic it also moves the epic to `Open`.
- **Work nothing covers.** Work a `Dropped` or `Superseded` epic no longer covers goes into a new epic. A successor covers an end-state item only once it is `Done`. While it is not, `check` reports the item, and the fix is an owner ruling that names the successor as its satisfy epic.

### Done means items

Every item has the seven fields `formats.md` defines. Before any item goes to the owner as part of a baseline, apply the admission test to it: "Can [requirement] be objectively measured/verified?" If not, it is type T4, owner judgement: its check verifies that the owner's ruling on a named revision exists, never the taste. Split a conjunction into separate items. An item missing any field is not put to the owner.

- **W1.** The coverage map is ruled before the first phase opens. It names, for each end-state item, exactly one satisfy epic, or a `project-level` ruling. It also names each epic's combined check for the seams between its member phases.
- **W2.** Each phase serving an item carries exactly one obligation toward it: satisfy, contribute (named partial evidence), or preserve. Doctrine step 1 carries a phase's served items and their obligations into its anchor.

### Exit passes

You open an epic exit pass when its member phases have exited. You open the project exit pass when every roster epic is terminal. That is the project exit entry point. Either pass reuses the hub gate by reference: a context that did not build the work, one identified revision, a recorded return.

1. **Open.** Write the revision on the file's `Certification target:` line as the pass opens. An epic has one certification target at a time. Opening a pass on a new revision voids any pending pass on the old one. Completed returns on the old revision stay in the file as history.
2. **Dispatch.** The exit seat is handed the project file or epic record with its `## Rulings and returns` section removed, and its search scope excludes those sections in every tracked file, as doctrine step 4 excludes the record. The same exclusion applies to every phase reviewer and red team in an adopted repo. Past exit-pass results and run state never reach a seat.
3. **Evidence.** The seat returns PASS, FAIL or UNVERIFIED per item, each with an evidence reference. Brief it that missing evidence is UNVERIFIED, never PASS. A `path:line` reference and a web quote held in a retained copy can both be checked offline. Checking that a live page still says what was quoted needs a fetch, which belongs in a separate manual check, never in `check`. A check that a quote is present does not show that the quote supports the claim.
4. **Record.** You write the return entry. A return missing any item's result is a failed pass. Read what counts from `formats.md`.
5. **A failed item.** For a failing end-state item with a satisfy epic, record a `regression` in the satisfy epic's record against each of that epic's Done means items that serve the failing end-state item, each by its own ID, and reopen that epic only (Done to Open). A failing item ruled `project-level` may be fixed by a phase outside any epic. The project exit pass then reruns.

### The sidebar

Inside herdr, publish the phase's counters with `node <plugin-root>/hooks/dctr-token.mjs <round> <exit-count> <valve> --epic <ID> --phase <name>`, adding `--owed` while a ruling is owed. Doctrine step 5 defines the three counters. Re-publish whenever a value changes and at least once an hour, or the tokens expire.

- **Owed.** Set `--owed` while an alarm has fired and awaits a ruling, while a direction question is open, or once a closing round has finished. Clear it when the owner rules.
- **One owner.** The session's orchestrator is the only writer of its pane's tokens, under source `custom:doctrine`. herdr does not refuse a second writer, so no seat publishes them.
- **Attention.** herdr's native `blocked` and `done` states and its `state_icon` carry attention. Never run `herdr pane report-agent`: a reporter replaces native detection for that pane, including those two states.
- **Rendering.** Wherever you verify that the tokens render, name the view and the width. Pane tokens render only on an Agent row. Custom rows show only in the expanded sidebar, on a client wider than `ui.mobile_width_threshold` (64 columns by default). At the default sidebar width, `$epic`, `$phase` and `$doctrine` truncate on one row. A `$doctrine` change raises no toast, so `·owed` is seen only by someone looking at the row.

## Red team axes

Hand the red team these, per doctrine step 4:

- A PASS whose evidence is missing, or is not of the item's own type.
- A return whose baseline is not current, whose revision is not the certification target, or which a later regression voids.
- An end-state item with no live satisfy epic, or a Superseded epic's successor counted before it is Done.
- An item that fails the admission test typed T1 to T3, or a conjunction left unsplit.
- An open issue with no destination, or an issue number nobody read from the tracker.
- An instruction that still routes tracking elsewhere after cutover.
- History deleted or rewritten, or a plugin-generated tracker edited.
- A `## Rulings and returns` section, or run state, inside a seat's prompt or search scope.

## Red flags

- An epic moved to Done by the session that built it, with no return from another context.
- A return recorded against a revision other than the certification target, and counted.
- `Current epic:` moved when a regression reopened an older epic.
- Every issue in a closed milestone read as an epic being Done.
- A cutover that rewrote five routing lines on one ruling.
- A plugin-generated tracker hand-edited during cutover.
- A GitHub Projects board reported as holding nothing, when nobody read it.
- `docs/PROJECT.md` gitignored because an orchestrator took it for the run record.
- An exit seat handed the epic record whole, including last month's FAIL.
- A second session re-running an adoption the first session left Open.
- A `herdr pane report-agent` call, and a pane that never shows `blocked` again.
- A state change committed with no `check` run after it.
