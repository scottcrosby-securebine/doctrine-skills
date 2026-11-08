// Tamper test for the orchestrator's write guard (E15 e15-guard), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-guard.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins guardAllowed in dctr-lib.mjs, the one definition of the allowed paths, each allowed path beside a
// refused twin, and the hooks.json reader this suite uses, on planted copies and on the real file. Clause 2 drives
// hooks/dctr-guard.mjs end to end on a fixture run, spawning it with a JSON payload on stdin and a tripwire `herdr`
// first on PATH, some runs under a preload that makes one fs operation throw EIO. Clause 3 proves the fixtures carry what each case needs without calling the guard.

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

// guardReal on an injected filesystem, portable to any volume: a lower-cased tree whose realpath spells every
// existing path in lower case, as a case-insensitive volume does, and an error injected per operation.
const err = (code) => Object.assign(new Error(code), { code })
const FAKE = new Set(['/', '/c', '/c/docs', '/c/docs/project.md', '/c/l'])
const fakeIo = (fault = {}) => ({
  lstat: (p) => { if (fault.lstat && p.endsWith(fault.lstat[0])) throw err(fault.lstat[1]); if (!FAKE.has(p.toLowerCase())) throw err('ENOENT'); return { isSymbolicLink: () => p.toLowerCase() === '/c/l' } },
  readlink: (p) => { if (fault.readlink) throw err(fault.readlink); return '/gone/t.md' },
  realpath: (p) => { if (fault.realpath && p.toLowerCase() === fault.realpath[0]) throw err(fault.realpath[1]); if (!FAKE.has(p.toLowerCase())) throw err('ENOENT'); return p.toLowerCase() },
})
const gr = (p, io) => { try { return typeof lib.guardReal === 'function' ? lib.guardReal(p, '/c', io) : 'no guardReal export' } catch (e) { return `throws ${e.code}` } }
const GR = [
  ['a case alias of an existing file', gr('/C/DOCS/PROJECT.md', fakeIo()), '/c/docs/project.md'],
  ['a missing name under a case alias, kept as written', gr('Docs/New.md', fakeIo()), '/c/docs/New.md'],
  ['a missing component (ENOENT) kept as written', gr('/c/x/y.md', fakeIo()), '/c/x/y.md'],
  ['a parent that is a file (ENOTDIR) kept as written', gr('/c/docs/project.md/x', fakeIo({ lstat: ['/x', 'ENOTDIR'] })), '/c/docs/project.md/x'],
  ['a dangling link followed', gr('/c/l', fakeIo()), '/gone/t.md'],
  ['EIO on lstat', gr('/c/docs/project.md', fakeIo({ lstat: ['/docs', 'EIO'] })), 'throws EIO'],
  ['EACCES on lstat', gr('/c/docs/project.md', fakeIo({ lstat: ['/docs', 'EACCES'] })), 'throws EACCES'],
  ['EIO on readlink', gr('/c/l', fakeIo({ readlink: 'EIO' })), 'throws EIO'],
  ['EIO on the realpath of the existing prefix', gr('/c/docs/new.md', fakeIo({ realpath: ['/c/docs', 'EIO'] })), 'throws EIO'],
  ['a NUL byte, on the real filesystem', gr('/c/a\u0000b.md'), 'throws ERR_INVALID_ARG_VALUE'],
]
const grWrong = GR.filter(([, got, want]) => got !== want)
clause('clause 1g — guardReal walks strictly and spells the existing prefix as the volume does: a case alias is the file it names, a missing component (ENOENT, or ENOTDIR under a file) is kept as written, a dangling link is followed, and any other error on lstat, readlink or realpath, a NUL byte among them, throws (E15-D183, G1)',
  grWrong.length === 0, JSON.stringify(grWrong))

// The reader: the guard's own PreToolUse group is the one whose command runs dctr-guard.mjs, never the first group,
// and its matcher is read as Claude Code compares it, against the whole tool name.
const whole = (m, name) => { try { return new RegExp(`^(?:${m})$`).test(name) } catch { return false } }
const GUARDED = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
// MCP tool names are built at run time: the doctor's scan flags a connector tool name written in any file under hooks/.
const MCP = `mcp${'__'}`, MCP_WRITE = `${MCP}MCP_DOCKER__write_file`, MCP_READ = `${MCP}x__read_thing`
const UNGUARDED = ['Bash', MCP_WRITE, MCP_READ, 'Read']
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
  noMulti: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Write|Edit|NotebookEdit' }),
  writeBash: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Write|Bash' }),
  bashWriteEdit: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = 'Bash|Write|Edit' }),
  broad: plant((pre) => { const i = guardIdx(pre); if (i >= 0) pre[i].matcher = `Bash|Write|Edit|MultiEdit|NotebookEdit|${MCP}.*` }),
  merged: plant((pre) => { const i = guardIdx(pre); if (i >= 0) { const [g] = pre.splice(i, 1); pre[0].hooks.push(...g.hooks) } }),
}
const plantedOk = Object.entries(PLANTED).filter(([, c]) => readGuard(c) === 'ok').map(([k]) => k)
clause('clause 1d — the hooks.json reader fails each planted copy: the guard entry removed, a matcher of Write|Edit, Write|Edit|NotebookEdit, Write|Bash, Bash|Write|Edit or one that also takes Bash and every MCP tool, and the guard merged into the round guard\'s group (E15-D19, D20, D21, D118, D223 controls)',
  plantedOk.length === 0, `read as ok: ${JSON.stringify(plantedOk)}`)
clause('clause 1e — hooks.json has one PreToolUse group of its own running dctr-guard.mjs, its matcher matching Write, Edit, MultiEdit and NotebookEdit as whole names and none of Bash, the MCP tools MCP_DOCKER write_file and x read_thing, and Read (E15-D19, D20, D21, D118, D223)',
  readGuard(hj) === 'ok', readGuard(hj))
clause('clause 1f — the hooks.json description names the guard and its matcher', /dctr-guard\.mjs/.test(hj.description) && hj.description.includes('Write|Edit|MultiEdit|NotebookEdit'),
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

// The hook's environment: nothing of this session's own run, herdr reachable, a herdr pane named. The filter strips
// every DCTR_ variable and CLAUDE_PROJECT_DIR, so each case's env alone says whose session it is.
const BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DCTR_|CLAUDE_PROJECT_DIR$|HERDR_)/.test(k)))
Object.assign(BASE, { PATH: `${bin}:${process.env.PATH}`, HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', TMPDIR: tmp })
const ORCH = { DCTR_ROLE: 'orchestrator', DCTR_RUN: run, CLAUDE_PROJECT_DIR: orch }

// A preload that makes one fs operation throw EIO on any path containing a given string, the hook's real fs otherwise.
const inject = path.join(tmp, 'inject.mjs')
put(inject, "import fs from 'node:fs'\nconst [op, match] = JSON.parse(process.env.GUARD_FAULT)\nconst orig = fs[op]\n" +
  "fs[op] = function (p, ...a) { if (String(p).includes(match)) throw Object.assign(new Error(`EIO: injected, ${op} ${p}`), { code: 'EIO' }); return orig.call(this, p, ...a) }\n")
const hookRun = (env, stdin, { hook = hookSrc, cwd = orch, fault } = {}) => {
  const args = fault ? ['--import', pathToFileURL(inject).href, hook] : [hook]
  const r = spawnSync('node', args, { input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin), env: { ...BASE, ...env, ...(fault ? { GUARD_FAULT: JSON.stringify(fault) } : {}) }, cwd, encoding: 'utf8' })
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
const ME = (fp, more) => P('MultiEdit', { file_path: fp, edits: [{ old_string: 'a', new_string: 'b' }] }, more)
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
  ['a MultiEdit with no file_path', ORCH, P('MultiEdit', { edits: [] }), 'deny'],
  ['a MultiEdit with no tool_input', ORCH, { ...P('MultiEdit', {}), tool_input: undefined }, 'deny'],
  ['a MultiEdit with no DCTR_RUN in a repo with no run', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: plain }, ME('src/a.txt', { cwd: plain }), 'deny', { cwd: plain }],
])
clause('clause 2l — in the orchestrator\'s session every error refuses: a library that cannot load, no run resolved, a run folder missing or misnamed, unreadable stdin, a missing or non-string path, a MultiEdit with no path or no run (E15-D183); the same broken library refuses no lane and no session without a role (G1, G2)',
  wrong(errs).length === 0, show(errs))
const noRunDir = cases([['no DCTR_RUN, the run resolved from the session\'s repo, Write src/a.txt', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: orch }, W('src/a.txt'), 'deny'],
  ['no DCTR_RUN, the run resolved from the session\'s repo, Write a handoff', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: orch }, W('docs/handoffs/h8.md'), 'allow']])
clause('clause 2m — with DCTR_RUN unset the orchestrator\'s run is <Records>/orchestrate of its own repo, judged the same way', wrong(noRunDir).length === 0, show(noRunDir))

const multiBefore = logLines().length, mt0 = Date.now()
const d223 = cases([['MultiEdit src/a.txt', ORCH, ME('src/a.txt'), 'deny'], ['MultiEdit docs/handoffs/h.md', ORCH, ME('docs/handoffs/h.md'), 'allow']])
const mt1 = Date.now(), multiAdded = logLines().slice(multiBefore)
const mm = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (\S+) (.+)$/.exec(multiAdded[0] || '')
clause('clause 2n — the orchestrator\'s MultiEdit is judged by file_path as an Edit is: src/a.txt refused, docs/handoffs/h.md allowed, and guard.log gains one line, a time inside the calls, MultiEdit, the absolute path of src/a.txt (E15-D223, D224, D225, XS-12)',
  wrong(d223).length === 0 && multiAdded.length === 1 && !!mm && Date.parse(mm[1]) >= Math.floor(mt0 / 1000) * 1000 && Date.parse(mm[1]) <= mt1 &&
  mm[2] === 'MultiEdit' && mm[3] === path.join(orch, 'src/a.txt'), `${show(d223)} ${JSON.stringify(multiAdded)}`)

// Each refusal's line names its own call's path as given, made absolute and never normalized, and a refused call that
// names no path is refused with no line (E15-D24, D192).
const ownBefore = logLines().length
const own = cases([['.. after a link', ORCH, W('docs/handoffs/out/../a.txt'), 'deny'], ['a Write with no file_path', ORCH, P('Write', { content: 'x' }), 'deny'],
  ['through a folder link', ORCH, W(path.join(orch, 'docs/handoffs/out/x.txt')), 'deny']])
const ownAdded = logLines().slice(ownBefore).map((l) => l.replace(/^\S+ /, ''))
const ownWant = [`Write ${orch}/docs/handoffs/out/../a.txt`, `Write ${orch}/docs/handoffs/out/x.txt`]
clause('clause 2o — each refusal\'s line names that call\'s own path as given, absolute and not normalized, and a refused Write naming no path adds no line (E15-D24, D192)',
  wrong(own).length === 0 && JSON.stringify(ownAdded) === JSON.stringify(ownWant), `${show(own)} got ${JSON.stringify(ownAdded)} want ${JSON.stringify(ownWant)}`)

// guard.log a folder, so the append throws: the call is still refused (E15-D188).
fs.renameSync(logFile, `${logFile}.kept`); fs.mkdirSync(logFile)
const unwritable = cases([['Write src/a.txt with guard.log unwritable', ORCH, W('src/a.txt'), 'deny'], ['MultiEdit src/a.txt with guard.log unwritable', ORCH, ME('src/a.txt'), 'deny']])
let appendThrows = false
try { fs.appendFileSync(logFile, 'x\n') } catch { appendThrows = true }
fs.rmdirSync(logFile); fs.renameSync(`${logFile}.kept`, logFile)
clause('clause 2p — with guard.log unwritable the orchestrator\'s Write and MultiEdit outside the allowed paths are still refused, exit 0 with a deny (E15-D188)',
  wrong(unwritable).length === 0, show(unwritable))

// An error that is not a missing file refuses, wherever the guard reads: each fault turns a call that is otherwise
// allowed into a refusal, and the preload naming nothing the guard reads leaves it allowed (E15-D183, G1).
const faults = cases([
  ['EIO on lstat of a dangling link under docs/handoffs', ORCH, W('docs/handoffs/dangling'), 'deny', { fault: ['lstatSync', 'docs/handoffs/dangling'] }],
  ['EIO on readlink of a dangling link under docs/handoffs', ORCH, W('docs/handoffs/dangling'), 'deny', { fault: ['readlinkSync', 'docs/handoffs/dangling'] }],
  ['EIO on the kickoff read of the memory file', ORCH, W('docs/handoffs/h9.md'), 'deny', { fault: ['readFileSync', 'SESSION_MEMORY.md'] }],
  ['EIO on the stat that finds the record', ORCH, W('docs/handoffs/h9.md'), 'deny', { fault: ['statSync', 'docs/epics/E1.md'] }],
  ['EIO on the stat that finds the checkout above the run', ORCH, W('docs/handoffs/h9.md'), 'deny', { fault: ['statSync', '.doctrine/records/.git'] }],
  ['a NUL byte in a path under docs/handoffs', ORCH, W('docs/handoffs/a\u0000b.md'), 'deny'],
  ['the preload naming nothing the guard reads', ORCH, W('docs/handoffs/h9.md'), 'allow', { fault: ['lstatSync', 'no-such-component'] }],
])
clause('clause 2s — an error that is not a missing file refuses: EIO on lstat or readlink while walking a path, on the kickoff read, on the stat finding the record or the checkout, and a NUL byte in the path; the same preload naming nothing the guard reads allows (E15-D183, G1)',
  wrong(faults).length === 0, show(faults))

// A case alias on a case-insensitive volume is the file it names; on a case-sensitive one it is another file.
put(path.join(tmp, 'case-probe'))
const insensitive = fs.existsSync(path.join(tmp, 'CASE-PROBE'))
const caseAlias = insensitive ? cases([
  ['DOCS/PROJECT.md', ORCH, W('DOCS/PROJECT.md'), 'allow'], ['Docs/Handoffs/h10.md', ORCH, E('Docs/Handoffs/h10.md'), 'allow'],
  ['session_memory.md', ORCH, W('session_memory.md'), 'allow'], ['.DOCTRINE/records/x.md', ORCH, W('.DOCTRINE/records/x.md'), 'allow'],
  ['DOCS/HANDOFFS/../../SRC/a.txt', ORCH, W('DOCS/HANDOFFS/../../SRC/a.txt'), 'deny'], ['Docs/PROJECT.md.bak', ORCH, W('Docs/PROJECT.md.bak'), 'deny'],
]) : []
clause(insensitive
  ? 'clause 2t — on this case-insensitive temp volume a case alias of an allowed path is allowed (DOCS/PROJECT.md, Docs/Handoffs/, session_memory.md, .DOCTRINE/records/) and a case alias outside them is refused (E15-D22)'
  : 'clause 2t — SKIPPED: the temp volume is case-sensitive, so a case alias names another file; clause 1g carries the canonical case on an injected volume',
  wrong(caseAlias).length === 0, show(caseAlias))

// The log line escapes the path reversibly, so two refused paths never log alike (E15-D24).
const escBefore = logLines().length
const ESC = ['src/x\ny.txt', 'src/x?y.txt', 'src/x\\ny.txt', 'src/x\ry.txt']
const esc = cases(ESC.map((p) => [JSON.stringify(p), ORCH, W(p), 'deny']))
const escAdded = logLines().slice(escBefore).map((l) => l.replace(/^\S+ Write /, ''))
const escWant = [`${orch}/src/x\\ny.txt`, `${orch}/src/x?y.txt`, `${orch}/src/x\\\\ny.txt`, `${orch}/src/x\\ry.txt`]
clause('clause 2r — each refused path is logged on one line with backslash as \\\\, LF as \\n and CR as \\r, so a path holding LF, one holding ?, one holding a backslash then n, and one holding CR each log differently (E15-D24)',
  wrong(esc).length === 0 && JSON.stringify(escAdded) === JSON.stringify(escWant) && new Set(escAdded).size === ESC.length,
  `${show(esc)} got ${JSON.stringify(escAdded)} want ${JSON.stringify(escWant)}`)

const all = [d19, d20, d21, d22, d23, d118, d119, paths, errs, noRunDir, d223, own, unwritable, faults, caseAlias, esc].flat()
clause('clause 2q — every run exits 0, and herdr was called zero times (tripwire on PATH)', all.every((c) => c.r.code === 0) && !fs.existsSync(tripwire),
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
clause('clause 3e — without the reader: the planted copies carry their defects, split on |: the removed copy names no dctr-guard.mjs, Write|Edit lacks NotebookEdit, Write|Edit|NotebookEdit lacks MultiEdit, Write|Bash and Bash|Write|Edit name Bash, the broad one names every MCP tool, the merged copy\'s first group runs two commands',
  !JSON.stringify(PLANTED.removed.hooks.PreToolUse).includes('dctr-guard.mjs') &&
  ['writeEdit', 'noMulti', 'writeBash', 'bashWriteEdit', 'broad'].map((k) => PLANTED[k].hooks.PreToolUse[guardIdx(PLANTED[k].hooks.PreToolUse)]?.matcher.split('|')).every((ms, i) =>
    [!ms?.includes('NotebookEdit'), !ms?.includes('MultiEdit') && ms?.includes('Edit'), ms?.includes('Bash'), ms?.includes('Bash'), ms?.some((x) => x.startsWith(MCP))][i]) &&
  PLANTED.merged.hooks.PreToolUse[0].hooks.length === 2 && JSON.stringify(PLANTED.merged.hooks.PreToolUse[0]).includes('dctr-guard.mjs'), 'planted copies')
clause('clause 3f — without the guard: guard.log made a folder really cannot be appended to', appendThrows, 'appendFileSync on the folder did not throw')

const preloadCode = (op, target) => spawnSync('node', ['--import', pathToFileURL(inject).href, '-e',
  `import('node:fs').then(({ default: fs }) => { try { fs.${op}(${JSON.stringify(target)}) ; console.log('none') } catch (e) { console.log(e.code) } })`],
{ env: { ...process.env, GUARD_FAULT: JSON.stringify([op, path.basename(target)]) }, encoding: 'utf8' }).stdout.trim()
const proved = [['lstatSync', path.join(orch, 'docs/handoffs/dangling')], ['readlinkSync', path.join(orch, 'docs/handoffs/dangling')],
  ['readFileSync', path.join(orch, 'SESSION_MEMORY.md')], ['statSync', record], ['statSync', path.join(records, '.git')]].map(([op, t]) => [op, preloadCode(op, t)])
let nulCode = null
try { fs.lstatSync(path.join(orch, 'docs/handoffs/a\u0000b.md')) } catch (e) { nulCode = e.code }
clause('clause 3g — without the guard: the preload really makes lstat, readlink, readFileSync and stat throw EIO on the fixture paths, the dangling link, memory file and record otherwise read, and a NUL byte makes lstat throw an error that is not ENOENT',
  proved.every(([, c]) => c === 'EIO') && fs.readlinkSync(path.join(orch, 'docs/handoffs/dangling')) && fs.readFileSync(path.join(orch, 'SESSION_MEMORY.md'), 'utf8') &&
  fs.statSync(record).isFile() && fs.statSync(path.join(orch, '.git')).isDirectory() && nulCode && nulCode !== 'ENOENT', JSON.stringify({ proved, nulCode }))
const fio = fakeIo()
clause('clause 3h — without guardReal: the injected volume spells every existing path in lower case and has no /c/docs/new.md, its link names a missing target, and its faults throw their codes' +
  (insensitive ? '; on this temp volume the real DOCS/PROJECT.md resolves to docs/PROJECT.md' : ''),
  fio.realpath('/C/DOCS/PROJECT.md') === '/c/docs/project.md' && (() => { try { fio.realpath('/c/docs/new.md'); return false } catch (e) { return e.code === 'ENOENT' } })() &&
  fio.readlink('/c/l') === '/gone/t.md' && !FAKE.has('/gone') && (() => { try { fakeIo({ readlink: 'EIO' }).readlink('/c/l'); return false } catch (e) { return e.code === 'EIO' } })() &&
  (!insensitive || fs.realpathSync.native(path.join(orch, 'DOCS/PROJECT.md')) === path.join(orch, 'docs/PROJECT.md')), 'injected volume')
clause('clause 3i — without the guard: the escape paths are four distinct names, holding LF, ?, a backslash then n, and CR', new Set(ESC).size === 4 &&
  ESC[0].includes('\n') && ESC[1].includes('?') && ESC[2].includes('\\n') && ESC[3].includes('\r'), JSON.stringify(ESC))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) failed` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
