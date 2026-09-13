# Project and epic formats

The reference for writing `docs/PROJECT.md` and `docs/epics/<ID>.md`. `node <plugin-root>/hooks/dctr-project.mjs check` enforces this format and the evidence each state needs, and `status` reads it. `SKILL.md` beside this file says who writes what, and when.

## General rules

- Every ID, and every phase name, matches `[A-Za-z0-9][A-Za-z0-9_-]{0,23}`: at most 24 characters, so it publishes as a sidebar token unchanged. An ID is unique within its kind across the whole project.
- A header line is `Key: value` on its own line, before the first `##`.
- A list inside a value is separated by `, `.
- "Latest" means last in file order.
- Unknown extra sections are allowed and ignored.

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
| <tracker id> | <one of: member <epic ID> / out of scope / post-done backlog> |

## History
- <link to a historical source>

## Rulings and returns
<entries, below>
```

The roster carries no state. An epic's state lives only in its record.

## `docs/epics/<ID>.md`

```
# Epic <ID>: <title>
State: Proposed | Not started | Open | Done | Dropped | Superseded
Certification target: <commit sha> | none
Combined check: <the named check covering seams between member phases> | none

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

## Item fields

An item's seven fields are its `###` ID and the six list lines.

- **Outcome** names the value. "The page loads" names nothing, since an app that returns an empty body forever passes it.
- **Type** is T1 behaviour (inputs, environment, observable outputs, rejection cases), T2 artifact property, T3 threshold with a pass line, or T4 owner judgement (the named authority, the question, the revision judged).
- **Check** is what a context that did not build the work runs at the certification target.
- **Control** shows the check can fail, for example the check run with the feature off.
- **Evidence** says what reference a return must cite: a `path:line`, a gate transcript under `Records:`, or a web quote with a retained copy.
- **Coverage** is the W1 coverage map for that item. In the project file it names exactly one satisfy epic, or a `project-level` ruling. In an epic record it gives each serving phase one obligation.

## Entries

```
### <entry ID> ruling, <ISO 8601 UTC time>
Kind: baseline | done-means-change | impact | drop | supersede | project-level
Items: <item IDs>            (done-means-change, impact, project-level)
Successor: <epic ID>         (supersede)
By: <owner>
> <the owner's words>

### <entry ID> return, <ISO 8601 UTC time>
Baseline: <ruling entry ID>
Revision: <commit sha>
Seat: <handle of a context that did not build the work>
- <item ID>: PASS | FAIL | UNVERIFIED, evidence: <reference>

### <entry ID> regression, <ISO 8601 UTC time>
Item: <item ID>
Found by: <check or pass>
> <the failing result, quoted>
```

The **current baseline** of a file is its latest `baseline` or `done-means-change` ruling.

A return **counts** only when all three hold:

- its Baseline is the current baseline;
- its Revision equals the file's `Certification target:`;
- no `regression` entry against one of its items comes after it in the file.

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
> Approve ES1 as the end state, satisfied by E1.
```

`docs/epics/E1.md`:

```
# Epic E1: CSV export
State: Open
Certification target: none
Combined check: `npm test -- export` run against the merged export and CLI phases

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
> D1 is the Done means for E1. The combined check is the export test suite.
```
