// doctrine — the doctor: re-checks, on the installed hosts, the host signals the hooks depend on (E10 S12, E10-R33).
//
//   node hooks/dctr-doctor.mjs [--host codex|claude] [--control] [--keep] [--save]
//
// Run it after a Codex, Claude Code or herdr update. In a fresh scratch dir it starts its own headless herdr server,
// gives each host a scratch home (Codex: CODEX_HOME with herdr's integration, the doctrine install and a probe logger,
// each trusted; Claude Code: CLAUDE_CONFIG_DIR with herdr's integration and the logger, the doctrine loaded with
// --plugin-dir from this checkout), a fixture project whose record is Open with auto-cycle off, and drives each host
// in a pane as doctorVerdict in dctr-lib.mjs describes. It prints one row per signal, by stable code, then the hook
// areas the drive does not exercise (DOCTOR_UNEXERCISED), then the verdict.
//
// Exit 0 every signal holds, 1 drift (the rows name each signal), 2 it cannot run (no herdr, no codex or claude
// binary, missing or near-expiry credentials, a socket path too long): the message says which.
// Cost: one to two minutes, and two cheap model turns per host (on Codex the model ~/.codex/config.toml names, else
// Codex's default, at low effort; haiku on Claude Code), one more on a host whose gate fails to block.
//
// What it writes: only its scratch dir under TMPDIR, removed at the end unless --keep, also on SIGINT, SIGTERM or
// SIGHUP, which then exit 130, 143 or 129. Its hosts, its herdr server and every other process it starts once the
// scratch dir exists run under an allowlisted environment: of the caller's variables only PATH, the locale (LANG,
// LC_*), TERM, USER, LOGNAME, SHELL, TZ and the proxy and CA variables the hosts reach their APIs with, and beside
// them HOME, TMPDIR and the XDG config, state, data, cache and runtime dirs, each set inside the scratch dir. It
// copies only the Claude Code OAuth entry of ~/.claude/.credentials.json and ~/.codex/auth.json into the scratch homes, reads the `model`
// line of ~/.codex/config.toml, and never writes ~/.codex or ~/.claude. It refuses to run on a token that expires
// within the hour, or on a Codex login last refreshed over 7 days ago, so a scratch copy never refreshes, and so
// never rotates, the user's token. Every process it
// starts carries DCTR_DOCTOR_RUN=<scratch dir>, and at the end it stops its herdr server and kills the server's process
// tree (read with ps) and each process whose environment carries that value (read from /proc where the host has one).
//
// --control drops the prompt gate's trust line from the scratch Codex config, a run in which T1 and G1 must drift;
// a doctor that reports them clean there cannot see. --save writes the observations, account identifiers redacted
// (doctorRedact), to observations.json in the scratch dir, keeps that one file when the rest is removed, and prints
// its path; dctr-doctor.selftest.mjs reads such a file as its captures.
//
// Host-internal details it depends on, beside documented hook contracts: Codex's trust-line key and hash
// (trustedHash), the Codex composer's text (composerIdle), the rollout and transcript layouts the readers parse, the
// credentials files' layout, and Claude Code's 103-byte limit on the socket path it binds in XDG_RUNTIME_DIR.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { trustedHash, hookEventLabel, shq, doctorVerdict, doctorExit, doctorSummary, doctorRedact, DOCTOR_PLAIN, DOCTOR_MARKED, DOCTOR_DRAFT, READY_STATUSES, composerIdle, composerLine } from './dctr-lib.mjs'

const USAGE = 'usage: node dctr-doctor.mjs [--host codex|claude] [--control] [--keep] [--save]\n'
const argv = process.argv.slice(2), opt = { hosts: ['codex', 'claude'], control: false, keep: false, save: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--host' && ['codex', 'claude'].includes(argv[i + 1])) opt.hosts = [argv[++i]]
  else if (a === '--control') opt.control = true
  else if (a === '--keep') opt.keep = true
  else if (a === '--save') opt.save = true
  else { process.stderr.write(USAGE); process.exit(2) }
}
const cannot = (why) => { process.stderr.write(`dctr-doctor: cannot run: ${why}\n`); process.exit(2) }
const HOOKS = import.meta.dirname, PLUGIN = path.dirname(HOOKS)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const which = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).stdout.trim() || null
const version = (bin) => { try { return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 30000 }).trim() } catch { return null } }

// ---- prerequisites, read before anything is written
const userHome = os.homedir()
const bins = { herdr: which('herdr'), codex: which('codex'), claude: which('claude') }
for (const b of ['herdr', ...opt.hosts]) if (!bins[b]) cannot(`no ${b} on PATH`)
const soon = Date.now() + 3600 * 1000
const creds = {}
if (opt.hosts.includes('codex')) {
  try { creds.codex = fs.readFileSync(path.join(userHome, '.codex', 'auth.json'), 'utf8') } catch { cannot('no ~/.codex/auth.json (log in to codex first)') }
  let exp = null
  try { const t = JSON.parse(creds.codex).tokens?.access_token; if (t) exp = JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).exp * 1000 } catch { /* an API key login has no token */ }
  if (exp !== null && exp < soon) cannot('the Codex access token in ~/.codex/auth.json expires within the hour; run codex once so it refreshes, then re-run')
  // Codex also refreshes a login whose last_refresh is some days old (8 in codex-rs, a host-internal figure), and a
  // refresh in the scratch copy would rotate the token the user's own file holds.
  let last = NaN
  try { last = Date.parse(JSON.parse(creds.codex).last_refresh) } catch { /* an API key login has none */ }
  if (last < Date.now() - 7 * 86400 * 1000) cannot(`~/.codex/auth.json was last refreshed over 7 days ago, so Codex could refresh it in the scratch copy; the first Codex run after ${new Date(last + 8 * 86400 * 1000).toISOString()} refreshes it, and then the doctor runs`)
  try { creds.model = /^model\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(userHome, '.codex', 'config.toml'), 'utf8').split(/^\[/m)[0])?.[1] ?? null } catch { creds.model = null }
}
if (opt.hosts.includes('claude')) {
  let oauth = null
  try { oauth = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(userHome, '.claude'), '.credentials.json'), 'utf8')).claudeAiOauth } catch { /* below */ }
  if (!oauth?.accessToken) cannot('no Claude Code OAuth login in .credentials.json (log in to claude first)')
  if (!(oauth.expiresAt > soon)) cannot('the Claude Code access token expires within the hour; run claude once so it refreshes, then re-run')
  creds.claude = JSON.stringify({ claudeAiOauth: oauth })
}

// ---- the cleanup, then the scratch dir and an allowlisted environment
const SAVED = 'observations.json'
let cleaned = false, serverPid = null
/** The pids under `top` in `ps`'s process table, `top` included: the herdr server and whatever it spawned, read
 *  without /proc so a host that has none (macOS) still stops them. */
function processTree(top) {
  const kids = new Map()
  for (const l of execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 10000 }).split('\n')) {
    const [pid, ppid] = l.trim().split(/\s+/).map(Number)
    if (pid) kids.set(ppid, [...(kids.get(ppid) || []), pid])
  }
  const out = [top]
  for (let i = 0; i < out.length; i++) out.push(...(kids.get(out[i]) || []))
  return out
}
/** Stops what the run started and removes the scratch dir, each step guarded on its own so a failure in one (no
 *  /proc on macOS) never leaves the dir and its credential copies behind. */
function cleanup() {
  if (cleaned) return
  cleaned = true
  try { herdr(['server', 'stop']) } catch { /* killed below */ }
  const pids = new Set()
  try { if (serverPid) processTree(serverPid).forEach((p) => pids.add(p)) } catch { /* no ps: /proc below */ }
  try {
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      try { if (fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').includes(`DCTR_DOCTOR_RUN=${root}`)) pids.add(Number(pid)) } catch { /* gone, or not ours */ }
    }
  } catch { /* no /proc (macOS): the server's tree above stands for it */ }
  pids.delete(process.pid)
  for (const pid of pids) try { process.kill(pid, 'SIGKILL') } catch { /* gone */ }
  if (opt.keep) return
  const keep = opt.save && fs.existsSync(path.join(root, SAVED))
  for (const f of keep ? fs.readdirSync(root).filter((f) => f !== SAVED) : ['.']) fs.rmSync(path.join(root, f), { recursive: true, force: true })
}
// An interrupt runs the same cleanup, so neither the scratch dir, the detached herdr server nor a TUI holding the
// scratch credentials outlives the doctor. The handlers are in place before the scratch dir is made, and a handler
// runs only when the event loop next turns, which is after that, so an interrupt at any point leaves nothing behind.
for (const [sig, n] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(sig, () => { process.stderr.write(`dctr-doctor: ${sig}, cleaning up\n`); cleanup(); process.exit(n) })
}

// The scratch dir sits under the caller's TMPDIR, so it is made before that variable goes.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-doctor-'))
const dir = (...p) => { const d = path.join(root, ...p); fs.mkdirSync(d, { recursive: true }); return d }
const sock = path.join(root, 'x', 'herdr', 'herdr.sock')
if (Buffer.byteLength(sock) > 100) { fs.rmSync(root, { recursive: true, force: true }); cannot(`the herdr socket path ${sock} is too long; set TMPDIR to a short dir such as /tmp`) }
// Claude Code binds <XDG_RUNTIME_DIR>/cc-socks/<pid>.sock while that path is at most 103 bytes, and past that
// /tmp/cc-socks-<uid>/<pid>.sock, outside the scratch dir. The path is measured at a 7-digit pid, the widest Linux has.
const ccSock = path.join(root, 'r', 'cc-socks', '9999999.sock')
if (Buffer.byteLength(ccSock) > 103) { fs.rmSync(root, { recursive: true, force: true }); cannot(`Claude Code's socket path ${ccSock} is too long; set TMPDIR to a short dir such as /tmp`) }
// An allowlist, so no variable the caller carries steers where a host writes: what a host needs to start (PATH, the
// locale, TERM, the user and shell names, the time zone) and to reach its API through a proxy, and nothing else. It
// replaces the doctor's own environment, which the herdr calls in dctr-state.mjs and every child below inherit.
const KEEP = /^(PATH|LANG|LC_\w+|TERM|USER|LOGNAME|SHELL|TZ|(HTTPS?|ALL|NO)_PROXY|(https?|all|no)_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_(FILE|DIR))$/
for (const k of Object.keys(process.env)) if (!KEEP.test(k)) delete process.env[k]
// The runtime dir is where a host puts its sockets (Claude Code: cc-socks/<pid>.sock, whose length is checked above),
// so its name is one letter.
const runtime = dir('r')
fs.chmodSync(runtime, 0o700)
Object.assign(process.env, { HOME: dir('home'), TMPDIR: dir('tmp'), XDG_CONFIG_HOME: dir('x'), XDG_STATE_HOME: dir('xs'), XDG_DATA_HOME: dir('xd'), XDG_CACHE_HOME: dir('xc'), XDG_RUNTIME_DIR: runtime, DCTR_DOCTOR_RUN: root, HERDR_SOCKET_PATH: sock })
const env = { ...process.env }
delete env.HERDR_SOCKET_PATH
// Imported after TMPDIR is set, so the restore and gated files resolve inside the scratch dir.
const { herdr, herdrText, restoreFile, gatedFile } = await import('./dctr-state.mjs')
// Read here and not with the prerequisites, so a host answering --version runs under the same environment.
const versions = { codex: opt.hosts.includes('codex') ? version('codex') : null, claude: opt.hosts.includes('claude') ? version('claude') : null, herdr: version('herdr') }

const write = (file, text, mode = 0o644) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode }) }
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
const run = (cmd, args, extra = {}) => execFileSync(cmd, args, { env: { ...env, ...extra }, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })

// The fixture: a project whose kickoff names a handoff whose record is Open, with no auto-cycle line, so the restore
// hook injects and writes the restore file, and the cycle hook stands down.
const proj = dir('proj')
write(path.join(proj, 'SESSION_MEMORY.md'), '# Session memory\n\n## Next Session Kickoff\nhandoff: docs/handoffs/h.md | state: none\n')
write(path.join(proj, 'docs/handoffs/h.md'), 'supersedes: none\nphase: `doctor-fixture`, state: Open\nrecord: `.doctrine/records/r.md`\nwrapper: doctrine-code\n\n# Handoff\nA fixture for dctr-doctor. There is no work to do.\n')
write(path.join(proj, '.doctrine/records/r.md'), '# doctor-fixture record\nWrapper: doctrine:doctrine-code.\n\n- State: Open\n')
try { run('git', ['init', '-q', proj]) } catch { /* the hooks do not need a repo */ }

// The probe logger: one line per hook payload, with the fields the hooks read and the session this pane's restore
// file names at that moment.
const hooklog = path.join(root, 'hooklog.jsonl'), logger = path.join(root, 'logger.mjs')
write(logger, `import fs from 'node:fs'
import { restoreFile } from ${JSON.stringify(path.join(HOOKS, 'dctr-state.mjs'))}
let p = {}; try { p = JSON.parse(fs.readFileSync(0, 'utf8')) } catch {}
let restored = null; try { restored = JSON.parse(fs.readFileSync(restoreFile(process.env.HERDR_PANE_ID), 'utf8')).session_id ?? null } catch {}
const line = { t: Date.now(), event: p.hook_event_name, keys: Object.keys(p), restored }
for (const k of ['session_id', 'transcript_path', 'source', 'prompt', 'stop_hook_active', 'cwd', 'reason', 'last_assistant_message', 'turn_id']) if (k in p) line[k] = p[k]
fs.appendFileSync(${JSON.stringify(hooklog)}, JSON.stringify(line) + '\\n')
`)
const LOGGED = ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd']
const loggerGroup = { hooks: [{ type: 'command', command: `node ${shq(logger)}`, timeout: 5 }] }
const logLines = () => { try { return fs.readFileSync(hooklog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }

/** Every doctrine hook.log line of the run so far; read more than once, since a session's end sweeps its log. */
const seenHookLog = new Set()
const snapHookLogs = () => {
  for (const d of fs.readdirSync(process.env.TMPDIR).filter((d) => d.startsWith('dctr-'))) {
    try { fs.readFileSync(path.join(process.env.TMPDIR, d, 'hook.log'), 'utf8').split('\n').filter(Boolean).forEach((l) => seenHookLog.add(l)) } catch { /* none */ }
  }
}

function setupCodex() {
  const home = dir('codex-home')
  write(path.join(home, 'auth.json'), creds.codex, 0o600)
  run('herdr', ['integration', 'install', 'codex'], { CODEX_HOME: home })
  run('node', [path.join(HOOKS, 'dctr-codex.mjs'), 'install', '--codex-home', home])
  const hooksPath = path.join(fs.realpathSync(home), 'hooks.json'), doc = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
  for (const ev of LOGGED) (doc.hooks[ev] ||= []).push(loggerGroup)
  fs.writeFileSync(hooksPath, JSON.stringify(doc, null, 2) + '\n')
  let config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8')
  const key = (ev, gi, hi) => `[hooks.state.${JSON.stringify(`${hooksPath}:${hookEventLabel(ev)}:${gi}:${hi}`)}]`
  for (const [ev, groups] of Object.entries(doc.hooks)) groups.forEach((g, gi) => g.hooks.forEach((h, hi) => {
    if (!config.includes(key(ev, gi, hi))) config += `\n${key(ev, gi, hi)}\ntrusted_hash = "${trustedHash(ev, g, hi)}"\n`
  }))
  if (opt.control) {
    const gi = doc.hooks.UserPromptSubmit.findIndex((g) => g.hooks[0].command.includes('dctr-promptgate.mjs'))
    config = config.replace(new RegExp(`\\n?${key('UserPromptSubmit', gi, 0).replace(/[[\]().*+?^$|\\]/g, '\\$&')}\\ntrusted_hash = "[^"]*"\\n`), '\n')
  }
  config += `\n[projects.${JSON.stringify(proj)}]\ntrust_level = "trusted"\n\n[tui]\nscreen_reader_detection_done = true\n`
  if (creds.model) config += `\n[tui.model_availability_nux]\n${JSON.stringify(creds.model)} = 4\n`
  fs.writeFileSync(path.join(home, 'config.toml'), config)
  return `cd ${shq(proj)} && CODEX_HOME=${shq(home)} codex --dangerously-bypass-approvals-and-sandbox -c allow_login_shell=false ` +
    `-c check_for_update_on_startup=false -c model_reasoning_effort='"low"'${creds.model ? ` -c model=${shq(JSON.stringify(creds.model))}` : ''}`
}

function setupClaude() {
  const cfg = dir('claude-cfg')
  write(path.join(cfg, '.credentials.json'), creds.claude, 0o600)
  write(path.join(cfg, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, theme: 'dark', projects: { [proj]: { hasTrustDialogAccepted: true } } }))
  run('herdr', ['integration', 'install', 'claude'], { CLAUDE_CONFIG_DIR: cfg })
  const file = path.join(cfg, 'settings.json'), s = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const ev of LOGGED) ((s.hooks ||= {})[ev] ||= []).push(loggerGroup)
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n')
  return `cd ${shq(proj)} && CLAUDE_CONFIG_DIR=${shq(cfg)} claude --model haiku --plugin-dir ${shq(PLUGIN)}`
}

/** Polls `fn` every 500 ms until it returns a value other than null/undefined/false, or `ms` passes. */
async function until(fn, ms) {
  for (const end = Date.now() + ms; ;) {
    const v = fn()
    if (v !== null && v !== undefined && v !== false) return v
    if (Date.now() > end) return null
    await sleep(500)
  }
}

async function drive(host) {
  const launch = host === 'codex' ? setupCodex() : setupClaude()
  const ws = herdr(['workspace', 'create', '--label', `dctr-doctor ${host}`, '--cwd', proj, '--focus']).result
  const P = ws.root_pane.pane_id
  const read = () => { try { return herdrText(['pane', 'read', P, '--source', 'recent', '--lines', '80']) } catch { return null } }
  // On Codex each line waits for an empty composer, so a line typed while the TUI is still busy is not lost. A screen
  // that covers the composer (a hook review, a dialog) is kept for L1 and dismissed once with esc, which trusts
  // nothing, so the drive can show which hooks then run; one that stays stops the drive there.
  const stopped = new Error('stopped')
  const idle = () => until(() => composerIdle(read()) === true, 15000)
  const type = async (text) => {
    if (host === 'codex' && !(await idle())) {
      const screen = read()
      if (obs.covered) { obs.stuck = { before: text, screen }; throw stopped }
      obs.covered = { before: text, screen }
      herdr(['pane', 'send-keys', P, 'esc'])
      if (!(await idle())) { obs.stuck = { before: text, screen: read() }; throw stopped }
    }
    herdr(['pane', 'run', P, text])
  }
  const from = logLines().length
  const log = () => logLines().slice(from)
  const after = (i, pred) => log().find((e, j) => j > i && pred(e))
  const obs = { host, launched: false, log: [], blocked: {}, passed: {}, transcript: {}, composer: {}, pane: {}, hookLogs: '' }
  try {
    herdr(['pane', 'run', P, launch])
    // Codex fires no hook until the first prompt, so its composer is the ready sign; Claude Code fires SessionStart.
    obs.launched = Boolean(await until(() => (host === 'codex' ? composerIdle(read()) === true : log().some((e) => e.event === 'SessionStart')), 90000))
    if (!obs.launched) { obs.stuck = { before: DOCTOR_MARKED, screen: read() }; return obs }
    await sleep(3000)
    const ups = (marked) => (i) => after(i, (e) => e.event === 'UserPromptSubmit' && String(e.prompt).includes(marked ? DOCTOR_MARKED : DOCTOR_PLAIN))

    let i = log().length - 1
    await type(DOCTOR_MARKED)
    await until(() => ups(true)(i), 30000)
    await sleep(10000) // long enough for a turn the gate failed to block to reach its Stop
    obs.blocked.gated = readJson(gatedFile(P))
    if (!obs.blocked.gated) await until(() => after(i, (e) => e.event === 'Stop'), 120000) // let an unblocked turn end

    i = log().length - 1
    await type(DOCTOR_PLAIN)
    const stop = await until(() => { const u = log().findIndex((e, j) => j > i && e.event === 'UserPromptSubmit'); return u >= 0 && after(u, (e) => e.event === 'Stop') }, 120000)
    await sleep(3000) // Codex writes the turn's end into the rollout after the Stop returns
    if (stop) obs.transcript = { path: stop.transcript_path, text: (() => { try { return fs.readFileSync(stop.transcript_path, 'utf8') } catch { return null } })() }
    snapHookLogs()

    await type('/clear')
    if (host === 'codex') {
      // C3: the reads of the 3 s right after the /clear, kept as the first with no composer line, else the first.
      for (const end = Date.now() + 3000; Date.now() < end; await sleep(100)) {
        const t = read()
        if (obs.composer.afterClear === undefined) obs.composer.afterClear = t
        if (typeof t === 'string' && composerLine(t) === null) { obs.composer.afterClear = t; break }
      }
    }
    await sleep(5000)
    if (host === 'codex') {
      obs.composer.cleared = read()
      herdr(['pane', 'send-text', P, DOCTOR_DRAFT])
      await sleep(1500)
      obs.composer.draft = read()
      herdr(['pane', 'send-keys', P, 'ctrl+u'])
    }

    i = log().length - 1
    fs.rmSync(gatedFile(P), { force: true })
    await type(DOCTOR_MARKED)
    // Claude Code fires SessionStart(clear) at /clear, Codex at this first prompt.
    await until(() => { const s = log().findLast((e) => e.event === 'SessionStart' && e.source === 'clear'); return s && after(i, (e) => e.event === 'Stop' && e.session_id === s.session_id) }, 120000)
    await sleep(2000)
    obs.passed.gated = readJson(gatedFile(P))
    let p = null
    // herdr-lint: a failed or empty read is recorded as unread, which drifts H1 and H2; nothing is closed or typed on it.
    const paneNow = () => { try { return herdr(['pane', 'get', P])?.result?.pane ?? null } catch { return null } }
    await until(() => { p = paneNow(); return READY_STATUSES.includes(p?.agent_status) }, 15000)
    obs.pane = { agent_status: p?.agent_status ?? null, agent_session: p?.agent_session?.value ?? null }
    snapHookLogs()

    i = log().length - 1
    await type(host === 'codex' ? '/quit' : '/exit')
    await until(() => after(i, (e) => e.event === 'SessionEnd'), 20000)
  } catch (e) {
    if (e !== stopped) throw e
  } finally {
    obs.log = log()
    obs.hookLogs = [...seenHookLog].join('\n')
  }
  return obs
}

let code = 2
try {
  let spawnError = null
  const server = spawn('herdr', ['server'], { env, cwd: root, detached: true, stdio: 'ignore' })
  server.on('error', (e) => { spawnError = e })
  serverPid = server.pid ?? null
  server.unref()
  if (!(await until(() => spawnError || fs.existsSync(sock), 15000)) || spawnError) throw new Error(`the herdr server did not start${spawnError ? `: ${spawnError.message}` : ''}`)
  await sleep(500)
  console.log(`dctr-doctor: ${[versions.codex, versions.claude, versions.herdr].filter(Boolean).join(', ')}${opt.control ? ' (control: the prompt gate untrusted on Codex)' : ''}`)
  const all = {}, results = {}
  for (const host of opt.hosts) {
    all[host] = await drive(host)
    results[host] = doctorVerdict(all[host])
  }
  console.log(doctorSummary(results))
  code = doctorExit(Object.values(results).flat())
  if (opt.save) {
    fs.writeFileSync(path.join(root, SAVED), JSON.stringify(doctorRedact(all), null, 1) + '\n')
    console.log(`dctr-doctor: observations written to ${path.join(root, SAVED)}`)
  }
  if (opt.keep) console.log(`dctr-doctor: scratch dir kept at ${root}`)
} catch (e) {
  process.stderr.write(`dctr-doctor: cannot run: ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}\n`)
  code = 2
} finally {
  cleanup()
}
process.exit(code)
