// doctrine — the seat hook's on-disk state and herdr call, shared with dctr-gate.mjs.
//
// The hook (dctr-seat.mjs) and the gate runner (dctr-gate.mjs) both place panes beside one session,
// so both must read the same markers under the same lock: a gate that placed itself without the
// lock would found a second column the next wave never sees. Everything here is I/O; the decisions
// stay pure in dctr-lib.mjs so the selftests can run them with no herdr present.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  PREFIX, parseHerdr, movedGateName, movedGateVerdict, paneToken, pausedLine, standingPauses, pauseStands, pauseMessage, pauseActionAt, autocycleToken,
  autocycleTokenArgs, pauseToastArgs, seatLive, codexTaskName, GATE_ROLE, agentName, nextIndex,
} from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'

const tmpRoot = () => process.env.TMPDIR || os.tmpdir()
export const stateDir = (sessionId) => path.join(tmpRoot(), `${PREFIX}-${sessionId}`)
export const seatsDir = (sessionId) => path.join(stateDir(sessionId), 'seats')

/** Best-effort append to the session's hook.log; never throws. Hook output goes to a stream nobody
 *  reads, so a stand-down or a fallback that fired left no trace the first time it mattered (F14,
 *  2026-08-31). The launcher writes here too, so a gate that stood down is found where a seat is. */
export function hookLog(sessionId, msg, create = true) {
  if (!sessionId) return
  try {
    // `create` false: a process that may outlive its session (the Codex watcher) never re-creates the state dir the
    // session's end removed (R4-N2); it appends only while the dir is there.
    if (create) fs.mkdirSync(stateDir(sessionId), { recursive: true })
    else if (!fs.existsSync(stateDir(sessionId))) return
    fs.appendFileSync(path.join(stateDir(sessionId), 'hook.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* logging must never be the failure */ }
}

/** A hook's stand-down: the reason to the session's hook.log and to stderr, then exit 0, so a skip and a silent
 *  success never look alike. `sessionId` is a function, read at the call, since a hook learns its session id
 *  only once its payload parses. */
export const standDown = (event, name, sessionId) => (why) => {
  hookLog(sessionId(), `${event} ${name} skipped — ${why}`)
  process.stderr.write(`${PREFIX}: ${name} skipped — ${why}\n`)
  process.exit(0)
}

// `timeout` is the Q14 bound made real: without it a stalled herdr holds an operation forever, and
// a caller holding a staleness-breakable lock then has that lock stolen out from under it while it
// is still running. execFileSync kills the child and throws at the bound, so the caller refuses.
export const HERDR_TIMEOUT_MS = 30000
/** How long a placement lock may sit before a provably dead holder loses it. */
export const PLACEMENT_STALE_MS = 10000
// Every herdr call renews the locks this process holds first (renewHeldLocks), because a herdr call
// is the one wait inside a lock section that can run to HERDR_TIMEOUT_MS.
export const herdr = (args) => { renewHeldLocks(); return parseHerdr(execFileSync('herdr', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: HERDR_TIMEOUT_MS })) }
/** A herdr call whose answer is text, not JSON: `pane read` (the Codex typer's one screen read, Q6). Throws as herdr() does. */
export const herdrText = (args) => execFileSync('herdr', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: HERDR_TIMEOUT_MS })

/** herdr answers a pane that does not exist with **exit 1 and a structured error code**, not with a
 *  null pane, so `execFileSync` throws and every caller that read a throw as "I could not look"
 *  could never conclude "it is gone". That made `alive = false` unreachable: after the user closed a
 *  pane — the documented lifecycle — its transcript could never be reopened, and the marker that
 *  said so was never swept either. This is the same distinction the file readers already make
 *  between ENOENT and every other errno: an answer is not a failed observation. */
function herdrErrorCode(e) {
  // Parse, do not grep. A substring hunt across three concatenated streams calls a TRANSPORT failure
  // an answer whenever the string appears anywhere in it — nested under another error's cause, or
  // echoed back inside the command line Node puts in the message. These predicates now delete and
  // truncate things at several sites, so this reads the TOP-LEVEL code or it says nothing.
  for (const stream of [e?.stderr, e?.stdout]) {
    const text = String(stream ?? '')
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('{')) continue
      try { const code = JSON.parse(t)?.error?.code; if (code) return code } catch { /* not this line */ }
    }
  }
  return null
}

export const isPaneNotFound = (e) => herdrErrorCode(e) === 'pane_not_found'

/** The SAME distinction for tabs, and it needs its own predicate because herdr answers a missing tab
 *  with `tab_not_found`, a DIFFERENT code. Widening the pane predicate to cover both would make a
 *  transport failure on a pane look like an answer whenever the tab code appeared in it, and the
 *  whole point of reading the top-level code is that the two are not interchangeable. Confirmed by
 *  asking the tool: `herdr tab close <gone>` answers `{"error":{"code":"tab_not_found",...}}`. */
export const isTabNotFound = (e) => herdrErrorCode(e) === 'tab_not_found'

/** One marker, or a throw that NAMES IT. These directories are shared and never fully swept, and a
 *  single unparseable file stops every placement on the host — an `open` cannot even sweep it,
 *  because the sweep runs after the parse. The path is the whole of what makes that recoverable:
 *  without it the operator is told a refusal and given nothing to act on. */
function readMarker(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (e) { throw new Error(`${file}: ${e.message}`) }
}

/** Write a marker so that it can never be read half-written. An interrupted direct write leaves
 *  malformed JSON in a shared directory, and after the readers were made strict that one file
 *  refuses every placement in every session until a human removes it. Rename is atomic: a reader
 *  sees the old file or the new one, never a partial. */
export function writeMarker(file, record) {
  const tmp = `${file}.tmp.${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(record))
  fs.renameSync(tmp, file)
}

/** Reserve a marker name exclusively, without ever publishing an empty file. `wx` creates and then
 *  writes, and a hook killed between the two leaves a zero-byte marker that the strict readers
 *  reject exactly like a truncated one — which then stands down every later seat in the session.
 *  link(2) still fails EEXIST when the name is taken, so exclusivity is unchanged. */
export function reserveMarker(file) {
  const tmp = `${file}.tmp.${process.pid}`
  fs.writeFileSync(tmp, '{}')
  try { fs.linkSync(tmp, file) } finally { try { fs.rmSync(tmp, { force: true }) } catch { /* gone */ } }
}

/** The readable seats, and the markers that could not be read, kept apart. `liveSeats` throws for
 *  anything that COUNTS — an unknown count must never become a small one — but a cleanup path needs
 *  the opposite: one unreadable marker must not abandon every healthy seat's pane and renderer to
 *  run forever. Preserving the record that cannot be read does not require abandoning the ones that
 *  can. Callers that tear things down use this; callers that decide placement use liveSeats. */
export function liveSeatsPartial(sessionId) {
  let names
  try { names = fs.readdirSync(seatsDir(sessionId)) }
  catch (e) { if (e.code === 'ENOENT') return { seats: [], unreadable: [] } ; throw e }
  const seats = [], unreadable = []
  for (const f of names.filter((n) => n.endsWith('.json'))) {
    const file = path.join(seatsDir(sessionId), f)
    try { seats.push(JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { unreadable.push(file) }
  }
  return { seats, unreadable }
}

/** Every seat this session has live, newest last. A directory that is not there yet really is no
 *  seats. A marker that cannot be read or parsed is **not** zero seats and not one fewer: it makes
 *  the count unknown, so it throws. Swallowing it turned one unreadable file into spare capacity in
 *  a cap, which is how a pane gets split onto a full column. Callers that must not fail — the stop
 *  and SessionEnd sweeps — catch it and say so. */
export function liveSeats(sessionId) {
  let names
  try { names = fs.readdirSync(seatsDir(sessionId)) }
  catch (e) { if (e.code === 'ENOENT') return []; throw e }
  return names.filter((f) => f.endsWith('.json'))
    .map((f) => readMarker(path.join(seatsDir(sessionId), f)))
}

/**
 * Interactive session panes opened by dctr-pane.mjs. Their markers live OUTSIDE the session state
 * directory on purpose, because those panes must survive SessionEnd, and the sweep there iterates
 * liveSeats() — so they are deliberately NOT returned by it and nothing in the stop or SessionEnd
 * path can reach them. They are read here for one reason: a pane the user is watching still
 * occupies a slot in the side column, so seat and gate PLACEMENT must count and stack around it.
 * Counting and destroying need different readers; sharing one reader is what would put these panes
 * back under the sweep they were moved out of.
 */
/** The one derivation of the interactive marker directory. The launcher writes here and the seat
 *  and gate hooks read here, so a second expression for the same path is a fork that agrees only
 *  by accident: it used to be spelled out again as a literal in dctr-pane.mjs. */
export const panesDir = () => path.join(tmpRoot(), `${PREFIX}-panes`)

/**
 * The unowned gate directory. A gate still running when its session ends has its marker MOVED here
 * by SessionEnd (E8-R13), because its pane must outlive the session and still count against the cap
 * of whichever session is placing beside it now. Its own name, not panesDir: an interactive pane
 * marker and a moved gate marker are judged by different rules, and one directory would make every
 * reader of either tell them apart by shape. `root` exists for the gate's own completion, which runs
 * in a pane shell with a fresh environment and so derives the root from its marker path instead.
 */
export const gatesDir = (root = tmpRoot()) => path.join(root, `${PREFIX}-gates`)

/** Where SessionEnd moves the marker at `marker`, derived from that path alone: the gate's `--run`
 *  process runs in a pane whose TMPDIR need not match the session's, and the marker path is the one
 *  thing both share. Null for a path that is not `<root>/dctr-<session>/seats/<name>.json`. */
export function movedGatePath(marker) {
  const seats = path.dirname(marker), state = path.dirname(seats), base = path.basename(state)
  if (path.basename(seats) !== 'seats' || !base.startsWith(`${PREFIX}-`)) return null
  return path.join(gatesDir(path.dirname(state)), movedGateName(base.slice(PREFIX.length + 1), path.basename(marker, '.json')))
}

/**
 * A detached gate's marker (E10H-B4): the claude -p red team the Codex reference launches runs with no pane, and
 * nothing else shows the Stop hook it is running (liveWork reads markers). So it gets a gate marker with no pane,
 * `detached: true`, in the session's seats directory, under the next free gate name; seatLive keeps it live until
 * `<file>.result` exists, and the launcher's --run drops it when it writes that file. It holds no column slot
 * (sideOccupants) and is never closed or moved by a sweep (sweepAction). Returns the marker's path, or null when none
 * could be written, which leaves the gate running as it always has, unseen.
 */
export function writeDetachedGate(sessionId, file, label) {
  try {
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })
    const taken = liveSeatsPartial(sessionId).seats.map((s) => s.agent).concat(movedGateNames(sessionId))
    for (let n = nextIndex(GATE_ROLE, taken); n; n = nextIndex(GATE_ROLE, taken)) {
      const agent = agentName(GATE_ROLE, n), marker = path.join(seatsDir(sessionId), `${agent}.json`)
      try { reserveMarker(marker) } catch (e) { if (e.code !== 'EEXIST') throw e; taken.push(agent); continue }
      writeMarker(marker, { agent, role: GATE_ROLE, n, tabId: '', paneId: '', file, label, detached: true })
      return marker
    }
  } catch { /* no marker: the gate still runs */ }
  return null
}

/** The gate names this session id holds in the unowned directory, readable or not: a name is taken
 *  by the file, whatever is in it. A directory not there yet holds none. */
export function movedGateNames(sessionId) {
  let names
  try { names = fs.readdirSync(gatesDir()) }
  catch (e) { if (e.code === 'ENOENT') return []; throw e }
  const prefix = `${sessionId}.`
  return names.filter((f) => f.startsWith(prefix) && f.endsWith('.json')).map((f) => f.slice(prefix.length, -'.json'.length))
}

/** Why sideOccupants could not observe the column, naming the file where a file is the cause.
 *  sideOccupants answers null and throws the reason away, and a log line naming no file is one the
 *  operator cannot act on. Read again only on the failure. */
export function sideColumnReason() {
  try { interactivePanes() } catch (e) { return e.message }
  try {
    const { unreadable } = movedGates()
    if (unreadable.length) return `moved gate marker(s) could not be read: ${unreadable.join(', ')}`
  } catch (e) { return `moved gates could not be listed (${e.message})` }
  return 'the layout could not be read'
}

/** The moved gate markers, each carrying its file name as `moved`, and the ones that could not be
 *  read, kept apart as liveSeatsPartial keeps them. A directory not there yet is none of either. */
export function movedGates() {
  let names
  try { names = fs.readdirSync(gatesDir()) }
  catch (e) { if (e.code === 'ENOENT') return { gates: [], unreadable: [] }; throw e }
  const gates = [], unreadable = []
  for (const f of names.filter((n) => n.endsWith('.json'))) {
    const file = path.join(gatesDir(), f)
    try { gates.push({ ...JSON.parse(fs.readFileSync(file, 'utf8')), moved: f }) } catch { unreadable.push(file) }
  }
  return { gates, unreadable }
}

/**
 * Drop every moved gate marker whose pane or tab a SERVER-WIDE lookup answers not-found (B3). Never
 * judged from a layout: the layout is the placing session's tab, and a moved gate can be alive in
 * another tab, or be a tab gate whose root pane no layout carries (F3). The lookups run outside the
 * directory lock, each bounded at HERDR_TIMEOUT_MS; the drops run inside it and only for a file that
 * still names the pane or tab that was judged, so a SessionEnd moving a marker in meanwhile cannot
 * have its record taken. Best effort: whatever this cannot do leaves the marker, which is the safe
 * direction, and it never throws into a placement.
 */
export function dropGoneGates(log = () => {}) {
  let found
  try { found = movedGates() } catch (e) { log(`moved gates could not be listed (${e.message}); dropping none`); return }
  const gone = found.gates.filter((g) => {
    let answer = 'failed'
    try { herdr(g.tabId ? ['tab', 'get', g.tabId] : ['pane', 'get', g.paneId]); answer = 'found' }
    catch (e) { if (g.tabId ? isTabNotFound(e) : isPaneNotFound(e)) answer = 'not_found' }
    return movedGateVerdict(answer) === 'drop'
  })
  if (!gone.length) return
  try {
    withDirLock(gatesDir(), () => {
      for (const g of gone) {
        const file = path.join(gatesDir(), g.moved)
        let current = null
        try { current = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
        if (current.paneId !== g.paneId || current.tabId !== g.tabId) continue
        fs.rmSync(file, { force: true })
        log(`dropped moved gate ${g.moved}: ${g.tabId || g.paneId} is gone`)
      }
    })
  } catch (e) { log(`moved gates not dropped (${e.message}); they stay`) }
}

export function interactivePanes() {
  let names
  // A directory that does not exist yet really is zero panes. Any other failure is "I could not
  // look", and returning [] for it told placement the column was empty when six panes were in it.
  try { names = fs.readdirSync(panesDir()) }
  catch (e) { if (e.code === 'ENOENT') return []; throw e }
  // `<tee>.state.json` is a session record, not a pane marker. When a transcript sat in this
  // directory both were read and every pane counted twice, so three panes read as six and the
  // cap tripped at three. Transcripts have moved out; this keeps the reader correct anyway.
  // A marker that cannot be read or parsed throws for the same reason liveSeats does: dropping one
  // silently makes six panes count as five. A marker that parses but records no pane is not a pane.
  return names.filter((f) => f.endsWith('.json') && !f.endsWith('.state.json'))
    .map((f) => readMarker(path.join(panesDir(), f)))
    .filter((m) => m && typeof m.paneId === 'string')
}

/**
 * The occupants of this session's side column: its seats plus any interactive panes, both narrowed
 * to what the layout actually carries. Returns **null** for "I could not look", which every caller
 * must treat as a full column rather than an empty one — an unreadable marker directory and a
 * failed layout read both used to count as zero and permit another split.
 */
export function sideOccupants(seats, layout) {
  if (!layout) return null
  let panes
  try { panes = interactivePanes() } catch { return null }
  // BOTH are narrowed, which is what this said and did not do: seats were concatenated whole, so a
  // seat marker the layout no longer carries still counted against the cap and could be handed to
  // splitArgs as a split target in another tab.
  //
  // A TAB seat is dropped here too, and that is correct but easy to misread: a tab seat records its
  // TAB'S ROOT paneId, which this layout never holds. It occupies no column slot, so no placement
  // decision changes. What this returns is THE COLUMN'S OCCUPANTS, not the seat roster, and no
  // caller may read it as one.
  // A gate moved here by another session's SessionEnd occupies this column when its pane is in this
  // layout (B2), exactly as an interactive pane does. One that cannot be read makes the count unknown.
  let moved
  try { moved = movedGates() } catch { return null }
  if (moved.unreadable.length) return null
  // A detached gate (writeDetachedGate) has no pane and holds no slot; a marker still being placed has none yet and does.
  const inLayout = (m) => !m.detached && (!m.paneId || layout.some((l) => l.pane_id === m.paneId))
  return seats.filter(inLayout).concat(panes.filter(inLayout), moved.gates.filter(inLayout))
}

// Placement is a read-decide-split sequence, and doctrine dispatches waves: six SubagentStarts in
// one millisecond is the proven load. Unserialized, every one of them sees zero side seats and
// founds its own right-hand column. The lock makes marker state and pane geometry move together;
// a holder that died is stolen after 10s (60s when its pid cannot be judged: none published, or one
// from another pid namespace) so one crashed hook cannot blind every later seat.
// ONE LOCK PROTOCOL, used by both loops below and by dctr-pane.mjs. It was written twice, and the
// copies drifted until each carried defects the other did not, so the protocol lives here and the
// loops differ only in how they wait. A holder is identified by the pid it publishes AND the pid
// namespace that pid belongs to, and every step is expressed against that pair rather than against
// the pathname, which a competitor can take. The namespace is there because a pid means something
// only inside the namespace that issued it: Codex runs a model's commands in a sandbox with its own,
// where the launcher is pid 2, and on the host pid 2 is kthreadd and always alive. Two sandboxes can
// each hand out the same pid, so a pid alone cannot say whose lock it is either.

/** The fields of a `/proc/<pid>/stat` line from the state on (`[0]` is field 3, so field n is
 *  `[n - 3]`), split after the LAST `)`, because the command name before it may hold spaces and
 *  parentheses of its own. */
export const statFields = (text) => text.slice(text.lastIndexOf(')') + 2).split(' ')

/** This process's pid namespace, unique over time: the kernel's name for it (`pid:[4026531836]`) and
 *  the start time of the namespace's own pid 1 (field 22 of /proc/1/stat, clock ticks since boot),
 *  as `pid:[4026531836]@21`. The link alone is not unique: the kernel reuses a freed namespace's
 *  inode number, and every Codex sandbox runs its command as pid 2, so a later sandbox landing in a
 *  reused `pid:[N]` read a dead sandbox's lock as its own pid 2, alive forever.
 *  Where that start time cannot be read as this namespace's own (a /proc mounted for another
 *  namespace, whose `self` is not this pid, or a pid 1 it hides), the identity is the link and a
 *  random token, which no other process can match: every judge then takes the pid-less window, which
 *  renewal (renewHeldLocks) makes safe for a live holder. Never the link alone, which is the reuse
 *  defect. Null where there is no /proc at all, as on macOS, where every holder and judge agree on
 *  null and nothing changes. Read once: a process never leaves its pid namespace. */
let pidNs
export const ownPidNs = () => (pidNs === undefined ? (pidNs = readPidNs()) : pidNs)
function readPidNs() {
  let link
  try { link = fs.readlinkSync('/proc/self/ns/pid') } catch { return null }
  try {
    const start = fs.readlinkSync('/proc/self') === String(process.pid) ? statFields(fs.readFileSync('/proc/1/stat', 'utf8'))[19] : ''
    if (/^\d+$/.test(start)) return `${link}@${start}`
  } catch { /* not readable as this namespace's own */ }
  return `${link}@unknown:${crypto.randomUUID()}`
}

/** One published file of a lock: a string, `null` when there is provably no such file, and
 *  `undefined` when it is there and could not be read. Collapsing those two into one answer is what
 *  let a transient read error condemn a live holder — "I could not look" is not "nobody is there". */
const readLockFile = (lock, name) => {
  try { return fs.readFileSync(path.join(lock, name), 'utf8').trim() }
  catch (e) { return e.code === 'ENOENT' ? null : undefined }
}

/** The holder: `{ pid, ns }`, `null` when there is provably no pid file, and `undefined` when either
 *  file is there and could not be read. `ns` is null when no namespace was published: a holder on a
 *  platform with no /proc, or one running the previous revision of this file, which published a pid
 *  and nothing else. The namespace sits in its OWN file so that previous revision, still running in a
 *  consuming session that has not restarted, reads the pid file exactly as it always did. */
export const lockHolder = (lock) => {
  const pid = readLockFile(lock, 'pid')
  if (pid === null || pid === undefined) return pid
  const ns = readLockFile(lock, 'ns')
  return ns === undefined ? undefined : { pid, ns }
}

/** Whether two holder readings name the same holder: the pid and the namespace together. Two nulls
 *  (no pid file either time) are the same; an unreadable reading is never the same as anything. */
const sameHolder = (a, b) => (a === null && b === null) || (!!a && !!b && a.pid === b.pid && a.ns === b.ns)

/** This process as a holder, in the shape lockHolder reads back. */
const selfHolder = () => ({ pid: String(process.pid), ns: ownPidNs() })

/** The locks this process holds, which renewHeldLocks keeps fresh. acquireLock adds, releaseLock removes. */
const heldLocks = new Set()

/** Renew every lock this process holds: set its mtime to now. A holder that cannot be judged by its
 *  pid (another namespace, or none published) is broken on AGE, past the pid-less window, so a live
 *  one must never age that far. herdr() calls this before every call, and a herdr call is the only
 *  wait in any lock section that can approach the window. A holder that dies stops renewing, and its
 *  lock ages out as before. The renewal does not re-check that the lock is still ours: one stolen from
 *  us is renewed at most until our own section ends, which is already the stolen-lock residual
 *  breakStaleLock states. */
function renewHeldLocks() {
  const now = new Date()
  for (const lock of heldLocks) { try { fs.utimesSync(lock, now, now) } catch { /* gone: releaseLock finds out */ } }
}

/** Take `lock` if it is free. Returns false if someone else holds it. **Throws** if the directory
 *  was taken but the pid could not be published: a holder no waiter can identify is indistinguish-
 *  able from an orphan, and entering the section anyway is exactly how a live holder gets stolen
 *  from. Publishing best-effort and continuing was the defect. */
/** Publish a pid EXCLUSIVELY. `wx` is what ties the write to the directory the caller created: a
 *  plain write lands in whatever now holds that name, so a holder that stalled between its mkdir and
 *  its write could publish into a REPLACEMENT holder's directory, read it back happily, and enter
 *  alongside it. Exported so a fixture can prove that property against a directory that already
 *  carries a pid, rather than asserting around it. */
export function publishPid(lock, pid) {
  fs.writeFileSync(path.join(lock, 'pid'), String(pid), { flag: 'wx' })
}

/** Publish the holder's pid namespace, exclusively, for the reason publishPid is. */
export function publishNs(lock, ns) {
  fs.writeFileSync(path.join(lock, 'ns'), ns, { flag: 'wx' })
}

export function acquireLock(lock) {
  try { fs.mkdirSync(lock, { recursive: false }) } catch { return false }
  const me = selfHolder()
  try {
    // `wx` is what ties the write to the directory we created. Writing by pathname does not: a
    // holder that stalls between the mkdir and the write can have its directory reaped and replaced,
    // then write its pid into the REPLACEMENT, read it back happily, and enter alongside the new
    // holder. O_EXCL makes exactly one of them win the publication and the other refuse.
    // The namespace goes FIRST. A holder killed between the two writes then leaves a namespace and no
    // pid, which is a pid-less lock and is broken on the pid-less window. The other order leaves a
    // pid with no namespace, which reads as the previous revision and is judged by that pid: from
    // the host, a sandboxed pid 2 that is alive forever, the defect the namespace exists to end.
    if (me.ns !== null) publishNs(lock, me.ns)
    publishPid(lock, me.pid)
    if (!sameHolder(lockHolder(lock), me)) throw new Error('pid readback did not match')
    heldLocks.add(lock)
  } catch (e) {
    // Hand it back safely. Simply deleting by pathname is the race a previous repair removed: the
    // empty directory can be reaped and re-acquired between the check and the delete, and a live
    // holder's lock goes with it. And simply LEAVING it was worse than the comment then claimed —
    // a directory we cannot read (a hostile umask, a mode we set ourselves) makes every later pid
    // read EACCES, which breakIfOrphaned correctly refuses to break, forever. So: restore a mode we
    // can read, then hand it to the same verified break every other caller uses, which renames it
    // aside and puts it back if anything has replaced it in the meantime.
    // BOTH, because the failure can be either. A hostile umask makes the directory unsearchable AND
    // the pid file unreadable; chmodding only the directory left the pid unreadable, so the break
    // below saw "I could not look", put the lock back, and nothing could ever acquire or reap it.
    // The namespace file is read beside the pid, so an unreadable one does exactly the same.
    try { fs.chmodSync(lock, 0o700) } catch { /* not ours to fix */ }
    try { fs.chmodSync(path.join(lock, 'pid'), 0o600) } catch { /* it may not exist at all */ }
    try { fs.chmodSync(path.join(lock, 'ns'), 0o600) } catch { /* nor this */ }
    const reaped = breakStaleLock(lock, null)
    throw new Error(`took ${path.basename(lock)} but could not publish a pid (${e.message}); not entering. ${reaped ? 'The empty lock was removed.' : 'Something else holds that name now; it was left alone.'}`)
  }
  return true
}

/** Release only what is still ours. A lock we were stolen from belongs to someone else now, and
 *  removing it by pathname would take their critical section with it. Returns whether we still
 *  held it, so a caller that cares can tell it was stolen mid-section. */
export function releaseLock(lock) {
  heldLocks.delete(lock)
  if (!sameHolder(lockHolder(lock), selfHolder())) return false
  try { fs.rmSync(lock, { recursive: true, force: true }) } catch { /* already released */ }
  return true
}

/** True only for a pid that reads back as a number and is running. EPERM means running under
 *  another user, which is still running. */
function pidAlive(raw) {
  if (raw === null) return false
  const pid = Number(raw)
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

/** Whether `holder` is running, judged by a process whose pid namespace is `ownNs`: true or false
 *  when the holder's namespace is the judge's, and **null** when it is another one, because a pid
 *  issued in another namespace names some other process here or none. A holder that published no
 *  namespace (the previous revision, or a platform with no /proc) is judged by its pid, as it always
 *  was, which is also what makes both-absent count as the same namespace. */
export function holderAlive(holder, ownNs) {
  if (holder.ns !== null && holder.ns !== ownNs) return null
  return pidAlive(holder.pid)
}

/** The whole steal decision, in one place, for both waiting loops. The holder is read ONCE and the
 *  same reading is both judged and condemned, so the lock that is renamed away is the lock that was
 *  judged. Doing this twice, differently, is where two of the lock defects came from. */
/** How much longer a PID-LESS lock must sit before it is treated as an orphan.
 *
 *  A lock carrying a pid from the judge's own namespace can be judged directly: the pid is alive or
 *  it is not. A lock with none cannot be, and there are two ways to get one — a holder that died
 *  between its mkdir and its pid write, and a holder running an old revision of this file, which
 *  published no pid at all. Those are indistinguishable from the outside, and the second one is ALIVE
 *  and inside its section. A lock whose pid belongs to ANOTHER namespace cannot be judged either
 *  (holderAlive), so it takes this window too: it may be a live sandboxed holder or a dead one, and
 *  from here the two look the same.
 *
 *  withPlacementLock's own comment states the rule this branch was breaking: age alone never breaks
 *  a lock, because a holder waiting on a herdr call bounded at HERDR_TIMEOUT_MS can legitimately
 *  outlive any age the loop could pick. PLACEMENT_STALE_MS is 10s against a 30s herdr timeout, so
 *  the pid-less branch was condemning live holders at a third of the time one can honestly take.
 *
 *  What bounds a section against this window is RENEWAL, not the section's length: a holder
 *  refreshes its lock's mtime before every herdr call (renewHeldLocks), so the age a live holder can
 *  reach is the longest gap between two renewals, one herdr call of at most HERDR_TIMEOUT_MS plus the
 *  file work and sub-second settles around it. A section of many calls (a placement reads the layout
 *  and then one pane per marker) is unbounded in total and never ages. Six times the ordinary window
 *  (60s for placement, 180s for the tee lock) clears that 30s gap with room to spare;
 *  dctr-pane.selftest.mjs pins the placement case. The one holder that does not renew is one running
 *  a revision older than renewal, pid-less or foreign, and for it this window is the only bound: a
 *  section of several slow herdr calls can outlast it. The migration is what makes that reachable:
 *  these files ship to three consuming repos, and a session that has not restarted is still running
 *  the old protocol. */
export const PIDLESS_STALE_FACTOR = 6

export function breakIfOrphaned(lock, staleMs, pidlessMs = staleMs * PIDLESS_STALE_FACTOR) {
  const observedAt = Date.now()
  let age = null
  try { age = observedAt - fs.statSync(lock).mtimeMs } catch { return false }   // vanished: nothing to break
  const condemned = lockHolder(lock)
  if (condemned === undefined) return false          // could not look; never break on that
  // The window depends on what the lock told us about itself. Read the holder FIRST so the choice of
  // window is made on evidence rather than on a single figure that has to serve both cases. `alive`
  // is null for a lock that cannot be judged: no pid at all, or a pid from another namespace.
  const alive = condemned === null ? null : holderAlive(condemned, ownPidNs())
  if (age <= (alive === null ? pidlessMs : staleMs)) return false
  if (alive) return false
  // The age and the holder are two reads, and the lock can be broken and re-taken between them: the
  // orphan's age then sits beside a fresh holder, and for one that cannot be judged by its pid the age
  // is the whole verdict. So the break re-checks the age on the directory it actually moved.
  return breakStaleLock(lock, condemned, observedAt - (alive === null ? pidlessMs : staleMs))
}

/** Break a lock we have judged orphaned. The rename is atomic, but the judgement is not tied to it:
 *  between the check and the rename another waiter can break the lock and a third process acquire
 *  the freed name, and an unconditional rename then carries off that live holder's lock. So the
 *  holder that was condemned (`{ pid, ns }` as lockHolder read it, or null for a pid-less lock) is
 *  passed in and verified against whatever actually moved, pid and namespace both, and a mismatch is
 *  put straight back. Residual, stated rather than papered over: if the put-back loses a race for
 *  the name, the moved lock is dropped and its holder finds out at releaseLock. */
export function breakStaleLock(lock, condemned = null, staleBefore = null) {
  const aside = `${lock}.dead.${process.pid}.${Date.now()}`
  try { fs.renameSync(lock, aside) } catch { return false }
  // Compared in EVERY case, null included. Skipping the check when the condemned holder was null meant
  // breaking a genuinely pid-less orphan renamed away whatever had replaced it in the meantime —
  // which is a live holder's lock, taken by the one branch that did no verification at all.
  {
    const moved = lockHolder(aside)
    // `staleBefore`, where the caller judged on age: the moved lock must still be that old. A fresh
    // lock with the condemned identity is a replacement that renewed, or took the name, since the
    // judgement. An age it cannot read is put back, never destroyed.
    let stale = staleBefore === null
    if (!stale) { try { stale = fs.statSync(aside).mtimeMs <= staleBefore } catch { /* could not look */ } }
    if (!sameHolder(moved, condemned) || !stale) {
      try { fs.renameSync(aside, lock); return false } catch { /* the name was retaken; drop what we hold */ }
    }
  }
  try { fs.rmSync(aside, { recursive: true, force: true }) } catch { /* it is out of the way already */ }
  return true
}

/** A synchronous pause. The hook and the launcher have no event loop to yield to while they hold
 *  a lock or poll a file, so the wait blocks the thread. */
export const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** How long a caller waits for the placement lock. A placement gives up quickly because another wave
 *  is behind it. SessionEnd gives up quicker still, because Claude Code gives that hook 1.5s whatever
 *  hooks.json declares, and a wait past the lifetime of the process holding it is not a longer wait,
 *  it is a silent death: it was once 30000 against a hook SIGKILLed at 10s, killed mid-wait and
 *  logging nothing. The LAST chance is therefore the detached `--sweep` child SessionEnd hands the
 *  sweep to on a timeout, and SWEEP_WAIT_MS is the long wait. The inline wait sits well under 1.5s
 *  because node's start-up and the closes after the lock share that budget with it.
 *  `dctr-seat.selftest.mjs` pins both. */
export const PLACEMENT_WAIT_MS = 5000
export const SESSION_END_WAIT_MS = 800
/** The detached `--sweep` child's wait, which SessionEnd hands the sweep to when the lock is not free
 *  inside its budget. It has no hook timeout over it, so it waits past a holder's longest herdr call. */
export const SWEEP_WAIT_MS = 60000
/** The code a lock wait that ran out throws with, so a caller can tell "busy" from every other failure. */
export const LOCK_TIMEOUT = 'ELOCKTIMEOUT'

export const withPlacementLock = (sessionId, fn, waitMs = PLACEMENT_WAIT_MS) => withDirLock(stateDir(sessionId), fn, waitMs)

/** The lock on one directory: the session's state directory for placement, and the unowned gate
 *  directory for moves into it and drops from it (B6). One protocol for both. */
export function withDirLock(dir, fn, waitMs = PLACEMENT_WAIT_MS) {
  const lock = path.join(dir, 'placement.lock')
  // The parent has to exist first. mkdir of a lock inside a directory that is not there yet fails
  // with ENOENT on every pass, so the wait runs to its deadline and blames a holder that never
  // existed. The tee lock carried this same defect and was repaired; this one was not.
  try { fs.mkdirSync(path.dirname(lock), { recursive: true }) } catch { /* acquireLock reports it */ }
  const deadline = Date.now() + waitMs
  for (;;) {
    if (acquireLock(lock)) break
    // Age alone never breaks a lock. A holder waiting on a herdr call bounded at HERDR_TIMEOUT_MS
    // can legitimately outlive any age this loop could pick, and stealing from a live holder puts
    // two placements on the same layout.
    breakIfOrphaned(lock, PLACEMENT_STALE_MS)
    // Checked on every path through the loop: a `continue` used to skip it, which is the recorded
    // spin-forever defect here.
    if (Date.now() > deadline) throw Object.assign(new Error(`lock on ${path.basename(dir)} timed out after ${waitMs}ms`), { code: LOCK_TIMEOUT })
    sleepMs(50)
  }
  // fn stands down by returning a reason, never by exiting: process.exit skips finally and the
  // leaked lock would cost every seat behind it the full staleness window.
  try { return fn() } finally { releaseLock(lock) }
}

/** Where the codex plugin keeps its job records: one directory per workspace, named by the
 *  workspace basename and a hash this reader does not compute, so every directory with the
 *  basename is read. A record another process is mid-write is skipped, not fatal: this is read for
 *  display and the plugin owns the file. Each record carries its own path as `file`. */
export const codexStateDir = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'plugins', 'data', 'codex-openai-codex', 'state')

export function codexJobRecords(cwd) {
  const prefix = `${path.basename(cwd)}-`
  let dirs
  try { dirs = fs.readdirSync(codexStateDir()).filter((d) => d.startsWith(prefix)) } catch { return [] }
  const records = []
  for (const d of dirs) {
    const jobs = path.join(codexStateDir(), d, 'jobs')
    let names
    try { names = fs.readdirSync(jobs).filter((f) => f.endsWith('.json')) } catch { continue }
    for (const f of names) {
      const file = path.join(jobs, f)
      try { records.push({ ...JSON.parse(fs.readFileSync(file, 'utf8')), file }) } catch { /* mid-write or not a record */ }
    }
  }
  return records
}

/** A seat's spawn metadata, read once more after `retryMs` when the first read fails for any
 *  reason: the harness writes it in the same second the hook fires and the order is not promised,
 *  so the file can be absent or half-written, and a half-written file is a parse error rather than
 *  ENOENT. Null stays null. */
export function readMeta(file, retryMs = 200) {
  if (!file) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch { if (attempt) return null }
    sleepMs(retryMs)
  }
  return null
}

/** A Codex seat's spawn metadata in readMeta's shape, `{ description: <task_name> }`, from its rollout's session_meta
 *  (codexTaskName, E10-D8), or null. The same one retry as readMeta, for a first record not flushed yet. */
export function readCodexSeat(file, retryMs = 200) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = null
    try { text = fs.readFileSync(file, 'utf8') } catch { /* not written yet */ }
    const name = codexTaskName(text)
    if (name) return { description: name }
    if (attempt) return null
    sleepMs(retryMs)
  }
  return null
}

/** The index the Codex /clear sweep finds a pane's sessions by: one empty file `<pane token>.<session id>` per Codex
 *  session that placed a pane from that pane, written at placement. The new chat's hook is not told the ending chat's
 *  id, and listing the temp root instead cost 330 ms warm on a host whose /tmp held 400,000 entries, which a live
 *  /clear pushed past the sweep's budget. Claude Code sessions write none: they sweep on SessionEnd. */
export const paneIndexDir = () => path.join(tmpRoot(), `${PREFIX}-by-pane`)
const paneIndexFile = (paneId, sessionId) => path.join(paneIndexDir(), `${paneToken(paneId)}.${sessionId}`)

/** Records that `sessionId` placed a pane from `paneId`. Best effort: a missing entry costs that session its /clear
 *  sweep, and SessionEnd still sweeps it when the process exits. */
export function indexPaneSession(paneId, sessionId) {
  if (!paneId || !sessionId) return
  try { fs.mkdirSync(paneIndexDir(), { recursive: true }); fs.writeFileSync(paneIndexFile(paneId, sessionId), '') } catch { /* see above */ }
}

/** The sessions the index names for `paneId`, each with its readable seat markers: `[{ id, seats }]`. An entry whose
 *  state directory is gone (swept by SessionEnd or by a detached sweep) is removed here and not returned. */
export function sessionsOfPane(paneId) {
  let names
  try { names = fs.readdirSync(paneIndexDir()) } catch { return [] }
  const prefix = `${paneToken(paneId)}.`
  const out = []
  for (const id of names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length))) {
    if (!fs.existsSync(stateDir(id))) { try { fs.rmSync(paneIndexFile(paneId, id), { force: true }) } catch { /* next time */ } continue }
    try { out.push({ id, seats: liveSeatsPartial(id).seats }) } catch { /* unreadable: not a target */ }
  }
  return out
}

// ---------------------------------------------------------------- auto-cycle (E8-D15, E8-D16, E8-D17, E8-D26)

/** Where auto-cycle's working files live (B0): beside dctr-panes and dctr-gates, never under dctr-<session>/,
 *  which SessionEnd empties (F8). The claims, the restore files, the alerted markers, the token values last
 *  published, the persisted Stop facts and each session's turn end all sit here. Created on first use, so no caller makes it. */
export const autoCycleDir = () => {
  const dir = path.join(tmpRoot(), `${PREFIX}-autocycle`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
/** The typer's claim, single use per record state (RB3-1): keyed by the session id and claimKey, the line number of
 *  the record's latest auto-cycle line at launch, so a pause written after a claim gives the resolved session a new
 *  claim while the same record state never launches twice. */
export const claimFile = (sessionId, key) => path.join(autoCycleDir(), `${sessionId}.${key}.claim`)

/** A record path's short hash, which names its markers and its session start file. */
const recordHash = (recordPath) => crypto.createHash('sha1').update(path.resolve(recordPath)).digest('hex').slice(0, 16)

/** Where the restore hook records a session start (RB3-2): the record's line count when a session began after /clear. */
export const sessionStartFile = (recordPath) => path.join(autoCycleDir(), `start-${recordHash(recordPath)}`)

/** The record's line count, the number of its last line. */
export function recordLineCount(recordPath) {
  const text = fs.readFileSync(recordPath, 'utf8')
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/** Record that a session starts now, as the record's current line count. */
export function writeSessionStart(recordPath) {
  writeMarker(sessionStartFile(recordPath), recordLineCount(recordPath))
}

/** Where the session's latest turn end is kept: the record's path and line count when it ended (E8-R29, E8-R31). */
export const turnEndFile = (sessionId) => path.join(autoCycleDir(), `turn-end-${sessionId}.json`)

/** Record that this session's turn ended now, at a Stop, a StopFailure, or the next submitted prompt (E8-R31): the
 *  record's path and line count, taken before the event writes any line. The one writer of the turn end. */
export function writeTurnEnd(sessionId, recordPath) {
  writeMarker(turnEndFile(sessionId), { record: path.resolve(recordPath), line: recordLineCount(recordPath) })
}

/** The record's line count at this session's latest turn end (E8-R29, E8-R31), or 0 when none is known: a missing or
 *  unreadable turn end, or one written for another record (a kickoff that switched records, RB6-2), never frees a
 *  line from the dedup. */
export function turnEndLine(sessionId, recordPath) {
  try {
    const f = JSON.parse(fs.readFileSync(turnEndFile(sessionId), 'utf8'))
    return f.record === path.resolve(recordPath) && Number.isInteger(f.line) ? f.line : 0
  } catch { return 0 }
}

/** The line count the last recorded session start saw, or 0 when none was recorded or it cannot be read. */
export function sessionStartLine(recordPath) {
  try { const n = JSON.parse(fs.readFileSync(sessionStartFile(recordPath), 'utf8')); return Number.isInteger(n) ? n : 0 } catch { return 0 }
}
export const restoreFile = (paneId) => path.join(autoCycleDir(), `pane-${paneToken(paneId)}.restored`)
export const stopFactsFile = (sessionId) => path.join(autoCycleDir(), `stop-${sessionId}.json`)
/** A Codex Stop's own decision, per turn: whether it waited for live work (E10H-R2-B2). The watcher retries the Stop
 *  from this, never from the rollout, which Codex writes the turn's end into only after the Stop returns. */
export const stopHeldFile = (sessionId) => path.join(autoCycleDir(), `held-${sessionId}.json`)
const tokenFile = (paneId) => path.join(autoCycleDir(), `token-${paneToken(paneId)}.txt`)

/** A claim is held when its file exists and the pid written into it is alive (S3). A claim whose pid is not
 *  written yet, or whose writer died, is not held. */
export function claimHeld(file) {
  let c
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return false }
  return pidAlive(String(c?.pid ?? ''))
}

/** Any held claim naming this pane, whatever session took it: the typer's claim is keyed by the old session id,
 *  and the Notification that asks comes from the new one (F9). */
export function paneClaimHeld(paneId) {
  let names
  try { names = fs.readdirSync(autoCycleDir()) } catch { return false }
  return names.filter((f) => f.endsWith('.claim')).some((f) => {
    const file = path.join(autoCycleDir(), f)
    try { return JSON.parse(fs.readFileSync(file, 'utf8')).pane === paneId && claimHeld(file) } catch { return false }
  })
}

/** Append one line to a record, starting it on a line of its own. */
export function appendRecordLine(recordPath, line) {
  const text = fs.readFileSync(recordPath, 'utf8')
  fs.appendFileSync(recordPath, (text === '' || text.endsWith('\n') ? '' : '\n') + line + '\n')
}

/** Append `auto-cycle paused: <reason>` to the record (E8-D16), unless a standing pause names the same pause, or,
 *  for the idle pause, unless any pause stands (pauseStands, E8-D18, E8-R27, E8-R28). Given the hook's session, an
 *  R7, R8 or R9 line from before that session's latest turn end does not count (E8-R29, E8-R31); the typer passes none, so its
 *  pauses keep the plain rule. Never a state line: the record's last state line is left as it was. `{ written }`. */
export function appendPaused(recordPath, reason, sessionId = null) {
  if (pauseStands(parseRecord(fs.readFileSync(recordPath, 'utf8')).entries, sessionStartLine(recordPath), reason, sessionId ? turnEndLine(sessionId, recordPath) : 0)) return { written: false }
  appendRecordLine(recordPath, pausedLine(reason))
  return { written: true }
}

/** Publish the autocycle token only when its value differs from the one last published for this pane (LB2). A
 *  failed call is left unrecorded, so the next event tries again. Display only: nothing is decided from it. */
export function publishToken(paneId, value, log = () => {}) {
  if (!paneId) return false
  try { if (JSON.parse(fs.readFileSync(tokenFile(paneId), 'utf8')) === value) return false } catch { /* none published yet */ }
  try {
    herdr(autocycleTokenArgs(paneId, value)) // herdr-lint: display only; a failed publish is logged and retried at the next event
    writeMarker(tokenFile(paneId), value)
    return true
  } catch (e) { log(`autocycle token not published (${e.message.split('\n')[0]})`); return false }
}

/** A paused line's marker name in the auto-cycle dir: `<kind>-<hash of record path>-<line>`. */
const pauseMarker = (kind, recordPath, line) =>
  path.join(autoCycleDir(), `${kind}-${recordHash(recordPath)}-${line}`)

/**
 * Raise the toast once for each of the record's standing pauses (standingPauses in dctr-lib.mjs, B3, E8-D26),
 * whoever wrote the line, and publish the paused token naming the last of them. Each line's alerted marker is taken
 * first, exclusively, and outlives the session, so a later session, a concurrent hook or the typer never raises
 * that line again (F2). herdr is called only given a pane: the hook passes none in a contained session, which is the
 * one guard keeping herdr out of it. True when this call raised any.
 */
export function alertPaused({ recordPath, repo, phase, paneId, log = () => {} }) {
  const entries = parseRecord(fs.readFileSync(recordPath, 'utf8')).entries, start = sessionStartLine(recordPath)
  const fresh = standingPauses(entries, start).filter((p) => { try { reserveMarker(pauseMarker('alerted', recordPath, p.line)); return true } catch { return false } })
  if (!fresh.length) return false
  if (paneId) {
    publishToken(paneId, autocycleToken(entries, start), log)
    for (const p of fresh) {
      try { herdr(pauseToastArgs(repo, phase, p.reason, pauseActionAt(p, entries, start))) } // herdr-lint: display only; the paused line and the pane message stand without it
      catch (e) { log(`auto-cycle toast not raised (${e.message.split('\n')[0]})`) }
    }
  }
  return true
}

/**
 * The pane message for each standing pause not yet shown (E8-R23), one line each: `doctrine auto-cycle paused:
 * <reason>. <what to do>`, which the Stop, Notification or StopFailure hook prints as a systemMessage, the first of
 * them to run after the line is written. Its own marker, apart from the toast's: the detached typer raises the toast
 * and has no pane output of its own, so one marker for both left its pauses with no pane message (SP1). Null when
 * there is nothing to print.
 */
export function pauseMessageOnce(recordPath) {
  const entries = parseRecord(fs.readFileSync(recordPath, 'utf8')).entries, start = sessionStartLine(recordPath)
  const fresh = standingPauses(entries, start).filter((p) => { try { reserveMarker(pauseMarker('shown', recordPath, p.line)); return true } catch { return false } })
  return fresh.length ? fresh.map((p) => pauseMessage(p.reason, pauseActionAt(p, entries, start))).join('\n') : null
}

/** The first live work this session has, as a reason, or null (E8-D7, E8-R8): a seat without its SubagentStop,
 *  a gate without its result file, a codex seat whose job is not terminal. Markers that cannot be read are live:
 *  an unknown count is never an empty one. */
export function liveWork(sessionId) {
  let found
  try { found = liveSeatsPartial(sessionId) } catch (e) { return `the seat markers could not be read (${e.message})` }
  if (found.unreadable.length) return `a seat marker could not be read: ${found.unreadable[0]}`
  for (const s of found.seats) {
    let status = null
    if (s.codexJob) { try { status = JSON.parse(fs.readFileSync(s.codexJob, 'utf8')).status ?? null } catch { /* not terminal */ } }
    if (seatLive(s, Boolean(s.file) && fs.existsSync(`${s.file}.result`), status)) return `${s.role === 'gate' ? 'gate' : 'seat'} ${s.agent || s.paneId || ''} is live`.trim()
  }
  return null
}

/**
 * Every process on the host as codexAncestor and codexBackground in dctr-lib.mjs read them (E10H-R3-B4): pid, ppid,
 * state and start time from /proc/<pid>/stat, argv0 from its cmdline, and `session`, the CODEX_SESSION_ID in its
 * environment: '' when it has none, null when the environment cannot be read. A process that exits mid-read is left
 * out, as it is gone. `{ error }` when /proc cannot be listed (a host without it).
 */
export function processListing() {
  let pids
  try { pids = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)) } catch (e) { return { error: `/proc could not be read (${e.code || e.message})` } }
  const procs = []
  for (const id of pids) {
    let stat, cmd
    try { stat = fs.readFileSync(`/proc/${id}/stat`, 'utf8'); cmd = fs.readFileSync(`/proc/${id}/cmdline`, 'utf8') } catch { continue }
    const f = statFields(stat)
    let session = null
    try { session = /(?:^|\0)CODEX_SESSION_ID=([^\0]*)/.exec(fs.readFileSync(`/proc/${id}/environ`, 'utf8'))?.[1] ?? '' } catch { /* unreadable: null */ }
    procs.push({ pid: Number(id), ppid: Number(f[1]), state: f[0], start: Number(f[19]), argv0: cmd.split('\0')[0], session })
  }
  return { procs }
}

/**
 * B7's tree hash (E8-D17): for each repo, `git add -A` into a fresh temporary index, the excluded paths then removed
 * from it, then `git write-tree`. Fresh, not copied from the real index: a copy carries the real index's stat cache,
 * and an edit of the same size in the same second as that cache's entry is invisible to `git add` (RB4). One repo gives its tree id; two
 * give the sha1 of both ids, which is not a git object (F7). `excludes(repo)` returns that repo's pathspecs, each a
 * path relative to it or a `:(glob)` pattern. Throws when git cannot answer.
 */
export function treeHash(repos, excludes) {
  const ids = [...new Set(repos)].map((repo) => {
    const git = (args, env = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    // ponytail: every file is read and hashed on each call; only a cycle's Stop reaches this, once per cycle.
    const tmp = path.join(autoCycleDir(), `index.${process.pid}.${Date.now()}`)
    try {
      const env = { GIT_INDEX_FILE: tmp }
      // Add everything, then take the excluded paths back out: an excluded path named in the add itself makes git
      // refuse when that path is ignored.
      git(['add', '-A', '--', '.'], env)
      const ex = excludes(repo)
      if (ex.length) git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...ex], env)
      return git(['write-tree'], env)
    } finally { fs.rmSync(tmp, { force: true }) }
  })
  return ids.length === 1 ? ids[0] : crypto.createHash('sha1').update(ids.join('\n')).digest('hex')
}

/**
 * Whether the handoff has landed since this session's warning (B2 step 5, E8-D7): the handoff file was written at
 * or after `warnedAt` (the gauge's latch records when it warned), and, unless git ignores the handoff, a commit
 * touching it was made at or after that second and it and the memory file carry no uncommitted change. Outside a
 * git work tree the file and the kickoff line naming it are the landing. False when `warnedAt` is unknown.
 */
export function handoffLanded({ handoffPath, memoryPath, warnedAt }) {
  if (!Number.isFinite(warnedAt)) return false
  let st
  try { st = fs.statSync(handoffPath) } catch { return false }
  if (st.mtimeMs < warnedAt) return false
  const git = (args) => execFileSync('git', ['-C', path.dirname(handoffPath), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try { git(['rev-parse', '--is-inside-work-tree']) } catch { return true }
  try { git(['check-ignore', '-q', handoffPath]); return true } catch { /* not ignored: it needs its commit */ }
  try {
    const ct = Number(git(['log', '-1', '--format=%ct', '--', handoffPath]))
    if (!ct || ct < Math.floor(warnedAt / 1000)) return false
    return git(['status', '--porcelain', '--', handoffPath, memoryPath]) === ''
  } catch { return false }
}
