// Behavioural tamper test for the seat hook's TEARDOWN paths, which no test could reach before,
// plus the one PLACEMENT path that fails the same way — a reservation that cannot be made.
//
//   node hooks/dctr-seat.teardown.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// SubagentStop and SessionEnd are the most destructive code in hooks/: they close panes and remove a
// session's state directory. Both were rewritten to keep records they could not act on, and neither
// rewrite had a clause anywhere — a wrong decision either abandons live panes with nothing left that
// can find them, or deletes the records needed to tear them down. Both failures are silent.
//
// Three clauses, as this repo requires: break it and the check trips, a healthy teardown stays
// quiet, and each fixture is proved to carry its defect WITHOUT the hook. A tripwire `herdr` first
// on PATH records every call and can be told to fail a close, which is the case the repairs are for.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readMeta, sleepMs } from './dctr-state.mjs'

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dctr-seat.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-teardown-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const calls = path.join(tmp, 'calls')

// Answers `pane get` with a real-shaped, unfocused pane so stopAction chooses to close.
//
// TWO close failures, because they are not the same failure and the code must not treat them alike.
// DCTR_TEST_CLOSE_FAILS names a pane whose close fails for a reason that tells us nothing about
// whether the pane is still there — a transport error. DCTR_TEST_CLOSE_GONE names a pane herdr
// answers `pane_not_found` for, which is an ANSWER: that pane is already closed, and the user
// closing panes by hand is the documented lifecycle (Q4). Both exit 1 and both throw in the hook,
// so a fixture carrying only the first certifies "a close that failed keeps its record" against the
// one input for which it is right, and never against the everyday one for which it is wrong.
//
// The payloads are the shapes the real tool produces, confirmed by asking it:
//   herdr pane close w7W:pNOPE -> {"error":{"code":"pane_not_found",...},"id":"cli:pane:close"}  rc=1
//   herdr tab close  <gone>    -> {"error":{"code":"tab_not_found",...}}                          rc=1
// The tab code is DIFFERENT, so a predicate widened to cover panes does not cover tabs.
// DCTR_TEST_TABS is the workspace tab list; absent, the list SUCCEEDS and carries no tab, which is
// an OBSERVED absence (issue #20: close by recorded id). DCTR_TEST_TABLIST_FAILS makes the call
// itself throw, which is a different answer entirely and must never close anything. Before these
// existed there was no `tab list` handler at all: every tab fixture drove the call into the default
// `{"result":{}}`, the caller's bare catch swallowed the TypeError, and `stopAction(undefined)`
// closed the tab — so the suite was green over a transport blip destroying a focused tab.
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(calls)}
if [ "$1 $2" = "pane close" ] && [ "$3" = "$DCTR_TEST_CLOSE_FAILS" ]; then
  echo '{"error":{"code":"transport_error","message":"no"}}' >&2; exit 1
fi
if [ "$1 $2" = "pane close" ] && [ "$3" = "$DCTR_TEST_CLOSE_GONE" ]; then
  echo '{"error":{"code":"pane_not_found","message":"pane '"$3"' not found"},"id":"cli:pane:close"}' >&2; exit 1
fi
if [ "$1 $2" = "tab close" ] && [ "$3" = "$DCTR_TEST_CLOSE_GONE" ]; then
  echo '{"error":{"code":"tab_not_found","message":"tab '"$3"' not found"},"id":"cli:tab:close"}' >&2; exit 1
fi
if [ "$1 $2" = "pane get" ] && [ "$3" = "$DCTR_TEST_GET_FAILS" ]; then
  echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1
fi
if [ "$1 $2" = "pane get" ] && [ "$3" = "$DCTR_TEST_GET_GONE" ]; then
  echo '{"error":{"code":"pane_not_found","message":"pane '"$3"' not found"},"id":"cli:pane:get"}' >&2; exit 1
fi
if [ "$1 $2" = "pane get" ] && [ "$3" = "$DCTR_TEST_GET_EMPTY" ]; then
  echo '{"result":{}}'; exit 0
fi
if [ "$1 $2" = "pane get" ] && [ "$3" = "$DCTR_TEST_GET_FOCUSED" ]; then
  echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":true}}}'; exit 0
fi
# The PANE snapshot and the PANE re-ask must be able to DISAGREE, the same way DCTR_TEST_TABS2 lets
# the tab pair disagree. This file is a JS template literal, so no backticks below. First pane-get
# call on this id answers unfocused, every later one answers focused: the user focusing a side pane
# between the hoisted read and the close.
if [ "$1 $2" = "pane get" ] && [ "$3" = "$DCTR_TEST_GET_FOCUSED2" ]; then
  if [ -f "$TMPDIR/paneget-seen" ]; then
    echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":true}}}'; exit 0
  fi
  : > "$TMPDIR/paneget-seen"
  echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":false}}}'; exit 0
fi
if [ "$1 $2" = "pane layout" ] && [ -n "$DCTR_TEST_LAYOUT_FAILS" ]; then
  echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1
fi
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TABLIST_FAILS" ]; then
  echo '{"error":{"code":"transport_error","message":"no route to server"}}' >&2; exit 1
fi
# A LIST that fails with a not-found code ON THE RE-ASK ONLY. The re-ask read that code as "this tab
# is gone, close it", but the call is workspace-wide and names no tab, so it cannot be an answer about
# this one. Two phases, because failing the SNAPSHOT too makes the seat unobservable and it never
# becomes a candidate at all: the clause then passes without the re-ask ever running, which is the
# very shape of blind clause this suite exists to stop. The mutation gate caught exactly that here.
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TABLIST_NOTFOUND" ]; then
  if [ -f "$TMPDIR/tablist-nf-seen" ]; then
    echo '{"error":{"code":"tab_not_found","message":"tab not found"},"id":"cli:tab:list"}' >&2; exit 1
  fi
  : > "$TMPDIR/tablist-nf-seen"
  echo '{"result":{"tabs":'"$DCTR_TEST_TABS"'}}'; exit 0
fi
# The snapshot and the re-ask must be able to DISAGREE, or nothing can show that re-asking matters.
# First call answers DCTR_TEST_TABS, every later call answers DCTR_TEST_TABS2: the user focusing a
# tab between the hoisted read and the close, which is the window the hoist introduced.
if [ "$1 $2" = "tab list" ] && [ -n "$DCTR_TEST_TABS2" ]; then
  if [ -f "$TMPDIR/tablist-seen" ]; then
    echo '{"result":{"tabs":'"$DCTR_TEST_TABS2"'}}'; exit 0
  fi
  : > "$TMPDIR/tablist-seen"
  echo '{"result":{"tabs":'"$DCTR_TEST_TABS"'}}'; exit 0
fi
if [ "$1 $2" = "pane run" ] && [ -n "$DCTR_TEST_REMOVE_ON_RUN" ]; then
  rm -f "$DCTR_TEST_REMOVE_ON_RUN"
fi
if [ "$1 $2" = "pane run" ] && [ -n "$DCTR_TEST_STEAL_ON_RUN" ]; then
  # A replacement seat takes this name while the codex stop sits between its pane-run call and its
  # marker write, which is the window that write must not clobber.
  printf '%s' "$DCTR_TEST_STEAL_RECORD" > "$DCTR_TEST_STEAL_ON_RUN"
fi
if [ "$1 $2" = "pane close" ] && [ -n "$DCTR_TEST_STEAL_MARKER" ]; then
  # A replacement seat takes this name while the close is in flight — the exact window between the
  # stop's identity-matched READ and its removal. Writing it here is what makes the race drivable.
  printf '%s' "$DCTR_TEST_STEAL_RECORD" > "$DCTR_TEST_STEAL_MARKER"
fi
case "$1 $2" in
  "pane get") echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":false}}}'; exit 0 ;;
  "pane layout") if [ -n "$DCTR_TEST_LAYOUT_EXTRA" ]; then echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":56}},{"pane_id":"'"$DCTR_TEST_LAYOUT_EXTRA"'","rect":{"height":20}}]}}}'; else echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":56}}]}}}'; fi; exit 0 ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"w1:pS"}}}'; exit 0 ;;
  "tab create") if [ -n "$DCTR_TEST_CREATE_EMPTY" ]; then echo '{"result":{}}'; else echo '{"result":{"tab":{"tab_id":"w1:tT"},"root_pane":{"pane_id":"w1:pT"}}}'; fi; exit 0 ;;
  "tab list") if [ -n "$DCTR_TEST_TABS" ]; then echo '{"result":{"tabs":'"$DCTR_TEST_TABS"'}}'; else echo '{"result":{"tabs":[]}}'; fi; exit 0 ;;
  *) echo '{"result":{}}'; exit 0 ;;
esac
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)

// The watcher's intervals, injected. Production is pump 250ms / poll 2000ms, and the fixtures below
// used to wait 2500ms purely to outlast one poll — 6 seconds of this suite's wall clock spent
// sleeping. Every wait that asserts the watcher is STILL ALIVE is a claim about a non-event, so it
// is necessarily a duration; it is derived from POLL here so it stays several polls long whatever
// the interval becomes, instead of being a number someone must remember to re-tune.
const TEST_POLL_MS = 50
const SURVIVES_MS = TEST_POLL_MS * 6
const watcherEnv = { DCTR_POLL_MS: String(TEST_POLL_MS) }

const SESSION = 'teardown-session'
const stateDir = path.join(tmp, `dctr-${SESSION}`)
const seatsDir = path.join(stateDir, 'seats')
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`)
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const seat = (agent, paneId, agentId) => {
  fs.writeFileSync(path.join(seatsDir, `${agent}.json`), JSON.stringify({ agent, agent_id: agentId ?? `id-${agent}`, role: 'Explore', n: 1, tabId: null, paneId, file: '/t/x.jsonl' }))
}
const reset = () => { fs.rmSync(stateDir, { recursive: true, force: true }); fs.mkdirSync(seatsDir, { recursive: true }); fs.writeFileSync(calls, '') }
const run = (payload, env = {}) => {
  try {
    return { code: 0, out: execFileSync('node', [hook], {
      // BOUNDED. A hook that blocks — on a pipe whose other end is gone, on a herdr that never
      // answers — hangs this suite forever, and an unbounded suite hangs the mutation gate and CI
      // behind it. Observed: an abandoned run sat 34 minutes at zero CPU, asleep in a socket read.
      // A hang is a failure here, not a wait.
      timeout: 30000,
      input: JSON.stringify({ session_id: SESSION, ...payload }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1', DCTR_VIEW_REQUEST_DIR: '', ...env },
    }) }
  } catch (e) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
}
const called = (re) => { try { return re.test(fs.readFileSync(calls, 'utf8')) } catch { return false } }
const callLines = (re) => { try { return fs.readFileSync(calls, 'utf8').split('\n').filter((l) => re.test(l)) } catch { return [] } }

console.log('clause 2 — a healthy teardown closes everything and leaves nothing behind')
{
  reset(); seat('dctr-explore-1', 'w1:s1'); seat('dctr-explore-2', 'w1:s2')
  run({ hook_event_name: 'SessionEnd' })
  check('both seats were closed', called(/pane close w1:s1/) && called(/pane close w1:s2/))
  check('and the state directory is gone', !fs.existsSync(stateDir), fs.existsSync(stateDir) ? fs.readdirSync(stateDir).join(',') : '')
}

console.log('clause 1 — a close that FAILED must keep the record of what it could not close')
{
  reset(); seat('dctr-explore-1', 'w1:s1'); seat('dctr-explore-2', 'w1:s2')
  run({ hook_event_name: 'SessionEnd' }, { DCTR_TEST_CLOSE_FAILS: 'w1:s2' })
  check('it still tried both', called(/pane close w1:s1/) && called(/pane close w1:s2/))
  check('and kept the state directory, because a pane may still be on screen', fs.existsSync(stateDir))
  check('with the markers intact', fs.existsSync(path.join(seatsDir, 'dctr-explore-2.json')))

  // SubagentStop: the same rule, one function above, which is where it was missing.
  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-1')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_CLOSE_FAILS: 'w1:s1' })
  check('SubagentStop keeps the marker when the close failed', fs.existsSync(path.join(seatsDir, 'dctr-explore-1.json')))

  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-1')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' })
  check('and removes it when the close succeeded', !fs.existsSync(path.join(seatsDir, 'dctr-explore-1.json')))
}

console.log('clause 1 — one unreadable marker must not abandon the seats that are readable')
{
  reset(); seat('dctr-explore-1', 'w1:s1')
  fs.writeFileSync(path.join(seatsDir, 'dctr-broken-9.json'), 'not json at all')
  run({ hook_event_name: 'SessionEnd' })
  check('the readable seat was still closed', called(/pane close w1:s1/))
  check('and nothing was removed, because a record we cannot read is not an answer', fs.existsSync(stateDir))
}

console.log('clause 1 — a pane that is already GONE is an answer, not a failed close')
{
  // F10. `isPaneNotFound` was added to dctr-state.mjs in the same diff that rewrote these paths and
  // is called only from dctr-pane.mjs; this file reads every throw as a failure. A user who closes a
  // relabelled seat pane by hand — the lifecycle Q4 ruled and SKILL.md documents — then leaves every
  // later stop and the SessionEnd sweep believing a live pane is on screen.
  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-1')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_CLOSE_GONE: 'w1:s1' })
  check('SubagentStop removes the marker of a pane herdr says is not there',
    !fs.existsSync(path.join(seatsDir, 'dctr-explore-1.json')),
    'the pane is gone, so there is no pane left to keep a record of')

  // The clause above drives the CLOSE answering pane_not_found. The LOOKUP answering it was driven
  // by nothing, and with a tri-state stopAction that is the difference between removing the record
  // of a pane that is gone and keeping it forever: an unseparated catch reads not-found as merely
  // unobservable, and the marker survives every sweep for a pane that does not exist.
  reset(); seat('dctr-explore-11', 'w1:s11', 'agent-11')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-11', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_GET_GONE: 'w1:s11' })
  check('and removes it when the LOOKUP is what answered pane_not_found, not the close',
    !fs.existsSync(path.join(seatsDir, 'dctr-explore-11.json')),
    `marker still there: ${fs.existsSync(path.join(seatsDir, 'dctr-explore-11.json'))}; calls: ${callLines(/^pane (get|close)/).join(' | ')}`)

  reset(); seat('dctr-explore-1', 'w1:s1'); seat('dctr-explore-2', 'w1:s2')
  run({ hook_event_name: 'SessionEnd' }, { DCTR_TEST_CLOSE_GONE: 'w1:s2' })
  check('SessionEnd sweeps the state directory when the only close that threw was pane_not_found',
    !fs.existsSync(stateDir),
    fs.existsSync(stateDir) ? `kept: ${fs.readdirSync(stateDir).join(',')}` : '')

  // SubagentStop on a TAB seat, which reaches `alreadyGone` rather than SessionEnd's inline test.
  // Without this the tab predicate could be reverted to the pane one with the whole suite green —
  // the mutation gate said so, which is what it is for.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-8.json'), JSON.stringify({ agent: 'dctr-explore-8', agent_id: 'agent-8', role: 'Explore', n: 8, tabId: 'w1:t8', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-8', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_CLOSE_GONE: 'w1:t8' })
  check('SubagentStop removes the marker of a TAB herdr says is not there',
    !fs.existsSync(path.join(seatsDir, 'dctr-explore-8.json')),
    'tab_not_found is an answer too, and it is a different code from the pane one')

  // The inverse, and the one that was missing: the list call itself FAILING. There was no `tab list`
  // handler in this fixture at all, so every tab clause above drove that call into the default reply,
  // the caller's bare catch swallowed the TypeError, and `stopAction(undefined)` closed the tab by id
  // — a transport blip destroying the tab the user was watching, with the whole suite green.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-9.json'), JSON.stringify({ agent: 'dctr-explore-9', agent_id: 'agent-9', role: 'Explore', n: 9, tabId: 'w1:t9', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-9', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_TABLIST_FAILS: '1' })
  check('but a tab whose LIST CALL FAILED is not closed, and keeps its marker for SessionEnd',
    !called(/^tab close w1:t9/m) && fs.existsSync(path.join(seatsDir, 'dctr-explore-9.json')),
    callLines(/^tab (close|list)/).join(' | ') || '(no tab calls)')

  // A tab the list DID carry but with no boolean focus: a reply can be shaped like that, and reading
  // it as unfocused is the same blind close by another road.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-10.json'), JSON.stringify({ agent: 'dctr-explore-10', agent_id: 'agent-10', role: 'Explore', n: 10, tabId: 'w1:t10', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-10', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_TABS: '[{"tab_id":"w1:t10"}]' })
  check('and a listed tab carrying no boolean focus is not closed either',
    !called(/^tab close w1:t10/m) && fs.existsSync(path.join(seatsDir, 'dctr-explore-10.json')),
    callLines(/^tab close/).join(' | ') || '(no tab close)')

  // The tab branch answers a DIFFERENT code, so it needs its own predicate rather than a widened one.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-3.json'), JSON.stringify({ agent: 'dctr-explore-3', agent_id: 'id-3', role: 'Explore', n: 3, tabId: 'w1:t9', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SessionEnd' }, { DCTR_TEST_CLOSE_GONE: 'w1:t9' })
  check('SessionEnd sweeps the state directory when a TAB answers tab_not_found',
    !fs.existsSync(stateDir),
    fs.existsSync(stateDir) ? `kept: ${fs.readdirSync(stateDir).join(',')}` : '')
}

console.log('clause 1 — a lookup that FAILED must not become a close')
{
  // The inverse of the clause above, in the same seam. stopAction(undefined) is 'close', so a pane
  // get that merely failed used to close the pane regardless — and the pane stopAction exists to
  // spare is the focused one the user is watching.
  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-1')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_GET_FAILS: 'w1:s1' })
  check('a pane whose lookup failed is NOT closed', !called(/pane close w1:s1/), 'closed a pane it could not see')
  check('and its marker is kept, so SessionEnd can try again', fs.existsSync(path.join(seatsDir, 'dctr-explore-1.json')))
}

console.log('clause 1: a focused side seat is relabelled under its own title, not closed')
{
  // The pane the user is watching keeps its status-line title with a done suffix. The stop path once
  // renamed it to the seat name instead, so the title the user had been reading was replaced by
  // `dctr-explore-1 · done` at the moment the seat finished.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-1.json'), JSON.stringify({ agent: 'dctr-explore-1', agent_id: 'agent-1', role: 'Explore', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/x.jsonl', label: 'explore · Sweep the hooks' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_GET_FOCUSED: 'w1:s1' })
  check('a focused side pane is renamed to its label plus done', called(/^pane rename w1:s1 explore · Sweep the hooks · done$/m), callLines(/^pane rename/).join(' | '))
  check('and is not closed', !called(/^pane close w1:s1/m), callLines(/^pane close/).join(' | '))
  const focused = execFileSync('bash', ['-c', `${bin}/herdr pane get w1:s1`], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_FOCUSED: 'w1:s1' } })
  check('and its MARKER survives, because a pane that LIVES must stay reclaimable (F14)',
    fs.existsSync(path.join(seatsDir, 'dctr-explore-1.json')),
    'spared and then forgotten: staleSideSeats filters RECORDED seats and SessionEnd enumerates MARKERS, so with no record neither can reach it')
  check('the focused fixture really answers focused, proved without the hook', /"focused":true/.test(focused), focused)
}

console.log('clause 1: a focused TAB is relabelled and KEEPS its marker (F14)')
{
  // The sibling of the clause above, and the thing the gate launcher already gets right: "The tab
  // LIVES and the user is watching it, so its record must live too." The seat hook renamed the tab
  // and removed its marker anyway, so SessionEnd could never reclaim it and sideOccupants, which
  // counts markers, under-counted the column for the rest of the session.
  const TABS12 = '[{"tab_id":"w1:tDECOY","focused":false,"label":"decoy"},{"tab_id":"w1:t12","focused":true,"label":"seat 12"}]'
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-12.json'), JSON.stringify({ agent: 'dctr-explore-12', agent_id: 'agent-12', role: 'Explore', n: 12, tabId: 'w1:t12', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-12', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' }, { DCTR_TEST_TABS: TABS12 })
  check('a focused tab is renamed', called(/^tab rename w1:t12 seat 12 . done$/m), callLines(/^tab (rename|close)/).join(' | ') || '(no tab calls)')
  check('and is not closed', !called(/^tab close w1:t12/m), callLines(/^tab close/).join(' | ') || '(no tab close)')
  check('and its MARKER survives, so SessionEnd can still reclaim it (F14)',
    fs.existsSync(path.join(seatsDir, 'dctr-explore-12.json')),
    'the tab was spared and then forgotten')
  // Third clause: the fixture really carries a focused entry for THIS tab, behind a decoy whose focus
  // is the opposite, so nothing above can pass by taking the first entry instead of matching the id.
  const tabsOut = execFileSync('bash', ['-c', `${bin}/herdr tab list --workspace w1`], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_TABS: TABS12 } })
  const parsed = JSON.parse(tabsOut).result.tabs
  check('the tab fixture really answers focused for w1:t12 behind an UNfocused decoy, proved without the hook',
    parsed.length === 2 && parsed[0].tab_id === 'w1:tDECOY' && parsed[0].focused === false && parsed[1].tab_id === 'w1:t12' && parsed[1].focused === true,
    tabsOut)
}

console.log('clause 1: an UNfocused seat still closes AND still loses its marker (F14 must not leak every record)')
{
  // The other direction of the same repair, and the one that makes it a repair rather than a leak.
  // Keeping the marker on relabel is only correct while the ordinary path still removes it: a change
  // that kept every marker passes both clauses above and holds every finished seat against the cap.
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-explore-13.json'), JSON.stringify({ agent: 'dctr-explore-13', agent_id: 'agent-13', role: 'Explore', n: 13, tabId: 'w1:t13', paneId: null, file: '/t/x.jsonl' }))
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-13', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' },
    { DCTR_TEST_TABS: '[{"tab_id":"w1:t13","focused":false,"label":"seat 13"}]' })
  check('an unfocused tab is still closed', called(/^tab close w1:t13/m), callLines(/^tab (rename|close)/).join(' | ') || '(no tab calls)')
  check('and its marker is still removed', !fs.existsSync(path.join(seatsDir, 'dctr-explore-13.json')))
}

console.log('clause 1 — a finishing seat must not delete a replacement that reused its name')
{
  // F3. SubagentStop matched its seat on agent_id when READING and then removed the marker by NAME.
  // Between those two steps SubagentStart can drop this seat's stale marker, reuse the freed name for
  // a different agent and publish it — and the unlink then takes the replacement, leaving a live pane
  // nothing on disk names. Driven by publishing the replacement under the same name before the stop
  // reaches its removal, which is what the interleaving produces.
  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-OLD')
  const marker = path.join(seatsDir, 'dctr-explore-1.json')
  const replacement = JSON.stringify({ agent: 'dctr-explore-1', agent_id: 'agent-NEW', role: 'Explore', n: 1, tabId: null, paneId: 'w1:sNEW', file: '/t/x.jsonl' })
  // The steal lands DURING the close, so the stop has already matched agent-OLD on the read. Writing
  // it before the run instead makes the hook stand down at "no live seat recorded" and the removal is
  // never reached — a fixture that proves nothing, which is how the first version of this clause
  // passed while measuring nothing.
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-OLD', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' },
      { DCTR_TEST_STEAL_MARKER: marker, DCTR_TEST_STEAL_RECORD: replacement })
  check("a marker whose agent_id has changed hands is left alone", fs.existsSync(marker),
    'the replacement seat lost its marker and its pane is now untracked')
  const after = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : {}
  check('and it still belongs to the agent that took the name', after.agent_id === 'agent-NEW', String(after.agent_id))
}

console.log('clause 1 — a reservation that cannot be made must stand down, not spin')
{
  // Placement, not teardown, but the same failure shape and the same fixture. The reservation loop
  // read EVERY errno as "that name is taken" and incremented, so an unwritable seats directory or a
  // full disk spun it forever WHILE HOLDING THE PLACEMENT LOCK — measured at 1000 attempts with no
  // exit — blocking every seat behind it. `run` is bounded at 30s, so a spin fails this clause.
  reset()
  fs.chmodSync(seatsDir, 0o500)
  const r = run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl' })
  fs.chmodSync(seatsDir, 0o700)
  const logged = (() => { try { return fs.readFileSync(path.join(stateDir, 'hook.log'), 'utf8') } catch { return '' } })()
  check('it exits instead of spinning', r.code === 0, `exit ${r.code}`)
  check('and says which errno stopped it, rather than standing down silently',
    /could not reserve a seat marker \(EACCES/.test(logged), logged.trim().split('\n').pop() || '(no log)')
}

console.log('clause 1: a seat pane is named for its status-line title and starts in the session cwd')
{
  // N17 and F1 (field audit 2026-09-07). The harness writes `<transcript-dir>/subagents/agent-<id>.meta.json`
  // at spawn with the Agent tool's description, which is the title the status line shows; the pane
  // carried only `dctr-explore-1`. And the pane shell started in the herdr server's cwd.
  const proj = path.join(tmp, 'proj'); fs.mkdirSync(path.join(proj, 'sess', 'subagents'), { recursive: true })
  const transcript = path.join(proj, 'sess.jsonl')
  const WS = path.join(tmp, 'ws', 'doctrine-skills'); fs.mkdirSync(WS, { recursive: true })
  const meta = path.join(proj, 'sess', 'subagents', 'agent-a7.meta.json')
  fs.writeFileSync(meta, JSON.stringify({ agentType: 'general-purpose', description: 'Fresh refuter of N1-N16', toolUseId: 'toolu_1', spawnDepth: 1 }))
  const start = (agentId, type, env) => run({ hook_event_name: 'SubagentStart', agent_id: agentId, agent_type: type, transcript_path: transcript, cwd: WS }, env)

  reset(); start('a7', 'general-purpose')
  check('the side pane is renamed to type plus description', called(/^pane rename w1:pS general-purpose · Fresh refuter of N1-N16$/m), callLines(/^pane rename/).join(' | '))
  check('and the split carries the session cwd', callLines(/^pane split /).some((l) => l.includes(` --cwd ${WS}`)), callLines(/^pane split/).join(' | '))
  const rec = (() => { try { return JSON.parse(fs.readFileSync(path.join(seatsDir, 'dctr-general-purpose-1.json'), 'utf8')) } catch { return {} } })()
  check('and the marker records the label for the stop path', rec.label === 'general-purpose · Fresh refuter of N1-N16', String(rec.label))

  reset(); start('a8', 'Explore')
  check('a seat with no meta file is named type plus counter', called(/^pane rename w1:pS explore · 1$/m), callLines(/^pane rename/).join(' | '))

  // A meta file caught mid-write parses as a SyntaxError, not ENOENT, and the harness finishes it
  // within the same second. The second read has to happen for any parse failure, not only absence.
  const midWrite = path.join(proj, 'sess', 'subagents', 'agent-a9.meta.json')
  fs.writeFileSync(midWrite, '{"agentType":"Explore","descrip')
  const finisher = spawn('node', ['-e', `setTimeout(() => require('fs').writeFileSync(process.argv[1], JSON.stringify({ description: 'Finished later' })), 100)`, midWrite], { stdio: 'ignore' })
  const late = readMeta(midWrite, 600)
  check('a meta file that is invalid JSON at first read and valid shortly after yields the description', late && late.description === 'Finished later', JSON.stringify(late))
  finisher.kill()
  check('the mid-write fixture really failed to parse before the finisher ran', (() => { try { JSON.parse('{"agentType":"Explore","descrip'); return false } catch { return true } })())

  reset(); start('a7', 'general-purpose', { DCTR_TEST_LAYOUT_FAILS: '1' })
  check('a tab seat is created under the same label and reports it as its sidebar message',
    called(/^tab create .*--label general-purpose · Fresh refuter of N1-N16 /m) && called(/^pane report-agent w1:pT .*--message general-purpose · Fresh refuter of N1-N16$/m) && !called(/^pane rename w1:pT/m),
    callLines(/^tab create|^pane report-agent/).join(' | '))
  check('and the tab create carries the session cwd', callLines(/^tab create /).some((l) => l.includes(` --cwd ${WS}`)), callLines(/^tab create/).join(' | '))
}

console.log('clause 1: a throw from the hook itself is not logged as herdr refusing')
{
  // N3 (field audit 2026-09-07). Every throw reached one catch that named herdr, so a TypeError in
  // this file sent the reader to the herdr log. A create that answers a well-formed reply with no
  // tab in it makes the hook throw on its own property read, and execFileSync never saw an error.
  reset()
  run({ hook_event_name: 'SubagentStart', agent_id: 'a9', agent_type: 'Explore', transcript_path: path.join(tmp, 'proj', 'sess.jsonl') }, { DCTR_TEST_LAYOUT_FAILS: '1', DCTR_TEST_CREATE_EMPTY: '1' })
  const logged = (() => { try { return fs.readFileSync(path.join(stateDir, 'hook.log'), 'utf8') } catch { return '' } })()
  check('the stand-down names a hook error, not a refusal', /skipped .*hook error: /.test(logged) && !/refused an action/.test(logged), logged.trim().split('\n').pop() || '(no log)')
  const reply = execFileSync('bash', ['-c', `${bin}/herdr tab create; echo "rc=$?"`], { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CREATE_EMPTY: '1' } })
  check('the fixture really answers rc=0 with a reply that has no tab in it, so no spawn error exists to label', /"result":\{\}/.test(reply) && /rc=0/.test(reply), reply)
}

console.log('clause 1: a codex seat keeps its pane on the job, not on the wrapper')
{
  // N18 (field audit 2026-09-07; Scott's ruling "Relabel and stay"). The codex rescue wrapper returns
  // in about a minute and its SubagentStop closed the pane while the job it started ran on for an
  // hour with nothing on screen. The stop now finds the job record and hands the pane a watcher.
  const home = path.join(tmp, 'home')
  const WS = path.join(tmp, 'ws', 'doctrine-skills'); fs.mkdirSync(WS, { recursive: true })
  const jobs = path.join(home, '.claude', 'plugins', 'data', 'codex-openai-codex', 'state', 'doctrine-skills-0123abcd', 'jobs')
  fs.mkdirSync(jobs, { recursive: true })
  const now = Date.now()
  const job = (name, createdAt, workspaceRoot, status) => {
    const logFile = path.join(jobs, `${name}.log`)
    fs.writeFileSync(logFile, `codex output for ${name}\n`)
    fs.writeFileSync(path.join(jobs, `${name}.json`), JSON.stringify({ id: name, workspaceRoot, createdAt: new Date(createdAt).toISOString(), status, pid: null, logFile }))
    return path.join(jobs, `${name}.json`)
  }
  // A second state directory under the same root, named for another workspace, whose record claims
  // this workspace and is newer than anything here. The reader picks directories by the workspace
  // basename, so this record is never read; a reader that took every directory would choose it.
  const foreignJobs = path.join(home, '.claude', 'plugins', 'data', 'codex-openai-codex', 'state', 'elsewhere-ffff0000', 'jobs')
  fs.mkdirSync(foreignJobs, { recursive: true })
  const foreignJob = path.join(foreignJobs, 'task-foreign.json')
  fs.writeFileSync(foreignJob, JSON.stringify({ id: 'task-foreign', workspaceRoot: WS, createdAt: new Date(now + 5000).toISOString(), status: 'running', pid: null, logFile: path.join(foreignJobs, 'task-foreign.log') }))
  const oldJob = job('task-old', now - 3600000, WS, 'completed')
  const otherJob = job('task-other', now + 1000, path.join(tmp, 'ws', 'elsewhere'), 'running')
  const runningJob = job('task-run', now, WS, 'running')
  const LABEL = 'codex-codex-rescue · Red team the spec'
  const R = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
  const codexSeat = () => fs.writeFileSync(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json'), JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL }))
  const stop = (cwd) => run({ hook_event_name: 'SubagentStop', agent_id: 'cx-1', agent_type: 'codex:codex-rescue', transcript_path: '/home/u/.claude/projects/-p/s.jsonl', cwd }, { HOME: home })

  reset(); codexSeat(); stop(WS)
  const runs = callLines(/^pane run w1:s1 /)
  check('the pane is not closed', !called(/^pane close w1:s1/m), callLines(/^pane close/).join(' | '))
  const seq = callLines(/^pane (send-keys|run) w1:s1 /)
  check('and the renderer is interrupted before the watcher is typed in',
    seq.length === 2 && seq[0] === 'pane send-keys w1:s1 ctrl+c' && /^pane run w1:s1 .*--codex-tail /.test(seq[1]), seq.join(' | '))
  check('and exactly one watcher is run in it, on the running job', runs.length === 1 && runs[0].includes('--codex-tail') && runs[0].includes(runningJob) && runs[0].includes(LABEL), runs.join(' | '))
  check('and the marker stays, so the pane still counts against the cap', fs.existsSync(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')))
  check('and the marker records WHICH job the pane follows, which is what close-on-next later reads',
    R(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')).codexJob === runningJob,
    JSON.stringify(R(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')).codexJob))
  check("and a record in another workspace's state directory is not chosen, though newer", runs.length === 1 && !runs[0].includes(foreignJob), runs.join(' | '))

  // B3: between the stop's `pane run` and its marker write, a placement can drop this seat's stale
  // marker and reuse the name for a NEW agent. A write that trusted the name replaced that agent's
  // record with this one's, leaving its live pane tracked by nothing.
  reset(); codexSeat()
  const stolen = JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-NEW', role: 'codex:codex-rescue', n: 1, tabId: null, paneId: 'w1:sNEW', file: '/t/new.jsonl', label: 'a replacement' })
  run({ hook_event_name: 'SubagentStop', agent_id: 'cx-1', agent_type: 'codex:codex-rescue', transcript_path: '/home/u/.claude/projects/-p/s.jsonl', cwd: WS },
    { HOME: home, DCTR_TEST_STEAL_ON_RUN: path.join(seatsDir, 'dctr-codex-codex-rescue-1.json'), DCTR_TEST_STEAL_RECORD: stolen })
  check('the stop does not overwrite a marker that now belongs to a replacement seat',
    R(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')).agent_id === 'cx-NEW',
    JSON.stringify(R(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json'))))

  // Absent must count as "not mine": if placement removed this marker while the stop was working,
  // recreating it publishes a record for a pane that is already gone, which nothing then closes.
  reset(); codexSeat()
  run({ hook_event_name: 'SubagentStop', agent_id: 'cx-1', agent_type: 'codex:codex-rescue', transcript_path: '/home/u/.claude/projects/-p/s.jsonl', cwd: WS },
    { HOME: home, DCTR_TEST_REMOVE_ON_RUN: path.join(seatsDir, 'dctr-codex-codex-rescue-1.json') })
  check('a marker removed while the stop worked is NOT recreated by its job-path write',
    !fs.existsSync(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')),
    'the seat is gone; publishing a record for its pane would leave one nothing closes')

  reset(); codexSeat(); stop(path.join(tmp, 'ws', 'nowhere'))
  const logged = (() => { try { return fs.readFileSync(path.join(stateDir, 'hook.log'), 'utf8') } catch { return '' } })()
  check('a codex seat whose job cannot be found closes as any other seat', called(/^pane close w1:s1/m) && !called(/--codex-tail/) && !fs.existsSync(path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')))
  check('and says so', /no codex job record/.test(logged), logged.trim().split('\n').pop() || '(no log)')

  reset(); seat('dctr-explore-1', 'w1:s1', 'agent-1')
  run({ hook_event_name: 'SubagentStop', agent_id: 'agent-1', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/s.jsonl', cwd: WS }, { HOME: home })
  check('a general-purpose seat in the same session still closes', called(/^pane close w1:s1/m) && !called(/--codex-tail/))

  // Close-on-next (Scott's ruling, 2026-09-07). A finished codex pane holds a column slot until the
  // NEXT codex seat is placed, and then closes — unless someone is looking at it. Driven through a
  // real SubagentStart, because the decision is only worth anything where the placement runs it.
  const MARK = path.join(seatsDir, 'dctr-codex-codex-rescue-1.json')
  const doneJobRec = job('task-finished', now, WS, 'completed')
  const followedSeat = (jobPath) => fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: jobPath }))
  // DCTR_TEST_LAYOUT_EXTRA puts the surviving codex pane in the layout, which is what production
  // looks like: the pane outlived its stop and is live. Without it staleSideSeats drops the marker
  // before close-on-next runs, and every clause below passes for the wrong reason.
  const startSeat = (type, env) => run({ hook_event_name: 'SubagentStart', agent_id: 'cx-2', agent_type: type, transcript_path: '/home/u/.claude/projects/-p/s2.jsonl', cwd: WS }, { HOME: home, DCTR_TEST_LAYOUT_EXTRA: 'w1:s1', ...env })
  // BY IDENTITY, never by name (F3): closing the finished seat frees its name, and the placement
  // that freed it immediately reserves `dctr-codex-codex-rescue-1` for the NEW seat. The file
  // existing proves nothing; whose agent_id it carries is the whole question.
  const stillSeatOne = () => { try { return R(MARK).agent_id === 'cx-1' } catch { return false } }

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue')
  check('a finished codex pane is closed when the next codex seat is placed', called(/^pane close w1:s1/m), callLines(/^pane close/).join(' | '))
  check('and the finished seat is gone from the markers, so it stops counting against the cap',
    !stillSeatOne(), `marker now: ${(() => { try { return JSON.stringify(R(MARK)) } catch { return '(absent)' } })()}`)

  reset(); followedSeat(runningJob); startSeat('codex:codex-rescue')
  check('a codex pane whose job is still RUNNING is left alone', !called(/^pane close w1:s1/m) && stillSeatOne(), callLines(/^pane close/).join(' | '))

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue', { DCTR_TEST_GET_FOCUSED: 'w1:s1' })
  check('a FINISHED codex pane someone is looking at still stays', !called(/^pane close w1:s1/m) && stillSeatOne(), callLines(/^pane close/).join(' | '))

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue', { DCTR_TEST_GET_FAILS: 'w1:s1' })
  check('a finished codex pane whose focus lookup FAILED is spared: unknown is not unfocused',
    !called(/^pane close w1:s1/m) && stillSeatOne(), callLines(/^pane (get|close)/).join(' | '))

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue', { DCTR_TEST_GET_EMPTY: 'w1:s1' })
  check('a lookup that SUCCEEDS but carries no pane is still not an observation, so the pane stays',
    !called(/^pane close w1:s1/m) && stillSeatOne(), callLines(/^pane (get|close)/).join(' | '))

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue', { DCTR_TEST_CLOSE_GONE: 'w1:s1' })
  check('a pane herdr says is NOT THERE has its marker removed, since already-gone is an answer',
    !stillSeatOne(), `marker: ${(() => { try { return JSON.stringify(R(MARK)) } catch { return '(absent)' } })()}`)

  reset(); followedSeat(doneJobRec); startSeat('codex:codex-rescue', { DCTR_TEST_CLOSE_FAILS: 'w1:s1' })
  check('but a close that merely FAILED keeps its marker, so SessionEnd can try again', stillSeatOne(),
    callLines(/^pane close/).join(' | '))

  // The TAB half of the not-found branch. Every other close-on-next fixture is a side pane, so
  // `isTabNotFound` was asserted by nothing and a predicate widened to cover panes would not cover
  // tabs — the two codes genuinely differ, which is why this file carries two predicates.
  reset()
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_CLOSE_GONE: 'w1:t8' })
  check('a finished codex TAB herdr says is not there has its marker removed too, on the tab code',
    called(/^tab close w1:t8/m) && !stillSeatOne(), callLines(/^tab close/).join(' | '))

  // The lifecycle a deleted branch leaked for a whole session: a finished codex TAB that is gone.
  // A tab list that SUCCEEDS and does not carry it has observed its absence, so the tab is closed and
  // its marker removed. staleSideSeats cannot rescue this one — it never judges a tab seat — so
  // without an observed absence the marker survives every later placement. The pane's own state is
  // deliberately irrelevant here: this fixture's pane is gone too, and it is not what decides.
  reset()
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_GET_GONE: 'w1:s1' })
  check('a finished codex tab the list does not carry is swept: an observed absence is an answer',
    called(/^tab close w1:t8/m) && !stillSeatOne(), callLines(/^(pane get|tab close)/).join(' | '))

  // ASK WHAT YOU ARE ABOUT TO CLOSE (Scott's ruling, 2026-09-08). Reading focus from the recorded
  // ROOT PANE and then closing the whole TAB asks a different question than the one being acted on.
  // The user splits the tab, closes the root pane and watches the sibling: herdr answers
  // pane_not_found for the pane that went, the old code read that as "not focused", and the close
  // destroyed the focused tab. Same fixture as above but for the tab's own focus, and it must NOT close.
  reset()
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_GET_GONE: 'w1:s1', DCTR_TEST_TABS: '[{"tab_id":"w1:t8","focused":true}]' })
  check('but a finished codex tab that is FOCUSED is spared even when its recorded root pane has gone',
    !called(/^tab close w1:t8/m) && stillSeatOne(), callLines(/^(pane get|tab close|tab list)/).join(' | ') || '(no calls)')

  // The PANE half of the not-found branch, which lost its only fixture when tab focus moved to the
  // tab list: every clause that used to drive `pane get` -> pane_not_found was a TAB seat. A fixture
  // CAN still reach it — the layout must carry the pane, so staleSideSeats does not filter the seat
  // out first, while `pane get` answers pane_not_found — so this is a missing fixture and not a dead
  // branch, and the branch stays. Without it a finished side pane that herdr says is gone would be
  // spared as "unobservable" and hold its column slot for the rest of the session.
  reset()
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_GET_GONE: 'w1:s1', DCTR_TEST_LAYOUT_EXTRA: 'w1:s1' })
  check('a finished codex SIDE PANE that pane_not_found reports gone is swept, though the layout still lists it',
    called(/^pane close w1:s1/m) && !stillSeatOne(), callLines(/^(pane get|pane close)/).join(' | ') || '(no calls)')

  // THE HOIST'S OWN WINDOW. The snapshot is taken once and candidate collection then makes a herdr
  // round trip per pane seat; the user can focus a tab inside it, and the placement lock serializes
  // placements, not attention. First `tab list` answers unfocused, every later one answers focused:
  // the seat is a candidate on the snapshot and must still be spared by the re-ask before the close.
  reset()
  try { fs.rmSync(path.join(tmp, 'tablist-seen'), { force: true }) } catch { /* first run */ }
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', {
    DCTR_TEST_TABS: '[{"tab_id":"w1:t8","focused":false}]',
    DCTR_TEST_TABS2: '[{"tab_id":"w1:t8","focused":true}]' })
  check('a tab focused BETWEEN the hoisted snapshot and the close is spared: the re-ask is what makes the snapshot safe',
    !called(/^tab close w1:t8/m) && stillSeatOne(),
    `${callLines(/^tab (list|close)/).join(' | ') || '(no tab calls)'}`)
  check('and the fixture really did answer twice and differently, proved without the hook',
    fs.existsSync(path.join(tmp, 'tablist-seen')) && callLines(/^tab list/).length >= 2,
    `tab list calls: ${callLines(/^tab list/).length}`)

  // THE SAME WINDOW, ON A SIDE PANE. The re-ask was added for tabs only, so a pane candidate was
  // still destroyed on the answer read during candidate collection — and the tab re-asks the repair
  // added now sit BETWEEN that read and this close, so the repair lengthened the window it left
  // open. First `pane get` answers unfocused, every later one answers focused.
  reset()
  try { fs.rmSync(path.join(tmp, 'paneget-seen'), { force: true }) } catch { /* first run */ }
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_GET_FOCUSED2: 'w1:s1' })
  check('a side PANE focused BETWEEN the hoisted snapshot and the close is spared, exactly as a tab is',
    called(/^pane get w1:s1/m) && !called(/^pane close w1:s1/m) && stillSeatOne(),
    `${callLines(/^pane (get|close)/).join(' | ') || '(no pane calls)'}`)
  check('and that fixture really did answer twice and differently, proved without the hook',
    fs.existsSync(path.join(tmp, 'paneget-seen')) && callLines(/^pane get w1:s1/).length >= 2,
    `pane get calls: ${callLines(/^pane get w1:s1/).length}`)

  // A not-found code on a WORKSPACE-WIDE list is not an answer about this tab. The re-ask read it as
  // one and closed on it, which is the destructive direction; the snapshot read of the same command
  // treats every failure as do-not-close. A transport error cannot tell the two apart, so the
  // TABLIST_FAILS clause above passes either way and this is the fixture that discriminates.
  reset()
  try { fs.rmSync(path.join(tmp, 'tablist-nf-seen'), { force: true }) } catch { /* first run */ }
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', {
    DCTR_TEST_TABS: '[{"tab_id":"w1:t8","focused":false}]',
    DCTR_TEST_TABLIST_NOTFOUND: '1' })
  check('a tab whose RE-ASK list answered tab_not_found is spared: a not-found on a workspace list names no tab',
    !called(/^tab close w1:t8/m) && stillSeatOne(),
    `${callLines(/^tab (list|close)/).join(' | ') || '(no tab calls)'}`)
  // Without this the clause above passes on a run where the snapshot alone answered and the seat was
  // never a candidate — which is how it first passed with the repair reverted.
  check('and the re-ask really ran: the snapshot answered, then a SECOND list call was made',
    callLines(/^tab list/).length >= 2 && fs.existsSync(path.join(tmp, 'tablist-nf-seen')),
    `tab list calls: ${callLines(/^tab list/).length}`)

  // And a list call that failed closes nothing at all: unobservable is not unfocused, for a tab
  // exactly as for a pane.
  reset()
  fs.writeFileSync(MARK, JSON.stringify({ agent: 'dctr-codex-codex-rescue-1', agent_id: 'cx-1', role: 'codex:codex-rescue', n: 1, tabId: 'w1:t8', paneId: 'w1:s1', file: '/t/x.jsonl', label: LABEL, codexJob: doneJobRec }))
  startSeat('codex:codex-rescue', { DCTR_TEST_TABLIST_FAILS: '1' })
  check('and a finished codex tab whose LIST CALL FAILED is spared, marker intact',
    // `called(/^tab list/)` is what makes the two negatives mean something: without it, a run where
    // the codex block never executed at all satisfies "did not close" and "marker survives" exactly
    // as a correct spare does. A clause whose predicate is only absences must prove it was there.
    called(/^tab list/m) && !called(/^tab close w1:t8/m) && stillSeatOne(),
    `tab list attempted: ${called(/^tab list/m)}; ${callLines(/^tab (list|close)/).join(' | ') || '(no tab calls)'}`)

  reset(); followedSeat(doneJobRec); startSeat('Explore')
  check('and an ordinary seat placement closes nothing: only a codex placement sweeps', !called(/^pane close w1:s1/m) && stillSeatOne(), callLines(/^pane close/).join(' | '))

  // The fixture proof: these four differ only in the job status, the focus flag and the placed type,
  // so each check above must be reading the thing it names.
  check('the close-on-next fixtures really differ: one job completed, one running, and the records say so',
    R(doneJobRec).status === 'completed' && R(runningJob).status === 'running' && doneJobRec !== runningJob,
    `${R(doneJobRec).status} vs ${R(runningJob).status}`)

  // The watcher on a job that is still running: it stays up and leaves the label alone until the
  // record changes, then shows the log's last bytes, relabels and exits. The test replaces the record
  // by temp-write and rename so the watcher never reads a half-written file.
  reset()
  const live = spawn('node', [hook, '--codex-tail', runningJob, 'w1:s1', LABEL], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, ...watcherEnv } })
  let liveOut = ''
  live.stdout.on('data', (d) => { liveOut += d })
  const liveExit = new Promise((resolve) => live.on('exit', (code) => resolve(code)))
  await new Promise((r) => setTimeout(r, SURVIVES_MS))
  check('the watcher stays alive while the job runs', live.exitCode === null, `exit ${live.exitCode}`)
  check('and does not relabel the pane yet', !called(/^pane rename w1:s1/m), callLines(/^pane rename/).join(' | '))
  const finished = { ...R(runningJob), status: 'completed' }
  fs.writeFileSync(`${runningJob}.tmp`, JSON.stringify(finished)); fs.renameSync(`${runningJob}.tmp`, runningJob)
  fs.appendFileSync(finished.logFile, 'last line of task-run\n')
  const bound = setTimeout(() => live.kill('SIGKILL'), 8000)
  const liveCode = await liveExit
  clearTimeout(bound)
  check('and exits once the record leaves running', liveCode === 0, `exit ${liveCode}: ${liveOut}`)
  check('having shown the log written while it waited', liveOut.includes('last line of task-run'), liveOut)
  check('and relabelled the pane with the final status', called(/^pane rename w1:s1 codex-codex-rescue · Red team the spec · completed$/m), callLines(/^pane rename/).join(' | '))
  job('task-run', now, WS, 'running')

  // The plugin writes the record `queued` first and its worker rewrites it `running`; a watcher that
  // reads any status but running as the end exits on the first read with `· queued`.
  reset()
  const queuedJob = job('task-queued', now, WS, 'queued')
  const queuedAtStart = R(queuedJob).status
  const q = spawn('node', [hook, '--codex-tail', queuedJob, 'w1:s1', LABEL], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, ...watcherEnv } })
  const qExit = new Promise((resolve) => q.on('exit', (code) => resolve(code)))
  const rewrite = (status) => { fs.writeFileSync(`${queuedJob}.tmp`, JSON.stringify({ ...R(queuedJob), status })); fs.renameSync(`${queuedJob}.tmp`, queuedJob) }
  // A CONDITION, not a duration — the same repair the latency block below carries, which this block
  // did not get. The watcher drains the log only inside a poll, so its output proves a poll ran and
  // therefore that the record was READ while it still said `queued`. A fixed sleep proved nothing:
  // a watcher that started after the flip never saw `queued` at all and the clause passed green
  // having tested none of what it names, which 8-way spawn contention is exactly what makes reachable.
  let qOut = ''
  q.stdout.on('data', (d) => { qOut += d })
  const qSeen = Date.now() + 8000
  while (!qOut.includes('codex output for task-queued') && Date.now() < qSeen) await new Promise((r) => setTimeout(r, 5))
  const qReady = qOut.includes('codex output for task-queued')
  rewrite('running')
  await new Promise((r) => setTimeout(r, SURVIVES_MS))
  check('the watcher outlives a record that was queued before it ran, having been SHOWN to read it as queued',
    qReady && q.exitCode === null, `ready ${qReady}, exit ${q.exitCode}`)
  rewrite('completed')
  const qBound = setTimeout(() => q.kill('SIGKILL'), 8000)
  const qCode = await qExit
  clearTimeout(qBound)
  check('and exits once it completes', qCode === 0, `exit ${qCode}`)
  const qRenames = callLines(/^pane rename w1:s1 /)
  check('with exactly one rename, to completed', qRenames.length === 1 && qRenames[0] === `pane rename w1:s1 ${LABEL} · completed`, qRenames.join(' | '))

  // The injected interval must be HONOURED, not merely accepted. Reverting dctr-seat.mjs to the
  // literal 250/2000 leaves every OTHER clause in this suite green — a reviewer proved it by doing
  // exactly that — because every bound here is generous enough to swallow a 2000ms poll. So this
  // measures the latency the interval decides: a job that turns terminal while the watcher runs is
  // noticed one poll later. At the injected 25ms that is tens of milliseconds; at the production
  // 2000ms it cannot come in under the bound, which is what makes this clause discriminate.
  reset()
  const latencyJob = job('task-latency', now, WS, 'running')
  const lw = spawn('node', [hook, '--codex-tail', latencyJob, 'w1:s1', LABEL], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, DCTR_POLL_MS: '25' } })
  let lwOut = ''
  lw.stdout.on('data', (d) => { lwOut += d })
  const lwExit = new Promise((resolve) => lw.on('exit', (code) => resolve(code)))
  // A CONDITION, not a duration: wait until the watcher has drained the log, which only happens
  // inside a poll, so we know it has read the record as `running` before we flip it. A fixed sleep
  // let the very first poll land AFTER the flip, and the clause then passed at any interval.
  const drained = async (marker) => {
    const until = Date.now() + 8000
    while (!lwOut.includes(marker) && Date.now() < until) await new Promise((r) => setTimeout(r, 5))
    return lwOut.includes(marker)
  }
  const OFF_BEAT_MS = 2100   // just past where a PRODUCTION poll would land, see below
  // Readiness is REQUIRED, not best-effort: flipping unconditionally after the deadline let a slow
  // watcher start AFTER the flip and exit on its own first poll, passing at any interval.
  //
  // FLIP OFF THE PRODUCTION BEAT. An earlier repair claimed two log markers proved a record read had
  // completed between them; they do not. `pump` runs on its OWN setInterval, independent of the poll
  // (dctr-seat.mjs), so both drains can come from the pump with no record read anywhere between
  // them — a red team produced a schedule passing at 249ms with the injected interval ignored.
  //
  // What the clause can actually prove is timing, so prove timing. A watcher on the PRODUCTION
  // 2000ms interval polls at 2000, 4000, ...; flipping at ~2100ms after start puts the next such
  // poll ~1900ms away, well outside the 500ms bound. A watcher honouring the injected 25ms interval
  // notices within one interval wherever the flip lands. The bound is what discriminates, and the
  // off-beat offset is what stops a production-interval poll landing on the flip by luck.
  const latencyLog = path.join(jobs, 'task-latency.log')
  const lwStarted = Date.now()
  const ready = await drained('codex output for task-latency')
  if (ready) {
    const untilOffBeat = lwStarted + OFF_BEAT_MS
    while (Date.now() < untilOffBeat) await new Promise((r) => setTimeout(r, 10))
  }
  const flipped = Date.now()
  fs.writeFileSync(`${latencyJob}.tmp`, JSON.stringify({ ...R(latencyJob), status: 'completed' })); fs.renameSync(`${latencyJob}.tmp`, latencyJob)
  const lwBound = setTimeout(() => lw.kill('SIGKILL'), 8000)
  const lwCode = await lwExit
  clearTimeout(lwBound)
  const latency = Date.now() - flipped
  // Deterministic in BOTH directions, which a bare latency bound is not. The flip lands immediately
  // after the watcher's first poll, so the next poll is a full interval away: ~25ms as injected,
  // ~2000ms if the injection is ignored. 500ms sits an order of magnitude above the first and a
  // factor of four below the second, which is the margin that survives 8-way parallel load.
  check('the injected poll interval is HONOURED: a job turning terminal right after a poll is noticed within one INJECTED interval, not one production interval',
    ready && lwCode === 0 && latency < 500,
    `ready ${ready}, exit ${lwCode} after ${latency}ms; reverted to the 2000ms default this lands near 2000ms`)

  // The bytes the job writes between the watcher's last periodic read of the log and its read of the
  // record would be lost without one more read of the log after the record. The interval read runs
  // every quarter second, so no ordinary fixture can put bytes into that window: the record is served
  // through a FIFO, whose open blocks the watcher inside its record read, and the log is appended
  // while it is held there. The watcher is single-threaded, so nothing else reads the log first.
  reset()
  const fifo = path.join(jobs, 'task-fifo.json'); execFileSync('mkfifo', [fifo])
  const fifoLog = path.join(jobs, 'task-fifo.log'); fs.writeFileSync(fifoLog, 'codex output for task-fifo\n')
  // A non-blocking writer open succeeds only while a reader holds the FIFO open. It also succeeds
  // against the reader's descriptor from the previous read, before it closes, and a record written
  // there is lost with the next read waiting on a FIFO with no writer; so each serve first waits for
  // ENXIO, the reader having closed, and then for the next reader. Both waits are bounded, since a
  // watcher that exits early leaves no reader and a blocking open would then hold this suite forever.
  const openWriter = () => { try { return fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK) } catch (e) { if (e.code === 'ENXIO') return null; throw e } }
  const serve = (status, beforeWrite) => {
    const until = Date.now() + 8000
    for (let fd = openWriter(); fd !== null && Date.now() < until; fd = openWriter()) { fs.closeSync(fd); sleepMs(5) }
    let fd = null
    while (fd === null && Date.now() < until) { fd = openWriter(); if (fd === null) sleepMs(5) }
    if (fd === null) return
    if (beforeWrite) beforeWrite()
    fs.writeSync(fd, JSON.stringify({ id: 'task-fifo', workspaceRoot: WS, createdAt: new Date(now).toISOString(), status, pid: null, logFile: fifoLog }))
    fs.closeSync(fd)
  }
  const fw = spawn('node', [hook, '--codex-tail', fifo, 'w1:s1', LABEL], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, ...watcherEnv } })
  let fwOut = ''
  fw.stdout.on('data', (d) => { fwOut += d })
  const fwExit = new Promise((resolve) => fw.on('exit', (code) => resolve(code)))
  serve('running')   // the read that starts the watcher
  serve('running')   // its first poll
  let appendedWhileHeld = false
  serve('completed', () => { fs.appendFileSync(fifoLog, 'last line of task-fifo\n'); appendedWhileHeld = true })
  const fwBound = setTimeout(() => fw.kill('SIGKILL'), 8000)
  const fwCode = await fwExit
  clearTimeout(fwBound)
  check('the watcher exits after the record served through the FIFO leaves running', fwCode === 0, `exit ${fwCode}: ${fwOut}`)
  check('having shown the log written after it started', fwOut.includes('last line of task-fifo'), fwOut)

  // The watcher itself, against a job that has already left `running`: it prints the log, renames
  // the pane with the status and exits, leaving the pane's shell where the output is.
  reset()
  const doneJob = job('task-done', now, WS, 'completed')
  let tail
  try {
    tail = { code: 0, out: execFileSync('node', [hook, '--codex-tail', doneJob, 'w1:s1', LABEL], { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, ...watcherEnv } }) }
  } catch (e) { tail = { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
  check('the watcher exits once the job is no longer running', tail.code === 0, `exit ${tail.code}: ${tail.out}`)
  check('and relabels the pane with the status', called(/^pane rename w1:s1 codex-codex-rescue · Red team the spec · completed$/m), callLines(/^pane rename/).join(' | '))
  check('and showed the log', tail.out.includes('codex output for task-done'), tail.out)

  console.log('clause 3: the codex and meta fixtures really carry what their clauses lean on, proved without the hook')
  check('the running job really is this workspace, running, and within the last minute',
    R(runningJob).workspaceRoot === WS && R(runningJob).status === 'running' && Date.parse(R(runningJob).createdAt) >= now - 60000)
  check('the old job really is older than the window and the other job really is another workspace, though newer',
    Date.parse(R(oldJob).createdAt) < now - 60000 && R(otherJob).workspaceRoot !== WS && Date.parse(R(otherJob).createdAt) > Date.parse(R(runningJob).createdAt))
  check('the done job really is not running', R(doneJob).status !== 'running')
  check('the FIFO fixture really is a FIFO, and its last line really was appended while the watcher was held in its record read', fs.statSync(fifo).isFIFO() && appendedWhileHeld && fs.readFileSync(fifoLog, 'utf8').endsWith('last line of task-fifo\n'))
  check('the queued fixture really read queued before its watcher started, and is completed now', queuedAtStart === 'queued' && R(queuedJob).status === 'completed', `${queuedAtStart} / ${R(queuedJob).status}`)
  check('the foreign record really claims this workspace, is newer than the running job, and sits in a directory not named for it',
    R(foreignJob).workspaceRoot === WS && Date.parse(R(foreignJob).createdAt) > Date.parse(R(runningJob).createdAt) && !path.basename(path.dirname(foreignJobs)).startsWith('doctrine-skills-'))
  const metaFixture = JSON.parse(fs.readFileSync(path.join(tmp, 'proj', 'sess', 'subagents', 'agent-a7.meta.json'), 'utf8'))
  check('the meta fixture really carries a description, at the path derived from the transcript',
    metaFixture.description === 'Fresh refuter of N1-N16' && !fs.existsSync(path.join(tmp, 'proj', 'sess', 'subagents', 'agent-a8.meta.json')))
}

console.log('clause 3 — the fixtures really carry their defects, proved without the hook')
{
  reset()
  fs.writeFileSync(path.join(seatsDir, 'dctr-broken-9.json'), 'not json at all')
  let reallyBad = false
  try { JSON.parse(fs.readFileSync(path.join(seatsDir, 'dctr-broken-9.json'), 'utf8')) } catch { reallyBad = true }
  check('the unreadable-marker fixture really does not parse', reallyBad)

  const probe = execFileSync('bash', ['-c', `${bin}/herdr pane close w1:s2 >/dev/null 2>&1; echo $?`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CLOSE_FAILS: 'w1:s2' } }).trim()
  check('the failing-close fixture really fails for that pane', probe === '1', `exit ${probe}`)
  const ok = execFileSync('bash', ['-c', `${bin}/herdr pane close w1:s1 >/dev/null 2>&1; echo $?`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CLOSE_FAILS: 'w1:s2' } }).trim()
  check('and really succeeds for any other pane', ok === '0', `exit ${ok}`)

  // The gone fixture, proved independently: the right CODE, on stderr, with a non-zero exit. Asserted
  // separately from the exit status because both failures exit 1 and only the code tells them apart —
  // which is the whole of what the clauses above turn on.
  const gone = execFileSync('bash', ['-c', `${bin}/herdr pane close w1:s3 2>&1 1>/dev/null; echo "rc=$?"`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CLOSE_GONE: 'w1:s3' } }).trim()
  check('the gone fixture really answers pane_not_found, on stderr', /"code":"pane_not_found"/.test(gone), gone)
  check('and really exits non-zero, exactly as a transport failure does', /rc=1/.test(gone), gone)
  const goneTab = execFileSync('bash', ['-c', `${bin}/herdr tab close w1:t3 2>&1 1>/dev/null; echo "rc=$?"`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_CLOSE_GONE: 'w1:t3' } }).trim()
  check('the gone TAB fixture answers tab_not_found, a different code', /"code":"tab_not_found"/.test(goneTab), goneTab)

  // The steal fixture, proved without the hook: the tripwire really does rewrite the marker when it
  // is called to close a pane, which is the whole basis of the interleaving clause above.
  reset()
  const stealTarget = path.join(seatsDir, 'steal-probe.json')
  fs.writeFileSync(stealTarget, '{"agent_id":"before"}')
  execFileSync('bash', ['-c', `${bin}/herdr pane close w1:sX >/dev/null 2>&1`],
    { env: { ...process.env, DCTR_TEST_STEAL_MARKER: stealTarget, DCTR_TEST_STEAL_RECORD: '{"agent_id":"after"}' } })
  const stole = JSON.parse(fs.readFileSync(stealTarget, 'utf8')).agent_id
  check('the steal fixture really rewrites the marker during a close', stole === 'after', stole)

  reset(); fs.chmodSync(seatsDir, 0o500)
  let reallyUnwritable = false
  try { fs.writeFileSync(path.join(seatsDir, 'probe.tmp'), 'x') } catch (e) { reallyUnwritable = e.code === 'EACCES' }
  fs.chmodSync(seatsDir, 0o700)
  check('the unwritable-seats fixture really refuses a write, with EACCES', reallyUnwritable)

  const getFail = execFileSync('bash', ['-c', `${bin}/herdr pane get w1:s9 2>&1 1>/dev/null; echo "rc=$?"`],
    { encoding: 'utf8', env: { ...process.env, DCTR_TEST_GET_FAILS: 'w1:s9' } }).trim()
  check('the failing-lookup fixture really fails, and with a code that is NOT an answer',
    /transport_error/.test(getFail) && !/not_found/.test(getFail) && /rc=1/.test(getFail), getFail)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall clauses passed')
process.exit(failures ? 1 : 0)
