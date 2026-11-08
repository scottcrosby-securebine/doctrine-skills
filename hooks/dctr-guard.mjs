// doctrine — the orchestrator's write guard (E15 e15-guard).
//
// PreToolUse, matcher `Write|Edit|NotebookEdit` in hooks.json, its own group. It acts only in a session whose
// DCTR_ROLE is `orchestrator` (runRole), and it does not stand down on agent_id, so it covers the orchestrator's seats,
// which inherit that environment wherever their working tree is. There it allows a Write, Edit or NotebookEdit only
// to a path guardAllowed in dctr-lib.mjs allows, judged where the path really lies (guardReal), against the context
// guardContext reads from the run; it refuses every other one with the PreToolUse deny shape and appends one line,
// `<ISO 8601 UTC time> <tool> <absolute path>`, to <run>/guard.log. It keeps no latch, so an identical retry is
// refused again. Every other tool, Bash and every MCP tool among them, goes through.
//
// In the orchestrator's session any error refuses: dctr-lib.mjs and the node modules are loaded by dynamic import
// inside the try, so a library that cannot load is caught too, and the catch reads DCTR_ROLE itself because it
// cannot rely on that library. In any other session an error allows. It calls no herdr.

let fs, path, run = null, tool = null, shown = '-'
const deny = (reason) => {
  // A log that cannot be written still refuses: the refusal does not depend on the log.
  if (run) try { fs.appendFileSync(path.join(run, 'guard.log'), `${new Date().toISOString()} ${tool ?? '-'} ${shown.replace(/[\r\n]/g, '?')}\n`) } catch { /* refused anyway */ }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }))
  process.exit(0)
}

try {
  fs = (await import('node:fs')).default
  path = (await import('node:path')).default
  const lib = await import('./dctr-lib.mjs')
  if (lib.runRole(process.env) !== 'orchestrator') process.exit(0)
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'))
  tool = String(payload.tool_name)
  if (!Object.hasOwn(lib.GUARD_TOOLS, tool)) process.exit(0)
  const ctx = lib.guardContext(process.env, process.env.CLAUDE_PROJECT_DIR || process.cwd())
  run = ctx.run
  const cwd = payload.cwd || process.cwd()
  const field = lib.GUARD_TOOLS[tool], written = payload.tool_input?.[field]
  if (typeof written !== 'string' || !written) throw new Error(`the ${tool} call carries no ${field}`)
  shown = path.resolve(cwd, written)
  if (lib.guardAllowed(lib.guardReal(written, cwd), ctx)) process.exit(0)
  deny(`doctrine guard: the orchestrator writes only its record, the Records path, docs/PROJECT.md, docs/epics/, its memory file, docs/handoffs/ and the .doctrine/auto-cycle files; this ${tool} of ${shown} is outside them, so it belongs to a lane.`)
} catch (e) {
  if (process.env.DCTR_ROLE === 'orchestrator') deny(`doctrine guard: refused, since the guard could not judge this call in the orchestrator's session (${e?.message ?? e}).`)
  process.exit(0)
}
