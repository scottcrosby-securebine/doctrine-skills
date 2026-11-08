// doctrine — the orchestrator's write guard (E15 e15-guard).
//
// PreToolUse, matcher `Write|Edit|MultiEdit|NotebookEdit` in hooks.json, its own group. It acts only in a session whose
// DCTR_ROLE is `orchestrator` (runRole's reading, made here before the library loads), and it does not stand down on agent_id, so it covers the orchestrator's seats,
// which inherit that environment wherever their working tree is. There it allows a Write, Edit, MultiEdit or NotebookEdit
// only to a path guardAllowed in dctr-lib.mjs allows, judged where the path really lies (guardReal), against the context
// guardContext reads from the run; it refuses every other one with the PreToolUse deny shape and, where the run resolves
// (a context error after that included) and the call names its path, appends one line `<ISO 8601 UTC time> <tool> <path>` to <run>/guard.log, the path as the
// call gave it, made absolute against its cwd and never normalized, a backslash written \\, LF \n and CR \r. It keeps no latch, so an identical retry is
// refused again. Every other tool, Bash and every MCP tool among them, goes through.
//
// In the orchestrator's session any error refuses: dctr-lib.mjs and the node modules are loaded by dynamic import
// inside the try, so a library that cannot load is caught too, and the catch reads DCTR_ROLE itself because it
// cannot rely on that library. In any other session an error allows. It calls no herdr.
//
// The judgement runs in a child process, this file run with the argument `judge`, and this process waits for it no
// longer than BOUND_MS: past that it kills the child and refuses, so a read that stalls cannot run the hook past the
// host's timeout for it (30 s in hooks.json), which the host takes as no objection (GS-1(a)). The child never writes
// guard.log: once it has read the call, and before it reads the run or anything else on disk, it hands this process the
// line and the session's directory, and for every refusal, the child's own, one at the bound, a judgement that dies
// and one whose output is neither empty nor the deny shape, this process passes them to a second child run with the
// argument `log` and bounded the same way, which decides the run by guardRun, the judgement's own rule, and appends.
// So a stall in the judgement's reads, the run's own lstat or realpath among them, costs no line, and a stalled append
// cannot hold the deny. Where DCTR_RUN is set the run is named with no read; where it is unset the log child makes
// runRoot's reads, the .git walk and the project file, itself, so a stall there costs the line and never the deny,
// as a stall on the log child's own reads of the run does. This process makes no filesystem call and loads no library, so
// nothing it does can stall, and only the orchestrator's session pays for the children. Every decision is written
// before exit through the write's own callback, since a pipe write past its buffer is otherwise cut off at exit.

import { spawn } from 'node:child_process'
const BOUND_MS = 5000
const unjudged = (why) => `doctrine guard: refused, since the guard could not judge this call in the orchestrator's session (${why}).`
const denial = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
// Only empty output, no objection, or the deny shape is relayed; anything else, a deny cut short among it, refuses.
const relayable = (out) => {
  if (out === '') return true
  try { const o = JSON.parse(out), h = o.hookSpecificOutput; return Object.keys(o).join() === 'hookSpecificOutput' && h.hookEventName === 'PreToolUse' && h.permissionDecision === 'deny' && typeof h.permissionDecisionReason === 'string' } catch { return false }
}

if (process.argv[2] === 'log') await append()
// bounded() never settles, since every path through it ends the process; this await keeps the judgement below from running here.
if (process.argv[2] !== 'judge') await bounded()

let fs, path, tool = null, shown = null
// The log's reversible escape, so two refused paths never log alike and each stays on one line.
const ESC = { '\\': '\\\\', '\n': '\\n', '\r': '\\r' }
const deny = (reason) => new Promise(() => process.stdout.write(denial(reason), () => process.exit(0)))

try {
  fs = (await import('node:fs')).default
  path = (await import('node:path')).default
  const lib = await import('./dctr-lib.mjs')
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'))
  tool = String(payload.tool_name)
  if (!Object.hasOwn(lib.GUARD_TOOLS, tool)) process.exit(0)
  const cwd = payload.cwd || process.cwd()
  const field = lib.GUARD_TOOLS[tool], written = payload.tool_input?.[field]
  if (typeof written !== 'string' || !written) throw new Error(`the ${tool} call carries no ${field}`)
  shown = path.isAbsolute(written) ? written : `${cwd}/${written}`
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const line = `${new Date().toISOString()} ${tool} ${shown.replace(/[\\\r\n]/g, (c) => ESC[c])}\n`
  // Handed on before any read of the run, so a refusal at the bound still logs; the log child decides the run (E15-D24).
  await new Promise((sent) => process.send({ dir, line }, sent))
  const ctx = lib.guardContext(process.env, dir)
  if (lib.guardAllowed(lib.guardReal(written, cwd), ctx)) process.exit(0)
  await deny(`doctrine guard: the orchestrator writes only its record, the Records path, docs/PROJECT.md, docs/epics/, its memory file, docs/handoffs/ and the .doctrine/auto-cycle files; this ${tool} of ${shown} is outside them, so it belongs to a lane.`)
} catch (e) {
  if (process.env.DCTR_ROLE === 'orchestrator') await deny(unjudged(e?.message ?? e))
  process.exit(0)
}

function bounded() {
  return new Promise(() => {
    if (process.env.DCTR_ROLE !== 'orchestrator') process.exit(0)
    let over = false, log = null
    // A refusal is logged first, where the child handed on its line, by a child of its own killed at BOUND_MS; its
    // stdio is ignored, so one stuck where SIGKILL cannot end it holds none of the host's pipes. A log that cannot be
    // written still refuses: the refusal does not depend on the log.
    const logged = () => new Promise((done) => {
      if (!log) return done()
      try {
        const a = spawn(process.execPath, [...process.execArgv, import.meta.filename, 'log'], { stdio: ['pipe', 'ignore', 'ignore'] })
        const timer = setTimeout(() => { a.kill('SIGKILL'); done() }, BOUND_MS)
        a.on('error', done)
        a.on('close', () => { clearTimeout(timer); done() })
        a.stdin?.on('error', () => {}).end(JSON.stringify(log))
      } catch { done() }
    })
    const end = (out) => { if (over) return; over = true; out ? logged().then(() => process.stdout.write(out, () => process.exit(0))) : process.exit(0) }
    const refuse = (why) => end(denial(unjudged(why)))
    try {
      // stdout and stderr piped, never inherited: a child stuck where SIGKILL cannot end it must not hold the host's pipes open.
      const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, 'judge'], { stdio: ['inherit', 'pipe', 'pipe', 'ipc'] })
      // The listener first: on EMFILE spawn returns a child with no stdio and emits 'error' on the next tick, and an
      // unheard 'error' would end this process with exit 1, which the host reads as no objection. A late one meets the latch.
      child.on('error', (e) => refuse(e.message))
      const timer = setTimeout(() => { child.kill('SIGKILL'); refuse(`no judgement within ${BOUND_MS} ms`) }, BOUND_MS)
      let out = ''
      child.stdout.on('data', (b) => { out += b })
      child.stderr.pipe(process.stderr)
      child.on('message', (m) => { log = m })
      child.on('close', (code, signal) => { clearTimeout(timer); code !== 0 ? refuse(`the judgement ended with ${signal ?? `exit ${code}`}`) : relayable(out) ? end(out) : refuse('the judgement printed no decision') })
    } catch (e) { refuse(e?.message ?? e) }
  })
}

// The `log` child: decide the run the judgement's directory names, by guardRun as guardContext does, and append the
// line the parent read from the judgement to its guard.log. Any error is the parent's to ignore.
async function append() {
  const fs = (await import('node:fs')).default
  try {
    const { dir, line } = JSON.parse(fs.readFileSync(0, 'utf8')), { run } = (await import('./dctr-lib.mjs')).guardRun(process.env, dir)
    if (run) fs.appendFileSync(`${run}/guard.log`, line)
  } catch { /* refused anyway */ }
  process.exit(0)
}
