// node --test hooks/dctr-gate.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { exitLine, shq } from './dctr-lib.mjs'

const HERE = import.meta.dirname
const GATE = path.join(HERE, 'dctr-gate.mjs')
const FAKE_HOST = path.join(HERE, 'dctr-host.fake.mjs')
const SESSION = 'gate-test'
const BROKEN = "echo 'about to fail'; exit 3"
const GOOD = "echo one; echo two >&2; printf 'it'\"'\"'s quoted\\n'"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
const read = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const verdict = (out) => (read(`${out}.result`) ?? '').split('\n')[0]

/** The session's own environment without any host, session or doctrine variable, so no test inherits the herdr it runs in. */
const clean = () => {
  const env = { ...process.env }
  for (const k of Object.keys(env)) {
    if (/^(HERDR_|HC_|DCTR_|CODEX_)/.test(k) || ['TERM_PROGRAM', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CONFIG_DIR', 'NODE_TEST_CONTEXT'].includes(k)) delete env[k]
  }
  return env
}

/** A herdr TUI that records every call and answers by the DCTR_TEST_* switches in the caller's environment. */
const recorder = (calls, cwds, seats) => `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(calls)}
prev=''; for a in "$@"; do if [ "$prev" = "--cwd" ]; then printf '%s\\n' "$a" >> ${JSON.stringify(cwds)}; fi; prev="$a"; done
fail() { echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; }
if [ "$1 $2" = "pane layout" ] && [ -n "$DCTR_TEST_LAYOUT_FAILS" ]; then fail; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_FOCUSED" ]; then echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":true}}}'; exit 0; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_FAILS" ]; then fail; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_GONE" ]; then echo '{"error":{"code":"pane_not_found","message":"no such pane"}}' >&2; exit 1; fi
if [ "$1 $2" = "pane rename" ] && [ -n "$DCTR_TEST_SEATS_RO" ]; then chmod 500 ${JSON.stringify(seats)}; fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_SEATS_RO" ]; then chmod 700 ${JSON.stringify(seats)}; fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_CLOSE_FAILS" ]; then fail; fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TABLIST_FAILS" ]; then fail; fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_ABSENT" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false}]}}'; exit 0; fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_FOCUSED" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false},{"tab_id":"w1:tG","focused":true,"label":"g"}]}}'; exit 0; fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_NOFOCUS" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false},{"tab_id":"w1:tG","label":"g"}]}}'; exit 0; fi
if [ "$1 $2" = "tab list" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":true},{"tab_id":"w1:tG","focused":false,"label":"g"}]}}'; exit 0; fi
if [ "$1 $2" = "tab close" ] && [ -n "$DCTR_TEST_TABCLOSE_FAILS" ]; then fail; fi
if [ "$1 $2" = "pane run" ] && [ -n "$DCTR_TEST_RUN_FAILS" ]; then fail; fi
case "$1 $2" in
  "pane get") echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":false}}}' ;;
  "pane layout") echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":56}}]}}}' ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"w1:pS"}}}' ;;
  "tab create") echo '{"result":{"tab":{"tab_id":"w1:tT"},"root_pane":{"pane_id":"w1:pT"}}}' ;;
  *) echo '{"result":{}}' ;;
esac
`

/** One test's world: its own temp dir as TMPDIR, a recording `herdr` first on PATH, and cleanup of everything it started. */
function scene(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-gate-test-'))
  const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
  const s = {
    tmp, bin, pids: [], dirs: [],
    calls: path.join(tmp, 'calls'), cwds: path.join(tmp, 'cwds'),
    seats: path.join(tmp, `dctr-${SESSION}`, 'seats'),
    state: path.join(tmp, 'state.json'), fakeCalls: path.join(tmp, 'fake-calls'),
  }
  fs.writeFileSync(s.calls, ''); fs.writeFileSync(s.cwds, '')
  fs.writeFileSync(path.join(bin, 'herdr'), recorder(s.calls, s.cwds, s.seats), { mode: 0o755 })
  s.callText = () => read(s.calls) ?? ''
  s.callLines = () => s.callText().split('\n').filter(Boolean)
  s.cwdArgs = () => (read(s.cwds) ?? '').split('\n').filter(Boolean)
  s.none = (extra = {}) => ({ ...clean(), PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, ...extra })
  s.tui = (extra = {}) => s.none({ TERM_PROGRAM: 'herdr', HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1', CLAUDE_CODE_SESSION_ID: SESSION, ...extra })
  s.launch = (env, label, out, cmd, opts = {}) => {
    const r = spawnSync('node', [GATE, label, out, '--', ...cmd], { env, encoding: 'utf8', timeout: 30000, ...opts })
    const pid = /pid (\d+)/.exec(r.stdout ?? '')
    if (pid) s.pids.push(Number(pid[1]))
    return r
  }
  s.run = (env, args) => spawnSync('node', [GATE, '--run', ...args], { env, encoding: 'utf8', timeout: 30000 })
  /** True once `<out>.result` exists; false when the bound passes or the detached runner `pid` died without writing it. */
  s.waitResult = async (out, pid, ms = 20000) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
      if (fs.existsSync(`${out}.result`)) return true
      if (pid && !alive(pid)) return fs.existsSync(`${out}.result`)
      await sleep(50)
    }
    return fs.existsSync(`${out}.result`)
  }
  s.detachedPid = (r) => Number(/pid (\d+)/.exec(r.stdout ?? '')?.[1]) || null
  s.gateMarkers = () => { try { return fs.readdirSync(s.seats).filter((f) => f.startsWith('dctr-gate-') && f.endsWith('.json')).map((f) => readJson(path.join(s.seats, f))) } catch { return [] } }
  s.log = () => read(path.join(s.tmp, `dctr-${SESSION}`, 'hook.log')) ?? ''
  t.after(() => {
    for (const pid of s.pids) { try { process.kill(-pid, 'SIGKILL') } catch { /* gone */ } }
    const m = readJson(s.state)
    for (const x of (m?.spaces ?? []).flatMap((sp) => sp.tabs).flatMap((tb) => tb.panes)) if (x.pid) try { process.kill(-x.pid, 'SIGKILL') } catch { /* gone */ }
    for (const d of [s.seats, ...s.dirs]) try { fs.chmodSync(d, 0o700) } catch { /* not there */ }
    fs.rmSync(tmp, { recursive: true, force: true })
  })
  return s
}

/** The scene with the fake host on PATH as herdr, herdr-app and hc, in a fresh model: space S1, tab T1 holding the session pane P1. */
function coreScene(t) {
  const s = scene(t)
  for (const name of ['herdr', 'herdr-app', 'hc']) {
    fs.writeFileSync(path.join(s.bin, name), `#!/bin/sh\nexec node ${JSON.stringify(FAKE_HOST)} "$0" "$@"\n`, { mode: 0o755 })
  }
  fs.writeFileSync(s.fakeCalls, '')
  fs.writeFileSync(s.state, JSON.stringify({ n: 1000, exec: true, splitFocuses: false, focus: { tab: 'T1', pane: 'P1' },
    spaces: [{ id: 'S1', name: 'proj', tabs: [{ id: 'T1', name: '1', panes: [{ pane: 'P1', terminal: 't1' }] }, { id: 'T2', name: 'two', panes: [{ pane: 'P2', terminal: 't2' }] }] }],
    terminals: { t1: 'live', t2: 'live' } }))
  s.core = (extra = {}) => s.none({ TERM_PROGRAM: 'ghostty', HC_TERMINAL_ID: 't1', CLAUDE_CODE_SESSION_ID: SESSION,
    DCTR_FAKE_STATE: s.state, DCTR_FAKE_CALLS: s.fakeCalls, DCTR_FAKE_OWNER: String(process.pid), ...extra })
  s.model = () => JSON.parse(fs.readFileSync(s.state, 'utf8'))
  s.save = (m) => fs.writeFileSync(s.state, JSON.stringify(m))
  s.fake = () => (read(s.fakeCalls) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  s.tabs = () => s.model().spaces.flatMap((sp) => sp.tabs)
  s.count = (bin, a, b) => s.fake().filter((c) => c.bin === bin && c.args[0] === a && c.args[1] === b).length
  /** Six side seats in the session's tab, each with its pane and marker, so the next placement takes a tab. */
  s.fillColumn = () => {
    const m = s.model()
    fs.mkdirSync(s.seats, { recursive: true })
    for (let i = 1; i <= 6; i++) {
      m.spaces[0].tabs[0].panes.push({ pane: `P${10 + i}`, terminal: `t${10 + i}` })
      m.terminals[`t${10 + i}`] = 'live'
      fs.writeFileSync(path.join(s.seats, `dctr-explore-${i}.json`), JSON.stringify({ agent: `dctr-explore-${i}`, role: 'explore', n: i, tabId: null, paneId: `P${10 + i}`, host: 'herdr-core' }))
    }
    s.save(m)
  }
  /** A check that appends a line to `count` each time it runs, and how many times it ran once a second copy has had time to. */
  s.counted = async (env, tag) => {
    const out = path.join(s.tmp, `${tag}.out`), count = path.join(s.tmp, `${tag}.count`)
    const r = s.launch(env, 'g', out, [`echo run >> ${count}`], { cwd: s.tmp })
    const done = await s.waitResult(out, s.detachedPid(r))
    await sleep(1500)
    return { r, out, done, runs: (read(count) ?? '').split('\n').filter(Boolean).length }
  }
  return s
}

/** Runs one argv check through the detached path and returns its verdict line. */
async function argvVerdict(t, cmd) {
  const s = scene(t)
  const out = path.join(s.tmp, 'argv.out')
  const r = s.launch(s.none(), 'argv', out, cmd)
  assert.ok(await s.waitResult(out, s.detachedPid(r)), `no result for ${JSON.stringify(cmd)}: ${r.stdout}${r.stderr}`)
  return { verdict: verdict(out), transcript: read(out), s }
}
const bareStatus = (cmd) => spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' }).status

// ------------------------------------------------------------------ no host: the detached path

test('a failing check puts its status in the result file and only its own output in the transcript', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'broken.out')
  const r = s.launch(s.none(), 'broken gate', out, [BROKEN])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /detached/)
  assert.ok(r.stdout.includes(`${out}.result`))
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(3))
  assert.equal(read(out), 'about to fail\n')
  assert.equal(s.callText(), '', 'the no-host path called herdr')
  assert.equal(spawnSync('bash', ['-c', BROKEN]).status, 3)
})

test('a passing check records stdout, stderr and quoted text, and a one-line result', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'good.out')
  const r = s.launch(s.none(), 'good gate', out, [GOOD])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(read(`${out}.result`), `${exitLine(0)}\n`)
  const tr = read(out)
  assert.ok(tr.includes('one\n') && tr.includes('two\n') && tr.includes("it's quoted"), tr)
})

test('an argv command keeps its quoting through the launcher', async (t) => {
  const { verdict: v, transcript } = await argvVerdict(t, ['bash', '-c', 'echo "a  b"; printf %s "$0"; exit 4'])
  assert.equal(v, exitLine(4))
  assert.ok(transcript.split('\n').includes('a  b'), transcript)
})

test('an ordinary check transcript is its bytes alone, with no verdict and no echoed command', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'quiet.out')
  const r = s.launch(s.none(), 'quiet gate', out, ['echo no marker here'])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(read(out), 'no marker here\n')
})

test('a command whose text holds a marker line puts nothing in the transcript', async (t) => {
  const s = scene(t)
  const cmd = ':\nexit=0\nsleep 0.2\nexit 7'
  const out = path.join(s.tmp, 'header.out')
  const r = s.launch(s.none(), 'header gate', out, [cmd])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(read(out), '')
  assert.equal(verdict(out), exitLine(7))
  assert.equal(spawnSync('bash', ['-c', cmd]).status, 7)
})

test('a check that prints its own exit line cannot touch the verdict', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'forge.out')
  const r = s.launch(s.none(), 'forging gate', out, ['env -i exit=0; exit 7'])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(7))
  assert.ok(read(out).split('\n').includes('exit=0'))
})

test('a three-byte character split across two writes arrives intact', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'split.out')
  const r = s.launch(s.none(), 'utf8 split gate', out, [`printf '\\xe2'; sleep 0.3; printf '\\x82\\xac\\n'; exit 0`])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  const tr = read(out)
  assert.ok(tr.split('\n').includes('€') && !tr.includes('�'), JSON.stringify(tr))
  assert.equal(spawnSync('bash', ['-c', `printf '\\xe2'; printf '\\x82\\xac\\n'`]).stdout.toString(), '€\n')
})

test('many multi-byte characters across chunk boundaries arrive intact', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'bulk.out')
  const r = s.launch(s.none(), 'utf8 gate', out, [`node -e 'process.stdout.write(String.fromCharCode(8364).repeat(100000))'`])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  const tr = read(out)
  assert.ok(!tr.includes('�'))
  assert.equal(tr.split('€').length - 1, 100000)
  assert.equal(verdict(out), exitLine(0))
})

test('a transcript the launcher could not fully write gives a result saying capture incomplete', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'limited.out')
  const check = 'head -c 8000 /dev/zero | tr "\\0" x'
  // A file size limit makes every transcript write past it fail, as a full disk does; the result file stays under it.
  const r = spawnSync('bash', ['-c', `ulimit -f 1; exec node ${shq(GATE)} 'limited gate' ${shq(out)} -- ${shq(check)}`], { env: s.none(), encoding: 'utf8', timeout: 30000 })
  const pid = s.detachedPid(r); if (pid) s.pids.push(pid)
  assert.ok(await s.waitResult(out, pid), r.stdout + r.stderr)
  assert.equal(verdict(out), exitLine(0))
  assert.ok(read(`${out}.result`).split('\n').includes('capture=incomplete'), read(`${out}.result`))
  const probe = spawnSync('bash', ['-c', `ulimit -f 1; head -c 8000 /dev/zero > ${shq(path.join(s.tmp, 'probe'))}`])
  assert.notEqual(probe.status, 0)
})

test('a previous result on the same path is gone when the launcher returns', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'reuse.out')
  fs.writeFileSync(`${out}.result`, `${exitLine(0)}\n`)
  const r = s.launch(s.none(), 'reuse gate', out, ['sleep 1; exit 7'])
  assert.equal(fs.existsSync(`${out}.result`), false, 'the stale verdict was still there at return')
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(7))
})

test('a stale result that cannot be removed makes the launcher refuse and the check never runs', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root can unlink in a directory without its write bit')
  const s = scene(t)
  const locked = path.join(s.tmp, 'locked'); fs.mkdirSync(locked); s.dirs.push(locked)
  const out = path.join(locked, 'stale.out')
  fs.writeFileSync(`${out}.result`, `${exitLine(0)}\n`)
  fs.chmodSync(locked, 0o500)
  const r = s.launch(s.none(), 'locked gate', out, ['echo ran'])
  await sleep(300)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /refusing to run/)
  assert.equal(read(out), null)
  assert.equal(read(`${out}.result`), `${exitLine(0)}\n`)
  assert.throws(() => fs.rmSync(`${out}.result`))
})

test('a result path the launcher cannot clear refuses before the record and the check, the old record gone', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'dirres.out')
  fs.mkdirSync(`${out}.result`); fs.writeFileSync(path.join(`${out}.result`, 'keep'), 'x')
  fs.writeFileSync(`${out}.cmd`, '["true"]\n')
  const r = s.launch(s.none(), 'dirres gate', out, ['echo ran'])
  await sleep(300)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /could not clear a previous/)
  assert.equal(fs.existsSync(out), false)
  assert.equal(fs.existsSync(`${out}.cmd`), false)
  assert.throws(() => fs.rmSync(`${out}.result`, { force: true }))
})

test('a command record the launcher cannot write makes it refuse and the check never runs', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'norec.out')
  fs.writeFileSync(`${out}.result`, `${exitLine(0)}\n`)
  fs.mkdirSync(`${out}.cmd.partial`); fs.writeFileSync(path.join(`${out}.cmd.partial`, 'keep'), 'x')
  const r = s.launch(s.none(), 'norec gate', out, ['echo ran'])
  await sleep(300)
  assert.equal(r.status, 1)
  assert.ok(r.stderr.includes(`could not write ${out}.cmd`), r.stderr)
  assert.equal(fs.existsSync(out), false)
  assert.equal(fs.existsSync(`${out}.result`), false)
})

test('the command record holds the single string and the argv form word for word', async (t) => {
  const s = scene(t)
  const one = path.join(s.tmp, 'one.out'), argv = path.join(s.tmp, 'argv.out')
  const words = ['bash', '-c', 'echo "a  b"; exit 4']
  const r1 = s.launch(s.none(), 'one', one, [BROKEN])
  const r2 = s.launch(s.none(), 'argv', argv, words)
  assert.deepEqual(readJson(`${one}.cmd`), [BROKEN])
  assert.deepEqual(readJson(`${argv}.cmd`), words)
  assert.ok(await s.waitResult(one, s.detachedPid(r1)) && await s.waitResult(argv, s.detachedPid(r2)))
})

test('the command record is in place when the launcher returns, before the check finishes', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'slow.out')
  const r = s.launch(s.none(), 'slow gate', out, ['sleep 2; echo late'])
  assert.deepEqual(readJson(`${out}.cmd`), ['sleep 2; echo late'])
  assert.equal(fs.existsSync(`${out}.result`), false)
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(0))
  assert.ok(read(out).includes('late'))
})

// ------------------------------------------------------------------ pipefail

test('a single-string pipeline whose upstream fails records a failure', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'pipe.out')
  const r = s.launch(s.none(), 'piped gate', out, ['false | cat'])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(1))
  assert.equal(bareStatus(['bash', '-c', 'false | cat']), 0)
})

test('a single-string pipeline that passes still records exit 0', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'pipe.out')
  const r = s.launch(s.none(), 'piped good gate', out, ['echo ok | cat'])
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(0))
  assert.ok(read(out).split('\n').includes('ok'))
})

test('an argv bash -c pipeline whose upstream fails records a failure', async (t) => {
  const cmd = ['bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('an argv bash -c pipeline that passes still records exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['bash', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('an env K equals V prefix before bash -c still records the upstream failure', async (t) => {
  const cmd = ['env', 'DCTR_K=1', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('an env-prefixed passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['env', 'DCTR_K=1', 'bash', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('an argv that does not run bash is spawned untouched', async (t) => {
  assert.equal((await argvVerdict(t, ['sh', '-c', 'false | cat'])).verdict, exitLine(0))
})

test('a long option before -c with a failing upstream records a failure', async (t) => {
  const cmd = ['bash', '--norc', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('a long option before -c on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['bash', '--norc', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('env -u NAME before bash still records the upstream failure', async (t) => {
  const cmd = ['env', '-u', 'DCTR_K', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('an env -u operand named bash is not taken for the program', async (t) => {
  assert.equal((await argvVerdict(t, ['env', '-u', 'bash', 'bash', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('an uppercase option clustered with c still records the upstream failure', async (t) => {
  const cmd = ['bash', '-Ec', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('an uppercase cluster on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['bash', '-Ec', 'echo ok | cat'])).verdict, exitLine(0))
})

test('a script given -c as its own argument is spawned untouched', async (t) => {
  const s = scene(t)
  const script = path.join(s.tmp, 'pf.sh'); fs.writeFileSync(script, 'false | cat\n')
  assert.equal((await argvVerdict(t, ['bash', script, '-c'])).verdict, exitLine(0))
})

test('a bash -o operand before -c still records the upstream failure', async (t) => {
  const cmd = ['bash', '-o', 'errexit', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('a bash -o operand before -c on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['bash', '-o', 'errexit', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('a rcfile operand before -c still records the upstream failure', async (t) => {
  const cmd = ['bash', '--rcfile', '/dev/null', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('a rcfile operand before -c on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['bash', '--rcfile', '/dev/null', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('env -- then an assignment still records the upstream failure', async (t) => {
  const cmd = ['env', '--', 'DCTR_K=1', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('env -- then an assignment on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['env', '--', 'DCTR_K=1', 'bash', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('env with a clustered -iu NAME still records the upstream failure', async (t) => {
  const cmd = ['env', '-iu', 'DCTR_K', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('env with an assignment whose name has a dot still records the upstream failure', async (t) => {
  const cmd = ['env', 'dctr.k=1', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('a dotted assignment name on a passing pipeline stays exit 0', async (t) => {
  assert.equal((await argvVerdict(t, ['env', 'dctr.k=1', 'bash', '-c', 'echo ok | cat'])).verdict, exitLine(0))
})

test('env -u with its name attached and ending in P still records the upstream failure', async (t) => {
  const cmd = ['env', '-uGROUP', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('env -u with an attached name holding S still records the upstream failure', async (t) => {
  const cmd = ['env', '-uS', 'bash', '-c', 'false | cat']
  assert.equal((await argvVerdict(t, cmd)).verdict, exitLine(1))
  assert.equal(bareStatus(cmd), 0)
})

test('a non-bash program behind env -uP keeps its argv exactly', async (t) => {
  const { transcript } = await argvVerdict(t, ['env', '-uP', 'echo', 'bash', '-c', 'hello'])
  assert.ok(transcript.split('\n').includes('bash -c hello'), transcript)
})

// ------------------------------------------------------------------ the herdr TUI: placement

test('the pane path splits in the launcher cwd and types the run line into the split pane', (t) => {
  const s = scene(t)
  const cwd = path.join(s.tmp, 'work dir'); fs.mkdirSync(cwd)
  s.launch(s.tui(), 'pane gate', path.join(s.tmp, 'pane.out'), ['true'], { cwd })
  assert.ok(s.callLines().some((l) => l.startsWith('pane split ')), s.callText())
  assert.deepEqual(s.cwdArgs(), [fs.realpathSync(cwd)])
  assert.ok(s.callLines().some((l) => l.startsWith('pane run w1:pS ') && l.includes('--run')), s.callText())
})

test('the pane path names the pane it split with the launcher label', (t) => {
  const s = scene(t)
  const r = s.launch(s.tui(), 'named gate', path.join(s.tmp, 'named.out'), ['true'])
  assert.ok(s.callLines().includes('pane rename w1:pS named gate'), s.callText())
  assert.match(r.stdout, /running in pane w1:pS/)
})

test('the tab path creates its tab in the launcher cwd', (t) => {
  const s = scene(t)
  const cwd = path.join(s.tmp, 'work dir'); fs.mkdirSync(cwd)
  s.launch(s.tui({ DCTR_TEST_LAYOUT_FAILS: '1' }), 'tab gate', path.join(s.tmp, 'tab.out'), ['true'], { cwd })
  assert.ok(s.callLines().some((l) => l.startsWith('tab create ')), s.callText())
  assert.ok(!s.callLines().some((l) => l.startsWith('pane split ')))
  assert.deepEqual(s.cwdArgs(), [fs.realpathSync(cwd)])
})

test('the tab path is not renamed at placement and keeps its create label', (t) => {
  const s = scene(t)
  const r = s.launch(s.tui({ DCTR_TEST_LAYOUT_FAILS: '1' }), 'tab named', path.join(s.tmp, 'tabnamed.out'), ['true'])
  assert.ok(!s.callLines().some((l) => l.startsWith('pane rename ')), s.callText())
  assert.ok(s.callLines().find((l) => l.startsWith('tab create '))?.includes('--label'))
  assert.match(r.stdout, /running in tab w1:tT/)
})

test('the tab placement hands its own tab id and workspace to the line it types', (t) => {
  const s = scene(t)
  s.launch(s.tui({ DCTR_TEST_LAYOUT_FAILS: '1' }), 'tab ids', path.join(s.tmp, 'tabids.out'), ['true'])
  const line = s.callLines().find((l) => l.startsWith('pane run w1:pT ')) ?? ''
  assert.ok(line.includes(` ${shq('w1:tT')} `) && line.includes(` ${shq('w1')} `) && line.includes(` ${shq('w1:pT')} `), line)
})

test('a contained session inside herdr runs the check detached and calls herdr zero times', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'contained.out')
  const r = s.launch(s.tui({ DCTR_VIEW_REQUEST_DIR: path.join(s.tmp, 'views') }), 'contained gate', out, ['bash', '-c', 'echo ran contained'])
  assert.match(r.stdout, /contained session/)
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  assert.equal(verdict(out), exitLine(0))
  assert.ok(read(out).includes('ran contained'))
  assert.equal(s.callText(), '')
})

test('a placement drops a moved gate whose pane the server says is gone', (t) => {
  const s = scene(t)
  const gates = path.join(s.tmp, 'dctr-gates'); fs.mkdirSync(gates)
  const gone = path.join(gates, 'S2.dctr-gate-4.json')
  fs.writeFileSync(gone, JSON.stringify({ agent: 'dctr-gate-4', role: 'gate', paneId: 'w9:gOld' }))
  s.launch(s.tui({ DCTR_TEST_GET_GONE: '1' }), 'b3 gate', path.join(s.tmp, 'b3.out'), ['true'])
  assert.ok(s.callLines().includes('pane get w9:gOld'), s.callText())
  assert.equal(fs.existsSync(gone), false)
})

test('a resumed session skips the gate name its id holds as a moved marker, and only its own', (t) => {
  const s = scene(t)
  const allocated = () => /seats\/(dctr-gate-\d+)\.json/.exec(s.callLines().find((l) => l.startsWith('pane run w1:pS ')) ?? '')?.[1] ?? null
  s.launch(s.tui(), 'fresh', path.join(s.tmp, 'fresh.out'), ['true'])
  assert.equal(allocated(), 'dctr-gate-1')
  fs.rmSync(path.join(s.tmp, `dctr-${SESSION}`), { recursive: true, force: true })
  fs.writeFileSync(s.calls, '')
  const gates = path.join(s.tmp, 'dctr-gates'); fs.mkdirSync(gates)
  fs.writeFileSync(path.join(gates, `${SESSION}.dctr-gate-1.json`), JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w9:gLive' }))
  fs.writeFileSync(path.join(gates, 'other-session.dctr-gate-2.json'), JSON.stringify({ agent: 'dctr-gate-2', role: 'gate', paneId: 'w9:gOther' }))
  s.launch(s.tui(), 'resumed', path.join(s.tmp, 'resumed.out'), ['true'])
  assert.equal(allocated(), 'dctr-gate-2')
  assert.ok(fs.existsSync(path.join(gates, `${SESSION}.dctr-gate-1.json`)))
})

test('the launcher log names an unreadable moved marker as why it could not observe the column', (t) => {
  const s = scene(t)
  const gates = path.join(s.tmp, 'dctr-gates'); fs.mkdirSync(gates)
  const broken = path.join(gates, 'other.dctr-gate-7.json'); fs.writeFileSync(broken, 'not json')
  s.launch(s.tui(), 'reason', path.join(s.tmp, 'reason.out'), ['true'])
  const log = s.log()
  assert.match(log, /could not observe the side column/)
  assert.ok(log.includes(broken), log)
})

test('a rollback that could not close its pane publishes a record carrying the pane id', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'roll.out')
  const r = s.launch(s.tui({ DCTR_TEST_RUN_FAILS: '1', DCTR_TEST_CLOSE_FAILS: '1', DCTR_TEST_SEATS_RO: '1' }), 'rollback gate', out, ['true'])
  const mine = s.gateMarkers().find((b) => b?.label === 'rollback gate')
  assert.equal(mine?.paneId, 'w1:pS', JSON.stringify(mine))
  assert.ok(s.callLines().includes('pane close w1:pS'))
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
})

test('a gate placement drops a stale side seat marker and its hand-off file', (t) => {
  const s = scene(t)
  fs.mkdirSync(s.seats, { recursive: true })
  const marker = path.join(s.seats, 'dctr-explore-1.json')
  const handoff = `${marker}.a1.handoff`
  fs.writeFileSync(marker, JSON.stringify({ agent: 'dctr-explore-1', role: 'explore', n: 1, agent_id: 'a1', tabId: null, paneId: 'w1:pGone' }))
  fs.writeFileSync(handoff, 'true')
  assert.ok(fs.existsSync(handoff))
  s.launch(s.tui(), 'stale', path.join(s.tmp, 'stale.out'), ['true'])
  assert.equal(fs.existsSync(marker), false)
  assert.equal(fs.existsSync(handoff), false)
})

// ------------------------------------------------------------------ the herdr TUI: completion of a pane gate

/** A completion in pane w1:pS with its own marker file, and what it called. */
const paneDone = (s, env, label, cmd = 'true') => {
  const m = path.join(s.tmp, 'gate-marker.json')
  fs.writeFileSync(m, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pS' }))
  const r = s.run(s.tui(env), [path.join(s.tmp, 'done.out'), m, 'w1:pS', '', '', label, '--', cmd])
  return { r, m, lines: s.callLines() }
}

test('an unfocused pane is closed at completion and its record is left for the sweep', (t) => {
  const s = scene(t)
  const { m, lines } = paneDone(s, {}, 'ordinary')
  assert.ok(lines.includes('pane get w1:pS'))
  assert.ok(lines.includes('pane close w1:pS'), lines.join(' | '))
  assert.ok(fs.existsSync(m))
})

test('a pane close that failed leaves the pane and its record', (t) => {
  const s = scene(t)
  const { m, lines } = paneDone(s, { DCTR_TEST_CLOSE_FAILS: '1' }, 'close fails')
  assert.ok(lines.includes('pane close w1:pS'))
  assert.ok(fs.existsSync(m))
})

test('a focus lookup that failed closes nothing and keeps the record', (t) => {
  const s = scene(t)
  const { m, lines, r } = paneDone(s, { DCTR_TEST_GET_FAILS: '1' }, 'lookup fails')
  assert.ok(lines.includes('pane get w1:pS'))
  assert.ok(!lines.some((l) => l.startsWith('pane close')))
  assert.ok(fs.existsSync(m))
  assert.match(r.stderr, /could not be observed/)
})

test('a pane the lookup says is gone has its record dropped and is not closed', (t) => {
  const s = scene(t)
  const { m, lines } = paneDone(s, { DCTR_TEST_GET_GONE: '1' }, 'pane gone')
  assert.ok(lines.includes('pane get w1:pS'))
  assert.ok(!lines.some((l) => l.startsWith('pane close')))
  assert.equal(fs.existsSync(m), false)
})

test('a focused pane is relabelled last with its exit status and keeps its record', (t) => {
  const s = scene(t)
  const { m, lines } = paneDone(s, { DCTR_ELAPSED_MS: '20', DCTR_TEST_GET_FOCUSED: '1' }, 'ending gate', 'sleep 0.3')
  const renames = lines.filter((l) => l.startsWith('pane rename'))
  assert.ok(renames.length > 1, renames.join(' | '))
  assert.equal(renames.at(-1), `pane rename w1:pS ending gate · ${exitLine(0)}`)
  assert.ok(!lines.some((l) => l.startsWith('pane close')))
  assert.ok(fs.existsSync(m))
})

test('while the check runs the pane name carries elapsed time that increases', async (t) => {
  const s = scene(t)
  const child = spawn('node', [GATE, '--run', path.join(s.tmp, 'tick.out'), '', 'w1:pS', '', '', 'ticking gate', '--', 'sleep 30'],
    { env: s.tui({ DCTR_ELAPSED_MS: '50' }), stdio: 'ignore', detached: true })
  s.pids.push(child.pid)
  const ticks = () => [...s.callText().matchAll(/^pane rename w1:pS ticking gate · (\d+)s elapsed$/gm)].map((x) => Number(x[1]))
  const rose = () => { const v = ticks(); return new Set(v).size >= 2 && Math.max(...v) > Math.min(...v) }
  const until = Date.now() + 20000
  while (Date.now() < until && !rose()) await sleep(25)
  assert.ok(rose(), JSON.stringify(ticks()))
})

test('a check that could not be spawned keeps its record and puts the error in the result alone', (t) => {
  const s = scene(t)
  const m = path.join(s.tmp, 'spawn-marker.json')
  fs.writeFileSync(m, JSON.stringify({ agent: 'dctr-gate-9', role: 'gate', paneId: 'w1:pS' }))
  const out = path.join(s.tmp, 'spawn.out')
  const r = s.run(s.tui(), [out, m, 'w1:pS', '', '', 'unspawnable', '--', 'definitely-not-a-real-binary-xyz', 'arg'])
  assert.equal(r.status, 127)
  assert.ok(fs.existsSync(m))
  assert.equal(verdict(out), exitLine(127))
  assert.ok(read(`${out}.result`).split('\n').some((l) => l.startsWith('error=') && /ENOENT/.test(l)), read(`${out}.result`))
  assert.equal(read(out), '')
})

test('a run line with a positional missing is refused and touches herdr not at all', (t) => {
  const s = scene(t)
  const r = s.run(s.tui(), [path.join(s.tmp, 'slid.out'), path.join(s.tmp, 'slid.json'), 'w1:pR', 'w1:tG', 'lbl', '--', 'true'])
  assert.notEqual(r.status, 0)
  assert.equal(s.callText(), '')
  assert.equal(fs.existsSync(path.join(s.tmp, 'slid.out.result')), false)
})

// ------------------------------------------------------------------ the herdr TUI: completion of a tab gate

/** A completion in tab w1:tG (root pane w1:pR, workspace w1) with its own marker file, and what it called. */
const tabDone = (s, env, label) => {
  const m = path.join(s.tmp, 'tab-marker.json')
  fs.writeFileSync(m, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pR', tabId: 'w1:tG' }))
  const r = s.run(s.tui(env), [path.join(s.tmp, 'tab.out'), m, 'w1:pR', 'w1:tG', 'w1', label, '--', 'true'])
  const lines = s.callLines()
  assert.ok(lines.some((l) => l.startsWith('tab list')), 'the tab was not asked')
  assert.ok(!lines.some((l) => l.startsWith('pane get')), 'the root pane was asked instead of the tab')
  return { r, m, lines }
}

test('an unfocused tab is closed by its own id, its root pane never, and its record is left', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, {}, 'tab ordinary')
  assert.ok(lines.includes('tab close w1:tG'), lines.join(' | '))
  assert.ok(!lines.some((l) => l.startsWith('pane close')))
  assert.ok(fs.existsSync(m))
})

test('a focused tab is renamed to its exit status, not closed, and keeps its record', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, { DCTR_TEST_TAB_FOCUSED: '1' }, 'tab focused')
  assert.ok(lines.includes(`tab rename w1:tG tab focused · ${exitLine(0)}`), lines.join(' | '))
  assert.ok(!lines.some((l) => l.startsWith('tab close') || l.startsWith('pane close')))
  assert.ok(fs.existsSync(m))
})

test('a tab gate whose list failed closes nothing and keeps its record', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, { DCTR_TEST_TABLIST_FAILS: '1' }, 'tab list fails')
  assert.ok(!lines.some((l) => l.startsWith('tab close') || l.startsWith('pane close')), lines.join(' | '))
  assert.ok(fs.existsSync(m))
})

test('a tab the list succeeded and did not carry is closed by id with its record left', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, { DCTR_TEST_TAB_ABSENT: '1' }, 'tab absent')
  assert.ok(lines.includes('tab close w1:tG'), lines.join(' | '))
  assert.ok(!lines.some((l) => l.startsWith('pane close')))
  assert.ok(fs.existsSync(m))
})

test('a listed tab with no readable focus is spared and keeps its record', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, { DCTR_TEST_TAB_NOFOCUS: '1' }, 'tab no focus')
  assert.ok(!lines.some((l) => l.startsWith('tab close') || l.startsWith('pane close')), lines.join(' | '))
  assert.ok(fs.existsSync(m))
})

test('a tab close that failed leaves its record', (t) => {
  const s = scene(t)
  const { m, lines } = tabDone(s, { DCTR_TEST_TABCLOSE_FAILS: '1' }, 'tab close fails')
  assert.ok(lines.includes('tab close w1:tG'))
  assert.ok(fs.existsSync(m))
})

test('with no workspace in the environment the tab list asks the workspace the line carried', (t) => {
  const s = scene(t)
  const env = s.tui(); delete env.HERDR_WORKSPACE_ID
  const m = path.join(s.tmp, 'tab-marker.json')
  fs.writeFileSync(m, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pR', tabId: 'w1:tG' }))
  s.run(env, [path.join(s.tmp, 'tab.out'), m, 'w1:pR', 'w1:tG', 'w1', 'tab fresh env', '--', 'true'])
  assert.ok(s.callLines().includes('tab list --workspace w1'), s.callText())
  assert.ok(s.callLines().includes('tab close w1:tG'))
})

// ------------------------------------------------------------------ the herdr TUI: a gate whose marker moved

/** The marker of gate dctr-gate-1 in session S1 under `root`, and the path SessionEnd moves it to. */
const movedPaths = (s) => {
  const root = path.join(s.tmp, 'root-b4')
  const original = path.join(root, 'dctr-S1', 'seats', 'dctr-gate-1.json')
  const moved = path.join(root, 'dctr-gates', 'S1.dctr-gate-1.json')
  fs.mkdirSync(path.dirname(original), { recursive: true }); fs.mkdirSync(path.dirname(moved), { recursive: true })
  return { original, moved }
}
const paneAt = (f) => readJson(f)?.paneId ?? null
const finishMoved = (s, original, env, label) => {
  const elsewhere = path.join(s.tmp, 'elsewhere'); fs.mkdirSync(elsewhere, { recursive: true })
  s.run(s.tui({ TMPDIR: elsewhere, ...env }), [path.join(s.tmp, `${label}.out`), original, 'w1:pS', '', '', label, '--', 'true'])
  return s.callLines()
}

test('a gate whose marker moved and whose pane is gone drops the moved marker found from its own path', (t) => {
  const s = scene(t)
  const { original, moved } = movedPaths(s)
  fs.writeFileSync(moved, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pS' }))
  assert.ok(!fs.existsSync(original) && fs.existsSync(moved))
  finishMoved(s, original, { DCTR_TEST_GET_GONE: '1' }, 'moved-gone')
  assert.equal(fs.existsSync(moved), false)
})

test('a moved gate that finishes unfocused closes its pane and keeps the moved marker', (t) => {
  const s = scene(t)
  const { original, moved } = movedPaths(s)
  fs.writeFileSync(moved, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pS' }))
  const lines = finishMoved(s, original, {}, 'moved-unfocused')
  assert.ok(lines.includes('pane close w1:pS'))
  assert.ok(fs.existsSync(moved))
})

test('a gone gate leaves another gate record at the original path and drops its own moved one', (t) => {
  const s = scene(t)
  const { original, moved } = movedPaths(s)
  fs.writeFileSync(original, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pNEW', tabId: null }))
  fs.writeFileSync(moved, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pS', tabId: null }))
  finishMoved(s, original, { DCTR_TEST_GET_GONE: '1' }, 'resumed-new')
  assert.equal(paneAt(original), 'w1:pNEW')
  assert.equal(fs.existsSync(moved), false)
})

test('a gone gate drops its own record at the original path and leaves another gate moved record', (t) => {
  const s = scene(t)
  const { original, moved } = movedPaths(s)
  fs.writeFileSync(original, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pS', tabId: null }))
  fs.writeFileSync(moved, JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', paneId: 'w1:pOLD', tabId: null }))
  finishMoved(s, original, { DCTR_TEST_GET_GONE: '1' }, 'resumed-old')
  assert.equal(fs.existsSync(original), false)
  assert.equal(paneAt(moved), 'w1:pOLD')
})

// ------------------------------------------------------------------ a Codex shell

const CODEX = '01a0e81b-2a8b-7240-b94c-ad2ada7813da'
const codexEnv = (s, extra = {}) => s.tui({ CLAUDE_CODE_SESSION_ID: '', CODEX_SESSION_ID: CODEX, CODEX_THREAD_ID: CODEX, ...extra })
const codexMarker = (s) => readJson(path.join(s.tmp, `dctr-${CODEX}`, 'seats', 'dctr-gate-1.json'))

test('a gate from a Codex shell is placed in a pane under that session and indexed by its pane', (t) => {
  const s = scene(t)
  const r = s.launch(codexEnv(s), 'probe', path.join(s.tmp, 'g', 'probe.out'), ['true'])
  assert.match(r.stdout, /running in pane w1:pS/)
  assert.ok(s.callLines().includes('pane rename w1:pS probe'))
  const m = codexMarker(s)
  assert.equal(m?.label, 'probe')
  assert.equal(m?.sessionPane, 'w1:p1')
  assert.ok(fs.existsSync(path.join(s.tmp, 'dctr-by-pane', `w1_p1.${CODEX}`)))
})

test('inside the Codex sandbox the gate runs its check to completion before returning', (t) => {
  const s = scene(t)
  const pid1 = path.join(s.tmp, 'pid1'); fs.writeFileSync(pid1, `codex-linux-sandbox\0--sandbox-policy-cwd\0${s.tmp}\0`)
  const out = path.join(s.tmp, 'g', 'sandboxed.out')
  const r = s.launch(codexEnv(s, { DCTR_PID1_FILE: pid1, DCTR_VIEW_REQUEST_DIR: path.join(s.tmp, 'views') }), 'probe', out, ['sleep 1; echo done'])
  assert.match(r.stdout, /ran in the foreground/)
  assert.equal(verdict(out), exitLine(0))
  assert.ok(read(out).includes('done'))
  assert.equal(s.callText(), '')
})

test('a detached red-team launch from a Codex shell leaves a gate marker until its result is written', async (t) => {
  const s = scene(t)
  const init = path.join(s.tmp, 'pid1-init'); fs.writeFileSync(init, '/sbin/init\0splash\0')
  const env = s.none({ CODEX_SESSION_ID: CODEX, CODEX_THREAD_ID: CODEX, DCTR_PID1_FILE: init })
  const out = path.join(s.tmp, 'g', 'red-team.out')
  const r = s.launch(env, 'red-team', out, ['sh', '-c', 'sleep 2; echo verdict'])
  assert.match(r.stdout, /running detached/)
  const m = codexMarker(s)
  assert.equal(m?.role, 'gate')
  assert.equal(m?.detached, true)
  assert.equal(m?.paneId, '')
  assert.equal(m?.file, out)
  assert.equal(m?.label, 'red-team')
  assert.equal(s.callText(), '')
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
  const until = Date.now() + 10000
  while (Date.now() < until && codexMarker(s)) await sleep(50)
  assert.equal(codexMarker(s), null)
})

test('a detached gate from a Claude Code shell writes no marker', async (t) => {
  const s = scene(t)
  const out = path.join(s.tmp, 'claude-detached.out')
  const r = s.launch(s.none({ CLAUDE_CODE_SESSION_ID: SESSION }), 'probe', out, ['true'])
  assert.match(r.stdout, /running detached/)
  assert.equal(fs.existsSync(s.seats), false)
  assert.ok(await s.waitResult(out, s.detachedPid(r)))
})

// ------------------------------------------------------------------ herdr-core

test('a herdr-core gate runs in a split, writes its status, and closes its own unfocused pane', async (t) => {
  const s = coreScene(t)
  const out = path.join(s.tmp, 'gate.out')
  const r = s.launch(s.core(), 'g', out, ['echo gated; exit 3'], { cwd: s.tmp })
  assert.match(r.stdout, /running in pane P/)
  const marker = s.gateMarkers()[0]
  assert.equal(marker?.host, 'herdr-core')
  assert.ok(await s.waitResult(out))
  assert.equal(verdict(out), exitLine(3))
  assert.equal(read(out), 'gated\n')
  const until = Date.now() + 15000
  const closed = () => s.fake().some((c) => c.bin === 'herdr-app' && c.args[0] === 'do' && c.args[1] === 'pane.close' && c.args.includes(marker.paneId))
  while (Date.now() < until && !closed()) await sleep(50)
  assert.ok(closed(), JSON.stringify(s.fake()))
  assert.ok(!s.fake().some((c) => c.bin === 'herdr'), 'herdr-core called the herdr TUI')
})

test('a herdr-core tab gate the user is looking at when it finishes is relabelled and stays', async (t) => {
  const s = coreScene(t)
  s.fillColumn()
  const out = path.join(s.tmp, 'gatefocus.out'), go = path.join(s.tmp, 'go')
  const r = s.launch(s.core(), 'g', out, [`until [ -f ${go} ]; do sleep 0.05; done; exit 4`], { cwd: s.tmp })
  assert.match(r.stdout, /running in tab/)
  const tab = s.gateMarkers()[0]?.tabId
  assert.ok(tab)
  const m = s.model(); m.focus = { tab, pane: m.spaces.flatMap((sp) => sp.tabs).find((x) => x.id === tab)?.panes[0]?.pane }; s.save(m)
  fs.writeFileSync(go, '')
  assert.ok(await s.waitResult(out))
  const until = Date.now() + 15000
  const renamed = () => s.tabs().some((x) => x.id === tab && x.name?.endsWith(`· ${exitLine(4)}`))
  while (Date.now() < until && !renamed()) await sleep(50)
  assert.ok(renamed(), JSON.stringify(s.tabs()))
  assert.ok(!s.fake().some((c) => c.bin === 'herdr'))
})

test('a herdr-core gate whose marker cannot be written once its pane exists runs its check once, in that pane', async (t) => {
  const s = coreScene(t)
  fs.mkdirSync(s.seats, { recursive: true })
  const m = s.model(); m.chmodAfterCreate = s.seats; s.save(m)
  const r = await s.counted(s.core(), 'gateonce')
  fs.chmodSync(s.seats, 0o700)
  assert.ok(r.done)
  assert.equal(r.runs, 1)
  assert.match(r.r.stdout, /running in pane P/)
  assert.doesNotMatch(r.r.stdout, /detached/)
})

test('a herdr-core gate whose split call fails after its pane exists runs once and keeps no record', async (t) => {
  const s = coreScene(t)
  const r = await s.counted(s.core({ DCTR_FAKE_FAIL: JSON.stringify({ 'herdr-app do pane.split': 'after' }) }), 'gatesplit')
  assert.ok(r.done)
  assert.equal(r.runs, 1)
  assert.ok(r.r.stdout.includes(`${r.out}.result`), r.r.stdout)
  assert.equal(s.count('herdr-app', 'do', 'pane.split'), 1)
  assert.equal(s.count('herdr-app', 'do', 'tab.new'), 0)
  assert.deepEqual(s.gateMarkers(), [])
  assert.ok(s.log().includes('herdr-core create call failed'), s.log())
})

test('a herdr-core gate whose tab call fails after its tab exists runs once and keeps no record', async (t) => {
  const s = coreScene(t)
  s.fillColumn()
  const r = await s.counted(s.core({ DCTR_FAKE_FAIL: JSON.stringify({ 'herdr-app do tab.new': 'after' }) }), 'gatenewtab')
  assert.ok(r.done)
  assert.equal(r.runs, 1)
  assert.match(r.r.stdout, /may be running in a pane/)
  assert.doesNotMatch(r.r.stdout, /detached/)
  assert.equal(s.count('herdr-app', 'do', 'tab.new'), 1)
  assert.deepEqual(s.gateMarkers(), [])
  assert.ok(s.log().includes('herdr-core create call failed'), s.log())
})
