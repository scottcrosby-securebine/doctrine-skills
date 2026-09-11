// Runs a long native check where the user can watch it (issue #17's gap, found 2026-09-05).
//
//   node hooks/dctr-gate.mjs <label> <out-file> -- <command...>
//
// Everything after `--` is the check's argv, passed through exactly as given: one argument runs
// under `bash -o pipefail -c`, several are executed as they stand, so `bash -c "a; b"` keeps its
// quoting. The first live use joined them with spaces and lost it (sbsforge-platform, 2026-09-05).
// `pipefail` is not cosmetic: without it a piped check reports only its last stage's status.
//
// Run by the doctrine orchestrator at step 3 for a check that will outrun the Bash tool's own
// ceiling — a full mutation gate is the known case. Inside herdr the check runs in a pane placed
// beside the session under the same rules, cap and lock as a seat, so a wave arriving mid-gate
// stacks next to it. Outside herdr the check runs detached from the harness with the same output
// file. Either way the output file ends with `exit=N` when the check is done; that line is the
// completion signal to monitor and the exit status to record, and the LAUNCHER OWNS IT: a child line
// that would start with the marker is written with one leading space, so a check that prints `exit=0`
// of its own cannot end the wait early. The pane is display; the file is the
// record. It exits 0 once the check is launched, 1 only on malformed arguments, and the check's
// own status is in the file — a display failure must never fail the gate it is showing.
//
// The pane shell starts in the launcher's cwd and with a fresh environment, so an env prefix goes
// after `--` (`-- env K=V <command>`), never on the launcher.
//
// The pane runs this same script in `--run` mode, which is also what the detached path runs:
//
//   node hooks/dctr-gate.mjs --run <out> <marker> <pane-id|''> <tab-id|''> <workspace|''> <label> -- <command>
//
// A gate placed in a TAB carries its tab id and workspace through, because the completion path runs
// inside the pane — whose shell has a fresh environment, so HERDR_WORKSPACE_ID is not there — and
// the thing it must ask about and close is the TAB, not the tab's root pane.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  PREFIX, GATE_ROLE, agentName, tabLabel, skipReason, nextIndex, stopAction, tabCreateArgs, shq,
  seatPlacement, splitArgs, staleSideSeats, gateRunCommand, exitLine, elapsedLabel, ELAPSED_MS } from './dctr-lib.mjs'
import { seatsDir, herdr, hookLog, liveSeats, withPlacementLock, sideOccupants, interactivePanes, reserveMarker, writeMarker, isPaneNotFound, isTabNotFound } from './dctr-state.mjs'

/** Why the column could not be observed. sideOccupants answers null and throws the reason away, and
 *  a log line naming no file is one the operator cannot act on. Read again only on the failure. */
const sideColumnReason = () => { try { interactivePanes(); return 'the layout could not be read' } catch (e) { return e.message } }

const self = path.resolve(process.argv[1])
const argv = process.argv.slice(2)
const usage = () => {
  console.error('usage: node dctr-gate.mjs <label> <out-file> -- <command...>')
  console.error("   or: node dctr-gate.mjs --run <out> <marker> <pane-id|''> <tab-id|''> <workspace|''> <label> -- <command...>")
  process.exit(1)
}

if (argv[0] === '--run') {
  // Inside the pane, or detached. Run the check, tee, mark the exit, tidy the pane.
  const [, out, marker, paneId, tabId, workspace, label] = argv
  // THE SEPARATOR'S POSITION IS THE CONTRACT, not merely its presence. These arguments are read by
  // position, so a caller that omits one slides every later value left: omit the workspace and
  // `workspace` becomes the label while `label` becomes `--`, which the old guard accepted because
  // `--` is truthy. The launcher then queried the wrong workspace and, on a successful list that did
  // not carry this tab, closed the tab by id. Requiring the separator at exactly index 7 and a
  // non-empty command makes the whole class of slid arguments impossible rather than relying on
  // every caller to remember its placeholders. Same shape as the outer form's guard below.
  const dash = argv.indexOf('--')
  if (dash !== 7 || !out || !label || argv.length < 9) usage()
  const command = argv.slice(dash + 1)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const file = fs.openSync(out, 'w')
  // ONLY THE LAUNCHER MAY WRITE THE COMPLETION MARKER, and that means every OTHER write is guarded —
  // the child's output and the launcher's own header alike. The completion contract is a line starting
  // `exit=`, so anything else that produces one ends the documented `until grep -q '^exit='` wait
  // while the check is still running. It needs no hostile input: `env` with a variable named `exit`
  // prints `exit=0`, and a single-string command containing a newline puts its own forged line into
  // the echoed header BEFORE the child is even spawned (found by the red team, 2026-09-11, after a
  // first repair that guarded only the child and claimed ownership it did not have).
  //
  // The marker is DERIVED from the function that owns it rather than restated: `exitLine('')` is
  // exactly the marker with no code after it. A literal here would fork from dctr-lib.mjs the first
  // time either was corrected.
  //
  // BYTES, NOT STRINGS. An earlier revision of this guard decoded each chunk with `String(chunk)`,
  // which corrupts any multi-byte character split across a chunk boundary: a three-byte `€` arriving
  // as one byte then two decoded to three replacement characters, where the original `fs.writeSync`
  // of the raw chunk had preserved it. The marker is ASCII, so the scan is byte-oriented and every
  // other byte is passed through untouched.
  const MARKER = Buffer.from(exitLine(''))
  const SPACE = Buffer.from(' ')
  const NEWLINE = Buffer.from('\n')
  let atLineStart = true
  let carry = Buffer.alloc(0)
  const raw = (buf) => { fs.writeSync(file, buf); try { process.stdout.write(buf) } catch { /* no terminal on the detached path */ } }
  /** Every write that is not the completion receipt. A line that would start with the marker gets one
   *  leading space and stays readable. `carry` holds back at most four bytes, and only a tail that
   *  could still grow into the marker at a line start, so a chunk boundary splitting `exi|t=` cannot
   *  smuggle one through. It is flushed at close, or the check's last word is lost. */
  const guarded = (input) => {
    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(String(input))
    const s = carry.length ? Buffer.concat([carry, chunk]) : chunk
    carry = Buffer.alloc(0)
    const parts = []
    let i = 0
    while (i < s.length) {
      const nl = s.indexOf(0x0a, i)
      const end = nl === -1 ? s.length : nl + 1
      const line = s.subarray(i, end)
      if (nl === -1 && atLineStart && line.length < MARKER.length && MARKER.subarray(0, line.length).equals(line)) { carry = Buffer.from(line); break }
      if (atLineStart && line.length >= MARKER.length && line.subarray(0, MARKER.length).equals(MARKER)) parts.push(SPACE)
      parts.push(line)
      atLineStart = nl !== -1
      i = end
    }
    if (parts.length) raw(Buffer.concat(parts))
  }
  /** The completion receipt: the one unguarded write, because it is the one the contract is about. */
  const receipt = (text) => { raw(Buffer.from(text)); atLineStart = text.endsWith('\n') }
  // A closed display pipe is a DISPLAY failure and must never fail the gate it is showing, which the
  // header has always promised and the async `error` event did not honour: an EPIPE on the detached
  // path ended the process at 1 with only a header in the file and no receipt at all.
  process.stdout.on('error', () => { /* display only, never the gate */ })
  guarded(`\x1b[2m── doctrine gate · ${label}\x1b[0m\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\n`)
  // `-o pipefail` because a gate passes on its exit status and a pipeline reports only its LAST
  // stage: `bash -c 'false | cat'` exits 0, so a check piped into `tee` recorded a pass it never
  // earned. Measured, and the masking is narrower than it first looks: `true | false` and
  // `false && true` both already exit non-zero, so only an upstream failure under a succeeding final
  // stage was hidden. FAIL DIRECTION: closed. A pipeline whose consumer deliberately stops early
  // (`... | head -1`) now surfaces its SIGPIPE as a gate failure, which is the safe direction to be
  // wrong in: a false failure is visible and a false pass is not.
  const child = command.length === 1
    ? spawn('bash', ['-o', 'pipefail', '-c', command[0]], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(command[0], command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
  // The check never started, so the pane is ALIVE and nothing here closes it. Keeping the record is
  // the whole point of having one: dropping it left exactly the live-pane-with-no-record that the
  // completion path above is written to avoid, one screen up in the same function.
  child.on('error', (e) => { guarded(`${e.message}\n`); receipt(`${exitLine(127)}\n`); fs.closeSync(file); process.exit(127) })
  child.stdout.on('data', guarded)
  child.stderr.on('data', guarded)
  child.stdout.on('error', () => { /* display only, never the gate */ })
  child.stderr.on('error', () => { /* display only, never the gate */ })
  // The progress name. Only on the pane path: `paneId` is empty when this same mode serves the
  // detached path, and a rename with no pane is a herdr call that can only fail. The herdr call is
  // synchronous and bounded at HERDR_TIMEOUT_MS, so a hung server delays this pump rather than
  // losing bytes — the child's pipe buffers meanwhile. unref'd so it never holds the process open.
  const started = Date.now()
  const ticker = paneId
    ? setInterval(() => { try { herdr(['pane', 'rename', paneId, elapsedLabel(label, Date.now() - started)]) } catch { /* display only, never the gate */ } },
      Number(process.env.DCTR_ELAPSED_MS) || ELAPSED_MS)
    : null
  ticker?.unref()
  // No clearInterval below on purpose. This handler runs synchronously through to process.exit, so
  // no timer can fire between the last tick and the exit rename, and the mutation gate reported the
  // guard as pinned by nothing. That is not on its own a reason to leave it out — CLAUDE.md's rule
  // is that no fixture reaching a guard means a MISSING FIXTURE, not a dead branch. It is out because
  // the two paths are behaviourally identical: with the handler running synchronously through to
  // process.exit, a clearInterval and no clearInterval cannot produce different output.
  child.on('close', (code) => {
    // Flush a held-back marker prefix before the marker itself is written, or `exi` from the child's
    // last unterminated write would land after the exit line instead of before it.
    // Flush a held-back marker prefix, or the check's final bytes are dropped without a trace.
    if (carry.length) { raw(carry); carry = Buffer.alloc(0); atLineStart = false }
    // A check whose last write has no newline would otherwise fuse with the exit line, and the
    // monitor grepping for `^exit=` would wait forever (the selftest's printf fixture did this).
    if (!atLineStart) { raw(NEWLINE); atLineStart = true }
    receipt(`${exitLine(code)}\n`)
    fs.closeSync(file)
    // ASK FIRST, then remove the record only on the branches that actually act. Only `pane close`
    // kills the shell this process runs in; `pane get` and `pane rename` do not, and an earlier
    // revision never checked which. Removing the record up front and restoring it on failure was
    // remove-then-write-BY-NAME across a herdr round trip — the hazard dctr-seat.mjs declines in
    // writing, because nextIndex reissues a freed name and the restore then clobbers a live gate's
    // record. It also wrote with writeFileSync, the only non-atomic marker write in shipping code,
    // against a file whose own module says a truncated marker stands down every later seat.
    // Removing the machinery removes all three defects: there is no window and nothing to restore.
    const dropMarker = () => { if (marker) try { fs.rmSync(marker, { force: true }) } catch { /* nothing to undo */ } }
    if (tabId) {
      // A TAB gate asks the TAB. Scott's ruling, 2026-09-08, and CLAUDE.md law: the thing being
      // closed is the tab, so the thing whose focus decides it is the tab. This launcher asked
      // `pane get` about the tab's ROOT pane and then closed that pane — a different question from
      // the one it acted on, and the exact defect the sibling hook had repaired at dctr-seat.mjs.
      // A user who splits this tab and closes the root leaves a focused sibling: `pane_not_found`
      // on the root was read as an observed absence and dropped the marker, orphaning the tab for
      // the rest of the session, because staleSideSeats never judges a tab seat.
      let mine, listFailed = null
      // herdr-lint: separated by the listFailed FLAG: a failed list becomes `unknown`, which keeps the record and closes nothing.
      try {
        const tabs = herdr(['tab', 'list', '--workspace', workspace]).result.tabs
        mine = tabs.find((t) => t.tab_id === tabId)
      } catch (e) { listFailed = String(e.message).split('\n')[0] }
      // The partial-entry worry is CLOSED, verified at herdr's source on 2026-09-08 against v0.8.2
      // (the shipped binary) and v0.9.0: TabInfo carries `tab_id` and `focused` as plain non-Option
      // fields with no skip_serializing_if, and tab_info() is total over the caller's own
      // 0..tabs.len(), so an id-less entry cannot be emitted and a tab that exists is never left
      // out. Listed-and-absent really is an absence. Re-check if TabInfo ever gains an Option.
      // Listed and ABSENT is an observed absence and closes by id (issue #20); a list that FAILED
      // answered nothing. Identical to the seat hook's tab stop, deliberately: two launchers making
      // the same decision differently is what put this defect here.
      const act = listFailed ? 'unknown' : mine ? stopAction(mine) : 'close'
      if (act === 'unknown') {
        process.stderr.write(`${PREFIX}: focus of ${tabId} could not be observed (${listFailed || 'no readable focus'}); leaving it for SessionEnd\n`)
      } else if (act === 'relabel') {
        // The tab LIVES and the user is watching it, so its record must live too.
        try { herdr(['tab', 'rename', tabId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }
      } else {
        // The record stays, for the same reason as the pane branch below: this call kills the shell,
        // and a close that fails must leave SessionEnd something to act on. A tab marker is swept by
        // SessionEnd rather than by the next placement, since staleSideSeats never judges one.
        try { herdr(['tab', 'close', tabId]) } catch { /* the tab may already be gone */ }
      }
    } else if (paneId) {
      // Same rule as a seat's stop, and the same THREE answers. A lookup that FAILED is not a pane
      // that is unfocused: this bare catch fed `stopAction` an undefined it could not distinguish
      // from an observed absence, so a transport blip closed the gate pane the user was watching.
      let pane, gone = false
      try { pane = herdr(['pane', 'get', paneId]).result.pane }
      catch (e) { if (isPaneNotFound(e)) gone = true }
      // No `lookupFailed` branch: a throw leaves `pane` unassigned and stopAction already answers
      // `unknown` for that, so a branch testing it separately could not change any outcome and no
      // fixture could reach it. Established, not assumed — the mutation gate reverted it and every
      // clause stayed green, which for a guard whose two paths are behaviourally identical is the
      // dead-branch case and not the missing-fixture one.
      const act = gone ? 'gone' : stopAction(pane)
      if (act === 'unknown') {
        // Keep the record. SessionEnd is the only thing that can still reach this pane.
        process.stderr.write(`${PREFIX}: focus of ${paneId} could not be observed; leaving it for SessionEnd\n`)
      } else if (act === 'gone') {
        dropMarker()   // nothing to close, and nothing left for a record to point at
      } else if (act === 'relabel') {
        // The pane LIVES and the user is watching it, so its record must live too: dropping it here
        // left a focused gate pane that SessionEnd could no longer find.
        try { herdr(['pane', 'rename', paneId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }
      } else {
        // DO NOT drop the record here (Scott's ruling, 2026-09-08). The ordering is forced — this
        // call kills the shell, so nothing after it is guaranteed to run — but the price is not.
        // Dropping first paid a PERMANENT live-pane-with-no-record whenever the close failed for a
        // transport reason: SessionEnd reaches panes only through surviving records, and
        // `sideOccupants` counts markers rather than layout panes, so the column then under-counts
        // and a seventh pane can be split onto six. The marker a SUCCESSFUL close leaves behind
        // costs one gate name until the next placement and is self-correcting: its pane is gone from
        // the layout, so `staleSideSeats` drops it there, and SessionEnd's own close answers
        // `pane_not_found`, which it already reads as "already gone".
        try { herdr(['pane', 'close', paneId]) } catch { /* the shell may already be gone */ }
      }
    } else dropMarker()
    process.exit(code ?? 1)
  })
} else {
  const dash = argv.indexOf('--')
  const [label, out] = argv
  if (dash !== 2 || !label || !out || argv.length < 4) usage()
  const command = argv.slice(dash + 1)
  const outFile = path.resolve(out)
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID

  const detached = (reason) => {
    // FOUR empties: marker, paneId, tabId, workspace. The detached path has no pane and no tab, and
    // `--run` reads by position — with two of them missing the label landed in the tabId slot and the
    // completion path called `tab list` on a path whose whole contract is that it touches herdr zero
    // times. The tripwire clause caught it; the placeholders are what keep it caught.
    const child = spawn('node', [self, '--run', outFile, '', '', '', '', label, '--', ...command], { detached: true, stdio: 'ignore' })
    child.unref()
    hookLog(sessionId, `gate "${label}" no pane — ${reason}; detached pid ${child.pid}, output ${outFile}`)
    console.log(`${PREFIX}-gate: no pane (${reason}) — running detached, pid ${child.pid}; output ${outFile}, done when its last line is exit=N`)
    process.exit(0)
  }

  // Contained posture first, as in the hook: a contained agent must reach nothing on the host, and
  // the pane a herdr server spawns is a host process. The check still runs, detached.
  const reason = (process.env.DCTR_VIEW_REQUEST_DIR ? 'contained session (DCTR_VIEW_REQUEST_DIR set), no host pane' : null) ??
    skipReason(process.env) ??
    (process.env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID in the environment') ??
    (sessionId ? null : 'no CLAUDE_CODE_SESSION_ID in the environment')
  if (reason) detached(reason)

  let placed
  try {
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })
    placed = withPlacementLock(sessionId, () => {
      // A failed layout read is "I could not look": sideOccupants returns null below and this seat
      // takes the tab path rather than splitting onto a column it cannot see. It did once fall back
      // to stacking on the newest side pane, and that could stack onto a pane in another tab.
      let layout = null
      // herdr-lint: creation, not destruction. An unreadable layout falls to the tab path, which destroys nothing.
      try { layout = herdr(['pane', 'layout', '--pane', process.env.HERDR_PANE_ID]).result.layout.panes } catch { /* tab path below */ }
      // THROW, never return a reason. This callback's contract is a placement object and the caller
      // reads its fields; a string return made every field undefined, skipped `pane run` entirely,
      // and printed "undefined running in pane undefined" while the check never ran. The seat hook
      // stands down by returning a reason; this launcher does not have that protocol.
      let seats
      try { seats = liveSeats(sessionId) } catch (e) { throw new Error(`could not read this session's seat markers (${e.message})`) }
      for (const s of staleSideSeats(seats, layout)) {
        try { fs.rmSync(path.join(seatsDir(sessionId), `${s.agent}.json`), { force: true }) } catch { /* best effort */ }
      }
      seats = seats.filter((s) => !staleSideSeats([s], layout).length)
      const taken = seats.map((s) => s.agent)
      let n = nextIndex(GATE_ROLE, taken)
      let marker = null, name = null, fatal = null
      // EEXIST is the name being taken, and it is the ONLY reason to try the next one. Every other
      // errno — EACCES on a seats directory we cannot write, ENOSPC on a full disk — will hit the
      // next name identically, so treating them all as collisions spun this loop forever WHILE
      // HOLDING THE PLACEMENT LOCK: measured at 1000 reservation attempts with no exit and no
      // deadline, blocking every seat behind it.
      //
      // No index bound here on purpose. One was added and removed in the same round: with the errno
      // split above, a real failure leaves through `fatal`, and unbounded EEXIST would need another
      // process to steal each freshly-chosen name in turn, which a six-pane cap does not produce.
      // The mutation gate reported it as pinned by nothing, which under CLAUDE.md's narrowed rule
      // asks for a fixture rather than licensing a deletion. It stays out because the bound would be
      // unreachable, not merely unpinned: `nextIndex` carries the only bound that fires.
      while (n && !marker && !fatal) {
        name = agentName(GATE_ROLE, n)
        try {
          marker = path.join(seatsDir(sessionId), `${name}.json`)
          reserveMarker(marker)
        } catch (e) {
          if (e.code !== 'EEXIST') { fatal = e; marker = null; break }
          marker = null; n += 1
        }
      }
      if (fatal) throw new Error(`could not reserve a gate marker (${fatal.message})`)
      if (!marker) throw new Error('could not allocate a gate name')

      let tabId = null, paneId = null
      try {
        // Same rule as the seat hook: an interactive pane counts toward the cap and can be the
        // split target, but is never swept and never allocated a seat name. A null return is "I
        // could not look" and takes the tab path; counting an unobservable column as empty is how
        // a seventh pane got split on top of six.
        const occupants = sideOccupants(seats, layout)
        if (!occupants) hookLog(sessionId, `gate "${label}": could not observe the side column (${sideColumnReason()}); taking the tab path`)
        if (occupants && seatPlacement(occupants, process.env.HERDR_PANE_ID) === 'pane') {
          // herdr-lint: creation. The catch retries the split, and the retry sets paneId null for the tab path.
          try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout, process.cwd())).result.pane.pane_id }
          // herdr-lint: creation. Its catch sets paneId null, which takes the tab path.
          catch { try { paneId = herdr(splitArgs([], process.env.HERDR_PANE_ID, null, process.cwd())).result.pane.pane_id } catch { paneId = null } }
        }
        if (!paneId) {
          const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(GATE_ROLE, n), process.cwd()))
          tabId = tab.result.tab.tab_id
          paneId = tab.result.root_pane.pane_id
        }
        // The split path had no name at all until 2026-09-07: `splitArgs` takes no label and nothing
        // renamed afterwards, so a side-column gate pane was nameless for its whole run — the
        // completion rename below fires only on a FOCUSED pane. Both sibling launchers rename after
        // a split (dctr-seat.mjs, dctr-pane.mjs). The tab path is already named by `tab create`.
        if (!tabId) try { herdr(['pane', 'rename', paneId, label]) } catch (e) { hookLog(sessionId, `gate "${label}": rename of ${paneId} failed (${String(e.message).split('\n')[0]})`) }
        writeMarker(marker, { agent: name, role: GATE_ROLE, n, tabId, paneId, file: outFile, label })
        herdr(['pane', 'run', paneId, gateRunCommand(self, outFile, marker, paneId, tabId, process.env.HERDR_WORKSPACE_ID, label, command)])
      } catch (e) {
        // Close FIRST, then drop the record, and only if the close was answered. This runs in the
        // launcher process rather than inside the pane's own shell, so the ordering the completion
        // path is forced into does not apply here — and removing the record first left a failed
        // rollback holding a live pane that nothing could ever find.
        let orphaned = false
        if (paneId) try { herdr(tabId ? ['tab', 'close', tabId] : ['pane', 'close', paneId]) }
        catch (ce) { orphaned = !(tabId ? isTabNotFound(ce) : isPaneNotFound(ce)) }
        if (!orphaned) try { fs.rmSync(marker, { force: true }) } catch { /* nothing to undo */ }
        else {
          // PUBLISH a real record, do not just keep whatever is there. If writeMarker was what
          // failed, the file is still reserveMarker's `{}` — it carries no paneId and no tabId, so
          // SessionEnd receives a marker it cannot act on while the log line claims otherwise.
          // PINNED, and the comment that said otherwise was stale. This branch is for the narrow case
          // where the placement's own writeMarker is what failed, leaving reserveMarker's `{}` — which
          // SessionEnd cannot act on. Reaching it needs the seats directory to become unwritable
          // between reserve and write, and the selftest's fake herdr does exactly that (chmod 500 on
          // the placement rename, 700 again on the close). Clause 1o drives it and a mutation removes
          // this republication. Found 2026-09-11: the comment claimed a missing fixture that had
          // since been written, which sends the next maintainer to build coverage that exists.
          // The success line is GATED on the publish, and it was not: both lines printed, the second
          // contradicting the first, and an operator reading "its record is published" then believed
          // SessionEnd could reach a pane whose record was still reserveMarker's `{}`.
          let published = false
          try {
            writeMarker(marker, { agent: name, role: GATE_ROLE, n, tabId, paneId, file: outFile, label })
            published = true
          } catch (we) { hookLog(sessionId, `gate "${label}": could not publish a record for the pane it could not close (${String(we.message).split('\n')[0]})`) }
          hookLog(sessionId, published
            ? `gate "${label}": rollback could not close ${tabId || paneId}; its record is published for SessionEnd`
            : `gate "${label}": rollback could not close ${tabId || paneId} AND could not record it; the pane is live and SessionEnd cannot reach it`)
        }
        throw e
      }
      return { name, paneId, tabId }
    })
  } catch (e) {
    detached(`could not place a pane — ${String(e.message).split('\n')[0]}`)
  }
  hookLog(sessionId, `gate "${label}" ${placed.name}: ${placed.tabId ? 'tab ' + placed.tabId : 'pane ' + placed.paneId}, output ${outFile}`)
  console.log(`${PREFIX}-gate: ${placed.name} running in ${placed.tabId ? 'tab ' + placed.tabId : 'pane ' + placed.paneId}; output ${outFile}, done when its last line is exit=N`)
}
