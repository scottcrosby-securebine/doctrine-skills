// doctrine — the seat hook's on-disk state and herdr call, shared with dctr-gate.mjs.
//
// The hook (dctr-seat.mjs) and the gate runner (dctr-gate.mjs) both place panes beside one session,
// so both must read the same markers under the same lock: a gate that placed itself without the
// lock would found a second column the next wave never sees. Everything here is I/O; the decisions
// stay pure in dctr-lib.mjs so the selftests can run them with no herdr present.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PREFIX, parseHerdr } from './dctr-lib.mjs'

export const stateDir = (sessionId) => path.join(process.env.TMPDIR || os.tmpdir(), `${PREFIX}-${sessionId}`)
export const seatsDir = (sessionId) => path.join(stateDir(sessionId), 'seats')

/** Best-effort append to the session's hook.log; never throws. Hook output goes to a stream nobody
 *  reads, so a stand-down or a fallback that fired left no trace the first time it mattered (F14,
 *  2026-08-31). The launcher writes here too, so a gate that stood down is found where a seat is. */
export function hookLog(sessionId, msg) {
  if (!sessionId) return
  try {
    fs.mkdirSync(stateDir(sessionId), { recursive: true })
    fs.appendFileSync(path.join(stateDir(sessionId), 'hook.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* logging must never be the failure */ }
}

export const herdr = (args) => parseHerdr(execFileSync('herdr', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))

/** Every seat this session has live, newest last. */
export function liveSeats(sessionId) {
  try {
    return fs.readdirSync(seatsDir(sessionId))
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(seatsDir(sessionId), f), 'utf8')))
  } catch { return [] }
}

// Placement is a read-decide-split sequence, and doctrine dispatches waves: six SubagentStarts in
// one millisecond is the proven load. Unserialized, every one of them sees zero side seats and
// founds its own right-hand column. The lock makes marker state and pane geometry move together;
// a holder that died is stolen after 10s so one crashed hook cannot blind every later seat.
export function withPlacementLock(sessionId, fn) {
  const lock = path.join(stateDir(sessionId), 'placement.lock')
  const deadline = Date.now() + 5000
  for (;;) {
    try { fs.mkdirSync(lock, { recursive: false }); break } catch {
      let stale = false
      try { stale = Date.now() - fs.statSync(lock).mtimeMs > 10000 } catch { continue }
      if (stale) { try { fs.rmdirSync(lock) } catch { /* another waiter beat us to the steal */ } continue }
      if (Date.now() > deadline) throw new Error('placement lock timed out')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  // fn stands down by returning a reason, never by exiting: process.exit skips finally and the
  // leaked lock would cost every seat behind it the full staleness window.
  try { return fn() } finally { try { fs.rmdirSync(lock) } catch { /* already released */ } }
}
