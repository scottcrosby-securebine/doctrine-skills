// doctrine — the lane watcher (E15 The lane watcher, Recovery): one process per run, outside every session.
//
//   node hooks/dctr-lanewatch.mjs start    run from the orchestrator: record it in lane.log, write <run>/tmpdir, and
//                                          start the watcher in a pane of its own
//   node hooks/dctr-lanewatch.mjs stop     end the watcher: the orchestrator's last step of the run
//   node hooks/dctr-lanewatch.mjs          the watcher itself, as start's pane runs it
//
// The run comes from runRoot(). `start` appends an orchestrator `create` line to lane.log, under the caller tag
// `orchestrator`, naming the orchestrator's pane (HERDR_PANE_ID), its checkout and a launch line built from its own
// environment, writes its TMPDIR to <run>/tmpdir, which wake-all reads, then makes a tab and runs
// `env DCTR_CALLER=watcher DCTR_RUN=<run> PATH=<path> TMPDIR=<tmp> node <this file>` in its pane, since a pane does not
// inherit the environment. start refuses a checkout whose path holds whitespace, which a lane.log line cannot carry,
// and takes <run>/lanewatch.lock with its own pid before it writes anything; the watcher its pane runs takes the lock
// over from that pid (DCTR_WATCH_FROM), so a second watcher, and a second start, refuse while either holds it. The
// watcher renews the lock's time at every poll, and stop signals the pid only while that renewal is recent. Contained
// (DCTR_VIEW_REQUEST_DIR set) start and the watcher refuse with no pane call.
//
// Each poll, every POLL_MS, appends one events.log line per new fact, `<ISO time> <word> ...`:
//   report <file>                a new file in <run>/inbox/
//   exit <role> <pane>           a session's pane, the one its role's latest create line names (laneOf, the only way
//                                this file learns a pane or worktree), reporting no agent session
//   deadline <role> <seat>       a seat past its wave line's deadline whose handle file did not grow between two polls
//   pause <role> <reason>        a record newly showing a standing pause: an auto-cycle paused line, a Blocked state,
//                                an unanswered question or an alarm with no ruling after it
//   ready <role> <session>       a last assistant message ending with the ready line for longer than READY_LIMIT_MS,
//                                with no cycle line since the poll that first saw it
//   context <role> <session> ... a context reading past its resolved tier (resolveTier, the floor included) on two
//                                polls with no warned line naming the session; `unknown` once for a bridge file older
//                                than BRIDGE_EXPIRY_MS, whose value is never read
//   limit <role> <kind> <L> ...  each new limits.log line: an account line names its reset time and the wake-all
//                                command, a model line `/model`, an other line its error
// A pane read that fails or comes back empty is unknown: no exit event, and the watcher types nothing ever. It shows a
// notification for the first account line of an episode, and none for later ones until events.log holds a woken line
// written after that notification, and one for each unwoken, unfinished or skip line naming the orchestrator; each
// inside a catch that never sends again, and writes `notified <time> <word>` for each stall it notified. What it has
// reported survives a restart through events.log: a report, a limit line, an account episode's notification and a
// stall's notification already there are not raised again.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { herdr } from './dctr-state.mjs'
import { restoreFile, stateDir, takePidLock, releasePidLock, pidAlive } from './dctr-state.mjs'
import {
  laneOf, laneRoles, parseLimits, parseWakeLines, runRoot, followKickoff, repoOf, standingPauses, pausingStates, resolveTier,
  lastOnOffEntry, sessionWarned, endsReady, transcriptEntries, entryText, firstUsage, HANDOFF_COST_TOKENS, tabCreateArgs, shq, PREFIX, laneLogPathRefusal,
} from './dctr-lib.mjs'
import { bridgeFile } from './dctr-bridge.mjs'

/** WS-1: the poll interval, the ready limit and the bridge expiry. */
export const POLL_MS = 30000
export const READY_LIMIT_MS = 600000
export const BRIDGE_EXPIRY_MS = 300000

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
  const completeLines = () => { const t = readText(eventsFile) ?? ''; return t.split('\n').slice(0, -1) }

  // What events.log already reports is never raised again, a restart included: limits.log only grows, so the count of
  // limit events is how many of its lines are reported, whatever two lines share. The account episode is rebuilt too:
  // its notification point is the first account limit event after the last woken line. A stall line is notified once,
  // and a `notified <its time> <word>` line records that, so one written while no watcher ran still notifies.
  const seenReports = new Set(), notifiedStalls = new Set()
  let limitsSeen = 0, notifiedAt = null
  for (const l of completeLines()) {
    const w = l.split(' ')
    if (w[1] === 'report') seenReports.add(w.slice(2).join(' '))
    if (w[1] === 'notified') notifiedStalls.add(`${w[2]} ${w[3]}`)
    if (w[1] === 'woken') notifiedAt = null
    if (w[1] === 'limit') { limitsSeen += 1; if (w[3] === 'account' && notifiedAt === null) notifiedAt = Date.parse(w[0]) }
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
      const woken = parseWakeLines(readText(eventsFile)).some((w) => w.word === 'woken' && Date.parse(w.at) >= notifiedAt)
      if (notifiedAt === null || woken) { notifiedAt = Date.now(); notify(`${name} run: account limit, reset ${l.field}; roll, then wake-all`) }
    }
  }

  function stalls() {
    for (const w of parseWakeLines(completeLines().join('\n'))) {
      const key = `${w.at} ${w.word}`
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
    if (s === null) { if (!exited.has(role)) { exited.add(role); emit(`exit ${role} ${lane.pane}`) } } else if (s !== undefined) exited.delete(role)
    const rec = recordOf(lane.worktree)
    if (rec) { standing(role, rec.record.entries); seats(role, rec.record.entries, lane.worktree) }
    if (!s || !rec) return
    const restored = (() => { try { const r = JSON.parse(fs.readFileSync(restoreFile(lane.pane), 'utf8')); return r?.session_id === s ? r : null } catch { return null } })()
    const transcript = restored?.transcript_path ? readText(restored.transcript_path) : null
    ready(role, s, rec.record.entries, transcript)
    context(role, s, rec.record.entries, transcript)
  }

  function standing(role, entries) {
    const now = new Map()
    for (const p of standingPauses(entries)) now.set(`paused ${p.line}`, `auto-cycle paused: ${p.reason}`)
    const st = pausingStates(entries)
    if (st.blocked) now.set(`blocked ${st.blocked}`, st.blocked)
    if (st.alarm) now.set(`alarm ${st.alarm}`, `${st.alarm} alarm with no ruling`)
    if (st.question) now.set(`question ${st.question.id}`, `question ${st.question.id} unanswered: ${st.question.text}`)
    const before = pauses.get(role) ?? new Map()
    for (const [k, reason] of now) if (!before.has(k)) emit(`pause ${role} ${reason}`)
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
      if (was !== undefined && was === size) { late.add(key); emit(`deadline ${role} ${w.seat}`) }
    }
  }

  function ready(role, s, entries, transcript) {
    const read = transcript === null ? null : transcriptEntries(transcript)
    const last = read?.entries.filter((e) => e?.type === 'assistant').at(-1)
    if (!last || !endsReady(entryText(last))) return
    // Raised on a poll after the one that first saw this ready line, while the record has gained no cycle line since.
    const key = `${s} ${last.timestamp}`, cycles = entries.filter((e) => e.kind === 'auto-cycle' && e.sub === 'cycle').length
    if (!readySeen.has(key)) { readySeen.set(key, cycles); return }
    if (Date.now() - Date.parse(last.timestamp) > READY_LIMIT_MS && readySeen.get(key) === cycles && !readyRaised.has(key)) { readyRaised.add(key); emit(`ready ${role} ${s}`) }
  }

  function context(role, s, entries, transcript) {
    const file = bridgeFile(s)
    let st
    try { st = fs.statSync(file) } catch { return }
    if (Date.now() - st.mtimeMs > BRIDGE_EXPIRY_MS) {
      past.delete(s)
      if (!staleRaised.has(s)) { staleRaised.add(s); emit(`context ${role} ${s} unknown`) }
      return
    }
    staleRaised.delete(s)
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
    if (n >= 2 && !sessionWarned(entries, s) && !contextRaised.has(s)) { contextRaised.add(s); emit(`context ${role} ${s} past tier ${tier} at ${b.used}`) }
  }

  return {
    poll() {
      try { const now = new Date(); fs.utimesSync(path.join(run, 'lanewatch.lock'), now, now) } catch { /* not this run's watcher */ }
      inbox()
      limits()
      stalls()
      const laneText = readText(path.join(run, 'lane.log'))
      for (const role of laneRoles(laneText)) { const lane = laneOf(laneText, role); if (lane) session(role, lane) }
    },
  }
}

/** The watcher's loop: poll, then wait POLL_MS, for ever. `wait` is the timer, injectable for its selftest. */
export async function watch(w, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (;;) { w.poll(); await wait(POLL_MS) }
}

/** `start`: the lock, then the records, then the watcher's pane, whose watcher takes the lock over from this pid. */
function start(run) {
  const checkout = repoOf(path.join(process.cwd(), '.git'), fs.existsSync)
  if (laneLogPathRefusal(checkout)) fail(laneLogPathRefusal(checkout))
  const pane = process.env.HERDR_PANE_ID, workspace = process.env.HERDR_WORKSPACE_ID
  if (!pane || !workspace) fail('no HERDR_PANE_ID or HERDR_WORKSPACE_ID: start runs in the orchestrator\'s pane')
  fs.mkdirSync(run, { recursive: true })
  if (!takePidLock(path.join(run, 'lanewatch.lock'))) fail(`a watcher, or another start, already holds ${path.join(run, 'lanewatch.lock')}`)
  const tmp = process.env.TMPDIR || os.tmpdir(), envPath = process.env.PATH ?? ''
  fs.writeFileSync(path.join(run, 'tmpdir'), tmp)
  const launch = `cd ${shq(checkout)} && env DCTR_ROLE=orchestrator DCTR_CALLER=orchestrator DCTR_RUN=${shq(run)} ` +
    `CLAUDE_CONFIG_DIR=${shq(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))} PATH=${shq(envPath)} ` +
    `TMPDIR=${shq(tmp)} claude --model "$(cat ${shq(path.join(run, 'model', 'orchestrator'))})"`
  fs.appendFileSync(path.join(run, 'lane.log'), `${new Date().toISOString()} orchestrator create orchestrator ${pane} ${checkout} ${launch}\n`)
  // A failed call throws and fails start, which closes nothing; the lock it leaves names a pid that has exited.
  const watcher = herdr(tabCreateArgs(workspace, `${PREFIX} · watcher`, checkout))?.result?.root_pane?.pane_id
  if (!watcher) fail('no pane was made for the watcher')
  herdr(['pane', 'run', watcher, `env DCTR_CALLER=watcher DCTR_RUN=${shq(run)} DCTR_WATCH_FROM=${process.pid} PATH=${shq(envPath)} TMPDIR=${shq(tmp)} node ${shq(SELF)}`])
  process.stdout.write(`dctr-lanewatch: started in ${watcher}\n`)
}

/** The lock for the watcher itself: taken over from the start that made its pane, else taken as any other. */
function takeOver(lock) {
  const from = process.env.DCTR_WATCH_FROM
  if (from && readText(lock)?.trim() === from) {
    const mine = `${lock}.${process.pid}`
    fs.writeFileSync(mine, String(process.pid))
    fs.renameSync(mine, lock)
    return readText(lock)?.trim() === String(process.pid)
  }
  return takePidLock(lock)
}

/** `stop`: end the watcher that holds the lock. A pid whose lock no poll has renewed lately is not the watcher, and is
 *  never signalled: the lock is only removed. */
function stop(run) {
  const lock = path.join(run, 'lanewatch.lock'), holder = readText(lock)?.trim()
  if (!holder || !/^\d+$/.test(holder)) fail(`no watcher holds ${lock}`)
  let fresh = false
  try { fresh = Date.now() - fs.statSync(lock).mtimeMs < 3 * POLL_MS } catch { /* gone */ }
  if (fresh && pidAlive(holder)) process.kill(Number(holder), 'SIGTERM')
  else process.stdout.write(`dctr-lanewatch: pid ${holder} has not renewed the lock, so it is not signalled\n`)
  fs.rmSync(lock, { force: true })
  process.stdout.write(`dctr-lanewatch: stopped pid ${holder}\n`)
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
    if (!takeOver(lock)) fail(`a watcher already runs on ${run}`)
    process.on('exit', () => releasePidLock(lock))
    for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0))
    // A timer, never a blocking sleep, so stop's SIGTERM reaches the handler that releases the lock.
    await watch(createWatcher(run))
  }
}
