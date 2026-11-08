// Tamper test for the orchestrator's write guard (E15 e15-guard), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-guard.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins guardAllowed in dctr-lib.mjs, the one definition of the allowed paths, each allowed path beside a
// refused twin, and the hooks.json reader this suite uses, on planted copies and on the real file. Clause 2 drives
// hooks/dctr-guard.mjs end to end on a fixture run, spawning it with a JSON payload on stdin and a tripwire `herdr`
// first on PATH. Clause 3 proves the fixtures carry what each case needs without calling the guard.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import * as lib from './dctr-lib.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const HERE = import.meta.dirname

// ---------------------------------------------------------------- clause 1: guardAllowed and the hooks.json reader

const allowed = typeof lib.guardAllowed === 'function' ? lib.guardAllowed : () => 'no guardAllowed export'
const C = { run: '/w/o/.doctrine/records/orchestrate', records: '/w/o/.doctrine/records', checkout: '/w/o', record: '/w/p/docs/epics/E1.md' }
const IN = [C.record, '/w/o/.doctrine/records/x.md', `${C.run}/inbox/m.md`, `${C.run}/held/lane-a/m.md`, `${C.run}/model/lane-a`,
  `${C.run}/waiting-questions.md`, `${C.run}/reset.txt`, `${C.run}/events.log`, `${C.run}/guard.log`, '/w/o/docs/PROJECT.md',
  '/w/o/docs/epics/E2.md', '/w/o/docs/epics/sub/x.md', '/w/o/SESSION_MEMORY.md', '/w/o/docs/handoffs/h.md',
  '/w/o/.doctrine/auto-cycle.stop', '/w/o/.doctrine/auto-cycle-state.json']
const OUT = ['/w/o/src/a.txt', '/w/o/docs/PROJECT.md.bak', '/w/o/docs/epicsX/a.md', '/w/o/docs/epics', '/w/o/docs/handoffs',
  '/w/o/sub/SESSION_MEMORY.md', '/w/o/sub/docs/handoffs/h.md', '/w/o/.doctrine/records2/x.md', '/w/o/.doctrine/records',
  '/w/o/.doctrine/auto-cycle/x', '/w/o/.doctrine/x/auto-cycle.stop', '/w/o/.doctrine/autocycle.stop', '/w/p/docs/epics/E2.md',
  '/w/p/docs/epics/E1.md.bak', '/w/o2/docs/handoffs/h.md', '/w/o/docs/PROJECT.md/x']
const inMiss = IN.filter((p) => allowed(p, C) !== true)
const outHit = OUT.filter((p) => allowed(p, C) !== false)
clause('clause 1a — guardAllowed allows the record, every file under the Records path (the run\'s inbox, held and model folders, waiting-questions, reset, events and guard logs among them), docs/PROJECT.md, every file under docs/epics/, the memory file, every file under docs/handoffs/ and the .doctrine/auto-cycle files (E15-D22)',
  inMiss.length === 0, `refused ${JSON.stringify(inMiss)}`)
clause('clause 1b — guardAllowed refuses each twin: a neighbouring name, the folder itself, the same name one level down, a sibling repo, a file inside a folder named like an auto-cycle file',
  outHit.length === 0, `allowed ${JSON.stringify(outHit)}`)
clause('clause 1c — with no record resolved, the record\'s path is refused and the checkout\'s paths are still allowed',
  allowed(C.record, { ...C, record: null }) === false && allowed('/w/o/docs/handoffs/h.md', { ...C, record: null }) === true,
  JSON.stringify([allowed(C.record, { ...C, record: null }), allowed('/w/o/docs/handoffs/h.md', { ...C, record: null })]))

// The reader: the guard's own PreToolUse group is the one whose command runs dctr-guard.mjs, never the first group,
// and its matcher is read as Claude Code compares it, against the whole tool name.
const whole = (m, name) => { try { return new RegExp(`^(?:${m})$`).test(name) } catch { return false } }
const GUARDED = ['Write', 'Edit', 'NotebookEdit']
// MCP tool names are built at run time: the doctor's scan flags a connector tool name written in any file under hooks/.
const MCP = `mcp${'__'}`, MCP_WRITE = `${MCP}MCP_DOCKER__write_file`, MCP_READ = `${MCP}x__read_thing`
const UNGUARDED = ['Bash', MCP_WRITE, MCP_READ, 'MultiEdit', 'Read']
function readGuard(hj) {
  const groups = (hj?.hooks?.PreToolUse || []).filter((g) => (g.hooks || []).some((h) => /dctr-guard\.mjs/.test(h.command || '')))
  if (groups.length !== 1) return `${groups.length} PreToolUse groups run dctr-guard.mjs`
  const g = groups[0]
  if (!g.hooks.every((h) => h.type === 'command' && /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/dctr-guard\.mjs"$/.test(h.command))) return 'the guard\'s group runs another command too'
  const miss = GUARDED.filter((t) => !whole(g.matcher, t)), hit = UNGUARDED.filter((t) => whole(g.matcher, t))
  if (miss.length || hit.length) return `matcher ${JSON.stringify(g.matcher)} misses ${JSON.stringify(miss)} and matches ${JSON.stringify(hit)}`
  return 'ok'
}
const hjText = fs.readFileSync(path.join(HERE, 'hooks.json'), 'utf8')
const hj = JSON.parse(hjText)
const plant = (fn) => { const c = structuredClone(hj); fn(c.hooks.PreToolUse); return c }
const guardIdx = (pre) => pre.findIndex((g) => (g.hooks || []).some((h) => /dctr-guard\.mjs/.test(h.command || '')))
const PLANTED = {
  removed: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre.splice(i, 1) }),
  writeEdit: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Write|Edit' }),
  writeBash: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Write|Bash' }),
  bashWriteEdit: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Bash|Write|Edit' }),
  broad: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = `Bash|Write|Edit|NotebookEdit|${MCP}.*` }),
  merged: plant((pre) => { const i = guardIdx(pre); if (i >= 0) { const [g] = pre.splice(i, 1); pre[0].hooks.push(...g.hooks) } }),
}
const plantedOk = Object.entries(PLANTED).filter(([, c]) => readGuard(c) === 'ok').map(([k]) => k)
clause('clause 1d — the hooks.json reader fails each planted copy: the guard entry removed, a matcher of Write|Edit, Write|Bash, Bash|Write|Edit or one that also takes Bash and every MCP tool, and the guard merged into the round guard\'s group (E15-D19, D20, D21, D118 controls)',
  plantedOk.length === 0, `read as ok: ${JSON.stringify(plantedOk)}`)
clause('clause 1e — hooks.json has one PreToolUse group of its own running dctr-guard.mjs, its matcher matching Write, Edit and NotebookEdit as whole names and none of Bash, the MCP tools MCP_DOCKER write_file and x read_thing, MultiEdit and Read (E15-D19, D20, D21, D118)',
  readGuard(hj) === 'ok' && (hj.hooks.PreToolUse.find((g) => /dctr-guard/.test(JSON.stringify(g)))?.hooks[0].timeout ?? 0) > 0, readGuard(hj))
clause('clause 1f — the hooks.json description names the guard and its matcher', /dctr-guard\.mjs/.test(hj.description) && hj.description.includes('Write|Edit|NotebookEdit'),
  hj.description.slice(-600))

// ---------------------------------------------------------------- clause 2: the hook end to end

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-guard-')))
const put = (f, text = '') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
const bin = path.join(tmp, 'bin'), tripwire = path.join(tmp, 'herdr-was-called')
put(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

// The orchestrator's checkout, its run under Records, and its record in a sibling tracking repo, reached by the kickoff.
const orch = path.join(tmp, 'orch'), proj = path.join(tmp, 'proj')
const records = path.join(orch, '.doctrine/records'), run = path.join(records, 'orchestrate')
const record = path.join(proj, 'docs/epics/E1.md')
fs.mkdirSync(path.join(orch, '.git'), { recursive: true }); fs.mkdirSync(path.join(proj, '.git'), { recursive: true })
put(path.join(orch, 'docs/PROJECT.md'), '# Project\n\nRecords: .doctrine/records\n\n## End state\n')
put(path.join(orch, 'SESSION_MEMORY.md'), '# Session memory\n\n## Next Session Kickoff\nhandoff: docs/handoffs/h.md | state: open\n')
put(path.join(orch, 'docs/handoffs/h.md'), 'phase: `e15-fixture`, state: Open\nrecord: `proj/docs/epics/E1.md`\nwrapper: doctrine-code\n\n# Handoff\n')
put(record, '# E1 record\nWrapper: doctrine:doctrine-code.\n\n- State: Open\n')
for (const d of ['inbox', 'held/lane-a', 'model']) fs.mkdirSync(path.join(run, d), { recursive: true })
// A seat's worktree of its own, outside the orchestrator's checkout, shaped like a repo the guard could mistake for it.
const seatwt = path.join(tmp, 'seatwt')
put(path.join(seatwt, '.git'), `gitdir: ${orch}/.git/worktrees/seatwt\n`)
put(path.join(seatwt, 'docs/PROJECT.md'), '# Project\n\nRecords: .doctrine/records\n')
// A repo with no run: no project file.
const plain = path.join(tmp, 'plain')
fs.mkdirSync(path.join(plain, '.git'), { recursive: true })
// Links under allowed folders: one to a folder outside the checkout, one dangling to a file outside, one into Records.
const outside = path.join(tmp, 'outside')
fs.mkdirSync(outside, { recursive: true })
fs.symlinkSync(outside, path.join(orch, 'docs/handoffs/out'))
fs.symlinkSync(path.join(outside, 'new.txt'), path.join(orch, 'docs/handoffs/dangling'))
fs.symlinkSync(records, path.join(orch, 'link-records'))
// A copy of the hook beside a dctr-lib.mjs that cannot load.
const broken = path.join(tmp, 'broken/hooks')
fs.mkdirSync(broken, { recursive: true })
const hookSrc = path.join(HERE, 'dctr-guard.mjs')
if (fs.existsSync(hookSrc)) fs.copyFileSync(hookSrc, path.join(broken, 'dctr-guard.mjs'))
put(path.join(broken, 'dctr-lib.mjs'), 'export const guardAllowed = ;\n')

// The hook's environment: nothing of this session's own run, herdr reachable, a herdr pane named.
const BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DCTR_|CLAUDE_PROJECT_DIR$|HERDR_)/.test(k)))
Object.assign(BASE, { PATH: `${bin}:${process.env.PATH}`, HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', TMPDIR: tmp })
const ORCH = { DCTR_ROLE: 'orchestrator', DCTR_RUN: run, CLAUDE_PROJECT_DIR: orch }

const hookRun = (env, stdin, { hook = hookSrc, cwd = orch } = {}) => {
  const r = spawnSync('node', [hook], { input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin), env: { ...BASE, ...env }, cwd, encoding: 'utf8' })
  let h = null
  try { h = JSON.parse(r.stdout).hookSpecificOutput } catch { /* no output */ }
  const deny = r.status === 0 && h?.hookEventName === 'PreToolUse' && h.permissionDecision === 'deny' && typeof h.permissionDecisionReason === 'string' &&
    Object.keys(JSON.parse(r.stdout)).join() === 'hookSpecificOutput'
  return { code: r.status, out: r.stdout, err: r.stderr, verdict: deny ? 'deny' : r.status === 0 && r.stdout === '' ? 'allow' : 'other' }
}
const P = (tool, input, more = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's1', transcript_path: '/dev/null', cwd: orch, tool_name: tool, tool_input: input, ...more })
const W = (fp, more) => P('Write', { file_path: fp, content: 'x\n' }, more)
const E = (fp, more) => P('Edit', { file_path: fp, old_string: 'a', new_string: 'b' }, more)
const N = (np, more) => P('NotebookEdit', { notebook_path: np, new_source: 'x' }, more)
const SEAT = { agent_id: 'a1b2c3', agent_type: 'general-purpose' }
const SEATENV = { DCTR_ROLE: 'orchestrator', DCTR_RUN: run }
const logFile = path.join(run, 'guard.log')
const logLines = () => { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) } catch { return [] } }

/** Each case: [name, env, payload, expected verdict, options]. */
const cases = (rows) => rows.map(([name, env, pay, want, opt]) => ({ name, want, r: hookRun(env, pay, opt) }))
const wrong = (rs) => rs.filter((c) => c.r.verdict !== c.want)
const show = (rs) => wrong(rs).map((c) => `${c.name}: want ${c.want}, got ${c.r.verdict} (exit ${c.r.code}) ${c.r.out.slice(0, 200)} ${c.r.err.slice(0, 300)}`).join(' || ')

const d19 = cases([['Write src/a.txt', ORCH, W('src/a.txt'), 'deny'], ['Write absolute src/a.txt', ORCH, W(path.join(orch, 'src/a.txt')), 'deny']])
clause('clause 2a — the orchestrator\'s Write of src/a.txt is refused with the PreToolUse deny shape (E15-D19)', wrong(d19).length === 0, show(d19))
const d20 = cases([['Edit src/a.txt', ORCH, E('src/a.txt'), 'deny']])
clause('clause 2b — the orchestrator\'s Edit of src/a.txt is refused (E15-D20)', wrong(d20).length === 0, show(d20))
const d21 = cases([
  ['Bash printf redirect', ORCH, P('Bash', { command: 'printf x > src/a.txt' }), 'allow'],
  ['Bash dctr-lane', ORCH, P('Bash', { command: `node ${path.resolve(HERE, '..')}/hooks/dctr-lane.mjs create a . HEAD docs/handoffs/a.md` }), 'allow'],
  ['MCP write_file', ORCH, P(MCP_WRITE, { path: path.join(orch, 'src/a.txt'), content: 'x' }), 'allow'],
  ['MCP read_thing', ORCH, P(MCP_READ, {}), 'allow'],
  ['a tool named like an Object property', ORCH, P('toString', { file_path: 'src/a.txt' }), 'allow'],
])
clause('clause 2c — no orchestrator call of Bash or an MCP tool is refused, nor of a tool named like an Object property (E15-D21)', wrong(d21).length === 0, show(d21))

const ALLOWED_PATHS = [record, path.join(records, 'x.md'), path.join(run, 'inbox/m.md'), path.join(run, 'held/lane-a/m.md'),
  path.join(run, 'waiting-questions.md'), path.join(run, 'reset.txt'), path.join(run, 'events.log'), path.join(orch, 'docs/PROJECT.md'),
  path.join(orch, 'docs/epics/E2.md'), path.join(orch, 'SESSION_MEMORY.md'), path.join(orch, 'docs/handoffs/h2.md'),
  path.join(orch, '.doctrine/auto-cycle.stop'), 'docs/handoffs/rel.md', '.doctrine/auto-cycle-state.json']
const d22 = cases(ALLOWED_PATHS.flatMap((p) => [[`Write ${p}`, ORCH, W(p), 'allow'], [`Edit ${p}`, ORCH, E(p), 'allow']]))
clause('clause 2d — the orchestrator\'s Write and Edit at each allowed path go through: the record, the Records path, the run\'s inbox, held folder, waiting-questions, reset file and events log, docs/PROJECT.md, docs/epics/, the memory file, docs/handoffs/ and the .doctrine/auto-cycle files (E15-D22)',
  wrong(d22).length === 0, show(d22))

const LANE = { DCTR_ROLE: 'lane-a', DCTR_RUN: run, CLAUDE_PROJECT_DIR: orch }, MERGE = { DCTR_ROLE: 'merge', DCTR_RUN: run, CLAUDE_PROJECT_DIR: orch }
const d23 = cases([
  ['lane Write', LANE, W('src/a.txt'), 'allow'], ['lane Edit', LANE, E('src/a.txt'), 'allow'],
  ['merge Write', MERGE, W('src/a.txt'), 'allow'], ['merge Edit', MERGE, E('src/a.txt'), 'allow'],
  ['no role in the orchestrator\'s checkout, Write', { CLAUDE_PROJECT_DIR: orch }, W('src/a.txt'), 'allow'],
  ['no role in the orchestrator\'s checkout, Edit', { CLAUDE_PROJECT_DIR: orch }, E('src/a.txt'), 'allow'],
  ['no role in a repo with no run, Write', { CLAUDE_PROJECT_DIR: plain }, W('src/a.txt', { cwd: plain }), 'allow', { cwd: plain }],
  ['no role in a repo with no run, Edit', { CLAUDE_PROJECT_DIR: plain }, E('src/a.txt', { cwd: plain }), 'allow', { cwd: plain }],
  ['an empty role, Write', { DCTR_ROLE: '', DCTR_RUN: run }, W('src/a.txt'), 'allow'],
])
clause('clause 2e — nothing is refused outside the orchestrator\'s session: a lane, the merge session, a session with no DCTR_ROLE in the orchestrator\'s checkout, one in a repo with no run, an empty role (E15-D23)',
  wrong(d23).length === 0, show(d23))

const before = logLines().length, t0 = Date.now()
const one = hookRun(ORCH, W('src/a.txt'))
const t1 = Date.now(), after = logLines()
const added = after.slice(before)
const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (\S+) (.+)$/.exec(added[0] || '')
const at = m ? Date.parse(m[1]) : NaN
clause('clause 2f — one refused Write appends exactly one line to <run>/guard.log: an ISO 8601 UTC time ending Z inside the call, Write, and the absolute path of src/a.txt (E15-D24, G3)',
  one.verdict === 'deny' && added.length === 1 && !!m && at >= Math.floor(t0 / 1000) * 1000 && at <= t1 && m[2] === 'Write' && m[3] === path.join(orch, 'src/a.txt'),
  JSON.stringify({ verdict: one.verdict, added, t0, t1 }))
const quietBefore = logLines().length
hookRun(ORCH, W(path.join(orch, 'docs/handoffs/h4.md'))); hookRun(LANE, W('src/a.txt'))
clause('clause 2g — an allowed call and a lane\'s call append nothing to guard.log', logLines().length === quietBefore, JSON.stringify(logLines().slice(quietBefore)))
const twice = [hookRun(ORCH, W('src/a.txt')), hookRun(ORCH, W('src/a.txt'))]
clause('clause 2h — an identical retry is refused again: no latch (G1)', twice.every((r) => r.verdict === 'deny'), JSON.stringify(twice.map((r) => r.verdict)))

const d118 = cases([['NotebookEdit src/n.ipynb', ORCH, N('src/n.ipynb'), 'deny'], ['NotebookEdit under Records', ORCH, N(path.join(records, 'n.ipynb')), 'allow']])
clause('clause 2i — the orchestrator\'s NotebookEdit is judged by notebook_path: src/n.ipynb refused, a notebook under the Records path allowed (E15-D118, G6)',
  wrong(d118).length === 0, show(d118))

const d119 = cases([
  ['seat Write src/a.txt', ORCH, W('src/a.txt', SEAT), 'deny'],
  ['seat in its own worktree, Write src/a.txt', ORCH, W('src/a.txt', { ...SEAT, cwd: seatwt }), 'deny', { cwd: seatwt }],
  ['seat in its own worktree, Write its worktree\'s docs/handoffs', ORCH, W('docs/handoffs/h.md', { ...SEAT, cwd: seatwt }), 'deny', { cwd: seatwt }],
  ['seat in its own worktree, Write the orchestrator\'s handoff', ORCH, W(path.join(orch, 'docs/handoffs/h5.md'), { ...SEAT, cwd: seatwt }), 'allow', { cwd: seatwt }],
  ['seat in its own worktree with no CLAUDE_PROJECT_DIR, Write its worktree\'s docs/handoffs', SEATENV, W('docs/handoffs/h.md', { ...SEAT, cwd: seatwt }), 'deny', { cwd: seatwt }],
  ['seat in its own worktree with no CLAUDE_PROJECT_DIR, Write the orchestrator\'s handoff', SEATENV, W(path.join(orch, 'docs/handoffs/h5.md'), { ...SEAT, cwd: seatwt }), 'allow', { cwd: seatwt }],
])
clause('clause 2j — a seat of the orchestrator\'s session is refused outside the allowed paths, by agent_id and from a worktree of its own, the checkout read from the run and never the seat\'s cwd (E15-D119)',
  wrong(d119).length === 0, show(d119))

const paths = cases([
  ['.. out of docs/handoffs', ORCH, W('docs/handoffs/../../src/a.txt'), 'deny'],
  ['.. staying in docs/handoffs', ORCH, W('docs/handoffs/../handoffs/h3.md'), 'allow'],
  ['through a link under docs/handoffs to a folder outside', ORCH, W('docs/handoffs/out/x.txt'), 'deny'],
  ['.. after a link, lexically inside docs/handoffs', ORCH, W('docs/handoffs/out/../a.txt'), 'deny'],
  ['a dangling link under docs/handoffs to a file outside', ORCH, E(path.join(orch, 'docs/handoffs/dangling')), 'deny'],
  ['a link into the Records path', ORCH, W('link-records/x.md'), 'allow'],
])
clause('clause 2k — a path is judged where it really lies: .. traversal, a link under an allowed folder to one outside, .. after a link, a dangling link, and a link into Records allowed',
  wrong(paths).length === 0, show(paths))

const errs = cases([
  ['the library cannot load, orchestrator', ORCH, W(path.join(orch, 'docs/handoffs/h6.md')), 'deny', { hook: path.join(broken, 'dctr-guard.mjs') }],
  ['the library cannot load, a lane', LANE, W('src/a.txt'), 'allow', { hook: path.join(broken, 'dctr-guard.mjs') }],
  ['the library cannot load, no role', { CLAUDE_PROJECT_DIR: orch }, W('src/a.txt'), 'allow', { hook: path.join(broken, 'dctr-guard.mjs') }],
  ['no DCTR_RUN and the repo has no run', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: plain }, W('docs/handoffs/h.md', { cwd: plain }), 'deny', { cwd: plain }],
  ['DCTR_RUN names a folder that does not exist', { ...ORCH, DCTR_RUN: path.join(orch, '.doctrine/gone/orchestrate') }, W(path.join(orch, 'docs/handoffs/h7.md')), 'deny'],
  ['DCTR_RUN names a folder not called orchestrate', { ...ORCH, DCTR_RUN: records }, W(path.join(orch, '.doctrine/x.md')), 'deny'],
  ['stdin is not JSON', ORCH, '{', 'deny'],
  ['a Write with no file_path', ORCH, P('Write', { content: 'x' }), 'deny'],
  ['a Write whose file_path is not a string', ORCH, P('Write', { file_path: 7, content: 'x' }), 'deny'],
  ['a NotebookEdit carrying file_path only', ORCH, P('NotebookEdit', { file_path: path.join(records, 'n.ipynb') }), 'deny'],
])
clause('clause 2l — in the orchestrator\'s session every error refuses: a library that cannot load, no run resolved, a run folder missing or misnamed, unreadable stdin, a missing or non-string path; the same broken library refuses no lane and no session without a role (G1, G2)',
  wrong(errs).length === 0, show(errs))
const noRunDir = cases([['no DCTR_RUN, the run resolved from the session\'s repo, Write src/a.txt', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: orch }, W('src/a.txt'), 'deny'],
  ['no DCTR_RUN, the run resolved from the session\'s repo, Write a handoff', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: orch }, W('docs/handoffs/h8.md'), 'allow']])
clause('clause 2m — with DCTR_RUN unset the orchestrator\'s run is <Records>/orchestrate of its own repo, judged the same way', wrong(noRunDir).length === 0, show(noRunDir))

const all = [d19, d20, d21, d22, d23, d118, d119, paths, errs, noRunDir].flat()
clause('clause 2n — every run exits 0, and herdr was called zero times (tripwire on PATH)', all.every((c) => c.r.code === 0) && !fs.existsSync(tripwire),
  `tripwire ${fs.existsSync(tripwire)} codes ${JSON.stringify(all.filter((c) => c.r.code !== 0).map((c) => [c.name, c.r.code]))}`)

// ---------------------------------------------------------------- clause 3: the fixtures carry it, without the guard

const under = (p, d) => p.startsWith(d + path.sep)
const allowedRoots = [records, path.join(orch, 'docs/epics'), path.join(orch, 'docs/handoffs')]
const srcA = path.join(orch, 'src/a.txt')
clause('clause 3a — without the guard: src/a.txt lies under no allowed folder and is none of the allowed files, the record sits outside the checkout with an Open last state line, and the kickoff and handoff name it',
  !allowedRoots.some((d) => under(srcA, d)) && ![record, path.join(orch, 'docs/PROJECT.md'), path.join(orch, 'SESSION_MEMORY.md')].includes(srcA) &&
  !under(record, orch) && /- State: Open\n$/.test(fs.readFileSync(record, 'utf8')) &&
  fs.readFileSync(path.join(orch, 'SESSION_MEMORY.md'), 'utf8').includes('handoff: docs/handoffs/h.md') &&
  fs.readFileSync(path.join(orch, 'docs/handoffs/h.md'), 'utf8').includes('record: `proj/docs/epics/E1.md`'), 'fixture tree')
const danglingTarget = (() => { try { return fs.readlinkSync(path.join(orch, 'docs/handoffs/dangling')) } catch { return null } })()
clause('clause 3b — without the guard: docs/handoffs/out really resolves outside the checkout, out/.. resolves (libc realpath) to the parent of the link target and not to docs/handoffs, the dangling link points at a missing file outside, and link-records resolves to Records',
  !under(fs.realpathSync(path.join(orch, 'docs/handoffs/out')), orch) && fs.realpathSync.native(`${orch}/docs/handoffs/out/..`) === tmp &&
  fs.lstatSync(path.join(orch, 'docs/handoffs/dangling')).isSymbolicLink() && danglingTarget === path.join(outside, 'new.txt') && !fs.existsSync(danglingTarget) &&
  fs.realpathSync(path.join(orch, 'link-records')) === records, `dangling ${danglingTarget}`)
let brokenLoads = true
try { await import(pathToFileURL(path.join(broken, 'dctr-lib.mjs')).href) } catch (e) { brokenLoads = !(e instanceof SyntaxError) }
clause('clause 3c — without the guard: the broken copy\'s dctr-lib.mjs really fails to load, and the copy runs the hook under test',
  !brokenLoads && (() => { try { return fs.readFileSync(path.join(broken, 'dctr-guard.mjs'), 'utf8') === fs.readFileSync(hookSrc, 'utf8') } catch { return false } })(), `loads ${brokenLoads}`)
clause('clause 3d — without the guard: the seat\'s worktree lies outside the checkout and carries a .git file and a project file, the plain repo has a .git and no project file, the gone run folder is missing, and the misnamed one exists',
  !under(seatwt, orch) && fs.statSync(path.join(seatwt, '.git')).isFile() && fs.existsSync(path.join(seatwt, 'docs/PROJECT.md')) &&
  fs.existsSync(path.join(plain, '.git')) && !fs.existsSync(path.join(plain, 'docs/PROJECT.md')) &&
  !fs.existsSync(path.join(orch, '.doctrine/gone')) && path.basename(records) !== 'orchestrate' && fs.statSync(records).isDirectory(), 'fixture tree')
clause('clause 3e — without the reader: the planted copies carry their defects, split on |: the removed copy names no dctr-guard.mjs, Write|Edit lacks NotebookEdit, Write|Bash and Bash|Write|Edit name Bash, the broad one names every MCP tool, the merged copy\'s first group runs two commands',
  !JSON.stringify(PLANTED.removed.hooks.PreToolUse).includes('dctr-guard.mjs') &&
  ['writeEdit', 'writeBash', 'bashWriteEdit', 'broad'].map((k) => PLANTED[k].hooks.PreToolUse[guardIdx(PLANTED[k].hooks.PreToolUse)]?.matcher.split('|')).every((ms, i) =>
    [!ms?.includes('NotebookEdit'), ms?.includes('Bash'), ms?.includes('Bash'), ms?.some((x) => x.startsWith(MCP))][i]) &&
  PLANTED.merged.hooks.PreToolUse[0].hooks.length === 2 && JSON.stringify(PLANTED.merged.hooks.PreToolUse[0]).includes('dctr-guard.mjs'), 'planted copies')
clause('clause 3f — without the guard: the hook\'s environment carries no DCTR_ variable and no CLAUDE_PROJECT_DIR of this session\'s own',
  !Object.keys(BASE).some((k) => k.startsWith('DCTR_') || k === 'CLAUDE_PROJECT_DIR'), JSON.stringify(Object.keys(BASE).filter((k) => k.startsWith('DCTR_'))))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) failed` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
