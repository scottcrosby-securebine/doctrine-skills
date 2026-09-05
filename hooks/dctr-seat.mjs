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
// hands it and writes only under its own session-scoped state directory — plus, in the contained
// posture (DCTR_VIEW_REQUEST_DIR set, no herdr socket), the view-request files it drops into that
// mount for a host-side watcher to render. A contained agent must reach nothing on the host, so in
// that posture the hook makes no herdr call at all: it only writes and removes request files.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PREFIX, agentName, tabLabel, transcriptPath, isSeatEvent, notSeatReason, skipReason, nextIndex, stopAction, shq, tabCreateArgs,
  seatPlacement, splitArgs, reportsSidebarRow, staleSideSeats, viewRequestPath, viewRequest, containerIdFromMountinfo,
} from './dctr-lib.mjs'
import { stateDir, seatsDir, herdr, liveSeats as readSeats, withPlacementLock as placementLock } from './dctr-state.mjs'

// Hook output goes to a stream nobody reads, so a stand-down or a fallback that fired left no
// trace the first time it mattered (F14, 2026-08-31). Best-effort append; never throws.
let logSession = null
const log = (msg) => {
  if (!logSession) return
  try {
    fs.mkdirSync(stateDir(logSession), { recursive: true })
    fs.appendFileSync(path.join(stateDir(logSession), 'hook.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* logging must never be the failure */ }
}

// A marker reserved but not yet completed. A failure between the two would otherwise leak a
// half-written file that permanently consumes that seat name, so every exit path clears it.
let reserved = null
const releaseReserved = () => { if (reserved) { try { fs.rmSync(reserved, { force: true }) } catch { /* nothing to undo */ } reserved = null } }
const stand_down = (why) => { releaseReserved(); log(`${payload.hook_event_name || 'event'} skipped — ${why}`); process.stderr.write(`${PREFIX}: skipped — ${why}\n`); process.exit(0) }

let payload = {}
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
} catch { stand_down('hook payload was not readable JSON') }

const event = payload.hook_event_name
const sessionId = payload.session_id
if (!sessionId) stand_down('no session_id in the payload')
logSession = sessionId

// Contained posture. DCTR_VIEW_REQUEST_DIR is an allowed mount (sbsforge: /bridge); its
// presence means this session runs inside a container that must reach nothing on the host.
// The hook therefore makes NO herdr call and needs no HERDR_* variable: it only writes a
// request file a host-side watcher renders, and removes it when the seat stops. Selected
// before the HERDR_ENV gate so it works with the socket and every HERDR_* var absent.
const requestDir = process.env.DCTR_VIEW_REQUEST_DIR
if (requestDir) {
  if (event === 'SubagentStart' || event === 'SubagentStop') {
    if (!isSeatEvent(payload)) stand_down(notSeatReason(payload))
    const reqPath = viewRequestPath(requestDir, payload.agent_id)
    if (event === 'SubagentStop') {
      try { fs.rmSync(reqPath, { force: true }) } catch { /* mount gone; the watcher reaps stale requests */ }
      log(`contained stop ${payload.agent_id}: request removed`)
      process.exit(0)
    }
    const file = payload.agent_transcript_path || transcriptPath(payload.transcript_path, payload.agent_id)
    if (!file) stand_down('could not resolve the seat transcript path')
    let cid = null
    try { cid = containerIdFromMountinfo(fs.readFileSync('/proc/self/mountinfo', 'utf8')) } catch { /* not linux, or no /proc */ }
    const renderer = path.join(import.meta.dirname, 'dctr-render.mjs')
    try {
      fs.writeFileSync(reqPath, JSON.stringify(viewRequest(cid || os.hostname(), renderer, file, payload.agent_type)))
    } catch (e) {
      stand_down(`could not write the view request (${String(e.message).split('\n')[0]}) — is ${requestDir} mounted?`)
    }
    log(`contained start ${payload.agent_id}: request written`)
    process.exit(0)
  }
  // SessionEnd in contained mode: nothing to sweep from here. Requests are removed at
  // SubagentStop, and a seat that never stopped leaves one file the host watcher reaps by
  // age. The hook holds no host handle to close.
  process.exit(0)
}

const why = skipReason(process.env)
if (why) stand_down(why)

const liveSeats = () => readSeats(sessionId)
const withPlacementLock = (fn) => placementLock(sessionId, fn)

try {
  if (event === 'SubagentStart') {
    if (!isSeatEvent(payload)) stand_down(notSeatReason(payload))
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })

    const file = payload.agent_transcript_path || transcriptPath(payload.transcript_path, payload.agent_id)
    if (!file) stand_down('could not resolve the seat transcript path')

    const why = withPlacementLock(() => {
      // Allocate the counter by creating the marker with O_EXCL and retrying on collision. The
      // lock covers this today, but the loop stays collision-safe on its own merits: a read-then-
      // write allocation loses one of two same-millisecond seats the moment the lock ever widens.
      // The layout is read first and is authoritative: a marker whose pane it no longer carries is
      // dropped before it can count toward the cap or become the split target (see staleSideSeats).
      let layout = null
      try { layout = herdr(['pane', 'layout', '--pane', process.env.HERDR_PANE_ID]).result.layout.panes } catch { /* newest stands in */ }
      let seats = liveSeats()
      for (const s of staleSideSeats(seats, layout)) {
        try { fs.rmSync(path.join(seatsDir(sessionId), `${s.agent}.json`), { force: true }) } catch { /* best effort */ }
        log(`dropped stale marker ${s.agent}: pane ${s.paneId} not in layout`)
      }
      seats = seats.filter((s) => !staleSideSeats([s], layout).length)
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

      // A side pane while a slot is free, a tab past the cap. A failed split is retried once from
      // the session pane itself — the target can still vanish between the layout read and the
      // call — and only then falls back to the tab path, logged, rather than standing down: a
      // seat with a tab beats a seat with nothing, but a silent demotion hid F13 for seven hours.
      let tabId = null, paneId = null
      if (seatPlacement(seats, process.env.HERDR_PANE_ID) === 'pane') {
        try { paneId = herdr(splitArgs(seats, process.env.HERDR_PANE_ID, layout)).result.pane.pane_id }
        catch (e) {
          log(`split failed (${String(e.message).split('\n')[0]}); retrying from the session pane`)
          try { paneId = herdr(splitArgs([], process.env.HERDR_PANE_ID)).result.pane.pane_id }
          catch (e2) { log(`retry failed (${String(e2.message).split('\n')[0]}); falling back to a tab`); paneId = null }
        }
      }
      if (!paneId) {
        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(payload.agent_type, n)))
        tabId = tab.result.tab.tab_id
        paneId = tab.result.root_pane.pane_id
      }

      const renderer = path.join(import.meta.dirname, 'dctr-render.mjs')

      // Finalize the marker the instant the pane exists, BEFORE any step that can throw — the
      // pane command and the sidebar report. Once it is on disk the seat is tracked, so whatever
      // fails after this, SubagentStop and the SessionEnd sweep both find the pane and tear it
      // down. The old order wrote the marker last, so a throw anywhere in setup left an unmarked
      // pane beyond even the sweep; recording teardown first is what makes a mid-setup failure
      // recoverable (codex, 2026-09-01).
      //
      // This is the operator's-own-herdr path (HERDR_ENV=1, no bridge): hook and pane share one
      // filesystem, node is present, so the renderer runs directly in the pane. A CONTAINED agent
      // never reaches here — DCTR_VIEW_REQUEST_DIR routes it to the bridge-write path above, which
      // makes no herdr call at all.
      const record = { agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file }
      fs.writeFileSync(marker, JSON.stringify(record))
      reserved = null   // complete: the marker is now a record rather than a reservation

      herdr(['pane', 'run', paneId, `node ${shq(renderer)} ${shq(file)}`])
      if (reportsSidebarRow(record)) {
        herdr(['pane', 'report-agent', paneId, '--source', `custom:${PREFIX}`, '--agent', name,
          '--state', 'working', '--message', `doctrine seat ${payload.agent_type}`])
      }
      return null
    })
    if (why) stand_down(why)
  }

  if (event === 'SubagentStop') {
    if (!isSeatEvent(payload)) stand_down(notSeatReason(payload))
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
      if (stopAction(pane) === 'relabel') try { herdr(['pane', 'rename', seat.paneId, `${seat.agent} · done`]) } catch { /* label only */ }
      else try { herdr(['pane', 'close', seat.paneId]) } catch { /* already gone */ }
    }

    fs.rmSync(path.join(seatsDir(sessionId), `${seat.agent}.json`), { force: true })
    log(`stop ${seat.agent}: marker removed (${seat.tabId ? 'tab' : 'pane'} ${seat.tabId || seat.paneId})`)
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
