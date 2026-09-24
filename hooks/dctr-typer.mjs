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
//   - Before every send it stops, writing nothing, if the record is switched off or no longer Open or Blocked, or a
//     paused line was written since the claim; on a record still active it pauses with R1 if the stop file exists in
//     either repo (RB4-1). It needs herdr's agent_status ready (idle or done, READY_STATUSES), and waits while the
//     pane is focused.
//   - Before /clear it needs herdr to report the old session and the old transcript to hold no user or assistant
//     entry timestamped at or after the Stop hook's start (typedAfter; an entry with no time counts). The file is
//     read from the Stop's byte length on, and only to find such entries: it is written asynchronously, so an entry
//     past that length can be the turn's own final message, which carries a time before the Stop (K2-R16). A file
//     that cannot be read, or is now shorter than that length, or holds a damaged line before its last, pauses rather
//     than clears (RB2); a last line still being written holds every send until it completes, and pauses with R17 if
//     it outlasts the idle grace (RB6-1). It removes this
//     pane's restore file, sends /clear once, and only then appends `auto-cycle: cycle <n> tree <hash>` (LN12: the
//     line records a sent /clear, never an intended one).
//   - After /clear it waits for the restore hook's restore file carrying a different session id (F1), needs herdr
//     to report that id within 30 s, and sends the resume line once (RESUME_LINE: the /doctrine:doctrine-resume
//     command, E8-R32), only while the new session's transcript holds no entry the user typed (userTyped: /clear's
//     own entries and the resume command's are not typing); typing pauses
//     with R16, and a transcript still unreadable when the 30 s end pauses with R17, never sends (DP-1).
//   - It confirms the first turn from the new transcript within 2 minutes, resends once, then pauses; typing into
//     the new session before the first turn pauses with R16, and an unreadable transcript with R17.
//
// Every wait is counted in polls, never read off the wall clock (RB2-4): each wait adds one poll interval to the
// typer's clock, so a loaded host stretches a wait in real time and never shortens it in polls. Every pause appends
// one paused line and raises its toast and token; its pane message is printed by the next Stop, Notification or
// StopFailure hook (SP1). With DCTR_VIEW_REQUEST_DIR set it exits in its first lines and calls no herdr: a contained
// session is never cycled.

import fs from 'node:fs'
import path from 'node:path'
import { typerStep, typedAfter, userTyped, transcriptEntries, TYPER_TIMES, READY_STATUSES, RESUME_LINE, autoCycleActive, stopFileRepo, repoOf, pauseReason, R17_WHY } from './dctr-lib.mjs'
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

/** Entries appended to a transcript at or after byte `from`, as transcriptEntries reads them: `{ entries, partial }`.
 *  Null when the file could not be read, is now shorter than `from`, or holds a damaged line before its last: none
 *  says there are no new entries (RB2, RB6-1). */
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
  const read = transcriptEntries(text)
  if (read === null) log(`the transcript ${file} holds a line that does not parse before its last line`)
  return read
}

function pausing(reason) {
  const { written } = appendPaused(a.record, reason)
  // The toast and token only: the pane message is printed by the next Stop, Notification or StopFailure hook (SP1).
  const alerted = alertPaused({ recordPath: a.record, repo: path.basename(path.resolve(a.project || '.')), phase: a.phase, paneId: a.pane, log })
  log(`${written ? 'paused' : 'pause not written, the same pause already stands'}: ${reason}${alerted ? '; alerted' : ''}`)
  process.exit(0)
}

try {
  // Taken: another typer holds or has used this record state, and it records its own outcome.
  try { reserveMarker(claimFile(a.session, a.keyLine)) } catch { log('the claim is already taken; nothing sent'); process.exit(0) }
  writeMarker(claimFile(a.session, a.keyLine), { pid: process.pid, pane: a.pane })
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
  // A restore file that cannot be read or parsed, a half-written one included, is no restore yet: the typer waits for
  // it and then pauses with R14, and never resumes on it.
  const readRestore = () => {
    try {
      const r = JSON.parse(fs.readFileSync(restoreFile(a.pane), 'utf8'))
      return r.session_id && r.session_id !== a.session ? { session: r.session_id, transcript: r.transcript_path } : null
    } catch { return null }
  }

  // The typer's clock: poll intervals waited, not wall time (RB2-4).
  let now = 0, stage = 'clear', stageStart = 0, notIdleSince = null, restore = null, restoreSeen = null, resumes = 0, partialSince = null
  for (;;) {
    const rec = parseRecord(fs.readFileSync(a.record, 'utf8'))
    const stopRepo = stopFileRepo(repos, fs.existsSync)
    // The record's own half of B1, without the stop file: an off or closed record aborts whether or not the stop file
    // exists too, and only an active one pauses on it (RB4-1).
    const active = autoCycleActive(rec.entries, false)
    // Since the claim means after the key line the Stop computed at launch (claimKey, its latest auto-cycle line), never
    // after a fresh read, so a pause written between the Stop and this typer's start still stops it (RB8-1).
    const pausedSinceClaim = rec.entries.some((e) => e.kind === 'auto-cycle' && e.sub === 'paused' && e.line > a.keyLine)
    if (stage === 'resume' && !restore) { restore = readRestore(); if (restore) restoreSeen = now }
    const pane = active && !stopRepo && !pausedSinceClaim ? readPane() : null
    notIdleSince = pane && !pane.error && pane.focused === false && !READY_STATUSES.includes(pane.status) ? (notIdleSince ?? now) : null
    // The old transcript before the /clear, the new session's after it, read once per poll: typing into either (K2-R16,
    // DP-1) and the first turn. A last line still being written holds the step until it completes (RB6-1).
    const old = stage === 'clear' ? entriesFrom(a.transcript, a.length) : null
    const fresh = stage !== 'clear' && restore ? entriesFrom(restore.transcript) : null
    partialSince = old?.partial || fresh?.partial ? (partialSince ?? now) : null
    const step = typerStep({
      stage, active, stopRepo, pausedSinceClaim, pane, oldSession: a.session, restore, resumes, times,
      midWrite: partialSince === null ? null : now - partialSince,
      grew: stage === 'clear' ? (old === null ? null : old.entries.some((e) => typedAfter(e, a.stopAt))) : false,
      typedNew: fresh === null ? null : fresh.entries.some(userTyped),
      firstTurn: stage === 'confirm' && Boolean(fresh?.entries.some((e) => e?.type === 'assistant')),
      waited: now - stageStart, notIdle: notIdleSince === null ? 0 : now - notIdleSince, sessionWait: restoreSeen === null ? 0 : now - restoreSeen,
    })
    if (step.act === 'wait') { sleepMs(times.poll); now += times.poll; continue }
    // An abort writes nothing because its stop is already recorded: the user's own off line, a state line no longer
    // Open or Blocked (with or without a stop file), or a paused line written since the claim. A confirm is success.
    // Every other stop is a pause: R1 for a stop file on a record still active, R14 to R17 for a failure (RN3-3, RB4-1).
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
