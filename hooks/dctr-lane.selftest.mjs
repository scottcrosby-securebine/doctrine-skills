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
let out = '', err = '', code = 0, read = null
const watch = JSON.parse(process.env.HERDR_SHIM_WATCH || '[]').map((f) => fs.existsSync(f))
if (args[0] === 'tab' && args[1] === 'create') {
  if (mode === 'tab-fail') { code = 1; err = 'transport down' }
  else { const id = 'p' + (++st.n); st.panes[id] = { typed: 0, busy: 0 }; out = JSON.stringify({ result: { tab: { tab_id: 't' + st.n }, root_pane: { pane_id: id } } }) }
} else if (args[0] === 'pane' && args[1] === 'get') {
  const p = st.panes[args[2]]
  if (mode === 'get-fail') { code = 1; err = 'transport down' }
  else if (mode === 'get-empty') out = ''
  else if (!p) { code = 1; err = JSON.stringify({ error: { code: 'pane_not_found' } }) }
  else {
    let status, session
    if (p.typed === 0) { status = mode === 'agent-before' ? 'idle' : 'unknown'; session = mode === 'agent-before' ? 'old' : null }
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
fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ args, read, laneLog: fs.existsSync(process.env.HERDR_SHIM_LANELOG || '/nonexistent'), watch }) + '\\n')
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
- Coverage: a: satisfy

## Members
- phase a: ${member}

## Rulings and returns
### R1 ruling, 2026-11-08T00:00:00Z
Kind: baseline
Items: D1
By: owner
> approved
`

let fixtureN = 0
/** An orchestrator repo: tracked memory file (unless `memory` is 'untracked' or 'ignored'), a .gitignore excluding
 *  its Records path, a tracked source file, a project file and epic, the first handoffs under docs/handoffs/ (not
 *  tracked), a run under Records with a model file per role. `branch` is the checkout's branch after the base. */
function fixture({ memory = 'tracked', branch = 'main', handoffs = { a: '.doctrine/records/a.md' }, orchRecord = false } = {}) {
  const root = path.join(tmp, `f${++fixtureN}`)
  const repo = path.join(root, 'orch')
  fs.mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  write(path.join(repo, '.gitignore'), '.doctrine/records/\n.claude/\n' + (memory === 'ignored' ? 'SESSION_MEMORY.md\n' : ''))
  write(path.join(repo, 'src.txt'), 'source\n')
  write(path.join(repo, 'docs/PROJECT.md'), PROJECT)
  write(path.join(repo, 'docs/epics/E1.md'), EPIC('.claude/worktrees/a/.doctrine/records/a.md'))
  if (memory === 'tracked') write(path.join(repo, 'SESSION_MEMORY.md'), MEMORY)
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base')
  const base = git(repo, 'rev-parse', 'HEAD').out
  if (branch !== 'main') git(repo, 'checkout', '-q', '-b', branch)
  for (const [role, rec] of Object.entries(handoffs)) write(path.join(repo, 'docs/handoffs', `${role}.md`), handoffText(rec, role))
  if (orchRecord) write(path.join(repo, '.doctrine/records/a.md'), '# the orchestrator\'s own a.md\n\n- State: Exited.\n')
  const run = path.join(repo, '.doctrine/records/orchestrate')
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
  const r = spawnSync('node', [LANE, ...args], { cwd, env: e, encoding: 'utf8' })
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
clause('clause 2f — each typing call follows a pane get of that pane reading it ready: unknown with no session before the launch line, idle after it (L7)',
  runs.length === 3 && runs.map((e) => lastGet(e.i)).every((g, k) => g && g.args[2] === 'p1' && g.read === (k === 0 ? 'unknown' : 'idle')),
  JSON.stringify(runs.map((e) => lastGet(e.i)?.read)))
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
  clause('clause 2j — the recorded launch line, run under env -i, starts claude in the worktree with its role, caller, run, config dir, PATH and TMPDIR, on the model the model file names when the line runs (E15-D126)',
    r.code === 0 && entries.length === 2 && argv(e1) === JSON.stringify(['--model', 'claude-opus-5-5']) && fs.realpathSync(e1.cwd) === L.wt('a') &&
    e1.env.DCTR_ROLE === 'a' && e1.env.DCTR_CALLER === 'a' && e1.env.DCTR_RUN === L.run && e1.env.CLAUDE_CONFIG_DIR === '/x' &&
    e1.env.PATH === pathVar && e1.env.TMPDIR === childTmp && argv(e2) === JSON.stringify(['--model', 'claude-sonnet-5']),
    `exit ${r.code} ${said(r)}; line ${JSON.stringify(line)}; entries ${JSON.stringify(entries.map((e) => [e.argv, e.cwd, e.env.DCTR_ROLE, e.env.DCTR_CALLER, e.env.DCTR_RUN, e.env.CLAUDE_CONFIG_DIR, e.env.TMPDIR]))}`)
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
  git(U.repo, 'checkout', '-q', 'main')
  const rc = create(U, 'c')
  const w = U.wt('c')
  append(path.join(w, 'SESSION_MEMORY.md'), '\nlane c line\n')
  const copy = readBuf(path.join(w, "SESSION_MEMORY.md"))
  UNT[kind] = { U, u, w }
  for (const [k, target] of [['first', u], ['second', U.base]]) {
    const r = lane(U, ['reset', 'c', target])
    const lsv = git(w, 'ls-files', '-v', 'SESSION_MEMORY.md').out
    clause(`clause 2p — ${k} reset of a lane whose memory file is ${kind} at the base, to ${k === 'first' ? 'u, which tracks that path' : 'the base again'}: exit 0, HEAD there, the memory file byte for byte${k === 'first' ? ', marked S' : ''} (E15-D165, L9)`,
      rc.code === 0 && r.code === 0 && head(w) === target && Buffer.compare(readBuf(path.join(w, "SESSION_MEMORY.md")), copy) === 0 && (k === 'first' ? lsv === 'S SESSION_MEMORY.md' : lsv === ''),
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
const member = /^- phase a: (\S+)$/m.exec(read(path.join(AR.f.repo, 'docs/epics/E1.md')) || '')?.[1]
const chk = spawnSync('node', [path.join(HERE, 'dctr-project.mjs'), 'check', AR.f.repo], { encoding: 'utf8' })
clause('clause 2r — archive repoints the epic\'s - phase member at the archived record: after remove, the line names a record under lanes/a/, the file exists, and dctr-project.mjs check exits 0 (E15-D124)',
  epicAfterArchive !== EPIC('.claude/worktrees/a/.doctrine/records/a.md') && member === '.doctrine/records/lanes/a/.doctrine/records/a.md' &&
  exists(path.join(AR.f.repo, member)) && chk.status === 0,
  `member ${member}; check ${chk.status} ${JSON.stringify(chk.stdout + chk.stderr)}`)
clause('clause 2s — remove of a lane unchanged since its archive exits 0 and the worktree is gone, its branch kept (E15-D125)',
  rrm.code === 0 && !exists(AR.w) && !git(AR.f.repo, 'worktree', 'list', '--porcelain').out.includes(AR.w) && branches(AR.f.repo).some((b) => b.startsWith('a ')),
  `exit ${rrm.code} ${said(rrm)}`)
const arLines = laneLines(AR.f)
clause('clause 2t — archive and remove each append their own line to lane.log',
  arLines.length === 3 && arLines.slice(1).every((l) => LANE_LINE.test(l)) && arLines[1].endsWith(' orchestrator archive a') && arLines[2].endsWith(' orchestrator remove a'),
  JSON.stringify(arLines))

// ---------------------------------------------------------------- clause 2: laneOf (L3)

{
  const t = ['2026-11-08T01:00:00Z orchestrator create a p1 /r/.claude/worktrees/a cd /r/.claude/worktrees/a && env X=1 claude',
    '2026-11-08T02:00:00Z orchestrator reset a abc',
    'not a line create a p9 /nowhere cd x',
    '2026-11-08T03:00:00Z orchestrator create b p2 /r/.claude/worktrees/b cd b',
    '2026-11-08T04:00:00Z orchestrator create a p3 /r/.claude/worktrees/a2 cd /r/.claude/worktrees/a2 && claude'].join('\n')
  const got = laneOf(t, 'a')
  clause('clause 2u — laneOf returns the LATEST create line for the role, with the launch line whole, and null for a role with none (L3)',
    JSON.stringify(got) === JSON.stringify({ time: '2026-11-08T04:00:00Z', caller: 'orchestrator', role: 'a', pane: 'p3', worktree: '/r/.claude/worktrees/a2', launch: 'cd /r/.claude/worktrees/a2 && claude' }) &&
    laneOf(t, 'b')?.pane === 'p2' && laneOf(t, 'c') === null && laneOf('', 'a') === null && laneOf(t.split('\n').slice(1, 3).join('\n'), 'a') === null,
    JSON.stringify(got))
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
  const rr = lane(f, ['reset', 'a', f.base], { env: { DCTR_ROLE: 'a' } })
  clause('clause 1e — reset refuses outside the orchestrator role', rr.code !== 0 && shimLog(f).length === 0 && laneLines(f).length === 0, `exit ${rr.code}`)
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
    ['the role orchestrator', ['create', 'orchestrator', f.repo, f.base, handoffOf(f)]]]
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
  ['1r', 'tab-fail', 0, 'the pane cannot be made']]) {
  const f = fixture()
  const r = create(f, 'a', { env: { HERDR_SHIM_MODE: mode } })
  const t = shimLog(f).filter((e) => e.args[0] === 'pane' && e.args[1] === 'run').length
  clause(`clause ${n} — when ${why}, create exits non-zero naming the worktree it made, leaves it, types ${typed} line${typed === 1 ? '' : 's'} and writes no lane.log line (L6, L7)`,
    r.code !== 0 && exists(f.wt('a')) && (r.out + r.err).includes(f.wt('a')) && t === typed && laneLines(f).length === 0, `exit ${r.code} ${said(r)}; typed ${t}`)
  const again = create(f, 'a')
  clause(`clause ${n}2 — a second create of that role then refuses`, again.code !== 0 && laneLines(f).length === 0, `exit ${again.code} ${said(again)}`)
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
  const plain = git(z, 'reset', '--hard', memM)
  clause('clause 3c — a plain git reset --hard onto a revision that changes a skip-worktree memory file exits 128, the hazard reset carries the bytes across (E15-D165)',
    plain.code === 128, `exit ${plain.code} ${plain.err}`)
}
clause('clause 3d — m changes the tracked memory file against the base and k leaves it',
  git(MEM.repo, 'diff', '--name-only', MEM.base, memM).out.split('\n').includes('SESSION_MEMORY.md') && !git(MEM.repo, 'diff', '--name-only', MEM.base, memK).out.includes('SESSION_MEMORY.md'),
  `${git(MEM.repo, 'diff', '--name-only', MEM.base, memM).out} / ${git(MEM.repo, 'diff', '--name-only', MEM.base, memK).out}`)
for (const kind of ['untracked', 'ignored']) {
  const { U, u } = UNT[kind]
  clause(`clause 3e — the ${kind}-memory fixture's base does not track SESSION_MEMORY.md and u does${kind === 'ignored' ? ', and the base ignores it' : ''}`,
    git(U.repo, 'ls-tree', '--name-only', U.base).out.split('\n').every((x) => x !== 'SESSION_MEMORY.md') && git(U.repo, 'ls-tree', '--name-only', u).out.split('\n').includes('SESSION_MEMORY.md') &&
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

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) failed` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
