// Three-clause tamper test for the record line parser, per CLAUDE.md.
//
//   node hooks/dctr-record.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 runs the parser over a record holding one of every line form hub step 5 defines, prose
// around them and near misses, and confirms each form comes back with its fields and no prose line
// does. Clause 2 runs it over a known-good record of prose and near misses only and confirms it
// finds nothing. Clause 3 proves the fixtures carry what those clauses rest on without calling the
// parser, so a parser that silently returns nothing cannot pass clause 1 by the fixture being empty.

import { parseRecord, STATE_LINE } from './dctr-record.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const T = '2026-09-23T10:38:00Z'

// One of every form, each as a list item or bare, key case varied, with prose and near misses between.
const FORMS = [
  `- wave: ${T} seat H handle none`,
  `WAVE: ${T} seat codex-1 handle task-42 via doctrine-handoff`,
  `- round: 3 closed ${T} at 1fee265 blockers 2 alarm 1`,
  `- finding: F1 raised ${T} blocking the parser drops a form`,
  `finding: F2 raised ${T} non-blocking the comment is vague`,
  `- finding: F1 cleared ${T} diff hunk 12-14 and grep finds nothing`,
  `- ruling: D5 ${T} the ruling wins over feasibility`,
  `- alarm: round fired ${T} count 4`,
  `alarm: time fired ${T} count 1`,
  `- question: Q1 opened ${T} which matcher does clear use`,
  `- Question: Q1 answered ${T} clear only`,
  `- auto-cycle: on cap 3 tier 60%`,
  `auto-cycle: off`,
  `- auto-cycle: warned 4a9392da-bd72 unknown`,
  `- auto-cycle: cycle 2 tree 9f2c1ab`,
  `- auto-cycle: ready`,
  `- auto-cycle paused: waiting on Scott`,
  `- State: Blocked. Q1 open`,
  // the same keys bare, so clause 3a can require both layouts per key and clause 1a counts them
  `round: 4 closed ${T} at 4b241fd blockers 0 alarm 1`,
  `finding: F5 cleared ${T} rerun green`,
  `ruling: D7 ${T} append, never edit`,
  `question: Q3 opened ${T} which layout`,
  `auto-cycle paused: cap reached`,
  `State: Exited`,
]
// Lines that start like a form, or mention one, and must not parse.
const NEAR = [
  'The wave: went out at ten, seat H.',
  '- wave: yesterday seat H handle none',
  `- round: three closed ${T} at abc blockers 0 alarm 0`,
  `- finding: F3 raised ${T} maybe the text`,
  `- finding: F4 cleared ${T}`,
  '- ruling: D6 today the ruling',
  `- alarm: budget fired ${T} count 1`,
  `- question: Q2 asked ${T} what now`,
  '- auto-cycle: sometimes',
  '- auto-cycle paused:',
  '* wave: 2026-09-23T10:38:00Z seat H handle none',
]
const PROSE = ['# e8-restore record', '', 'Anchor: "go kickoff".', 'wrapper: doctrine-code', 'Some prose about the round.']
const RECORD = [...PROSE, ...FORMS.slice(0, 9), ...NEAR, ...FORMS.slice(9, 18), '- State: Open', ...FORMS.slice(18), `- State: Blocked. Q1 open`].join('\n')
const GOOD = [...PROSE, ...NEAR].join('\n')

const r = parseRecord(RECORD)
const by = (kind) => r.entries.filter((e) => e.kind === kind)
const lines = RECORD.split('\n')

// ---------------------------------------------------------------- clause 1: every form, and nothing else

const want = {
  wave: 2, round: 2, 'finding-raised': 2, 'finding-cleared': 2, ruling: 2, alarm: 2,
  'question-opened': 2, 'question-answered': 1, 'auto-cycle': 7, state: 4,
}
const counts = Object.fromEntries(Object.keys(want).map((k) => [k, by(k).length]))
clause('clause 1a — every form is returned once per line that carries it, no kind missing and none extra',
  JSON.stringify(counts) === JSON.stringify(want) && r.entries.length === Object.values(want).reduce((a, b) => a + b),
  `counts ${JSON.stringify(counts)}, total ${r.entries.length}`)

clause('clause 1b — no prose line and no near miss is an entry',
  r.entries.every((e) => !PROSE.includes(lines[e.line - 1]) && !NEAR.includes(lines[e.line - 1])),
  JSON.stringify(r.entries.filter((e) => PROSE.includes(lines[e.line - 1]) || NEAR.includes(lines[e.line - 1]))))

const bare = (l) => l.replace(/^-\s+/, '').toLowerCase()
const keyOf = (kind) => (kind === 'state' ? 'state:' : kind.replace(/-(raised|cleared|opened|answered)$/, '').replace(/^auto-cycle$/, 'auto-cycle'))
clause('clause 1c — each entry\'s line is the 1-based number of the line it came from, in file order',
  r.entries.every((e, i) => bare(lines[e.line - 1]).startsWith(keyOf(e.kind)) && (i === 0 || r.entries[i - 1].line < e.line)),
  JSON.stringify(r.entries.map((e) => [e.line, e.kind, lines[e.line - 1]])))

const [w1, w2] = by('wave')
clause('clause 1d — wave fields, with and without via',
  w1.time === T && w1.seat === 'H' && w1.handle === 'none' && w1.via === null &&
  w2.seat === 'codex-1' && w2.handle === 'task-42' && w2.via === 'doctrine-handoff',
  JSON.stringify([w1, w2]))

const [rd] = by('round')
clause('clause 1e — round fields, the counts as numbers',
  rd.n === 3 && rd.time === T && rd.revision === '1fee265' && rd.blockers === 2 && rd.alarm === 1,
  JSON.stringify(rd))

const [f1, f2] = by('finding-raised'), [fc] = by('finding-cleared')
clause('clause 1f — a raised finding carries id, time, blocking and text; a cleared one its evidence',
  f1.id === 'F1' && f1.blocking === true && f1.text === 'the parser drops a form' &&
  f2.id === 'F2' && f2.blocking === false && f2.text === 'the comment is vague' &&
  fc.id === 'F1' && fc.time === T && fc.evidence === 'diff hunk 12-14 and grep finds nothing',
  JSON.stringify([f1, f2, fc]))

const [ru] = by('ruling'), [a1, a2] = by('alarm'), [qo] = by('question-opened'), [qa] = by('question-answered')
clause('clause 1g — ruling, alarm and question fields',
  ru.id === 'D5' && ru.time === T && ru.text === 'the ruling wins over feasibility' &&
  a1.which === 'round' && a1.count === 4 && a2.which === 'time' && a2.time === T &&
  qo.id === 'Q1' && qo.text === 'which matcher does clear use' && qa.id === 'Q1' && qa.text === 'clear only',
  JSON.stringify([ru, a1, a2, qo, qa]))

const ac = by('auto-cycle')
const sub = (s) => ac.find((e) => e.sub === s) || {}
clause('clause 1h — every auto-cycle sub-form with its fields',
  sub('on').cap === 3 && sub('on').tier === '60%' && 'off' in Object.fromEntries(ac.map((e) => [e.sub, 1])) &&
  sub('warned').session === '4a9392da-bd72' && sub('warned').tier === 'unknown' &&
  sub('cycle').n === 2 && sub('cycle').hash === '9f2c1ab' && sub('ready').kind === 'auto-cycle' &&
  sub('paused').reason === 'waiting on Scott',
  JSON.stringify(ac))

clause('clause 1i — state is the LAST state entry, and the wrapper is read',
  r.state && r.state.value === 'Blocked. Q1 open' && r.state.raw === '- State: Blocked. Q1 open' && r.state.line === lines.length && r.wrapper === 'doctrine-code',
  JSON.stringify({ state: r.state, wrapper: r.wrapper }))

// The E7 drive kit's fixture record, its two lines exactly as the kit writes them.
const KIT = ['# limiter phase', 'Wrapper: doctrine:doctrine-code. Opened 2026-09-20T09:00:00Z.', '', '- **State: Open.** limiter phase.'].join('\n')
const kit = parseRecord(KIT)
clause('clause 1j — the E7 kit record: bold state line read, wrapper token taken with its prefix and period stripped',
  kit.state && kit.state.value === 'Open. limiter phase.' && kit.state.raw === '- **State: Open.** limiter phase.' && kit.state.line === 4 && kit.wrapper === 'doctrine-code',
  JSON.stringify(kit))

clause('clause 1l — a state line with the key or the value in bold reads its value with every ** removed, and keeps the raw line',
  parseRecord('- **State:** Open').state.value === 'Open' && parseRecord('State: **Blocked**. Q1').state.value === 'Blocked. Q1' &&
  parseRecord('- **State:** Open').state.raw === '- **State:** Open',
  JSON.stringify([parseRecord('- **State:** Open').state, parseRecord('State: **Blocked**. Q1').state]))

clause('clause 1k — a record with no state line and no wrapper line reads null for both',
  parseRecord('# nothing\n\nprose only').state === null && parseRecord('# nothing').wrapper === null,
  JSON.stringify(parseRecord('# nothing\n\nprose only')))

// ---------------------------------------------------------------- clause 2: known-good stays quiet

const g = parseRecord(GOOD)
clause('clause 2 — a record of prose and near misses only yields no entry and no state',
  g.entries.length === 0 && g.state === null,
  JSON.stringify(g.entries))

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const KEYS = ['wave:', 'round:', 'finding:', 'ruling:', 'alarm:', 'question:', 'auto-cycle:', 'auto-cycle paused:', 'state:']
clause('clause 3a — without the parser: the record holds every key as a list item and as a bare line, the near misses start with form keys, and GOOD holds none of FORMS',
  KEYS.every((k) => FORMS.some((l) => l.startsWith('- ') && bare(l).startsWith(k)) && FORMS.some((l) => !l.startsWith('- ') && bare(l).startsWith(k))) &&
  NEAR.filter((l) => KEYS.some((k) => bare(l).startsWith(k))).length >= 9 &&
  FORMS.every((l) => RECORD.split('\n').includes(l)) && !FORMS.some((l) => GOOD.split('\n').includes(l)),
  'a fixture that lacked a form would let clause 1 pass by never meeting it')

clause('clause 3b — without the parser: the record has more than one state line and the last differs from the first',
  lines.filter((l) => STATE_LINE.test(l.trim())).length === 4 && lines.at(-1) !== '- State: Open',
  'if the record held one state line, "last" in clause 1i would prove nothing')

clause('clause 3c — without the parser: the kit wrapper line has text after its value, a prefix and a period',
  /^Wrapper: doctrine:doctrine-code\. \S/.test(KIT.split('\n')[1]),
  'if the kit line ended at its value, clause 1j would not show the first-token rule')

process.exit(bad ? 1 : 0)
