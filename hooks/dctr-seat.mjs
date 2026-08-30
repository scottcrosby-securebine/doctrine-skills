// doctrine — herdr seat visibility hook (issue #17).
//
// One entry point for three events; the plugin's hooks.json points all three here and this file
// dispatches on `hook_event_name`.
//
//   SubagentStart  create a tab, run the renderer in it, report the seat to herdr's sidebar
//   SubagentStop   report the seat idle, then close its tab unless someone is looking at it
//   SessionEnd     sweep any tab whose seat never stopped
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

try {
  if (event === 'SubagentStart') {
    if (!isSeatEvent(payload)) stand_down('not a seat event: no agent_id, so this is the parent')
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })

    // Allocate the counter by creating the marker with O_EXCL and retrying on collision. Doctrine
    // dispatches waves, so two seats of one role can start in the same millisecond; a read-then-
    // write allocation loses one of them and both seats then claim one name.
    const taken = liveSeats().map((s) => s.agent)
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
    if (!marker) stand_down('could not allocate a seat name')

    const file = payload.agent_transcript_path || transcriptPath(payload.transcript_path, payload.agent_id)
    if (!file) stand_down('could not resolve the seat transcript path')

    const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(payload.agent_type, n)))
    const tabId = tab.result.tab.tab_id
    const paneId = tab.result.root_pane.pane_id

    const renderer = path.join(import.meta.dirname, 'dctr-render.mjs')
    herdr(['pane', 'run', paneId, `node ${shq(renderer)} ${shq(file)}`])
    herdr(['pane', 'report-agent', paneId, '--source', `custom:${PREFIX}`, '--agent', name,
      '--state', 'working', '--message', `doctrine seat ${payload.agent_type}`])

    fs.writeFileSync(marker, JSON.stringify({ agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file }))
    reserved = null   // complete: the marker is now a record rather than a reservation
  }

  if (event === 'SubagentStop') {
    if (!isSeatEvent(payload)) stand_down('not a seat event: no agent_id, so this is the parent')
    const seat = liveSeats().find((s) => s.agent_id === payload.agent_id)
    if (!seat) stand_down(`no live seat recorded for ${payload.agent_id}`)

    try {
      herdr(['pane', 'report-agent', seat.paneId, '--source', `custom:${PREFIX}`, '--agent', seat.agent, '--state', 'idle'])
    } catch { /* the pane may already be gone; the tab handling below still runs */ }

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

    fs.rmSync(path.join(seatsDir(sessionId), `${seat.agent}.json`), { force: true })
  }

  if (event === 'SessionEnd') {
    // A seat whose SubagentStop never fired leaves a tab behind. Nothing else will clear it.
    for (const seat of liveSeats()) {
      try { herdr(['tab', 'close', seat.tabId]) } catch { /* already gone */ }
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
