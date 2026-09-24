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
const { typerStep, TYPER_TIMES, RESUME_LINE } = await import('./dctr-lib.mjs')
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
clause('clause 1e — typerStep: not idle waits inside the grace, then pauses with R17; a failed lookup pauses with R17',
  ts({ pane: { ...idle, status: 'working' }, notIdle: 10 }).act === 'wait' &&
  ts({ pane: { ...idle, status: 'working' }, notIdle: 200 }).reason === 'could not type into the pane: the pane stayed working, not idle' &&
  ts({ pane: { error: 'boom' } }).reason === 'could not type into the pane: herdr could not read the pane (boom)', 'wrong')
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
clause('clause 1i — the typer\'s default timings are the spec\'s: 30 s for the new session, 2 min for the first turn',
  TYPER_TIMES.session === 30000 && TYPER_TIMES.firstTurn === 120000 && RESUME_LINE === 'resume (typed by doctrine auto-cycle, not a ruling)', JSON.stringify(TYPER_TIMES))

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
  const session = st.clearedAt && Date.now() - st.clearedAt >= (st.newSessionDelayMs || 0) ? st.newSession : st.session
  const focused = st.gets <= (st.focusedGets || 0)
  logged.session = session; logged.focused = focused
  fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(logged) + '\\n')
  console.log(JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: st.status || 'idle', focused, agent_session: { value: session } } } }))
  process.exit(0)
}
fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(logged) + '\\n')
if (args[0] === 'pane' && args[1] === 'run') {
  if (st.runFails) { process.stderr.write('{"error":{"code":"server_error"}}\\n'); process.exit(1) }
  if (args[3] === '/clear') {
    st.clearedAt = Date.now(); save()
    if (st.onClear === 'write' || st.onClear === 'stale') fs.writeFileSync(st.restoreFile, JSON.stringify({ session_id: st.onClear === 'stale' ? st.session : st.newSession, transcript_path: st.newTranscript }))
  } else if (st.reply) fs.appendFileSync(st.newTranscript, JSON.stringify({ type: 'assistant', message: { content: 'ok' } }) + '\\n')
}
process.exit(0)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jl = (...es) => es.map((e) => JSON.stringify(e) + '\n').join('')
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, DCTR_TYPER_TIMES: JSON.stringify(T) }
for (const k of ['HERDR_PANE_ID', 'HERDR_ENV', 'HERDR_WORKSPACE_ID', 'DCTR_VIEW_REQUEST_DIR', 'CLAUDE_PROJECT_DIR']) delete env[k]

/** One typer run in its own project, session and pane. `st` is the shim's script; `pre` edits the fixture first. */
function typerCase(name, st = {}, { pre, extraEnv = {}, recordRepo = 'same' } = {}) {
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
  const f = { dir, proj, recRoot, record, session, pane, transcript, length, newTranscript, shimLog }
  fs.mkdirSync(autoCycleDir(), { recursive: true })
  fs.writeFileSync(shimState, JSON.stringify({ session, newSession: `${session}-new`, status: 'idle', restoreFile: restoreFile(pane), onClear: 'write', reply: true, newTranscript, ...st }))
  pre?.(f)
  const args = { pane, session, transcript, length, record, hash: 'abc123', project: proj, n: 3, phase: 'e8-fixture' }
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

const taken = typerCase('taken', {}, { pre: (f) => { reserveMarker(claimFile(f.session)) } })
clause('clause 2b — the claim already taken: nothing sent, no herdr call, no line (E8-D15)', sends(taken) === '0,0' && taken.calls.length === 0 && taken.paused.length === 0, detail(taken))
const stopped = typerCase('stopfile', {}, { pre: (f) => write(path.join(f.proj, '.doctrine/auto-cycle.stop'), '') })
const stoppedRec = typerCase('stopfile-rec', {}, { recordRepo: 'other', pre: (f) => write(path.join(f.recRoot, '.doctrine/auto-cycle.stop'), '') })
clause('clause 2c — the stop file in the session\'s repo, or only in the record\'s repo (Q1): nothing sent, no line',
  sends(stopped) === '0,0' && sends(stoppedRec) === '0,0' && stopped.cycled.length === 0 && stoppedRec.cycled.length === 0, `${detail(stopped)} | ${detail(stoppedRec)}`)
const changed = typerCase('changed', { session: 'someone-else' })
clause('clause 2d — herdr reports another session: nothing sent, paused with R16', sends(changed) === '0,0' &&
  JSON.stringify(changed.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]', detail(changed))
const working = typerCase('working', { status: 'working' })
clause('clause 2e — agent_status working: nothing sent, paused with R17', sends(working) === '0,0' &&
  JSON.stringify(working.paused) === '["- auto-cycle paused: could not type into the pane: the pane stayed working, not idle"]', detail(working))
const grew = typerCase('grew', {}, { pre: (f) => fs.appendFileSync(f.transcript, jl({ type: 'user', message: { content: 'hi' } })) })
clause('clause 2f — the old transcript gained a user entry since the Stop: nothing sent, paused with R16', sends(grew) === '0,0' &&
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
const late = typerCase('late-session', { newSessionDelayMs: 150 })
clause('clause 2j — herdr reports the new session id a while after the restore file: /clear once, resume once, after it is reported',
  sends(late) === '1,1' && late.calls.some((c, i) => i > late.calls.findIndex((x) => x.args[3] === '/clear') && c.session === late.session && c.args[1] === 'get'), detail(late))
const fail = typerCase('lookup-fails', { fail: true })
clause('clause 2k — the herdr lookup fails: nothing sent, paused with R17', sends(fail) === '0,0' &&
  fail.paused.length === 1 && fail.paused[0].startsWith('- auto-cycle paused: could not type into the pane: herdr could not read the pane ('), detail(fail))
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
  runFails.paused.length === 1 && runFails.paused[0].startsWith('- auto-cycle paused: could not type into the pane: herdr pane run failed'), detail(runFails))
// Unfocused from the third read on, so a typer blind to the paused line would go on to send.
const pausedSince = typerCase('paused-since-claim', { focusedGets: 3 }, { pre: (f) => setShim(f, () => ({ appendAt: { n: 2, file: f.record, line: '- auto-cycle paused: question: which way?' } })) })
clause('clause 2r — a paused line written since the claim: nothing sent, and no second paused line', sends(pausedSince) === '0,0' &&
  JSON.stringify(pausedSince.paused) === '["- auto-cycle paused: question: which way?"]', detail(pausedSince))
clause('clause 2s — every pause the typer wrote was alerted once: one report-metadata and one notification each',
  [changed, working, grew, fail, noRestore, stale, silent].every((c) => c.alerts === 2) && normal.alerts === 0 && pausedSince.alerts === 0,
  JSON.stringify([changed, working, grew, fail, noRestore, stale, silent, normal].map((c) => c.alerts)))
clause('clause 2t — no pause changed the record\'s last state line (E8-D16)',
  [changed, working, grew, fail, noRestore, stale, silent, runFails].every((c) => c.state === '- State: Open'), 'a state line moved')

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const entriesAfter = (file, from) => fs.readFileSync(file).subarray(from).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
clause('clause 3a — without the typer: the grew fixture holds a user entry past the Stop\'s length, the system one only system entries',
  entriesAfter(grew.transcript, grew.length).some((e) => e.type === 'user') &&
  entriesAfter(sys.transcript, sys.length).length === 2 && entriesAfter(sys.transcript, sys.length).every((e) => e.type === 'system'), 'fixture wrong')
clause('clause 3b — without the typer: the stale restore file really carries the old session id, and the normal one the new id',
  JSON.parse(fs.readFileSync(restoreFile(stale.pane), 'utf8')).session_id === stale.session &&
  JSON.parse(fs.readFileSync(restoreFile(normal.pane), 'utf8')).session_id === `${normal.session}-new`, 'restore fixtures wrong')
clause('clause 3c — without the typer: the record-repo stop file sits outside the session\'s repo',
  !fs.existsSync(path.join(stoppedRec.proj, '.doctrine/auto-cycle.stop')) && fs.existsSync(path.join(stoppedRec.recRoot, '.doctrine/auto-cycle.stop')) &&
  fs.existsSync(path.join(stoppedRec.recRoot, '.git')), 'stop fixture wrong')
clause('clause 3d — without the typer: the late-session shim answered the old session after /clear at least once, and the silent one wrote no reply',
  late.calls.some((c, i) => i > late.calls.findIndex((x) => x.args[3] === '/clear') && c.session === late.session) &&
  fs.readFileSync(silent.newTranscript, 'utf8') === '' && fs.readFileSync(normal.newTranscript, 'utf8').includes('"assistant"'), 'shim fixtures wrong')

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
