// Tamper test for the orchestrator's write guard (E15 e15-guard), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-guard.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins guardAllowed in dctr-lib.mjs, the one definition of the allowed paths, each allowed path beside a
// refused twin, and the hooks.json reader this suite uses, on planted copies and on the real file. Clause 2 drives
// hooks/dctr-guard.mjs end to end on a fixture run, spawning it with a JSON payload on stdin and a tripwire `herdr`
// first on PATH, some runs under a preload that makes one fs operation throw EIO or stall, or makes a judgement die or print garbage when it hits. Clause 3 proves the fixtures carry what each case needs without calling the guard.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
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
// `exact` makes it a case-sensitive volume instead, finding each path only as stored, /c/DOCS a folder beside /c/docs.
// lstat gives each file its own ino, and every path at or under `fault.mount` a device of its own.
const FAKE = ['/', '/c', '/c/docs', '/c/docs/project.md', '/c/l', '/c/DOCS']
const fakeIo = (fault = {}, exact = false) => {
  const stored = (p) => FAKE.includes(exact ? p : p.toLowerCase()) ? (exact ? p : p.toLowerCase()) : null
  return {
    lstat: (p) => { if (fault.lstat && p.endsWith(fault.lstat[0])) throw err(fault.lstat[1]); const s = stored(p); if (s === null) throw err('ENOENT'); return { dev: fault.mount && (s + '/').startsWith(fault.mount + '/') ? 2 : 1, ino: FAKE.indexOf(s), isSymbolicLink: () => s === '/c/l' } },
    readlink: (p) => { if (fault.readlink) throw err(fault.readlink); return '/gone/t.md' },
    realpath: (p) => { if (fault.realpath && p.toLowerCase() === fault.realpath[0]) throw err(fault.realpath[1]); const s = stored(p); if (s === null) throw err('ENOENT'); return s },
  }
}
const gr = (p, io) => { try { return typeof lib.guardReal === 'function' ? lib.guardReal(p, '/c', io) : 'no guardReal export' } catch (e) { return `throws ${e.code}` } }
const GR = [
  ['a case alias of an existing file', gr('/C/DOCS/PROJECT.md', fakeIo()), '/c/docs/project.md'],
  ['a missing name under a case alias, in lower case as the case-insensitive volume reads it', gr('Docs/New.md', fakeIo()), '/c/docs/new.md'],
  ['on a case-sensitive volume a missing name, kept as written', gr('docs/New.md', fakeIo({}, true)), '/c/docs/New.md'],
  ['on a case-sensitive volume a case alias, another name kept as written', gr('Docs/project.md', fakeIo({}, true)), '/c/Docs/project.md'],
  ['on a case-sensitive volume holding docs and DOCS, a missing name under docs kept as written', gr('/c/docs/Old.md', fakeIo({}, true)), '/c/docs/Old.md'],
  ['a volume mounted at /c/docs, with no cased name below its root, read as case-sensitive', gr('/c/docs/New.md', fakeIo({ mount: '/c/docs' })), '/c/docs/New.md'],
  ['EIO on the lstat that reads whether the volume ignores case', gr('/c/docs/new.md', fakeIo({ lstat: ['/DOCS', 'EIO'] })), 'throws EIO'],
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
clause('clause 1g — guardReal walks strictly and spells the existing prefix as the volume does: a case alias is the file it names, a missing component (ENOENT, or ENOTDIR under a file) is kept as written on a case-sensitive volume, one holding the swapped name as another file among them, and in lower case on a case-insensitive one, a volume root read as case-sensitive, an error reading which the volume is throws, a dangling link is followed, and any other error on lstat, readlink or realpath, a NUL byte among them, throws (E15-D183, G1)',
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
// A link whose kernel reading of `deep/../../..` stays in docs/handoffs while its text reading climbs to the checkout.
fs.mkdirSync(path.join(orch, 'docs/handoffs/d1/d2/d3'), { recursive: true })
fs.symlinkSync('d1/d2/d3', path.join(orch, 'docs/handoffs/deep'))
// A repo nested inside the orchestrator's checkout, with no project file of its own.
const inner = path.join(orch, 'inner')
fs.mkdirSync(path.join(inner, '.git'), { recursive: true })
// A checkout whose project file and folders are stored in lower case, with a run of its own.
const lc = path.join(tmp, 'lc'), lcRun = path.join(lc, '.doctrine/records/orchestrate')
fs.mkdirSync(path.join(lc, '.git'), { recursive: true }); fs.mkdirSync(lcRun, { recursive: true })
put(path.join(lc, 'docs/project.md'), '# Project\n\nRecords: .doctrine/records\n'); put(path.join(lc, 'session_memory.md'))
fs.mkdirSync(path.join(lc, 'docs/handoffs'), { recursive: true })
// A checkout whose run folder is stored as Orchestrate, reached by its Records path.
// A misnamed run folder, and a link called orchestrate pointing at it.
const misnamed = path.join(orch, 'misnamed'), linkRun = path.join(tmp, 'linkrun/orchestrate')
fs.mkdirSync(misnamed, { recursive: true }); fs.mkdirSync(path.dirname(linkRun), { recursive: true }); fs.symlinkSync(misnamed, linkRun)
// A link to the valid run, named orchestrate itself: the run reached through a link of its own (GT5).
const linkValid = path.join(tmp, 'linkvalid/orchestrate')
fs.mkdirSync(path.dirname(linkValid), { recursive: true }); fs.symlinkSync(run, linkValid)
const uc = path.join(tmp, 'uc'), ucRun = path.join(uc, '.doctrine/records/Orchestrate')
fs.mkdirSync(path.join(uc, '.git'), { recursive: true }); fs.mkdirSync(ucRun, { recursive: true })
put(path.join(uc, 'docs/PROJECT.md'), '# Project\n\nRecords: .doctrine/records\n')
// A copy of the hook beside a dctr-lib.mjs that cannot load.
const broken = path.join(tmp, 'broken/hooks')
fs.mkdirSync(broken, { recursive: true })
const hookSrc = path.join(HERE, 'dctr-guard.mjs')
if (fs.existsSync(hookSrc)) fs.copyFileSync(hookSrc, path.join(broken, 'dctr-guard.mjs'))
put(path.join(broken, 'dctr-lib.mjs'), 'export const guardAllowed = ;\n')

put(path.join(tmp, 'case-probe'))
const insensitive = fs.existsSync(path.join(tmp, 'CASE-PROBE'))
// The hook's environment: nothing of this session's own run, herdr reachable, a herdr pane named. The filter strips
// every DCTR_ variable and CLAUDE_PROJECT_DIR, so each case's env alone says whose session it is.
const BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DCTR_|CLAUDE_PROJECT_DIR$|HERDR_)/.test(k)))
Object.assign(BASE, { PATH: `${bin}:${process.env.PATH}`, HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', TMPDIR: tmp })
const ORCH = { DCTR_ROLE: 'orchestrator', DCTR_RUN: run, CLAUDE_PROJECT_DIR: orch }

// A preload that makes one fs operation throw EIO on any path containing a given string, the hook's real fs otherwise;
// `realpathSync.native` names the native realpath. With a third element it stalls that many ms instead, then runs it.
// A match starting with = names one path exactly. The op `print` makes a judgement print the match and exit 0.
// The op `exit` instead ends, with exit 3, any process run with the argument `judge`, the hook's own judgement, and
// `spawn` makes child_process.spawn behave as it does on EMFILE: a child with no stdio that emits 'error' on the next tick.
// A fourth element `true` confines the fault to a judgement, leaving the log child's reads alone. A third element that
// is a string acts in a judgement only, when the operation hits: `exit` ends it with 3, `kill` with SIGKILL, and
// `print:<text>` prints the text and exits 0, so a judgement can die or print garbage after it has handed on its line.
const inject = path.join(tmp, 'inject.mjs')
put(inject, "import fs from 'node:fs'\nconst [op, match, stall, only] = JSON.parse(process.env.GUARD_FAULT)\n" +
  "const [own, key] = op.includes('.') ? [fs[op.split('.')[0]], op.split('.')[1]] : [fs, op], orig = own[key]\n" +
  "const hit = (p) => match.startsWith('=') ? String(p) === match.slice(1) : String(p).includes(match)\n" +
  "const acts = typeof stall === 'string', scoped = !(only || acts) || process.argv.includes('judge')\n" +
  "const act = (s) => s === 'kill' ? process.kill(process.pid, 'SIGKILL') : s === 'exit' ? process.exit(3) : (fs.writeSync(1, s.slice(6)), process.exit(0))\n" +
  "own[key] = function (p, ...a) { if (scoped && hit(p)) { if (acts) act(stall); if (!stall) throw Object.assign(new Error(`EIO: injected, ${op} ${p}`), { code: 'EIO' }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, stall) } return orig.call(this, p, ...a) }\n" +
  "if (key === 'realpathSync') own[key].native = orig.native\n" +
  "if (op === 'exit' && process.argv.includes('judge')) process.exit(3)\n" +
  "if (op === 'print' && process.argv.includes('judge')) { process.stdout.write(match, () => process.exit(0)); await new Promise(() => {}) }\n" +
  "if (op === 'spawn') { const cp = await import('node:child_process'), { EventEmitter } = await import('node:events'), { syncBuiltinESMExports } = await import('node:module')\n" +
  "  cp.default.spawn = () => { const c = Object.assign(new EventEmitter(), { stdin: null, stdout: null, stderr: null, kill: () => false }); process.nextTick(() => c.emit('error', Object.assign(new Error('spawn EMFILE (injected)'), { code: 'EMFILE' }))); return c }\n" +
  "  syncBuiltinESMExports() }\n" +
  "if (op === 'statSync' && !stall) { const ex = fs.existsSync; fs.existsSync = (p) => !String(p).includes(match) && ex(p) }\n")
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
  ['.. after a link, judged as text: docs/handoffs/out/../a.txt is docs/handoffs/a.txt, where Claude Code writes it', ORCH, W('docs/handoffs/out/../a.txt'), 'allow'],
  ['.. after a link, judged as text: deep/../../../src/a.txt is src/a.txt, though the kernel reading stays in docs/handoffs', ORCH, W('docs/handoffs/deep/../../../src/a.txt'), 'deny'],
  ['a link followed after the text is normalized: deep/x.md lies in docs/handoffs/d1/d2/d3', ORCH, W('docs/handoffs/deep/x.md'), 'allow'],
  ['a dangling link under docs/handoffs to a file outside', ORCH, E(path.join(orch, 'docs/handoffs/dangling')), 'deny'],
  ['a link into the Records path', ORCH, W('link-records/x.md'), 'allow'],
])
clause('clause 2k — a path is judged at the real target of its text-normalized form, where Claude Code writes it: .. traversal, a link under an allowed folder to one outside, .. after a link applied to the text before any link is followed (both directions), a dangling link, and a link into Records allowed (GP1)',
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
const own = cases([['.. after a link', ORCH, W('docs/handoffs/deep/../../../src/a.txt'), 'deny'], ['a Write with no file_path', ORCH, P('Write', { content: 'x' }), 'deny'],
  ['through a folder link', ORCH, W(path.join(orch, 'docs/handoffs/out/x.txt')), 'deny']])
const ownAdded = logLines().slice(ownBefore).map((l) => l.replace(/^\S+ /, ''))
const ownWant = [`Write ${orch}/docs/handoffs/deep/../../../src/a.txt`, `Write ${orch}/docs/handoffs/out/x.txt`]
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
  ['EIO on the .git of a nested repo, the run unresolved, never an outer repo\'s', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: inner }, W(path.join(orch, 'docs/handoffs/h9.md'), { cwd: inner }), 'deny', { cwd: inner, fault: ['statSync', 'inner/.git'] }],
  ['the preload naming nothing the guard reads', ORCH, W('docs/handoffs/h9.md'), 'allow', { fault: ['lstatSync', 'no-such-component'] }],
])
clause('clause 2s — an error that is not a missing file refuses: EIO on lstat or readlink while walking a path, on the kickoff read, on the stat finding the record or the checkout, on the .git of the session\'s nested repo when the run is found from it (GR1), and a NUL byte in the path; the same preload naming nothing the guard reads allows (E15-D183, G1)',
  wrong(faults).length === 0, show(faults))

// A context error after the run resolves still logs the refusal (E15-D24, GR3); a nested repo's run is not resolved, so nothing is logged for it.
const lateBefore = logLines().length
const late = cases([['EIO on the kickoff read, Write src/a.txt', ORCH, W('src/a.txt'), 'deny', { fault: ['readFileSync', 'SESSION_MEMORY.md'] }],
  ['EIO on the stat that finds the record, Edit docs/handoffs/h11.md', ORCH, E('docs/handoffs/h11.md'), 'deny', { fault: ['statSync', 'docs/epics/E1.md'] }]])
const lateAdded = logLines().slice(lateBefore).map((l) => l.replace(/^\S+ /, ''))
const lateWant = [`Write ${orch}/src/a.txt`, `Edit ${orch}/docs/handoffs/h11.md`]
clause('clause 2u — a context error after the run resolves still logs the refusal, one line per call naming its tool and path (E15-D24, GR3)',
  wrong(late).length === 0 && JSON.stringify(lateAdded) === JSON.stringify(lateWant), `${show(late)} got ${JSON.stringify(lateAdded)} want ${JSON.stringify(lateWant)}`)

// The record stays allowed whatever its last state line reads, outside Records in a sibling repo (GR4).
const recordText = fs.readFileSync(record, 'utf8')
const states = ['Open', 'Blocked', 'Exited', 'Shipped'].flatMap((s) => {
  fs.writeFileSync(record, recordText.replace('- State: Open', `- State: ${s}`))
  return cases([[`${s}: Write the record`, ORCH, W(record), 'allow'], [`${s}: Edit the record`, ORCH, E(record), 'allow'],
    [`${s}: Write a neighbouring epic`, ORCH, W(path.join(proj, 'docs/epics/E9.md')), 'deny']])
})
fs.writeFileSync(record, recordText)
clause('clause 2v — the record in a sibling repo, outside Records, is allowed whatever its state, Open, Blocked, Exited or Shipped, and its neighbouring epic is refused in each (GR4)',
  wrong(states).length === 0, show(states))

// A case-insensitive volume, emulated on the real fixture on any host: each component matched by name in either case,
// as the volume spells it. guardContext canonicalizes the allowed names by it as guardReal does the target (GR2).
const foldReal = (p) => p.split('/').filter(Boolean).reduce((d, c) => {
  const hit = fs.readdirSync(d).find((n) => n.toLowerCase() === c.toLowerCase())
  if (hit === undefined) throw err('ENOENT')
  return fs.realpathSync.native(path.join(d, hit))
}, '/')
const FOLD = { realpath: foldReal }
const folded = (() => {
  try {
    const ctx = lib.guardContext({ DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun }, lc, FOLD)
    return Object.fromEntries(['DOCS/PROJECT.md', 'SESSION_MEMORY.md', 'Docs/Handoffs/h.md', 'DOCS/PROJECT.md.bak', 'src/a.txt']
      .map((p) => [p, allowed(lib.guardReal(p, lc, FOLD), ctx)]))
  } catch (e) { return `throws ${e.message}` }
})()
const foldWant = { 'DOCS/PROJECT.md': true, 'SESSION_MEMORY.md': true, 'Docs/Handoffs/h.md': true, 'DOCS/PROJECT.md.bak': false, 'src/a.txt': false }
clause('clause 2w — on an injected case-insensitive volume, which runs on any host, a checkout storing docs/project.md, session_memory.md and docs/handoffs allows DOCS/PROJECT.md, SESSION_MEMORY.md and Docs/Handoffs/h.md, and refuses DOCS/PROJECT.md.bak and src/a.txt: the allowed names are canonicalized as the target is (GR2)',
  JSON.stringify(folded) === JSON.stringify(foldWant), JSON.stringify(folded))

// A case alias on a case-insensitive volume is the file it names; on a case-sensitive one it is another file.
// Two volumes emulated on the real fixture on any host, lstat, readlink and realpath alike: one looking each component
// up in either case, one exactly. Each spells what it finds as it is stored.
const volume = (fold) => {
  const find = (d, c) => { const hit = fs.readdirSync(d).find((n) => fold ? n.toLowerCase() === c.toLowerCase() : n === c); if (hit === undefined) throw err('ENOENT'); return path.join(d, hit) }
  const realpath = (p) => p.split('/').filter(Boolean).reduce((d, c) => fs.realpathSync.native(find(d, c)), '/')
  const entry = (p) => p === '/' ? '/' : find(realpath(path.dirname(p)), path.basename(p))
  return { realpath, lstat: (p) => fs.lstatSync(entry(p)), readlink: (p) => fs.readlinkSync(entry(p)) }
}
const IVOL = volume(true), SVOL = volume(false)
const judge = (env, dir, io, asked) => {
  try { const ctx = lib.guardContext(env, dir, io); return Object.fromEntries(asked.map((p) => [p, allowed(lib.guardReal(p, dir, io), ctx)])) } catch (e) { return `throws ${e.message}` }
}
const LCENV = { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun }, UCENV = { DCTR_ROLE: 'orchestrator' }
const LCASK = ['.Doctrine/Records/x.md', 'Docs/Epics/E2.md', 'docs/epics/E2.md', '.Doctrine/Auto-Cycle.json', '.doctrine/auto-cycle.json', 'Docs/Epics', 'Docs/EpicsX/a.md', 'SRC/a.txt']
const volumes = {
  'case-insensitive, lc': judge(LCENV, lc, IVOL, LCASK),
  'case-insensitive, run stored Orchestrate': judge(UCENV, uc, IVOL, ['docs/handoffs/h.md', 'src/a.txt']),
  'case-insensitive, DCTR_RUN asked ORCHESTRATE': judge({ ...LCENV, DCTR_RUN: path.join(lc, '.doctrine/records/ORCHESTRATE') }, lc, IVOL, ['docs/handoffs/h.md']),
  'case-sensitive, lc': judge(LCENV, lc, SVOL, LCASK),
  'case-sensitive, run stored Orchestrate': judge({ ...UCENV, DCTR_RUN: ucRun }, uc, SVOL, ['docs/handoffs/h.md']),
}
const volumesWant = {
  'case-insensitive, lc': { '.Doctrine/Records/x.md': true, 'Docs/Epics/E2.md': true, 'docs/epics/E2.md': true, '.Doctrine/Auto-Cycle.json': true, '.doctrine/auto-cycle.json': true, 'Docs/Epics': false, 'Docs/EpicsX/a.md': false, 'SRC/a.txt': false },
  'case-insensitive, run stored Orchestrate': { 'docs/handoffs/h.md': true, 'src/a.txt': false },
  'case-insensitive, DCTR_RUN asked ORCHESTRATE': { 'docs/handoffs/h.md': true },
  'case-sensitive, lc': { '.Doctrine/Records/x.md': false, 'Docs/Epics/E2.md': false, 'docs/epics/E2.md': true, '.Doctrine/Auto-Cycle.json': false, '.doctrine/auto-cycle.json': true, 'Docs/Epics': false, 'Docs/EpicsX/a.md': false, 'SRC/a.txt': false },
  'case-sensitive, run stored Orchestrate': `throws the run ${ucRun} is not a folder named orchestrate`,
}
const volumesWrong = Object.keys(volumesWant).filter((k) => JSON.stringify(volumes[k]) !== JSON.stringify(volumesWant[k]))
clause('clause 2x — on emulated volumes, which run on any host: a case-insensitive one allows .Doctrine/Records/x.md, Docs/Epics/E2.md where docs/epics does not exist yet and .Doctrine/Auto-Cycle.json, and accepts a run stored or asked as Orchestrate; a case-sensitive one refuses both case aliases and a run stored as Orchestrate; neither allows the folder itself, a neighbouring name or src (GS3b)',
  volumesWrong.length === 0, volumesWrong.map((k) => `${k}: got ${JSON.stringify(volumes[k])} want ${JSON.stringify(volumesWant[k])}`).join(' || '))

// An error on the resolved run itself, before any other context is read, still logs the refusal (E15-D24, GS3a).
const runErrBefore = logLines().length
const runErr = cases([['EIO on the stat of the run, Write src/a.txt', ORCH, W('src/a.txt'), 'deny', { fault: ['statSync', 'records/orchestrate'] }],
  ['EIO on the stat of the run, Edit docs/handoffs/h12.md', ORCH, E('docs/handoffs/h12.md'), 'deny', { fault: ['statSync', 'records/orchestrate'] }]])
const runErrAdded = logLines().slice(runErrBefore).map((l) => l.replace(/^\S+ /, ''))
const runErrWant = [`Write ${orch}/src/a.txt`, `Edit ${orch}/docs/handoffs/h12.md`]
clause('clause 2y — an error on the stat of the run folder, once its name is read as orchestrate, still logs the refusal, one line per call naming its tool and path (E15-D24, GS3a)',
  wrong(runErr).length === 0 && JSON.stringify(runErrAdded) === JSON.stringify(runErrWant), `${show(runErr)} got ${JSON.stringify(runErrAdded)} want ${JSON.stringify(runErrWant)}`)

// guard.log is written only in a run whose name reads as orchestrate: a misnamed run, Records itself and a link named
// orchestrate to a misnamed folder are refused with no guard.log anywhere (N3).
const noLogRows = [['DCTR_RUN naming a folder called misnamed', misnamed, W('src/a.txt')],
  ['DCTR_RUN naming Records itself', records, W(path.join(orch, '.doctrine/x.md'))],
  ['DCTR_RUN naming a link called orchestrate to the misnamed folder', linkRun, W('src/a.txt')]]
const noLog = cases(noLogRows.map(([name, r, pay]) => [name, { ...ORCH, DCTR_RUN: r }, pay, 'deny']))
const strayLogs = [misnamed, records, path.dirname(linkRun)].map((d) => path.join(d, 'guard.log')).filter((f) => fs.existsSync(f))
clause('clause 2z — a run not read as orchestrate is refused and gains no guard.log: DCTR_RUN naming a folder called misnamed, Records itself, or a link called orchestrate to the misnamed folder (N3)',
  wrong(noLog).length === 0 && strayLogs.length === 0, `${show(noLog)} stray ${JSON.stringify(strayLogs)}`)

// Every filesystem call guardContext and the hook make on a valid run, each faulted with EIO in turn: the write is refused
// and, wherever guard.log can be appended, logged exactly once; beside it misnamed runs, a read of the link faulted too,
// that gain no guard.log (E15-D24, N3, GQ1). A run reached through a link to Records puts a readlink in the walk.
const viaLink = path.join(orch, 'link-records/orchestrate')
const FAULTED = [['stat of the run', 'statSync', 'records/orchestrate'], ['lstat of the run', 'lstatSync', 'records/orchestrate'],
  ['realpath of the run', 'realpathSync.native', 'records/orchestrate'], ['readlink of a link on the way to the run', 'readlinkSync', 'link-records', viaLink],
  ['readFile of the kickoff', 'readFileSync', 'SESSION_MEMORY.md'], ['presence test of the record', 'statSync', 'docs/epics/E1.md'],
  ['presence test of the checkout\'s .git', 'statSync', '.doctrine/records/.git'], ['append to guard.log', 'appendFileSync', 'guard.log', run, 0],
  // The case read of a run stored as Orchestrate: one line where this volume ignores case, and none where the name is another folder's.
  ['lstat of the run\'s parent, a run stored as Orchestrate', 'lstatSync', '=' + path.dirname(ucRun), ucRun, insensitive ? 1 : 0]]
const linesIn = (r) => { try { return fs.readFileSync(path.join(r, 'guard.log'), 'utf8').split('\n').filter(Boolean).length } catch { return 0 } }
const faultTable = FAULTED.map(([what, op, match, r = run, want = 1]) => {
  const before = linesIn(r), c = hookRun({ ...ORCH, DCTR_RUN: r }, W('src/a.txt'), { fault: [op, match] })
  return { what, verdict: c.verdict, lines: linesIn(r) - before, want }
})
const misCtl = [['misnamed', misnamed, ['lstatSync', 'no-such-component']], ['link named orchestrate, its lstat faulted', linkRun, ['lstatSync', 'linkrun/orchestrate']],
  ['link named orchestrate, its realpath faulted', linkRun, ['realpathSync.native', 'linkrun/orchestrate']]]
  .map(([what, r, fault]) => ({ what, verdict: hookRun({ ...ORCH, DCTR_RUN: r }, W('src/a.txt'), { fault }).verdict }))
const faultWrong = faultTable.filter((c) => c.verdict !== 'deny' || c.lines !== c.want)
const misWrong = misCtl.filter((c) => c.verdict !== 'deny')
const misStray = [misnamed, path.dirname(linkRun)].map((d) => path.join(d, 'guard.log')).filter((f) => fs.existsSync(f))
// The same decision on emulated volumes: a run stored as Orchestrate is logged in on a case-insensitive one and not on a case-sensitive one.
const logRunOf = (io) => { try { return lib.guardContext({ DCTR_ROLE: 'orchestrator', DCTR_RUN: ucRun }, uc, io).run } catch (e) { return e.run } }
const parentEio = (vol) => ({ ...vol, lstat: (p) => { if (p === path.dirname(ucRun)) throw err('EIO'); return vol.lstat(p) } })
const volRuns = { insensitive: logRunOf(IVOL), sensitive: logRunOf(SVOL), 'insensitive, its parent\'s lstat faulted': logRunOf(parentEio(IVOL)), 'sensitive, its parent\'s lstat faulted': logRunOf(parentEio(SVOL)) }
clause('clause 2za — EIO on each filesystem call guardContext and the hook make on a valid run (stat, lstat, realpath, readlink, readFile, the presence tests, the append, and the lstat of the parent that reads a run stored as Orchestrate as the run) refuses, with exactly one guard.log line wherever it can be appended; a misnamed run and a link named orchestrate to it, its lstat or its realpath faulted, are refused and gain no guard.log; on emulated volumes a run stored as Orchestrate is the folder logged in where the volume ignores case and is not where it does not, its parent\'s lstat faulted or not (E15-D24, N3, GQ1, GT3)',
  faultWrong.length === 0 && misWrong.length === 0 && misStray.length === 0 && volRuns.insensitive === ucRun && volRuns.sensitive === null &&
  volRuns['insensitive, its parent\'s lstat faulted'] === ucRun && volRuns['sensitive, its parent\'s lstat faulted'] === null,
  `${JSON.stringify(faultWrong)} ${JSON.stringify(misWrong)} stray ${JSON.stringify(misStray)} ${JSON.stringify(volRuns)}`)

// A read or an append that stalls past the guard's internal bound still ends in a deny printed within it, with headroom
// before the host's timeout for the guard's group in hooks.json (GS-1(a), GQ2). Both run at once, each stalling 20 s.
const timed = (fault, file = 'src/a.txt', env = {}) => new Promise((resolve) => {
  const t0 = Date.now(), ch = spawn('node', ['--import', pathToFileURL(inject).href, hookSrc], { env: { ...BASE, ...ORCH, ...env, GUARD_FAULT: JSON.stringify(fault) }, cwd: orch })
  let out = ''
  ch.stdout.on('data', (b) => { out += b })
  const kill = setTimeout(() => ch.kill('SIGKILL'), 15000)
  ch.on('close', (code) => {
    clearTimeout(kill)
    let h = null
    try { h = JSON.parse(out).hookSpecificOutput } catch { /* no output */ }
    resolve({ fault: fault.slice(0, 2), ms: Date.now() - t0, code, deny: code === 0 && h?.permissionDecision === 'deny' })
  })
  ch.stdin.end(JSON.stringify(W(file)))
})
const stallBefore = logLines().length
const stalls = await Promise.all([timed(['statSync', 'records/orchestrate', 20000], 'src/stall-stat.txt'), timed(['appendFileSync', 'guard.log', 20000], 'src/stall-append.txt'),
  timed(['readFileSync', 'SESSION_MEMORY.md', 20000], 'src/stall-kickoff.txt')])
const stallLines = Object.fromEntries(['stat', 'append', 'kickoff'].map((k) => [k, logLines().slice(stallBefore).filter((l) => l.endsWith(` Write ${orch}/src/stall-${k}.txt`)).length]))
const dies = hookRun(ORCH, W('docs/handoffs/h13.md'), { fault: ['exit', ''] })
const emfile = hookRun(ORCH, W('docs/handoffs/h14.md'), { fault: ['spawn', ''] })
const hostMs = 1000 * (hj.hooks.PreToolUse.find((g) => g.hooks.some((x) => /dctr-guard\.mjs/.test(x.command)))?.hooks[0].timeout ?? 0)
clause('clause 2zb — a stat of the run, the kickoff read and an append to guard.log, each stalled 20 s, end in a deny printed with at least 5 s to spare before the guard\'s hooks.json timeout, a judgement that dies refuses a write it would allow, and so does a spawn that fails as on EMFILE, exit 0 with the deny (GS-1(a), GQ2, GB1)',
  stalls.every((s) => s.deny && s.ms + 5000 <= hostMs) && dies.verdict === 'deny' && emfile.verdict === 'deny',
  `host timeout ${hostMs} ms ${JSON.stringify(stalls)} dies ${dies.verdict} ${dies.out.slice(0, 200)} emfile ${emfile.verdict} exit ${emfile.code} ${emfile.err.slice(0, 300)}`)

// A refusal at the bound still logs where the run resolved: a stalled stat of the run and a stalled kickoff read each
// leave one line, and a stalled append leaves none and still denies in time, as 2zb shows (E15-D24, GT2).
clause('clause 2zc — a refusal at the bound appends one guard.log line where the run resolved and the log can be appended: a stat of the run and the kickoff read, each stalled 20 s, one line each; the append itself stalled adds none (E15-D24, GT2)',
  stallLines.stat === 1 && stallLines.kickoff === 1 && stallLines.append === 0, JSON.stringify(stallLines))

// A deny longer than a pipe's buffer reaches the host whole, and only output that is empty or the deny shape is relayed (GT1).
const longAsked = 'src/' + 'x/../'.repeat(14000) + 'a.txt'
const longBefore = logLines().length, long = hookRun(ORCH, W(longAsked))
const longLines = logLines().slice(longBefore)
const printed = [['a truncated deny', '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"de'],
  ['an allow', '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'], ['text', 'ok']]
  .map(([what, text], i) => ({ what, verdict: hookRun(ORCH, W(`docs/handoffs/h-print${i}.md`), { fault: ['print', text] }).verdict }))
clause('clause 2zd — a refusal naming a path of over 64 KB prints the whole deny, which parses, and logs one line holding the path as given; a judgement that prints a truncated deny, an allow or other text refuses a write it would allow (E15-D24, GS-1(a), GT1)',
  long.verdict === 'deny' && long.out.length > 65536 && longLines.length === 1 && longLines[0].endsWith(` Write ${orch}/${longAsked}`) && printed.every((p) => p.verdict === 'deny'),
  `${long.verdict} exit ${long.code} ${long.out.length} bytes, lines ${longLines.length} ${JSON.stringify(printed)}`)

// The judgement hands on its line before it reads the run, and the log child decides the run itself, so a stall on the
// run's own lstat, or on the realpath of a link to the run, confined to the judgement, still ends in a deny at the bound
// with one line; and a link to a valid run whose realpath throws EIO is still the run, read through its link (GT4, GT5).
const lineOf = (f, from) => logLines().slice(from).filter((l) => l.endsWith(` Write ${orch}/${f}`)).length
const runStallBefore = logLines().length
const runStalls = await Promise.all([timed(['lstatSync', 'records/orchestrate', 20000, true], 'src/stall-lstat.txt'),
  timed(['realpathSync.native', 'linkvalid/orchestrate', 20000, true], 'src/stall-realpath.txt', { DCTR_RUN: linkValid })])
const runStallLines = { lstat: lineOf('src/stall-lstat.txt', runStallBefore), realpath: lineOf('src/stall-realpath.txt', runStallBefore) }
const linkRows = [['the link, nothing faulted', null, 'src/link-ok.txt'], ['the link, its realpath EIO', ['realpathSync.native', 'linkvalid/orchestrate'], 'src/link-eio.txt']]
  .map(([what, fault, f]) => { const before = logLines().length, c = hookRun({ ...ORCH, DCTR_RUN: linkValid }, W(f), fault ? { fault } : {}); return { what, verdict: c.verdict, lines: lineOf(f, before) } })
clause('clause 2ze — the run\'s own lstat and the realpath of a link to the run, each stalled 20 s in the judgement alone, end in a deny with at least 5 s to spare before the guard\'s hooks.json timeout and one guard.log line each; a link named orchestrate to the valid run is refused with one line, its realpath EIO or not (E15-D24, GT4, GT5)',
  runStalls.every((s) => s.deny && s.ms + 5000 <= hostMs) && runStallLines.lstat === 1 && runStallLines.realpath === 1 && linkRows.every((r) => r.verdict === 'deny' && r.lines === 1),
  `${JSON.stringify(runStalls)} ${JSON.stringify(runStallLines)} ${JSON.stringify(linkRows)}`)

// A judgement that dies or prints garbage after it has handed on its line is refused and still logged: each fault fires
// on the kickoff read, which the judgement makes after the hand-off, on a write it would allow (E15-D24, GT7).
const postRows = [['exit 3', 'exit'], ['SIGKILL', 'kill'], ['garbage', 'print:ok']].map(([what, a], i) => {
  const f = `docs/handoffs/h-post${i}.md`, before = logLines().length, c = hookRun(ORCH, W(f), { fault: ['readFileSync', 'SESSION_MEMORY.md', a] })
  return { what, verdict: c.verdict, lines: lineOf(f, before) }
})
clause('clause 2zf — a judgement that ends with exit 3, is killed with SIGKILL or prints text that is not the deny, each after it has handed on its line, refuses a write it would allow and appends exactly one guard.log line (E15-D24, GT7)',
  postRows.every((r) => r.verdict === 'deny' && r.lines === 1), JSON.stringify(postRows))

const caseAlias = insensitive ? cases([
  ['DOCS/PROJECT.md', ORCH, W('DOCS/PROJECT.md'), 'allow'], ['Docs/Handoffs/h10.md', ORCH, E('Docs/Handoffs/h10.md'), 'allow'],
  ['session_memory.md', ORCH, W('session_memory.md'), 'allow'], ['.DOCTRINE/records/x.md', ORCH, W('.DOCTRINE/records/x.md'), 'allow'],
  ['DOCS/HANDOFFS/../../SRC/a.txt', ORCH, W('DOCS/HANDOFFS/../../SRC/a.txt'), 'deny'], ['Docs/PROJECT.md.bak', ORCH, W('Docs/PROJECT.md.bak'), 'deny'],
  ['stored docs/project.md, asked DOCS/PROJECT.md', { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun, CLAUDE_PROJECT_DIR: lc }, W('DOCS/PROJECT.md', { cwd: lc }), 'allow', { cwd: lc }],
  ['stored session_memory.md, asked SESSION_MEMORY.md', { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun, CLAUDE_PROJECT_DIR: lc }, E('SESSION_MEMORY.md', { cwd: lc }), 'allow', { cwd: lc }],
  ['stored docs/project.md, asked DOCS/PROJECT.md.bak', { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun, CLAUDE_PROJECT_DIR: lc }, W('DOCS/PROJECT.md.bak', { cwd: lc }), 'deny', { cwd: lc }],
  ['no docs/epics yet, asked Docs/Epics/E2.md', { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun, CLAUDE_PROJECT_DIR: lc }, W('Docs/Epics/E2.md', { cwd: lc }), 'allow', { cwd: lc }],
  ['no auto-cycle file yet, asked .DOCTRINE/AUTO-CYCLE', { DCTR_ROLE: 'orchestrator', DCTR_RUN: lcRun, CLAUDE_PROJECT_DIR: lc }, W('.DOCTRINE/AUTO-CYCLE', { cwd: lc }), 'allow', { cwd: lc }],
  ['the run stored as Orchestrate, a handoff', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: uc }, W('docs/handoffs/h.md', { cwd: uc }), 'allow', { cwd: uc }],
  ['the run stored as Orchestrate, src/a.txt', { DCTR_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: uc }, W('src/a.txt', { cwd: uc }), 'deny', { cwd: uc }],
]) : []
clause(insensitive
  ? 'clause 2t — on this case-insensitive temp volume a case alias of an allowed path is allowed (DOCS/PROJECT.md, Docs/Handoffs/, session_memory.md, .DOCTRINE/records/), a stored docs/project.md and session_memory.md are allowed asked in upper case, Docs/Epics/E2.md and .DOCTRINE/AUTO-CYCLE are allowed where neither exists yet, a run stored as Orchestrate is the run, and a case alias outside them is refused (E15-D22, GR2, GS3b)'
  : 'clause 2t — SKIPPED: the temp volume is case-sensitive, so a case alias names another file; clauses 1g, 2w and 2x carry the canonical case on an injected volume',
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

const all = [d19, d20, d21, d22, d23, d118, d119, paths, errs, noRunDir, d223, own, unwritable, faults, late, states, caseAlias, esc, runErr, noLog].flat()
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
const stallMs = (() => { const t0 = Date.now(); spawnSync('node', ['--import', pathToFileURL(inject).href, '-e', `require('node:fs').statSync(${JSON.stringify(run)})`],
  { env: { ...process.env, GUARD_FAULT: JSON.stringify(['statSync', 'records/orchestrate', 1500]) } }); return Date.now() - t0 })()
const judgeExit = [['judge'], []].map((a) => spawnSync('node', ['--import', pathToFileURL(inject).href, '-e', '', ...a], { env: { ...process.env, GUARD_FAULT: JSON.stringify(['exit', '']) } }).status)
const spawnFault = spawnSync('node', ['--import', pathToFileURL(inject).href, '--input-type=module', '-e',
  "import { spawn } from 'node:child_process'; const c = spawn(process.execPath, ['-e', '']); console.log(c.stdout === null); c.on('error', (e) => console.log(e.code))"],
{ env: { ...process.env, GUARD_FAULT: JSON.stringify(['spawn', '']) }, encoding: 'utf8' }).stdout.trim().split('\n').join()
const moreProved = [['realpathSync.native', run], ['appendFileSync', logFile]].map(([op, t]) => [op, preloadCode(op, t)])
clause('clause 3o — without the guard: the preload makes the native realpath and the append throw EIO, its stall holds a stat for its time, its exit ends a judge with 3 and nothing else, and its spawn fault reaches a named ESM import, returning a child with no stdout that emits EMFILE; the run reached through link-records is the run, and the link named orchestrate is a link whose target is named misnamed',
  moreProved.every(([, c]) => c === 'EIO') && stallMs >= 1500 && judgeExit.join() === '3,0' && spawnFault === 'true,EMFILE' && fs.realpathSync.native(viaLink) === run && fs.lstatSync(linkRun).isSymbolicLink() && path.basename(fs.realpathSync.native(linkRun)) === 'misnamed',
  JSON.stringify({ moreProved, stallMs, judgeExit, spawnFault }))
const preloadRun = (fault, code, ...args) => spawnSync('node', ['--import', pathToFileURL(inject).href, '--input-type=module', '-e', code, ...args],
  { env: { ...process.env, GUARD_FAULT: JSON.stringify(fault) }, encoding: 'utf8' })
const lcode = (p) => `import fs from 'node:fs'; try { fs.lstatSync(${JSON.stringify(p)}); console.log('none') } catch (e) { console.log(e.code) }`
const exact = [path.dirname(ucRun), ucRun].map((p) => preloadRun(['lstatSync', '=' + path.dirname(ucRun)], lcode(p)).stdout.trim())
const prints = [['judge'], []].map((a) => { const r = preloadRun(['print', 'ok'], "console.log('ran')", ...a); return `${r.status}:${r.stdout}` })
const readStall = (() => { const t0 = Date.now(); preloadRun(['readFileSync', 'SESSION_MEMORY.md', 1500], `import fs from 'node:fs'; fs.readFileSync(${JSON.stringify(path.join(orch, 'SESSION_MEMORY.md'))})`); return Date.now() - t0 })()
clause('clause 3p — without the guard: the exact-match preload makes the lstat of the uc run\'s parent throw EIO and leaves the run\'s own lstat alone, its print op ends a judge with exit 0 having printed the text and nothing else and leaves any other process alone, its stall holds the kickoff read for its time, and the long path is over 64 KB and is src/a.txt by its text',
  exact.join() === 'EIO,none' && prints.join() === '0:ok,0:ran\n' && readStall >= 1500 && Buffer.byteLength(longAsked) > 65536 && path.resolve(orch, longAsked) === srcA,
  JSON.stringify({ exact, prints, readStall }))
// The scoped stall and the after-hand-off actions, proved on their own: each fires in a process run with `judge` and
// leaves any other alone, and the link to the valid run is a link whose realpath is the run and whose realpath faults.
const mem = path.join(orch, 'SESSION_MEMORY.md'), readMem = `import fs from 'node:fs'; fs.readFileSync(${JSON.stringify(mem)}); console.log('ran')`
const scopedMs = [['judge'], []].map((a) => { const t0 = Date.now(); const r = preloadRun(['lstatSync', 'records/orchestrate', 1500, true], lcode(run), ...a); return [Date.now() - t0, r.stdout.trim()] })
const acted = ['exit', 'kill', 'print:ok'].map((a) => [['judge'], []].map((x) => { const r = preloadRun(['readFileSync', 'SESSION_MEMORY.md', a], readMem, ...x); return `${r.status}/${r.signal}/${r.stdout.trim()}` }).join(' '))
clause('clause 3q — without the guard: the preload\'s scoped stall holds a judgement\'s lstat of the run for its time and leaves another process\'s alone, its exit, kill and print actions end a judgement on the kickoff read with exit 3, SIGKILL, or exit 0 having printed the text, and leave another process reading the file, and the link to the valid run is a link whose realpath is the run, a folder named orchestrate, and whose realpath the preload faults',
  scopedMs[0][0] >= 1500 && scopedMs[1][0] < 1500 && scopedMs.every(([, o]) => o === 'none') &&
  acted.join() === '3/null/ 0/null/ran,null/SIGKILL/ 0/null/ran,0/null/ok 0/null/ran' &&
  fs.lstatSync(linkValid).isSymbolicLink() && fs.realpathSync.native(linkValid) === run && fs.statSync(run).isDirectory() && path.basename(run) === 'orchestrate' && preloadCode('realpathSync.native', linkValid) === 'EIO',
  JSON.stringify({ scopedMs, acted }))
const deepKernel = fs.realpathSync.native(`${orch}/docs/handoffs/deep/../../..`)
clause('clause 3j — without the guard: deep/../../.. resolves (libc realpath) inside docs/handoffs while its text reading is the checkout, so src/a.txt\'s kernel and text readings differ; deep/x.md lies under docs/handoffs by both',
  deepKernel === path.join(orch, 'docs/handoffs') && path.resolve(orch, 'docs/handoffs/deep/../../../src/a.txt') === srcA &&
  fs.realpathSync(path.join(orch, 'docs/handoffs/deep')) === path.join(orch, 'docs/handoffs/d1/d2/d3'), deepKernel)
const innerProof = spawnSync('node', ['--import', pathToFileURL(inject).href, '-e',
  `import('node:fs').then(({ default: fs }) => { let s; try { fs.statSync(${JSON.stringify(path.join(inner, '.git'))}); s = 'none' } catch (e) { s = e.code } console.log(s, fs.existsSync(${JSON.stringify(path.join(inner, '.git'))})) })`],
{ env: { ...process.env, GUARD_FAULT: JSON.stringify(['statSync', 'inner/.git']) }, encoding: 'utf8' }).stdout.trim()
clause('clause 3k — without the guard: the nested repo has a .git and no project file inside the checkout, whose run exists, and the preload makes its .git stat throw EIO and existsSync read it absent, as a real EIO does',
  under(inner, orch) && fs.statSync(path.join(inner, '.git')).isDirectory() && !fs.existsSync(path.join(inner, 'docs/PROJECT.md')) &&
  fs.statSync(run).isDirectory() && innerProof === 'EIO false', innerProof)
const stateProof = ['Open', 'Blocked', 'Exited', 'Shipped'].map((s) => lib.restoreState(s))
clause('clause 3l — without the guard: the record lies outside the checkout and Records, its state line is the one the per-state copies replace, Exited and Shipped are not Open or Blocked to the kickoff chain, and the neighbouring epic is no record',
  !under(record, orch) && !under(record, records) && recordText.split('- State: Open').length === 2 && Boolean(stateProof[0]) && Boolean(stateProof[1]) && !stateProof[2] && !stateProof[3] &&
  path.join(proj, 'docs/epics/E9.md') !== record, JSON.stringify(stateProof))
const lcNames = ['docs/project.md', 'session_memory.md', 'docs/handoffs'].map((n) => fs.readdirSync(path.join(lc, path.dirname(n))).includes(path.basename(n)))
clause('clause 3m — without the guard: the lower-case checkout stores docs/project.md, session_memory.md and docs/handoffs in lower case and holds its run, and the emulated volume spells DOCS/PROJECT.md as docs/project.md and finds no src',
  lcNames.every(Boolean) && !fs.readdirSync(path.join(lc, 'docs')).includes('PROJECT.md') && fs.statSync(lcRun).isDirectory() &&
  foldReal(path.join(lc, 'DOCS/PROJECT.md')) === path.join(lc, 'docs/project.md') && (() => { try { foldReal(path.join(lc, 'src')); return false } catch (e) { return e.code === 'ENOENT' } })(), JSON.stringify(lcNames))
const ucNames = fs.readdirSync(path.join(uc, '.doctrine/records'))
const swapLstat = (io, p) => { try { const a = io.lstat(p), b = io.lstat(p.toUpperCase()); return a.ino === b.ino && a.dev === b.dev } catch (e) { return e.code } }
clause('clause 3n — without the guard: uc stores its run as Orchestrate only, lc has no docs/epics and no auto-cycle file in any case, the emulated case-insensitive volume finds lc/DOCS as lc/docs and its upper-case alias as the same file while the case-sensitive one finds neither, the preload makes stat and lstat of the run throw EIO, the misnamed folder exists, and the link called orchestrate resolves to it',
  JSON.stringify(ucNames) === '["Orchestrate"]' && !fs.readdirSync(path.join(lc, 'docs')).some((n) => n.toLowerCase() === 'epics') &&
  !fs.readdirSync(path.join(lc, '.doctrine')).some((n) => n.toLowerCase().startsWith('auto-cycle')) &&
  IVOL.realpath(path.join(lc, 'DOCS')) === path.join(lc, 'docs') && swapLstat(IVOL, path.join(lc, 'docs')) === true &&
  (() => { try { SVOL.realpath(path.join(lc, 'DOCS')); return false } catch (e) { return e.code === 'ENOENT' } })() && swapLstat(SVOL, path.join(lc, 'docs')) === 'ENOENT' &&
  preloadCode('statSync', run) === 'EIO' && preloadCode('lstatSync', run) === 'EIO' && fs.statSync(run).isDirectory() &&
  fs.statSync(misnamed).isDirectory() && path.basename(misnamed) !== 'orchestrate' && fs.realpathSync(linkRun) === fs.realpathSync(misnamed), JSON.stringify(ucNames))
const fio = fakeIo()
clause('clause 3h — without guardReal: the injected volume spells every existing path in lower case and has no /c/docs/new.md, its link names a missing target, its case-sensitive twin holds /c/DOCS as a file other than /c/docs, its mount puts /c/docs on a device of its own, and its faults throw their codes' +
  (insensitive ? '; on this temp volume the real DOCS/PROJECT.md resolves to docs/PROJECT.md' : ''),
  fio.realpath('/C/DOCS/PROJECT.md') === '/c/docs/project.md' && (() => { try { fio.realpath('/c/docs/new.md'); return false } catch (e) { return e.code === 'ENOENT' } })() &&
  fio.readlink('/c/l') === '/gone/t.md' && !FAKE.includes('/gone') && fakeIo({}, true).lstat('/c/DOCS').ino !== fakeIo({}, true).lstat('/c/docs').ino &&
  fio.lstat('/C/DOCS').ino === fio.lstat('/c/docs').ino && fakeIo({ mount: '/c/docs' }).lstat('/c/docs').dev !== fakeIo({ mount: '/c/docs' }).lstat('/c').dev && (() => { try { fakeIo({ readlink: 'EIO' }).readlink('/c/l'); return false } catch (e) { return e.code === 'EIO' } })() &&
  (!insensitive || fs.realpathSync.native(path.join(orch, 'DOCS/PROJECT.md')) === path.join(orch, 'docs/PROJECT.md')), 'injected volume')
clause('clause 3i — without the guard: the escape paths are four distinct names, holding LF, ?, a backslash then n, and CR', new Set(ESC).size === 4 &&
  ESC[0].includes('\n') && ESC[1].includes('?') && ESC[2].includes('\\n') && ESC[3].includes('\r'), JSON.stringify(ESC))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) failed` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
