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
// TWO FILES (Scott's ruling 2026-09-11). The verdict is in `<out>.result`, written by rename, so its
// EXISTENCE is the completion signal and the transcript is already closed when it appears. Waiting on
// a line inside the transcript is the thing this rewrite deletes: six assertions had been satisfied by
// the launcher's own writes into that file, and a check printing `exit=0` ended the wait while running.
const waitResult = (out, ms = 8000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (fs.existsSync(`${out}.result`)) return true
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  return false
}
/** Waits, then reads the transcript. Clause 7's transcript is a character device that never ends, so
 *  that one clause waits with `waitResult` and never reads it. */
const waitDone = (out, ms = 8000) => {
  waitResult(out, ms)
  try { return fs.readFileSync(out, 'utf8') } catch { return '' }
}
/** The verdict's first line. Read from the result file, never from the transcript: that separation IS
 *  the contract, so a clause that read the status out of the transcript would certify its absence. */
const verdict = (out) => { try { return fs.readFileSync(`${out}.result`, 'utf8').trim().split('\n')[0] } catch { return '' } }
const resultBody = (out) => { try { return fs.readFileSync(`${out}.result`, 'utf8') } catch { return '' } }
// Derived from the owner, never restated, for the same reason the launcher derives it.
const MARK = exitLine('')

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const BROKEN = "echo 'about to fail'; exit 3"
const GOOD = "echo one; echo two >&2; printf 'it'\"'\"'s quoted\\n'"

const out1 = path.join(tmp, 'broken.out')
const said1 = launch('broken gate', out1, BROKEN)
const t1 = waitDone(out1)
clause('clause 1 — a failing check puts exit=3 in the RESULT file, and the launcher named that file to wait on',
  verdict(out1) === exitLine(3) && t1.includes('about to fail') && said1.includes(`${out1}.result`) && said1.includes('detached'),
  `verdict: ${JSON.stringify(verdict(out1))}; launcher: ${said1.trim()}`)
// The other half of the split, and the half a reader acts on: the transcript is the check's bytes and
// nothing else. No verdict line (a `grep -q` wait would have ended early on it) and no echoed command
// (six assertions in this file's history were satisfied by that echo).
clause('clause 1a — and the TRANSCRIPT carries neither the verdict nor the echoed command',
  !t1.split('\n').some((l) => l.startsWith(MARK)) && !t1.includes(BROKEN) && t1.split('\n').filter(Boolean).join('\n') === 'about to fail',
  `the transcript must hold the check's bytes alone: ${JSON.stringify(t1)}`)

const out2 = path.join(tmp, 'good.out')
launch('good gate', out2, GOOD)
const t2 = waitDone(out2)
clause('clause 2 — a passing check records exit=0 with stdout, stderr and the quoted text all in the transcript',
  verdict(out2) === exitLine(0) && t2.includes('one\n') && t2.includes('two\n') && t2.includes("it's quoted"),
  `${JSON.stringify(verdict(out2))} ${JSON.stringify(t2)}`)

clause('clause 2b — the no-herdr path called herdr ZERO times',
  !fs.existsSync(tripwire),
  'the tripwire herdr on PATH fired on the detached path')

// argv form: `bash -c "<string>"` given as three arguments must keep its quoting through the pane
// line and the runner both, which is what the first live use lost.
const out3 = path.join(tmp, 'argv.out')
launch('argv gate', out3, 'bash', '-c', 'echo "a  b"; printf %s "$0"; exit 4')
const t3 = waitDone(out3)
clause('clause 1c — an argv-form command keeps its quoting: two spaces survive and it exits 4',
  verdict(out3) === exitLine(4) && t3.split('\n').includes('a  b'),
  // A SUBSTRING test used to pass on the echoed command, which contained `echo "a  b"` verbatim, so
  // this clause once certified preserved quoting with the child's output absent. The echo has left the
  // transcript, which kills the class; the exact-line test stays, because the next revision may not.
  `${JSON.stringify(verdict(out3))} ${JSON.stringify(t3)}`)

const direct = spawnSync('bash', ['-c', BROKEN], { encoding: 'utf8' })
clause('clause 3 — the broken fixture really exits 3 under bash alone, without the script',
  direct.status === 3 && direct.stdout.includes('about to fail'),
  `status ${direct.status}`)

// The pane line is the one piece of pure shell assembly: a command with a single quote must reach
// bash as one argument, or the quote ends the string and the rest runs as a second command.
const line = gateRunCommand('/p/dctr-gate.mjs', '/o', '/m', 'w1:p2', '', '', 'lbl', ['bash', '-c', GOOD])
const roundTrip = spawnSync('bash', ['-c', `printf '%s\\n' ${line.slice(line.indexOf('-- ') + 3)}`], { encoding: 'utf8' })
clause('clause 1b — the pane line carries an argv command through bash as the same three words, quotes intact',
  roundTrip.stdout === `bash\n-c\n${GOOD}\n` && line.startsWith(`node ${shq('/p/dctr-gate.mjs')} --run `),
  JSON.stringify(roundTrip.stdout))

// THE POSITIONAL CONTRACT, which nothing pinned before F5. `--run` reads its arguments by position,
// so a tab gate's ids must arrive in the right slots and a side-column gate must still emit the two
// empty placeholders — without them `label` lands in the tabId slot and the completion path tries to
// close a tab named "lbl". Asserted by parsing the line the way dctr-gate.mjs itself does.
//
// ASSERTED OVER BASH-DECODED ARGV, not over the shell SOURCE. A first version split the generated
// string on spaces and compared each word to `shq(...)`, and a red team showed it certifies the very
// failure it names: regress `shq('')` from `''` to the empty string and the line grows two runs of
// spaces, the naive split yields empty words that match the regressed `shq('')`, and the clause
// passes — while real bash discards both placeholders and every later argument slides one slot left.
// What the process actually receives is the only thing worth asserting, so ask bash.
{
  const bashArgv = (l) => {
    const inner = l.slice(l.indexOf('--run ') + '--run '.length, l.indexOf(' -- '))
    const r = spawnSync('bash', ['-c', `printf '%s\\n' ${inner}`], { encoding: 'utf8' })
    return r.stdout.split('\n').slice(0, -1)
  }
  const tabLine = gateRunCommand('/p/dctr-gate.mjs', '/o', '/m', 'w1:pR', 'w1:t8', 'w1', 'lbl', ['true'])
  const tabArgv = bashArgv(tabLine)
  clause('clause 1q — a TAB gate delivers SIX arguments to the process, its tab id and workspace among them, in the slots the parse reads',
    tabArgv.length === 6 &&
    tabArgv[0] === '/o' && tabArgv[1] === '/m' && tabArgv[2] === 'w1:pR' &&
    tabArgv[3] === 'w1:t8' && tabArgv[4] === 'w1' && tabArgv[5] === 'lbl',
    JSON.stringify(tabArgv))
  const sideArgv = bashArgv(line)
  clause('clause 1r — and a side-column gate still delivers SIX, the empty tab id surviving as its own argument, so the label cannot slide into the tab slot',
    sideArgv.length === 6 &&
    sideArgv[2] === 'w1:p2' && sideArgv[3] === '' && sideArgv[5] === 'lbl',
    JSON.stringify(sideArgv))
}

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
# Make the seats directory unwritable at the moment the PLACEMENT write happens, and writable again
# by the time the rollback's republish runs. Without this the placement's own writeMarker has already
# put the pane id on disk before anything fails, so clause 1o reads a value the republish never wrote
# and passes with the republish deleted. The close is the reset point because it runs between them.
if [ "$1 $2" = "pane rename" ] && [ -n "$DCTR_TEST_SEATS_RO" ]; then chmod 500 "$TMPDIR/dctr-gate-selftest/seats"; fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_SEATS_RO" ]; then chmod 700 "$TMPDIR/dctr-gate-selftest/seats"; fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_CLOSE_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
# A TAB gate's completion asks the TAB. Three answers, the same three the pane side makes: a list
# that FAILED, a list that succeeded and does not carry this tab (an observed absence), and a tab
# with a readable focus.
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TABLIST_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_ABSENT" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false}]}}'; exit 0; fi
# EVERY list carries a DECOY FIRST, and its focus is the OPPOSITE of the target's. This file is a JS
# template literal, so no backticks below. With one tab in the list, an identity lookup and taking
# whatever came first return the same value, and nothing could tell the two apart.
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_FOCUSED" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false},{"tab_id":"w1:tG","focused":true,"label":"g"}]}}'; exit 0; fi
# The target is listed and carries NO readable focus. stopAction answers unknown for that, which must
# spare it; a truthiness test in its place would close it.
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TAB_NOFOCUS" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":false},{"tab_id":"w1:tG","label":"g"}]}}'; exit 0; fi
if [ "$1 $2" = "tab list" ]; then echo '{"result":{"tabs":[{"tab_id":"w9:decoy","focused":true},{"tab_id":"w1:tG","focused":false,"label":"g"}]}}'; exit 0; fi
if [ "$1 $2" = "tab close" ] && [ -n "$DCTR_TEST_TABCLOSE_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
if [ "$1 $2" = "pane run" ] && [ -n "$DCTR_TEST_RUN_FAILS" ]; then echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1; fi
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

// THE WIRING FROM PLACEMENT TO COMPLETION, which nothing joined: the clause above only asked that
// the pane-run line contained `--run`, and the completion fixtures hand-build their own arguments.
// Between them sat the one call that has to pass the ids on, so replacing it with
// `gateRunCommand(self, outFile, marker, paneId, '', '', label, command)` restored root-pane
// completion while every new clause stayed green. Assert the ids the placement actually observed.
{
  const runLine = callLine(/^pane run w1:pT /)
  clause('clause 1e2: the tab placement hands its OWN tab id and workspace to the line it types into the pane',
    runLine.includes(` ${shq('w1:tT')} `) && runLine.includes(` ${shq('w1')} `) && runLine.includes(` ${shq('w1:pT')} `),
    `pane run line: ${runLine}`)
}

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
const tickProc = spawn('node', [script, '--run', path.join(tmp, 'tick.out'), '', 'w1:pS', '', '', 'ticking gate', '--', 'sleep 6'],
  { env: paneEnv({ DCTR_ELAPSED_MS: '50' }), stdio: 'ignore' })
// TWO DISTINCT INCREASING values, not the literal 0s and 1s. Requiring `0s` made a correct ticker
// fail for a reason that has nothing to do with it: a runner descheduled past one second reports 1s
// on its FIRST tick and every tick after is larger, so the zero label can never appear and no amount
// of waiting recovers it. What the clause is actually about is that the name carries a clock that
// MOVES, and two different values prove that whichever two they are.
const ticks = () => {
  try {
    return [...fs.readFileSync(calls, 'utf8').matchAll(/^pane rename w1:pS ticking gate · (\d+)s elapsed$/gm)]
      .map((m) => Number(m[1]))
  } catch { return [] }
}
const ticksRose = () => { const t = ticks(); return new Set(t).size >= 2 && Math.max(...t) > Math.min(...t) }
{
  const until = Date.now() + 15000
  while (Date.now() < until && !ticksRose()) {
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
  ticksRose(),
  `elapsed values seen: ${JSON.stringify(ticks())} — two distinct values are required and a hardcoded constant gives one`)

// A focused pane is relabelled to its exit name on completion, and that must be the LAST name it
// carries: an elapsed tick landing after it would leave the pane lying about a check that has
// finished. Nothing cancels the ticker — the close handler runs synchronously through to
// process.exit, so no timer can interleave — and this asserts the outcome that ordering gives,
// which is the thing worth pinning either way.
fs.writeFileSync(calls, '')
execFileSync('node', [script, '--run', path.join(tmp, 'exitname.out'), '', 'w1:pS', '', '', 'ending gate', '--', 'sleep 0.3'],
  { env: paneEnv({ DCTR_ELAPSED_MS: '20', DCTR_TEST_GET_FOCUSED: '1' }), encoding: 'utf8' })
const renames = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('pane rename'))
// The completion path's FOUR answers and the record's fate under each. Only `pane close` kills the
// shell this process runs in, so only that branch cannot act after its call — and the ruling is that it
// therefore does NOT drop the record at all, which clause 1p and its mutation enforce. Asking BEFORE
// removing is what let the restore machinery go: there is no window and nothing to put back.
{
  const mk = (n) => { const f = path.join(tmp, `gm${n}.json`); fs.writeFileSync(f, JSON.stringify({ agent: `dctr-gate-${n}`, role: 'gate', paneId: 'w1:pS' })); return f }
  const run = (n, env, label) => {
    const m = mk(n); fs.writeFileSync(calls, '')
    execFileSync('node', [script, '--run', path.join(tmp, `g${n}.out`), m, 'w1:pS', '', '', label, '--', 'true'],
      { env: paneEnv(env), encoding: 'utf8' })
    return { m, calls: fs.readFileSync(calls, 'utf8') }
  }

  // THE SAME FOUR ANSWERS FOR A TAB GATE (F5). The launcher placed to a tab whenever the side column
  // was full, recorded the tabId, and then asked `pane get` about the tab's ROOT pane and closed that
  // pane — a different question from the one it acted on, against the ruling that a tab seat's focus
  // is read from the TAB. `tabGate` passes the tab id and workspace the way the placement now does.
  const tabGate = (n, env, label) => {
    const f = path.join(tmp, `tm${n}.json`)
    fs.writeFileSync(f, JSON.stringify({ agent: `dctr-gate-${n}`, role: 'gate', paneId: 'w1:pR', tabId: 'w1:tG' }))
    fs.writeFileSync(calls, '')
    execFileSync('node', [script, '--run', path.join(tmp, `t${n}.out`), f, 'w1:pR', 'w1:tG', 'w1', label, '--', 'true'],
      { env: paneEnv(env), encoding: 'utf8' })
    return { m: f, calls: fs.readFileSync(calls, 'utf8') }
  }

  // EXACT CALL LINES, never substrings. `calls.includes('tab close w1:tG')` is also true of
  // `tab close w1:tG0`, so a close aimed at the wrong tab satisfied the assertion; and the marker's
  // fate went unasserted on every tab branch, so inserting a dropMarker() before the close left all
  // of these green while deleting the record the closed ruling exists to preserve.
  const said = (r, line) => r.calls.split('\n').includes(line)

  const ta = tabGate(11, { DCTR_TEST_TABLIST_FAILS: '1' }, 'tab list fails')
  clause('clause 1s — a TAB gate whose list FAILED closes nothing and keeps its record: unobservable is not unfocused',
    !ta.calls.includes('tab close') && !ta.calls.includes('pane close') && fs.existsSync(ta.m),
    ta.calls.trim().split('\n').join(' | '))

  const tb = tabGate(12, { DCTR_TEST_TAB_FOCUSED: '1' }, 'tab focused')
  clause('clause 1t — a FOCUSED tab is RENAMED to its exit status, not closed, and keeps its record',
    said(tb, 'tab rename w1:tG tab focused \u00b7 ' + exitLine(0)) &&
    !tb.calls.includes('tab close') && !tb.calls.includes('pane close') && fs.existsSync(tb.m),
    tb.calls.trim().split('\n').join(' | '))

  const tc = tabGate(13, {}, 'tab ordinary')
  clause('clause 1u — an unfocused TAB is closed BY ITS OWN ID, its root pane is never closed, and its record is left for SessionEnd',
    said(tc, 'tab close w1:tG') && !tc.calls.includes('pane close') && fs.existsSync(tc.m),
    tc.calls.trim().split('\n').join(' | '))

  const td = tabGate(14, { DCTR_TEST_TAB_ABSENT: '1' }, 'tab absent')
  clause('clause 1v — a tab the list SUCCEEDED and did not carry is an observed absence, closed by id (issue #20), record left',
    said(td, 'tab close w1:tG') && !td.calls.includes('pane close') && fs.existsSync(td.m),
    td.calls.trim().split('\n').join(' | '))

  // stopAction's third answer, which no fixture reached: the tab is LISTED and carries no readable
  // focus. A truthiness test in stopAction's place closes it; `unknown` must spare it.
  const te = tabGate(15, { DCTR_TEST_TAB_NOFOCUS: '1' }, 'tab no focus')
  clause('clause 1x — a listed tab with NO readable focus is spared and keeps its record: unknown is not unfocused',
    !te.calls.includes('tab close') && !te.calls.includes('pane close') && fs.existsSync(te.m),
    te.calls.trim().split('\n').join(' | '))

  // The branch the ordering ruling exists for, on the tab side: a close that FAILED must leave the
  // record behind, because the tab is still alive and SessionEnd reaches tabs only through records.
  const tf = tabGate(16, { DCTR_TEST_TABCLOSE_FAILS: '1' }, 'tab close fails')
  clause('clause 1y2 — a tab close that FAILED leaves the tab alive AND its record intact',
    said(tf, 'tab close w1:tG') && fs.existsSync(tf.m),
    tf.calls.trim().split('\n').join(' | '))

  // THE CARRIED WORKSPACE, with the environment the pane actually has. The completion runs inside a
  // pane whose shell starts fresh, so HERDR_WORKSPACE_ID is not there — which is the whole reason
  // the workspace is a positional. With it left in the environment, every clause above would pass
  // just as well if the code read process.env instead of the argument.
  const tg = tabGate(17, { HERDR_WORKSPACE_ID: '' }, 'tab fresh env')
  clause('clause 1z2 — with HERDR_WORKSPACE_ID ABSENT from the environment, the tab list still asks the workspace the launcher carried',
    said(tg, 'tab list --workspace w1') && said(tg, 'tab close w1:tG'),
    tg.calls.trim().split('\n').join(' | '))

  // THE GUARD, which is what makes the placeholders unnecessary to remember. An argv missing one
  // positional slides every later value left: omit the workspace and `workspace` becomes the label
  // while `label` becomes `--`, which the old guard accepted because `--` is truthy. The launcher
  // then asked the wrong workspace and closed the tab by id on a list that did not carry it.
  {
    fs.writeFileSync(calls, '')
    let refused = false
    try {
      execFileSync('node', [script, '--run', path.join(tmp, 'slid.out'), path.join(tmp, 'slid.json'), 'w1:pR', 'w1:tG', 'lbl', '--', 'true'],
        { env: paneEnv({}), encoding: 'utf8', stdio: 'pipe' })
    } catch { refused = true }
    clause('clause 1z3 — a --run argv with a positional MISSING is refused outright, and touches herdr not at all',
      refused && fs.readFileSync(calls, 'utf8').trim() === '',
      `refused ${refused}; calls: ${JSON.stringify(fs.readFileSync(calls, 'utf8'))}`)
  }

  clause('clause 1w — and every tab answer asked the TAB, never the root pane: tab list in all, pane get in none',
    [ta, tb, tc, td, te, tf, tg].every((r) => r.calls.includes('tab list') && !r.calls.includes('pane get w1:pR')),
    [ta, tb, tc, td, te, tf, tg].map((r) => (r.calls.includes('pane get w1:pR') ? 'asked the pane' : 'asked the tab')).join(' | '))

  const a = run(1, { DCTR_TEST_GET_FAILS: '1' }, 'lookup fails')
  clause('clause 1i: a focus lookup that FAILED closes nothing and KEEPS the record, which was never removed',
    !a.calls.includes('pane close') && fs.existsSync(a.m),
    `closes: ${a.calls.includes('pane close')}; marker: ${fs.existsSync(a.m)}`)

  const b = run(2, { DCTR_TEST_GET_FOCUSED: '1' }, 'focused')
  clause('clause 1j: a FOCUSED pane is relabelled and keeps its record, so SessionEnd can still reach the pane that outlived the check',
    b.calls.includes('pane rename') && !b.calls.includes('pane close') && fs.existsSync(b.m),
    `rename: ${b.calls.includes('pane rename')}; marker: ${fs.existsSync(b.m)}`)

  // The record is LEFT here, and that is the repair rather than an oversight. Dropping it first paid
  // a permanent live-pane-with-no-record on every failed close; the leftover is swept by the next
  // placement (its pane is gone from the layout, so staleSideSeats drops it) or by SessionEnd, whose
  // close answers pane_not_found and reads that as already gone. Clause 1p below drives the failed
  // close and is the half that shows why the ordering changed.
  const c = run(3, {}, 'ordinary')
  clause('clause 1k: an ordinary unfocused pane is CLOSED, and its record is left for the sweep rather than dropped ahead of a close that may fail',
    c.calls.includes('pane close w1:pS') && fs.existsSync(c.m),
    `close: ${c.calls.includes('pane close w1:pS')}; marker kept: ${fs.existsSync(c.m)}`)

  const d = run(4, { DCTR_TEST_GET_GONE: '1' }, 'pane gone')
  clause('clause 1l: a pane the lookup says is GONE has its record dropped and is not closed — not-found is an answer',
    !d.calls.includes('pane close') && !fs.existsSync(d.m),
    `closes: ${d.calls.includes('pane close')}; marker: ${fs.existsSync(d.m)}`)

  // THE BRANCH THE ORDERING EXISTS FOR, and it had no clause at all: the old one (1j) was deleted
  // along with the marker-restore machinery and nothing replaced it, so the sentence the whole
  // rewrite rests on was pinned by nothing. An unfocused pane whose close FAILS is exactly the case
  // that used to end with a live pane and no record.
  const e = run(5, { DCTR_TEST_CLOSE_FAILS: '1' }, 'close fails')
  clause('clause 1p: a close that FAILED leaves the pane alive AND its record intact, so SessionEnd can still reach it',
    e.calls.includes('pane close w1:pS') && fs.existsSync(e.m),
    `close attempted: ${e.calls.includes('pane close w1:pS')}; marker kept: ${fs.existsSync(e.m)}`)

  clause('clause 1m: the five differ ONLY in the herdr reply, so the record\'s fate is what the reply decides and nothing else',
    [a, b, c, d, e].every((r) => r.calls.includes('pane get w1:pS')),
    'if any of them never called pane get, its clause is measuring the launcher standing down')

  clause('clause 3d: the fixtures really answer differently, proved without the launcher',
    spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_FAILS: '1' } }).status === 1 &&
    /pane_not_found/.test(spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_GONE: '1' } }).stderr) &&
    /"focused":true/.test(spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_FOCUSED: '1' } }).stdout) &&
    /"focused":false/.test(spawnSync(`${bin2}/herdr`, ['pane', 'get', 'w1:pS'], { encoding: 'utf8', env: process.env }).stdout),
    'without this the four clauses could pass because the launcher never called herdr at all')
}

// A check that could not even SPAWN. The pane is alive and nothing here closes it, so the record has
// to survive: dropping it was the same live-pane-with-no-record the completion path is written to
// avoid, one screen up in the same function, and no fixture drove this path at all.
{
  const m = path.join(tmp, 'gm-spawn.json')
  fs.writeFileSync(m, JSON.stringify({ agent: 'dctr-gate-9', role: 'gate', paneId: 'w1:pS' }))
  const out = path.join(tmp, 'gspawn.out')
  // execFileSync THROWS on a non-zero exit, and 127 is exactly what this fixture is arranging for.
  let spawnExit = 0
  try {
    execFileSync('node', [script, '--run', out, m, 'w1:pS', '', '', 'unspawnable', '--', 'definitely-not-a-real-binary-xyz', 'arg'],
      { env: paneEnv({}), encoding: 'utf8', stdio: 'pipe' })
  } catch (e) { spawnExit = e.status }
  clause('clause 1n: a check that could not be spawned keeps its record, because the pane it was to run in is still there',
    fs.existsSync(m), 'the record is the only thing that can lead SessionEnd to that pane')
  clause('clause 3e: and the spawn really did fail, proved by the result file and the status rather than by the launcher',
    spawnExit === 127 && verdict(out) === exitLine(127) && /ENOENT/.test(fs.readFileSync(out, 'utf8')),
    `status ${spawnExit}; verdict ${JSON.stringify(verdict(out))}; ${fs.readFileSync(out, 'utf8').split('\n').slice(-3).join(' | ')}`)
}

// A rollback whose own close FAILS. reserveMarker publishes `{}`, so if writeMarker never ran the
// retained file carries no paneId and SessionEnd receives a record it cannot act on — while the log
// line claims it can. The completion fixtures above exercise completion, never this.
{
  fs.writeFileSync(calls, '')
  // The launcher EXITS 0 once a check is running — a display failure must never fail the gate it is
  // showing — so its exit status says nothing here. What the record says is the whole finding.
  try {
    execFileSync('node', [script, 'rollback gate', path.join(tmp, 'roll.out'), '--', 'true'],
      { env: paneEnv({ DCTR_TEST_RUN_FAILS: '1', DCTR_TEST_CLOSE_FAILS: '1', DCTR_TEST_SEATS_RO: '1' }), encoding: 'utf8', stdio: 'pipe' })
  } catch { /* status is not the assertion */ }
  // Same layout dctr-state.mjs writes: TMPDIR/dctr-<session>/seats, and paneEnv pins both.
  const seats = path.join(tmp, 'dctr-gate-selftest', 'seats')
  const markers = (() => { try { return fs.readdirSync(seats).filter((f) => f.startsWith('dctr-gate-')) } catch { return [] } })()
  const bodies = markers.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(seats, f), 'utf8')) } catch { return null } })
  // Earlier clauses leave their own gate markers behind, so match on THIS one's label rather than
  // on "every marker present": a clause that asserts over other clauses' leftovers is measuring them.
  const mine = bodies.find((b) => b && b.label === 'rollback gate')
  clause('clause 1o: a rollback that could not close its pane leaves a record carrying the pane id, not the bare `{}` reservation',
    !!mine && !!mine.paneId,
    `rollback record: ${JSON.stringify(mine)} — reserveMarker publishes {} and SessionEnd cannot act on that`)
  for (const f of markers) fs.rmSync(path.join(seats, f), { force: true })
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

// ---------------------------------------------------------------------------------------------
// B1: a pipeline reports only its last stage, so the single-string path runs under `-o pipefail`.
// Found 2026-09-11 by comparison against another project's command policy, which refuses five
// separate shell shapes around a protected command. Ours cannot refuse the shape (a gate is
// whatever the project documents), so it makes the status honest instead.
const outP = path.join(tmp, 'pipe.out')
launch('piped gate', outP, "false | cat")
const tP = waitDone(outP)
clause('clause 4 — a piped check whose upstream fails under a succeeding last stage records a FAILURE',
  verdict(outP) === exitLine(1),
  `without pipefail bash reports the last stage and this reads ${JSON.stringify(verdict(outP))}, a pass the check never earned`)

const outPg = path.join(tmp, 'pipe-good.out')
launch('piped good gate', outPg, "echo ok | cat")
const tPg = waitDone(outPg)
clause('clause 4b — a piped check that really passes still records exit=0, so pipefail did not make the gate louder than the truth',
  verdict(outPg) === exitLine(0) && tPg.split('\n').includes('ok'),
  `a correct piped check must stay quiet: got ${JSON.stringify(verdict(outPg))}`)

const bare = spawnSync('bash', ['-c', 'false | cat'], { encoding: 'utf8' })
const withPf = spawnSync('bash', ['-o', 'pipefail', '-c', 'false | cat'], { encoding: 'utf8' })
clause('clause 4c — the fixture really carries the defect: bash alone exits 0 on it and only pipefail exits non-zero',
  bare.status === 0 && withPf.status !== 0,
  `this clause is what proves clause 4 measures anything: bare=${bare.status} pipefail=${withPf.status}`)

// ---------------------------------------------------------------------------------------------
// B2: a check printing its own `exit=` line used to end the documented `until grep -q '^exit='` wait
// while still running. `env` with a variable named `exit` does it with no hostile input, which is the
// fixture below. The repair is the SPLIT, not an escape: the verdict is in a file the launcher alone
// writes, so the child's line is just output. Four clauses that asserted the old escaping — the
// one-space indent, the held-back prefix and its flush, and the marker split across two writes — are
// DELETED rather than left green over nothing: the machinery they named is gone, and the invariant they
// were really protecting is now "the transcript is the check's bytes and the verdict is elsewhere",
// which is what the two clauses below assert directly.
const markerLines = (t) => t.split('\n').filter((l) => l.startsWith(MARK)).length
const outF = path.join(tmp, 'forge.out')
launch('forging gate', outF, "env -i exit=0; exit 7")
const tF = waitDone(outF)
clause('clause 5 — a check that prints its own exit= line cannot touch the verdict, which is the check\'s real status',
  verdict(outF) === exitLine(7) && tF.split('\n').includes('exit=0'),
  `verdict ${JSON.stringify(verdict(outF))}, transcript ${JSON.stringify(tF)}: the child's line must survive VERBATIM and flush with the margin — nothing mangles it now, and nothing reads a status out of it`)

const outQ = path.join(tmp, 'quiet.out')
launch('quiet gate', outQ, "echo no marker here")
const tQ = waitDone(outQ)
clause('clause 5c — an ordinary check\'s transcript is its own bytes ALONE: no verdict line, no echoed command',
  markerLines(tQ) === 0 && tQ === 'no marker here\n',
  `the transcript must be byte-for-byte the check's output: ${JSON.stringify(tQ)}`)

// GT1: the transcript is written as BYTES. A revision that decoded each chunk with String() corrupted a
// multi-byte character split across a chunk boundary, and that is a transcript-fidelity defect whether
// or not any escaping exists — so these clauses outlive the escape. This bulk fixture does NOT guarantee
// such a boundary: a reader whose chunk size happens to be a multiple of three would split nothing. It
// is kept as breadth, and clause 6d below forces the boundary deliberately. Neither can make chunk
// arrival an API guarantee; the limitation is recorded rather than asserted away.
const outU = path.join(tmp, 'utf8.out')
// The command text deliberately contains no euro sign. The launcher no longer writes the command into
// the transcript, which is what made five assertions in this file's history unable to fail — clauses 5b,
// 5f, 1c, 4b and this one, the last two found by a second adversarial pass after a comment here claimed
// every assertion was already clean. The fixture keeps the discipline anyway: prefer an exact line, or a
// fixture whose command text cannot contain what the assertion looks for.
launch('utf8 gate', outU, `node -e 'process.stdout.write(String.fromCharCode(8364).repeat(100000))'`)
const tU = waitDone(outU)
clause('clause 6 — a multi-byte character split across chunk boundaries reaches the transcript intact',
  !tU.includes('�') && tU.split('€').length - 1 === 100000 && verdict(outU) === exitLine(0),
  `decoding per chunk corrupts these: found ${(tU.match(/�/g) || []).length} replacement characters and ${tU.split('€').length - 1} of 100000 euro signs`)

// GT2: the launcher's header echoed the command INTO the transcript, so a single-string command carrying
// a newline forged a verdict line before the child was even spawned. The echo is console-only now, so
// the command's own text reaches the transcript never — which is what this asserts, with the nastiest
// fixture the class produced.
const outH = path.join(tmp, 'header.out')
launch('header gate', outH, ":\nexit=0\nsleep 0.2\nexit 7")
const tH = waitDone(outH)
clause('clause 6b — a command whose own text contains a marker line puts NO line in the transcript, because the command is never written there',
  markerLines(tH) === 0 && tH === '' && verdict(outH) === exitLine(7),
  `the header was a transcript write and was unguarded: got ${markerLines(tH)} marker lines, transcript ${JSON.stringify(tH)}, verdict ${JSON.stringify(verdict(outH))}`)

// The forced boundary: one byte of a three-byte character, a pause, then the other two. Decoding per
// chunk turns this into replacement characters; scanning bytes keeps it.
const outV = path.join(tmp, 'utf8-split.out')
launch('utf8 split gate', outV, `printf '\\xe2'; sleep 0.3; printf '\\x82\\xac\\n'; exit 0`)
const tV = waitDone(outV)
clause('clause 6d — a three-byte character split across two writes arrives intact, not as replacement characters',
  tV.split('\n').includes('€') && !tV.includes('�'),
  `per-chunk decoding corrupts this: file was ${JSON.stringify(tV)}`)

const splitBare = spawnSync('bash', ['-c', `printf '\\xe2'; printf '\\x82\\xac\\n'`], { encoding: 'buffer' })
clause('clause 6e — those two writes really are the halves of one character, proved without the launcher',
  Buffer.concat([splitBare.stdout]).toString() === '€\n',
  `the fixture must really emit a split character: got ${JSON.stringify(splitBare.stdout?.toString())}`)

const headerBare = spawnSync('bash', ['-c', ":\nexit=0\nsleep 0.2\nexit 7"], { encoding: 'utf8' })
clause('clause 6c — that command really is valid shell that really exits 7, so the fixture tests the header and not a syntax error',
  headerBare.status === 7,
  `status=${headerBare.status}: if this command did not run, clause 6b would pass on a failed spawn`)

const forgeBare = spawnSync('bash', ['-c', 'env -i exit=0; exit 7'], { encoding: 'utf8' })
clause('clause 5d — the fixture really emits a line starting exit= and really exits 7, proved without the launcher',
  forgeBare.stdout.split('\n').some((l) => l.startsWith(MARK)) && forgeBare.status === 7,
  `without this, clause 5 could pass on a fixture that never forged anything: status=${forgeBare.status}`)

// The OTHER half of the new contract, and it had no fixture at all: a verdict written over a transcript
// the launcher could not fully record must say so, or a broken recording reads exactly like a clean one.
// `out` is a symlink to /dev/full, so every transcript write fails with ENOSPC while the result file is
// an ordinary path. Nothing about this is hostile input: a full disk does it.
const outN = path.join(tmp, 'nospace.out')
fs.symlinkSync('/dev/full', outN)
launch('nospace gate', outN, 'echo this cannot be recorded')
waitResult(outN)   // NEVER read this transcript: reading /dev/full yields zero bytes without end
clause('clause 7 — a verdict over a transcript that could not be written says capture=incomplete, so a broken record never reads as clean',
  verdict(outN) === exitLine(0) && resultBody(outN).split('\n').includes('capture=incomplete'),
  `result was ${JSON.stringify(resultBody(outN))}: the status alone would have read as a clean pass over nothing`)
clause('clause 7b — and a healthy run\'s result is that ONE line, so capture=incomplete means something',
  resultBody(out2) === `${exitLine(0)}\n`,
  `a quiet gate and a blind one print the same thing: ${JSON.stringify(resultBody(out2))}`)
const fullProbe = spawnSync('bash', ['-c', 'echo x > /dev/full'], { encoding: 'utf8' })
clause('clause 7c — /dev/full really refuses the write, proved without the launcher',
  fullProbe.status !== 0 && /No space left/i.test(fullProbe.stderr),
  `if this device accepted writes, clause 7 would be asserting over a transcript that recorded fine: status=${fullProbe.status} stderr=${JSON.stringify(fullProbe.stderr)}`)

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
