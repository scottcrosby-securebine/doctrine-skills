// Behavioral tamper test for the statusline bridge (E8-D23), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-bridge.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Drives hooks/dctr-bridge.mjs as the CLI it is installed as. Clause 1 confirms each refusal and each
// other-session read trips; clause 2 confirms the wrapped statusline's bytes and exit code pass through
// unchanged, concurrent sessions each leave a complete file, and the install writes the copy and the
// settings; clause 3 proves the fixtures carry what those clauses rest on without running the bridge.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { stateDir } from './dctr-state.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const bridge = path.join(import.meta.dirname, 'dctr-bridge.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-bridge-'))
process.env.TMPDIR = tmp
const { bridgeFile, readBridge, bridgeRecord, installStatusLine } = await import('./dctr-bridge.mjs')
const env = { ...process.env, TMPDIR: tmp }

const stdinFor = (id, extra = {}) => JSON.stringify({ session_id: id, model: { display_name: 'M' },
  context_window: { context_window_size: 200000, total_input_tokens: 15500, used_percentage: 8, current_usage: null, ...extra } })
// Multi-line, ANSI escapes, a byte that is not valid UTF-8, no trailing newline, a non-zero exit, and a
// compound command whose second half echoes the first byte of stdin: everything a re-encoding or an
// unquoted wrap loses, since unquoted the bridge takes stdin and the second half runs outside it.
const INNER = `printf '\\033[1;32mline one\\033[0m\\n'; head -c 1; printf 'line two \\377\\n  tail'; exit 3`
const sh = (cmd, input, e = env) => spawnSync('sh', ['-c', cmd], { input, env: e })
const cli = (args, extraEnv = {}, input = '') => spawnSync('node', [bridge, ...args], { input, env: { ...env, ...extraEnv }, encoding: 'utf8' })

// ---------------------------------------------------------------- clause 2: passthrough, concurrency, install

const direct = sh(INNER, stdinFor('pass-1'))
const wrapped = installStatusLine({ statusLine: { type: 'command', command: INNER } }, bridge).statusLine.command
const through = sh(wrapped, stdinFor('pass-1'))
clause('clause 2a — the installed wrap of a multi-line, ANSI, non-UTF-8, compound statusline passes stdout byte-identical and the exit code unchanged',
  Buffer.compare(direct.stdout, through.stdout) === 0 && through.status === direct.status && through.status === 3,
  `direct ${JSON.stringify(direct.stdout.toString('latin1'))}/${direct.status} wrapped ${JSON.stringify(through.stdout.toString('latin1'))}/${through.status} err ${through.stderr}`)
clause('clause 2b — the same run wrote the bridge file for its session id with the window and used tokens',
  JSON.stringify(readBridge('pass-1')) !== 'null' && readBridge('pass-1').window === 200000 && readBridge('pass-1').used === 15500,
  JSON.stringify(readBridge('pass-1')))

// A bridge that cannot write its file still passes the inner command through untouched.
const blocker = path.join(tmp, 'not-a-dir'); fs.writeFileSync(blocker, 'x')
const failing = sh(wrapped, stdinFor('pass-2'), { ...env, TMPDIR: blocker })
clause('clause 2c — a bridge write that fails changes neither the inner output nor its exit code',
  Buffer.compare(direct.stdout, failing.stdout) === 0 && failing.status === 3,
  `out ${JSON.stringify(failing.stdout.toString('latin1'))} code ${failing.status}`)

// A reader polls both files while the writers run: a write that truncates in place is seen empty or
// partial, which the gauge would then read as no bridge at all.
const race = (id) => new Promise((resolve) => {
  const c = spawn('node', [bridge, '--', 'cat >/dev/null'], { env })
  c.on('close', resolve); c.stdin.end(stdinFor(id, { total_input_tokens: 1000 + id.length, pad: 'p'.repeat(200000) }))
})
let torn = 0, reads = 0, racing = true
const poll = () => {
  for (const id of ['race-a', 'race-bb']) {
    let text = null
    try { text = fs.readFileSync(bridgeFile(id), 'utf8') } catch { /* not written yet */ }
    if (text !== null) { reads++; try { JSON.parse(text) } catch { torn++ } }
  }
  if (racing) setImmediate(poll)
}
poll()
await Promise.all(Array.from({ length: 40 }, (_, i) => race(i % 2 ? 'race-bb' : 'race-a')))
racing = false
const complete = (id) => { try { const j = JSON.parse(fs.readFileSync(bridgeFile(id), 'utf8')); return j.session_id === id && j.used === 1000 + id.length } catch { return false } }
clause('clause 2d — bridge processes for two sessions writing at once each leave a complete file carrying their own session id, and a concurrent reader never sees a partial one',
  complete('race-a') && complete('race-bb') && torn === 0 && reads > 0 && fs.readdirSync(path.dirname(bridgeFile('race-a'))).every((f) => !f.includes('.tmp')),
  `torn reads ${torn} of ${reads}, final ${fs.existsSync(bridgeFile('race-a')) && fs.readFileSync(bridgeFile('race-a'), 'utf8').slice(0, 120)}`)

clause('clause 2e — bridgeFile(id) is the bridge.json in the state dir the hooks derive for that session',
  bridgeFile('sess-x') === path.join(stateDir('sess-x'), 'bridge.json'), `${bridgeFile('sess-x')} vs ${stateDir('sess-x')}`)

clause('clause 2f — bridgeRecord reads the window, used tokens and percent; falls back to the current_usage sum; null without session or window',
  JSON.stringify((({ t, ...r }) => r)(bridgeRecord(stdinFor('r1')))) === JSON.stringify({ session_id: 'r1', window: 200000, used: 15500, pct: 8 }) &&
  typeof bridgeRecord(stdinFor('r1')).t === 'string' &&
  bridgeRecord({ session_id: 'r2', context_window: { context_window_size: 1000000, current_usage: { input_tokens: 5, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 7 } } }).used === 115 &&
  bridgeRecord({ session_id: 'r3', context_window: { context_window_size: 1000000, current_usage: null } }).used === null &&
  bridgeRecord({ context_window: { context_window_size: 200000 } }) === null && bridgeRecord({ session_id: 'r4', context_window: {} }) === null &&
  bridgeRecord('{not json') === null,
  JSON.stringify(bridgeRecord(stdinFor('r1'))))

const cfg = (name, settings) => {
  const d = path.join(tmp, 'cfg', name); fs.mkdirSync(d, { recursive: true })
  if (settings !== undefined) fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify(settings, null, 2))
  return d
}
const settingsOf = (d) => JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8'))
const copyOf = (d) => path.join(d, 'doctrine', 'dctr-bridge.mjs')
const EXISTING = { statusLine: { type: 'command', command: 'echo "hi there" | tr a-z A-Z', padding: 0, refreshInterval: 5 }, theme: 'dark', hooks: { Stop: [] } }

const cNone = cfg('none'), cNoSl = cfg('no-sl', { theme: 'dark' }), cCmd = cfg('cmd', EXISTING)
const rNone = cli(['install'], { CLAUDE_CONFIG_DIR: cNone }), rNoSl = cli(['install'], { CLAUDE_CONFIG_DIR: cNoSl }), rCmd = cli(['install'], { CLAUDE_CONFIG_DIR: cCmd })
const sameBytes = (d) => fs.existsSync(copyOf(d)) && Buffer.compare(fs.readFileSync(copyOf(d)), fs.readFileSync(bridge)) === 0
clause('clause 2g — install with no settings.json writes the copy and a statusline that runs only the copy, prints nothing and records the session',
  rNone.status === 0 && sameBytes(cNone) && JSON.stringify(settingsOf(cNone)) === JSON.stringify({ statusLine: { type: 'command', command: `node "${copyOf(cNone)}" --` } }) &&
  sh(settingsOf(cNone).statusLine.command, stdinFor('bare-1')).stdout.length === 0 && readBridge('bare-1')?.window === 200000,
  `code ${rNone.status} out ${rNone.stdout} err ${rNone.stderr}`)
clause('clause 2h — install over settings with no statusline adds one and keeps every other key',
  rNoSl.status === 0 && sameBytes(cNoSl) && settingsOf(cNoSl).theme === 'dark' && settingsOf(cNoSl).statusLine.command === `node "${copyOf(cNoSl)}" --`,
  `code ${rNoSl.status} out ${rNoSl.stdout} err ${rNoSl.stderr}`)
const wrappedCmd = settingsOf(cCmd).statusLine
clause('clause 2i — install over a command statusline wraps it, keeps refreshInterval, padding and every other key, and the wrap still prints the original output',
  rCmd.status === 0 && sameBytes(cCmd) && wrappedCmd.command.startsWith(`node "${copyOf(cCmd)}" -- `) && wrappedCmd.refreshInterval === 5 && wrappedCmd.padding === 0 &&
  settingsOf(cCmd).theme === 'dark' && JSON.stringify(settingsOf(cCmd).hooks) === '{"Stop":[]}' &&
  sh(wrappedCmd.command, stdinFor('inst-1')).stdout.toString() === 'HI THERE\n' && readBridge('inst-1')?.session_id === 'inst-1',
  `code ${rCmd.status} settings ${JSON.stringify(settingsOf(cCmd))} err ${rCmd.stderr}`)
const before = fs.readFileSync(path.join(cCmd, 'settings.json'))
const rAgain = cli(['install'], { CLAUDE_CONFIG_DIR: cCmd })
clause('clause 2j — a second install over an already-wrapped statusline changes nothing and says so',
  rAgain.status === 0 && Buffer.compare(before, fs.readFileSync(path.join(cCmd, 'settings.json'))) === 0 && /no change|unchanged/i.test(rAgain.stdout),
  `code ${rAgain.status} out ${rAgain.stdout}`)
fs.writeFileSync(copyOf(cCmd), '// stale copy from an older plugin\n')
const rStale = cli(['install'], { CLAUDE_CONFIG_DIR: cCmd })
clause('clause 2k — install over a copy whose bytes differ from the plugin file re-copies it',
  rStale.status === 0 && sameBytes(cCmd), `code ${rStale.status} out ${rStale.stdout}`)
clause('clause 2l — the settings never name the plugin file the install ran from, only the copy',
  [cNone, cNoSl, cCmd].every((d) => !fs.readFileSync(path.join(d, 'settings.json'), 'utf8').includes(bridge)), 'a settings.json names the plugin path')
const home = path.join(tmp, 'home'); fs.mkdirSync(home)
const envNoCfg = { HOME: home }; const rHome = spawnSync('node', [bridge, 'install'], { env: (({ CLAUDE_CONFIG_DIR, ...e }) => ({ ...e, ...envNoCfg }))(env), encoding: 'utf8' })
clause('clause 2m — without CLAUDE_CONFIG_DIR the install goes to ~/.claude',
  rHome.status === 0 && sameBytes(path.join(home, '.claude')), `code ${rHome.status} err ${rHome.stderr}`)

// ---------------------------------------------------------------- clause 1: what must trip

fs.mkdirSync(path.dirname(bridgeFile('sess-B')), { recursive: true })
fs.writeFileSync(bridgeFile('sess-B'), JSON.stringify({ session_id: 'sess-A', window: 1000000, used: 5, pct: 0, t: 'x' }))
clause('clause 1a — a bridge file whose session id is another session\'s is ignored by the reader',
  readBridge('sess-B') === null, JSON.stringify(readBridge('sess-B')))
cli(['--', 'true'], {}, stdinFor('sess-A'))
clause('clause 1b — the reader returns the record for its own session',
  readBridge('sess-A')?.session_id === 'sess-A' && readBridge('sess-A').window === 200000, JSON.stringify(readBridge('sess-A')))
fs.mkdirSync(path.dirname(bridgeFile('sess-C')), { recursive: true }); fs.writeFileSync(bridgeFile('sess-C'), '{"session_id":"sess-C","win')
clause('clause 1c — a missing or truncated bridge file reads as null, never throws',
  readBridge('sess-none') === null && readBridge('sess-C') === null, 'a broken file produced a record')

const UNSUP = { statusLine: { type: 'script', path: '/x' }, theme: 'light' }
const cUns = cfg('unsupported', UNSUP)
const unsBefore = fs.readFileSync(path.join(cUns, 'settings.json'))
const rUns = cli(['install'], { CLAUDE_CONFIG_DIR: cUns })
let threw = ''; try { installStatusLine(UNSUP, '/c/dctr-bridge.mjs') } catch (e) { threw = e.message }
clause('clause 1d — an unsupported statusline type is refused: exit 1, reason printed, settings byte-identical, installStatusLine throws',
  rUns.status === 1 && /script/.test(rUns.stderr) && Buffer.compare(unsBefore, fs.readFileSync(path.join(cUns, 'settings.json'))) === 0 && /script/.test(threw),
  `code ${rUns.status} err ${rUns.stderr} threw ${threw}`)
const cBad = cfg('bad'); fs.writeFileSync(path.join(cBad, 'settings.json'), '{ "theme": ')
const rBad = cli(['install'], { CLAUDE_CONFIG_DIR: cBad })
clause('clause 1e — an unparseable settings.json is refused and left as it was',
  rBad.status === 1 && fs.readFileSync(path.join(cBad, 'settings.json'), 'utf8') === '{ "theme": ' && rBad.stderr.length > 0, `code ${rBad.status} err ${rBad.stderr}`)
const rUsage = cli([]), rUnknown = cli(['frobnicate'])
clause('clause 1f — no arguments or an unknown mode prints usage and exits 2',
  rUsage.status === 2 && rUnknown.status === 2 && /install/.test(rUsage.stderr), `codes ${rUsage.status}/${rUnknown.status}`)
const once = installStatusLine({ statusLine: { type: 'command', command: 'x' } }, '/c/b.mjs')
clause('clause 1g — installStatusLine does not wrap an already-wrapped command a second time',
  JSON.stringify(installStatusLine(once, '/c/b.mjs')) === JSON.stringify(once), JSON.stringify(installStatusLine(once, '/c/b.mjs')))

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const raw = sh(INNER, '').stdout
clause('clause 3a — without the bridge: the inner command really prints several lines, an ANSI escape and a non-UTF-8 byte, and exits 3',
  raw.includes(0x1b) && raw.includes(0xff) && raw.toString('latin1').split('\n').length === 3 && sh(INNER, '').status === 3 &&
  Buffer.compare(Buffer.from(raw.toString('utf8')), raw) !== 0,
  JSON.stringify(raw.toString('latin1')))
const unquoted = sh(`sh -c 'cat >/dev/null' -- ${INNER}`, '{x').stdout.toString('latin1')
clause('clause 3b — without the bridge: an unquoted wrap, whose wrapper takes stdin, leaves the second half no stdin byte to print',
  !unquoted.includes('{') && unquoted.includes('line two') && sh(INNER, '{x').stdout.toString('latin1').includes('{'), JSON.stringify(unquoted))
clause('clause 3c — without the reader: the other-session fixture names session A at session B\'s path, and the truncated one is not JSON',
  JSON.parse(fs.readFileSync(bridgeFile('sess-B'), 'utf8')).session_id === 'sess-A' && bridgeFile('sess-B').includes('dctr-sess-B') &&
  (() => { try { JSON.parse(fs.readFileSync(bridgeFile('sess-C'), 'utf8')); return false } catch { return true } })(),
  'the stale-file fixture does not carry another session id')
clause('clause 3d — without the installer: the command fixture has a statusline with refreshInterval, and the unsupported one a non-command type',
  EXISTING.statusLine.type === 'command' && EXISTING.statusLine.refreshInterval === 5 && UNSUP.statusLine.type !== 'command' &&
  !fs.existsSync(path.join(cNone, 'x')) && fs.statSync(blocker).isFile(), 'fixtures lack their property')
const tornFile = path.join(tmp, 'torn.json'); fs.writeFileSync(tornFile, '{"ok":1}')
const fd = fs.openSync(tornFile, 'w'); const between = fs.readFileSync(tornFile, 'utf8'); fs.closeSync(fd)
let tornParses = true; try { JSON.parse(between) } catch { tornParses = false }
clause('clause 3e — without the bridge: a file rewritten in place reads empty between truncate and write, which the race reader counts as torn',
  between === '' && !tornParses, JSON.stringify(between))

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
