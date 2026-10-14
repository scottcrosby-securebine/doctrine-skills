// doctrine — the round guard (issue #62, phase visibility-62, R1 and R7-R9).
//
// PreToolUse, matcher `Bash|Write|Edit` in hooks.json, Claude Code only. Before a tool call that writes a round line
// into a run record, it refuses the call when the same call does not run dctr-token.mjs, or when the record or the
// incoming text names a gate transcript (a path ending .out, .out.result or .output: absolute, `~/`, `$TMPDIR` or
// relative to the call's cwd, and through realpath where it exists) under /tmp or the temp directory, which dies
// with the session. The refusal is a PreToolUse deny whose reason reaches the orchestrator
// before the line exists, and it fires once per round per record per session: the latch file `roundguard.json` in the
// session's own state directory (dctr-state.mjs stateDir, the seat hook's) holds the refusal, so an identical retry
// goes through. A latch that cannot be read or written allows the call. A fixed directory shared under /tmp would let another local user pre-create it or plant a symlink. Every decision is
// roundGuardDecision in dctr-lib.mjs; this file reads the payload, the record and the latch.
//
// It stands down exactly where dctr-token.mjs does (a contained session, outside herdr, no HERDR_PANE_ID), because a
// publish that cannot happen is not missing, and it calls no herdr. Any error allows the call: a guard over a
// display must never stop a doctrine run by failing.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { skipReason, paneToken, roundGuardDecision, roundGuardReason } from './dctr-lib.mjs'
import { stateDir } from './dctr-state.mjs'

try {
  const env = process.env
  const standDown = (env.DCTR_VIEW_REQUEST_DIR ? 'contained session' : null) ?? skipReason(env) ?? (env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID')
  if (standDown) process.exit(0)
  const payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  // A subagent's call never counts: a seat never publishes the orchestrator's tokens.
  if (payload.agent_id) process.exit(0)
  // Each gate path is judged where it really lies (ruling V3BMECH): through realpath when it exists, so a symlink at a
  // durable-looking path into the scratchpad is seen, and each tmp dir by its own real path too, since /tmp may be one.
  const real = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.resolve(p))
  const ctx = {
    cwd: payload.cwd || process.cwd(), home: os.homedir(), tmpdir: os.tmpdir(), resolve: real,
    tmpDirs: [...new Set(['/tmp', os.tmpdir()].flatMap((d) => [d, real(d)]))],
    pluginRoot: env.CLAUDE_PLUGIN_ROOT || path.resolve(import.meta.dirname, '..'),
  }
  const pre = roundGuardDecision(payload.tool_name, payload.tool_input, null, ctx)
  if (pre.round === null) process.exit(0)
  // A missing or unreadable record is judged on the incoming text alone, never refused for being unreadable.
  let recordText = null
  try { if (pre.target) recordText = fs.readFileSync(pre.target, 'utf8') } catch { /* judged on the incoming text */ }
  const d = roundGuardDecision(payload.tool_name, payload.tool_input, recordText, ctx)
  if (!d.refuse) process.exit(0)

  const key = `${payload.session_id || '-'}|${d.target || '-'}|${d.round}`
  const latch = path.join(stateDir(paneToken(payload.session_id || 'nosession')), 'roundguard.json')
  // No latch yet refuses and writes one. A latch that cannot be read or written allows (fail open), since a refusal
  // the latch cannot hold would refuse the identical retry too, and a guard must never stop a run by failing.
  let seen
  try { seen = JSON.parse(fs.readFileSync(latch, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') process.exit(0); seen = [] }
  if (!Array.isArray(seen)) process.exit(0)
  if (seen.includes(key)) process.exit(0)
  try { fs.mkdirSync(path.dirname(latch), { recursive: true }); fs.writeFileSync(latch, JSON.stringify([...seen, key])) } catch { process.exit(0) }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: roundGuardReason(d) } }))
  process.exit(0)
} catch {
  process.exit(0)
}
