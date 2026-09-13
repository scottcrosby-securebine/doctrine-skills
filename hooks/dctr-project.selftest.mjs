// Three-clause tamper test for the project format check and the status command, per CLAUDE.md.
//
//   node hooks/dctr-project.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Seams: T-parse (markdown to model, with line numbers), T-check (model plus a file-existence
// function to findings, and the exit code from findings), T-status (model plus injected posture
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
import { parseDoc, modelFrom, check, exitCode, formatFinding, statusLines, PROJECT_PATH } from './dctr-project.mjs'

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
Combined check: node tests/export-all.mjs

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
> approved

### Y0 return, 2026-09-03T10:00:00Z
Baseline: R1
Revision: 000aaa
Seat: reviewer-b
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
Combined check: node tests/import-all.mjs

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
> approved

### Z1 return, 2026-09-08T10:00:00Z
Baseline: R1
Revision: 777bbb
Seat: reviewer-c
- D3: PASS, evidence: tests/import.test.mjs:4
`,
}

const build = (files) => modelFrom(files[PROJECT_PATH], (rel) => (rel in files ? files[rel] : null))
const existsIn = (files) => (rel) => rel in files
const run = (files) => check(build(files), existsIn(files))

/** One broken variant: each [file, from, to] must occur exactly once, so a fixture can never silently
 *  equal the good project because its anchor moved. */
const mutate = (edits) => {
  const files = { ...GOOD }
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
  clause('T-parse 5 — epic heading and members, a phase with and without a record path',
    e.title.text === 'Epic E1: Export' && e.title.line === 1 &&
    e.members.length === 3 && e.members[0].kind === 'phase' && e.members[0].name === 'p1' && e.members[0].path === 'docs/records/p1.md' &&
    e.members[1].name === 'p2' && !e.members[1].path && e.members[2].kind === 'issue' && e.members[2].name === '#12',
    JSON.stringify({ title: e.title, members: e.members }))
}

// ---------------------------------------------------------------- T-check, clause 2 (known good)
const goodFindings = run(GOOD)
clause('T-check good — the known-good project (Done, Done epic, Superseded epic with a Done successor, project-level item) has ZERO findings',
  goodFindings.length === 0, goodFindings.map(formatFinding).join(' | '))
clause('T-check exit — exitCode is 0 for no findings and 1 for any',
  exitCode([]) === 0 && exitCode([{ path: 'x', line: 1, rule: 'state', message: 'm' }]) === 1, 'exitCode')
clause('T-check format — one finding per line as <path>:<line>: <rule>: <message>',
  formatFinding({ path: 'docs/PROJECT.md', line: 7, rule: 'pointer', message: 'm' }) === 'docs/PROJECT.md:7: pointer: m', 'formatFinding')

// ---------------------------------------------------------------- T-check, clauses 1 and 3 per rule
// Each case: the edits, the rule and a message fragment only that branch prints, the path the
// finding must name, and a proof on the fixture TEXT (clause 3) that uses no checker code.
const P = 'docs/PROJECT.md'
const txt = (files, f) => files[f]
const LONG = 'R2' + 'a'.repeat(25)
const CASES = [
  { name: 'state — a project State outside Proposed, Ruled, Done', rule: 'state', frag: 'project State', at: P,
    edits: [[P, 'State: Done\nCurrent', 'State: Archived\nCurrent']],
    defect: (f) => /^State: Archived$/m.test(txt(f, P)) && !['Proposed', 'Ruled', 'Done'].includes('Archived') },
  { name: 'state — an epic State outside the six', rule: 'state', frag: 'epic State', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Unverified']],
    defect: (f) => /^State: Unverified$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done with no baseline ruling', rule: 'evidence', frag: 'no baseline ruling', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'Kind: baseline', 'Kind: reopen']],
    defect: (f) => !/^Kind: baseline$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Open or Done with no phase member', rule: 'evidence', frag: 'no phase member', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', '- phase p3: docs/records/p3.md', '- issue #40']],
    defect: (f) => !/^- phase /m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Done with Combined check none (W1)', rule: 'evidence', frag: 'Combined check', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'Combined check: node tests/import-all.mjs', 'Combined check: none']],
    defect: (f) => /^Combined check: none$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'evidence — an epic Not started with Combined check absent (W1)', rule: 'evidence', frag: 'Combined check', at: 'docs/epics/E3.md',
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Not started'], ['docs/epics/E3.md', 'Combined check: node tests/import-all.mjs\n', '']],
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
    edits: [[P, 'Kind: baseline', 'Kind: reopen']],
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
  { name: 'coverage — a Superseded satisfy epic whose successor is not Done (ER3)', rule: 'coverage', frag: 'successor chain', at: P,
    edits: [['docs/epics/E3.md', 'State: Done', 'State: Open'], [P, 'State: Done\nCurrent', 'State: Ruled\nCurrent']],
    defect: (f) => /^State: Superseded$/m.test(txt(f, 'docs/epics/E2.md')) && /^Successor: E3$/m.test(txt(f, 'docs/epics/E2.md')) && /^State: Open$/m.test(txt(f, 'docs/epics/E3.md')) },
  { name: 'coverage — a Superseded chain that loops never reaches Done', rule: 'coverage', frag: 'successor chain', at: P,
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
    edits: [['docs/epics/E1.md', 'Kind: impact', 'Kind: reopen']],
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
]

for (const c of CASES) {
  let files
  try { files = mutate(c.edits) } catch (e) { clause(`${c.name} — fixture builds`, false, e.message); continue }
  // Clause 3 first and alone: the defect is in the text, with no checker code on the path.
  clause(`${c.name} [3: the fixture carries the defect]`, c.defect(files) && !c.defect(GOOD), 'the fixture text does not carry the defect, or the good project does')
  const found = run(files)
  const hit = found.filter((f) => f.rule === c.rule && f.path === c.at && f.message.includes(c.frag))
  clause(`${c.name} [1: trips]`, hit.length > 0, `wanted ${c.rule} on ${c.at} containing ${JSON.stringify(c.frag)}; got ${found.map(formatFinding).join(' | ') || 'nothing'}`)
  const lines = (files[c.at] || '').split('\n').length
  clause(`${c.name} [1: the finding names a real line]`, hit.every((f) => Number.isInteger(f.line) && f.line >= 1 && f.line <= lines), JSON.stringify(hit))
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
clause('CLI status — no docs/PROJECT.md exits 2', cli('status', empty).status === 2, 'status')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
