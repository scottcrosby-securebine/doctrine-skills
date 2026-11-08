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
const entry = { argv: a, caller: process.env.DCTR_CALLER ?? null }
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
  const status = p.busyUntil > Date.now() ? 'working' : p.busy > 0 ? (p.busy--, 'working') : p.status
  entry.status = status
  out({ result: { pane: { pane_id: a[2], agent_status: status, focused: false, agent_session: { value: p.session } } } })
}
if ([['pane', 'run'], ['agent', 'prompt'], ['pane', 'send-text'], ['pane', 'send-keys']].some(([x, y]) => a[0] === x && a[1] === y)) {
  entry.typed = { pane: a[2], text: a.slice(3).join(' ') }
  const p = s.panes[a[2]]
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
const a = process.argv.slice(2), sub = a[0] === '-C' ? a[2] : a[0]
if (m.sub === sub) {
  if (m.mode === 'fail') { process.stderr.write('fatal: unable to read: Input/output error\\n'); process.exit(128) }
  if (m.mode === 'empty') process.exit(0)
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
const gitMode = (sub, mode) => (fx) => write(path.join(fx.gitBin, 'mode.json'), JSON.stringify({ sub, mode }))
const fileRows = (label, key) => [[`${label} absent`, (fx) => fs.rmSync(fx[key])], [`${label} empty`, (fx) => fs.writeFileSync(fx[key], '')], [`${label} unreadable`, (fx) => fs.chmodSync(fx[key], 0)]]
const CLASS = [
  ...fileRows('the restore file', 'restore'), ...fileRows('the transcript', 'transcript'), ...fileRows('the latch', 'latch'), ...fileRows('the record', 'record'),
  ['git absent', (fx) => { fx.path = `${fx.bin}:${nodeBin}` }],
  ...['rev-parse', 'check-ignore', 'log', 'status'].flatMap((sub) => [[`git ${sub} fails`, gitMode(sub, 'fail')], [`git ${sub} times out`, gitMode(sub, 'slow')]]),
  ['git rev-parse prints nothing', gitMode('rev-parse', 'empty')], ['git log prints nothing', gitMode('log', 'empty')],
]
const classFxs = CLASS.map(([label, prep]) => { const fx = classFx(); prep(fx); return [label, fx] })
const controlFx = classFx()
const classRuns = await Promise.all([...classFxs, ['control', controlFx]].map(([label, fx]) => sender(fx, ['wake', 'a'], { env: { PATH: fx.path } }).then((r) => [label, fx, r])))
const classBad = classRuns.filter(([label, fx, r]) => r.code !== 0 || typed(fx).includes(`${PANE}|/clear`) !== (label === 'control')).map(([label, fx, r]) => `${label}: ${show(fx, r)}`)
clause('clause 2w — every read the wake\'s handoff test makes (restore file, transcript, latch, record, each git call) absent, empty, unreadable or timed out: no /clear typed; the healthy control clears (SR1, SR3)',
  classBad.length === 0, classBad.join(' || '))

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
const memory = (fx) => path.join(fx.lane, 'SESSION_MEMORY.md')
const latchOf = (fx, s) => at(fx, () => { try { return JSON.parse(fs.readFileSync(path.join(stateDir(s), 'gauge.json'), 'utf8')).warnedAt } catch { return null } })
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
const gitOf = (fx, args) => spawnSync(path.join(fx.gitBin, 'git'), ['-C', fx.lane, ...args], { encoding: 'utf8', timeout: 1500 })
const SUBARGS = { 'rev-parse': ['rev-parse', '--is-inside-work-tree'], 'check-ignore': ['check-ignore', '-q', 'docs/handoffs/h.md'], log: ['log', '-1', '--format=%ct', '--', 'docs/handoffs/h.md'], status: ['status', '--porcelain'] }
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
  } else {
    const [, sub, how] = /^git (\S+) (fails|times out|prints nothing)$/.exec(label), r = gitOf(fx, SUBARGS[sub])
    ok = how === 'fails' ? r.status === 128 && /Input\/output error/.test(r.stderr) : how === 'times out' ? r.error?.code === 'ETIMEDOUT' : r.status === 0 && r.stdout === ''
  }
  if (!ok) classProofBad.push(label)
}
const cg = (args) => gitOf(controlFx, args)
const controlOk = cg(SUBARGS['rev-parse']).stdout.trim() === 'true' && cg(SUBARGS['check-ignore']).status === 1 && Number(cg(SUBARGS.log).stdout.trim()) > 0 &&
  handoffLanded({ handoffPath: controlFx.handoff, memoryPath: memory(controlFx), warnedAt: latchOf(controlFx, 'S') }) && turns(controlFx)?.length === 0
clause('clause 3l — without the sender: each class row carries its one defect, and the control\'s handoff is tracked, committed after the warning and landed through the shim, with no turn since',
  classProofBad.length === 0 && controlOk, JSON.stringify({ classProofBad, controlOk }))

process.exit(bad ? 1 : 0)
