// Three-clause tamper test for the project format check and the status command, per CLAUDE.md.
//
//   node hooks/dctr-project.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Seams: T-parse (markdown to model, with line numbers), T-check (model plus a file-existence
// function to findings), T-status (model plus injected posture
// readers to printed lines, `unknown` on every failed read). Every check rule gets the three clauses:
//   (1) a broken fixture trips THAT rule with the message only its branch prints,
//   (2) the known-good project produces zero findings,
//   (3) the broken fixture carries its defect, asserted on the fixture text without calling check.
// Each broken fixture is the good project with one or two lines changed, so a finding on it also
// proves the branch under test was reached on a project that otherwise passes every earlier rule.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseDoc, modelFrom, check, formatFinding, statusLines, readCodex, PROJECT_PATH } from './dctr-project.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

// ---------------------------------------------------------------- the known-good project
// Done project; E1 Done after a done-means-change with its impact ruling and one obsolete return;
// E2 Superseded by E3, which is Done; ES3 is project-level.
const GOOD = {
  'docs/PROJECT.md': `# Project: sample
State: Done
Current epic: E3
Certification target: abc123
Records: docs/records

## End state
### ES1
- Outcome: the export writes a non-empty file
- Type: T1
- Check: run the export against the fixture corpus
- Control: an empty corpus makes the check fail
- Evidence: tests/export.test.mjs:12
- Coverage: satisfy E1

### ES2
- Outcome: import accepts the v2 schema
- Type: T1
- Check: import the v2 sample
- Control: the v1 sample is rejected
- Evidence: tests/import.test.mjs:4
- Coverage: satisfy E2; contribute E1

### ES3
- Outcome: the owner approves the landing copy
- Type: T4
- Check: owner ruling on revision abc123
- Control: no ruling means no pass
- Evidence: docs/PROJECT.md ruling R2
- Coverage: project-level R2

## Never becomes
- a hosted service

## Epics
| ID | Title | Record |
|---|---|---|
| E1 | Export | docs/epics/E1.md |
| E2 | Import v1 | docs/epics/E2.md |
| E3 | Import v2 | docs/epics/E3.md |

## Open issues
| Issue | Destination |
|---|---|
| #12 | member E1 |
| #13 | out of scope |
| #14 | post-done backlog |

## History
- docs/old-plan.md

## Rulings and returns
### R1 ruling, 2026-09-01T10:00:00Z
Kind: baseline
Items: ES1, ES2, ES3
By: owner
> approved

### R2 ruling, 2026-09-02T10:00:00Z
Kind: project-level
Items: ES3
By: owner
> checked at project level

### X1 return, 2026-09-10T10:00:00Z
Baseline: R1
Revision: abc123
Seat: reviewer-a
- ES1: PASS, evidence: tests/export.test.mjs:12
- ES2: PASS, evidence: tests/import.test.mjs:4
- ES3: PASS, evidence: docs/PROJECT.md:78
`,
  'docs/epics/E1.md': `# Epic E1: Export
State: Done
Certification target: def456
Combined check: node tests/export-all.mjs ; pass when it exits 0

## What this is
The export.

## Done means
### D1
- Outcome: the export writes a non-empty file
- Type: T1
- Check: run the export
- Control: an empty corpus fails
- Evidence: tests/export.test.mjs:12
- Coverage: p1: satisfy, p2: preserve

## Members
- phase p1: docs/records/p1.md
- phase p2
- issue #12

## Rulings and returns
### R1 ruling, 2026-09-01T10:00:00Z
Kind: baseline
Items: D1
By: owner
> approved: the combined check is node tests/export-all.mjs ; pass when it exits 0.

### Y0 return, 2026-09-03T10:00:00Z
Baseline: R1
Revision: 000aaa
Seat: reviewer-b
Combined check result: PASS, evidence: tests/export.test.mjs:12
- D1: PASS, evidence: tests/export.test.mjs:12

### R2 ruling, 2026-09-04T10:00:00Z
Kind: done-means-change
Items: D1
By: owner
> tighten D1

### R3 ruling, 2026-09-04T11:00:00Z
Kind: impact
Items: D1
By: owner
> p1 needs fresh evidence

### Y1 return, 2026-09-05T10:00:00Z
Baseline: R2
Revision: def456
Seat: reviewer-b
Combined check result: PASS, evidence: tests/export.test.mjs:12
- D1: PASS, evidence: tests/export.test.mjs:12
`,
  'docs/epics/E2.md': `# Epic E2: Import v1
State: Superseded
Certification target: none
Combined check: none

## What this is
The first import.

## Done means
### D2
- Outcome: import accepts v1
- Type: T1
- Check: import the v1 sample
- Control: a corrupt sample fails
- Evidence: tests/import.test.mjs:1
- Coverage: p3: contribute

## Members
- issue #9

## Rulings and returns
### R1 ruling, 2026-09-01T10:00:00Z
Kind: supersede
Successor: E3
By: owner
> replaced by v2
`,
  'docs/epics/E3.md': `# Epic E3: Import v2
State: Done
Certification target: 777bbb
Combined check: node tests/import-all.mjs ; pass when it exits 0

## What this is
The v2 import.

## Done means
### D3
- Outcome: import accepts v2
- Type: T1
- Check: import the v2 sample
- Control: the v1 sample is rejected
- Evidence: tests/import.test.mjs:4
- Coverage: p3: satisfy

## Members
- phase p3: docs/records/p3.md

## Rulings and returns
### R1 ruling, 2026-09-06T10:00:00Z
Kind: baseline
Items: D3
By: owner
> approved: the combined check is node tests/import-all.mjs ; pass when it exits 0.

### Z1 return, 2026-09-08T10:00:00Z
Baseline: R1
Revision: 777bbb
Seat: reviewer-c
Combined check result: PASS, evidence: tests/import.test.mjs:4
- D3: PASS, evidence: tests/import.test.mjs:4
`,
}

// A file whose value is null exists but cannot be read.
const build = (files) => modelFrom(files[PROJECT_PATH], (rel) => (Object.hasOwn(files, rel) ? files[rel] : null))
const existsIn = (files) => (rel) => Object.hasOwn(files, rel)
const run = (files) => check(build(files), existsIn(files))

/** One broken variant: each [file, from, to] must occur exactly once, so a fixture can never silently
 *  equal the good project because its anchor moved. */
const mutate = (edits, base = GOOD) => {
  const files = { ...base }
  for (const [file, from, to] of edits) {
    const hits = files[file].split(from).length - 1
    if (hits !== 1) throw new Error(`fixture anchor ${JSON.stringify(from)} occurs ${hits} times in ${file}`)
    files[file] = files[file].replace(from, to)
  }
  return files
}

// ---------------------------------------------------------------- T-parse
{
  const p = parseDoc(GOOD['docs/PROJECT.md'])
  const lineOf = (s) => GOOD['docs/PROJECT.md'].split('\n').findIndex((l) => l === s) + 1
  clause('T-parse 1 — headers carry value and line',
    p.headers.State.value === 'Done' && p.headers.State.line === 2 && p.headers['Current epic'].value === 'E3' && p.headers.Records.value === 'docs/records',
    JSON.stringify(p.headers))
  clause('T-parse 2 — end-state items carry ID, line, and every field with its own line',
    p.items.map((i) => i.id).join() === 'ES1,ES2,ES3' && p.items[0].line === lineOf('### ES1') &&
    p.items[1].fields.Coverage.value === 'satisfy E2; contribute E1' && p.items[1].fields.Coverage.line === lineOf('- Coverage: satisfy E2; contribute E1'),
    JSON.stringify(p.items.map((i) => [i.id, i.line])))
  clause('T-parse 3 — roster rows and issue rows, header and separator rows skipped',
    p.roster.length === 3 && p.roster[2].id === 'E3' && p.roster[2].record === 'docs/epics/E3.md' && p.roster[2].line === lineOf('| E3 | Import v2 | docs/epics/E3.md |') &&
    p.issues.length === 3 && p.issues[0].destination === 'member E1' && p.issues[1].line === lineOf('| #13 | out of scope |'),
    JSON.stringify({ roster: p.roster, issues: p.issues }))
  clause('T-parse 4 — entries: id, type, fields, per-item results with evidence, line numbers',
    p.entries.map((e) => `${e.id}/${e.type}`).join() === 'R1/ruling,R2/ruling,X1/return' &&
    p.entries[2].line === lineOf('### X1 return, 2026-09-10T10:00:00Z') && p.entries[2].fields.Revision.value === 'abc123' &&
    p.entries[2].results.length === 3 && p.entries[2].results[2].evidence === 'docs/PROJECT.md:78' && p.entries[2].results[0].line === lineOf('- ES1: PASS, evidence: tests/export.test.mjs:12'),
    JSON.stringify(p.entries))
  const e = parseDoc(GOOD['docs/epics/E1.md'])
  clause('T-parse 5 — epic heading and phase members, a phase with and without a record path',
    e.title.text === 'Epic E1: Export' && e.title.line === 1 &&
    e.phases.map((m) => m.name).join() === 'p1,p2' && e.phases[1].line === GOOD['docs/epics/E1.md'].split('\n').indexOf('- phase p2') + 1,
    JSON.stringify({ title: e.title, phases: e.phases }))
}

// ---------------------------------------------------------------- T-check, clause 2 (known good)
const goodFindings = run(GOOD)
clause('T-check good — the known-good project (Done, Done epic, Superseded epic with a Done successor, project-level item) has ZERO findings',
  goodFindings.length === 0, goodFindings.map(formatFinding).join(' | '))

// A second known-good base: formats.md's worked example with E1 moved to Done on a counting return.
// Kept apart from GOOD because its item IDs (ES1 in the project, D1 in the epic) are the shape of the
// defect a regression recorded against the end-state item ID used to hide.
const EXAMPLE = {
  'docs/PROJECT.md': `# Project: invoice-export
State: Ruled
Current epic: E1
Certification target: none
Records: .doctrine/records

## End state
### ES1
- Outcome: an accountant downloads last month's invoices as one CSV that their ledger imports without edits
- Type: T1
- Check: run the export on the fixture ledger and import the file
- Control: the import on a CSV with one column removed exits non-zero
- Evidence: the import transcript under .doctrine/records, cited as path:line
- Coverage: satisfy E1

## Epics
| ID | Title | Record |
|---|---|---|
| E1 | CSV export | docs/epics/E1.md |

## Rulings and returns
### P-R1 ruling, 2026-09-13T10:00:00Z
Kind: baseline
By: Dana
> Approve ES1 as the end state, satisfied by E1.
`,
  'docs/epics/E1.md': `# Epic E1: CSV export
State: Done
Certification target: abc123
Combined check: \`npm test -- export\` run against the merged export and CLI phases ; pass when it exits 0 and prints no skipped test

## Done means
### D1
- Outcome: the export command writes a CSV that the ledger accepts for the fixture month
- Type: T1
- Check: run the export then the strict import
- Control: the import rejects the fixture CSV with its date column removed
- Evidence: the import transcript under .doctrine/records, cited as path:line
- Coverage: export-core: satisfy, cli: contribute

## Members
- phase export-core: .doctrine/records/export-core.md
- phase cli

## Rulings and returns
### E1-R1 ruling, 2026-09-13T10:05:00Z
Kind: baseline
By: Dana
> D1 is the Done means for E1. The combined check is \`npm test -- export\` run against the merged export and CLI phases ; pass when it exits 0 and prints no skipped test.

### E1-X1 return, 2026-09-13T11:00:00Z
Baseline: E1-R1
Revision: abc123
Seat: reviewer
Combined check result: PASS, evidence: x
- D1: PASS, evidence: x
`,
}
const exampleFindings = run(EXAMPLE)
clause('T-check good — the Done worked example (end-state ES1, Done means D1) has ZERO findings',
  exampleFindings.length === 0, exampleFindings.map(formatFinding).join(' | '))

// Known-good histories: states a correct orchestrator reaches that an earlier revision of check refused.
const E1 = 'docs/epics/E1.md', E3 = 'docs/epics/E3.md'
const laterE1 = (dmcItems, results) => `\n### E1-R2 ruling, 2026-09-13T12:00:00Z\nKind: done-means-change\nItems: ${dmcItems}\nBy: Dana\n> change\n\n### E1-R3 ruling, 2026-09-13T12:01:00Z\nKind: impact\nItems: ${dmcItems}\nBy: Dana\n> impact accepted\n\n### E1-X2 return, 2026-09-13T13:00:00Z\nBaseline: E1-R2\nRevision: abc123\nSeat: reviewer\nCombined check result: PASS, evidence: x\n${results}`
// An item removed by a done-means-change ruling after a return that named it.
const REMOVED = mutate([[E1, '- D1: PASS, evidence: x\n', `- D1: PASS, evidence: x\n- D2: FAIL, evidence: y\n${laterE1('D2', '- D1: PASS, evidence: x\n')}`]], EXAMPLE)
// An item split by a done-means-change ruling, whose Items name the old ID and both new ones.
const SPLIT = mutate([[E1, '### D1\n', '### D1a\n'],
  [E1, '- Coverage: export-core: satisfy, cli: contribute\n', '- Coverage: export-core: satisfy, cli: contribute\n\n### D1b\n- Outcome: o\n- Type: T1\n- Check: c\n- Control: c\n- Evidence: e\n- Coverage: export-core: satisfy\n'],
  [E1, '- D1: PASS, evidence: x\n', '- D1: PASS, evidence: x\n' + laterE1('D1, D1a, D1b', '- D1a: PASS, evidence: x\n- D1b: PASS, evidence: x\n')]], EXAMPLE)
// A return recorded after that split, graded on the baseline it was briefed on (E1-R1) or on the split itself (E1-R2).
const lateReturn = (baseline) => mutate([[E1, '- D1b: PASS, evidence: x\n', `- D1b: PASS, evidence: x\n\n### E1-X3 return, 2026-09-13T14:00:00Z\nBaseline: ${baseline}\nRevision: abc123\nSeat: reviewer\nCombined check result: PASS, evidence: x\n- D1: FAIL, evidence: x\n`]], SPLIT)
const lateReturnShape = (baseline) => (f) => { const x = f[E1].indexOf('### E1-X3 return'), t = f[E1].slice(Math.max(0, x)); return x > f[E1].indexOf('### E1-R2 ruling') && t.includes(`\nBaseline: ${baseline}\n`) && /^- D1: FAIL/m.test(t) && !/^### D1$/m.test(f[E1]) }
// A failed project pass on an item whose satisfy epic E2 is Superseded by the Done E3: the owner first
// rules E3 as ES2's satisfy epic, then E3 is reopened by a regression (SKILL.md, exit passes step 5).
const failedPass = [[PROJECT_PATH, 'State: Done\nCurrent', 'State: Ruled\nCurrent'],
  [PROJECT_PATH, '- ES3: PASS, evidence: docs/PROJECT.md:78\n', '- ES3: PASS, evidence: docs/PROJECT.md:78\n\n### X2 return, 2026-09-11T10:00:00Z\nBaseline: R1\nRevision: abc123\nSeat: reviewer-z\n- ES1: PASS, evidence: a:1\n- ES2: FAIL, evidence: b:1\n- ES3: PASS, evidence: c:1\n'],
  [E3, 'State: Done', 'State: Open'],
  [E3, '- D3: PASS, evidence: tests/import.test.mjs:4\n', '- D3: PASS, evidence: tests/import.test.mjs:4\n\n### G1 regression, 2026-09-11T12:00:00Z\nItem: D3\nFound by: project pass X2\n> ES2 failed\n']]
const REOPENED_UNRULED = mutate(failedPass)
const REOPENED_RULED = mutate([...failedPass,
  [PROJECT_PATH, '- Coverage: satisfy E2; contribute E1', '- Coverage: satisfy E3; contribute E1'],
  [PROJECT_PATH, '- ES3: PASS, evidence: c:1\n', '- ES3: PASS, evidence: c:1\n\n### R3 ruling, 2026-09-11T11:00:00Z\nKind: coverage\nItems: ES2\nBy: owner\n> E3 is the satisfy epic for ES2\n']])
// Table rows in the other GFM forms: no leading or closing pipe, and up to three leading spaces.
const GFM_ROWS = mutate([[PROJECT_PATH, '| E1 | Export | docs/epics/E1.md |', 'E1 | Export | docs/epics/E1.md'],
  [PROJECT_PATH, '| E2 | Import v1 | docs/epics/E2.md |', '   | E2 | Import v1 | docs/epics/E2.md'],
  [PROJECT_PATH, '| #12 | member E1 |', '  #12 | member E1 |']])
for (const [name, files, shape] of [
  ['an item removed by a done-means-change ruling after a return that named it', REMOVED,
    (f) => !/^### D2$/m.test(f[E1]) && /^- D2: FAIL/m.test(f[E1]) && /Kind: done-means-change\nItems: D2$/m.test(f[E1]) && f[E1].indexOf('- D2: FAIL') < f[E1].indexOf('### E1-R2 ruling')],
  ['an item split by a done-means-change ruling after a return that named it', SPLIT,
    (f) => !/^### D1$/m.test(f[E1]) && /^### D1a$/m.test(f[E1]) && /^### D1b$/m.test(f[E1]) && f[E1].indexOf('- D1: PASS') < f[E1].indexOf('### E1-R2 ruling') && /Items: D1, D1a, D1b$/m.test(f[E1])],
  ['a return recorded after that split, on the baseline written before it, naming the retired ID', lateReturn('E1-R1'), lateReturnShape('E1-R1')],
  ['a Superseded satisfy epic\'s chain end reopened after the owner ruled it the satisfy epic', REOPENED_RULED,
    (f) => /^- Coverage: satisfy E3; contribute E1$/m.test(f[PROJECT_PATH]) && /^State: Open$/m.test(f[E3]) && /^Item: D3$/m.test(f[E3]) && /^State: Superseded$/m.test(f['docs/epics/E2.md'])],
  ['table rows with no leading or closing pipe and up to three leading spaces', GFM_ROWS,
    (f) => /^E1 \| Export \| docs\/epics\/E1\.md$/m.test(f[PROJECT_PATH]) && /^ {3}\| E2 \| Import v1 \| docs\/epics\/E2\.md$/m.test(f[PROJECT_PATH]) && /^ {2}#12 \| member E1 \|$/m.test(f[PROJECT_PATH])],
  ['a roster row whose Title cell carries an escaped pipe', mutate([[PROJECT_PATH, '| E1 | Export | docs/epics/E1.md |', '| E1 | Export \\| CSV | docs/epics/E1.md |']]),
    (f) => f[PROJECT_PATH].includes('| E1 | Export \\| CSV | docs/epics/E1.md |')],
  // A `note` ruling after the counting return of a Done epic: legal, and it voids nothing. Written as
  // a `baseline` ruling the same decision would become the current baseline and stop that return
  // counting, which is the defect the Kind exists to prevent, so the epic staying Done with zero
  // findings is the whole claim.
  // Three boundaries a red team found unpinned: the rule reaches only returns that COUNT, it decides
  // only in Done, and a note ruling may name items.
  ['an obsolete return with no Combined check result line, under a counting one that has it', mutate([[E1,
    '### Y0 return, 2026-09-03T10:00:00Z\nBaseline: R1\nRevision: 000aaa\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n',
    '### Y0 return, 2026-09-03T10:00:00Z\nBaseline: R1\nRevision: 000aaa\nSeat: reviewer-b\n']]),
    (f) => { const t = f[E1], y0 = t.slice(t.indexOf('### Y0 return'), t.indexOf('### R2 ruling')); return !/Combined check result:/.test(y0) && /^Certification target: def456$/m.test(t) && /Combined check result: PASS/.test(t.slice(t.indexOf('### Y1 return'))) }],
  ['an Open epic whose counting return records a FAILED combined check', mutate([[PROJECT_PATH, 'State: Done', 'State: Ruled'], [E1, 'State: Done', 'State: Open'],
    [E1, 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS,', 'Revision: def456\nSeat: reviewer-b\nCombined check result: FAIL,']]),
    (f) => /^State: Open$/m.test(f[E1]) && /^State: Ruled$/m.test(f[PROJECT_PATH]) && /^Combined check result: FAIL, evidence: \S/m.test(f[E1])],
  // Two more boundaries, each a SIBLING of one already pinned: the fixtures above varied one thing at
  // a time, so an implementation wrong in a neighbouring way passed them. Here a return stops counting
  // by REGRESSION alone, with its Baseline and Revision both still current, and a return that never
  // counted sits AFTER the one that does.
  ['a return obsolete by a later regression alone, with no Combined check result line', mutate([
    [PROJECT_PATH, 'State: Done', 'State: Ruled'], [E1, 'State: Done', 'State: Open'],
    [E1, 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\n'],
    [E1, 'Revision: def456\nSeat: reviewer-b\n- D1: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### G9 regression, 2026-09-07T10:00:00Z\nItem: D1\nFound by: exit pass\n> seam broke\n']]),
    (f) => { const t = f[E1], y1 = t.slice(t.indexOf('### Y1 return')); return /^State: Open$/m.test(t) && !/Combined check result:/.test(y1) && /^Baseline: R2$/m.test(y1) && /^Revision: def456$/m.test(y1) && /^Certification target: def456$/m.test(t) && t.indexOf('### G9 regression') > t.indexOf('### Y1 return') }],
  // `counts` has three conditions and each now has its own fixture isolating it, so no implementation
  // that drops one of them passes this suite. This one: the Revision is the current target and no
  // regression follows, and only the stale Baseline takes the return out of the rule's reach.
  ['a return obsolete by baseline alone, with no Combined check result line', mutate([[E1,
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n',
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### Y4 return, 2026-09-09T12:00:00Z\nBaseline: R1\nRevision: def456\nSeat: reviewer-f\n- D1: PASS, evidence: tests/export.test.mjs:12\n']]),
    (f) => { const t = f[E1], y4 = t.slice(t.indexOf('### Y4 return')); return /^State: Done$/m.test(t) && /^Certification target: def456$/m.test(t) && /^Baseline: R1$/m.test(y4) && /^Revision: def456$/m.test(y4) && !/Combined check result:/.test(y4) && !/ regression,/.test(t) }],
  // The third way a return stops counting, isolated like the other two: its Baseline is still current
  // and no regression follows it, but a pass has opened on a NEWER revision. A skip condition missing
  // the revision test alone passes every other fixture here.
  ['a return obsolete by revision alone, with no Combined check result line', mutate([
    [PROJECT_PATH, 'State: Done', 'State: Ruled'], [E1, 'State: Done', 'State: Open'],
    [E1, 'Certification target: def456', 'Certification target: 999zzz'],
    [E1, 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\n']]),
    (f) => { const t = f[E1], y1 = t.slice(t.indexOf('### Y1 return')); return /^State: Open$/m.test(t) && /^Certification target: 999zzz$/m.test(t) && /^Baseline: R2$/m.test(y1) && /^Revision: def456$/m.test(y1) && !/Combined check result:/.test(y1) && !/ regression,/.test(t) }],
  ['a later return that does not count, carrying a FAILED combined check, under a Done epic', mutate([[E1,
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n',
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### Y3 return, 2026-09-09T10:00:00Z\nBaseline: R1\nRevision: 000aaa\nSeat: reviewer-e\nCombined check result: FAIL, evidence: tests/seam.test.mjs:3\n- D1: PASS, evidence: tests/export.test.mjs:12\n']]),
    (f) => { const t = f[E1]; return /^State: Done$/m.test(t) && t.indexOf('### Y3 return') > t.indexOf('### Y1 return') && /^Combined check result: FAIL/m.test(t) && /^Certification target: def456$/m.test(t) && /### Y3 return[\s\S]*?^Revision: 000aaa$/m.test(t) }],
  ['a note ruling whose Items name a live item', mutate([[E1,
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n',
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### R5 ruling, 2026-09-06T13:00:00Z\nKind: note\nItems: D1\nBy: owner\n> the slow-path finding on D1 is closed\n']]),
    (f) => /Kind: note\nItems: D1\n/.test(f[E1]) && /^### D1$/m.test(f[E1])],
  ['a note ruling written after the counting return of a Done epic', mutate([[E1,
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n',
    'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### R4 ruling, 2026-09-06T12:00:00Z\nKind: note\nBy: owner\n> shipped at the alarm with the slow-path defect open\n']]),
    (f) => /Kind: note\n/.test(f[E1]) && f[E1].indexOf('Kind: note') > f[E1].indexOf('### Y1 return') && /^State: Done$/m.test(f[E1])],
]) {
  clause(`known good — ${name} [3: the fixture has that shape]`, shape(files), 'fixture')
  const fs2 = run(files)
  clause(`known good — ${name} [2: ZERO findings]`, fs2.length === 0, fs2.map(formatFinding).join(' | '))
}

// ---------------------------------------------------------------- T-check, clauses 1 and 3 per rule
// Each case: the edits, the rule and a message fragment only that branch prints, the path the
// finding must name, and a proof on the fixture TEXT (clause 3) that uses no checker code.
const P = 'docs/PROJECT.md'
const txt = (files, f) => files[f]
const LONG = 'R2' + 'a'.repeat(25)
/** GOOD with one more ruling, R3, after the project return. */
const addRuling = (body) => [[P, '- ES3: PASS, evidence: docs/PROJECT.md:78\n', `- ES3: PASS, evidence: docs/PROJECT.md:78\n\n### R3 ruling, 2026-09-11T10:00:00Z\n${body}By: owner\n> ruled\n`]]
const CASES = [
  { name: 'state — a project State outside Proposed, Ruled, Done', rule: 'state', frag: 'project State', at: P,
    edits: [[P, 'State: Done\nCurrent', 'State: Archived\nCurrent']],
    defect: (f) => /^State: Archived$/m.test(txt(f, P)) && !['Proposed', 'Ruled', 'Done'].includes('Archived') },
  { name: 'state — an epic State outside the six', rule: 'state', frag: 'epic State', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Unverified']],
    defect: (f) => /^State: Unverified$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done with no baseline ruling', rule: 'evidence', frag: 'no baseline ruling', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'Kind: baseline', 'Kind: note']],
    defect: (f) => !/^Kind: baseline$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Open or Done with no phase member', rule: 'evidence', frag: 'no phase member', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- phase p3: docs/records/p3.md', '- issue #40']],
    defect: (f) => !/^- phase /m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done with Combined check none (W1)', rule: 'evidence', frag: 'Combined check none', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'Combined check: node tests/import-all.mjs ; pass when it exits 0', 'Combined check: none']],
    defect: (f) => /^Combined check: none$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Not started with Combined check absent (W1)', rule: 'evidence', frag: 'Combined check absent', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Not started'], ['docs/epics/E3.md', 'Combined check: node tests/import-all.mjs ; pass when it exits 0\n', '']],
    defect: (f) => !/^Combined check:/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done whose only return is on a stale revision', rule: 'evidence', frag: 'counting return', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'Revision: 777bbb', 'Revision: 666ccc']],
    defect: (f) => /^Certification target: 777bbb$/m.test(txt(f, 'docs/epics/E3.md')) && /^Revision: 666ccc$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done whose return is on a superseded baseline', rule: 'evidence', frag: 'counting return', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Baseline: R2', 'Baseline: R1']],
    defect: (f) => (txt(f, 'docs/epics/E1.md').match(/^Baseline: R1$/gm) || []).length === 2 && /Kind: done-means-change/.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'evidence — a regression after the return voids it (Done to Open)', rule: 'evidence', frag: 'counting return', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- D3: PASS, evidence: tests/import.test.mjs:4\n', '- D3: PASS, evidence: tests/import.test.mjs:4\n\n### G1 regression, 2026-09-09T10:00:00Z\nItem: D3\nFound by: project pass\n> v2 sample rejected\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E3.md'); return t.indexOf('### G1 regression') > t.indexOf('### Z1 return') && /^Item: D3$/m.test(t) } },
  { name: 'evidence — a PASS with an empty evidence reference counts as UNVERIFIED', rule: 'evidence', frag: 'counting return', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- D3: PASS, evidence: tests/import.test.mjs:4', '- D3: PASS, evidence:']],
    defect: (f) => /^- D3: PASS, evidence:$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Dropped without a drop ruling', rule: 'evidence', frag: 'no drop ruling', at: 'docs/epics/E2.md',
    edits: [['docs/epics/E2.md', 'State: Superseded', 'State: Dropped'], [P, 'satisfy E2; contribute E1', 'satisfy E3']],
    defect: (f) => /^State: Dropped$/m.test(txt(f, 'docs/epics/E2.md')) && !/^Kind: drop$/m.test(txt(f, 'docs/epics/E2.md')) },
  { name: 'evidence — an epic Superseded whose Successor is not on the roster', rule: 'evidence', frag: 'Successor', at: 'docs/epics/E2.md',
    edits: [['docs/epics/E2.md', 'Successor: E3', 'Successor: E9'], [P, 'satisfy E2; contribute E1', 'satisfy E3']],
    defect: (f) => /^Successor: E9$/m.test(txt(f, 'docs/epics/E2.md')) && !/^\| E9 \|/m.test(txt(f, P)) },
  { name: 'evidence — a project with no end-state item', rule: 'evidence', frag: 'no end-state item', at: P,
    edits: [[P, '## End state\n', '## End state\n\n## Parked\n']],
    defect: (f) => { const t = txt(f, P); const s = t.slice(t.indexOf('## End state'), t.indexOf('## Parked')); return !/^### /m.test(s) } },
  { name: 'evidence — a project Ruled or Done with no baseline ruling', rule: 'evidence', frag: 'no baseline ruling', at: P,
    edits: [[P, 'Kind: baseline', 'Kind: note']],
    defect: (f) => !/^Kind: baseline$/m.test(txt(f, P)) },
  { name: 'evidence — a project Done while a roster epic is Open', rule: 'evidence', frag: 'not Done, Dropped or Superseded', at: P,
    edits: [['docs/epics/E1.md', 'State: Done', 'State: Open']],
    defect: (f) => /^State: Done$/m.test(txt(f, P)) && /^State: Open$/m.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'evidence — a project Done without a PASS for every end-state item', rule: 'evidence', frag: 'counting project return', at: P,
    edits: [[P, '- ES3: PASS, evidence: docs/PROJECT.md:78', '- ES3: FAIL, evidence: docs/PROJECT.md:78']],
    defect: (f) => /^- ES3: FAIL/m.test(txt(f, P)) },
  { name: 'roster — a Record path that does not resolve', rule: 'roster', frag: 'does not resolve', at: P,
    edits: [[P, '| E1 | Export | docs/epics/E1.md |', '| E1 | Export | docs/epics/missing.md |']],
    defect: (f) => /docs\/epics\/missing\.md/.test(txt(f, P)) && !('docs/epics/missing.md' in f) },
  { name: 'roster — a record whose heading names a different ID', rule: 'roster', frag: 'headed', at: P,
    edits: [['docs/epics/E3.md', '# Epic E3: Import v2', '# Epic E4: Import v2']],
    defect: (f) => /^# Epic E4:/m.test(txt(f, 'docs/epics/E3.md')) && /\| E3 \| Import v2 \| docs\/epics\/E3\.md \|/.test(txt(f, P)) },
  { name: 'roster — a duplicate ID', rule: 'roster', frag: 'duplicate', at: P,
    edits: [[P, '| E3 | Import v2 | docs/epics/E3.md |', '| E3 | Import v2 | docs/epics/E3.md |\n| E1 | Export again | docs/epics/E1.md |']],
    defect: (f) => (txt(f, P).match(/^\| E1 \|/gm) || []).length === 2 },
  { name: 'coverage — an end-state item with no satisfy and no project-level', rule: 'coverage', frag: 'no satisfy epic and no project-level', at: P,
    edits: [[P, '- Coverage: satisfy E1\n', '- Coverage: contribute E1\n']],
    defect: (f) => /^- Coverage: contribute E1$/m.test(txt(f, P)) },
  { name: 'coverage — more than one satisfy epic (ER2)', rule: 'coverage', frag: 'more than one satisfy', at: P,
    edits: [[P, '- Coverage: satisfy E1\n', '- Coverage: satisfy E1; satisfy E3\n']],
    defect: (f) => /^- Coverage: satisfy E1; satisfy E3$/m.test(txt(f, P)) },
  { name: 'coverage — a satisfy epic not on the roster', rule: 'coverage', frag: 'not on the roster', at: P,
    edits: [[P, '- Coverage: satisfy E1\n', '- Coverage: satisfy E9\n']],
    defect: (f) => /^- Coverage: satisfy E9$/m.test(txt(f, P)) && !/^\| E9 \|/m.test(txt(f, P)) },
  { name: 'coverage — a satisfy epic that is Dropped', rule: 'coverage', frag: 'is Dropped', at: P,
    edits: [['docs/epics/E2.md', 'State: Superseded', 'State: Dropped'], ['docs/epics/E2.md', 'Kind: supersede', 'Kind: drop']],
    defect: (f) => /^State: Dropped$/m.test(txt(f, 'docs/epics/E2.md')) && /satisfy E2/.test(txt(f, P)) },
  { name: 'coverage — a Superseded satisfy epic whose successor is not Done (ER3)', rule: 'coverage', frag: 'successor chain does not end at a Done epic; the fix is a coverage ruling naming E3, the Open epic at the end of the chain, as this item\'s satisfy epic', at: P,
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Open'], [P, 'State: Done\nCurrent', 'State: Ruled\nCurrent']],
    defect: (f) => /^State: Superseded$/m.test(txt(f, 'docs/epics/E2.md')) && /^Successor: E3$/m.test(txt(f, 'docs/epics/E2.md')) && /^State: Open$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'coverage — a Superseded chain that loops never reaches Done', rule: 'coverage', frag: 'it loops back to E2, so nothing on it can reach Done and the fix is a new epic on the roster and a coverage ruling naming it', at: P,
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Superseded'], ['docs/epics/E3.md', 'Kind: baseline', 'Kind: supersede\nSuccessor: E2'], [P, 'State: Done\nCurrent', 'State: Proposed\nCurrent']],
    defect: (f) => /^Successor: E2$/m.test(txt(f, 'docs/epics/E3.md')) && /^Successor: E3$/m.test(txt(f, 'docs/epics/E2.md')) },
  { name: 'coverage — project-level naming no project-level ruling that lists the item', rule: 'coverage', frag: 'project-level ruling', at: P,
    edits: [[P, '- Coverage: project-level R2', '- Coverage: project-level R1']],
    defect: (f) => /^- Coverage: project-level R1$/m.test(txt(f, P)) && /### R1 ruling[^\n]*\nKind: baseline/.test(txt(f, P)) },
  { name: 'coverage — an epic item with an empty Coverage', rule: 'coverage', frag: 'empty Coverage', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '- Coverage: p1: satisfy, p2: preserve', '- Coverage:']],
    defect: (f) => /^- Coverage:$/m.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'coverage — one phase given two obligations for one item (W2)', rule: 'coverage', frag: 'two obligations', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '- Coverage: p1: satisfy, p2: preserve', '- Coverage: p1: satisfy, p1: preserve']],
    defect: (f) => (txt(f, 'docs/epics/E1.md').match(/p1: /g) || []).length >= 2 && /- Coverage: p1: satisfy, p1: preserve/.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'item — an item missing one of the seven fields', rule: 'item', frag: 'missing Control', at: P,
    edits: [[P, '- Control: an empty corpus makes the check fail\n', '']],
    defect: (f) => { const t = txt(f, P); const s = t.slice(t.indexOf('### ES1'), t.indexOf('### ES2')); return !/^- Control:/m.test(s) } },
  { name: 'item — a Type outside T1 to T4', rule: 'item', frag: 'Type', at: P,
    edits: [[P, '- Type: T4', '- Type: T5']],
    defect: (f) => /^- Type: T5$/m.test(txt(f, P)) },
  { name: 'impact — a done-means-change with no later impact ruling (W3, ER7)', rule: 'impact', frag: 'impact', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Kind: impact', 'Kind: note']],
    defect: (f) => /Kind: done-means-change/.test(txt(f, 'docs/epics/E1.md')) && !/Kind: impact/.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'issues — a Destination outside the three forms', rule: 'issues', frag: 'Destination', at: P,
    edits: [[P, '| #13 | out of scope |', '| #13 | wontfix |']],
    defect: (f) => /\| #13 \| wontfix \|/.test(txt(f, P)) },
  { name: 'issues — member naming an epic not on the roster', rule: 'issues', frag: 'not on the roster', at: P,
    edits: [[P, '| #12 | member E1 |', '| #12 | member E9 |']],
    defect: (f) => /\| #12 \| member E9 \|/.test(txt(f, P)) && !/^\| E9 \|/m.test(txt(f, P)) },
  { name: 'pointer — Current epic neither none nor a roster epic (ER5)', rule: 'pointer', frag: 'Current epic', at: P,
    edits: [[P, 'Current epic: E3', 'Current epic: E9']],
    defect: (f) => /^Current epic: E9$/m.test(txt(f, P)) && !/^\| E9 \|/m.test(txt(f, P)) },
  { name: 'id — a phase name outside the pattern', rule: 'id', frag: 'phase name', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '- phase p2\n', '- phase p.2\n']],
    defect: (f) => /^- phase p\.2$/m.test(txt(f, 'docs/epics/E1.md')) && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test('p.2') },
  { name: 'id — an entry ID longer than 24 characters', rule: 'id', frag: 'entry ID', at: P,
    edits: [[P, '### R2 ruling', `### ${LONG} ruling`], [P, '- Coverage: project-level R2', `- Coverage: project-level ${LONG}`]],
    defect: (f) => new RegExp(`^### ${LONG} ruling`, 'm').test(txt(f, P)) && LONG.length > 24 },
  { name: 'id — a duplicate item ID within one file', rule: 'id', frag: 'duplicate item ID', at: P,
    edits: [[P, '### ES2\n', '### ES1\n']],
    defect: (f) => (txt(f, P).match(/^### ES1$/gm) || []).length === 2 },
  { name: 'id — a duplicate entry ID within one file', rule: 'id', frag: 'duplicate entry ID', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '### Z1 return', '### R1 return']],
    defect: (f) => (txt(f, 'docs/epics/E3.md').match(/^### R1 /gm) || []).length === 2 },
  { name: 'evidence — an epic Done with no Done means item', rule: 'evidence', frag: 'no Done means item', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '## Done means\n', '## Done means\n\n## Parked\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E3.md'); return /^State: Done$/m.test(t) && !/^### /m.test(t.slice(t.indexOf('## Done means'), t.indexOf('## Parked'))) } },
  { name: 'reference — a regression recorded against the end-state item ID in the satisfy epic record', rule: 'reference', frag: 'regression E1-G1 Item names "ES1"', at: 'docs/epics/E1.md', base: EXAMPLE,
    edits: [['docs/epics/E1.md', '- D1: PASS, evidence: x\n', '- D1: PASS, evidence: x\n\n### E1-G1 regression, 2026-09-13T12:00:00Z\nItem: ES1\nFound by: project pass\n> import failed\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'); return /^Item: ES1$/m.test(t) && !/^### ES1$/m.test(t) && t.indexOf('### E1-G1 regression') > t.indexOf('### E1-X1 return') } },
  { name: 'reference — a return result for an item its file does not define', rule: 'reference', frag: 'return Z1 result names "D9"', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- D3: PASS, evidence: tests/import.test.mjs:4', '- D3: PASS, evidence: tests/import.test.mjs:4\n- D9: FAIL, evidence: x']],
    defect: (f) => /^- D9: FAIL/m.test(txt(f, 'docs/epics/E3.md')) && !/^### D9$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'reference — a ruling Items naming an item its file does not define', rule: 'reference', frag: 'impact ruling R3 Items names "D7"', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Kind: impact\nItems: D1', 'Kind: impact\nItems: D1, D7']],
    defect: (f) => /^Items: D1, D7$/m.test(txt(f, 'docs/epics/E1.md')) && !/^### D7$/m.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'reference — a done-means-change ruling with no Items', rule: 'reference', frag: 'has no Items', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Kind: done-means-change\nItems: D1\n', 'Kind: done-means-change\nItems:\n']],
    defect: (f) => /Kind: done-means-change\nItems:\n/.test(txt(f, 'docs/epics/E1.md')) },
  // The epic exit pass runs the epic's combined check and the return carries the result (owner ruling,
  // 2026-09-14). Three branches: the line absent, the line unreadable, and a Done epic decided by a
  // return that did not pass it.
  { name: 'entry — an epic return with no Combined check result line', rule: 'entry', frag: 'return Y1 has no Combined check result line', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'), y1 = t.slice(t.indexOf('### Y1 return')); return y1.length > 0 && !/^Combined check result:/m.test(y1) && /^- D1: PASS/m.test(y1) } },
  { name: 'entry — an epic return whose Combined check result is outside PASS, FAIL, UNVERIFIED', rule: 'entry', frag: 'Combined check result is "PASSED"', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS,', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASSED,']],
    defect: (f) => /^Combined check result: PASSED, evidence: \S/m.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'evidence — a Done epic whose counting return did not pass the combined check', rule: 'evidence', frag: 'has Combined check result FAIL, not PASS', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS,', 'Revision: def456\nSeat: reviewer-b\nCombined check result: FAIL,']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'); return /^State: Done$/m.test(t) && /^Certification target: def456$/m.test(t) && /^Combined check result: FAIL, evidence: \S/m.test(t) && /^- D1: PASS/m.test(t) } },
  // A LIVE pass, on an epic that is not Done: the missing-line and bad-result cases above both sat on
  // a Done epic, so a validator narrowed to Done epics passed every one of them.
  { name: 'entry — an OPEN epic\'s counting return with no Combined check result line', rule: 'entry', frag: 'return Y1 has no Combined check result line', at: 'docs/epics/E1.md',
    edits: [[P, 'State: Done', 'State: Ruled'], ['docs/epics/E1.md', 'State: Done', 'State: Open'],
      ['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'), y1 = t.slice(t.indexOf('### Y1 return')); return /^State: Open$/m.test(t) && !/^Combined check result:/m.test(y1) && /^Certification target: def456$/m.test(t) && /^Revision: def456$/m.test(y1) } },
  { name: 'reference — a note ruling whose Items name an item its file does not define', rule: 'reference', frag: 'note ruling R5 Items names "D9"', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '### R3 ruling, 2026-09-04T11:00:00Z', '### R5 ruling, 2026-09-04T10:30:00Z\nKind: note\nItems: D9\nBy: owner\n> a finding ruled closed\n\n### R3 ruling, 2026-09-04T11:00:00Z']],
    defect: (f) => /Kind: note\nItems: D9\n/.test(txt(f, 'docs/epics/E1.md')) && !/^### D9$/m.test(txt(f, 'docs/epics/E1.md')) },
  // Two returns that both count, the later one failing the combined check. Without this the fixture
  // had a single counting return, where "the latest counting return decides" and "any counting return
  // decides" are the same sentence and a swap between them is invisible.
  { name: 'evidence — a later counting return whose combined check FAILED decides, though an earlier counting one passed it', rule: 'evidence', frag: 'counting return Y2 has Combined check result FAIL, not PASS', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### Y2 return, 2026-09-05T11:00:00Z\nBaseline: R2\nRevision: def456\nSeat: reviewer-d\nCombined check result: FAIL, evidence: tests/seam.test.mjs:3\n- D1: PASS, evidence: tests/export.test.mjs:12\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'); return t.indexOf('### Y2 return') > t.indexOf('### Y1 return') && (t.match(/^Baseline: R2$/gm) || []).length === 2 && (t.match(/^Revision: def456$/gm) || []).length === 2 && /^Combined check result: FAIL, evidence: \S/m.test(t) && !/ regression,/.test(t) && /^State: Done$/m.test(t) } },
  { name: 'evidence — a Done epic whose combined check PASS carries no evidence reference', rule: 'evidence', frag: 'has Combined check result UNVERIFIED, not PASS', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence:\n']],
    defect: (f) => { const t = txt(f, 'docs/epics/E1.md'); return /^State: Done$/m.test(t) && /^Combined check result: PASS, evidence:$/m.test(t) && !/^Combined check result: PASS, evidence: \S/m.test(t.slice(t.indexOf('### Y1 return'))) } },
  { name: 'reference — a return Baseline naming a ruling that is not a baseline or done-means-change', rule: 'reference', frag: 'Baseline R3', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Baseline: R1', 'Baseline: R3']],
    defect: (f) => /^Baseline: R3$/m.test(txt(f, 'docs/epics/E1.md')) && /### R3 ruling[^\n]*\nKind: impact/.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'evidence — a later counting project return with a FAIL decides, though an earlier one passed every item', rule: 'evidence', frag: 'counting project return', at: P,
    edits: [[P, '- ES3: PASS, evidence: docs/PROJECT.md:78\n', '- ES3: PASS, evidence: docs/PROJECT.md:78\n\n### X2 return, 2026-09-11T10:00:00Z\nBaseline: R1\nRevision: abc123\nSeat: reviewer-z\n- ES1: FAIL, evidence: tests/export.test.mjs:12\n- ES2: PASS, evidence: tests/import.test.mjs:4\n- ES3: PASS, evidence: docs/PROJECT.md:78\n']],
    defect: (f) => { const t = txt(f, P); return t.indexOf('### X2 return') > t.indexOf('### X1 return') && (t.match(/^Baseline: R1$/gm) || []).length === 2 && (t.match(/^Revision: abc123$/gm) || []).length === 2 && /^Certification target: abc123$/m.test(t) && /^- ES1: FAIL/m.test(t) && !/ regression,/.test(t) && !/Kind: done-means-change/.test(t) } },
  { name: 'item — an epic Coverage obligation outside satisfy, contribute, preserve (W2)', rule: 'item', frag: 'Coverage part "p2: none"', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '- Coverage: p1: satisfy, p2: preserve', '- Coverage: p1: satisfy, p2: none']],
    defect: (f) => /^- Coverage: p1: satisfy, p2: none$/m.test(txt(f, 'docs/epics/E1.md')) && !['satisfy', 'contribute', 'preserve'].includes('none') },
  { name: 'coverage — a project Coverage part whose keyword is outside the four', rule: 'coverage', frag: 'Coverage part "contibute E1"', at: P,
    edits: [[P, '- Coverage: satisfy E2; contribute E1', '- Coverage: satisfy E2; contibute E1']],
    defect: (f) => /^- Coverage: satisfy E2; contibute E1$/m.test(txt(f, P)) },
  { name: 'entry — a ruling Kind outside the eleven', rule: 'entry', frag: 'Kind "impacts"', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', 'Kind: impact', 'Kind: impacts']],
    defect: (f) => /^Kind: impacts$/m.test(txt(f, 'docs/epics/E1.md')) && !['baseline', 'done-means-change', 'impact', 'drop', 'supersede', 'project-level', 'coverage', 'destination', 'cutover', 'scope', 'note'].includes('impacts') },
  { name: 'entry — a return result outside PASS, FAIL, UNVERIFIED', rule: 'entry', frag: 'is "PASSED"', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- D3: PASS, evidence: tests/import.test.mjs:4', '- D3: PASSED, evidence: tests/import.test.mjs:4']],
    defect: (f) => /^- D3: PASSED, /m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'entry — a heading in Rulings and returns that is not <entry ID> ruling|return|regression, <time>', rule: 'entry', frag: 'heading of R3', at: 'docs/epics/E1.md',
    edits: [['docs/epics/E1.md', '### R3 ruling, 2026-09-04T11:00:00Z', '### R3 rulling, 2026-09-04T11:00:00Z']],
    defect: (f) => /^### R3 rulling, /m.test(txt(f, 'docs/epics/E1.md')) },
  { name: 'roster — a record that exists and cannot be read', rule: 'roster', frag: 'could not be read', at: P, edits: [], nullify: ['docs/epics/E3.md'],
    defect: (f) => Object.hasOwn(f, 'docs/epics/E3.md') && f['docs/epics/E3.md'] === null && /\| E3 \| Import v2 \| docs\/epics\/E3\.md \|/.test(f[P]) },
  // Repairs of 2026-09-13, third round.
  { name: 'reference — a regression Item naming the end-state ID, in an epic record whose done-means-change ruling names other items', rule: 'reference', frag: 'regression G2 Item names "ES1"', at: E1,
    edits: [[E1, 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n', 'Revision: def456\nSeat: reviewer-b\nCombined check result: PASS, evidence: tests/export.test.mjs:12\n- D1: PASS, evidence: tests/export.test.mjs:12\n\n### G2 regression, 2026-09-06T10:00:00Z\nItem: ES1\nFound by: project pass\n> export empty\n']],
    defect: (f) => { const t = txt(f, E1); return /^Item: ES1$/m.test(t) && !/^### ES1$/m.test(t) && /Kind: done-means-change\nItems: D1\n/.test(t) && !/^Items: .*\bES1\b/m.test(t) } },
  { name: 'coverage — a Superseded satisfy epic\'s chain end reopened by a regression before the owner ruled it the satisfy epic', rule: 'coverage', frag: 'the fix is a coverage ruling naming E3', at: P, edits: failedPass,
    defect: (f) => /^- Coverage: satisfy E2; contribute E1$/m.test(txt(f, P)) && /^Successor: E3$/m.test(txt(f, 'docs/epics/E2.md')) && /^State: Open$/m.test(txt(f, E3)) && /^Item: D3$/m.test(txt(f, E3)) },
  { name: 'evidence — a roster row with no closing pipe is read (a Done project with an Open epic)', rule: 'evidence', frag: 'epic E1 is Open', at: P,
    edits: [[P, '| E1 | Export | docs/epics/E1.md |', '| E1 | Export | docs/epics/E1.md'], [E1, 'State: Done', 'State: Open']],
    defect: (f) => /^\| E1 \| Export \| docs\/epics\/E1\.md$/m.test(txt(f, P)) && /^State: Done$/m.test(txt(f, P)) && /^State: Open$/m.test(txt(f, E1)) },
  { name: 'evidence — an indented roster row is read (a Done project with an Open epic)', rule: 'evidence', frag: 'epic E1 is Open', at: P,
    edits: [[P, '| E1 | Export | docs/epics/E1.md |', '  | E1 | Export | docs/epics/E1.md |'], [E1, 'State: Done', 'State: Open']],
    defect: (f) => /^ {2}\| E1 \| Export \| docs\/epics\/E1\.md \|$/m.test(txt(f, P)) && /^State: Done$/m.test(txt(f, P)) && /^State: Open$/m.test(txt(f, E1)) },
  { name: 'issues — an issue row with no closing pipe is read', rule: 'issues', frag: 'issue #13 has Destination "wontfix"', at: P,
    edits: [[P, '| #13 | out of scope |', '| #13 | wontfix']],
    defect: (f) => /^\| #13 \| wontfix$/m.test(txt(f, P)) },
  { name: 'roster — a line in ## Epics that is not a table row', rule: 'roster', frag: '## Epics line "E4 Export docs/epics/E4.md"', at: P,
    edits: [[P, '| E3 | Import v2 | docs/epics/E3.md |\n', '| E3 | Import v2 | docs/epics/E3.md |\nE4 Export docs/epics/E4.md\n']],
    defect: (f) => /^E4 Export docs\/epics\/E4\.md$/m.test(txt(f, P)) && !/^E4 .*\|/m.test(txt(f, P)) },
  { name: 'issues — a line in ## Open issues that is not a table row', rule: 'issues', frag: '## Open issues line "    | #15 | wontfix |"', at: P,
    edits: [[P, '| #14 | post-done backlog |\n', '| #14 | post-done backlog |\n    | #15 | wontfix |\n']],
    defect: (f) => /^ {4}\| #15 \| wontfix \|$/m.test(txt(f, P)) },
  { name: 'item — an indented field line in ## End state', rule: 'item', frag: '## End state line "  - Coverage: satisfy E9"', at: P,
    edits: [[P, '- Coverage: satisfy E1\n', '- Coverage: satisfy E1\n  - Coverage: satisfy E9\n']],
    defect: (f) => /^ {2}- Coverage: satisfy E9$/m.test(txt(f, P)) },
  { name: 'item — a field outside the six in ## End state', rule: 'item', frag: '## End state line "- Note: x"', at: P,
    edits: [[P, '- Coverage: satisfy E1\n', '- Coverage: satisfy E1\n- Note: x\n']],
    defect: (f) => /^- Note: x$/m.test(txt(f, P)) && !['Outcome', 'Type', 'Check', 'Control', 'Evidence', 'Coverage'].includes('Note') },
  { name: 'members — a line in ## Members that is not a phase or an issue', rule: 'members', frag: '## Members line "-phase p9"', at: E1,
    edits: [[E1, '- phase p2\n', '- phase p2\n-phase p9\n']],
    defect: (f) => /^-phase p9$/m.test(txt(f, E1)) },
  { name: 'entry — an indented result line in a return', rule: 'entry', frag: '## Rulings and returns line "  - D3: FAIL, evidence: x"', at: E3,
    edits: [[E3, '- D3: PASS, evidence: tests/import.test.mjs:4\n', '- D3: PASS, evidence: tests/import.test.mjs:4\n  - D3: FAIL, evidence: x\n']],
    defect: (f) => /^ {2}- D3: FAIL, evidence: x$/m.test(txt(f, E3)) },
  { name: 'entry — two results for one item in one return', rule: 'entry', frag: 'return X1 gives ES3 more than one result', at: P,
    edits: [[P, '- ES3: PASS, evidence: docs/PROJECT.md:78\n', '- ES3: PASS, evidence: docs/PROJECT.md:78\n- ES3: FAIL, evidence: fail:1\n']],
    defect: (f) => (txt(f, P).slice(txt(f, P).indexOf('### X1 return')).match(/^- ES3: /gm) || []).length === 2 },
  { name: 'coverage — a Coverage giving both a satisfy epic and a project-level ruling', rule: 'coverage', frag: 'project-level stands alone', at: P,
    edits: [[P, '- Coverage: project-level R2', '- Coverage: satisfy E3; project-level R2']],
    defect: (f) => /^- Coverage: satisfy E3; project-level R2$/m.test(txt(f, P)) },
  { name: 'coverage — a contribute epic not on the roster', rule: 'coverage', frag: 'contribute or preserve epic E99 is not on the roster', at: P,
    edits: [[P, '- Coverage: satisfy E2; contribute E1', '- Coverage: satisfy E2; contribute E99']],
    defect: (f) => /^- Coverage: satisfy E2; contribute E99$/m.test(txt(f, P)) && !/^\| E99 \|/m.test(txt(f, P)) },
  { name: 'entry — a heading with no time after the comma', rule: 'entry', frag: 'heading of Z1', at: E3,
    edits: [[E3, '### Z1 return, 2026-09-08T10:00:00Z', '### Z1 return,']],
    defect: (f) => /^### Z1 return,$/m.test(txt(f, E3)) },
  { name: 'reference — a return on the done-means-change baseline naming the ID that ruling retired', rule: 'reference', frag: 'return E1-X3 result names "D1"', at: E1, base: SPLIT,
    edits: [[E1, '- D1b: PASS, evidence: x\n', '- D1b: PASS, evidence: x\n\n### E1-X3 return, 2026-09-13T14:00:00Z\nBaseline: E1-R2\nRevision: abc123\nSeat: reviewer\nCombined check result: PASS, evidence: x\n- D1: FAIL, evidence: x\n']],
    defect: lateReturnShape('E1-R2') },
  { name: 'reference — an impact ruling with no Items', rule: 'reference', frag: 'impact ruling R3 has no Items', at: E1,
    edits: [[E1, 'Kind: impact\nItems: D1\n', 'Kind: impact\nItems:\n']],
    defect: (f) => /Kind: impact\nItems:\n/.test(txt(f, E1)) },
  // Repairs of 2026-09-13, sixth round (DP1, DP2, DP17): each adds one ruling or changes one line of GOOD.
  { name: 'reference — a destination ruling with no Issues', rule: 'reference', frag: 'destination ruling R3 has no Issues', at: P,
    edits: addRuling('Kind: destination\nTo: member E1\n'), defect: (f) => /Kind: destination\nTo: member E1\nBy:/.test(txt(f, P)) },
  { name: 'reference — a destination ruling with no To', rule: 'reference', frag: 'destination ruling R3 has no To', at: P,
    edits: addRuling('Kind: destination\nIssues: #12\n'), defect: (f) => /Kind: destination\nIssues: #12\nBy:/.test(txt(f, P)) },
  { name: 'reference — a cutover ruling with no Edit', rule: 'reference', frag: 'cutover ruling R3 has no Edit', at: P,
    edits: addRuling('Kind: cutover\n'), defect: (f) => /Kind: cutover\nBy:/.test(txt(f, P)) },
  { name: 'reference — a scope ruling with no Entries', rule: 'reference', frag: 'scope ruling R3 has no Entries', at: P,
    edits: addRuling('Kind: scope\n'), defect: (f) => /Kind: scope\nBy:/.test(txt(f, P)) },
  { name: 'issues — a destination ruling naming an issue that is not a row in Open issues', rule: 'issues', frag: 'destination ruling R3 names #99, which is not a row', at: P,
    edits: addRuling('Kind: destination\nIssues: #99\nTo: out of scope\n'), defect: (f) => /^Issues: #99$/m.test(txt(f, P)) && !/^\| #99 \|/m.test(txt(f, P)) },
  { name: 'issues — a destination ruling whose To is not the Destination its row carries', rule: 'issues', frag: 'destination ruling R3 gives #13 To "member E1"', at: P,
    edits: addRuling('Kind: destination\nIssues: #13\nTo: member E1\n'), defect: (f) => /^Issues: #13\nTo: member E1$/m.test(txt(f, P)) && /^\| #13 \| out of scope \|$/m.test(txt(f, P)) },
  { name: 'coverage — a Done epic whose Coverage names a phase that is not a phase member (DP2)', rule: 'coverage', frag: 'Done means item D1 Coverage names phase p2, which is not a - phase member of Done epic E1', at: E1,
    edits: [[E1, '- phase p2\n', '']], defect: (f) => /^- Coverage: p1: satisfy, p2: preserve$/m.test(txt(f, E1)) && !/^- phase p2/m.test(txt(f, E1)) && /^State: Done$/m.test(txt(f, E1)) },
  { name: 'coverage — a Done epic with a phase member no Coverage names (DP2)', rule: 'coverage', frag: 'phase member p4 of Done epic E3 is named in no', at: E3,
    edits: [[E3, '- phase p3: docs/records/p3.md\n', '- phase p3: docs/records/p3.md\n- phase p4\n']], defect: (f) => /^- phase p4$/m.test(txt(f, E3)) && !/p4: /.test(txt(f, E3)) && /^State: Done$/m.test(txt(f, E3)) },
  { name: 'evidence — a Done epic whose Combined check has no pass rule (DP17)', rule: 'evidence', frag: 'has no ; pass when', at: E3,
    edits: [[E3, 'Combined check: node tests/import-all.mjs ; pass when it exits 0', 'Combined check: node tests/import-all.mjs']],
    defect: (f) => /^Combined check: node tests\/import-all\.mjs$/m.test(txt(f, E3)) && !/^Combined check:.*; pass when /m.test(txt(f, E3)) },
]

for (const c of CASES) {
  let files
  const base = c.base ?? GOOD
  try { files = mutate(c.edits, base) } catch (e) { clause(`${c.name} — fixture builds`, false, e.message); continue }
  for (const n of c.nullify ?? []) files[n] = null
  // Clause 3 first and alone: the defect is in the text, with no checker code on the path.
  clause(`${c.name} [3: the fixture carries the defect]`, c.defect(files) && !c.defect(base), 'the fixture text does not carry the defect, or the good project does')
  const found = run(files)
  const hit = found.filter((f) => f.rule === c.rule && f.path === c.at && f.message.includes(c.frag))
  clause(`${c.name} [1: trips]`, hit.length > 0, `wanted ${c.rule} on ${c.at} containing ${JSON.stringify(c.frag)}; got ${found.map(formatFinding).join(' | ') || 'nothing'}`)
  const lines = (files[c.at] || '').split('\n').length
  clause(`${c.name} [1: the finding names a real line]`, hit.every((f) => Number.isInteger(f.line) && f.line >= 1 && f.line <= lines), JSON.stringify(hit))
}

// ---------------------------------------------------------------- IDs that are also header words or Object.prototype names
// The roster and issue tables skip their header row by position, and every lookup keyed by an ID is a
// Map, so `ID`, `Issue` and `constructor` are ordinary epic IDs: GOOD renamed stays clean and prints.
const renameE1 = (to) => Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [k === 'docs/epics/E1.md' ? `docs/epics/${to}.md` : k, v.replace(/\bE1\b/g, to)]))
for (const to of ['ID', 'Issue', 'constructor']) {
  const files = renameE1(to)
  clause(`id — epic E1 renamed ${to} [3: the fixture carries ${to} as a roster ID, a satisfy epic and a member destination, and no E1]`,
    files[P].includes(`| ${to} | Export | docs/epics/${to}.md |`) && files[P].includes(`- Coverage: satisfy ${to}`) && files[P].includes(`| #12 | member ${to} |`) &&
    files[`docs/epics/${to}.md`].startsWith(`# Epic ${to}: Export`) && !/\bE1\b/.test(Object.values(files).join('\n')) && (to !== 'constructor' || to in {}),
    'fixture')
  let found, lines, threw = null
  try { found = run(files); lines = statusLines(build(files), { records: () => null, seats: () => null, codex: () => null }) } catch (e) { threw = e.message }
  clause(`id — epic E1 renamed ${to} [1/2: check has ZERO findings and neither check nor status throws]`,
    threw === null && found.length === 0 && lines.includes(`  ${to} Done`) && lines.includes(`  ES1: satisfy ${to} Done`),
    threw ?? `${found.map(formatFinding).join(' | ')} || ${lines.join(' / ')}`)
}

// ---------------------------------------------------------------- T-status
{
  const model = build(GOOD)
  const readers = {
    records: () => ({ open: [{ path: 'docs/records/p3.md', line: 'state: Open' }], pending: ['docs/records/gate1.out'] }),
    seats: () => ['wA9:p56 working general-purpose · 1'],
    codex: () => ['job-7 running'],
  }
  const lines = statusLines(model, readers)
  const at = (s) => lines.findIndex((l) => l.includes(s))
  clause('T-status 1 — project State, then each end-state item with its satisfy epic State or its project-level result',
    lines[0] === 'project: Done' && lines.includes('  ES1: satisfy E1 Done') && lines.includes('  ES2: satisfy E2 Superseded') && lines.includes('  ES3: project-level PASS'),
    lines.join('\n'))
  clause('T-status 2 — the roster with each State, then the current epic, in spec order',
    lines.includes('  E3 Done') && at('current epic: E3') > at('  E3 Done') && at('  E3 Done') > at('  ES3:'),
    lines.join('\n'))
  clause('T-status 3 — open records and pending gates from the reader, after the current epic',
    at('docs/records/p3.md: state: Open') > at('current epic') && at('docs/records/gate1.out') > at('docs/records/p3.md'),
    lines.join('\n'))
  clause('T-status 4 — a return that does not count is labelled obsolete with its baseline and revision (ER9), and a counting one is not',
    lines.includes('  docs/epics/E1.md Y0: obsolete (baseline R1, revision 000aaa)') && !lines.some((l) => l.includes(' Y1:')) && !lines.some((l) => l.includes(' X1:')),
    lines.join('\n'))
  clause('T-status 5 — live seats and codex jobs from their readers, codex marked low confidence',
    lines.includes('live seats:') && lines.includes('  wA9:p56 working general-purpose · 1') && lines.some((l) => /^codex jobs \(low confidence/.test(l)) && lines.includes('  job-7 running'),
    lines.join('\n'))

  const failing = { records: () => { throw new Error('EACCES') }, seats: () => null, codex: () => { throw new Error('ENOENT') } }
  // A throw out of statusLines must print as a FAILING clause: the mutation gate counts only FAIL
  // lines, and a crash before the clause prints none, so an unwrapped call hides the pin it names.
  const lines2 = (m, r) => { try { return statusLines(m, r) } catch (e) { return [`statusLines threw: ${e.message}`] } }
  const down = lines2(model, failing)
  clause('T-status 6 — every reader that throws or returns null prints unknown, never a guess',
    down.includes('open records: unknown') && down.includes('pending gates: unknown') && down.includes('live seats: unknown') && down.includes('codex jobs: unknown') &&
    !down.some((l) => /\(none\)/.test(l) && /seats|codex|records|gates/.test(l)),
    down.join('\n'))
  clause('T-status 6b — and an empty answer is not unknown: a reader that returns nothing prints none',
    lines2(model, { records: () => ({ open: [], pending: [] }), seats: () => [], codex: () => [] }).filter((l) => l === '  (none)').length === 4,
    lines2(model, { records: () => ({ open: [], pending: [] }), seats: () => [], codex: () => [] }).join('\n'))

  const missing = { ...GOOD }; delete missing['docs/epics/E2.md']
  const m2 = lines2(build(missing), failing)
  clause('T-status 7 — an epic whose record cannot be read prints unknown for its State, in the roster and for the item it satisfies',
    m2.includes('  E2 unknown') && m2.includes('  ES2: satisfy E2 unknown'), m2.join('\n'))
  clause('T-status 7 [3: that fixture really lacks the record]', !('docs/epics/E2.md' in missing) && /docs\/epics\/E2\.md/.test(missing[P]), 'fixture')

  // Obsolete returns are listed from resolved records only, so an unread or wrongly headed record makes
  // the list unknown, while the good project, every record read, still prints the list.
  const misheaded = mutate([['docs/epics/E1.md', '# Epic E1: Export', '# Epic E9: Export']])
  const m3 = lines2(build(misheaded), failing)
  clause('T-status 7b — obsolete returns: unknown when a roster record could not be read or resolved, and a list when every one was',
    m2.includes('obsolete returns: unknown') && m3.includes('obsolete returns: unknown') && lines.includes('obsolete returns:') && !lines.includes('obsolete returns: unknown'),
    `${m2.join(' / ')} || ${m3.join(' / ')}`)
  clause('T-status 7b [3: the misheaded fixture names E9 in a record the roster calls E1]',
    /^# Epic E9:/m.test(misheaded['docs/epics/E1.md']) && misheaded[P].includes('| E1 | Export | docs/epics/E1.md |'), 'fixture')

  // The latest counting project return decides a project-level item, never an earlier one.
  const later = (body) => mutate([[P, '- ES3: PASS, evidence: docs/PROJECT.md:78\n', `- ES3: PASS, evidence: docs/PROJECT.md:78\n\n### X2 return, 2026-09-11T10:00:00Z\nBaseline: R1\nRevision: abc123\nSeat: reviewer-z\n${body}`]])
  const failed = later('- ES1: PASS, evidence: a:1\n- ES2: PASS, evidence: b:1\n- ES3: FAIL, evidence: c:1\n')
  const omitted = later('- ES1: PASS, evidence: a:1\n- ES2: PASS, evidence: b:1\n')
  clause('T-status 8 — a project-level item shows the latest counting return\'s result, or says that return has none',
    lines2(build(failed), failing).includes('  ES3: project-level FAIL') && lines2(build(omitted), failing).includes('  ES3: project-level no result in the latest counting return'),
    `${lines2(build(failed), failing).join(' / ')} || ${lines2(build(omitted), failing).join(' / ')}`)
  clause('T-status 8 [3: both fixtures add a later return on the same baseline and revision, one failing ES3 and one without it]',
    [failed, omitted].every((f) => f[P].indexOf('### X2 return') > f[P].indexOf('### X1 return') && (f[P].match(/^Revision: abc123$/gm) || []).length === 2) &&
    /^- ES3: FAIL/m.test(failed[P]) && omitted[P].slice(omitted[P].indexOf('### X2 return')).indexOf('- ES3:') === -1, 'fixture')
}

// ---------------------------------------------------------------- the CLI, against a real tree
const script = path.join(import.meta.dirname, 'dctr-project.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-project-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const trip = (name) => path.join(tmp, `${name}-was-called`)
for (const name of ['herdr', 'gh', 'curl']) {
  fs.writeFileSync(path.join(bin, name), `#!/bin/sh\ntouch ${JSON.stringify(trip(name))}\nexit 0\n`)
  fs.chmodSync(path.join(bin, name), 0o755)
}
const home = path.join(tmp, 'home'); fs.mkdirSync(home)
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, HERDR_ENV: '', HERDR_WORKSPACE_ID: '', HERDR_PANE_ID: '', DCTR_VIEW_REQUEST_DIR: '', CLAUDE_CODE_SESSION_ID: '' }
const cli = (...args) => spawnSync('node', [script, ...args], { env, encoding: 'utf8' })
const writeTree = (root, files) => { for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body) } }

const good = path.join(tmp, 'good'); writeTree(good, GOOD)
writeTree(good, { 'docs/records/p3.md': 'state: Blocked\nnotes\nstate: Open\n', 'docs/records/p1.md': 'state: Open\nstate: Shipped\n', 'docs/records/gate1.out': 'x', 'docs/records/gate2.out': 'y', 'docs/records/gate2.out.result': 'exit=0\n' })
const rGood = cli('check', good)
clause('CLI check — the good tree exits 0 and prints nothing on stdout', rGood.status === 0 && rGood.stdout.trim() === '', `status ${rGood.status}: ${rGood.stdout}${rGood.stderr}`)

const broken = path.join(tmp, 'broken'); writeTree(broken, mutate([[P, 'Current epic: E3', 'Current epic: E9']]))
const rBroken = cli('check', broken)
clause('CLI check — a broken tree exits 1 with a <path>:<line>: <rule>: <message> line',
  rBroken.status === 1 && /^docs\/PROJECT\.md:3: pointer: /m.test(rBroken.stdout), `status ${rBroken.status}: ${rBroken.stdout}`)

const empty = path.join(tmp, 'empty'); fs.mkdirSync(empty)
const rEmpty = cli('check', empty)
clause('CLI check — no docs/PROJECT.md exits 2', rEmpty.status === 2, `status ${rEmpty.status}`)
clause('CLI check — [3: that tree really has no PROJECT.md]', !fs.existsSync(path.join(empty, 'docs/PROJECT.md')), 'fixture')
const unreadable = path.join(tmp, 'unreadable'); fs.mkdirSync(path.join(unreadable, 'docs/PROJECT.md'), { recursive: true })
clause('CLI check — a PROJECT.md that cannot be read (a directory) exits 2', cli('check', unreadable).status === 2, 'status')
clause('CLI — malformed arguments exit 2: no subcommand, an unknown one, two roots, a flag',
  cli().status === 2 && cli('bogus').status === 2 && cli('check', good, good).status === 2 && cli('status', '--json').status === 2, 'status')
clause('CLI check — made no gh, curl or herdr call', !fs.existsSync(trip('gh')) && !fs.existsSync(trip('curl')) && !fs.existsSync(trip('herdr')), 'a tripwire fired during check')

const rStatus = cli('status', good)
const st = rStatus.stdout.split('\n')
clause('CLI status — exits 0 on the good tree and reads records: last state line Open listed, a Shipped one not, a .out with no .result pending, one with a .result not',
  rStatus.status === 0 && st.includes('  docs/records/p3.md: state: Open') && !st.some((l) => l.includes('p1.md')) &&
  st.includes('  docs/records/gate1.out') && !st.some((l) => l.includes('gate2.out')),
  `status ${rStatus.status}: ${rStatus.stdout}${rStatus.stderr}`)
clause('CLI status — HERDR_ENV unset prints live seats: unknown, and a missing codex state dir prints codex jobs: unknown',
  st.includes('live seats: unknown') && st.includes('codex jobs: unknown'), rStatus.stdout)
clause('CLI status — [3: the environment really lacks both sources]',
  !fs.existsSync(path.join(home, '.claude', 'plugins', 'data', 'codex-openai-codex', 'state')) && env.HERDR_ENV !== '1', 'fixture')
clause('CLI status — the tripwire herdr on PATH was called ZERO times with HERDR_ENV unset', !fs.existsSync(trip('herdr')), 'herdr was called')
const rContained = spawnSync('node', [script, 'status', good], { env: { ...env, HERDR_ENV: '1', DCTR_VIEW_REQUEST_DIR: tmp }, encoding: 'utf8' })
clause('CLI status — a contained session (DCTR_VIEW_REQUEST_DIR set) prints unknown and still calls herdr ZERO times',
  rContained.stdout.split('\n').includes('live seats: unknown') && !fs.existsSync(trip('herdr')), rContained.stdout)
const rEmptyReply = spawnSync('node', [script, 'status', good], { env: { ...env, HERDR_ENV: '1' }, encoding: 'utf8' })
clause('CLI status — inside herdr, an EMPTY snapshot reply is "could not look": live seats: unknown, and herdr really was asked',
  rEmptyReply.stdout.split('\n').includes('live seats: unknown') && fs.existsSync(trip('herdr')), rEmptyReply.stdout)

// ---------------------------------------------------------------- readCodex: unknown whenever anything could not be read
{
  const stateDir = (name, make) => { const sd = path.join(tmp, `codex-${name}`); fs.mkdirSync(sd); make(sd); return sd }
  const jobsDir = (sd, d = 'good-1') => { const j = path.join(sd, d, 'jobs'); fs.mkdirSync(j, { recursive: true }); return j }
  const job = (j, f, body) => fs.writeFileSync(path.join(j, f), typeof body === 'string' ? body : JSON.stringify(body))
  const healthy = stateDir('healthy', (sd) => {
    const j = jobsDir(sd)
    job(j, 'a.json', { id: 'job-1', status: 'running', workspaceRoot: good })
    job(j, 'b.json', { id: 'job-2', status: 'completed', workspaceRoot: good })
    job(j, 'c.json', { id: 'job-3', status: 'running', workspaceRoot: '/elsewhere' })
    fs.mkdirSync(path.join(sd, 'good-2'))                                          // a matching directory with no jobs yet
    job(jobsDir(sd, 'other-1'), 'x.json', '{')                                     // another workspace's broken record
  })
  const jobsIsFile = stateDir('jobs-file', (sd) => { fs.mkdirSync(path.join(sd, 'good-1')); fs.writeFileSync(path.join(sd, 'good-1', 'jobs'), '') })
  const jobIsDir = stateDir('job-dir', (sd) => { fs.mkdirSync(path.join(jobsDir(sd), 'a.json')) })
  const midWrite = stateDir('mid-write', (sd) => job(jobsDir(sd), 'a.json', '{"id": "job-1", "status": "runn'))
  const answer = (sd) => { try { return readCodex(good, sd) } catch (e) { return `threw ${e.code || e.name}` } }
  clause('codex [2: a healthy state dir lists only this workspace\'s unfinished jobs; a matching directory with no jobs is none, not unknown]',
    JSON.stringify(answer(healthy)) === JSON.stringify(['job-1 running']), JSON.stringify(answer(healthy)))
  clause('codex [1: a jobs directory that cannot be read, a job file that cannot be read, and a job file that does not parse each throw, printed unknown]',
    [jobsIsFile, jobIsDir, midWrite].every((sd) => typeof answer(sd) === 'string'), JSON.stringify([jobsIsFile, jobIsDir, midWrite].map(answer)))
  clause('codex [3: the fixtures carry their defects on disk]',
    fs.statSync(path.join(jobsIsFile, 'good-1', 'jobs')).isFile() && fs.statSync(path.join(jobIsDir, 'good-1', 'jobs', 'a.json')).isDirectory() &&
    (() => { try { JSON.parse(fs.readFileSync(path.join(midWrite, 'good-1', 'jobs', 'a.json'), 'utf8')); return false } catch { return true } })() &&
    !fs.existsSync(path.join(healthy, 'good-2', 'jobs')) && path.basename(good) === 'good', 'fixture')
  const sl = statusLines(build(GOOD), { records: () => null, seats: () => null, codex: () => readCodex(good, jobsIsFile) })
  clause('codex [1: through status, an unreadable jobs directory prints codex jobs: unknown]', sl.includes('codex jobs: unknown'), sl.join(' / '))
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
