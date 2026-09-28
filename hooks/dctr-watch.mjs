// doctrine — the Codex auto-cycle watcher (E10: E8-D7, E8-D18 through the adaptation table).
//
// Codex fires no hook for three things the auto-cycle hook acts on under Claude Code: a turn ended by an API error
// (Claude Code's StopFailure), a session left idle waiting for the user (Notification idle_prompt), and the exit of a
// background terminal that held a Stop back (Claude Code fires a Stop again). Probes B5 and B6 found that only the
// session's rollout shows them. So dctr-cycle.mjs, on each Codex UserPromptSubmit while auto-cycle is active, spawns
// this detached with one JSON argument: the session, its rollout, its cwd and project, its herdr pane (null when
// contained or outside herdr) and the rollout's byte length at the prompt. Each poll it reads the rollout and herdr's
// agent_status, and does what watchStep in dctr-lib.mjs decides: wait, exit, or hand dctr-cycle.mjs the event Claude
// Code would have fired, as that event's payload on stdin, so the hook's own decisions (notifyDecision, cycleDecision)
// judge it exactly as they judge a real one. It writes nothing itself. Waits are counted in polls, never read off the
// wall clock. With no pane it reads no herdr, and the idle observation rests on the rollout alone.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { watchStep, watchedTurn, codexObservations, followKickoff, autoCycleActive, stopFileRepo, repoOf, endsReady, WATCH_TIMES } from './dctr-lib.mjs'
import { herdr, hookLog, sleepMs, isPaneNotFound } from './dctr-state.mjs'

let a = null
try { a = JSON.parse(process.argv[2]) } catch { /* not ours to run */ }
if (!a?.session || !a.transcript || !a.project || !Number.isFinite(a.from)) process.exit(0)
const log = (m) => hookLog(a.session, `auto-cycle watcher: ${m}`)
let times = WATCH_TIMES
try { times = { ...WATCH_TIMES, ...JSON.parse(process.env.DCTR_WATCH_TIMES || '{}') } } catch { /* the defaults */ }

/** The event, as the payload the hook reads on stdin. */
function fire(event, more) {
  const script = process.env.DCTR_CYCLE_SCRIPT || path.join(import.meta.dirname, 'dctr-cycle.mjs')
  const payload = { hook_event_name: event, session_id: a.session, transcript_path: a.transcript, cwd: a.cwd || a.project, ...more }
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: 'utf8', env: process.env, timeout: 60000 })
  log(`handed the hook a ${event}${more.notification_type ? ` ${more.notification_type}` : ''} (exit ${r.status})`)
}

/** The last task_complete's last_agent_message, the turn's final answer, or null. */
const lastMessage = (text) => { try { return JSON.parse(text.trimEnd().split('\n').reverse().find((l) => l.includes('"task_complete"'))).payload.last_agent_message ?? null } catch { return null } }

const status = () => {
  if (!a.pane) return null
  try { return herdr(['pane', 'get', a.pane])?.result?.pane?.agent_status ?? 'unknown' } // herdr-lint: a failed read is not ready, so nothing is fired on it
  catch (e) {
    // herdr answering that the pane does not exist is an answer: the session's pane is gone, and nothing is left to
    // watch for. Any other failure is not ready, so nothing is fired on it.
    if (isPaneNotFound(e)) { log('exit: the pane is gone'); process.exit(0) }
    return 'unknown'
  }
}

try {
  let now = 0, bgAtEnd = null, idleSince = null
  for (;;) {
    const chain = followKickoff({ projectDir: a.project, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
    const active = !chain.why && autoCycleActive(chain.record.entries, Boolean(stopFileRepo([a.project, repoOf(chain.recordPath, fs.existsSync)], fs.existsSync)))
    let text = null
    try { text = fs.readFileSync(a.transcript, 'utf8') } catch (e) { log(`the rollout could not be read (${e.code || e.message})`) }
    const turn = text === null ? { ended: false, newTurn: false } : watchedTurn(text.slice(Buffer.from(text).subarray(0, a.from).toString('utf8').length))
    const obs = text === null ? { backgroundRunning: true, apiError: null, idle: false } : codexObservations(text, turn.ended ? status() : null)
    if (turn.ended && bgAtEnd === null) bgAtEnd = obs.backgroundRunning
    idleSince = obs.idle ? (idleSince ?? now) : null
    const last = turn.ended ? lastMessage(text) : null
    const step = watchStep({ active, turn, obs, bgAtEnd: Boolean(bgAtEnd), ready: endsReady(last), idleFor: idleSince === null ? 0 : now - idleSince, age: now, times })
    if (step.act === 'exit') { log(`exit: ${step.reason}`); process.exit(0) }
    if (step.act === 'stopFailure') { fire('StopFailure', { error: obs.apiError, dctr_watch: true }); process.exit(0) }
    if (step.act === 'idle') { fire('Notification', { notification_type: 'idle_prompt', dctr_watch: true }); process.exit(0) }
    if (step.act === 'stop') {
      fire('Stop', { stop_hook_active: false, last_assistant_message: last, dctr_watch: true })
      bgAtEnd = false
    }
    sleepMs(times.poll); now += times.poll
  }
} catch (e) {
  log(`watcher error (${String(e?.message || e).split('\n')[0]})`)
  process.exit(0)
}
