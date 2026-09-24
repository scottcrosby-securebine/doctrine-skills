// doctrine — the auto-cycle typer (E8-D15).
//
// Spawned detached by dctr-cycle.mjs's Stop when every precondition holds, with one JSON argument: the pane id, the
// session id, the Stop's transcript path and byte length, the moment the Stop hook started, the record path, the
// tree hash, the session's repo, the cycle number, the phase, and the claim key (claimKey: the line number of the
// record's latest auto-cycle line).
// It never reads the screen (E8-R12). It is a loop around typerStep in dctr-lib.mjs, which decides from one
// observation at a time:
//
//   - It takes the claim `<autocycle dir>/<session>.<key>.claim` with reserveMarker and writes its pid into it (S3);
//     a claim already taken ends it with nothing sent. The claim is single use per record state (RB3-1).
//   - Before every send it stops if auto-cycle is no longer active (B1) or a paused line was written since the
//     claim, needs herdr's agent_status ready (idle or done, READY_STATUSES), and waits while the pane is focused.
//   - Before /clear it needs herdr to report the old session and the old transcript to hold no user or assistant
//     entry timestamped at or after the Stop hook's start (typedAfter; an entry with no time counts). The file is
//     read from the Stop's byte length on, and only to find such entries: it is written asynchronously, so an entry
//     past that length can be the turn's own final message, which carries a time before the Stop (K2-R16). A file
//     that cannot be read, or is now shorter than that length, pauses rather than clears (RB2). It removes this
//     pane's restore file, sends /clear once, and only then appends `auto-cycle: cycle <n> tree <hash>` (LN12: the
//     line records a sent /clear, never an intended one).
//   - After /clear it waits for the restore hook's restore file carrying a different session id (F1), needs herdr
//     to report that id within 30 s, and sends the resume line once.
//   - It confirms the first turn from the new transcript within 2 minutes, resends once, then pauses.
//
// Every wait is counted in polls, never read off the wall clock (RB2-4): each wait adds one poll interval to the
// typer's clock, so a loaded host stretches a wait in real time and never shortens it in polls. Every pause appends
// one paused line and raises its toast and token; its pane message is printed by the next Stop, Notification or
// StopFailure hook (SP1). With DCTR_VIEW_REQUEST_DIR set it exits in its first lines and calls no herdr: a contained
// session is never cycled.

import fs from 'node:fs'
import path from 'node:path'
import { typerStep, typedAfter, TYPER_TIMES, READY_STATUSES, RESUME_LINE, autoCycleActive, stopFileRepo, repoOf, pauseReason, R17_WHY } from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'
import {
  herdr, claimFile, restoreFile, reserveMarker, writeMarker, appendRecordLine, appendPaused, alertPaused,
  hookLog, sleepMs,
} from './dctr-state.mjs'

// Contained: never cycled, and not a stop of its own; the Stop hook already wrote R13 for this session.
if (process.env.DCTR_VIEW_REQUEST_DIR) process.exit(0)
let a = null
try { a = JSON.parse(process.argv[2]) } catch { /* not ours to run */ }
if (!a?.pane || !a.session || !a.record || !a.transcript || !Number.isFinite(a.length) || !Number.isFinite(a.stopAt) || !Number.isInteger(a.keyLine)) process.exit(0) // not a launch the Stop hook made: nothing began, nothing to record
const log = (m) => hookLog(a.session, `auto-cycle typer: ${m}`)
let times = TYPER_TIMES
try { times = { ...TYPER_TIMES, ...JSON.parse(process.env.DCTR_TYPER_TIMES || '{}') } } catch { /* the defaults */ }

/** Entries appended to a transcript at or after byte `from`, parsed; a line that does not parse is skipped. Null
 *  when the file could not be read or is now shorter than `from`: neither says there are no new entries (RB2). */
function entriesFrom(file, from = 0) {
  let text = ''
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const size = fs.fstatSync(fd).size
      if (size < from) { log(`the transcript ${file} is ${size} bytes, shorter than the ${from} recorded at the Stop`); return null }
      const buf = Buffer.alloc(Math.max(0, size - from))
      fs.readSync(fd, buf, 0, buf.length, from)
      text = buf.toString('utf8')
    } finally { fs.closeSync(fd) }
  } catch (e) { log(`the transcript ${file} could not be read (${e.code || e.message})`); return null }
  return text.split('\n').flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
}

function pausing(reason) {
  const { written } = appendPaused(a.record, reason)
  // The toast and token only: the pane message is printed by the next Stop, Notification or StopFailure hook (SP1).
  const alerted = alertPaused({ recordPath: a.record, repo: path.basename(path.resolve(a.project || '.')), phase: a.phase, paneId: a.pane, log })
  log(`${written ? 'paused' : 'pause not written, already paused'}: ${reason}${alerted ? '; alerted' : ''}`)
  process.exit(0)
}

try {
  // Taken: another typer holds or has used this record state, and it records its own outcome.
  try { reserveMarker(claimFile(a.session, a.keyLine)) } catch { log('the claim is already taken; nothing sent'); process.exit(0) }
  writeMarker(claimFile(a.session, a.keyLine), { pid: process.pid, pane: a.pane })
  const claimText = fs.readFileSync(a.record, 'utf8')
  const claimLine = claimText.split('\n').length - (claimText.endsWith('\n') ? 1 : 0)
  const repos = [a.project, repoOf(a.record, fs.existsSync)]

  const send = (text) => {
    try { herdr(['pane', 'run', a.pane, text]) } // herdr-lint: a failed send pauses with R17 and nothing follows it; nothing is closed
    catch (e) { log(`herdr pane run failed (${String(e.message).split('\n')[0]})`); pausing(pauseReason('R17', R17_WHY.send)) }
  }
  const readPane = () => {
    try {
      const reply = herdr(['pane', 'get', a.pane]) // herdr-lint: a failed read pauses with R17; nothing is sent or closed on it
      const p = reply?.result?.pane
      if (p !== undefined && p !== null) return { status: p.agent_status, focused: p.focused, session: p.agent_session?.value }
      log('herdr pane get carried no pane')
    } catch (e) { log(`herdr pane get failed (${String(e.message).split('\n')[0]})`) }
    return { error: true }
  }
  const readRestore = () => {
    try {
      const r = JSON.parse(fs.readFileSync(restoreFile(a.pane), 'utf8'))
      return r.session_id && r.session_id !== a.session ? { session: r.session_id, transcript: r.transcript_path } : null
    } catch { return null }
  }

  // The typer's clock: poll intervals waited, not wall time (RB2-4).
  let now = 0, stage = 'clear', stageStart = 0, notIdleSince = null, restore = null, restoreSeen = null, resumes = 0
  for (;;) {
    const rec = parseRecord(fs.readFileSync(a.record, 'utf8'))
    const stopRepo = stopFileRepo(repos, fs.existsSync)
    const active = autoCycleActive(rec.entries, Boolean(stopRepo))
    const pausedSinceClaim = rec.entries.some((e) => e.kind === 'auto-cycle' && e.sub === 'paused' && e.line > claimLine)
    if (stage === 'resume' && !restore) { restore = readRestore(); if (restore) restoreSeen = now }
    const pane = active && !pausedSinceClaim ? readPane() : null
    notIdleSince = pane && !pane.error && pane.focused === false && !READY_STATUSES.includes(pane.status) ? (notIdleSince ?? now) : null
    const step = typerStep({
      stage, active, stopRepo, pausedSinceClaim, pane, oldSession: a.session, restore, resumes, times,
      grew: stage === 'clear' ? ((es) => (es === null ? null : es.some((e) => typedAfter(e, a.stopAt))))(entriesFrom(a.transcript, a.length)) : false,
      firstTurn: stage === 'confirm' && (entriesFrom(restore.transcript) || []).some((e) => e?.type === 'assistant'),
      waited: now - stageStart, notIdle: notIdleSince === null ? 0 : now - notIdleSince, sessionWait: restoreSeen === null ? 0 : now - restoreSeen,
    })
    if (step.act === 'wait') { sleepMs(times.poll); now += times.poll; continue }
    // An abort writes nothing because its stop is already recorded: the user's own off line, a state line no longer
    // Open or Blocked, or a paused line written since the claim. A confirm is success. Every other stop is a pause:
    // R1 for a stop file, R14 to R17 for a failure (RN3-3).
    if (step.act === 'abort' || step.act === 'confirm') { log(`${step.act}: ${step.reason}`); process.exit(0) }
    if (step.act === 'pause') pausing(step.reason)
    if (step.act === 'clear') {
      fs.rmSync(restoreFile(a.pane), { force: true })
      send('/clear')
      appendRecordLine(a.record, `- auto-cycle: cycle ${a.n} tree ${a.hash}`)
      log(`sent /clear, cycle ${a.n}`)
      stage = 'resume'; stageStart = now
    } else if (step.act === 'resume') {
      send(RESUME_LINE)
      resumes += 1
      log(`sent the resume line (${resumes})`)
      stage = 'confirm'; stageStart = now
    }
  }
} catch (e) {
  log(`typer error (${String(e?.message || e).split('\n')[0]})`)
  try { pausing(pauseReason('R17', R17_WHY.error)) } catch { process.exit(0) }
}
