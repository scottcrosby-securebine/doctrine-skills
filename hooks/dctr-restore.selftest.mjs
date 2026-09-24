// Behavioral tamper test for the session restore hook (E8-D1, E8-D1b), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-restore.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Drives hooks/dctr-restore.mjs end to end over fixture directories, with a tripwire `herdr` first on
// PATH: the hook must never exec one. Clause 1 confirms each reason to stand down stands down; clause 2
// confirms an Open or Blocked record, in-repo and in a sibling repo, is restored with the four facts;
// clause 3 proves the fixtures carry what those clauses rest on without running the hook. The pure
// helpers the hook routes through are pinned here too, since the hook is their only caller.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { restoreSkip, kickoffHandoff, handoffHeader, resolveRecordPath, restoreContext, RESTORE_MAX } from './dctr-lib.mjs'
import { STATE_LINE } from './dctr-record.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const hook = path.join(import.meta.dirname, 'dctr-restore.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-restore-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const tripwire = path.join(tmp, 'herdr-was-called')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const LONG = 'x'.repeat(5000)
const recordText = (state, wrapper = 'Wrapper: doctrine:doctrine-code. Opened 2026-09-20T09:00:00Z.') =>
  ['# e8-fixture record', wrapper, '', '- State: Open', '- round: 1 closed 2026-09-23T10:00:00Z at abc1234 blockers 0 alarm 0', `- State: ${state}`, ''].join('\n')
const memoryText = (handoff) => ['# Session memory', '', '## Next Session Kickoff', `handoff: ${handoff} | state: none`, 'Pick up the phase.', ''].join('\n')
const handoffText = (record) => ['supersedes: none', 'phase: `e8-fixture`, state: Open', `record: \`${record}\` last state line 6`,
  'wrapper: doctrine-code', 'invoke doctrine:doctrine first', '', '# Handoff', 'body', ''].join('\n')

/** A project dir with a memory file, a handoff, and a record in-repo or in a sibling tracking repo. */
function fixture(name, { state = 'Open', where = 'in-repo', memory = true, handoff = 'docs/handoffs/h.md', writeHandoff = true, writeRecord = true } = {}) {
  const parent = path.join(tmp, name)
  const proj = path.join(parent, 'proj')
  const ref = where === 'sibling' ? 'track/.doctrine/records/r.md' : '.doctrine/records/r.md'
  const recordAbs = where === 'sibling' ? path.join(parent, ref) : path.join(proj, ref)
  if (memory) write(path.join(proj, 'SESSION_MEMORY.md'), memoryText(handoff))
  if (writeHandoff && handoff !== 'none') write(path.join(proj, handoff), handoffText(ref))
  if (writeRecord) write(recordAbs, recordText(state))
  fs.mkdirSync(proj, { recursive: true })
  return { proj, ref, recordAbs }
}

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp }
delete env.CLAUDE_PROJECT_DIR
delete env.HERDR_PANE_ID
const run = (payload, extraEnv = {}) => {
  const r = spawnSync('node', [hook], { input: JSON.stringify(payload), env: { ...env, ...extraEnv }, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const clear = (cwd, more = {}) => ({ hook_event_name: 'SessionStart', source: 'clear', session_id: 'sess-1', transcript_path: '/t.jsonl', cwd, ...more })

const openIn = fixture('open-in'), openSib = fixture('open-sib', { where: 'sibling' })
const blkIn = fixture('blk-in', { state: 'Blocked. Q1 open' }), blkSib = fixture('blk-sib', { state: 'Blocked. Q1 open', where: 'sibling' })
const exited = fixture('exited', { state: 'Exited.' })
const noMem = fixture('no-mem', { memory: false }), noneHo = fixture('none-ho', { handoff: 'none' })
const noHo = fixture('no-ho', { writeHandoff: false }), noRec = fixture('no-rec', { writeRecord: false })
const long = fixture('long'); write(long.recordAbs, recordText(`Open ${LONG}`))

// ---------------------------------------------------------------- clause 2: an open phase is restored

const facts = (res, f, state) => {
  try {
    const j = JSON.parse(res.out)
    const t = j.hookSpecificOutput.additionalContext
    return Object.keys(j).length === 1 && j.hookSpecificOutput.hookEventName === 'SessionStart' && typeof t === 'string' &&
      t.length < RESTORE_MAX && t.includes('e8-fixture') && t.includes(f.recordAbs) &&
      t.includes(`"- State: ${state}"`) && t.includes('doctrine:doctrine-code') && t.includes(path.join(f.proj, 'docs/handoffs/h.md')) && res.code === 0
  } catch { return false }
}
for (const [n, f, state, via] of [['2a', openIn, 'Open', 'cwd'], ['2b', openSib, 'Open', 'cwd'],
  ['2c', blkIn, 'Blocked. Q1 open', 'CLAUDE_PROJECT_DIR'], ['2d', blkSib, 'Blocked. Q1 open', 'CLAUDE_PROJECT_DIR']]) {
  const res = via === 'cwd' ? run(clear(f.proj)) : run(clear('/nowhere'), { CLAUDE_PROJECT_DIR: f.proj })
  clause(`clause ${n} — ${state.split('.')[0]} record ${f.recordAbs.includes('/track/') ? 'in a sibling repo' : 'in-repo'}, project dir from ${via}: one SessionStart JSON object naming phase, record path, last state line, wrapper and handoff, under ${RESTORE_MAX} chars`,
    facts(res, f, state), `code ${res.code} out ${res.out} err ${res.err}`)
}

const lres = run(clear(long.proj))
let lt = ''
try { lt = JSON.parse(lres.out).hookSpecificOutput.additionalContext } catch { /* the clause reports it */ }
clause('clause 2e — a 5,000-character state line is cut, and the other facts survive under the limit',
  lt.length > 0 && lt.length < RESTORE_MAX && lt.includes('e8-fixture') && lt.includes(long.recordAbs) && lt.includes('doctrine:doctrine-code') && lt.includes('…'),
  `length ${lt.length}: ${lt.slice(0, 200)}`)

// B5, T8: the restore file the auto-cycle typer waits for, written only when the hook injected and HERDR_PANE_ID is set.
const restored = (pane) => path.join(tmp, 'dctr-autocycle', `pane-${pane}.restored`)
const rNoPane = run(clear(openIn.proj))
const noPaneFiles = fs.existsSync(path.join(tmp, 'dctr-autocycle')) ? fs.readdirSync(path.join(tmp, 'dctr-autocycle')) : []
const rPane = run(clear(openIn.proj, { session_id: 'sess-new', transcript_path: '/new.jsonl' }), { HERDR_PANE_ID: 'w7:p3' })
let rf = null
try { rf = JSON.parse(fs.readFileSync(restored('w7_p3'), 'utf8')) } catch { /* the clause reports it */ }
const rSkip = run(clear(exited.proj, { session_id: 'sess-skip' }), { HERDR_PANE_ID: 'w7:p4' })
clause('clause 2f — with HERDR_PANE_ID set and the facts injected, the restore file carries the new session id and transcript path; without the pane id, or on a stand-down, none is written (B5)',
  facts(rNoPane, openIn, 'Open') && noPaneFiles.length === 0 && rPane.out.includes('additionalContext') &&
  rf?.session_id === 'sess-new' && rf?.transcript_path === '/new.jsonl' && rSkip.out === '' && !fs.existsSync(restored('w7_p4')),
  `noPane ${JSON.stringify(noPaneFiles)} file ${JSON.stringify(rf)} skip ${rSkip.out}`)

// ---------------------------------------------------------------- clause 1: every reason to stand down

for (const [n, what, res] of [
  ['1a', 'source startup', run(clear(openIn.proj, { source: 'startup' }))],
  ['1b', 'source resume', run(clear(openIn.proj, { source: 'resume' }))],
  ['1c', 'source compact', run(clear(openIn.proj, { source: 'compact' }))],
  ['1d', 'a clear carrying agent_id', run(clear(openIn.proj, { agent_id: 'ad1a7dbb0d453a08d' }))],
  ['1d2', 'a clear carrying an empty agent_id', run(clear(openIn.proj, { agent_id: '' }))],
  ['1d3', 'a clear carrying a null agent_id', run(clear(openIn.proj, { agent_id: null }))],
  ['1e', 'an Exited record (SC1)', run(clear(exited.proj))],
  ['1f', 'no memory file', run(clear(noMem.proj))],
  ['1g', 'handoff: none', run(clear(noneHo.proj))],
  ['1h', 'a named handoff that is missing', run(clear(noHo.proj))],
  ['1i', 'a named record that is missing', run(clear(noRec.proj))],
  ['1j', 'an unreadable payload', (() => { const r = spawnSync('node', [hook], { input: 'not json', env, encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr } })()],
]) {
  clause(`clause ${n} — ${what}: exit 0, nothing on stdout, a reason on stderr`,
    res.code === 0 && res.out === '' && /restore skipped — \S/.test(res.err), `code ${res.code} out ${JSON.stringify(res.out)} err ${JSON.stringify(res.err)}`)
}

clause('clause 1k — the tripwire herdr on PATH never fired across every run',
  !fs.existsSync(tripwire), 'the restore hook exec\'d herdr')

clause('clause 1l — the hook logged to its own state dir under TMPDIR',
  fs.readFileSync(path.join(tmp, 'dctr-sess-1', 'hook.log'), 'utf8').split('\n').filter(Boolean).length >= 14,
  'hookLog did not record each run')

// The pure helpers, pinned where the hook alone cannot separate them.
clause('clause 1m — restoreSkip acts only on a main-session clear with a session_id',
  restoreSkip(clear('/p')) === null && restoreSkip(clear('/p', { session_id: '' })) !== null &&
  restoreSkip({ ...clear('/p'), hook_event_name: 'SessionEnd' }) !== null,
  'restoreSkip mis-gated')

clause('clause 1n — kickoffHandoff reads the kickoff\'s machine line only, and none is null',
  kickoffHandoff(memoryText('docs/handoffs/a.md')) === 'docs/handoffs/a.md' && kickoffHandoff(memoryText('none')) === null &&
  kickoffHandoff('handoff: docs/x.md | state: open\n## Next Session Kickoff\nprose only') === null &&
  kickoffHandoff('## Next Session Kickoff\nhandoff: `docs/b.md` | state: open') === 'docs/b.md' &&
  kickoffHandoff('## Next Session Kickoff\nhandoff: ../x.md\nmore') === null,
  'kickoffHandoff read outside the kickoff, kept a none, or took a handoff: line with no | state: half')

const hh = handoffHeader(handoffText('track/r.md') + '\n## 1. State\nrecord: `later.md`\n')
clause('clause 1o — handoffHeader reads phase, record and wrapper above the first ## section only, above or below the # title',
  hh.phase === 'e8-fixture' && hh.record === 'track/r.md' && hh.wrapper === 'doctrine-code' && !('state' in hh) &&
  handoffHeader('- phase: p1\n- record: a/b.md, line 4\n# h').record === 'a/b.md' &&
  handoffHeader('# Handoff\nsupersedes: none\nphase: p2\nrecord: `r2.md`\nwrapper: doctrine-code\n\n## 1. State\nrecord: `late.md`').record === 'r2.md',
  JSON.stringify(hh))

// One table drives clause 1o2 (the parser reads each shape) and clause 3d (each shape really is what its name says,
// checked without the parser): a shape dropped from one is dropped from both, so 3d can never prove a fixture 1o2 no longer runs.
const HDRS = [
  ['bold list-item key, backticked path, trailing comma', '- **record**: `a/r.md`, line 4', 'record', 'a/r.md', (h) => /^- \*\*record\*\*: `a\/r\.md`,/.test(h)],
  ['bold key with the colon inside, bare path', '**Record:** a/r.md', 'record', 'a/r.md', (h) => /^\*\*Record:\*\* a\/r\.md$/.test(h)],
  ['path joined to its line number', 'record: a/r.md:19, which reads', 'record', 'a/r.md', (h) => /r\.md:19,/.test(h)],
  ['backticked path joined to its line number', 'record: `a/r.md:19`', 'record', 'a/r.md', (h) => /`a\/r\.md:19`/.test(h)],
  ['wrapper followed by a comma', 'wrapper: doctrine-code, the E8 wrapper', 'wrapper', 'doctrine-code', (h) => /^wrapper: doctrine-code, \S/.test(h)],
  ['bold wrapper key', '**wrapper:** doctrine-code', 'wrapper', 'doctrine-code', (h) => /^\*\*wrapper:\*\* doctrine-code$/.test(h)],
  ['bold phase key', '**phase:** p3, state Open', 'phase', 'p3', (h) => /^\*\*phase:\*\* p3, /.test(h)],
  ['second record line for a key already read', 'record: `first.md`\nrecord: `second.md`', 'record', 'first.md', (h) => h === 'record: `first.md`\nrecord: `second.md`'],
  ['second phase line for a key already read', 'phase: p1, x\nphase: p2', 'phase', 'p1', (h) => h === 'phase: p1, x\nphase: p2'],
  ['phase with no comma', 'phase: e8-restore Open', 'phase', 'e8-restore', (h) => !h.includes(',') && h.split(' ').length === 3],
  ['backticked phase then a parenthesis', 'phase: `e8-restore` (Open)', 'phase', 'e8-restore', (h) => /`e8-restore` \(/.test(h)],
  ['bare path before backticked text', 'record: a/r.md, last state line at `:19`, which reads: "x"', 'record', 'a/r.md', (h) => /^record: a\/r\.md, .*`:19`/.test(h)],
  ['bare path before a backticked state line', 'record: a/r.md line 12: `- State: Open`', 'record', 'a/r.md', (h) => /a\/r\.md line 12: `- State: Open`/.test(h)],
  ['quoted path', 'record: "a/r.md"', 'record', 'a/r.md', (h) => /^record: "a\/r\.md"$/.test(h)],
  ['phase with the state joined by a space', 'phase: e8-fixture state: Open', 'phase', 'e8-fixture', (h) => /^phase: e8-fixture state:/.test(h)],
  ['bare path before backticked state and a line number', 'record: .doctrine/records/r.md last state `State: Open` line 2', 'record', '.doctrine/records/r.md', (h) => /r\.md last state `State: Open` line 2$/.test(h)],
  ['a record line only inside a ## section', '# Handoff\n## Notes\nrecord: unrelated.md', 'record', null, (h) => h === '# Handoff\n## Notes\nrecord: unrelated.md'],
]
const bad1o2 = HDRS.filter(([, h, key, want]) => handoffHeader(h)[key] !== want).map(([name, h, key]) => [name, handoffHeader(h)[key]])
clause('clause 1o2 — handoffHeader reads every shape in the header table to its expected value, including a record line that sits only inside a ## section',
  bad1o2.length === 0 && HDRS.length === 17, JSON.stringify(bad1o2))

const has = (set) => (p) => set.includes(p)
clause('clause 1p — resolveRecordPath: absolute first, then project dir, then its parent, else null',
  resolveRecordPath('/abs/r.md', '/w/proj', has(['/abs/r.md'])) === '/abs/r.md' &&
  resolveRecordPath('r.md', '/w/proj', has(['/w/proj/r.md', '/w/r.md'])) === '/w/proj/r.md' &&
  resolveRecordPath('t/r.md', '/w/proj', has(['/w/t/r.md'])) === '/w/t/r.md' &&
  resolveRecordPath('t/r.md', '/w/proj', has([])) === null,
  'resolution order wrong')

const rc = restoreContext({ phase: 'p', state: 'Open', stateLine: 'Open', recordPath: '/r.md', wrapper: 'none', handoffPath: '/h.md' })
clause('clause 1q — restoreContext states facts and never orders the session',
  !/\b(you must|must|invoke|run|read the|do not|always|never)\b/i.test(rc) && rc.includes('wrapper: none'),
  rc)

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const lastState = (file) => fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => STATE_LINE.test(l)).at(-1)
clause('clause 3a — without the hook: the Open and Blocked records end on those states, the Exited one on Exited after an earlier Open',
  [openIn, openSib].every((f) => lastState(f.recordAbs) === '- State: Open') &&
  [blkIn, blkSib].every((f) => lastState(f.recordAbs).startsWith('- State: Blocked')) &&
  lastState(exited.recordAbs) === '- State: Exited.' && fs.readFileSync(exited.recordAbs, 'utf8').includes('- State: Open'),
  'a fixture record does not carry the state its clause relies on')

clause('clause 3b — without the hook: a sibling record does not resolve against the project dir, only against its parent',
  [openSib, blkSib].every((f) => !fs.existsSync(path.join(f.proj, f.ref)) && fs.existsSync(path.join(path.dirname(f.proj), f.ref))),
  'if the sibling record also sat in the project dir, clause 2b would not exercise the parent form')

clause('clause 3c — without the hook: each stand-down fixture really lacks what its clause says',
  !fs.existsSync(path.join(noMem.proj, 'SESSION_MEMORY.md')) &&
  fs.readFileSync(path.join(noneHo.proj, 'SESSION_MEMORY.md'), 'utf8').includes('handoff: none |') &&
  !fs.existsSync(path.join(noHo.proj, 'docs/handoffs/h.md')) && fs.existsSync(path.join(noRec.proj, 'docs/handoffs/h.md')) &&
  !fs.existsSync(noRec.recordAbs) && lastState(long.recordAbs).length > RESTORE_MAX,
  'a stand-down fixture carries what it should lack')

fs.rmSync(tmp, { recursive: true, force: true })
clause('clause 3d — without the parser: every header-table shape really carries the property its name says',
  HDRS.every(([, h, , , carries]) => carries(h)) && HDRS.length === 17,
  JSON.stringify(HDRS.filter(([, h, , , carries]) => !carries(h)).map(([n]) => n)))

process.exit(bad ? 1 : 0)
