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
// stacks next to it. Outside herdr the check runs detached from the harness with the same two
// files. The pane is display; the files are the record. It exits 0 once the check is launched, 1 only
// on malformed arguments or when a previous run's `<out>.result` cannot be removed — a display failure
// must never fail the gate it is showing. One path is one check at a time: two launches on the same
// `<out>` are not detected, and the first to finish publishes under the other's name.
//
// TWO FILES, and the split is the whole point (Scott's ruling 2026-09-11, after three review rounds
// each found a new defect in the machinery that kept them in one file):
//
//   <out>         the transcript. The check's own bytes and NOTHING else: no verdict line, no echoed
//                 command. That is what makes it safe to read and safe to grep.
//   <out>.result  the verdict, written by this launcher alone, at completion, via a temp file and a
//                 rename so a half-written one is never readable. One line `exit=N`, plus a line
//                 `capture=incomplete` when any transcript write failed or a child output stream
//                 errored, because a status over a broken record must not read as clean, and a line
//                 `error=<message>` when the check could not be spawned at all (`exit=127`), since
//                 that message is the launcher's and the transcript is the check's. A previous run's
//                 result on the same path is removed before the check starts.
//
// Wait for the RESULT FILE to exist, never for a line inside the transcript:
//   until [ -f <out>.result ]; do sleep 15; done; cat <out>.result
//
// GRADE, stated because a reader will otherwise assume more: this stops a check from ACCIDENTALLY
// ending the wait, which is what happened — `env` with a variable named `exit` prints `exit=0`, and a
// single-string command containing a newline put the same line into the echoed header before the child
// even spawned. It does NOT stop a check that deliberately writes to `<out>.result`, since a check
// runs as this user and can write any path. Confused-agent-grade, not adversarial.
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
  const resultFile = `${out}.result`
  // The outer launcher already cleared a stale result in the caller's process, which is the removal
  // clause 8 pins. This one covers `--run` entered directly (the pane line, re-run by hand) and can
  // fail quietly: the transcript is open, so refusing here would leave a live pane over no verdict.
  try { fs.rmSync(resultFile, { force: true }) } catch { /* the outer launcher is the guarantee */ }
  // A short write leaves the transcript incomplete, and an earlier revision ignored the count that
  // says so while deriving state from the whole intended buffer. Write it all, and remember if we
  // could not: a verdict over a broken record must say so rather than read as clean.
  let captureFailed = false
  const raw = (buf) => {
    let off = 0
    while (off < buf.length) {
      let n
      try { n = fs.writeSync(file, buf, off, buf.length - off) } catch { captureFailed = true; break }
      if (!n) { captureFailed = true; break }
      off += n
    }
    try { process.stdout.write(buf) } catch { /* display only: no terminal on the detached path */ }
  }
  /** The verdict, and the only thing this launcher writes outside the transcript. Temp plus rename so
   *  a reader waiting on the file's existence can never catch it half written. */
  const writeResult = (code, error = null) => {
    const body = `${exitLine(code)}\n${captureFailed ? 'capture=incomplete\n' : ''}${error ? `error=${String(error).split('\n')[0]}\n` : ''}`
    const tmp = `${resultFile}.partial`
    // Not "nothing left to tell": the pane and stderr are still there. The wait then never ends, which
    // the time alarm bounds, and the line below says why.
    try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, resultFile) }
    catch (e) { process.stderr.write(`${PREFIX}: could not write ${resultFile} (${e.message}); the wait on it will not end\n`) }
  }
  // A closed display pipe is a DISPLAY failure and must never fail the gate it is showing, which the
  // header has always promised and the async `error` event did not honour: an EPIPE on the detached
  // path ended the process at 1 with no verdict written at all. This one really is display; the two
  // handlers on the CHILD's streams below are not, and they set captureFailed instead.
  process.stdout.on('error', () => { /* display only, never the gate */ })
  // Console only. Writing the command into the transcript is what satisfied six selftest assertions
  // that were looking for the check's own output, and it is what let a command's own text forge a
  // verdict line. The pane still shows it live; the transcript stays the check's bytes alone.
  try { process.stdout.write(`\x1b[2m── doctrine gate · ${label}\x1b[0m\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\n`) } catch { /* display only */ }
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
  // The message is the launcher's, not the check's, so it goes in the RESULT and the transcript stays
  // empty: the one launcher write the rewrite had left inside the transcript (round 4).
  child.on('error', (e) => { fs.closeSync(file); writeResult(127, e.message); process.exit(127) })
  child.stdout.on('data', raw)
  child.stderr.on('data', raw)
  // A CHILD stream error is a capture failure on the authoritative transcript, NOT a display failure.
  // An earlier revision swallowed both alike and produced a clean status over an incomplete record.
  child.stdout.on('error', () => { captureFailed = true })
  child.stderr.on('error', () => { captureFailed = true })
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
    // A close that throws (ENOSPC or a network filesystem flushing late) has lost bytes the transcript
    // was meant to hold. Say so in the verdict rather than dying with none.
    try { fs.closeSync(file) } catch { captureFailed = true }
    writeResult(code)
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
  // A REUSED PATH carried the previous run's verdict: the transcript was truncated on open but the
  // result file was not touched, so the documented existence wait returned at once with a stale
  // `exit=0` while the new check was still running. Reproduced in round 4. Removed HERE, in the
  // caller's own process before this launcher returns, and not in `--run`: that mode starts in a pane
  // or detached, and the window between this process exiting and that one reaching its first line is
  // exactly where a caller's wait would have read the stale file. Refuse to run if it cannot be
  // cleared: a wait that never ends is visible, and a stale pass is not.
  try { fs.rmSync(`${outFile}.result`, { force: true }); fs.rmSync(`${outFile}.result.partial`, { force: true }) }
  catch (e) { console.error(`${PREFIX}-gate: could not clear a previous ${outFile}.result (${e.message}); refusing to run`); process.exit(1) }

  const detached = (reason) => {
    // FOUR empties: marker, paneId, tabId, workspace. The detached path has no pane and no tab, and
    // `--run` reads by position — with two of them missing the label landed in the tabId slot and the
    // completion path called `tab list` on a path whose whole contract is that it touches herdr zero
    // times. The tripwire clause caught it; the placeholders are what keep it caught.
    const child = spawn('node', [self, '--run', outFile, '', '', '', '', label, '--', ...command], { detached: true, stdio: 'ignore' })
    child.unref()
    hookLog(sessionId, `gate "${label}" no pane — ${reason}; detached pid ${child.pid}, output ${outFile}`)
    console.log(`${PREFIX}-gate: no pane (${reason}) — running detached, pid ${child.pid}; transcript ${outFile}, done when ${outFile}.result exists`)
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
  console.log(`${PREFIX}-gate: ${placed.name} running in ${placed.tabId ? 'tab ' + placed.tabId : 'pane ' + placed.paneId}; transcript ${outFile}, done when ${outFile}.result exists`)
}
