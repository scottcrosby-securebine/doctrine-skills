// Behavioral tamper test for the auto-cycle typer (E8-D15, B4, seams T4 and T7), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-typer.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins typerStep in dctr-lib.mjs, one observation at a time. Clause 2 drives hooks/dctr-typer.mjs end to
// end with a `herdr` PATH shim that logs every call and plays a scripted pane: its session, status and focus, what
// /clear does (a restore file written, none, or a stale one) and whether the new session replies to the resume
// line. Each E8-D15 Check case asserts its sends (/clear, resume). The shim never reaches a herdr server. Clause 3
// proves the fixtures carry what the clauses rest on without running the typer.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-typer-'))
process.env.TMPDIR = tmp
const { typerStep, typedAfter, userTyped, transcriptEntries, TYPER_TIMES, RESUME_LINE, R17_WHY } = await import('./dctr-lib.mjs')
const { restoreFile, claimFile, reserveMarker, autoCycleDir } = await import('./dctr-state.mjs')
const { parseRecord } = await import('./dctr-record.mjs')

// ---------------------------------------------------------------- clause 1: typerStep (T4)

const T = { poll: 20, idle: 150, restore: 400, session: 400, firstTurn: 300 }
const idle = { status: 'idle', focused: false, session: 'old' }
const base = { stage: 'clear', active: true, pausedSinceClaim: false, pane: idle, oldSession: 'old', grew: false, restore: null, waited: 0, notIdle: 0, sessionWait: 0, resumes: 0, firstTurn: false, times: T }
const ts = (o) => typerStep({ ...base, ...o })
const NEW = { session: 'new', transcript: '/n.jsonl' }
clause('clause 1a — typerStep before /clear: idle, unfocused, the old session and no new entries clear',
  ts({}).act === 'clear', JSON.stringify(ts({})))
clause('clause 1b — typerStep: auto-cycle no longer active, or a paused line since the claim, aborts before any other check',
  ts({ active: false, pane: { error: 'x' } }).act === 'abort' && ts({ pausedSinceClaim: true }).act === 'abort', 'did not abort')
clause('clause 1c — typerStep: a focused pane waits, in every stage, and a pane whose focus is unknown waits too',
  ts({ pane: { ...idle, focused: true } }).act === 'wait' && ts({ pane: { ...idle, focused: undefined } }).act === 'wait' &&
  ts({ stage: 'resume', restore: NEW, pane: { ...idle, focused: true, session: 'new' } }).act === 'wait', 'did not wait')
clause('clause 1d — typerStep: a changed session or new transcript entries before /clear pause with R16',
  ts({ pane: { ...idle, session: 'other' } }).reason === 'auto-cycle stopped: you typed in this pane' && ts({ grew: true }).code === 'R16', 'no R16')
clause('clause 1e — typerStep: not ready waits inside the grace, then pauses with R17 in a fixed phrase; a failed lookup pauses with R17',
  ts({ pane: { ...idle, status: 'working' }, notIdle: 10 }).act === 'wait' &&
  ts({ pane: { ...idle, status: 'working' }, notIdle: 200 }).reason === 'could not type into the pane: the session stayed busy' &&
  ts({ pane: { error: true } }).reason === 'could not type into the pane: herdr could not read the pane', 'wrong')
// RB1: one observation per agent_status value herdr 0.9.1 reports, plus a missing one.
const STATUS = [['idle', 'clear'], ['done', 'clear'], ['working', 'pause'], ['blocked', 'pause'], ['unknown', 'pause'], [undefined, 'pause']]
const statusBad = STATUS.filter(([st, act]) => ts({ pane: { ...idle, status: st }, notIdle: 200 }).act !== act ||
  (act === 'pause' && ts({ pane: { ...idle, status: st }, notIdle: 200 }).reason !== 'could not type into the pane: the session stayed busy'))
clause('clause 1e2 — typerStep: agent_status idle and done are both ready; working, blocked, unknown and a missing status are not, and no reason names the status (RB1, SP2)',
  statusBad.length === 0 && ts({ stage: 'resume', restore: NEW, pane: { ...idle, status: 'done', session: 'new' } }).act === 'resume',
  JSON.stringify(statusBad.map(([st]) => [st, ts({ pane: { ...idle, status: st }, notIdle: 200 })])))
clause('clause 1e3 — typerStep: a reply with no Claude session is a failed lookup, never a changed session (ST2)',
  ts({ pane: { ...idle, session: undefined } }).reason === 'could not type into the pane: herdr could not read the pane' &&
  ts({ stage: 'resume', restore: NEW, pane: { ...idle, session: null } }).code === 'R17', 'read as R16')
clause('clause 1e5 — typedAfter: a user or assistant entry at or after the Stop\'s start is typing, one before it is not, a system entry never, an entry with no time always (K2-R16)',
  typedAfter({ type: 'user', timestamp: '2026-09-24T07:04:09Z' }, Date.parse('2026-09-24T07:04:08Z')) &&
  typedAfter({ type: 'assistant', timestamp: '2026-09-24T07:04:08Z' }, Date.parse('2026-09-24T07:04:08Z')) &&
  !typedAfter({ type: 'assistant', timestamp: '2026-09-24T07:04:07.999Z' }, Date.parse('2026-09-24T07:04:08Z')) &&
  !typedAfter({ type: 'system', timestamp: '2026-09-24T07:05:00Z' }, Date.parse('2026-09-24T07:04:08Z')) &&
  typedAfter({ type: 'user' }, Date.parse('2026-09-24T07:04:08Z')), 'wrong')
clause('clause 1e6 — typerStep: an off or closed record aborts whether or not a stop file exists too; on a record still active a stop file pauses with R1 before any other check (RN3-3, RB4-1)',
  ts({ stopRepo: '/w/p', active: false }).act === 'abort' && ts({ stopRepo: null, active: false }).act === 'abort' &&
  ts({ stopRepo: '/w/p', pane: { error: 'x' } }).reason === 'stopped by .doctrine/auto-cycle.stop in /w/p', 'wrong')
clause('clause 1e4 — typerStep: an old transcript that could not be read, or has shrunk, pauses with R17 and never clears (RB2)',
  ts({ grew: null }).reason === 'could not type into the pane: the transcript could not be read', JSON.stringify(ts({ grew: null })))
clause('clause 1f — typerStep after /clear: no restore file waits, then pauses with R14',
  ts({ stage: 'resume', waited: 100 }).act === 'wait' && ts({ stage: 'resume', waited: 500 }).reason === 'cleared, but the new session did not start doctrine', 'wrong')
clause('clause 1g — typerStep after /clear: herdr still on the old session waits up to 30 s, then R17; the new session resumes; a third session is R16',
  ts({ stage: 'resume', restore: NEW, sessionWait: 100 }).act === 'wait' &&
  ts({ stage: 'resume', restore: NEW, sessionWait: 500 }).reason === 'could not type into the pane: herdr did not report the new session within 30 s' &&
  ts({ stage: 'resume', restore: NEW, pane: { ...idle, session: 'new' } }).act === 'resume' &&
  ts({ stage: 'resume', restore: NEW, pane: { ...idle, session: 'third' } }).code === 'R16', 'wrong')
clause('clause 1h — typerStep confirming: a first turn confirms; none waits for the window, then resends once, then pauses with R15',
  ts({ stage: 'confirm', restore: NEW, firstTurn: true, resumes: 1 }).act === 'confirm' &&
  ts({ stage: 'confirm', restore: NEW, waited: 100, resumes: 1 }).act === 'wait' &&
  ts({ stage: 'confirm', restore: NEW, waited: 400, resumes: 1, pane: { ...idle, session: 'new' } }).act === 'resume' &&
  ts({ stage: 'confirm', restore: NEW, waited: 400, resumes: 2, pane: { ...idle, session: 'new' } }).reason === 'resume typed twice, no reply from the new session', 'wrong')
// DP-1: what /clear itself writes into the new session's transcript (read from real host transcripts, Claude Code
// 2.1.27x to 2.1.280): a meta user caveat, a user entry carrying the /clear command, a system local_command entry.
const CLEAR_ENTRIES = [
  { type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>' } },
  { type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>\n            <command-message>clear</command-message>\n            <command-args></command-args>' } },
  { type: 'system', subtype: 'local_command', content: '<local-command-stdout></local-command-stdout>' },
]
// E8-R32: the typer's resume is the doctrine-resume slash command; its entry, as Claude Code writes it, is not typing,
// and the same command with other arguments, another slash command, or the old bare line, is.
const ownCmd = { type: 'user', message: { role: 'user', content: '<command-message>doctrine:doctrine-resume</command-message>\n<command-name>/doctrine:doctrine-resume</command-name>\n<command-args>(typed by doctrine auto-cycle, not a ruling)</command-args>' } }
const cmdWith = (name, args) => ({ type: 'user', message: { role: 'user', content: `<command-message>${name.slice(1)}</command-message>\n<command-name>${name}</command-name>\n<command-args>${args}</command-args>` } })
clause('clause 1j6 — userTyped: the typer\'s own /doctrine:doctrine-resume entry is not typing; that command with other arguments or none, another slash command, and the bare old resume line are (E8-R32, K1-D3b)',
  !userTyped(ownCmd) && userTyped(cmdWith('/doctrine:doctrine-resume', 'go')) && userTyped(cmdWith('/doctrine:doctrine-resume', '')) &&
  userTyped(cmdWith('/grill-me', '(typed by doctrine auto-cycle, not a ruling)')) && userTyped({ type: 'user', message: { content: 'resume (typed by doctrine auto-cycle, not a ruling)' } }) &&
  userTyped({ type: 'user', message: { content: `${ownCmd.message.content} and more` } }), 'misread')
clause('clause 1j — userTyped: /clear\'s own entries, the typer\'s resume command entry, a tool result and an assistant entry are not typing; a prompt as a string or as text parts is (DP-1)',
  CLEAR_ENTRIES.every((e) => !userTyped(e)) && !userTyped(ownCmd) &&
  !userTyped({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] } }) && !userTyped({ type: 'assistant', message: { content: 'hi' } }) &&
  userTyped({ type: 'user', message: { content: 'what does foo.js do?' } }) && userTyped({ type: 'user', message: { content: [{ type: 'text', text: 'and bar?' }] } }), 'misread')
const NEWP = { ...idle, session: 'new' }
clause('clause 1j2 — typerStep after /clear: typing into the new session pauses with R16 before the resume and before a first turn counts; an unreadable new transcript waits, then pauses with R17, and never resumes (DP-1)',
  ts({ stage: 'resume', restore: NEW, pane: NEWP, typedNew: true }).code === 'R16' && ts({ stage: 'resume', restore: NEW, pane: NEWP, typedNew: false }).act === 'resume' &&
  ts({ stage: 'resume', restore: NEW, pane: NEWP, typedNew: null, sessionWait: 100 }).act === 'wait' &&
  ts({ stage: 'resume', restore: NEW, pane: NEWP, typedNew: null, sessionWait: 500 }).reason === 'could not type into the pane: the transcript could not be read' &&
  ts({ stage: 'confirm', restore: NEW, firstTurn: true, typedNew: true, resumes: 1 }).code === 'R16' &&
  ts({ stage: 'confirm', restore: NEW, typedNew: null, waited: 400, resumes: 1, pane: NEWP }).reason === 'could not type into the pane: the transcript could not be read' &&
  ts({ stage: 'confirm', restore: NEW, typedNew: false, waited: 400, resumes: 1, pane: NEWP }).act === 'resume', 'wrong')
// RB6-1: an unparseable line is never absence.
const PART = '{"type":"user","message":{"content":"stop, I am taking over"'
const te = (t) => transcriptEntries(t)
clause('clause 1j3 — transcriptEntries: well-formed lines are entries; a last line with no newline that does not parse is partial, beside the entries before it; a damaged line before the last makes the read unreadable (RB6-1)',
  te('{"type":"user"}\n\n{"type":"assistant"}\n')?.entries.length === 2 && te('{"type":"user"}\n\n{"type":"assistant"}\n').partial === false &&
  te(`{"type":"system"}\n${PART}`)?.partial === true && te(`{"type":"system"}\n${PART}`).entries.length === 1 &&
  te(`{"type":"system"}\n${PART}\n{"type":"assistant"}\n`) === null && te('{"type":"user"}')?.partial === false && te('')?.entries.length === 0,
  JSON.stringify([te(`{"type":"system"}\n${PART}`), te(`{"type":"system"}\n${PART}\n{"type":"assistant"}\n`)]))
clause('clause 1j4 — typerStep: a transcript ending in a line still being written waits a poll in every stage, then pauses with R17 once that outlasts the idle grace; it never clears or resumes (RB6-1)',
  ts({ midWrite: 0 }).act === 'wait' && ts({ midWrite: 100 }).act === 'wait' && ts({ midWrite: 500 }).reason === 'could not type into the pane: the transcript could not be read' &&
  ts({ stage: 'resume', restore: NEW, pane: NEWP, typedNew: false, midWrite: 40 }).act === 'wait' && ts({ midWrite: null }).act === 'clear', 'wrong')
clause('clause 1i — the typer\'s default timings are the spec\'s: 30 s for the new session, 2 min for the first turn, and it types the doctrine-resume command (E8-R32)',
  TYPER_TIMES.session === 30000 && TYPER_TIMES.firstTurn === 120000 && RESUME_LINE === '/doctrine:doctrine-resume (typed by doctrine auto-cycle, not a ruling)', JSON.stringify(TYPER_TIMES))

// ---------------------------------------------------------------- clause 2: the typer end to end (T7)

const typer = path.join(import.meta.dirname, 'dctr-typer.mjs')
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
let st = {}; try { st = JSON.parse(fs.readFileSync(process.env.SHIM_STATE, 'utf8')) } catch {}
const save = () => fs.writeFileSync(process.env.SHIM_STATE, JSON.stringify(st))
const logged = { args }
if (args[0] === 'pane' && args[1] === 'get') {
  st.gets = (st.gets || 0) + 1
  if (st.appendAt && st.gets === st.appendAt.n) fs.appendFileSync(st.appendAt.file, st.appendAt.line + '\\n')
  save()
  if (st.fail) { fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(logged) + '\\n'); process.stderr.write('{"error":{"code":"server_error","message":"boom"}}\\n'); process.exit(1) }
  if (st.clearedAt) st.getsSinceClear = (st.getsSinceClear || 0) + 1
  save()
  if (st.onClear === 'late' && st.getsSinceClear === st.restoreAfterGets) fs.writeFileSync(st.restoreFile, JSON.stringify({ session_id: st.newSession, transcript_path: st.newTranscript }))
  const session = st.clearedAt && st.getsSinceClear > (st.newSessionAfterGets || 0) ? st.newSession : st.session
  const status = st.clearedAt && st.statusAfterClear && st.getsSinceClear <= st.statusAfterClear.length ? st.statusAfterClear[st.getsSinceClear - 1] : (st.status || 'idle')
  const focused = st.gets <= (st.focusedGets || 0)
  logged.session = session; logged.focused = focused; logged.status = status
  fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(logged) + '\\n')
  console.log(JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: status, focused, ...(st.noSession ? {} : { agent_session: { value: session } }) } } }))
  process.exit(0)
}
fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(logged) + '\\n')
if (args[0] === 'pane' && args[1] === 'run') {
  if (st.runFails) { process.stderr.write('{"error":{"code":"server_error"}}\\n'); process.exit(1) }
  if (args[3] === '/clear') {
    st.clearedAt = Date.now(); save()
    if (st.onClear === 'write' || st.onClear === 'stale') fs.writeFileSync(st.restoreFile, JSON.stringify({ session_id: st.onClear === 'stale' ? st.session : st.newSession, transcript_path: st.newTranscript }))
  } else if (st.reply) {
    // What Claude Code writes when a slash command with arguments is typed (read from host transcripts): the command
    // entry, the skill's loaded text as a meta entry, then the reply.
    const [name, ...rest] = String(args[3]).split(' ')
    const cmd = name.startsWith('/') ? [{ type: 'user', message: { role: 'user', content: '<command-message>' + name.slice(1) + '</command-message>\\n<command-name>' + name + '</command-name>\\n<command-args>' + rest.join(' ') + '</command-args>' } },
      { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x' }] } }] : [{ type: 'user', message: { content: args[3] } }]
    fs.appendFileSync(st.newTranscript, [...cmd, { type: 'assistant', message: { content: 'ok' } }].map((e) => JSON.stringify(e)).join('\\n') + '\\n')
  }
}
process.exit(0)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jl = (...es) => es.map((e) => JSON.stringify(e) + '\n').join('')
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, DCTR_TYPER_TIMES: JSON.stringify(T) }
for (const k of ['HERDR_PANE_ID', 'HERDR_ENV', 'HERDR_WORKSPACE_ID', 'DCTR_VIEW_REQUEST_DIR', 'CLAUDE_PROJECT_DIR']) delete env[k]

/** One typer run in its own project, session and pane. `st` is the shim's script; `pre` edits the fixture first. */
function typerCase(name, st = {}, { pre, extraEnv = {}, recordRepo = 'same', noStopAt = false } = {}) {
  const dir = path.join(tmp, name)
  const proj = path.join(dir, 'proj'); fs.mkdirSync(path.join(proj, '.git'), { recursive: true })
  const recRoot = recordRepo === 'same' ? proj : path.join(dir, 'track')
  if (recordRepo !== 'same') fs.mkdirSync(path.join(recRoot, '.git'), { recursive: true })
  const record = path.join(recRoot, '.doctrine/records/r.md')
  const session = `s-${name}`, pane = `w1:p-${name}`
  write(record, `# record\n- State: Open\n- auto-cycle: on cap 10 tier 60%\n- auto-cycle: warned ${session} 60%\n- auto-cycle: ready\n`)
  const transcript = path.join(dir, 'old.jsonl')
  write(transcript, jl({ type: 'user', message: { content: 'go' } }, { type: 'assistant', message: { content: 'done\nauto-cycle: ready' } }))
  const length = fs.statSync(transcript).size
  const newTranscript = path.join(dir, 'new.jsonl'); write(newTranscript, '')
  const shimState = path.join(dir, 'shim.json'), shimLog = path.join(dir, 'shim.log')
  const stopAt = Date.parse('2026-09-24T07:04:08.432Z')
  const f = { dir, proj, recRoot, record, session, pane, transcript, length, newTranscript, shimLog, stopAt }
  fs.mkdirSync(autoCycleDir(), { recursive: true })
  fs.writeFileSync(shimState, JSON.stringify({ session, newSession: `${session}-new`, status: 'idle', restoreFile: restoreFile(pane), onClear: 'write', reply: true, newTranscript, ...st }))
  pre?.(f)
  const args = { pane, session, transcript, length, record, hash: 'abc123', project: proj, n: 3, phase: 'e8-fixture', keyLine: 5, ...(noStopAt ? {} : { stopAt }) }
  const r = spawnSync('node', [typer, JSON.stringify(args)], { env: { ...env, SHIM_STATE: shimState, SHIM_LOG: shimLog, ...extraEnv }, encoding: 'utf8', timeout: 20000 })
  const calls = fs.existsSync(shimLog) ? fs.readFileSync(shimLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  const runs = calls.filter((c) => c.args[0] === 'pane' && c.args[1] === 'run')
  const lines = fs.readFileSync(record, 'utf8').split('\n')
  return {
    ...f, code: r.status, calls, runs,
    clears: runs.filter((c) => c.args[3] === '/clear').length, resumes: runs.filter((c) => c.args[3] === RESUME_LINE).length,
    paused: lines.filter((l) => l.startsWith('- auto-cycle paused: ')),
    cycled: lines.filter((l) => l.startsWith('- auto-cycle: cycle ')),
    alerts: calls.filter((c) => c.args[1] === 'report-metadata').length + calls.filter((c) => c.args[0] === 'notification').length,
    state: parseRecord(fs.readFileSync(record, 'utf8')).state?.raw,
  }
}
const sends = (c) => `${c.clears},${c.resumes}`
const detail = (c) => `code ${c.code} sends ${sends(c)} paused ${JSON.stringify(c.paused)} cycled ${JSON.stringify(c.cycled)} calls ${JSON.stringify(c.calls.map((x) => x.args.slice(0, 2).join(' ')))}`
const setShim = (f, more) => {
  const file = path.join(f.dir, 'shim.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...more(f) }))
}

const normal = typerCase('normal')
clause('clause 2a — normal: /clear once, then the resume line once, the cycle line appended, no paused line (E8-D15)',
  sends(normal) === '1,1' && JSON.stringify(normal.cycled) === '["- auto-cycle: cycle 3 tree abc123"]' && normal.paused.length === 0 &&
  normal.state === '- State: Open', detail(normal))
const clearIdx = normal.calls.findIndex((c) => c.args[3] === '/clear')
clause('clause 2a2 — normal: the resume line is sent only after herdr reports the new session id',
  normal.calls.slice(clearIdx).some((c) => c.session === `${normal.session}-new`) &&
  normal.calls.findIndex((c) => c.args[3] === RESUME_LINE) > normal.calls.findIndex((c, i) => i > clearIdx && c.session === `${normal.session}-new`), detail(normal))

const taken = typerCase('taken', {}, { pre: (f) => { reserveMarker(claimFile(f.session, 5)) } })
clause('clause 2b — the claim already taken: nothing sent, no herdr call, no line (E8-D15)', sends(taken) === '0,0' && taken.calls.length === 0 && taken.paused.length === 0, detail(taken))
const stopped = typerCase('stopfile', {}, { pre: (f) => write(path.join(f.proj, '.doctrine/auto-cycle.stop'), '') })
const stoppedRec = typerCase('stopfile-rec', {}, { recordRepo: 'other', pre: (f) => write(path.join(f.recRoot, '.doctrine/auto-cycle.stop'), '') })
clause('clause 2c — the stop file in the session\'s repo, or only in the record\'s repo (Q1): nothing sent, no cycle line, paused with R1 naming that repo (RN3-3)',
  sends(stopped) === '0,0' && sends(stoppedRec) === '0,0' && stopped.cycled.length === 0 && stoppedRec.cycled.length === 0 &&
  JSON.stringify(stopped.paused) === JSON.stringify([`- auto-cycle paused: stopped by .doctrine/auto-cycle.stop in ${stopped.proj}`]) &&
  JSON.stringify(stoppedRec.paused) === JSON.stringify([`- auto-cycle paused: stopped by .doctrine/auto-cycle.stop in ${stoppedRec.recRoot}`]), `${detail(stopped)} | ${detail(stoppedRec)}`)
// RN3-3: a stop file created while the typer waits on a focused pane: R1 is written, nothing is sent.
const stopLate = typerCase('stopfile-while-waiting', { focusedGets: 100000 }, { pre: (f) => {
  fs.mkdirSync(path.join(f.proj, '.doctrine'), { recursive: true })
  setShim(f, () => ({ appendAt: { n: 3, file: path.join(f.proj, '.doctrine/auto-cycle.stop'), line: '' } }))
} })
clause('clause 2c2 — a stop file created while the typer waits: nothing sent, paused with R1, the toast raised (RN3-3, E8-D16)',
  sends(stopLate) === '0,0' && JSON.stringify(stopLate.paused) === JSON.stringify([`- auto-cycle paused: stopped by .doctrine/auto-cycle.stop in ${stopLate.proj}`]) &&
  stopLate.alerts === 2 && stopLate.calls.filter((c) => c.args[1] === 'get').length >= 3, detail(stopLate))
// RB4-1: a stop file beside a record switched off, or no longer Open or Blocked: nothing written, nothing raised.
const stopOff = typerCase('stopfile-off', {}, { pre: (f) => { fs.appendFileSync(f.record, '- auto-cycle: off\n'); write(path.join(f.proj, '.doctrine/auto-cycle.stop'), '') } })
const stopExited = typerCase('stopfile-exited', {}, { pre: (f) => { fs.appendFileSync(f.record, '- State: Exited.\n'); write(path.join(f.proj, '.doctrine/auto-cycle.stop'), '') } })
clause('clause 2c3 — a stop file beside a record switched off, or Exited: nothing sent, no paused line, no herdr call at all (RB4-1)',
  [stopOff, stopExited].every((c) => sends(c) === '0,0' && c.paused.length === 0 && c.calls.length === 0 && c.code === 0), `${detail(stopOff)} | ${detail(stopExited)}`)
// DP-1 end to end: the user types into the cleared session and gets a reply; only /clear's own entries; unreadable.
const clearJl = () => jl(...CLEAR_ENTRIES)
const takeover = typerCase('takeover', {}, { pre: (f) => { write(f.newTranscript, clearJl()); setShim(f, () => ({ appendAt: { n: 2, file: f.newTranscript, line: `${JSON.stringify({ type: 'user', message: { content: 'what does foo.js do?' } })}\n${JSON.stringify({ type: 'assistant', message: { content: 'it does x' } })}` } })) } })
const clearOnly = typerCase('clear-entries-only', {}, { pre: (f) => write(f.newTranscript, clearJl()) })
const newGone = typerCase('new-transcript-unreadable', { newTranscript: path.join(tmp, 'no-such-dir', 'new.jsonl') })
clause('clause 2u — typing into the cleared session: /clear once, no resume, paused with R16; only /clear\'s own entries: resume once; an unreadable new transcript: no resume, paused with R17 (DP-1)',
  sends(takeover) === '1,0' && JSON.stringify(takeover.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]' &&
  sends(clearOnly) === '1,1' && clearOnly.paused.length === 0 &&
  sends(newGone) === '1,0' && JSON.stringify(newGone.paused) === '["- auto-cycle paused: could not type into the pane: the transcript could not be read"]',
  `${detail(takeover)} | ${detail(clearOnly)} | ${detail(newGone)}`)
// RB6-1 end to end: a user entry half-written into the new transcript, completed on herdr's fourth read; a damaged line
// in the middle of the new transcript; a half-written user entry left at the end of the old transcript.
const partNew = typerCase('partial-new', {}, { pre: (f) => { write(f.newTranscript, clearJl() + PART); setShim(f, () => ({ appendAt: { n: 4, file: f.newTranscript, line: '}}' } })) } })
const damagedNew = typerCase('damaged-new', {}, { pre: (f) => write(f.newTranscript, `${clearJl()}{"type":"user","mess\n${JSON.stringify({ type: 'assistant', message: { content: 'x' } })}\n`) })
const partOld = typerCase('partial-old', {}, { pre: (f) => fs.appendFileSync(f.transcript, PART) })
clause('clause 2v — a half-written user entry in the new transcript holds the resume until it completes, then pauses with R16; a damaged line sends no resume and pauses with R17; a half-written entry left in the old transcript sends nothing and pauses with R17 (RB6-1)',
  sends(partNew) === '1,0' && JSON.stringify(partNew.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]' &&
  sends(damagedNew) === '1,0' && JSON.stringify(damagedNew.paused) === '["- auto-cycle paused: could not type into the pane: the transcript could not be read"]' &&
  sends(partOld) === '0,0' && JSON.stringify(partOld.paused) === '["- auto-cycle paused: could not type into the pane: the transcript could not be read"]',
  `${detail(partNew)} | ${detail(damagedNew)} | ${detail(partOld)}`)
// RB8-1: a paused line appended after the Stop's key line and before the typer first reads the record aborts it.
const pausedBefore = typerCase('paused-before-first-read', {}, { pre: (f) => fs.appendFileSync(f.record, '- auto-cycle paused: waiting for your permission approval\n') })
clause('clause 2r2 — a paused line written after the Stop\'s key line and before the typer\'s first read: nothing sent, no herdr read, no second paused line (RB8-1)',
  sends(pausedBefore) === '0,0' && pausedBefore.calls.length === 0 && pausedBefore.paused.length === 1, detail(pausedBefore))
const changed = typerCase('changed', { session: 'someone-else' })
clause('clause 2d — herdr reports another session: nothing sent, paused with R16', sends(changed) === '0,0' &&
  JSON.stringify(changed.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]', detail(changed))
const working = typerCase('working', { status: 'working' })
clause('clause 2e — agent_status working: nothing sent, paused with R17 in its fixed phrase', sends(working) === '0,0' &&
  JSON.stringify(working.paused) === '["- auto-cycle paused: could not type into the pane: the session stayed busy"]', detail(working))
const done = typerCase('done', { status: 'done' })
clause('clause 2e2 — agent_status done, an unseen finish: /clear once, resume once (RB1)', sends(done) === '1,1' && done.paused.length === 0, detail(done))
// RN2-2: after /clear the pane reads done, a ready state, for twelve polls while the restore file is not there yet,
// then working twice, then idle. Only a not-ready read may start the busy clock, so this resumes.
const doneWait = typerCase('done-then-working', { onClear: 'late', restoreAfterGets: 12, statusAfterClear: [...Array(12).fill('done'), 'working', 'working'] })
clause('clause 2e5 — done while the restore file is awaited, then working, then idle: /clear once, resume once, no pause (RN2-2)',
  sends(doneWait) === '1,1' && doneWait.paused.length === 0, detail(doneWait))
const noSess = typerCase('no-session', { noSession: true })
clause('clause 2e3 — herdr reports no Claude session: nothing sent, paused with R17 as a failed lookup, not R16 (ST2)', sends(noSess) === '0,0' &&
  JSON.stringify(noSess.paused) === '["- auto-cycle paused: could not type into the pane: herdr could not read the pane"]', detail(noSess))
const unread = typerCase('unreadable-transcript', {}, { pre: (f) => fs.rmSync(f.transcript) })
const shrunk = typerCase('shrunk-transcript', {}, { pre: (f) => fs.writeFileSync(f.transcript, '{"type":"user"}\n') })
clause('clause 2e4 — an old transcript that cannot be read, or is shorter than at the Stop: no /clear, paused with R17 (RB2)',
  [unread, shrunk].every((c) => sends(c) === '0,0' && JSON.stringify(c.paused) === '["- auto-cycle paused: could not type into the pane: the transcript could not be read"]'),
  `${detail(unread)} | ${detail(shrunk)}`)
const grew = typerCase('grew', {}, { pre: (f) => fs.appendFileSync(f.transcript, jl({ type: 'user', timestamp: new Date(f.stopAt + 50).toISOString(), message: { content: 'hi' } })) })
// K2-R16: the turn's own final assistant entry, written after the Stop read the file's length but timestamped before
// the Stop began, as the asynchronous transcript writer lands it.
const lagging = typerCase('lagging-final-entry', {}, { pre: (f) => fs.appendFileSync(f.transcript, jl({ type: 'assistant', timestamp: new Date(f.stopAt - 101).toISOString(), message: { content: 'done\nauto-cycle: ready' } })) })
clause('clause 2f2 — the turn\'s final assistant entry landing past the Stop\'s length with a time before the Stop is not typing: /clear once, resume once, no R16 (K2-R16)',
  sends(lagging) === '1,1' && lagging.paused.length === 0, detail(lagging))
const untimed = typerCase('untimed-user-entry', {}, { pre: (f) => fs.appendFileSync(f.transcript, jl({ type: 'user', message: { content: 'hi' } })) })
const noStop = typerCase('no-stop-time', {}, { noStopAt: true })
clause('clause 2f3 — a user entry past the length with no readable time counts as typing (R16, nothing sent); a launch with no Stop time sends and writes nothing',
  sends(untimed) === '0,0' && JSON.stringify(untimed.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]' &&
  noStop.calls.length === 0 && noStop.paused.length === 0 && noStop.cycled.length === 0, `${detail(untimed)} | ${detail(noStop)}`)
clause('clause 2f — the old transcript gained a user entry timestamped after the Stop began: nothing sent, paused with R16', sends(grew) === '0,0' &&
  JSON.stringify(grew.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]', detail(grew))
const focused = typerCase('focused', { focusedGets: 3 })
const firstRun = focused.calls.findIndex((c) => c.args[1] === 'run')
clause('clause 2g — focused, then unfocused: it waits, then sends /clear once and resume once (E8-D15)',
  sends(focused) === '1,1' && focused.calls.slice(0, firstRun).filter((c) => c.focused === true).length === 3 &&
  focused.calls.slice(0, firstRun).every((c) => c.args[1] === 'get'), detail(focused))
const offWhile = typerCase('off-while-focused', { focusedGets: 100000 }, { pre: (f) => setShim(f, () => ({ appendAt: { n: 3, file: f.record, line: '- auto-cycle: off' } })) })
clause('clause 2h — the record switched off while the pane is focused: nothing sent, no paused line', sends(offWhile) === '0,0' &&
  offWhile.paused.length === 0 && offWhile.cycled.length === 0 && offWhile.code === 0, detail(offWhile))
const sys = typerCase('system-entries', {}, { pre: (f) => fs.appendFileSync(f.transcript, jl({ type: 'system', subtype: 'stop_hook_summary' }, { type: 'system', subtype: 'turn_duration' })) })
clause('clause 2i — stop_hook_summary and turn_duration entries after the Stop do not count: /clear once, resume once', sends(sys) === '1,1', detail(sys))
// Counted in reads, not milliseconds: herdr answers the old session for the first three reads after /clear, and the
// typer counts its own waits in polls (RB2-4), so no load on the host changes the outcome.
const late = typerCase('late-session', { newSessionAfterGets: 3 })
clause('clause 2j — herdr reports the new session id a while after the restore file: /clear once, resume once, after it is reported',
  sends(late) === '1,1' && late.calls.some((c, i) => i > late.calls.findIndex((x) => x.args[3] === '/clear') && c.session === late.session && c.args[1] === 'get'), detail(late))
const fail = typerCase('lookup-fails', { fail: true })
clause('clause 2k — the herdr lookup fails: nothing sent, paused with R17 in its fixed phrase', sends(fail) === '0,0' &&
  JSON.stringify(fail.paused) === '["- auto-cycle paused: could not type into the pane: herdr could not read the pane"]', detail(fail))
const contained = typerCase('contained', {}, { extraEnv: { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'bridge') } })
clause('clause 2l — DCTR_VIEW_REQUEST_DIR set: no herdr call at all, no claim, no line', contained.calls.length === 0 &&
  !fs.existsSync(claimFile(contained.session)) && contained.paused.length === 0 && contained.cycled.length === 0, detail(contained))
const noRestore = typerCase('no-restore', { onClear: 'none' })
clause('clause 2m — no restore file: /clear once, no resume, the cycle line, then paused with R14',
  sends(noRestore) === '1,0' && noRestore.cycled.length === 1 &&
  JSON.stringify(noRestore.paused) === '["- auto-cycle paused: cleared, but the new session did not start doctrine"]', detail(noRestore))
const stale = typerCase('stale-restore', { onClear: 'stale' })
clause('clause 2n — a restore file carrying the old session id is stale (F1): /clear once, no resume, paused with R14',
  sends(stale) === '1,0' && JSON.stringify(stale.paused) === '["- auto-cycle paused: cleared, but the new session did not start doctrine"]', detail(stale))
const leftover = typerCase('leftover-restore', { onClear: 'none' }, { pre: (f) => write(restoreFile(f.pane), JSON.stringify({ session_id: 's-leftover', transcript_path: f.newTranscript })) })
clause('clause 2o — a restore file left from an earlier cycle is removed before /clear: no resume, paused with R14',
  sends(leftover) === '1,0' && JSON.stringify(leftover.paused) === '["- auto-cycle paused: cleared, but the new session did not start doctrine"]', detail(leftover))
const silent = typerCase('no-first-turn', { reply: false })
clause('clause 2p — no first turn: /clear once, resume twice, then paused with R15',
  sends(silent) === '1,2' && JSON.stringify(silent.paused) === '["- auto-cycle paused: resume typed twice, no reply from the new session"]', detail(silent))
const runFails = typerCase('run-fails', { runFails: true })
clause('clause 2q — a /clear that herdr failed to send appends no cycle line (LN12), and pauses with R17',
  runFails.cycled.length === 0 && runFails.clears === 1 && runFails.resumes === 0 &&
  JSON.stringify(runFails.paused) === '["- auto-cycle paused: could not type into the pane: herdr could not send to the pane"]', detail(runFails))
// Unfocused from the third read on, so a typer blind to the paused line would go on to send.
const pausedSince = typerCase('paused-since-claim', { focusedGets: 3 }, { pre: (f) => setShim(f, () => ({ appendAt: { n: 2, file: f.record, line: '- auto-cycle paused: question: which way?' } })) })
clause('clause 2r — a paused line written since the claim: nothing sent, and no second paused line', sends(pausedSince) === '0,0' &&
  JSON.stringify(pausedSince.paused) === '["- auto-cycle paused: question: which way?"]', detail(pausedSince))
clause('clause 2s — every pause the typer wrote was alerted once: one report-metadata and one notification each',
  [changed, working, grew, fail, noRestore, stale, silent].every((c) => c.alerts === 2) && normal.alerts === 0 && pausedSince.alerts === 0,
  JSON.stringify([changed, working, grew, fail, noRestore, stale, silent, normal].map((c) => c.alerts)))
const phrases = Object.values(R17_WHY).map((w) => `- auto-cycle paused: could not type into the pane: ${w}`)
const r17 = [working, fail, runFails, noSess, unread, shrunk].flatMap((c) => c.paused)
clause('clause 2s2 — every R17 line the typer wrote is one of the fixed phrases: no raw herdr status or error text (SP7)',
  r17.length === 6 && r17.every((l) => phrases.includes(l)) && !r17.some((l) => /Command failed|blocked|working|boom/.test(l)), JSON.stringify(r17))
clause('clause 2t — no pause changed the record\'s last state line (E8-D16)',
  [changed, working, grew, fail, noRestore, stale, silent, runFails].every((c) => c.state === '- State: Open'), 'a state line moved')

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const entriesAfter = (file, from) => fs.readFileSync(file).subarray(from).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const served = doneWait.calls.slice(doneWait.calls.findIndex((c) => c.args[3] === '/clear') + 1).filter((c) => c.args[1] === 'get').map((c) => c.status)
clause('clause 3a5 — without the typer: after /clear the done-then-working shim served done twelve times, then working twice, then idle (RN2-2)',
  JSON.stringify(served.slice(0, 15)) === JSON.stringify([...Array(12).fill('done'), 'working', 'working', 'idle']), JSON.stringify(served))
clause('clause 3a6 — without the typer: the late stop file exists only in the session\'s repo and was not there at launch (the shim made it on read 3)',
  fs.existsSync(path.join(stopLate.proj, '.doctrine/auto-cycle.stop')) && stopLate.calls.filter((c) => c.args[1] === 'get').length >= 3, 'stop fixture wrong')
clause('clause 3a4 — without the typer: the lagging entry sits past the Stop\'s length and is timestamped before the Stop; the grew entry after it',
  entriesAfter(lagging.transcript, lagging.length).length === 1 && Date.parse(entriesAfter(lagging.transcript, lagging.length)[0].timestamp) < lagging.stopAt &&
  Date.parse(entriesAfter(grew.transcript, grew.length)[0].timestamp) > grew.stopAt && !('timestamp' in entriesAfter(untimed.transcript, untimed.length)[0]), 'K2 fixtures wrong')
clause('clause 3a2 — without the typer: the unreadable fixture has no transcript, the shrunk one is shorter than the recorded length',
  !fs.existsSync(unread.transcript) && fs.statSync(shrunk.transcript).size < shrunk.length, 'RB2 fixtures wrong')
clause('clause 3a — without the typer: the grew fixture holds a user entry past the Stop\'s length, the system one only system entries',
  entriesAfter(grew.transcript, grew.length).some((e) => e.type === 'user') &&
  entriesAfter(sys.transcript, sys.length).length === 2 && entriesAfter(sys.transcript, sys.length).every((e) => e.type === 'system'), 'fixture wrong')
clause('clause 3b — without the typer: the stale restore file really carries the old session id, and the normal one the new id',
  JSON.parse(fs.readFileSync(restoreFile(stale.pane), 'utf8')).session_id === stale.session &&
  JSON.parse(fs.readFileSync(restoreFile(normal.pane), 'utf8')).session_id === `${normal.session}-new`, 'restore fixtures wrong')
clause('clause 3c2 — without the typer: the RB4-1 fixtures hold the stop file and end their records with an off line and an Exited state line',
  [stopOff, stopExited].every((c) => fs.existsSync(path.join(c.proj, '.doctrine/auto-cycle.stop'))) &&
  parseRecord(fs.readFileSync(stopOff.record, 'utf8')).entries.filter((e) => e.sub === 'on' || e.sub === 'off').at(-1)?.sub === 'off' && stopExited.state === '- State: Exited.', `${stopExited.state}`)
clause('clause 3c3 — without the typer: the takeover transcript holds /clear\'s entries then a user prompt and a reply, the clear-only one begins with /clear\'s entries, and the unreadable one does not exist',
  fs.readFileSync(takeover.newTranscript, 'utf8').trim().split('\n').slice(0, 5).map((l) => JSON.parse(l).type).join(',') === 'user,user,system,user,assistant' &&
  fs.readFileSync(clearOnly.newTranscript, 'utf8').trim().split('\n').slice(0, 3).map((l) => JSON.parse(l).type).join(',') === 'user,user,system' &&
  !fs.existsSync(path.join(tmp, 'no-such-dir', 'new.jsonl')), fs.readFileSync(takeover.newTranscript, 'utf8'))
const lines = (file) => fs.readFileSync(file, 'utf8').split('\n')
clause('clause 3c4 — without the typer: the partial-new transcript holds the user entry half-written after /clear\'s entries, which parses only once the shim completes it on its fourth read; the damaged one holds a line that does not parse before a well-formed last line; the partial-old one ends past the Stop\'s length in text that does not parse',
  (() => { try { JSON.parse(PART); return false } catch { return true } })() && JSON.parse(`${PART}}}`).type === 'user' &&
  JSON.parse(fs.readFileSync(path.join(partNew.dir, 'shim.json'), 'utf8')).appendAt?.n === 4 && lines(partNew.newTranscript)[3].startsWith(PART) &&
  lines(damagedNew.newTranscript).some((l) => { try { JSON.parse(l); return false } catch { return l.length > 0 } }) &&
  fs.statSync(partOld.transcript).size > partOld.length && fs.readFileSync(partOld.transcript, 'utf8').endsWith(PART), 'fixtures wrong')
clause('clause 3c5 — without the typer: the paused-before record\'s paused line comes after its key line 5, the ready line',
  (() => { const es = parseRecord(fs.readFileSync(pausedBefore.record, 'utf8')).entries; return es.find((e) => e.sub === 'ready')?.line === 5 && es.find((e) => e.sub === 'paused')?.line > 5 })(), fs.readFileSync(pausedBefore.record, 'utf8'))
clause('clause 3c — without the typer: the record-repo stop file sits outside the session\'s repo',
  !fs.existsSync(path.join(stoppedRec.proj, '.doctrine/auto-cycle.stop')) && fs.existsSync(path.join(stoppedRec.recRoot, '.doctrine/auto-cycle.stop')) &&
  fs.existsSync(path.join(stoppedRec.recRoot, '.git')), 'stop fixture wrong')
clause('clause 3d — without the typer: the late-session shim answered the old session after /clear at least once, and the silent one wrote no reply',
  late.calls.filter((c, i) => i > late.calls.findIndex((x) => x.args[3] === '/clear') && c.session === late.session).length === 3 &&
  fs.readFileSync(silent.newTranscript, 'utf8') === '' && fs.readFileSync(normal.newTranscript, 'utf8').includes('"assistant"'), 'shim fixtures wrong')

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
