// The commands `doctrine-orchestrate` runs instead of computing a number in prose (KS-1).
//
//   node hooks/dctr-orchestrate.mjs capacity <tier> <transcript path>
//   node hooks/dctr-orchestrate.mjs launch-flags
//
// capacity prints one line: `accept window <n> from <bridge|rollout> load <n> tier <n> margin <n>`, or `refuse` with
// the window and its source where the host recorded one and every reason. Exit 0 accept, 1 refuse, 2 malformed
// arguments.
//
// launch-flags prints launchFlags for the mode file of the calling session's pane (HERDR_PANE_ID), the fragment a
// command for starting an orchestrator ends with so it starts in the calling session's mode as the command runs, or an
// empty line with no HERDR_PANE_ID, and exits 0.
//
// The window is only what the session's own host recorded for it, so the command names no model and accepts any. A
// Codex rollout (`rollout-` file name, as hostOf tells them apart) gives its latest token_count with input's model_context_window,
// source `rollout`. A Claude Code transcript gives the statusline bridge's per-session file for its session, the
// session id being the transcript's file name, source `bridge`: a file that is missing, does not parse, names another
// session, carries no numeric window or is older than the lane watcher's BRIDGE_EXPIRY_MS is no bridge reading. With
// no reading it refuses with the window unknown and the fix: on Claude Code, that there is no fresh bridge reading,
// to let the statusline draw once, and the bridge install command where the bridge is not installed; on Codex, that
// the rollout has no window yet. The load is the transcript's FIRST main-thread usage reading, the resume load,
// a rollout's first token_count with input on Codex. The tier
// is read as the gauge reads it (`resolveTier`: a number, `<n>%` or `default`), and any error it reports refuses, its
// floor raise included. The arithmetic is `capacityDecision` in dctr-lib.mjs. It reads the transcript once and the
// bridge file, and calls nothing else.

import fs from 'node:fs'
import path from 'node:path'
import { capacityDecision, firstUsage, hostOf, launchFlags, readUsage, resolveTier, HANDOFF_COST_TOKENS } from './dctr-lib.mjs'
import { modeFile } from './dctr-state.mjs'
import { bridgeFile, readBridge } from './dctr-bridge.mjs'
import { BRIDGE_EXPIRY_MS } from './dctr-lanewatch.mjs'

/** The window the session's bridge file reports, or null when there is no bridge reading: the file missing,
 *  unparseable, another session's, without a numeric window, or older than the watcher's expiry. */
export function bridgeWindow(sessionId) {
  let st
  try { st = fs.statSync(bridgeFile(sessionId)) } catch { return null }
  if (Date.now() - st.mtimeMs > BRIDGE_EXPIRY_MS) return null
  const w = readBridge(sessionId)?.window
  return Number.isFinite(w) && w > 0 ? w : null
}

/** The window the transcript's host recorded for its session, `{ window, source }`, or null where it recorded none.
 *  A rollout's is its latest; `text`, where given, is the rollout as already read, so window and load are one snapshot. */
export function hostWindow(transcript, text) {
  if (hostOf({ transcript_path: transcript }) === 'codex') {
    if (text === undefined) try { text = fs.readFileSync(transcript, 'utf8') } catch { text = null }
    const window = readUsage(text, null, 'codex').window
    return window ? { window, source: 'rollout' } : null
  }
  const window = bridgeWindow(path.basename(transcript, '.jsonl'))
  return window ? { window, source: 'bridge' } : null
}

const NO_WINDOW = {
  claude: 'there is no fresh statusline bridge reading for this session; let the statusline draw once, and where the bridge is not installed install it with node hooks/dctr-bridge.mjs install',
  codex: 'the rollout carries no model_context_window yet',
}

/** The capacity verdict as the line it prints and whether it accepts; reading is hostWindow's value and host the
 *  transcript's host, `claude` where omitted. */
export function capacity(tierText, transcriptText, reading, host = 'claude') {
  if (!reading) return { accept: false, line: `refuse window unknown: ${NO_WINDOW[host === 'codex' ? 'codex' : 'claude']}` }
  const { window, source } = reading
  const win = `window ${window} from ${source}`
  // readUsage reads one rollout line as a rollout holding only that token_count, so the first line it reads is the first reading.
  const usage = source === 'rollout'
    ? String(transcriptText ?? '').split('\n').map((l) => readUsage(l, null, 'codex')).find((r) => !r.unknown) ?? { unknown: 'none' }
    : firstUsage(transcriptText)
  if (usage.unknown) return { accept: false, line: `refuse ${win}: the resume load is unknown (${usage.unknown})` }
  const load = usage.used
  const resolved = resolveTier({ tierText, window, firstUsed: load, handoffCost: HANDOFF_COST_TOKENS })
  if (resolved.errors.length) return { accept: false, line: `refuse ${win} load ${load}: ${resolved.errors.join('; ')}` }
  const d = capacityDecision({ window, load, tier: resolved.tier })
  const facts = `${win} load ${d.load} tier ${d.tier} margin ${d.margin}`
  if (d.accept) return { accept: true, line: `accept ${facts}` }
  // resolveTier has already refused a tier above 90% of the window, so only the margin can refuse here.
  return { accept: false, line: `refuse ${facts}: load plus margin ${d.need} is not below the tier` }
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename) } catch { return false } })()
if (isMain) {
  const [cmd, tierText, transcript, ...extra] = process.argv.slice(2)
  if (cmd === 'launch-flags' && !tierText) {
    console.log(launchFlags(process.env.HERDR_PANE_ID ? modeFile(process.env.HERDR_PANE_ID) : null))
    process.exit(0)
  }
  if (cmd !== 'capacity' || !tierText || !transcript || extra.length) {
    console.error('usage: node hooks/dctr-orchestrate.mjs capacity <tier> <transcript path> | node hooks/dctr-orchestrate.mjs launch-flags')
    process.exit(2)
  }
  let text = null
  try { text = fs.readFileSync(transcript, 'utf8') } catch {}
  const host = hostOf({ transcript_path: transcript })
  const v = capacity(tierText, text, hostWindow(transcript, text), host)
  console.log(v.line)
  process.exit(v.accept ? 0 : 1)
}
