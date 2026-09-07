// Three-clause tamper test for the gate runner, per CLAUDE.md.
//
//   node hooks/dctr-gate.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Runs the script on its detached path (no herdr in the environment) with a tripwire `herdr` first
// on PATH, so it proves three things no pure test can: the check really runs and its output really
// reaches the file, the file really ends with the check's own exit status, and the no-herdr path
// really makes no herdr call. Clause 1 breaks the check and confirms the exit line trips. Clause 2
// runs a passing check and confirms the line reads 0 with the output intact. Clause 3 proves the
// broken fixture really fails when bash runs it without the script.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync, spawn } from 'node:child_process'
import { gateRunCommand, exitLine, shq } from './dctr-lib.mjs'

const script = path.join(import.meta.dirname, 'dctr-gate.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-gate-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const tripwire = path.join(tmp, 'herdr-was-called')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

// CLAUDE_CODE_SESSION_ID is cleared so a selftest run inside a live session never writes into that
// session's hook.log (it did, the first time it ran there).
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HERDR_ENV: '', HERDR_WORKSPACE_ID: '', HERDR_PANE_ID: '', CLAUDE_CODE_SESSION_ID: '' }
const launch = (label, out, ...command) => execFileSync('node', [script, label, out, '--', ...command], { env, encoding: 'utf8' })
const waitDone = (out, ms = 8000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try { const t = fs.readFileSync(out, 'utf8'); if (/^exit=\S+\n?$/m.test(t.trim().split('\n').pop())) return t } catch { /* not yet */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  try { return fs.readFileSync(out, 'utf8') } catch { return '' }
}
const lastLine = (t) => t.trim().split('\n').pop()

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const BROKEN = "echo 'about to fail'; exit 3"
const GOOD = "echo one; echo two >&2; printf 'it'\"'\"'s quoted\\n'"

const out1 = path.join(tmp, 'broken.out')
const said1 = launch('broken gate', out1, BROKEN)
const t1 = waitDone(out1)
clause('clause 1 — a failing check leaves exit=3 as the last line, and the launcher said where to look',
  lastLine(t1) === exitLine(3) && t1.includes('about to fail') && said1.includes(out1) && said1.includes('detached'),
  `last line: ${JSON.stringify(lastLine(t1))}; launcher: ${said1.trim()}`)

const out2 = path.join(tmp, 'good.out')
launch('good gate', out2, GOOD)
const t2 = waitDone(out2)
clause('clause 2 — a passing check ends exit=0 with stdout, stderr and the quoted text all in the file',
  lastLine(t2) === exitLine(0) && t2.includes('one\n') && t2.includes('two\n') && t2.includes("it's quoted"),
  JSON.stringify(t2))

clause('clause 2b — the no-herdr path called herdr ZERO times',
  !fs.existsSync(tripwire),
  'the tripwire herdr on PATH fired on the detached path')

// argv form: `bash -c "<string>"` given as three arguments must keep its quoting through the pane
// line and the runner both, which is what the first live use lost.
const out3 = path.join(tmp, 'argv.out')
launch('argv gate', out3, 'bash', '-c', 'echo "a  b"; printf %s "$0"; exit 4')
const t3 = waitDone(out3)
clause('clause 1c — an argv-form command keeps its quoting: two spaces survive and it exits 4',
  lastLine(t3) === exitLine(4) && t3.includes('a  b'),
  JSON.stringify(t3))

const direct = spawnSync('bash', ['-c', BROKEN], { encoding: 'utf8' })
clause('clause 3 — the broken fixture really exits 3 under bash alone, without the script',
  direct.status === 3 && direct.stdout.includes('about to fail'),
  `status ${direct.status}`)

// The pane line is the one piece of pure shell assembly: a command with a single quote must reach
// bash as one argument, or the quote ends the string and the rest runs as a second command.
const line = gateRunCommand('/p/dctr-gate.mjs', '/o', '/m', 'w1:p2', 'lbl', ['bash', '-c', GOOD])
const roundTrip = spawnSync('bash', ['-c', `printf '%s\\n' ${line.slice(line.indexOf('-- ') + 3)}`], { encoding: 'utf8' })
clause('clause 1b — the pane line carries an argv command through bash as the same three words, quotes intact',
  roundTrip.stdout === `bash\n-c\n${GOOD}\n` && line.startsWith(`node ${shq('/p/dctr-gate.mjs')} --run `),
  JSON.stringify(roundTrip.stdout))

// F1 (field audit 2026-09-07): the pane path inherited the herdr server's cwd, so a relative check
// path ran in a different directory from the detached path's. A recording herdr answers the layout
// and split calls so the pane path runs to its `pane run`, and both creation calls are read back
// with the cwd this launcher was started in. The tab path is reached by failing the layout read.
const bin2 = path.join(tmp, 'bin2'); fs.mkdirSync(bin2)
const calls = path.join(tmp, 'calls')
fs.writeFileSync(path.join(bin2, 'herdr'), `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(calls)}
if [ "$1 $2" = "pane layout" ] && [ -n "$DCTR_TEST_LAYOUT_FAILS" ]; then echo '{"error":{"code":"transport_error"}}' >&2; exit 1; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_FOCUSED" ]; then echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":true}}}'; exit 0; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
if [ "$1 $2" = "pane get" ] && [ -n "$DCTR_TEST_GET_GONE" ]; then echo '{"error":{"code":"pane_not_found","message":"no such pane"}}' >&2; exit 1; fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_CLOSE_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
case "$1 $2" in
  # A REAL unfocused pane. This used to fall through to the default empty result, so the ordinary
  # close path was driven by a reply carrying no pane at all: the degenerate input, not the real one.
  "pane get") echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":false}}}' ;;
  "pane layout") echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":56}}]}}}' ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"w1:pS"}}}' ;;
  "tab create") echo '{"result":{"tab":{"tab_id":"w1:tT"},"root_pane":{"pane_id":"w1:pT"}}}' ;;
  *) echo '{"result":{}}' ;;
esac
`)
fs.chmodSync(path.join(bin2, 'herdr'), 0o755)
const paneEnv = (extra) => ({ ...process.env, PATH: `${bin2}:${process.env.PATH}`, TMPDIR: tmp, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1', CLAUDE_CODE_SESSION_ID: 'gate-selftest', DCTR_VIEW_REQUEST_DIR: '', ...extra })
const HERE = process.cwd()
const callLine = (re) => { try { return fs.readFileSync(calls, 'utf8').split('\n').find((l) => re.test(l)) || '' } catch { return '' } }

fs.writeFileSync(calls, '')
execFileSync('node', [script, 'pane gate', path.join(tmp, 'pane.out'), '--', 'true'], { env: paneEnv({}), encoding: 'utf8' })
const split = callLine(/^pane split /)
clause('clause 1d: the pane path splits with --cwd set to the cwd the launcher was started in',
  split.includes(` --cwd ${HERE}`) && callLine(/^pane run w1:pS /).includes('--run'),
  `split: ${split}; run: ${callLine(/^pane run /)}`)

fs.writeFileSync(calls, '')
execFileSync('node', [script, 'tab gate', path.join(tmp, 'tab.out'), '--', 'true'], { env: paneEnv({ DCTR_TEST_LAYOUT_FAILS: '1' }), encoding: 'utf8' })
const create = callLine(/^tab create /)
clause('clause 1e: the tab path creates with the same --cwd',
  create.includes(` --cwd ${HERE}`) && !callLine(/^pane split /) && callLine(/^pane run w1:pT /).includes('--run'),
  `create: ${create}`)

// Item 3 (user-observed, 2026-09-07): the split path never named its pane. The tab path passes
// tabLabel into `tab create`, so an overflow gate tab is named; the split path calls splitArgs,
// which takes no label, and nothing renamed afterwards. A side-column gate pane was therefore
// nameless for its whole run, since the completion rename fires only on a FOCUSED pane. Both
// sibling launchers rename after a split (dctr-seat.mjs, dctr-pane.mjs); this one did not.
fs.writeFileSync(calls, '')
execFileSync('node', [script, 'named gate', path.join(tmp, 'named.out'), '--', 'true'], { env: paneEnv({}), encoding: 'utf8' })
clause('clause 1f: the pane path NAMES the pane it split, with the label the launcher was given',
  /^pane rename w1:pS named gate$/m.test(fs.readFileSync(calls, 'utf8')),
  `rename calls: ${JSON.stringify(fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('pane rename')))}`)

// The tab path already carries its name from `tab create`, so it must NOT be renamed at placement.
// Without this the clause above passes just as well against a launcher that renames unconditionally,
// which would overwrite the tab's own naming convention.
fs.writeFileSync(calls, '')
execFileSync('node', [script, 'tab named', path.join(tmp, 'tabnamed.out'), '--', 'true'], { env: paneEnv({ DCTR_TEST_LAYOUT_FAILS: '1' }), encoding: 'utf8' })
clause('clause 1f2: the tab path is NOT renamed at placement, keeping the name tab create gave it',
  !callLine(/^pane rename /) && callLine(/^tab create /).includes('--label'),
  `rename: ${callLine(/^pane rename /)}; create: ${callLine(/^tab create /)}`)

// The progress name (user ruling, 2026-09-07). The interval is injectable for exactly the reason
// item 1 makes the watcher intervals injectable: a fixture must not sleep on a production interval.
// At 50ms, against a check long enough that the labels appear before it ends, this asserts a
// condition and not a duration: the wait below is what makes that true, not the check's length.
// Driven through `--run` directly, not through the launcher: on the launcher's pane path the
// recording herdr only RECORDS the `pane run` call, so the process that owns the ticker never
// executes there and this clause would pass or fail for reasons having nothing to do with it.
// `--run` is the mode that actually runs the check and ticks, on the pane and detached paths both.
fs.writeFileSync(calls, '')
// Spawned and POLLED, not run for a fixed duration: the old form ran `sleep 1.15` and hoped enough
// ticks accrued inside it, which is a duration wearing a condition's clothes and the one clause
// shape that reddens without a defect under N-way load. This waits for the labels to appear and
// stops as soon as they do, so a slow machine takes longer instead of failing.
const tickProc = spawn('node', [script, '--run', path.join(tmp, 'tick.out'), '', 'w1:pS', 'ticking gate', '--', 'sleep 6'],
  { env: paneEnv({ DCTR_ELAPSED_MS: '50' }), stdio: 'ignore' })
const wantTick = (re) => { try { return re.test(fs.readFileSync(calls, 'utf8')) } catch { return false } }
{
  const until = Date.now() + 15000
  while (Date.now() < until && !(wantTick(/^pane rename w1:pS ticking gate · 0s elapsed$/m) && wantTick(/^pane rename w1:pS ticking gate · 1s elapsed$/m))) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
  }
  tickProc.kill('SIGKILL')
}
// It must be shown to READ A CLOCK, not to print a constant: `\d+s` matches "0s", so a ticker
// passing a hardcoded 0 satisfied the old assertion exactly as a working one did. TWO DISTINCT
// labels are required, 0s and 1s, which takes a little over a second at a 50ms interval. What makes
// that safe under N-way load is the POLL above, not a margin: the loop waits for both labels and
// stops as soon as they arrive, so a slow machine takes longer rather than failing. An earlier
// comment here credited the safety to a fixed 1.15s run, which is the form this fixture replaced.
clause('clause 1g: while the check runs, the pane name carries elapsed time that INCREASES, on the injected interval',
  wantTick(/^pane rename w1:pS ticking gate · 0s elapsed$/m) && wantTick(/^pane rename w1:pS ticking gate · 1s elapsed$/m),
  `rename calls: ${JSON.stringify(fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('pane rename')))}`)

// A focused pane is relabelled to its exit name on completion, and that must be the LAST name it
// carries: an elapsed tick landing after it would leave the pane lying about a check that has
// finished. Nothing cancels the ticker — the close handler runs synchronously through to
// process.exit, so no timer can interleave — and this asserts the outcome that ordering gives,
// which is the thing worth pinning either way.
fs.writeFileSync(calls, '')
execFileSync('node', [script, '--run', path.join(tmp, 'exitname.out'), '', 'w1:pS', 'ending gate', '--', 'sleep 0.3'],
  { env: paneEnv({ DCTR_ELAPSED_MS: '20', DCTR_TEST_GET_FOCUSED: '1' }), encoding: 'utf8' })
const renames = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('pane rename'))
// B4/B5: the completion path's THREE answers, and the marker's fate under each. The marker is
// removed before the close because closing the pane kills the shell this process runs in — an
// ordering that is right for the success path and abandons a live pane on every other one, since
// SessionEnd finds panes by record. So its content is kept in hand and written back.
{
  const mk = (n) => { const f = path.join(tmp, `gm${n}.json`); fs.writeFileSync(f, JSON.stringify({ agent: `dctr-gate-${n}`, role: 'gate', paneId: 'w1:pS' })); return f }

  const m1 = mk(1); fs.writeFileSync(calls, '')
  execFileSync('node', [script, '--run', path.join(tmp, 'g1.out'), m1, 'w1:pS', 'lookup fails', '--', 'true'],
    { env: paneEnv({ DCTR_TEST_GET_FAILS: '1' }), encoding: 'utf8' })
  clause('clause 1i: a focus lookup that FAILED closes nothing and puts the marker back',
    !fs.readFileSync(calls, 'utf8').includes('pane close') && fs.existsSync(m1),
    `close calls: ${JSON.stringify(fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('pane close')))}; marker: ${fs.existsSync(m1)}`)

  const m2 = mk(2); fs.writeFileSync(calls, '')
  execFileSync('node', [script, '--run', path.join(tmp, 'g2.out'), m2, 'w1:pS', 'close fails', '--', 'true'],
    { env: paneEnv({ DCTR_TEST_CLOSE_FAILS: '1' }), encoding: 'utf8' })
  clause('clause 1j: a close that FAILED puts the marker back, so SessionEnd can still reach the pane',
    fs.readFileSync(calls, 'utf8').includes('pane close') && fs.existsSync(m2),
    `marker: ${fs.existsSync(m2)}`)

  const m3 = mk(3); fs.writeFileSync(calls, '')
  execFileSync('node', [script, '--run', path.join(tmp, 'g3.out'), m3, 'w1:pS', 'ordinary', '--', 'true'],
    { env: paneEnv({}), encoding: 'utf8' })
  clause('clause 1k: and an ordinary unfocused close still removes it — the marker comes back only on a failure',
    fs.readFileSync(calls, 'utf8').includes('pane close w1:pS') && !fs.existsSync(m3),
    `close: ${fs.readFileSync(calls, 'utf8').includes('pane close w1:pS')}; marker still there: ${fs.existsSync(m3)}`)

  const m4 = mk(4); fs.writeFileSync(calls, '')
  execFileSync('node', [script, '--run', path.join(tmp, 'g4.out'), m4, 'w1:pS', 'pane gone', '--', 'true'],
    { env: paneEnv({ DCTR_TEST_GET_GONE: '1' }), encoding: 'utf8' })
  clause('clause 1l: a pane the lookup says is GONE keeps no marker — not-found is an answer, and the removal was right',
    !fs.existsSync(m4),
    `marker restored for a pane that does not exist: ${fs.existsSync(m4)}`)

  clause('clause 3d: the two failure fixtures really fail, and the ordinary one really does not, proved without the launcher',
    spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_FAILS: '1' } }).status === 1 &&
    spawnSync(`${bin2}/herdr`, ['pane', 'close', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CLOSE_FAILS: '1' } }).status === 1 &&
    spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: process.env }).status === 0 &&
    /pane_not_found/.test(spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_GONE: '1' } }).stderr),
    'without this the clauses above could pass because the launcher never called herdr at all')
}

clause('clause 1h: the LAST name a finished pane carries is its exit status, not a leftover elapsed tick',
  renames.length > 1 && renames[renames.length - 1] === `pane rename w1:pS ending gate · ${exitLine(0)}`,
  `renames: ${JSON.stringify(renames)}`)

// CLAUDE.md's third clause: prove the fixture can carry the defect, without asking the checker.
// If the recording herdr silently dropped `pane rename`, clauses 1f and 1g would read an empty list
// and fail for a reason that has nothing to do with the launcher.
clause('clause 3c: the recording herdr really records a pane rename, so an absent one above is the launcher and not the stub',
  spawnSync(`${bin2}/herdr`, ['pane', 'rename', 'w1:pS', 'probe'], { encoding: 'utf8' }).status === 0 &&
  fs.readFileSync(calls, 'utf8').includes('pane rename w1:pS probe'),
  'the stub must both exit 0 and append the call for clauses 1f and 1g to mean anything')

clause('clause 3b: the recording herdr really answers a split and a tab create with the pane ids the clauses read back',
  spawnSync(`${bin2}/herdr`, ['pane', 'split', 'w1:p1'], { encoding: 'utf8' }).stdout.includes('w1:pS') &&
  spawnSync(`${bin2}/herdr`, ['tab', 'create'], { encoding: 'utf8' }).stdout.includes('w1:pT') &&
  spawnSync(`${bin2}/herdr`, ['pane', 'layout'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_LAYOUT_FAILS: '1' } }).status === 1,
  'if the fake answered nothing, both paths would fall to detached and the clauses above would read an empty call list')

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
