// The commands `doctrine-orchestrate` runs instead of computing a number in prose (KS-1).
//
//   node hooks/dctr-orchestrate.mjs capacity <tier> <transcript path>
//   node hooks/dctr-orchestrate.mjs launch-flags
//   node hooks/dctr-orchestrate.mjs start <model id> [<request file>]
//
// capacity prints one line: `accept window <n> from <bridge|rollout> load <n> tier <n> margin <n>`, or `refuse` with
// the window and its source where the host recorded one and every reason. Exit 0 accept, 1 refuse, 2 malformed
// arguments.
//
// launch-flags prints launchFlags for the mode file of the calling session's herdr TUI pane (herdrPane), the fragment a
// command for starting an orchestrator ends with so it starts in the calling session's mode as the command runs, or an
// empty line where it has no such pane, herdr-core included whatever HERDR_PANE_ID it inherited, and exits 0.
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
//
// start (E15-SK10) starts the run's orchestrator session from a session with no DCTR_ROLE, inside herdr, in a repo
// carrying docs/PROJECT.md. It writes the launch command to `launch.sh` in a new directory under TMPDIR:
// `claude` started in the checkout's top level with DCTR_ROLE and DCTR_CALLER `orchestrator`, DCTR_RUN the absolute
// `<Records>/orchestrate`, the caller's config dir, PATH and TMPDIR, `--model <model id>`, launchFlags for the mode file
// of the calling pane (HERDR_PANE_ID), read as the file runs, and, with a request file, `--` and its text as the first
// prompt, so a request opening with `-` is never read as an option. It then makes one tab in HERDR_WORKSPACE_ID, polls
// `pane get` of the new pane until a reply answers with no agent session and agent_status unknown (dctr-state.mjs's
// waitReady, the wait create makes before its launch line), types the one line `sh '<file>'`, which carries
// no PATH and so fits herdr's 1,024-byte limit on a typed line, and prints `dctr-orchestrate: started the orchestrator
// in <pane>`, exit 0. It refuses, exit 1 with one line, making no tab and no file and typing nothing: with DCTR_ROLE set,
// with DCTR_VIEW_REQUEST_DIR set, with no HERDR_WORKSPACE_ID, in a repo with no docs/PROJECT.md or no Records path, or
// with a request file it cannot read. A failure once the launch file is written exits 1 with one line naming the launch
// file, and the pane where there is one, as left in place, and closes and removes nothing. A herdr call that fails
// may still have acted, so a failed tab create says a tab may have been made and a failed send of the launch line says
// the line may have been typed. DCTR_START_TIMES ({"poll","ready"}, ms) overrides the
// poll interval and the wait for the fresh pane.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { capacityDecision, firstUsage, hostOf, launchFlags, launchCommand, readUsage, resolveTier, HANDOFF_COST_TOKENS, runRoot, repoOf, tabCreateArgs, shq, PREFIX, herdrPane } from './dctr-lib.mjs'
import { modeFile, herdr, waitReady } from './dctr-state.mjs'
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

let times = { poll: 1000, ready: 300000 }
try { times = { ...times, ...JSON.parse(process.env.DCTR_START_TIMES || '{}') } } catch { /* the defaults */ }

/** start (E15-SK10): starts the run's orchestrator session in a tab of its own, as the header says; exits 1 on a refusal
 *  or a failure, with one line. */
function start(model, request) {
  const refuse = (m) => { console.error(`dctr-orchestrate: start refused: ${m}`); process.exit(1) }
  const env = process.env
  if (env.DCTR_ROLE) refuse(`this session's DCTR_ROLE is ${env.DCTR_ROLE}, so it is in a run already`)
  if (env.DCTR_VIEW_REQUEST_DIR) refuse('a contained session (DCTR_VIEW_REQUEST_DIR set) makes no herdr tab')
  if (!env.HERDR_WORKSPACE_ID) refuse('no HERDR_WORKSPACE_ID, so there is no herdr workspace to make the tab in')
  let top
  try { top = fs.realpathSync(repoOf(path.join(process.cwd(), '.git'), fs.existsSync)) } catch (e) { refuse(`the checkout could not be read (${e.code || e.message})`) }
  const run = runRoot({ DCTR_ROLE: 'orchestrator' }, top)
  if (!run) refuse(`${top} names no run: it carries no docs/PROJECT.md giving a Records path`)
  let text = null
  if (request) try { text = fs.readFileSync(request, 'utf8') } catch (e) { refuse(`the request file ${request} could not be read (${e.code || e.message})`) }
  const tmp = path.resolve(env.TMPDIR || os.tmpdir()) // the pane starts elsewhere, so the typed path is absolute
  const fail = (m) => { console.error(`dctr-orchestrate: start failed: ${m}`); process.exit(1) }
  let file
  try {
    file = path.join(fs.mkdtempSync(path.join(tmp, `${PREFIX}-orchestrator-`)), 'launch.sh')
    fs.writeFileSync(file, `${launchCommand({ cwd: top, role: 'orchestrator', run, model: shq(model), flags: launchFlags(env.HERDR_PANE_ID ? modeFile(env.HERDR_PANE_ID) : null) })}` +
      `${text === null ? '' : ` -- ${shq(text)}`}\n`)
  } catch (e) { fail(`the launch file could not be written (${e.code || e.message})${file ? `; ${file} may be left in place` : ''}`) }
  let pane
  // herdr-lint: any failure here ends start and closes nothing, so a failed reply is never read as an answer
  try { pane = herdr(tabCreateArgs(env.HERDR_WORKSPACE_ID, `${PREFIX} · orchestrator`, top))?.result?.root_pane?.pane_id } catch (e) { fail(`the tab create failed (${e.message.split('\n')[0]}), and a tab may have been made; the launch file ${file} is left in place`) }
  if (!pane) fail(`herdr's tab create named no pane; the launch file ${file} is left in place`)
  const left = `the pane ${pane} and the launch file ${file} are left in place`
  // herdr reporting the pane gone is the one failure that leaves no pane in place
  waitReady(pane, { fresh: true, times, fail: (m) => fail(`${m}; ${m.endsWith(' is gone') ? `the launch file ${file} is left in place` : left}`) })
  try { herdr(['pane', 'run', pane, `sh ${shq(file)}`]) } catch (e) { fail(`the send of the launch line failed (${e.message.split('\n')[0]}), and the line may have been typed; ${left}`) }
  console.log(`dctr-orchestrate: started the orchestrator in ${pane}`)
}

const USAGE = 'usage: node hooks/dctr-orchestrate.mjs capacity <tier> <transcript path> | node hooks/dctr-orchestrate.mjs launch-flags | node hooks/dctr-orchestrate.mjs start <model id> [<request file>]'

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename) } catch { return false } })()
if (isMain) {
  const [cmd, tierText, transcript, ...extra] = process.argv.slice(2)
  if (cmd === 'start') {
    if (!tierText || extra.length) { console.error(USAGE); process.exit(2) }
    start(tierText, transcript)
    process.exit(0)
  }
  if (cmd === 'launch-flags' && !tierText) {
    console.log(launchFlags(herdrPane(process.env) ? modeFile(herdrPane(process.env)) : null))
    process.exit(0)
  }
  if (cmd !== 'capacity' || !tierText || !transcript || extra.length) {
    console.error(USAGE)
    process.exit(2)
  }
  let text = null
  try { text = fs.readFileSync(transcript, 'utf8') } catch {}
  const host = hostOf({ transcript_path: transcript })
  const v = capacity(tierText, text, hostWindow(transcript, text), host)
  console.log(v.line)
  process.exit(v.accept ? 0 : 1)
}
