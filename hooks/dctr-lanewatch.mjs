// doctrine — the lane watcher (E15 The lane watcher, Recovery): one process per run, outside every session.
//
//   node hooks/dctr-lanewatch.mjs start    run from the orchestrator: record it in lane.log, write <run>/tmpdir, and
//                                          start the watcher in a pane of its own
//   node hooks/dctr-lanewatch.mjs stop     end the watcher: the orchestrator's last step of the run
//   node hooks/dctr-lanewatch.mjs          the watcher itself, as start's pane runs it
//
// The run comes from runRoot(). `start` refuses a checkout whose path holds whitespace, which a lane.log line cannot
// carry, takes <run>/lanewatch.start.lock so two starts never run at once, and refuses while a watcher holds
// <run>/lanewatch.lock. It writes <run>/lanewatch.sh, `exec env DCTR_CALLER=watcher DCTR_RUN=<run> DCTR_WATCH_TOKEN=<t>
// PATH=<path> TMPDIR=<tmp> node <this file>`, since a pane does not inherit the environment, makes a tab and runs
// `sh <that file>` in its pane: the pane refuses a typed line over 1024 bytes, which an inlined PATH passes. The watcher
// takes <run>/lanewatch.lock itself as its first act (takeRunLock, its token written beside its pid), and refuses while
// another holds it. start waits up to WAIT_MS for a live holder carrying its own token, and only then writes its TMPDIR
// to <run>/tmpdir, which wake-all reads, and appends an orchestrator `create` line to lane.log, under the caller tag
// `orchestrator`, naming the orchestrator's pane (HERDR_PANE_ID), its checkout and a launch line built from its own
// environment. A start whose tab, pane or wait fails closes the tab it made, releases its lock, writes neither, and exits
// 1 with one line. Before each poll the watcher re-reads the lock and renews it, and ends once it no longer names this
// watcher; herdr( calls renew it too. stop signals only a live holder whose lock was renewed within 3 * POLL_MS, waits
// for it to release the lock, removes a lock only when its holder has exited, says which of these it did, and touches no
// other. Contained (DCTR_VIEW_REQUEST_DIR set) start and the watcher refuse with no pane call.
//
// Each poll, every POLL_MS, appends one events.log line per new fact, `<ISO time> <word> ...`:
//   report <file>                a new file in <run>/inbox/
//   exit <role> <pane>           a session's pane, the one its role's latest create line names (laneOf, the only way
//                                this file learns a pane or worktree), reporting no agent session
//   deadline <role> <seat> line <n>  a seat past the deadline of its wave line, record line n, whose handle file did not
//                                grow between two polls
//   pause <role> line <n> <reason>  a record newly showing a standing pause, at record line n: an auto-cycle paused
//                                line, a Blocked state, an unanswered question or an alarm with no ruling after it
//   ready <role> <session> <at>  a last assistant message, timestamped at, ending with the ready line for longer than
//                                READY_LIMIT_MS, with no cycle line since the poll that first saw it
//   context <role> <session> ... a context reading past its resolved tier (resolveTier, the floor included) on two
//                                polls with no warned line naming the session; `unknown` once for a bridge file older
//                                than BRIDGE_EXPIRY_MS, whose value is never read
//   limit <role> <kind> <L> ...  each new limits.log line: an account line names its reset time and the wake-all
//                                command, a model line `/model`, an other line its error
// A pane read that fails or comes back empty is unknown: no exit event, and the watcher types nothing ever. It shows a
// notification for the first account line of an episode, and none for later ones until events.log holds a woken line
// written after that notification, and one for each unwoken, unfinished or skip line naming the orchestrator; each
// inside a catch that never sends again, and writes `notified <line index> <word>` for each stall it notified, the
// stall line's index in events.log. What it has reported survives a restart through events.log: a report, a limit
// line, an account episode's notification and a stall's notification already there are not raised again, nor a
// deadline for the same wave line, a ready for the same entry, a pause for the same record line or a past-tier context
// for the same session; an exit or unknown context already there is not raised again while its state holds. Once a poll
// reads any of these states clear, before the restart or after it, it is raised again when it returns; a read that
// fails clears nothing.

import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { herdr } from './dctr-state.mjs'
import { restoreFile, stateDir, takeRunLock, releaseRunLock, ownsRunLock, runLockHolder, runLockDead, holderAlive, ownPidNs, sameHolder, sleepMs } from './dctr-state.mjs'
import {
  laneOf, laneRoles, parseLimits, parseWakeLines, runRoot, followKickoff, repoOf, standingPauses, pausingStates, resolveTier,
  lastOnOffEntry, sessionWarned, endsReady, transcriptEntries, entryText, firstUsage, HANDOFF_COST_TOKENS, tabCreateArgs, shq, PREFIX, laneLogPathRefusal,
} from './dctr-lib.mjs'
import { bridgeFile } from './dctr-bridge.mjs'

/** WS-1: the poll interval, the ready limit and the bridge expiry. */
export const POLL_MS = 30000
export const READY_LIMIT_MS = 600000
export const BRIDGE_EXPIRY_MS = 300000
/** How long start waits for its watcher to take the lock, and stop for a signalled watcher to release it. */
const WAIT_MS = 10000

const SELF = fileURLToPath(import.meta.url)
const readText = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return null } }
const fail = (m) => { process.stderr.write(`dctr-lanewatch: ${m}\n`); process.exit(1) }

/** The name a notification gives the run: the basename of the git top level holding it, else the run itself. */
function runName(run) {
  const top = repoOf(path.join(run, 'x'), fs.existsSync)
  return fs.existsSync(path.join(top, '.git')) ? path.basename(top) : run
}

/** A role's record through the kickoff chain in its worktree, or null. */
function recordOf(dir) {
  const k = followKickoff({ projectDir: repoOf(path.join(dir, '.git'), fs.existsSync), read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
  return k.why ? null : k
}

/** The watcher's state over one run; `poll()` reads every source once and appends what is new. */
export function createWatcher(run, { plugin = path.dirname(path.dirname(SELF)) } = {}) {
  const eventsFile = path.join(run, 'events.log'), name = runName(run)
  const emit = (text) => { fs.mkdirSync(run, { recursive: true }); fs.appendFileSync(eventsFile, `${new Date().toISOString()} ${text}\n`) }
  const notify = (title) => { try { herdr(['notification', 'show', title, '--sound', 'request']) } catch { /* shown or not, never sent again */ } }
  // An event an earlier watcher raised is not raised again after a restart: `restored` holds the events.log texts (a
  // past-tier line by its prefix), and a raise it holds is dropped once, after which the in-process sets carry it. The
  // texts carry the identity those sets key on: a deadline its wave line, a ready its entry, a pause its record line, an
  // exit or unknown context its state. A poll that reads such a state and sees it clear drops its entry, so it is raised
  // when it returns; a read that fails drops nothing.
  const raise = (text, key = text) => { if (!restored.delete(key)) emit(text) }
  const completeLines = () => { const t = readText(eventsFile) ?? ''; return t.split('\n').slice(0, -1) }

  // What events.log already reports is never raised again, a restart included: limits.log only grows, so the count of
  // limit events is how many of its lines are reported, whatever two lines share. The account episode is rebuilt too:
  // its notification point is the first account limit event after the last woken line, by position in the file. A stall line is notified once,
  // and a `notified <its line index> <word>` line records that, so one written while no watcher ran still notifies, and
  // two stall lines written in the same millisecond are two.
  const seenReports = new Set(), notifiedStalls = new Set(), restored = new Set()
  // notifiedAt is the events.log line index of the episode's notification point, judged by position, never by time.
  let limitsSeen = 0, notifiedAt = null
  for (const [i, l] of completeLines().entries()) {
    const w = l.split(' ')
    if (['exit', 'pause', 'deadline', 'ready', 'context'].includes(w[1])) restored.add(w.slice(1).join(' ').replace(/^(context \S+ \S+ past tier).*/, '$1'))
    if (w[1] === 'report') seenReports.add(w.slice(2).join(' '))
    if (w[1] === 'notified') notifiedStalls.add(`${w[2]} ${w[3]}`)
    if (w[1] === 'woken') notifiedAt = null
    if (w[1] === 'limit') { limitsSeen += 1; if (w[3] === 'account' && notifiedAt === null) notifiedAt = i }
  }
  const exited = new Set(), pauses = new Map(), grew = new Map(), late = new Set(), readySeen = new Map(), readyRaised = new Set()
  const past = new Map(), contextRaised = new Set(), staleRaised = new Set()

  function inbox() {
    let names = []
    try { names = fs.readdirSync(path.join(run, 'inbox')).filter((f) => !f.startsWith('.')).sort() } catch { return }
    for (const f of names) if (!seenReports.has(f)) { seenReports.add(f); emit(`report ${f}`) }
  }

  function limits() {
    for (const l of parseLimits(readText(path.join(run, 'limits.log'))).slice(limitsSeen)) {
      limitsSeen += 1
      if (l.kind === 'model') { emit(`limit ${l.role} model ${l.time} /model`); continue }
      if (l.kind === 'other') { emit(`limit ${l.role} other ${l.time} error ${l.field}`); continue }
      emit(`limit ${l.role} account ${l.time} reset ${l.field} roll, then run: node ${plugin}/hooks/dctr-send.mjs wake-all ${run}`)
      const woken = parseWakeLines(readText(eventsFile)).some((w) => w.word === 'woken' && w.index > notifiedAt)
      if (notifiedAt === null || woken) { notifiedAt = completeLines().length - 1; notify(`${name} run: account limit, reset ${l.field}; roll, then wake-all`) }
    }
  }

  function stalls() {
    for (const w of parseWakeLines(completeLines().join('\n'))) {
      const key = `${w.index} ${w.word}`
      if (w.role !== 'orchestrator' || !['unwoken', 'unfinished', 'skip'].includes(w.word) || notifiedStalls.has(key)) continue
      notifiedStalls.add(key)
      emit(`notified ${key}`)
      notify(`${name} run: orchestrator ${w.word} by wake-all`)
    }
  }

  /** The pane's session id, null for a pane with no agent session, undefined when the read failed or came back empty. */
  function paneSession(pane) {
    let reply
    try { reply = herdr(['pane', 'get', pane]) } catch { return undefined }
    const p = reply?.result?.pane
    if (!p) return undefined
    const s = p.agent_session?.value
    return typeof s === 'string' && s !== '' ? s : null
  }

  function session(role, lane) {
    const s = paneSession(lane.pane)
    if (s === null) { if (!exited.has(role)) { exited.add(role); raise(`exit ${role} ${lane.pane}`) } } else if (s !== undefined) { exited.delete(role); restored.delete(`exit ${role} ${lane.pane}`) }
    const rec = recordOf(lane.worktree)
    if (rec) { standing(role, rec.record.entries); seats(role, rec.record.entries, lane.worktree) }
    if (!s || !rec) return
    const rf = (() => { try { const r = JSON.parse(fs.readFileSync(restoreFile(lane.pane), 'utf8')); return r?.session_id === s ? r : null } catch { return null } })()
    const transcript = rf?.transcript_path ? readText(rf.transcript_path) : null
    ready(role, s, rec.record.entries, transcript)
    context(role, s, rec.record.entries, transcript)
  }

  function standing(role, entries) {
    // Each pause is named by the record line that stands for it, so a new pause with the same reason is a new event.
    const now = new Set(), last = (pred) => entries.filter(pred).at(-1)?.line
    for (const p of standingPauses(entries)) now.add(`pause ${role} line ${p.line} auto-cycle paused: ${p.reason}`)
    const st = pausingStates(entries)
    if (st.blocked) now.add(`pause ${role} line ${last((e) => e.kind === 'state')} ${st.blocked}`)
    if (st.alarm) now.add(`pause ${role} line ${last((e) => e.kind === 'alarm' && e.which === st.alarm)} ${st.alarm} alarm with no ruling`)
    if (st.question) now.add(`pause ${role} line ${last((e) => e.kind === 'question-opened' && e.id === st.question.id)} question ${st.question.id} unanswered: ${st.question.text}`)
    const before = pauses.get(role) ?? new Set()
    for (const t of now) if (!before.has(t)) raise(t)
    for (const k of restored) if (k.startsWith(`pause ${role} `) && !now.has(k)) restored.delete(k)
    pauses.set(role, now)
  }

  function seats(role, entries, worktree) {
    for (const w of entries.filter((e) => e.kind === 'wave')) {
      const due = Date.parse(w.deadline ?? '')
      const key = `${role} ${w.line}`
      if (!(due < Date.now()) || late.has(key)) continue
      // Liveness comes only from a handle naming a readable file; an agent id or a missing file is unknown, never late.
      let size = null
      try { const st = fs.statSync(path.resolve(worktree, w.handle)); if (st.isFile()) size = st.size } catch { /* unknown */ }
      if (size === null) { grew.delete(key); continue }
      const was = grew.has(key) ? grew.get(key) : undefined
      grew.set(key, size)
      if (was !== undefined && was === size) { late.add(key); raise(`deadline ${role} ${w.seat} line ${w.line}`) }
    }
  }

  function ready(role, s, entries, transcript) {
    const read = transcript === null ? null : transcriptEntries(transcript)
    const last = read?.entries.filter((e) => e?.type === 'assistant').at(-1)
    if (!last || !endsReady(entryText(last))) return
    // Raised on a poll after the one that first saw this ready line, while the record has gained no cycle line since.
    const key = `${s} ${last.timestamp}`, cycles = entries.filter((e) => e.kind === 'auto-cycle' && e.sub === 'cycle').length
    if (!readySeen.has(key)) { readySeen.set(key, cycles); return }
    if (Date.now() - Date.parse(last.timestamp) > READY_LIMIT_MS && readySeen.get(key) === cycles && !readyRaised.has(key)) { readyRaised.add(key); raise(`ready ${role} ${s} ${last.timestamp}`) }
  }

  function context(role, s, entries, transcript) {
    const file = bridgeFile(s)
    let st
    try { st = fs.statSync(file) } catch { return }
    if (Date.now() - st.mtimeMs > BRIDGE_EXPIRY_MS) {
      past.delete(s)
      if (!staleRaised.has(s)) { staleRaised.add(s); raise(`context ${role} ${s} unknown`) }
      return
    }
    staleRaised.delete(s); restored.delete(`context ${role} ${s} unknown`)
    let b
    try { b = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return }
    if (b?.session_id !== s || typeof b.used !== 'number') return
    let latch = null
    try { latch = JSON.parse(fs.readFileSync(path.join(stateDir(s), 'gauge.json'), 'utf8')) } catch { /* none */ }
    const first = latch?.session_id === s && Number.isFinite(latch.firstUsed) ? latch.firstUsed : firstUsage(transcript).used
    const { tier } = resolveTier({ tierText: lastOnOffEntry(entries)?.tier, window: b.window, firstUsed: first, handoffCost: HANDOFF_COST_TOKENS })
    if (tier === null) return
    const n = b.used > tier ? (past.get(s) ?? 0) + 1 : 0
    past.set(s, n)
    if (n >= 2 && !sessionWarned(entries, s) && !contextRaised.has(s)) { contextRaised.add(s); raise(`context ${role} ${s} past tier ${tier} at ${b.used}`, `context ${role} ${s} past tier`) }
  }

  return {
    poll() {
      inbox()
      limits()
      stalls()
      const laneText = readText(path.join(run, 'lane.log'))
      for (const role of laneRoles(laneText)) { const lane = laneOf(laneText, role); if (lane) session(role, lane) }
    },
  }
}

/** The watcher's loop: poll, then wait POLL_MS, until `holds()` says the lock is no longer this watcher's, checked
 *  before each poll. `wait` is the timer, injectable for its selftest. */
export async function watch(w, wait = (ms) => new Promise((r) => setTimeout(r, ms)), holds = () => true) {
  while (holds()) { w.poll(); await wait(POLL_MS) }
}

/** Whether a watcher holds `lock`: there, and its holder not one known to have exited. */
const held = (lock) => runLockHolder(lock) !== null && !runLockDead(lock)
/** A failed herdr( call as one line. */
const why = (e) => String(e?.stderr || e?.message || e).trim().split('\n')[0]

/** `start`: its own lock, the watcher's pane, the wait for the watcher's lock, then the records. */
function start(run) {
  const checkout = repoOf(path.join(process.cwd(), '.git'), fs.existsSync)
  if (laneLogPathRefusal(checkout)) fail(laneLogPathRefusal(checkout))
  const pane = process.env.HERDR_PANE_ID, workspace = process.env.HERDR_WORKSPACE_ID
  if (!pane || !workspace) fail('no HERDR_PANE_ID or HERDR_WORKSPACE_ID: start runs in the orchestrator\'s pane')
  fs.mkdirSync(run, { recursive: true })
  const lock = path.join(run, 'lanewatch.lock'), startLock = path.join(run, 'lanewatch.start.lock')
  if (!takeRunLock(startLock)) fail(`another start holds ${startLock}`)
  process.on('exit', () => releaseRunLock(startLock))
  if (held(lock)) fail(`a watcher already holds ${lock}`)
  const tmp = process.env.TMPDIR || os.tmpdir(), envPath = process.env.PATH ?? ''
  // The token names this start's watcher: start waits for a lock carrying it, so a watcher launched any other way is
  // never taken for its own.
  const script = path.join(run, 'lanewatch.sh'), token = crypto.randomUUID()
  fs.writeFileSync(script, `exec env DCTR_CALLER=watcher DCTR_RUN=${shq(run)} DCTR_WATCH_TOKEN=${token} PATH=${shq(envPath)} TMPDIR=${shq(tmp)} node ${shq(SELF)}\n`)
  let tab = null
  const undo = (m) => { if (tab) { try { herdr(['tab', 'close', tab]) } catch { /* gone already */ } } fail(m) }
  let made
  // A failed create is a refusal: no tab is known yet, so it closes nothing. Its reply is read below, outside the try.
  try { made = herdr(tabCreateArgs(workspace, `${PREFIX} · watcher`, checkout)) } catch (e) { undo(`the watcher's tab was not made: ${why(e)}`) }
  tab = made?.result?.tab?.tab_id ?? null
  const watcher = made?.result?.root_pane?.pane_id
  if (!watcher) undo('no pane was made for the watcher')
  try { herdr(['pane', 'run', watcher, `sh ${shq(script)}`]) } catch (e) { undo(`the watcher's pane did not run it: ${why(e)}`) }
  const until = Date.now() + WAIT_MS
  for (;;) {
    const h = runLockHolder(lock)
    if (h && h.token === token && holderAlive(h, ownPidNs()) === true) break
    if (Date.now() > until) undo(`the watcher this start ran did not take ${lock} within ${WAIT_MS} ms`)
    sleepMs(100)
  }
  fs.writeFileSync(path.join(run, 'tmpdir'), tmp)
  const launch = `cd ${shq(checkout)} && env DCTR_ROLE=orchestrator DCTR_CALLER=orchestrator DCTR_RUN=${shq(run)} ` +
    `CLAUDE_CONFIG_DIR=${shq(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))} PATH=${shq(envPath)} ` +
    `TMPDIR=${shq(tmp)} claude --model "$(cat ${shq(path.join(run, 'model', 'orchestrator'))})"`
  fs.appendFileSync(path.join(run, 'lane.log'), `${new Date().toISOString()} orchestrator create orchestrator ${pane} ${checkout} ${launch}\n`)
  process.stdout.write(`dctr-lanewatch: started in ${watcher}\n`)
}

/** Remove `lock` when its holder has exited, as any contender breaks it, by taking it and releasing it: `removed`,
 *  `left` when the take was refused (another breaker's gate, or a holder that took it meanwhile), or `alive`. */
export function clearDeadLock(lock) {
  if (!runLockDead(lock)) return 'alive'
  if (!takeRunLock(lock)) return 'left'
  releaseRunLock(lock)
  return 'removed'
}

/** `stop`: end the watcher that holds the lock. Only a live holder whose lock was renewed within 3 * POLL_MS is the
 *  watcher, and it is signalled and releases the lock itself; a lock whose holder has exited is removed through
 *  clearDeadLock, and any other is left. */
function stop(run) {
  const lock = path.join(run, 'lanewatch.lock'), h = runLockHolder(lock)
  if (!h) fail(`no watcher holds ${lock}`)
  let age = Infinity
  try { age = Date.now() - fs.statSync(lock).mtimeMs } catch { /* gone */ }
  const alive = holderAlive(h, ownPidNs())
  if (alive === false) {
    const done = clearDeadLock(lock)
    if (done === 'removed') { process.stdout.write(`dctr-lanewatch: pid ${h.pid} had exited; its lock is removed\n`); return }
    fail(done === 'left' ? `pid ${h.pid} had exited, but its lock could not be taken now: it is left` : `pid ${h.pid} had exited, and another holder took ${lock} since: nothing signalled or removed`)
  }
  if (alive !== true || !(age < 3 * POLL_MS)) fail(`pid ${h.pid} holds ${lock} but did not renew it within ${3 * POLL_MS} ms, so it is not taken for the watcher: nothing signalled or removed`)
  process.kill(Number(h.pid), 'SIGTERM')
  const until = Date.now() + WAIT_MS
  for (;;) {
    const now = runLockHolder(lock)
    if (now !== undefined && !sameHolder(now, h)) break
    if (Date.now() > until) fail(`pid ${h.pid} was signalled and still holds ${lock}`)
    sleepMs(100)
  }
  process.stdout.write(`dctr-lanewatch: stopped pid ${h.pid}\n`)
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF) } catch { return false } })()
if (isMain) {
  const sub = process.argv[2]
  if (process.env.DCTR_VIEW_REQUEST_DIR) fail('contained: the lane watcher does not run, and makes no pane call')
  const run = runRoot()
  if (!run) fail('no run: DCTR_RUN is unset and this is not the orchestrator\'s repo')
  if (sub === 'start') start(run)
  else if (sub === 'stop') stop(run)
  else if (sub !== undefined) fail('usage: start | stop | (no argument: the watcher)')
  else {
    fs.mkdirSync(run, { recursive: true })
    const lock = path.join(run, 'lanewatch.lock')
    if (!takeRunLock(lock, process.env.DCTR_WATCH_TOKEN ?? '')) fail(`a watcher already holds ${lock}`)
    process.on('exit', () => releaseRunLock(lock))
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(0))
    // A timer, never a blocking sleep, so stop's SIGTERM reaches the handler that releases the lock.
    // Each poll first re-reads the lock and renews it; one that no longer names this watcher ends it.
    await watch(createWatcher(run), undefined, () => ownsRunLock(lock))
    process.stderr.write(`dctr-lanewatch: ${lock} no longer names this watcher; it ends\n`)
  }
}
