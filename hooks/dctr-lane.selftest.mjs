// Three-clause tamper test for the lane worktree command, hooks/dctr-lane.mjs, per CLAUDE.md.
//
//   node hooks/dctr-lane.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Drives dctr-lane.mjs end to end over real git fixture repos under one temp dir, with GIT_CEILING_DIRECTORIES at
// that dir, TMPDIR inside it, and a logging herdr shim first on PATH that plays the new pane. Clause 1 confirms each
// refusal refuses and makes nothing (the failed-create partial excepted, which leaves its worktree and says so);
// clause 2 confirms create, reset, archive and remove do what the seams say, the launch line and the restore-hook and
// prompt-gate chain a create sets up included; clause 3 proves the fixtures carry what those clauses rest on without
// running dctr-lane.mjs. laneOf, the pure lane.log reader in dctr-lib.mjs, is pinned here too.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { laneOf, LANE_LINE, RESUME_LINE, kickoffHandoff, followKickoff } from './dctr-lib.mjs'
import { parseDoc } from './dctr-project.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const HERE = import.meta.dirname
const LANE = path.join(HERE, 'dctr-lane.mjs')
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-lane-')))
const childTmp = path.join(tmp, 't'); fs.mkdirSync(childTmp)
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const cbin = path.join(tmp, 'cbin'); fs.mkdirSync(cbin)

// The herdr shim: a fresh pane reads agent_status unknown with no agent session; after each typing call it reads
// working for two reads and then idle with a session. HERDR_SHIM_MODE changes one answer per fixture. Every call is
// logged with what it answered and whether lane.log and the watched files existed at that moment.
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const dir = process.env.HERDR_SHIM_DIR, mode = process.env.HERDR_SHIM_MODE || 'normal'
const args = process.argv.slice(2)
const stFile = path.join(dir, 'state.json')
let st = { n: 0, panes: {} }
try { st = JSON.parse(fs.readFileSync(stFile, 'utf8')) } catch {}
let out = '', err = '', code = 0, read = null, session = null, made = null
const watch = JSON.parse(process.env.HERDR_SHIM_WATCH || '[]').map((f) => fs.existsSync(f))
if (args[0] === 'tab' && args[1] === 'create') {
  if (mode === 'tab-fail') { code = 1; err = 'transport down' }
  else { const id = 'p' + (++st.n); st.panes[id] = { typed: 0, busy: 0 }; made = { tab: 't' + st.n, pane: id }; out = JSON.stringify({ result: { tab: { tab_id: made.tab }, root_pane: { pane_id: id } } }) }
} else if (args[0] === 'pane' && args[1] === 'get') {
  const p = st.panes[args[2]]
  if (mode === 'get-fail') { code = 1; err = 'transport down' }
  else if (mode === 'get-empty') out = ''
  else if (!p || mode === 'gone') { code = 1; err = JSON.stringify({ error: { code: 'pane_not_found' } }) }
  else {
    let status
    if (p.typed === 0) { status = ['agent-before', 'idle-before'].includes(mode) ? 'idle' : 'unknown'; session = ['agent-before', 'session-before'].includes(mode) ? 'old' : null }
    else if (p.busy > 0) { p.busy--; status = 'working'; session = 's1' }
    else { status = mode === 'stuck-after' ? 'working' : 'idle'; session = 's1' }
    read = status
    out = JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: status, agent_session: session ? { value: session } : null, focused: false } } })
  }
} else if (args[0] === 'pane' && args[1] === 'run') {
  const p = st.panes[args[2]]
  if (p) { p.typed++; p.busy = 2 }
  out = JSON.stringify({ result: {} })
} else out = JSON.stringify({ result: {} })
fs.writeFileSync(stFile, JSON.stringify(st))
fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ args, read, session, made, laneLog: fs.existsSync(process.env.HERDR_SHIM_LANELOG || '/nonexistent'), watch }) + '\\n')
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

const lane = (f, args, { cwd = f.repo, env = {}, unset = [] } = {}) => {
  const e = {
    ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp, DCTR_ROLE: 'orchestrator', DCTR_RUN: f.run,
    HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_SHIM_DIR: f.shim, HERDR_SHIM_LANELOG: f.laneLog, CLAUDE_CONFIG_DIR: '/x',
    DCTR_LANE_TIMES: JSON.stringify({ poll: 5, ready: 1500 }), ...env,
  }
  for (const k of ['DCTR_VIEW_REQUEST_DIR', 'HERDR_PANE_ID', 'CLAUDE_PROJECT_DIR', 'DCTR_CALLER', ...unset]) if (!(k in env) || unset.includes(k)) delete e[k]
  const r = spawnSync('node', [LANE, ...args], { cwd, env: e, encoding: 'utf8', maxBuffer: Infinity })
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
const madeNothing = (f, role, r) => r.code !== 0 && !exists(f.wt(role)) && shimLog(f).length === 0 && laneLines(f).length === 0 &&
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
  launchA?.pane === 'p1' && launchA.worktree === wtA && launchA.caller === 'orchestrator' && lineA.endsWith(` ${launchA.launch}`) && launchA.launch.startsWith('cd '),
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
}

// ---------------------------------------------------------------- clause 2: the first resume (E15-D160)

{
  const R = fixture({ orchRecord: true })
  const r = create(R)
  const pane = laneOf(read(R.laneLog), 'a')?.pane
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: childTmp, HERDR_PANE_ID: pane || 'none', HERDR_SHIM_DIR: R.shim }
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
  clause(`clause ${n} — create refuses unless runRole() is orchestrator (${why}), making nothing and calling herdr zero times (L5)`, madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
}
{
  const f = fixture()
  const r = create(f, 'a', { env: { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'views') } })
  clause('clause 1d — contained (DCTR_VIEW_REQUEST_DIR set), create refuses, making nothing and calling herdr zero times (L5)', madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
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
    lines[0].split(' ')[4] === pane && lines[0].split(' ')[5] === f.wt('a') && launch.startsWith(`cd '${f.wt('a')}' && env DCTR_ROLE='a' `) && launch.includes(' claude --model ') &&
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
for (const [n, rec, why] of [['1f', null, 'names no record'], ['1g', 'ABSOLUTE', 'names it by an absolute path, one inside the worktree'], ['1h', '../outside/a.md', 'names a path outside the worktree']]) {
  const f = fixture({ handoffs: { a: rec } })
  if (rec === 'ABSOLUTE') write(handoffOf(f), handoffText(path.join(f.wt('a'), '.doctrine/records/a.md')))
  const r = create(f)
  clause(`clause ${n} — create refuses a handoff that ${why}, making nothing`, madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
}
{
  const f = fixture()
  const bads = [['an unknown subcommand', ['move', 'a']], ['create with three arguments', ['create', 'a', f.repo, f.base]], ['a base that is no commit', ['create', 'a', f.repo, 'no-such-rev', handoffOf(f)]],
    ['a handoff that does not exist', ['create', 'a', f.repo, f.base, path.join(f.repo, 'docs/handoffs/none.md')]], ['a role that is not a name', ['create', 'A b', f.repo, f.base, handoffOf(f)]],
    ['the role orchestrator', ['create', 'orchestrator', f.repo, f.base, handoffOf(f)]], ['a role that climbs out of .claude/worktrees', ['create', '../up', f.repo, f.base, handoffOf(f)]]]
  for (const [why, args] of bads) {
    const r = lane(f, args)
    clause(`clause 1i — dctr-lane.mjs refuses ${why}, making nothing`, r.code !== 0 && !exists(path.join(f.repo, '.claude')) && shimLog(f).length === 0 && laneLines(f).length === 0, `exit ${r.code} ${said(r)}`)
  }
  const r = create(f, 'a', { unset: ['HERDR_WORKSPACE_ID'] })
  clause('clause 1j — create refuses with no herdr workspace, making nothing', madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
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
  // No single-anchor mutation pins the held-branch check in dctr-lane.mjs: git worktree add refuses a held branch
  // itself, making nothing, in every held case a fixture can build, a worktree whose directory is gone among them.
  clause('clause 1l — create merge refuses while the repo\'s own checkout holds the integration branch: worktrees unchanged, no herdr call, no lane.log line (E15-D167)',
    r.code !== 0 && git(one.repo, 'worktree', 'list', '--porcelain').out === before && shimLog(one).length === 0 && laneLines(one).length === 0, `exit ${r.code} ${said(r)}`)
  const comp = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const code = path.join(comp.root, 'code')
  git(comp.root, 'init', '-q', '-b', 'main', code); commitIn(code, 'x.txt', 'x\n', 'code base')
  const before2 = git(code, 'worktree', 'list', '--porcelain').out
  const r2 = lane(comp, ['create', 'merge', code, 'main', handoffOf(comp, 'merge')], { cwd: comp.repo })
  clause('clause 1m — create merge from a companion repo refuses while the code repo\'s primary checkout holds the integration branch (E15-D167)',
    r2.code !== 0 && git(code, 'worktree', 'list', '--porcelain').out === before2 && shimLog(comp).length === 0 && laneLines(comp).length === 0, `exit ${r2.code} ${said(r2)}`)
}

// The failed-create partial (L6) and readiness (L7): each leaves the worktree, names it, writes no lane.log line.
for (const [n, mode, typed, why] of [['1n', 'get-fail', 0, 'pane get fails every read'], ['1o', 'get-empty', 0, 'pane get answers nothing'],
  ['1p', 'agent-before', 0, 'the new pane already reads an agent session'], ['1q', 'stuck-after', 1, 'the pane never reads ready after the launch line'],
  ['1bd', 'session-before', 0, 'the new pane reads agent_status unknown and already holds an agent session'],
  ['1be', 'idle-before', 0, 'the new pane holds no agent session and reads idle, not unknown']]) {
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: mode } })
  const t = shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run').length
  clause(`clause ${n} — when ${why}, create exits non-zero naming the worktree it made, leaves it, types ${typed} line${typed === 1 ? '' : 's'} and writes no lane.log line (L6, L7)`,
    r.code !== 0 && exists(f.wt('a')) && (r.out + r.err).includes(f.wt('a')) && t === typed && laneLines(f).length === 0, `exit ${r.code} ${said(r)}; typed ${t}`)
  const again = create(f, 'a')
  clause(`clause ${n}2 — a second create of that role then refuses`, again.code !== 0 && laneLines(f).length === 0, `exit ${again.code} ${said(again)}`)
}
// The failed create (E15-D203 to D206, D220): herdr fails tab create after the worktree is made; a second create of
// the role, with tab create answering, then refuses.
{
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: 'tab-fail' } })
  const listed = git(f.repo, 'worktree', 'list', '--porcelain').out
  clause('clause 1r — a create whose tab create fails after the worktree is made appends no line to lane.log (E15-D203)', laneLines(f).length === 0 && !exists(f.laneLog), JSON.stringify(read(f.laneLog)))
  clause('clause 1r2 — it leaves the worktree, which git worktree list still lists (E15-D204)', exists(f.wt('a')) && listed.includes(`worktree ${f.wt('a')}\n`), listed)
  clause('clause 1r3 — it exits non-zero (E15-D205)', r.code !== 0, `exit ${r.code}`)
  clause('clause 1r4 — its output names the worktree by its absolute path (E15-D220)', (r.out + r.err).includes(f.wt('a')), said(r))
  const calls = shimLog(f).length
  const again = create(f, 'a')
  clause('clause 1r5 — a second create of the role, tab create answering, refuses: no herdr call, no lane.log line, worktrees unchanged (E15-D206)',
    again.code !== 0 && shimLog(f).length === calls && laneLines(f).length === 0 && git(f.repo, 'worktree', 'list', '--porcelain').out === listed, `exit ${again.code} ${said(again)}`)
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
  clause('clause 1s — a create whose record cannot be written after the worktree is made calls herdr zero times, leaves the worktree, names it, and writes no lane.log line (L6, L8)',
    r.code !== 0 && exists(f.wt('a')) && (r.out + r.err).includes(f.wt('a')) && shimLog(f).length === 0 && laneLines(f).length === 0, `exit ${r.code} ${said(r)}`)
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
  clause('clause 1ac — create refuses when the worktree path already exists, making no branch, no herdr call and no lane.log line',
    r.code !== 0 && !branches(f.repo).some((b) => b.startsWith('a ')) && shimLog(f).length === 0 && laneLines(f).length === 0 && !exists(path.join(f.wt('a'), '.git')), `exit ${r.code} ${said(r)}; branches ${JSON.stringify(branches(f.repo))}`)
}

// A base that already tracks the handoff's copy path.
const TRACKS = fixture()
git(TRACKS.repo, 'add', 'docs/handoffs/a.md'); git(TRACKS.repo, 'commit', '-qm', 'track the handoff')
const tracksBase = head(TRACKS.repo)
{
  const r = create(TRACKS, 'a', { base: tracksBase })
  clause('clause 1ad — create refuses a base that already tracks docs/handoffs/<the handoff>, making nothing', madeNothing(TRACKS, 'a', r), `exit ${r.code} ${said(r)}`)
}

// A worktree path holding whitespace, a merge base that is a commit and no branch, and a run not named orchestrate.
const SPACED = fixture({ rootName: ' spaced' })
{
  const r = create(SPACED)
  clause('clause 1ae — create refuses a worktree path holding whitespace, making nothing', madeNothing(SPACED, 'a', r), `exit ${r.code} ${said(r)}`)
  const f = fixture({ branch: 'orch', handoffs: { merge: '.doctrine/records/merge.md' } })
  const rm = lane(f, ['create', 'merge', f.repo, f.base, handoffOf(f, 'merge')])
  clause('clause 1af — create merge refuses a base that is a commit and not a branch, making nothing', madeNothing(f, 'merge', rm), `exit ${rm.code} ${said(rm)}`)
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
  clause(`clause 1aj — create refuses a handoff named ${JSON.stringify(name)}, which the kickoff line cannot carry, making nothing (LR5)`, madeNothing(f, 'a', r), `exit ${r.code} ${said(r)}`)
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
  clause('clause 1al — when pane get answers pane_not_found, create fails at that first read, types nothing and writes no lane.log line (L7)',
    r.code !== 0 && gets === 1 && exists(f.wt('a')) && laneLines(f).length === 0, `exit ${r.code} ${said(r)}; pane gets ${gets}`)
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
  const rb = create(f)
  clause('clause 1az2 — create refuses when git worktree add fails, here on a branch a that already exists: no worktree, no herdr call, no lane.log line',
    rb.code !== 0 && /git worktree add failed/.test(rb.err) && !exists(f.wt('a')) && shimLog(f).length === 0 && laneLines(f).length === 0, `exit ${rb.code} ${said(rb)}`)
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
