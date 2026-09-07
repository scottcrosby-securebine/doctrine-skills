// doctrine — herdr seat visibility hook (issue #17).
//
// One entry point for three events; the plugin's hooks.json points all three here and this file
// dispatches on `hook_event_name`.
//
//   SubagentStart  give the seat a pane — beside the session while a side slot is free (cap
//                  SIDE_CAP), in its own tab past that — and run the renderer in it. Only tab
//                  seats are reported to the sidebar's agent list; a side pane is already on screen
//   SubagentStop   report a tab seat idle, then close the seat's pane or tab unless someone is
//                  looking at it. A codex rescue seat is the exception: its wrapper returns in about
//                  a minute while the job it started runs on, so its pane is handed a watcher on the
//                  job record instead (`--codex-tail`, below) and its marker stays until SessionEnd
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
  PREFIX, agentName, transcriptPath, isSeatEvent, notSeatReason, skipReason, nextIndex, stopAction, shq, tabCreateArgs,
  seatPlacement, splitArgs, reportsSidebarRow, staleSideSeats, viewRequestPath, viewRequest, containerIdFromMountinfo,
  errorLabel, paneLabel, metaPath, codexJobMatch, CODEX_ROLE } from './dctr-lib.mjs'
import { stateDir, seatsDir, herdr, hookLog, liveSeats as readSeats, liveSeatsPartial, reserveMarker, writeMarker, sideOccupants, interactivePanes, withPlacementLock as placementLock, isPaneNotFound, isTabNotFound, codexJobRecords, readMeta, sleepMs } from './dctr-state.mjs'

// Watcher mode, typed into a codex seat's pane by SubagentStop:
//
//   node dctr-seat.mjs --codex-tail <job-record.json> <pane-id> <label>
//
// Follows the job's log and polls its record; when the status leaves `queued` or `running` it renames the pane
// `<label> · <status>` and exits, leaving the output on screen (Scott's ruling, 2026-09-07:
// relabel and stay). The log is followed here rather than by tail(1) so the last bytes are on
// screen before the exit, and a job already finished still shows its log. Runs before the payload
// read because its stdin is the pane, not a hook.
if (process.argv[2] === '--codex-tail') {
  const [, , , jobFile, paneId, label] = process.argv
  if (!jobFile || !paneId || !label) { console.error('usage: node dctr-seat.mjs --codex-tail <job-record.json> <pane-id> <label>'); process.exit(1) }
  const readJob = () => { try { return JSON.parse(fs.readFileSync(jobFile, 'utf8')) } catch { return null } }
  const job = readJob()
  if (!job) { console.error(`${PREFIX}: could not read ${jobFile}`); process.exit(1) }
  console.log(`\x1b[2m── doctrine codex · ${label} · ${jobFile}\x1b[0m`)
  let offset = 0
  const pump = () => {
    if (!job.logFile) return
    let size
    try { size = fs.statSync(job.logFile).size } catch { return }
    if (size < offset) offset = 0
    if (size === offset) return
    const fd = fs.openSync(job.logFile, 'r')
    try {
      const buf = Buffer.alloc(size - offset)
      fs.readSync(fd, buf, 0, buf.length, offset)
      offset = size
      process.stdout.write(buf)
    } finally { fs.closeSync(fd) }
  }
  const poll = () => {
    pump()
    const cur = readJob()
    if (!cur || cur.status === 'running' || cur.status === 'queued') return
    pump()
    try { herdr(['pane', 'rename', paneId, `${label} · ${cur.status}`]) } catch { /* label only */ }
    console.log(`\x1b[2m── codex job ${cur.status}\x1b[0m`)
    process.exit(0)
  }
  setInterval(pump, 250)
  setInterval(poll, 2000)
  poll()
} else {

let logSession = null
const log = (msg) => hookLog(logSession, msg)

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
// The session cwd: where a seat's pane shell starts, and the workspace a codex job record names.
// It is in the payload; process.cwd() stands in when it is not.
const cwd = payload.cwd || process.cwd()

try {
  if (event === 'SubagentStart') {
    if (!isSeatEvent(payload)) stand_down(notSeatReason(payload))
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })

    const file = payload.agent_transcript_path || transcriptPath(payload.transcript_path, payload.agent_id)
    if (!file) stand_down('could not resolve the seat transcript path')
    // The harness writes the seat's spawn metadata beside its transcript in the same second this
    // hook fires; its `description` is the Agent tool's description, the title the status line
    // shows. Read outside the lock, since the retry inside it would hold every seat behind this one.
    const meta = readMeta(metaPath(file))
    const description = meta && typeof meta.description === 'string' ? meta.description : ''

    const why = withPlacementLock(() => {
      // Allocate the counter by creating the marker with O_EXCL and retrying on collision. The
      // lock covers this today, but the loop stays collision-safe on its own merits: a read-then-
      // write allocation loses one of two same-millisecond seats the moment the lock ever widens.
      // The layout is read first and is authoritative: a marker whose pane it no longer carries is
      // dropped before it can count toward the cap or become the split target (see staleSideSeats).
      // A failed layout read is "I could not look": sideOccupants returns null below and this seat
      // takes the tab path rather than splitting onto a column it cannot see. It did once fall back
      // to stacking on the newest side pane, and that could stack onto a pane in another tab.
      let layout = null
      try { layout = herdr(['pane', 'layout', '--pane', process.env.HERDR_PANE_ID]).result.layout.panes } catch { /* tab path below */ }
      // An unreadable marker makes the seat count unknown, and an unknown count must not become a
      // small one: standing down costs this seat its pane, placing blind costs the whole column.
      let seats
      try { seats = liveSeats() } catch (e) { return `could not read this session's seat markers (${e.message})` }
      for (const s of staleSideSeats(seats, layout)) {
        try { fs.rmSync(path.join(seatsDir(sessionId), `${s.agent}.json`), { force: true }) } catch { /* best effort */ }
        log(`dropped stale marker ${s.agent}: pane ${s.paneId} not in layout`)
      }
      seats = seats.filter((s) => !staleSideSeats([s], layout).length)
      const taken = seats.map((s) => s.agent)
      let n = nextIndex(payload.agent_type, taken)
      let marker = null, name = null, fatal = null
      // EEXIST is the name being taken, and it is the ONLY reason to try the next one. Every other
      // errno — EACCES on a seats directory we cannot write, ENOSPC on a full disk — will hit the
      // next name identically, so treating them all as collisions spun this loop forever WHILE
      // HOLDING THE PLACEMENT LOCK: measured at 1000 reservation attempts with no exit and no
      // deadline, blocking every seat behind it.
      //
      // No index bound here on purpose. One was added and removed in the same round: with the errno
      // split above, a real failure leaves through `fatal`, and unbounded EEXIST would need another
      // process to steal each freshly-chosen name in turn, which a six-pane cap does not produce.
      // The mutation gate reported it as pinned by nothing, and a guard whose absence no fixture can
      // show is the class this repo keeps finding. `nextIndex` carries the only bound that fires.
      while (n && !marker && !fatal) {
        name = agentName(payload.agent_type, n)
        try {
          marker = path.join(seatsDir(sessionId), `${name}.json`)
          reserveMarker(marker)
          reserved = marker
        } catch (e) {
          if (e.code !== 'EEXIST') { fatal = e; marker = null; break }
          marker = null; n += 1
        }
      }
      if (fatal) return `could not reserve a seat marker (${fatal.message})`
      if (!marker) return 'could not allocate a seat name'

      // A side pane while a slot is free, a tab past the cap. A failed split is retried once from
      // the session pane itself — the target can still vanish between the layout read and the
      // call — and only then falls back to the tab path, logged, rather than standing down: a
      // seat with a tab beats a seat with nothing, but a silent demotion hid F13 for seven hours.
      let tabId = null, paneId = null
      // An interactive pane (dctr-pane.mjs) occupies a column slot but is never swept, so it joins
      // the placement count and the split-target list without joining `seats`. sideOccupants
      // returns null for "I could not look" — an unreadable marker directory or a failed layout
      // read — and that must read as a FULL column, not an empty one. Filtering an unknown layout
      // silently dropped every interactive pane from the count and split on top of six of them.
      const occupants = sideOccupants(seats, layout)
      if (!occupants) {
        // Name the cause. A malformed marker in the shared directory stops every placement on the
        // host, and a line that does not say which file leaves the operator nothing to remove.
        let why = 'the layout could not be read'
        try { interactivePanes() } catch (e) { why = e.message }
        log(`could not observe the side column (${why}); taking the tab path rather than splitting blind`)
      }
      if (occupants && seatPlacement(occupants, process.env.HERDR_PANE_ID) === 'pane') {
        try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout, cwd)).result.pane.pane_id }
        catch (e) {
          log(`split failed (${String(e.message).split('\n')[0]}); retrying from the session pane`)
          try { paneId = herdr(splitArgs([], process.env.HERDR_PANE_ID, null, cwd)).result.pane.pane_id }
          catch (e2) { log(`retry failed (${String(e2.message).split('\n')[0]}); falling back to a tab`); paneId = null }
        }
      }
      const label = paneLabel(payload.agent_type, description, n)
      if (!paneId) {
        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, label, cwd))
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
      const record = { agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file, label }
      writeMarker(marker, record)
      reserved = null   // complete: the marker is now a record rather than a reservation

      herdr(['pane', 'run', paneId, `node ${shq(renderer)} ${shq(file)}`])
      // A tab was created under the label; a side pane is named after the fact. Display only.
      if (!tabId) try { herdr(['pane', 'rename', paneId, label]) } catch (e) { log(`rename of ${paneId} failed (${String(e.message).split('\n')[0]})`) }
      if (reportsSidebarRow(record)) {
        herdr(['pane', 'report-agent', paneId, '--source', `custom:${PREFIX}`, '--agent', name,
          '--state', 'working', '--message', label])
      }
      return null
    })
    if (why) stand_down(why)
  }

  if (event === 'SubagentStop') {
    if (!isSeatEvent(payload)) stand_down(notSeatReason(payload))
    // The readable seats are enough to close THIS one. Using the strict reader here meant one
    // truncated marker stood every other seat down, leaving live panes and renderer processes that
    // nothing would ever close: preserving a record we cannot read must not abandon the ones we can.
    const { seats: readable, unreadable } = liveSeatsPartial(sessionId)
    if (unreadable.length) log(`markers that could not be read, left in place: ${unreadable.join(', ')}`)
    const seat = readable.find((s) => s.agent_id === payload.agent_id)
    if (!seat) stand_down(`no live seat recorded for ${payload.agent_id}`)

    let closeFailed = null
    try {
      if (reportsSidebarRow(seat)) {
        herdr(['pane', 'report-agent', seat.paneId, '--source', `custom:${PREFIX}`, '--agent', seat.agent, '--state', 'idle'])
      }
    } catch { /* the pane may already be gone; the tab handling below still runs */ }

    // A close that answered "not found" is NOT a failed close. herdr replies to a missing pane or tab
    // with a structured error CODE and exit 1, so execFileSync throws either way and the throw alone
    // cannot tell "it is already gone" from "I could not reach it". `isPaneNotFound` was added to
    // dctr-state.mjs to make exactly that distinction and was called only from the launcher; this
    // file read every throw as a failure, so a pane the USER closed — the lifecycle Q4 ruled and
    // SKILL.md documents — kept its marker forever and left the state directory unswept on every
    // such session. Tabs answer a different code, hence two predicates rather than one widened one.
    const alreadyGone = (e) => (seat.tabId ? isTabNotFound(e) : isPaneNotFound(e))

    if (seat.role === CODEX_ROLE) {
      // The wrapper has returned; the job has not. Its record is the newest one for this workspace
      // written since the seat started, allowing a minute for the plugin's own clock. The plugin
      // writes it after the wrapper is dispatched, so the record is polled for up to five seconds
      // inside the hook's ten. No record means the job never started, and the seat closes as any.
      let notBefore = 0
      try { notBefore = fs.statSync(path.join(seatsDir(sessionId), `${seat.agent}.json`)).mtimeMs - 60000 } catch { /* the epoch, then */ }
      const deadline = Date.now() + 5000
      let job
      do {
        sleepMs(500)
        job = codexJobMatch(codexJobRecords(cwd), cwd, notBefore)
      } while (!job && Date.now() < deadline)
      if (job) {
        const label = seat.label || seat.agent
        // The renderer still owns the pane's terminal; the watcher line is typed into a shell.
        try { herdr(['pane', 'send-keys', seat.paneId, 'ctrl+c']) } catch (e) { log(`interrupting the renderer in ${seat.paneId} failed (${String(e.message).split('\n')[0]})`) }
        herdr(['pane', 'run', seat.paneId, `node ${shq(import.meta.filename)} --codex-tail ${shq(job.file)} ${shq(seat.paneId)} ${shq(label)}`])
        log(`stop ${seat.agent}: codex job ${job.id || job.file} is ${job.status}; the pane follows it and the marker stays`)
        process.exit(0)
      }
      log(`stop ${seat.agent}: no codex job record for ${cwd} since the seat started; closing as any seat`)
    }

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
      if (stopAction(mine) === 'relabel') try { herdr(['tab', 'rename', seat.tabId, `${mine.label} · done`]) } catch { /* label only */ }
      else try { herdr(['tab', 'close', seat.tabId]) } catch (e) { if (!alreadyGone(e)) closeFailed = String(e.message).split('\n')[0] }
    } else {
      // A side seat: same relabel-vs-close rule, read from the pane's own record. A pane the get
      // cannot find is treated as unfocused and the close is best-effort — it is already gone.
      // THE SAME DISTINCTION ON THE READ, and it fails the opposite way. `stopAction(undefined)` is
      // 'close', so a lookup that merely FAILED used to close the pane anyway — and the one pane
      // stopAction would have spared is the focused one, the pane the user is watching. "It is gone"
      // and "I could not look" need separating here for the same reason they do on the close.
      let pane, lookupFailed = null
      try { pane = herdr(['pane', 'get', seat.paneId]).result.pane }
      catch (e) { if (!isPaneNotFound(e)) lookupFailed = String(e.message).split('\n')[0] }
      if (lookupFailed) {
        // Keep the record rather than act blind. SessionEnd will try again, which is the whole
        // reason a marker survives a close it could not make.
        closeFailed = `could not look up ${seat.paneId} (${lookupFailed})`
      } else if (stopAction(pane) === 'relabel') try { herdr(['pane', 'rename', seat.paneId, `${seat.label || seat.agent} · done`]) } catch { /* label only */ }
      else try { herdr(['pane', 'close', seat.paneId]) } catch (e) { if (!alreadyGone(e)) closeFailed = String(e.message).split('\n')[0] }
    }

    // The same rule SessionEnd follows, and this is where it was missing: a close that FAILED is not
    // "already gone". Removing the marker anyway throws away the only record of a pane that may
    // still be on screen, and SessionEnd's own preservation cannot help — the record is gone first.
    if (closeFailed) {
      log(`stop ${seat.agent}: close failed (${closeFailed}); keeping its marker so SessionEnd can try again`)
    } else {
      // Remove by IDENTITY, under the same lock SubagentStart allocates names in. Removing by NAME,
      // outside the lock, let a finishing seat delete a REPLACEMENT's marker: SubagentStart sees this
      // seat's pane gone from the layout, drops the stale marker, reuses the freed name for a new
      // agent and publishes it — and this unlink then takes the new one. The new pane stays alive
      // with nothing on disk naming it, so no later SubagentStop and no SessionEnd can ever find it.
      // The read above already matched on agent_id; it was the WRITE that trusted the name alone.
      placementLock(sessionId, () => {
        const file = path.join(seatsDir(sessionId), `${seat.agent}.json`)
        let current = null, unreadable = false
        try { current = JSON.parse(fs.readFileSync(file, 'utf8')) }
        catch (e) { if (e.code !== 'ENOENT') unreadable = true }
        if (unreadable) {
          // A record we cannot read is not an answer, here as everywhere else in this file.
          log(`stop ${seat.agent}: marker could not be read; leaving it for SessionEnd`)
        } else if (current && current.agent_id !== seat.agent_id) {
          log(`stop ${seat.agent}: that name now belongs to ${current.agent_id}; leaving its marker alone`)
        } else {
          fs.rmSync(file, { force: true })
          log(`stop ${seat.agent}: marker removed (${seat.tabId ? 'tab' : 'pane'} ${seat.tabId || seat.paneId})`)
        }
      })
    }
  }

  if (event === 'SessionEnd') {
    // A seat whose SubagentStop never fired leaves a pane or tab behind. Nothing else will clear it.
    //
    // Enumerate, close and remove ALL INSIDE the placement lock. Reading the seats outside it let a
    // placement finish while this waited, and its brand-new marker was then deleted without its
    // pane being closed — an untracked pane nothing can ever find.
    try {
      let removable = false
      placementLock(sessionId, () => {
        const { seats, unreadable } = liveSeatsPartial(sessionId)
        // Close every seat we can read. A close that FAILS is not "already gone" — a timeout or a
        // transport error leaves the pane alive — so it is counted, and anything uncounted keeps
        // the records that say how to tear it down.
        let failed = 0
        for (const seat of seats) {
          try { herdr(seat.tabId ? ['tab', 'close', seat.tabId] : ['pane', 'close', seat.paneId]) }
          catch (e) {
            // Same rule as SubagentStop above: "not found" is an answer, and the thing we were
            // about to close is already gone, which is the outcome we wanted.
            if (seat.tabId ? isTabNotFound(e) : isPaneNotFound(e)) log(`SessionEnd: ${seat.tabId || seat.paneId} was already gone`)
            else { failed += 1; log(`SessionEnd: could not close ${seat.tabId || seat.paneId} (${String(e.message).split('\n')[0]}); keeping its record`) }
          }
        }
        if (unreadable.length) log(`SessionEnd: ${unreadable.length} marker(s) could not be read; keeping the state directory`)
        if (failed || unreadable.length) return
        // Remove the CONTENTS while still holding the lock, and leave the lock itself: it lives
        // inside this directory, and a recursive removal deletes it part-way through, which lets a
        // waiting launcher place a seat into the very directory still being deleted.
        for (const name of fs.readdirSync(stateDir(sessionId))) {
          if (name === 'placement.lock') continue
          try { fs.rmSync(path.join(stateDir(sessionId), name), { recursive: true, force: true }) } catch { /* best effort */ }
        }
        removable = true
      })
      // The lock is released by now, so the directory can go. If anything above kept a record, this
      // does not run and the directory stays for a human to look at.
      // rmdir, NOT a recursive remove. The lock was released a line ago, and a waiting placement can
      // have taken it and published a marker by now; a recursive remove would carry both off, which
      // is the race moved outside the critical section rather than removed. rmdir fails ENOTEMPTY
      // against exactly that, and failing is the correct outcome.
      if (removable) try { fs.rmdirSync(stateDir(sessionId)) } catch { /* someone got in first, or it is already gone */ }
    } catch (e) {
      // NOTHING is removed on this path, deliberately, and the two ways to get here are why. A read
      // that failed must not authorize a deletion: one truncated marker would otherwise destroy the
      // records of every healthy seat. And a lock that could not be taken must not be deleted out
      // from under whoever holds it. The cost of leaving it is a stale directory under the temp
      // directory that no later session reads; the cost of the alternatives is a live lock or the
      // only record of how to tear down a pane.
      log(`SessionEnd: swept nothing (${e.message}); state directory left in place for a human to remove`)
    }
  }
  if (!['SubagentStart', 'SubagentStop', 'SessionEnd'].includes(event)) {
    stand_down(`no handler for ${event || 'an unnamed event'}; hooks.json subscribes to three`)
  }
} catch (e) {
  // herdr is pre-1.0 and its own notes say upgrades can require restarting the server. Every
  // non-zero exit from it is a skip with a reason, never something to diagnose from in here. A
  // throw that did not come from a spawn is this file's own defect, and is labelled as one.
  stand_down(`${errorLabel(e)}: ${String(e.message).split('\n')[0]}`)
}
process.exit(0)
}
