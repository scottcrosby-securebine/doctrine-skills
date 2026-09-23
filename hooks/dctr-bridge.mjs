// Statusline bridge (E8-D23): wraps the user's statusLine command, passing its output through
// byte-identical, and writes the session's window size and context usage to a per-session file the
// context gauge reads.
//
//   node dctr-bridge.mjs install           copy this file to <configDir>/doctrine/dctr-bridge.mjs and
//                                          point settings.json's statusLine at the copy (G2/Q2)
//   node dctr-bridge.mjs -- <command...>   what the statusLine runs: record stdin, then run <command>
//
// Self-contained on purpose: the installed copy runs outside the plugin tree, so it imports node
// builtins only. The per-session directory is derived here the same way dctr-state.mjs's stateDir
// derives it (SC6); the selftest pins the two together.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const bridgeFile = (sessionId) => path.join(process.env.TMPDIR || os.tmpdir(), `dctr-${sessionId}`, 'bridge.json')

/** The session's bridge record, or null when it is missing, unreadable, or written for another
 *  session id: the gauge must never read another session's window (E8-D23). */
export function readBridge(sessionId) {
  try {
    const r = JSON.parse(fs.readFileSync(bridgeFile(sessionId), 'utf8'))
    return r && r.session_id === sessionId ? r : null
  } catch { return null }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The statusline stdin reduced to what the gauge needs, or null without a session id or a window.
 *  Used tokens are the harness's own figure: total_input_tokens, else the current_usage input sum. */
export function bridgeRecord(stdinJson) {
  let j = stdinJson
  if (typeof j === 'string') { try { j = JSON.parse(j) } catch { return null } }
  const cw = j?.context_window
  const window = num(cw?.context_window_size)
  if (!j?.session_id || window === null) return null
  const u = cw.current_usage
  const sum = u && typeof u === 'object'
    ? [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens].reduce((a, v) => a + (num(v) ?? 0), 0)
    : null
  return { session_id: j.session_id, window, used: num(cw.total_input_tokens) ?? sum, pct: num(cw.used_percentage), t: new Date().toISOString() }
}

const shQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`

/** settings with statusLine pointed at the copy. The copy's path and an existing command are each
 *  single-quoted for sh, so a config dir holding `$`, `"`, backticks or spaces reaches the copy as
 *  named, and a compound command (`a; b`, `a && b`) runs whole inside the bridge with its stdin.
 *  With no statusLine the command is the bare `--` form, which records and prints nothing (SC11);
 *  no arguments at all is the usage error. */
export function installStatusLine(settings, copyPath) {
  const self = `node ${shQuote(copyPath)}`
  const sl = settings.statusLine
  if (sl === undefined || sl === null) return { ...settings, statusLine: { type: 'command', command: `${self} --` } }
  if (sl.type !== 'command') throw new Error(`statusLine type ${JSON.stringify(sl.type)} is not "command"; only a command statusLine can be wrapped`)
  if (typeof sl.command !== 'string') throw new Error('statusLine has type "command" but no command string')
  if (sl.command.startsWith(self)) return settings
  return { ...settings, statusLine: { ...sl, command: `${self} -- ${shQuote(sl.command)}` } }
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${process.pid}`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

function install() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const copy = path.join(configDir, 'doctrine', 'dctr-bridge.mjs')
  const settingsPath = path.join(configDir, 'settings.json')
  let settings = {}
  let before = null
  try {
    if (fs.existsSync(settingsPath)) { before = fs.readFileSync(settingsPath, 'utf8'); settings = JSON.parse(before) }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings.json is not a JSON object')
    settings = installStatusLine(settings, copy)
  } catch (e) {
    process.stderr.write(`dctr-bridge install refused: ${settingsPath}: ${e.message}\n`)
    return 1
  }
  const self = fs.readFileSync(fileURLToPath(import.meta.url))
  let same = false
  try { same = Buffer.compare(fs.readFileSync(copy), self) === 0 } catch { /* no copy yet */ }
  if (!same) { writeAtomic(copy, self); console.log(`copied the bridge to ${copy}`) } else console.log(`${copy} is current`)
  const after = JSON.stringify(settings, null, 2) + '\n'
  if (before !== null && JSON.stringify(JSON.parse(before)) === JSON.stringify(settings)) {
    console.log(`${settingsPath}: no change, statusLine already runs the bridge`)
  } else {
    writeAtomic(settingsPath, after)
    console.log(`${settingsPath}: statusLine.command is now ${settings.statusLine.command}`)
  }
  return 0
}

/** The statusLine path. A bridge failure is reported on stderr and never changes the inner command's
 *  stdout or exit code. */
function passthrough(command) {
  let input = Buffer.alloc(0)
  try { input = fs.readFileSync(0) } catch { /* no stdin: the inner command gets none either */ }
  try {
    const rec = bridgeRecord(input.toString('utf8'))
    if (rec) writeAtomic(bridgeFile(rec.session_id), JSON.stringify(rec))
    else process.stderr.write('dctr-bridge: stdin has no session_id or context_window_size, nothing recorded\n')
  } catch (e) { process.stderr.write(`dctr-bridge: bridge file not written: ${e.message}\n`) }
  if (!command) return 0
  const r = spawnSync('sh', ['-c', command], { input, stdio: ['pipe', 'inherit', 'inherit'] })
  return r.status ?? 1
}

const USAGE = 'usage: node dctr-bridge.mjs install | node dctr-bridge.mjs -- <statusline command>\n'

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode === 'install') process.exit(install())
  else if (mode === '--') process.exit(passthrough(rest.join(' ')))
  else { process.stderr.write(USAGE); process.exit(2) }
}
