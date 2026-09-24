// Behavioral tamper test for the auto-cycle hook (E8-D7, E8-D16, E8-D17, E8-D18, E8-D26; seams T1, T2, T3, T5, T6,
// T7), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-cycle.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins the pure decisions in dctr-lib.mjs (autoCycleActive, cycleDecision, cycleProgress, notifyDecision
// and the pause reasons, verbatim from the D2 table), the pause model enumerated over short record sequences
// (clause 1r), and the state helpers in dctr-state.mjs (appendPaused, alertPaused, pauseMessageOnce, claimHeld,
// treeHash) over real files and git repos. Clause 2 drives hooks/dctr-cycle.mjs end to end over fixture projects
// with a `herdr` PATH shim that logs every call, and a stub in place of the typer that records its launch: one
// fixture per E8-D7 precondition with that precondition alone false, one per pause reason, the Notification and
// StopFailure events, the alerts and the contained case. The shim never reaches a herdr server. Clause 3 proves
// the fixtures carry what those clauses rest on without running the hook.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-cycle-'))
process.env.TMPDIR = tmp
const lib = await import('./dctr-lib.mjs')
const { autoCycleActive, pausingStates, cycleDecision, cycleProgress, notifyDecision, pauseReason, pauseAction, pauseMessage, pausedToken, PAUSES, stopFileRepo, repoOf, LAUNCH_MESSAGE, endsReady, nonEmpty, seatLive, treeExcludes, pauseResolved, standingPauses, pauseStands, unresolvedPausesAfter, claimKey, typerStep, pausedAfterWarned, autocycleToken, pauseActionAt } = lib
const { parseRecord } = await import('./dctr-record.mjs')
const state = await import('./dctr-state.mjs')
const { appendPaused, claimHeld, claimFile, treeHash, stateDir, seatsDir, stopFactsFile, autoCycleDir } = state

const rec = (...ls) => parseRecord(ls.join('\n')).entries
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }

// ---------------------------------------------------------------- clause 1: the pure decisions

clause('clause 1a — autoCycleActive: Open or Blocked, the last on/off line on, and no stop file (B1, T1)',
  autoCycleActive(rec('- State: Open', '- auto-cycle: on cap 10 tier 60%'), false) === true &&
  autoCycleActive(rec('- State: Blocked. Q1', '- auto-cycle: on cap 10 tier 60%', '- auto-cycle: warned s 60%', '- auto-cycle paused: x'), false) === true &&
  autoCycleActive(rec('- State: Open', '- auto-cycle: on cap 10 tier 60%'), true) === false &&
  autoCycleActive(rec('- State: Exited.', '- auto-cycle: on cap 10 tier 60%'), false) === false &&
  autoCycleActive(rec('- State: Open', '- auto-cycle: on cap 10 tier 60%', '- auto-cycle: off'), false) === false &&
  autoCycleActive(rec('- State: Open'), false) === false, 'autoCycleActive mis-decided')
const exists = (set) => (p) => set.includes(p)
clause('clause 1b — stopFileRepo finds the stop file in either repo (Q1), and repoOf finds the record\'s repo by its .git',
  stopFileRepo(['/a', '/b'], exists(['/b/.doctrine/auto-cycle.stop'])) === '/b' && stopFileRepo(['/a', '/b'], exists([])) === null &&
  repoOf('/w/track/.doctrine/records/r.md', exists(['/w/track/.git'])) === '/w/track', 'wrong repo')

const TABLE = [
  ['R1', '/w/p', 'stopped by .doctrine/auto-cycle.stop in /w/p', 'delete it, then /clear and type resume'],
  ['R2', 'State: Blocked. Q1 open', 'phase Blocked: State: Blocked. Q1 open', 'answer in the pane'],
  ['R3', 'round', 'round alarm fired, ruling needed', 'rule in the pane'],
  ['R3', 'time', 'time alarm fired, ruling needed', 'rule in the pane'],
  ['R4', { id: 'Q7', text: 'which way?' }, 'open question Q7: which way?', 'answer in the pane'],
  ['R5', 10, 'cycle cap 10 reached', 'add an on line with a higher cap, then /clear and type resume'],
  ['R6', null, 'no progress in 2 cycles', "read the record's last work, then /clear and type resume"],
  ['R7', null, 'waiting for your permission approval', 'approve or deny in the pane'],
  ['R8', null, 'session idle, waiting for you', 'reply in the pane'],
  ['R9', 'overloaded', 'Claude API error: overloaded', 'retry in the pane'],
  ['R10', null, 'could not cycle: handoff not written', 'run doctrine-handoff, then /clear and type resume'],
  ['R11', null, 'could not cycle: another Stop hook kept the session running', '/clear and type resume by hand'],
  ['R12', null, 'could not cycle: this pane now runs a different Claude session', 'check the pane'],
  ['R13', null, 'could not cycle: contained session', '/clear and type resume by hand'],
  ['R14', null, 'cleared, but the new session did not start doctrine', 'type resume'],
  ['R15', null, 'resume typed twice, no reply from the new session', 'check the pane'],
  ['R16', null, 'auto-cycle stopped: you typed in this pane', 'nothing, or /clear and type resume'],
  ['R17', 'boom', 'could not type into the pane: boom', '/clear and type resume by hand'],
]
const tableBad = TABLE.filter(([c, arg, reason, action]) => pauseReason(c, arg) !== reason || pauseAction(reason) !== action)
clause('clause 1c — every pause reason R1 to R17 reads verbatim as the D2 table has it, and each reason maps back to its action',
  tableBad.length === 0 && Object.keys(PAUSES).length === 17, JSON.stringify(tableBad.map(([c, arg]) => [c, pauseReason(c, arg)])))
clause('clause 1d — no reason or message says stall, typer, claim, blocked or dctr; from its text alone, each of the skills\' own pauses asks for an answer in the pane (its place decides more, clause 1t)',
  TABLE.every(([, , r, a]) => !/\b(stall|typer|claim|blocked|dctr)\b/.test(`${r}. ${a}`)) && pauseAction('question: which way?') === 'answer in the pane' &&
  pauseAction('first action ambiguous: two phases') === 'answer in the pane' &&
  pauseMessage('session idle, waiting for you') === 'doctrine auto-cycle paused: session idle, waiting for you. reply in the pane' &&
  pausedToken('x'.repeat(60)) === `auto-cycle paused·${'x'.repeat(40)}`, 'a string leaked a banned word or the forms are wrong')

const ps = (...ls) => pausingStates(rec(...ls))
const alarm = '- alarm: round fired 2026-09-24T01:00:00Z count 4', ruling = '- ruling: R9 2026-09-24T02:00:00Z go on'
const qOpen = '- question: Q1 opened 2026-09-24T01:00:00Z which?'
clause('clause 1b2 — pausingStates: an alarm with a later ruling is closed, one without is open; a question is answered only by an answer line with its id after it',
  ps(alarm).alarm === 'round' && ps(alarm, ruling).alarm === null && ps(ruling, alarm).alarm === 'round' &&
  ps(qOpen).question?.id === 'Q1' && ps(qOpen, '- question: Q1 answered 2026-09-24T02:00:00Z this').question === null &&
  ps(qOpen, '- question: Q2 answered 2026-09-24T02:00:00Z that').question?.id === 'Q1' &&
  ps('- State: Blocked. waits', '- State: Open').blocked === null && ps('- State: Open', '- State: Blocked. waits').blocked === 'State: Blocked. waits',
  JSON.stringify([ps(alarm, ruling), ps(qOpen, '- question: Q2 answered 2026-09-24T02:00:00Z that')]))

// One fact set with every precondition true; each fixture below makes exactly one false.
const ALL = {
  sessionId: 's1', stopRepo: null, blocked: null, alarm: null, question: null, warned: true, pausedAfterWarned: false, backgroundTasks: false,
  liveWork: null, sessionCrons: false, ready: true, handoffLanded: true, contained: false, stopHookActive: false, paneSession: 's1',
  progress: { n: 2, cap: 10, pause: null }, claimTaken: false,
}
const cd = (o) => cycleDecision({ ...ALL, ...o })
const DECIDE = [
  ['stop file', { stopRepo: '/w/p' }, 'pause', 'R1'], ['Blocked', { blocked: 'State: Blocked' }, 'pause', 'R2'],
  ['alarm with no ruling', { alarm: 'round' }, 'pause', 'R3'], ['open question', { question: { id: 'Q1', text: 't' } }, 'pause', 'R4'],
  ['no warned line', { warned: false }, 'none'], ['paused after warned', { pausedAfterWarned: true }, 'none'],
  ['background task', { backgroundTasks: true }, 'wait'], ['live seat', { liveWork: 'seat x is live' }, 'wait'],
  ['session cron', { sessionCrons: true }, 'wait'], ['not ready', { ready: false }, 'wait'],
  ['handoff not landed', { handoffLanded: false }, 'pause', 'R10'], ['contained', { contained: true }, 'pause', 'R13'],
  ['stop_hook_active', { stopHookActive: true }, 'pause', 'R11'], ['another session', { paneSession: 's2' }, 'pause', 'R12'],
  ['lookup failed', { paneSession: { error: 'e' } }, 'pause', 'R17'], ['cap', { progress: { n: 11, cap: 10, pause: 'cap 10' } }, 'pause', 'R5'],
  ['no progress', { progress: { n: 3, cap: 10, pause: 'no progress' } }, 'pause', 'R6'], ['claim taken', { claimTaken: true }, 'none'],
]
const decideBad = DECIDE.filter(([, o, act, code]) => cd(o).act !== act || (code && cd(o).code !== code))
clause('clause 1e — cycleDecision: all preconditions true launches, and each one alone false does not, with its act and reason (E8-D7, T2)',
  cd({}).act === 'launch' && cd({}).n === 2 && decideBad.length === 0, JSON.stringify(decideBad.map(([n, o]) => [n, cd(o)])))
let called = 0
const counted = () => { called += 1; return 's1' }
cd({ contained: true, paneSession: counted }); cd({ ready: false, paneSession: counted }); cd({ handoffLanded: false, paneSession: counted })
const beforeLaunch = called
cd({ paneSession: counted })
clause('clause 1f — cycleDecision reads the pane session only when a step reaches it, never for a contained, unready or unlanded case',
  beforeLaunch === 0 && called === 1, `called ${beforeLaunch} then ${called}`)
clause('clause 1g — cycleDecision: the pausing states win over everything later, in their order (B2 step 1)',
  cd({ stopRepo: '/p', blocked: 'b', warned: false }).code === 'R1' && cd({ blocked: 'b', alarm: 'round' }).code === 'R2' &&
  cd({ alarm: 'time', question: { id: 'Q', text: 't' } }).reason === 'time alarm fired, ruling needed' &&
  cd({ question: { id: 'Q', text: 't' }, warned: false }).code === 'R4', 'order wrong')

// T3, over E8-D17's record fixtures.
const on = '- auto-cycle: on cap 10 tier 60%'
const cyc = (n, h) => `- auto-cycle: cycle ${n} tree ${h}`
const backupWave = '- wave: 2026-09-24T01:00:00Z seat r1 handle h1 via doctrine-backup'
const round = '- round: 2 closed 2026-09-24T01:00:00Z at abc blockers 0 alarm 0'
const P = [
  ['cycle 10 with cap 10', rec(on, cyc(10, 'aa')), 'aa', 'cap 10', 11],
  ['cycle 9 with cap 10', rec(on, cyc(9, 'aa')), 'bb', null, 10],
  ['bookkeeping only: backup waves', rec(on, cyc(1, 'aa'), backupWave, cyc(2, 'aa'), backupWave), 'aa', 'no progress', 3],
  ['a leftover dirty file, unchanged', rec(on, cyc(1, 'dd'), cyc(2, 'dd')), 'dd', 'no progress', 3],
  ['a new uncommitted edit', rec(on, cyc(1, 'dd'), cyc(2, 'dd')), 'ee', null, 3],
  ['only a new round line', rec(on, cyc(1, 'dd'), cyc(2, 'dd'), round), 'dd', null, 3],
  ['progress only in the earlier interval', rec(on, cyc(1, 'aa'), round, cyc(2, 'aa')), 'aa', null, 3],
  ['a counter across session ids', rec(on, '- auto-cycle: warned s1 60%', cyc(1, 'a1'), '- auto-cycle: warned s2 60%', cyc(2, 'a2'), '- auto-cycle: warned s3 60%'), 'a3', null, 3],
  ['a raised cap on a new on line', rec(on, cyc(10, 'aa'), '- auto-cycle: on cap 20 tier 60%'), 'bb', null, 11],
  ['a changed hash between the two cycles', rec(on, cyc(1, 'aa'), cyc(2, 'bb')), 'bb', null, 3],
]
const progBad = P.filter(([, es, h, pause, n]) => cycleProgress(es, h).pause !== pause || cycleProgress(es, h).n !== n)
clause('clause 1h — cycleProgress: only the cap, the bookkeeping-only and the leftover-dirty fixtures pause, and the count continues across session ids (E8-D17, T3)',
  progBad.length === 0, JSON.stringify(progBad.map(([name, es, h]) => [name, cycleProgress(es, h)])))

clause('clause 1h4 — endsReady takes the ready line wrapped in inline code, bold or italics or behind a list marker, as the whole last line, and never inside a sentence (K4-RL)',
  endsReady('Done.\n\n`auto-cycle: ready`') && endsReady('x\n**auto-cycle: ready**\n') && endsReady('x\n- auto-cycle: ready') && endsReady('x\n  *auto-cycle: ready*  ') &&
  !endsReady('The next line says `auto-cycle: ready`') && !endsReady('x\n`auto-cycle: ready` done') && !endsReady('x\n`auto-cycle: ready*'), 'wrong')
clause('clause 1h2 — endsReady reads the message\'s last line only; nonEmpty counts a listed task or cron and never an empty list or object',
  endsReady('done\nauto-cycle: ready\n') && !endsReady('auto-cycle: ready\nthen more') && !endsReady(undefined) &&
  nonEmpty([{ id: 1 }]) && nonEmpty({ a: 1 }) && !nonEmpty([]) && !nonEmpty({}) && !nonEmpty(null) && !nonEmpty(undefined), 'wrong')
clause('clause 1h3 — seatLive: a gate is live until its result file, a codex seat until its job is terminal (unreadable is not), any other seat is live',
  seatLive({ role: 'gate' }, false, null) && !seatLive({ role: 'gate' }, true, null) && seatLive({ codexJob: '/j' }, false, 'running') &&
  seatLive({ codexJob: '/j' }, false, null) && !seatLive({ codexJob: '/j' }, false, 'completed') && seatLive({ agent: 'x' }, false, null), 'wrong')

const idleOk = { claimHeld: false, liveWork: null, lastStop: { backgroundEmpty: true, cronsEmpty: true, ready: false } }
clause('clause 1i — notifyDecision: permission_prompt is R7, StopFailure R9 with its error, an unexplained idle_prompt R8 (E8-D18, T5)',
  notifyDecision('permission_prompt', {}) === 'waiting for your permission approval' && notifyDecision('StopFailure', { error: 'rate_limit' }) === 'Claude API error: rate_limit' &&
  notifyDecision('idle_prompt', idleOk) === 'session idle, waiting for you' && notifyDecision('auth_success', idleOk) === null, 'wrong')
clause('clause 1j5 — notifyDecision: idle_prompt is nothing when the last Stop had session crons, or its facts do not say (E8-D7, E8-R22, RB6-3)',
  notifyDecision('idle_prompt', { ...idleOk, lastStop: { backgroundEmpty: true, ready: false } }) === null &&
  notifyDecision('idle_prompt', { ...idleOk, lastStop: { backgroundEmpty: true, cronsEmpty: false, ready: false } }) === null &&
  notifyDecision('idle_prompt', idleOk) === 'session idle, waiting for you', 'wrong')
clause('clause 1j — notifyDecision: idle_prompt is nothing while a claim is held, work is live, the last Stop had background tasks, ended ready, or is unknown',
  [{ claimHeld: true }, { liveWork: 'gate x is live' }, { lastStop: { backgroundEmpty: false, cronsEmpty: true, ready: false } }, { lastStop: { backgroundEmpty: true, cronsEmpty: true, ready: true } }, { lastStop: null }]
    .every((o) => notifyDecision('idle_prompt', { ...idleOk, ...o }) === null), 'idle paused when explained')

// T6: the state helpers.
const recFile = path.join(tmp, 't6', 'r.md')
write(recFile, '- State: Open\n- auto-cycle: on cap 10 tier 60%\n- auto-cycle: warned s 60%')
const w1 = appendPaused(recFile, 'Claude API error: one'), w2 = appendPaused(recFile, 'Claude API error: two'), w3 = appendPaused(recFile, 'x two')
clause('clause 1k — appendPaused writes one line on a line of its own, none while a standing pause names the same pause, and one naming a different pause (E8-D18, E8-R27)',
  w1.written && !w2.written && w3.written && fs.readFileSync(recFile, 'utf8') === '- State: Open\n- auto-cycle: on cap 10 tier 60%\n- auto-cycle: warned s 60%\n- auto-cycle paused: Claude API error: one\n- auto-cycle paused: x two\n',
  fs.readFileSync(recFile, 'utf8'))
const deadPid = spawnSync('node', ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout.trim()
write(path.join(tmp, 'c-live'), JSON.stringify({ pid: process.pid })); write(path.join(tmp, 'c-dead'), JSON.stringify({ pid: Number(deadPid) })); write(path.join(tmp, 'c-empty'), '{}')
clause('clause 1l — claimHeld: the claim exists and its pid is alive; a dead pid, a claim with no pid and no claim are not held (S3)',
  claimHeld(path.join(tmp, 'c-live')) && !claimHeld(path.join(tmp, 'c-dead')) && !claimHeld(path.join(tmp, 'c-empty')) && !claimHeld(path.join(tmp, 'nope')), 'wrong')

const genv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (repo, ...args) => execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: genv, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
function repo(dir, ignore = 'SESSION_MEMORY.md\ndocs/handoffs/\n') {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q')
  write(path.join(dir, 'src.txt'), 'one\n'); write(path.join(dir, '.gitignore'), ignore)
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'init')
  return dir
}
const EX = (repo) => treeExcludes(path.join(repo, '.doctrine/records/r.md'), repo)
clause('clause 1l2 — treeExcludes: the memory file, the handoffs and the auto-cycle files in every repo; the record and its own run-state sibling only in the repo holding it (B7, SP4)',
  JSON.stringify(treeExcludes('/w/p/.doctrine/records/r.md', '/w/p')) === JSON.stringify(['SESSION_MEMORY.md', 'docs/handoffs', ':(glob).doctrine/auto-cycle*', '.doctrine/records/r.md', ':(glob).doctrine/records/r-run-state*']) &&
  JSON.stringify(treeExcludes('/w/track/.doctrine/records/r.md', '/w/p')) === JSON.stringify(['SESSION_MEMORY.md', 'docs/handoffs', ':(glob).doctrine/auto-cycle*']),
  JSON.stringify(treeExcludes('/w/p/.doctrine/records/r.md', '/w/p')))
const h1 = path.join(tmp, 'hash1')
repo(h1, '')
write(path.join(h1, 'SESSION_MEMORY.md'), 'm1'); write(path.join(h1, 'docs/handoffs/a.md'), 'h1'); write(path.join(h1, '.doctrine/records/r.md'), 'r1')
git(h1, 'add', '-A'); git(h1, 'commit', '-q', '-m', 'docs(session): one')
write(path.join(h1, 'leftover.txt'), 'dirty')
const indexView = () => `${git(h1, 'status', '--porcelain')}|${git(h1, 'diff', '--cached', '--name-only')}|${git(h1, 'ls-files', '--stage')}`
const viewBefore = indexView()
const hA = treeHash([h1], EX)
const viewAfter = indexView()
write(path.join(h1, 'SESSION_MEMORY.md'), 'm2'); write(path.join(h1, 'docs/handoffs/b.md'), 'h2'); write(path.join(h1, '.doctrine/records/r.md'), 'r2')
write(path.join(h1, '.doctrine/auto-cycle.stop'), ''); write(path.join(h1, '.doctrine/records/r-run-state.md'), 'c')
git(h1, 'add', '-A'); git(h1, 'commit', '-q', '-m', 'docs(session): two'); fs.rmSync(path.join(h1, '.doctrine/auto-cycle.stop'))
const hB = treeHash([h1], EX)
write(path.join(h1, 'src.txt'), 'two\n'); fs.utimesSync(path.join(h1, 'src.txt'), 1700000000, 1700000000)
const hC = treeHash([h1], EX)
// RB4: an edit of the same size with the same mtime as the content staged in the real index, which that index's stat
// cache cannot see (ctime left out of the comparison, so the case does not hang on which second the write lands in).
git(h1, 'config', 'core.trustctime', 'false'); git(h1, 'add', 'src.txt')
const srcStat = fs.statSync(path.join(h1, 'src.txt'))
write(path.join(h1, 'src.txt'), 'six\n'); fs.utimesSync(path.join(h1, 'src.txt'), 1700000000, 1700000000)
const hD = treeHash([h1], EX)
write(path.join(h1, 'notes/run-state.md'), 'real work')
const hE = treeHash([h1], EX)
clause('clause 1m — treeHash: a docs(session) commit of the memory file, a handoff, the record, its run-state file and the stop file changes nothing, a leftover dirty file stays the same, a new edit changes it (B7)',
  /^[0-9a-f]{40}$/.test(hA) && hA === hB && hB !== hC, `${hA} ${hB} ${hC}`)
clause('clause 1m2 — treeHash: a same-size edit with the same mtime changes the hash, and so does a file named run-state that is not the record\'s (RB4, SP4)',
  hD !== hC && hE !== hD && fs.statSync(path.join(h1, 'src.txt')).mtimeMs === srcStat.mtimeMs && fs.statSync(path.join(h1, 'src.txt')).size === srcStat.size, `${hC} ${hD} ${hE}`)
clause('clause 1n — treeHash leaves the real index alone: status, staged names and the index\'s entries are the same after it',
  viewBefore === viewAfter && viewBefore.startsWith('?? leftover.txt|'), `${viewBefore} || ${viewAfter}`)
const h2 = repo(path.join(tmp, 'hash2'))
const hTwo = treeHash([h1, h2], EX), hSecond = treeHash([h2], () => [])
const notObject = (r, id) => { try { git(r, 'cat-file', '-e', id); return false } catch { return true } }
clause('clause 1o — treeHash over two repos is the sha1 of both tree ids, not a git object in either (F7)',
  /^[0-9a-f]{40}$/.test(hTwo) && hTwo !== hC && hTwo !== hSecond && notObject(h1, hTwo) && notObject(h2, hTwo) && !notObject(h1, hC),
  `${hTwo} ${hC} ${hSecond}`)

// ---------------------------------------------------------------- clause 2: the hook end to end (T7)

const hook = path.join(import.meta.dirname, 'dctr-cycle.mjs')
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(args) + '\\n')
if (args[0] === 'pane' && args[1] === 'get') {
  if (process.env.SHIM_FAIL) { process.stderr.write('{"error":{"code":"server_error"}}\\n'); process.exit(1) }
  console.log(JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: 'idle', focused: true, ...(process.env.SHIM_NOSESSION ? {} : { agent_session: { value: process.env.SHIM_SESSION } }) } } }))
}
process.exit(0)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const stub = path.join(tmp, 'typer-stub.mjs')
// The stub takes the claim as the typer would, then records its launch.
fs.writeFileSync(stub, `import fs from 'node:fs'
const { claimFile, reserveMarker } = await import(${JSON.stringify(path.join(import.meta.dirname, 'dctr-state.mjs'))})
const a = JSON.parse(process.argv[2])
try { reserveMarker(claimFile(a.session, a.keyLine)) } catch { process.exit(0) }
fs.appendFileSync(process.env.STUB_LOG, process.argv[2] + '\\n')
`)

const baseEnv = { ...genv, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, DCTR_TYPER_SCRIPT: stub, HERDR_PANE_ID: 'w9:p1' }
for (const k of ['HERDR_ENV', 'HERDR_WORKSPACE_ID', 'DCTR_VIEW_REQUEST_DIR', 'CLAUDE_PROJECT_DIR']) delete baseEnv[k]
const T0 = Date.parse('2026-09-24T01:00:00Z')

/**
 * One fixture project: a git repo whose memory file names a handoff naming the record; the record carries on, the
 * session's warned line and `lines`; the gauge latch says when it warned; the handoff was written after that.
 * `tracked` commits the memory file and the handoff (a backup commit) instead of ignoring them; `sibling` puts the
 * record in a second repo beside the project.
 */
function fixture(name, { lines = [], state = 'Open', warned = true, tracked = false, commit = true, commitAt = T0 + 6000, sibling = false, handoffAt = T0 + 5000, latch = true } = {}) {
  const dir = path.join(tmp, 'fx', name)
  const proj = repo(path.join(dir, 'proj'), tracked ? '' : 'SESSION_MEMORY.md\ndocs/handoffs/\n')
  const recRoot = sibling ? repo(path.join(dir, 'track'), '') : proj
  const ref = sibling ? 'track/.doctrine/records/r.md' : '.doctrine/records/r.md'
  const record = path.join(recRoot, '.doctrine/records/r.md')
  const session = `s-${name}`
  write(record, ['# e8-fixture record', 'Wrapper: doctrine-code', '', '- State: Open', '- auto-cycle: on cap 10 tier 60%',
    ...(warned ? [`- auto-cycle: warned ${session} 60%`] : []), ...lines, ...(state === 'Open' ? [] : [`- State: ${state}`]), ''].join('\n'))
  const handoff = path.join(proj, 'docs/handoffs/h.md')
  write(path.join(proj, 'SESSION_MEMORY.md'), '# Session memory\n\n## Next Session Kickoff\nhandoff: docs/handoffs/h.md | state: open\n')
  write(handoff, `supersedes: none\nphase: \`e8-fixture\`, state: Open\nrecord: \`${ref}\`\nwrapper: doctrine-code\n\n# Handoff\n`)
  fs.utimesSync(handoff, new Date(handoffAt), new Date(handoffAt))
  if (tracked && commit) { git(proj, 'add', '-A'); execFileSync('git', ['-C', proj, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'docs(session): backup'], { env: { ...genv, GIT_COMMITTER_DATE: new Date(commitAt).toISOString() } }) }
  if (latch) write(path.join(stateDir(session), 'gauge.json'), JSON.stringify({ session_id: session, warned: true, warnedAt: T0 }))
  const transcript = path.join(dir, 't.jsonl'); write(transcript, '{"type":"assistant"}\n')
  return { name, dir, proj, recRoot, record, session, transcript, shimLog: path.join(dir, 'shim.log'), stubLog: path.join(dir, 'stub.log') }
}
const payload = (f, more = {}) => ({
  hook_event_name: 'Stop', session_id: f.session, transcript_path: f.transcript, cwd: f.proj, stop_hook_active: false,
  last_assistant_message: 'Handoff written.\nauto-cycle: ready', background_tasks: [], session_crons: [], ...more,
})
function run(f, more = {}, extraEnv = {}) {
  const r = spawnSync('node', [hook], { input: JSON.stringify(payload(f, more)), env: { ...baseEnv, SHIM_LOG: f.shimLog, STUB_LOG: f.stubLog, SHIM_SESSION: f.session, ...extraEnv }, encoding: 'utf8' })
  let j = null
  try { j = r.stdout ? JSON.parse(r.stdout) : null } catch { /* the clause reports it */ }
  return { code: r.status, out: r.stdout, err: r.stderr, msg: j?.systemMessage || '' }
}
const calls = (f) => (fs.existsSync(f.shimLog) ? fs.readFileSync(f.shimLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const paused = (f) => fs.readFileSync(f.record, 'utf8').split('\n').filter((l) => l.startsWith('- auto-cycle paused: '))
const launched = (r) => r.msg.includes(LAUNCH_MESSAGE)
const reads = (f) => calls(f).filter((c) => c[1] === 'get').length
const metas = (f) => calls(f).filter((c) => c[1] === 'report-metadata')
const toasts = (f) => calls(f).filter((c) => c[0] === 'notification')
const show = (f, r) => `code ${r.code} msg ${JSON.stringify(r.msg)} err ${r.err.trim()} paused ${JSON.stringify(paused(f))} calls ${JSON.stringify(calls(f))}`

// The all-true fixtures launch.
const good = fixture('all-true'), goodBefore = Date.now(), goodR = run(good), goodAfter = Date.now()
const codeReady = fixture('ready-in-code'), codeReadyR = run(codeReady, { last_assistant_message: 'Handoff written.\n\n`auto-cycle: ready`' })
const goodT = fixture('all-true-tracked', { tracked: true }), goodTR = run(goodT)
const goodS = fixture('all-true-sibling', { sibling: true }), goodSR = run(goodS)
clause('clause 2a — all preconditions true: the typer is launched with its facts, the launch message printed, no paused line (E8-D7)',
  launched(goodR) && paused(good).length === 0 && reads(good) === 1 && goodR.code === 0, show(good, goodR))
clause('clause 2a3 — all true, the message ending in the ready line wrapped in inline code: the typer is launched (K4-RL)',
  launched(codeReadyR) && paused(codeReady).length === 0, show(codeReady, codeReadyR))
clause('clause 2b — all true with the handoff and memory file tracked and committed, and with the record in a second repo: launched (E8-D7)',
  launched(goodTR) && launched(goodSR), `${show(goodT, goodTR)} | ${show(goodS, goodSR)}`)

// One fixture per E8-D7 precondition, that precondition alone false.
const seatUp = (f) => write(path.join(seatsDir(f.session), 'dctr-explore-1.json'), JSON.stringify({ agent: 'dctr-explore-1', paneId: 'w9:p2' }))
const gateLive = (f) => write(path.join(seatsDir(f.session), 'dctr-gate-1.json'), JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w9:p3', file: path.join(f.dir, 'gate.out') }))
const codexLive = (f) => { write(path.join(f.dir, 'job.json'), JSON.stringify({ status: 'running' })); write(path.join(seatsDir(f.session), 'dctr-codex-1.json'), JSON.stringify({ agent: 'dctr-codex-1', paneId: 'w9:p4', codexJob: path.join(f.dir, 'job.json') })) }
const NEG = [
  ['off', { lines: ['- auto-cycle: off'] }, {}, {}, 'stand', null],
  ['stop file', {}, {}, {}, 'pause', 'stopped by .doctrine/auto-cycle.stop in ', (f) => write(path.join(f.proj, '.doctrine/auto-cycle.stop'), '')],
  ['stop file in the record\'s repo only (Q1)', { sibling: true }, {}, {}, 'pause', 'stopped by .doctrine/auto-cycle.stop in ', (f) => write(path.join(f.recRoot, '.doctrine/auto-cycle.stop'), '')],
  ['Blocked', { state: 'Blocked. Q2 waits on Scott' }, {}, {}, 'pause', 'phase Blocked: State: Blocked. Q2 waits on Scott'],
  ['round alarm with no ruling', { lines: ['- alarm: round fired 2026-09-24T01:00:00Z count 4'] }, {}, {}, 'pause', 'round alarm fired, ruling needed'],
  ['time alarm with no ruling', { lines: ['- alarm: time fired 2026-09-24T01:00:00Z count 1'] }, {}, {}, 'pause', 'time alarm fired, ruling needed'],
  ['question with no answer', { lines: ['- question: Q3 opened 2026-09-24T01:00:00Z which cap?'] }, {}, {}, 'pause', 'open question Q3: which cap?'],
  ['no warned line', { warned: false }, {}, {}, 'none', null],
  ['paused after warned', { lines: ['- auto-cycle paused: question: which way?'] }, {}, {}, 'none', null],
  ["live seat", {}, {}, {}, "wait", null, seatUp],
  ['gate without its result', {}, {}, {}, 'wait', null, gateLive],
  ['codex job running', {}, {}, {}, 'wait', null, codexLive],
  ['background task', {}, { background_tasks: [{ id: 'b1' }] }, {}, 'wait', null],
  ['session cron (E8-R22)', {}, { session_crons: [{ id: 'c1' }] }, {}, 'wait', null],
  ['not ready', {}, { last_assistant_message: 'Still working.' }, {}, 'wait', null],
  ['handoff before the warning', { handoffAt: T0 - 60000 }, {}, {}, 'pause', 'could not cycle: handoff not written'],
  ['tracked handoff with no backup commit', { tracked: true, commit: false }, {}, {}, 'pause', 'could not cycle: handoff not written'],
  ['tracked handoff committed only before the warning', { tracked: true, commitAt: T0 - 60000 }, {}, {}, 'pause', 'could not cycle: handoff not written'],
  ['contained', {}, {}, { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'bridge') }, 'pause', 'could not cycle: contained session'],
  ['stop_hook_active', {}, { stop_hook_active: true }, {}, 'pause', 'could not cycle: another Stop hook kept the session running'],
  ['another session in the pane', {}, {}, { SHIM_SESSION: 'someone-else' }, 'pause', 'could not cycle: this pane now runs a different Claude session'],
  ['transcript unreadable at launch', {}, { transcript_path: '/nonexistent/doctrine/t.jsonl' }, {}, 'pause', 'could not type into the pane: the transcript could not be read'],
  ['herdr reports no Claude session (ST2)', {}, {}, { SHIM_NOSESSION: '1' }, 'pause', 'could not type into the pane: herdr could not read the pane'],
  ['R5 after the warned line', { lines: ['- auto-cycle paused: cycle cap 10 reached', '- auto-cycle: on cap 20 tier 60%'] }, {}, {}, 'none', null],
  ['R10 after the warned line', { lines: ['- auto-cycle paused: could not cycle: handoff not written'] }, {}, {}, 'none', null],
  ['R2 still Blocked', { lines: ['- State: Blocked. waits', '- auto-cycle paused: phase Blocked: State: Blocked. waits'] }, {}, {}, 'none', null],
  ['R3 with no ruling yet', { lines: ['- alarm: round fired 2026-09-24T01:00:00Z count 4', '- auto-cycle paused: round alarm fired, ruling needed'] }, {}, {}, 'none', null],
  ['R4 unanswered', { lines: ['- question: Q5 opened 2026-09-24T01:00:00Z which?', '- auto-cycle paused: open question Q5: which?'] }, {}, {}, 'none', null],
  ['an unreadable seat marker', {}, {}, {}, 'wait', null, (f) => write(path.join(seatsDir(f.session), 'dctr-x-1.json'), '{')],
  ['no gauge latch, so no warning time', { latch: false }, {}, {}, 'pause', 'could not cycle: handoff not written'],
  ["another session's warned line only", { warned: false, lines: ['- auto-cycle: warned s-other 60%'] }, {}, {}, 'none', null],
  ['contained, an ordinary turn', { warned: false }, {}, { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'bridge') }, 'none', null],
]
const negs = NEG.map(([name, opts, more, env, want, reason, pre]) => {
  const f = fixture(`neg-${name.replace(/[^a-z0-9]+/gi, '-')}`, opts)
  pre?.(f)
  return { name, f, r: run(f, more, env), want, reason }
})
const negBad = negs.filter(({ name, f, r, want, reason }) => {
  if (launched(r) || r.code !== 0) return true
  const p = paused(f)
  if (want === 'pause') return p.length !== 1 || !p[0].startsWith(`- auto-cycle paused: ${reason}`)
  return p.length !== (NEG.find(([n]) => n === name)[1].lines || []).filter((l) => l.startsWith('- auto-cycle paused')).length || (!reason && name.startsWith('R') && r.msg.includes(LAUNCH_MESSAGE))
})
clause('clause 2c — each E8-D7 precondition alone false launches no typer; the pausing ones write exactly their paused line, the rest none',
  negBad.length === 0, negBad.map(({ name, f, r }) => `${name}: ${show(f, r)}`).join(' || '))
const pb = fixture('paused-before-warned', { warned: false, lines: ['- auto-cycle paused: question: old', '- auto-cycle: warned s-paused-before-warned 60%'] })
const pbR = run(pb)
clause('clause 2c2 — a paused line before this session\'s warned line does not hold the cycle back: launched',
  launched(pbR) && paused(pb).length === 1, show(pb, pbR))
const contOrd = negs.find((n) => n.name === 'contained, an ordinary turn')
clause('clause 2c3 — contained, an ordinary turn with auto-cycle active: no autocycle token, no herdr call at all',
  calls(contOrd.f).length === 0 && contOrd.r.out === '', show(contOrd.f, contOrd.r))
const readsBad = negs.filter(({ name, f }) => reads(f) !== (['another session in the pane', 'herdr reports no Claude session (ST2)', 'transcript unreadable at launch'].includes(name) ? 1 : 0))
clause('clause 2d — no negative fixture reads the pane from herdr except those that get past the pane session check (E8-D7)',
  readsBad.length === 0, readsBad.map(({ name, f }) => `${name}: ${reads(f)}`).join('; '))
const cont = negs.find((n) => n.name === 'contained')
clause('clause 2e — contained: the paused line is written, the pane message printed, and herdr called zero times (E8-D26)',
  calls(cont.f).length === 0 && cont.r.msg === 'doctrine auto-cycle paused: could not cycle: contained session. /clear and type resume by hand', show(cont.f, cont.r))
const sd = negs.find((n) => n.name === 'off')
clause('clause 2f — auto-cycle off: it stands down with a reason on stderr, prints nothing and calls no herdr',
  sd.r.out === '' && /auto-cycle skipped — auto-cycle is off/.test(sd.r.err) && calls(sd.f).length === 0, show(sd.f, sd.r))

// E8-D16: the pauses leave the state line alone.
const pausedFx = negs.filter((n) => n.want === 'pause')
clause('clause 2g — every paused line leaves the record\'s last state line as it was, and is not a state line (E8-D16)',
  pausedFx.every(({ f, name }) => parseRecord(fs.readFileSync(f.record, 'utf8')).state.raw === (name === 'Blocked' ? '- State: Blocked. Q2 waits on Scott' : '- State: Open')),
  pausedFx.map(({ f }) => parseRecord(fs.readFileSync(f.record, 'utf8')).state.raw).join('; '))

// E8-D26: three stop reasons alert once each.
const alertBad = ['Blocked', 'round alarm with no ruling', 'handoff before the warning'].map((n) => negs.find((x) => x.name === n)).filter(({ f, r }) => {
  const m = metas(f), t = toasts(f), p = paused(f)[0].slice('- auto-cycle paused: '.length)
  return m.length !== 1 || t.length !== 1 || m[0].join(' ') !== `pane report-metadata w9:p1 --source custom:autocycle --token autocycle=${pausedToken(p)} --ttl-ms 86400000` ||
    JSON.stringify(t[0]) !== JSON.stringify(['notification', 'show', 'proj e8-fixture: doctrine auto-cycle paused', '--body', `${p}. ${pauseAction(p)}`, '--sound', 'request']) ||
    r.msg !== `doctrine auto-cycle paused: ${p}. ${pauseAction(p)}` || calls(f).some((c) => c.includes('custom:doctrine'))
})
clause('clause 2h — three stop reasons each make one report-metadata call with the paused token, source and 24 h TTL, one notification, the pane message, and no dctr-token call (E8-D26)',
  alertBad.length === 0, alertBad.map(({ f, r }) => show(f, r)).join(' || '))
const blk = negs.find((x) => x.name === 'Blocked')
const again = run(blk.f)
const other = run(blk.f, { session_id: 's-another' })
clause('clause 2i — a second Stop, and a later session, write no second paused line and never alert the same line again (E8-D18, F2)',
  paused(blk.f).length === 1 && toasts(blk.f).length === 1 && again.msg === '' && other.msg === '', show(blk.f, again))

// B3: a paused line the agent wrote is alerted too, with its written form.
const agent = negs.find((x) => x.name === 'paused after warned')
clause('clause 2j — a paused line the agent wrote is alerted once, naming its reason and its action (B3, E8-D19, S4-1)',
  agent.r.msg === 'doctrine auto-cycle paused: question: which way?. answer in the pane, then /clear and type resume' &&
  toasts(agent.f)[0]?.[4] === 'question: which way?. answer in the pane, then /clear and type resume' && toasts(agent.f).length === 1 && metas(agent.f).length === 1, show(agent.f, agent.r))

// E8-R25: a resolved R2, R3 or R4 pause lets the same session cycle again.
const R2L = ['- State: Blocked. waits', '- auto-cycle paused: phase Blocked: State: Blocked. waits']
const R3L = ['- alarm: time fired 2026-09-24T01:00:00Z count 1', '- auto-cycle paused: time alarm fired, ruling needed']
const R4L = ['- question: Q5 opened 2026-09-24T01:00:00Z which?', '- auto-cycle paused: open question Q5: which?']
const pr = (...ls) => { const es = rec(...ls); return pauseResolved(es.filter((e) => e.sub === 'paused').at(-1), es) }
clause('clause 1p — pauseResolved, judged on the lines after the paused line: R2 on a later state line not Blocked, R3 on a later ruling, R4 on a later answer for its id; R5, R10 and the skills\' question form never (E8-R25)',
  !pr(...R2L) && pr(...R2L, '- State: Open') && !pr(...R3L) && pr(...R3L, '- ruling: R9 2026-09-24T02:00:00Z go') &&
  !pr('- alarm: round fired 2026-09-24T01:00:00Z count 4', '- auto-cycle paused: round alarm fired, ruling needed', '- alarm: time fired 2026-09-24T01:30:00Z count 1') &&
  !pr(...R4L) && pr(...R4L, '- question: Q5 answered 2026-09-24T02:00:00Z this') && !pr(...R4L, '- question: Q6 answered 2026-09-24T02:00:00Z that') &&
  !pr('- State: Open', '- auto-cycle paused: cycle cap 10 reached') && !pr('- auto-cycle paused: could not cycle: handoff not written') &&
  !pr('- question: Q5 answered 2026-09-24T02:00:00Z x', '- auto-cycle paused: question: which way?') &&
  !pr('- ruling: R8 2026-09-24T00:00:00Z earlier', ...R3L) && !pr(...R2L, '- State: Blocked. still') && !pr('- State: Open', ...R2L) && !pr('- question: Q5 answered 2026-09-24T00:00:00Z earlier', ...R4L),
  'a branch misread')
// RB2-1: an answered pause stays answered when a later alarm or Blocked of the same kind arrives.
const es21 = rec('- auto-cycle: warned s 60%', ...R3L, '- ruling: R9 2026-09-24T02:00:00Z go', '- alarm: time fired 2026-09-24T03:00:00Z count 2')
const es21b = rec('- auto-cycle: warned s 60%', ...R2L, '- State: Open', '- State: Blocked. again')
clause('clause 1p2 — a ruled R3 pause stays resolved after a second alarm of its kind, an unblocked R2 after a second Blocked, so neither stands again (RB2-1)',
  pauseResolved(es21.find((e) => e.sub === 'paused'), es21) && standingPauses(es21).length === 0 && !pauseStands(es21, 0, 'time alarm fired, ruling needed') &&
  pauseResolved(es21b.find((e) => e.sub === 'paused'), es21b) && standingPauses(es21b).length === 0, 'an old pause stood again')
const RDY = '- auto-cycle: ready'
const R10R = 'could not cycle: handoff not written', R7R = 'waiting for your permission approval'
clause('clause 1q — standingPauses: the unresolved pauses after the latest warned or cycle line, or with neither the latest line when an unresolved pause; a ready line after a pause hides nothing; pauseStands only for the same pause as one of them (E8-R25, RB2-3, E8-R27)',
  standingPauses(rec(...R2L)).length === 1 && standingPauses(rec(...R2L, '- State: Open')).length === 0 &&
  standingPauses(rec('- auto-cycle: warned s 60%', '- auto-cycle paused: could not cycle: handoff not written', RDY)).length === 1 &&
  pauseStands(rec('- auto-cycle: warned s 60%', '- auto-cycle paused: could not cycle: handoff not written', RDY), 0, R10R) &&
  !pauseStands(rec('- auto-cycle: warned s 60%', '- auto-cycle paused: could not cycle: handoff not written'), 0, R7R) &&
  !pauseStands(rec('- auto-cycle: warned s 60%', '- auto-cycle paused: could not cycle: handoff not written', RDY, '- auto-cycle: cycle 3 tree aa'), 0, R10R) &&
  standingPauses(rec('- auto-cycle paused: cycle cap 10 reached', '- auto-cycle: cycle 2 tree aa')).length === 0 &&
  standingPauses(rec('- auto-cycle: warned s 60%', '- auto-cycle paused: cycle cap 10 reached', '- auto-cycle: cycle 3 tree aa', RDY)).length === 0 &&
  standingPauses(rec('- auto-cycle paused: cycle cap 10 reached', RDY)).length === 0 &&
  unresolvedPausesAfter(rec('- auto-cycle: warned s 60%', ...R3L), 1).length === 1 && unresolvedPausesAfter(rec('- auto-cycle: warned s 60%', ...R3L, '- ruling: R9 2026-09-24T02:00:00Z go'), 1).length === 0,
  'wrong')
const resolved = [['R2', [...R2L, '- State: Open']], ['R3', [...R3L, '- ruling: R9 2026-09-24T02:00:00Z go']], ['R4', [...R4L, '- question: Q5 answered 2026-09-24T02:00:00Z this']]]
  .map(([n, lines]) => { const f = fixture(`resolved-${n}`, { lines }); return { n, f, r: run(f) } })
clause('clause 2c4 — a resolved R2, R3 or R4 pause after the warned line: the next ready Stop launches and writes no paused line (E8-R25)',
  resolved.every(({ f, r }) => launched(r) && paused(f).length === 1), resolved.map(({ f, r }) => show(f, r)).join(' || '))
const fresh = fixture('fresh-after-resolved', { lines: [...R3L, '- ruling: R9 2026-09-24T02:00:00Z go', '- alarm: time fired 2026-09-24T03:00:00Z count 2'] })
const freshR = run(fresh, {}, { HERDR_PANE_ID: 'w9:pfresh' })
const blk2 = fixture('second-blocked', { lines: [...R2L, '- State: Open', '- State: Blocked. again'] })
const blk2R = run(blk2, {}, { HERDR_PANE_ID: 'w9:pblk2' })
clause('clause 2c5 — a second alarm of the same kind after a ruled one, and a second Blocked after an unblock, each write a fresh paused line, alert it and show paused (E8-R25, RB2-1)',
  JSON.stringify(paused(fresh)) === JSON.stringify(['- auto-cycle paused: time alarm fired, ruling needed', '- auto-cycle paused: time alarm fired, ruling needed']) &&
  toasts(fresh).length === 1 && freshR.msg === 'doctrine auto-cycle paused: time alarm fired, ruling needed. rule in the pane' &&
  metas(fresh).at(-1)?.[6] === 'autocycle=auto-cycle paused·time alarm fired, ruling needed' &&
  paused(blk2).at(-1) === '- auto-cycle paused: phase Blocked: State: Blocked. again' && paused(blk2).length === 2 && toasts(blk2).length === 1 &&
  metas(blk2).at(-1)?.[6] === `autocycle=${pausedToken('phase Blocked: State: Blocked. again')}`,
  `${show(fresh, freshR)} || ${show(blk2, blk2R)}`)
// RB2-3: a pause the ready line follows still holds step 3, is alerted, and keeps the token paused.
const hidden = [['R10', '- auto-cycle paused: could not cycle: handoff not written'], ['R7', '- auto-cycle paused: waiting for your permission approval'], ['question', '- auto-cycle paused: question: which way?']]
  .map(([n, line]) => { const f = fixture(`ready-after-${n}`, { lines: [line, RDY] }); return { n, line, f, r: run(f, {}, { HERDR_PANE_ID: `w9:pready${n}` }) } })
clause('clause 2c8 — R10, R7 or the skills\' question pause followed by the ready line: step 3 decides none, the pane message prints, the toast is raised and the token reads paused (RB2-3)',
  hidden.every(({ n, f, r, line }) => !launched(r) && paused(f).length === 1 && toasts(f).length === 1 &&
    r.msg === pauseMessage(line.slice('- auto-cycle paused: '.length), n === 'question' ? 'answer in the pane, then /clear and type resume' : undefined) && metas(f).at(-1)?.[6] === `autocycle=${pausedToken(line.slice('- auto-cycle paused: '.length))}`),
  hidden.map(({ f, r }) => show(f, r)).join(' || '))
// RB3-2: an on line and a recorded session start are anchors too, so a manual /clear and resume, or R5's own new on
// line, leaves the old pauses behind.
const R10P = '- auto-cycle paused: could not cycle: handoff not written'
const R5P = '- auto-cycle paused: cycle cap 10 reached'
clause('clause 1q2 — standingPauses anchors on the latest warned, cycle or on line, or on the recorded session start, whichever is later (RB3-2)',
  standingPauses(rec('- auto-cycle: warned s 60%', R5P, '- auto-cycle: on cap 20 tier 60%')).length === 0 &&
  standingPauses(rec('- auto-cycle: warned s 60%', R10P), 2).length === 0 &&
  JSON.stringify(standingPauses(rec('- auto-cycle: warned s 60%', R10P, '- auto-cycle paused: waiting for your permission approval'), 2).map((e) => e.line)) === '[3]' &&
  standingPauses(rec('- auto-cycle: warned s 60%', R10P), 1).length === 1 && standingPauses(rec(R10P)).length === 1 &&
  !pauseStands(rec('- auto-cycle: warned s 60%', R10P), 2, R10R) && pauseStands(rec('- auto-cycle: warned s 60%', R10P), 1, R10R),
  'an anchor was missed')
// Clause 1r: the pause model's consumers, enumerated (E8-R25, E8-R27, RB4-1, RB4-2). Every sequence of up to ENUM_LEN record
// lines drawn from ENUM_LINES, after a head of `State: Open` and an on line, with no session start recorded or one
// recorded after the head's first sequence line or its second. For each, with S = standingPauses:
//   a. for each candidate pause differing from every pause in S, the dedup (pauseStands) lets it be written, and the
//      line it writes stands at once, so it is alerted and the token names it (E8-R27); the idle pause R8 only when S
//      is empty (E8-R28);
//   b. for each candidate the same as a pause in S, the dedup refuses it, and R8 while S holds any pause (E8-R28);
//   c. on a record whose last on/off line is off or whose last state line is not Open or Blocked, the typer, the one
//      writer that runs past the hooks' stand-downs, never pauses at any stage, a stop file present (RB4-1);
//   d. the consumers agree on S: the token reads paused iff S is non-empty and then names S's last line, step 3
//      (pausedAfterWarned) refuses whenever a pause in S follows this session's warned line, and a skills' question
//      in S asks for a /clear exactly when it stands after this session's warned line (RB5-1). The alerts read S with
//      the same session start, which clause 1s pins, so each line in S is alerted and shown once, by its marker.
// "The same pause" is decided here from each line's own tag, never by samePause: the same PAUSES code (two R9 lines
// with different error text, two R4 lines for different ids), or the same text for the skills' question.
const ENUM_LEN = 4
const ENUM_LINES = [
  ['on', '- auto-cycle: on cap 10 tier 60%'], ['off', '- auto-cycle: off'], ['warned', '- auto-cycle: warned s1 60%'],
  ['cycle', '- auto-cycle: cycle 1 tree aa'], ['ready', '- auto-cycle: ready'],
  ['R1', '- auto-cycle paused: stopped by .doctrine/auto-cycle.stop in /w/p'], ['R2', '- auto-cycle paused: phase Blocked: State: Blocked. waits'],
  ['R4', '- auto-cycle paused: open question Q5: which?'], ['R7', '- auto-cycle paused: waiting for your permission approval'],
  ['R9', '- auto-cycle paused: Claude API error: overloaded'], ['R14', '- auto-cycle paused: cleared, but the new session did not start doctrine'],
  ['q:which way?', '- auto-cycle paused: question: which way?'], ['R3', '- auto-cycle paused: round alarm fired, ruling needed'],
  ['alarm', '- alarm: round fired 2026-09-24T01:00:00Z count 4'],
  ['open', '- State: Open'], ['blocked', '- State: Blocked. waits'], ['exited', '- State: Exited.'],
  ['ruling', '- ruling: R9 2026-09-24T02:00:00Z go'], ['answered', '- question: Q5 answered 2026-09-24T02:00:00Z this'],
]
const ENUM_CANDS = [
  ['R1', 'stopped by .doctrine/auto-cycle.stop in /w/q'], ['R2', 'phase Blocked: State: Blocked. other'], ['R4', 'open question Q6: and?'],
  ['R7', 'waiting for your permission approval'], ['R8', 'session idle, waiting for you'], ['R9', 'Claude API error: rate_limit'],
  ['R14', 'cleared, but the new session did not start doctrine'], ['q:which way?', 'question: which way?'], ['q:other?', 'question: other?'],
  ['R3', 'time alarm fired, ruling needed'],
]
const enumParsed = new Map(ENUM_CANDS.map(([, r]) => [r, rec(`- auto-cycle paused: ${r}`)[0]]))
const tagOf = new Map(ENUM_LINES.map(([t, l]) => [l.replace(/^- auto-cycle paused: /, ''), t]))
const ENUM_HEAD = ['- State: Open', '- auto-cycle: on cap 10 tier 60%']
const enumBad = { a: [], b: [], c: [], d: [] }
let enumCount = 0
const enumNote = (k, seq, start, what) => { if (enumBad[k].length < 3) enumBad[k].push(`[${seq.map((i) => ENUM_LINES[i][0]).join(', ')}] start ${start}: ${what}`) }
const enumTyper = { pane: { status: 'idle', focused: false, session: 'old' }, oldSession: 'old', grew: false, restore: { session: 'new', transcript: '/n' }, waited: 0, notIdle: 0, sessionWait: 0, resumes: 0, firstTurn: false, pausedSinceClaim: false }
for (let len = 1; len <= ENUM_LEN; len++) {
  for (let k = 0; k < ENUM_LINES.length ** len; k++) {
    const seq = []; for (let x = k, j = 0; j < len; j++, x = Math.floor(x / ENUM_LINES.length)) seq.push(x % ENUM_LINES.length)
    const lines = [...ENUM_HEAD, ...seq.map((i) => ENUM_LINES[i][1])]
    const es = rec(...lines)
    for (const start of [0, 3, 4].filter((s) => s <= lines.length)) {
      enumCount++
      const S = standingPauses(es, start), tags = S.map((p) => tagOf.get(p.reason))
      for (const [tag, reason] of ENUM_CANDS) {
        const refused = pauseStands(es, start, reason), same = tag === 'R8' ? tags.length > 0 : tags.includes(tag)
        if (same && !refused) enumNote('b', seq, start, `${reason} written while ${tags.join(', ')} stands`)
        if (!same) {
          if (refused) enumNote('a', seq, start, `${reason} refused while only ${tags.join(', ') || 'nothing'} stands`)
          else if (standingPauses([...es, { ...enumParsed.get(reason), line: lines.length + 1 }], start).at(-1)?.line !== lines.length + 1) enumNote('a', seq, start, `${reason} written but does not stand`)
        }
      }
      const active = autoCycleActive(es, false)
      if (!active) {
        for (const stage of ['clear', 'resume', 'confirm']) {
          const st = typerStep({ ...enumTyper, stage, active, stopRepo: '/w/p' })
          if (st.act === 'pause') enumNote('c', seq, start, `typer at ${stage} pauses: ${st.reason}`)
        }
      }
      const token = autocycleToken(es, start)
      if (S.length ? token !== pausedToken(S.at(-1).reason) : !token.startsWith('auto-cycle on·')) enumNote('d', seq, start, `token ${token} with ${tags.join(', ') || 'nothing'} standing`)
      // RB5-1: a question standing after this session's warned line, with no cycle, on line or session start between,
      // asks for the /clear; any other asks only for an answer.
      for (const p of S.filter((x) => /^question: /.test(x.reason))) {
        const w = es.filter((e) => e.sub === 'warned' && e.line < p.line).at(-1)
        const held = Boolean(w) && w.line > start && !es.some((e) => (e.sub === 'cycle' || e.sub === 'on') && e.line > w.line && e.line < p.line)
        if (pauseActionAt(p, es, start).includes('/clear') !== held) enumNote('d', seq, start, `question at line ${p.line} action ${pauseActionAt(p, es, start)}`)
      }
      const mine = es.filter((e) => e.sub === 'warned' && e.session === 's1').at(-1)
      if (mine && S.some((p) => p.line > mine.line) && !pausedAfterWarned(es, 's1')) enumNote('d', seq, start, `step 3 goes on with ${tags.join(', ')} standing after the warned line`)
    }
  }
}
clause(`clause 1r — the pause model enumerated over every sequence of up to ${ENUM_LEN} lines (${enumCount} cases): a different pause is written and stands, the same pause is not, the idle pause only when none stands, the typer never pauses an off or closed record, and the token, step 3 and the question's action agree with the standing set (E8-R25, E8-R27, E8-R28, RB4-1, RB4-2, RB5-1)`,
  enumCount > 0 && Object.values(enumBad).every((v) => v.length === 0), JSON.stringify(enumBad))
// E8-R28: an idle_prompt writes nothing while any paused line stands, whatever pause it names, and R8 behind none.
// F1: the alerts read the standing set with the recorded session start, so a pause from before a /clear is neither
// toasted nor shown again in the new session, and the new session's own pause is.
const f1 = path.join(tmp, 'f1', 'r.md')
write(f1, '- State: Open\n- auto-cycle: on cap 10 tier 60%\n- auto-cycle: warned s 60%\n- auto-cycle paused: could not cycle: handoff not written\n')
state.writeSessionStart(f1)
const f1Alert = state.alertPaused({ recordPath: f1, repo: 'proj', phase: 'e8-fixture', paneId: null }), f1Shown = state.pauseMessageOnce(f1)
fs.appendFileSync(f1, '- auto-cycle paused: waiting for your permission approval\n')
const f1Alert2 = state.alertPaused({ recordPath: f1, repo: 'proj', phase: 'e8-fixture', paneId: null }), f1Shown2 = state.pauseMessageOnce(f1)
clause('clause 1s — alertPaused reads the recorded session start: a pause from before it raises nothing, the new session\'s own pause is raised (F1)',
  f1Alert === false && f1Alert2 === true, JSON.stringify([f1Alert, f1Alert2]))
clause('clause 1s2 — pauseMessageOnce reads the recorded session start: a pause from before it is not shown, the new session\'s own pause is shown alone (F1)',
  f1Shown === null && f1Shown2 === 'doctrine auto-cycle paused: waiting for your permission approval. approve or deny in the pane', JSON.stringify([f1Shown, f1Shown2]))
// RB5-2, E8-R29: in the dedup, an R7, R8 or R9 line written before this session's latest Stop no longer counts, for
// the same-event rule and the idle rule; every other pause counts as before, and with no Stop known every one does.
const WR = '- auto-cycle: warned s 60%', R7P = '- auto-cycle paused: waiting for your permission approval', R8R = 'session idle, waiting for you'
const es7 = rec(WR, R7P), es9 = rec(WR, '- auto-cycle paused: Claude API error: overloaded'), es3 = rec(WR, '- alarm: round fired 2026-09-24T01:00:00Z count 4', '- auto-cycle paused: round alarm fired, ruling needed')
clause('clause 1v — pauseStands with the latest Stop\'s line: a second R7 or R9 after a Stop is written, one with no Stop between is not, the idle pause behind an R7 from an earlier turn is written, behind an R3 from an earlier turn it is not, and with no Stop known every line counts (E8-R29, RB5-2)',
  pauseStands(es7, 0, R7R, 2) === false && pauseStands(es7, 0, R7R, 1) === true && pauseStands(es7, 0, R7R, 0) === true && pauseStands(es7, 0, R7R) === true &&
  pauseStands(es9, 0, 'Claude API error: rate_limit', 2) === false && pauseStands(es9, 0, 'Claude API error: rate_limit', 1) === true &&
  pauseStands(es7, 0, R8R, 2) === false && pauseStands(es7, 0, R8R, 0) === true && pauseStands(es3, 0, R8R, 3) === true &&
  pauseStands(rec(WR, '- auto-cycle paused: phase Blocked: x'), 0, 'phase Blocked: y', 5) === true && standingPauses(es7, 0).length === 1, 'wrong')
// RB5-1: the skills' question asks for a /clear only where it holds step 3, after this session's warned line.
const QP = '- auto-cycle paused: question: Memory is stale — resync it?'
const qAct = (start, ...ls) => { const es = rec(...ls); return pauseActionAt(es.filter((e) => e.sub === 'paused').at(-1), es, start) }
const CLR = 'answer in the pane, then /clear and type resume'
clause('clause 1t — pauseActionAt: a question after the warned line asks for the /clear; before any warning, after a cycle line or after a recorded session start it asks only for an answer; a table reason keeps its D2 action (RB5-1)',
  qAct(0, '- auto-cycle: on cap 10 tier 60%', '- auto-cycle: warned s 60%', QP) === CLR && qAct(0, '- auto-cycle: on cap 10 tier 60%', QP) === 'answer in the pane' &&
  qAct(0, '- auto-cycle: warned s 60%', '- auto-cycle: cycle 1 tree aa', QP) === 'answer in the pane' && qAct(2, '- auto-cycle: on cap 10 tier 60%', '- auto-cycle: warned s 60%', QP) === 'answer in the pane' &&
  qAct(0, '- auto-cycle: warned s 60%', '- auto-cycle paused: cycle cap 10 reached') === PAUSES.R5.action, 'wrong')
clause('clause 1u — step 3 reads this session\'s own warned line: behind another session\'s later warned line a pause still holds it, and the later session is not held by it (E8-D7, DS-1)',
  pausedAfterWarned(rec('- auto-cycle: warned sA 60%', R10P, '- auto-cycle: warned sB 60%'), 'sA') === true &&
  pausedAfterWarned(rec('- auto-cycle: warned sA 60%', R10P, '- auto-cycle: warned sB 60%'), 'sB') === false, 'another session\'s warned line was read')
// The manual /clear and resume R10 asks for: the restore hook records the new session's start, then the new session's
// ordinary turn shows the cycle count, and its own permission prompt is written, alerted and shown paused.
const restoreHook = path.join(import.meta.dirname, 'dctr-restore.mjs')
const mc = fixture('manual-clear', { lines: [R10P] })
const mcPane = { HERDR_PANE_ID: 'w9:pmc' }
const mcOld = run(mc, { last_assistant_message: 'waiting' }, mcPane)
spawnSync('node', [restoreHook], { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'clear', session_id: 's-mc-new', transcript_path: mc.transcript, cwd: mc.proj }), env: { ...baseEnv, ...mcPane }, encoding: 'utf8' })
const mcNew = run(mc, { session_id: 's-mc-new', last_assistant_message: 'resumed' }, mcPane)
const mcPerm = run(mc, { session_id: 's-mc-new', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, mcPane)
clause('clause 2c10 — after a manual /clear and resume the old R10 no longer stands: the token reads the cycle count, and the new session\'s permission prompt is written, alerted and shown paused (RB3-2)',
  metas(mc).map((c) => c[6]).join(' | ') === `autocycle=${pausedToken('could not cycle: handoff not written')} | autocycle=auto-cycle on·cycle 0 of 10 | autocycle=${pausedToken('waiting for your permission approval')}` &&
  paused(mc).at(-1) === '- auto-cycle paused: waiting for your permission approval' && toasts(mc).length === 2 && mcNew.msg === '' &&
  mcPerm.msg === 'doctrine auto-cycle paused: waiting for your permission approval. approve or deny in the pane' && mcOld.msg.includes('handoff not written'),
  `${metas(mc).map((c) => c[6]).join(' | ')} || ${show(mc, mcPerm)}`)
// RB4-2: a typer pause written after the /clear and the new session's start (R15) stands in the new session, and the
// new session's own, different pauses are still written, alerted and shown, and the token names the latest.
const rb2 = fixture('rb4-2', { lines: [RDY, '- auto-cycle: cycle 1 tree abc'] })
state.writeSessionStart(rb2.record)
fs.appendFileSync(rb2.record, '- auto-cycle paused: resume typed twice, no reply from the new session\n')
const rb2Pane = { HERDR_PANE_ID: 'w9:prb42' }
const rb2Perm = run(rb2, { session_id: 's-rb42-new', hook_event_name: 'Notification', notification_type: 'permission_prompt' }, rb2Pane)
const rb2Fail = run(rb2, { session_id: 's-rb42-new', hook_event_name: 'StopFailure', error: 'overloaded' }, rb2Pane)
clause('clause 2c12 — a typer pause standing in the new session does not swallow the new session\'s permission prompt or API error: each is written, toasted and shown, and the token names it (RB4-2, E8-R27)',
  JSON.stringify(paused(rb2)) === JSON.stringify(['- auto-cycle paused: resume typed twice, no reply from the new session', '- auto-cycle paused: waiting for your permission approval', '- auto-cycle paused: Claude API error: overloaded']) &&
  toasts(rb2).length === 3 && rb2Perm.msg.includes('waiting for your permission approval. approve or deny in the pane') && rb2Fail.msg === 'doctrine auto-cycle paused: Claude API error: overloaded. retry in the pane' &&
  metas(rb2).at(-1)?.[6] === `autocycle=${pausedToken('Claude API error: overloaded')}`, `${show(rb2, rb2Perm)} || ${show(rb2, rb2Fail)}`)
// RB5-1 end to end: a freshly cycled session asks doctrine-resume's drift question before its own warning.
const qpre = fixture('qpre-pre-warning', { lines: [RDY, '- auto-cycle: cycle 1 tree abc'] })
state.writeSessionStart(qpre.record)
fs.appendFileSync(qpre.record, `${QP}\n`)
const q1R = run(qpre, { session_id: 's-qpre-new', last_assistant_message: 'Memory is stale — resync it?' }, { HERDR_PANE_ID: 'w9:pq1' })
clause('clause 2c13 — a question a new session asks before its warning: the pane message and the toast ask only for an answer (RB5-1)',
  q1R.msg === 'doctrine auto-cycle paused: question: Memory is stale — resync it?. answer in the pane' && toasts(qpre).length === 1 &&
  toasts(qpre)[0][4] === 'question: Memory is stale — resync it?. answer in the pane', show(qpre, q1R))
const r5 = fixture('r5-new-on-line', { lines: [R5P, '- auto-cycle: on cap 20 tier 60%'] })
const r5R = run(r5, { last_assistant_message: 'working' }, { HERDR_PANE_ID: 'w9:pr5' })
clause('clause 2c11 — R5 followed by the new on line its action asks for no longer stands: the token reads the cycle count of the new cap, and nothing is shown (RB3-2)',
  metas(r5).at(-1)?.[6] === 'autocycle=auto-cycle on·cycle 0 of 20' && r5R.msg === '' && toasts(r5).length === 0, show(r5, r5R))
const tokR = fixture('token-resolved', { warned: false, lines: R2L.slice(0, 1) })
const tokRRun = () => run(tokR, { last_assistant_message: 'working' }, { HERDR_PANE_ID: 'w9:pres' })
tokRRun()
fs.appendFileSync(tokR.record, '- State: Open\n'); tokRRun()
clause('clause 2c6 — once the pause resolves, the next event republishes the on token though the paused line is still the latest auto-cycle line (E8-R25)',
  JSON.stringify(metas(tokR).map((c) => c[6])) === JSON.stringify(['autocycle=auto-cycle paused·phase Blocked: State: Blocked. waits', 'autocycle=auto-cycle on·cycle 0 of 10']),
  JSON.stringify(metas(tokR).map((c) => c[6])))

// RB2-2, RB3-1: the claim is single use per record state, keyed by the record's latest auto-cycle line. A typer that
// used the claim (its pid now dead) and then a resolved R4 pause: the agent's next turn ends ready with no new record
// ready line, and still launches, under the paused line's key. The same record state never launches twice.
const keyOf = (f) => claimKey(parseRecord(fs.readFileSync(f.record, 'utf8')).entries)
const stubLog = (f) => (fs.existsSync(f.stubLog) ? fs.readFileSync(f.stubLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
const waitStub = async (f, n) => { for (const end = Date.now() + 30000; Date.now() < end && stubLog(f).length < n; ) await new Promise((r) => setTimeout(r, 50)) }
const cl = fixture('claim-per-ready', { lines: [RDY] })
const firstKey = keyOf(cl)
write(claimFile(cl.session, firstKey), JSON.stringify({ pid: Number(deadPid), pane: 'w9:p1' }))
const clUsed = run(cl)
fs.appendFileSync(cl.record, `${R4L.join('\n')}\n- question: Q5 answered 2026-09-24T02:00:00Z this\n`)
const clNew = run(cl)
const clPausedLine = parseRecord(fs.readFileSync(cl.record, 'utf8')).entries.filter((e) => e.sub === 'paused').at(-1).line
await waitStub(cl, 1)
const tw = fixture('same-ready-twice', { lines: [RDY] })
const tw1 = run(tw)
await waitStub(tw, 1)
const tw2 = run(tw)
clause('clause 2c9 — a used claim holds its own record state only: after a typer abort and a resolved R4, a ready turn with no new record ready line launches under the paused line\'s key; one record state launches once (RB2-2, RB3-1)',
  !launched(clUsed) && launched(clNew) && stubLog(cl).length === 1 && stubLog(cl)[0].keyLine === clPausedLine && clPausedLine > firstKey &&
  launched(tw1) && !launched(tw2) && stubLog(tw).length === 1 && fs.existsSync(claimFile(tw.session, keyOf(tw))),
  `${show(cl, clUsed)} || ${show(cl, clNew)} || ${show(tw, tw2)}`)

// SP1: a pause the detached typer wrote gets its toast from the typer and its pane message from the next hook event.
const sp1 = fixture('typer-pause', { lines: ['- auto-cycle paused: resume typed twice, no reply from the new session'] })
state.alertPaused({ recordPath: sp1.record, repo: 'proj', phase: 'e8-fixture', paneId: null })
const sp1a = run(sp1, { hook_event_name: 'Notification', notification_type: 'idle_prompt' })
const sp1b = run(sp1, { hook_event_name: 'Notification', notification_type: 'idle_prompt' })
clause('clause 2c7 — a typer pause (R15) prints its pane message at the next Notification, once; the toast is not raised again (SP1, E8-R23)',
  sp1a.msg === 'doctrine auto-cycle paused: resume typed twice, no reply from the new session. check the pane' && sp1b.msg === '' && toasts(sp1).length === 0 && paused(sp1).length === 1,
  `${show(sp1, sp1a)} | ${sp1b.msg}`)

// B3: the on token, republished only when its value changes; a resolved pause shows on again (LB2).
// Its own pane, since the value last published is tracked per pane and every other fixture shares w9:p1.
const tok = fixture('token', { warned: false })
const tokRun = () => run(tok, {}, { HERDR_PANE_ID: 'w9:ptok' })
tokRun(); tokRun()
const onCalls1 = metas(tok).length
fs.appendFileSync(tok.record, '- auto-cycle paused: session idle, waiting for you\n'); tokRun(); tokRun()
fs.appendFileSync(tok.record, `- auto-cycle: warned ${tok.session} 60%\n- auto-cycle: cycle 3 tree abc\n`); tokRun()
const vals = metas(tok).map((c) => c[6])
clause('clause 2k — the autocycle token reads on·cycle while active, is not republished unchanged, shows paused, and shows on again once the pause resolves (B3, LB2)',
  onCalls1 === 1 && JSON.stringify(vals) === JSON.stringify(['autocycle=auto-cycle on·cycle 0 of 10', 'autocycle=auto-cycle paused·session idle, waiting for you', 'autocycle=auto-cycle on·cycle 3 of 10']),
  JSON.stringify(vals))

// E8-D17 end to end: the cap and no progress, with real tree hashes.
const capF = fixture('cap', { lines: [cyc(10, 'aa')] }), capR = run(capF)
const npF = fixture('no-progress')
const hNow = treeHash([npF.proj], EX)
fs.appendFileSync(npF.record, `${cyc(1, hNow)}\n${backupWave}\n${cyc(2, hNow)}\n${backupWave}\n`)
const npR = run(npF)
const pgF = fixture('progress')
const hOld = treeHash([pgF.proj], EX)
fs.appendFileSync(pgF.record, `${cyc(1, hOld)}\n${cyc(2, hOld)}\n`)
write(path.join(pgF.proj, 'src.txt'), 'edited\n')
const pgR = run(pgF)
clause('clause 2l — the cap pauses with R5, two cycles of bookkeeping over an unchanged tree pause with R6, a new edit launches (E8-D17)',
  JSON.stringify(paused(capF)) === '["- auto-cycle paused: cycle cap 10 reached"]' && !launched(capR) &&
  JSON.stringify(paused(npF)) === '["- auto-cycle paused: no progress in 2 cycles"]' && !launched(npR) && launched(pgR), `${show(capF, capR)} | ${show(npF, npR)} | ${show(pgF, pgR)}`)

// ST1: end to end over a tracked repo, each excluded path changed and committed between cycles: no progress. The
// same with a file named run-state that is not the record's is progress (SP4).
function bookkeeping(name, extra) {
  const f = fixture(name, { tracked: true })
  const h = treeHash([f.proj], (repo) => treeExcludes(f.record, repo))
  fs.appendFileSync(f.record, `${cyc(1, h)}\n${cyc(2, h)}\n`)
  write(path.join(f.proj, 'SESSION_MEMORY.md'), '# Session memory\n\n## Next Session Kickoff\nhandoff: docs/handoffs/h.md | state: open\nmore\n')
  write(path.join(f.proj, 'docs/handoffs/h0.md'), 'an older handoff moved in\n')
  write(path.join(f.proj, '.doctrine/auto-cycle.note'), 'x')
  write(path.join(f.proj, '.doctrine/records/r-run-state.md'), 'counters')
  extra?.(f)
  git(f.proj, 'add', '-A'); git(f.proj, 'commit', '-q', '-m', 'docs(session): backup')
  return { f, h, r: run(f) }
}
const bk = bookkeeping('bookkeeping-tracked')
const bkWork = bookkeeping('run-state-elsewhere', (f) => write(path.join(f.proj, 'notes/run-state.md'), 'real work'))
clause('clause 2l2 — a tracked repo whose memory file, handoffs, auto-cycle files, record and run-state file changed and were committed shows no progress (R6); a file named run-state elsewhere is progress (ST1, SP4)',
  JSON.stringify(paused(bk.f)) === '["- auto-cycle paused: no progress in 2 cycles"]' && !launched(bk.r) && launched(bkWork.r) && paused(bkWork.f).length === 0,
  `${show(bk.f, bk.r)} | ${show(bkWork.f, bkWork.r)}`)

// Notification and StopFailure (E8-D18).
const note = (f, type, more = {}, env = {}) => run(f, { hook_event_name: 'Notification', notification_type: type, ...more }, env)
const stopFacts = (f, facts) => { fs.mkdirSync(autoCycleDir(), { recursive: true }); fs.writeFileSync(stopFactsFile(f.session), JSON.stringify(facts)) }
const nPerm = fixture('n-perm'); note(nPerm, 'permission_prompt')
const nIdle = fixture('n-idle'); stopFacts(nIdle, { backgroundEmpty: true, cronsEmpty: true, ready: false }); note(nIdle, 'idle_prompt')
const nFail = fixture('n-fail'); run(nFail, { hook_event_name: 'StopFailure', error: 'rate_limit', error_details: 'x' })
clause('clause 2m — permission_prompt, an unexplained idle_prompt and StopFailure each write their paused line and alert it (E8-D18)',
  JSON.stringify(paused(nPerm)) === '["- auto-cycle paused: waiting for your permission approval"]' &&
  JSON.stringify(paused(nIdle)) === '["- auto-cycle paused: session idle, waiting for you"]' &&
  JSON.stringify(paused(nFail)) === '["- auto-cycle paused: Claude API error: rate_limit"]' &&
  [nPerm, nIdle, nFail].every((f) => toasts(f).length === 1), [nPerm, nIdle, nFail].map((f) => JSON.stringify(paused(f))).join(' '))
const offs = ['permission_prompt', 'idle_prompt', 'StopFailure'].map((t) => {
  const f = fixture(`n-off-${t}`, { lines: ['- auto-cycle: off'] }); stopFacts(f, { backgroundEmpty: true, cronsEmpty: true, ready: false })
  if (t === 'StopFailure') run(f, { hook_event_name: 'StopFailure', error: 'x' }); else note(f, t)
  return f
})
clause('clause 2n — each with auto-cycle off does nothing and calls no herdr (E8-D18)',
  offs.every((f) => paused(f).length === 0 && calls(f).length === 0), offs.map((f) => JSON.stringify(calls(f))).join(' '))
const nStop = fixture('n-stop'); write(path.join(nStop.proj, '.doctrine/auto-cycle.stop'), ''); note(nStop, 'permission_prompt')
clause('clause 2n2 — with the stop file present a Notification writes nothing: it acts only while auto-cycle is active (B6)',
  paused(nStop).length === 0 && calls(nStop).length === 0, show(nStop, { code: 0, msg: '', err: '' }))
const iPaused = fixture('i-paused', { lines: ['- auto-cycle paused: session idle, waiting for you'] }); stopFacts(iPaused, { backgroundEmpty: true, cronsEmpty: true, ready: false }); note(iPaused, 'idle_prompt')
const idleBehind = [['R7', ['- auto-cycle paused: waiting for your permission approval']], ['R2', R2L], ['R3', R3L], ['R4', R4L], ['question', ['- auto-cycle paused: question: which way?']]]
  .map(([n, lines]) => { const f = fixture(`i-behind-${n}`, { lines }); stopFacts(f, { backgroundEmpty: true, cronsEmpty: true, ready: false }); note(f, 'idle_prompt', {}, { HERDR_PANE_ID: `w9:pidle${n}` }); return { n, f } })
const iClaim = fixture('i-claim'); stopFacts(iClaim, { backgroundEmpty: true, cronsEmpty: true, ready: false })
write(claimFile('s-the-old-session'), JSON.stringify({ pid: process.pid, pane: 'w9:p1', session: 's-the-old-session' })); note(iClaim, 'idle_prompt')
const claimSeen = paused(iClaim).length
fs.rmSync(claimFile('s-the-old-session'))
const iGate = fixture('i-gate'); stopFacts(iGate, { backgroundEmpty: true, cronsEmpty: true, ready: false }); gateLive(iGate); note(iGate, 'idle_prompt')
const iReady = fixture('i-ready'); stopFacts(iReady, { backgroundEmpty: true, cronsEmpty: true, ready: true }); note(iReady, 'idle_prompt')
const iBg = fixture('i-bg'); stopFacts(iBg, { backgroundEmpty: false, cronsEmpty: true, ready: false }); note(iBg, 'idle_prompt')
clause('clause 2o — idle_prompt writes nothing while a paused line stands that the session has not ended a turn since (R8, R7, R2, R3, R4, the skills\' question), or any other paused line, while a claim for this pane is held under another session id (F9), while a gate is live, after a ready Stop, or after a Stop with background tasks; behind none it writes R8 (E8-R28)',
  paused(iPaused).length === 1 && JSON.stringify(paused(nIdle)) === '["- auto-cycle paused: session idle, waiting for you"]' && idleBehind.every(({ f }) => paused(f).length === 1 && toasts(f).length === 1 && !paused(f).some((l) => l.includes('session idle'))) && claimSeen === 0 && paused(iGate).length === 0 && paused(iReady).length === 0 && paused(iBg).length === 0,
  JSON.stringify([paused(iPaused), idleBehind.map(({ n, f }) => [n, paused(f), toasts(f).length]), claimSeen, paused(iGate), paused(iReady), paused(iBg)]))
const s4 = fixture('s4')
run(s4, { background_tasks: [{ id: 'b' }] })
let s4a = null
try { s4a = JSON.parse(fs.readFileSync(stopFactsFile(s4.session), 'utf8')) } catch { /* the clause reports it */ }
note(s4, 'idle_prompt')
run(s4, { last_assistant_message: 'Asked Scott a question.' })
note(s4, 'idle_prompt')
clause('clause 2p — every Stop persists its background tasks and ready line for the next idle_prompt (S4): the first explains the idle, the second does not',
  s4a?.backgroundEmpty === false && s4a?.ready === true && JSON.stringify(paused(s4)) === '["- auto-cycle paused: session idle, waiting for you"]', JSON.stringify([s4a, paused(s4)]))

// RB5-2 end to end: a permission prompt, a second one with no turn end between (refused), a Stop, a third (written);
// an API error, a Stop, a second API error (written; two in a row are clause 2c15's); an idle stop after an R7 from an
// earlier turn is written, after an R3 it is not; with no turn end known a second R7 is refused.
const rb52 = fixture('rb5-2'), rb52Pane = { HERDR_PANE_ID: 'w9:prb52' }
const perm = { hook_event_name: 'Notification', notification_type: 'permission_prompt' }, fail = { hook_event_name: 'StopFailure', error: 'overloaded' }
const turn = { last_assistant_message: 'working' }
for (const p of [perm, perm, turn, perm, fail, turn, fail]) run(rb52, p, rb52Pane)
const idleAfter = (name, lines) => { const f = fixture(name, { lines }); run(f, turn, { HERDR_PANE_ID: `w9:p${name}` }); note(f, 'idle_prompt', {}, { HERDR_PANE_ID: `w9:p${name}` }); return f }
const idle7 = idleAfter('idle-after-r7', [R7P]), idle3 = idleAfter('idle-after-r3', R3L)
const noFacts = fixture('no-stop-facts', { lines: [R7P] }); run(noFacts, perm, { HERDR_PANE_ID: 'w9:pnofacts' })
clause('clause 2c14 — a second permission prompt after the session\'s next Stop is written and toasted, and not before it, and a second API error after a Stop too; an idle stop behind an R7 from an earlier turn is written, behind an R3 not; with no Stop known a second R7 is refused (E8-R29, RB5-2)',
  JSON.stringify(paused(rb52)) === JSON.stringify(['- auto-cycle paused: waiting for your permission approval', '- auto-cycle paused: waiting for your permission approval', '- auto-cycle paused: Claude API error: overloaded', '- auto-cycle paused: Claude API error: overloaded']) &&
  toasts(rb52).length === 4 && paused(idle7).at(-1) === `- auto-cycle paused: ${R8R}` && paused(idle7).length === 2 &&
  !paused(idle3).some((l) => l.includes('session idle')) && paused(noFacts).length === 1,
  `${show(rb52, { code: 0, msg: '', err: '' })} || ${JSON.stringify([paused(idle7), paused(idle3), paused(noFacts)])}`)
// RB6-3: each of E8-D7's live-work conditions, carried from a Stop to the next idle_prompt, writes no R8.
const liveBehind = [['seat', {}, seatUp], ['gate', {}, gateLive], ['codex job', {}, codexLive], ['background task', { background_tasks: [{ id: 'b1' }] }], ['session cron', { session_crons: [{ id: 'c1' }] }]]
  .map(([n, more, pre], i) => { const f = fixture(`idle-live-${i}`); pre?.(f); const env = { HERDR_PANE_ID: `w9:plive${i}` }
    run(f, { last_assistant_message: 'working', ...more }, env); note(f, 'idle_prompt', {}, env); return { n, f, more } })
clause('clause 2o2 — a seat, a gate, a codex job, a background task or a session cron live at the Stop: the next idle_prompt writes no paused line (E8-D7, E8-D18, RB6-3)',
  liveBehind.every(({ f }) => paused(f).length === 0), JSON.stringify(liveBehind.map(({ n, f }) => [n, paused(f)])))
// RB6-2: a turn end recorded for another record never frees a line in this one.
const rbA = path.join(tmp, 'rb62', 'a.md'), rbB = path.join(tmp, 'rb62', 'b.md')
write(rbB, `- State: Open\n- auto-cycle: on cap 10 tier 60%\n- auto-cycle: warned s 60%\n${R7P}\n`)
fs.mkdirSync(autoCycleDir(), { recursive: true })
fs.writeFileSync(state.turnEndFile('s-rb62'), JSON.stringify({ record: path.resolve(rbA), line: 99 }))
const rb62Other = appendPaused(rbB, R7R, 's-rb62')
state.writeTurnEnd('s-rb62', rbB)
const rb62Same = appendPaused(rbB, R7R, 's-rb62')
clause('clause 1w — the dedup reads the turn end\'s line only for the record it names: one for another record frees nothing, one for this record frees its earlier R7 (E8-R29, E8-R31, RB6-2)',
  rb62Other.written === false && rb62Same.written === true, JSON.stringify([rb62Other, rb62Same, fs.readFileSync(rbB, 'utf8')]))
// E8-R31, DP6-B1: a StopFailure and a submitted prompt end a turn too. A retried turn that fails again writes its R9
// again; a permission prompt after an interrupted turn, once the next prompt is submitted, writes its R7 again; with
// no turn end between, the second is refused. UserPromptSubmit writes no paused line, prints nothing, and stands down
// with auto-cycle off or for a subagent; it leaves the Stop facts the idle test reads as they were.
const ups = { hook_event_name: 'UserPromptSubmit', prompt: 'go on' }
const sf = fixture('turn-end-stopfailure'), sfPane = { HERDR_PANE_ID: 'w9:psf2' }
run(sf, fail, sfPane); run(sf, fail, sfPane)
const it = fixture('turn-end-prompt'), itPane = { HERDR_PANE_ID: 'w9:pit' }
stopFacts(it, { backgroundEmpty: true, cronsEmpty: true, ready: false })
run(it, perm, itPane); const itUps = run(it, ups, itPane); run(it, perm, itPane)
const itFacts = JSON.parse(fs.readFileSync(stopFactsFile(it.session), 'utf8'))
const nb = fixture('no-turn-end'), nbPane = { HERDR_PANE_ID: 'w9:pnb' }
run(nb, perm, nbPane); run(nb, perm, nbPane)
const upsOff = fixture('ups-off', { lines: ['- auto-cycle: off'] }), upsOffR = run(upsOff, ups)
const upsSub = fixture('ups-subagent'), upsSubR = run(upsSub, { ...ups, agent_id: 'a1' })
const upsQuiet = fixture('ups-quiet', { lines: ['- auto-cycle paused: resume typed twice, no reply from the new session'] }), upsQuietR = run(upsQuiet, ups, { HERDR_PANE_ID: 'w9:pupsq' })
clause('clause 2c15 — a turn ended by a StopFailure or a submitted prompt: a repeat API error and a repeat permission prompt are written and toasted; with no turn end between, refused; UserPromptSubmit writes and prints nothing, keeps the Stop facts, and stands down when off or for a subagent (E8-R31, DP6-B1)',
  JSON.stringify(paused(sf)) === JSON.stringify(['- auto-cycle paused: Claude API error: overloaded', '- auto-cycle paused: Claude API error: overloaded']) && toasts(sf).length === 2 &&
  JSON.stringify(paused(it)) === JSON.stringify([R7P, R7P]) && toasts(it).length === 2 && itUps.out === '' && itUps.code === 0 &&
  itFacts.backgroundEmpty === true && itFacts.cronsEmpty === true && itFacts.ready === false &&
  paused(nb).length === 1 && toasts(nb).length === 1 &&
  upsOffR.out === '' && !fs.existsSync(state.turnEndFile(upsOff.session)) && calls(upsOff).length === 0 &&
  upsSubR.out === '' && !fs.existsSync(state.turnEndFile(upsSub.session)) && calls(upsSub).length === 0 &&
  upsQuietR.out === '' && calls(upsQuiet).length === 0 && fs.existsSync(state.turnEndFile(upsQuiet.session)),
  `${show(sf, { code: 0, msg: '', err: '' })} || ${show(it, itUps)} || ${JSON.stringify(itFacts)} || ${JSON.stringify(paused(nb))} || ${upsOffR.out}|${upsSubR.out}`)
// Clause 1x (TA2): hook-event sequences, driven through the real hook in-process (runHook in dctr-cycle.mjs, with
// process.exit, stdout and stderr stubbed and herdr a tripwire on PATH: no pane is set, so the hook makes no herdr
// call and its token is read through its one seam, autocycleToken). Every sequence of up to EV_LEN steps over
// EV_STEPS, from a record Open with auto-cycle on and no warned line, the record-side steps a warned line, an alarm, a
// ruling and a prose line quoting a paused line in two code spans (DSP7-B1), which is no pause, walked depth first with the state files
// snapshotted and restored between siblings. An interrupt is a turn that ends with no event, so it is the empty step:
// every sequence without one already covers it. The oracle reads the record's own lines and keeps its own turn end and
// Stop facts, per E8-D18 as amended by E8-R27 to E8-R31; its judgements of what a line is and what stands never call the
// code under test, which it uses only to spell the expected token (pausedToken) and to read the token's seam (d):
//   a. a permission_prompt or StopFailure writes its line unless one of the same event stands after the latest turn
//      end (Stop, StopFailure, UserPromptSubmit), a StopFailure's own turn end taken before its line;
//   b. an idle_prompt writes R8 only when the last Stop said ready false, no background task and no cron, and no
//      pause stands but an R7, R8 or R9 at or before the latest turn end;
//   c. each line an event writes is shown in that event's pane message and nowhere else, and alerted once;
//   d. the token names the last standing pause while any stands, else reads the cycle count;
//   e. a UserPromptSubmit writes nothing, alerts nothing and prints nothing.
// "Stands" here: a paused line after the latest on or warned line, an alarm pause not answered by a later ruling line.
const { runHook } = await import('./dctr-cycle.mjs')
const EV_LEN = 4
const EV_STEPS = [
  ['S', { last_assistant_message: 'working' }], ['Sb', { last_assistant_message: 'working', background_tasks: [{ id: 'b1' }] }],
  ['Sc', { last_assistant_message: 'working', session_crons: [{ id: 'c1' }] }], ['Sr', { last_assistant_message: 'Handoff written.\nauto-cycle: ready' }],
  ['F', { hook_event_name: 'StopFailure', error: 'overloaded' }], ['U', { hook_event_name: 'UserPromptSubmit', prompt: 'go on' }],
  ['P', { hook_event_name: 'Notification', notification_type: 'permission_prompt' }], ['I', { hook_event_name: 'Notification', notification_type: 'idle_prompt' }],
  ['W', null], ['A', null], ['R', null], ['Q', null],
]
const ev = fixture('event-enum', { warned: false, latch: false })
const evHash = crypto.createHash('sha1').update(path.resolve(ev.record)).digest('hex').slice(0, 16)
const evMarkers = () => fs.readdirSync(autoCycleDir()).filter((n) => n.startsWith(`alerted-${evHash}-`) || n.startsWith(`shown-${evHash}-`))
const evFiles = [stopFactsFile(ev.session), state.turnEndFile(ev.session)]
const evSnap = () => ({ record: fs.readFileSync(ev.record, 'utf8'), files: evFiles.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null)), markers: new Set(evMarkers()) })
const evRestore = (s) => {
  fs.writeFileSync(ev.record, s.record)
  evFiles.forEach((f, i) => (s.files[i] === null ? fs.rmSync(f, { force: true }) : fs.writeFileSync(f, s.files[i])))
  for (const n of evMarkers()) if (!s.markers.has(n)) fs.rmSync(path.join(autoCycleDir(), n))
}
const EXIT = Symbol('exit')
const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write, env: { ...process.env } }
const trip = path.join(tmp, 'ev-bin'); fs.mkdirSync(trip)
fs.writeFileSync(path.join(trip, 'herdr'), `#!/bin/sh\necho "$@" >> ${path.join(tmp, 'ev-herdr.log')}\nexit 1\n`); fs.chmodSync(path.join(trip, 'herdr'), 0o755)
for (const k of ['HERDR_PANE_ID', 'HERDR_ENV', 'HERDR_WORKSPACE_ID', 'DCTR_VIEW_REQUEST_DIR', 'CLAUDE_PROJECT_DIR']) delete process.env[k]
process.env.PATH = `${trip}:${process.env.PATH}`
const hookEvent = (more) => {
  let out = ''
  process.exit = () => { throw EXIT }
  process.stdout.write = (c) => { out += c; return true }
  process.stderr.write = () => true
  try { runHook(JSON.stringify(payload(ev, more))) } catch (e) { if (e !== EXIT) throw e } finally {
    process.exit = saved.exit; process.stdout.write = saved.out; process.stderr.write = saved.err
  }
  let j = null
  try { j = out ? JSON.parse(out) : null } catch { /* reported below */ }
  return { out, shown: (j?.systemMessage || '').split('\n').filter((l) => l.startsWith('doctrine auto-cycle paused: ')) }
}
// The oracle's reading of the record: its own classification, never the code under test's.
const evCode = (r) => (r === 'waiting for your permission approval' ? 'R7' : r === 'session idle, waiting for you' ? 'R8' : /^Claude API error: /.test(r) ? 'R9' : /alarm fired, ruling needed$/.test(r) ? 'R3' : 'other')
const evRead = () => {
  const lines = fs.readFileSync(ev.record, 'utf8').replace(/\n$/, '').split('\n')
  const anchor = lines.reduce((a, l, i) => (/^- auto-cycle: (on|warned) /.test(l) ? i + 1 : a), 0)
  const pauses = lines.map((l, i) => ({ l, line: i + 1 })).filter(({ l }) => l.startsWith('- auto-cycle paused: ')).map(({ l, line }) => ({ line, reason: l.slice(21), code: evCode(l.slice(21)) }))
  const ruled = (p) => lines.some((l, i) => i + 1 > p.line && l.startsWith('- ruling: '))
  return { count: lines.length, pauses, standing: pauses.filter((p) => p.line > anchor && !(p.code === 'R3' && ruled(p))) }
}
const evBad = { a: [], b: [], c: [], d: [], e: [] }
let evCount = 0
const evNote = (k, seq, what) => { if (evBad[k].length < 3) evBad[k].push(`[${seq.join(' ')}] ${what}`) }
const walk = (seq, model) => {
  if (seq.length === EV_LEN) return
  const snap = evSnap()
  for (const [name, more] of EV_STEPS) {
    const s = [...seq, name], before = evRead(), m = { ...model }
    if (more === null) {
      fs.appendFileSync(ev.record, { W: `- auto-cycle: warned ${ev.session} 60%\n`, A: '- alarm: round fired 2026-09-24T01:00:00Z count 4\n', R: '- ruling: R9 2026-09-24T02:00:00Z go on\n',
        Q: '- `auto-cycle paused: R7` means the hook saw a permission prompt; I approved it with `yes`\n' }[name])
    } else {
      const ends = name.startsWith('S') || name === 'F' || name === 'U'
      if (ends) m.turnEnd = before.count
      const markersBefore = new Set(evMarkers())
      const r = hookEvent(more)
      evCount++
      const after = evRead(), wrote = after.pauses.filter((p) => p.line > before.count)
      const standsSince = (code) => before.standing.some((p) => p.code === code && p.line > m.turnEnd)
      if (name === 'P' || name === 'F') {
        const code = name === 'P' ? 'R7' : 'R9', want = !standsSince(code)
        if ((wrote.length === 1 && wrote[0].code === code) !== want || wrote.length > 1) evNote('a', s, `wrote ${JSON.stringify(wrote.map((p) => p.reason))}, expected ${want ? code : 'nothing'}`)
      }
      if (name === 'I') {
        const f = m.facts, want = Boolean(f) && f.ready === false && f.bg === false && f.cron === false &&
          !before.standing.some((p) => !(['R7', 'R8', 'R9'].includes(p.code) && p.line <= m.turnEnd))
        if ((wrote.length === 1 && wrote[0].code === 'R8') !== want || wrote.length > 1) evNote('b', s, `wrote ${JSON.stringify(wrote.map((p) => p.reason))}, expected ${want ? 'R8' : 'nothing'}`)
      }
      if (name === 'U' && (wrote.length || r.out !== '' || evMarkers().length !== markersBefore.size)) evNote('e', s, `wrote ${wrote.length}, printed ${JSON.stringify(r.out)}`)
      if (name !== 'U') {
        const shownReasons = r.shown.map((l) => l.slice('doctrine auto-cycle paused: '.length))
        if (wrote.length > 1 || shownReasons.length !== wrote.length || !wrote.every((p) => shownReasons.some((x) => x.startsWith(`${p.reason}. `))))
          evNote('c', s, `wrote ${JSON.stringify(wrote.map((p) => p.reason))} shown ${JSON.stringify(shownReasons)}`)
        for (const p of wrote) if (!fs.existsSync(path.join(autoCycleDir(), `alerted-${evHash}-${p.line}`)) || !fs.existsSync(path.join(autoCycleDir(), `shown-${evHash}-${p.line}`))) evNote('c', s, `line ${p.line} not marked alerted and shown`)
      }
      if (name.startsWith('S')) m.facts = { ready: name === 'Sr', bg: name === 'Sb', cron: name === 'Sc' }
    }
    const now = evRead(), token = autocycleToken(parseRecord(fs.readFileSync(ev.record, 'utf8')).entries, 0)
    if (now.standing.length ? token !== pausedToken(now.standing.at(-1).reason) : !token.startsWith('auto-cycle on·')) evNote('d', s, `token ${token} with ${JSON.stringify(now.standing.map((p) => p.reason))}`)
    walk(s, m)
    evRestore(snap)
  }
}
try { walk([], { turnEnd: 0, facts: null }) } finally { process.env = saved.env }
const evTrip = fs.existsSync(path.join(tmp, 'ev-herdr.log'))
clause(`clause 1x — hook-event sequences of up to ${EV_LEN} steps over Stop (ready or not, with background tasks, with crons), StopFailure, UserPromptSubmit, the two prompts, and warned, alarm, ruling and quoting prose lines (${evCount} hook events): the oracle's writes, alerts, messages and token hold, and herdr is never called (E8-D18, E8-R27 to E8-R31, TA2)`,
  evCount > 0 && !evTrip && Object.values(evBad).every((v) => v.length === 0), JSON.stringify({ ...evBad, herdr: evTrip }))
// RB7-3: a StopFailure's own R9 holds the idle rule until a turn ends after it: an idle_prompt right after it, the
// last Stop's facts idle-eligible, writes no R8.
const sfIdle = fixture('stopfailure-then-idle'), sfIdlePane = { HERDR_PANE_ID: 'w9:psfi' }
run(sfIdle, { last_assistant_message: 'working' }, sfIdlePane); run(sfIdle, fail, sfIdlePane); note(sfIdle, 'idle_prompt', {}, sfIdlePane)
clause('clause 2c16 — a StopFailure then an idle_prompt in the same turn: the R9 is written and the idle stop writes no R8 behind it (E8-R28, E8-R31, RB7-3)',
  JSON.stringify(paused(sfIdle)) === '["- auto-cycle paused: Claude API error: overloaded"]', show(sfIdle, { code: 0, msg: '', err: '' }))
// ORC7-1: the hook runs when its tree is reached through a symlink (a symlinked config or plugin dir): Node resolves
// symlinks in the main module's URL, so an entry guard comparing unresolved paths would drop every event silently.
const linkHooks = path.join(tmp, 'linked-hooks'); fs.symlinkSync(import.meta.dirname, linkHooks)
const viaLink = spawnSync('node', [path.join(linkHooks, 'dctr-cycle.mjs')], { input: JSON.stringify({ hook_event_name: 'Bogus', session_id: 's-link' }), env: baseEnv, encoding: 'utf8' })
clause('clause 2s — run through a symlinked hooks directory, the hook still runs: a bogus event prints its stand-down line (ORC7-1)',
  viaLink.status === 0 && viaLink.stderr.includes('auto-cycle skipped — not a Stop, Notification, StopFailure or UserPromptSubmit event (Bogus)'), JSON.stringify([viaLink.status, viaLink.stdout, viaLink.stderr]))
// RB8-2: stdin that cannot be read (a directory) stands the hook down with exit 0, as every other failure does.
const dirFd = fs.openSync(tmp, 'r')
const badIn = spawnSync('node', [hook], { stdio: [dirFd, 'pipe', 'pipe'], env: baseEnv, encoding: 'utf8' })
fs.closeSync(dirFd)
clause('clause 2t — stdin that cannot be read stands the hook down with exit 0 and a reason, never a stack (RB8-2)',
  badIn.status === 0 && badIn.stderr.includes('auto-cycle skipped — hook payload was not readable') && !badIn.stderr.includes('    at '), JSON.stringify([badIn.status, badIn.stderr]))
// The typer stub is spawned detached, so wait for the launching fixtures' records, however loaded the host is.
const stubbed = (f) => fs.existsSync(f.stubLog) ? fs.readFileSync(f.stubLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
const launchers = [good, goodT, goodS, pgF, pb, bkWork.f, ...resolved.map((x) => x.f)]
for (const deadline = Date.now() + 30000; Date.now() < deadline && !launchers.every((f) => stubbed(f).length); ) await new Promise((r) => setTimeout(r, 50))
const ga = stubbed(good)[0]
clause('clause 2q — the typer is spawned only for the launching fixtures, with the pane, session, transcript length, the Stop\'s start time, record, tree hash and cycle number',
  stubbed(good).length === 1 && ga.pane === 'w9:p1' && ga.session === good.session && ga.length === fs.statSync(good.transcript).size &&
  ga.record === good.record && /^[0-9a-f]{40}$/.test(ga.hash) && ga.n === 1 && ga.project === good.proj && ga.phase === 'e8-fixture' && ga.stopAt >= goodBefore && ga.stopAt <= goodAfter &&
  negs.every(({ f }) => stubbed(f).length === 0) && stubbed(capF).length === 0 && stubbed(npF).length === 0 && stubbed(pgF).length === 1 && stubbed(goodS).length === 1,
  JSON.stringify(ga))

const hj = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'hooks.json'), 'utf8')).hooks
const runsCycle = (entry) => entry?.hooks?.[0]?.command?.endsWith('/hooks/dctr-cycle.mjs"') && entry.hooks[0].timeout > 0
clause('clause 2r — hooks.json runs dctr-cycle.mjs on Stop, on Notification with matcher permission_prompt|idle_prompt, on StopFailure and on UserPromptSubmit (E8-D18, E8-R31)',
  hj.Stop?.length === 1 && runsCycle(hj.Stop[0]) && !hj.Stop[0].matcher && hj.Notification?.length === 1 && runsCycle(hj.Notification[0]) &&
  hj.Notification[0].matcher === 'permission_prompt|idle_prompt' && hj.StopFailure?.length === 1 && runsCycle(hj.StopFailure[0]) &&
  hj.UserPromptSubmit?.length === 1 && runsCycle(hj.UserPromptSubmit[0]) && !hj.UserPromptSubmit[0].matcher,
  JSON.stringify([hj.Stop, hj.Notification, hj.StopFailure, hj.UserPromptSubmit]))

const hjd = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'hooks.json'), 'utf8')).description
clause('clause 2r2 — hooks.json says what the stop file does (Stop writes a paused line naming it and alerts, the other two write nothing), names UserPromptSubmit, and does not state the idle rule without E8-R30\'s exception (RB3, DS6-B1)',
  hjd.includes('With a .doctrine/auto-cycle.stop in the session\'s repo or the record\'s, Stop appends one paused line naming that file and alerts it, and Notification and StopFailure write nothing.') &&
  !/stands down unless auto-cycle is active/.test(hjd) && !hjd.includes('(no paused line stands,') && hjd.includes('UserPromptSubmit'), hjd.slice(-900))

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const gitQuiet = (repoDir, ...a) => { try { return git(repoDir, ...a) } catch { return null } }
const tracked = negs.find((n) => n.name === 'tracked handoff with no backup commit').f
clause('clause 3a — without the hook: the tracked fixture\'s handoff is not ignored and has no commit, the tracked good one has one, the ignored one is ignored',
  gitQuiet(tracked.proj, 'check-ignore', 'docs/handoffs/h.md') === null && gitQuiet(tracked.proj, 'log', '--format=%H', '--', 'docs/handoffs/h.md') === '' &&
  /^[0-9a-f]{40}$/.test(gitQuiet(goodT.proj, 'log', '-1', '--format=%H', '--', 'docs/handoffs/h.md')) && gitQuiet(good.proj, 'check-ignore', 'docs/handoffs/h.md') === 'docs/handoffs/h.md',
  'git fixtures wrong')
const early = negs.find((n) => n.name === 'handoff before the warning').f
const beforeC = negs.find((n) => n.name === 'tracked handoff committed only before the warning').f
clause('clause 3a2 — without the hook: the early-commit fixture\'s handoff is committed, clean, written after the warning and committed before it',
  Number(git(beforeC.proj, 'log', '-1', '--format=%ct', '--', 'docs/handoffs/h.md')) * 1000 < T0 && git(beforeC.proj, 'status', '--porcelain', '--', 'docs/handoffs/h.md') === '' &&
  fs.statSync(path.join(beforeC.proj, 'docs/handoffs/h.md')).mtimeMs > T0, 'early-commit fixture wrong')
clause('clause 3a5 — without the hook: the claim fixture\'s first claim existed with a dead pid, and after the append its latest auto-cycle line is the R4 paused line, with no ready line after it',
  fs.existsSync(claimFile(cl.session, firstKey)) && !claimHeld(claimFile(cl.session, firstKey)) &&
  parseRecord(fs.readFileSync(cl.record, 'utf8')).entries.filter((e) => e.kind === 'auto-cycle').at(-1).line === clPausedLine,
  'claim fixture wrong')
clause('clause 3a6 — without the hook: each ready-after fixture\'s record holds its paused line after this session\'s warned line and the ready line as its last auto-cycle line',
  hidden.every(({ f, line }) => {
    const es = parseRecord(fs.readFileSync(f.record, 'utf8')).entries.filter((e) => e.kind === 'auto-cycle')
    const p = es.findIndex((e) => e.sub === 'paused'), w = es.findIndex((e) => e.sub === 'warned')
    return w >= 0 && p > w && es.at(-1).sub === 'ready' && `- auto-cycle paused: ${es[p].reason}` === line
  }), 'ready-after fixtures wrong')
clause('clause 3a7 — without the hook: the manual-clear record\'s R10 sits before the recorded session start, and the start file names the line count at the /clear',
  JSON.parse(fs.readFileSync(state.sessionStartFile(mc.record), 'utf8')) >= parseRecord(fs.readFileSync(mc.record, 'utf8')).entries.find((e) => e.sub === 'paused').line &&
  JSON.parse(fs.readFileSync(state.sessionStartFile(mc.record), 'utf8')) < parseRecord(fs.readFileSync(mc.record, 'utf8')).entries.filter((e) => e.sub === 'paused').at(-1).line,
  `start ${fs.readFileSync(state.sessionStartFile(mc.record), 'utf8')} paused ${JSON.stringify(parseRecord(fs.readFileSync(mc.record, 'utf8')).entries.filter((e) => e.sub === 'paused'))}`)
const rb2Es = parseRecord(fs.readFileSync(rb2.record, 'utf8')).entries
const rb2Start = JSON.parse(fs.readFileSync(state.sessionStartFile(rb2.record), 'utf8'))
const rb2R15 = rb2Es.find((e) => e.reason === 'resume typed twice, no reply from the new session')
clause('clause 3a8 — without the hook: the RB4-2 record\'s R15 line comes after its cycle line and after the recorded session start, with no auto-cycle line between it and the new session\'s pauses',
  rb2R15 && rb2R15.line > rb2Start && rb2R15.line > rb2Es.find((e) => e.sub === 'cycle').line &&
  !rb2Es.some((e) => e.kind === 'auto-cycle' && e.line > rb2R15.line && e.sub !== 'paused'), `start ${rb2Start} ${JSON.stringify(rb2Es.filter((e) => e.kind === 'auto-cycle'))}`)
// Clause 1r's fixture sequences carry the defects it names, read from the parsed lines alone: RB4-1's record `off`
// has an off line as its last on/off line; RB4-2's [warned, cycle, R14] with the session start before the cycle line
// has R14 as its latest auto-cycle line, after both the cycle line and the start; E8-R27's candidate R7 is not R14.
const e3 = rec(...ENUM_HEAD, '- auto-cycle: off'), e4 = rec(...ENUM_HEAD, '- auto-cycle: warned s1 60%', '- auto-cycle: cycle 1 tree aa', '- auto-cycle paused: cleared, but the new session did not start doctrine')
clause('clause 3a9 — without the model: the enumeration\'s RB4-1 record ends switched off, and its RB4-2 record\'s latest line is an R14 pause after the cycle line and the session start 3',
  e3.filter((e) => e.sub === 'on' || e.sub === 'off').at(-1).sub === 'off' &&
  e4.filter((e) => e.kind === 'auto-cycle').at(-1).reason === 'cleared, but the new session did not start doctrine' && e4.at(-1).line === 5 && e4.find((e) => e.sub === 'cycle').line === 4 &&
  'waiting for your permission approval' !== e4.at(-1).reason, JSON.stringify([e3, e4]))
const f1Es = parseRecord(fs.readFileSync(f1, 'utf8')).entries, f1Start = JSON.parse(fs.readFileSync(state.sessionStartFile(f1), 'utf8'))
clause('clause 3a10 — without the helpers: the F1 record\'s R10 sits at or before its recorded session start and its R7 after it, both after the warned line',
  f1Es.find((e) => e.reason === 'could not cycle: handoff not written').line <= f1Start && f1Es.find((e) => e.reason === 'waiting for your permission approval').line > f1Start &&
  f1Es.find((e) => e.sub === 'warned').line < f1Es.find((e) => e.sub === 'paused').line, `start ${f1Start} ${JSON.stringify(f1Es)}`)
clause('clause 3a11 — without the hook: each idle-behind fixture holds its own paused line, after the warned line, and a Stop facts file saying no background task and no ready line',
  idleBehind.every(({ n, f }) => {
    const es = parseRecord(fs.readFileSync(f.record, 'utf8')).entries, p = es.filter((e) => e.sub === 'paused')
    const facts = JSON.parse(fs.readFileSync(stopFactsFile(f.session), 'utf8'))
    return p.length >= 1 && p[0].line > es.find((e) => e.sub === 'warned').line && facts.backgroundEmpty === true && facts.ready === false &&
      ({ R7: /^waiting for your/, R2: /^phase Blocked/, R3: /^time alarm/, R4: /^open question Q5/, question: /^question: / })[n].test(p[0].reason)
  }), 'idle-behind fixtures wrong')
clause('clause 3a12 — without the hook: the pre-warning question sits after the cycle line and after the recorded session start, with no warned line after it',
  (() => { const es = parseRecord(fs.readFileSync(qpre.record, 'utf8')).entries, qp = es.find((e) => /^question: /.test(e.reason || ''))
    return qp.line > JSON.parse(fs.readFileSync(state.sessionStartFile(qpre.record), 'utf8')) && qp.line > es.find((e) => e.sub === 'cycle').line && !es.some((e) => e.sub === 'warned' && e.line > qp.line) })(),
  fs.readFileSync(qpre.record, 'utf8'))
clause('clause 3a13 — the idle-after fixtures\' turn end carries a record line at or after their earlier pause and their Stop facts no background task and no ready line, and the no-facts fixture has neither file',
  [idle7, idle3].every((f) => { const facts = JSON.parse(fs.readFileSync(stopFactsFile(f.session), 'utf8')), end = JSON.parse(fs.readFileSync(state.turnEndFile(f.session), 'utf8'))
    const p = parseRecord(fs.readFileSync(f.record, 'utf8')).entries.find((e) => e.sub === 'paused')
    return Number.isInteger(end.line) && end.line >= p.line && end.record === path.resolve(f.record) && facts.backgroundEmpty === true && facts.ready === false }) &&
    !fs.existsSync(stopFactsFile(noFacts.session)) && !fs.existsSync(state.turnEndFile(noFacts.session)),
  JSON.stringify([idle7, idle3].map((f) => fs.existsSync(stopFactsFile(f.session)) && fs.readFileSync(stopFactsFile(f.session), 'utf8'))))
clause('clause 3a14 — without the hook: the live-work fixtures carry their condition (a seat, gate or codex marker, or a Stop with a background task or a cron), and each Stop said its message was not ready',
  liveBehind.every(({ n, f, more }) => { const facts = JSON.parse(fs.readFileSync(stopFactsFile(f.session), 'utf8'))
    return facts.ready === false && (n === 'background task' ? more.background_tasks?.length === 1 && facts.backgroundEmpty === false
      : n === 'session cron' ? more.session_crons?.length === 1 && facts.cronsEmpty === false && facts.backgroundEmpty === true : fs.readdirSync(seatsDir(f.session)).length === 1) }),
  JSON.stringify(liveBehind.map(({ f }) => fs.readFileSync(stopFactsFile(f.session), 'utf8'))))
clause('clause 3a15 — without the hook: the StopFailure fixture had no Stop (no Stop facts), the prompt fixture\'s Stop facts were written by this suite before any event, the off fixture ends switched off, and the quiet fixture\'s typer pause stands after its warned line',
  !fs.existsSync(stopFactsFile(sf.session)) && JSON.stringify(Object.keys(itFacts)) === '["backgroundEmpty","cronsEmpty","ready"]' &&
  parseRecord(fs.readFileSync(upsOff.record, 'utf8')).entries.filter((e) => e.sub === 'on' || e.sub === 'off').at(-1).sub === 'off' &&
  (() => { const es = parseRecord(fs.readFileSync(upsQuiet.record, 'utf8')).entries; return es.find((e) => e.sub === 'paused').line > es.find((e) => e.sub === 'warned').line })(),
  'turn-end fixtures wrong')
const evHead = fs.readFileSync(ev.record, 'utf8').split('\n'), evQ = '- `auto-cycle paused: R7` means the hook saw a permission prompt; I approved it with `yes`'
clause('clause 3a16 — without the hook: the event-enumeration record, as restored, holds State Open and an on line and no warned or paused line, its session has no gauge latch (so a ready Stop never launches), its quoting line is not a paused line by its own text, and the herdr tripwire is executable',
  evHead.includes('- State: Open') && evHead.some((l) => /^- auto-cycle: on /.test(l)) && !evHead.some((l) => /^- auto-cycle: warned|^- auto-cycle paused: /.test(l)) &&
  !fs.existsSync(path.join(stateDir(ev.session), 'gauge.json')) && !evQ.startsWith('- auto-cycle paused: ') && evQ.split('`').length - 1 === 4 &&
  (fs.statSync(path.join(trip, 'herdr')).mode & 0o111) !== 0, evHead.join(' | '))
clause('clause 3a17 — without the hook: the linked hooks directory is a symlink whose real path is this suite\'s own',
  fs.lstatSync(linkHooks).isSymbolicLink() && fs.realpathSync(linkHooks) === fs.realpathSync(import.meta.dirname) && linkHooks !== import.meta.dirname, linkHooks)
clause('clause 3a3 — without the hook: the bookkeeping fixture committed a change to every excluded path, and the other a real run-state file too',
  ['SESSION_MEMORY.md', 'docs/handoffs/h0.md', '.doctrine/auto-cycle.note', '.doctrine/records/r.md', '.doctrine/records/r-run-state.md']
    .every((p) => git(bk.f.proj, 'log', '-1', '--format=%s', '--', p) === 'docs(session): backup') &&
  git(bkWork.f.proj, 'log', '-1', '--format=%s', '--', 'notes/run-state.md') === 'docs(session): backup',
  'bookkeeping fixtures wrong')
clause('clause 3b — without the hook: the early handoff\'s mtime is before the latch\'s warning time, and the good one\'s after',
  fs.statSync(path.join(early.proj, 'docs/handoffs/h.md')).mtimeMs < T0 && fs.statSync(path.join(good.proj, 'docs/handoffs/h.md')).mtimeMs > T0, 'mtimes wrong')
const q1 = negs.find((n) => n.name.startsWith('stop file in the record')).f
clause('clause 3c — without the hook: the Q1 stop file sits only in the record\'s repo, a separate git repo',
  !fs.existsSync(path.join(q1.proj, '.doctrine/auto-cycle.stop')) && fs.existsSync(path.join(q1.recRoot, '.doctrine/auto-cycle.stop')) &&
  fs.existsSync(path.join(q1.recRoot, '.git')) && q1.recRoot !== q1.proj, 'Q1 fixture wrong')
clause('clause 3d — without the hook: the no-progress record carries two cycle lines with the tree\'s own hash and only backup waves after them, and the progress fixture a changed file',
  fs.readFileSync(npF.record, 'utf8').split('\n').filter((l) => l === cyc(2, hNow) || l === cyc(1, hNow)).length === 2 &&
  git(pgF.proj, 'diff', '--name-only') === 'src.txt', 'progress fixtures wrong')

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
