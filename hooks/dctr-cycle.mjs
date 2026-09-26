// doctrine — the auto-cycle hook (E8-D7, E8-D16, E8-D17, E8-D18, E8-D26).
//
// Runs on Stop, Notification (matcher permission_prompt|idle_prompt), StopFailure and UserPromptSubmit (hooks.json),
// one script. It stands down unless the record the kickoff chain reaches (SESSION_MEMORY.md's kickoff, the handoff's
// `record:` line: the chain the restore hook and the gauge follow) is Open or Blocked and its last auto-cycle on/off
// line is on; a subagent's event always stands down.
//
// On Stop it does what cycleDecision in dctr-lib.mjs decides, which owns the order and every condition: it appends
// one paused line, writes nothing, or launches dctr-typer.mjs detached with the facts it needs (pausing instead when
// the transcript it would hand the typer cannot be read). On Notification and StopFailure it appends the paused line
// notifyDecision returns, if any. Every paused line goes through appendPaused, whose dedup is pauseStands. Stop,
// StopFailure and UserPromptSubmit record the session's turn end (writeTurnEnd), which that dedup reads;
// UserPromptSubmit does nothing else.
//
// Every other event past the stand-down alerts each standing pause once (standingPauses, the one pause model): the
// toast and the pane's systemMessage, each tracked by its own marker; while auto-cycle is active it publishes the
// `autocycle` sidebar token (autocycleToken). With DCTR_VIEW_REQUEST_DIR set it calls herdr zero times. It always
// exits 0.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  followKickoff, lastOnOffEntry, repoOf, stopFileRepo, autoCycleActive, pausingStates, endsReady, nonEmpty, backgroundLive, treeExcludes,
  cycleDecision, cycleProgress, notifyDecision, sessionWarned, pausedAfterWarned, autocycleToken, claimKey, pauseReason, R17_WHY, LAUNCH_MESSAGE,
} from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'
import {
  hookLog, standDown, stateDir, writeMarker, herdr, claimFile, stopFactsFile, paneClaimHeld,
  appendPaused, alertPaused, pauseMessageOnce, sessionStartLine, writeTurnEnd, publishToken, liveWork, treeHash, handoffLanded,
} from './dctr-state.mjs'

const EVENTS = ['Stop', 'Notification', 'StopFailure', 'UserPromptSubmit']

/** The hook, over one event's payload: `input` is its text or a function that reads it, called inside the guarded
 *  path so a read that fails stands down with exit 0 (RB8-2). Every path ends in process.exit. Run as a script it
 *  reads stdin; the cycle selftest's event enumeration (clause 1x) calls it in-process with process.exit and stdout
 *  stubbed. */
export function runHook(input) {
let sessionId = null, event = 'Stop'
const stand_down = (why) => standDown(event, 'auto-cycle', () => sessionId)(why)

try {
  // The moment this Stop began: the typer judges new typing by entry time against it, never by the byte length
  // read below, which the asynchronous transcript writer can still be short of (K2-R16).
  const stopAt = Date.now()
  let payload
  try { payload = JSON.parse((typeof input === 'function' ? input() : input) || '{}') } catch { stand_down('hook payload was not readable') }
  event = payload.hook_event_name || 'none'
  if (!EVENTS.includes(event)) stand_down(`not a Stop, Notification, StopFailure or UserPromptSubmit event (${event})`)
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
    const { written } = appendPaused(recordPath, reason, sessionId)
    log(written ? `paused: ${reason}` : `pause not written, a standing paused line refuses it (the same pause, or any for an idle prompt): ${reason}`)
  }

  // E8-R31: a Stop, a StopFailure and a submitted prompt each end a turn; record where, before this event writes any
  // line, so an R7, R8 or R9 the ended turn answered no longer holds back the dedup. A submitted prompt does nothing
  // else: it writes no paused line, raises no alert and prints nothing, since its output would reach the model.
  if (event !== 'Notification') writeTurnEnd(sessionId, recordPath)
  if (event === 'UserPromptSubmit') { log('turn end recorded'); process.exit(0) }

  if (event === 'Stop') {
    // S4: what an idle_prompt later needs to know about this Stop, persisted by Stop alone, so a StopFailure or a
    // submitted prompt never replaces them with unknowns: the payload's two live-work lists (RB6-3) and its ready line.
    writeMarker(stopFactsFile(sessionId), {
      backgroundEmpty: !backgroundLive(payload.background_tasks), cronsEmpty: !nonEmpty(payload.session_crons), ready: endsReady(payload.last_assistant_message),
    })

    const keyLine = claimKey(record.entries)
    const warned = Boolean(sessionWarned(record.entries, sessionId))
    let hash = null
    const decision = cycleDecision({
      sessionId,
      stopRepo,
      ...pausingStates(record.entries),
      warned,
      pausedAfterWarned: pausedAfterWarned(record.entries, sessionId),
      backgroundTasks: backgroundLive(payload.background_tasks),
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
          // An empty string names no session, as no value does (RT2-B1).
          if (typeof value === 'string' && value !== '') return value
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
}

// Run as the script: both paths through realpath, since Node resolves symlinks in import.meta.url and a symlinked
// plugin or config dir would otherwise make every event a silent no-op (ORC7-1). A failed realpath is not the script.
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) runHook(() => fs.readFileSync(0, 'utf8'))
