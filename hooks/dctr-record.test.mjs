import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATE_LINE, unwrapLine, wrapperValue, parseRecord, kickoffHandoff, handoffHeader, restoreState, SECTION_LINE, docHeader,
} from './dctr-record.mjs'

const T = '2026-09-23T10:38:00Z'
const D = '2026-11-07T01:00:00Z'
const D2 = '2026-11-08T02:30:00Z'
// Entries without their line number, for comparing fields alone.
const fields = (text) => parseRecord(text).entries.map(({ line, ...e }) => e)

test('a wave line with no via reads time, seat and handle', () => {
  assert.deepEqual(fields(`- wave: ${T} seat H handle none`), [{ kind: 'wave', time: T, seat: 'H', handle: 'none', deadline: null, via: null }])
})

test('a wave line reads its via token, doctrine-handoff or doctrine-backup, in any key case', () => {
  assert.deepEqual(fields(`WAVE: ${T} seat codex-1 handle task-42 via doctrine-handoff\nwave: ${T} seat backup-1 handle a1b2 via doctrine-backup`), [
    { kind: 'wave', time: T, seat: 'codex-1', handle: 'task-42', deadline: null, via: 'doctrine-handoff' },
    { kind: 'wave', time: T, seat: 'backup-1', handle: 'a1b2', deadline: null, via: 'doctrine-backup' },
  ])
})

test('a wave handle runs to the line end and holds spaces, an indented item read like any other', () => {
  const text = [
    '- wave: 2026-09-25T06:47:05Z seat builder-limiter-reset handle agent:wave1-builder (worktree .doctrine/wt/wave1, branch wave1-limiter-reset)',
    '- wave: 2026-09-25T07:27:00Z seat builder-w1 handle worktree .worktrees/w1 branch phase/limiter-reset-w1',
    '  - wave: 2026-09-25T07:31:00Z seat simplify-reuse-simplification handle agent a85a6588ca552b170',
    `- wave: ${T} seat backup-2 handle agent b77 (worktree wt/b) via doctrine-backup`,
  ].join('\n')
  assert.deepEqual(fields(text), [
    { kind: 'wave', time: '2026-09-25T06:47:05Z', seat: 'builder-limiter-reset', handle: 'agent:wave1-builder (worktree .doctrine/wt/wave1, branch wave1-limiter-reset)', deadline: null, via: null },
    { kind: 'wave', time: '2026-09-25T07:27:00Z', seat: 'builder-w1', handle: 'worktree .worktrees/w1 branch phase/limiter-reset-w1', deadline: null, via: null },
    { kind: 'wave', time: '2026-09-25T07:31:00Z', seat: 'simplify-reuse-simplification', handle: 'agent a85a6588ca552b170', deadline: null, via: null },
    { kind: 'wave', time: T, seat: 'backup-2', handle: 'agent b77 (worktree wt/b)', deadline: null, via: 'doctrine-backup' },
  ])
})

test('a via token with prose after it ends the handle, and a longer word starting with the token does not', () => {
  const text = [
    '- wave: 2026-10-03T01:00:14Z seat backup-review handle /root/backup_review via doctrine-backup; read-only review of memory; deadline 5 minutes.',
    `- wave: ${T} seat h1 handle agent x (wt/h) via doctrine-handoff, dispatched by the handoff skill`,
    `- wave: ${T} seat s handle x via doctrine-backups`,
    `- wave: ${T} seat s handle x via doctrine-backup-old; prose`,
  ].join('\n')
  assert.deepEqual(fields(text).map((e) => [e.handle, e.via, e.deadline]), [
    ['/root/backup_review', 'doctrine-backup', null],
    ['agent x (wt/h)', 'doctrine-handoff', null],
    ['x via doctrine-backups', null, null],
    ['x via doctrine-backup-old; prose', null, null],
  ])
})

test('a deadline clause after the handle is its own field and leaves the handle', () => {
  assert.deepEqual(fields(`- wave: ${T} seat s1 handle job-1 deadline ${D}`), [{ kind: 'wave', time: T, seat: 's1', handle: 'job-1', deadline: D, via: null }])
})

test('a deadline clause is read before or after the via token', () => {
  assert.deepEqual(fields(`wave: ${T} seat s2 handle job-1 via doctrine-handoff deadline ${D2}\n- wave: ${T} seat s3 handle job-1 deadline ${D} via doctrine-backup`).map((e) => [e.handle, e.deadline, e.via]), [
    ['job-1', D2, 'doctrine-handoff'],
    ['job-1', D, 'doctrine-backup'],
  ])
})

test('a deadline clause in the prose after a via is read', () => {
  assert.deepEqual(fields(`- wave: ${T} seat s5 handle job-1 via doctrine-backup; read-only; deadline ${D}.`).map((e) => [e.handle, e.deadline, e.via]), [['job-1', D, 'doctrine-backup']])
})

test('a deadline clause beside the handle wins over one after the via', () => {
  assert.deepEqual(fields(`- wave: ${T} seat s10 handle job-1 deadline ${D} via doctrine-backup deadline ${D2}`).map((e) => [e.handle, e.deadline]), [['job-1', D]])
})

test('a handle that opens with a deadline keeps it, and a later clause is the deadline', () => {
  assert.deepEqual(fields(`- wave: ${T} seat s9 handle deadline ${D2} deadline ${D} via doctrine-backup`).map((e) => [e.handle, e.deadline]), [[`deadline ${D2}`, D]])
  assert.deepEqual(fields(`- wave: ${T} seat p6 handle deadline ${D}`).map((e) => [e.handle, e.deadline]), [[`deadline ${D}`, null]])
})

test('a deadline clause is read in any case and after a tab', () => {
  assert.deepEqual(fields(`- wave: ${T} seat s7 handle job-1 DEADLINE ${D2}\n- wave: ${T} seat s8 handle job-1\tdeadline\t${D}`).map((e) => [e.handle, e.deadline]), [['job-1', D2], ['job-1', D]])
})

test('a deadline clause followed by a comma, semicolon or colon is read, the prose after it kept in the handle', () => {
  assert.deepEqual(fields([
    `- wave: ${T} seat s6 handle job-1 deadline ${D}, a note via doctrine-backup`,
    `- wave: ${T} seat s11 handle job-1 deadline ${D2}; a note`,
    `- wave: ${T} seat s12 handle job-1 deadline ${D}: a note`,
  ].join('\n')).map((e) => [e.handle, e.deadline, e.via]), [
    ['job-1 a note', D, 'doctrine-backup'],
    ['job-1 a note', D2, null],
    ['job-1 a note', D, null],
  ])
})

test('a deadline that is not a form time is prose kept in the handle', () => {
  assert.deepEqual(fields([
    `- wave: ${T} seat p2 handle job-1 deadline 5 minutes`,
    `- wave: ${T} seat p3 handle job-1 deadline 2026-11-07`,
    `- wave: ${T} seat p4 handle job-1 deadline ${D}x`,
  ].join('\n')).map((e) => [e.handle, e.deadline]), [
    ['job-1 deadline 5 minutes', null],
    ['job-1 deadline 2026-11-07', null],
    [`job-1 deadline ${D}x`, null],
  ])
})

test('a hyphenated token ending in deadline is not a deadline clause', () => {
  assert.deepEqual(fields(`- wave: ${T} seat p5 handle job-1-deadline ${D}`).map((e) => [e.handle, e.deadline]), [[`job-1-deadline ${D}`, null]])
})

test('a round line reads its counts as numbers', () => {
  assert.deepEqual(fields(`- round: 3 closed ${T} at 1fee265 blockers 2 alarm 1`), [{ kind: 'round', n: 3, time: T, revision: '1fee265', blockers: 2, alarm: 1 }])
})

test('a raised finding reads id, time, blocking and text', () => {
  assert.deepEqual(fields(`- finding: F1 raised ${T} blocking the parser drops a form\nfinding: F2 raised ${T} non-blocking the comment is vague`), [
    { kind: 'finding-raised', id: 'F1', time: T, blocking: true, text: 'the parser drops a form' },
    { kind: 'finding-raised', id: 'F2', time: T, blocking: false, text: 'the comment is vague' },
  ])
})

test('a cleared finding reads its evidence', () => {
  assert.deepEqual(fields(`- finding: F1 cleared ${T} diff hunk 12-14 and grep finds nothing`), [{ kind: 'finding-cleared', id: 'F1', time: T, evidence: 'diff hunk 12-14 and grep finds nothing' }])
})

test('a ruling line reads id, time and text', () => {
  assert.deepEqual(fields(`ruling: D7 ${T} append, never edit`), [{ kind: 'ruling', id: 'D7', time: T, text: 'append, never edit' }])
})

test('a round or time alarm reads which and its count', () => {
  assert.deepEqual(fields(`- alarm: round fired ${T} count 4\nalarm: time fired ${T} count 1`), [
    { kind: 'alarm', which: 'round', time: T, count: 4 },
    { kind: 'alarm', which: 'time', time: T, count: 1 },
  ])
})

test('a question opened and answered reads id, time and text', () => {
  assert.deepEqual(fields(`- question: Q1 opened ${T} which matcher does clear use\n- Question: Q1 answered ${T} clear only`), [
    { kind: 'question-opened', id: 'Q1', time: T, text: 'which matcher does clear use' },
    { kind: 'question-answered', id: 'Q1', time: T, text: 'clear only' },
  ])
})

test('a relay line reads time, from, to and ref, with prose after the ref', () => {
  const text = ['- relay: 2026-11-07T13:01:00Z lane-b to owner inbox/20261107T130001Z-lane-b.md', `Relay: ${T} owner to lane-a inbox/a.md`, `  - relay: ${T} lane-a to lane-b inbox/b.md; answered the question`].join('\n')
  assert.deepEqual(parseRecord(text).entries, [
    { kind: 'relay', time: '2026-11-07T13:01:00Z', from: 'lane-b', to: 'owner', ref: 'inbox/20261107T130001Z-lane-b.md', line: 1 },
    { kind: 'relay', time: T, from: 'owner', to: 'lane-a', ref: 'inbox/a.md', line: 2 },
    { kind: 'relay', time: T, from: 'lane-a', to: 'lane-b', ref: 'inbox/b.md', line: 3 },
  ])
})

test('a relay line missing a part or with a near-miss time is not an entry', () => {
  assert.deepEqual(parseRecord([`- relay: ${T} lane-b to owner`, `- relay: ${T} lane-b owner inbox/x.md`, '- relay: yesterday lane-b to owner inbox/x.md', '- relay: 2026-11-07 lane-b to owner inbox/x.md'].join('\n')).entries, [])
})

test('every auto-cycle sub-form reads its fields', () => {
  const text = ['- auto-cycle: on cap 3 tier 60%', 'auto-cycle: off', '- auto-cycle: warned 4a9392da-bd72 unknown', '- auto-cycle: cycle 2 tree 9f2c1ab', '- auto-cycle: ready', 'auto-cycle paused: cap reached'].join('\n')
  assert.deepEqual(fields(text), [
    { kind: 'auto-cycle', sub: 'on', cap: 3, tier: '60%' },
    { kind: 'auto-cycle', sub: 'off' },
    { kind: 'auto-cycle', sub: 'warned', session: '4a9392da-bd72', tier: 'unknown' },
    { kind: 'auto-cycle', sub: 'cycle', n: 2, hash: '9f2c1ab' },
    { kind: 'auto-cycle', sub: 'ready' },
    { kind: 'auto-cycle', sub: 'paused', reason: 'cap reached', session: null },
  ])
})

test('each entry carries the 1-based line it came from, in file order', () => {
  assert.deepEqual(parseRecord(`# r\n\n- auto-cycle: ready\nprose\nState: Open`).entries.map((e) => [e.kind, e.line]), [['auto-cycle', 3], ['state', 5]])
})

test('near misses of every form are not entries', () => {
  const text = [
    'The wave: went out at ten, seat H.',
    '- wave: yesterday seat H handle none',
    `- wave: ${T.slice(0, 10)} seat H handle none`,
    `- round: three closed ${T} at abc blockers 0 alarm 0`,
    `- finding: F3 raised ${T} maybe the text`,
    `- finding: F4 cleared ${T}`,
    '- ruling: D6 today the ruling',
    `- alarm: budget fired ${T} count 1`,
    `- question: Q2 asked ${T} what now`,
    '- auto-cycle: sometimes',
    '- auto-cycle paused:',
    `* wave: ${T} seat H handle none`,
    `- wave: ${T} seat H handle`,
  ].join('\n')
  assert.deepEqual(parseRecord(text), { entries: [], state: null, wrapper: null })
})

test('prose appended after a fixed part still parses, the prose in the free-text field only', () => {
  const text = [
    `- round: 3 closed ${T} at 1fee265 blockers 2 alarm 1; the seat ran late`,
    `- alarm: round fired ${T} count 4. Scott ruled at ten`,
    '- auto-cycle: off, diagnosis sent',
    '- auto-cycle: ready (copied from the pane)',
    `- ruling: D5 ${T} the ruling wins; see notes.`,
  ].join('\n')
  assert.deepEqual(fields(text), [
    { kind: 'round', n: 3, time: T, revision: '1fee265', blockers: 2, alarm: 1 },
    { kind: 'alarm', which: 'round', time: T, count: 4 },
    { kind: 'auto-cycle', sub: 'off' },
    { kind: 'auto-cycle', sub: 'ready' },
    { kind: 'ruling', id: 'D5', time: T, text: 'the ruling wins; see notes.' },
  ])
})

test('a fixed part run straight into more word characters is not a form', () => {
  const text = [`- round: 3 closed ${T} at abc blockers 2 alarm 1x`, `- alarm: round fired ${T} count 4.5`, '- auto-cycle: offline', '- auto-cycle: readying', '- auto-cycle: cycle 2 tree 9f2c1abz'].join('\n')
  assert.deepEqual(parseRecord(text).entries, [])
})

test('the state is the last state line, with raw and value', () => {
  const r = parseRecord('# r\n- State: Open\nprose\n- State: Blocked. Q1 open\nmore prose')
  assert.deepEqual(r.state, { kind: 'state', line: 4, raw: '- State: Blocked. Q1 open', value: 'Blocked. Q1 open' })
  assert.deepEqual(r.entries.map((e) => e.value), ['Open', 'Blocked. Q1 open'])
})

test('a bold list state line from the E7 kit is read', () => {
  const r = parseRecord('# limiter phase\n\n- **State: Open.** limiter phase.')
  assert.deepEqual(r.state, { kind: 'state', line: 3, raw: '- **State: Open.** limiter phase.', value: 'Open. limiter phase.' })
})

test('a state line with the key or value in bold reads its value with every bold marker removed', () => {
  assert.equal(parseRecord('- **State:** Open').state.value, 'Open')
  assert.equal(parseRecord('- **State:** Open').state.raw, '- **State:** Open')
  assert.equal(parseRecord('State: **Blocked**. Q1').state.value, 'Blocked. Q1')
})

test('a dash with no space before the key is not a state line', () => {
  assert.equal(STATE_LINE.test('-State: Open'), false)
  assert.equal(parseRecord('-State: Open').state, null)
  assert.equal(STATE_LINE.test('- State: Open'), true)
})

test('an auto-cycle paused line is not a state line', () => {
  const r = parseRecord('- State: Open\n- auto-cycle paused: waiting on Scott')
  assert.equal(r.state.value, 'Open')
  assert.deepEqual(r.entries.map((e) => e.kind), ['state', 'auto-cycle'])
})

test('a record with no state and no wrapper line reads null for both', () => {
  assert.deepEqual(parseRecord('# nothing\n\nprose only'), { entries: [], state: null, wrapper: null })
})

test('the wrapper is the last wrapper line', () => {
  assert.equal(parseRecord('wrapper: doctrine-draft\nprose\nwrapper: doctrine-code').wrapper, 'doctrine-code')
})

test('the kit wrapper line reads its first token with the prefix and period stripped', () => {
  assert.equal(parseRecord('# limiter phase\nWrapper: doctrine:doctrine-code. Opened 2026-09-20T09:00:00Z.').wrapper, 'doctrine-code')
})

test('wrapperValue strips backticks, bold, the doctrine prefix and trailing punctuation', () => {
  assert.equal(wrapperValue('`doctrine:doctrine-code`,'), 'doctrine-code')
  assert.equal(wrapperValue('**doctrine-write;'), 'doctrine-write')
  assert.equal(wrapperValue('``'), null)
})

test('the agent-written auto-cycle forms parse wrapped in inline code, bold or italics', () => {
  const text = ['- `auto-cycle: ready`', '`auto-cycle: ready`', '**auto-cycle: off**', '- *auto-cycle: ready*', '- **`auto-cycle: on cap 12 tier 60%`**', '- `auto-cycle paused: question: which way?`'].join('\n')
  assert.deepEqual(fields(text), [
    { kind: 'auto-cycle', sub: 'ready' },
    { kind: 'auto-cycle', sub: 'ready' },
    { kind: 'auto-cycle', sub: 'off' },
    { kind: 'auto-cycle', sub: 'ready' },
    { kind: 'auto-cycle', sub: 'on', cap: 12, tier: '60%' },
    { kind: 'auto-cycle', sub: 'paused', reason: 'question: which way?', session: null },
  ])
})

test('hook-written forms and wrapped lines with other words are not read through a wrapper', () => {
  const text = ['- `auto-cycle: warned s1 60%`', '`auto-cycle: cycle 2 tree ab`', `\`- round: 3 closed ${T} at a blockers 0 alarm 0\``, 'Done: `auto-cycle: ready`', '- `auto-cycle: ready` then more', '- `auto-cycle: ready*'].join('\n')
  assert.deepEqual(parseRecord(text).entries, [])
})

test('prose quoting a form in two spans of one delimiter is not an entry', () => {
  const text = ['- `auto-cycle paused: R7` means the hook saw a permission prompt, I approved it with `yes`', '- `auto-cycle: on cap 10 tier 60%` and `auto-cycle: off`', '`auto-cycle: off` then `on`', '- **auto-cycle: ready** or **not**', '- *auto-cycle: ready* and *more*'].join('\n')
  assert.deepEqual(parseRecord(text).entries, [])
})

test('unwrapLine removes a list marker and one span over the whole rest of the line', () => {
  assert.equal(unwrapLine('- `auto-cycle: ready`'), 'auto-cycle: ready')
  assert.equal(unwrapLine('1. **`x y`**'), 'x y')
  assert.equal(unwrapLine('`a` then `b`'), '`a` then `b`')
  assert.equal(unwrapLine('- `auto-cycle: ready` then more'), '`auto-cycle: ready` then more')
  assert.equal(unwrapLine(undefined), '')
})

test('a paused line writer tag is split off as the session', () => {
  const text = ['- auto-cycle paused: session idle, waiting for you [session s-1]', '- auto-cycle paused: Claude API error: overloaded [session 1e90ba4f-0082]', '- auto-cycle paused: question: [session x] first?', '- `auto-cycle paused: waiting for your permission approval [session s-2]`'].join('\n')
  assert.deepEqual(fields(text).map((e) => [e.reason, e.session]), [
    ['session idle, waiting for you', 's-1'],
    ['Claude API error: overloaded', '1e90ba4f-0082'],
    ['question: [session x] first?', null],
    ['waiting for your permission approval', 's-2'],
  ])
})

test('a paused line with a carriage return or Unicode separator cuts its reason at the break', () => {
  for (const s of ['\r', ' ', ' ']) {
    assert.deepEqual(fields(`- auto-cycle paused: Claude API error: upstream unavailable${s}retry later`), [{ kind: 'auto-cycle', sub: 'paused', reason: 'Claude API error: upstream unavailable', session: null }])
  }
  assert.deepEqual(fields('- auto-cycle paused: session idle [session s-1]  '), [{ kind: 'auto-cycle', sub: 'paused', reason: 'session idle', session: 's-1' }])
})

test('a paused line holding two line breaks is not an entry', () => {
  assert.deepEqual(parseRecord('- auto-cycle paused: a\rb\rc').entries, [])
  assert.deepEqual(parseRecord('- auto-cycle paused: a b c').entries, [])
})

test('a writer tag after a line break is not read as the session', () => {
  assert.deepEqual(fields('- auto-cycle paused: a\r[session s1]').map((e) => [e.reason, e.session]), [['a', null]])
  assert.deepEqual(fields('- auto-cycle paused: a\r [session s1]').map((e) => [e.reason, e.session]), [['a', null]])
})

test('kickoffHandoff reads the machine line under the kickoff heading, backticks stripped', () => {
  assert.equal(kickoffHandoff('# m\n## Next Session Kickoff\nprose\nhandoff: `docs/b.md` | state: open'), 'docs/b.md')
  assert.equal(kickoffHandoff('## next session kickoff\nhandoff: docs/handoffs/a.md | state: Open'), 'docs/handoffs/a.md')
})

test('kickoffHandoff returns null for none, no kickoff, a line outside it, or one without its state half', () => {
  assert.equal(kickoffHandoff('## Next Session Kickoff\nhandoff: none | state: none'), null)
  assert.equal(kickoffHandoff('# m\nprose'), null)
  assert.equal(kickoffHandoff('handoff: docs/x.md | state: open\n## Next Session Kickoff\nprose only'), null)
  assert.equal(kickoffHandoff('## Next Session Kickoff\nhandoff: ../x.md\nmore'), null)
  assert.equal(kickoffHandoff('## Next Session Kickoff\nprose\n## Other\nhandoff: x.md | state: open'), null)
})

test('handoffHeader reads phase, record and wrapper above or below the title', () => {
  assert.deepEqual(handoffHeader('- phase: p1\n- record: a/b.md, line 4\n# h'), { phase: 'p1', record: 'a/b.md', wrapper: null })
  assert.deepEqual(handoffHeader('# Handoff\nsupersedes: none\nphase: p2\nrecord: `r2.md`\nwrapper: doctrine:doctrine-code\n\n## 1. State\nrecord: `late.md`'), { phase: 'p2', record: 'r2.md', wrapper: 'doctrine-code' })
})

test('handoffHeader ignores a record line inside a section', () => {
  assert.deepEqual(handoffHeader('# Handoff\n## Notes\nrecord: unrelated.md'), { phase: null, record: null, wrapper: null })
})

test('handoffHeader keeps the first line for each key', () => {
  assert.equal(handoffHeader('record: `first.md`\nrecord: `second.md`').record, 'first.md')
  assert.equal(handoffHeader('phase: p1, x\nphase: p2').phase, 'p1')
})

test('handoffHeader cuts a line number joined to the record path', () => {
  assert.equal(handoffHeader('record: a/r.md:19, which reads').record, 'a/r.md')
  assert.equal(handoffHeader('record: `a/r.md:19`').record, 'a/r.md')
})

test('handoffHeader reads bold and quoted keys and values to their first word', () => {
  assert.equal(handoffHeader('- **record**: `a/r.md`, line 4').record, 'a/r.md')
  assert.equal(handoffHeader('**Record:** a/r.md').record, 'a/r.md')
  assert.equal(handoffHeader('record: "a/r.md"').record, 'a/r.md')
  assert.equal(handoffHeader('**wrapper:** doctrine-code').wrapper, 'doctrine-code')
  assert.equal(handoffHeader('**phase:** p3, state Open').phase, 'p3')
})

test('handoffHeader reads a phase with no comma as its first word', () => {
  assert.equal(handoffHeader('phase: e8-restore Open').phase, 'e8-restore')
  assert.equal(handoffHeader('phase: `e8-restore` (Open)').phase, 'e8-restore')
  assert.equal(handoffHeader('phase: e8-fixture state: Open').phase, 'e8-fixture')
})

test('restoreState is Open or Blocked as the first word, else null', () => {
  assert.equal(restoreState('Open'), 'Open')
  assert.equal(restoreState('Blocked. Q1 open'), 'Blocked')
  assert.equal(restoreState('open, limiter'), 'open')
  assert.equal(restoreState('Exited'), null)
  assert.equal(restoreState('Shipped at an escalation'), null)
  assert.equal(restoreState('Opened'), null)
  assert.equal(restoreState(null), null)
})

test('the section line pattern matches a level-two heading with a title only', () => {
  assert.deepEqual(SECTION_LINE.exec('## Phases')?.[1], 'Phases')
  assert.equal(SECTION_LINE.test('### Sub'), false)
  assert.equal(SECTION_LINE.test('##'), false)
})

test('docHeader reads the title and header lines, a repeated key keeping its last', () => {
  const h = docHeader('# Project X\nStatus: Open\nRecords: docs/epics\n\nStatus: Shipped\n')
  assert.deepEqual(h.title, { text: 'Project X', line: 1 })
  assert.deepEqual({ ...h.headers }, { Status: { value: 'Shipped', line: 5 }, Records: { value: 'docs/epics', line: 3 } })
})

test('docHeader stops at the first section heading', () => {
  assert.deepEqual({ ...docHeader('# P\nStatus: Open\n## Phases\nRecords: later\n').headers }, { Status: { value: 'Open', line: 2 } })
})

test('docHeader reads past a bare double hash or a deeper heading', () => {
  assert.deepEqual({ ...docHeader('# P\n##\n### Sub\nRecords: docs/epics\n').headers }, { Records: { value: 'docs/epics', line: 4 } })
})

test('docHeader keeps an empty header value empty', () => {
  assert.deepEqual({ ...docHeader('# P\nOwner:\nRecords: docs/epics\n').headers }, { Owner: { value: '', line: 2 }, Records: { value: 'docs/epics', line: 3 } })
})

test('docHeader with no title reads a null title', () => {
  assert.deepEqual(docHeader('prose\n## A'), { title: null, headers: Object.create(null) })
})
