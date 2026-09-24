// doctrine — the auto-cycle typer (E8-D15).
//
// Spawned detached by dctr-cycle.mjs's Stop when every precondition holds, with one JSON argument: the pane id,
// the session id, the Stop's transcript path and byte length, the record path, the tree hash, the session's repo,
// the cycle number and the phase. It never reads the screen (E8-R12). It is a loop around typerStep in
// dctr-lib.mjs, which decides from one observation at a time:
//
//   - It takes the claim `<autocycle dir>/<session>.claim` with reserveMarker and writes its pid into it (S3); a
//     claim already taken ends it with nothing sent.
//   - Before every send it stops if auto-cycle is no longer active (B1) or a paused line was written since the
//     claim, needs herdr's agent_status idle, and waits while the pane is focused.
//   - Before /clear it needs herdr to report the old session and the old transcript to hold no user or assistant
//     entry past the Stop's length. It removes this pane's restore file, sends /clear once, and only then appends
//     `auto-cycle: cycle <n> tree <hash>` (LN12: the line records a sent /clear, never an intended one).
//   - After /clear it waits for the restore hook's restore file carrying a different session id (F1), needs herdr
//     to report that id within 30 s, and sends the resume line once.
//   - It confirms the first turn from the new transcript within 2 minutes, resends once, then pauses.
//
// Every pause appends one paused line and alerts it (B3). With DCTR_VIEW_REQUEST_DIR set it exits in its first
// lines and calls no herdr: a contained session is never cycled.

import fs from 'node:fs'
import path from 'node:path'
import { typerStep, TYPER_TIMES, RESUME_LINE, autoCycleActive, stopFileRepo, repoOf } from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'
import {
  herdr, autoCycleDir, claimFile, restoreFile, reserveMarker, writeMarker, appendRecordLine, appendPaused, alertPaused,
  hookLog, sleepMs,
} from './dctr-state.mjs'

if (process.env.DCTR_VIEW_REQUEST_DIR) process.exit(0)
let a = null
try { a = JSON.parse(process.argv[2]) } catch { /* not ours to run */ }
if (!a?.pane || !a.session || !a.record || !a.transcript || !Number.isFinite(a.length)) process.exit(0)
const log = (m) => hookLog(a.session, `auto-cycle typer: ${m}`)
let times = TYPER_TIMES
try { times = { ...TYPER_TIMES, ...JSON.parse(process.env.DCTR_TYPER_TIMES || '{}') } } catch { /* the defaults */ }

/** Entries appended to a transcript at or after byte `from`, parsed; a line that does not parse is skipped. */
function entriesFrom(file, from = 0) {
  let text = ''
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const size = fs.fstatSync(fd).size
      const buf = Buffer.alloc(Math.max(0, size - from))
      fs.readSync(fd, buf, 0, buf.length, from)
      text = buf.toString('utf8')
    } finally { fs.closeSync(fd) }
  } catch { return [] }
  return text.split('\n').flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
}
const isTurn = (e) => e?.type === 'user' || e?.type === 'assistant'

function pausing(reason) {
  const { written } = appendPaused(a.record, reason)
  const message = alertPaused({ recordPath: a.record, repo: path.basename(path.resolve(a.project || '.')), phase: a.phase, paneId: a.pane, log })
  log(`${written ? 'paused' : 'pause not written, already paused'}: ${reason}${message ? '; alerted' : ''}`)
  process.exit(0)
}

try {
  fs.mkdirSync(autoCycleDir(), { recursive: true })
  try { reserveMarker(claimFile(a.session)) } catch { log('the claim is already taken; nothing sent'); process.exit(0) }
  writeMarker(claimFile(a.session), { pid: process.pid, pane: a.pane, session: a.session })
  const claimText = fs.readFileSync(a.record, 'utf8')
  const claimLine = claimText.split('\n').length - (claimText.endsWith('\n') ? 1 : 0)
  const repos = [a.project, repoOf(a.record, fs.existsSync)]

  const send = (text) => {
    try { herdr(['pane', 'run', a.pane, text]) } // herdr-lint: a failed send pauses with R17 and nothing follows it; nothing is closed
    catch (e) { pausing(`could not type into the pane: herdr pane run failed (${String(e.message).split('\n')[0]})`) }
  }
  const readPane = () => {
    try {
      const reply = herdr(['pane', 'get', a.pane]) // herdr-lint: a failed read pauses with R17; nothing is sent or closed on it
      const p = reply?.result?.pane
      if (p === undefined || p === null) return { error: 'the reply carried no pane' }
      return { status: p.agent_status, focused: p.focused, session: p.agent_session?.value }
    } catch (e) { return { error: String(e.message).split('\n')[0] } }
  }
  const readRestore = () => {
    try {
      const r = JSON.parse(fs.readFileSync(restoreFile(a.pane), 'utf8'))
      return r.session_id && r.session_id !== a.session ? { session: r.session_id, transcript: r.transcript_path } : null
    } catch { return null }
  }

  let stage = 'clear', stageStart = Date.now(), notIdleSince = null, restore = null, restoreSeen = null, resumes = 0
  for (;;) {
    const rec = parseRecord(fs.readFileSync(a.record, 'utf8'))
    const active = autoCycleActive(rec.entries, Boolean(stopFileRepo(repos, fs.existsSync)))
    const pausedSinceClaim = rec.entries.some((e) => e.kind === 'auto-cycle' && e.sub === 'paused' && e.line > claimLine)
    if (stage === 'resume' && !restore) { restore = readRestore(); if (restore) restoreSeen = Date.now() }
    const pane = active && !pausedSinceClaim ? readPane() : null
    const now = Date.now()
    notIdleSince = pane && !pane.error && pane.focused === false && pane.status !== 'idle' ? (notIdleSince ?? now) : null
    const step = typerStep({
      stage, active, pausedSinceClaim, pane, oldSession: a.session, restore, resumes, times,
      grew: stage === 'clear' && entriesFrom(a.transcript, a.length).some(isTurn),
      firstTurn: stage === 'confirm' && entriesFrom(restore.transcript).some((e) => e?.type === 'assistant'),
      waited: now - stageStart, notIdle: notIdleSince ? now - notIdleSince : 0, sessionWait: restoreSeen ? now - restoreSeen : 0,
    })
    if (step.act === 'wait') { sleepMs(times.poll); continue }
    if (step.act === 'abort' || step.act === 'confirm') { log(`${step.act}: ${step.reason}`); process.exit(0) }
    if (step.act === 'pause') pausing(step.reason)
    if (step.act === 'clear') {
      fs.rmSync(restoreFile(a.pane), { force: true })
      send('/clear')
      appendRecordLine(a.record, `- auto-cycle: cycle ${a.n} tree ${a.hash}`)
      log(`sent /clear, cycle ${a.n}`)
      stage = 'resume'; stageStart = Date.now()
    } else if (step.act === 'resume') {
      send(RESUME_LINE)
      resumes += 1
      log(`sent the resume line (${resumes})`)
      stage = 'confirm'; stageStart = Date.now()
    }
  }
} catch (e) {
  log(`typer error (${String(e?.message || e).split('\n')[0]})`)
  try { pausing(`could not type into the pane: ${String(e?.message || e).split('\n')[0]}`) } catch { process.exit(0) }
}
