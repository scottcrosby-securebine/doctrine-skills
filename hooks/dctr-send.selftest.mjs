// Behavioral tamper test for the sender, hooks/dctr-send.mjs (E15 Messages), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-send.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 2 drives the sender end to end on fixture runs: an orchestrator repo whose project file names the Records
// path, a lane worktree whose kickoff chain names its record, a lane.log, and a `herdr` PATH shim that logs every call
// (argv, DCTR_CALLER, the claims it can see) and plays the lane's pane, changing on a given pane read what that read
// reports or a file it appends to, and taking a given time over each read where a case asks. Each defect case (a warned session, another
// claim, a claim or claim directory that cannot be read, a failed or empty reading, no create line, an unreadable record, containment, an unhanded wake, a pane never
// ready) sits beside its known-good twin, so a sender that types nothing passes none of them. TMPDIR is each fixture's
// own directory, so the claims and restore files live there. Clause 3 proves the fixtures carry what the clauses rest
// on without running the sender.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, execFileSync } from 'node:child_process'

let bad = 0
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-send-'))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
const { RESUME_LINE, pausedLine, pauseReason, pauseCode, paneToken, laneOf, sessionWarned, transcriptEntries } = await import('./dctr-lib.mjs')
const { parseRecord } = await import('./dctr-record.mjs')
const { autoCycleDir, stateDir, restoreFile, paneClaimHeld, handoffLanded } = await import('./dctr-state.mjs')
const SEND = path.join(import.meta.dirname, 'dctr-send.mjs')
const NUDGE = 'Read your brief and your held folder, then act on them.'
const PANE = 'w1:p1'

const SHIM = `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const dir = path.dirname(__dirname), st = path.join(dir, 'shim.json'), lg = path.join(dir, 'shim.log')
const a = process.argv.slice(2), s = JSON.parse(fs.readFileSync(st, 'utf8'))
const entry = { argv: a, caller: process.env.DCTR_CALLER ?? null, t: Date.now(), ppid: process.ppid }
const out = (o) => { fs.appendFileSync(lg, JSON.stringify(entry) + '\\n'); fs.writeFileSync(st, JSON.stringify(s)); process.stdout.write(JSON.stringify(o) + '\\n'); process.exit(0) }
const fail = (m) => { fs.appendFileSync(lg, JSON.stringify({ ...entry, failed: m }) + '\\n'); fs.writeFileSync(st, JSON.stringify(s)); process.stderr.write(m + '\\n'); process.exit(1) }
if (a[0] === 'pane' && a[1] === 'get') {
  if (s.listDir) entry.claims = fs.readdirSync(s.listDir).filter((f) => f.endsWith('.claim')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(s.listDir, f), 'utf8')) } catch { return {} } })
  if (s.onFirstRead && !s.firstDone) { s.firstDone = true; fs.appendFileSync(s.onFirstRead.file, s.onFirstRead.line + '\\n'); entry.appended = true }
  s.gets = (s.gets || 0) + 1
  for (const x of s.events || []) if (x.n === s.gets) { if (x.file) fs.appendFileSync(x.file, x.line + '\\n'); if (x.session) s.panes[a[2]].session = x.session; entry.event = x.n }
  if (s.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s.delayMs)
  if (s.paneGet === 'fail') fail('{"error":{"code":"server_error"}}')
  if (s.paneGet === 'empty') out({})
  const p = s.panes[a[2]]; if (!p) fail('{"error":{"code":"pane_not_found"}}')
  p.gets = (p.gets || 0) + 1
  for (const x of p.on || []) if (x.n === p.gets && x.rm) { fs.rmSync(x.rm, { force: true }); entry.removed = x.rm }
  if (p.failGets > 0) { p.failGets--; fail('{"error":{"code":"server_error"}}') }
  if (p.empty) out({})
  if (p.noAgent) { entry.status = 'no-agent'; out({ result: { pane: { pane_id: a[2], agent_status: 'unknown', focused: false } } }) }
  const status = p.busyUntil > Date.now() ? 'working' : p.busy > 0 ? (p.busy--, 'working') : p.status
  entry.status = status
  out({ result: { pane: { pane_id: a[2], agent_status: status, focused: false, agent_session: { value: p.session } } } })
}
if ([['pane', 'run'], ['agent', 'prompt'], ['pane', 'send-text'], ['pane', 'send-keys']].some(([x, y]) => a[0] === x && a[1] === y)) {
  entry.typed = { pane: a[2], text: a.slice(3).join(' ') }
  const p = s.panes[a[2]]
  if (p && p.typeFail) fail('{"error":{"code":"server_error"}}')
  if (p) { p.busy = s.busyAfterType || 0; if (s.busyAfterTypeMs) p.busyUntil = Date.now() + s.busyAfterTypeMs; if (entry.typed.text === '/clear' && s.clearSession) p.session = s.clearSession }
  // A slow reply: the line is delivered (logged) at once and the call returns only after runDelayMs.
  if (s.runDelayMs) { fs.appendFileSync(lg, JSON.stringify(entry) + '\\n'); fs.writeFileSync(st, JSON.stringify(s)); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s.runDelayMs); process.stdout.write('{"result":{}}\\n'); process.exit(0) }
}
out({ result: {} })
`

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t) }
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, stdio: 'ignore', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
const kickoff = (h) => `# memory\n\n## Next Session Kickoff\n\nhandoff: ${h} | state: open\n`
/** Run fn with TMPDIR set to the fixture's, as the sender's own process has it. */
const at = (fx, fn) => { const was = process.env.TMPDIR; process.env.TMPDIR = fx.T; try { return fn() } finally { process.env.TMPDIR = was } }

let n = 0
function fixture({ status = 'idle', session = 'S', laneRecord = '- State: Open\n', laneLog, shim = {} } = {}) {
  const dir = path.join(tmp, `f${++n}`), T = path.join(dir, 'tmp'); fs.mkdirSync(T, { recursive: true })
  const own = path.join(dir, 'own'); fs.mkdirSync(path.join(own, '.git'), { recursive: true })
  write(path.join(own, 'docs/PROJECT.md'), '# Project: fx\nState: Ruled\nRecords: .doctrine/records\n')
  write(path.join(own, 'SESSION_MEMORY.md'), kickoff('docs/handoffs/orch.md'))
  write(path.join(own, 'docs/handoffs/orch.md'), 'record: .doctrine/records/orch.md\n')
  const orchRecord = path.join(own, '.doctrine/records/orch.md'); write(orchRecord, 'wrapper: doctrine-orchestrate\n- State: Open\n')
  const run = path.join(own, '.doctrine/records/orchestrate')
  const lane = path.join(dir, 'lane')
  write(path.join(lane, '.gitignore'), 'docs/\nSESSION_MEMORY.md\n'); git(lane, 'init', '-q'); git(lane, 'add', '.'); git(lane, 'commit', '-qm', 'base')
  write(path.join(lane, 'SESSION_MEMORY.md'), kickoff('docs/handoffs/h.md'))
  const handoff = path.join(lane, 'docs/handoffs/h.md'); write(handoff, 'record: docs/records/a.md\n')
  const record = path.join(lane, 'docs/records/a.md'); write(record, laneRecord)
  const launch = `cd ${lane} && env DCTR_ROLE=a DCTR_RUN=${run} claude`
  write(path.join(run, 'lane.log'), laneLog ? laneLog(lane, launch) : `2026-11-08T09:00:00Z orchestrator create a ${PANE} ${lane} ${launch}\n`)
  const bin = path.join(dir, 'bin'); write(path.join(bin, 'herdr'), SHIM); fs.chmodSync(path.join(bin, 'herdr'), 0o755)
  write(path.join(dir, 'shim.json'), JSON.stringify({ panes: { [PANE]: { status, session, busy: 0 } }, ...shim }))
  write(path.join(dir, 'shim.log'), '')
  return { dir, T, own, run, lane, handoff, record, orchRecord, bin }
}
const setShim = (fx, patch) => { const p = path.join(fx.dir, 'shim.json'); fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), ...patch })) }
const shimLog = (fx) => fs.readFileSync(path.join(fx.dir, 'shim.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const typed = (fx) => shimLog(fx).filter((e) => e.typed).map((e) => `${e.typed.pane}|${e.typed.text}`)
const held = (fx, role = 'a') => { const d = path.join(fx.run, 'held', role); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => !f.startsWith('.')).sort().map((f) => path.join(d, f)) : [] }
const claims = (fx) => at(fx, () => fs.readdirSync(autoCycleDir()).filter((f) => f.endsWith('.claim')))
const relays = (fx) => parseRecord(fs.readFileSync(fx.orchRecord, 'utf8')).entries.filter((e) => e.kind === 'relay')
const nudged = (pane = PANE) => [`${pane}|${NUDGE}`]

const SCRUB = /^(DCTR_|HERDR_|CLAUDE_)/
function sender(fx, args, { env = {}, cwd = fx.own } = {}) {
  const e = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SCRUB.test(k)))
  Object.assign(e, { PATH: `${fx.bin}:${process.env.PATH}`, TMPDIR: fx.T, DCTR_ROLE: 'orchestrator', DCTR_RUN: fx.run, DCTR_CALLER: 'orchestrator' }, env)
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k]
  return new Promise((resolve) => {
    const t0 = Date.now(), c = spawn(process.execPath, [SEND, ...args], { cwd, env: e, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    c.stderr.on('data', (d) => { err += d })
    const kill = setTimeout(() => c.kill('SIGKILL'), 30000)
    c.on('close', (code) => { clearTimeout(kill); resolve({ code, err: err.trim(), pid: c.pid, took: Date.now() - t0 }) })
  })
}
const show = (fx, r) => JSON.stringify({ code: r?.code, err: r?.err, typed: typed(fx), held: held(fx).map((f) => path.basename(f)), calls: shimLog(fx).map((e) => e.argv.slice(0, 3).join(' ')) })

// Wake fixtures: the gauge latch for each session, the restore file naming the pane's transcript, the handoff's mtime.
const ts = (ms) => new Date(ms).toISOString()
const asst = (ms) => ({ type: 'assistant', timestamp: ts(ms), message: { role: 'assistant', content: [{ type: 'text', text: 'working' }] } })
const toolResult = (ms) => ({ type: 'user', timestamp: ts(ms), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
const attach = (ms) => ({ type: 'attachment', timestamp: ts(ms), attachment: { type: 'hook_additional_context', content: ['context'] } })
const turn = (ms) => ({ type: 'user', timestamp: ts(ms), message: { role: 'user', content: NUDGE } })
function handed(fx, { latch, warnedAt, handoffAt, session, transcript }) {
  at(fx, () => {
    for (const s of latch) write(path.join(stateDir(s), 'gauge.json'), JSON.stringify({ session_id: s, warnedAt }))
    const tr = path.join(fx.dir, 'transcript.jsonl')
    write(tr, transcript.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n')
    write(restoreFile(PANE), JSON.stringify({ session_id: session, transcript_path: tr }))
  })
  fs.utimesSync(fx.handoff, handoffAt / 1000, handoffAt / 1000)
}

// ---------------------------------------------------------------- clause 2: the sender end to end

const idle = fixture()
const rIdle = await sender(idle, ['send', 'a', 'hello lane'])
const idleName = held(idle).map((f) => path.basename(f))
clause('clause 2a — send to an idle lane: exit 0, one file under held/a/ holding the text, named <stamp>.<the sender\'s pid>.md, the nudge typed once, and its claim removed',
  rIdle.code === 0 && idleName.length === 1 && new RegExp(`^\\d{8}T\\d{9}Z\\.${rIdle.pid}\\.md$`).test(idleName[0]) &&
  fs.readFileSync(held(idle)[0], 'utf8') === 'hello lane' && JSON.stringify(typed(idle)) === JSON.stringify(nudged()) && claims(idle).length === 0, show(idle, rIdle))
clause('clause 2a2 — every call carries DCTR_CALLER sender: followed by the inherited value',
  shimLog(idle).length > 0 && shimLog(idle).every((e) => e.caller === 'sender:orchestrator'), JSON.stringify(shimLog(idle).map((e) => e.caller)))

const race = fixture()
setShim(race, { onFirstRead: { file: race.record, line: '- auto-cycle: warned S 20%' } })
const rRace = await sender(race, ['send', 'a', 'hello lane'])
clause('clause 2b — a warned line naming the pane\'s session, written while the first pane read answers: the message held, nothing typed (D6)',
  rRace.code === 0 && held(race).length === 1 && typed(race).length === 0, show(race, rRace))

const woken = fixture({ session: 'NEW', laneRecord: '- State: Open\n- auto-cycle: warned OLD 20%\n',
  laneLog: (lane, launch) => `2026-11-08T08:00:00Z orchestrator create a w9:p9 ${lane} ${launch}\n2026-11-08T09:00:00Z orchestrator create a ${PANE} ${lane} ${launch}\n2026-11-08T09:05:00Z orchestrator reset a HEAD\n` })
setShim(woken, { panes: { [PANE]: { status: 'idle', session: 'NEW', busy: 0 }, 'w9:p9': { status: 'idle', session: 'NEW', busy: 0 } } })
const rWoken = await sender(woken, ['send', 'a', 'hello lane'])
clause('clause 2c — a lane woken by hand, its warned line naming an earlier session: the nudge typed once into the pane its latest create line names (D97)',
  rWoken.code === 0 && JSON.stringify(typed(woken)) === JSON.stringify(nudged()) && !shimLog(woken).some((e) => e.argv.includes('w9:p9')), show(woken, rWoken))

const claimBad = []
for (const live of [true, false]) {
  const fx = fixture()
  // A live pid is this suite's; a dead one is a process that has already exited.
  const pid = live ? process.pid : spawnSync('true').pid
  at(fx, () => write(path.join(autoCycleDir(), `sender-${pid}.${paneToken(PANE)}.claim`), JSON.stringify({ pid, pane: PANE })))
  // Each command judged on its own lines, so a check that only one of them reads is seen to.
  const want = JSON.stringify(live ? [] : nudged())
  const s = await sender(fx, ['send', 'a', 'hello lane']), afterSend = typed(fx)
  if (s.code !== 0 || held(fx).length !== 1 || JSON.stringify(afterSend) !== want) claimBad.push(`${live ? 'live' : 'dead'} send: ${show(fx, s)}`)
  const w = await sender(fx, ['wake', 'a'])
  if (w.code !== 0 || JSON.stringify(typed(fx).slice(afterSend.length)) !== want) claimBad.push(`${live ? 'live' : 'dead'} wake: ${show(fx, w)}`)
}
clause('clause 2d — another claim on the pane with a live pid: send and wake type nothing; the same claim whose pid is dead does not hold, and each nudges (D96)',
  claimBad.length === 0, claimBad.join(' || '))

// A claim file that cannot be parsed, and a claim directory that can be written and not read: each counts as held.
const unreadBad = []
const corrupt = fixture()
at(corrupt, () => write(path.join(autoCycleDir(), 'torn.claim'), '{"pid": '))
const unlisted = fixture()
const unlistedDir = at(unlisted, () => autoCycleDir())
fs.chmodSync(unlistedDir, 0o300)
try {
  for (const [label, fx] of [['a torn claim', corrupt], ['an unreadable claim directory', unlisted]]) {
    const r = await sender(fx, ['send', 'a', 'hello lane']), w = await sender(fx, ['wake', 'a'])
    if (r.code !== 0 || w.code !== 0 || held(fx).length !== 1 || typed(fx).length !== 0) unreadBad.push(`${label}: ${show(fx, r)}`)
  }
} finally { fs.chmodSync(unlistedDir, 0o700) }
clause('clause 2d2 — a claim file that cannot be parsed, or a claim directory that cannot be read: send and wake type nothing and the message is held (SS3)',
  unreadBad.length === 0, unreadBad.join(' || '))

const order = fixture()
setShim(order, { listDir: at(order, () => autoCycleDir()) })
const rOrder = await sender(order, ['send', 'a', 'hello lane'])
const gets = shimLog(order).filter((e) => e.argv[1] === 'get')
clause('clause 2e — the sender takes its claim before it reads the pane: every pane read finds a claim naming the pane with the sender\'s pid (D147)',
  rOrder.code === 0 && gets.length > 0 && gets.every((e) => (e.claims || []).some((c) => c.pane === PANE && c.pid === rOrder.pid)), JSON.stringify(gets.map((e) => e.claims)))

const unknownBad = []
const UNKNOWN = [['pane get fails', (fx) => setShim(fx, { paneGet: 'fail' })], ['pane get prints {}', (fx) => setShim(fx, { paneGet: 'empty' })],
  ['the pane working', (fx) => setShim(fx, { panes: { [PANE]: { status: 'working', session: 'S', busy: 0 } } })],
  ['no create line for a', (fx) => write(path.join(fx.run, 'lane.log'), `2026-11-08T09:00:00Z orchestrator create b ${PANE} ${fx.lane} cd ${fx.lane}\n`)],
  ['no lane.log', (fx) => fs.rmSync(path.join(fx.run, 'lane.log'))],
  ['the record unreadable', (fx) => fs.rmSync(fx.record)]]
for (const [label, prep] of UNKNOWN) {
  const fx = fixture(); prep(fx)
  const r = await sender(fx, ['send', 'a', 'hello lane'])
  if (r.code !== 0 || held(fx).length !== 1 || typed(fx).length !== 0) unknownBad.push(`${label}: ${show(fx, r)}`)
}
clause('clause 2f — a failed or empty pane reading, a pane not ready, no create line for the role, no lane.log, or an unreadable record: the message held, nothing typed (D98, D197, D198)',
  unknownBad.length === 0, unknownBad.join(' || '))

const contained = fixture()
const rCont = await sender(contained, ['send', 'a', 'hello lane'], { env: { DCTR_VIEW_REQUEST_DIR: path.join(contained.dir, 'vr') } })
const rContWake = await sender(contained, ['wake', 'a'], { env: { DCTR_VIEW_REQUEST_DIR: path.join(contained.dir, 'vr') } })
clause('clause 2g — contained: send holds the message, and neither send nor wake makes a call (D99)',
  rCont.code === 0 && rContWake.code === 0 && held(contained).length === 1 && shimLog(contained).length === 0, show(contained, rCont))

const tag = fixture()
const rTagS = await sender(tag, ['send', 'a', 'x'], { env: { DCTR_CALLER: 'watcher' } }), rTagW = await sender(tag, ['wake', 'a'], { env: { DCTR_CALLER: 'watcher' } })
clause('clause 2h — DCTR_CALLER=watcher: every call of a send and a wake carries sender:watcher (D161)',
  rTagS.code === 0 && rTagW.code === 0 && shimLog(tag).length > 0 && shimLog(tag).every((e) => e.caller === 'sender:watcher'), JSON.stringify(shimLog(tag).map((e) => e.caller)))

const BODY = `l1 'q' "d" $x \\\n\nl3\n`
const body = fixture({ status: 'working' })
const rBody = await sender(body, ['send', 'a', BODY])
const pids = {}, rep = {}
for (const k of ['report', 'question', 'request']) { rep[k] = await sender(body, ['report', k, k === 'report' ? BODY : `a ${k}`], { env: { DCTR_ROLE: 'a', DCTR_CALLER: 'a' }, cwd: body.lane }); pids[k] = rep[k].pid }
const inbox = () => (fs.existsSync(path.join(body.run, 'inbox')) ? fs.readdirSync(path.join(body.run, 'inbox')).filter((f) => !f.startsWith('.')).sort() : [])
const got = inbox()
const bogus = await sender(body, ['report', 'bogus', 'x'], { env: { DCTR_ROLE: 'a', DCTR_CALLER: 'a' }, cwd: body.lane })
const kindsOk = got.length === 3 && got.every((f) => { const m = /^\d{8}T\d{9}Z\.(\d+)-a-(report|question|request)\.md$/.exec(f); return m && Number(m[1]) === pids[m[2]] })
const reportFile = got.find((f) => f.endsWith('-a-report.md'))
clause('clause 2i — report: one inbox file per kind named <stamp>.<that sender\'s pid>-<role>-<kind>.md; an unknown kind exits non-zero and writes nothing; held and inbox files hold the text byte for byte (D100, D101)',
  rBody.code === 0 && Object.values(rep).every((r) => r.code === 0) && kindsOk && bogus.code !== 0 && inbox().length === 3 &&
  fs.readFileSync(held(body)[0], 'utf8') === BODY && fs.readFileSync(path.join(body.run, 'inbox', reportFile), 'utf8') === BODY, JSON.stringify({ got, pids, bogus: bogus.code }))

const relay = fixture({ status: 'working' })
for (const t of ['one', 'two']) await sender(relay, ['send', 'a', t], { env: { DCTR_RUN: undefined } })
await sender(relay, ['send', 'a', 'from a lane'], { env: { DCTR_ROLE: 'b', DCTR_CALLER: 'b' } })
await sender(relay, ['wake', 'a'], { env: { DCTR_RUN: undefined } })
const real = (p) => { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }
const rl = relays(relay), refAbs = (e) => real(path.resolve(relay.run, e.ref))
clause('clause 2j — the orchestrator\'s sends and wake each append one relay line, a send\'s naming its held file and the wake\'s the held folder; a lane\'s send appends none (D102, D194)',
  rl.length === 3 && rl.every((e) => e.to === 'a' && e.from === 'orchestrator') && JSON.stringify(rl.slice(0, 2).map(refAbs)) === JSON.stringify(held(relay).slice(0, 2).map(real)) &&
  refAbs(rl[2]) === real(path.join(relay.run, 'held/a')) && rl[2].ref.endsWith('/') && held(relay).length === 3, JSON.stringify(rl))

const H = Date.now() - 600000
const handedFx = fixture({ laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { busyAfterType: 2, clearSession: 'S-next' } })
handed(handedFx, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: [asst(H - 120000), asst(H + 1000), toolResult(H + 2000), attach(H + 3000)] })
const rHanded = await sender(handedFx, ['wake', 'a'])
let last = null; const early = []
for (const e of shimLog(handedFx)) { if (e.argv[1] === 'get') last = e.status; if (e.typed) { if (last !== 'idle') early.push(e.typed.text); last = null } }
clause('clause 2k — wake on a warned session whose handoff landed after the warning and that started no turn since: /clear, the resume line and the nudge, in order, each after a ready read (D104)',
  rHanded.code === 0 && JSON.stringify(typed(handedFx)) === JSON.stringify([`${PANE}|/clear`, `${PANE}|${RESUME_LINE}`, `${PANE}|${NUDGE}`]) && early.length === 0, show(handedFx, rHanded) + ` early ${JSON.stringify(early)}`)

const before = H - 60000, after = H + 60000
const clean = [asst(H - 120000), toolResult(H + 1000), attach(H + 2000)]
const worked = [asst(H - 120000), turn(H + 1000), asst(H + 2000)]
const R16 = pausedLine(pauseReason('R16')), R17 = pausedLine(pauseReason('R17', 'herdr could not read the pane'))
const UNHANDED = [
  ['handoff older than the warning', { latch: ['S'], warnedAt: after, transcript: clean, session: 'S' }, '- auto-cycle: warned S 20%\n', 'S'],
  ['warned S1, the pane on S2', { latch: ['S1', 'S2'], warnedAt: before, transcript: clean, session: 'S2' }, '- auto-cycle: warned S1 20%\n', 'S2'],
  ['an R16 paused line after the warning', { latch: ['S'], warnedAt: before, transcript: clean, session: 'S' }, `- auto-cycle: warned S 20%\n${R16}\n`, 'S'],
  ['a turn since the handoff, R17 after the warning', { latch: ['S'], warnedAt: before, transcript: worked, session: 'S' }, `- auto-cycle: warned S 20%\n${R17}\n`, 'S'],
  ['a turn since the handoff', { latch: ['S'], warnedAt: before, transcript: worked, session: 'S' }, '- auto-cycle: warned S 20%\n', 'S'],
  ['a damaged transcript line before the last', { latch: ['S'], warnedAt: before, transcript: [clean[0], '{"type":"assistant","timest', ...clean.slice(1)], session: 'S' }, '- auto-cycle: warned S 20%\n', 'S'],
  ['no restore file for the session', { latch: ['S'], warnedAt: before, transcript: clean, session: 'OTHER' }, '- auto-cycle: warned S 20%\n', 'S'],
]
const unhandedBad = [], unhandedFx = []
for (const [label, h, lines, session] of UNHANDED) {
  const fx = fixture({ session, laneRecord: `- State: Open\n${lines}` })
  handed(fx, { handoffAt: H, ...h }); unhandedFx.push([label, fx, h, session])
  const r = await sender(fx, ['wake', 'a'])
  if (r.code !== 0 || JSON.stringify(typed(fx)) !== JSON.stringify(nudged())) unhandedBad.push(`${label}: ${show(fx, r)}`)
}
clause('clause 2l — wake types only the nudge when the handoff predates the warning, the warning names another session, an R16 line follows it, the session started a turn since the handoff, its transcript is damaged, or no restore file names it (D103)',
  unhandedBad.length === 0, unhandedBad.join(' || '))

const burst = fixture({ status: 'working' })
const [b1, b2] = await Promise.all([sender(burst, ['send', 'a', 'first']), sender(burst, ['send', 'a', 'second'])])
clause('clause 2m — two sends in the same instant: both messages kept (D7)',
  b1.code === 0 && b2.code === 0 && JSON.stringify(held(burst).map((f) => fs.readFileSync(f, 'utf8')).sort()) === '["first","second"]', show(burst, b1))

const usage = fixture()
const uBad = await Promise.all([[], ['send', 'a'], ['send', '../x', 'y'], ['wake'], ['nope', 'a']].map((a) => sender(usage, a)))
clause('clause 2n — a malformed call (no subcommand, no text, a role that is not a name, no role, an unknown subcommand) exits non-zero and writes and types nothing',
  uBad.every((r) => r.code !== 0) && !fs.existsSync(path.join(usage.run, 'held')) && shimLog(usage).length === 0, JSON.stringify(uBad.map((r) => r.code)))

const slow = fixture({ status: 'working', laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n' })
handed(slow, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
const seed = path.join(slow.run, 'held/a/20261108T090000000Z.1.md'); write(seed, 'seeded\n')
const rSlow = await sender(slow, ['wake', 'a'])
clause('clause 2o — wake on a pane that never reads ready: nothing typed, it gives up by itself between 9.5 s and 10.8 s, and held/a/ is as it was (D196)',
  rSlow.code !== null && rSlow.took >= 9500 && rSlow.took <= 10800 && typed(slow).length === 0 && JSON.stringify(held(slow)) === JSON.stringify([seed]) && fs.readFileSync(seed, 'utf8') === 'seeded\n',
  `${rSlow.took} ms; ${show(slow, rSlow)}`)

// Each wake reads the pane working three times, and on its second read something changes: the pane reports another
// session, an R16 paused line follows the warning, or the transcript starts a turn. The control changes nothing.
const NOW = Date.now()
const DURING = [
  ['nothing changes', () => [], [`${PANE}|/clear`, `${PANE}|${RESUME_LINE}`, `${PANE}|${NUDGE}`]],
  ['the pane reports another session', () => [{ n: 2, session: 'S2' }], []],
  ['an R16 paused line follows the warning', (fx) => [{ n: 2, file: fx.record, line: R16 }], []],
  ['the session starts a turn', (fx) => [{ n: 2, file: path.join(fx.dir, 'transcript.jsonl'), line: JSON.stringify(turn(NOW)) }], []],
  ['an unhanded pane reports another session', () => [{ n: 2, session: 'S2' }], [], '- State: Open\n'],
  ['an unhanded pane, nothing changes', () => [], nudged(), '- State: Open\n'],
]
const duringBad = [], duringFx = []
for (const [label, events, want, laneRecord = '- State: Open\n- auto-cycle: warned S 20%\n'] of DURING) {
  const fx = fixture({ laneRecord, shim: { busyAfterType: 2, clearSession: 'S-next' } })
  handed(fx, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
  setShim(fx, { panes: { [PANE]: { status: 'idle', session: 'S', busy: 3 } }, events: events(fx) }); duringFx.push([label, fx])
  const r = await sender(fx, ['wake', 'a'])
  if (r.code !== 0 || JSON.stringify(typed(fx)) !== JSON.stringify(want) || held(fx).length !== 0) duringBad.push(`${label}: ${show(fx, r)}`)
}
clause('clause 2p — a wake reads again before each line: the pane reporting another session, an R16 line following the warning, or a turn started while it waits for a ready reading stops it typing; with nothing changed it types all its lines (SS4)',
  duringBad.length === 0, duringBad.join(' || '))

// Each pane read takes 6 s, so a wake whose reads are not bounded by its give-up runs past 12 s.
const slowShim = fixture({ status: 'working', laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { delayMs: 6000 } })
handed(slowShim, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
const rSlowShim = await sender(slowShim, ['wake', 'a'])
clause('clause 2q — a wake whose every pane read takes 6 s ends no sooner than 9.5 s and by 10.8 s, typing nothing, its reads bounded by the time left (SS5)',
  rSlowShim.code === 0 && rSlowShim.took >= 9500 && rSlowShim.took <= 10800 && typed(slowShim).length === 0, `${rSlowShim.took} ms; ${show(slowShim, rSlowShim)}`)

// The pane reads working for 8 s, then ready; after each typed line it reads working for 3 s more. A wake whose waits
// share one window from its start types /clear and gives up before the resume line.
const late = fixture({ laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { busyAfterTypeMs: 3000, clearSession: 'S-next' } })
handed(late, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
setShim(late, { panes: { [PANE]: { status: 'idle', session: 'S', busy: 0, busyUntil: Date.now() + 8000 } } })
const rLate = await sender(late, ['wake', 'a'])
clause('clause 2r — a handed-off pane busy for most of the first wait, and busy a while after each typed line: the wake types /clear, the resume line and the nudge, each wait with its own give-up (SS-1(c))',
  rLate.code === 0 && JSON.stringify(typed(late)) === JSON.stringify([`${PANE}|/clear`, `${PANE}|${RESUME_LINE}`, `${PANE}|${NUDGE}`]), `${rLate.took} ms; ${show(late, rLate)}`)

// A claim on the pane with a live pid, readable once: every later read of the file fails with EIO.
const twice = fixture()
const twiceFile = at(twice, () => path.join(autoCycleDir(), 'other.claim'))
write(twiceFile, JSON.stringify({ pid: process.pid, pane: PANE }))
let twiceReads = 0
const failLaterReads = () => {
  const real = fs.readFileSync
  twiceReads = 0
  fs.readFileSync = function (f, ...r) {
    if (String(f) === twiceFile && ++twiceReads > 1) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' })
    return real.call(this, f, ...r)
  }
  return () => { fs.readFileSync = real }
}
let twiceHeld
{ const undo = failLaterReads(); try { twiceHeld = at(twice, () => paneClaimHeld(PANE)) } finally { undo() } }
clause('clause 2s — a live claim on the pane whose file reads cleanly once and fails on any later read: paneClaimHeld counts it held, reading it once (SC1)',
  twiceHeld === true && twiceReads === 1, JSON.stringify({ twiceHeld, twiceReads }))

// A git on PATH that takes 15 s over every call: the wake's handoff test must not carry it past its give-up.
const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
const GIT_SHIM = `#!/usr/bin/env node
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000)
const r = require('child_process').spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' })
process.exit(r.status ?? 1)
`
const slowGit = fixture({ laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { busyAfterType: 2, clearSession: 'S-next' } })
handed(slowGit, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
const slowGitBin = path.join(slowGit.dir, 'gitbin'); write(path.join(slowGitBin, 'git'), GIT_SHIM); fs.chmodSync(path.join(slowGitBin, 'git'), 0o755)
const rSlowGit = await sender(slowGit, ['wake', 'a'], { env: { PATH: `${slowGit.bin}:${slowGitBin}:${process.env.PATH}` } })
clause('clause 2t — a wake on a handed-off pane whose every git call takes 15 s ends by 10.8 s and types no /clear, its git calls bounded by the time left (SC3)',
  rSlowGit.code === 0 && rSlowGit.took <= 10800 && !typed(slowGit).includes(`${PANE}|/clear`), `${rSlowGit.took} ms; ${show(slowGit, rSlowGit)}`)
const wasPath = process.env.PATH; process.env.PATH = `${slowGitBin}:${wasPath}`
const gt0 = Date.now(); let gitLanded
try { gitLanded = at(slowGit, () => handoffLanded({ handoffPath: slowGit.handoff, memoryPath: path.join(slowGit.lane, 'SESSION_MEMORY.md'), warnedAt: H - 60000, timeoutMs: 1000 })) } finally { process.env.PATH = wasPath }
const gitTook = Date.now() - gt0
clause('clause 2u — handoffLanded given 1 s on that slow git: false within 2 s, a git call that times out never reading as landed (SC3)',
  gitLanded === false && gitTook < 2000, JSON.stringify({ gitLanded, gitTook }))

// The pane reads ready only near the first window's end, and each typing call takes 1 s to return after the line is
// delivered. A typing call bounded by the window's last few hundred ms fails after /clear is delivered.
const nearEnd = fixture({ laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { busyAfterType: 2, clearSession: 'S-next', runDelayMs: 1000 } })
handed(nearEnd, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
setShim(nearEnd, { panes: { [PANE]: { status: 'idle', session: 'S', busy: 0, busyUntil: Date.now() + 9300 } } })
const rNearEnd = await sender(nearEnd, ['wake', 'a'])
clause('clause 2v — a pane that reads ready near the end of the first wait, each typing call slow to return: the wake still types /clear, the resume line and the nudge, a decided line typed with the default bound of herdr( (SR2)',
  rNearEnd.code === 0 && JSON.stringify(typed(nearEnd)) === JSON.stringify([`${PANE}|/clear`, `${PANE}|${RESUME_LINE}`, `${PANE}|${NUDGE}`]), `${rNearEnd.took} ms; ${show(nearEnd, rNearEnd)}`)

// The class check: every read handedOff makes, each absent, empty, unreadable or timed out where that applies, on a
// handed-off lane whose handoff is tracked and committed (so every git call runs). No row may type /clear; the
// healthy control row, through the same git shim, does.
const MODE_GIT = `#!/usr/bin/env node
const fs = require('fs'), path = require('path'), cp = require('child_process')
let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(__dirname, 'mode.json'), 'utf8')) } catch {}
// A row names its git call by arguments that call alone carries, found as one contiguous run anywhere in argv.
const a = process.argv.slice(2), k = m.args || []
if (k.length && a.some((_, i) => k.every((x, j) => a[i + j] === x))) {
  if (m.mode === 'fail') { process.stderr.write('fatal: unable to read: Input/output error\\n'); process.exit(128) }
  if (m.mode === 'empty') process.exit(0)
  if (m.mode === 'boundary' && !process.env.GIT_DISCOVERY_ACROSS_FILESYSTEM) { process.stderr.write('fatal: not a git repository (or any parent up to mount point /)\\nStopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).\\n'); process.exit(128) }
  if (m.mode === 'ceiling' && process.env.GIT_CEILING_DIRECTORIES) { process.stderr.write('fatal: not a git repository (or any of the parent directories): .git\\n'); process.exit(128) }
  if (m.mode === 'slow') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000)
}
const r = cp.spawnSync(${JSON.stringify(realGit)}, a, { stdio: 'inherit' })
process.exit(r.status ?? 1)
`
const nodeBin = path.join(tmp, 'nodebin'); fs.mkdirSync(nodeBin, { recursive: true }); fs.symlinkSync(process.execPath, path.join(nodeBin, 'node'))
function classFx() {
  const fx = fixture({ laneRecord: '- State: Open\n- auto-cycle: warned S 20%\n', shim: { busyAfterType: 2, clearSession: 'S-next' } })
  fs.writeFileSync(path.join(fx.lane, '.gitignore'), ''); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'handoff')
  handed(fx, { latch: ['S'], warnedAt: H - 60000, handoffAt: H, session: 'S', transcript: clean })
  fx.gitBin = path.join(fx.dir, 'gitbin'); write(path.join(fx.gitBin, 'git'), MODE_GIT); fs.chmodSync(path.join(fx.gitBin, 'git'), 0o755)
  fx.path = `${fx.bin}:${fx.gitBin}:${process.env.PATH}`
  fx.restore = at(fx, () => restoreFile(PANE)); fx.transcript = path.join(fx.dir, 'transcript.jsonl'); fx.latch = at(fx, () => path.join(stateDir('S'), 'gauge.json'))
  return fx
}
const memory = (fx) => path.join(fx.lane, 'SESSION_MEMORY.md')
const latchOf = (fx, s) => at(fx, () => { try { return JSON.parse(fs.readFileSync(path.join(stateDir(s), 'gauge.json'), 'utf8')).warnedAt } catch { return null } })
// The lane's docs directory moved to a second repository, committed there, and committed in the lane as a link to it.
const docsLink = (fx) => {
  fx.repoB = path.join(fx.dir, 'repoB'); fs.mkdirSync(fx.repoB); fs.renameSync(path.join(fx.lane, 'docs'), path.join(fx.repoB, 'docs')); git(fx.repoB, 'init', '-q'); git(fx.repoB, 'add', '-A'); git(fx.repoB, 'commit', '-qm', 'docs')
  fs.symlinkSync(path.join(fx.repoB, 'docs'), path.join(fx.lane, 'docs')); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link docs')
}
// The handoff moved to a directory outside every repository and committed in the lane as a link to it.
const outLink = (fx) => {
  fx.out = path.join(fx.dir, 'out'); fs.mkdirSync(fx.out); fs.renameSync(fx.handoff, path.join(fx.out, 'h.md')); fs.symlinkSync(path.join(fx.out, 'h.md'), fx.handoff)
  git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link handoff')
}
// The handoff or memory file committed in the lane as a link to a link committed in repoB, which reaches f1.md
// committed in repoC beside f2.md; `retarget` points repoB's link at f2.md without a commit.
const chain = (fx, f, tag = '') => {
  fx.b = path.join(fx.dir, `repoB${tag}`); fx.c = path.join(fx.dir, `repoC${tag}`); fx.chained = f
  for (const d of [fx.b, fx.c]) { fs.mkdirSync(d); git(d, 'init', '-q') }
  fs.renameSync(f, path.join(fx.c, 'f1.md')); fs.copyFileSync(path.join(fx.c, 'f1.md'), path.join(fx.c, 'f2.md')); git(fx.c, 'add', '-A'); git(fx.c, 'commit', '-qm', 'files')
  fs.symlinkSync(`../repoC${tag}/f1.md`, path.join(fx.b, 'f.md')); git(fx.b, 'add', '-A'); git(fx.b, 'commit', '-qm', 'link')
  fs.symlinkSync(path.join(fx.b, 'f.md'), f); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link')
}
const retarget = (fx) => { fs.rmSync(path.join(fx.b, 'f.md')); fs.symlinkSync(`../${path.basename(fx.c)}/f2.md`, path.join(fx.b, 'f.md')) }
const gitMode = (call, mode) => (fx) => write(path.join(fx.gitBin, 'mode.json'), JSON.stringify({ args: call.split(' '), mode }))
// Each git call handoffLanded makes, keyed by the arguments that name it, with that call as it runs on the lane's handoff.
const GITCALLS = {
  'rev-parse --show-toplevel': ['rev-parse', '--show-toplevel'], 'check-ignore -q': ['check-ignore', '-q', 'docs/handoffs/h.md'],
  'ls-files --error-unmatch': ['ls-files', '--error-unmatch', '--', 'docs/handoffs/h.md'], 'log -1 --format=%ct': ['log', '-1', '--format=%ct', '--', 'docs/handoffs/h.md'],
  'ls-files -v -z': ['ls-files', '-v', '-z', '--', 'docs/handoffs/h.md'], 'status --porcelain': ['status', '--porcelain', '--ignored=no', '--', 'docs/handoffs/h.md'],
}
// A core.fsmonitor hook that reports nothing changed since any token, so git's status trusts every entry it has marked valid.
const lyingMonitor = (fx, f) => {
  const hook = path.join(fx.dir, 'fsmonitor.sh'); write(hook, '#!/bin/sh\nprintf "tok\\0"\n'); fs.chmodSync(hook, 0o755)
  git(fx.lane, 'config', 'core.fsmonitor', hook); git(fx.lane, 'status', '--porcelain'); sleep(1100); git(fx.lane, 'status', '--porcelain')
  if (!f) return
  fs.appendFileSync(f, 'unlanded edit\n')
  // Proved here, before the sender runs, since a status with the monitor off clears the valid bit it would read: a plain
  // status is empty while the file differs from HEAD's blob under that bit, and a copy's status with the monitor off names it.
  const g = (cwd, ...a) => spawnSync(realGit, ['-C', cwd, ...a], { encoding: 'utf8' }).stdout, rel = path.relative(fx.lane, f), copy = path.join(fx.dir, 'monitor-off')
  fs.cpSync(fx.lane, copy, { recursive: true, verbatimSymlinks: true })
  fx.monitorProof = g(fx.lane, 'status', '--porcelain') === '' && g(fx.lane, 'hash-object', '--', rel) !== g(fx.lane, 'rev-parse', `HEAD:${rel}`) &&
    g(fx.lane, 'ls-files', '-f', '--', rel) === `h ${rel}\n` && g(copy, '-c', 'core.fsmonitor=false', 'status', '--porcelain') === ` M ${rel}\n`
}
// The committed handoff ends in a note, the index refreshed under the given repository config, then the note rewritten
// to text of the same size with the mtime set back to the same value, so only ctime and the sub-second stat fields move.
const sameStat = (fx, config, edit = true) => {
  fs.appendFileSync(fx.handoff, 'note: AAAA\n'); git(fx.lane, 'commit', '-qam', 'note'); fs.utimesSync(fx.handoff, H / 1000, H / 1000)
  for (const [k, v] of config) git(fx.lane, 'config', k, v)
  sleep(1100); git(fx.lane, 'status', '--porcelain'); fx.mtimeNs = fs.statSync(fx.handoff, { bigint: true }).mtimeNs
  if (edit) { fs.writeFileSync(fx.handoff, fs.readFileSync(fx.handoff, 'utf8').replace('AAAA', 'BBBB')); fs.utimesSync(fx.handoff, H / 1000, H / 1000) }
}
const fileRows = (label, key) => [[`${label} absent`, (fx) => fs.rmSync(fx[key])], [`${label} empty`, (fx) => fs.writeFileSync(fx[key], '')], [`${label} unreadable`, (fx) => fs.chmodSync(fx[key], 0)]]
const CLASS = [
  ...fileRows('the restore file', 'restore'), ...fileRows('the transcript', 'transcript'), ...fileRows('the latch', 'latch'), ...fileRows('the record', 'record'),
  ['git absent', (fx) => { fx.path = `${fx.bin}:${nodeBin}` }],
  ...Object.keys(GITCALLS).flatMap((call) => [[`git ${call} fails`, gitMode(call, 'fail')], [`git ${call} times out`, gitMode(call, 'slow')]]),
  ['git rev-parse --show-toplevel prints nothing', gitMode('rev-parse --show-toplevel', 'empty')], ['git log -1 --format=%ct prints nothing', gitMode('log -1 --format=%ct', 'empty')],
  // A status that git's own repository config lets skip a modified file: a lying fsmonitor, or a stat check too coarse to see a same-size edit.
  ['a committed handoff modified under a core.fsmonitor hook that reports nothing changed', (fx) => lyingMonitor(fx, fx.handoff)],
  ['a memory file modified under a core.fsmonitor hook that reports nothing changed', (fx) => lyingMonitor(fx, memory(fx))],
  ['a committed handoff rewritten at the same size and mtime under the repository\'s own core.checkStat=minimal', (fx) => sameStat(fx, [['core.checkStat', 'minimal']])],
  ['a committed handoff rewritten at the same size and mtime under the repository\'s own core.trustctime=false', (fx) => sameStat(fx, [['core.trustctime', 'false']])],
  // Two git failures that print the no-repository phrase with a path after it, inside a real repository.
  ['GIT_DIR names nothing', (fx) => { fs.appendFileSync(fx.handoff, 'unlanded edit\n'); fx.env = { GIT_DIR: '/dev/null' } }],
  // A GIT_DIR (with its GIT_WORK_TREE) naming another repository whose commit carries the lane's unlanded handoff, which only the lane's own repo shows as unlanded.
  ['GIT_DIR names another repository', (fx) => {
    fs.appendFileSync(fx.handoff, 'unlanded edit\n'); fx.other = path.join(fx.dir, 'other')
    git(fx.dir, 'clone', '-q', fx.lane, fx.other); fs.copyFileSync(fx.handoff, path.join(fx.other, 'docs/handoffs/h.md')); git(fx.other, 'commit', '-qam', 'other')
    fx.env = { GIT_DIR: path.join(fx.other, '.git'), GIT_WORK_TREE: fx.lane }
  }],
  ['a gitfile names a removed gitdir', (fx) => {
    fx.gitdir = path.join(fx.dir, 'moved-gitdir'); fs.renameSync(path.join(fx.lane, '.git'), fx.gitdir)
    fs.writeFileSync(path.join(fx.lane, '.git'), `gitdir: ${fx.gitdir}\n`); fs.rmSync(fx.gitdir, { recursive: true })
  }],
  // A ceiling at the lane's root makes git print the whole no-repository message inside the lane's repository.
  ['GIT_CEILING_DIRECTORIES at the repository root', (fx) => { fs.appendFileSync(fx.handoff, 'unlanded edit\n'); fx.env = { GIT_CEILING_DIRECTORIES: fs.realpathSync(fx.lane) } }],
  ['a .git directory missing HEAD', (fx) => fs.rmSync(path.join(fx.lane, '.git', 'HEAD'))],
  // git passes over the lane's rejected .git to an enclosing repository where the handoff is committed and clean.
  ['a .git missing HEAD inside a repository holding the handoff clean', (fx) => {
    fs.rmSync(path.join(fx.lane, '.git', 'HEAD')); git(fx.dir, 'init', '-q'); git(fx.dir, 'add', '-A'); git(fx.dir, 'commit', '-qm', 'outer')
  }],
  // The lane has no .git of its own, and its docs directory is a link into the repository where the handoff is uncommitted.
  ['a handoff reached through a symlinked docs directory into a repository where it is uncommitted', (fx) => {
    fx.repo = path.join(fx.dir, 'repo'); fs.renameSync(fx.lane, fx.repo); fs.appendFileSync(path.join(fx.repo, 'docs/handoffs/h.md'), 'unlanded edit\n')
    fs.mkdirSync(fx.lane); fs.copyFileSync(path.join(fx.repo, 'SESSION_MEMORY.md'), path.join(fx.lane, 'SESSION_MEMORY.md')); fs.symlinkSync(path.join(fx.repo, 'docs'), path.join(fx.lane, 'docs'))
  }],
  // The lane path is a link to a subdirectory of a repository, with no .git in that subdirectory.
  ['a handoff reached through a symlinked lane path into a repository where it is uncommitted', (fx) => {
    fx.repo = path.join(fx.dir, 'repo'); fs.mkdirSync(fx.repo); fs.renameSync(fx.lane, path.join(fx.repo, 'lane')); fs.rmSync(path.join(fx.repo, 'lane/.git'), { recursive: true })
    git(fx.repo, 'init', '-q'); git(fx.repo, 'add', '-A'); git(fx.repo, 'commit', '-qm', 'repo'); fs.appendFileSync(path.join(fx.repo, 'lane/docs/handoffs/h.md'), 'unlanded edit\n')
    fs.symlinkSync(path.join(fx.repo, 'lane'), fx.lane)
  }],
  // An untracked handoff that only an inherited config entry's excludes file ignores.
  ['an inherited GIT_CONFIG_* excludesFile ignoring the untracked handoff', (fx) => {
    git(fx.lane, 'rm', '-q', '--cached', 'docs/handoffs/h.md'); git(fx.lane, 'commit', '-qm', 'untrack'); write(path.join(fx.dir, 'excludes'), 'docs/\n')
    fx.env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.excludesFile', GIT_CONFIG_VALUE_0: path.join(fx.dir, 'excludes') }
  }],
  // The lane has no .git, and its handoff file is itself a link to a repository's copy, which has an uncommitted edit.
  ['a handoff file that is a link into a repository where it is uncommitted', (fx) => {
    fx.repo = path.join(fx.dir, 'repo'); git(fx.dir, 'clone', '-q', fx.lane, fx.repo); fs.appendFileSync(path.join(fx.repo, 'docs/handoffs/h.md'), 'unlanded edit\n')
    fs.rmSync(path.join(fx.lane, '.git'), { recursive: true }); fs.rmSync(fx.handoff); fs.symlinkSync(path.join(fx.repo, 'docs/handoffs/h.md'), fx.handoff)
  }],
  // The memory file a link to a tracked file in the handoff's repository, the link clean and the file it reaches modified.
  ['a memory file that is a link to a file modified in the handoff\'s repository', (fx) => {
    const m = path.join(fx.lane, 'SESSION_MEMORY.md'); fs.mkdirSync(path.join(fx.lane, 'docs/store')); fs.renameSync(m, path.join(fx.lane, 'docs/store/m.md')); fs.symlinkSync('docs/store/m.md', m)
    git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link memory'); fs.appendFileSync(path.join(fx.lane, 'docs/store/m.md'), 'unlanded edit\n')
  }],
  // The lane is a repository whose handoff is a committed link to a file outside every repository, the lane's memory file then modified.
  ['a handoff committed as a link to a file outside every repository, the lane\'s memory file modified and uncommitted', (fx) => { outLink(fx); fs.appendFileSync(memory(fx), 'unlanded edit\n') }],
  // The same link retargeted to another file outside every repository and not committed.
  ['a handoff committed as a link to a file outside every repository, the link retargeted and uncommitted', (fx) => {
    outLink(fx); fs.copyFileSync(path.join(fx.out, 'h.md'), path.join(fx.out, 'h2.md')); fs.rmSync(fx.handoff); fs.symlinkSync(path.join(fx.out, 'h2.md'), fx.handoff)
  }],
  // The memory file a committed link to a file tracked in a second repository, modified there.
  ['a memory file that is a link to a file modified in a second repository', (fx) => {
    fx.repo2 = path.join(fx.dir, 'repo2'); fs.mkdirSync(fx.repo2); fs.renameSync(memory(fx), path.join(fx.repo2, 'm.md')); git(fx.repo2, 'init', '-q'); git(fx.repo2, 'add', '-A'); git(fx.repo2, 'commit', '-qm', 'memory')
    fs.symlinkSync(path.join(fx.repo2, 'm.md'), memory(fx)); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link memory'); fs.appendFileSync(path.join(fx.repo2, 'm.md'), 'unlanded edit\n')
  }],
  // The lane's docs directory a committed link to a second repository, retargeted to a clean clone of it and not committed.
  ['a docs directory committed in the lane as a link to a second repository, retargeted and uncommitted', (fx) => {
    docsLink(fx); fx.repoC = path.join(fx.dir, 'repoC'); git(fx.dir, 'clone', '-q', fx.repoB, fx.repoC); fs.rmSync(path.join(fx.lane, 'docs')); fs.symlinkSync(path.join(fx.repoC, 'docs'), path.join(fx.lane, 'docs'))
  }],
  // An untracked handoff that only the user's ~/.gitconfig excludes file ignores, in a session whose git reads no global config.
  ['a ~/.gitconfig excludesFile ignoring the untracked handoff, the session under GIT_CONFIG_GLOBAL=/dev/null', (fx) => {
    git(fx.lane, 'rm', '-q', '--cached', 'docs/handoffs/h.md'); git(fx.lane, 'commit', '-qm', 'untrack'); fx.home = path.join(fx.dir, 'home')
    write(path.join(fx.home, 'ex'), 'docs/\n'); write(path.join(fx.home, '.gitconfig'), `[core]\n\texcludesFile = ${path.join(fx.home, 'ex')}\n`)
    fx.env = { HOME: fx.home, XDG_CONFIG_HOME: undefined, GIT_CONFIG_GLOBAL: '/dev/null' }
  }],
  // An untracked handoff that only the user's default excludes file, $XDG_CONFIG_HOME/git/ignore, ignores.
  ['the user\'s default git/ignore under XDG_CONFIG_HOME ignoring the untracked handoff', (fx) => {
    git(fx.lane, 'rm', '-q', '--cached', 'docs/handoffs/h.md'); git(fx.lane, 'commit', '-qm', 'untrack'); fx.home = path.join(fx.dir, 'home')
    write(path.join(fx.home, '.config/git/ignore'), 'docs/\n'); fx.env = { HOME: fx.home, XDG_CONFIG_HOME: path.join(fx.home, '.config') }
  }],
  ['a handoff reached through a chain of committed links whose middle link is retargeted and uncommitted', (fx) => { chain(fx, fx.handoff); retarget(fx) }],
  ['a memory file reached through a chain of committed links whose middle link is retargeted and uncommitted', (fx) => { chain(fx, memory(fx)); retarget(fx) }],
  // The handoff moved to a second repository and committed there; the lane's copy dropped in a commit and replaced by
  // an untracked, non-ignored link to it, which the lane's own status.showUntrackedFiles=no keeps out of a plain status.
  ['an untracked, non-ignored handoff link hidden by the repository\'s own status.showUntrackedFiles=no', (fx) => {
    fx.c = path.join(fx.dir, 'repoC'); fs.mkdirSync(fx.c); git(fx.c, 'init', '-q'); fs.renameSync(fx.handoff, path.join(fx.c, 'h.md')); git(fx.c, 'add', '-A'); git(fx.c, 'commit', '-qm', 'handoff')
    git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'drop handoff'); fs.symlinkSync(path.join(fx.c, 'h.md'), fx.handoff); git(fx.lane, 'config', 'status.showUntrackedFiles', 'no')
  }],
  // The memory file committed in the lane as a link to a file outside every repository, then retargeted to another one there.
  ['a memory file committed in the lane as a link to a file outside every repository, retargeted and uncommitted', (fx) => {
    fx.out = path.join(fx.dir, 'out'); fs.mkdirSync(fx.out); fs.renameSync(memory(fx), path.join(fx.out, 'm.md')); fs.copyFileSync(path.join(fx.out, 'm.md'), path.join(fx.out, 'm2.md'))
    fs.symlinkSync(path.join(fx.out, 'm.md'), memory(fx)); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link memory'); fs.rmSync(memory(fx)); fs.symlinkSync(path.join(fx.out, 'm2.md'), memory(fx))
  }],  // The committed handoff modified behind an index bit or a repository setting that keeps git's status from looking at it.
  ['a committed handoff marked assume-unchanged, then modified and uncommitted', (fx) => { git(fx.lane, 'update-index', '--assume-unchanged', 'docs/handoffs/h.md'); fs.appendFileSync(fx.handoff, 'unlanded edit\n') }],
  ['a committed handoff marked skip-worktree, then modified and uncommitted', (fx) => { git(fx.lane, 'update-index', '--skip-worktree', 'docs/handoffs/h.md'); fs.appendFileSync(fx.handoff, 'unlanded edit\n') }],
  ['the repository\'s own core.ignoreStat=true, the committed handoff then modified and uncommitted', (fx) => { git(fx.lane, 'config', 'core.ignoreStat', 'true'); git(fx.lane, 'update-index', '--really-refresh'); fs.appendFileSync(fx.handoff, 'unlanded edit\n') }],
  // The handoff a committed link to a file outside every repository, marked skip-worktree and retargeted without a commit.
  ['a handoff committed as a link marked skip-worktree, retargeted and uncommitted', (fx) => {
    outLink(fx); git(fx.lane, 'update-index', '--skip-worktree', 'docs/handoffs/h.md'); fs.copyFileSync(path.join(fx.out, 'h.md'), path.join(fx.out, 'h2.md')); fs.rmSync(fx.handoff); fs.symlinkSync(path.join(fx.out, 'h2.md'), fx.handoff)
  }],
  // The kickoff names an untracked link h?.md, which as a glob matches a tracked h1.md beside it, under the lane's own
  // status.showUntrackedFiles=no; the file it reaches is committed in a second repository.
  ['an untracked handoff link named h?.md beside a tracked h1.md, hidden by status.showUntrackedFiles=no', (fx) => {
    fx.c = path.join(fx.dir, 'repoC'); fs.mkdirSync(fx.c); git(fx.c, 'init', '-q'); fs.renameSync(fx.handoff, path.join(fx.c, 'h.md')); git(fx.c, 'add', '-A'); git(fx.c, 'commit', '-qm', 'handoff')
    write(path.join(fx.lane, 'docs/handoffs/h1.md'), 'tracked decoy\n'); fs.writeFileSync(memory(fx), kickoff('docs/handoffs/h?.md')); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'decoy')
    fx.handoff = path.join(fx.lane, 'docs/handoffs/h?.md'); fs.symlinkSync(path.join(fx.c, 'h.md'), fx.handoff); git(fx.lane, 'config', 'status.showUntrackedFiles', 'no')
  }],
  // The memory file a committed link to an untracked link named m?.md in a second repository, which as a glob matches
  // the tracked m1.md it reaches, under that repository's own status.showUntrackedFiles=no.
  ['a memory file committed as a link to an untracked link named m?.md that reaches a tracked m1.md, hidden by status.showUntrackedFiles=no', (fx) => {
    fx.c = path.join(fx.dir, 'repoC'); fs.mkdirSync(fx.c); git(fx.c, 'init', '-q'); fs.renameSync(memory(fx), path.join(fx.c, 'm1.md')); git(fx.c, 'add', '-A'); git(fx.c, 'commit', '-qm', 'memory')
    fs.symlinkSync('m1.md', path.join(fx.c, 'm?.md')); git(fx.c, 'config', 'status.showUntrackedFiles', 'no'); fs.symlinkSync(path.join(fx.c, 'm?.md'), memory(fx)); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link memory')
  }],
  // A committed .gitattributes setting ident on the handoff, committed with $Id$, then marked assume-unchanged and its
  // $Id line rewritten to text the ident filter collapses back to $Id$.
  ['a committed handoff under an ident attribute, marked assume-unchanged, its $Id line rewritten', (fx) => {
    write(path.join(fx.lane, '.gitattributes'), 'docs/handoffs/*.md ident\n'); fs.appendFileSync(fx.handoff, '$Id$\n'); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'ident')
    git(fx.lane, 'update-index', '--assume-unchanged', 'docs/handoffs/h.md'); fs.writeFileSync(fx.handoff, fs.readFileSync(fx.handoff, 'utf8').replace('$Id$', '$Id: unlanded arbitrary text $'))
  }],
  // The committed handoff file, whose content is the path of a file outside every repository, marked assume-unchanged
  // and swapped for a link to that path, so the link's target reads as the file's bytes.
  ['a committed handoff file marked assume-unchanged, swapped for a link to a file outside every repository', (fx) => {
    fx.out = path.join(fx.dir, 'out'); fs.mkdirSync(fx.out); const target = path.join(fx.out, 'h.md'); fs.copyFileSync(fx.handoff, target)
    fs.writeFileSync(fx.handoff, target); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'path handoff')
    git(fx.lane, 'update-index', '--assume-unchanged', 'docs/handoffs/h.md'); fs.rmSync(fx.handoff); fs.symlinkSync(target, fx.handoff)
  }],
  // The handoff committed as a link whose target string is the handoff's own text, marked skip-worktree and swapped
  // for a file holding that text, so the file's bytes read as the link's.
  ['a handoff committed as a link whose target is its own text, marked skip-worktree, swapped for a file holding that text', (fx) => {
    const body = fs.readFileSync(fx.handoff, 'utf8'); fs.rmSync(fx.handoff); fs.symlinkSync(body, fx.handoff); git(fx.lane, 'add', '-A'); git(fx.lane, 'commit', '-qm', 'link handoff')
    git(fx.lane, 'update-index', '--skip-worktree', 'docs/handoffs/h.md'); fs.rmSync(fx.handoff); fs.writeFileSync(fx.handoff, body)
  }],
]
const classFxs = CLASS.map(([label, prep]) => { const fx = classFx(); prep(fx); return [label, fx] })
const controlFx = classFx()
// A lane with no .git on the path from it upward: the handoff file is its landing, whatever git says there, a stop at a
// filesystem boundary included.
const noRepoFx = classFx(); fs.rmSync(path.join(noRepoFx.lane, '.git'), { recursive: true, force: true })
// The control again, its git stopping at a filesystem boundary unless told to cross one.
const boundaryFx = classFx(); gitMode('rev-parse', 'boundary')(boundaryFx)
// The control again, its lane path a link to a subdirectory of the repository holding the handoff committed and clean.
const linkedFx = classFx(); linkedFx.repo = path.join(linkedFx.dir, 'repo'); fs.mkdirSync(linkedFx.repo); fs.renameSync(linkedFx.lane, path.join(linkedFx.repo, 'lane'))
fs.rmSync(path.join(linkedFx.repo, 'lane/.git'), { recursive: true }); git(linkedFx.repo, 'init', '-q'); git(linkedFx.repo, 'add', '-A'); git(linkedFx.repo, 'commit', '-qm', 'repo')
fs.symlinkSync(path.join(linkedFx.repo, 'lane'), linkedFx.lane)
// The control again under an inherited ceiling at its repository root, which git must not see. git run at the
// toplevel finds .git before any ceiling applies, so its shim stops at the ceiling wherever it runs, as git does below it.
const ceilingFx = classFx(); ceilingFx.env = { GIT_CEILING_DIRECTORIES: fs.realpathSync(ceilingFx.lane) }; gitMode('rev-parse', 'ceiling')(ceilingFx)
// The repository's own .gitignore ignoring docs/handoffs/, the handoff untracked: the ignore is the landing.
const repoIgnoreFx = classFx(); fs.writeFileSync(path.join(repoIgnoreFx.lane, '.gitignore'), 'docs/handoffs/\n')
git(repoIgnoreFx.lane, 'rm', '-q', '--cached', 'docs/handoffs/h.md'); git(repoIgnoreFx.lane, 'add', '-A'); git(repoIgnoreFx.lane, 'commit', '-qm', 'ignore handoffs')
// The handoff file a link to a committed file in the same repository as the memory file, both committed.
const fileLinkFx = classFx(); fs.mkdirSync(path.join(fileLinkFx.lane, 'docs/store')); fs.renameSync(fileLinkFx.handoff, path.join(fileLinkFx.lane, 'docs/store/h.md'))
fs.symlinkSync('../store/h.md', fileLinkFx.handoff); git(fileLinkFx.lane, 'add', '-A'); git(fileLinkFx.lane, 'commit', '-qm', 'link handoff')
// The control again with its handoff a committed link to a file outside every repository, everything clean.
const outLinkFx = classFx(); outLink(outLinkFx)
// The control again with its memory file a committed link to a file outside every repository, everything clean.
const memOutFx = classFx(); memOutFx.out = path.join(memOutFx.dir, 'out'); fs.mkdirSync(memOutFx.out); fs.renameSync(memory(memOutFx), path.join(memOutFx.out, 'm.md'))
fs.symlinkSync(path.join(memOutFx.out, 'm.md'), memory(memOutFx)); git(memOutFx.lane, 'add', '-A'); git(memOutFx.lane, 'commit', '-qm', 'link memory')
// The control again with its docs directory a committed link to a second repository, everything clean.
const docsLinkFx = classFx(); docsLink(docsLinkFx)
// The control again with both its handoff and its memory file reached through a chain of committed links, everything clean.
const chainFx = classFx(); chain(chainFx, memory(chainFx), 'm'); chainFx.mb = chainFx.b; chainFx.mc = chainFx.c; chain(chainFx, chainFx.handoff)
// The control again with its tracked memory file marked skip-worktree and modified, as a lane's create leaves it.
const memSkipFx = classFx(); git(memSkipFx.lane, 'update-index', '--skip-worktree', 'SESSION_MEMORY.md'); fs.appendFileSync(memory(memSkipFx), 'lane memory edit\n')
// The control again under the lying fsmonitor hook, and again under core.checkStat=minimal with core.trustctime=false, nothing modified.
const monitorFx = classFx(); lyingMonitor(monitorFx)
const statFx = classFx(); sameStat(statFx, [['core.checkStat', 'minimal'], ['core.trustctime', 'false']], false)
const CLEARS = ['control', 'no git repository', 'the control, git stopping at a filesystem boundary unless told to cross one', 'the control under GIT_CEILING_DIRECTORIES at its root', 'the control reached through a symlinked lane path',
  'the repository\'s own .gitignore ignoring docs/handoffs/, the handoff untracked', 'the control with its handoff file a link to a committed file in the same repository',
  'the control with its handoff a committed link to a file outside every repository', 'the control with its memory file a committed link to a file outside every repository',
  'the control with its docs directory a committed link to a second repository', 'the control with its handoff and its memory file each reached through a chain of committed links',
  'the control with its tracked memory file marked skip-worktree and modified, the handoff committed and clean',
  'the control under a core.fsmonitor hook that reports nothing changed, nothing modified', 'the control under the repository\'s own core.checkStat=minimal and core.trustctime=false, nothing modified']
const classRuns = await Promise.all([...classFxs, ['control', controlFx], [CLEARS[1], noRepoFx], [CLEARS[2], boundaryFx], [CLEARS[3], ceilingFx], [CLEARS[4], linkedFx], [CLEARS[5], repoIgnoreFx], [CLEARS[6], fileLinkFx], [CLEARS[7], outLinkFx], [CLEARS[8], memOutFx], [CLEARS[9], docsLinkFx], [CLEARS[10], chainFx], [CLEARS[11], memSkipFx], [CLEARS[12], monitorFx], [CLEARS[13], statFx]].map(([label, fx]) => sender(fx, ['wake', 'a'], { env: { PATH: fx.path, ...fx.env } }).then((r) => [label, fx, r])))
// An existing memory file, a committed link to a file in the lane, whose real path cannot be read once its directory is
// closed: landed while the target is clean and readable, and not landed once it is modified and its directory closed,
// since the link alone then reads clean. Asked of handoffLanded itself, because the sender's kickoff read fails first.
const memAccFx = classFx(), memAccStore = path.join(memAccFx.lane, 'store'), memAccOf = () => handoffLanded({ handoffPath: memAccFx.handoff, memoryPath: memory(memAccFx), warnedAt: latchOf(memAccFx, 'S') })
fs.mkdirSync(memAccStore); fs.renameSync(memory(memAccFx), path.join(memAccStore, 'm.md')); fs.symlinkSync('store/m.md', memory(memAccFx)); git(memAccFx.lane, 'add', '-A'); git(memAccFx.lane, 'commit', '-qm', 'link memory')
// The same link left pointing at a file that does not exist: its real path cannot be read while the link reads clean.
const memGoneFx = classFx(); fs.rmSync(memory(memGoneFx)); fs.symlinkSync('store/gone.md', memory(memGoneFx)); git(memGoneFx.lane, 'add', '-A'); git(memGoneFx.lane, 'commit', '-qm', 'dangling memory link')
const memGone = handoffLanded({ handoffPath: memGoneFx.handoff, memoryPath: memory(memGoneFx), warnedAt: latchOf(memGoneFx, 'S') })
const memAccClean = memAccOf(); fs.appendFileSync(path.join(memAccStore, 'm.md'), 'unlanded edit\n')
const memAccSt = (p) => spawnSync(realGit, ['-C', memAccFx.lane, 'status', '--porcelain', '--', p], { encoding: 'utf8' }).stdout
const memAccProof = { linkClean: memAccSt('SESSION_MEMORY.md') === '', targetModified: / M store\/m\.md/.test(memAccSt('store/m.md')) }
let memAccDenied
fs.chmodSync(memAccStore, 0)
try {
  memAccDenied = memAccOf()
  try { fs.lstatSync(memory(memAccFx)); fs.realpathSync.native(memory(memAccFx)); memAccProof.realpathFails = false } catch (e) { memAccProof.realpathFails = e.code === 'EACCES' && fs.lstatSync(memory(memAccFx)).isSymbolicLink() }
  memAccProof.linkCleanDenied = memAccSt('SESSION_MEMORY.md') === ''
} finally { fs.chmodSync(memAccStore, 0o755) }
const classBad = classRuns.filter(([label, fx, r]) => r.code !== 0 || typed(fx).includes(`${PANE}|/clear`) !== CLEARS.includes(label)).map(([label, fx, r]) => `${label}: ${show(fx, r)}`)
clause('clause 2w — the restore file, transcript, latch and record each absent, empty or unreadable, git absent, each git call handoffLanded makes (rev-parse, check-ignore, ls-files --error-unmatch, log, ls-files -v and status) failing or timed out, rev-parse and log printing nothing, a committed handoff or the memory file modified under a core.fsmonitor hook that reports nothing changed, a committed handoff rewritten at the same size and mtime under the repository\'s own core.checkStat=minimal or core.trustctime=false, an inherited GIT_DIR naming nothing or another repository or GIT_CEILING_DIRECTORIES at the repository root, a gitfile naming a removed gitdir, and a .git directory missing HEAD, alone or inside a repository holding the handoff clean, a handoff reached through a symlinked docs directory or lane path into a repository where it is uncommitted, an inherited GIT_CONFIG_* excludes file, a ~/.gitconfig one under a session GIT_CONFIG_GLOBAL=/dev/null, or the user\'s default git/ignore ignoring the untracked handoff, a handoff file that is a link into a repository where it is uncommitted, a memory file that is a link to a file modified in the handoff\'s repository or in a second repository, and a handoff committed in the lane as a link to a file outside every repository with the lane\'s memory file modified or the link retargeted, uncommitted, or a docs directory committed in the lane as a link to a second repository and retargeted, uncommitted, a handoff or memory file reached through a chain of committed links whose middle link is retargeted and uncommitted, an untracked, non-ignored handoff link hidden by the repository\'s own status.showUntrackedFiles=no, and a memory file committed as a link to a file outside every repository and retargeted, uncommitted: no /clear typed, and handoffLanded false on an existing memory link whose real path cannot be read, its directory closed or its target missing; the healthy control, under a ceiling at its root behind a git that stops at one, behind a git that stops at a filesystem boundary unless told to cross one, reached through a symlinked lane path, with its handoff file a link to a committed file in the same repository, with its handoff or its memory file a committed link to a file outside every repository, or with its docs directory a committed link to a second repository, or with its handoff and memory file each reached through a chain of committed links, the repository\'s own .gitignore ignoring docs/handoffs/ with the handoff untracked, under a core.fsmonitor hook that reports nothing changed, under the repository\'s own core.checkStat=minimal and core.trustctime=false, and a lane with no .git above it, clear (SR1, SR3, SR4, SR5, SR6, SR7, SR8, SR9, SR10, SR11, SR12, SR13, B1)',
  classBad.length === 0 && memAccClean === true && memAccDenied === false && memGone === false, `${classBad.join(' || ')} | memory link clean ${memAccClean}, its directory closed ${memAccDenied}, its target missing ${memGone}`)

// ---------------------------------------------------------------- clause 2: wake-all (E15 Recovery)

const L = (i) => `2026-11-09T04:00:0${i}.000Z`
const WAKE_ENV = { DCTR_WAKEALL_RETRY_MS: '100', DCTR_WAKEALL_WINDOW_MS: '600' }
/** A run with one session per role: `a` is fixture()'s git lane at PANE, `orchestrator` its own checkout at w0:p0, any
 *  other role a lane directory of its own at w2:p<n>, each with a kickoff chain to an Open record. `limits` and `events`
 *  are written as given; <run>/tmpdir names the fixture's TMPDIR. */
function wakeFx(roles, { limits = [], events = [], shim = {} } = {}) {
  const fx = fixture({ shim }), lines = [], panes = {}
  fx.pane = {}
  let i = 1
  for (const [r, p] of Object.entries(roles)) {
    let pane = PANE, wt = fx.lane
    if (r === 'orchestrator') { pane = 'w0:p0'; wt = fx.own } else if (r !== 'a') {
      pane = `w2:p${++i}`; wt = path.join(fx.dir, `lane-${r}`)
      write(path.join(wt, 'SESSION_MEMORY.md'), kickoff('docs/handoffs/h.md'))
      write(path.join(wt, 'docs/handoffs/h.md'), `record: docs/records/${r}.md\n`)
      write(path.join(wt, 'docs/records', `${r}.md`), '- State: Open\n')
    }
    fx.pane[r] = pane
    panes[pane] = { status: 'idle', session: `S-${r}`, busy: 0, ...p }
    lines.push(`2026-11-08T09:00:00Z orchestrator create ${r} ${pane} ${wt} cd ${wt} && env DCTR_ROLE=${r} claude`)
  }
  write(path.join(fx.run, 'lane.log'), lines.join('\n') + '\n')
  write(path.join(fx.run, 'tmpdir'), fx.T)
  write(path.join(fx.run, 'limits.log'), limits.map((l) => l + '\n').join(''))
  write(path.join(fx.run, 'events.log'), events.map((l) => l + '\n').join(''))
  setShim(fx, { panes })
  return fx
}
/** wake-all as a shell runs it: `clean` under env -i with PATH and HOME alone; otherwise with an orchestrator's
 *  environment whose TMPDIR is not the run's. */
function wakeAll(fx, { env = {}, clean = false } = {}) {
  const e = clean ? { PATH: `${fx.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: fx.dir } : Object.fromEntries(Object.entries(process.env).filter(([k]) => !SCRUB.test(k)))
  if (!clean) Object.assign(e, { PATH: `${fx.bin}:${process.env.PATH}`, TMPDIR: path.join(fx.dir, 'elsewhere'), DCTR_ROLE: 'orchestrator', DCTR_CALLER: 'orchestrator' })
  Object.assign(e, WAKE_ENV, env)
  return new Promise((resolve) => {
    const t0 = Date.now(), c = spawn(process.execPath, [SEND, 'wake-all', fx.run], { cwd: fx.dir, env: e, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    c.stdout.on('data', (d) => { out += d }); c.stderr.on('data', (d) => { err += d })
    const kill = setTimeout(() => c.kill('SIGKILL'), 60000)
    c.on('close', (code) => { clearTimeout(kill); resolve({ code, out, err: err.trim(), pid: c.pid, took: Date.now() - t0, words: out.split('\n').map((l) => /^dctr-send: wake-all (\S+) (\S+)$/.exec(l)).filter(Boolean).map((m) => `${m[1]} ${m[2]}`) }) })
  })
}
const evLines = (fx) => (fs.readFileSync(path.join(fx.run, 'events.log'), 'utf8').split('\n').filter(Boolean))
const evWords = (fx) => evLines(fx).map((l) => l.split(' ').slice(1).join(' '))
const typedTo = (fx, r) => shimLog(fx).filter((e) => e.typed && e.typed.pane === fx.pane[r])
const wshow = (fx, r) => JSON.stringify({ code: r?.code, out: r?.out, err: r?.err, events: evWords(fx), typed: typed(fx) })

// E15-D15, D245: the selection.
const sel = wakeFx({ orchestrator: { status: 'done' }, a: {}, b: {}, c: {}, d: {}, e: {}, f: {} }, {
  limits: [`${L(0)} orchestrator account 2026-11-09T12:00:00Z`, `${L(1)} a account 2026-11-09T12:00:00Z`, `${L(2)} b account 2026-11-09T12:00:00Z`,
    `${L(3)} c account 2026-11-09T12:00:00Z`, `${L(4)} c model -`, `${L(5)} e account 2026-11-09T12:00:00Z`, `${L(6)} e account 2026-11-09T12:00:00Z`,
    `${L(7)} f account 2026-11-09T12:00:00Z`],
  events: [`2026-11-09T05:00:00.000Z woken b ${L(2)}`, `2026-11-09T05:00:01.000Z woken e ${L(5)}`, `2026-11-09T05:00:02.000Z unwoken f ${L(7)}`],
})
const selEvents0 = fs.readFileSync(path.join(sel.run, 'events.log'), 'utf8')
const rSel = await wakeAll(sel)
const selTyped = ['orchestrator', 'a', 'b', 'c', 'd', 'e', 'f'].filter((r) => typedTo(sel, r).length)
clause('clause 2x — wake-all wakes the orchestrator (done), a and e, whose latest limits.log line is account and unsettled, and types nothing to b (woken for it), c (a later model line), d (no line) or f (unwoken for it); it exits 0 (E15-D15, D245)',
  JSON.stringify(selTyped) === '["orchestrator","a","e"]' && rSel.code === 0 && ['orchestrator', 'a', 'e'].every((r) => JSON.stringify(typedTo(sel, r).map((e) => e.typed.text)) === JSON.stringify([NUDGE])) &&
  JSON.stringify(rSel.words) === '["orchestrator woken","a woken","e woken"]', wshow(sel, rSel))
clause('clause 2x2 — every call wake-all makes carries sender:watcher, whatever caller it inherited (E15-D232, D161)',
  shimLog(sel).length > 0 && shimLog(sel).every((e) => e.caller === 'sender:watcher'), JSON.stringify(shimLog(sel).map((e) => e.caller)))

// E15-D232: from a bare shell, the claims read under <run>/tmpdir.
const bare = wakeFx({ a: {}, b: {} }, { limits: [`${L(1)} a account 2026-11-09T12:00:00Z`, `${L(2)} b account 2026-11-09T12:00:00Z`] })
const typerClaim = at(bare, () => path.join(autoCycleDir(), `typer.${paneToken(PANE)}.claim`))
write(typerClaim, JSON.stringify({ pid: process.pid, pane: PANE }))
setShim(bare, { panes: { ...JSON.parse(fs.readFileSync(path.join(bare.dir, 'shim.json'), 'utf8')).panes, [PANE]: { status: 'idle', session: 'S-a', busy: 0, on: [{ n: 3, rm: typerClaim }] } } })
const rBare = await wakeAll(bare, { clean: true })
const bareLog = shimLog(bare), removedAt = bareLog.findIndex((e) => e.removed === typerClaim)
const aTypedAt = bareLog.map((e, i) => (e.typed?.pane === PANE ? i : -1)).filter((i) => i >= 0)
clause('clause 2x3 — wake-all under env -i with PATH and HOME alone: every call tagged sender:watcher, a typer\'s claim under <run>/tmpdir holds a\'s wake through two retries, and a\'s nudge comes only after the claim is removed (E15-D232)',
  rBare.code === 0 && bareLog.every((e) => e.caller === 'sender:watcher') && removedAt >= 0 && aTypedAt.length === 1 && aTypedAt[0] > removedAt &&
  evWords(bare).filter((w) => w === `retry a ${L(1)}`).length === 2 && typedTo(bare, 'b').length === 1, wshow(bare, rBare))

// E15-D113, D239: no agent and busy.
const skips = wakeFx({ x: { noAgent: true }, y: { status: 'working' } }, { limits: [`${L(1)} x account 2026-11-09T12:00:00Z`, `${L(2)} y account 2026-11-09T12:00:00Z`] })
const rSkips = await wakeAll(skips)
clause('clause 2x4 — a selected pane with no agent and one busy throughout: no typing call to either (E15-D113)',
  typed(skips).length === 0 && rSkips.code === 1, wshow(skips, rSkips))
clause('clause 2x5 — the first pass writes exactly skip x <L> no-agent and retry y <L> working, each naming the limit line\'s time, before any retry (E15-D239)',
  JSON.stringify(evWords(skips).slice(0, 2)) === JSON.stringify([`skip x ${L(1)} no-agent`, `retry y ${L(2)} working`]) && evWords(skips).slice(2).every((w) => / y /.test(` ${w} `)), wshow(skips, rSkips))

// E15-D233, D241, D245: retries, their bound, and a later run.
const retries = wakeFx({ p: { failGets: 4 }, q: {}, r: { empty: true } }, { limits: [`${L(1)} p account 2026-11-09T12:00:00Z`, `${L(2)} q account 2026-11-09T12:00:00Z`, `${L(3)} r account 2026-11-09T12:00:00Z`] })
at(retries, () => write(path.join(autoCycleDir(), `other.${paneToken(retries.pane.q)}.claim`), JSON.stringify({ pid: process.pid, pane: retries.pane.q })))
const retryEnv = { env: { DCTR_WAKEALL_RETRY_MS: '100', DCTR_WAKEALL_WINDOW_MS: '1000' } }
const rRetry1 = await wakeAll(retries, retryEnv), rRetry2 = await wakeAll(retries, retryEnv)
const unwokenAt = (r) => Date.parse(evLines(retries).find((l) => l.split(' ')[1] === 'unwoken' && l.split(' ')[2] === r)?.split(' ')[0] ?? 'x')
const lateCalls = ['q', 'r'].filter((r) => shimLog(retries).some((e) => e.argv.includes(retries.pane[r]) && !(e.t <= unwokenAt(r))))
clause('clause 2x6 — retries: p, whose read fails four times, is woken once; q (another claim) and r ({}) each get exactly one unwoken line after the window, and no pane read or typing call reaches them after it, in that run or a second one (E15-D233)',
  evWords(retries).filter((w) => w.startsWith('woken p')).length === 1 && typedTo(retries, 'p').length === 1 &&
  ['q', 'r'].every((r) => evWords(retries).filter((w) => w.startsWith(`unwoken ${r} `)).length === 1 && typedTo(retries, r).length === 0) && lateCalls.length === 0 &&
  evWords(retries).filter((w) => w.startsWith('retry p ')).length === 4, wshow(retries, rRetry1) + ` late ${JSON.stringify(lateCalls)}`)
clause('clause 2x7 — the first run prints one line per selected role with its last word and exits 1; the second selects none and exits 0 (E15-D241, D245)',
  JSON.stringify(rRetry1.words.sort()) === '["p woken","q unwoken","r unwoken"]' && rRetry1.code === 1 && rRetry2.words.length === 0 && rRetry2.code === 0,
  JSON.stringify([rRetry1.words, rRetry1.code, rRetry2.words, rRetry2.code]))

// E15-D234: a partial wake.
const H2 = Date.now() - 600000
const partial = wakeFx({ a: {}, n: { typeFail: true } }, { limits: [`${L(1)} a account 2026-11-09T12:00:00Z`, `${L(2)} n account 2026-11-09T12:00:00Z`],
  shim: { busyAfterTypeMs: 60000 } })
write(partial.record, '- State: Open\n- auto-cycle: warned S-a 20%\n')
handed(partial, { latch: ['S-a'], warnedAt: H2 - 60000, handoffAt: H2, session: 'S-a', transcript: [asst(H2 - 120000), toolResult(H2 + 1000)] })
const rPart1 = await wakeAll(partial), afterFirst = typed(partial).length, rPart2 = await wakeAll(partial)
clause('clause 2x8 — a handed-off role whose pane never reads ready after /clear, and a nudge-only role whose typing call fails: each ends with exactly one unfinished line, a\'s pane gets /clear once and nothing more, and a second run types nothing (E15-D234)',
  ['a', 'n'].every((r) => evWords(partial).filter((w) => w.startsWith(`unfinished ${r} `)).length === 1 && !evWords(partial).some((w) => w.startsWith(`woken ${r} `))) &&
  JSON.stringify(typedTo(partial, 'a').map((e) => e.typed.text)) === '["/clear"]' && typedTo(partial, 'n').length === 1 && typed(partial).length === afterFirst && rPart1.code === 1,
  wshow(partial, rPart1))

// E15-D240, D241, D245: interrupted runs.
const intr = wakeFx({ a: {}, b: {}, c: {} }, { limits: [`${L(1)} a account 2026-11-09T12:00:00Z`, `${L(1)} b account 2026-11-09T12:00:00Z`, `${L(2)} c account 2026-11-09T12:00:00Z`],
  events: [`2026-11-09T05:00:00.000Z intent a ${L(1)}`, `2026-11-09T05:00:01.000Z intent b ${L(1)}`, `2026-11-09T05:00:02.000Z woken b ${L(1)}`,
    `2026-11-09T05:00:03.000Z intent c ${L(2)}`, `2026-11-09T05:00:04.000Z retry c ${L(2)}`] })
const rIntr = [await wakeAll(intr), await wakeAll(intr), await wakeAll(intr)]
clause('clause 2x9 — on start an intent with nothing after it becomes exactly one unfinished line, one closed by woken or retry does not, over three runs: a is never typed to and c is woken once (E15-D240)',
  evWords(intr).filter((w) => w === `unfinished a ${L(1)}`).length === 1 && !evWords(intr).some((w) => /^unfinished [bc] /.test(w)) && typedTo(intr, 'a').length === 0 &&
  JSON.stringify(typedTo(intr, 'c').map((e) => e.typed.text)) === JSON.stringify([NUDGE]) && typedTo(intr, 'b').length === 0, wshow(intr, rIntr[0]))
clause('clause 2x10 — the first interrupted run prints unfinished a and woken c and exits 1 (E15-D241, D245)',
  JSON.stringify(rIntr[0].words.sort()) === '["a unfinished","c woken"]' && rIntr[0].code === 1, JSON.stringify(rIntr.map((r) => [r.words, r.code])))

// E15-D242: the lock.
const locked = wakeFx({ a: {} }, { limits: [`${L(1)} a account 2026-11-09T12:00:00Z`], shim: { busyAfterTypeMs: 60000 } })
write(locked.record, '- State: Open\n- auto-cycle: warned S-a 20%\n')
handed(locked, { latch: ['S-a'], warnedAt: H2 - 60000, handoffAt: H2, session: 'S-a', transcript: [asst(H2 - 120000), toolResult(H2 + 1000)] })
const firstRun = wakeAll(locked)
const lockT0 = Date.now()
while (!evWords(locked).some((w) => w.startsWith('intent a ')) && Date.now() - lockT0 < 8000) sleep(50)
sleep(300)
const evBefore = evLines(locked).length, rSecond = await wakeAll(locked), evAfterSecond = evLines(locked).slice(evBefore)
const rFirst = await firstRun
clause('clause 2x11 — a second wake-all while the first holds wake-all.lock inside a wake exits non-zero with no pane read and no events.log line, and the first\'s intent ends unfinished once (E15-D242)',
  rSecond.code !== 0 && !shimLog(locked).some((e) => e.ppid === rSecond.pid) && evAfterSecond.length === 0 &&
  evWords(locked).filter((w) => w.startsWith('unfinished a ')).length === 1 && !fs.existsSync(path.join(locked.run, 'wake-all.lock')), wshow(locked, rSecond) + ` first ${rFirst.code}`)

// The refusals: contained, and no <run>/tmpdir.
const refusals = wakeFx({ a: {} }, { limits: [`${L(1)} a account 2026-11-09T12:00:00Z`] })
const rCont2 = await wakeAll(refusals, { env: { DCTR_VIEW_REQUEST_DIR: path.join(refusals.dir, 'vr') } })
fs.rmSync(path.join(refusals.run, 'tmpdir'))
const rNoTmp = await wakeAll(refusals)
clause('clause 2x12 — wake-all refuses with no pane call contained, and with no <run>/tmpdir rather than use the system temp directory',
  rCont2.code !== 0 && rNoTmp.code !== 0 && shimLog(refusals).length === 0 && evLines(refusals).length === 0, wshow(refusals, rNoTmp))

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const probe = fixture()
setShim(probe, { onFirstRead: { file: probe.record, line: '- auto-cycle: warned S 20%' } })
const shimRun = (fx, ...a) => spawnSync(path.join(fx.bin, 'herdr'), a, { encoding: 'utf8' })
const r1 = shimRun(probe, 'pane', 'get', PANE)
clause('clause 3a — without the sender: the race shim appends the warned line on its first pane read, naming the session that read reports',
  r1.status === 0 && sessionWarned(parseRecord(fs.readFileSync(probe.record, 'utf8')).entries, JSON.parse(r1.stdout).result.pane.agent_session.value) !== null, r1.stdout)
const failFx = fixture({ shim: { paneGet: 'fail' } }), emptyFx = fixture({ shim: { paneGet: 'empty' } })
clause('clause 3b — without the sender: the failing shim exits 1 on pane get, the empty one prints {}, and the woken lane.log\'s latest create line names w1:p1 after one naming w9:p9 and before a reset line',
  shimRun(failFx, 'pane', 'get', PANE).status === 1 && shimRun(emptyFx, 'pane', 'get', PANE).stdout.trim() === '{}' &&
  laneOf(fs.readFileSync(path.join(woken.run, 'lane.log'), 'utf8'), 'a')?.pane === PANE && /w9:p9/.test(fs.readFileSync(path.join(woken.run, 'lane.log'), 'utf8')) &&
  / reset a /.test(fs.readFileSync(path.join(woken.run, 'lane.log'), 'utf8').trim().split('\n').at(-1)), 'shim fixtures wrong')
const claimProof = fixture()
const deadPid = spawnSync('true').pid
at(claimProof, () => write(path.join(autoCycleDir(), 'dead.claim'), JSON.stringify({ pid: deadPid, pane: PANE })))
const deadHeld = at(claimProof, () => paneClaimHeld(PANE))
at(claimProof, () => write(path.join(autoCycleDir(), 'live.claim'), JSON.stringify({ pid: process.pid, pane: PANE })))
clause('clause 3c — without the sender: a claim whose pid has exited is not held, one with a live pid is, and the claim given as except never counts',
  deadHeld === false && at(claimProof, () => paneClaimHeld(PANE)) === true && at(claimProof, () => paneClaimHeld(PANE, path.join(autoCycleDir(), 'live.claim'))) === false, 'claim fixtures wrong')
const turns = (fx) => { const r = transcriptEntries(fs.readFileSync(path.join(fx.dir, 'transcript.jsonl'), 'utf8')); return r && r.entries.filter((e) => e.type === 'user' && !e.isMeta && !JSON.stringify(e.message?.content ?? '').includes('tool_result') && Date.parse(e.timestamp) >= H) }
const [u1, u2, u3, u4, u5, u6, u7] = unhandedFx.map(([, fx]) => fx)
clause('clause 3d — without the sender: the handed fixture\'s handoff landed after its warning and its transcript holds no turn start after it; each unhanded fixture carries its one defect',
  handoffLanded({ handoffPath: handedFx.handoff, memoryPath: memory(handedFx), warnedAt: latchOf(handedFx, 'S') }) && turns(handedFx)?.length === 0 &&
  !handoffLanded({ handoffPath: u1.handoff, memoryPath: memory(u1), warnedAt: latchOf(u1, 'S') }) &&
  sessionWarned(parseRecord(fs.readFileSync(u2.record, 'utf8')).entries, 'S2') === null && handoffLanded({ handoffPath: u2.handoff, memoryPath: memory(u2), warnedAt: latchOf(u2, 'S1') }) &&
  pauseCode(parseRecord(fs.readFileSync(u3.record, 'utf8')).entries.find((e) => e.sub === 'paused')?.reason) === 'R16' &&
  pauseCode(parseRecord(fs.readFileSync(u4.record, 'utf8')).entries.find((e) => e.sub === 'paused')?.reason) === 'R17' &&
  turns(u4)?.length === 1 && turns(u5)?.length === 1 && turns(u6) === null &&
  at(u7, () => JSON.parse(fs.readFileSync(restoreFile(PANE), 'utf8')).session_id) === 'OTHER', 'wake fixtures wrong')
clause('clause 3e — without the sender: the never-ready fixture\'s shim reads the pane working, on a session warned and handed off as the handed one is',
  JSON.parse(shimRun(slow, 'pane', 'get', PANE).stdout).result.pane.agent_status === 'working' && handoffLanded({ handoffPath: slow.handoff, memoryPath: memory(slow), warnedAt: latchOf(slow, 'S') }), 'slow fixture wrong')

const unreadProof = (() => { try { JSON.parse(at(corrupt, () => fs.readFileSync(path.join(autoCycleDir(), 'torn.claim'), 'utf8'))); return false } catch (e) { if (!(e instanceof SyntaxError)) return false } fs.chmodSync(unlistedDir, 0o300); try { fs.readdirSync(unlistedDir); return false } catch (e) { return e.code === 'EACCES' } finally { fs.chmodSync(unlistedDir, 0o700) } })()
clause('clause 3f — without the sender: the torn claim does not parse, and the claim directory set write-only cannot be listed',
  unreadProof, 'claim read fixtures wrong')
const evProof = fixture({ shim: { events: [{ n: 2, session: 'S2' }] } }), rProof = fixture({ shim: { events: [] } })
setShim(rProof, { events: [{ n: 2, file: rProof.record, line: R16 }] })
const sessions = [1, 2].map(() => JSON.parse(shimRun(evProof, 'pane', 'get', PANE).stdout).result.pane.agent_session.value)
shimRun(rProof, 'pane', 'get', PANE); const r16Before = fs.readFileSync(rProof.record, 'utf8'); shimRun(rProof, 'pane', 'get', PANE)
const t0 = Date.now(); shimRun(slowShim, 'pane', 'get', PANE); const slowTook = Date.now() - t0
clause('clause 3g — without the sender: the shim changes the reported session, or appends its line, on the second pane read and not the first, the busy fixtures read working three times, and the slow shim takes 6 s over a read',
  JSON.stringify(sessions) === '["S","S2"]' && !r16Before.includes(R16) && pauseCode(parseRecord(fs.readFileSync(rProof.record, 'utf8')).entries.find((e) => e.sub === 'paused')?.reason) === 'R16' &&
  duringFx.every(([, fx]) => shimLog(fx).filter((e) => e.argv[1] === 'get').slice(0, 3).every((e) => e.status === 'working')) && slowTook >= 6000,
  JSON.stringify({ sessions, slowTook }))

const lateShim = fixture({ shim: { busyAfterTypeMs: 3000 } })
setShim(lateShim, { panes: { [PANE]: { status: 'idle', session: 'S', busy: 0, busyUntil: Date.now() + 1500 } } })
const lateStatus = () => JSON.parse(shimRun(lateShim, 'pane', 'get', PANE).stdout).result.pane.agent_status
const lateBefore = lateStatus(); sleep(1600); const lateAfter = lateStatus(); shimRun(lateShim, 'pane', 'run', PANE, 'x'); const lateTyped = lateStatus()
clause('clause 3h — without the sender: the late shim reads working until its time, idle after it, and working again after a typed line',
  lateBefore === 'working' && lateAfter === 'idle' && lateTyped === 'working', JSON.stringify({ lateBefore, lateAfter, lateTyped }))
let twiceProof
{ const undo = failLaterReads(); try { JSON.parse(fs.readFileSync(twiceFile, 'utf8')); try { fs.readFileSync(twiceFile, 'utf8'); twiceProof = false } catch (e) { twiceProof = e.code === 'EIO' } } finally { undo() } }
clause('clause 3i — without paneClaimHeld: the claim file parses on its first read and fails with EIO on its second',
  twiceProof === true && JSON.parse(fs.readFileSync(twiceFile, 'utf8')).pid === process.pid, 'twice-read fixture wrong')
const gitProbe = spawnSync(path.join(slowGitBin, 'git'), ['--version'], { timeout: 1500 })
clause('clause 3j — without the sender: the slow git shim is still running after 1.5 s, and the slow-git fixture is handed off as the handed one is with the real git',
  gitProbe.error?.code === 'ETIMEDOUT' && handoffLanded({ handoffPath: slowGit.handoff, memoryPath: memory(slowGit), warnedAt: latchOf(slowGit, 'S') }), String(gitProbe.error?.code))

const nearShim = fixture({ shim: { runDelayMs: 1000 } })
const nt0 = Date.now(); const nearRun = shimRun(nearShim, 'pane', 'run', PANE, 'x'); const nearTook = Date.now() - nt0
clause('clause 3k — without the sender: the slow-reply shim logs the line as typed and returns only after 1 s',
  nearRun.status === 0 && nearTook >= 1000 && typed(nearShim).length === 1, JSON.stringify({ nearTook, typed: typed(nearShim) }))
const classProofBad = []
// No .git entry on the path from the handoff's directory up, read lexically as the path is written, checked here by its own walk.
const noGitAbove = (fx) => { for (let d = path.dirname(fx.handoff); ; d = path.dirname(d)) { try { fs.lstatSync(path.join(d, '.git')); return false } catch {} if (path.dirname(d) === d) return true } }
// No .git entry on the path from a real file's directory up.
const outside = (f) => { for (let d = path.dirname(f); ; d = path.dirname(d)) { try { fs.lstatSync(path.join(d, '.git')); return false } catch {} if (path.dirname(d) === d) return true } }
const gitOf = (fx, args) => spawnSync(path.join(fx.gitBin, 'git'), ['-C', fx.lane, ...args], { encoding: 'utf8', timeout: 1500 })
const SUBARGS = { 'rev-parse': ['rev-parse', '--is-inside-work-tree'], 'check-ignore': ['check-ignore', '-q', 'docs/handoffs/h.md'], 'ls-files': ['ls-files', '--error-unmatch', '--', 'docs/handoffs/h.md'], log: ['log', '-1', '--format=%ct', '--', 'docs/handoffs/h.md'], status: ['status', '--porcelain'] }
// Every change git sees in a repository, untracked files listed whatever its config, and whether a path is tracked there.
const stAll = (cwd) => spawnSync(realGit, ['-C', cwd, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).stdout
const tracked = (cwd, p) => spawnSync(realGit, ['-C', cwd, 'ls-files', '--error-unmatch', p]).status === 0
for (const [label, fx] of classFxs) {
  let ok
  const m = /^(the \w+(?: file)?) (absent|empty|unreadable)$/.exec(label)
  if (m) {
    const key = { 'the restore file': 'restore', 'the transcript': 'transcript', 'the latch': 'latch', 'the record': 'record' }[m[1]], f = fx[key]
    if (m[2] === 'absent') ok = !fs.existsSync(f)
    else if (m[2] === 'empty') ok = fs.statSync(f).size === 0
    else { try { fs.readFileSync(f); ok = false } catch (e) { ok = e.code === 'EACCES' } }
  } else if (label === 'git absent') {
    ok = spawnSync('git', ['--version'], { env: { PATH: fx.path } }).error?.code === 'ENOENT'
  } else if (label === 'GIT_DIR names nothing') {
    const r = spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['rev-parse']], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', GIT_DIR: '/dev/null' } })
    ok = r.status === 128 && r.stderr.trim() === "fatal: not a git repository: '/dev/null'" && gitOf(fx, ['status', '--porcelain', '--', 'docs/handoffs/h.md']).stdout.trim() !== ''
  } else if (label === 'GIT_DIR names another repository') {
    const r = spawnSync(realGit, ['-C', path.dirname(fx.handoff), 'status', '--porcelain', '--', fx.handoff, memory(fx)], { encoding: 'utf8', env: { ...process.env, ...fx.env } })
    ok = r.status === 0 && r.stdout === '' && gitOf(fx, ['status', '--porcelain', '--', 'docs/handoffs/h.md']).stdout.trim() !== ''
  } else if (label === 'a gitfile names a removed gitdir') {
    const r = spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['rev-parse']], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    // git's wording for this refusal differs between versions, so the fixture is proved by its own shape and git's exit.
    ok = r.status === 128 && !r.stderr.includes('parent directories') && fs.statSync(path.join(fx.lane, '.git')).isFile() && fs.readFileSync(path.join(fx.lane, '.git'), 'utf8') === `gitdir: ${fx.gitdir}\n` && !fs.existsSync(fx.gitdir)
  } else if (label === 'GIT_CEILING_DIRECTORIES at the repository root') {
    const r = spawnSync(realGit, ['-C', path.dirname(fx.handoff), ...SUBARGS['rev-parse']], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', ...fx.env } })
    ok = r.status === 128 && r.stderr.trim() === 'fatal: not a git repository (or any of the parent directories): .git' && gitOf(fx, ['status', '--porcelain', '--', 'docs/handoffs/h.md']).stdout.trim() !== ''
  } else if (label === 'a .git directory missing HEAD') {
    const r = spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['rev-parse']], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    ok = r.status === 128 && fs.statSync(path.join(fx.lane, '.git')).isDirectory() && !fs.existsSync(path.join(fx.lane, '.git', 'HEAD'))
  } else if (label === 'a .git missing HEAD inside a repository holding the handoff clean') {
    const env = { ...process.env, LC_ALL: 'C' }, cwd = path.dirname(fx.handoff)
    const top = spawnSync(realGit, ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', env }), st = spawnSync(realGit, ['-C', cwd, 'status', '--porcelain', '--', fx.handoff, memory(fx)], { encoding: 'utf8', env })
    ok = !fs.existsSync(path.join(fx.lane, '.git', 'HEAD')) && top.status === 0 && top.stdout.trim() === fs.realpathSync(fx.dir) && st.status === 0 && st.stdout === '' &&
      spawnSync(realGit, ['-C', fx.dir, 'ls-files', '--error-unmatch', fx.handoff], { env }).status === 0
  } else if (/^a handoff reached through a symlinked (docs directory|lane path)/.test(label)) {
    // The lane's own path has no .git above it, the handoff's physical directory does, and there the handoff is modified.
    const st = spawnSync(realGit, ['-C', fx.repo, 'status', '--porcelain'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    ok = noGitAbove(fx) && fs.existsSync(path.join(fx.repo, '.git', 'HEAD')) && fs.realpathSync(path.dirname(fx.handoff)).startsWith(fs.realpathSync(fx.repo) + path.sep) &&
      st.status === 0 && / M (lane\/)?docs\/handoffs\/h\.md/.test(st.stdout)
  } else if (label === 'an inherited GIT_CONFIG_* excludesFile ignoring the untracked handoff') {
    const ci = (env) => spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['check-ignore']], { env: { ...process.env, ...env } }).status
    ok = ci(fx.env) === 0 && ci({}) === 1 && spawnSync(realGit, ['-C', fx.lane, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md']).status !== 0
  } else if (label === 'a handoff file that is a link into a repository where it is uncommitted') {
    // The lane path has no .git above it, the handoff is a link, and the file it reaches is modified in its repository.
    const st = spawnSync(realGit, ['-C', fx.repo, 'status', '--porcelain'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    ok = noGitAbove(fx) && fs.lstatSync(fx.handoff).isSymbolicLink() && fs.realpathSync(fx.handoff) === fs.realpathSync(path.join(fx.repo, 'docs/handoffs/h.md')) &&
      st.status === 0 && / M docs\/handoffs\/h\.md/.test(st.stdout)
  } else if (label === 'a memory file that is a link to a file modified in the handoff\'s repository') {
    // git calls the link clean and the file it reaches modified.
    const st = (p) => spawnSync(realGit, ['-C', fx.lane, 'status', '--porcelain', '--', p], { encoding: 'utf8' })
    ok = fs.lstatSync(memory(fx)).isSymbolicLink() && st('SESSION_MEMORY.md').stdout === '' && / M docs\/store\/m\.md/.test(st('docs/store/m.md').stdout) && st('docs/handoffs/h.md').stdout === ''
  } else if (/^a handoff committed as a link to a file outside every repository/.test(label)) {
    // The handoff is a link tracked in the lane, the file it reaches has no .git above it, and git sees only the one change the row makes.
    const st = (p) => spawnSync(realGit, ['-C', fx.lane, 'status', '--porcelain', '--', p], { encoding: 'utf8' }).stdout
    const target = fs.realpathSync(fx.handoff), retarget = label.endsWith('the link retargeted and uncommitted')
    ok = fs.lstatSync(fx.handoff).isSymbolicLink() && outside(target) && spawnSync(realGit, ['-C', fx.lane, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md']).status === 0 &&
      (retarget ? / M docs\/handoffs\/h\.md/.test(st('docs/handoffs/h.md')) && st('SESSION_MEMORY.md') === '' && path.basename(target) === 'h2.md'
        : st('docs/handoffs/h.md') === '' && / M SESSION_MEMORY\.md/.test(st('SESSION_MEMORY.md')))
  } else if (label === 'a docs directory committed in the lane as a link to a second repository, retargeted and uncommitted') {
    // The lane calls its docs link modified, and both repositories the link has named hold the handoff committed and clean.
    const st = (cwd) => spawnSync(realGit, ['-C', cwd, 'status', '--porcelain'], { encoding: 'utf8' }).stdout
    ok = fs.lstatSync(path.join(fx.lane, 'docs')).isSymbolicLink() && fs.realpathSync(fx.handoff) === fs.realpathSync(path.join(fx.repoC, 'docs/handoffs/h.md')) &&
      /^ M docs$/m.test(st(fx.lane)) && st(fx.repoB) === '' && st(fx.repoC) === '' && spawnSync(realGit, ['-C', fx.repoC, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md']).status === 0
  } else if (label === 'a memory file that is a link to a file modified in a second repository') {
    // The lane calls the link and the handoff clean, and the second repository calls the file it reaches modified.
    const st = (cwd, p) => spawnSync(realGit, ['-C', cwd, 'status', '--porcelain', '--', p], { encoding: 'utf8' }).stdout
    ok = fs.lstatSync(memory(fx)).isSymbolicLink() && fs.realpathSync(memory(fx)) === fs.realpathSync(path.join(fx.repo2, 'm.md')) && st(fx.lane, 'SESSION_MEMORY.md') === '' &&
      st(fx.lane, 'docs/handoffs/h.md') === '' && / M m\.md/.test(st(fx.repo2, 'm.md'))
  } else if (/ignoring the untracked handoff, the session under GIT_CONFIG_GLOBAL|default git\/ignore under XDG_CONFIG_HOME/.test(label)) {
    // Ignored by the user's rule as git reads it under HOME alone, and not ignored once only the repository's rules count.
    const ci = (env) => spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['check-ignore']], { env: { ...process.env, XDG_CONFIG_HOME: undefined, GIT_CONFIG_GLOBAL: undefined, ...env } }).status
    const session = ci(fx.env), userRule = ci({ HOME: fx.home, XDG_CONFIG_HOME: fx.env.XDG_CONFIG_HOME }), repoOnly = ci({ HOME: fx.home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: '/dev/null' })
    ok = userRule === 0 && repoOnly === 1 && session === (fx.env.GIT_CONFIG_GLOBAL ? 1 : 0) && spawnSync(realGit, ['-C', fx.lane, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md']).status !== 0
  } else if (/reached through a chain of committed links whose middle link is retargeted/.test(label)) {
    // Each link in the chain is a link, the lane and repoC are clean with every file tracked, and repoB alone calls its link modified.
    ok = fs.lstatSync(fx.chained).isSymbolicLink() && fs.readlinkSync(fx.chained) === path.join(fx.b, 'f.md') && fs.lstatSync(path.join(fx.b, 'f.md')).isSymbolicLink() &&
      fs.realpathSync(fx.chained) === fs.realpathSync(path.join(fx.c, 'f2.md')) && stAll(fx.lane) === '' && stAll(fx.b) === ' M f.md\n' && stAll(fx.c) === '' &&
      tracked(fx.lane, path.relative(fx.lane, fx.chained)) && tracked(fx.b, 'f.md') && tracked(fx.c, 'f1.md') && tracked(fx.c, 'f2.md')
  } else if (label === 'an untracked, non-ignored handoff link hidden by the repository\'s own status.showUntrackedFiles=no') {
    // A plain status is empty, one asked for every untracked file names the link, which is neither tracked nor ignored, and the file it reaches is committed and clean.
    const plain = spawnSync(realGit, ['-C', fx.lane, 'status', '--porcelain'], { encoding: 'utf8' })
    ok = fs.lstatSync(fx.handoff).isSymbolicLink() && plain.status === 0 && plain.stdout === '' && stAll(fx.lane) === '?? docs/handoffs/h.md\n' && !tracked(fx.lane, 'docs/handoffs/h.md') &&
      spawnSync(realGit, ['-C', fx.lane, ...SUBARGS['check-ignore']], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: '/dev/null' } }).status === 1 &&
      fs.realpathSync(fx.handoff) === fs.realpathSync(path.join(fx.c, 'h.md')) && tracked(fx.c, 'h.md') && stAll(fx.c) === ''
  } else if (label === 'a memory file committed in the lane as a link to a file outside every repository, retargeted and uncommitted') {
    // The lane calls the tracked memory link modified and nothing else, and the file it now reaches has no .git above it.
    ok = fs.lstatSync(memory(fx)).isSymbolicLink() && tracked(fx.lane, 'SESSION_MEMORY.md') && stAll(fx.lane) === ' M SESSION_MEMORY.md\n' &&
      fs.realpathSync(memory(fx)) === fs.realpathSync(path.join(fx.out, 'm2.md')) && outside(fs.realpathSync(memory(fx)))
  } else if (/under an ident attribute|swapped for a/.test(label)) {
    // The index entry carries its bit and a plain status is empty, while a copy of the lane with the bit cleared calls
    // the handoff modified. The ident row's working bytes differ from HEAD's and clean back to them through the filter;
    // each swap row's working type differs from HEAD's while its bytes or target equal HEAD's content.
    const g = (cwd, ...a) => spawnSync(realGit, ['-C', cwd, ...a], { encoding: 'utf8' }).stdout
    const bit = /skip-worktree/.test(label) ? 'skip-worktree' : 'assume-unchanged', copy = path.join(fx.dir, 'unbit')
    fs.cpSync(fx.lane, copy, { recursive: true, verbatimSymlinks: true }); g(copy, 'update-index', `--no-${bit}`, '--', 'docs/handoffs/h.md')
    const link = fs.lstatSync(fx.handoff).isSymbolicLink(), work = link ? fs.readlinkSync(fx.handoff) : fs.readFileSync(fx.handoff, 'utf8'), head = g(fx.lane, 'show', 'HEAD:docs/handoffs/h.md')
    const mode = g(fx.lane, 'ls-tree', 'HEAD', '--', 'docs/handoffs/h.md').split(' ')[0]
    ok = g(fx.lane, 'status', '--porcelain') === '' && g(fx.lane, 'ls-files', '-v', '--', 'docs/handoffs/h.md') === `${bit === 'skip-worktree' ? 'S' : 'h'} docs/handoffs/h.md\n` &&
      /^ [MT] docs\/handoffs\/h\.md$/m.test(g(copy, 'status', '--porcelain')) &&
      (/ident/.test(label) ? !link && mode === '100644' && work !== head && work.includes('$Id: unlanded arbitrary text $') &&
        spawnSync(realGit, ['-C', fx.lane, 'hash-object', '--path=docs/handoffs/h.md', '--stdin'], { input: work, encoding: 'utf8' }).stdout === g(fx.lane, 'rev-parse', 'HEAD:docs/handoffs/h.md')
        : work === head && (link ? mode === '100644' : mode === '120000'))
  } else if (/^a committed handoff marked|core\.ignoreStat=true|committed as a link marked skip-worktree/.test(label)) {
    // A plain status is empty while the working content differs from HEAD's blob, the index entry carrying its bit or the repository its setting.
    const g = (...a) => spawnSync(realGit, ['-C', fx.lane, ...a], { encoding: 'utf8', ...(a[0] === 'hash-object' ? { input: fs.lstatSync(fx.handoff).isSymbolicLink() ? fs.readlinkSync(fx.handoff) : fs.readFileSync(fx.handoff) } : {}) }).stdout.trim()
    const tag = g('ls-files', '-v', '--', 'docs/handoffs/h.md')[0], link = /as a link/.test(label)
    ok = g('status', '--porcelain') === '' && g('hash-object', '--stdin') !== g('rev-parse', 'HEAD:docs/handoffs/h.md') && fs.lstatSync(fx.handoff).isSymbolicLink() === link &&
      (/assume-unchanged/.test(label) ? tag === 'h' : /skip-worktree/.test(label) ? tag === 'S' : g('config', 'core.ignoreStat') === 'true')
  } else if (/named h\?\.md beside a tracked h1\.md/.test(label)) {
    // As a pathspec the name matches the tracked h1.md, as a literal it matches nothing; a plain status is empty, the link is not ignored, and the file it reaches is committed and clean.
    const ls = (...pre) => spawnSync(realGit, ['-C', fx.lane, ...pre, 'ls-files', '--error-unmatch', '--', 'docs/handoffs/h?.md'], { encoding: 'utf8' })
    const plain = spawnSync(realGit, ['-C', fx.lane, 'status', '--porcelain'], { encoding: 'utf8' })
    ok = fs.lstatSync(fx.handoff).isSymbolicLink() && ls().status === 0 && ls().stdout === 'docs/handoffs/h1.md\n' && ls('--literal-pathspecs').status === 1 && plain.status === 0 && plain.stdout === '' &&
      spawnSync(realGit, ['-C', fx.lane, 'check-ignore', '-q', 'docs/handoffs/h?.md'], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: '/dev/null' } }).status === 1 &&
      tracked(fx.c, 'h.md') && stAll(fx.c) === '' && fs.readFileSync(memory(fx), 'utf8').includes('handoff: docs/handoffs/h?.md ')
  } else if (/untracked link named m\?\.md that reaches a tracked m1\.md/.test(label)) {
    // As a pathspec the link's name matches the tracked m1.md, as a literal nothing; repoC's plain status is empty, the link is not ignored, and the lane is clean with its memory link tracked.
    const ls = (...pre) => spawnSync(realGit, ['-C', fx.c, ...pre, 'ls-files', '--error-unmatch', '--', 'm?.md'], { encoding: 'utf8' })
    const plain = spawnSync(realGit, ['-C', fx.c, 'status', '--porcelain'], { encoding: 'utf8' })
    ok = fs.readlinkSync(memory(fx)) === path.join(fx.c, 'm?.md') && fs.lstatSync(path.join(fx.c, 'm?.md')).isSymbolicLink() && ls().stdout === 'm1.md\n' && ls('--literal-pathspecs').status === 1 &&
      plain.status === 0 && plain.stdout === '' && spawnSync(realGit, ['-C', fx.c, 'check-ignore', '-q', 'm?.md'], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: '/dev/null' } }).status === 1 &&
      tracked(fx.lane, 'SESSION_MEMORY.md') && stAll(fx.lane) === '' && tracked(fx.c, 'm1.md')
  } else if (/core\.fsmonitor hook that reports nothing changed$/.test(label)) {
    ok = fx.monitorProof === true
  } else if (/rewritten at the same size and mtime/.test(label)) {
    // A plain status is empty while the handoff differs from HEAD's blob at HEAD's size, with the mtime git stored, and the same status under the default stat check names it.
    const g = (...a) => spawnSync(realGit, ['-C', fx.lane, ...a], { encoding: 'utf8' }).stdout.trim(), key = /checkStat/.test(label) ? ['core.checkStat', 'minimal'] : ['core.trustctime', 'false']
    ok = g('status', '--porcelain') === '' && g('hash-object', '--', 'docs/handoffs/h.md') !== g('rev-parse', 'HEAD:docs/handoffs/h.md') &&
      fs.statSync(fx.handoff).size === Number(g('cat-file', '-s', 'HEAD:docs/handoffs/h.md')) && fs.statSync(fx.handoff, { bigint: true }).mtimeNs === fx.mtimeNs &&
      g('config', key[0]) === key[1] && g('-c', `${key[0]}=${key[0] === 'core.checkStat' ? 'default' : 'true'}`, 'status', '--porcelain') === 'M docs/handoffs/h.md'
  } else {
    // The row's shim trips its own call and lets every other call handoffLanded makes through.
    const [, call, how] = /^git (.+) (fails|times out|prints nothing)$/.exec(label), r = gitOf(fx, GITCALLS[call])
    const others = Object.keys(GITCALLS).filter((c) => c !== call).every((c) => { const o = gitOf(fx, GITCALLS[c]); return !o.error && o.status !== 128 && !/Input\/output error/.test(o.stderr) })
    ok = others && (how === 'fails' ? r.status === 128 && /Input\/output error/.test(r.stderr) : how === 'times out' ? r.error?.code === 'ETIMEDOUT' : r.status === 0 && r.stdout === '')
  }
  if (!ok) classProofBad.push(label)
}
if (!noGitAbove(noRepoFx)) classProofBad.push(CLEARS[1])
// Under the ceiling the control's git prints the whole no-repository message from the handoff's directory, and its
// shim prints that message at the toplevel too, while without the ceiling the shim reaches git's answer there.
const underCeiling = spawnSync(realGit, ['-C', path.dirname(ceilingFx.handoff), ...SUBARGS['rev-parse']], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', ...ceilingFx.env } })
const shimCeil = (env) => spawnSync(path.join(ceilingFx.gitBin, 'git'), ['-C', ceilingFx.lane, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, GIT_CEILING_DIRECTORIES: '', ...env } })
const shimCeilStop = shimCeil(ceilingFx.env), shimCeilClear = shimCeil({})
if (!(underCeiling.status === 128 && underCeiling.stderr.trim() === 'fatal: not a git repository (or any of the parent directories): .git' &&
  shimCeilStop.status === 128 && shimCeilStop.stderr.trim() === underCeiling.stderr.trim() && shimCeilClear.status === 0 && shimCeilClear.stdout.trim() === fs.realpathSync(ceilingFx.lane) &&
  handoffLanded({ handoffPath: ceilingFx.handoff, memoryPath: memory(ceilingFx), warnedAt: latchOf(ceilingFx, 'S') }))) classProofBad.push(CLEARS[3])
// The boundary control's .git is where the walk finds it, its shim prints the stop real git prints at a mount point,
// first line, and only GIT_DISCOVERY_ACROSS_FILESYSTEM lets it through to git's answer.
const shimRev = (env) => spawnSync(path.join(boundaryFx.gitBin, 'git'), ['-C', path.dirname(boundaryFx.handoff), 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, GIT_DISCOVERY_ACROSS_FILESYSTEM: '', ...env } })
const shimBoundary = shimRev({}), shimAcross = shimRev({ GIT_DISCOVERY_ACROSS_FILESYSTEM: '1' })
const realBoundary = spawnSync(realGit, ['-C', '/dev', 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
if (!(fs.existsSync(path.join(boundaryFx.lane, '.git', 'HEAD')) && shimBoundary.status === 128 && realBoundary.status === 128 && /Stopping at filesystem boundary/.test(shimBoundary.stderr) &&
  shimBoundary.stderr.split('\n')[0].startsWith('fatal: not a git repository (or any parent up to mount point ') && realBoundary.stderr.split('\n')[0].startsWith('fatal: not a git repository (or any parent up to mount point ') &&
  shimAcross.status === 0 && shimAcross.stdout.trim() === 'true')) classProofBad.push(CLEARS[2])
// The linked control: no .git above the lane path as written, and its repository holds the handoff and memory file committed and clean.
const linkedSt = spawnSync(realGit, ['-C', linkedFx.repo, 'status', '--porcelain'], { encoding: 'utf8' }), linkedLs = spawnSync(realGit, ['-C', linkedFx.repo, 'ls-files', 'lane/docs/handoffs/h.md', 'lane/SESSION_MEMORY.md'], { encoding: 'utf8' })
if (!(noGitAbove(linkedFx) && fs.lstatSync(linkedFx.lane).isSymbolicLink() && linkedSt.status === 0 && linkedSt.stdout === '' && linkedLs.stdout.trim().split('\n').length === 2)) classProofBad.push(CLEARS[4])
// The repository-ignore control: its own .gitignore ignores the untracked handoff with only the repository's rules read.
const repoOnlyEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_CONFIG_HOME: '/dev/null' }
if (!(spawnSync(realGit, ['-C', repoIgnoreFx.lane, ...SUBARGS['check-ignore']], { env: repoOnlyEnv }).status === 0 &&
  spawnSync(realGit, ['-C', repoIgnoreFx.lane, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md'], { env: repoOnlyEnv }).status !== 0)) classProofBad.push(CLEARS[5])
// The file-link control: the handoff is a link into the same repository, where the link, its target and the memory file are tracked and clean.
const fileLinkSt = spawnSync(realGit, ['-C', fileLinkFx.lane, 'status', '--porcelain'], { encoding: 'utf8' }), fileLinkLs = spawnSync(realGit, ['-C', fileLinkFx.lane, 'ls-files', 'docs/handoffs/h.md', 'docs/store/h.md', 'SESSION_MEMORY.md'], { encoding: 'utf8' })
if (!(fs.lstatSync(fileLinkFx.handoff).isSymbolicLink() && fs.realpathSync(fileLinkFx.handoff) === fs.realpathSync(path.join(fileLinkFx.lane, 'docs/store/h.md')) &&
  fileLinkSt.status === 0 && fileLinkSt.stdout === '' && fileLinkLs.stdout.trim().split('\n').length === 3)) classProofBad.push(CLEARS[6])
// The outside-link controls: the link is tracked in the lane, the file it reaches has no .git above it, and the lane is clean.
for (const [i, fx, link] of [[7, outLinkFx, () => outLinkFx.handoff], [8, memOutFx, () => memory(memOutFx)]]) {
  const st = spawnSync(realGit, ['-C', fx.lane, 'status', '--porcelain'], { encoding: 'utf8' }), ls = spawnSync(realGit, ['-C', fx.lane, 'ls-files', 'docs/handoffs/h.md', 'SESSION_MEMORY.md'], { encoding: 'utf8' })
  if (!(fs.lstatSync(link()).isSymbolicLink() && outside(fs.realpathSync(link())) && st.status === 0 && st.stdout === '' && ls.stdout.trim().split('\n').length === 2)) classProofBad.push(CLEARS[i])
}
// The docs-link control: the lane tracks docs as a link and is clean, and the repository it reaches holds the handoff committed and clean.
{
  const st = (cwd) => spawnSync(realGit, ['-C', cwd, 'status', '--porcelain'], { encoding: 'utf8' })
  if (!(fs.lstatSync(path.join(docsLinkFx.lane, 'docs')).isSymbolicLink() && st(docsLinkFx.lane).stdout === '' && st(docsLinkFx.repoB).stdout === '' && st(docsLinkFx.lane).status === 0 &&
    spawnSync(realGit, ['-C', docsLinkFx.lane, 'ls-files', '--error-unmatch', 'docs']).status === 0 && spawnSync(realGit, ['-C', docsLinkFx.repoB, 'ls-files', '--error-unmatch', 'docs/handoffs/h.md']).status === 0)) classProofBad.push(CLEARS[9])
}
// The chain control: every link in both chains a link tracked where it lives, the files they reach tracked, and every repository clean.
{
  const links = [[chainFx.lane, 'docs/handoffs/h.md'], [chainFx.lane, 'SESSION_MEMORY.md'], [chainFx.b, 'f.md'], [chainFx.mb, 'f.md']]
  if (!(links.every(([d, p]) => fs.lstatSync(path.join(d, p)).isSymbolicLink() && tracked(d, p)) && tracked(chainFx.c, 'f1.md') && tracked(chainFx.mc, 'f1.md') &&
    fs.realpathSync(chainFx.handoff) === fs.realpathSync(path.join(chainFx.c, 'f1.md')) && fs.realpathSync(memory(chainFx)) === fs.realpathSync(path.join(chainFx.mc, 'f1.md')) &&
    [chainFx.lane, chainFx.b, chainFx.c, chainFx.mb, chainFx.mc].every((d) => stAll(d) === ''))) classProofBad.push(CLEARS[10])
}
// The skip-worktree memory control: the memory file tagged S and differing from HEAD's blob under an empty status, the handoff's content HEAD's own.
{
  const g = (...a) => spawnSync(realGit, ['-C', memSkipFx.lane, ...a], { encoding: 'utf8' }).stdout.trim()
  if (!(g('ls-files', '-v', '--', 'SESSION_MEMORY.md')[0] === 'S' && g('hash-object', '--', 'SESSION_MEMORY.md') !== g('rev-parse', 'HEAD:SESSION_MEMORY.md') && g('status', '--porcelain') === '' &&
    g('hash-object', '--', 'docs/handoffs/h.md') === g('rev-parse', 'HEAD:docs/handoffs/h.md') && g('ls-files', '-v', '--', 'docs/handoffs/h.md')[0] === 'H')) classProofBad.push(CLEARS[11])
}
// The monitor control: the hook configured and every entry marked valid, a plain status empty, the handoff and memory file HEAD's own.
// The stat control: both settings in the repository's config, a plain status empty, the handoff HEAD's own at the mtime git stored.
{
  const g = (fx, ...a) => spawnSync(realGit, ['-C', fx.lane, ...a], { encoding: 'utf8' }).stdout.trim(), same = (fx, rel) => g(fx, 'hash-object', '--', rel) === g(fx, 'rev-parse', `HEAD:${rel}`)
  if (!(g(monitorFx, 'config', 'core.fsmonitor').endsWith('fsmonitor.sh') && g(monitorFx, 'status', '--porcelain') === '' && same(monitorFx, 'docs/handoffs/h.md') && same(monitorFx, 'SESSION_MEMORY.md') &&
    g(monitorFx, 'ls-files', '-f', '--', 'docs/handoffs/h.md') === 'h docs/handoffs/h.md')) classProofBad.push(CLEARS[12])
  if (!(g(statFx, 'config', 'core.checkStat') === 'minimal' && g(statFx, 'config', 'core.trustctime') === 'false' && g(statFx, 'status', '--porcelain') === '' &&
    same(statFx, 'docs/handoffs/h.md') && same(statFx, 'SESSION_MEMORY.md') && fs.statSync(statFx.handoff, { bigint: true }).mtimeNs === statFx.mtimeNs)) classProofBad.push(CLEARS[13])
}
// The closed-directory row: the link clean and its target modified as git reads them, and its real path refused while the link itself is there.
if (!(memAccProof.linkClean && memAccProof.targetModified && memAccProof.realpathFails && memAccProof.linkCleanDenied)) classProofBad.push(`closed memory directory ${JSON.stringify(memAccProof)}`)
// The missing-target row: the memory link tracked and clean as git reads it, and its real path refused with ENOENT while the link is there.
{
  let code = null; try { fs.realpathSync.native(memory(memGoneFx)) } catch (e) { code = e.code }
  if (!(fs.lstatSync(memory(memGoneFx)).isSymbolicLink() && code === 'ENOENT' && tracked(memGoneFx.lane, 'SESSION_MEMORY.md') && stAll(memGoneFx.lane) === '')) classProofBad.push('missing memory target')
}
const cg = (args) => gitOf(controlFx, args)
const controlOk = cg(SUBARGS['rev-parse']).stdout.trim() === 'true' && cg(SUBARGS['check-ignore']).status === 1 && Number(cg(SUBARGS.log).stdout.trim()) > 0 &&
  handoffLanded({ handoffPath: controlFx.handoff, memoryPath: memory(controlFx), warnedAt: latchOf(controlFx, 'S') }) && turns(controlFx)?.length === 0
clause('clause 3l — without the sender: each class row carries its one defect (GIT_DIR naming nothing makes git print the phrase with a path, the removed-gitdir row\'s .git a file naming a gitdir that does not exist, which git refuses, the GIT_DIR rows\' handoff uncommitted in the lane, and clean against the other repository), the ceiling row\'s git prints the whole no-repository message inside the lane with the handoff uncommitted, the HEAD row\'s .git a directory without HEAD that git rejects, the nested HEAD row\'s git answering from the enclosing repository with the handoff committed and clean, the ceiling control\'s git printing the whole no-repository message from the handoff\'s directory and its shim printing it at the toplevel only under the ceiling, the no-repository lane has no .git above it, the boundary control\'s .git is in place and its shim prints the stop real git prints at /dev unless GIT_DISCOVERY_ACROSS_FILESYSTEM is set, each symlink row\'s lane path has no .git above it while the handoff\'s physical directory sits in a repository where it is modified, the GIT_CONFIG row\'s handoff untracked and ignored only under the inherited entry, the memory-link row\'s memory file a link git calls clean to a file it calls modified, the file-link row\'s lane path has no .git above it while its handoff is a link to a file modified in its repository, each user-rule row\'s handoff untracked, ignored under that user\'s HOME and not under the repository\'s rules alone, the repository-ignore control\'s handoff untracked and ignored by the repository\'s rules alone, the file-link control\'s handoff a link into its own repository with link, target and memory file tracked and clean, each outside-link row\'s handoff a link tracked in the lane to a file with no .git above it, with only the memory file modified or only the link retargeted, the second-repository memory row\'s link and handoff clean in the lane and the file it reaches modified in its own repository, the closed-directory row\'s memory link clean while its target is modified and its real path refused with EACCES, the missing-target row\'s memory link tracked and clean while its real path is refused with ENOENT, each outside-link control\'s link tracked in a clean lane to a file with no .git above it, the docs-link row\'s lane calling its docs link modified while both repositories it has named hold the handoff committed and clean, the docs-link control\'s lane tracking docs as a clean link to a repository holding the handoff committed and clean, each chain row\'s links each a link, the lane and the last repository clean with every file tracked and only the middle repository calling its link modified, the chain control\'s links and files all tracked in clean repositories, the untracked-link row\'s plain status empty while one listing every untracked file names the link, neither tracked nor ignored, the retargeted memory row\'s lane calling only its tracked memory link modified, which reaches a file with no .git above it, the linked control\'s lane path has no .git above it and its repository is clean with both files tracked, and the control\'s handoff is tracked, committed after the warning and landed through the shim, with no turn since',
  classProofBad.length === 0 && controlOk, JSON.stringify({ classProofBad, controlOk }))

// The wake-all fixtures, read without the sender: the shim plays each pane as the clauses say, and the selection
// fixture's latest limit line per role and the events naming it are the ones the clause names.
{
  const fx = wakeFx({ p: { failGets: 2 }, r: { empty: true }, x: { noAgent: true }, n: { typeFail: true } })
  const get = (pane) => spawnSync(path.join(fx.bin, 'herdr'), ['pane', 'get', pane], { encoding: 'utf8' })
  const pg = [get(fx.pane.p), get(fx.pane.p), get(fx.pane.p)], rg = get(fx.pane.r), xg = get(fx.pane.x)
  const nt = spawnSync(path.join(fx.bin, 'herdr'), ['pane', 'run', fx.pane.n, 'x'], { encoding: 'utf8' })
  const latest = (r) => fs.readFileSync(path.join(sel.run, 'limits.log'), 'utf8').split('\n').filter((l) => l.split(' ')[1] === r).at(-1)?.split(' ') ?? []
  const named = (w, r, l) => selEvents0.includes(` ${w} ${r} ${l}`)
  clause('clause 3x — without the sender: the failing pane exits 1 twice then reads idle, the empty one prints {}, the no-agent one names no session, a failing typing call exits 1; e\'s latest limit line is L6 while its woken names L5, b\'s and f\'s latest lines are named by woken and unwoken, c\'s latest is model, d has none',
    pg[0].status === 1 && pg[1].status === 1 && pg[2].status === 0 && JSON.parse(pg[2].stdout).result.pane.agent_status === 'idle' && rg.stdout.trim() === '{}' &&
    !JSON.parse(xg.stdout).result.pane.agent_session && nt.status === 1 && latest('e')[0] === L(6) && named('woken', 'e', L(5)) && !named('woken', 'e', L(6)) &&
    named('woken', 'b', latest('b')[0]) && named('unwoken', 'f', latest('f')[0]) && latest('c')[2] === 'model' && latest('d').length === 0,
    JSON.stringify([pg.map((g) => g.status), rg.stdout, xg.stdout, nt.status]))
}

process.exit(bad ? 1 : 0)
