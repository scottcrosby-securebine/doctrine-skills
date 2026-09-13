// History-walk suite for the project format check: drives a project through lifecycle sequences as
// skills/doctrine-project/SKILL.md tells an orchestrator to write them, and runs `check` after EVERY step.
//
//   node hooks/dctr-project.history.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Why it exists: three review rounds in a row found a finding message or rule that was right for the
// state its author pictured and wrong for a history the lifecycle legally passes through. So every step
// here is a small edit to the previous step's files, and:
//   - a legal step must leave ZERO findings (clause 2);
//   - an illegal step must give the named finding (clause 1), and its files must carry the defect on
//     their text, proved without calling check (clause 3);
//   - a finding whose message prescribes a fix is followed by that fix, applied as the message and
//     SKILL.md say, which must leave ZERO findings. That is the assertion a deadlock cannot pass.
// A `branch` step is run from the current files and not carried forward; its `then` steps run from it.
// Epic IDs: the superseded satisfy epic is E1, its successor E2, and the new epic after E2 is dropped E3.

import { modelFrom, check, formatFinding, PROJECT_PATH } from './dctr-project.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const P = PROJECT_PATH, E1 = 'docs/epics/E1.md', E2 = 'docs/epics/E2.md', E3 = 'docs/epics/E3.md'
const TIME = '2026-09-13T10:00:00Z'

// ---------------------------------------------------------------- edits, each files -> new files
const sub = (file, from, to) => (f) => {
  const hits = f[file].split(from).length - 1
  if (hits !== 1) throw new Error(`anchor ${JSON.stringify(from)} occurs ${hits} times in ${file}`)
  return { ...f, [file]: f[file].replace(from, to) }
}
const hdr = (file, key, value) => (f) => {
  const re = new RegExp(`^${key}: .*$`, 'gm'), hits = (f[file].match(re) || []).length
  if (hits !== 1) throw new Error(`header ${key} occurs ${hits} times in ${file}`)
  return { ...f, [file]: f[file].replace(re, `${key}: ${value}`) }
}
const state = (file, s) => hdr(file, 'State', s)
const put = (file, text) => (f) => ({ ...f, [file]: text })
const app = (file, text) => (f) => ({ ...f, [file]: f[file] + text })
const rule = (file, id, kind, rest = '') => app(file, `\n### ${id} ruling, ${TIME}\nKind: ${kind}\n${rest}By: owner\n> ruled\n`)
const ret = (file, id, baseline, rev, results) => app(file, `\n### ${id} return, ${TIME}\nBaseline: ${baseline}\nRevision: ${rev}\nSeat: reviewer\n${results.map((r) => `- ${r}, evidence: path:1\n`).join('')}`)
const reg = (file, id, item) => app(file, `\n### ${id} regression, ${TIME}\nItem: ${item}\nFound by: exit pass\n> failed\n`)
const member = (file, name) => sub(file, '## Members\n', `## Members\n- phase ${name}\n`)
const row = (id) => sub(P, '\n\n## Rulings and returns', `\n| ${id} | t | docs/epics/${id}.md |\n\n## Rulings and returns`)
const item = (id, coverage) => `### ${id}\n- Outcome: o\n- Type: T1\n- Check: c\n- Control: k\n- Evidence: path:line\n- Coverage: ${coverage}\n\n`
const epic = (id, items) => `# Epic ${id}: t\nState: Proposed\nCertification target: none\nCombined check: none\n\n## Done means\n${items}## Members\n\n## Rulings and returns\n`
/** A coverage ruling and the Coverage line it changes, as SKILL.md "Work nothing covers" and formats.md write it. */
const reassign = (from, to, id) => [sub(P, `- Coverage: satisfy ${from}\n`, `- Coverage: satisfy ${to}\n`), rule(P, id, 'coverage', 'Items: ES1\n')]

const PROPOSED = {
  [P]: `# Project: ledger\nState: Proposed\nCurrent epic: none\nCertification target: none\nRecords: .doctrine/records\n\n## End state\n${item('ES1', 'satisfy E1')}## Epics\n| ID | Title | Record |\n|---|---|---|\n| E1 | t | docs/epics/E1.md |\n\n## Rulings and returns\n`,
  [E1]: epic('E1', item('D1', 'p1: satisfy') + item('D2', 'p1: satisfy')),
}

// ---------------------------------------------------------------- runner
const build = (f) => modelFrom(f[P], (rel) => (Object.hasOwn(f, rel) ? f[rel] : null))
const at = (t, s) => t.indexOf(s)

function walk(prefix, files, steps) {
  for (const s of steps) {
    const name = `${prefix} ${s.name}`
    let next, found
    try { next = [s.ops].flat(2).reduce((f, op) => op(f), files); found = check(build(next), (rel) => Object.hasOwn(next, rel)) }
    catch (e) { clause(`${name} — the step applies and check runs`, false, e.message); return files }
    if (s.want) {
      clause(`${name} [3: the files carry the defect]`, s.shape(next) && !s.shape(files), 'the step text does not carry the defect, or the files before it already did')
      const [rule, file, frag] = s.want
      clause(`${name} [1: ${rule} on ${file} names "${frag}"]`, found.some((x) => x.rule === rule && x.path === file && x.message.includes(frag)), found.map(formatFinding).join(' | ') || 'nothing')
    } else {
      clause(`${name} [2: ZERO findings]`, found.length === 0, found.map(formatFinding).join(' | '))
    }
    if (s.then) walk(name + ' >', next, s.then)
    if (!s.branch) files = next
  }
  return files
}

// ---------------------------------------------------------------- S1 greenfield
const S1_OPEN = walk('S1', PROPOSED, [
  { name: 'project, epic E1 and the coverage map proposed', ops: [] },
  { name: 'illegal: E1 ruled Not started with Combined check none (W1)', branch: true, want: ['evidence', E1, 'Combined check none'],
    ops: [state(E1, 'Not started'), rule(E1, 'E1-R1', 'baseline')], shape: (f) => /^State: Not started$/m.test(f[E1]) && /^Combined check: none$/m.test(f[E1]) },
  { name: 'owner rules both baselines and the coverage map (W1)',
    ops: [state(P, 'Ruled'), rule(P, 'P-R1', 'baseline'), state(E1, 'Not started'), hdr(E1, 'Combined check', 'npm test'), rule(E1, 'E1-R1', 'baseline')] },
  { name: 'the first member phase opens E1 and the pointer moves',
    ops: [member(E1, 'p1: .doctrine/records/p1.md'), state(E1, 'Open'), hdr(P, 'Current epic', 'E1')] },
  { name: 'illegal: E1 moved Done with no return', branch: true, want: ['evidence', E1, 'without a counting return'],
    ops: [state(E1, 'Done')], shape: (f) => /^State: Done$/m.test(f[E1]) && !/ return,/.test(f[E1]) },
  { name: 'epic exit pass opens on a revision and its all-PASS return is recorded',
    ops: [hdr(E1, 'Certification target', 'a1'), ret(E1, 'E1-X1', 'E1-R1', 'a1', ['D1: PASS', 'D2: PASS'])] },
])
const S1_DONE = walk('S1', S1_OPEN, [
  { name: 'E1 moved Done on the counting return', ops: [state(E1, 'Done')] },
  { name: 'illegal: project moved Done with no project return', branch: true, want: ['evidence', P, 'counting project return'],
    ops: [state(P, 'Done')], shape: (f) => /^State: Done$/m.test(f[P]) && !/ return,/.test(f[P]) },
  { name: 'project exit pass returns PASS for every end-state item', ops: [hdr(P, 'Certification target', 'b1'), ret(P, 'P-X1', 'P-R1', 'b1', ['ES1: PASS'])] },
  { name: 'project moved Done', ops: [state(P, 'Done')] },
])

// ---------------------------------------------------------------- S2 regression
walk('S2', S1_DONE, [
  { name: 'a failed project pass is recorded and the project leaves Done', ops: [state(P, 'Ruled'), hdr(P, 'Certification target', 'b2'), ret(P, 'P-X2', 'P-R1', 'b2', ['ES1: FAIL'])] },
  { name: 'illegal: the regression recorded in E1 against the end-state item ID', branch: true, want: ['reference', E1, 'regression E1-G1 Item names "ES1"'],
    ops: [reg(E1, 'E1-G1', 'ES1'), state(E1, 'Open')], shape: (f) => /^Item: ES1$/m.test(f[E1]) && !/^### ES1$/m.test(f[E1]) },
  { name: 'illegal: the regression recorded and E1 left Done', branch: true, want: ['evidence', E1, 'epic E1 is Done without a counting return'],
    ops: [reg(E1, 'E1-G1', 'D1')], shape: (f) => /^Item: D1$/m.test(f[E1]) && /^State: Done$/m.test(f[E1]) },
  { name: "step 5: a regression against each of E1's own Done means items, E1 reopened, pointer unmoved",
    ops: [reg(E1, 'E1-G1', 'D1'), reg(E1, 'E1-G2', 'D2'), state(E1, 'Open')] },
  { name: 'a new certification target and a passing return', ops: [hdr(E1, 'Certification target', 'a2'), ret(E1, 'E1-X2', 'E1-R1', 'a2', ['D1: PASS', 'D2: PASS'])] },
  { name: 'E1 Done again', ops: [state(E1, 'Done')] },
  { name: 'project return reruns', ops: [hdr(P, 'Certification target', 'b3'), ret(P, 'P-X3', 'P-R1', 'b3', ['ES1: PASS'])] },
  { name: 'project Done again', ops: [state(P, 'Done')] },
])

// ---------------------------------------------------------------- S3 Done means change, S4 retired ID
const S3_DONE = walk('S3', S1_OPEN, [
  { name: 'a done-means-change removes D2, before its impact ruling', want: ['impact', E1, 'done-means-change E1-R2 has no later impact ruling listing D2'],
    ops: [sub(E1, item('D2', 'p1: satisfy'), ''), rule(E1, 'E1-R2', 'done-means-change', 'Items: D2\n')],
    shape: (f) => !/^### D2$/m.test(f[E1]) && /Kind: done-means-change\nItems: D2\n/.test(f[E1]) && !/Kind: impact/.test(f[E1]) },
  { name: 'the impact ruling that finding names (W3, ER7), listing the removed D2', ops: [rule(E1, 'E1-R3', 'impact', 'Items: D2\n')] },
  { name: 'D1 split into D1a and D1b: the ruling names the old ID and both new ones, with its impact ruling',
    ops: [sub(E1, '### D1\n', '### D1a\n'), sub(E1, '## Members\n', item('D1b', 'p1: satisfy') + '## Members\n'),
      rule(E1, 'E1-R4', 'done-means-change', 'Items: D1, D1a, D1b\n'), rule(E1, 'E1-R5', 'impact', 'Items: D1, D1a, D1b\n')] },
  { name: 'illegal: E1 moved Done on the return written before the change', branch: true, want: ['evidence', E1, 'without a counting return'],
    ops: [state(E1, 'Done')], shape: (f) => /^State: Done$/m.test(f[E1]) && !/^Baseline: E1-R4$/m.test(f[E1]) },
  { name: 'a new pass on the current baseline', ops: [hdr(E1, 'Certification target', 'a3'), ret(E1, 'E1-X2', 'E1-R4', 'a3', ['D1a: PASS', 'D1b: PASS'])] },
  { name: 'E1 Done', ops: [state(E1, 'Done')] },
])
walk('S4', S3_DONE, [
  { name: 'illegal: a regression written after the split against the retired ID D1', branch: true, want: ['reference', E1, 'regression E1-G1 Item names "D1"'],
    ops: [reg(E1, 'E1-G1', 'D1')], shape: (f) => /^Item: D1$/m.test(f[E1]) && !/^### D1$/m.test(f[E1]) && at(f[E1], '### E1-G1 regression') > at(f[E1], '### E1-R4 ruling') },
  { name: 'a regression against the current ID D1a voids the return', want: ['evidence', E1, 'epic E1 is Done without a counting return'],
    ops: [reg(E1, 'E1-G1', 'D1a')], shape: (f) => /^Item: D1a$/m.test(f[E1]) && at(f[E1], '### E1-G1 regression') > at(f[E1], '### E1-X2 return') && /^State: Done$/m.test(f[E1]) },
  { name: 'E1 reopened', ops: [state(E1, 'Open')] },
])

// ---------------------------------------------------------------- S5 supersession, S6 dropped successor
const S5_BOTH_OPEN = walk('S5', S1_OPEN, [
  { name: 'successor E2 proposed on the roster', ops: [row('E2'), put(E2, epic('E2', item('D3', 'p2: satisfy')))] },
  { name: 'owner rules E2 baseline', ops: [state(E2, 'Not started'), hdr(E2, 'Combined check', 'npm test'), rule(E2, 'E2-R1', 'baseline')] },
  { name: 'the first member phase opens E2 and the pointer moves', ops: [member(E2, 'p2'), state(E2, 'Open'), hdr(P, 'Current epic', 'E2')] },
])
walk('S5', S5_BOTH_OPEN, [
  { name: 'owner supersedes satisfy epic E1 by E2 while E2 is Open (ER3)', want: ['coverage', P, 'the fix is a coverage ruling naming E2'],
    ops: [state(E1, 'Superseded'), rule(E1, 'E1-R2', 'supersede', 'Successor: E2\n')],
    shape: (f) => /^State: Superseded$/m.test(f[E1]) && /^Successor: E2$/m.test(f[E1]) && /^State: Open$/m.test(f[E2]) && /^- Coverage: satisfy E1$/m.test(f[P]) },
  { name: 'illegal: a coverage ruling with no Items', branch: true, want: ['reference', P, 'coverage ruling P-R2 has no Items'],
    ops: [sub(P, '- Coverage: satisfy E1\n', '- Coverage: satisfy E2\n'), rule(P, 'P-R2', 'coverage')], shape: (f) => /Kind: coverage\nBy:/.test(f[P]) },
  { name: 'the prescribed fix: a coverage ruling naming E2', ops: reassign('E1', 'E2', 'P-R2') },
  { name: 'E2 exit pass and Done', ops: [hdr(E2, 'Certification target', 'c1'), ret(E2, 'E2-X1', 'E2-R1', 'c1', ['D3: PASS']), state(E2, 'Done')] },
])
const S6_SUPERSEDED = walk('S6', S5_BOTH_OPEN, [
  { name: 'E2 exit pass and Done', ops: [hdr(E2, 'Certification target', 'c1'), ret(E2, 'E2-X1', 'E2-R1', 'c1', ['D3: PASS']), state(E2, 'Done')] },
  { name: 'owner supersedes E1 by the Done E2', ops: [state(E1, 'Superseded'), rule(E1, 'E1-R2', 'supersede', 'Successor: E2\n')] },
])
walk('S6', S6_SUPERSEDED, [
  { name: 'owner drops the Done successor E2 (ER6)', want: ['coverage', P, 'it ends at E2, which is Dropped, so nothing on it can reach Done and the fix is a new epic on the roster and a coverage ruling naming it'],
    ops: [state(E2, 'Dropped'), rule(E2, 'E2-R2', 'drop')],
    shape: (f) => /^State: Dropped$/m.test(f[E2]) && /^Successor: E2$/m.test(f[E1]) && /^- Coverage: satisfy E1$/m.test(f[P]) },
  { name: 'illegal: reassigning the item to the Dropped chain end', branch: true, want: ['coverage', P, 'satisfy epic E2 is Dropped'],
    ops: reassign('E1', 'E2', 'P-R2'), shape: (f) => /^- Coverage: satisfy E2$/m.test(f[P]) && /^State: Dropped$/m.test(f[E2]) },
  { name: 'the prescribed fix: new epic E3 on the roster and a coverage ruling naming it',
    ops: [row('E3'), put(E3, epic('E3', item('D4', 'p3: satisfy'))), reassign('E1', 'E3', 'P-R2')] },
])
walk('S6b', S5_BOTH_OPEN, [
  { name: 'owner supersedes E1 by E2 and E2 back by E1', want: ['coverage', P, 'it loops back to E1, so nothing on it can reach Done and the fix is a new epic on the roster and a coverage ruling naming it'],
    ops: [state(E1, 'Superseded'), rule(E1, 'E1-R2', 'supersede', 'Successor: E2\n'), state(E2, 'Superseded'), rule(E2, 'E2-R2', 'supersede', 'Successor: E1\n')],
    shape: (f) => /^Successor: E2$/m.test(f[E1]) && /^Successor: E1$/m.test(f[E2]) && /^- Coverage: satisfy E1$/m.test(f[P]) },
  { name: 'illegal: reassigning the item to an epic on the loop', branch: true, want: ['coverage', P, 'satisfy epic E2 is Superseded'],
    ops: reassign('E1', 'E2', 'P-R2'), shape: (f) => /^- Coverage: satisfy E2$/m.test(f[P]) && /^Successor: E1$/m.test(f[E2]) },
  { name: 'the prescribed fix: new epic E3 on the roster and a coverage ruling naming it',
    ops: [row('E3'), put(E3, epic('E3', item('D4', 'p3: satisfy'))), reassign('E1', 'E3', 'P-R2')] },
])

// ---------------------------------------------------------------- S7 failed item on a superseded satisfy epic
walk('S7', S6_SUPERSEDED, [
  { name: 'project return passes and the project moves Done', ops: [hdr(P, 'Certification target', 'b1'), ret(P, 'P-X1', 'P-R1', 'b1', ['ES1: PASS']), state(P, 'Done')] },
  { name: 'a failed project pass is recorded and the project leaves Done', ops: [state(P, 'Ruled'), hdr(P, 'Certification target', 'b2'), ret(P, 'P-X2', 'P-R1', 'b2', ['ES1: FAIL'])] },
  { name: 'illegal: E2 reopened by a regression before the coverage ruling', branch: true, want: ['coverage', P, 'the fix is a coverage ruling naming E2'],
    ops: [reg(E2, 'E2-G1', 'D3'), state(E2, 'Open')], shape: (f) => /^State: Open$/m.test(f[E2]) && /^- Coverage: satisfy E1$/m.test(f[P]) && /^Item: D3$/m.test(f[E2]),
    then: [{ name: 'the prescribed fix: a coverage ruling naming E2', ops: reassign('E1', 'E2', 'P-R2') }] },
  { name: 'step 5: the coverage ruling first, naming the chain end E2', ops: reassign('E1', 'E2', 'P-R2') },
  { name: "step 5: a regression against E2's Done means item and E2 reopened", ops: [reg(E2, 'E2-G1', 'D3'), state(E2, 'Open')] },
  { name: 'illegal: project Done on a passing return while E2 is reopened', branch: true, want: ['evidence', P, 'epic E2 is Open'],
    ops: [hdr(P, 'Certification target', 'b3'), ret(P, 'P-X3', 'P-R1', 'b3', ['ES1: PASS']), state(P, 'Done')], shape: (f) => /^State: Done$/m.test(f[P]) && /^State: Open$/m.test(f[E2]) },
  { name: 'a new pass on E2 and Done', ops: [hdr(E2, 'Certification target', 'c2'), ret(E2, 'E2-X2', 'E2-R1', 'c2', ['D3: PASS']), state(E2, 'Done')] },
  { name: 'project return and Done: the coverage ruling voided no return, so P-R1 is still the baseline', ops: [hdr(P, 'Certification target', 'b3'), ret(P, 'P-X3', 'P-R1', 'b3', ['ES1: PASS']), state(P, 'Done')] },
])

// ---------------------------------------------------------------- S8 project-level item
walk('S8', S1_DONE, [
  { name: 'owner adds end-state item ES2 ruled project-level, and the project leaves Done',
    ops: [state(P, 'Ruled'), sub(P, '## Epics\n', item('ES2', 'project-level P-R3') + '## Epics\n'), rule(P, 'P-R2', 'done-means-change', 'Items: ES2\n'),
      rule(P, 'P-R3', 'project-level', 'Items: ES2\n'), rule(P, 'P-R4', 'impact', 'Items: ES2\n')] },
  { name: 'project pass fails ES2', ops: [hdr(P, 'Certification target', 'b2'), ret(P, 'P-X2', 'P-R2', 'b2', ['ES1: PASS', 'ES2: FAIL'])] },
  { name: 'illegal: project Done on that failing return', branch: true, want: ['evidence', P, 'counting project return'],
    ops: [state(P, 'Done')], shape: (f) => /^State: Done$/m.test(f[P]) && /^- ES2: FAIL/m.test(f[P]) },
  { name: 'ER4: fixed by a phase outside any epic, and the project return reruns', ops: [hdr(P, 'Certification target', 'b3'), ret(P, 'P-X3', 'P-R2', 'b3', ['ES1: PASS', 'ES2: PASS'])] },
  { name: 'project Done', ops: [state(P, 'Done')] },
])

// ---------------------------------------------------------------- S9 a return briefed before a Done means change lands
walk('S9', S1_OPEN, [
  { name: 'exit passes step 1: an epic exit pass opens on revision a2', ops: [hdr(E1, 'Certification target', 'a2')] },
  { name: 'while the seat works, the owner splits D1 into D1a and D1b, with its impact ruling (ER7, W3)',
    ops: [sub(E1, '### D1\n', '### D1a\n'), sub(E1, '## Members\n', item('D1b', 'p1: satisfy') + '## Members\n'),
      rule(E1, 'E1-R2', 'done-means-change', 'Items: D1, D1a, D1b\n'), rule(E1, 'E1-R3', 'impact', 'Items: D1, D1a, D1b\n')] },
  { name: 'exit passes step 4: the return arrives and is recorded as the seat gave it, on the baseline it was briefed on',
    ops: [ret(E1, 'E1-X2', 'E1-R1', 'a2', ['D1: FAIL', 'D2: PASS'])] },
  { name: 'illegal: E1 moved Done on that return', branch: true, want: ['evidence', E1, 'epic E1 is Done without a counting return'],
    ops: [state(E1, 'Done')], shape: (f) => /^State: Done$/m.test(f[E1]) && /^Baseline: E1-R1$/m.test(f[E1].slice(Math.max(0, at(f[E1], '### E1-X2 return')))) && !/^Baseline: E1-R2$/m.test(f[E1]) },
  { name: 'illegal: a regression written after the split against the retired ID D1', branch: true, want: ['reference', E1, 'regression E1-G1 Item names "D1"'],
    ops: [reg(E1, 'E1-G1', 'D1')], shape: (f) => /^Item: D1$/m.test(f[E1]) && !/^### D1$/m.test(f[E1]) && at(f[E1], '### E1-G1 regression') > at(f[E1], '### E1-R2 ruling') },
  { name: 'illegal: a return on the new baseline E1-R2 naming the retired ID D1', branch: true, want: ['reference', E1, 'return E1-X3 result names "D1"'],
    ops: [ret(E1, 'E1-X3', 'E1-R2', 'a2', ['D1: PASS', 'D2: PASS'])],
    shape: (f) => { const x = at(f[E1], '### E1-X3 return'), t = f[E1].slice(Math.max(0, x)); return x > at(f[E1], '### E1-R2 ruling') && /^Baseline: E1-R2$/m.test(t) && /^- D1: /m.test(t) && !/^### D1$/m.test(f[E1]) } },
  { name: 'a new pass on the current baseline E1-R2 and revision a2, its return recorded', ops: [ret(E1, 'E1-X3', 'E1-R2', 'a2', ['D1a: PASS', 'D1b: PASS', 'D2: PASS'])] },
  { name: 'E1 moved Done on it', ops: [state(E1, 'Done')] },
])

console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
