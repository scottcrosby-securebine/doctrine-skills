// doctrine — the sender (E15 Messages): the only way a message reaches a session of a run.
//
//   node hooks/dctr-send.mjs send <role> <text>     hold the text under <run>/held/<role>/, then nudge the role's pane
//   node hooks/dctr-send.mjs report <kind> <text>   write the text to <run>/inbox/, kind report, question or request
//   node hooks/dctr-send.mjs wake <role>            clear and resume a handed-off session, else nudge it
//
// The run and the caller's role come from this process's environment (runRoot, runRole). A role's pane and worktree
// come only from its latest create line in lane.log, through laneOf, and its record from the kickoff chain in that
// worktree. Every pane call carries DCTR_CALLER as `sender:` and the inherited value. A message file is written byte
// for byte, under its final name only once complete. Before it reads the pane, the sender takes a claim on it, a claim
// file in the auto-cycle directory of the kind the typer takes, and it removes the claim once it has typed or held.
// It types nothing while any other claim on the pane is held, a claim it cannot read counting as held, on a reading it cannot get or that comes back empty,
// or when the role or its record cannot be found: the message stays held, and the lane reads its held folder at each
// resume. `send` types the nudge only on a pane reading idle or done whose session no warned line in the role's
// record names, that record read after the pane. `wake` types /clear, RESUME_LINE and the nudge, each after a fresh
// reading shows the pane ready, only when a warned line names the pane's session, the handoff landed after it, no R16
// paused line follows it, and the session's transcript holds no turn start at or after the handoff's modification
// time, a transcript it cannot read counting as holding one; otherwise it types the nudge alone. Before each line it
// reads again: the pane must report the session the line is for (the one it decided on, and after /clear the new
// one the pane reports in its place), and before /clear the record, latch, handoff and transcript must still clear
// that session; otherwise it stops typing. Each wait for a ready reading gives up WAKE_GIVE_UP_MS after it starts, the
// first at the wake's start, every `herdr(` and git call in it bounded by that wait's time left and none started past
// it, and a wait that gives up types nothing more. Each send or wake the orchestrator
// makes appends one relay line to its own record. Contained (DCTR_VIEW_REQUEST_DIR set) it writes its files and
// makes no pane call.

import fs from 'node:fs'
import path from 'node:path'
import { herdr } from './dctr-state.mjs'
import { autoCycleDir, paneClaimHeld, writeMarker, restoreFile, stateDir, handoffLanded, appendRecordLine, sleepMs } from './dctr-state.mjs'
import { laneOf, runRole, runRoot, followKickoff, repoOf, sessionWarned, pauseCode, transcriptEntries, READY_STATUSES, RESUME_LINE, paneToken } from './dctr-lib.mjs'

const WAKE_GIVE_UP_MS = 10000
const POLL_MS = 250
const NUDGE = 'Read your brief and your held folder, then act on them.'
const KINDS = ['report', 'question', 'request']
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

process.env.DCTR_CALLER = `sender:${process.env.DCTR_CALLER ?? ''}`
const say = (m) => process.stdout.write(`dctr-send: ${m}\n`)
const fail = (m) => { process.stderr.write(`dctr-send: ${m}\n`); process.exit(1) }
const readText = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return null } }
const stamp = () => new Date().toISOString().replace(/[-:.]/g, '')

/** Write `text` to `file` byte for byte, visible under its name only once complete; never over another file. */
function writeNew(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const part = path.join(path.dirname(file), `.${path.basename(file)}.part`)
  fs.writeFileSync(part, text)
  try { fs.linkSync(part, file) } finally { fs.rmSync(part, { force: true }) }
}

/** The kickoff chain from `dir`'s repo to its record: `{ recordPath, record, handoffPath, memoryPath }`, or `{ why }`. */
function recordOf(dir) {
  const projectDir = repoOf(path.join(dir, '.git'), fs.existsSync)
  const k = followKickoff({ projectDir, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
  return k.why ? k : { ...k, memoryPath: path.join(projectDir, 'SESSION_MEMORY.md') }
}

/** The orchestrator's relay line for a send or wake it makes, `ref` relative to the run. */
function relay(role, ref) {
  if (runRole() !== 'orchestrator') return
  const own = recordOf(process.cwd())
  if (own.why) { process.exitCode = 1; process.stderr.write(`dctr-send: no relay line written: ${own.why}\n`); return }
  appendRecordLine(own.recordPath, `- relay: ${new Date().toISOString()} orchestrator to ${role} ${ref}`)
}

/** The pane's reading, `{ status, session }`, or null when it cannot be got, carries no pane or names no session. */
function readPane(pane) {
  let reply
  try { reply = herdr(['pane', 'get', pane], bound()) } catch (e) { say(`the pane ${pane} could not be read (${String(e.message).split('\n')[0]})`); return null }
  const p = reply?.result?.pane
  const session = p?.agent_session?.value
  if (!p || typeof session !== 'string' || session === '') { say(`the reading of ${pane} carried no pane or no session`); return null }
  return { status: p.agent_status, session }
}

/** Type one fixed line; false when the call failed. */
function type(pane, line) {
  try { herdr(['pane', 'run', pane, line], bound()); return true } catch (e) { say(`could not type into ${pane} (${String(e.message).split('\n')[0]})`); return false }
}

/** Whether the session's transcript, as the pane's restore file names it, starts a turn at or after `since`: a `user`
 *  entry that is not meta and carries no tool result. True when the transcript cannot be found or read. */
function turnSince(pane, session, since) {
  let r
  try { r = JSON.parse(fs.readFileSync(restoreFile(pane), 'utf8')) } catch { return true }
  if (r?.session_id !== session || !r.transcript_path) return true
  const text = readText(r.transcript_path)
  const read = text === null ? null : transcriptEntries(text)
  if (!read || read.partial) return true
  return read.entries.some((e) => {
    if (e?.type !== 'user' || e.isMeta) return false
    const c = e.message?.content
    if (Array.isArray(c) && c.some((x) => x?.type === 'tool_result')) return false
    return !(Date.parse(e.timestamp) < since)
  })
}

/** Whether a wake may clear the session: warned in the record, handoff landed after, no R16 after, no turn since. */
function handedOff(rec, pane, session) {
  const warned = sessionWarned(rec.record.entries, session)
  if (!warned) return false
  let latch = null
  try { latch = JSON.parse(fs.readFileSync(path.join(stateDir(session), 'gauge.json'), 'utf8')) } catch { /* no latch: not landed */ }
  if (!handoffLanded({ handoffPath: rec.handoffPath, memoryPath: rec.memoryPath, warnedAt: latch?.session_id === session ? latch.warnedAt : null, timeoutMs: left() })) return false
  if (rec.record.entries.some((e) => e.line > warned.line && e.kind === 'auto-cycle' && e.sub === 'paused' && pauseCode(e.reason) === 'R16')) return false
  let since
  try { since = fs.statSync(rec.handoffPath).mtimeMs } catch { return false }
  return !turnSince(pane, session, since)
}

const [sub, ...args] = process.argv.slice(2)
let deadline = Date.now() + WAKE_GIVE_UP_MS
/** A wake's time left in its current wait; a send has no give-up, so its calls keep the default bound of `herdr(`. */
const left = () => (sub === 'wake' ? deadline - Date.now() : Infinity)
const bound = () => (sub === 'wake' ? Math.max(1, left()) : undefined)
const run = runRoot()
if (sub === 'report') {
  const [kind, text] = args, role = runRole()
  if (args.length !== 2 || !KINDS.includes(kind)) fail(`usage: report <${KINDS.join('|')}> <text>`)
  if (!role || !NAME.test(role)) fail('no role: DCTR_ROLE is unset or not a name')
  if (!run) fail('no run: DCTR_RUN is unset and this is not the orchestrator\'s repo')
  const file = path.join(run, 'inbox', `${stamp()}.${process.pid}-${role}-${kind}.md`)
  writeNew(file, text)
  say(`wrote ${file}`)
  process.exit(0)
}
if (!((sub === 'send' && args.length === 2) || (sub === 'wake' && args.length === 1)) || !NAME.test(args[0])) fail('usage: send <role> <text> | report <kind> <text> | wake <role>')
if (!run) fail('no run: DCTR_RUN is unset and this is not the orchestrator\'s repo')
const [role, text] = args
const heldDir = path.join(run, 'held', role)
if (sub === 'send') {
  const name = `${stamp()}.${process.pid}.md`
  writeNew(path.join(heldDir, name), text)
  say(`held ${path.join(heldDir, name)}`)
  relay(role, `held/${role}/${name}`)
} else relay(role, `held/${role}/`)
if (process.env.DCTR_VIEW_REQUEST_DIR) { say('contained: no pane call'); process.exit() }

const lane = laneOf(readText(path.join(run, 'lane.log')), role)
if (!lane) { say(`no create line for ${role} in lane.log: nothing typed`); process.exit() }
const pane = lane.pane
const claim = path.join(autoCycleDir(), `sender-${process.pid}.${paneToken(pane)}.claim`)

/** Everything after the claim is taken; the caller removes the claim whatever this returns. */
function deliver() {
  if (paneClaimHeld(pane, claim)) return say(`another claim on ${pane} is held: nothing typed`)
  const first = readPane(pane)
  if (!first) return
  const rec = recordOf(lane.worktree)
  if (rec.why) return say(`the record cannot be read (${rec.why}): nothing typed`)
  if (sub === 'send') {
    if (!READY_STATUSES.includes(first.status)) return say(`${pane} reads ${first.status}: nothing typed`)
    if (sessionWarned(rec.record.entries, first.session)) return say(`a warned line names ${first.session}: nothing typed`)
    if (type(pane, NUDGE)) say(`nudged ${pane}`)
    return
  }
  // wake: each line typed only after a fresh reading shows the pane ready on the session that line is for, within
  // the give-up of that line's wait.
  const lines = handedOff(rec, pane, first.session) ? ['/clear', RESUME_LINE, NUDGE] : [NUDGE]
  let session = first.session
  for (const [i, line] of lines.entries()) {
    // The first wait opened at the wake's start, so its window also bounds the first reading and handoff test.
    if (i > 0) deadline = Date.now() + WAKE_GIVE_UP_MS
    let r
    for (;;) {
      if (left() <= 0) return say(`${pane} never read ready: gave up before ${line}`)
      r = readPane(pane)
      if (!r) return
      // After /clear the pane is ready for the resume line once it reports a session other than the cleared one.
      if (READY_STATUSES.includes(r.status) && (line !== RESUME_LINE || r.session !== session)) break
      sleepMs(Math.min(POLL_MS, Math.max(0, left())))
    }
    if (line === RESUME_LINE) session = r.session
    else if (r.session !== session) return say(`${pane} reports ${r.session}, not ${session}: ${line} not typed`)
    if (line === '/clear') {
      const now = recordOf(lane.worktree)
      if (now.why || !handedOff(now, pane, session)) return say(`${session} is no longer cleared for a wake: /clear not typed`)
    }
    if (left() <= 0) return say(`${pane} read ready past the give-up: ${line} not typed`)
    if (!type(pane, line)) return
  }
  say(`woke ${pane}: ${lines.length === 1 ? 'nudged' : 'cleared, resumed and nudged'}`)
}

writeMarker(claim, { pid: process.pid, pane })
try { deliver() } finally { fs.rmSync(claim, { force: true }) }
