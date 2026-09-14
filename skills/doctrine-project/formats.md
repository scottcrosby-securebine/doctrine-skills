# Project and epic formats

The reference for writing `docs/PROJECT.md` and `docs/epics/<ID>.md`. `node <plugin-root>/hooks/dctr-project.mjs check` enforces this format and the evidence each state needs, and `status` reads it. `SKILL.md` beside this file says who writes what, and when.

## General rules

- Every ID, and every phase name, matches `[A-Za-z0-9][A-Za-z0-9_-]{0,23}`: at most 24 characters, so it publishes as a sidebar token unchanged. An ID is unique within its kind across the whole project.
- A header line is `Key: value` on its own line, before the first `##`.
- A list inside a value is separated by `, `.
- "Latest" means last in file order.
- Unknown extra sections are allowed and ignored. In `## End state`, `## Done means`, `## Epics`, `## Open issues`, `## Members` and `## Rulings and returns`, every non-blank line takes a form this file shows, and `check` reports any other line.
- A table row may omit its leading and closing pipes and may be indented by up to three spaces. `\|` inside a cell is a literal pipe.

## `docs/PROJECT.md`

```
# Project: <name>
State: Proposed | Ruled | Done
Current epic: <epic ID> | none
Certification target: <commit sha> | none
Records: <path, relative to repo root>

## End state
### <item ID>
- Outcome: <names the value>
- Type: T1 | T2 | T3 | T4
- Check: <run by a non-builder at the certification target>
- Control: <how the check is shown able to fail>
- Evidence: <source reference required>
- Coverage: satisfy <epic ID>[; contribute <epic IDs>][; preserve <epic IDs>]  |  project-level <ruling ID>

## Never becomes
- <entry>

## Epics
| ID | Title | Record |
|---|---|---|
| <epic ID> | <title> | docs/epics/<epic ID>.md |

## Open issues
| Issue | Destination |
|---|---|
| <tracker id or path:line> | <one of: member <epic ID> / out of scope / post-done backlog> |

## History
- <link to a historical source>

## Rulings and returns
<entries, below>
```

The roster carries no state. An epic's state lives only in its record.

An `## Open issues` row's Issue cell is the tracker id, or, for an open item read from a markdown tracker, its `<path>:<line>`. A row is never removed: when its issue or item closes the row stays, so every `destination` ruling keeps the row it names.

## `docs/epics/<ID>.md`

```
# Epic <ID>: <title>
State: Proposed | Not started | Open | Done | Dropped | Superseded
Certification target: <commit sha> | none
Combined check: <what runs> ; pass when <rule> | none

## What this is
<prose>

## Done means
### <item ID>
- Outcome: <names the value>
- Type: T1 | T2 | T3 | T4
- Check: <run by a non-builder at the certification target>
- Control: <how the check is shown able to fail>
- Evidence: <source reference required>
- Coverage: <phase name>: satisfy | contribute | preserve[, <phase name>: <obligation>]

## Members
- phase <phase name>[: <record path>]
- issue <tracker id>

## Rulings and returns
<entries, below>
```

`Combined check: none` is legal only while an epic is `Proposed`, `Dropped` or `Superseded`. What the line holds otherwise, and which ruling carries it, are under "Entries" below.

## Item fields

An item's seven fields are its `###` ID and the six list lines.

- **Outcome** names the value. "The page loads" names nothing, since an app that returns an empty body forever passes it.
- **Type** is T1 behaviour (inputs, environment, observable outputs, rejection cases), T2 artifact property, T3 threshold with a pass line, or T4 owner judgement (the named authority, the question, the revision judged).
- **Check** is what a context that did not build the work runs at the certification target.
- **Control** shows the check can fail, for example the check run with the feature off. Where the Check is runnable, the control is shown failing at the revision the item is admitted at. An item whose Check could not run at the revision it was admitted at carries, on its Control line, the words `not yet shown failing:` followed by what it needs to run, and the mark comes off the line only when the Control has been run and shown failing.
- **Evidence** says what reference a return must cite: a `path:line`, a gate transcript under `Records:`, or a web quote with a retained copy.
- **Coverage** is the W1 coverage map for that item. In the project file it names exactly one satisfy epic, or a `project-level` ruling. In an epic record it gives each serving phase one obligation.

## Entries

```
### <entry ID> ruling, <ISO 8601 UTC time>
Kind: baseline | done-means-change | impact | drop | supersede | project-level | coverage | destination | cutover | scope | note
Items: <item IDs>            (done-means-change, impact, project-level, coverage)
Successor: <epic ID>         (supersede)
Issues: <tracker ids or path:line ids>   (destination)
To: <member <epic ID> | out of scope | post-done backlog>  (destination)
Edit: <path>:<line>          (cutover)
Entries: <never-becomes entries>  (scope)
By: <owner>
> <the owner's words>

### <entry ID> return, <ISO 8601 UTC time>
Baseline: <ruling entry ID>
Revision: <commit sha>
Seat: <handle of a context that did not build the work>
Combined check result: PASS | FAIL | UNVERIFIED, evidence: <reference>   (epic records)
- <item ID>: PASS | FAIL | UNVERIFIED, evidence: <reference>

### <entry ID> regression, <ISO 8601 UTC time>
Item: <item ID>
Found by: <check or pass>
> <the failing result, quoted>
```

A `done-means-change` ruling's Items name every item it adds, changes or removes, including the old ID of an item it splits. An ID that is no longer an item then still resolves in an entry written before the ruling, in the ruling itself, in an `impact` ruling, and in a return whose Baseline is a ruling written before it, because that return graded the items as they stood under its own Baseline. A regression written after the ruling must name a current item, and so must a return whose Baseline is that ruling or a later one.

A `coverage` ruling records the coverage map (W1): the initial map the owner rules before the first phase, and every later change to it, such as which epic satisfies an end-state item or which phases serve a Done means item. It never changes what an item means, and it never carries an epic's `Combined check:` line or its pass rule, whose only ruling is the `baseline` ruling below, whatever else about the map changes with it. Its Items name the items whose `Coverage:` line it sets or changes: end-state items in the project file, Done means items in an epic record.

Three Kinds record the owner's start and adoption rulings, each written in the project file. A `destination` ruling gives the tracker ids or `<path>:<line>` ids in `Issues:` the destination in `To:`, and each id must be a row in `## Open issues` whose Destination equals the `To:` of the latest `destination` ruling naming it. A `cutover` ruling names in `Edit:` the one instruction it changes, and its quoted `>` line holds the new text, or `(removed)`. A `scope` ruling names in `Entries:` the never-becomes entries it adds or strikes.

A `note` ruling records an owner decision that moves no state: an escalation ruled when a phase's alarm fires, a finding the owner rules closed, an approval worth keeping that changes no item, no line and no map. Its fields are the common ones and nothing else. It exists so that such a decision has somewhere to go: written as a `baseline` ruling it would become the current baseline and stop the epic's own returns counting, which is a pass voided by bookkeeping.

None of `coverage`, `destination`, `cutover`, `scope` or `note` is a baseline, so none voids a return, and a `coverage` ruling needs no `impact` ruling.

The **current baseline** of a file is its latest `baseline` or `done-means-change` ruling.

An epic's first `Combined check:` line is ruled by the same `baseline` ruling that rules its Done means, as the worked example below shows. A ruling that changes the line afterwards is its own `baseline` ruling in that epic's record. Either way the ruling's quoted words carry what runs and the pass rule verbatim, never a description of them, since nothing else records what the owner approved. The test is containment, not a delimiter: the epic's `Combined check:` line, from what runs through the pass rule, appears inside the ruling's quote as an unbroken run of the same characters, a trailing period aside. Whatever leads into it is the owner's own prose and carries no approval, so the `Combined check:` key itself need not appear, as the worked example below shows. Nothing marks where the approved words begin, and nothing needs to: the line under test is what you search for. Its `Items:` stay empty, since the line is no item. SKILL.md, "A Combined check change", says which changes need that ruling, which get none, and what it voids.

A return **counts** only when all three hold:

- its Baseline is the current baseline;
- its Revision equals the file's `Certification target:`;
- no `regression` entry against one of its items comes after it in the file.

An epic return also carries `Combined check result:`, which is the result of running that epic's `Combined check:` line at the return's Revision. It is no item, so no `Coverage:` line and no `done-means-change` ruling reaches it, and it is read only from the return that decides: an epic is `Done` only when the latest counting return carries `PASS` there as well as for every Done means item. A `PASS` with an empty evidence reference is `UNVERIFIED` here too. A project return carries no such line, the project file having no combined check.

When more than one return counts, the latest counting return decides, and an earlier one that also counts is ignored. A PASS with an empty evidence reference counts as UNVERIFIED. A return that does not count stays in the file, and `status` labels it obsolete with its baseline and revision.

## Worked example

A project ruled on its end state, with one epic open. `check` reports nothing on this pair.

`docs/PROJECT.md`:

```
# Project: invoice-export
State: Ruled
Current epic: E1
Certification target: none
Records: .doctrine/records

## End state
### ES1
- Outcome: an accountant downloads last month's invoices as one CSV that their ledger imports without edits
- Type: T1
- Check: run `npm run export -- --month 2026-08` on the fixture ledger and import the file with `ledger import --strict`
- Control: the same import run on a CSV with one column removed exits non-zero
- Evidence: the import transcript under .doctrine/records, cited as path:line
- Coverage: satisfy E1

## Never becomes
- a reporting dashboard
- a payment processor

## Epics
| ID | Title | Record |
|---|---|---|
| E1 | CSV export | docs/epics/E1.md |

## Open issues
| Issue | Destination |
|---|---|
| #12 | member E1 |
| #15 | post-done backlog |

## History
- docs/archive/2025-roadmap.md

## Rulings and returns
### P-R1 ruling, 2026-09-13T10:00:00Z
Kind: baseline
By: Dana
> Approve ES1 as the end state.

### P-R2 ruling, 2026-09-13T10:01:00Z
Kind: coverage
Items: ES1
By: Dana
> E1 satisfies ES1.

### P-R3 ruling, 2026-09-13T10:02:00Z
Kind: destination
Issues: #12
To: member E1
By: Dana
> #12 is part of the export work.

### P-R4 ruling, 2026-09-13T10:03:00Z
Kind: destination
Issues: #15
To: post-done backlog
By: Dana
> #15 waits until the export ships.
```

`docs/epics/E1.md`:

```
# Epic E1: CSV export
State: Open
Certification target: none
Combined check: `npm test -- export` run against the merged export and CLI phases ; pass when it exits 0 and prints no skipped test

## What this is
A command that writes one month of invoices as a CSV in the ledger's import format.

## Done means
### D1
- Outcome: the export command writes a CSV that `ledger import --strict` accepts for the fixture month
- Type: T1
- Check: `npm run export -- --month 2026-08` then `ledger import --strict out.csv`
- Control: the import rejects the fixture CSV with its date column removed
- Evidence: the import transcript under .doctrine/records, cited as path:line
- Coverage: export-core: satisfy, cli: contribute

## Members
- phase export-core: .doctrine/records/export-core.md
- phase cli
- issue #12

## Rulings and returns
### E1-R1 ruling, 2026-09-13T10:05:00Z
Kind: baseline
By: Dana
> D1 is the Done means for E1. The combined check is `npm test -- export` run against the merged export and CLI phases ; pass when it exits 0 and prints no skipped test.

### E1-R2 ruling, 2026-09-13T10:06:00Z
Kind: coverage
Items: D1
By: Dana
> export-core satisfies D1 and cli contributes to it.
> The combined check covers the seam between them.
```
