// doctrine — the orchestrator's write guard (E15 e15-guard).
//
// PreToolUse, matcher `Write|Edit|MultiEdit|NotebookEdit` in hooks.json, its own group. It acts only in a session whose
// DCTR_ROLE is `orchestrator` (runRole's reading, made here before the library loads), and it does not stand down on agent_id, so it covers the orchestrator's seats,
// which inherit that environment wherever their working tree is. There it allows a Write, Edit, MultiEdit or NotebookEdit
// only to a path guardAllowed in dctr-lib.mjs allows, judged where the path really lies (guardReal), against the context
// guardContext reads from the run; it refuses every other one with the PreToolUse deny shape and, where the run resolved
// (a context error after that included) and the call names its path, appends one line `<ISO 8601 UTC time> <tool> <path>` to <run>/guard.log, the path as the
// call gave it, made absolute against its cwd and never normalized, a backslash written \\, LF \n and CR \r. It keeps no latch, so an identical retry is
// refused again. Every other tool, Bash and every MCP tool among them, goes through.
//
// In the orchestrator's session any error refuses: dctr-lib.mjs and the node modules are loaded by dynamic import
// inside the try, so a library that cannot load is caught too, and the catch reads DCTR_ROLE itself because it
// cannot rely on that library. In any other session an error allows. It calls no herdr.
//
// The judgement runs in a child process, this file run with the argument `judge`, and this process waits for it no
// longer than BOUND_MS: past that it kills the child and refuses, so a read or an append that stalls cannot run the hook
// past the host's timeout for it (30 s in hooks.json), which the host takes as no objection (GS-1(a)). A refusal at the
// bound writes no guard.log line, since the append is one of the calls that can stall. This process makes no filesystem
// call and loads no library, so nothing it does can stall, and only the orchestrator's session pays for the child.

import { spawn } from 'node:child_process'
const BOUND_MS = 5000
const denial = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
// bounded() never settles, since every path through it ends the process; this await keeps the judgement below from running here.
if (process.argv[2] !== 'judge') await bounded()

let fs, path, run = null, tool = null, shown = null
// The log's reversible escape, so two refused paths never log alike and each stays on one line.
const ESC = { '\\': '\\\\', '\n': '\\n', '\r': '\\r' }
const deny = (reason) => {
  // A log that cannot be written still refuses: the refusal does not depend on the log.
  if (run && shown) try { fs.appendFileSync(path.join(run, 'guard.log'), `${new Date().toISOString()} ${tool} ${shown.replace(/[\\\r\n]/g, (c) => ESC[c])}\n`) } catch { /* refused anyway */ }
  process.stdout.write(denial(reason))
  process.exit(0)
}

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
  const ctx = lib.guardContext(process.env, process.env.CLAUDE_PROJECT_DIR || process.cwd())
  run = ctx.run
  if (lib.guardAllowed(lib.guardReal(written, cwd), ctx)) process.exit(0)
  deny(`doctrine guard: the orchestrator writes only its record, the Records path, docs/PROJECT.md, docs/epics/, its memory file, docs/handoffs/ and the .doctrine/auto-cycle files; this ${tool} of ${shown} is outside them, so it belongs to a lane.`)
} catch (e) {
  run ??= e?.run ?? null // a context error after the run resolved still logs (E15-D24)
  if (process.env.DCTR_ROLE === 'orchestrator') deny(`doctrine guard: refused, since the guard could not judge this call in the orchestrator's session (${e?.message ?? e}).`)
  process.exit(0)
}

function bounded() {
  return new Promise(() => {
    if (process.env.DCTR_ROLE !== 'orchestrator') process.exit(0)
    let over = false
    const end = (out) => { if (over) return; over = true; out ? process.stdout.write(out, () => process.exit(0)) : process.exit(0) }
    const refuse = (why) => end(denial(`doctrine guard: refused, since the guard could not judge this call in the orchestrator's session (${why}).`))
    try {
      const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, 'judge'], { stdio: ['inherit', 'pipe', 'pipe'] })
      const timer = setTimeout(() => { child.kill('SIGKILL'); refuse(`no judgement within ${BOUND_MS} ms`) }, BOUND_MS)
      let out = ''
      child.stdout.on('data', (b) => { out += b })
      child.stderr.pipe(process.stderr)
      child.on('error', (e) => { clearTimeout(timer); refuse(e.message) })
      child.on('close', (code, signal) => { clearTimeout(timer); code === 0 ? end(out) : refuse(`the judgement ended with ${signal ?? `exit ${code}`}`) })
    } catch (e) { refuse(e?.message ?? e) }
  })
}
