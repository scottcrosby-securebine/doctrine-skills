// Tamper test for dctr-pane.mjs. Three clauses, as this repo requires of every check:
//   1. break the thing and confirm the check trips
//   2. run it against a known-good artifact and confirm it stays quiet
//   3. prove the broken fixture really carries the defect, WITHOUT calling the check
// The third clause is the one the first two cannot do. A refusal that fired for the wrong reason —
// a missing binary, a typo in a path — prints exactly what a correct refusal prints.
//
// Needs only node and bash. A tripwire `herdr` is put on PATH so "refused without touching the
// device" is proved by counting invocations rather than assumed from an exit code.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { seatPlacement, SIDE_CAP, isSideSeat } from './dctr-lib.mjs'
import { acquireLock, breakIfOrphaned, breakStaleLock, interactivePanes, isPaneNotFound, liveSeatsPartial, panesDir, publishPid, releaseLock, reserveMarker, seatsDir, sideOccupants, writeMarker } from './dctr-state.mjs'
import { recorderLine, defaultTeeDir, markerDir, openDecision } from './dctr-pane.mjs'

// fileURLToPath, not `.pathname`, which percent-encodes: under a path containing a space the
// launcher's own isMain comparison failed and every subcommand became a silent exit-0 no-op.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const LAUNCHER = path.join(HERE, 'dctr-pane.mjs')
let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-pane-selftest-'))
const bin = path.join(tmp, 'bin')
const calls = path.join(tmp, 'herdr-calls')
fs.mkdirSync(bin)
// The tripwire records every invocation. It ANSWERS `pane process-info` with a live `script`
// recorder and succeeds on a send, because a tripwire that fails everything makes clause 2's "good
// write" die in the recorder guard and never reach `send-text` — the assertion then passes on a
// refusal, which is a check measuring nothing. `pane get` still fails, because the round-5 case
// below needs a lookup that cannot answer.
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(calls)}
case "$1 $2" in
  "pane process-info")
    [ -n "$DCTR_TEST_INJECT" ] && printf '%s' '---(more)---' >> "$DCTR_TEST_INJECT"
    echo '{"result":{"process_info":{"foreground_processes":[{"name":"script"}]}}}'; exit 0 ;;
  # TWO ways a lookup can fail, and they are not the same answer. Without DCTR_TEST_PANE_GONE this
  # is a transport failure: exit 1, no output, "I could not look". With it, this is herdr's real
  # reply for a pane that does not exist — exit 1 WITH a code — which is an answer meaning the
  # session is over. Reading the second as the first is what made a closed pane's transcript
  # impossible to reopen, so both fixtures ship and each has its own clause.
  "pane get")
    if [ -n "$DCTR_TEST_PANE_GONE" ]; then
      # STDERR, which is where the real herdr puts it. It landed on stdout while isPaneNotFound read
      # both, so the fixture agreed with the tool by accident: any narrowing to one stream would have
      # kept the suite green and broken against the real thing.
      echo '{"error":{"code":"pane_not_found","message":"pane not found"},"id":"cli:pane:get"}' >&2
    fi
    exit 1 ;;
  "pane layout") echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1"},{"pane_id":"w1:i0"},{"pane_id":"w1:i1"},{"pane_id":"w1:i2"},{"pane_id":"w1:i3"},{"pane_id":"w1:i4"},{"pane_id":"w1:i5"}]}}}'; exit 0 ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"w1:pNEW"}}}'; exit 0 ;;
  # Workspace-PREFIXED, as herdr really answers: tabCreateArgs passes --workspace, and both tab list
  # and pane get show ids carrying it. The unprefixed w9:root was excluded by the launcher's own
  # workspace filter, so the tab-marker sweep it was meant to reach never ran once.
  "tab create") echo '{"result":{"tab":{"tab_id":"w1:t7"},"root_pane":{"pane_id":"w1:p7"}}}'; exit 0 ;;
  *) echo '{"result":{}}'; exit 0 ;;
esac
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const herdrCalls = () => { try { return fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).length } catch { return 0 } }
const herdrSaw = (re) => { try { return re.test(fs.readFileSync(calls, 'utf8')) } catch { return false } }

const tee = path.join(tmp, 'session.log')
const statePath = `${tee}.state.json`
const writeTee = (s) => fs.writeFileSync(tee, s)
const writeState = (o) => fs.writeFileSync(statePath, JSON.stringify(o))
const goodState = (over = {}) => ({
  paneId: 'w1:p2', tee, label: 'test', owner: 'agent',
  cursor: fs.statSync(tee).size,
  profile: 'x'.repeat(120),
  ...over,
})

/** Run the launcher with the tripwire herdr on PATH. Returns {code, err}. */
function run(args, env = {}) {
  // CLAUDE_CODE_SESSION_ID is supplied HERE rather than inherited. Every interactive shell on a dev
  // host exports it and CI does not, so a suite that inherits it passes locally and fails on CI
  // against a correct artifact. A key set to undefined in `env` is deleted, which is how the
  // no-session-id clause reaches the refusal.
  const childEnv = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`,
    HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1',
    CLAUDE_CODE_SESSION_ID: 'selftest-session', ...env,
  }
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k]
  try {
    // Bounded for the same reason the teardown suite is: a launcher that blocks must fail this
    // suite rather than hang it, and everything downstream of it.
    const out = execFileSync('node', [LAUNCHER, ...args], { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv })
    return { code: 0, err: '', out: String(out || '') }
  } catch (e) { return { code: e.status ?? 1, err: String(e.stderr || ''), out: String(e.stdout || '') } }
}

console.log('clause 1 — break it, and the check must trip (and must not reach the device)')
{
  writeTee('banner\n')

  writeState(goodState({ profile: undefined }))
  let before = herdrCalls(); let r = run(['type', tee, 'uptime'])
  check('no profile refuses', r.code === 1 && /no platform profile/.test(r.err), r.err.trim())
  check('no profile calls herdr zero times', herdrCalls() === before)

  writeState(goodState({ cursor: '0' }))
  before = herdrCalls(); r = run(['type', tee, 'uptime'])
  check('non-numeric cursor refuses', r.code === 1 && /not a byte offset/.test(r.err), r.err.trim())
  check('non-numeric cursor calls herdr zero times', herdrCalls() === before)

  writeState(goodState({ cursor: 999999 }))
  before = herdrCalls(); r = run(['type', tee, 'uptime'])
  check('cursor past EOF refuses', r.code === 1 && /past the end/.test(r.err), r.err.trim())
  check('cursor past EOF calls herdr zero times', herdrCalls() === before)

  writeState(goodState({ cursor: 0 }))
  before = herdrCalls(); r = run(['type', tee, 'uptime'])
  check('unread output refuses', r.code === 1 && /unread output/.test(r.err), r.err.trim())
  check('unread output calls herdr zero times', herdrCalls() === before)

  writeState(goodState())
  before = herdrCalls(); r = run(['type', tee, 'show version\rdelete all'])
  check('carriage return refuses', r.code === 1 && /control characters/.test(r.err), r.err.trim())
  check('carriage return calls herdr zero times', herdrCalls() === before)

  writeState(goodState({ owner: 'user' }))
  before = herdrCalls(); r = run(['type', tee, 'uptime'])
  check("user's pane refuses", r.code === 1 && /the pane is the user's/.test(r.err), r.err.trim())
  check("user's pane calls herdr zero times", herdrCalls() === before)

  writeState(goodState())
  before = herdrCalls(); r = run(['type', tee, 'uptime'], { DCTR_VIEW_REQUEST_DIR: tmp })
  check('contained session refuses', r.code === 1 && /contained session/.test(r.err), r.err.trim())
  check('contained session calls herdr zero times', herdrCalls() === before)

  // The lock must be released on a refusal. process.exit skips `finally`; if die() ever goes back
  // to exiting, the second refusal below fails on a leaked lock instead of its own reason.
  writeState(goodState({ owner: 'user' }))
  r = run(['type', tee, 'uptime'])
  check('a refusal releases the tee lock', !fs.existsSync(`${tee}.lock`))
  const again = run(['type', tee, 'uptime'])
  check('a second refusal reports its own reason', /the pane is the user's/.test(again.err), again.err.trim())

  writeState(goodState({ profile: 'linux' }))
  r = run(['profile', tee, 'linux'])
  check('a one-word profile is refused', r.code === 1 && /is not one/.test(r.err), r.err.trim())
}

console.log('clause 2 — known good must stay quiet (and must reach the device)')
{
  writeTee('banner\n')
  writeState(goodState())
  const before = herdrCalls()
  fs.writeFileSync(calls, '')
  const r = run(['type', tee, 'uptime'])
  check('a valid session is not refused by a guard', !/(no platform profile|unread output|control characters|the pane is the user's|contained session|byte offset|past the end|recorder has exited|cannot read the pane)/.test(r.err), r.err.trim())
  check('a valid session does reach herdr', herdrCalls() > 0 || herdrCalls() > before)
  // The one that matters: the write reached the device. Asserting only "not refused" let this
  // clause pass while `type` died inside the recorder guard with a message the regex did not name,
  // so the suite never once proved a good write gets sent.
  check('a valid write actually reaches send-text', herdrSaw(/pane send-text/), 'no send-text recorded')

  const good = run(['profile', tee, 'Proxmox VE on Debian. Pager: systemctl and journalctl use less; suppress with --no-pager. Cancel: Ctrl-C, user presses it. Destructive: qm destroy, rm -rf.'])
  check('a substantive profile is accepted', good.code === 0, good.err.trim())
}

console.log('the three subcommands nothing drove — enter, own and read')
{
  // Each of these is a stated invariant of this launcher, and every one could be reverted with all
  // five suites green. `type` was driven; `enter` — the call that actually EXECUTES on a device —
  // `own` and `read` were driven by nothing at all.

  // THE TWO-STEP WRITE, which is a settled ruling and not a style. `type` sends text and stops so the
  // agent can judge the echo before anything runs. An implicit Enter here would execute an unjudged
  // line on a live router while this launcher's own stdout still printed `ENTER NOT SENT`. That exact
  // mutation passed every hook suite AND the mutation gate before this clause existed.
  writeTee('banner\n'); writeState(goodState()); fs.writeFileSync(calls, '')
  const t = run(['type', tee, 'uptime'])
  check('type reaches send-text', herdrSaw(/pane send-text/), t.err.trim())
  check('type does NOT press Enter', !herdrSaw(/send-keys/), fs.readFileSync(calls, 'utf8').trim())

  // `enter` presses the key, and presses the key herdr actually accepts — confirmed by asking the
  // tool, which answers `pane send-keys <PANE_ID> <KEY>...` and takes `enter`.
  writeTee('banner\n'); writeState(goodState()); fs.writeFileSync(calls, '')
  const e = run(['enter', tee])
  check('enter presses Enter, by that key name', herdrSaw(/pane send-keys w1:p2 enter/),
    fs.readFileSync(calls, 'utf8').trim() || e.err.trim())

  // Q3 and the containment ruling, proved for the subcommand that executes on a device rather than
  // only for the one that types. A contained agent must reach nothing on the host.
  writeTee('banner\n'); writeState(goodState()); fs.writeFileSync(calls, '')
  const contained = run(['enter', tee], { DCTR_VIEW_REQUEST_DIR: tmp })
  check('enter refuses in a contained session', contained.code !== 0, contained.err.trim())
  check('and a contained enter reaches herdr zero times', !herdrSaw(/send-keys/),
    fs.readFileSync(calls, 'utf8').trim())

  // `own` must NOT advance the cursor. Everything the user did while holding the pane stays unread,
  // so the first `type` after a handover refuses until it has been read. The launcher header states
  // this and SKILL.md's Ownership section repeats it; it is the only mechanism that shows the agent
  // what the user actually did.
  writeTee('banner\n'); writeState(goodState({ owner: 'user' }))
  fs.appendFileSync(tee, 'the user typed this while holding the pane\n')
  const cursorBefore = JSON.parse(fs.readFileSync(statePath, 'utf8')).cursor
  const o = run(['own', tee, 'agent'])
  const afterOwn = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  check('own takes ownership', afterOwn.owner === 'agent', o.err.trim())
  check('own does NOT advance the cursor', afterOwn.cursor === cursorBefore, `${cursorBefore} -> ${afterOwn.cursor}`)
  const blocked = run(['type', tee, 'uptime'])
  check('so the first type after a handover refuses on the unread bytes', blocked.code !== 0, blocked.err.trim())

  // `read` advances the cursor to the SAME end it showed.
  const end = fs.statSync(tee).size
  const rd = run(['read', tee])
  const afterRead = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  check('read advances the cursor to the end it showed', afterRead.cursor === end, `${afterRead.cursor} vs ${end}`)
  check('and shows the bytes the user left', /the user typed this/.test(rd.out), rd.out.trim())
}

console.log('the unread window — output arriving DURING the recorder lookup must stop the write')
{
  // The guard reads the file end, then spawns herdr to check the recorder, which takes real time.
  // An earlier repair made bytes arriving in that window appear in the readback afterwards and left
  // the write itself unblocked: the pager case, sent over output nobody had judged. The tripwire
  // appends to the tee while answering the lookup, which is exactly that window.
  writeTee('banner\n')
  writeState(goodState())
  fs.writeFileSync(calls, '')
  const r = run(['type', tee, 'uptime'], { DCTR_TEST_INJECT: tee })
  check('bytes arriving during the lookup refuse the write', r.code === 1 && /arrived while checking the session/.test(r.err), r.err.trim())
  check('and nothing was sent', !herdrSaw(/pane send-text/))
  // Clause 3: prove the fixture really injects, without the guard. Run the same lookup by hand.
  const sizeBefore = fs.statSync(tee).size
  execFileSync(path.join(bin, 'herdr'), ['pane', 'process-info', '--pane', 'w1:p2'], { env: { ...process.env, DCTR_TEST_INJECT: tee }, stdio: 'ignore' })
  check('the fixture really grows the tee during the lookup', fs.statSync(tee).size > sizeBefore, `${sizeBefore} -> ${fs.statSync(tee).size}`)
}

console.log('clause 3 — the fixtures really carry their defects, proved without the checker')
{
  writeState(goodState({ cursor: '0' }))
  const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  check('the bad-cursor fixture really holds a string', typeof raw.cursor === 'string')

  writeTee('banner\nmore output\n')
  writeState(goodState({ cursor: 0 }))
  const st = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  check('the unread fixture really has bytes past the cursor', fs.statSync(tee).size > st.cursor)

  check('the CR fixture really contains a carriage return', 'show version\rdelete all'.includes('\r'))
  check('the one-word profile fixture really is short', 'linux'.length < 80)
}

console.log('platform branch — both script(1) invocations, so the macOS shape is checked without a Mac')
{
  const lin = recorderLine('/t/x.log', 'ssh h', 'linux')
  const mac = recorderLine('/t/x.log', 'ssh h', 'darwin')
  // util-linux takes the command via -c with the file LAST; Apple's script has no -c at all and
  // takes the file FIRST with the command positional (shell_cmds script.1). A branch that swapped
  // only the flags would build a broken command line on macOS, which is the mistake this catches.
  check('linux: -c with the file last', /^script -q -f -c '.*' '\/t\/x\.log'$/.test(lin), lin)
  // `bash -c` legitimately carries a -c; what must not is script's OWN argument list, which ends at
  // the file. Asserting on the whole string failed here for that reason, which is the check firing
  // on a correct artifact — the thing clause 2 exists to catch.
  check('darwin: file first, and script itself takes no -c',
    mac.startsWith("script -q -F '/t/x.log' ") && !mac.slice(0, mac.indexOf("'/t/x.log'")).includes('-c'), mac)
  check('neither branch enables input logging', !/ -k| -I| -B/.test(lin + mac), lin + ' | ' + mac)
}

console.log('cap counting — an interactive pane occupies a column slot')
{
  const seats = Array.from({ length: SIDE_CAP - 1 }, (_, i) => ({ agent: `dctr-x-${i}`, paneId: `w1:s${i}` }))
  const pane = { paneId: 'w1:pX', tee, label: 'router' }
  check('an interactive pane satisfies isSideSeat', isSideSeat(pane))
  check(`${SIDE_CAP - 1} seats alone still place as a pane`, seatPlacement(seats, 'w1:p1') === 'pane')
  check('the same seats plus one interactive pane spill to a tab', seatPlacement(seats.concat(pane), 'w1:p1') === 'tab')
  check('interactivePanes returns an array', Array.isArray(interactivePanes()))
}

console.log('round-5 repairs — each was a live defect, so each gets a clause')
{
  // F4: a `pane get` that THROWS means "I could not look", never "the pane is gone". The tripwire
  // herdr exits non-zero on every call, so this reproduces exactly that failure. Before the repair
  // the launcher swallowed it, concluded the pane was gone, and truncated a live transcript.
  writeTee('a live session transcript that must survive\n')
  const beforeBytes = fs.statSync(tee).size
  fs.writeFileSync(statePath, JSON.stringify({ paneId: 'w1:pPRIOR', tee, label: 'prior', owner: 'user', cursor: 0 }))
  const r = run(['open', 'prior', tee, 'ssh host'])
  check('a failed pane lookup refuses instead of truncating', r.code === 1 && /could not be looked up/.test(r.err), r.err.trim())
  // Clause 3 for this case: prove the transcript is intact WITHOUT trusting the refusal message.
  check('the transcript still holds its bytes', fs.statSync(tee).size === beforeBytes, `${fs.statSync(tee).size} vs ${beforeBytes}`)

  // F2: `open` never applied the shared cap, so a seventh pane split however full the column was.
  // Past the cap it now overflows to a tab rather than refusing (Scott's ruling), which is the same
  // branch this predicate selects for a seat.
  const full = Array.from({ length: SIDE_CAP }, (_, i) => ({ paneId: `w1:i${i}` }))
  check(`${SIDE_CAP} interactive panes send the next session to a tab`, seatPlacement(full, 'w1:p1') === 'tab')
  check(`${SIDE_CAP - 1} interactive panes still take a pane`, seatPlacement(full.slice(1), 'w1:p1') === 'pane')
  // A tab session must not then count against the column it is not in: isSideSeat is what decides,
  // and a marker carrying a tabId is not a side seat however its pane id looks.
  check('a tab session does not occupy a column slot', !isSideSeat({ paneId: 'w9:root', tabId: 'tab1', tee: '/t/x.log' }))

  // The steal decision itself, exercised through the function production actually calls. These used
  // to run against holderAlive, which by then had no production caller at all: the clauses passed
  // while the real guard in breakIfOrphaned had none. Each case below goes red if its repair is
  // reverted, which is the property the previous version of this block did not have.
  const STALE = 1000
  const lk = path.join(tmp, 'lock-probe.lock')
  const age = () => { const t = new Date(Date.now() - STALE * 10) ; fs.utimesSync(lk, t, t) }
  const fresh = (pid) => {
    fs.rmSync(lk, { recursive: true, force: true }); fs.mkdirSync(lk)
    if (pid !== null) fs.writeFileSync(path.join(lk, 'pid'), pid)
  }

  // A pid-less lock, NOT aged: only the age guard can save it. With a live pid this clause passed
  // whether the age guard existed or not, so deleting that guard left the whole suite green.
  fresh(null)
  check('a lock inside its window is not examined at all', breakIfOrphaned(lk, STALE) === false && fs.existsSync(lk))

  fresh(String(process.pid)); age()
  check('an aged lock whose holder is running survives', breakIfOrphaned(lk, STALE) === false && fs.existsSync(lk))

  fresh('2147483646'); age()
  check('an aged lock whose holder is gone is broken', breakIfOrphaned(lk, STALE) === true && !fs.existsSync(lk))

  fresh(null); age()
  check('an aged lock with no pid at all is an orphan and is broken', breakIfOrphaned(lk, STALE) === true && !fs.existsSync(lk))

  // A pid-less lock aged past the ORDINARY window is not yet an orphan. The previous revision of
  // this file published no pid at all, so a live holder in a consuming session that has not
  // restarted looks exactly like a crashed one — and it was being condemned at 10s against a 30s
  // herdr timeout, a third of the time a legitimate section can take. Both halves are asserted: the
  // pid-less lock survives, AND a dead pid'd holder at the SAME age is still broken. Without the
  // second half this clause would also pass if the window had simply been made long for everyone.
  const mid = new Date(Date.now() - STALE * 3)
  fresh(null); fs.utimesSync(lk, mid, mid)
  check('a pid-less lock is given the longer window', breakIfOrphaned(lk, STALE) === false && fs.existsSync(lk))
  fresh('2147483646'); fs.utimesSync(lk, mid, mid)
  check('while a dead pid at the same age is still broken', breakIfOrphaned(lk, STALE) === true && !fs.existsSync(lk))

  // The distinction the whole three-valued lockPid exists for. Revert it — make an unreadable pid
  // read as dead — and this clause goes red while every other one stays green.
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    console.log('  skip unreadable-pid clause: running as root, which ignores file modes')
  } else {
    fresh('2147483646'); fs.chmodSync(path.join(lk, 'pid'), 0o000); age()
    check('an aged lock whose pid cannot be READ survives, because that is an observation that failed',
      breakIfOrphaned(lk, STALE) === false && fs.existsSync(lk))
    // Clause 3: prove the fixture really is unreadable, without breakIfOrphaned.
    let unreadable = false
    try { fs.readFileSync(path.join(lk, 'pid'), 'utf8') } catch { unreadable = true }
    check('the unreadable-pid fixture really cannot be read', unreadable)
    fs.chmodSync(path.join(lk, 'pid'), 0o600)
  }
  fs.rmSync(lk, { recursive: true, force: true })

  // Publication is exclusive. Revert `wx` to a plain write and this goes red: it is the property
  // that stops a stalled acquirer from publishing into a replacement holder's directory.
  const pub = path.join(tmp, 'publish.lock')
  fs.rmSync(pub, { recursive: true, force: true }); fs.mkdirSync(pub)
  publishPid(pub, '123')
  let second = false
  try { publishPid(pub, '456') } catch { second = true }
  check('publishing into a directory that already carries a pid fails', second)
  check('and the first pid is untouched', fs.readFileSync(path.join(pub, 'pid'), 'utf8') === '123')
  fs.rmSync(pub, { recursive: true, force: true })

  // The steal is a rename, not a check followed by a delete. Exactly one waiter can win it, so a
  // second waiter cannot delete the lock a first has already replaced and is holding.
  const race = path.join(tmp, 'race.lock')
  fs.mkdirSync(race)
  check('the first breaker wins the rename', breakStaleLock(race))
  check('a second breaker finds nothing to take', !breakStaleLock(race))
  check('the broken lock is really gone', !fs.existsSync(race))
  check('no .dead leftovers remain', !fs.readdirSync(tmp).some((f) => f.includes('.dead.')))
}

console.log('round-7 repairs — the previous round\'s fixes each carried a defect of their own')
{
  // F1: a transcript's `<tee>.state.json` sitting in the marker directory was read as a second
  // pane, so every pane counted twice and the cap tripped at three. Proved on the reader itself.
  // Asserted BEFORE TMPDIR is moved below: the launcher binds its marker directory at import and
  // the hooks compute theirs per call, and they used to be two different expressions for one path.
  check('the launcher and the shared reader resolve the same marker directory', markerDir() === panesDir(), `${markerDir()} vs ${panesDir()}`)
  check('the default tee is not in the marker directory', !defaultTeeDir().startsWith(markerDir()), `${defaultTeeDir()} vs ${markerDir()}`)

  // Run the PRODUCTION reader, not a copy of its filter. The previous version of this case applied
  // its own `endsWith` to fixtures and called neither reader, so deleting the filter from shipping
  // code left it green — a check that measures nothing prints what a passing check prints.
  const oldTmp = process.env.TMPDIR
  process.env.TMPDIR = tmp
  const md = panesDir()
  fs.mkdirSync(md, { recursive: true })
  fs.writeFileSync(path.join(md, 'w1_p1.json'), JSON.stringify({ paneId: 'w1:p1', pid: 1 }))
  fs.writeFileSync(path.join(md, 'router.log.state.json'), JSON.stringify({ paneId: 'w1:p1', owner: 'user', cursor: 0 }))
  const read = interactivePanes()
  check('the production reader counts one pane, not two', read.length === 1, JSON.stringify(read))
  // Clause 3: prove the fixture really carries the defect, without the reader under test.
  const unfiltered = fs.readdirSync(md).filter((f) => f.endsWith('.json'))
  check('and the unfiltered read really does double-count it', unfiltered.length === 2, unfiltered.join(','))
  // An unreadable marker directory must not read as an empty column.
  fs.rmSync(md, { recursive: true, force: true })
  check('a missing marker directory is zero panes, not an error', interactivePanes().length === 0)
  fs.writeFileSync(md, 'not a directory')
  let threw = false
  try { interactivePanes() } catch { threw = true }
  check('a marker directory that cannot be read throws rather than reporting zero', threw)
  fs.rmSync(md, { force: true })
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp
}

console.log('the lock protocol — acquire, release, and break only what is provably orphaned')
{
  // A holder that cannot publish its pid must NOT enter: to every waiter it is indistinguishable
  // from an orphan, and past the staleness window it gets stolen from while it is still running.
  // The fixture is a umask that makes the directory acquireLock itself creates unwritable, so the
  // failure happens on the very lock under test. An earlier version of this clause broke one lock,
  // called acquireLock on a DIFFERENT healthy one, and asserted nothing — removing the production
  // guard left it green, which is the whole failure mode this file exists to catch.
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    console.log('  skip publication-failure clause: running as root, which ignores directory modes')
  } else {
    const noWrite = path.join(tmp, 'unpublishable.lock')
    fs.rmSync(noWrite, { recursive: true, force: true })
    const oldUmask = process.umask(0o777)
    let refused = false
    try { acquireLock(noWrite) } catch { refused = true }
    process.umask(oldUmask)
    check('a lock whose pid cannot be published refuses to enter', refused)
    // Clause 3: prove the fixture really makes publication impossible, without calling acquireLock.
    const probe = path.join(tmp, 'probe.lock')
    fs.rmSync(probe, { recursive: true, force: true })
    process.umask(0o777)
    fs.mkdirSync(probe)
    process.umask(oldUmask)
    let writeFails = false
    try { fs.writeFileSync(path.join(probe, 'pid'), '1') } catch { writeFails = true }
    check('the fixture really makes the pid write fail', writeFails)
    for (const d of [noWrite, probe]) { try { fs.chmodSync(d, 0o700) } catch { /* already gone */ } ; fs.rmSync(d, { recursive: true, force: true }) }
  }

  const own = path.join(tmp, 'own.lock')
  fs.rmSync(own, { recursive: true, force: true })
  check('acquireLock takes a free lock', acquireLock(own) === true)
  check('acquireLock refuses one already held', acquireLock(own) === false)
  check('the holder publishes a readable pid', fs.readFileSync(path.join(own, 'pid'), 'utf8').trim() === String(process.pid))
  check('releaseLock removes what is ours', releaseLock(own) === true && !fs.existsSync(own))

  // A lock we no longer hold is someone else's. Removing it by pathname would take their section.
  fs.mkdirSync(own, { recursive: true })
  fs.writeFileSync(path.join(own, 'pid'), '2147483646')
  check('releaseLock will not remove another holder\'s lock', releaseLock(own) === false && fs.existsSync(own))
  fs.rmSync(own, { recursive: true, force: true })

  // The break is verified against the pid it condemned, so a replacement holder is not carried off.
  const rep = path.join(tmp, 'replacement.lock')
  fs.mkdirSync(rep, { recursive: true })
  fs.writeFileSync(path.join(rep, 'pid'), '999999')
  check('a lock whose pid is not the condemned one is put back', breakStaleLock(rep, '111111') === false)
  // Condemning a pid-less orphan must still verify. The bypass this replaces skipped the comparison
  // whenever the condemned pid was null, so breaking an orphan carried off whatever had replaced it.
  check('a lock that acquired a pid since being condemned as pid-less is put back',
    breakStaleLock(rep, null) === false && fs.existsSync(rep))
  check('and it is still there afterwards', fs.existsSync(rep))
  check('the same lock IS broken when the pid matches', breakStaleLock(rep, '999999') === true)
  check('and it is really gone', !fs.existsSync(rep))
  check('no .dead leftovers remain from the protocol clauses', !fs.readdirSync(tmp).some((f) => f.includes('.dead.')))
}

console.log('sideOccupants — the column count every placement decision now runs through')
{
  const oldTmp = process.env.TMPDIR
  process.env.TMPDIR = tmp
  const md = panesDir()
  fs.rmSync(md, { recursive: true, force: true })
  fs.mkdirSync(md, { recursive: true })
  fs.writeFileSync(path.join(md, 'w1_pIN.json'), JSON.stringify({ paneId: 'w1:pIN' }))
  fs.writeFileSync(path.join(md, 'w1_pOUT.json'), JSON.stringify({ paneId: 'w1:pOUT' }))
  const layout = [{ pane_id: 'w1:p1' }, { pane_id: 'w1:pIN' }, { pane_id: 'w1:sIN' }]

  check('a layout it could not read counts as unknown, never as an empty column',
    sideOccupants([], null) === null)

  // The tab seat carries a paneId, because that is what dctr-seat.mjs and dctr-gate.mjs actually
  // write: `paneId = tab.result.root_pane.pane_id`. The previous fixture omitted it, so it certified
  // a shape no code in this repo produces.
  const seats = [{ agent: 'a', paneId: 'w1:sIN' }, { agent: 'b', paneId: 'w1:sGONE' }, { agent: 'c', tabId: 't1', paneId: 'w9:root' }]
  const occ = sideOccupants(seats, layout)
  check('a pane the layout carries is counted', occ.some((o) => o.paneId === 'w1:pIN'))
  check('a pane the layout does not carry is not', !occ.some((o) => o.paneId === 'w1:pOUT'))
  check('a seat the layout carries is counted', occ.some((o) => o.paneId === 'w1:sIN'))
  check('a STALE seat is not — seats are narrowed too, which the docstring claimed and the code did not do',
    !occ.some((o) => o.paneId === 'w1:sGONE'))
  check('a tab seat is narrowed out like any pane the layout does not carry', !occ.some((o) => o.tabId === 't1'))
  check('a marker with no paneId at all is kept', sideOccupants([{ agent: 'reserved' }], layout).some((o) => o.agent === 'reserved'))

  // An unreadable marker must make the count unknown. Dropping it silently is how six panes counted
  // as five and a seventh was split onto a full column.
  fs.writeFileSync(path.join(md, 'w1_pBAD.json'), 'not json at all')
  check('an unparseable marker makes the column unknown, not smaller', sideOccupants([], layout) === null)
  // Clause 3: prove the fixture really is unparseable, without the reader under test.
  let parseFails = false
  try { JSON.parse(fs.readFileSync(path.join(md, 'w1_pBAD.json'), 'utf8')) } catch { parseFails = true }
  check('the bad-marker fixture really does not parse', parseFails)

  fs.rmSync(md, { recursive: true, force: true })
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp
}

console.log('the session id — the cap is counted against it, so its absence must refuse')
{
  writeTee('banner\n')
  writeState(goodState())
  fs.writeFileSync(calls, '')
  const r = run(['open', 'nosession', path.join(tmp, 'nosession.log'), 'true'], { CLAUDE_CODE_SESSION_ID: undefined })
  check('no session id refuses', r.code === 1 && /no CLAUDE_CODE_SESSION_ID/.test(r.err), r.err.trim())
  check('no session id calls herdr zero times', herdrCalls() === 0)
  // The alias was removed so the launcher and the gate cannot lock two different sessions. Re-adding
  // it would leave every clause above green, so it gets one of its own.
  const alias = run(['open', 'aliased', path.join(tmp, 'aliased.log'), 'true'], { CLAUDE_CODE_SESSION_ID: undefined, DCTR_SESSION_ID: 'x' })
  check('DCTR_SESSION_ID is not accepted in its place', alias.code === 1 && /no CLAUDE_CODE_SESSION_ID/.test(alias.err), alias.err.trim())
  // Clause 3: prove the fixture really removes the variable, without running the launcher.
  const seen = execFileSync('node', ['-e', 'process.stdout.write(String(process.env.CLAUDE_CODE_SESSION_ID))'],
    { encoding: 'utf8', env: (() => { const e = { ...process.env }; delete e.CLAUDE_CODE_SESSION_ID; return e })() })
  check('the fixture really unsets it', seen === 'undefined', seen)
}

console.log('a pane herdr reports as gone is GONE — the lifecycle the user actually follows')
{
  const oldTmp = process.env.TMPDIR
  process.env.TMPDIR = tmp
  // NOT wiped: production `open` writes a marker, and wiping the directory here meant the marker
  // path this block exists to pin was never taken. A marker naming this tee is planted instead.
  fs.mkdirSync(panesDir(), { recursive: true })
  fs.writeFileSync(path.join(panesDir(), 'w1_pOLD.json'), JSON.stringify({ paneId: 'w1:pOLD', tee: path.join(tmp, 'reopen.log'), label: 'reopen' }))
  const t = path.join(tmp, 'reopen.log')
  fs.writeFileSync(t, 'a transcript from a session the user has finished with\n')
  fs.writeFileSync(`${t}.state.json`, JSON.stringify({ paneId: 'w1:pOLD', tee: t, label: 'reopen', owner: 'user', cursor: 0 }))

  // The user closed the pane, which SKILL.md tells them to do. herdr answers pane_not_found.
  const reopened = run(['open', 'reopen', t, 'true'], { DCTR_TEST_PANE_GONE: '1' })
  check('a transcript whose pane the user closed can be reopened',
    reopened.code === 0 && /pane=w1:pNEW/.test(reopened.out), `${reopened.err.trim()} ${reopened.out.trim()}`)

  // The other half must keep working: a lookup that genuinely could not answer still refuses.
  fs.writeFileSync(t, 'a transcript from a session that may still be running\n')
  fs.writeFileSync(`${t}.state.json`, JSON.stringify({ paneId: 'w1:pOLD', tee: t, label: 'reopen', owner: 'user', cursor: 0 }))
  const before = fs.statSync(t).size
  const opaque = run(['open', 'reopen', t, 'true'])
  check('a lookup that could not answer still refuses', opaque.code === 1 && /could not be looked up/.test(opaque.err), opaque.err.trim())
  check('and that transcript still holds its bytes', fs.statSync(t).size === before)

  // Clause 3: prove the two fixtures really differ, without the launcher.
  // `2>&1 1>/dev/null` keeps ONLY stderr, so this proves the stream as well as the payload. The
  // fixture used to answer on stdout while the real tool answers on stderr, and the two agreed only
  // because isPaneNotFound read both — so a narrowing to one stream would have stayed green here.
  const errOnly = (gone) => execFileSync('bash', ['-c', `${bin}/herdr pane get x 2>&1 1>/dev/null || true`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_PANE_GONE: gone } })
  check('the gone fixture really carries a pane_not_found code, on stderr', /pane_not_found/.test(errOnly('1')), errOnly('1').trim())
  check('the opaque fixture really carries no code at all', !/pane_not_found/.test(errOnly('')), errOnly('').trim())

  fs.rmSync(panesDir(), { recursive: true, force: true })
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp
}

console.log('the overflow ruling, driven through open rather than asserted around it')
{
  const oldTmp = process.env.TMPDIR
  process.env.TMPDIR = tmp
  const md = panesDir()
  fs.rmSync(md, { recursive: true, force: true }); fs.mkdirSync(md, { recursive: true })

  // Under the cap: a pane.
  const CWD_RE = process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const t1 = path.join(tmp, 'underCap.log')
  fs.rmSync(`${t1}.state.json`, { force: true }); fs.rmSync(t1, { force: true })
  fs.writeFileSync(calls, '')
  const pane = run(['open', 'underCap', t1, 'true'])
  check('under the cap, open splits a pane', pane.code === 0 && /pane=w1:pNEW/.test(pane.out) && !/overflow=tab/.test(pane.out), pane.out.trim() || pane.err.trim())
  // The pane shell starts where herdr is told to, and the launcher runs in the session's cwd.
  check('and the split carries the launcher cwd', herdrSaw(new RegExp(`^pane split .* --cwd ${CWD_RE}( |$)`, 'm')), fs.readFileSync(calls, 'utf8').trim())

  // Fill the column: six markers for panes the layout carries.
  fs.rmSync(md, { recursive: true, force: true }); fs.mkdirSync(md, { recursive: true })
  for (let i = 0; i < SIDE_CAP; i += 1) fs.writeFileSync(path.join(md, `w1_i${i}.json`), JSON.stringify({ paneId: `w1:i${i}`, tee: `/t/i${i}.log`, label: `i${i}` }))
  const t2 = path.join(tmp, 'overflow.log')
  fs.rmSync(`${t2}.state.json`, { force: true }); fs.rmSync(t2, { force: true })
  fs.writeFileSync(calls, '')
  const tab = run(['open', 'router7', t2, 'true'])
  check('past the cap, open creates a tab instead of refusing', tab.code === 0 && /overflow=tab w1:t7/.test(tab.out), tab.out.trim() || tab.err.trim())
  check('and the tab create carries the launcher cwd', herdrSaw(new RegExp(`^tab create .* --cwd ${CWD_RE}( |$)`, 'm')), fs.readFileSync(calls, 'utf8').trim())

  // The property that keeps the ruling honest: a tab session takes no column slot. Read from the
  // marker open actually wrote, not from a literal.
  const written = JSON.parse(fs.readFileSync(path.join(md, 'w1_p7.json'), 'utf8'))
  check('the overflow marker records its tab id', written.tabId === 'w1:t7', JSON.stringify(written))
  check('and therefore occupies no column slot', !isSideSeat(written))
  // Clause 3: prove the fixture really filled the column, without open.
  check('the fixture really put the column at the cap',
    fs.readdirSync(md).filter((f) => /^w1_i\d\.json$/.test(f)).length === SIDE_CAP)

  // The sweep that removes a CLOSED overflow tab's marker. It had never executed in any run: its
  // fixture used an id from another workspace, so the launcher's workspace filter excluded it every
  // time and the branch was dead. The tab's pane now answers pane_not_found, so the sweep must take
  // it — a tab marker is not a side seat, and nothing but this branch ever offers one.
  // A tab marker with an id the tripwire will NOT hand back. Asserting on the marker the previous
  // open wrote could not tell "swept" from "swept and then written again by the new tab", because
  // the fixture answers with one constant pane id — the assertion would have passed either way.
  fs.writeFileSync(path.join(md, 'w1_pTAB.json'), JSON.stringify({ paneId: 'w1:pTAB', tabId: 'w1:tOLD', tee: '/t/closed-tab.log', label: 'closed' }))
  check('the closed tab\'s marker exists before the sweep', fs.existsSync(path.join(md, 'w1_pTAB.json')))
  const t3 = path.join(tmp, 'after-tab-closed.log')
  fs.rmSync(`${t3}.state.json`, { force: true }); fs.rmSync(t3, { force: true })
  run(['open', 'later', t3, 'true'], { DCTR_TEST_PANE_GONE: '1' })
  check('a closed overflow tab\'s marker is swept', !fs.existsSync(path.join(md, 'w1_pTAB.json')),
    fs.readdirSync(md).join(','))
  // Clause 3: prove the six side markers were NOT swept, so this measured the tab branch and not a
  // sweep of everything.
  check('and the side markers the layout still carries are untouched',
    fs.readdirSync(md).filter((f) => /^w1_i\d\.json$/.test(f)).length === SIDE_CAP)

  fs.rmSync(md, { recursive: true, force: true })
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp
}

console.log('the decision table — every cell, driven, with herdr injected')
{
  // The whole of "may this transcript be replaced?", enumerated. Each row is a cell of the table in
  // the run record. Before this existed the prologue was a chain of predicates nobody had written
  // down, and each round found the next cell by accident.
  const ask = (m) => (id) => m[id] ?? 'unknowable'
  const cell = (name, input, want) => {
    const got = openDecision(input)
    check(name, got.proceed === want.proceed && (want.stale === undefined || JSON.stringify(got.stale) === JSON.stringify(want.stale)),
      `${JSON.stringify(got)} vs ${JSON.stringify(want)}`)
  }

  cell('state file records a LIVE pane -> refuse',
    { stateRecord: { paneId: 'P' }, markerPanes: [], teeBytes: 10, ask: ask({ P: 'live' }) }, { proceed: false })
  cell('state file records a GONE pane -> proceed, and that record is stale',
    { stateRecord: { paneId: 'P' }, markerPanes: [], teeBytes: 10, ask: ask({ P: 'gone' }) }, { proceed: true, stale: ['P'] })
  cell('state file records an UNKNOWABLE pane -> refuse',
    { stateRecord: { paneId: 'P' }, markerPanes: [], teeBytes: 10, ask: ask({ P: 'unknowable' }) }, { proceed: false })
  cell('an invalid state file -> refuse',
    { stateRecord: 'invalid', markerPanes: [], teeBytes: 0, ask: ask({}) }, { proceed: false })
  cell('a marker names a LIVE pane -> refuse',
    { stateRecord: null, markerPanes: ['M'], teeBytes: 10, ask: ask({ M: 'live' }) }, { proceed: false })
  cell('a marker names an UNKNOWABLE pane -> refuse',
    { stateRecord: null, markerPanes: ['M'], teeBytes: 10, ask: ask({ M: 'unknowable' }) }, { proceed: false })
  // THE ROUND-12 DEFECT. A record that answered "gone" is still a record: this used to fall through
  // to "nothing records which pane wrote it" and refuse, after deleting the marker that said so.
  cell('a marker names a GONE pane, transcript non-empty -> proceed, marker stale',
    { stateRecord: null, markerPanes: ['M'], teeBytes: 10, ask: ask({ M: 'gone' }) }, { proceed: true, stale: ['M'] })
  cell('several markers, one still live -> refuse',
    { stateRecord: null, markerPanes: ['M1', 'M2'], teeBytes: 10, ask: ask({ M1: 'gone', M2: 'live' }) }, { proceed: false })
  cell('records disagree, the strictest answer wins',
    { stateRecord: { paneId: 'P' }, markerPanes: ['M'], teeBytes: 10, ask: ask({ P: 'gone', M: 'live' }) }, { proceed: false })
  cell('nothing names a pane and the transcript has bytes -> refuse',
    { stateRecord: null, markerPanes: [], teeBytes: 10, ask: ask({}) }, { proceed: false })
  cell('nothing names a pane and there is nothing to lose -> proceed',
    { stateRecord: null, markerPanes: [], teeBytes: 0, ask: ask({}) }, { proceed: true, stale: [] })
  // Clause 3: the decision must not read or write anything. It is handed records, never paths, which
  // is what lets every cell above be driven with no herdr, no pane and no subprocess.
  //
  // The previous form of this clause was `/openDecision\(\{ stateRecord/.test(...) === false || true`.
  // `X === false || true` is true for EVERY X, so it printed ok against any implementation at all,
  // including one that took a path and read it. It reported the method change's central property as
  // pinned while asserting nothing. Assert the property itself: the parameter list, and the absence
  // of any filesystem call in the body.
  {
    const src = openDecision.toString()
    const params = src.slice(src.indexOf('('), src.indexOf(')') + 1)
    check('the decision takes exactly the four injected records, and no path',
      params === '({ stateRecord, markerPanes, teeBytes, ask })', params)
    const fsUse = src.match(/\bfs\.\w+|readFileSync|writeFileSync|existsSync|rmSync|mkdirSync|statePath/g)
    check('the decision touches no filesystem', fsUse === null, fsUse ? fsUse.join(', ') : '')
  }
}

console.log('the shared state helpers the SessionEnd rewrite rests on')
{
  const sd = path.join(tmp, 'seatstate')
  const oldTmp = process.env.TMPDIR
  process.env.TMPDIR = tmp
  const dir = seatsDir('unit-session')
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })

  writeMarker(path.join(dir, 'good.json'), { agent: 'good', paneId: 'w1:g' })
  check('writeMarker leaves a complete record', JSON.parse(fs.readFileSync(path.join(dir, 'good.json'), 'utf8')).paneId === 'w1:g')
  check('and no temp sibling behind it', !fs.readdirSync(dir).some((f) => f.includes('.tmp.')))

  reserveMarker(path.join(dir, 'held.json'))
  check('reserveMarker creates the name', fs.existsSync(path.join(dir, 'held.json')))
  check('and it is parseable the instant it exists, not empty', fs.readFileSync(path.join(dir, 'held.json'), 'utf8') === '{}')
  let twice = false
  try { reserveMarker(path.join(dir, 'held.json')) } catch { twice = true }
  check('and a second reservation of the same name fails, so it is still a mutex', twice)

  fs.writeFileSync(path.join(dir, 'broken.json'), 'not json')
  const partial = liveSeatsPartial('unit-session')
  check('liveSeatsPartial returns the readable seats', partial.seats.length === 2, JSON.stringify(partial.seats))
  check('and names the ones it could not read', partial.unreadable.length === 1 && partial.unreadable[0].endsWith('broken.json'), JSON.stringify(partial.unreadable))
  // Clause 3: prove the fixture really is unreadable, without the reader under test.
  let reallyBad = false
  try { JSON.parse(fs.readFileSync(path.join(dir, 'broken.json'), 'utf8')) } catch { reallyBad = true }
  check('the broken fixture really does not parse', reallyBad)
  fs.rmSync(dir, { recursive: true, force: true })
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp
}

console.log('isPaneNotFound is an ANSWER, read exactly, not a string found anywhere')
{
  check('herdr\'s real reply on stderr is an answer', isPaneNotFound({ stderr: '{"error":{"code":"pane_not_found","message":"x"},"id":"cli:pane:get"}' }))
  check('the same code nested under another error is NOT', !isPaneNotFound({ stderr: '{"error":{"code":"transport_error","cause":{"code":"pane_not_found"}}}' }))
  check('the string echoed in a command line is NOT', !isPaneNotFound({ message: 'Command failed: herdr pane get pane_not_found' }))
  check('an empty failure is NOT', !isPaneNotFound({}))
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall clauses passed')
process.exit(failures ? 1 : 0)
