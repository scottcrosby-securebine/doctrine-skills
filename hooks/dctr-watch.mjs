// doctrine — the Codex auto-cycle watcher (E10: E8-D7, E8-D18 through the adaptation table).
//
// Codex fires no hook for three things the auto-cycle hook acts on under Claude Code: a turn ended by an API error
// (Claude Code's StopFailure), a session left idle waiting for the user (Notification idle_prompt), and the exit of a
// background terminal that held a Stop back (Claude Code fires a Stop again). Probes B5 and B6 found that only the
// session's rollout shows the first two, and only the process tree the third (probe P-PROC, E10H-R3-B4). So
// dctr-cycle.mjs, on each Codex UserPromptSubmit while auto-cycle is active, spawns this detached with one JSON
// argument: the session, its rollout, its cwd and project, its herdr pane (null when contained or outside herdr), the
// rollout's byte length at the prompt, the turn's id and the Codex process above that hook (codexAncestor's, null when
// none). Each poll it reads the rollout, herdr's agent_status and agent_session, once the turn has ended the process
// listing for codexBackground, and, for the background work's exit, what this turn's Stop itself
// persisted about waiting (stopHeldFile), never the rollout's state at the turn end, which Codex writes only after the
// Stop returns (E10H-R2-B2). It does what watchStep in dctr-lib.mjs decides: wait, exit, or hand dctr-cycle.mjs the event Claude
// Code would have fired, as that event's payload on stdin, so the hook's own decisions (notifyDecision, cycleDecision)
// judge it exactly as they judge a real one. It writes nothing itself. Waits are counted in polls, never read off the
// wall clock. With no pane it reads no herdr, and the idle observation rests on the rollout alone.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { watchStep, watchedTurn, codexObservations, followKickoff, autoCycleActive, stopFileRepo, repoOf, endsReady, WATCH_TIMES } from './dctr-lib.mjs'
import { herdr, hookLog, sleepMs, isPaneNotFound, stopHeldFile, liveWork, processListing } from './dctr-state.mjs'

let a = null
try { a = JSON.parse(process.argv[2]) } catch { /* not ours to run */ }
if (!a?.session || !a.transcript || !a.project || !Number.isFinite(a.from)) process.exit(0)
const log = (m) => hookLog(a.session, `auto-cycle watcher: ${m}`)
let times = WATCH_TIMES
try { times = { ...WATCH_TIMES, ...JSON.parse(process.env.DCTR_WATCH_TIMES || '{}') } } catch { /* the defaults */ }

/** The event, as the payload the hook reads on stdin. */
function fire(event, more) {
  const script = process.env.DCTR_CYCLE_SCRIPT || path.join(import.meta.dirname, 'dctr-cycle.mjs')
  const payload = { hook_event_name: event, session_id: a.session, turn_id: a.turn ?? null, transcript_path: a.transcript, cwd: a.cwd || a.project, ...more }
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: 'utf8', env: process.env, timeout: 60000 })
  log(`handed the hook a ${event}${more.notification_type ? ` ${more.notification_type}` : ''} (exit ${r.status})`)
}

/** The last task_complete's last_agent_message, the turn's final answer, or null. */
const lastMessage = (text) => { try { return JSON.parse(text.trimEnd().split('\n').reverse().find((l) => l.includes('"task_complete"'))).payload.last_agent_message ?? null } catch { return null } }

/** herdr's agent_status and agent_session for the pane: `{ status: null, session: null }` with no pane. */
const paneState = () => {
  if (!a.pane) return { status: null, session: null }
  try {
    const pane = herdr(['pane', 'get', a.pane])?.result?.pane // herdr-lint: a failed read is not ready, so nothing is fired on it
    const session = pane?.agent_session?.value
    return { status: pane?.agent_status ?? 'unknown', session: typeof session === 'string' && session !== '' ? session : null }
  } catch (e) {
    // herdr answering that the pane does not exist is an answer: the session's pane is gone, and nothing is left to
    // watch for. Any other failure is not ready, so nothing is fired on it.
    if (isPaneNotFound(e)) { log('exit: the pane is gone'); process.exit(0) }
    return { status: 'unknown', session: null }
  }
}

/** This turn's Stop decision as that Stop persisted it, or null before one is written for this turn. */
const heldFact = () => {
  try { const f = JSON.parse(fs.readFileSync(stopHeldFile(a.session), 'utf8')); return a.turn && f.turn === a.turn ? f : null } catch { return null }
}

try {
  let now = 0, idleSince = null, unknownSince = null, firedAt = null
  for (;;) {
    const chain = followKickoff({ projectDir: a.project, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
    const active = !chain.why && autoCycleActive(chain.record.entries, Boolean(stopFileRepo([a.project, repoOf(chain.recordPath, fs.existsSync)], fs.existsSync)))
    let text = null
    try { text = fs.readFileSync(a.transcript, 'utf8') } catch (e) { log(`the rollout could not be read (${e.code || e.message})`) }
    const start = text === null ? 0 : Buffer.from(text).subarray(0, a.from).toString('utf8').length
    const turn = text === null ? { ended: false, newTurn: false } : watchedTurn(text.slice(start))
    // Asked every poll, not only once the turn ends: a TUI closed mid-turn never ends its turn, and only herdr saying
    // the pane is gone lets the watcher stop before its longest watch (E10H-B9).
    const pane = paneState()
    // The session's background work from the process tree under the Codex process its UserPromptSubmit named
    // (codexBackground), read only once the turn has ended; an unreadable rollout is a turn not yet ended.
    const obs = text === null ? { backgroundRunning: true, backgroundUnknown: null, apiError: null, idle: false }
      : codexObservations(text, turn.ended ? pane.status : null, turn.ended ? { listing: processListing(), codex: a.codex ?? null } : undefined)
    idleSince = obs.idle ? (idleSince ?? now) : null
    unknownSince = turn.ended && obs.backgroundUnknown ? (unknownSince ?? now) : null
    const last = turn.ended ? lastMessage(text) : null
    // A held Stop already retried and not decided again (its fact unchanged) no longer holds: the retry was its answer.
    const fact = turn.ended ? heldFact() : null
    const held = fact?.held === true && fact.at !== firedAt
    const step = watchStep({ active, turn, obs, held, liveWork: held ? liveWork(a.session) : null, session: a.session, paneSession: pane.session,
      ready: endsReady(last), idleFor: idleSince === null ? 0 : now - idleSince, unknownFor: unknownSince === null ? 0 : now - unknownSince, age: now, times })
    if (step.act === 'exit') { log(`exit: ${step.reason}`); process.exit(0) }
    if (step.act === 'stopFailure') { fire('StopFailure', { error: obs.apiError, dctr_watch: true }); process.exit(0) }
    if (step.act === 'idle') { fire('Notification', { notification_type: 'idle_prompt', dctr_watch: true }); process.exit(0) }
    if (step.act === 'unknown') { fire('Notification', { notification_type: 'background_unknown', dctr_why: obs.backgroundUnknown, dctr_watch: true }); process.exit(0) }
    if (step.act === 'stop') {
      firedAt = fact.at
      fire('Stop', { stop_hook_active: false, last_assistant_message: last, dctr_watch: true })
    }
    sleepMs(times.poll); now += times.poll
  }
} catch (e) {
  log(`watcher error (${String(e?.message || e).split('\n')[0]})`)
  process.exit(0)
}
