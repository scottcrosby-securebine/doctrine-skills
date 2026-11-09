// Behavioral tamper test for the lane watcher, hooks/dctr-lanewatch.mjs (E15 The lane watcher, Recovery), per
// CLAUDE.md's three clauses.
//
//   node hooks/dctr-lanewatch.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 2 drives the watcher's polls in this process (createWatcher) over fixture runs, and start, stop, a second
// watcher and containment as processes, with a `herdr` PATH shim that logs every call and plays each pane from a state
// file; it never reaches a herdr server. Each defect case sits beside its known-good twin. Clause 3 proves the fixtures
// carry what the clauses rest on without running the watcher.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
process.on('uncaughtException', (e) => { console.log(`FAIL  the suite threw: ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); process.exit(1) })

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-lanewatch-')))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
const T = path.join(tmp, 'T'); fs.mkdirSync(T)
process.env.TMPDIR = T
for (const k of Object.keys(process.env)) if (/^(DCTR_|HERDR_)/.test(k)) delete process.env[k]
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t) }
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const bin = path.join(tmp, 'bin')
write(path.join(bin, 'herdr'), `#!${process.execPath}
const fs = require('fs'), path = require('path')
const dir = process.env.SHIM_DIR, a = process.argv.slice(2)
const s = JSON.parse(fs.readFileSync(path.join(dir, 'shim.json'), 'utf8'))
const log = (o) => fs.appendFileSync(path.join(dir, 'shim.log'), JSON.stringify({ argv: a, caller: process.env.DCTR_CALLER ?? null, ...o }) + '\\n')
if (a[0] === 'pane' && a[1] === 'get') {
  const p = s.panes[a[2]]
  if (!p || p.fail) { log({ failed: true }); process.stderr.write('{"error":{"code":"server_error"}}\\n'); process.exit(1) }
  log({})
  if (p.empty) { console.log('{}'); process.exit(0) }
  console.log(JSON.stringify({ result: { pane: { pane_id: a[2], agent_status: p.status || 'idle', ...(p.session !== null && p.session !== undefined ? { agent_session: { value: p.session } } : {}) } } }))
  process.exit(0)
}
if (a[0] === 'notification') { log({}); console.log('shown'); process.exit(0) }
if (a[0] === 'tab' && a[1] === 'create') { log({}); console.log(JSON.stringify({ result: { root_pane: { pane_id: 'w5:p5' } } })); process.exit(0) }
log({ typed: ['run', 'send-text', 'send-keys', 'prompt'].includes(a[1]) })
process.exit(0)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
process.env.PATH = `${bin}:${process.env.PATH}`

const { createWatcher, POLL_MS, READY_LIMIT_MS, BRIDGE_EXPIRY_MS } = await import('./dctr-lanewatch.mjs')
const { laneOf } = await import('./dctr-lib.mjs')
const { restoreFile, stateDir, takePidLock } = await import('./dctr-state.mjs')
const lanewatch = await import('./dctr-lanewatch.mjs')
const { bridgeFile } = await import('./dctr-bridge.mjs')
const WATCH = path.join(import.meta.dirname, 'dctr-lanewatch.mjs')

const kickoff = (h) => `# memory\n\n## Next Session Kickoff\n\nhandoff: ${h} | state: open\n`
let n = 0
/** A run in a git repo named `fxrepo-<n>`, one worktree per role with a kickoff chain to its record, lane.log naming
 *  each role's pane, and the shim playing those panes. */
function fixture(roles, { extraLog = [] } = {}) {
  const dir = path.join(tmp, `f${++n}`), repo = path.join(dir, `fxrepo-${n}`)
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
  const run = path.join(repo, '.doctrine/records/orchestrate'); fs.mkdirSync(run, { recursive: true })
  const fx = { dir, repo, run, record: {}, pane: {}, wt: {} }
  const panes = {}, lines = []
  let i = 0
  for (const [r, p] of Object.entries(roles)) {
    const wt = path.join(dir, `wt-${r}`), pane = p.pane || `w1:p${++i}`
    write(path.join(wt, 'SESSION_MEMORY.md'), kickoff('docs/handoffs/h.md'))
    write(path.join(wt, 'docs/handoffs/h.md'), `record: docs/records/${r}.md\n`)
    fx.record[r] = path.join(wt, 'docs/records', `${r}.md`); write(fx.record[r], p.record ?? '- State: Open\n')
    fx.pane[r] = pane; fx.wt[r] = wt
    panes[pane] = { session: p.session === undefined ? `S-${r}` : p.session, status: 'idle', ...p.shim }
    lines.push(`2026-11-09T09:00:00Z orchestrator create ${r} ${pane} ${wt} cd ${wt} && env DCTR_ROLE=${r} claude`)
  }
  write(path.join(run, 'lane.log'), [...lines, ...extraLog].join('\n') + '\n')
  write(path.join(dir, 'shim.json'), JSON.stringify({ panes }))
  write(path.join(dir, 'shim.log'), '')
  return fx
}
const setPanes = (fx, patch) => { const f = path.join(fx.dir, 'shim.json'), s = JSON.parse(fs.readFileSync(f, 'utf8')); for (const [k, v] of Object.entries(patch)) s.panes[k] = { ...s.panes[k], ...v }; fs.writeFileSync(f, JSON.stringify(s)) }
const shimLog = (fx) => fs.readFileSync(path.join(fx.dir, 'shim.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const events = (fx) => { try { return fs.readFileSync(path.join(fx.run, 'events.log'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1).join(' ')) } catch { return [] } }
const notes = (fx) => shimLog(fx).filter((e) => e.argv[0] === 'notification')
/** `k` polls of watcher `w` over fixture `fx`. */
const polls = (fx, w, k = 1) => { process.env.SHIM_DIR = fx.dir; for (let j = 0; j < k; j++) w.poll() }
const watcher = (fx, mod = { createWatcher }) => { process.env.SHIM_DIR = fx.dir; return mod.createWatcher(fx.run, { plugin: '/plugin' }) }
const show = (fx) => JSON.stringify({ events: events(fx), calls: shimLog(fx).map((e) => e.argv.slice(0, 3).join(' ')) })
const ago = (ms) => new Date(Date.now() - ms).toISOString()

// ---------------------------------------------------------------- clause 2: the polls

// E15-D9, D10: lane reports.
const inbox = fixture({ a: {} })
const w1 = watcher(inbox)
polls(inbox, w1)
write(path.join(inbox.run, 'inbox/20261109T090000000Z.1-a-report.md'), 'done')
write(path.join(inbox.run, 'inbox/.20261109T090001000Z.2-a-report.md.part'), 'half')
polls(inbox, w1)
const afterOne = events(inbox)
polls(inbox, w1, 2)
clause('clause 2a — a new report in the inbox raises exactly one event line naming it, and a part file none (E15-D9)',
  JSON.stringify(afterOne) === '["report 20261109T090000000Z.1-a-report.md"]', show(inbox))
clause('clause 2b — two more polls over the unchanged inbox add no line (E15-D10)',
  JSON.stringify(events(inbox)) === JSON.stringify(afterOne), show(inbox))
const restarted = watcher(inbox); polls(inbox, restarted)
clause('clause 2b2 — a watcher started again on the same run raises no report events.log already holds',
  JSON.stringify(events(inbox)) === JSON.stringify(afterOne), show(inbox))

// E15-D11, D111, D110: exits and unknown reads.
const exit = fixture({ a: { session: null } }, { extraLog: ['2026-11-09T09:05:00Z orchestrator reset a HEAD', '2026-11-09T09:06:00Z orchestrator create z w9:p9'] })
polls(exit, watcher(exit), 2)
const live = fixture({ a: {} }, { extraLog: ['2026-11-09T09:05:00Z orchestrator reset a HEAD'] })
polls(live, watcher(live), 2)
clause('clause 2c — the pane a role\'s latest create line names reporting no agent session, a reset line after it, on two polls: exactly one exit line naming the role; a create line with no worktree names no pane and is passed over (E15-D11)',
  JSON.stringify(events(exit)) === `["exit a ${exit.pane.a}"]` && shimLog(exit).filter((e) => e.argv[1] === 'get').every((e) => e.argv[2] === exit.pane.a), show(exit))
clause('clause 2d — a pane still reporting an agent session, whatever agent names herdr lists: no event over two polls (E15-D111)',
  events(live).length === 0, show(live))
const unknown = fixture({ a: { shim: { fail: true } } })
const wu = watcher(unknown); polls(unknown, wu)
setPanes(unknown, { [unknown.pane.a]: { fail: false, empty: true } }); polls(unknown, wu)
clause('clause 2e — a pane read that fails, then one that prints {}: no exit event and no typing call (E15-D110)',
  events(unknown).length === 0 && !shimLog(unknown).some((e) => e.typed) && shimLog(unknown).filter((e) => e.argv[1] === 'get').length === 2, show(unknown))

// E15-D12, D13, D14: seat deadlines.
const waves = fixture({ a: {} })
const out = (s) => path.join(waves.wt.a, `${s}.out`)
for (const s of ['s1', 's2', 's3', 's4']) write(out(s), 'x')
write(waves.record.a, ['- State: Open',
  `- wave: ${ago(600000)} seat s1 handle s1.out deadline ${ago(60000)}`,
  `- wave: ${ago(600000)} seat s2 handle s2.out deadline ${ago(60000)}`,
  `- wave: ${ago(600000)} seat s3 handle s3.out`,
  `- wave: ${ago(600000)} seat s4 handle s4.out deadline ${new Date(Date.now() + 3600000).toISOString()}`, ''].join('\n'))
const ww = watcher(waves)
polls(waves, ww); fs.appendFileSync(out('s2'), 'more'); polls(waves, ww); fs.appendFileSync(out('s2'), 'more'); polls(waves, ww)
clause('clause 2f — a seat past its deadline with no growth in its handle file: one event line naming it, over three polls (E15-D12)',
  events(waves).filter((e) => e === 'deadline a s1').length === 1, show(waves))
clause('clause 2g — a seat past its deadline whose output grows each poll, an undated wave line, and a deadline still ahead: no event (E15-D13, D14)',
  events(waves).every((e) => e === 'deadline a s1'), show(waves))

// E15-D105: standing pauses.
const ROLES = { p: {}, b: {}, q: {}, al: {}, ok: {} }
const pauses = fixture(ROLES)
const wp = watcher(pauses)
polls(pauses, wp)
const quiet = events(pauses).length
const GAINS = {
  p: '- auto-cycle paused: session idle, waiting for you', b: '- State: Blocked. waits on Q2', q: '- question: Q1 opened 2026-11-09T09:00:00Z which way?',
  al: '- alarm: round fired 2026-11-09T09:00:00Z count 4', ok: '- alarm: round fired 2026-11-09T09:00:00Z count 4\n- ruling: R1 2026-11-09T09:10:00Z go on',
}
for (const [r, line] of Object.entries(GAINS)) fs.appendFileSync(pauses.record[r], line + '\n')
polls(pauses, wp, 2)
const pe = events(pauses), one = (r, re) => pe.filter((e) => e.startsWith(`pause ${r} `)).length === 1 && pe.some((e) => e.startsWith(`pause ${r} `) && re.test(e))
clause('clause 2h — each record newly showing a paused line, a Blocked state, an unanswered question and an alarm with no ruling gives exactly one event naming its role and reason, and an alarm with a ruling after it none (E15-D105)',
  quiet === 0 && one('p', /auto-cycle paused: session idle/) && one('b', /Blocked\. waits on Q2/) && one('q', /question Q1 unanswered: which way\?/) &&
  one('al', /round alarm with no ruling/) && !pe.some((e) => e.startsWith('pause ok ')) && pe.length === 4, show(pauses))

// E15-D107: a held ready line.
const asst = (at, text, usage) => JSON.stringify({ type: 'assistant', timestamp: at, uuid: `u-${at}`, message: { role: 'assistant', content: [{ type: 'text', text }], ...(usage ? { usage } : {}) } })
const transcript = (fx, r, lines) => {
  const tr = path.join(fx.dir, `${r}.jsonl`); write(tr, lines.join('\n') + '\n')
  write(restoreFile(fx.pane[r]), JSON.stringify({ session_id: `S-${r}`, transcript_path: tr }))
}
const held = fixture({ old: {}, young: {}, cyc: {} })
for (const r of ['old', 'cyc']) transcript(held, r, [asst(ago(READY_LIMIT_MS + 60000), 'Handoff written.\nauto-cycle: ready')])
transcript(held, 'young', [asst(ago(READY_LIMIT_MS / 2), 'Handoff written.\nauto-cycle: ready')])
const wh = watcher(held)
polls(held, wh)
fs.appendFileSync(held.record.cyc, '- auto-cycle: cycle 1 tree abc\n')
polls(held, wh, 2)
clause('clause 2i — a last assistant message ending with the ready line for longer than the ready limit, no cycle line since: one event naming it; its twin younger than the limit none, and one whose record gains a cycle line after the first poll none (E15-D107)',
  JSON.stringify(events(held)) === '["ready old S-old"]', show(held))

// E15-D108, D109: context past the resolved tier, and a stale bridge file.
const bridge = (s, used, ageMs = 0) => {
  const f = bridgeFile(s); write(f, JSON.stringify({ session_id: s, window: 1000000, used, t: new Date().toISOString() }))
  const at = (Date.now() - ageMs) / 1000; fs.utimesSync(f, at, at)
}
const ON = '- State: Open\n- auto-cycle: on cap 10 tier 200000\n'
const tier = fixture({ c: { record: ON }, w: { record: `${ON}- auto-cycle: warned S-w 215000\n` } })
for (const r of ['c', 'w']) transcript(tier, r, [asst(ago(60000), 'working', { input_tokens: 150000 })])
const wt = watcher(tier)
bridge('S-c', 205000); bridge('S-w', 205000); polls(tier, wt, 2)
const at205 = events(tier).length
bridge('S-c', 216000); bridge('S-w', 216000); polls(tier, wt)
const at216once = events(tier).length
polls(tier, wt)
clause('clause 2j — a 200,000 tier the first reading of 150,000 raises to 215,000: two polls at 205,000 give nothing, one at 216,000 nothing yet, the second one event, and a twin whose record warns its session none (E15-D108)',
  at205 === 0 && at216once === 0 && JSON.stringify(events(tier)) === '["context c S-c past tier 215000 at 216000"]', show(tier))
const latched = fixture({ l: { record: ON } })
transcript(latched, 'l', [asst(ago(60000), 'working', { input_tokens: 150000 })])
write(path.join(stateDir('S-l'), 'gauge.json'), JSON.stringify({ session_id: 'S-l', firstUsed: 160000 }))
bridge('S-l', 220000); polls(latched, watcher(latched), 2)
clause('clause 2j2 — the first reading is the gauge latch\'s where it has one: a latch first reading of 160,000 sets the tier at 225,000, so two polls at 220,000 give nothing (E15-D108)',
  events(latched).length === 0, show(latched))
const stale = fixture({ x: { record: ON }, y: { record: ON } })
for (const r of ['x', 'y']) transcript(stale, r, [asst(ago(60000), 'working', { input_tokens: 150000 })])
bridge('S-x', 300000, 2 * BRIDGE_EXPIRY_MS); bridge('S-y', 300000, BRIDGE_EXPIRY_MS / 2)
polls(stale, watcher(stale), 2)
clause('clause 2k — a bridge file twice the expiry old gives one unknown event and no past-tier line; one half the expiry old gives its past-tier line (E15-D109)',
  JSON.stringify(events(stale).filter((e) => e.startsWith('context x '))) === '["context x S-x unknown"]' &&
  JSON.stringify(events(stale).filter((e) => e.startsWith('context y '))) === '["context y S-y past tier 215000 at 300000"]', show(stale))

// E15-D227, D230, D231: limit events and the account episode.
const RESET = '2026-11-09T12:00:00Z'
const lim = fixture({ a: {}, b: {}, c: {} })
const limLine = (i, r, kind, field) => `2026-11-09T04:00:0${i}.000Z ${r} ${kind} ${field}`
write(path.join(lim.run, 'limits.log'), limLine(1, 'a', 'account', RESET) + '\n')
const wl = watcher(lim)
polls(lim, wl)
const firstEv = events(lim).filter((e) => e.startsWith('limit ')), firstNotes = notes(lim).length
fs.appendFileSync(path.join(lim.run, 'limits.log'), [limLine(2, 'b', 'account', RESET), limLine(3, 'a', 'model', '-'), limLine(4, 'a', 'other', 'server_error')].join('\n') + '\n')
polls(lim, wl, 2)
const limEv = events(lim).filter((e) => e.startsWith('limit ')).slice(1)
const CMD = `roll, then run: node /plugin/hooks/dctr-send.mjs wake-all ${lim.run}`
clause('clause 2l — one line seen on an earlier poll, then three new ones: exactly three limit events over two polls, one per line (E15-D227)',
  firstEv.length === 1 && limEv.length === 3, show(lim))
clause('clause 2m — an account event names the role, the reset time and the wake-all command; a model event the role and /model; an other event the role and the error (E15-D230)',
  firstEv[0] === `limit a account 2026-11-09T04:00:01.000Z reset ${RESET} ${CMD}` && limEv[0] === `limit b account 2026-11-09T04:00:02.000Z reset ${RESET} ${CMD}` &&
  limEv[1] === 'limit a model 2026-11-09T04:00:03.000Z /model' && limEv[2] === 'limit a other 2026-11-09T04:00:04.000Z error server_error', JSON.stringify([firstEv, limEv]))
const midNotes = notes(lim).length
sleep(5)
fs.appendFileSync(path.join(lim.run, 'events.log'), `${new Date().toISOString()} woken a 2026-11-09T04:00:01.000Z\n`)
fs.appendFileSync(path.join(lim.run, 'limits.log'), limLine(5, 'c', 'account', RESET) + '\n')
polls(lim, wl, 2)
const titles = notes(lim).map((e) => e.argv[2])
const limEvents = events(lim).length, limNotes = notes(lim).length
polls(lim, watcher(lim), 2)
clause('clause 2l2 — a watcher started again on the same run raises no limit event events.log already holds, and notifies nothing',
  events(lim).length === limEvents && notes(lim).length === limNotes, show(lim))
clause('clause 2n — two account lines and a model line notify once, a woken line then a third account line once more, each titled with the repo\'s name, the reset time and wake-all, never sent again after a reply that does not parse (E15-D231)',
  firstNotes === 1 && midNotes === 1 && notes(lim).length === 2 && titles.every((t) => t === `${path.basename(lim.repo)} run: account limit, reset ${RESET}; roll, then wake-all`) &&
  notes(lim).every((e) => JSON.stringify(e.argv.slice(3)) === '["--sound","request"]'), JSON.stringify(titles))

// XS-36: only a woken line ends the episode, and a run outside a git repo is named by its path.
const episode = fixture({ a: {}, b: {} })
fs.rmSync(path.join(episode.repo, '.git'), { recursive: true })
write(path.join(episode.run, 'events.log'), `${ago(3700000)} report 20261108T040000000Z.1-a-report.md\n${ago(3600000)} woken a 2026-11-08T04:00:01.000Z\n`)
write(path.join(episode.run, 'limits.log'), limLine(1, 'a', 'account', RESET) + '\n')
const we = watcher(episode)
polls(episode, we)
sleep(5)
fs.appendFileSync(path.join(episode.run, 'events.log'), `${new Date().toISOString()} unfinished a 2026-11-09T04:00:01.000Z\n${new Date().toISOString()} retry b 2026-11-09T04:00:01.000Z\n`)
fs.appendFileSync(path.join(episode.run, 'limits.log'), limLine(2, 'b', 'account', RESET) + '\n')
polls(episode, we)
clause('clause 2n2 — a woken line from before the first notification, or an unfinished or retry line after it, does not end the episode: a later account line notifies nothing; the title of a run in no git repo names the run\'s path (XS-36)',
  notes(episode).length === 1 && notes(episode)[0].argv[2] === `${episode.run} run: account limit, reset ${RESET}; roll, then wake-all`, JSON.stringify(notes(episode).map((e) => e.argv[2])))

// E15-D238: orchestrator stalls.
const stallBad = []
for (const line of ['unwoken orchestrator L', 'unfinished orchestrator L', 'skip orchestrator L no-agent']) {
  const fx = fixture({ a: {} })
  const w = watcher(fx)
  const word = line.split(' ')[0], L0 = '2026-11-09T04:00:01.000Z'
  const ev = (r) => `${new Date().toISOString()} ${line.replace('orchestrator', r).replace(' L', ` ${L0}`)}`
  fs.appendFileSync(path.join(fx.run, 'events.log'), `${ev('orchestrator')}\n${ev('a')}\n`)
  polls(fx, w, 2)
  polls(fx, watcher(fx))
  const t = notes(fx).map((e) => e.argv[2])
  if (t.length !== 1 || !t[0].includes('orchestrator') || !t[0].includes(word)) stallBad.push(`${word}: ${JSON.stringify(t)}`)
}
clause('clause 2o — each unwoken, unfinished and no-agent skip line naming the orchestrator gives exactly one notification naming the orchestrator and the word, a watcher started again after it none; the same line for role a none (E15-D238)',
  stallBad.length === 0, stallBad.join(' || '))

// E15-D214: the pane only through laneOf.
const copy = path.join(tmp, 'copy'); fs.cpSync(import.meta.dirname, copy, { recursive: true })
const libCopy = path.join(copy, 'dctr-lib.mjs'), lib = fs.readFileSync(libCopy, 'utf8')
const READER = 'found = { time: m[1], caller: m[2], role: r, pane, worktree'
fs.writeFileSync(libCopy, lib.replace(READER, "found = { time: m[1], caller: m[2], role: r, pane: r === 'a' ? 'w7:p7' : pane, worktree"))
const viaReader = fixture({ a: { pane: 'w1:p1' } })
setPanes(viaReader, { 'w7:p7': { session: null, status: 'unknown' } })
const copied = await import(path.join(copy, 'dctr-lanewatch.mjs'))
polls(viaReader, watcher(viaReader, copied), 2)
const read = shimLog(viaReader).filter((e) => e.argv[1] === 'get').map((e) => e.argv[2])
const src = fs.readFileSync(WATCH, 'utf8').split('\n')
const laneTextUses = src.filter((l) => /\blaneText\b/.test(l) && !/^\s*\/\//.test(l))
clause('clause 2p — with the reader returning w7:p7 for a while lane.log names w1:p1, the watcher reads w7:p7 alone and raises one exit; its source derives no pane from lane.log but through laneOf (E15-D214)',
  lib.split(READER).length === 2 && JSON.stringify(events(viaReader)) === '["exit a w7:p7"]' && read.length === 2 && read.every((p) => p === 'w7:p7') &&
  !src.some((l) => /LANE_LINE/.test(l)) && laneTextUses.every((l) => /const laneText = readText\(path\.join\(run, 'lane\.log'\)\)|laneRoles\(laneText\)/.test(l)) &&
  laneTextUses.every((l) => !/laneText\.|laneText\)\.|split\(/.test(l.replace(/laneOf\(laneText, role\)/, ''))),
  `${show(viaReader)} ${JSON.stringify(laneTextUses)}`)

// ---------------------------------------------------------------- clause 2: start, stop, single instance, containment

const SCRUBBED = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DCTR_|HERDR_|SHIM_)/.test(k)))
function proc(args, env, cwd = tmp) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [WATCH, ...args], { cwd, env: { ...SCRUBBED, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let o = '', e = ''
    c.stdout.on('data', (d) => { o += d }); c.stderr.on('data', (d) => { e += d })
    const kill = setTimeout(() => c.kill('SIGKILL'), 20000)
    c.on('close', (code) => { clearTimeout(kill); resolve({ code, out: o, err: e.trim() }) })
  })
}

// E15-D244, D248, D162.
const st = fixture({})
const T2 = path.join(tmp, 'T2'); fs.mkdirSync(T2)
const nodeShimDir = path.join(tmp, 'nodeshim'), envLog = path.join(tmp, 'node-env.log')
write(path.join(nodeShimDir, 'node'), `#!/bin/sh\nenv > ${envLog}\n`); fs.chmodSync(path.join(nodeShimDir, 'node'), 0o755)
const startPath = `${nodeShimDir}:${bin}:/usr/bin:/bin`
const rStart = await proc(['start'], { DCTR_ROLE: 'orchestrator', DCTR_CALLER: 'orchestrator', DCTR_RUN: st.run, HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0', PATH: startPath, TMPDIR: T2, SHIM_DIR: st.dir }, st.repo)
const orch = laneOf(fs.readFileSync(path.join(st.run, 'lane.log'), 'utf8'), 'orchestrator')
clause('clause 2q — start appends an orchestrator create line that laneOf reads as the orchestrator\'s pane and checkout (E15-D244)',
  rStart.code === 0 && orch?.pane === 'w0:p0' && orch?.worktree === st.repo && orch?.caller === 'orchestrator' && /DCTR_ROLE=orchestrator/.test(orch?.launch ?? ''),
  JSON.stringify([rStart, orch]))
clause('clause 2r — start writes its TMPDIR to <run>/tmpdir (E15-D248)',
  fs.existsSync(path.join(st.run, 'tmpdir')) && fs.readFileSync(path.join(st.run, 'tmpdir'), 'utf8') === T2, JSON.stringify(rStart))
const paneCmd = shimLog(st).find((e) => e.argv[0] === 'pane' && e.argv[1] === 'run')?.argv[3]
const ran = paneCmd ? spawnSync('env', ['-i', 'sh', '-c', paneCmd], { encoding: 'utf8' }) : null
const nodeEnv = fs.existsSync(envLog) ? Object.fromEntries(fs.readFileSync(envLog, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {}
clause('clause 2s — the pane command, run under env -i, starts node with DCTR_CALLER=watcher and the DCTR_RUN, PATH and TMPDIR of the start call (E15-D162)',
  Boolean(paneCmd) && ran?.status === 0 && nodeEnv.DCTR_CALLER === 'watcher' && nodeEnv.DCTR_RUN === st.run && nodeEnv.PATH === startPath && nodeEnv.TMPDIR === T2,
  JSON.stringify([paneCmd, nodeEnv]))

// E15-D8: one watcher per run.
const single = fixture({ a: {} })
const watchEnv = { DCTR_RUN: single.run, PATH: `${bin}:${process.env.PATH}`, TMPDIR: T, SHIM_DIR: single.dir }
const first = spawn(process.execPath, [WATCH], { env: { ...SCRUBBED, ...watchEnv }, stdio: 'ignore' })
const lock = path.join(single.run, 'lanewatch.lock')
for (let t = 0; t < 100 && !fs.existsSync(lock); t++) sleep(50)
const rSecond = await proc([], watchEnv)
const rStart2 = await proc(['start'], { ...watchEnv, DCTR_ROLE: 'orchestrator', HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0' }, single.repo)
const firstAlive = first.exitCode === null
const firstExit = new Promise((r) => first.on('exit', (code, sig) => r([code, sig])))
const rStop = await proc(['stop'], watchEnv)
const stopped = await Promise.race([firstExit, new Promise((r) => setTimeout(() => r('still running'), 5000))])
clause('clause 2t — a second watcher and a second start on the same run each exit non-zero while the first runs, which stop then ends (E15-D8)',
  rSecond.code !== 0 && rStart2.code !== 0 && firstAlive && rStop.code === 0 && Array.isArray(stopped) && !fs.existsSync(lock) &&
  !shimLog(single).some((e) => e.argv[0] === 'tab'), JSON.stringify([rSecond, rStart2, firstAlive, rStop, stopped]))
if (first.exitCode === null) first.kill('SIGKILL')

// E15-D112: containment.
const cont = fixture({ a: {} })
const contEnv = { DCTR_RUN: cont.run, PATH: `${bin}:${process.env.PATH}`, TMPDIR: T, SHIM_DIR: cont.dir, DCTR_VIEW_REQUEST_DIR: path.join(cont.dir, 'vr'), DCTR_ROLE: 'orchestrator', HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0' }
const rc1 = await proc(['start'], contEnv, cont.repo), rc2 = await proc([], contEnv)
clause('clause 2u — contained, start and the watcher each exit non-zero and the shim logs no call (E15-D112)',
  rc1.code !== 0 && rc2.code !== 0 && shimLog(cont).length === 0 && !fs.existsSync(path.join(cont.run, 'tmpdir')), JSON.stringify([rc1, rc2, shimLog(cont)]))

clause('clause 2v — the header names a 30 s poll interval, a 10 minute ready limit and a 5 minute bridge expiry (WS-1)',
  POLL_MS === 30000 && READY_LIMIT_MS === 600000 && BRIDGE_EXPIRY_MS === 300000, JSON.stringify([POLL_MS, READY_LIMIT_MS, BRIDGE_EXPIRY_MS]))

// ---------------------------------------------------------------- clause 2: round-1 repairs

// WB13, WB14: an exit after a recovery is a new exit; an empty session value is no agent.
const again = fixture({ a: { session: null }, e: { session: '' } })
const wa = watcher(again)
polls(again, wa)
setPanes(again, { [again.pane.a]: { session: 'S-a' } }); polls(again, wa)
setPanes(again, { [again.pane.a]: { session: null } }); polls(again, wa)
clause('clause 2w — a pane that exits, recovers and exits again gives two exit lines; a pane whose agent session value is empty is an exit (E15-D11)',
  events(again).filter((e) => e.startsWith('exit a ')).length === 2 && events(again).filter((e) => e.startsWith('exit e ')).length === 1, show(again))

// WB2: a handle that is not a file gives no liveness, so no deadline.
const agents = fixture({ a: {} })
write(agents.record.a, ['- State: Open', `- wave: ${ago(600000)} seat s5 handle agent:abc123 deadline ${ago(60000)}`,
  `- wave: ${ago(600000)} seat s6 handle agent b77 (worktree wt/b) deadline ${ago(60000)}`, `- wave: ${ago(600000)} seat s7 handle a1b2c3 deadline ${ago(60000)}`,
  `- wave: ${ago(600000)} seat s8 handle docs deadline ${ago(60000)}`, ''].join('\n'))
polls(agents, watcher(agents), 3)
clause('clause 2x — a seat past its deadline whose handle names no readable file (an agent id in any form, or a directory) raises no deadline line: its liveness is unknown (E15-D12, D13)',
  events(agents).length === 0, show(agents))

// WB5: the stall title, exactly.
const titled = fixture({ a: {} })
fs.appendFileSync(path.join(titled.run, 'events.log'), `${new Date().toISOString()} unwoken orchestrator 2026-11-09T04:00:01.000Z\n`)
polls(titled, watcher(titled))
clause('clause 2y — the stall notification is titled `<name> run: orchestrator <word> by wake-all` and nothing more (E15-D238)',
  JSON.stringify(notes(titled).map((e) => e.argv.slice(2))) === JSON.stringify([[`${path.basename(titled.repo)} run: orchestrator unwoken by wake-all`, '--sound', 'request']]), JSON.stringify(notes(titled)))

// WB4: a restart mid-episode, and a stall line written while no watcher ran.
const mid = fixture({ a: {}, b: {} })
write(path.join(mid.run, 'limits.log'), limLine(1, 'a', 'account', RESET) + '\n')
polls(mid, watcher(mid))
fs.appendFileSync(path.join(mid.run, 'limits.log'), limLine(2, 'b', 'account', RESET) + '\n')
polls(mid, watcher(mid))
fs.appendFileSync(path.join(mid.run, 'events.log'), `${new Date().toISOString()} unfinished orchestrator 2026-11-09T04:00:01.000Z\n`)
polls(mid, watcher(mid), 2)
polls(mid, watcher(mid))
const midAccount = notes(mid).filter((e) => /account limit/.test(e.argv[2])).length
sleep(5)
fs.appendFileSync(path.join(mid.run, 'events.log'), `${new Date().toISOString()} woken a 2026-11-09T04:00:01.000Z\n`)
const afterWoken = watcher(mid)
fs.appendFileSync(path.join(mid.run, 'limits.log'), limLine(3, 'a', 'account', RESET) + '\n')
polls(mid, afterWoken)
fs.appendFileSync(path.join(mid.run, 'limits.log'), limLine(4, 'b', 'account', RESET) + '\n')
polls(mid, watcher(mid))
clause('clause 2z — a watcher restarted mid-episode sends no second account notification for a later account line, one restarted after a woken line notifies the next episode once and, restarted again within it, not twice, and a stall line written while none ran notifies once, a further restart none (E15-D231, D238)',
  midAccount === 1 && notes(mid).filter((e) => /account limit/.test(e.argv[2])).length === 2 && notes(mid).filter((e) => /orchestrator unfinished/.test(e.argv[2])).length === 1, JSON.stringify(notes(mid).map((e) => e.argv[2])))

// WB8: two limit lines with the same role and time are two lines.
const twin = fixture({ a: {} })
write(path.join(twin.run, 'limits.log'), [limLine(1, 'a', 'model', '-'), limLine(1, 'a', 'other', 'server_error')].join('\n') + '\n')
polls(twin, watcher(twin)); polls(twin, watcher(twin))
clause('clause 2aa — two limits.log lines with the same role and time each raise one event, and a restart raises neither again (E15-D227)',
  events(twin).filter((e) => e.startsWith('limit ')).length === 2, show(twin))

// WB9: the poll loop waits POLL_MS between polls.
const looped = fixture({ a: {} })
const waits = []
let loopPolls = 0
const counting = { poll: () => { loopPolls += 1 } }
process.env.SHIM_DIR = looped.dir
await lanewatch.watch?.(counting, async (ms) => { waits.push(ms); if (waits.length >= 2) throw new Error('stop') }).catch(() => {})
clause('clause 2ab — the watcher\'s loop polls, waits POLL_MS, polls again and waits POLL_MS again (WS-1)',
  typeof lanewatch.watch === 'function' && JSON.stringify(waits) === JSON.stringify([POLL_MS, POLL_MS]) && loopPolls === 2, JSON.stringify([waits, loopPolls]))

// WB1: a stale lock replaced by one contender while another holds a dead read of it.
const raceLock = path.join(tmp, 'race.lock')
const deadPid = String(spawnSync('true').pid)
fs.writeFileSync(raceLock, deadPid)
const origRead = fs.readFileSync
let interleaved = false
fs.readFileSync = function (p, ...rest) {
  const v = origRead.call(fs, p, ...rest)
  if (!interleaved && String(p) === raceLock) { interleaved = true; fs.rmSync(raceLock); fs.writeFileSync(raceLock, '1') } // contender B, pid 1 (live)
  return v
}
let raced
try { raced = takePidLock(raceLock) } finally { fs.readFileSync = origRead }
clause('clause 2ac — a contender that read a dead pid while another replaced the lock with a live one does not take it and leaves the live holder in place',
  interleaved && raced === false && fs.readFileSync(raceLock, 'utf8').trim() === '1', JSON.stringify([interleaved, raced, fs.readFileSync(raceLock, 'utf8')]))

// WB3: two concurrent starts.
const duo = fixture({})
const duoEnv = { DCTR_ROLE: 'orchestrator', DCTR_RUN: duo.run, HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0', PATH: `${bin}:/usr/bin:/bin`, TMPDIR: T, SHIM_DIR: duo.dir }
const duoR = await Promise.all([proc(['start'], duoEnv, duo.repo), proc(['start'], duoEnv, duo.repo)])
const creates = fs.readFileSync(path.join(duo.run, 'lane.log'), 'utf8').split('\n').filter((l) => / create orchestrator /.test(l))
clause('clause 2ad — two starts at once: one exits 0 and one non-zero, with one create line and one tab between them',
  duoR.filter((r) => r.code === 0).length === 1 && creates.length === 1 && shimLog(duo).filter((e) => e.argv[0] === 'tab').length === 1, JSON.stringify([duoR, creates.length, shimLog(duo).length]))

// WB6: a checkout path holding whitespace.
const spaced = path.join(tmp, 'with space', 'repo'); fs.mkdirSync(path.join(spaced, '.git'), { recursive: true })
const spacedRun = path.join(spaced, '.doctrine/records/orchestrate')
write(path.join(tmp, 'spaced-shim', 'shim.json'), JSON.stringify({ panes: {} })); write(path.join(tmp, 'spaced-shim', 'shim.log'), '')
const tabbed = path.join(tmp, 'with\ttab', 'repo'); fs.mkdirSync(path.join(tabbed, '.git'), { recursive: true })
const rTabbed = await proc(['start'], { DCTR_ROLE: 'orchestrator', DCTR_RUN: path.join(tabbed, '.doctrine/records/orchestrate'), HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0', PATH: `${bin}:/usr/bin:/bin`, TMPDIR: T, SHIM_DIR: path.join(tmp, 'spaced-shim') }, tabbed)
const rSpaced = await proc(['start'], { DCTR_ROLE: 'orchestrator', DCTR_RUN: spacedRun, HERDR_PANE_ID: 'w0:p0', HERDR_WORKSPACE_ID: 'w0', PATH: `${bin}:/usr/bin:/bin`, TMPDIR: T, SHIM_DIR: path.join(tmp, 'spaced-shim') }, spaced)
clause('clause 2ae — start from a checkout whose path holds a space, or a tab, refuses, writes no tmpdir or lane.log line, and calls herdr( zero times',
  rSpaced.code !== 0 && rTabbed.code !== 0 && !fs.existsSync(path.join(spacedRun, 'tmpdir')) && !fs.existsSync(path.join(spacedRun, 'lane.log')) && fs.readFileSync(path.join(tmp, 'spaced-shim', 'shim.log'), 'utf8') === '', JSON.stringify(rSpaced))

// WN3: stop signals only a watcher.
const imposter = fixture({ a: {} })
const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' })
write(path.join(imposter.run, 'lanewatch.lock'), String(sleeper.pid))
const oldAt = (Date.now() - 10 * POLL_MS) / 1000; fs.utimesSync(path.join(imposter.run, 'lanewatch.lock'), oldAt, oldAt)
const rImp = await proc(['stop'], { DCTR_RUN: imposter.run, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: T, SHIM_DIR: imposter.dir })
sleep(200)
const impAlive = sleeper.exitCode === null && sleeper.signalCode === null
sleeper.kill('SIGKILL')
const deadHolder = fixture({ a: {} })
write(path.join(deadHolder.run, 'lanewatch.lock'), String(spawnSync('true').pid))
const rDeadStop = await proc(['stop'], { DCTR_RUN: deadHolder.run, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: T, SHIM_DIR: deadHolder.dir })
clause('clause 2af2 — stop on a fresh lock whose pid has exited signals nothing, exits 0 and removes the lock',
  rDeadStop.code === 0 && !fs.existsSync(path.join(deadHolder.run, 'lanewatch.lock')), JSON.stringify(rDeadStop))
clause('clause 2af — stop sends no signal to a pid whose lock the watcher has not renewed within its polls: a process that is not the watcher lives on',
  impAlive, JSON.stringify([rImp, impAlive]))

// The hand-over: a watcher whose DCTR_WATCH_FROM names the live start that holds the lock takes it over.
const handed = fixture({ a: {} })
const starter = spawn('sleep', ['30'], { stdio: 'ignore' })
write(path.join(handed.run, 'lanewatch.lock'), String(starter.pid))
const heir = spawn(process.execPath, [WATCH], { env: { ...SCRUBBED, DCTR_RUN: handed.run, DCTR_WATCH_FROM: String(starter.pid), PATH: `${bin}:${process.env.PATH}`, TMPDIR: T, SHIM_DIR: handed.dir }, stdio: 'ignore' })
for (let t = 0; t < 100 && fs.readFileSync(path.join(handed.run, 'lanewatch.lock'), 'utf8').trim() !== String(heir.pid); t++) sleep(50)
const heirHolds = fs.readFileSync(path.join(handed.run, 'lanewatch.lock'), 'utf8').trim() === String(heir.pid) && heir.exitCode === null
heir.kill('SIGKILL'); starter.kill('SIGKILL')
clause('clause 2ag — the watcher start\'s pane runs takes the lock over from the live start whose pid DCTR_WATCH_FROM names, and runs',
  heirHolds, JSON.stringify([heirHolds, heir.exitCode]))

// Each poll renews the lock's time, which is how stop tells the watcher from a reused pid.
const renew = fixture({ a: {} })
write(path.join(renew.run, 'lanewatch.lock'), String(process.pid))
const oldLock = (Date.now() - 10 * POLL_MS) / 1000; fs.utimesSync(path.join(renew.run, 'lanewatch.lock'), oldLock, oldLock)
polls(renew, watcher(renew))
clause('clause 2ah — a poll renews the lock\'s modification time',
  Date.now() - fs.statSync(path.join(renew.run, 'lanewatch.lock')).mtimeMs < 5000, String(fs.statSync(path.join(renew.run, 'lanewatch.lock')).mtimeMs))

// ---------------------------------------------------------------- clause 3: the fixtures carry it

{
  const fx = fixture({ dead: { session: null }, gone: { shim: { fail: true } }, blank: { shim: { empty: true } }, up: {} })
  process.env.SHIM_DIR = fx.dir
  const get = (r) => spawnSync(path.join(bin, 'herdr'), ['pane', 'get', fx.pane[r]], { encoding: 'utf8', env: { ...process.env } })
  const d = get('dead'), g = get('gone'), b = get('blank'), u = get('up')
  const nt = spawnSync(path.join(bin, 'herdr'), ['notification', 'show', 't'], { encoding: 'utf8', env: { ...process.env } })
  let jsonNote = true; try { JSON.parse(nt.stdout) } catch { jsonNote = false }
  clause('clause 3a — without the watcher: the shim reports no agent session for a null one, exits 1 for a failing pane, prints {} for an empty one, names the session of a live one, and answers a notification with text that does not parse',
    d.status === 0 && !JSON.parse(d.stdout).result.pane.agent_session && g.status === 1 && b.stdout.trim() === '{}' &&
    JSON.parse(u.stdout).result.pane.agent_session.value === 'S-up' && !jsonNote, JSON.stringify([d.stdout, g.status, b.stdout, u.stdout, nt.stdout]))
}
{
  const size = (s) => fs.statSync(path.join(waves.wt.a, `${s}.out`)).size
  const rec = fs.readFileSync(waves.record.a, 'utf8')
  const dl = [...rec.matchAll(/seat (s\d) handle \S+(?: deadline (\S+))?/g)].map((m) => [m[1], m[2] ? Date.parse(m[2]) : null])
  clause('clause 3b — without the watcher: s1 and s2 are past their deadlines, s3 has none, s4\'s is ahead; s1\'s handle never grew while s2\'s did; the old transcript\'s ready line is past the ready limit and the young one within it',
    dl[0][1] < Date.now() && dl[1][1] < Date.now() && dl[2][1] === null && dl[3][1] > Date.now() && size('s1') === 1 && size('s2') === 9 &&
    Date.now() - Date.parse(JSON.parse(fs.readFileSync(path.join(held.dir, 'old.jsonl'), 'utf8')).timestamp) > READY_LIMIT_MS &&
    Date.now() - Date.parse(JSON.parse(fs.readFileSync(path.join(held.dir, 'young.jsonl'), 'utf8')).timestamp) < READY_LIMIT_MS, JSON.stringify(dl))
}
clause('clause 3c — without the watcher: 150,000 plus the 65,000 handoff cost is 215,000, above 205,000 and below 216,000; the stale bridge file is older than the expiry and the fresh one younger; the twin\'s record warns S-w',
  150000 + 65000 === 215000 && 205000 < 215000 && 216000 > 215000 && Date.now() - fs.statSync(bridgeFile('S-x')).mtimeMs > BRIDGE_EXPIRY_MS &&
  Date.now() - fs.statSync(bridgeFile('S-y')).mtimeMs < BRIDGE_EXPIRY_MS && /warned S-w/.test(fs.readFileSync(tier.record.w, 'utf8')), 'fixture arithmetic or files wrong')
clause('clause 3d — without the watcher: the reader fixture\'s lane.log names w1:p1, whose pane has an agent session, while w7:p7 has none',
  /create a w1:p1 /.test(fs.readFileSync(path.join(viaReader.run, 'lane.log'), 'utf8')) &&
  JSON.parse(fs.readFileSync(path.join(viaReader.dir, 'shim.json'), 'utf8')).panes['w1:p1'].session === 'S-a' &&
  JSON.parse(fs.readFileSync(path.join(viaReader.dir, 'shim.json'), 'utf8')).panes['w7:p7'].session === null, 'reader fixture wrong')

process.exit(bad ? 1 : 0)
