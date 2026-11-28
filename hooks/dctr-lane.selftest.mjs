// Three-clause tamper test for the lane worktree command, hooks/dctr-lane.mjs, per CLAUDE.md.
//
//   node hooks/dctr-lane.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Drives dctr-lane.mjs end to end over real git fixture repos under one temp dir, with GIT_CEILING_DIRECTORIES at
// that dir, TMPDIR inside it, and a logging herdr shim first on PATH that plays the new pane. Clause 1 confirms each
// refusal refuses and makes nothing (a create failing after its worktree is made undoes it, or past RESUME_LINE leaves
// it and says so);
// clause 2 confirms create, reset, archive and remove do what the seams say, the launch line and the restore-hook and
// prompt-gate chain a create sets up included; clause 3 proves the fixtures carry what those clauses rest on without
// running dctr-lane.mjs. laneOf, the pure lane.log reader in dctr-lib.mjs, is pinned here too.

// A herdr-core terminal running the suite would hand every child its HC_TERMINAL_ID, and termHost would read herdr-core where a clause means a herdr TUI pane or no host.
delete process.env.HC_TERMINAL_ID
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { laneOf, LANE_LINE, RESUME_LINE, kickoffHandoff, followKickoff, shq, launchFlags } from './dctr-lib.mjs'
import { parseDoc } from './dctr-project.mjs'
import { restoreFile, modeFile } from './dctr-state.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const HERE = import.meta.dirname
const LANE = path.join(HERE, 'dctr-lane.mjs')
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-lane-')))
const childTmp = path.join(tmp, 't'); fs.mkdirSync(childTmp)
// Every child that reaches the mode file, and this process's modeFile, resolve under a scratch config dir, never the real one.
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'config')
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
// The restore file path of each pane id the shim makes, under the children's TMPDIR, where the restore hook writes it.
const RESTORE = (() => {
  const prev = process.env.TMPDIR, m = {}
  process.env.TMPDIR = childTmp
  for (let i = 1; i <= 9; i++) m[`p${i}`] = restoreFile(`p${i}`)
  if (prev === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prev
  return JSON.stringify(m)
})()
const cbin = path.join(tmp, 'cbin'); fs.mkdirSync(cbin)
// A PATH short enough that no launch line create could type nears herdr's 1,024-byte limit, whatever the host's PATH.
const SYS_PATH = [path.dirname(process.execPath), '/usr/bin', '/bin']
const SHORT_PATH = [cbin, bin, ...SYS_PATH].join(':')

// The herdr shim: a fresh pane reads agent_status unknown with no agent session; after each typing call it reads
// working for two reads and then idle with a session, s1 from the launch line on. /clear writes the pane's restore
// file (its path from HERDR_SHIM_RESTORE) naming s2 and the pane then holds s2; in mode late-restore the pane reads
// idle under s1 for three reads first, and in mode no-restore it never writes the file and keeps s1. A typed line over
// 1,024 bytes is refused, as herdr refuses it. HERDR_SHIM_MODE changes one answer per fixture, and HERDR_SHIM_CLOSE
// makes tab close fail (`fail`) or answer tab_not_found (`gone`); HERDR_SHIM_NOTAB answers tab create with no tab id;
// HERDR_SHIM_FAILRUN names a line whose pane run types it into the pane and then exits 1; HERDR_SHIM_ONCLOSE, a JSON
// argv, is run on each tab close before it answers, so a fixture can break the undo's next step. Every call is logged
// with what it answered, a typed line with the pane's session and its restore file's session when it was typed, and
// whether lane.log and the watched files existed at that moment.
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const dir = process.env.HERDR_SHIM_DIR, mode = process.env.HERDR_SHIM_MODE || 'normal'
const args = process.argv.slice(2)
const stFile = path.join(dir, 'state.json')
let st = { n: 0, panes: {} }
try { st = JSON.parse(fs.readFileSync(stFile, 'utf8')) } catch {}
let out = '', err = '', code = 0, read = null, session = null, made = null, at = null
const restoreOf = (id) => JSON.parse(process.env.HERDR_SHIM_RESTORE || '{}')[id]
const restored = (id) => { try { return JSON.parse(fs.readFileSync(restoreOf(id), 'utf8')).session_id } catch { return null } }
const clearTo = (id, p) => { const f = restoreOf(id); if (f) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ session_id: 's2', transcript_path: null })) } p.session = 's2' }
const watch = JSON.parse(process.env.HERDR_SHIM_WATCH || '[]').map((f) => fs.existsSync(f))
if (args[0] === 'tab' && args[1] === 'close' && process.env.HERDR_SHIM_ONCLOSE) { const [c, ...a] = JSON.parse(process.env.HERDR_SHIM_ONCLOSE); require('child_process').spawnSync(c, a, { stdio: 'ignore' }) }
if (args[0] === 'tab' && args[1] === 'create') {
  if (mode === 'tab-fail') { code = 1; err = 'transport down' }
  else { const id = 'p' + (++st.n); st.panes[id] = { typed: 0, busy: 0, session: null, late: 0 }; if (restoreOf(id)) fs.rmSync(restoreOf(id), { force: true }); made = { tab: 't' + st.n, pane: id }; out = JSON.stringify({ result: { ...(process.env.HERDR_SHIM_NOTAB ? {} : { tab: { tab_id: made.tab } }), root_pane: { pane_id: id } } }) }
} else if (args[0] === 'pane' && args[1] === 'get') {
  const p = st.panes[args[2]]
  if (mode === 'get-fail') { code = 1; err = 'transport down' }
  else if (mode === 'get-empty') out = ''
  else if (!p || mode === 'gone') { code = 1; err = JSON.stringify({ error: { code: 'pane_not_found' } }) }
  else {
    let status
    if (p.typed === 0) { status = ['agent-before', 'idle-before'].includes(mode) ? 'idle' : 'unknown'; session = ['agent-before', 'session-before'].includes(mode) ? 'old' : null }
    else if (p.late > 0) { if (--p.late === 0) clearTo(args[2], p); status = 'idle'; session = p.session }
    else if (p.busy > 0) { p.busy--; status = 'working'; session = p.session }
    else { status = mode === 'stuck-after' ? 'working' : 'idle'; session = p.session }
    read = status
    out = JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: status, agent_session: session ? { value: session } : null, focused: false } } })
  }
} else if (args[0] === 'pane' && args[1] === 'run') {
  const p = st.panes[args[2]], bytes = Buffer.byteLength(args[3] || '')
  if (bytes > 1024) { code = 1; err = 'herdr: the line is ' + bytes + ' bytes, over the 1024-byte limit' }
  else {
    if (p) {
      p.typed++; p.busy = 2
      if (p.typed === 1) p.session = 's1'
      if (args[3] === '/clear') { if (mode === 'late-restore') { p.busy = 0; p.late = 4 } else if (mode !== 'no-restore') clearTo(args[2], p) }
      at = { session: p.session, restore: restored(args[2]) }
    }
    if (process.env.HERDR_SHIM_FAILRUN === args[3]) { code = 1; err = 'herdr: timed out waiting for the reply' } // the line reached the pane first
    else out = JSON.stringify({ result: {} })
  }
} else if (args[0] === 'tab' && args[1] === 'close' && process.env.HERDR_SHIM_CLOSE === 'fail') { code = 1; err = 'transport down' }
else if (args[0] === 'tab' && args[1] === 'close' && process.env.HERDR_SHIM_CLOSE === 'gone') { code = 1; err = JSON.stringify({ error: { code: 'tab_not_found' } }) }
else out = JSON.stringify({ result: {} })
fs.writeFileSync(stFile, JSON.stringify(st))
fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ args, read, session, made, at, failed: code !== 0, laneLog: fs.existsSync(process.env.HERDR_SHIM_LANELOG || '/nonexistent'), watch }) + '\\n')
if (err) process.stderr.write(err + '\\n')
process.stdout.write(out)
process.exit(code)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
// The claude shim for the launch line: logs its argv, working directory and environment.
const claudeLog = path.join(tmp, 'claude.jsonl')
fs.writeFileSync(path.join(cbin, 'claude'), `#!/bin/sh
exec node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }) + "\\n")' ${JSON.stringify(claudeLog)} "$@"
`)
fs.chmodSync(path.join(cbin, 'claude'), 0o755)

const GIT_ENV = { GIT_CEILING_DIRECTORIES: tmp, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const git = (cwd, ...a) => {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const read = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return null } }
const sha = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') } catch { return null } }
const exists = (f) => fs.existsSync(f)
const append = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, text) }
const readBuf = (file) => { try { return fs.readFileSync(file) } catch { return Buffer.alloc(0) } }

const handoffText = (record, phase = 'a') => [`phase: \`${phase}\`, state: Open`, ...(record === null ? [] : [`record: \`${record}\``]), 'wrapper: doctrine-code', '', '# First handoff', 'Do the lane.', ''].join('\n')
const MEMORY = '# Session memory\n\n## Next Session Kickoff\nhandoff: none | state: none\n\n## Notes\nkept\n'
const PROJECT = `# Project: fixture
State: Proposed
Current epic: E1
Records: .doctrine/records

## End state
### ES1
- Outcome: lanes run
- Type: T1
- Check: run the lanes
- Control: no lane fails it
- Evidence: none yet
- Coverage: satisfy E1

## Epics
| ID | Title | Record |
|---|---|---|
| E1 | Lanes | docs/epics/E1.md |

## Rulings and returns
`
const OTHER = 'docs/other/a.md'
const EPIC = (member) => `# Epic E1: Lanes
State: Not started
Combined check: node run-all.mjs ; pass when it exits 0

## What this is
The lanes.

## Done means
### D1
- Outcome: lane a lands
- Type: T1
- Check: run lane a
- Control: a lane that does not land fails it
- Evidence: none yet
- Coverage: build-a: satisfy

## Members
- phase build-a: ${member}
- phase a: ${OTHER}

## Rulings and returns
### R1 ruling, 2026-11-08T00:00:00Z
Kind: baseline
Items: D1
By: owner
> approved
`

/** Every stderr dctr-lane.mjs printed to a clause, which the refusal-coverage clause reads. */
const SAID = []
let fixtureN = 0
/** An orchestrator repo: tracked memory file (unless `memory` is 'untracked' or 'ignored'), a .gitignore excluding
 *  its Records path, a tracked source file, a project file and epic, the first handoffs under docs/handoffs/ (not
 *  tracked), a run under Records with a model file per role. `branch` is the checkout's branch after the base. */
function fixture({ memory = 'tracked', branch = 'main', handoffs = { a: '.doctrine/records/a.md' }, orchRecord = false, rootName = '', runName = 'orchestrate' } = {}) {
  const root = path.join(tmp, `f${++fixtureN}${rootName}`)
  const repo = path.join(root, 'orch')
  fs.mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  write(path.join(repo, '.gitignore'), '.doctrine/records/\n.claude/\n' + (memory === 'ignored' ? 'SESSION_MEMORY.md\n' : ''))
  write(path.join(repo, 'src.txt'), 'source\n')
  write(path.join(repo, OTHER), '# another phase\n\n- State: Open\n')
  write(path.join(repo, 'docs/PROJECT.md'), PROJECT)
  write(path.join(repo, 'docs/epics/E1.md'), EPIC('.claude/worktrees/a/.doctrine/records/a.md'))
  if (memory === 'tracked') write(path.join(repo, 'SESSION_MEMORY.md'), MEMORY)
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base')
  const base = git(repo, 'rev-parse', 'HEAD').out
  if (branch !== 'main') git(repo, 'checkout', '-q', '-b', branch)
  for (const [role, rec] of Object.entries(handoffs)) write(path.join(repo, 'docs/handoffs', `${role}.md`), handoffText(rec, role))
  if (orchRecord) write(path.join(repo, '.doctrine/records/a.md'), '# the orchestrator\'s own a.md\n\n- State: Exited.\n')
  const run = path.join(repo, '.doctrine/records', runName)
  for (const role of ['a', 'b', 'c', 'merge']) write(path.join(run, 'model', role), 'claude-opus-5-5\n')
  const shim = path.join(root, 'shim'); fs.mkdirSync(shim)
  return { root, repo, base, run, shim, wt: (role) => path.join(repo, '.claude/worktrees', role), laneLog: path.join(run, 'lane.log') }
}

const lane = (f, args, { cwd = f.repo, env = {}, unset = [], timeout } = {}) => {
  const e = {
    ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp, DCTR_ROLE: 'orchestrator', DCTR_RUN: f.run,
    HERDR_ENV: '1', TERM_PROGRAM: 'herdr', HC_TERMINAL_ID: '', HERDR_WORKSPACE_ID: 'w1', HERDR_SHIM_DIR: f.shim, HERDR_SHIM_LANELOG: f.laneLog, CLAUDE_CONFIG_DIR: '/x',
    HERDR_SHIM_RESTORE: RESTORE, DCTR_LANE_TIMES: JSON.stringify({ poll: 5, ready: 1500 }), ...env,
  }
  for (const k of ['DCTR_VIEW_REQUEST_DIR', 'HERDR_PANE_ID', 'CLAUDE_PROJECT_DIR', 'DCTR_CALLER', ...unset]) if (!(k in env) || unset.includes(k)) delete e[k]
  const r = spawnSync('node', [LANE, ...args], { cwd, env: e, encoding: 'utf8', maxBuffer: Infinity, timeout })
  SAID.push(r.stderr || '')
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', env: e }
}
const shimLog = (f) => (read(path.join(f.shim, 'log.jsonl')) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const laneLines = (f) => (read(f.laneLog) || '').split('\n').filter(Boolean)
const handoffOf = (f, role = 'a') => path.join(f.repo, 'docs/handoffs', `${role}.md`)
const create = (f, role = 'a', opts = {}) => lane(f, ['create', role, f.repo, opts.base ?? f.base, opts.handoff ?? handoffOf(f, role)], opts)
const head = (dir) => git(dir, 'rev-parse', 'HEAD').out
const branches = (repo) => git(repo, 'branch', '--format=%(refname:short) %(objectname)').out.split('\n').filter(Boolean)
const commitIn = (dir, file, text, msg) => { write(path.join(dir, file), text); git(dir, 'add', file); git(dir, 'commit', '-qm', msg); return head(dir) }
const madeNothing = (f, role, r) => r.code !== 0 && r.err.trim().split('\n').length === 1 && r.err.startsWith('dctr-lane: refused, ') && !exists(f.wt(role)) && shimLog(f).length === 0 && laneLines(f).length === 0 &&
  !branches(f.repo).some((b) => b.startsWith(`${role} `))
const said = (r) => JSON.stringify((r.out + r.err).trim().slice(0, 300))

// ---------------------------------------------------------------- clause 2: create

const A = fixture()
const ra = create(A)
const wtA = A.wt('a')
const status = git(wtA, 'status', '--porcelain', '--untracked-files=all')
clause('clause 2a — create makes <repo>/.claude/worktrees/a on branch a at the base, clean apart from the copied first handoff (E15-D122)',
  ra.code === 0 && git(wtA, 'symbolic-ref', '--short', 'HEAD').out === 'a' && head(wtA) === A.base && status.out === '?? docs/handoffs/a.md',
  `exit ${ra.code} ${said(ra)}; status ${JSON.stringify(status.out)}`)
const kick = kickoffHandoff(read(path.join(wtA, 'SESSION_MEMORY.md')))
clause('clause 2b — the worktree holds a byte-identical copy of the first handoff and its memory file kickoff names it (E15-D151)',
  sha(path.join(wtA, 'docs/handoffs/a.md')) === sha(handoffOf(A)) && kick === 'docs/handoffs/a.md' &&
  read(path.join(wtA, 'SESSION_MEMORY.md')).includes('## Notes\nkept'),
  `kickoff ${kick}; memory ${JSON.stringify(read(path.join(wtA, 'SESSION_MEMORY.md')))}`)
const chainA = followKickoff({ projectDir: wtA, read: (x) => fs.readFileSync(x, 'utf8'), exists })
clause('clause 2c — create writes the role\'s record inside the worktree, holding the phase name and one State: Open line, so the kickoff chain from the worktree reaches it',
  chainA.recordPath === path.join(wtA, '.doctrine/records/a.md') && chainA.state === 'Open' && /^# a\b/m.test(read(chainA.recordPath) || '') &&
  (read(chainA.recordPath) || '').split('\n').filter((l) => /state:/i.test(l)).length === 1,
  `chain ${JSON.stringify(chainA.why || chainA.recordPath)}; record ${JSON.stringify(read(path.join(wtA, '.doctrine/records/a.md')))}`)
clause('clause 2d — create sets skip-worktree on the tracked memory file',
  git(wtA, 'ls-files', '-v', 'SESSION_MEMORY.md').out === 'S SESSION_MEMORY.md', git(wtA, 'ls-files', '-v', 'SESSION_MEMORY.md').out)

const logA = shimLog(A)
const tabs = logA.filter((e) => e.args[0] === 'tab' && e.args[1] === 'create')
const runs = logA.map((e, i) => ({ ...e, i })).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run')
const launchA = laneOf(read(A.laneLog), 'a')
const lastGet = (i) => logA.slice(0, i).reverse().find((e) => e.args[0] === 'pane' && e.args[1] === 'get')
clause('clause 2e — create makes one pane in its own tab with the worktree as its cwd, then types the launch line, /clear and RESUME_LINE into it in that order, once each (E15-D152, L4)',
  tabs.length === 1 && tabs[0].args.includes('--workspace') && tabs[0].args[tabs[0].args.indexOf('--cwd') + 1] === wtA &&
  runs.length === 3 && runs.every((e) => e.args[2] === 'p1') &&
  JSON.stringify(runs.map((e) => e.args[3])) === JSON.stringify([launchA?.launch, '/clear', RESUME_LINE]),
  JSON.stringify(logA.map((e) => e.args)))
clause('clause 2f — each typing call follows a pane get of that pane reading it ready: unknown with no agent session before the launch line, idle after it, the pane having read working between (E15-D152, L7)',
  runs.length === 3 && runs.map((e) => lastGet(e.i)).every((g, k) => g && g.args[2] === 'p1' && (k === 0 ? g.read === 'unknown' && g.session === null : g.read === 'idle')) &&
  logA.some((e) => e.read === 'working'),
  JSON.stringify(runs.map((e) => [lastGet(e.i)?.read, lastGet(e.i)?.session])))
clause('clause 2g — no herdr call is made before the worktree, handoff copy, record and kickoff exist, and lane.log is appended only after the last typing call (L8)',
  logA.length > 0 && logA.every((e) => e.watch.length === 0 || e.watch.every(Boolean)) && logA.every((e) => e.laneLog === false) && laneLines(A).length === 1,
  JSON.stringify(logA.map((e) => [e.watch, e.laneLog])))
const lineA = laneLines(A)[0] || ''
clause('clause 2h — the create line is `<time> <caller> create <role> <pane> <worktree> <launch line>`, and laneOf reads the pane and worktree back (L2, L3)',
  LANE_LINE.test(lineA) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z orchestrator create a p1 /.test(lineA) &&
  launchA?.pane === 'p1' && launchA.worktree === wtA && launchA.caller === 'orchestrator' && lineA.endsWith(` ${launchA.launch}`) && launchA.launch === `sh ${shq(path.join(A.run, 'launch/a.sh'))}`,
  JSON.stringify(lineA))

// The watch list for later creates: every git and file step's product, which the shim checks at its first call.
const WATCH = (f, role, rec = '.doctrine/records/a.md') => JSON.stringify([path.join(f.wt(role), 'docs/handoffs', `${role}.md`), path.join(f.wt(role), rec), path.join(f.wt(role), 'SESSION_MEMORY.md')])
const A2 = fixture()
create(A2, 'a', { env: { HERDR_SHIM_WATCH: WATCH(A2, 'a') } })
const log2 = shimLog(A2)
clause('clause 2i — at create\'s first herdr call the copied handoff, the record and the memory file all exist in the worktree (L8)',
  log2.length > 0 && log2[0].watch.length === 3 && log2[0].watch.every(Boolean), JSON.stringify(log2[0]))

// ---------------------------------------------------------------- clause 2: the launch line (E15-D126)

{
  const L = fixture()
  const pathVar = `${cbin}:${bin}:${process.env.PATH}`
  const r = create(L, 'a', { env: { PATH: pathVar, CLAUDE_CONFIG_DIR: '/x' } })
  const line = laneOf(read(L.laneLog), 'a')?.launch
  fs.rmSync(claudeLog, { force: true })
  spawnSync('env', ['-i', 'sh', '-c', line || 'false'], { encoding: 'utf8' })
  write(path.join(L.run, 'model/a'), 'claude-sonnet-5\n')
  spawnSync('env', ['-i', 'sh', '-c', line || 'false'], { encoding: 'utf8' })
  const entries = (read(claudeLog) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const [e1, e2] = entries
  const argv = (e) => JSON.stringify(e?.argv)
  const shown = `exit ${r.code} ${said(r)}; line ${JSON.stringify(line)}; entries ${JSON.stringify(entries.map((e) => [e.argv, e.cwd, e.env.DCTR_ROLE, e.env.DCTR_CALLER, e.env.DCTR_RUN, e.env.CLAUDE_CONFIG_DIR, e.env.TMPDIR]))}`
  clause('clause 2j — the recorded launch line, run under env -i, starts claude in the worktree with its role, caller, run, config dir /x, and the create call\'s PATH and TMPDIR (E15-D126)',
    r.code === 0 && entries.length >= 1 && fs.realpathSync(e1.cwd) === L.wt('a') &&
    e1.env.DCTR_ROLE === 'a' && e1.env.DCTR_CALLER === 'a' && e1.env.DCTR_RUN === L.run && e1.env.CLAUDE_CONFIG_DIR === '/x' &&
    e1.env.PATH === pathVar && e1.env.TMPDIR === childTmp, shown)
  clause('clause 2j2 — the same line, run again after the model file changes, starts claude on the model the file names when the line runs: claude-opus-5-5 first, claude-sonnet-5 second (E15-D219)',
    r.code === 0 && entries.length === 2 && argv(e1) === JSON.stringify(['--model', 'claude-opus-5-5']) && argv(e2) === JSON.stringify(['--model', 'claude-sonnet-5']), shown)
  fs.rmSync(claudeLog, { force: true })
  spawnSync('env', ['-i', 'sh', '-c', `${line || 'false'} --resume S-1`], { encoding: 'utf8' })
  const resumed = (read(claudeLog) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l).argv)
  clause('clause 2j3 — the same line with --resume and a session id after it, as wake-all\'s restart types it, starts claude with those two words last (L12)',
    r.code === 0 && JSON.stringify(resumed) === JSON.stringify([['--model', 'claude-sonnet-5', '--resume', 'S-1']]), JSON.stringify([line, resumed]))
}

// ---------------------------------------------------------------- clause 2: the permission mode, read when the launch file runs

{
  const FLAG = ['--permission-mode', 'bypassPermissions']
  // The words the fragment adds to a command, evaluated by sh as a launch file is, for a mode file holding `text`.
  const words = (text, name = 'mode') => {
    const file = path.join(tmp, `lf-${crypto.randomUUID()}`, name)
    if (text !== null) write(file, text)
    const r = spawnSync('sh', ['-c', `printf '%s\\n' x${launchFlags(file)}`], { encoding: 'utf8', cwd: tmp })
    return r.stdout.split('\n').filter(Boolean).slice(1)
  }
  const texts = ['bypassPermissions', 'bypassPermissions\n', 'default\n', 'acceptEdits\n', 'plan\n', '', ' bypassPermissions\n', 'bypassPermissions\nbypassPermissions\n',
    'BypassPermissions\n', 'bypassPermissions; touch injected\n', '$(touch injected)\n', '--permission-mode bypassPermissions\n', null]
  const got = texts.map((t) => words(t))
  const quoted = words('bypassPermissions\n', "it's a mode")
  clause('clause 1pm — launchFlags, evaluated by sh: the two words for a mode file reading bypassPermissions with or without its newline, none for every other mode, an empty, padded, doubled, differently cased or extended text, or no file; a path holding a quote still reads; nothing in the file runs; null gives the empty string',
    JSON.stringify(got) === JSON.stringify([FLAG, FLAG, ...Array(11).fill([])]) && JSON.stringify(quoted) === JSON.stringify(FLAG) &&
      !exists(path.join(tmp, 'injected')) && launchFlags(null) === '' && launchFlags('/m').startsWith(' '),
    JSON.stringify([got, quoted]))
  // A session's own cycle hook records its mode for its pane: a Stop carrying the mode, in the pane create runs from.
  // The hook and create share one scratch config dir, where the mode file lives.
  const pmCfg = path.join(tmp, 'pm-config')
  const CYCLE = path.join(HERE, 'dctr-cycle.mjs')
  const hookRun = (f, pane, mode) => spawnSync('node', [CYCLE], {
    cwd: f.repo, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'Stop', session_id: `pm-${path.basename(f.root)}`, transcript_path: path.join(f.root, 't.jsonl'), cwd: f.repo, permission_mode: mode, stop_hook_active: false, last_assistant_message: 'ok' }),
    env: { ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp, DCTR_ROLE: 'orchestrator', DCTR_CALLER: 'orchestrator', DCTR_RUN: f.run, HERDR_ENV: '1', TERM_PROGRAM: 'herdr', HC_TERMINAL_ID: '', HERDR_PANE_ID: pane, DCTR_VIEW_REQUEST_DIR: '', CLAUDE_PROJECT_DIR: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_CONFIG_DIR: pmCfg },
  })
  const launchRun = (f) => {
    fs.rmSync(claudeLog, { force: true })
    spawnSync('env', ['-i', 'sh', '-c', laneOf(read(f.laneLog), 'a')?.launch || 'false'], { encoding: 'utf8' })
    return (read(claudeLog) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l))[0]?.argv
  }
  // The pane's mode file under the scratch config dir, where the hook writes it and create reads it.
  const modeAt = (pane, cfg = pmCfg) => {
    const prev = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = cfg
    try { return read(modeFile(pane)) } finally { process.env.CLAUDE_CONFIG_DIR = prev }
  }
  const f = fixture(), pane = 'orch-pm1'
  const h1 = hookRun(f, pane, 'bypassPermissions'), m1 = modeAt(pane)
  const r = create(f, 'a', { env: { PATH: `${cbin}:${bin}:${process.env.PATH}`, HERDR_PANE_ID: pane, CLAUDE_CONFIG_DIR: pmCfg } })
  const file = read(path.join(f.run, 'launch/a.sh'))
  const a1 = launchRun(f)
  const h2 = hookRun(f, pane, 'default'), m2 = modeAt(pane)
  const a2 = launchRun(f), file2 = read(path.join(f.run, 'launch/a.sh'))
  clause('clause 2pm — a Stop carrying permission_mode bypassPermissions in the pane create runs from writes that pane\'s mode file, and the launch file create then writes starts claude with --permission-mode bypassPermissions',
    h1.status === 0 && m1 === 'bypassPermissions\n' && r.code === 0 && JSON.stringify(a1) === JSON.stringify(['--model', 'claude-opus-5-5', ...FLAG]),
    `hook ${JSON.stringify([h1.status, h1.stderr.trim()])}; mode ${JSON.stringify(m1)}; create ${r.code} ${said(r)}; launch ${JSON.stringify(file)}; argv ${JSON.stringify(a1)}`)
  clause('clause 2pm2 — after a later Stop in that session carrying default, the same launch file, run again unchanged, starts claude with no permission flag',
    h2.status === 0 && m2 === 'default\n' && file2 === file && JSON.stringify(a2) === JSON.stringify(['--model', 'claude-opus-5-5']),
    `mode ${JSON.stringify(m2)}; unchanged ${file2 === file}; argv ${JSON.stringify(a2)}`)
  const g = fixture(), gPane = 'orch-pm3', gCfg = path.join(tmp, 'pm-config-none')
  const rg = create(g, 'a', { env: { PATH: `${cbin}:${bin}:${process.env.PATH}`, HERDR_PANE_ID: gPane, CLAUDE_CONFIG_DIR: gCfg } })
  const a3 = launchRun(g)
  const u = fixture()
  const ru = create(u, 'a', { env: { PATH: `${cbin}:${bin}:${process.env.PATH}` } })
  const a4 = launchRun(u)
  clause('clause 2pm3 — with no mode file for its pane, its config dir not there, and with no HERDR_PANE_ID, the launch file create writes starts claude with no permission flag, and create makes no config dir',
    rg.code === 0 && !exists(gCfg) && JSON.stringify(a3) === JSON.stringify(['--model', 'claude-opus-5-5']) && ru.code === 0 && JSON.stringify(a4) === JSON.stringify(['--model', 'claude-opus-5-5']) &&
      !(read(path.join(u.run, 'launch/a.sh')) || '').includes('permission'),
    `${rg.code} ${said(rg)} ${JSON.stringify(a3)}; ${ru.code} ${said(ru)} ${JSON.stringify(a4)}`)
  clause('clause 3pm — without the command: no mode file exists for the 2pm3 pane, and the launch line\'s claude shim logs the argv it is handed',
    modeAt(gPane, gCfg) === null &&
      (() => { fs.rmSync(claudeLog, { force: true }); spawnSync(path.join(cbin, 'claude'), ['--model', 'm', '--permission-mode', 'p']); return JSON.stringify(JSON.parse(read(claudeLog) || '{}').argv) === '["--model","m","--permission-mode","p"]' })(),
    '')
}

// ---------------------------------------------------------------- clause 2: a PATH past herdr's line limit (E15-D251)

{
  const sys = SYS_PATH
  const pads = []
  while ([cbin, bin, ...pads].join(':').length < 1300) pads.push(`/nonexistent/lane-pad-${pads.length}-abcdefghijklmnop`)
  const shown = (r, line, e, typedLines) => `exit ${r.code} ${said(r)}; typed ${JSON.stringify(typedLines.map((t) => Buffer.byteLength(t.args[3])))} bytes; line ${JSON.stringify(line)}; claude ${JSON.stringify(e && [e.cwd, e.env.DCTR_ROLE, e.env.PATH])}`
  for (const [n, pathVar, what] of [['2am', [cbin, bin, ...pads, ...sys].join(':'), 'a PATH of more than 1,300 bytes'], ['2am2', SHORT_PATH, 'a short PATH, the known-good twin']]) {
    const f = fixture()
    const r = create(f, 'a', { env: { PATH: pathVar } })
    const typedLines = shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run')
    const line = laneOf(read(f.laneLog), 'a')?.launch
    fs.rmSync(claudeLog, { force: true })
    spawnSync('env', ['-i', 'sh', '-c', line || 'false'], { encoding: 'utf8' })
    const e = (read(claudeLog) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l))[0]
    clause(`clause ${n} — create with ${what}, under a herdr refusing a typed line over 1,024 bytes, exits 0 with its create line, types three lines none over 1,024 bytes, the first being the recorded launch line, which run under env -i starts claude in the worktree as role a with the create call's PATH (E15-D251)`,
      r.code === 0 && Boolean(line) && typedLines.length === 3 && typedLines.every((t) => Buffer.byteLength(t.args[3]) <= 1024 && t.at) && typedLines[0].args[3] === line &&
        Boolean(e) && fs.realpathSync(e.cwd) === f.wt('a') && e.env.DCTR_ROLE === 'a' && e.env.PATH === pathVar,
      shown(r, line, e, typedLines))
  }
  // Without the command: the long PATH alone is over 1,024 bytes, and the shim refuses a 1,025-byte line and types a 1,024-byte one.
  const dir = path.join(tmp, 'shim-limit'); fs.mkdirSync(dir)
  const sh = (...a) => spawnSync(path.join(bin, 'herdr'), a, { encoding: 'utf8', env: { ...process.env, HERDR_SHIM_DIR: dir } })
  sh('tab', 'create')
  const over = sh('pane', 'run', 'p1', 'x'.repeat(1025)), at = sh('pane', 'run', 'p1', 'x'.repeat(1024))
  clause('clause 3as — without the command, the 2am PATH is over 1,024 bytes, and the herdr shim refuses a 1,025-byte typed line and types a 1,024-byte one',
    Buffer.byteLength([cbin, bin, ...pads, ...sys].join(':')) > 1024 && over.status === 1 && /over the 1024-byte limit/.test(over.stderr) && at.status === 0,
    `over ${over.status} ${JSON.stringify(over.stderr)}; at ${at.status}`)
}

// ---------------------------------------------------------------- clause 2: a launch file rewritten while it runs (R1-N3)

{
  // A claude that appends a tail line to the file tail-target names, as a rewrite while sh still reads that file would.
  const tbin = path.join(tmp, 'tail-bin'), target = path.join(tmp, 'tail-target'); fs.mkdirSync(tbin)
  fs.writeFileSync(path.join(tbin, 'claude'), `#!/bin/sh\nf=$(/bin/cat ${shq(target)})\nprintf '\\n/usr/bin/touch %s\\n' "$f.tail" >> "$f"\n`)
  fs.chmodSync(path.join(tbin, 'claude'), 0o755)
  const runTail = (file, line) => { fs.writeFileSync(target, file); fs.rmSync(`${file}.tail`, { force: true }); const r = spawnSync('env', ['-i', 'sh', '-c', line], { encoding: 'utf8' }); return { code: r.status, tail: fs.existsSync(`${file}.tail`), grew: read(file) } }
  const f = fixture()
  const r = create(f, 'a', { env: { PATH: [tbin, bin, ...SYS_PATH].join(':') } })
  const line = laneOf(read(f.laneLog), 'a')?.launch, file = path.join(f.run, 'launch/a.sh')
  const got = r.code === 0 && line ? runTail(file, line) : null
  clause('clause 2am3 — the launch file create writes, appended to by the claude it starts, runs nothing after claude exits (R1-N3)',
    r.code === 0 && line === `sh ${shq(file)}` && got?.tail === false && /\/usr\/bin\/touch /.test(got.grew), `exit ${r.code} ${said(r)}; line ${JSON.stringify(line)}; ${JSON.stringify(got)}`)
  // Without the command: the same stub under a launch file written by hand, with and without exec.
  const dir = path.join(tmp, 'tail-proof'); fs.mkdirSync(dir)
  const plain = path.join(dir, 'plain.sh'), execd = path.join(dir, 'exec.sh')
  fs.writeFileSync(plain, `cd ${shq(dir)} && env PATH=${shq([tbin, ...SYS_PATH].join(':'))} claude\n`)
  fs.writeFileSync(execd, `cd ${shq(dir)} && exec env PATH=${shq([tbin, ...SYS_PATH].join(':'))} claude\n`)
  const p = runTail(plain, `sh ${shq(plain)}`), e = runTail(execd, `sh ${shq(execd)}`)
  clause('clause 3am3 — without the command, sh runs the line the stub appends to a launch file whose command has no exec, and not to one whose command is exec\'d',
    p.tail === true && e.tail === false && /\/usr\/bin\/touch /.test(e.grew), JSON.stringify([p, e]))
}

// ---------------------------------------------------------------- clause 2: RESUME_LINE waits for the session /clear started (E15-D252)

{
  const resumeAt = (f) => shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run' && e.args[3] === RESUME_LINE)
  const clears = (f) => shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run' && e.args[3] === '/clear')
  for (const [n, mode, what] of [['2an', 'late-restore', 'whose pane reads idle under the launch session for three reads after /clear before it writes its restore file and holds the new session'], ['2an2', 'normal', 'whose pane writes its restore file and holds the new session at /clear, the known-good twin']]) {
    const f = fixture()
    const r = create(f, 'a', { env: { HERDR_SHIM_MODE: mode, PATH: SHORT_PATH } })
    const res = resumeAt(f)
    clause(`clause ${n} — create ${what} exits 0 with its create line, types /clear and RESUME_LINE once each, and when RESUME_LINE is typed the restore file names s2, the session herdr reports, not the launch session s1 (E15-D252)`,
      r.code === 0 && laneLines(f).length === 1 && clears(f).length === 1 && res.length === 1 && res[0].at?.restore === 's2' && res[0].at.session === 's2',
      `exit ${r.code} ${said(r)}; at RESUME_LINE ${JSON.stringify(res.map((e) => e.at))}`)
  }
  // Without the command: the late pane reads idle under s1 with no restore file three times after /clear, then s2 with
  // its file; the no-restore pane never writes one; the normal pane writes it at /clear.
  const drive = (mode, reads) => {
    const dir = path.join(tmp, `shim-${mode}`); fs.mkdirSync(dir)
    const env = { ...process.env, HERDR_SHIM_DIR: dir, HERDR_SHIM_MODE: mode, HERDR_SHIM_RESTORE: JSON.stringify({ p1: path.join(dir, 'p1.restored') }) }
    const sh = (...a) => spawnSync(path.join(bin, 'herdr'), a, { encoding: 'utf8', env })
    sh('tab', 'create'); sh('pane', 'run', 'p1', 'launch'); sh('pane', 'get', 'p1'); sh('pane', 'get', 'p1'); sh('pane', 'run', 'p1', '/clear')
    const out = []
    for (let i = 0; i < reads; i++) { const g = JSON.parse(sh('pane', 'get', 'p1').stdout).result.pane; out.push([g.agent_status, g.agent_session?.value, read(path.join(dir, 'p1.restored')) && JSON.parse(read(path.join(dir, 'p1.restored'))).session_id]) }
    return JSON.stringify(out)
  }
  const late = drive('late-restore', 4), none = drive('no-restore', 6), normal = drive('normal', 3)
  clause('clause 3at — without the command, after /clear the late-restore shim pane reads idle s1 with no restore file three times and then idle s2 with a restore file naming s2, the no-restore pane reads s1 with no restore file throughout, and the normal pane names s2 from the first read',
    late === JSON.stringify([['idle', 's1', null], ['idle', 's1', null], ['idle', 's1', null], ['idle', 's2', 's2']]) &&
      none === JSON.stringify(Array(6).fill(['working', 's1', null]).map((x, i) => (i < 2 ? x : ['idle', 's1', null]))) &&
      normal === JSON.stringify([['working', 's2', 's2'], ['working', 's2', 's2'], ['idle', 's2', 's2']]),
    `late ${late}; none ${none}; normal ${normal}`)
}

// ---------------------------------------------------------------- clause 2: the first resume (E15-D160)

{
  const R = fixture({ orchRecord: true })
  const r = create(R)
  const pane = laneOf(read(R.laneLog), 'a')?.pane
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp, HERDR_ENV: '1', TERM_PROGRAM: 'herdr', HC_TERMINAL_ID: '', HERDR_PANE_ID: pane || 'none', HERDR_SHIM_DIR: R.shim }
  delete env.CLAUDE_PROJECT_DIR
  const before = shimLog(R).length
  const S = 'sess-first-resume'
  const restore = spawnSync('node', [path.join(HERE, 'dctr-restore.mjs')], { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'clear', session_id: S, transcript_path: path.join(tmp, 'S.jsonl'), cwd: R.wt('a') }), env, encoding: 'utf8' })
  let ctx = ''
  try { ctx = JSON.parse(restore.stdout).hookSpecificOutput.additionalContext } catch { /* none */ }
  const gate = spawnSync('node', [path.join(HERE, 'dctr-promptgate.mjs')], { input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: S, prompt: RESUME_LINE, cwd: R.wt('a') }), env, encoding: 'utf8' })
  clause('clause 2k — after create, the restore hook on /clear in the worktree injects from the worktree\'s own record and the prompt gate passes RESUME_LINE in that pane (E15-D160)',
    r.code === 0 && ctx.includes(path.join(R.wt('a'), '.doctrine/records/a.md')) && gate.status === 0 && gate.stdout === '' && shimLog(R).length === before,
    `create ${r.code}; restore ${JSON.stringify(restore.stdout || restore.stderr)}; gate ${JSON.stringify(gate.stdout)}`)
}

// ---------------------------------------------------------------- clause 2: the merge worktree (E15-D163)

{
  const M = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const tip = git(M.repo, 'rev-parse', 'main').out
  const r = lane(M, ['create', 'merge', M.repo, 'main', handoffOf(M, 'merge')])
  clause('clause 2l — create merge checks out the integration branch itself in the merge worktree, at its tip (E15-D163)',
    r.code === 0 && git(M.wt('merge'), 'symbolic-ref', '--short', 'HEAD').out === 'main' && head(M.wt('merge')) === tip,
    `exit ${r.code} ${said(r)}; ${git(M.wt('merge'), 'symbolic-ref', '--short', 'HEAD').out}`)
}

// ---------------------------------------------------------------- clause 2: reset (E15-D123, E15-D165, L9)

{
  const R = fixture()
  create(R)
  const w = R.wt('a')
  const old = commitIn(w, 'lane.txt', 'lane work\n', 'lane commit')
  const r = lane(R, ['reset', 'a', R.base])
  const side = branches(R.repo).find((b) => b.endsWith(` ${old}`) && !b.startsWith('a '))
  clause('clause 2m — reset moves the worktree to the revision and keeps its old HEAD on a side branch it names (E15-D123)',
    r.code === 0 && head(w) === R.base && Boolean(side) && r.out.includes(side.split(' ')[0]),
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(R.repo))}`)
  const lines = laneLines(R)
  clause('clause 2n — reset appends `<time> <caller> reset <role> <revision>` to lane.log, and laneOf still reads the create line',
    lines.length === 2 && LANE_LINE.test(lines[1]) && lines[1].split(' ').slice(1).join(' ') === `orchestrator reset a ${R.base}` && laneOf(lines.join('\n'), 'a')?.worktree === w,
    JSON.stringify(lines))
}

// The memory-file resets: m changes the tracked memory file, k leaves it; each lane resets twice (L9).
const MEM = fixture({ handoffs: { a: '.doctrine/records/a.md', b: '.doctrine/records/b.md' } })
git(MEM.repo, 'checkout', '-q', '-b', 'revs')
const memM = commitIn(MEM.repo, 'SESSION_MEMORY.md', '# Session memory at m\n\n## Next Session Kickoff\nhandoff: docs/handoffs/m.md | state: open\n', 'm')
git(MEM.repo, 'checkout', '-q', '-b', 'revk', MEM.base)
const memK = commitIn(MEM.repo, 'other.txt', 'k\n', 'k')
git(MEM.repo, 'checkout', '-q', 'main')
create(MEM, 'a'); create(MEM, 'b')
const kept = {}
for (const role of ['a', 'b']) {
  const w = MEM.wt(role)
  commitIn(w, `${role}.txt`, `${role}\n`, `${role} commit`)
  append(path.join(w, 'SESSION_MEMORY.md'), `\nlane ${role} line one\nlane ${role} line two\n`)
  kept[role] = readBuf(path.join(w, "SESSION_MEMORY.md"))
}
for (const [role, rev, what] of [['a', memM, 'changes'], ['b', memK, 'leaves']]) {
  const w = MEM.wt(role)
  for (const [k, target] of [['first', rev], ['second', MEM.base]]) {
    const r = lane(MEM, ['reset', role, target])
    clause(`clause 2o — ${k} reset of lane ${role} to a revision that ${k === 'first' ? what : 'restores'} the tracked memory file: exit 0, HEAD there, the memory file byte for byte, marked S (E15-D165, L9)`,
      r.code === 0 && head(w) === target && Buffer.compare(readBuf(path.join(w, "SESSION_MEMORY.md")), kept[role]) === 0 &&
      git(w, 'ls-files', '-v', 'SESSION_MEMORY.md').out === 'S SESSION_MEMORY.md',
      `exit ${r.code} ${said(r)}; head ${head(w)}; memory ${JSON.stringify(read(path.join(w, 'SESSION_MEMORY.md')))}; ls ${git(w, 'ls-files', '-v', 'SESSION_MEMORY.md').out}`)
  }
}

// Untracked and ignored memory files: the base does not track the path, u does.
const UNT = {}
for (const kind of ['untracked', 'ignored']) {
  const U = fixture({ memory: kind, handoffs: { c: '.doctrine/records/c.md' } })
  git(U.repo, 'checkout', '-q', '-b', 'revs')
  write(path.join(U.repo, 'SESSION_MEMORY.md'), '# memory tracked at u\n')
  git(U.repo, 'add', '-f', 'SESSION_MEMORY.md'); git(U.repo, 'commit', '-qm', 'u')
  const u = head(U.repo)
  const u2 = commitIn(U.repo, 'SESSION_MEMORY.md', '# memory tracked at u2\n', 'u2')
  git(U.repo, 'checkout', '-q', 'main')
  const rc = create(U, 'c')
  const w = U.wt('c')
  UNT[kind] = { U, u, u2, w }
  for (const [k, target] of [['first', u], ['second', u2], ['third', U.base]]) {
    append(path.join(w, 'SESSION_MEMORY.md'), `\nlane c line before the ${k} reset\n`)
    const copy = readBuf(path.join(w, 'SESSION_MEMORY.md'))
    const r = lane(U, ['reset', 'c', target])
    const lsv = git(w, 'ls-files', '-v', 'SESSION_MEMORY.md').out
    const to = { first: 'u, which tracks that path', second: 'u2, which changes the tracked file', third: 'the base again' }[k]
    clause(`clause 2p — ${k} reset of a lane whose memory file is ${kind} at the base, to ${to}: exit 0, HEAD there, the memory file byte for byte${k === 'third' ? '' : ', marked S'} (E15-D165, E15-D215, L9)`,
      rc.code === 0 && r.code === 0 && head(w) === target && Buffer.compare(readBuf(path.join(w, 'SESSION_MEMORY.md')), copy) === 0 && (k === 'third' ? lsv === '' : lsv === 'S SESSION_MEMORY.md'),
      `create ${rc.code} ${said(rc)}; exit ${r.code} ${said(r)}; head ${head(w)}; memory ${JSON.stringify(read(path.join(w, 'SESSION_MEMORY.md')))}; ls ${lsv}`)
  }
}

// ---------------------------------------------------------------- clause 2: archive and remove (E15-D61, D62, D124, D125)

/** A lane with one file of each kind: its record (ignored), a tracked unchanged handoff (committed), the memory file
 *  changed under skip-worktree, and an ignored evidence file beside the record. */
function seeded() {
  const f = fixture()
  create(f)
  const w = f.wt('a')
  git(w, 'add', 'docs/handoffs/a.md'); git(w, 'commit', '-qm', 'commit the handoff')
  append(path.join(w, 'SESSION_MEMORY.md'), '\nlane notes\n')
  write(path.join(w, '.doctrine/records/a/gate.out'), 'exit=0\n')
  append(path.join(w, '.doctrine/records/a.md'), '- round: 1 closed 2026-11-08T10:00:00Z at abc1234 blockers 0 alarm 0\n')
  const files = ['.doctrine/records/a.md', 'docs/handoffs/a.md', 'SESSION_MEMORY.md', '.doctrine/records/a/gate.out']
  return { f, w, files, lanes: path.join(f.repo, '.doctrine/records/lanes/a') }
}
const AR = seeded()
const rar = lane(AR.f, ['archive', 'a'])
const missing = AR.files.filter((x) => sha(path.join(AR.lanes, x)) !== sha(path.join(AR.w, x)) || !sha(path.join(AR.w, x)))
clause('clause 2q — archive copies the record, the tracked unchanged handoff, the skip-worktree memory file and the ignored evidence file into <Records>/lanes/a/ with equal sha256 (E15-D61, E15-D62)',
  rar.code === 0 && missing.length === 0, `exit ${rar.code} ${said(rar)}; missing ${JSON.stringify(missing)}`)
const epicAfterArchive = read(path.join(AR.f.repo, 'docs/epics/E1.md'))
const rrm = lane(AR.f, ['remove', 'a'])
const epicAfter = read(path.join(AR.f.repo, 'docs/epics/E1.md')) || ''
const member = /^- phase build-a: (\S+)$/m.exec(epicAfter)?.[1]
const chk = spawnSync('node', [path.join(HERE, 'dctr-project.mjs'), 'check', AR.f.repo], { encoding: 'utf8' })
clause('clause 2r — archive repoints the member whose path names the lane\'s record, phase build-a for lane a, at the archived record: after remove, that line names the record under lanes/a/, the file exists, the - phase a line is unchanged, and dctr-project.mjs check exits 0 (E15-D124)',
  epicAfterArchive !== EPIC('.claude/worktrees/a/.doctrine/records/a.md') && member === '.doctrine/records/lanes/a/.doctrine/records/a.md' &&
  exists(path.join(AR.f.repo, member)) && epicAfter.split('\n').includes(`- phase a: ${OTHER}`) && chk.status === 0,
  `member ${member}; epic ${JSON.stringify(epicAfter.split('\n').filter((l) => l.startsWith('- phase')))}; check ${chk.status} ${JSON.stringify(chk.stdout + chk.stderr)}`)
clause('clause 2s — remove of a lane unchanged since its archive exits 0 and the worktree is gone, its branch kept (E15-D125)',
  rrm.code === 0 && !exists(AR.w) && !git(AR.f.repo, 'worktree', 'list', '--porcelain').out.includes(AR.w) && branches(AR.f.repo).some((b) => b.startsWith('a ')),
  `exit ${rrm.code} ${said(rrm)}`)
const arLines = laneLines(AR.f)
clause('clause 2t — archive and remove each append their own line to lane.log',
  arLines.length === 3 && arLines.slice(1).every((l) => LANE_LINE.test(l)) && arLines[1].endsWith(' orchestrator archive a') && arLines[2].endsWith(' orchestrator remove a'),
  JSON.stringify(arLines))

// ---------------------------------------------------------------- clause 2: laneOf (L3)

{
  const t = ['2026-11-08T01:00:00Z orchestrator create a w1:p0 /r/.claude/worktrees/a cd /r/.claude/worktrees/a && env X=1 claude',
    '2026-11-08T02:00:00Z orchestrator remove a',
    '2026-11-08T03:00:00Z orchestrator create a w1:p1 /r/.claude/worktrees/a2 cd /r/.claude/worktrees/a2 && claude',
    '2026-11-08T04:00:00Z orchestrator reset a abc',
    '2026-11-08T05:00:00Z orchestrator archive a',
    '2026-11-08T06:00:00Z orchestrator create b w1:p2 /r/.claude/worktrees/b cd /r/.claude/worktrees/b && claude --b'].join('\n')
  const got = laneOf(t, 'a'), gotB = laneOf(t, 'b')
  clause('clause 2u — laneOf returns the role\'s LATEST create line whatever lines for it follow, with the launch line whole, another role\'s own fields, and null for a role with none (E15-D187, L3)',
    JSON.stringify(got) === JSON.stringify({ time: '2026-11-08T03:00:00Z', caller: 'orchestrator', role: 'a', pane: 'w1:p1', worktree: '/r/.claude/worktrees/a2', launch: 'cd /r/.claude/worktrees/a2 && claude' }) &&
    JSON.stringify(gotB) === JSON.stringify({ time: '2026-11-08T06:00:00Z', caller: 'orchestrator', role: 'b', pane: 'w1:p2', worktree: '/r/.claude/worktrees/b', launch: 'cd /r/.claude/worktrees/b && claude --b' }) &&
    laneOf(t, 'c') === null && laneOf('', 'a') === null,
    JSON.stringify([got, gotB, laneOf(t, 'c')]))
}

// ---------------------------------------------------------------- clause 1: refusals make nothing

for (const [n, env, unset, why] of [['1a', {}, ['DCTR_ROLE'], 'no DCTR_ROLE'], ['1b', { DCTR_ROLE: 'a' }, [], 'role a'], ['1c', { DCTR_ROLE: 'merge' }, [], 'role merge']]) {
  const f = fixture()
  const r = create(f, 'a', { env, unset })
  clause(`clause ${n} — create refuses unless runRole() is orchestrator (${why}), making nothing and calling herdr zero times (L5)`, madeNothing(f, 'a', r) && r.err.includes('only the orchestrator runs this'), `exit ${r.code} ${said(r)}`)
}
{
  const f = fixture()
  const r = create(f, 'a', { env: { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'views') } })
  clause('clause 1d — contained (DCTR_VIEW_REQUEST_DIR set), create refuses, making nothing and calling herdr zero times (L5)', madeNothing(f, 'a', r) && r.err.includes('a contained session makes no herdr pane'), `exit ${r.code} ${said(r)}`)
}
{
  // The measured herdr-core terminal: HC_TERMINAL_ID and TERM_PROGRAM=ghostty beside leaked HERDR_* (issue #108).
  const f = fixture()
  const env = { HC_TERMINAL_ID: 't17', TERM_PROGRAM: 'ghostty' }
  const r = create(f, 'a', { env })
  clause('clause 1d3 — in herdr-core with leaked HERDR_* variables, create refuses, making nothing and calling herdr zero times (#108)', madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
  clause('clause 3d3 — without the command, the 1d3 environment carries HC_TERMINAL_ID, TERM_PROGRAM=ghostty and the leaked HERDR_ENV and HERDR_WORKSPACE_ID',
    r.env.HC_TERMINAL_ID === 't17' && r.env.TERM_PROGRAM === 'ghostty' && r.env.HERDR_ENV === '1' && r.env.HERDR_WORKSPACE_ID === 'w1', JSON.stringify({ HC: r.env.HC_TERMINAL_ID, TP: r.env.TERM_PROGRAM, HE: r.env.HERDR_ENV, WS: r.env.HERDR_WORKSPACE_ID }))
}

// The caller's role (E15-D201) and the lane.log grammar (E15-D186), on one lane: after a real create, each of reset,
// archive and remove is run as role a and with no role, which must refuse, and then as the orchestrator, which must
// complete, so the role is the only thing that can have refused it.
{
  const f = fixture()
  const t0 = new Date().toISOString()
  const rc = lane(f, ['create', 'a', f.repo, f.base, handoffOf(f)], { env: { DCTR_CALLER: 'orchestrator' } })
  const refused = [], completed = []
  for (const args of [['reset', 'a', f.base], ['archive', 'a'], ['remove', 'a']]) {
    for (const [env, unset] of [[{ DCTR_ROLE: 'a' }, []], [{}, ['DCTR_ROLE']]]) {
      const ls = git(f.repo, 'worktree', 'list', '--porcelain').out, lines = laneLines(f).length, calls = shimLog(f).length
      const r = lane(f, args, { env, unset })
      refused.push({ args: args.join(' '), role: env.DCTR_ROLE ?? 'unset', ok: r.code !== 0 && git(f.repo, 'worktree', 'list', '--porcelain').out === ls && laneLines(f).length === lines && shimLog(f).length === calls })
    }
    const r = lane(f, args, { env: { DCTR_CALLER: 'orchestrator' } })
    completed.push({ args: args.join(' '), code: r.code })
  }
  for (const [env, unset] of [[{ DCTR_ROLE: 'a' }, []], [{}, ['DCTR_ROLE']]]) {
    const r = create(f, 'b', { env, unset })
    refused.push({ args: 'create b', role: env.DCTR_ROLE ?? 'unset', ok: r.code !== 0 && !exists(f.wt('b')) && laneLines(f).length === 4 })
  }
  const t1 = new Date().toISOString()
  clause('clause 1e — create, reset, archive and remove each refuse as role a and with no role, worktrees, lane.log and the herdr log unchanged, where each completes as the orchestrator (E15-D201)',
    rc.code === 0 && refused.every((x) => x.ok) && completed.every((x) => x.code === 0), JSON.stringify({ create: rc.code, refused, completed }))
  const lines = laneLines(f), pane = shimLog(f).find((e) => e.made)?.made.pane
  const fields = lines.map((l) => LANE_LINE.exec(l))
  const launch = lines[0]?.split(' ').slice(6).join(' ')
  clause('clause 2v — create, reset, archive and remove for lane a with DCTR_CALLER=orchestrator append exactly four lines in that order, each a UTC time ending Z inside the clause\'s run, orchestrator, its subcommand and a; the create line\'s next fields are the pane the shim made and the worktree, and the rest is the launch line (E15-D186, E15-D126)',
    lines.length === 4 && fields.every((m, k) => m && m[1] >= t0 && m[1] <= t1 && m[2] === 'orchestrator' && m[3] === ['create', 'reset', 'archive', 'remove'][k] && m[4].split(' ')[0] === 'a') &&
    lines[0].split(' ')[4] === pane && lines[0].split(' ')[5] === f.wt('a') && launch === `sh ${shq(path.join(f.run, 'launch/a.sh'))}` &&
    (read(path.join(f.run, 'launch/a.sh')) || '').startsWith(`cd '${f.wt('a')}' && exec env DCTR_ROLE='a' `) && (read(path.join(f.run, 'launch/a.sh')) || '').includes(' claude --model ') &&
    lines[1].endsWith(` reset a ${f.base}`) && lines[2].endsWith(' archive a') && lines[3].endsWith(' remove a'),
    JSON.stringify({ t0, t1, lines }))
}

// The contained posture (E15-D202): each subcommand with DCTR_VIEW_REQUEST_DIR set calls herdr zero times.
{
  const f = fixture({ handoffs: { a: '.doctrine/records/a.md', b: '.doctrine/records/b.md' } })
  create(f)
  const calls = shimLog(f).length
  const views = { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'views') }
  const rs = [create(f, 'b', { env: views }), lane(f, ['reset', 'a', f.base], { env: views }), lane(f, ['archive', 'a'], { env: views }), lane(f, ['remove', 'a'], { env: views })]
  clause('clause 1d2 — contained, create, reset, archive and remove call herdr zero times (E15-D202)',
    calls > 0 && shimLog(f).length === calls, `codes ${rs.map((r) => r.code)}; calls ${calls} -> ${shimLog(f).length}`)
}
for (const [n, rec, why, says] of [['1f', null, 'names no record', 'names no record'], ['1g', 'ABSOLUTE', 'names it by an absolute path, one inside the worktree', 'names its record by an absolute path'], ['1h', '../outside/a.md', 'names a path outside the worktree', 'names a record outside the worktree']]) {
  const f = fixture({ handoffs: { a: rec } })
  if (rec === 'ABSOLUTE') write(handoffOf(f), handoffText(path.join(f.wt('a'), '.doctrine/records/a.md')))
  const r = create(f)
  clause(`clause ${n} — create refuses a handoff that ${why}, making nothing`, madeNothing(f, 'a', r) && r.err.includes(says), `exit ${r.code} ${said(r)}`)
}
{
  const f = fixture()
  const bads = [['an unknown subcommand', ['move', 'a'], 'usage: create'], ['create with three arguments', ['create', 'a', f.repo, f.base], 'usage: create'], ['a base that is no commit', ['create', 'a', f.repo, 'no-such-rev', handoffOf(f)], 'no-such-rev is not a commit in'],
    ['a handoff that does not exist', ['create', 'a', f.repo, f.base, path.join(f.repo, 'docs/handoffs/none.md')], 'could not be read'], ['a role that is not a name', ['create', 'A b', f.repo, f.base, handoffOf(f)], 'is not a role name'],
    ['the role orchestrator', ['create', 'orchestrator', f.repo, f.base, handoffOf(f)], 'is not a role name'], ['a role that climbs out of .claude/worktrees', ['create', '../up', f.repo, f.base, handoffOf(f)], 'is not a role name']]
  for (const [why, args, says] of bads) {
    const r = lane(f, args)
    clause(`clause 1i — dctr-lane.mjs refuses ${why}, making nothing`, r.code !== 0 && r.err.trim().split('\n').length === 1 && r.err.startsWith('dctr-lane: refused, ') && r.err.includes(says) && !exists(path.join(f.repo, '.claude')) && shimLog(f).length === 0 && laneLines(f).length === 0, `exit ${r.code} ${said(r)}`)
  }
  const r = create(f, 'a', { unset: ['HERDR_WORKSPACE_ID'] })
  clause('clause 1j — create refuses with no herdr workspace, making nothing', madeNothing(f, 'a', r) && r.err.includes('no HERDR_WORKSPACE_ID'), `exit ${r.code} ${said(r)}`)
}
{
  const f = fixture()
  create(f)
  const lsBefore = git(f.repo, 'worktree', 'list', '--porcelain').out, logBefore = shimLog(f).length
  const r = create(f)
  clause('clause 1k — a second create of a role refuses, moving nothing and calling herdr zero times',
    r.code !== 0 && git(f.repo, 'worktree', 'list', '--porcelain').out === lsBefore && shimLog(f).length === logBefore && laneLines(f).length === 1, `exit ${r.code} ${said(r)}`)
}

// The held integration branch (E15-D167): one repo whose checkout holds main; two repos, the companion holding the run.
{
  const one = fixture({ handoffs: { merge: '.doctrine/records/merge.md' } })
  const before = git(one.repo, 'worktree', 'list', '--porcelain').out
  const r = lane(one, ['create', 'merge', one.repo, 'main', handoffOf(one, 'merge')])
  // git worktree add refuses a held branch itself, making nothing, so only the refusal's text tells this check from git's.
  clause('clause 1l — create merge refuses while the repo\'s own checkout holds the integration branch: worktrees unchanged, no herdr call, no lane.log line (E15-D167)',
    r.code !== 0 && r.err.includes(`a worktree of ${one.repo} holds main`) && git(one.repo, 'worktree', 'list', '--porcelain').out === before && shimLog(one).length === 0 && laneLines(one).length === 0, `exit ${r.code} ${said(r)}`)
  const comp = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const code = path.join(comp.root, 'code')
  git(comp.root, 'init', '-q', '-b', 'main', code); commitIn(code, 'x.txt', 'x\n', 'code base')
  const before2 = git(code, 'worktree', 'list', '--porcelain').out
  const r2 = lane(comp, ['create', 'merge', code, 'main', handoffOf(comp, 'merge')], { cwd: comp.repo })
  clause('clause 1m — create merge from a companion repo refuses while the code repo\'s primary checkout holds the integration branch (E15-D167)',
    r2.code !== 0 && r2.err.includes(`a worktree of ${code} holds main`) && git(code, 'worktree', 'list', '--porcelain').out === before2 && shimLog(comp).length === 0 && laneLines(comp).length === 0, `exit ${r2.code} ${said(r2)}`)
}

// The failed create before RESUME_LINE (L6, L7, E15-D266): it closes the tab its own tab create returned, removes the
// worktree, deletes the lane's branch and the launch file, names what failed and that it undid it, writes no lane.log
// line, and the same create then succeeds.
const tabCloses = (f) => shimLog(f).filter((e) => e.args[0] === 'tab' && e.args[1] === 'close').map((e) => e.args[2])
const madeTabs = (f) => shimLog(f).filter((e) => e.made).map((e) => e.made.tab)
/** `r` failed with one stderr line naming its cause (`cause` in it, else any text) and that it undid what it made, and
 *  the tab closes, worktree, branch, launch file and lane.log show the undo. */
const undone = (f, role, r, tabs, cause = '') => r.code === 1 && r.err.trim().split('\n').length === 1 &&
  new RegExp(`create failed, .*${cause.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}.*; undid what it made`).test(r.err) && /create failed, [^;]+; undid/.test(r.err) && (r.out + r.err).includes(f.wt(role)) &&
  !exists(f.wt(role)) && !branches(f.repo).some((b) => b.startsWith(`${role} `)) && !exists(path.join(f.run, 'launch', `${role}.sh`)) &&
  JSON.stringify(tabCloses(f)) === JSON.stringify(tabs) && laneLines(f).length === 0
/** The items of the failure line's `made ..., left in place` list, or none. */
const leftNamed = (r) => /(?:; |, so )made (.*), left in place, and lane\.log not written\s*$/.exec(r.err)?.[1].split(', ') ?? []
/** `r` failed in one line, wrote no lane.log line, and its left-in-place list names exactly the things `keys` picks
 *  (wt, branch, pane, launch), each spelt from the fixture and the shim's tab create, while on disk, in git and in the
 *  shim log exactly those are still there: the worktree, the role's branch, the pane whose tab no close took down, the
 *  launch file. */
const leftExactly = (f, role, r, keys) => {
  const pane = shimLog(f).find((e) => e.made)?.made.pane, script = path.join(f.run, 'launch', `${role}.sh`)
  const things = {
    wt: [`the worktree ${f.wt(role)}`, exists(f.wt(role))],
    branch: [`the branch ${role}`, branches(f.repo).some((b) => b.startsWith(`${role} `))],
    pane: [`the herdr pane ${pane}`, Boolean(pane) && !shimLog(f).some((e) => e.args[0] === 'tab' && e.args[1] === 'close' && !e.failed)],
    launch: [`the launch file ${script}`, exists(script)],
  }
  return r.code === 1 && r.err.trim().split('\n').length === 1 && laneLines(f).length === 0 &&
    JSON.stringify(leftNamed(r).sort()) === JSON.stringify(keys.map((k) => things[k][0]).sort()) &&
    Object.entries(things).every(([k, [, there]]) => there === keys.includes(k))
}
const oneLine = (r) => r.code === 1 && r.err.trim().split('\n').length === 1
/** Whether `s` holds `a` and, after it, `b`: literal text, so a path in either is matched whatever characters it holds. */
const inOrder = (s, a, b) => s.includes(a) && s.indexOf(b, s.indexOf(a) + a.length) >= 0
const FOR_LAUNCH = 'did not read ready for the launch line'
for (const [n, mode, typed, why, cause] of [['1n', 'get-fail', 0, 'pane get fails every read', FOR_LAUNCH], ['1o', 'get-empty', 0, 'pane get answers nothing', FOR_LAUNCH],
  ['1p', 'agent-before', 0, 'the new pane already reads an agent session', FOR_LAUNCH], ['1q', 'stuck-after', 1, 'the pane never reads ready after the launch line', 'did not read ready after the launch line'],
  ['1bd', 'session-before', 0, 'the new pane reads agent_status unknown and already holds an agent session', FOR_LAUNCH],
  ['1be', 'idle-before', 0, 'the new pane holds no agent session and reads idle, not unknown', FOR_LAUNCH],
  ['1bw', 'no-restore', 2, 'the pane never writes its restore file or holds a new session after /clear (E15-D252, E15-D266)', 'did not read ready after /clear']]) {
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: mode, PATH: SHORT_PATH } })
  const t = shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run').length
  clause(`clause ${n} — when ${why}, create exits 1 with one line naming that cause and the worktree, types ${typed} line${typed === 1 ? '' : 's'}, closes the tab it made, removes the worktree, branch a and the launch file, and writes no lane.log line (L6, L7, E15-D266)`,
    t === typed && undone(f, 'a', r, madeTabs(f), cause) && madeTabs(f).length === 1, `exit ${r.code} ${said(r)}; typed ${t}; closed ${JSON.stringify(tabCloses(f))} of ${JSON.stringify(madeTabs(f))}`)
  const again = create(f, 'a', { env: { PATH: SHORT_PATH } })
  clause(`clause ${n}2 — the same create of that role then succeeds and writes its create line (E15-D266)`, again.code === 0 && Boolean(laneOf(read(f.laneLog), 'a')), `exit ${again.code} ${said(again)}`)
}
// The failed create (E15-D203, D205, D220, D266): herdr fails tab create after the worktree is made, so no tab is
// closed; the worktree and branch are removed, and the same create, tab create answering, then succeeds.
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'tab-fail' } })
  const listed = git(f.repo, 'worktree', 'list', '--porcelain').out
  clause('clause 1r — a create whose tab create fails after the worktree is made appends no line to lane.log (E15-D203)', laneLines(f).length === 0 && !exists(f.laneLog), JSON.stringify(read(f.laneLog)))
  clause('clause 1r2 — it removes the worktree, which git worktree list no longer lists, and branch a, closing no tab, in one line naming tab create\'s error (E15-D266)', undone(f, 'a', r, [], 'transport down') && !listed.includes(`worktree ${f.wt('a')}\n`), `${said(r)} ${listed}`)
  clause('clause 1r3 — it exits non-zero (E15-D205)', r.code !== 0, `exit ${r.code}`)
  clause('clause 1r4 — its output names the worktree by its absolute path (E15-D220)', (r.out + r.err).includes(f.wt('a')), said(r))
  const again = create(f, 'a')
  clause('clause 1r5 — the same create of the role, tab create answering, then succeeds and writes its create line (E15-D266)',
    again.code === 0 && Boolean(laneOf(read(f.laneLog), 'a')), `exit ${again.code} ${said(again)}`)
}
// A failed create merge before RESUME_LINE removes its worktree and keeps the integration branch (E15-D266).
{
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const tip = git(f.repo, 'rev-parse', 'main').out
  const r = lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')], { env: { HERDR_SHIM_MODE: 'no-restore', PATH: SHORT_PATH } })
  clause('clause 1bx — a create merge whose /clear never takes closes its tab, removes its worktree and launch file, and keeps the branch main at its tip (E15-D266)',
    r.code === 1 && /undid what it made/.test(r.err) && !exists(f.wt('merge')) && !exists(path.join(f.run, 'launch', 'merge.sh')) &&
    git(f.repo, 'rev-parse', 'main').out === tip && JSON.stringify(tabCloses(f)) === JSON.stringify(madeTabs(f)) && laneLines(f).length === 0, `exit ${r.code} ${said(r)}`)
}
// A tab close that fails, other than the tab being gone, removes nothing: the session in the tab may hold the worktree.
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_CLOSE: 'fail', PATH: SHORT_PATH } })
  clause('clause 1by — when the undo\'s tab close fails, create exits 1 naming the tab, removes nothing and leaves the worktree, branch a and the launch file (E15-D266)',
    r.code === 1 && r.err.includes('could not be closed') && r.err.includes('left in place') && exists(f.wt('a')) && branches(f.repo).some((b) => b.startsWith('a ')) &&
    exists(path.join(f.run, 'launch', 'a.sh')) && tabCloses(f).length === 1 && laneLines(f).length === 0 && leftExactly(f, 'a', r, ['wt', 'branch', 'pane', 'launch']),
    `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
  const g = fixture()
  const rg = create(g, 'a', { env: { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_CLOSE: 'gone', PATH: SHORT_PATH } })
  clause('clause 1by2 — when the undo\'s tab close answers tab_not_found, create removes the worktree, branch a and the launch file (E15-D266)',
    undone(g, 'a', rg, madeTabs(g)), `exit ${rg.code} ${said(rg)}`)
  const n = fixture()
  const rn = create(n, 'a', { env: { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_NOTAB: '1', PATH: SHORT_PATH } })
  clause('clause 1by3 — when tab create answered a pane and no tab id, create closes nothing, removes nothing and names what it left (E15-D266)',
    rn.code === 1 && rn.err.includes('no tab id') && rn.err.includes('left in place') && exists(n.wt('a')) && branches(n.repo).some((b) => b.startsWith('a ')) &&
    exists(path.join(n.run, 'launch', 'a.sh')) && tabCloses(n).length === 0 && leftExactly(n, 'a', rn, ['wt', 'branch', 'pane', 'launch']),
    `exit ${rn.code} ${said(rn)}; named ${JSON.stringify(leftNamed(rn))}`)
  const noTab = spawnSync(path.join(bin, 'herdr'), ['tab', 'create'], { encoding: 'utf8', env: { ...process.env, HERDR_SHIM_DIR: fixture().shim, HERDR_SHIM_NOTAB: '1' } })
  clause('clause 3by3 — without the command, the shim\'s tab create under HERDR_SHIM_NOTAB answers a root pane and no tab',
    noTab.status === 0 && JSON.parse(noTab.stdout).result.root_pane?.pane_id && !JSON.parse(noTab.stdout).result.tab, noTab.stdout)
  const shim = (close) => spawnSync(path.join(bin, 'herdr'), ['tab', 'close', 't1'], { encoding: 'utf8', env: { ...process.env, HERDR_SHIM_DIR: fixture().shim, HERDR_SHIM_CLOSE: close } })
  const [cf, cg, cn] = ['fail', 'gone', ''].map(shim)
  clause('clause 3by — without the command, the shim\'s tab close exits 1 with no not-found code under close=fail, exits 1 with tab_not_found under close=gone, and exits 0 otherwise',
    cf.status === 1 && !cf.stderr.includes('not_found') && cg.status === 1 && cg.stderr.includes('"tab_not_found"') && cn.status === 0, JSON.stringify([cf.status, cf.stderr, cg.status, cg.stderr, cn.status]))
}
// A create that fails at or after the call typing RESUME_LINE leaves what it made (E15-D267): lane.log a directory.
{
  const f = fixture()
  fs.mkdirSync(f.laneLog, { recursive: true })
  const r = create(f, 'a', { env: { PATH: SHORT_PATH } })
  const pane = shimLog(f).find((e) => e.made)?.made.pane, script = path.join(f.run, 'launch', 'a.sh')
  const resumes = shimLog(f).filter((e) => e.args[1] === 'run' && e.args[3] === RESUME_LINE).length
  clause('clause 1bz — a create whose lane.log append fails after RESUME_LINE exits 1 naming the pane, the worktree and the launch file as left in place, closes no tab, and keeps the worktree, branch a and the launch file (E15-D267)',
    r.code === 1 && Boolean(pane) && [pane, f.wt('a'), script, 'left in place'].every((s) => r.err.includes(s)) && !r.err.includes('undid') &&
    resumes === 1 && tabCloses(f).length === 0 && exists(f.wt('a')) && branches(f.repo).some((b) => b.startsWith('a ')) && exists(script) &&
    leftExactly(f, 'a', r, ['wt', 'branch', 'pane', 'launch']), `exit ${r.code} ${said(r)}; RESUME_LINE typed ${resumes}; named ${JSON.stringify(leftNamed(r))}`)
  let code = null
  try { fs.appendFileSync(f.laneLog, 'x\n') } catch (e) { code = e.code }
  clause('clause 3bz — without the command, appending to a lane.log that is a directory fails (EISDIR)', code === 'EISDIR', String(code))
}
// A failed send of RESUME_LINE, the line having reached the pane, leaves what create made (E15-D267).
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_FAILRUN: RESUME_LINE, PATH: SHORT_PATH } })
  const pane = shimLog(f).find((e) => e.made)?.made.pane, script = path.join(f.run, 'launch', 'a.sh')
  const sends = shimLog(f).filter((e) => e.args[1] === 'run')
  clause('clause 1ca — a create whose send of RESUME_LINE reaches the pane and then fails exits 1 naming the pane, the worktree and the launch file as left in place, closes no tab, keeps the worktree, branch a and the launch file, and writes no lane.log line (E15-D267)',
    r.code === 1 && Boolean(pane) && [pane, f.wt('a'), script, 'left in place'].every((s) => r.err.includes(s)) && !r.err.includes('undid') &&
    sends.length === 3 && sends[2].args[3] === RESUME_LINE && sends[2].failed && tabCloses(f).length === 0 &&
    exists(f.wt('a')) && branches(f.repo).some((b) => b.startsWith('a ')) && exists(script) && laneLines(f).length === 0 && !exists(f.laneLog) &&
    leftExactly(f, 'a', r, ['wt', 'branch', 'pane', 'launch']),
    `exit ${r.code} ${said(r)}; sends ${JSON.stringify(sends.map((e) => [e.args[3]?.slice(0, 20), e.failed]))}; named ${JSON.stringify(leftNamed(r))}`)
  // Without the command: under the same variable the shim types the launch line and /clear with exit 0, and types RESUME_LINE into the pane (its count rises) and then exits 1.
  const g = fixture(), env = { ...process.env, HERDR_SHIM_DIR: g.shim, HERDR_SHIM_FAILRUN: RESUME_LINE }
  const call = (...a) => spawnSync(path.join(bin, 'herdr'), a, { encoding: 'utf8', env })
  const id = JSON.parse(call('tab', 'create').stdout).result.root_pane.pane_id
  const codes = ['sh x', '/clear', RESUME_LINE].map((l) => call('pane', 'run', id, l).status)
  const typedN = JSON.parse(read(path.join(g.shim, 'state.json'))).panes[id].typed
  clause('clause 3ca — without the command, the HERDR_SHIM_FAILRUN shim answers the launch line and /clear with exit 0 and RESUME_LINE with exit 1, after typing all three into the pane',
    JSON.stringify(codes) === '[0,0,1]' && typedN === 3, JSON.stringify({ codes, typedN }))
}
// An undo that stops at a later step: the tab close succeeds and the shim then breaks the worktree removal (a locked
// worktree), the branch deletion (a ref lock file) or the launch file's removal (a read-only launch directory). The
// line names each thing still there and nothing the undo removed.
const lockWt = (f, role) => ['git', '-C', f.repo, 'worktree', 'lock', f.wt(role)]
const lockRef = (f, role) => ['touch', path.join(f.repo, '.git/refs/heads', `${role}.lock`)]
const roLaunch = (f) => ['chmod', '555', path.join(f.run, 'launch')]
const undoStops = (role, onclose) => {
  const f = fixture({ branch: role === 'merge' ? 'orch' : 'main', handoffs: { [role]: `.doctrine/records/${role}.md` } })
  const r = lane(f, ['create', role, f.repo, role === 'merge' ? 'main' : f.base, handoffOf(f, role)],
    { env: { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_ONCLOSE: JSON.stringify(onclose(f, role)), PATH: SHORT_PATH } })
  return { f, r }
}
for (const [n, role, onclose, cause, keys, what] of [
  ['1cc', 'a', lockWt, 'the worktree could not be removed', ['wt', 'branch', 'launch'], 'the worktree cannot be removed, names the worktree, branch a and the launch file'],
  ['1cd', 'a', lockRef, 'the branch a could not be deleted', ['branch', 'launch'], 'branch a cannot be deleted, names branch a and the launch file'],
  ['1ce', 'a', roLaunch, 'the launch file could not be removed', ['launch'], 'the launch file cannot be removed, names the launch file'],
  ['1cf', 'merge', lockWt, 'the worktree could not be removed', ['wt', 'launch'], 'create merge\'s worktree cannot be removed, names the worktree and the launch file and no branch'],
  ['1cf2', 'merge', roLaunch, 'the launch file could not be removed', ['launch'], 'create merge\'s launch file cannot be removed, names the launch file and no branch']]) {
  const { f, r } = undoStops(role, onclose)
  clause(`clause ${n} — when, after the undo closed its tab, ${what} as left in place, and nothing it removed`,
    r.err.includes(cause) && tabCloses(f).length === 1 && leftExactly(f, role, r, keys), `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
  if (exists(path.join(f.run, 'launch'))) fs.chmodSync(path.join(f.run, 'launch'), 0o755)
}
// The other paths that leave something, for create merge: no branch is ever named.
const resumeFailed = (f) => shimLog(f).some((e) => e.args[1] === 'run' && e.args[3] === RESUME_LINE && e.failed)
for (const [n, env, keys, what, cause] of [
  ['1cf3', { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_CLOSE: 'fail' }, ['wt', 'pane', 'launch'], 'the undo\'s tab close fails', (f, r) => r.err.includes('could not be closed')],
  ['1cf4', { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_NOTAB: '1' }, ['wt', 'pane', 'launch'], 'tab create answered a pane and no tab id', (f, r) => r.err.includes('no tab id')],
  ['1cf5', { HERDR_SHIM_FAILRUN: RESUME_LINE }, ['wt', 'pane', 'launch'], 'the send of RESUME_LINE fails', (f, r) => resumeFailed(f) && !r.err.includes('undid')]]) {
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const r = lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')], { env: { ...env, PATH: SHORT_PATH } })
  clause(`clause ${n} — when ${what}, create merge names that cause and the worktree, the pane and the launch file as left in place, and no branch`,
    cause(f, r) && leftExactly(f, 'merge', r, keys), `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
}
// A wait that fails before the launch line or before /clear, with an undo that removes nothing: the launch file, written
// before the first wait, is named as left in place.
for (const [n, env, what, cause] of [
  ['1ck', { HERDR_SHIM_MODE: 'get-fail', HERDR_SHIM_CLOSE: 'fail' }, 'the pane never reads ready for the launch line and the undo\'s tab close fails', FOR_LAUNCH],
  ['1ck2', { HERDR_SHIM_MODE: 'stuck-after', HERDR_SHIM_NOTAB: '1' }, 'the pane never reads ready after the launch line and tab create answered no tab id', 'did not read ready after the launch line']]) {
  const f = fixture()
  const r = create(f, 'a', { env: { ...env, PATH: SHORT_PATH } })
  clause(`clause ${n} — when ${what}, create names that cause and the worktree, branch a, the pane and the launch file as left in place`,
    r.err.includes(cause) && leftExactly(f, 'a', r, ['wt', 'branch', 'pane', 'launch']), `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
}
// The tab already gone (tab_not_found) and the worktree then not removable: the pane is gone, so the line never names it.
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'no-restore', HERDR_SHIM_CLOSE: 'gone', HERDR_SHIM_ONCLOSE: JSON.stringify(lockWt(f, 'a')), PATH: SHORT_PATH } })
  const pane = shimLog(f).find((e) => e.made)?.made.pane, script = path.join(f.run, 'launch', 'a.sh')
  const want = [`the worktree ${f.wt('a')}`, 'the branch a', `the launch file ${script}`]
  clause('clause 1cl — when the undo\'s tab close answers tab_not_found and the worktree then cannot be removed, create names the worktree, branch a and the launch file as left in place and not the pane',
    oneLine(r) && r.err.includes('the worktree could not be removed') && Boolean(pane) && !r.err.includes(`the herdr pane ${pane}`) && JSON.stringify(leftNamed(r).sort()) === JSON.stringify(want.sort()) &&
    exists(f.wt('a')) && branches(f.repo).some((b) => b.startsWith('a ')) && exists(script) && tabCloses(f).length === 1 && laneLines(f).length === 0,
    `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
}
// Without the command: each injection, run by the shim's tab close, makes the step it targets fail, and the step
// succeeds once the injection is taken away.
{
  const f = fixture(), env = { ...process.env, ...GIT_ENV, HERDR_SHIM_DIR: f.shim }
  const close = (argv) => spawnSync(path.join(bin, 'herdr'), ['tab', 'close', 't1'], { encoding: 'utf8', env: { ...env, HERDR_SHIM_ONCLOSE: JSON.stringify(argv) } }).status
  git(f.repo, 'worktree', 'add', '-q', '-b', 'a', f.wt('a'), f.base)
  const c1 = close(lockWt(f, 'a')), rm1 = git(f.repo, 'worktree', 'remove', '--force', f.wt('a')).code, there1 = exists(f.wt('a'))
  git(f.repo, 'worktree', 'unlock', f.wt('a'))
  const rm2 = git(f.repo, 'worktree', 'remove', '--force', f.wt('a')).code
  clause('clause 3cc — without the command, a worktree the shim\'s tab close locked survives git worktree remove --force, which removes it once unlocked',
    c1 === 0 && rm1 !== 0 && there1 && rm2 === 0 && !exists(f.wt('a')), JSON.stringify({ c1, rm1, there1, rm2 }))
  const c2 = close(lockRef(f, 'a')), d1 = git(f.repo, 'branch', '-D', 'a').code, kept1 = branches(f.repo).some((b) => b.startsWith('a '))
  fs.rmSync(path.join(f.repo, '.git/refs/heads/a.lock'))
  const d2 = git(f.repo, 'branch', '-D', 'a').code
  clause('clause 3cd — without the command, a branch whose ref lock file the shim\'s tab close made survives git branch -D, which deletes it once the lock file is gone',
    c2 === 0 && d1 !== 0 && kept1 && d2 === 0 && !branches(f.repo).some((b) => b.startsWith('a ')), JSON.stringify({ c2, d1, kept1, d2 }))
  const script = path.join(f.run, 'launch', 'a.sh'); write(script, 'x\n')
  const c3 = close(roLaunch(f))
  let e1 = null; try { fs.rmSync(script, { force: true }) } catch (e) { e1 = e.code }
  const kept3 = exists(script)
  fs.chmodSync(path.dirname(script), 0o755)
  let e2 = null; try { fs.rmSync(script, { force: true }) } catch (e) { e2 = e.code }
  clause('clause 3ce — without the command, a launch file whose directory the shim\'s tab close made read-only survives fs.rmSync with force, which removes it once the directory is writable',
    c3 === 0 && Boolean(e1) && kept3 && e2 === null && !exists(script), JSON.stringify({ c3, e1, kept3, e2 }))
}
// A git worktree add that exits non-zero after making the worktree and the branch, as with a post-checkout hook that
// fails (git-lfs's, with git-lfs not on PATH), or after making the branch alone, as on a dangling link at the worktree
// path: create undoes what the add made, and only that, and the same create runs once the cause is gone.
const failHook = (f, body = 'echo post-checkout failed') => { const h = path.join(f.repo, '.git/hooks/post-checkout'); write(h, `#!/bin/sh\n${body}\nexit 1\n`); fs.chmodSync(h, 0o755); return h }
const LOCK_HOOK = 'git worktree lock "$PWD"'
const listed = (f, role) => git(f.repo, 'worktree', 'list', '--porcelain').out.includes(`worktree ${f.wt(role)}\n`)
{
  const f = fixture(), h = failHook(f)
  const r = create(f)
  clause('clause 1cg — a create whose git worktree add exits 1 after making the worktree and branch a exits 1 with one create failed line naming the add, removes the worktree and branch a, calls herdr zero times and writes no lane.log line',
    undone(f, 'a', r, [], 'git worktree add failed') && !r.err.includes('refused') && shimLog(f).length === 0 && !listed(f, 'a'), `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
  fs.rmSync(h)
  const again = create(f)
  clause('clause 1cg2 — with the hook gone, the same create succeeds and writes its create line', again.code === 0 && Boolean(laneOf(read(f.laneLog), 'a')), `exit ${again.code} ${said(again)}`)
}
{
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } }), h = failHook(f)
  const tip = git(f.repo, 'rev-parse', 'refs/heads/main').out
  const r = lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')])
  clause('clause 1ch — a create merge whose git worktree add exits 1 after making the worktree exits 1 with one create failed line, removes the worktree, names no branch, keeps main a branch at its tip, calls herdr zero times and writes no lane.log line',
    oneLine(r) && inOrder(r.err, 'create failed, git worktree add failed ', `; undid what it made (removed the worktree ${f.wt('merge')})`) && !r.err.includes('the branch') &&
    !exists(f.wt('merge')) && !listed(f, 'merge') && git(f.repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/main').out === tip && shimLog(f).length === 0 && laneLines(f).length === 0,
    `exit ${r.code} ${said(r)}`)
  fs.rmSync(h)
  const again = lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')])
  clause('clause 1ch2 — with the hook gone, the same create merge succeeds and writes its create line', again.code === 0 && Boolean(laneOf(read(f.laneLog), 'merge')), `exit ${again.code} ${said(again)}`)
}
for (const [n, role, keys, what] of [['1ci', 'a', ['wt', 'branch'], 'the worktree and branch a'], ['1ci2', 'merge', ['wt'], 'the worktree and no branch']]) {
  const f = fixture({ branch: role === 'merge' ? 'orch' : 'main', handoffs: { [role]: `.doctrine/records/${role}.md` } })
  failHook(f, LOCK_HOOK)
  const tip = git(f.repo, 'rev-parse', 'refs/heads/main').out
  const r = lane(f, ['create', role, f.repo, role === 'merge' ? 'main' : f.base, handoffOf(f, role)])
  clause(`clause ${n} — when git worktree add exits 1 after making a worktree its hook locked, create${role === 'merge' ? ' merge' : ''} cannot remove it and names ${what} as left in place, calling herdr zero times`,
    r.err.includes('git worktree add failed') && r.err.includes('the worktree could not be removed') && shimLog(f).length === 0 &&
    git(f.repo, 'rev-parse', 'refs/heads/main').out === tip && leftExactly(f, role, r, keys), `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}`)
}
{
  const f = fixture(), gone = path.join(f.root, 'gone')
  fs.mkdirSync(path.dirname(f.wt('a')), { recursive: true }); fs.symlinkSync(gone, f.wt('a'))
  const r = create(f)
  clause('clause 1cj — a create whose worktree path is a dangling link, where git worktree add makes branch a and then fails on the path, exits 1 with one create failed line, deletes branch a, leaves the link as it was and names no worktree',
    oneLine(r) && /create failed, git worktree add failed .*; undid what it made \(deleted the branch a\)/.test(r.err) && !r.err.includes('the worktree') &&
    fs.lstatSync(f.wt('a')).isSymbolicLink() && fs.readlinkSync(f.wt('a')) === gone && !branches(f.repo).some((b) => b.startsWith('a ')) && shimLog(f).length === 0 && laneLines(f).length === 0,
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
}
{
  const f = fixture(), dot = path.join(f.repo, '.claude')
  fs.mkdirSync(dot); fs.chmodSync(dot, 0o555)
  const r = create(f)
  fs.chmodSync(dot, 0o755)
  clause('clause 1cj2 — a create whose .claude directory is read-only, where git worktree add makes branch a and no worktree, exits 1 with one create failed line, deletes branch a and names no worktree',
    oneLine(r) && /create failed, git worktree add failed .*; undid what it made \(deleted the branch a\)/.test(r.err) && !r.err.includes('the worktree') &&
    !exists(f.wt('a')) && !branches(f.repo).some((b) => b.startsWith('a ')) && shimLog(f).length === 0 && laneLines(f).length === 0,
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
  const again = create(f)
  clause('clause 1cj3 — with the directory writable again, the same create succeeds and writes its create line', again.code === 0 && Boolean(laneOf(read(f.laneLog), 'a')), `exit ${again.code} ${said(again)}`)
}
// A worktree path create cannot read before the add (a .claude it cannot search, a worktrees that is a file): fs.existsSync
// reads both as absent, so only the read before the add meets them, and create refuses there, making nothing.
for (const [n, what, block, unblock] of [
  ['1cm', 'its .claude directory has no search permission', (f) => { fs.mkdirSync(path.join(f.repo, '.claude')); fs.chmodSync(path.join(f.repo, '.claude'), 0o000) }, (f) => fs.chmodSync(path.join(f.repo, '.claude'), 0o755)],
  ['1cn', 'its .claude/worktrees is a regular file', (f) => write(path.join(f.repo, '.claude/worktrees'), 'a file\n'), (f) => fs.rmSync(path.join(f.repo, '.claude/worktrees'))]]) {
  const f = fixture()
  block(f)
  const r = create(f)
  unblock(f)
  clause(`clause ${n} — a create where ${what} exits 1 with one line that starts dctr-lane: refused and names the worktree path, makes no branch a, calls herdr zero times and writes no lane.log line`,
    oneLine(r) && r.err.startsWith('dctr-lane: refused, ') && r.err.includes(f.wt('a')) && !branches(f.repo).some((b) => b.startsWith('a ')) && shimLog(f).length === 0 && laneLines(f).length === 0,
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
  const again = create(f)
  clause(`clause ${n}2 — with that undone, the same create succeeds and writes its create line`, again.code === 0 && Boolean(laneOf(read(f.laneLog), 'a')), `exit ${again.code} ${said(again)}`)
}
// A repo that already holds a branch named merge, at a commit of its own: create merge never makes that branch, so no
// path of it deletes or names it, whether its add fails or a later step does.
const withMergeBranch = () => {
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  git(f.repo, 'checkout', '-q', '-b', 'merge')
  const at = commitIn(f.repo, 'merge-only.txt', 'on merge\n', 'merge only')
  git(f.repo, 'checkout', '-q', 'orch')
  return { f, at, tip: git(f.repo, 'rev-parse', 'refs/heads/main').out }
}
const mergeKept = (m) => git(m.f.repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/merge').out === m.at && git(m.f.repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/main').out === m.tip
const createMerge = (f, env = {}) => lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')], { env: { ...env, PATH: SHORT_PATH } })
{
  const m = withMergeBranch(), h = failHook(m.f)
  const r = createMerge(m.f)
  clause('clause 1co — in a repo already holding a branch merge, a create merge whose git worktree add exits 1 after making the worktree names only the worktree as undone, never the branch merge, which stays at its commit, main at its tip',
    oneLine(r) && inOrder(r.err, 'create failed, git worktree add failed ', `; undid what it made (removed the worktree ${m.f.wt('merge')})`) && !r.err.includes('the branch merge') &&
    !exists(m.f.wt('merge')) && mergeKept(m) && shimLog(m.f).length === 0 && laneLines(m.f).length === 0, `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(m.f.repo))}`)
  fs.rmSync(h)
  const again = createMerge(m.f)
  clause('clause 1co2 — with the hook gone, create merge in that repo succeeds and the branch merge stays at its commit',
    again.code === 0 && Boolean(laneOf(read(m.f.laneLog), 'merge')) && mergeKept(m), `exit ${again.code} ${said(again)}; branches ${JSON.stringify(branches(m.f.repo))}`)
}
{
  const m = withMergeBranch()
  const r = createMerge(m.f, { HERDR_SHIM_MODE: 'no-restore' })
  const script = path.join(m.f.run, 'launch', 'merge.sh')
  clause('clause 1cp — in a repo already holding a branch merge, a create merge whose /clear never takes undoes the tab, the worktree and the launch file and nothing else, never naming the branch merge, which stays at its commit, main at its tip',
    oneLine(r) && r.err.includes(`; undid what it made (closed the tab ${madeTabs(m.f)[0]}, removed the worktree ${m.f.wt('merge')}, removed the launch file ${script})`) && !r.err.includes('the branch merge') &&
    !exists(m.f.wt('merge')) && !exists(script) && JSON.stringify(tabCloses(m.f)) === JSON.stringify(madeTabs(m.f)) && mergeKept(m) && laneLines(m.f).length === 0,
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(m.f.repo))}`)
  const again = createMerge(m.f)
  clause('clause 1cp2 — with /clear taking, create merge in that repo succeeds and the branch merge stays at its commit',
    again.code === 0 && Boolean(laneOf(read(m.f.laneLog), 'merge')) && mergeKept(m), `exit ${again.code} ${said(again)}; branches ${JSON.stringify(branches(m.f.repo))}`)
  const p = withMergeBranch()
  clause('clause 3co — without the command, that fixture holds a branch merge at its recorded commit, other than main\'s, and main is the separate ref refs/heads/main',
    git(p.f.repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/merge').out === p.at && p.at !== p.tip && git(p.f.repo, 'rev-parse', '--symbolic-full-name', 'main').out === 'refs/heads/main' &&
    branches(p.f.repo).some((b) => b.startsWith('merge ')) && !exists(p.f.wt('merge')), JSON.stringify({ at: p.at, tip: p.tip, branches: branches(p.f.repo) }))
}
// The same repo, create merge failing at or after RESUME_LINE: its left-in-place list is what it made, never that
// branch. leftExactly reads any branch merge as one create made, so the list and the disk are checked here directly.
for (const [n, what, setup, env] of [
  ['1cq', 'send of RESUME_LINE reaches the pane and then fails', () => {}, { HERDR_SHIM_FAILRUN: RESUME_LINE }],
  ['1cr', 'lane.log append fails after RESUME_LINE', (f) => fs.mkdirSync(f.laneLog, { recursive: true }), {}]]) {
  const m = withMergeBranch()
  setup(m.f)
  const r = createMerge(m.f, env)
  const pane = shimLog(m.f).find((e) => e.made)?.made.pane, script = path.join(m.f.run, 'launch', 'merge.sh')
  const resumes = shimLog(m.f).filter((e) => e.args[1] === 'run' && e.args[3] === RESUME_LINE).length
  const want = [`the worktree ${m.f.wt('merge')}`, `the herdr pane ${pane}`, `the launch file ${script}`]
  clause(`clause ${n} — in a repo already holding a branch merge, a create merge whose ${what} names exactly the worktree, the pane and the launch file as left in place, never the branch merge, closes no tab, keeps all three, and the branch merge stays at its commit, main at its tip`,
    oneLine(r) && Boolean(pane) && resumes === 1 && !r.err.includes('the branch merge') && !r.err.includes('undid') &&
    JSON.stringify(leftNamed(r).sort()) === JSON.stringify(want.sort()) && exists(m.f.wt('merge')) && exists(script) && tabCloses(m.f).length === 0 &&
    laneLines(m.f).length === 0 && mergeKept(m), `exit ${r.code} ${said(r)}; named ${JSON.stringify(leftNamed(r))}; branches ${JSON.stringify(branches(m.f.repo))}`)
}
// Without the command: each fixture's git worktree add alone exits non-zero and leaves what the clauses above say it made.
{
  const has = (f, b) => branches(f.repo).some((x) => x.startsWith(`${b} `))
  const f = fixture(); failHook(f)
  const add = git(f.repo, 'worktree', 'add', '--quiet', '-b', 'a', f.wt('a'), f.base)
  clause('clause 3cg — without the command, git worktree add -b a in a repo whose post-checkout hook exits 1 exits non-zero and leaves the worktree, listed, and branch a',
    add.code !== 0 && exists(f.wt('a')) && listed(f, 'a') && has(f, 'a'), JSON.stringify(add))
  const g = fixture({ branch: 'orch' }); failHook(g)
  const tip = git(g.repo, 'rev-parse', 'refs/heads/main').out
  const addM = git(g.repo, 'worktree', 'add', '--quiet', g.wt('merge'), 'main')
  clause('clause 3ch — without the command, git worktree add of main in that fixture exits non-zero and leaves the worktree, listed, and main at its tip',
    addM.code !== 0 && exists(g.wt('merge')) && listed(g, 'merge') && git(g.repo, 'rev-parse', 'refs/heads/main').out === tip, JSON.stringify(addM))
  const l = fixture(); failHook(l, LOCK_HOOK)
  const addL = git(l.repo, 'worktree', 'add', '--quiet', '-b', 'a', l.wt('a'), l.base), rmL = git(l.repo, 'worktree', 'remove', '--force', l.wt('a'))
  clause('clause 3ci — without the command, under the locking hook git worktree add exits non-zero and git worktree remove --force then fails, the worktree and branch a still there',
    addL.code !== 0 && rmL.code !== 0 && exists(l.wt('a')) && has(l, 'a'), JSON.stringify({ addL, rmL }))
  const d = fixture(), gone = path.join(d.root, 'gone')
  fs.mkdirSync(path.dirname(d.wt('a')), { recursive: true }); fs.symlinkSync(gone, d.wt('a'))
  const addD = git(d.repo, 'worktree', 'add', '--quiet', '-b', 'a', d.wt('a'), d.base)
  clause('clause 3cj — without the command, git worktree add -b a onto a dangling link exits non-zero, makes branch a and leaves the link as it was',
    addD.code !== 0 && has(d, 'a') && fs.lstatSync(d.wt('a')).isSymbolicLink() && fs.readlinkSync(d.wt('a')) === gone && !exists(d.wt('a')), JSON.stringify(addD))
  const o = fixture(), dot = path.join(o.repo, '.claude')
  fs.mkdirSync(dot); fs.chmodSync(dot, 0o555)
  const addO = git(o.repo, 'worktree', 'add', '--quiet', '-b', 'a', o.wt('a'), o.base)
  fs.chmodSync(dot, 0o755)
  for (const [n, code, block] of [['3cm', 'EACCES', (f) => { fs.mkdirSync(path.join(f.repo, '.claude')); fs.chmodSync(path.join(f.repo, '.claude'), 0o000) }],
    ['3cn', 'ENOTDIR', (f) => write(path.join(f.repo, '.claude/worktrees'), 'a file\n')]]) {
    const q = fixture()
    block(q)
    let thrown = null; try { fs.lstatSync(q.wt('a'), { throwIfNoEntry: false }) } catch (e) { thrown = e.code }
    const seen = fs.existsSync(q.wt('a'))
    fs.chmodSync(path.join(q.repo, '.claude'), 0o755)
    clause(`clause ${n} — without the command, fs.lstatSync of the worktree path in that fixture throws ${code} while fs.existsSync reads it as absent`, thrown === code && seen === false, JSON.stringify({ thrown, seen }))
  }
  clause('clause 3cj2 — without the command, git worktree add -b a under a read-only .claude directory exits non-zero, makes branch a and no worktree',
    addO.code !== 0 && has(o, 'a') && !fs.lstatSync(o.wt('a'), { throwIfNoEntry: false }) && !listed(o, 'a'), JSON.stringify(addO))
}
// DCTR_LANE_TIMES overrides poll and ready (E15-D266): a pane that never reads ready after /clear is read once per
// poll from the first read until ready ms have passed, ready/poll + 1 reads, and each setting gives its own count.
{
  const reads = (times) => {
    const f = fixture()
    // the timeout ends a run whose wait ignores ready, which would otherwise poll for the five-minute default
    const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'no-restore', PATH: SHORT_PATH, DCTR_LANE_TIMES: JSON.stringify(times) }, timeout: 60000 })
    const log = shimLog(f), at = log.findIndex((e) => e.args[1] === 'run' && e.args[3] === '/clear')
    return { code: r.code, gets: log.slice(at + 1).filter((e) => e.args[1] === 'get').length, said: r.err.trim().slice(0, 200) }
  }
  const a = reads({ poll: 40, ready: 400 }), b = reads({ poll: 150, ready: 600 })
  clause('clause 1cb — DCTR_LANE_TIMES sets poll and ready: after /clear create reads the pane 11 times at poll 40 ready 400 and 5 times at poll 150 ready 600, then fails naming that ready (E15-D266)',
    a.code === 1 && a.gets === 11 && a.said.includes('within 400ms') && b.code === 1 && b.gets === 5 && b.said.includes('within 600ms'), JSON.stringify({ a, b }))
}

// Tabs (E15-D200): the merge session and a lane, each in a tab of its own, no pane split.
{
  const f = fixture({ branch: 'orch', handoffs: { a: '.doctrine/records/a.md', merge: '.doctrine/records/merge.md' } })
  const rm = lane(f, ['create', 'merge', f.repo, 'main', handoffOf(f, 'merge')]), ra = create(f)
  const log = shimLog(f), made = log.filter((e) => e.made).map((e) => e.made)
  const tabOf = (role) => made.find((m) => m.pane === laneOf(read(f.laneLog), role)?.pane)?.tab
  clause('clause 2w — create merge and create a each make one tab create call and no pane split, and the two panes sit in two different tabs (E15-D200, L4)',
    rm.code === 0 && ra.code === 0 && log.filter((e) => e.args[0] === 'tab' && e.args[1] === 'create').length === 2 && !log.some((e) => e.args[0] === 'pane' && e.args[1] === 'split') &&
    Boolean(tabOf('merge')) && Boolean(tabOf('a')) && tabOf('merge') !== tabOf('a'), JSON.stringify(log.map((e) => [e.args.slice(0, 3), e.made])))
}

{
  const f = fixture({ handoffs: { a: 'src.txt/a.md' } })
  const r = create(f)
  clause('clause 1s — a create whose record cannot be written after the worktree is made calls herdr zero times, names the worktree, removes it and branch a, and writes no lane.log line (L6, L8, E15-D266)',
    shimLog(f).length === 0 && undone(f, 'a', r, []), `exit ${r.code} ${said(r)}`)
}

// The dirty reset (E15-D165).
{
  const f = fixture()
  create(f)
  const w = f.wt('a')
  const c = commitIn(w, 'lane.txt', 'lane\n', 'lane commit')
  append(path.join(w, 'src.txt'), 'uncommitted\n')
  const before = branches(f.repo)
  const r = lane(f, ['reset', 'a', f.base])
  clause('clause 1t — reset refuses while a tracked file other than the memory file is modified: HEAD unmoved, the change kept, no new branch, no lane.log line (E15-D165)',
    r.code !== 0 && head(w) === c && read(path.join(w, 'src.txt')) === 'source\nuncommitted\n' && JSON.stringify(branches(f.repo)) === JSON.stringify(before) && laneLines(f).length === 1,
    `exit ${r.code} ${said(r)}; head ${head(w)}`)
  const none = lane(f, ['reset', 'b', f.base])
  const arc = lane(f, ['archive', 'b']), rem = lane(f, ['remove', 'b'])
  clause('clause 1u — reset, archive and remove refuse a role with no create line', none.code !== 0 && arc.code !== 0 && rem.code !== 0 && laneLines(f).length === 1, `${none.code} ${arc.code} ${rem.code}`)
  const early = lane(f, ['remove', 'a'])
  clause('clause 1v — remove refuses a lane never archived, the worktree kept', early.code !== 0 && exists(w) && laneLines(f).length === 1, `exit ${early.code} ${said(early)}`)
}

// The remove twins (E15-D125): changed evidence, changed memory file, each after the archive with no commit.
const TWINS = {}
for (const [n, file, why] of [['1w', '.doctrine/records/a/gate.out', 'ignored evidence file gains a line'], ['1x', 'SESSION_MEMORY.md', 'skip-worktree memory file changes']]) {
  const s = seeded()
  lane(s.f, ['archive', 'a'])
  append(path.join(s.w, file), 'written after the archive\n')
  TWINS[n] = { s, file }
  const r = lane(s.f, ['remove', 'a'])
  clause(`clause ${n} — remove refuses a lane whose ${why} after its archive, the worktree still there (E15-D125)`,
    r.code !== 0 && exists(s.w) && laneLines(s.f).length === 2, `exit ${r.code} ${said(r)}`)
}
{
  const s = seeded()
  lane(s.f, ['archive', 'a'])
  write(path.join(s.w, 'new-source.txt'), 'never committed\n')
  const r = lane(s.f, ['remove', 'a'])
  clause('clause 1y — remove refuses a lane holding an untracked file the archive does not hold, the worktree still there',
    r.code !== 0 && exists(path.join(s.w, 'new-source.txt')), `exit ${r.code} ${said(r)}`)
}
// Files git status cannot show (LR2): an ignored file outside the record's directory, and a tracked file hidden by
// skip-worktree, each written after the archive.
const HIDDEN = {}
for (const [n, file, why, prep] of [['1y2', '.claude/scratch.txt', 'an ignored file outside its record\'s directory', null],
  ['1y3', 'src.txt', 'a tracked file hidden by skip-worktree', (w) => git(w, 'update-index', '--skip-worktree', 'src.txt')],
  ['1y4', 'aSESSION_MEMORY.md', 'a tracked aSESSION_MEMORY.md, a name ending in the memory file\'s', (w) => commitIn(w, 'aSESSION_MEMORY.md', 'v1\n', 'track it')]]) {
  const s = seeded()
  if (prep) prep(s.w)
  lane(s.f, ['archive', 'a'])
  append(path.join(s.w, file), 'written after the archive\n')
  HIDDEN[n] = { s, file, st: git(s.w, 'status', '--porcelain', '--untracked-files=all').out }
  const r = lane(s.f, ['remove', 'a'])
  clause(`clause ${n} — remove refuses a lane holding ${why}, written after its archive, the worktree still there`,
    r.code !== 0 && exists(path.join(s.w, file)) && laneLines(s.f).length === 2, `exit ${r.code} ${said(r)}`)
}

// Uncommitted changes to tracked files, made before the archive, which a merge of the kept branch would lack (L1).
for (const [n, why, change, kept] of [
  ['1y5', 'a modified tracked src.txt', (w) => append(path.join(w, 'src.txt'), 'uncommitted\n'), (w) => read(path.join(w, 'src.txt')) === 'source\nuncommitted\n'],
  ['1y6', 'a deleted tracked src.txt', (w) => fs.rmSync(path.join(w, 'src.txt')), (w) => !exists(path.join(w, 'src.txt'))],
  ['1y7', 'a src.txt change skip-worktree hides', (w) => { git(w, 'update-index', '--skip-worktree', 'src.txt'); append(path.join(w, 'src.txt'), 'hidden\n') }, (w) => read(path.join(w, 'src.txt')) === 'source\nhidden\n']]) {
  const s = seeded()
  change(s.w)
  const ra = lane(s.f, ['archive', 'a'])
  const r = lane(s.f, ['remove', 'a'])
  clause(`clause ${n} — remove refuses a lane holding ${why}, uncommitted before its archive, the worktree and the change kept (L1)`,
    ra.code === 0 && r.code !== 0 && /dctr-lane: refused/.test(r.err) && exists(s.w) && kept(s.w) && laneLines(s.f).length === 2, `archive ${ra.code}; remove ${r.code} ${said(r)}`)
}

// A lane whose listings run past execFileSync's default 1 MB buffer (S3): 6000 untracked files with 200-character names.
const BULK = Array.from({ length: 6000 }, (_, i) => `bulk/${'x'.repeat(190)}${String(i).padStart(5, '0')}.txt`)
{
  const f = fixture()
  create(f)
  const w = f.wt('a')
  for (const b of BULK) write(path.join(w, b), 'bulk\n')
  const rs = lane(f, ['reset', 'a', f.base]), ra = lane(f, ['archive', 'a']), rr = lane(f, ['remove', 'a'])
  clause('clause 2z — reset, archive and remove of a lane listing more than 1 MB of names each exit 0, every file archived (S3)',
    rs.code === 0 && ra.code === 0 && rr.code === 0 && !exists(w) && BULK.every((b) => read(path.join(f.repo, '.doctrine/records/lanes/a', b)) === 'bulk\n'),
    `reset ${rs.code} ${said(rs)}; archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
}

// Refused calls write no lane.log line (E15-D207), on one lane.
{
  const f = fixture()
  write(path.join(f.repo, 'docs/handoffs/norecord.md'), handoffText(null))
  const counts = []
  const count = (what, run) => { const before = laneLines(f).length; const r = run(); counts.push({ what, code: r.code, before, after: laneLines(f).length }) }
  count('create a, handoff naming no record', () => create(f, 'a', { handoff: path.join(f.repo, 'docs/handoffs/norecord.md') }))
  create(f)
  const w = f.wt('a')
  write(path.join(w, '.doctrine/records/a/gate.out'), 'exit=0\n')
  lane(f, ['archive', 'a'])
  append(path.join(w, 'src.txt'), 'uncommitted\n')
  count('reset a with a tracked file modified', () => lane(f, ['reset', 'a', f.base]))
  git(w, 'checkout', '--', 'src.txt')
  append(path.join(w, '.doctrine/records/a/gate.out'), 'after the archive\n')
  count('remove a after its evidence gained a line', () => lane(f, ['remove', 'a']))
  count('create b as role a', () => create(f, 'b', { env: { DCTR_ROLE: 'a' } }))
  clause('clause 1z — each refused call exits non-zero and leaves lane.log\'s line count unchanged (E15-D207)',
    counts.length === 4 && counts.every((c) => c.code !== 0 && c.after === c.before) && laneLines(f).length === 2, JSON.stringify(counts))
}

let MISSING
// A lane whose record does not exist: archive refuses before it copies or repoints, and remove refuses.
{
  const s = seeded()
  const epic = read(path.join(s.f.repo, 'docs/epics/E1.md'))
  fs.rmSync(path.join(s.w, '.doctrine/records/a.md'))
  const r = lane(s.f, ['archive', 'a'])
  clause('clause 1aa — archive refuses a lane whose record does not exist: nothing copied, the epic unchanged, no lane.log line',
    r.code !== 0 && !exists(s.lanes) && read(path.join(s.f.repo, 'docs/epics/E1.md')) === epic && laneLines(s.f).length === 1, `exit ${r.code} ${said(r)}`)
  const t = seeded()
  lane(t.f, ['archive', 'a'])
  fs.rmSync(path.join(t.w, '.doctrine/records/a.md'))
  const kick = kickoffHandoff(read(path.join(t.w, 'SESSION_MEMORY.md')))
  MISSING = kick === 'docs/handoffs/a.md' && /^record: `\.doctrine\/records\/a\.md`$/m.test(read(path.join(t.w, kick)) || '') && !exists(path.join(t.w, '.doctrine/records/a.md')) &&
    exists(path.join(t.lanes, '.doctrine/records/a.md'))
  const rr = lane(t.f, ['remove', 'a'])
  clause('clause 1ab — remove refuses a lane whose record was deleted after its archive, the worktree kept', rr.code !== 0 && exists(t.w) && laneLines(t.f).length === 2, `exit ${rr.code} ${said(rr)}`)
}

// An existing path at the worktree with no branch: git would make the branch and then refuse the path.
{
  const f = fixture()
  write(path.join(f.wt('a'), 'stray.txt'), 'stray\n')
  const r = create(f)
  clause('clause 1ac — create refuses when the worktree path already exists, in one dctr-lane: refused line saying so, making no branch, no herdr call and no lane.log line',
    r.code !== 0 && r.err.trim().split('\n').length === 1 && /^dctr-lane: refused, .* already exists$/.test(r.err.trim()) && !branches(f.repo).some((b) => b.startsWith('a ')) && shimLog(f).length === 0 && laneLines(f).length === 0 && !exists(path.join(f.wt('a'), '.git')), `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
}

// A base that already tracks the handoff's copy path.
const TRACKS = fixture()
git(TRACKS.repo, 'add', 'docs/handoffs/a.md'); git(TRACKS.repo, 'commit', '-qm', 'track the handoff')
const tracksBase = head(TRACKS.repo)
{
  const r = create(TRACKS, 'a', { base: tracksBase })
  clause('clause 1ad — create refuses a base that already tracks docs/handoffs/<the handoff>, making nothing', madeNothing(TRACKS, 'a', r) && r.err.includes('already tracks docs/handoffs/a.md'), `exit ${r.code} ${said(r)}`)
}

// A worktree path holding whitespace, a merge base that is a commit and no branch, and a run not named orchestrate.
const SPACED = fixture({ rootName: ' spaced' })
{
  const r = create(SPACED)
  clause('clause 1ae — create refuses a worktree path holding whitespace, making nothing', madeNothing(SPACED, 'a', r) && r.err.includes('holds whitespace'), `exit ${r.code} ${said(r)}`)
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const rm = lane(f, ['create', 'merge', f.repo, f.base, handoffOf(f, 'merge')])
  clause('clause 1af — create merge refuses a base that is a commit and not a branch, making nothing', madeNothing(f, 'merge', rm) && rm.err.includes('is not a branch of'), `exit ${rm.code} ${said(rm)}`)
}
const RUN2 = fixture({ runName: 'run2' })
{
  const rc = create(RUN2)
  const epic = read(path.join(RUN2.repo, 'docs/epics/E1.md'))
  const ra = lane(RUN2, ['archive', 'a']), rr = lane(RUN2, ['remove', 'a'])
  clause('clause 1ag — archive and remove refuse a run whose directory is not <Records>/orchestrate: nothing copied, the epic unchanged, the worktree kept, no lane.log line',
    rc.code === 0 && ra.code !== 0 && rr.code !== 0 && !exists(path.join(RUN2.repo, '.doctrine/records/lanes')) && read(path.join(RUN2.repo, 'docs/epics/E1.md')) === epic &&
    exists(RUN2.wt('a')) && laneLines(RUN2).length === 1, `create ${rc.code}; archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
}


// The untracked and ignored files a reset would overwrite (LR1, LR3): t tracks notes.txt, an ignored file and a name
// holding a newline, and a file in a directory whose name holds one; lanes a, b and c each hold one of the first three
// untracked, lane h holds a file named as that directory, and lane d holds only a file t does not track.
const WEIRD = 'we\nird.txt'
const WEIRD_DIR = 'we\nird.d'
const CLOB = fixture({ handoffs: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'g', 'h', 'i'].map((r) => [r, `.doctrine/records/${r}.md`])) })
git(CLOB.repo, 'checkout', '-q', '-b', 'revt')
for (const x of ['notes.txt', '.doctrine/records/keep.txt', WEIRD, `${WEIRD_DIR}/inner.txt`, 'nd']) { write(path.join(CLOB.repo, x), `${x} at t\n`); git(CLOB.repo, 'add', '-f', x) }
git(CLOB.repo, 'commit', '-qm', 't')
const clobT = head(CLOB.repo)
git(CLOB.repo, 'checkout', '-q', '-b', 'revs', 'main')
const clobS = commitIn(CLOB.repo, 'src.txt', 'source at s\n', 's')
git(CLOB.repo, 'checkout', '-q', 'main')
for (const [role, file, why] of [['a', 'notes.txt', 'an untracked file'], ['b', '.doctrine/records/keep.txt', 'an ignored file'], ['c', WEIRD, 'an untracked file whose name holds a newline'],
  ['h', WEIRD_DIR, 'an untracked file whose newline name t tracks as a directory'],
  ['i', 'nd/f', 'an untracked file under a path t tracks as a file']]) {
  create(CLOB, role)
  const w = CLOB.wt(role)
  write(path.join(w, file), 'the lane\'s own bytes\n')
  const before = { head: head(w), branches: branches(CLOB.repo), lines: laneLines(CLOB).length }
  const r = lane(CLOB, ['reset', role, clobT])
  clause(`clause 1ah — reset refuses when the revision tracks a path where the lane holds ${why}: HEAD unmoved, its bytes kept, no side branch, no lane.log line (LR1, LR3)`,
    r.code !== 0 && head(w) === before.head && read(path.join(w, file)) === 'the lane\'s own bytes\n' && JSON.stringify(branches(CLOB.repo)) === JSON.stringify(before.branches) &&
    laneLines(CLOB).length === before.lines, `exit ${r.code} ${said(r)}`)
}
// A change skip-worktree or assume-unchanged hides from the status test, on a revision s that changes that file.
for (const [role, flag, why] of [['e', '--skip-worktree', 'skip-worktree'], ['g', '--assume-unchanged', 'assume-unchanged']]) {
  create(CLOB, role)
  const w = CLOB.wt(role)
  git(w, 'update-index', flag, 'src.txt')
  write(path.join(w, 'src.txt'), 'the lane\'s own bytes\n')
  const before = { head: head(w), branches: branches(CLOB.repo), lines: laneLines(CLOB).length }
  const r = lane(CLOB, ['reset', role, clobS])
  clause(`clause 1ah2 — reset refuses a lane whose src.txt change ${why} hides from git status: HEAD unmoved, its bytes kept, no side branch, no lane.log line (LR1)`,
    r.code !== 0 && /dctr-lane: refused/.test(r.err) && head(w) === before.head && read(path.join(w, 'src.txt')) === 'the lane\'s own bytes\n' &&
    JSON.stringify(branches(CLOB.repo)) === JSON.stringify(before.branches) && laneLines(CLOB).length === before.lines, `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(CLOB.repo))}`)
}
{
  create(CLOB, 'd')
  const w = CLOB.wt('d')
  write(path.join(w, 'other.txt'), 'kept\n')
  const r = lane(CLOB, ['reset', 'd', clobT])
  clause('clause 2x — reset of a lane holding only an untracked file the revision does not track moves to the revision and keeps the file (LR1)',
    r.code === 0 && head(w) === clobT && read(path.join(w, 'other.txt')) === 'kept\n', `exit ${r.code} ${said(r)}`)
}

// A memory file the base tracks as a link to a path that does not exist (LR6).
const DLINK = fixture({ memory: 'link' })
const goneMem = path.join(DLINK.root, 'gone-memory.md')
fs.symlinkSync(goneMem, path.join(DLINK.repo, 'SESSION_MEMORY.md'))
git(DLINK.repo, 'add', 'SESSION_MEMORY.md'); git(DLINK.repo, 'commit', '-qm', 'dangling memory link')
const dlinkBase = head(DLINK.repo)

// A base tracking docs/handoffs as a link to a directory outside the worktree (LR6); the handoff itself lives outside the repo.
const HLINK = fixture({ handoffs: {} })
const outsideH = path.join(HLINK.root, 'outside-handoffs'); fs.mkdirSync(outsideH)
fs.symlinkSync(outsideH, path.join(HLINK.repo, 'docs/handoffs'))
git(HLINK.repo, 'add', 'docs/handoffs'); git(HLINK.repo, 'commit', '-qm', 'handoffs link')
const hlinkBase = head(HLINK.repo)
const hlinkSrc = path.join(HLINK.root, 'src-handoffs/a.md'); write(hlinkSrc, handoffText('.doctrine/records/a.md'))
{
  const r = create(HLINK, 'a', { base: hlinkBase, handoff: hlinkSrc })
  clause('clause 1ak4 — create refuses a handoff copy whose real path leaves the worktree through a tracked docs/handoffs link: nothing written outside, no herdr call, no lane.log line (LR6)',
    r.code !== 0 && fs.readdirSync(outsideH).length === 0 && shimLog(HLINK).length === 0 && laneLines(HLINK).length === 0, `exit ${r.code} ${said(r)}; outside ${JSON.stringify(fs.readdirSync(outsideH))}`)
}

// Handoff names the kickoff line cannot carry (LR5).
for (const name of ['a b.md', 'a|b.md']) {
  const f = fixture()
  const h = path.join(f.repo, 'docs/handoffs', name)
  write(h, handoffText('.doctrine/records/a.md'))
  const r = create(f, 'a', { handoff: h })
  clause(`clause 1aj — create refuses a handoff named ${JSON.stringify(name)}, which the kickoff line cannot carry, making nothing (LR5)`, madeNothing(f, 'a', r) && r.err.includes('the kickoff line cannot carry the handoff name'), `exit ${r.code} ${said(r)}`)
}

// A record whose real path leaves the worktree through a link the base tracks (LR6).
const LINKED = fixture()
const outside = path.join(LINKED.root, 'outside'); fs.mkdirSync(outside)
fs.symlinkSync(outside, path.join(LINKED.repo, 'evil'))
git(LINKED.repo, 'add', 'evil'); git(LINKED.repo, 'commit', '-qm', 'link')
const linkedBase = head(LINKED.repo)
write(handoffOf(LINKED), handoffText('evil/a.md'))
{
  const r = create(LINKED, 'a', { base: linkedBase })
  clause('clause 1ak — create refuses a record whose real path leaves the worktree through a tracked link: nothing written outside, no herdr call, no lane.log line, the worktree named (LR6)',
    r.code !== 0 && fs.readdirSync(outside).length === 0 && shimLog(LINKED).length === 0 && laneLines(LINKED).length === 0 && (r.out + r.err).includes(LINKED.wt('a')), `exit ${r.code} ${said(r)}`)
}

// A memory file the base tracks as a link to a file outside the worktree (LR6).
const MLINK = fixture({ memory: 'link' })
const outsideMem = path.join(MLINK.root, 'outside-memory.md'); write(outsideMem, 'outside\n')
fs.symlinkSync(outsideMem, path.join(MLINK.repo, 'SESSION_MEMORY.md'))
git(MLINK.repo, 'add', 'SESSION_MEMORY.md'); git(MLINK.repo, 'commit', '-qm', 'memory link')
const mlinkBase = head(MLINK.repo)
{
  const r = create(MLINK, 'a', { base: mlinkBase })
  clause('clause 1ak2 — create refuses a memory file whose real path leaves the worktree through a tracked link: the outside file unchanged, no handoff copied, no herdr call, no lane.log line (LR6)',
    r.code !== 0 && read(outsideMem) === 'outside\n' && !exists(path.join(MLINK.wt('a'), 'docs/handoffs/a.md')) && shimLog(MLINK).length === 0 && laneLines(MLINK).length === 0,
    `exit ${r.code} ${said(r)}; outside ${JSON.stringify(read(outsideMem))}`)
}

// The other refusals (LR7): a pane herdr reports gone, a revision that is no commit, a side branch held elsewhere.
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'gone' } })
  const gets = shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'get').length
  clause('clause 1al — when pane get answers pane_not_found, create fails at that first read, types nothing, undoes what it made and writes no lane.log line (L7, E15-D266)',
    gets === 1 && undone(f, 'a', r, madeTabs(f)), `exit ${r.code} ${said(r)}; pane gets ${gets}`)
}
{
  const f = fixture()
  create(f)
  const w = f.wt('a')
  const c = commitIn(w, 'lane.txt', 'lane\n', 'lane commit')
  const before = branches(f.repo)
  // A tree, not a commit: git ls-tree reads it, so only the commit test stops reset before it makes the side branch.
  const r = lane(f, ['reset', 'a', git(f.repo, 'rev-parse', `${f.base}^{tree}`).out])
  clause('clause 1am — reset refuses a revision that is a tree and no commit: HEAD unmoved, no side branch, no lane.log line',
    r.code !== 0 && head(w) === c && JSON.stringify(branches(f.repo)) === JSON.stringify(before) && laneLines(f).length === 1, `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
  git(f.repo, 'branch', `a-was-${c.slice(0, 12)}`, f.base)
  const held = branches(f.repo)
  const r2 = lane(f, ['reset', 'a', f.base])
  clause('clause 1an — reset refuses when its side branch exists at another commit: HEAD unmoved, that branch unchanged, no lane.log line',
    r2.code !== 0 && head(w) === c && JSON.stringify(branches(f.repo)) === JSON.stringify(held) && laneLines(f).length === 1, `exit ${r2.code} ${said(r2)}`)
}

// The project file and epic archive repoints (LR8).
for (const [n, gone, why] of [['1ao', 'docs/epics/E1.md', 'the epic'], ['1ap', 'docs/PROJECT.md', 'the project file']]) {
  const s = seeded()
  fs.rmSync(path.join(s.f.repo, gone))
  const r = lane(s.f, ['archive', 'a'])
  const rr = lane(s.f, ['remove', 'a'])
  clause(`clause ${n} — archive refuses when ${why} cannot be read, copying nothing, and remove then refuses, the worktree kept (LR8)`,
    r.code !== 0 && !exists(s.lanes) && rr.code !== 0 && exists(s.w) && laneLines(s.f).length === 1, `archive ${r.code} ${said(r)}; remove ${rr.code} ${said(rr)}`)
}
{
  const s = seeded()
  const epicFile = path.join(s.f.repo, 'docs/epics/E1.md')
  write(epicFile, EPIC('docs/other/b.md'))
  const r = lane(s.f, ['archive', 'a'])
  clause('clause 2y — archive of a lane no member line names exits 0, says no member line named its record, and leaves the epic unchanged (LR8)',
    r.code === 0 && /no - phase member line names/.test(r.out) && read(epicFile) === EPIC('docs/other/b.md'), `exit ${r.code} ${said(r)}`)
}

// ---------------------------------------------------------------- the file-kind matrix (LC1-LC4)

// Each kind of file a lane can hold, run through archive then remove and through reset. A row either completes with
// every byte kept, in the archive or in the worktree, or refuses with the worktree and the file kept; and no row
// writes anything under the fixture's outside directory.
const REALGIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
const gbin = path.join(tmp, 'gbin'); fs.mkdirSync(gbin)
// The git shim for the fault rows: DCTR_GIT_FAULT fails the call whose argv holds it; DCTR_GIT_LOCK_AFTER_RESET makes
// the named file read-only once a reset has run, so the next write to it fails.
fs.writeFileSync(path.join(gbin, 'git'), `#!/bin/sh
if [ -n "$DCTR_GIT_FAULT" ]; then case " $* " in *"$DCTR_GIT_FAULT"*) echo "git fault: $*" >&2; exit 1 ;; esac; fi
if [ -n "$DCTR_GIT_LOCK_AFTER_RESET" ]; then case " $* " in *" reset "*) ${JSON.stringify(REALGIT)} "$@"; rc=$?; chmod 0444 "$DCTR_GIT_LOCK_AFTER_RESET"; exit $rc ;; esac; fi
exec ${JSON.stringify(REALGIT)} "$@"
`)
fs.chmodSync(path.join(gbin, 'git'), 0o755)
const GPATH = `${gbin}:${bin}:${process.env.PATH}`
/** A path's kind and content: a link's target text, a file's sha256, or absent. */
const kindOf = (p) => { const st = fs.lstatSync(p, { throwIfNoEntry: false }); return !st ? 'absent' : st.isSymbolicLink() ? `link ${fs.readlinkSync(p)}` : st.isFile() ? `file ${sha(p)}` : st.isDirectory() ? 'dir' : 'other' }
/** Every entry under `dir` with its kindOf, as one string. */
const treeOf = (dir) => {
  const out = []
  const walk = (d) => { for (const e of fs.readdirSync(d).sort()) { const p = path.join(d, e); out.push(`${path.relative(dir, p)} ${kindOf(p)}`); if (kindOf(p) === 'dir') walk(p) } }
  if (exists(dir)) walk(dir)
  return out.join('\n')
}
/** A seeded lane with an outside directory beside its repo holding one file. */
function matrixLane() {
  const s = seeded()
  s.out = path.join(s.f.root, 'outside')
  write(path.join(s.out, 'outside.txt'), 'outside\n')
  s.outBefore = treeOf(s.out)
  return s
}
const hide = (flag, del) => (s) => { git(s.w, 'update-index', flag, 'src.txt'); if (del) fs.rmSync(path.join(s.w, 'src.txt')); else append(path.join(s.w, 'src.txt'), 'hidden\n') }
const KINDS = [
  { k: 'regular file committed on the lane branch', file: 'reg.txt', prep: (s) => commitIn(s.w, 'reg.txt', 'regular\n', 'reg') },
  { k: 'symlink to a file inside', file: 'lnk-in', prep: (s) => fs.symlinkSync('src.txt', path.join(s.w, 'lnk-in')) },
  { k: 'symlink to a file outside', file: 'lnk-out', prep: (s) => fs.symlinkSync(path.join(s.out, 'outside.txt'), path.join(s.w, 'lnk-out')) },
  { k: 'symlink to a directory outside', file: 'lnk-dir', prep: (s) => fs.symlinkSync(s.out, path.join(s.w, 'lnk-dir')) },
  { k: 'dangling link', file: 'lnk-gone', prep: (s) => fs.symlinkSync('nowhere', path.join(s.w, 'lnk-gone')) },
  { k: 'skip-worktree modified file', file: 'src.txt', prep: hide('--skip-worktree', false), refused: true },
  { k: 'skip-worktree deleted file', file: 'src.txt', prep: hide('--skip-worktree', true), refused: true },
  { k: 'assume-unchanged deleted file', file: 'src.txt', prep: hide('--assume-unchanged', true), refused: true },
  { k: 'ignored file', file: '.claude/ign.txt', prep: (s) => write(path.join(s.w, '.claude/ign.txt'), 'ignored\n') },
  { k: 'untracked file', file: 'u/deep.txt', prep: (s) => write(path.join(s.w, 'u/deep.txt'), 'untracked\n') },
]
const MATRIX = {}
for (const [i, K] of KINDS.entries()) {
  const s = matrixLane()
  K.prep(s)
  const before = kindOf(path.join(s.w, K.file))
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  const ok = K.refused
    ? rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && exists(s.w) && kindOf(path.join(s.w, K.file)) === before
    : ra.code === 0 && rr.code === 0 && !exists(s.w) && kindOf(path.join(s.lanes, K.file)) === before
  clause(`clause 2ab${i} — archive then remove of a lane holding a ${K.k}: ${K.refused ? 'remove refuses, the worktree and the file as they were' : 'both exit 0 and the archive holds it as the worktree did, link as link'}; nothing written outside (LC1, LC2)`,
    ok && treeOf(s.out) === s.outBefore, `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}; before ${before}; archived ${kindOf(path.join(s.lanes, K.file))}; outside ${JSON.stringify(treeOf(s.out))}`)
}
for (const [i, [k, file]] of [['an untracked link', 'late-lnk'], ['an ignored link', '.claude/late-lnk']].entries()) {
  const s = matrixLane()
  const ra = lane(s.f, ['archive', 'a'])
  fs.mkdirSync(path.dirname(path.join(s.w, file)), { recursive: true }); fs.symlinkSync('src.txt', path.join(s.w, file))
  const rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1aq${i} — remove refuses a lane holding ${k} written after its archive, the worktree and the link kept (LC2)`,
    ra.code === 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && kindOf(path.join(s.w, file)) === 'link src.txt', `archive ${ra.code}; remove ${rr.code} ${said(rr)}`)
}
{
  const s = matrixLane()
  fs.symlinkSync('src.txt', path.join(s.w, 'moved-lnk'))
  const ra = lane(s.f, ['archive', 'a'])
  fs.rmSync(path.join(s.w, 'moved-lnk')); fs.symlinkSync('SESSION_MEMORY.md', path.join(s.w, 'moved-lnk'))
  const rr = lane(s.f, ['remove', 'a'])
  clause('clause 1aq2 — remove refuses a lane whose link was pointed elsewhere after its archive, the worktree and the new link kept (LC2)',
    ra.code === 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && kindOf(path.join(s.w, 'moved-lnk')) === 'link SESSION_MEMORY.md', `archive ${ra.code}; remove ${rr.code} ${said(rr)}`)
}
{
  // Link targets that are not UTF-8: 74 ff and 74 fe both decode to "t�", so only a byte compare tells them apart.
  const T1 = Buffer.from([0x74, 0xff]), T2 = Buffer.from([0x74, 0xfe])
  const hex = (p) => { try { return fs.readlinkSync(p, 'buffer').toString('hex') } catch { return 'absent' } }
  const s = matrixLane(), p = path.join(s.w, 'raw-lnk')
  fs.symlinkSync(T1, p)
  clause('clause 3ap0 — the non-UTF-8 link fixture reads back as target bytes 74 ff, without the command',
    fs.readlinkSync(p, 'buffer').equals(T1), hex(p))
  clause('clause 3ap1 — targets 74 ff and 74 fe decode to one string, so a string compare cannot tell them apart',
    T1.toString() === T2.toString() && !T1.equals(T2), JSON.stringify([T1.toString(), T2.toString()]))
  const ra = lane(s.f, ['archive', 'a'])
  clause('clause 2af0 — archive of a lane holding an untracked link whose target is not UTF-8 keeps the target bytes exactly (LC13)',
    ra.code === 0 && hex(path.join(s.lanes, 'raw-lnk')) === '74ff', `archive ${ra.code} ${said(ra)}; archived ${hex(path.join(s.lanes, 'raw-lnk'))}`)
  fs.rmSync(p); fs.symlinkSync(T2, p)
  const rr = lane(s.f, ['remove', 'a'])
  clause('clause 1aq3 — remove refuses a lane whose non-UTF-8 link was retargeted from 74 ff to 74 fe after its archive, the worktree and the new link kept (LC13)',
    rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && hex(p) === '74fe', `remove ${rr.code} ${said(rr)}; link ${hex(p)}`)
  const t = matrixLane()
  fs.symlinkSync(T1, path.join(t.w, 'raw-lnk'))
  const ta = lane(t.f, ['archive', 'a']), tr = lane(t.f, ['remove', 'a'])
  clause('clause 2af1 — archive then remove of a lane holding an untouched non-UTF-8 link both exit 0, the worktree gone and the archive holding 74 ff (LC13)',
    ta.code === 0 && tr.code === 0 && !exists(t.w) && hex(path.join(t.lanes, 'raw-lnk')) === '74ff', `archive ${ta.code} ${said(ta)}; remove ${tr.code} ${said(tr)}; archived ${hex(path.join(t.lanes, 'raw-lnk'))}`)
}
{
  // A record reached through a link: the archive would hold the link and the epic would name it.
  const s = matrixLane()
  const epic = read(path.join(s.f.repo, 'docs/epics/E1.md'))
  fs.renameSync(path.join(s.w, '.doctrine/records/a.md'), path.join(s.w, 'real-a.md'))
  fs.symlinkSync('../../real-a.md', path.join(s.w, '.doctrine/records/a.md'))
  const ra = lane(s.f, ['archive', 'a'])
  clause('clause 1ar — archive refuses a lane whose record is a link: nothing archived, the epic unchanged, no lane.log line (LC2)',
    ra.code !== 0 && /is reached through a link/.test(ra.err) && !exists(s.lanes) && read(path.join(s.f.repo, 'docs/epics/E1.md')) === epic && laneLines(s.f).length === 1, `archive ${ra.code} ${said(ra)}`)
}
{
  const s = matrixLane()
  // bound by a relative name from the worktree, since a socket path is capped near 104 bytes
  // the child exits from inside listen's callback, which leaves the socket file bound and the server closed by exit
  s.made = spawnSync(process.execPath, ['-e', "require('net').createServer().listen('sock', () => process.exit(0))"], { cwd: s.w, encoding: 'utf8' })
  MATRIX.sock = s
  const ra = lane(s.f, ['archive', 'a'])
  clause('clause 1as — archive refuses a lane holding a socket, which it cannot copy: nothing archived, no lane.log line (LC2)',
    ra.code !== 0 && /neither a file nor a link/.test(ra.err) && !exists(s.lanes) && laneLines(s.f).length === 1, `archive ${ra.code} ${said(ra)}`)
}
{
  // An archived link superseded by a directory: a second archive must not write through the archived link.
  const s = matrixLane()
  fs.symlinkSync(s.out, path.join(s.w, 'ld'))
  fs.symlinkSync(path.join(s.out, 'outside.txt'), path.join(s.w, 'lf'))
  const r1 = lane(s.f, ['archive', 'a'])
  fs.rmSync(path.join(s.w, 'ld')); write(path.join(s.w, 'ld/x.txt'), 'x\n')
  fs.rmSync(path.join(s.w, 'lf')); write(path.join(s.w, 'lf'), 'now a file\n')
  const r2 = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause('clause 2ac — a second archive, after one link the first archived became a directory and another a file, writes nothing through either archived link, and remove then exits 0 with both archived (LC2)',
    r1.code === 0 && r2.code === 0 && rr.code === 0 && treeOf(s.out) === s.outBefore && read(path.join(s.lanes, 'ld/x.txt')) === 'x\n' && kindOf(path.join(s.lanes, 'lf')).startsWith('file ') && read(path.join(s.lanes, 'lf')) === 'now a file\n',
    `archive ${r1.code} ${said(r1)}; archive ${r2.code} ${said(r2)}; remove ${rr.code} ${said(rr)}; outside ${JSON.stringify(treeOf(s.out))}`)
}

// A tracked file whose mode or type changes under skip-worktree or assume-unchanged, bytes kept: git status hides it
// and a byte compare sees nothing, so only the index entry's mode tells the change apart.
const MODES = [
  { k: 'skip-worktree file made executable', prep: (s) => { git(s.w, 'update-index', '--skip-worktree', 'src.txt'); fs.chmodSync(path.join(s.w, 'src.txt'), 0o755) } },
  { k: 'assume-unchanged file made executable', prep: (s) => { git(s.w, 'update-index', '--assume-unchanged', 'src.txt'); fs.chmodSync(path.join(s.w, 'src.txt'), 0o755) } },
  { k: 'skip-worktree file made a link to the same bytes', prep: (s) => {
    git(s.w, 'update-index', '--skip-worktree', 'src.txt'); const t = path.join(s.f.root, 'same.txt'); fs.copyFileSync(path.join(s.w, 'src.txt'), t)
    fs.rmSync(path.join(s.w, 'src.txt')); fs.symlinkSync(t, path.join(s.w, 'src.txt')) } },
]
const modeOf = (p) => { const st = fs.lstatSync(p, { throwIfNoEntry: false }); return !st ? 'absent' : st.isSymbolicLink() ? 'link' : (st.mode & 0o111) ? 'exec' : 'plain' }
for (const [i, K] of MODES.entries()) {
  const s = matrixLane()
  const ra = lane(s.f, ['archive', 'a'])
  K.prep(s)
  const before = modeOf(path.join(s.w, 'src.txt')), rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1bf${i} — after an archive, remove of a lane holding a ${K.k} refuses: the worktree kept and src.txt as it was (LC9)`,
    ra.code === 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && exists(s.w) && modeOf(path.join(s.w, 'src.txt')) === before, `archive ${ra.code}; remove ${rr.code} ${said(rr)}; before ${before}; after ${modeOf(path.join(s.w, 'src.txt'))}`)
  const s2 = matrixLane()
  const t = commitIn(s2.f.repo, 'at-t.txt', 't\n', 't')
  K.prep(s2)
  const old = head(s2.w), before2 = modeOf(path.join(s2.w, 'src.txt')), r = lane(s2.f, ['reset', 'a', t])
  clause(`clause 1bg${i} — reset of a lane holding a ${K.k} refuses: HEAD unmoved and src.txt as it was (LC9)`,
    r.code !== 0 && /dctr-lane: refused/.test(r.err) && head(s2.w) === old && modeOf(path.join(s2.w, 'src.txt')) === before2, `reset ${r.code} ${said(r)}; before ${before2}; after ${modeOf(path.join(s2.w, 'src.txt'))}`)
}

// The known-good twins of the hidden-change test: a tracked file, executable file and link committed on the lane
// branch, then marked skip-worktree or assume-unchanged and left untouched, are no change, so remove and reset accept.
const UNTOUCHED = ['--skip-worktree', '--assume-unchanged'].flatMap((flag) => [
  { k: `untouched ${flag.slice(2)} 100644 file`, file: 'tw.txt', mode: '100644', flag, make: (p) => write(p, 'twin\n') },
  { k: `untouched ${flag.slice(2)} 100755 file`, file: 'tw.sh', mode: '100755', flag, make: (p) => { write(p, '#!/bin/sh\n'); fs.chmodSync(p, 0o755) } },
  { k: `untouched ${flag.slice(2)} 120000 link`, file: 'tw-lnk', mode: '120000', flag, make: (p) => fs.symlinkSync('src.txt', p) },
])
const twin = (s, K) => { K.make(path.join(s.w, K.file)); git(s.w, 'add', K.file); git(s.w, 'commit', '-qm', 'twin'); git(s.w, 'update-index', K.flag, K.file) }
for (const [i, K] of UNTOUCHED.entries()) {
  const s = matrixLane()
  twin(s, K)
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1bh${i} — after an archive, remove of a lane holding an ${K.k} exits 0 and the worktree is gone (LC11)`,
    ra.code === 0 && rr.code === 0 && !exists(s.w), `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
  const s2 = matrixLane()
  const t = commitIn(s2.f.repo, 'at-t.txt', 't\n', 't')
  twin(s2, K)
  const r = lane(s2.f, ['reset', 'a', t])
  clause(`clause 1bi${i} — reset of a lane holding an ${K.k} moves to t (LC11)`, r.code === 0 && head(s2.w) === t, `reset ${r.code} ${said(r)}`)
}

// A tracked link committed on the lane branch, marked skip-worktree or assume-unchanged, then pointed at another path
// and still a link: git status hides it and the mode compare passes, so only the target tells the change apart.
const RETARGETED = UNTOUCHED.filter((K) => K.mode === '120000')
const retarget = (s, K) => { const p = path.join(s.w, K.file); fs.rmSync(p); fs.symlinkSync('other.txt', p) }
const targetOf = (p) => { try { return fs.readlinkSync(p) } catch { return null } }
for (const [i, K] of RETARGETED.entries()) {
  const s = matrixLane()
  twin(s, K)
  // retargeted before the archive, so the archive copies the new target and only the hidden-change test can refuse
  retarget(s, K)
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1bj${i} — after an archive, remove of a lane holding a ${K.flag.slice(2)} link retargeted to other.txt refuses, naming the link: the worktree kept and the link still other.txt (LC12)`,
    ra.code === 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && rr.err.includes(JSON.stringify(K.file)) && exists(s.w) && targetOf(path.join(s.w, K.file)) === 'other.txt', `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}; target ${targetOf(path.join(s.w, K.file))}`)
  const s2 = matrixLane()
  const t = commitIn(s2.f.repo, 'at-t.txt', 't\n', 't')
  twin(s2, K)
  retarget(s2, K)
  const old = head(s2.w), r = lane(s2.f, ['reset', 'a', t])
  clause(`clause 1bk${i} — reset of a lane holding a ${K.flag.slice(2)} link retargeted to other.txt refuses: HEAD unmoved and the link still other.txt (LC12)`,
    r.code !== 0 && /dctr-lane: refused/.test(r.err) && head(s2.w) === old && targetOf(path.join(s2.w, K.file)) === 'other.txt', `reset ${r.code} ${said(r)}; target ${targetOf(path.join(s2.w, K.file))}`)
}

// Through reset onto a revision t that adds one file: the kinds a move keeps are kept, the hidden ones refuse.
for (const [i, K] of KINDS.entries()) {
  const s = matrixLane()
  const t = commitIn(s.f.repo, 'at-t.txt', 't\n', 't')
  K.prep(s)
  const old = head(s.w), before = kindOf(path.join(s.w, K.file))
  const r = lane(s.f, ['reset', 'a', t])
  const side = `a-was-${old.slice(0, 12)}`
  const kept = K.file === 'reg.txt' ? git(s.w, 'show', `${side}:reg.txt`).out === 'regular' : kindOf(path.join(s.w, K.file)) === before
  const ok = K.refused ? r.code !== 0 && /dctr-lane: refused/.test(r.err) && head(s.w) === old && kindOf(path.join(s.w, K.file)) === before : r.code === 0 && head(s.w) === t && kept
  clause(`clause 2ad${i} — reset of a lane holding a ${K.k}: ${K.refused ? 'refuses, HEAD unmoved and the file as it was' : 'moves to t and the file is kept, a committed one on the side branch'}; nothing written outside (LC1, LC2)`,
    ok && treeOf(s.out) === s.outBefore, `reset ${r.code} ${said(r)}; before ${before}; after ${kindOf(path.join(s.w, K.file))}`)
}
let MEMLINK
{
  // A revision that tracks the memory file as a link out of the worktree (LC3).
  const s = matrixLane()
  const target = path.join(s.out, 'mem-target.md'); write(target, 'target\n'); s.outBefore = treeOf(s.out)
  git(s.f.repo, 'checkout', '-q', '-b', 'memlink')
  fs.rmSync(path.join(s.f.repo, 'SESSION_MEMORY.md')); fs.symlinkSync(target, path.join(s.f.repo, 'SESSION_MEMORY.md'))
  git(s.f.repo, 'add', 'SESSION_MEMORY.md'); git(s.f.repo, 'commit', '-qm', 'memory as a link')
  const t = head(s.f.repo)
  git(s.f.repo, 'checkout', '-q', 'main')
  MEMLINK = { s, t, target }
  const old = head(s.w), mem = read(path.join(s.w, 'SESSION_MEMORY.md'))
  const r = lane(s.f, ['reset', 'a', t])
  clause('clause 1at — reset refuses a revision that tracks the memory file as a link: nothing written outside, HEAD unmoved, the memory file\'s bytes kept, no lane.log line (LC3)',
    r.code !== 0 && /as a link/.test(r.err) && treeOf(s.out) === s.outBefore && head(s.w) === old && read(path.join(s.w, 'SESSION_MEMORY.md')) === mem && laneLines(s.f).length === 1,
    `reset ${r.code} ${said(r)}; outside ${JSON.stringify(treeOf(s.out))}`)
}
/** Where reset saves the memory bytes: the worktree's own git dir, which no checkout or reset of the worktree writes. */
const savedOf = (w) => git(w, 'rev-parse', '--path-format=absolute', '--git-path', 'SESSION_MEMORY.md.was').out
/** The file a failed reset's output says holds the memory bytes, or null. */
const namedSaved = (r) => /the memory file's bytes are in (.+)$/m.exec(r.err)?.[1] ?? null
{
  const s = matrixLane()
  const t = commitIn(s.f.repo, 'at-t.txt', 't\n', 't')
  write(savedOf(s.w), 'an earlier reset\'s bytes\n')
  const old = head(s.w)
  const r = lane(s.f, ['reset', 'a', t])
  clause('clause 1au — reset refuses while the memory bytes an earlier reset saved are still in the worktree\'s git dir: that file unchanged, HEAD unmoved',
    r.code !== 0 && /an earlier reset that did not finish/.test(r.err) && read(savedOf(s.w)) === 'an earlier reset\'s bytes\n' && head(s.w) === old, `reset ${r.code} ${said(r)}`)
}
// LC7: a revision tracking the path reset once saved the memory bytes at, inside the worktree.
let WASREV
for (const fault of [false, true]) {
  const s = matrixLane()
  const t = commitIn(s.f.repo, 'SESSION_MEMORY.md.was', 'tracked was\n', 'tracks .was')
  const old = head(s.w), mem = readBuf(path.join(s.w, 'SESSION_MEMORY.md'))
  WASREV = { s, t, old, mem }
  const r = lane(s.f, ['reset', 'a', t], { env: { PATH: GPATH, ...(fault ? { DCTR_GIT_LOCK_AFTER_RESET: path.join(s.w, 'SESSION_MEMORY.md') } : {}) } })
  const memNow = readBuf(path.join(s.w, 'SESSION_MEMORY.md')), named = namedSaved(r), tracked = read(path.join(s.w, 'SESSION_MEMORY.md.was'))
  if (!fault) {
    clause('clause 2ae — reset to a revision tracking SESSION_MEMORY.md.was exits 0 at that revision, the memory file byte for byte, and the tracked SESSION_MEMORY.md.was still in place with the revision\'s bytes (LC7)',
      r.code === 0 && head(s.w) === t && memNow.equals(mem) && tracked === 'tracked was\n' && !exists(savedOf(s.w)), `reset ${r.code} ${said(r)}; .was ${JSON.stringify(tracked)}; memory kept ${memNow.equals(mem)}`)
    continue
  }
  clause('clause 1ba — the same reset with the memory file restore faulted exits non-zero, and the memory file\'s bytes are in the file its output names, the tracked SESSION_MEMORY.md.was holding the revision\'s bytes (LC7)',
    r.code !== 0 && named !== null && readBuf(named).equals(mem) && tracked === 'tracked was\n', `reset ${r.code} ${said(r)}; named ${named} holds ${JSON.stringify(named && read(named))}`)
  // the session goes on from its own bytes, edited since, so the saved file is then the only copy of them; the
  // handoff the lane committed, which t does not track, is put back so the kickoff still reaches the record
  fs.chmodSync(path.join(s.w, 'SESSION_MEMORY.md'), 0o644)
  write(path.join(s.w, 'docs/handoffs/a.md'), git(s.w, 'show', `${old}:docs/handoffs/a.md`).out + '\n')
  fs.writeFileSync(path.join(s.w, 'SESSION_MEMORY.md'), Buffer.concat([mem, Buffer.from('\nedited after the failed reset\n')]))
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause('clause 1bb — archive then remove after that reset, the memory file edited since: archive exits 0 and remove refuses while the saved memory bytes are there, the worktree kept and the saved bytes intact (LC7)',
    ra.code === 0 && rr.code !== 0 && /an earlier reset that did not finish/.test(rr.err) && exists(s.w) && named !== null && readBuf(named).equals(mem), `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
}
// LC6: archive A succeeds while no member names the live record, one is added, archive B fails on the epic write.
let LC6
{
  const s = matrixLane()
  const epicFile = path.join(s.f.repo, 'docs/epics/E1.md'), memberLine = '- phase build-a: .claude/worktrees/a/.doctrine/records/a.md\n'
  const epic = read(epicFile)
  write(epicFile, epic.replace(memberLine, ''))
  const r1 = lane(s.f, ['archive', 'a'])
  write(epicFile, epic)
  fs.chmodSync(epicFile, 0o444)
  const r2 = lane(s.f, ['archive', 'a'])
  LC6 = { s, epicFile, log: laneLines(s.f), epicNow: read(epicFile) }
  const rr = lane(s.f, ['remove', 'a'])
  clause('clause 1bc — after an archive that finished, a member naming the live record added, and an archive that failed on the epic write, remove refuses: the worktree kept and the epic still naming the live record (LC6)',
    r1.code === 0 && r2.code !== 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && exists(path.join(s.w, '.doctrine/records/a.md')) && read(epicFile) === epic,
    `archive ${r1.code} ${said(r1)}; archive ${r2.code} ${said(r2)}; remove ${rr.code} ${said(rr)}`)
}

// A fault in each write archive makes: remove refuses after any archive that did not finish (LC4).
for (const [i, [k, inject]] of [
  ['its lanes directory is a file', (s) => write(s.lanes, 'in the way\n')],
  ['a copy fails', (s) => { fs.mkdirSync(path.join(s.lanes, '.doctrine/records'), { recursive: true }); fs.chmodSync(path.join(s.lanes, '.doctrine/records'), 0o555) }],
  ['a link copy fails', (s) => { fs.mkdirSync(path.join(s.w, 'ld2')); fs.symlinkSync('../src.txt', path.join(s.w, 'ld2/lnk')); fs.mkdirSync(path.join(s.lanes, 'ld2'), { recursive: true }); fs.chmodSync(path.join(s.lanes, 'ld2'), 0o555) }],
  ['the epic write fails', (s) => fs.chmodSync(path.join(s.f.repo, 'docs/epics/E1.md'), 0o444)],
  ['the lane.log append fails', (s) => fs.chmodSync(s.f.laneLog, 0o444)],
].entries()) {
  const s = matrixLane()
  inject(s)
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1av${i} — archive whose ${k} exits non-zero, and remove after it refuses with the worktree kept (LC4)`,
    ra.code !== 0 && rr.code !== 0 && /dctr-lane: refused/.test(rr.err) && exists(s.w) && kindOf(path.join(s.w, '.doctrine/records/a.md')).startsWith('file '), `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
}
// A fault in each write reset makes: the memory file's bytes, an untracked file and the old HEAD all survive.
for (const [i, [k, env, prep]] of [
  ['the side branch', { DCTR_GIT_FAULT: ' branch a-was-' }],
  ['clearing skip-worktree', { DCTR_GIT_FAULT: ' update-index --no-skip-worktree ' }],
  ['the move', { DCTR_GIT_FAULT: ' reset --quiet --hard ' }],
  ['the memory file restore', null, (s) => ({ DCTR_GIT_LOCK_AFTER_RESET: path.join(s.w, 'SESSION_MEMORY.md') })],
  ['setting skip-worktree again', { DCTR_GIT_FAULT: ' update-index --skip-worktree ' }],
  ['the lane.log append', {}, (s) => { fs.chmodSync(s.f.laneLog, 0o444); return {} }],
  ['saving the memory bytes', {}, (s) => { fs.chmodSync(path.dirname(savedOf(s.w)), 0o555); return {} }],
].entries()) {
  const s = matrixLane()
  const t = commitIn(s.f.repo, 'at-t.txt', 't\n', 't')
  write(path.join(s.w, 'notes.txt'), 'own\n')
  const old = head(s.w), mem = readBuf(path.join(s.w, 'SESSION_MEMORY.md'))
  const extra = prep ? prep(s) : {}
  const r = lane(s.f, ['reset', 'a', t], { env: { PATH: GPATH, ...env, ...extra } })
  fs.chmodSync(path.dirname(savedOf(s.w)), 0o755)
  const memNow = readBuf(path.join(s.w, 'SESSION_MEMORY.md')), named = namedSaved(r), saved = named ? readBuf(named) : Buffer.alloc(0)
  const kept = memNow.equals(mem) || saved.equals(mem)
  const reachable = head(s.w) === old || git(s.w, 'rev-parse', `a-was-${old.slice(0, 12)}`).out === old
  clause(`clause 1aw${i} — reset whose ${k} fails exits non-zero, and the memory file's bytes (in place, or in a file its output names), the untracked file and the old HEAD all survive`,
    r.code !== 0 && kept && read(path.join(s.w, 'notes.txt')) === 'own\n' && reachable, `reset ${r.code} ${said(r)}; memory kept ${memNow.equals(mem)}; saved ${saved.length}`)
}
{
  // LC5: a run whose Records sits in no git repo.
  const s = matrixLane()
  const outRun = path.join(s.f.root, 'loose-records/orchestrate')
  fs.cpSync(s.f.run, outRun, { recursive: true })
  const lines = laneLines({ laneLog: path.join(outRun, 'lane.log') }).length
  MATRIX.loose = outRun
  const ra = lane(s.f, ['archive', 'a'], { env: { DCTR_RUN: outRun } })
  clause('clause 1ax — archive refuses a run whose Records directory is in no git repo: nothing archived, the epic unchanged, no lane.log line (LC5)',
    ra.code !== 0 && /is in no git repo/.test(ra.err) && !exists(path.join(s.f.root, 'loose-records/lanes')) && laneLines({ laneLog: path.join(outRun, 'lane.log') }).length === lines,
    `archive ${ra.code} ${said(ra)}`)
}
{
  // Clause 3 for the matrix, without the command: each hidden deletion is invisible to git diff HEAD and git status,
  // find -type f misses every link, the memlink revision tracks the memory file as a link out, the loose run's
  // Records is in no repo, and a read-only epic refuses a write.
  for (const [n, K] of [['3ac', KINDS[6]], ['3ad', KINDS[7]]]) {
    const s = matrixLane()
    K.prep(s)
    const diff = git(s.w, 'diff', '--name-only', 'HEAD').out, st = git(s.w, 'status', '--porcelain', '--untracked-files=no').out, v = git(s.w, 'ls-files', '-v', 'src.txt').out
    clause(`clause ${n} — on the ${K.k} fixture, src.txt is absent, tagged ${v.slice(0, 1)} by ls-files -v, and neither git diff HEAD nor the status test names it`,
      !exists(path.join(s.w, 'src.txt')) && /^(S|h) src\.txt$/.test(v) && !diff.includes('src.txt') && !st.includes('src.txt'), JSON.stringify({ diff, st, v }))
  }
  const s = matrixLane()
  for (const K of KINDS.slice(1, 5)) K.prep(s)
  const fr = spawnSync('find', [s.w, '-type', 'f'], { encoding: 'utf8' })
  const found = fr.stdout.split('\n').map((x) => path.relative(s.w, x))
  clause('clause 3ae — find -type f exits 0 listing src.txt and none of the four link kinds the matrix holds', fr.status === 0 && found.includes('src.txt') && ['lnk-in', 'lnk-out', 'lnk-dir', 'lnk-gone'].every((x) => !found.includes(x) && fs.lstatSync(path.join(s.w, x)).isSymbolicLink()), `find ${fr.status}; ${JSON.stringify(found.filter((x) => x.startsWith('lnk')))}`)
  const ls = git(MEMLINK.s.f.repo, 'ls-tree', MEMLINK.t, 'SESSION_MEMORY.md').out
  clause('clause 3af — the memlink revision tracks SESSION_MEMORY.md as a link to a file outside the worktree',
    ls.startsWith('120000 ') && git(MEMLINK.s.f.repo, 'cat-file', '-p', `${MEMLINK.t}:SESSION_MEMORY.md`).out === MEMLINK.target && path.relative(MEMLINK.s.w, MEMLINK.target).startsWith('..'), ls)
  clause('clause 3ai — the socket fixture\'s node child exited 0 and its sock is a socket, neither a file nor a link',
    MATRIX.sock.made.status === 0 && fs.lstatSync(path.join(MATRIX.sock.w, 'sock'), { throwIfNoEntry: false })?.isSocket() === true, `child ${MATRIX.sock.made.status} ${JSON.stringify(MATRIX.sock.made.stderr)}; ${kindOf(path.join(MATRIX.sock.w, 'sock'))}`)
  clause('clause 3ag — the loose run\'s Records directory is in no git repo', git(path.dirname(MATRIX.loose), 'rev-parse', '--show-toplevel').code !== 0, MATRIX.loose)
  const ro = path.join(s.f.root, 'ro.md'); write(ro, 'x\n'); fs.chmodSync(ro, 0o444)
  let code = null; try { fs.writeFileSync(ro, 'y\n') } catch (e) { code = e.code }
  clause('clause 3ah — a file made 0444, as the epic and lane.log fault rows make them, refuses a write here (EACCES)', code === 'EACCES', String(code))
  const live = path.join(LC6.s.w, '.doctrine/records/a.md')
  const names = parseDoc(LC6.epicNow).phases.filter((p) => p.record && path.resolve(LC6.s.f.repo, p.record) === live)
  const ops = LC6.log.map((l) => LANE_LINE.exec(l)?.[3])
  clause('clause 3aj — before the LC6 remove, the epic is read-only and a member line resolves to the live record, and lane.log holds an archive line after the create',
    names.length === 1 && (fs.statSync(LC6.epicFile).mode & 0o222) === 0 && ops.lastIndexOf('archive') > ops.lastIndexOf('create') && ops.includes('create'), JSON.stringify({ names, ops }))
  const p = path.join(WASREV.s.f.root, 'p7')
  git(WASREV.s.f.repo, 'worktree', 'add', '-q', '--detach', p, WASREV.old)
  write(path.join(p, 'SESSION_MEMORY.md.was'), 'saved\n'); write(savedOf(p), 'saved\n')
  const mv = git(p, 'reset', '-q', '--hard', WASREV.t)
  clause('clause 3ak — the .was revision tracks SESSION_MEMORY.md.was with bytes other than the memory file\'s, the old HEAD does not, and a plain reset --hard onto it overwrites an untracked SESSION_MEMORY.md.was while a file at the worktree\'s --git-path is untouched',
    git(WASREV.s.f.repo, 'cat-file', '-p', `${WASREV.t}:SESSION_MEMORY.md.was`).out === 'tracked was' && !WASREV.mem.equals(Buffer.from('tracked was\n')) &&
    git(WASREV.s.f.repo, 'cat-file', '-e', `${WASREV.old}:SESSION_MEMORY.md.was`).code !== 0 && mv.code === 0 &&
    read(path.join(p, 'SESSION_MEMORY.md.was')) === 'tracked was\n' && read(savedOf(p)) === 'saved\n', JSON.stringify({ mv, was: read(path.join(p, 'SESSION_MEMORY.md.was')) }))
}
{
  // Clause 3 for LC9, without the command: each mode fixture changes src.txt's mode or type and keeps its bytes, the
  // index still says 100644, and git status prints nothing.
  for (const [i, K] of MODES.entries()) {
    const s = matrixLane()
    K.prep(s)
    const st = git(s.w, 'status', '--porcelain', '--untracked-files=no').out, idx = git(s.w, 'ls-files', '-s', 'src.txt').out
    const bytes = crypto.createHash('sha256').update(fs.readFileSync(path.join(s.w, 'src.txt'))).digest('hex') === crypto.createHash('sha256').update(git(s.w, 'cat-file', 'blob', ':src.txt').out + '\n').digest('hex')
    clause(`clause 3al${i} — on the ${K.k} fixture, src.txt reads ${modeOf(path.join(s.w, 'src.txt'))} with the index's bytes, the index entry is 100644, and the status test prints nothing`,
      ['exec', 'link'].includes(modeOf(path.join(s.w, 'src.txt'))) && bytes && idx.startsWith('100644 ') && st === '', JSON.stringify({ st, idx, bytes }))
  }
  // Clause 3 for LC11, without the command: each twin's index entry carries its flag's tag, the mode it was made with
  // and the blob git computes from the worktree (a link's from its target), and git status prints nothing.
  for (const [i, K] of UNTOUCHED.entries()) {
    const s = matrixLane()
    twin(s, K)
    const p = path.join(s.w, K.file), [tag, mode, blob] = git(s.w, 'ls-files', '-v', '-s', K.file).out.split(/\s+/)
    // A link is read back against the index blob's own content, not hashed the way the command hashes it.
    const link = K.mode === '120000', now = link ? fs.readlinkSync(p) : git(s.w, 'hash-object', '--', K.file).out
    const want = link ? git(s.w, 'cat-file', '-p', blob).out : blob
    const st = git(s.w, 'status', '--porcelain', '--untracked-files=no').out
    clause(`clause 3an${i} — on the ${K.k} twin, the index entry is tagged ${K.flag === '--skip-worktree' ? 'S' : 'h'} with mode ${K.mode} and ${link ? 'the target the index blob holds' : 'the blob git computes from the worktree'}, and the status test prints nothing`,
      tag === (K.flag === '--skip-worktree' ? 'S' : 'h') && mode === K.mode && modeOf(p) === { '100644': 'plain', '100755': 'exec', '120000': 'link' }[K.mode] && (link ? now === 'src.txt' : /^[0-9a-f]{40}$/.test(now)) && now === want && st === '',
      JSON.stringify({ tag, mode, blob, now, want, st }))
  }
  // Clause 3 for LC12, without the command: each retargeted link's index entry is a 120000 link tagged by its flag,
  // the worktree link's target differs from the target the index blob holds, and git status prints nothing.
  for (const [i, K] of RETARGETED.entries()) {
    const s = matrixLane()
    twin(s, K)
    retarget(s, K)
    const p = path.join(s.w, K.file), [tag, mode, blob] = git(s.w, 'ls-files', '-v', '-s', K.file).out.split(/\s+/)
    const now = fs.readlinkSync(p), was = git(s.w, 'cat-file', '-p', blob).out, st = git(s.w, 'status', '--porcelain', '--untracked-files=no').out
    clause(`clause 3ao${i} — on the retargeted ${K.flag.slice(2)} link fixture, the index entry is tagged ${K.flag === '--skip-worktree' ? 'S' : 'h'} with mode 120000, the worktree link reads other.txt while the index blob holds src.txt, and the status test prints nothing`,
      tag === (K.flag === '--skip-worktree' ? 'S' : 'h') && mode === '120000' && modeOf(p) === 'link' && now === 'other.txt' && was === 'src.txt' && st === '',
      JSON.stringify({ tag, mode, blob, now, was, st }))
  }
  // Clause 3 for LC10: the shim answers a fresh pane in each discriminating mode as the clause names it.
  for (const [mode, status, session] of [['session-before', 'unknown', 'old'], ['idle-before', 'idle', null]]) {
    const f = fixture()
    const env = { ...process.env, HERDR_SHIM_DIR: f.shim, HERDR_SHIM_MODE: mode }
    spawnSync(path.join(bin, 'herdr'), ['tab', 'create'], { env })
    const got = JSON.parse(spawnSync(path.join(bin, 'herdr'), ['pane', 'get', 'p1'], { env, encoding: 'utf8' }).stdout)
    clause(`clause 3am — in ${mode} mode the herdr shim answers a fresh pane agent_status ${status} with agent session ${session}`,
      got.result.pane.agent_status === status && (got.result.pane.agent_session?.value ?? null) === session, JSON.stringify(got))
  }
}

// ---------------------------------------------------------------- clause 3: the fixtures carry their defects

{
  const one = fixture()
  clause('clause 3a — the held-branch fixture\'s worktree list shows main checked out, without the command',
    git(one.repo, 'worktree', 'list', '--porcelain').out.includes('branch refs/heads/main'), git(one.repo, 'worktree', 'list', '--porcelain').out)
  const f = fixture()
  git(f.repo, 'worktree', 'add', '-q', '-b', 'z', path.join(f.repo, '.claude/worktrees/z'), f.base)
  const z = path.join(f.repo, '.claude/worktrees/z')
  append(path.join(z, 'src.txt'), 'dirty\n')
  append(path.join(z, 'SESSION_MEMORY.md'), 'kickoff\n')
  git(z, 'update-index', '--skip-worktree', 'SESSION_MEMORY.md')
  const st = git(z, 'status', '--porcelain', '--untracked-files=no').out
  clause('clause 3b — on a worktree made by hand, the status test prints the source change and not the skip-worktree memory file',
    st === 'M src.txt', JSON.stringify(st))
  git(z, 'checkout', '--', 'src.txt')
  git(f.repo, 'checkout', '-q', '-b', 'revm')
  const m = commitIn(f.repo, 'SESSION_MEMORY.md', '# memory at m\n', 'm')
  git(f.repo, 'checkout', '-q', 'main')
  const known = git(z, 'cat-file', '-e', `${m}^{commit}`).code
  const plain = git(z, 'reset', '--hard', m)
  git(z, 'update-index', '--no-skip-worktree', 'SESSION_MEMORY.md')
  const cleared = git(z, 'reset', '--hard', m)
  clause('clause 3c — in the worktree\'s own repo, a plain git reset --hard onto a revision that changes a skip-worktree memory file exits 128, and the same reset with the bit cleared exits 0 at that revision: the bit is the hazard reset carries the bytes across (E15-D165)',
    known === 0 && plain.code === 128 && cleared.code === 0 && head(z) === m, `known ${known}; bit set ${plain.code} ${plain.err}; bit cleared ${cleared.code} ${cleared.err}`)
}
clause('clause 3d — m changes the tracked memory file against the base and k leaves it',
  git(MEM.repo, 'diff', '--name-only', MEM.base, memM).out.split('\n').includes('SESSION_MEMORY.md') && !git(MEM.repo, 'diff', '--name-only', MEM.base, memK).out.includes('SESSION_MEMORY.md'),
  `${git(MEM.repo, 'diff', '--name-only', MEM.base, memM).out} / ${git(MEM.repo, 'diff', '--name-only', MEM.base, memK).out}`)
for (const kind of ['untracked', 'ignored']) {
  const { U, u, u2 } = UNT[kind]
  clause(`clause 3e — the ${kind}-memory fixture's base does not track SESSION_MEMORY.md, u does, and u2 changes it${kind === 'ignored' ? ', and the base ignores it' : ''}`,
    git(U.repo, 'ls-tree', '--name-only', U.base).out.split('\n').every((x) => x !== 'SESSION_MEMORY.md') && git(U.repo, 'ls-tree', '--name-only', u).out.split('\n').includes('SESSION_MEMORY.md') &&
    git(U.repo, 'diff', '--name-only', u, u2).out === 'SESSION_MEMORY.md' &&
    (kind === 'untracked' || read(path.join(U.repo, '.gitignore')).includes('SESSION_MEMORY.md')), kind)
}
{
  const s = seeded()
  const tracked = git(s.w, 'ls-files').out.split('\n')
  const st = git(s.w, 'status', '--porcelain', '--untracked-files=all').out
  clause('clause 3f — the seeded lane\'s evidence file is ignored and its memory change is invisible to git status, so a listing by git ls-files and git status misses both (E15-D62)',
    git(s.w, 'check-ignore', '-q', '.doctrine/records/a/gate.out').code === 0 && !tracked.includes('.doctrine/records/a/gate.out') && !st.includes('SESSION_MEMORY.md') &&
    git(s.w, 'ls-files', '-v', 'SESSION_MEMORY.md').out === 'S SESSION_MEMORY.md' && git(s.w, 'show', 'HEAD:SESSION_MEMORY.md').out + '\n' !== read(path.join(s.w, 'SESSION_MEMORY.md')) &&
    tracked.includes('docs/handoffs/a.md'), JSON.stringify({ st, tracked }))
}
for (const [n, { s, file }] of Object.entries(TWINS)) {
  clause(`clause 3g — remove twin ${n}'s ${file} differs from its archived copy by sha256`, sha(path.join(s.w, file)) !== sha(path.join(s.lanes, file)) && sha(path.join(s.lanes, file)) !== null, file)
}
{
  const f = fixture({ handoffs: { a: null, c: '../outside/a.md' }, orchRecord: true })
  write(handoffOf(f, 'b'), handoffText(path.join(f.wt('a'), '.doctrine/records/a.md')))
  const text = (r) => read(handoffOf(f, r))
  clause('clause 3h — the bad handoffs carry no record line, an absolute one inside the worktree, and one outside the worktree; the first-resume fixture\'s record exists in the checkout and its worktree does not yet',
    !/^record:/m.test(text('a')) && text('b').includes(`record: \`${path.join(f.wt('a'), '.doctrine/records/a.md')}\``) && path.isAbsolute(f.wt('a')) && /^record: `\.\.\//m.test(text('c')) &&
    exists(path.join(f.repo, '.doctrine/records/a.md')) && !exists(f.wt('a')), JSON.stringify([text('a'), text('b'), text('c')]))
  const env = { ...process.env, HERDR_SHIM_DIR: f.shim }
  spawnSync(path.join(bin, 'herdr'), ['tab', 'create'], { env })
  const got = JSON.parse(spawnSync(path.join(bin, 'herdr'), ['pane', 'get', 'p1'], { env, encoding: 'utf8' }).stdout)
  clause('clause 3i — the herdr shim answers a fresh pane agent_status unknown with no agent session, as a fresh shell pane reads (L7)',
    got.result.pane.agent_status === 'unknown' && got.result.pane.agent_session === null, JSON.stringify(got))
}
{
  const f = fixture()
  const epic = read(path.join(f.repo, 'docs/epics/E1.md')) || ''
  clause('clause 3j — the member fixture\'s epic names the lane\'s worktree record under phase build-a and another, existing record under phase a',
    epic.split('\n').includes('- phase build-a: .claude/worktrees/a/.doctrine/records/a.md') && epic.split('\n').includes(`- phase a: ${OTHER}`) && exists(path.join(f.repo, OTHER)), epic)
  clause('clause 3k — before remove, the missing-record lane\'s kickoff still leads to a handoff naming the record, which is gone from the worktree and present in the archive', MISSING, String(MISSING))
  write(path.join(f.wt('a'), 'stray.txt'), 'stray\n')
  const add = git(f.repo, 'worktree', 'add', '-q', '-b', 'a', f.wt('a'), f.base)
  clause('clause 3l — on the existing-path fixture, git worktree add -b refuses the path and still makes the branch, without the command',
    add.code !== 0 && branches(f.repo).some((b) => b.startsWith('a ')), `exit ${add.code}; ${JSON.stringify(branches(f.repo))}`)
  clause('clause 3m — the base-tracks fixture\'s base tracks docs/handoffs/a.md, byte for byte the handoff create is given',
    git(TRACKS.repo, 'show', `${tracksBase}:docs/handoffs/a.md`).out + '\n' === read(handoffOf(TRACKS)), tracksBase)
  clause('clause 3n — the spaced fixture\'s worktree path holds whitespace', /\s/.test(SPACED.wt('a')), SPACED.wt('a'))
  const m = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  clause('clause 3o — the merge-base fixture\'s base is a commit and names no branch',
    git(m.repo, 'rev-parse', '--verify', '-q', `${m.base}^{commit}`).code === 0 && git(m.repo, 'show-ref', '--verify', '-q', `refs/heads/${m.base}`).code !== 0, m.base)
  clause('clause 3p — the run2 fixture\'s run is not named orchestrate and its lane.log holds the create line',
    path.basename(RUN2.run) !== 'orchestrate' && laneOf(read(RUN2.laneLog), 'a')?.worktree === RUN2.wt('a'), RUN2.run)
}

{
  // LR1, LR3: without the command, a hand-made worktree holding each file passes the old status test, git reset --hard
  // overwrites it, the ignored one is missed by ls-files --others --exclude-standard, and the newline name is quoted
  // by ls-files without -z.
  const z = path.join(CLOB.repo, '.claude/worktrees/zz')
  git(CLOB.repo, 'worktree', 'add', '-q', '-b', 'zz', z, CLOB.base)
  for (const x of ['notes.txt', '.doctrine/records/keep.txt', WEIRD]) write(path.join(z, x), 'own\n')
  const st = git(z, 'status', '--porcelain', '--untracked-files=no').out
  const std = git(z, 'ls-files', '--others', '--exclude-standard').out.split('\n')
  const all = git(z, 'ls-files', '--others').out.split('\n')
  const tree = git(z, 'ls-tree', '-r', '-z', '--name-only', clobT).out.split('\0')
  const plain = git(z, 'reset', '-q', '--hard', clobT)
  clause('clause 3q — t tracks notes.txt, the ignored keep.txt and the newline name; held untracked, the status test prints nothing, --exclude-standard misses keep.txt, ls-files without -z quotes the newline name, and a plain reset --hard overwrites all three',
    st === '' && tree.includes('notes.txt') && tree.includes('.doctrine/records/keep.txt') && tree.includes(WEIRD) && !std.includes('.doctrine/records/keep.txt') && all.includes('.doctrine/records/keep.txt') &&
    !all.includes(WEIRD) && all.includes('"we\\nird.txt"') && plain.code === 0 && ['notes.txt', '.doctrine/records/keep.txt', WEIRD].every((x) => read(path.join(z, x)) === `${x} at t\n`),
    JSON.stringify({ st, std, all, plain: plain.code }))
}
{
  // LR3: without the command, a hand-made worktree holding a file named as the directory t tracks: without -z both
  // listings quote the name, so the quoted directory prefix is not the quoted file name, and a plain reset --hard
  // replaces the file with the directory.
  const z = path.join(CLOB.repo, '.claude/worktrees/zd')
  git(CLOB.repo, 'worktree', 'add', '-q', '-b', 'zd', z, CLOB.base)
  write(path.join(z, WEIRD_DIR), 'own\n')
  const all = git(z, 'ls-files', '--others').out.split('\n')
  const tree = git(z, 'ls-tree', '-r', '--name-only', clobT).out.split('\n')
  const plain = git(z, 'reset', '-q', '--hard', clobT)
  clause('clause 3w — held untracked, the directory name is quoted "we\\nird.d" by ls-files and its file "we\\nird.d/inner.txt" by ls-tree without -z, and a plain reset --hard exits 0 and leaves a directory where the file was',
    all.includes('"we\\nird.d"') && tree.includes('"we\\nird.d/inner.txt"') && plain.code === 0 && fs.statSync(path.join(z, WEIRD_DIR)).isDirectory(),
    JSON.stringify({ all, tree, plain: plain.code }))
}
{
  const r = create(DLINK, 'a', { base: dlinkBase })
  clause('clause 1ak3 — create refuses a memory file tracked as a dangling link out of the worktree: nothing created at its target, no herdr call, no lane.log line (LR6)',
    r.code !== 0 && !exists(goneMem) && shimLog(DLINK).length === 0 && laneLines(DLINK).length === 0, `exit ${r.code} ${said(r)}; target ${exists(goneMem)}`)
  const ls = git(DLINK.repo, 'ls-tree', dlinkBase, 'SESSION_MEMORY.md').out
  const m = path.join(DLINK.repo, 'SESSION_MEMORY.md')
  clause('clause 3x — the dangling base tracks SESSION_MEMORY.md as a link: existsSync calls it absent, lstat finds it, and its target does not exist',
    ls.startsWith('120000 ') && !fs.existsSync(m) && Boolean(fs.lstatSync(m, { throwIfNoEntry: false })) && !exists(goneMem), ls)
}
{
  // LR6: the docs/handoffs link base: cat-file does not resolve a path through a tree link, so only the escape test stops the copy.
  const ls = git(HLINK.repo, 'ls-tree', hlinkBase, 'docs/handoffs').out
  const cat = git(HLINK.repo, 'cat-file', '-e', `${hlinkBase}:docs/handoffs/a.md`)
  clause('clause 3y — the handoffs-link base tracks docs/handoffs as a link to the outside directory, and cat-file -e of docs/handoffs/a.md at it fails',
    ls.startsWith('120000 ') && cat.code !== 0 && fs.realpathSync(path.join(HLINK.repo, 'docs/handoffs')) === fs.realpathSync(outsideH), ls)
}
{
  // LR1: without the command, a hand-made worktree holding nd/f untracked, where t tracks nd as a file: a plain
  // reset --hard exits 0 and nd/f is gone.
  const z = path.join(CLOB.repo, '.claude/worktrees/zn')
  git(CLOB.repo, 'worktree', 'add', '-q', '-b', 'zn', z, CLOB.base)
  write(path.join(z, 'nd/f'), 'own\n')
  const all = git(z, 'ls-files', '-z', '--others').out.split('\0')
  const plain = git(z, 'reset', '-q', '--hard', clobT)
  clause('clause 3z — held untracked, nd/f is listed by ls-files --others, t tracks nd as a file, and a plain reset --hard exits 0 and leaves nd a file with nd/f gone',
    all.includes('nd/f') && git(CLOB.repo, 'cat-file', '-t', `${clobT}:nd`).out === 'blob' && plain.code === 0 && fs.statSync(path.join(z, 'nd')).isFile() && read(path.join(z, 'nd/f')) === null,
    JSON.stringify({ all, plain: plain.code }))
}
{
  // S3: the bulk lane's names, listed by find and by ls-files --others -z, each run past 1 MB.
  const z = path.join(tmp, 'bulkproof')
  for (const b of BULK) write(path.join(z, b), 'bulk\n')
  git(z, 'init', '-q')
  const big = { encoding: 'utf8', maxBuffer: Infinity }
  const found = spawnSync('find', [z, '-type', 'f', '-print0'], big).stdout.length
  const others = spawnSync('git', ['-C', z, 'ls-files', '-z', '--others'], big).stdout.length
  clause('clause 3aa — 6000 bulk names list past 1 MB by find and by ls-files --others -z', found > 1 << 20 && others > 1 << 20, JSON.stringify({ found, others }))
}
for (const [n, { s, file, st }] of Object.entries(HIDDEN)) {
  if (n === '1y4') {
    clause(`clause 3r — remove twin ${n}'s ${file} differs from its archived copy, and git status, trimmed and cut at column 3, names SESSION_MEMORY.md for it`,
      st.trim().slice(3) === 'SESSION_MEMORY.md' && sha(path.join(s.w, file)) !== sha(path.join(s.lanes, file)), JSON.stringify(st))
  } else {
    clause(`clause 3r — remove twin ${n}'s ${file} differs from its archived copy and git status does not name it`,
      !st.includes(file) && sha(path.join(s.w, file)) !== sha(path.join(s.lanes, file)), JSON.stringify(st))
  }
}
{
  // LR1: without the command, a hand-made worktree hiding a src.txt change passes the status test, and a plain
  // reset --hard onto s, which changes src.txt, exits 128 only after anything run before it.
  for (const flag of ['--skip-worktree', '--assume-unchanged']) {
    const z = path.join(CLOB.repo, `.claude/worktrees/zs${flag.slice(2, 4)}`)
    git(CLOB.repo, 'worktree', 'add', '-q', '-b', `zs${flag.slice(2, 4)}`, z, CLOB.base)
    git(z, 'update-index', flag, 'src.txt')
    write(path.join(z, 'src.txt'), 'own\n')
    const st = git(z, 'status', '--porcelain', '--untracked-files=no').out
    const changes = git(CLOB.repo, 'diff', '--name-only', CLOB.base, clobS).out
    const plain = git(z, 'reset', '-q', '--hard', clobS)
    clause(`clause 3u — s changes src.txt; with the change hidden by ${flag.slice(2)}, the status test prints nothing and a plain reset --hard onto s exits 128`,
      st === '' && changes === 'src.txt' && plain.code === 128 && read(path.join(z, 'src.txt')) === 'own\n', JSON.stringify({ st, changes, plain: plain.code }))
  }
}
{
  const ls = git(MLINK.repo, 'ls-tree', mlinkBase, 'SESSION_MEMORY.md').out
  clause('clause 3v — the memory-link base tracks SESSION_MEMORY.md as a link whose real path is the outside file',
    ls.startsWith('120000 ') && fs.realpathSync(path.join(MLINK.repo, 'SESSION_MEMORY.md')) === fs.realpathSync(outsideMem), ls)
}
for (const name of ['a b.md', 'a|b.md']) {
  const rel = `docs/handoffs/${name}`
  clause(`clause 3s — kickoffHandoff does not read ${JSON.stringify(rel)} back from a kickoff line naming it`,
    kickoffHandoff(`## Next Session Kickoff\nhandoff: ${rel} | state: open\n`) !== rel, String(kickoffHandoff(`## Next Session Kickoff\nhandoff: ${rel} | state: open\n`)))
}
{
  const ls = git(LINKED.repo, 'ls-tree', linkedBase, 'evil').out
  const lexical = path.resolve(LINKED.wt('a'), 'evil/a.md')
  clause('clause 3t — the linked base tracks evil as a link to a directory outside the worktree, and the record path is inside the worktree as written',
    ls.startsWith('120000 ') && fs.realpathSync(path.join(LINKED.repo, 'evil')) === outside && path.relative(LINKED.wt('a'), lexical) === 'evil/a.md', ls)
}

// The refusals no other clause reaches, one fixture each.
{
  const f = fixture()
  const r = create(f, 'a', { env: { DCTR_RUN: path.join(f.root, 'no-such-run') } })
  clause('clause 1az0 — create refuses a run directory that does not exist, making nothing', madeNothing(f, 'a', r) && /the run directory .* does not exist/.test(r.err), `exit ${r.code} ${said(r)}`)
  const rn = lane(f, ['create', 'a', f.root, f.base, handoffOf(f)])
  clause('clause 1az1 — create refuses a repo argument that is no git repo, making nothing', madeNothing(f, 'a', rn) && /is not a git repo/.test(rn.err), `exit ${rn.code} ${said(rn)}`)
  git(f.repo, 'branch', 'a', f.base)
  const tipA = git(f.repo, 'rev-parse', 'refs/heads/a').out
  const rb = create(f)
  clause('clause 1az2 — create refuses when git worktree add fails, here on a branch a that already exists: no worktree, no herdr call, no lane.log line, and branch a, which it did not make, kept at its commit and never named',
    rb.code !== 0 && /dctr-lane: refused, git worktree add failed/.test(rb.err) && !rb.err.includes('the branch a') && !exists(f.wt('a')) && shimLog(f).length === 0 && laneLines(f).length === 0 &&
    git(f.repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/a').out === tipA, `exit ${rb.code} ${said(rb)}; branches ${JSON.stringify(branches(f.repo))}`)
}
{
  const s = seeded()
  write(path.join(s.w, 'SESSION_MEMORY.md'), MEMORY)
  const ra = lane(s.f, ['archive', 'a'])
  clause('clause 1az3 — archive refuses a lane whose memory file kickoff leads to no record: nothing archived, no lane.log line', ra.code !== 0 && /leads to no record inside it/.test(ra.err) && !exists(s.lanes) && laneLines(s.f).length === 1, `exit ${ra.code} ${said(ra)}`)
  const t = seeded()
  fs.rmSync(t.w, { recursive: true, force: true })
  const rr = lane(t.f, ['remove', 'a'])
  clause('clause 1az4 — remove refuses a lane whose worktree no longer exists, no lane.log line', rr.code !== 0 && /the worktree .* of a does not exist/.test(rr.err) && laneLines(t.f).length === 1, `exit ${rr.code} ${said(rr)}`)
}

// ---------------------------------------------------------------- names that are not UTF-8 (LC14)

// t\xff decodes to t�, the name of another real file, so a listing decoded as text names one file twice and the
// other never. A filesystem that refuses such a name (APFS: EILSEQ) cannot hold the fixture, and its clauses skip.
const BADNAME = Buffer.from([0x74, 0xff]), REPLACED = 't�', CAFE = 'café.txt'
const roundTrips = (b) => Buffer.from(b.toString()).equals(b)
const hasBytes = (dir, bytes) => fs.readdirSync(dir, { encoding: 'buffer' }).some((n) => n.equals(bytes))
const badPath = (w) => Buffer.concat([Buffer.from(w + '/'), BADNAME])
/** Writes t\xff into `w`: null, or EILSEQ where the filesystem refuses the name. */
const writeBad = (w) => { try { fs.writeFileSync(badPath(w), 'invalid name\n'); return null } catch (e) { if (e.code === 'EILSEQ') return e.code; throw e } }
const skip = (n, code) => console.log(`SKIP  ${n} — this filesystem refuses a name that is not UTF-8 (${code}); a filesystem that accepts one (Linux ext4) runs it`)
const NAMED = /dctr-lane: refused, .*t\\xff/
{
  const s = seeded()
  write(path.join(s.w, REPLACED), 'the valid name\n')
  const code = writeBad(s.w)
  if (code) skip('clause 1bl, 3aq0 — archive refuses a lane holding t\\xff beside t\\ufffd', code)
  else {
    const ra = lane(s.f, ['archive', 'a'])
    clause('clause 1bl — archive refuses a lane holding t\\xff beside t\\ufffd, naming the bytes: nothing archived, the worktree and both files kept, no lane.log line (LC14)',
      ra.code !== 0 && NAMED.test(ra.err) && !exists(s.lanes) && hasBytes(s.w, BADNAME) && exists(path.join(s.w, REPLACED)) && laneLines(s.f).length === 1, `exit ${ra.code} ${said(ra)}`)
    clause('clause 3aq0 — the archive fixture\'s worktree, read by readdirSync as buffers, holds the bytes 74 ff, which do not survive a UTF-8 decode and re-encode, and t\\ufffd, which does',
      hasBytes(s.w, BADNAME) && !roundTrips(BADNAME) && hasBytes(s.w, Buffer.from(REPLACED)) && roundTrips(Buffer.from(REPLACED)), JSON.stringify(fs.readdirSync(s.w, { encoding: 'buffer' }).map((n) => n.toString('hex'))))
  }
  const t = seeded()
  write(path.join(t.w, REPLACED), 'the valid name\n')
  const archived = lane(t.f, ['archive', 'a'])
  const code2 = writeBad(t.w)
  if (code2) skip('clause 1bm, 3aq1 — remove refuses a lane given t\\xff after its archive', code2)
  else {
    // read before the remove, which takes the worktree with it if it does not refuse
    const before = hasBytes(t.lanes, BADNAME), copy = exists(path.join(t.lanes, REPLACED)), both = hasBytes(t.w, BADNAME) && hasBytes(t.w, Buffer.from(REPLACED))
    const rr = lane(t.f, ['remove', 'a'])
    clause('clause 1bm — remove refuses a lane given t\\xff after an archive that held t\\ufffd, naming the bytes: the worktree kept, t\\xff intact, no lane.log line (LC14)',
      archived.code === 0 && rr.code !== 0 && NAMED.test(rr.err) && exists(t.w) && read(badPath(t.w)) === 'invalid name\n' && laneLines(t.f).length === 2,
      `archive ${archived.code}; remove ${rr.code} ${said(rr)}`)
    clause('clause 3aq1 — before that remove, the archive holds t\\ufffd and no entry named 74 ff, and the worktree holds both',
      copy && !before && both, `${copy} ${before} ${both}`)
  }
}
{
  // Every filesystem: a find on PATH that lists the real worktree and then one name ending in 74 ff.
  const fbin = path.join(tmp, 'findbin'); fs.mkdirSync(fbin)
  const realFind = spawnSync('sh', ['-c', 'command -v find'], { encoding: 'utf8' }).stdout.trim()
  fs.writeFileSync(path.join(fbin, 'find'), `#!/bin/sh\n${shq(realFind)} "$@" || exit\nprintf '%s/t\\377\\000' "$1"\n`)
  fs.chmodSync(path.join(fbin, 'find'), 0o755)
  const s = seeded()
  const ra = lane(s.f, ['archive', 'a'], { env: { PATH: `${fbin}:${bin}:${process.env.PATH}` } })
  clause('clause 1bn — archive refuses, naming the bytes, when find lists a name ending in 74 ff: nothing archived, no lane.log line (LC14)',
    ra.code !== 0 && NAMED.test(ra.err) && !exists(s.lanes) && laneLines(s.f).length === 1, `exit ${ra.code} ${said(ra)}`)
  const listed = spawnSync(path.join(fbin, 'find'), [s.w, '-path', path.join(s.w, '.git'), '-prune', '-o', '!', '-type', 'd', '-print0'])
  const names = listed.stdout.toString('latin1').split('\0').filter(Boolean).map((n) => Buffer.from(n, 'latin1'))
  clause('clause 3aq2 — without the command, the find shim exits 0 listing the worktree\'s files and last the bytes <worktree>/t ff, which do not survive a UTF-8 decode and re-encode',
    listed.status === 0 && names.at(-1)?.equals(badPath(s.w)) === true && !roundTrips(names.at(-1)) && names.some((n) => n.toString().endsWith('/src.txt')), `${listed.status} ${JSON.stringify(names.map((n) => n.toString('hex')))}`)
  // reset runs the same refusal (LA-1, LC15)
  const r = fixture(); create(r)
  const rw = r.wt('a'), rhead = head(rw), rbr = branches(r.repo)
  const rs = lane(r, ['reset', 'a', r.base], { env: { PATH: `${fbin}:${bin}:${process.env.PATH}` } })
  clause('clause 1bo — reset refuses, naming the bytes, when find lists a name ending in 74 ff: HEAD unmoved, no side branch, no lane.log line (LA-1, LC15)',
    rs.code !== 0 && NAMED.test(rs.err) && head(rw) === rhead && JSON.stringify(branches(r.repo)) === JSON.stringify(rbr) && laneLines(r).length === 1, `exit ${rs.code} ${said(rs)}`)
  const rl = spawnSync(path.join(fbin, 'find'), [rw, '-path', path.join(rw, '.git'), '-prune', '-o', '!', '-type', 'd', '-print0'])
  clause('clause 3aq4 — without the command, the find shim on the reset fixture\'s worktree exits 0 and lists last the bytes <worktree>/t ff',
    rl.status === 0 && rl.stdout.subarray(rl.stdout.lastIndexOf(0, rl.stdout.length - 2) + 1, -1).equals(badPath(rw)), `${rl.status} ${rl.stdout.toString('hex').slice(-40)}`)
}
{
  // Linux: an untracked t\xff beside t\ufffd in a lane, and the known-good twin, an untracked café.txt.
  const r = fixture(); create(r)
  const rw = r.wt('a')
  write(path.join(rw, REPLACED), 'the valid name\n')
  const code = writeBad(rw)
  if (code) skip('clause 1bp, 3aq5 — reset refuses a lane holding an untracked t\\xff beside t\\ufffd', code)
  else {
    const rhead = head(rw), rbr = branches(r.repo)
    clause('clause 3aq5 — the reset fixture\'s worktree holds the bytes 74 ff, which do not survive a UTF-8 decode and re-encode, and t\\ufffd',
      hasBytes(rw, BADNAME) && !roundTrips(BADNAME) && hasBytes(rw, Buffer.from(REPLACED)), JSON.stringify(fs.readdirSync(rw, { encoding: 'buffer' }).map((n) => n.toString('hex'))))
    const rs = lane(r, ['reset', 'a', r.base])
    clause('clause 1bp — reset refuses a lane holding an untracked t\\xff beside t\\ufffd, naming the bytes: HEAD unmoved, both files kept, no side branch, no lane.log line (LA-1, LC15)',
      rs.code !== 0 && NAMED.test(rs.err) && head(rw) === rhead && hasBytes(rw, BADNAME) && exists(path.join(rw, REPLACED)) && JSON.stringify(branches(r.repo)) === JSON.stringify(rbr) && laneLines(r).length === 1, `exit ${rs.code} ${said(rs)}`)
  }
  const g = fixture(); create(g)
  const gw = g.wt('a')
  write(path.join(gw, CAFE), 'accented\n')
  const gs = lane(g, ['reset', 'a', g.base])
  clause('clause 2ah — reset of a lane holding an untracked café.txt exits 0 and keeps it (LA-1, LC15)',
    gs.code === 0 && read(path.join(gw, CAFE)) === 'accented\n' && laneLines(g).length === 2, `exit ${gs.code} ${said(gs)}`)
}
{
  // The known-good twin: a valid non-ASCII name archives and removes.
  const s = seeded()
  write(path.join(s.w, CAFE), 'accented\n')
  const ra = lane(s.f, ['archive', 'a'])
  const copied = sha(path.join(s.lanes, CAFE)) === sha(path.join(s.w, CAFE)) && sha(path.join(s.lanes, CAFE)) !== null
  const rr = lane(s.f, ['remove', 'a'])
  clause('clause 2ag — archive then remove of a lane holding café.txt: archive exits 0 with an equal sha256 copy, and remove exits 0 with the worktree gone (LC14)',
    ra.code === 0 && copied && rr.code === 0 && !exists(s.w), `archive ${ra.code} ${said(ra)}; copied ${copied}; remove ${rr.code} ${said(rr)}`)
  clause('clause 3aq3 — café.txt\'s name bytes survive a UTF-8 decode and re-encode', roundTrips(Buffer.from(CAFE)) && Buffer.from(CAFE).length === CAFE.length + 1, Buffer.from(CAFE).toString('hex'))
}

// ---------------------------------------------------------------- index names that are not UTF-8 (LA-1, LC16)

// The index stores a name as bytes, so an entry t\xff can be made where the filesystem refuses the file. Decoded, it
// reads as t�; a tracked decoy t� with the entry's bytes then passes for it, and a deletion of t\xff that
// skip-worktree or assume-unchanged hides from git status goes unseen.
const gitIn = (cwd, args, input) => spawnSync('git', args, { cwd, input, env: { ...process.env, ...GIT_ENV } })
const nul = (b) => Buffer.concat([b, Buffer.from([0])])
const hideIndexed = (w, flag) => gitIn(w, ['update-index', flag, '-z', '--stdin'], nul(BADNAME))
/** Commits into lane `w` an index entry t\xff and a tracked decoy t�, both holding 'invalid name\n', with no t\xff
 *  file written, and marks the entry `flag`: on any filesystem, a deletion git status cannot see. */
const indexBad = (w, flag = '--skip-worktree') => {
  write(path.join(w, REPLACED), 'invalid name\n'); git(w, 'add', REPLACED)
  const blob = git(w, 'hash-object', '-w', REPLACED).out
  gitIn(w, ['update-index', '-z', '--index-info'], nul(Buffer.concat([Buffer.from(`100644 ${blob}\t`), BADNAME])))
  git(w, 'commit', '-qm', 'tracked t\\xff and its decoy')
  hideIndexed(w, flag)
}
/** Without the command: `w`'s index holds t\xff tagged `tag` with the decoy's blob, no t\xff is on disk, the decoy
 *  is, t\xff does not survive a UTF-8 decode and re-encode, and the status test prints nothing. */
const carriesHidden = (w, tag) => {
  const out = gitIn(w, ['ls-files', '-v', '-s', '-z']).stdout, entries = []
  for (let at = 0, end; (end = out.indexOf(0, at)) >= 0; at = end + 1) entries.push(out.subarray(at, end))
  const e = entries.find((b) => b.subarray(b.indexOf(9) + 1).equals(BADNAME))
  const m = e && /^(\S) \d+ ([0-9a-f]+) /.exec(e.toString('latin1'))
  return Boolean(m) && m[1] === tag && m[2] === git(w, 'hash-object', REPLACED).out && !hasBytes(w, BADNAME) && exists(path.join(w, REPLACED)) &&
    !roundTrips(BADNAME) && git(w, 'status', '--porcelain', '--untracked-files=no').out === ''
}
{
  // Every filesystem: the entry is made in the index alone.
  const s = seeded()
  indexBad(s.w)
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause('clause 1bq — remove refuses, naming the bytes, a lane whose index holds t\\xff deleted under skip-worktree beside a tracked t\\ufffd of the same bytes: the worktree kept, no remove line (LA-1, LC16)',
    ra.code === 0 && rr.code !== 0 && NAMED.test(rr.err) && exists(s.w) && laneLines(s.f).length === 2, `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
  const r = fixture(); create(r)
  const rw = r.wt('a')
  indexBad(rw)
  const rhead = head(rw), rbr = branches(r.repo)
  clause('clause 3aq6 — without the command, the index fixture\'s index holds t\\xff tagged S with the decoy\'s blob, no t\\xff is on disk, t\\ufffd is, and the status test prints nothing',
    carriesHidden(rw, 'S'), gitIn(rw, ['ls-files', '-v', '-s', '-z']).stdout.toString('hex'))
  const rs = lane(r, ['reset', 'a', rhead])
  clause('clause 1br — reset refuses, naming the bytes, a lane whose index holds t\\xff deleted under skip-worktree beside a tracked t\\ufffd of the same bytes: HEAD unmoved, no side branch, no lane.log line (LA-1, LC16)',
    rs.code !== 0 && NAMED.test(rs.err) && head(rw) === rhead && JSON.stringify(branches(r.repo)) === JSON.stringify(rbr) && laneLines(r).length === 1, `exit ${rs.code} ${said(rs)}`)
  // the known-good twin: a tracked café.txt under skip-worktree, untouched
  const g = seeded()
  commitIn(g.w, CAFE, 'accented\n', 'café'); git(g.w, 'update-index', '--skip-worktree', CAFE)
  const tag = git(g.w, '-c', 'core.quotepath=false', 'ls-files', '-v', CAFE).out
  const ga = lane(g.f, ['archive', 'a']), gr = lane(g.f, ['remove', 'a'])
  clause('clause 2ai — archive then remove of a lane holding a tracked café.txt under skip-worktree both exit 0, the worktree gone (LA-1, LC16)',
    ga.code === 0 && gr.code === 0 && !exists(g.w), `archive ${ga.code} ${said(ga)}; remove ${gr.code} ${said(gr)}`)
  const h = fixture(); create(h)
  const hw = h.wt('a')
  commitIn(hw, CAFE, 'accented\n', 'café'); git(hw, 'update-index', '--skip-worktree', CAFE)
  const hs = lane(h, ['reset', 'a', h.base])
  clause('clause 2aj — reset of a lane holding a tracked café.txt under skip-worktree moves to the base (LA-1, LC16)',
    hs.code === 0 && head(hw) === h.base, `exit ${hs.code} ${said(hs)}`)
  clause('clause 3aq7 — the twin\'s café.txt index entry is tagged S and its name survives a UTF-8 decode and re-encode', tag === `S ${CAFE}` && roundTrips(Buffer.from(CAFE)), JSON.stringify(tag))
}
for (const [flag, tag] of [['--skip-worktree', 'S'], ['--assume-unchanged', 'h']]) {
  // Linux: t\xff written on disk and committed, then hidden by `flag` and deleted.
  const r = fixture(); create(r)
  const rw = r.wt('a')
  write(path.join(rw, REPLACED), 'invalid name\n')
  const code = writeBad(rw)
  if (code) { skip(`clause 1bs, 1bt, 3aq8 — remove and reset refuse a lane whose t\\xff, committed on disk, was deleted under ${flag.slice(2)}`, code); continue }
  git(rw, 'add', '-A'); git(rw, 'commit', '-qm', 'c1')
  const c1 = head(rw)
  fs.writeFileSync(badPath(rw), 'next\n'); git(rw, 'add', '-A'); git(rw, 'commit', '-qm', 'c2')
  const c2 = head(rw)
  git(rw, 'reset', '-q', '--hard', c1)
  hideIndexed(rw, flag); fs.unlinkSync(badPath(rw))
  const rbr = branches(r.repo)
  clause(`clause 3aq8 — without the command, the ${flag.slice(2)} disk fixture's index holds t\\xff tagged ${tag} with the decoy's blob, the file is gone, and the status test prints nothing`,
    carriesHidden(rw, tag) && head(rw) === c1, gitIn(rw, ['ls-files', '-v', '-s', '-z']).stdout.toString('hex'))
  const rs = lane(r, ['reset', 'a', c2])
  clause(`clause 1bs — reset to a revision that changes t\\xff refuses a lane whose t\\xff was deleted under ${flag.slice(2)} beside t\\ufffd: HEAD at c1, t\\xff still absent, no side branch, no lane.log line (LA-1, LC16, E15-D165)`,
    rs.code !== 0 && NAMED.test(rs.err) && head(rw) === c1 && !hasBytes(rw, BADNAME) && JSON.stringify(branches(r.repo)) === JSON.stringify(rbr) && laneLines(r).length === 1, `exit ${rs.code} ${said(rs)}`)
  const s = seeded()
  write(path.join(s.w, REPLACED), 'invalid name\n'); writeBad(s.w)
  git(s.w, 'add', '-A'); git(s.w, 'commit', '-qm', 'c1')
  hideIndexed(s.w, flag); fs.unlinkSync(badPath(s.w))
  const ra = lane(s.f, ['archive', 'a']), rr = lane(s.f, ['remove', 'a'])
  clause(`clause 1bt — remove refuses a lane whose t\\xff, committed on disk, was deleted under ${flag.slice(2)} beside t\\ufffd: the worktree kept, no remove line (LA-1, LC16)`,
    ra.code === 0 && rr.code !== 0 && NAMED.test(rr.err) && exists(s.w) && laneLines(s.f).length === 2, `archive ${ra.code} ${said(ra)}; remove ${rr.code} ${said(rr)}`)
}

// ---------------------------------------------------------------- a memory file reset cannot read (LC19)

for (const [kind, spoil, mend] of [
  ['at mode 000', (m) => fs.chmodSync(m, 0), (m) => fs.chmodSync(m, 0o644)],
  ['a directory', (m) => { fs.rmSync(m); fs.mkdirSync(m) }, () => {}],
]) {
  const f = fixture({ memory: 'untracked' }); create(f)
  const w = f.wt('a'), m = path.join(w, 'SESSION_MEMORY.md')
  write(m, MEMORY)
  const old = commitIn(w, 'lane.txt', 'lane work\n', 'lane commit'), br = branches(f.repo)
  spoil(m)
  let readErr = null
  try { fs.readFileSync(m) } catch (e) { readErr = e.code }
  clause(`clause 3ar — without the command, the memory file ${kind} cannot be read (${readErr}), and the process is not root`,
    readErr !== null && readErr !== 'ENOENT' && process.getuid?.() !== 0, `read ${readErr}, uid ${process.getuid?.()}`)
  const r = lane(f, ['reset', 'a', f.base])
  mend(m)
  clause(`clause 1bu — reset refuses a lane whose memory file is ${kind}, naming the file and the error: HEAD unmoved, no side branch, no lane.log line (LC19)`,
    r.code === 1 && /dctr-lane: refused, the memory file .*SESSION_MEMORY\.md could not be read \((EACCES|EISDIR)\)/.test(r.err) && !/a-was-/.test(r.err) &&
      head(w) === old && JSON.stringify(branches(f.repo)) === JSON.stringify(br) && laneLines(f).length === 1,
    `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
}
{
  // the known-good twin: the same lane with a readable memory file resets and prints its side branch
  const f = fixture({ memory: 'untracked' }); create(f)
  const w = f.wt('a')
  write(path.join(w, 'SESSION_MEMORY.md'), MEMORY)
  const old = commitIn(w, 'lane.txt', 'lane work\n', 'lane commit')
  const r = lane(f, ['reset', 'a', f.base])
  clause('clause 2ak — reset of the same lane with a readable memory file exits 0, prints a-was-<sha>, moves HEAD and keeps the bytes (LC19)',
    r.code === 0 && r.out.trim() === `a-was-${old.slice(0, 12)}` && head(w) === f.base && read(path.join(w, 'SESSION_MEMORY.md')) === MEMORY && laneLines(f).length === 2,
    `exit ${r.code} ${said(r)}`)
}

// ---------------------------------------------------------------- a lane.log append that fails after the work is done

{
  const lock = (f) => fs.chmodSync(f.laneLog, 0o444)
  // reset: HEAD has moved and the side branch exists, so the failure names both
  const r = fixture(); create(r)
  const rw = r.wt('a'), old = commitIn(rw, 'lane.txt', 'lane work\n', 'lane commit'), side = `a-was-${old.slice(0, 12)}`
  lock(r)
  let appendErr = null
  try { fs.appendFileSync(r.laneLog, 'x\n') } catch (e) { appendErr = e.code }
  clause('clause 3ar3 — without the command, appending to the lane.log at mode 444 fails (EACCES), the process not being root',
    appendErr === 'EACCES' && process.getuid?.() !== 0, `append ${appendErr}`)
  const rs = lane(r, ['reset', 'a', r.base])
  clause('clause 1bv — reset whose lane.log append fails exits 1 naming the side branch and the revision, HEAD at the revision and the branch at the old HEAD, no lane.log line',
    rs.code === 1 && rs.err.includes(`reset failed, lane.log could not be written (EACCES); the old HEAD is on ${side}, and HEAD is at ${r.base}`) &&
      head(rw) === r.base && git(rw, 'rev-parse', side).out === old && laneLines(r).length === 1, `exit ${rs.code} ${said(rs)}`)
  // archive: the copies and the repointed epic are made, so the failure names them
  const a = seeded(); lock(a.f)
  const ra = lane(a.f, ['archive', 'a'])
  clause('clause 1bv2 — archive whose lane.log append fails exits 1 naming the copies\' directory and the repointed epic, the record copied, no archive line',
    ra.code === 1 && ra.err.includes(`archive failed, lane.log could not be written (EACCES); the copies are in ${a.lanes}, and ${path.join(a.f.repo, 'docs/epics/E1.md')} repointed`) &&
      exists(path.join(a.lanes, '.doctrine/records/a.md')) && laneLines(a.f).length === 1, `exit ${ra.code} ${said(ra)}`)
  // remove: the worktree is gone, so the failure names it
  const m = seeded()
  const ma = lane(m.f, ['archive', 'a'])
  lock(m.f)
  const rm = lane(m.f, ['remove', 'a'])
  clause('clause 1bv3 — remove whose lane.log append fails exits 1 naming the worktree it removed, the worktree gone and its branch kept, no remove line',
    ma.code === 0 && rm.code === 1 && rm.err.includes(`remove failed, lane.log could not be written (EACCES); ${m.w} is removed and its branch kept`) &&
      !exists(m.w) && branches(m.f.repo).some((b) => b.startsWith('a ')) && laneLines(m.f).length === 2, `archive ${ma.code}; remove ${rm.code} ${said(rm)}`)
}

// ---------------------------------------------------------------- a Records repo whose name ends in a space (LC20)

for (const name of ['rec ', 'recB']) {
  const f = fixture(); create(f)
  const rr = path.join(f.root, name)
  fs.mkdirSync(rr); git(rr, 'init', '-q', '-b', 'main')
  write(path.join(rr, 'docs/PROJECT.md'), PROJECT); write(path.join(rr, 'docs/epics/E1.md'), EPIC('x/y.md'))
  git(rr, 'add', '-A'); git(rr, 'commit', '-qm', 'p')
  const run = path.join(rr, '.doctrine/records/orchestrate')
  write(path.join(run, 'model/a'), 'claude-opus-5-5\n')
  // lane.log moves with the run, so the create line goes there
  write(path.join(run, 'lane.log'), read(f.laneLog))
  const g = { ...f, run, laneLog: path.join(run, 'lane.log') }
  const raw = spawnSync('git', ['-C', path.dirname(run), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).stdout
  if (name === 'rec ') clause('clause 3ar2 — without the command, git prints the Records repo\'s toplevel ending "rec \\n", and trimmed it names a directory with no docs/PROJECT.md',
    raw.endsWith('rec \n') && !exists(path.join(raw.trim(), 'docs/PROJECT.md')) && exists(path.join(raw.slice(0, -1), 'docs/PROJECT.md')), JSON.stringify(raw))
  const r = lane(g, ['archive', 'a'])
  clause(`clause 2al — archive with the Records repo named ${JSON.stringify(name)} exits 0 and copies the record into ${JSON.stringify(name)}/.doctrine/records/lanes/a/ (LC20)`,
    r.code === 0 && exists(path.join(rr, '.doctrine/records/lanes/a/.doctrine/records/a.md')), `exit ${r.code} ${said(r)}`)
}
// ---------------------------------------------------------------- every refusal is reached (LC5's class)

/** The message templates of every refuse( call in `src`, each as a regex over the stderr it prints: a `${...}` part
 *  matches anything, the rest literally. */
function refusals(src) {
  const out = []
  for (let i = src.indexOf('refuse('); i >= 0; i = src.indexOf('refuse(', i + 1)) {
    const q = src[i + 7]
    if (q !== '`' && q !== "'") continue
    let j = i + 8, body = '', depth = 0
    for (; j < src.length; j++) {
      const c = src[j]
      if (depth === 0 && c === q) break
      if (q === '`' && depth === 0 && c === '$' && src[j + 1] === '{') { depth = 1; body += '\u0000'; j++; continue }
      if (depth > 0) { if (c === '{') depth++; else if (c === '}') depth--; continue }
      if (c === '\\') { body += src[j + 1] === 'n' ? '\n' : src[j + 1]; j++; continue }
      body += c
    }
    const line = src.slice(0, i).split('\n').length
    out.push({ line, text: body.replaceAll('\u0000', '…'), re: new RegExp('dctr-lane: refused, ' + body.split('\u0000').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*?')) })
  }
  return out
}
const unreached = (src, said) => refusals(src).filter((r) => !said.some((e) => r.re.test(e)))
{
  const src = fs.readFileSync(LANE, 'utf8')
  const missed = unreached(src, SAID)
  clause('clause 1ay — every refuse( message in dctr-lane.mjs is printed by some clause\'s run of it (LC5)',
    refusals(src).length > 0 && missed.length === 0, `no clause reaches: ${missed.map((r) => `:${r.line} ${JSON.stringify(r.text)}`).join('; ')}`)
  const tampered = src.replace("const run = runRoot()\n", "const run = runRoot()\nif (process.env.NEVER_SET) refuse(`a refusal ${'no'} clause reaches`)\n")
  const added = unreached(tampered, SAID).map((r) => r.text).filter((t) => !missed.some((m) => m.text === t))
  clause('clause 1ay2 — the coverage check names a refusal added where no clause reaches it, and only that one',
    tampered !== src && added.join() === 'a refusal … clause reaches', JSON.stringify(added))
  clause('clause 3ab — the tampered source carries one refuse( call more than dctr-lane.mjs, without the coverage check',
    tampered.split('refuse(`').length === src.split('refuse(`').length + 1, '')
}

spawnSync('chmod', ['-R', 'u+rwx', tmp])
fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) failed` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
