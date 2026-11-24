// An interactive terminal session the user can watch and take over (doctrine-pane, 2026-09-06).
//
//   node hooks/dctr-pane.mjs open    <label> [<tee-file>] <connect-command>
//   node hooks/dctr-pane.mjs read    <tee-file>
//   node hooks/dctr-pane.mjs profile <tee-file> <what the platform is and how it behaves>
//   node hooks/dctr-pane.mjs type    <tee-file> <text>
//   node hooks/dctr-pane.mjs enter   <tee-file>
//   node hooks/dctr-pane.mjs own     <tee-file> agent|user
//
// THIS FILE ENFORCES; IT DOES NOT INTERPRET. An earlier revision decided in code what a prompt was,
// whether a command had finished, and whether a pager was waiting. That was deleted: PS1 is an
// arbitrary string (one host here prints a live clock in it), a pager prompt is indistinguishable
// from a device prompt by shape, and quiescence cannot tell a finished command from a paused one.
// Those judgements belong to the agent reading the bytes. What belongs here is the set of rules an
// agent cannot be trusted to keep under pressure.
//
// EVERY STATE-TOUCHING OPERATION RUNS UNDER A PER-TEE LOCK. Two independent reviews found the same
// class rather than nine separate bugs: each subcommand was a separate process that read state,
// checked it, then acted, holding nothing in between. Check-then-act across process boundaries is
// racy by construction — an `own user` could be ignored and then overwritten by a stale write, and
// two invocations could both pass the guard before either sent. The lock is the fix for the class.
//
// The invariants, each one a defect that actually happened:
//  - Enter is a SEPARATE call from typing. On a Juniper QFX a stray `s` at a `---(more)---` pager
//    opened a save-to-file prompt; the split let the agent see `Filename: how interfaces terse` and
//    never press Enter. Nothing was written.
//  - You may not type into a session with unread output, and ONE snapshot of the file end feeds
//    both what is shown and where the cursor lands. Taking two snapshots let bytes arrive between
//    them and be marked read without ever being displayed.
//  - `own` does NOT advance the cursor, so after a handover the first `type` refuses until the
//    agent has read what the user did.
//  - NOTHING IS TYPED UNTIL THE SESSION HAS A PROFILE. The login banner says what the far end is —
//    `JUNOS 21.4R3-S7.8`, `Linux radprox01 6.8.12-20-pve` — so identification is free and accurate
//    once connected, and guessing from a hostname beforehand is not. `profile` records what the
//    platform is and what its pager, cancel key and destructive commands are; `type` and `enter`
//    refuse until it exists. This cannot check that the research was any good. It can force the
//    stop, and it records the claim in the state file and prints it, so it sits in the agent's own
//    output where the user can see whether the work was done. It exists because the agent knew `| no-more` and typed anyway, under momentum, and put
//    a filename prompt on a live switch.
//  - The recorder must still be alive: when ssh exits, script(1) exits and the pane falls back to a
//    shell ON THIS MACHINE. Narrowed, not closed — see guardWrite.
//  - Every observation fails closed, placement included. A layout lookup that throws refuses rather
//    than treating every recorded pane as a candidate, which could split another workspace's pane.
//  - State is validated on read. A cursor that was missing, non-numeric or larger than the file
//    sailed through the unread check.
//  - One command per write: any control character is rejected, because a bare CR is Enter.
//  - Refuse outside herdr and herdr-core, and in a contained agent, on every subcommand that reaches a host.
//  - A session is written to only from the host that opened it. A record of the other host is never looked up, swept or
//    typed into: its ids mean nothing here, and an id this host does not know reads as gone.
//  - Past the six-pane cap, open a sidebar-listed TAB rather than refusing. Ten routers is more
//    sessions than a column can hold, and six unreadable panes serve nobody.
//
// TWO HOSTS, ONE CODE PATH (issue #111). Every host call goes through the seam (dctr-host.mjs). What differs on
// herdr-core: the recorder is the pane's own program, so it is already running when the create call answers and that call
// is never retried; its own command prints the label, since no pane rename exists, and empties the transcript; and text
// goes in through dctr-attach.py.
//
// WHAT IS NOT MECHANICALLY CLOSED, stated because a silent gap is worse than a known one.
//
// The unread-output rule is NARROWED, not absolute. The size is read, the recorder is checked, the
// size is read again — and then the send goes out. Output can still land in the gap between that
// second read and the keystroke arriving, and no lock closes it, because the device is not in the
// transaction. What the rule guarantees is that nothing already on screen when you asked, and
// nothing that arrived while this launcher was looking, is written over unseen. It does not
// guarantee the device was silent at the instant of the send.
//
// On herdr-core the recorder check trails a disconnect by a moment, because `hc get`'s foreground is not live: text typed
// in that moment can land in the local shell. Enter is checked separately, by its own call, so it can still be refused.
//
// And: if the
// user is part-way through typing a command and the agent reads those bytes and misjudges them as
// finished output, a later `type` appends to that line and Enter executes the join. No lock fixes
// that; it is a judgement failure. The reliable signal is the user running `own user`. Refusing to
// write while the pane is focused was considered and rejected — the user glances at these panes
// constantly while working in another, so it would block continuously.
//
// NEVER enable input logging: macOS `-k` and util-linux `-I`/`-B` record keystrokes, which would
// put the user's passwords on disk. Verified on hardware: a QFX login recorded "Password: " then
// zero characters. Gating that logging on terminal echo was proposed and refuted — ssh clears ECHO
// locally for the whole session, so the gate would log nothing and guarantee nothing.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIDE_CAP, isSideSeat, seatPlacement, shq, placeSkipReason, splitTarget, staleSideSeats, shellSessionId } from './dctr-lib.mjs'
import { gateAnswer, hostFor, sameHost } from './dctr-host.mjs'
import { acquireLock, breakIfOrphaned, dropGoneGates, interactivePanes, isPaneNotFound, liveSeats, panesDir, releaseLock, sideOccupants, withPlacementLock, writeMarker } from './dctr-state.mjs'

const SETTLE_MS = 400          // one beat after a write, so the echo has somewhere to land
const RECORDER_WAIT_MS = 5000
const LOCK_WAIT_MS = 5000
// Not "longer than any operation": one `open` makes many host calls, each bounded at
// HERDR_TIMEOUT_MS, so a live holder can far outlast this. It is only the age past which a lock is
// worth EXAMINING; whether it is broken is decided by whether its holder is running.
const LOCK_STALE_MS = 30000
// One derivation, shared with the seat and gate hooks that read these markers. Spelling the path
// out again here made the writer and the readers agree only by accident.
const PANES_DIR = panesDir()
// Transcripts live BESIDE the marker directory, never inside it. A default tee under PANES_DIR put
// its `<tee>.state.json` sibling among the markers, where both readers counted it as a second pane:
// three opens read as six, and the cap tripped at three. The readers also reject `.state.json` now,
// so an explicitly supplied `.log` path inside PANES_DIR cannot reproduce it either. A tee named
// `*.json` in there still would — and now that the readers throw rather than skip, the consequence
// is a refusal that names the file, not a silent double count. Do not put a transcript there.
const TEES_DIR = path.join(process.env.TMPDIR || os.tmpdir(), 'dctr-pane-logs')
const CONTROL = /[\x00-\x1f\x7f]/

const usage = () => {
  console.error('usage: dctr-pane.mjs open <label> [<tee>] <connect> | read <tee> | profile <tee> <notes> | type <tee> <text> | enter <tee> | own <tee> agent|user')
  process.exit(1)
}
/** Throws rather than exiting. process.exit skips `finally`, so a refusal raised inside the tee
 *  lock would leak the lock directory and block the next operation for the whole staleness window.
 *  This repo's own withPlacementLock carries that warning; copying the pattern without it cost a
 *  stuck lock on the first driven test. The top-level handler prints and sets the exit code. */
class Refusal extends Error {}
const die = (msg) => { throw new Refusal(msg) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The host seam (dctr-host.mjs) this session may place and type through, or a refusal that has called neither host. */
function usableHost() {
  if (process.env.DCTR_VIEW_REQUEST_DIR) die('contained session: a pane is a host process, refusing')
  const why = placeSkipReason(process.env)
  if (why) die(`${why}; refusing (an interactive pane nobody can watch has no purpose)`)
  return hostFor(process.env)
}

/** mkdir as the mutex, keyed on the tee. Same protocol as withPlacementLock — both call the shared
 *  acquire/release/break primitives in dctr-state.mjs — and it differs only in how it waits, because
 *  this one is async and the hooks are not. It used to be a second implementation of the same idea,
 *  and the two copies drifted: each defect found in one had to be found again in the other. */
const withTeeLock = (tee, fn) => withDirLock(`${tee}.lock`, fn)

async function withDirLock(lock, fn) {
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    // acquireLock throws rather than entering when it cannot publish its pid: a holder no waiter
    // can identify looks exactly like an orphan, and is then stolen from mid-operation.
    let held
    try { held = acquireLock(lock) } catch (e) { die(e.message) }
    if (held) { try { return await fn() } finally { releaseLock(lock) } }
    // Age alone is not evidence the holder is dead. An operation makes several bounded host calls
    // and sleeps between them, so a live one can outlast LOCK_STALE_MS; breaking its lock on age
    // lets two operations write the same session. breakIfOrphaned reads the holder once, judges that
    // holder, and condemns that same holder, so the lock it renames away is the lock it judged.
    breakIfOrphaned(lock, LOCK_STALE_MS)
    if (Date.now() > deadline) die(`another dctr-pane operation holds ${path.basename(lock)}; not writing`)
    await sleep(50)
  }
}

const statePath = (tee) => `${tee}.state.json`

/** Validated on every read. An unvalidated state file with a missing, non-numeric or oversized
 *  cursor passed the unread check and let a write through. */
function readState(tee) {
  let raw
  try { raw = fs.readFileSync(statePath(tee), 'utf8') }
  catch (e) {
    if (e.code === 'ENOENT') die(`no session is recorded at ${tee} (${path.basename(statePath(tee))} is not there). Check the path — do NOT open a second pane on a device that may already have one.`)
    die(`cannot read the session record for ${path.basename(tee)} (${e.message})`)
  }
  const s = JSON.parse(raw)
  if (!s || typeof s !== 'object') die('state file is not an object')
  if (!['agent', 'user'].includes(s.owner)) die(`state has no usable owner (${JSON.stringify(s.owner)})`)
  if (typeof s.paneId !== 'string' || !s.paneId) die('state has no pane id')
  // A record that names a host is herdr-core's, where a write goes to the terminal and the recorder is told by its line.
  if (s.host && ![s.terminal, s.recorder].every((v) => typeof v === 'string' && v)) die('state names no terminal or no recorder; close that pane and open the session again')
  if (!Number.isInteger(s.cursor) || s.cursor < 0) die(`state cursor is not a byte offset (${JSON.stringify(s.cursor)})`)
  let end
  try { end = size(tee) } catch (e) { die(`cannot observe the session (${e.message})`) }
  if (s.cursor > end) die(`state cursor ${s.cursor} is past the end of the tee (${end}); this transcript was truncated or replaced`)
  return s
}
function writeState(tee, s) {
  fs.writeFileSync(statePath(tee), JSON.stringify(s, null, 2))
  fs.chmodSync(statePath(tee), 0o600)   // not best-effort: the session record must not be readable
}

/** Throws rather than returning 0: a missing tee is a failed observation, not an empty one. */
const size = (f) => fs.statSync(f).size

/** Raw bytes from `from` to `to`. NOT interpreted. Backslashes are escaped FIRST so a real ESC and
 *  the literal four characters `\x1b` in device output stay distinguishable, and CR and tab are
 *  escaped too — printing a raw CR lets the receiving terminal overwrite the line it is on. LF is
 *  left alone because it carries the line structure the reader needs. */
function region(tee, from, to) {
  if (to <= from) return ''
  const fd = fs.openSync(tee, 'r')
  try {
    const buf = Buffer.alloc(to - from)
    const n = fs.readSync(fd, buf, 0, buf.length, from)
    return buf.subarray(0, n).toString('utf8')
      .replace(/\\/g, '\\\\')
      .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
  } finally { fs.closeSync(fd) }
}

const markerFor = (paneId) => path.join(PANES_DIR, `${paneId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`)
/** Q8's default transcript path. Keyed by the sanitised label, so two sessions share a tee only
 *  when their labels sanitise to the same string. */
const defaultTee = (label) => path.join(TEES_DIR, `${String(label).replace(/[^A-Za-z0-9_-]/g, '_') || 'pane'}.log`)
/** Exposed so the selftest can assert the two directories are actually distinct, rather than
 *  restating the paths and passing while the launcher uses different ones. */
export const markerDir = () => PANES_DIR
export const defaultTeeDir = () => TEES_DIR
/**
 * MAY THIS TRANSCRIPT BE REPLACED? One decision over the whole table, rather than a prologue of
 * predicates nobody had enumerated. Three records can bear on it — the state file, any marker naming
 * this tee, and the transcript's own bytes — crossed with the three answers herdr can give about a
 * pane: live, gone, or unknowable.
 *
 * Two rules fall out of the table and neither survived being written one branch at a time:
 *  - A record that answered "gone" is STILL A RECORD. The branch for "nothing recorded this
 *    transcript" used to fire after every record had answered gone, telling the user nothing had
 *    recorded it while a marker just had — and the marker had already been deleted saying so.
 *  - The decision READS records and never writes them. Deleting a stale marker inside the decision
 *    that reads it raced the sweep that removes stale markers under the placement lock. Stale
 *    records are returned here and removed there.
 *
 * `ask` is injected so every cell of the table is drivable without a herdr, a pane or a subprocess.
 */
export function openDecision({ stateRecord, markerPanes, teeBytes, ask }) {
  if (stateRecord === 'invalid') return { proceed: false, why: 'has a state file that records no pane; move it aside yourself if that session is really over', stale: [] }
  const named = [...(stateRecord?.paneId ? [stateRecord.paneId] : []), ...markerPanes]
  const answers = named.map((id) => [id, ask(id)])
  const live = answers.find(([, a]) => a === 'live')
  if (live) return { proceed: false, why: `is already recorded by live pane ${live[0]}; close that pane or choose another tee path`, stale: [] }
  const unknown = answers.find(([, a]) => a === 'unknowable')
  if (unknown) return { proceed: false, why: `records pane ${unknown[0]} and that pane could not be looked up; not replacing a transcript that may still be live`, stale: [] }
  // Every record answered "gone". That IS an answer, and the records that gave it are stale.
  if (named.length) return { proceed: true, why: null, stale: named }
  if (teeBytes > 0) return { proceed: false, why: 'already holds a transcript and nothing records which pane wrote it, so nothing here can check whether that session is over; move it aside yourself', stale: [] }
  return { proceed: true, why: null, stale: [] }
}

/** What the records say, read and never written. `stateRecord` is null when there is no state file,
 *  the string 'invalid' when there is one that records no usable pane, else the parsed record. */
function readRecords(tee, host) {
  let stateRecord = null
  if (fs.existsSync(statePath(tee))) {
    let prior
    try { prior = JSON.parse(fs.readFileSync(statePath(tee), 'utf8')) } catch { prior = null }
    stateRecord = (prior && typeof prior === 'object' && typeof prior.paneId === 'string' && prior.paneId) ? prior : 'invalid'
  }
  let markers
  try { markers = interactivePanes() } catch (e) { die(`cannot read the interactive pane markers (${e.message}); not opening`) }
  const here = path.resolve(tee)
  const naming = markers.filter((m) => m.tee && path.resolve(m.tee) === here)
  const markerPanes = naming.map((m) => m.paneId)
  // The panes the other host recorded. This one cannot answer for them, so they are never asked about.
  const foreign = [...naming, ...(stateRecord?.paneId ? [stateRecord] : [])].filter((r) => !sameHost(host, r)).map((r) => r.paneId)
  let teeBytes = 0
  try { teeBytes = size(tee) } catch { teeBytes = 0 }
  return { stateRecord, markerPanes, teeBytes, foreign }
}

/** live | gone | unknowable. Only the seam's `exists: false` is an answer of absence: a lookup that threw, and a reply
 *  carrying no pane (which has no focus either), answered nothing. Read as gone, that reply would let `open` TRUNCATE the
 *  user's transcript. */
function askPane(host, paneId) {
  // herdr-lint: a lookup that throws is unknowable, which openDecision refuses on.
  try {
    const pane = host.paneInfo(paneId)
    if (!pane.exists) return 'gone'
    return typeof pane.focused === 'boolean' ? 'live' : 'unknowable'
  } catch { return 'unknowable' }
}

/** Shared preamble for anything that writes. Runs inside the lock. Never returns on a refusal. */
const MIN_PROFILE = 80

function guardWrite(tee, host) {
  const s = readState(tee)
  if (!sameHost(host, s)) die(`this session was opened in ${s.host || 'herdr'} and this shell is in ${host.name}, which cannot reach its pane. Not writing.`)
  if (s.owner !== 'agent') die("the pane is the user's; ask them to hand it over, then `own <tee> agent`")
  if (!s.profile) die('this session has no platform profile. `read` the banner to see what you are on, go find out how that platform pages, cancels and destroys, then record it with `profile <tee> "<what you found>"`.')
  const end = size(tee)
  if (end > s.cursor) die(`${end - s.cursor} bytes of unread output; run \`read\` and judge it before typing`)
  // Narrowed, not closed. The recorder can exit between this check and the send that follows; no transaction spans a
  // process lookup and a keystroke. What this does catch is the common case, proven on real hardware: ssh exited 255, the
  // pane became a local shell, and the write refused.
  try {
    if (!host.recorderAlive(s.paneId, s.terminal, s.recorder)) die('the recorder has exited: the connection is closed and this pane is now a local shell. Not writing.')
  } catch (e) {
    if (e instanceof Refusal) throw e
    if (isPaneNotFound(e)) die(`pane ${s.paneId} no longer exists: that session is over. Not writing.`)
    die(`cannot read the pane's processes (${e.message}); not writing`)
  }
  // The recorder check asks the host and takes real time, so bytes can land DURING it. An earlier
  // repair made those bytes appear in the readback afterwards, which fixed the accounting and left
  // the rule itself unenforced: the write still went out over output nobody had judged. That is the
  // pager case. Re-read once here and refuse, rather than send and explain afterwards.
  const settled = size(tee)
  if (settled > end) die(`${settled - end} bytes arrived while checking the session; run \`read\` and judge them before typing`)
  // ONE snapshot from here on. A caller that re-reads size() would omit bytes from its readback and
  // still advance the cursor past them, which is the defect this file's header records as fixed.
  s.seen = end
  return s
}

async function open(label, tee, connect) {
  const host = usableHost()
  // The session id, so this pane is placed under the SAME lock and counted in the SAME column as
  // seats and gate panes. ONE variable, the one the gate launcher already reads: accepting a second
  // name lets the launcher lock one session while the gate locks another, and a lock that is not the
  // same lock is not a lock at all. Without it the cap ran one way only: seats counted interactive panes and
  // interactive opens could not see seats, so a pane could be split on top of a full column. It is
  // read from the environment rather than passed, and its absence refuses rather than defaulting,
  // because placing blind is the thing the cap exists to stop. Panes still survive SessionEnd:
  // that comes from where their markers live, not from this launcher being ignorant of the session.
  // The one resolver the gate launcher reads, shellSessionId: Claude Code's id, else Codex's CODEX_SESSION_ID (E10-D12).
  const sessionId = shellSessionId(process.env)
  if (!sessionId) die('no CLAUDE_CODE_SESSION_ID (nor a Codex CODEX_SESSION_ID); without it this pane cannot be counted against the seat and gate cap, and splitting blind is what that cap prevents')
  const me = host.self()
  if (!me?.pane) die(host.noSelf)
  const sessionPane = me.pane
  const untypable = host.cannotType()
  if (untypable) die(untypable)

  // Refuse to touch a transcript whose pane may still be alive — ONE decision over the whole table,
  // and it writes nothing. Whatever it finds stale is handed to the sweep that runs under the
  // placement lock below, where every other marker removal already happens.
  const { foreign, ...records } = readRecords(tee, host)
  const decision = openDecision({ ...records, ask: (id) => (foreign.includes(id) ? 'unknowable' : askPane(host, id)) })
  if (!decision.proceed) die(`${path.basename(tee)} ${decision.why}${foreign.length ? ` (the other terminal host opened ${foreign.join(', ')})` : ''}`)

  fs.mkdirSync(PANES_DIR, { recursive: true })
  fs.mkdirSync(path.dirname(path.resolve(tee)), { recursive: true })

  // READ, DECIDE AND SPLIT ALL INSIDE ONE LOCK — the session's own placement lock, the one seats and
  // gate panes take. The layout used to be read OUTSIDE the lock and filtered against inside it, so
  // two opens could snapshot the same five panes, and the second would exclude the first's new pane
  // as "not in the layout" and split a seventh. A snapshot taken before the lock is not evidence of
  // anything by the time the lock is held.
  //
  // `launched` is whether the recorder may be running: herdr-core runs it from the moment its pane exists, and a create
  // call there can fail after its pane exists, so it is set before the call and that call is never retried.
  let paneId, opened = null, launched = false, terminal = null, recorder
  const emptied = host.startsAtCreation ? transcriptStamp(tee) : null
  const command = `printf '%s\\n' ${shq(label)} && : > ${shq(path.resolve(tee))} && chmod 600 ${shq(path.resolve(tee))} && ${recorderLine(path.resolve(tee), connect)}`
  // herdr-lint: creation, not destruction. The split and the tab create are the only reads this try owns; a failure leaves through the catch below, which dies and closes nothing.
  try {
    paneId = withPlacementLock(sessionId, () => {
      const layout = host.layout(me)
      if (!layout?.length) die('cannot observe the pane layout; not splitting blind')

      // Sweep only this workspace's markers: staleSideSeats over every recorded pane would delete
      // live markers belonging to layouts this call cannot see. `layout` describes the SESSION
      // PANE'S TAB, not the workspace, so "absent from the layout" means dead OR in another tab.
      // Confirm each candidate is really gone, and fail closed when the lookup cannot answer.
      let panes
      try { panes = interactivePanes() } catch (e) { die(`cannot read the interactive pane markers (${e.message}); not splitting blind`) }
      // Candidates: side-pane markers the layout no longer carries, PLUS every tab marker in this
      // workspace. staleSideSeats offers only side seats, and an overflow session records a tabId,
      // so nothing ever offered a closed tab's marker and they accumulated for good in a directory
      // every placement reads.
      const mine = panes.filter((p) => host.mine(p, me))
      // Three sources of candidate: side-pane markers the layout no longer carries, every tab marker
      // in this workspace (staleSideSeats offers none, because a tab marker is not a side seat), and
      // whatever the prologue's decision found had answered "gone". The decision does not delete
      // them itself: that raced this sweep and mutated a record in the middle of reading it.
      const staleFromDecision = mine.filter((p) => decision.stale.includes(p.paneId))
      for (const dead of [...staleSideSeats(mine, layout), ...mine.filter((p) => p.tabId), ...staleFromDecision]) {
        // Only a DEFINITE absence may remove a record: a lookup that threw, and a reply carrying no pane, keep it.
        let gone = false
        // herdr-lint: a lookup that throws leaves `gone` false, which keeps the marker.
        try { gone = host.paneInfo(dead.paneId).exists === false } catch { /* kept */ }
        if (gone) try { fs.rmSync(markerFor(dead.paneId), { force: true }) } catch { /* already gone */ }
      }

      // The cap is shared with seats and gates (Q6), counted the same way in both directions: this
      // session's seats plus every interactive pane the layout carries. A null return is "I could
      // not look", which counts as full, never as empty.
      // A gate moved here by another session's SessionEnd is dropped only on a server-wide not-found
      // (B3), and counted by sideOccupants while this layout carries its pane (B2).
      dropGoneGates(() => {}, (g) => gateAnswer(host, g))
      const occupants = sideOccupants(liveSeats(sessionId), layout)
      if (!occupants) die('cannot observe the side column; not splitting blind')

      // Past the cap this OVERFLOWS TO A TAB rather than refusing (Scott's ruling): four routers is
      // four panes, ten routers is more sessions than a column can hold and six tiny panes would be
      // unreadable anyway. A tab is sidebar-listed, still watched, still taken over. It is the same
      // rule a dispatched seat already follows. A tab pane occupies no column slot, and isSideSeat
      // is false for a marker carrying a tabId, so it never counts against the cap afterwards.
      // The pane shell starts where herdr is told to, not where this launcher runs, and the
      // launcher runs in the session cwd.
      let id, tabId = null
      launched = host.startsAtCreation
      if (seatPlacement(occupants, sessionPane) === 'pane') {
        const at = splitTarget(occupants, sessionPane, layout)
        ;({ paneId: id, terminal, recorder } = (at.direction === 'right' ? host.splitRight : host.splitDown)(at.pane, process.cwd(), command, label))
      } else {
        ;({ paneId: id, tabId, terminal, recorder } = host.newTab(me, process.cwd(), command, label))
        console.log(`overflow=tab ${tabId} (${occupants.filter(isSideSeat).length} panes already beside this session, cap ${SIDE_CAP})`)
      }
      opened = id || `in tab ${tabId}`
      if (!id) throw new Error('its tab was made and the pane in it could not be read')
      // The marker goes down before anything else can fail, so an interrupted open leaves a pane
      // that is still findable rather than an orphan nothing records.
      writeMarker(markerFor(id), { paneId: id, tabId, tee: path.resolve(tee), label, pid: process.pid, ...host.tag, ...(terminal ? { terminal } : {}) })
      return id
    })
  } catch (e) {
    // Report what is actually on screen. A split that succeeded and a marker write that then failed
    // used to be reported as "nothing was opened", so the pane existed, nothing recorded it, and the
    // operator was invited to retry and make a second one.
    if (opened) die(`pane ${opened} was created and then the open failed (${e.message}); it is on screen, nothing records it, and this launcher may not close it — close it yourself. ${launched ? 'Its recorder may be running, and the transcript is its own from here.' : 'The transcript was not touched.'}`)
    if (e instanceof Refusal) throw e
    // Every refusal above is made before the create call, so a throw with `launched` set is that call failing.
    if (launched) die(`the create call failed (${e.message}) and its pane may exist all the same, connecting and recording into the transcript with nothing recording it. It was not tried again: look for a pane whose first line is ${JSON.stringify(label)}, close it if it is there, and only then open again.`)
    die(`placement failed (${e.message}); nothing was opened and no transcript was touched`)
  }

  // ONLY NOW is the transcript touched — after the split has actually succeeded. On herdr-core the pane's own command
  // has the emptying to do, before its recorder starts: done here it would erase what that recorder wrote. Truncating before
  // it meant a failed split emptied the previous session's transcript and opened nothing in its
  // place. `mode:` on writeFileSync applies only to a file it creates, so a supplied 0644 path
  // would keep 0644 and record the session world-readable. chmod unconditionally.
  if (!launched) {
    fs.writeFileSync(tee, '')
    fs.chmodSync(tee, 0o600)
  }
  console.log(`pane=${paneId}`)
  try { host.renamePane(paneId, label) } catch { /* label only */ }
  host.run(paneId, recorderLine(tee, connect))

  // The pane is the user's the moment it exists. The connect banner, a host-key question and any
  // password prompt all happen inside that window by construction — on two real logins today the
  // first thing on screen was an unknown-host-key prompt, which is not the agent's to answer.
  await sleep(SETTLE_MS * 4)
  if (launched) {
    for (const until = Date.now() + RECORDER_WAIT_MS; transcriptStamp(tee) === emptied && Date.now() < until;) await sleep(50)
    if (transcriptStamp(tee) === emptied) die(`pane ${paneId} is open and its recorder has not started, so there is no session to read; look at the pane, close it, and open again.`)
    // Herdr.app starts a tab's program through a shell and `hc get` names what runs late, so the first write would refuse a
    // live session as exited. Past the bound the state is written all the same: a connection that ended at once shows its error.
    // herdr-lint: a lookup that throws is not yet. Nothing is decided on it but when to stop waiting.
    const named = () => { try { return host.recorderAlive(paneId, terminal, recorder) } catch { return false } }
    for (const until = Date.now() + RECORDER_WAIT_MS; !named() && Date.now() < until;) await sleep(50)
  }
  writeState(tee, { paneId, tee, label, owner: 'user', cursor: 0, marker: markerFor(paneId), ...host.tag, ...(launched ? { terminal, recorder } : {}) })
  console.log(`owner=user tee=${tee}`)
  console.log('--- session so far (judge it yourself; nothing here was parsed) ---')
  console.log(region(tee, 0, size(tee)))
}

/** Changes when the transcript is emptied, so `open` never shows the last session's bytes as this one's. */
const transcriptStamp = (tee) => { try { const st = fs.statSync(tee, { bigint: true }); return `${st.ino} ${st.mtimeNs}` } catch { return 'absent' } }

/** script(1) is not portable: util-linux takes the command via -c with the file LAST, macOS takes
 *  the file FIRST and the command positionally and has no -c (apple-oss-distributions shell_cmds
 *  script.1). A branch that swaps only the flags builds a broken command line. NOT RUN ON macOS. */
export const recorderLine = (tee, connect, platform = process.platform) =>
  platform === 'darwin'
    ? `script -q -F ${shq(tee)} bash -c ${shq(connect)}`
    : `script -q -f -c ${shq(connect)} ${shq(tee)}`

/** Everything since the cursor, then the cursor advances — to the SAME offset that was shown.
 *  Reading is how unread output is cleared, which is deliberate: the only way to earn the right to
 *  type is to have looked. Note what this does not prove: that the caller read what it was given. */
function read(tee) {
  const s = readState(tee)
  const end = size(tee)
  const out = region(tee, s.cursor, end)
  const shown = end - s.cursor
  s.cursor = end
  writeState(tee, s)
  console.log(out)
  console.log(`--- read ${shown} new bytes; owner=${s.owner}; cursor=${end}`)
}

/** One write. A failure the host does not say came before anything could arrive is UNKNOWN, and is never sent again here:
 *  the state is left as it was, so whatever it echoed is unread output the next write refuses on. */
function send(verb, write) {
  try { write() } catch (e) {
    die(e.nothingTyped ? `nothing was ${verb}: ${e.message}` : `it may have been ${verb}, and the call failed (${e.message}); \`read\` and look at the pane before trying again`)
  }
}

/** Types text and stops. Enter is a separate call, always, so the echo can be judged first. */
async function type(tee, text) {
  if (CONTROL.test(text)) die('control characters are rejected: a bare CR is Enter, so one write could execute a command you have not judged')
  const host = usableHost()
  const s = guardWrite(tee, host)
  const before = s.seen
  send('typed', () => host.typeText(s.paneId, s.terminal, text))
  await sleep(SETTLE_MS)
  const end = size(tee)
  const echo = region(tee, before, end)
  s.cursor = end
  delete s.seen
  writeState(tee, s)
  console.log(echo)
  console.log(`--- typed ${JSON.stringify(text)}; ENTER NOT SENT. Judge the echo above, then \`enter\`.`)
}

async function enter(tee) {
  const host = usableHost()
  const s = guardWrite(tee, host)
  const before = s.seen
  send('sent', () => host.pressEnter(s.paneId, s.terminal))
  await sleep(SETTLE_MS)
  const end = size(tee)
  const out = region(tee, before, end)
  s.cursor = end
  delete s.seen
  writeState(tee, s)
  console.log(out)
  console.log('--- enter sent. Output may still be arriving; `read` again until you judge it finished.')
}

// Only dispatch when run directly, so the selftest can import the pure pieces without the CLI
// firing on import and exiting.
// fileURLToPath, never `new URL(...).pathname`: that percent-encodes, so on a path containing a
// space the comparison failed, nothing dispatched, and EVERY subcommand exited 0 having done
// nothing — `type` and `enter` included, which reads to the agent as a command sent successfully.
// Both through realpath: Node resolves symlinks in import.meta.url, so a symlinked plugin dir made the same silent
// exit 0 (ORC7-1).
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
const argv = process.argv.slice(2)
const [cmd] = argv
if (isMain) try {
if (cmd === 'open' && argv.length === 3) {
  // Q8: the tee defaults to a file under the temp directory, named for the label, and a path may
  // still be given. NOTHING removes it — not this launcher, not the SessionEnd sweep, which reaches
  // only the session state directory — so transcripts accumulate and a repeated label reuses an
  // earlier session's name. Give the explicit form whenever the transcript matters.
  const tee = defaultTee(argv[1])
  fs.mkdirSync(path.dirname(tee), { recursive: true })
  console.log(`tee=${tee}`)
  await withTeeLock(tee, () => open(argv[1], tee, argv[2]))
} else if (cmd === 'open' && argv.length === 4) {
  // The lock is a sibling of the tee, so `open` on a path in a not-yet-existing directory could
  // never take it: mkdir of the lock failed with ENOENT and the caller was told, wrongly, that
  // another operation held it. The directory `open` would have created is created before the lock.
  const tee = path.resolve(argv[2])
  fs.mkdirSync(path.dirname(tee), { recursive: true })
  await withTeeLock(tee, () => open(argv[1], tee, argv[3]))
} else if (cmd === 'read' && argv.length === 2) {
  const tee = path.resolve(argv[1])
  await withTeeLock(tee, () => read(tee))
} else if (cmd === 'type' && argv.length === 3) {
  const tee = path.resolve(argv[1])
  await withTeeLock(tee, () => type(tee, argv[2]))
} else if (cmd === 'enter' && argv.length === 2) {
  const tee = path.resolve(argv[1])
  await withTeeLock(tee, () => enter(tee))
} else if (cmd === 'profile' && argv.length === 3) {
  const tee = path.resolve(argv[1])
  await withTeeLock(tee, () => {
    // A length floor, and it is honestly only a floor: it stops a one-word answer standing in for
    // the work, and nothing here can tell good research from confident invention. The real check is
    // that this text is recorded and printed, under the user's eye, before anything is typed.
    if (argv[2].trim().length < MIN_PROFILE) die(`a profile of ${argv[2].trim().length} characters is not one; say what the platform is, how it pages, how to cancel, and what is destructive on it`)
    const s = readState(tee)
    s.profile = argv[2].trim()
    writeState(tee, s)
    console.log(`profile recorded for ${s.paneId}:`)
    console.log(s.profile)
  })
} else if (cmd === 'own' && argv.length === 3 && ['agent', 'user'].includes(argv[2])) {
  const tee = path.resolve(argv[1])
  await withTeeLock(tee, () => {
    const s = readState(tee)
    s.owner = argv[2]
    // Deliberately does NOT advance the cursor. Everything the user did while holding the pane
    // stays unread, so the first `type` after a handover refuses until it has been read. That is
    // the only mechanism here that shows the agent what the user actually did.
    writeState(tee, s)
    console.log(`owner=${s.owner}`)
  })
} else usage()
} catch (e) {
  // A Refusal is this launcher declining to act and is reported as such. Anything else is a real
  // fault and keeps its stack, because a swallowed exception here reads exactly like a refusal.
  if (e instanceof Refusal) { console.error(`dctr-pane: ${e.message}`); process.exit(1) }
  throw e
}
