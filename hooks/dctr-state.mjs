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

// `timeout` is the Q14 bound made real: without it a stalled herdr holds an operation forever, and
// a caller holding a staleness-breakable lock then has that lock stolen out from under it while it
// is still running. execFileSync kills the child and throws at the bound, so the caller refuses.
export const HERDR_TIMEOUT_MS = 30000
/** How long a placement lock may sit before a provably dead holder loses it. */
export const PLACEMENT_STALE_MS = 10000
export const herdr = (args) => parseHerdr(execFileSync('herdr', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: HERDR_TIMEOUT_MS }))

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
export const panesDir = () => path.join(process.env.TMPDIR || os.tmpdir(), `${PREFIX}-panes`)

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
  const inLayout = (m) => !m.paneId || layout.some((l) => l.pane_id === m.paneId)
  return seats.filter(inLayout).concat(panes.filter(inLayout))
}

// Placement is a read-decide-split sequence, and doctrine dispatches waves: six SubagentStarts in
// one millisecond is the proven load. Unserialized, every one of them sees zero side seats and
// founds its own right-hand column. The lock makes marker state and pane geometry move together;
// a holder that died is stolen after 10s so one crashed hook cannot blind every later seat.
// ONE LOCK PROTOCOL, used by both loops below and by dctr-pane.mjs. It was written twice, and the
// copies drifted until each carried defects the other did not, so the protocol lives here and the
// loops differ only in how they wait. A holder is identified by the pid it publishes, and every
// step is expressed against that pid rather than against the pathname, which a competitor can take.

/** The holder's pid: a string, `null` when there is provably no pid file, and `undefined` when the
 *  file is there and could not be read. Collapsing those two into one answer is what let a transient
 *  read error condemn a live holder — "I could not look" is not "nobody is there". */
const lockPid = (lock) => {
  try { return fs.readFileSync(path.join(lock, 'pid'), 'utf8').trim() }
  catch (e) { return e.code === 'ENOENT' ? null : undefined }
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

export function acquireLock(lock) {
  try { fs.mkdirSync(lock, { recursive: false }) } catch { return false }
  try {
    // `wx` is what ties the write to the directory we created. Writing by pathname does not: a
    // holder that stalls between the mkdir and the write can have its directory reaped and replaced,
    // then write its pid into the REPLACEMENT, read it back happily, and enter alongside the new
    // holder. O_EXCL makes exactly one of them win the publication and the other refuse.
    publishPid(lock, String(process.pid))
    if (lockPid(lock) !== String(process.pid)) throw new Error('pid readback did not match')
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
    try { fs.chmodSync(lock, 0o700) } catch { /* not ours to fix */ }
    try { fs.chmodSync(path.join(lock, 'pid'), 0o600) } catch { /* it may not exist at all */ }
    const reaped = breakStaleLock(lock, null)
    throw new Error(`took ${path.basename(lock)} but could not publish a pid (${e.message}); not entering. ${reaped ? 'The empty lock was removed.' : 'Something else holds that name now; it was left alone.'}`)
  }
  return true
}

/** Release only what is still ours. A lock we were stolen from belongs to someone else now, and
 *  removing it by pathname would take their critical section with it. Returns whether we still
 *  held it, so a caller that cares can tell it was stolen mid-section. */
export function releaseLock(lock) {
  if (lockPid(lock) !== String(process.pid)) return false
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

/** The whole steal decision, in one place, for both waiting loops. The pid is read ONCE and the
 *  same value is both tested and condemned, so the lock that is renamed away is the lock that was
 *  judged. Doing this twice, differently, is where two of the lock defects came from. */
/** How much longer a PID-LESS lock must sit before it is treated as an orphan.
 *
 *  A lock carrying a pid can be judged directly: the pid is alive or it is not. A lock with none
 *  cannot be, and there are two ways to get one — a holder that died between its mkdir and its pid
 *  write, and a holder running the PREVIOUS revision of this file, which published no pid at all.
 *  Those are indistinguishable from the outside, and the second one is ALIVE and inside its section.
 *
 *  withPlacementLock's own comment states the rule this branch was breaking: age alone never breaks
 *  a lock, because a holder waiting on a herdr call bounded at HERDR_TIMEOUT_MS can legitimately
 *  outlive any age the loop could pick. PLACEMENT_STALE_MS is 10s against a 30s herdr timeout, so
 *  the pid-less branch was condemning live holders at a third of the time one can honestly take.
 *
 *  Six times the ordinary window clears the longest legitimate section — a 30s herdr call inside a
 *  5s acquire — with room to spare. The migration is what makes this reachable rather than
 *  theoretical: these files ship to three consuming repos, and a session that has not restarted is
 *  still running the old protocol. */
export const PIDLESS_STALE_FACTOR = 6

export function breakIfOrphaned(lock, staleMs, pidlessMs = staleMs * PIDLESS_STALE_FACTOR) {
  let age = null
  try { age = Date.now() - fs.statSync(lock).mtimeMs } catch { return false }   // vanished: nothing to break
  const condemned = lockPid(lock)
  if (condemned === undefined) return false          // could not look; never break on that
  // The window depends on what the lock told us about itself. Read the pid FIRST so the choice of
  // window is made on evidence rather than on a single figure that has to serve both cases.
  if (age <= (condemned === null ? pidlessMs : staleMs)) return false
  if (pidAlive(condemned)) return false
  return breakStaleLock(lock, condemned)
}

/** Break a lock we have judged orphaned. The rename is atomic, but the judgement is not tied to it:
 *  between the check and the rename another waiter can break the lock and a third process acquire
 *  the freed name, and an unconditional rename then carries off that live holder's lock. So the pid
 *  that was condemned is passed in and verified against whatever actually moved, and a mismatch is
 *  put straight back. Residual, stated rather than papered over: if the put-back loses a race for
 *  the name, the moved lock is dropped and its holder finds out at releaseLock. */
export function breakStaleLock(lock, condemnedPid = null) {
  const aside = `${lock}.dead.${process.pid}.${Date.now()}`
  try { fs.renameSync(lock, aside) } catch { return false }
  // Compared in EVERY case, null included. Skipping the check when the condemned pid was null meant
  // breaking a genuinely pid-less orphan renamed away whatever had replaced it in the meantime —
  // which is a live holder's lock, taken by the one branch that did no verification at all.
  {
    const moved = lockPid(aside)
    if (moved !== condemnedPid) {
      try { fs.renameSync(aside, lock); return false } catch { /* the name was retaken; drop what we hold */ }
    }
  }
  try { fs.rmSync(aside, { recursive: true, force: true }) } catch { /* it is out of the way already */ }
  return true
}

export function withPlacementLock(sessionId, fn) {
  const lock = path.join(stateDir(sessionId), 'placement.lock')
  // The parent has to exist first. mkdir of a lock inside a directory that is not there yet fails
  // with ENOENT on every pass, so the wait runs to its deadline and blames a holder that never
  // existed. The tee lock carried this same defect and was repaired; this one was not.
  try { fs.mkdirSync(path.dirname(lock), { recursive: true }) } catch { /* acquireLock reports it */ }
  const deadline = Date.now() + 5000
  for (;;) {
    if (acquireLock(lock)) break
    // Age alone never breaks a lock. A holder waiting on a herdr call bounded at HERDR_TIMEOUT_MS
    // can legitimately outlive any age this loop could pick, and stealing from a live holder puts
    // two placements on the same layout.
    breakIfOrphaned(lock, PLACEMENT_STALE_MS)
    // Checked on every path through the loop: a `continue` used to skip it, which is the recorded
    // spin-forever defect here.
    if (Date.now() > deadline) throw new Error('placement lock timed out')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  // fn stands down by returning a reason, never by exiting: process.exit skips finally and the
  // leaked lock would cost every seat behind it the full staleness window.
  try { return fn() } finally { releaseLock(lock) }
}

/** Where the codex plugin keeps its job records: one directory per workspace, named by the
 *  workspace basename and a hash this reader does not compute, so every directory with the
 *  basename is read. A record another process is mid-write is skipped, not fatal: this is read for
 *  display and the plugin owns the file. Each record carries its own path as `file`. */
export const codexStateDir = () => path.join(os.homedir(), '.claude', 'plugins', 'data', 'codex-openai-codex', 'state')

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

/** A seat's spawn metadata, read once more after `retryMs` when absent: the harness writes it in
 *  the same second the hook fires and the order is not promised. Null stays null. */
export function readMeta(file, retryMs = 200) {
  if (!file) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch (e) { if (e.code !== 'ENOENT' || attempt) return null }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs)
  }
  return null
}
