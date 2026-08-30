// doctrine — herdr seat visibility hook (issue #17).
//
// One entry point for three events; the plugin's hooks.json points all three here and this file
// dispatches on `hook_event_name`.
//
//   SubagentStart  give the seat a pane — beside the session while a side slot is free (cap
//                  SIDE_CAP), in its own tab past that — and run the renderer in it. Only tab
//                  seats are reported to the sidebar's agent list; a side pane is already on screen
//   SubagentStop   report a tab seat idle, then close the seat's pane or tab unless someone is
//                  looking at it
//   SessionEnd     sweep any pane or tab whose seat never stopped
//
// It always exits 0. A hook that fails must never fail the run it is watching: this is not a gate,
// it cannot block a phase, it cannot reset a counter and it cannot produce a finding. Every reason
// it stood down is printed to stderr so that a skip and a silent success are never the same signal.
//
// It never writes into another tool's data directory. It reads the transcript path the harness
// hands it and writes only under its own session-scoped state directory.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  PREFIX, agentName, tabLabel, transcriptPath, isSeatEvent, skipReason, nextIndex, stopAction, parseHerdr, shq, tabCreateArgs,
  seatPlacement, splitArgs, reportsSidebarRow,
} from './dctr-lib.mjs'

const stateDir = (sessionId) => path.join(process.env.TMPDIR || os.tmpdir(), `${PREFIX}-${sessionId}`)
const seatsDir = (sessionId) => path.join(stateDir(sessionId), 'seats')

const herdr = (args) => parseHerdr(execFileSync('herdr', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
// A marker reserved but not yet completed. A failure between the two would otherwise leak a
// half-written file that permanently consumes that seat name, so every exit path clears it.
let reserved = null
const releaseReserved = () => { if (reserved) { try { fs.rmSync(reserved, { force: true }) } catch { /* nothing to undo */ } reserved = null } }
const stand_down = (why) => { releaseReserved(); process.stderr.write(`${PREFIX}: skipped — ${why}\n`); process.exit(0) }

let payload = {}
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
} catch { stand_down('hook payload was not readable JSON') }

const event = payload.hook_event_name
const sessionId = payload.session_id
if (!sessionId) stand_down('no session_id in the payload')

const why = skipReason(process.env)
if (why) stand_down(why)

/** Every seat this session has live, newest last. */
function liveSeats() {
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
function withPlacementLock(fn) {
  const lock = path.join(stateDir(sessionId), 'placement.lock')
  const deadline = Date.now() + 5000
  for (;;) {
    try { fs.mkdirSync(lock); break } catch {
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

try {
  if (event === 'SubagentStart') {
    if (!isSeatEvent(payload)) stand_down('not a seat event: no agent_id, so this is the parent')
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })

    const file = payload.agent_transcript_path || transcriptPath(payload.transcript_path, payload.agent_id)
    if (!file) stand_down('could not resolve the seat transcript path')

    const why = withPlacementLock(() => {
      // Allocate the counter by creating the marker with O_EXCL and retrying on collision. The
      // lock covers this today, but the loop stays collision-safe on its own merits: a read-then-
      // write allocation loses one of two same-millisecond seats the moment the lock ever widens.
      const seats = liveSeats()
      const taken = seats.map((s) => s.agent)
      let n = nextIndex(payload.agent_type, taken)
      let marker = null, name = null
      while (n && !marker) {
        name = agentName(payload.agent_type, n)
        try {
          marker = path.join(seatsDir(sessionId), `${name}.json`)
          fs.writeFileSync(marker, '{}', { flag: 'wx' })
          reserved = marker
        } catch { marker = null; n += 1 }
      }
      if (!marker) return 'could not allocate a seat name'

      // A side pane while a slot is free, a tab past the cap. A failed split falls back to the tab
      // path rather than standing down: the split target can vanish between the read and the call
      // (the user closed the column), and a seat with a tab beats a seat with nothing.
      let tabId = null, paneId = null
      if (seatPlacement(seats, process.env.HERDR_PANE_ID) === 'pane') {
        let layout = null
        try { layout = herdr(['pane', 'layout', '--pane', process.env.HERDR_PANE_ID]).result.layout.panes } catch { /* newest stands in */ }
        try { paneId = herdr(splitArgs(seats, process.env.HERDR_PANE_ID, layout)).result.pane.pane_id }
        catch { paneId = null }
      }
      if (!paneId) {
        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(payload.agent_type, n)))
        tabId = tab.result.tab.tab_id
        paneId = tab.result.root_pane.pane_id
      }

      const renderer = path.join(import.meta.dirname, 'dctr-render.mjs')
      herdr(['pane', 'run', paneId, `node ${shq(renderer)} ${shq(file)}`])
      const record = { agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file }
      if (reportsSidebarRow(record)) {
        herdr(['pane', 'report-agent', paneId, '--source', `custom:${PREFIX}`, '--agent', name,
          '--state', 'working', '--message', `doctrine seat ${payload.agent_type}`])
      }

      fs.writeFileSync(marker, JSON.stringify(record))
      reserved = null   // complete: the marker is now a record rather than a reservation
      return null
    })
    if (why) stand_down(why)
  }

  if (event === 'SubagentStop') {
    if (!isSeatEvent(payload)) stand_down('not a seat event: no agent_id, so this is the parent')
    const seat = liveSeats().find((s) => s.agent_id === payload.agent_id)
    if (!seat) stand_down(`no live seat recorded for ${payload.agent_id}`)

    try {
      if (reportsSidebarRow(seat)) {
        herdr(['pane', 'report-agent', seat.paneId, '--source', `custom:${PREFIX}`, '--agent', seat.agent, '--state', 'idle'])
      }
    } catch { /* the pane may already be gone; the tab handling below still runs */ }

    if (seat.tabId) {
      // The list is advisory: it decides relabel-vs-close and supplies the label, nothing more. A tab
      // the list does not carry — mislocated by a pre-#20 hook, or the list call itself failing — is
      // closed by its recorded id, which is global. Skipping it here would orphan it for good, since
      // the marker removal below also takes the seat out of the SessionEnd sweep.
      let mine
      try {
        const tabs = herdr(['tab', 'list', '--workspace', process.env.HERDR_WORKSPACE_ID]).result.tabs
        mine = tabs.find((t) => t.tab_id === seat.tabId)
      } catch { /* fall through to close-by-id */ }
      if (stopAction(mine) === 'relabel') herdr(['tab', 'rename', seat.tabId, `${mine.label} · done`])
      else herdr(['tab', 'close', seat.tabId])
    } else {
      // A side seat: same relabel-vs-close rule, read from the pane's own record. A pane the get
      // cannot find is treated as unfocused and the close is best-effort — it is already gone.
      let pane
      try { pane = herdr(['pane', 'get', seat.paneId]).result.pane } catch { /* gone */ }
      if (stopAction(pane) === 'relabel') herdr(['pane', 'rename', seat.paneId, `${seat.agent} · done`])
      else try { herdr(['pane', 'close', seat.paneId]) } catch { /* already gone */ }
    }

    fs.rmSync(path.join(seatsDir(sessionId), `${seat.agent}.json`), { force: true })
  }

  if (event === 'SessionEnd') {
    // A seat whose SubagentStop never fired leaves a pane or tab behind. Nothing else will clear it.
    for (const seat of liveSeats()) {
      try { herdr(seat.tabId ? ['tab', 'close', seat.tabId] : ['pane', 'close', seat.paneId]) } catch { /* already gone */ }
    }
    fs.rmSync(stateDir(sessionId), { recursive: true, force: true })
  }
  if (!['SubagentStart', 'SubagentStop', 'SessionEnd'].includes(event)) {
    stand_down(`no handler for ${event || 'an unnamed event'}; hooks.json subscribes to three`)
  }
} catch (e) {
  // herdr is pre-1.0 and its own notes say upgrades can require restarting the server. Every
  // non-zero exit from it is a skip with a reason, never something to diagnose from in here.
  stand_down(`herdr refused an action — ${String(e.message).split('\n')[0]}`)
}
process.exit(0)
