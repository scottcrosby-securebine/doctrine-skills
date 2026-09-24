// doctrine — the auto-cycle hook (E8-D7, E8-D16, E8-D17, E8-D18, E8-D26).
//
// Stop, Notification (matcher permission_prompt|idle_prompt) and StopFailure in hooks.json, one script. It stands
// down in its first lines unless the record the kickoff chain reaches (SESSION_MEMORY.md's kickoff, the handoff's
// `record:` line, the record: the chain the restore hook and the gauge follow) is Open or Blocked and its last
// auto-cycle on/off line is on. The stop file `.doctrine/auto-cycle.stop`, in the session's repo or the record's,
// is tested after that, so its pause is reachable (LB7).
//
// On Stop it runs B2's ordered steps (cycleDecision in dctr-lib.mjs): a pausing state writes one paused line; an
// ordinary turn, or live work, writes nothing; a stall, the cap or no progress writes one paused line; otherwise
// it hashes the tree and spawns the typer (dctr-typer.mjs) detached, which types /clear and the resume line once
// the user moves focus off the pane. On Notification and StopFailure, while auto-cycle is active, it pauses on a
// permission prompt, an API error, or an idle prompt nothing else explains (notifyDecision).
//
// On every event past the stand-down it alerts each standing pause once (standingPauses in dctr-lib.mjs, the one
// pause model), whoever wrote its line: the toast, and the pane's systemMessage, each tracked by its own marker (B3,
// SP1). While auto-cycle is active the `autocycle` sidebar token names the last standing pause, or reads the cycle
// count when none stands, republished only when its value changes. The typer it launches is keyed by the record's
// latest auto-cycle line, so one record state launches once. With DCTR_VIEW_REQUEST_DIR set it writes the line and prints
// the message and calls herdr zero times. It always exits 0.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  followKickoff, lastOnOffEntry, repoOf, stopFileRepo, autoCycleActive, pausingStates, endsReady, nonEmpty, treeExcludes,
  cycleDecision, cycleProgress, notifyDecision, pausedAfterWarned, autocycleToken, claimKey, pauseReason, R17_WHY, LAUNCH_MESSAGE,
} from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'
import {
  hookLog, standDown, stateDir, writeMarker, herdr, claimFile, stopFactsFile, paneClaimHeld,
  appendPaused, alertPaused, pauseMessageOnce, sessionStartLine, publishToken, liveWork, treeHash, handoffLanded,
} from './dctr-state.mjs'

const EVENTS = ['Stop', 'Notification', 'StopFailure']
let sessionId = null, event = 'Stop'
const stand_down = (why) => standDown(event, 'auto-cycle', () => sessionId)(why)

try {
  // The moment this Stop began: the typer judges new typing by entry time against it, never by the byte length
  // read below, which the asynchronous transcript writer can still be short of (K2-R16).
  const stopAt = Date.now()
  let payload
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { stand_down('hook payload was not readable JSON') }
  event = payload.hook_event_name || 'none'
  if (!EVENTS.includes(event)) stand_down(`not a Stop, Notification or StopFailure event (${event})`)
  if ('agent_id' in payload) stand_down('a subagent event')
  sessionId = payload.session_id || null
  if (!sessionId) stand_down('no session_id in the payload')

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd
  if (!projectDir) stand_down('no CLAUDE_PROJECT_DIR and no cwd in the payload')
  const chain = followKickoff({ projectDir, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
  if (chain.why) stand_down(chain.why)
  const { recordPath, record, header, handoffPath } = chain
  const on = lastOnOffEntry(record.entries)
  if (on?.sub !== 'on') stand_down(`auto-cycle is ${on ? 'off' : 'not switched on'} in ${recordPath}`)

  const log = (msg) => hookLog(sessionId, `${event} auto-cycle ${msg}`)
  const contained = Boolean(process.env.DCTR_VIEW_REQUEST_DIR)
  // No herdr call is ever made without a pane, and a contained session has none it may reach.
  const paneId = contained ? null : process.env.HERDR_PANE_ID || null
  const repos = [projectDir, repoOf(recordPath, fs.existsSync)]
  const stopRepo = stopFileRepo(repos, fs.existsSync)
  const active = autoCycleActive(record.entries, Boolean(stopRepo))
  const messages = []
  const pause = (reason) => {
    const { written } = appendPaused(recordPath, reason)
    log(written ? `paused: ${reason}` : `pause not written, a standing paused line refuses it (the same pause, or any for an idle prompt): ${reason}`)
  }

  if (event === 'Stop') {
    // S4: what an idle_prompt later needs to know about this Stop, persisted on every Stop past the stand-down.
    writeMarker(stopFactsFile(sessionId), { backgroundEmpty: !nonEmpty(payload.background_tasks), ready: endsReady(payload.last_assistant_message) })

    const keyLine = claimKey(record.entries)
    const warned = record.entries.some((e) => e.kind === 'auto-cycle' && e.sub === 'warned' && e.session === sessionId)
    let hash = null
    const decision = cycleDecision({
      sessionId,
      stopRepo,
      ...pausingStates(record.entries),
      warned,
      pausedAfterWarned: pausedAfterWarned(record.entries, sessionId),
      backgroundTasks: nonEmpty(payload.background_tasks),
      liveWork: liveWork(sessionId),
      sessionCrons: nonEmpty(payload.session_crons),
      ready: endsReady(payload.last_assistant_message),
      handoffLanded: () => {
        let latch = null
        try { latch = JSON.parse(fs.readFileSync(path.join(stateDir(sessionId), 'gauge.json'), 'utf8')) } catch { /* no latch: unknown */ }
        return handoffLanded({ handoffPath, memoryPath: path.join(projectDir, 'SESSION_MEMORY.md'), warnedAt: latch?.session_id === sessionId ? latch.warnedAt : null })
      },
      contained,
      stopHookActive: payload.stop_hook_active === true,
      paneSession: () => {
        if (!paneId) return { error: 'noPane' }
        try {
          const reply = herdr(['pane', 'get', paneId]) // herdr-lint: a failed read pauses with R17; nothing is closed or typed on it
          const value = reply?.result?.pane?.agent_session?.value
          if (typeof value === 'string') return value
          log('herdr reported no Claude session for the pane')
        } catch (e) { log(`herdr pane get failed (${String(e.message).split('\n')[0]})`) }
        return { error: 'lookup' }
      },
      progress: () => {
        try { hash = treeHash(repos, (repo) => treeExcludes(recordPath, repo)) } catch (e) { log(`tree hash failed (${String(e.message).split('\n')[0]})`); return { error: 'hash' } }
        return cycleProgress(record.entries, hash)
      },
      claimTaken: fs.existsSync(claimFile(sessionId, keyLine)),
    })
    log(`Stop decided ${decision.act}${decision.code ? ` ${decision.code}` : ''}: ${decision.reason}`)
    if (decision.act === 'pause') pause(decision.reason)
    if (decision.act === 'launch') {
      let length = null
      try { length = fs.statSync(payload.transcript_path).size } catch { /* unreadable: the typer could not tell new entries */ }
      if (length === null) pause(pauseReason('R17', R17_WHY.transcript))
      else {
        const args = { pane: paneId, session: sessionId, transcript: payload.transcript_path, length, record: recordPath, hash, project: projectDir, n: decision.n, phase: header.phase, stopAt, keyLine }
        const script = process.env.DCTR_TYPER_SCRIPT || path.join(import.meta.dirname, 'dctr-typer.mjs')
        spawn(process.execPath, [script, JSON.stringify(args)], { detached: true, stdio: 'ignore', env: process.env }).unref()
        messages.push(LAUNCH_MESSAGE)
      }
    }
  } else if (active) {
    const kind = event === 'StopFailure' ? 'StopFailure' : payload.notification_type
    let lastStop = null
    try { lastStop = JSON.parse(fs.readFileSync(stopFactsFile(sessionId), 'utf8')) } catch { /* no Stop yet in this session */ }
    const reason = notifyDecision(kind, {
      error: payload.error, claimHeld: paneId ? paneClaimHeld(paneId) : false, liveWork: liveWork(sessionId), lastStop,
    })
    log(`${kind} decided ${reason ? `pause: ${reason}` : 'nothing'}`)
    if (reason) pause(reason)
  } else {
    log(`auto-cycle is not active (the stop file in ${stopRepo})`)
  }

  alertPaused({ recordPath, repo: path.basename(path.resolve(projectDir)), phase: header.phase, paneId, log })
  const shown = pauseMessageOnce(recordPath)
  if (shown) messages.push(shown)
  // Paused while a pause stands, the cycle count once none does, so a resolved pause stops showing paused (LB2, E8-R25).
  if (active && paneId) publishToken(paneId, autocycleToken(parseRecord(fs.readFileSync(recordPath, 'utf8')).entries, sessionStartLine(recordPath)), log)
  if (messages.length) process.stdout.write(JSON.stringify({ systemMessage: messages.join('\n') }))
  process.exit(0)
} catch (e) {
  stand_down(`hook error (${String(e?.message || e).split('\n')[0]})`)
}
