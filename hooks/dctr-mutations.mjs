// Mutation gate for the pane launcher AND the seat hook's teardown: revert each repair in turn and require the
// selftest to NOTICE. It answers the one question a passing suite cannot — is this clause pinning
// the behaviour it is named after, or would it stay green with that behaviour removed?
//
// It exists because that question kept being answered "no" by hand, expensively. Across this
// launcher's review rounds the recurring worst finding was a check that certifies a path it does not
// take: a clause asserting a variable it never read, a fixture using a record shape no code writes,
// a fixture whose pane id the workspace filter excluded so the branch under test never ran once, and
// two repairs whose reverts left the whole suite green. A reviewer found each of those by reverting
// something and re-running. This does that on every push, in about half a minute.
//
// It mutates a COPY. The repo is never written to.
//
// SCOPE: hooks/ only, and that is a RULING (2026-09-08), not an oversight. FILES and SUITES below
// are bare names resolved against this directory, and the two tools/ checkers are `--selftest`
// flags on themselves rather than standalone suites, so reaching them means paths AND arguments
// in the one list whose own comment says a suite outside it is silently disabled. Weighed against
// four files that already carry three-clause tamper tests running in CI, it is not worth it. A
// repair in tools/ is pinned by that tool's own selftest and never by this gate.
//
// A mutation whose `from` text is absent is a FAILURE, not a skip. Otherwise renaming a line
// silently retires the mutation that guarded it, which is the same defect one level up.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { mapPool, poolShortfall, anchorCount, anchorVerdict, suiteOutcome } from './dctr-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Everything a suite READS, not only what a mutation targets. hooks.json is here because a clause
// pins SESSION_END_WAIT_MS against the SessionEnd timeout declared there; without the copy that
// clause threw ENOENT, the whole pure suite died on load, and eleven previously-pinned functions
// reported unpinned in one run. A suite that reads a file outside this list is silently disabled
// inside the gate, which is the loudest quiet failure this harness has.
const FILES = ['dctr-lib.mjs', 'dctr-state.mjs', 'dctr-pane.mjs', 'dctr-pane.selftest.mjs',
  'dctr-seat.mjs', 'dctr-seat.selftest.mjs', 'dctr-seat.teardown.selftest.mjs', 'dctr-gate.mjs', 'dctr-gate.selftest.mjs',
  'dctr-project.mjs', 'dctr-project.selftest.mjs', 'dctr-project.history.selftest.mjs', 'dctr-token.mjs', 'hooks.json']
/** Cheapest first, and the order is the MEASURED one: `some` stops at the first suite that notices,
 *  so a mutation pays for every suite ahead of the one that catches it. Measured standalone at
 *  008014d: seat 17ms, gate 439ms, pane 8.2s, teardown 19.1s. This list previously read seat, pane,
 *  teardown, gate, was commented "cheapest first", and was not: every mutation only the gate suite
 *  caught paid 27.8s instead of 0.5s. Re-measure before reordering; the comment is a claim.
 *  Project placed on 2026-09-13 by measuring on one host: seat 0.07s, project 0.57s, gate 6.07s.
 *  Project history placed the same day, measured on one host: history 0.04s, project 0.46s, seat 1.14s. */
const SUITES = ['dctr-project.history.selftest.mjs', 'dctr-seat.selftest.mjs', 'dctr-project.selftest.mjs', 'dctr-gate.selftest.mjs', 'dctr-pane.selftest.mjs', 'dctr-seat.teardown.selftest.mjs']

/** Each entry reverts one repair to what it replaced. `clause` names what should go red — it is
 *  reported when the mutation survives, so the failure says which behaviour is unpinned. */
const MUTATIONS = [
  { name: 'the single-string gate path drops pipefail, so a piped check reports its last stage', file: 'dctr-gate.mjs',
    clause: 'clause 4 — a piped check whose upstream fails under a succeeding last stage records a FAILURE',
    from: "spawn('bash', ['-o', 'pipefail', '-c', command[0]]",
    to: "spawn('bash', ['-c', command[0]]" },
  // THE SPLIT, reverted: the verdict goes back into the transcript, which is the whole contract
  // Scott's 2026-09-11 ruling replaced. Every clause that reads `<out>.result` then finds no file, and
  // clause 1 is the first of them — named here because the harness reports the clause it was told to
  // expect and accepts any failing one, so an entry naming a clause that cannot redden advertises a pin
  // it does not have. Two such entries were found on 2026-09-11.
  { name: 'the verdict is appended to the transcript instead of its own result file', file: 'dctr-gate.mjs',
    clause: 'clause 1 — a failing check puts exit=3 in the RESULT file',
    from: "    try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, resultFile) }",
    to: "    try { fs.appendFileSync(out, body) }" },
  { name: 'the transcript is written as a decoded string, corrupting a split multi-byte character', file: 'dctr-gate.mjs',
    // Aimed at 6d, not 6: 6d forces the boundary with two deliberate writes, while 6's bulk fixture
    // survives the mutation whenever the reader's chunks happen to align to the character width.
    clause: 'clause 6d — a three-byte character split across two writes arrives intact',
    from: "      try { n = fs.writeSync(file, buf, off, buf.length - off) } catch { captureFailed = true; break }",
    to: "      try { n = fs.writeSync(file, String(buf).slice(off)) } catch { captureFailed = true; break }" },
  { name: "the launcher's own header is echoed into the transcript, so a command's text can forge a verdict line", file: 'dctr-gate.mjs',
    clause: 'clause 6b — a command whose own text contains a marker line puts NO line in the transcript',
    from: "  try { process.stdout.write(`\\x1b[2m── doctrine gate · ${label}\\x1b[0m\\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\\n`) } catch { /* display only */ }",
    to: "  raw(Buffer.from(`\\x1b[2m── doctrine gate · ${label}\\x1b[0m\\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\\n`))" },
  { name: 'a transcript write that failed is not recorded, so the verdict reads clean over a broken record', file: 'dctr-gate.mjs',
    clause: 'clause 7 — a verdict over a transcript that could not be written says capture=incomplete',
    from: "      try { n = fs.writeSync(file, buf, off, buf.length - off) } catch { captureFailed = true; break }",
    to: "      try { n = fs.writeSync(file, buf, off, buf.length - off) } catch { break }" },
  { name: 'pane_not_found is read as an answer', file: 'dctr-pane.mjs', clause: 'reopen after the user closes a pane',
    from: "catch (e) { return isPaneNotFound(e) ? 'gone' : 'unknowable' }",
    to: "catch { return 'unknowable' }" },
  { name: 'a record that answered "gone" still counts', file: 'dctr-pane.mjs', clause: 'the decision table, gone-record cells',
    from: '  if (named.length) return { proceed: true, why: null, stale: named }',
    to: '  if (false) return { proceed: true, why: null, stale: named }' },
  { name: 'past the cap, overflow to a tab', file: 'dctr-pane.mjs', clause: 'past the cap, open creates a tab',
    from: "      if (seatPlacement(occupants, sessionPane) === 'pane') {",
    to: "      if (true) {" },
  { name: 'the sweep offers tab markers', file: 'dctr-pane.mjs', clause: "a closed overflow tab's marker is swept",
    from: '...mine.filter((p) => p.tabId), ...staleFromDecision',
    to: '...staleFromDecision' },
  { name: 'the unread window is re-checked after the recorder lookup', file: 'dctr-pane.mjs', clause: 'bytes arriving during the lookup refuse the write',
    from: '  const settled = size(tee)',
    to: '  const settled = end' },
  { name: 'close-on-next trusts the snapshot for a side PANE instead of re-asking', file: 'dctr-seat.mjs',
    clause: 'a side PANE focused BETWEEN the hoisted snapshot and the close is spared',
    from: `          } else {
            try {
              const pane = herdr(['pane', 'get', s.paneId]).result?.pane
              if (typeof pane?.focused === 'boolean') stillUnfocused = pane.focused === false
            } catch (e) { stillUnfocused = isPaneNotFound(e) }   // gone IS an answer; anything else is not
          }`,
    to: '          } else { stillUnfocused = true }' },
  { name: "a re-ask LIST that answered not-found is read as this tab's absence", file: 'dctr-seat.mjs',
    clause: 'a tab whose re-ask LIST answered tab_not_found is spared',
    from: `            } catch { stillUnfocused = false }   // a LIST that failed is "I could not look", about no tab in particular`,
    to: '            } catch (e) { stillUnfocused = isTabNotFound(e) }' },
  { name: 'a partially observed layout is read as a complete one', file: 'dctr-lib.mjs', clause: 'clause 1bb — an entry with no pane_id means nothing is judged stale',
    from: "  if (!layoutPanes.every((p) => p && typeof p.pane_id === 'string' && p.pane_id)) return []\n",
    to: '' },
  { name: 'a lock inside its window is not examined', file: 'dctr-state.mjs', clause: 'a lock inside its window is not examined at all',
    from: '  if (age <= (condemned === null ? pidlessMs : staleMs)) return false',
    to: '  if (false) return false' },
  { name: 'a pid-less lock gets the longer window, not the short one', file: 'dctr-state.mjs', clause: 'a pid-less lock is given the longer window',
    from: '  if (age <= (condemned === null ? pidlessMs : staleMs)) return false',
    to: '  if (age <= staleMs) return false' },
  { name: 'the pid is published exclusively', file: 'dctr-state.mjs', clause: 'publishing into a directory that already carries a pid fails',
    from: "  fs.writeFileSync(path.join(lock, 'pid'), String(pid), { flag: 'wx' })",
    to: "  fs.writeFileSync(path.join(lock, 'pid'), String(pid))" },
  { name: 'an unreadable pid is not a dead one', file: 'dctr-state.mjs', clause: 'an aged lock whose pid cannot be READ survives',
    from: "  catch (e) { return e.code === 'ENOENT' ? null : undefined }",
    to: '  catch { return null }' },
  { name: 'the break verifies even a null condemned pid', file: 'dctr-state.mjs', clause: 'a lock that acquired a pid since being condemned',
    from: '    if (moved !== condemnedPid) {',
    to: '    if (condemnedPid !== null && moved !== condemnedPid) {' },
  { name: 'sideOccupants narrows the seats too', file: 'dctr-state.mjs', clause: 'a STALE seat is not counted',
    from: '  return seats.filter(inLayout).concat(panes.filter(inLayout))',
    to: '  return seats.concat(panes.filter(inLayout))' },
  { name: 'an unreadable marker makes the column unknown', file: 'dctr-state.mjs', clause: 'an unparseable marker makes the column unknown',
    from: '    .map((f) => readMarker(path.join(panesDir(), f)))',
    to: "    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(panesDir(), f), 'utf8')) } catch { return null } })" },
  { name: 'isPaneNotFound reads the code, not the text', file: 'dctr-state.mjs', clause: 'the same code nested under another error is NOT',
    from: "      try { const code = JSON.parse(t)?.error?.code; if (code) return code } catch { /* not this line */ }",
    to: "      if (/pane_not_found/.test(t)) return 'pane_not_found'" },
  { name: 'SessionEnd keeps everything when a close failed', file: 'dctr-seat.mjs', clause: 'kept the state directory, because a pane may still be on screen',
    from: '        if (failed || unreadable.length) return',
    to: '        if (false) return' },
  { name: 'SubagentStop keeps a marker it could not close', file: 'dctr-seat.mjs', clause: 'SubagentStop keeps the marker when the close failed',
    from: "      else try { herdr(['pane', 'close', seat.paneId]) } catch (e) { if (!alreadyGone(e)) closeFailed = String(e.message).split('\\n')[0] }",
    to: "      else try { herdr(['pane', 'close', seat.paneId]) } catch { /* already gone */ }" },
  { name: 'teardown reads the seats it can and names the ones it cannot', file: 'dctr-seat.mjs', clause: 'nothing was removed, because a record we cannot read is not an answer',
    from: '        const { seats, unreadable } = liveSeatsPartial(sessionId)',
    to: '        const { seats } = liveSeatsPartial(sessionId), unreadable = []' },

  // Everything below was found by REVERTING it and watching all five suites and this harness stay
  // green. Each is a stated invariant of the launcher, and none had a clause until round 14. The
  // first is the sharpest defect the phase produced: it defeats the settled two-step-write ruling
  // and would execute an unjudged line on a live device while stdout still printed ENTER NOT SENT.
  { name: 'type sends text and STOPS — the two-step write', file: 'dctr-pane.mjs', clause: 'type does NOT press Enter',
    from: "  herdr(['pane', 'send-text', s.paneId, text])",
    to: "  herdr(['pane', 'send-text', s.paneId, text])\n  herdr(['pane', 'send-keys', s.paneId, 'enter'])" },
  { name: 'own does not advance the cursor', file: 'dctr-pane.mjs', clause: 'own does NOT advance the cursor',
    from: '    s.owner = argv[2]',
    to: '    s.owner = argv[2]; s.cursor = size(tee)' },
  { name: 'enter refuses in a contained session', file: 'dctr-pane.mjs', clause: 'enter refuses in a contained session',
    from: 'async function enter(tee) {\n  refuseUnlessHerdr()',
    to: 'async function enter(tee) {' },
  { name: 'enter presses the key herdr accepts', file: 'dctr-pane.mjs', clause: 'enter presses Enter, by that key name',
    from: "  herdr(['pane', 'send-keys', s.paneId, 'enter'])\n  await sleep(SETTLE_MS)",
    to: "  herdr(['pane', 'send-keys', s.paneId, 'Return'])\n  await sleep(SETTLE_MS)" },
  { name: 'read advances the cursor', file: 'dctr-pane.mjs', clause: 'read advances the cursor to the end it showed',
    from: '  const shown = end - s.cursor\n  s.cursor = end',
    to: '  const shown = end - s.cursor' },

  // Round 14's repairs. The seat hook now makes the same answer-versus-failure distinction the
  // launcher makes, on both the close and the lookup, and for tabs as well as panes.
  { name: 'a pane close that answered not-found is not a failure', file: 'dctr-seat.mjs', clause: 'SubagentStop removes the marker of a pane herdr says is not there',
    from: "      else try { herdr(['pane', 'close', seat.paneId]) } catch (e) { if (!alreadyGone(e)) closeFailed = String(e.message).split('\\n')[0] }",
    to: "      else try { herdr(['pane', 'close', seat.paneId]) } catch (e) { closeFailed = String(e.message).split('\\n')[0] }" },
  { name: 'SessionEnd counts a not-found close as done, not as failed', file: 'dctr-seat.mjs', clause: 'SessionEnd sweeps the state directory when the only close that threw was pane_not_found',
    from: '            if (seat.tabId ? isTabNotFound(e) : isPaneNotFound(e)) log(`SessionEnd: ${seat.tabId || seat.paneId} was already gone`)',
    to: '            if (false) log(`SessionEnd: ${seat.tabId || seat.paneId} was already gone`)' },
  { name: 'tabs get their own not-found code', file: 'dctr-seat.mjs', clause: 'SessionEnd sweeps the state directory when a TAB answers tab_not_found',
    from: '    const alreadyGone = (e) => (seat.tabId ? isTabNotFound(e) : isPaneNotFound(e))',
    to: '    const alreadyGone = (e) => isPaneNotFound(e)' },
  { name: 'a lookup that failed does not become a close', file: 'dctr-seat.mjs', clause: 'removes it when the LOOKUP is what answered pane_not_found',
    from: '      catch (e) { if (isPaneNotFound(e)) gone = true; else lookupFailed = String(e.message).split(\'\\n\')[0] }',
    to: '      catch { /* gone */ }' },
  { name: 'the marker is removed by identity, not by name', file: 'dctr-seat.mjs', clause: 'a marker whose agent_id has changed hands is left alone',
    from: '        } else if (current && current.agent_id !== seat.agent_id) {',
    to: '        } else if (false) {' },
  { name: 'only EEXIST means try the next seat name', file: 'dctr-seat.mjs', clause: 'a reservation that cannot be made must stand down, not spin',
    from: "          if (e.code !== 'EEXIST') { fatal = e; marker = null; break }",
    to: '          if (false) { fatal = e; marker = null; break }' },

  // The field audit of 2026-09-07 (F1, N3, N17, N18).
  { name: 'the gate pane splits in the launcher cwd', file: 'dctr-gate.mjs', clause: 'the pane path splits with --cwd',
    from: '          try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout, process.cwd())).result.pane.pane_id }',
    to: '          try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout)).result.pane.pane_id }' },
  { name: 'the gate tab is created in the launcher cwd', file: 'dctr-gate.mjs', clause: 'the tab path creates with the same --cwd',
    from: '          const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(GATE_ROLE, n), process.cwd()))',
    to: '          const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(GATE_ROLE, n)))' },
  { name: 'the seat pane splits in the session cwd', file: 'dctr-seat.mjs', clause: 'the split carries the session cwd',
    from: '        try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout, cwd)).result.pane.pane_id }',
    to: '        try { paneId = herdr(splitArgs(occupants, process.env.HERDR_PANE_ID, layout)).result.pane.pane_id }' },
  { name: 'the seat tab is created in the session cwd', file: 'dctr-seat.mjs', clause: 'the tab create carries the session cwd',
    from: '        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, label, cwd))',
    to: '        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, label))' },
  { name: 'the interactive pane splits in the launcher cwd', file: 'dctr-pane.mjs', clause: 'the split carries the launcher cwd',
    from: '        id = herdr(splitArgs(occupants, sessionPane, layout, process.cwd())).result.pane.pane_id',
    to: '        id = herdr(splitArgs(occupants, sessionPane, layout)).result.pane.pane_id' },
  { name: 'the interactive tab is created in the launcher cwd', file: 'dctr-pane.mjs', clause: 'the tab create carries the launcher cwd',
    from: '        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, label, process.cwd()))',
    to: '        const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, label))' },
  { name: 'cwdArgs really adds the flag', file: 'dctr-lib.mjs', clause: 'tab create and both split shapes carry the cwd they are handed',
    from: "export const cwdArgs = (cwd) => (cwd ? ['--cwd', cwd] : [])",
    to: 'export const cwdArgs = () => []' },
  { name: 'a hook error is not a herdr refusal', file: 'dctr-seat.mjs', clause: 'the stand-down names a hook error, not a refusal',
    from: "  stand_down(`${errorLabel(e)}: ${String(e.message).split('\\n')[0]}`)",
    to: "  stand_down(`herdr refused an action: ${String(e.message).split('\\n')[0]}`)" },
  { name: 'errorLabel reads spawnargs', file: 'dctr-lib.mjs', clause: 'a spawn-shaped error is herdr refusing, and anything else is a hook error',
    from: "export const errorLabel = (e) => (e && e.spawnargs ? 'herdr refused an action' : 'hook error')",
    to: "export const errorLabel = () => 'herdr refused an action'" },
  { name: 'the seat meta file is read', file: 'dctr-seat.mjs', clause: 'the side pane is renamed to type plus description',
    from: '    const meta = readMeta(metaPath(file))',
    to: '    const meta = null' },
  { name: 'the side pane is renamed', file: 'dctr-seat.mjs', clause: 'the side pane is renamed to type plus description',
    from: "      if (!tabId) try { herdr(['pane', 'rename', paneId, label]) } catch (e) { log(`rename of ${paneId} failed (${String(e.message).split('\\n')[0]})`) }",
    to: '      if (false) { }' },
  { name: 'the marker carries the label', file: 'dctr-seat.mjs', clause: 'the marker records the label for the stop path',
    from: '      const record = { agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file, label }',
    to: '      const record = { agent: name, agent_id: payload.agent_id, role: payload.agent_type, n, tabId, paneId, file }' },
  { name: 'a codex seat takes the job path', file: 'dctr-seat.mjs', clause: 'the pane is not closed',
    from: '    if (seat.role === CODEX_ROLE) {',
    to: '    if (false) {' },
  { name: 'a codex seat with a job stops there', file: 'dctr-seat.mjs', clause: 'the pane is not closed',
    from: '        log(`stop ${seat.agent}: codex job ${job.id || job.file} is ${job.status}; the pane follows it and the marker stays`)\n        process.exit(0)',
    to: '        log(`stop ${seat.agent}: codex job ${job.id || job.file} is ${job.status}; the pane follows it and the marker stays`)' },
  { name: 'the renderer is interrupted first', file: 'dctr-seat.mjs', clause: 'the renderer is interrupted before the watcher is typed in',
    from: "        try { herdr(['pane', 'send-keys', seat.paneId, 'ctrl+c']) }",
    to: "        try { }" },
  { name: 'the interrupt lands before the watcher, not after', file: 'dctr-seat.mjs', clause: 'the renderer is interrupted before the watcher is typed in',
    from: "        try { herdr(['pane', 'send-keys', seat.paneId, 'ctrl+c']) } catch (e) { log(`interrupting the renderer in ${seat.paneId} failed (${String(e.message).split('\\n')[0]})`) }\n        herdr(['pane', 'run', seat.paneId, `node ${shq(import.meta.filename)} --codex-tail ${shq(job.file)} ${shq(seat.paneId)} ${shq(label)}`])",
    to: "        herdr(['pane', 'run', seat.paneId, `node ${shq(import.meta.filename)} --codex-tail ${shq(job.file)} ${shq(seat.paneId)} ${shq(label)}`])\n        try { herdr(['pane', 'send-keys', seat.paneId, 'ctrl+c']) } catch (e) { log(`interrupting the renderer in ${seat.paneId} failed (${String(e.message).split('\\n')[0]})`) }" },
  { name: 'the job match is by workspace', file: 'dctr-lib.mjs', clause: 'exactly one watcher is run in it, on the running job',
    from: '  const mine = records.filter((r) => r && r.workspaceRoot === cwd && Date.parse(r.createdAt) >= notBefore)',
    to: '  const mine = records.filter((r) => r && Date.parse(r.createdAt) >= notBefore)' },
  { name: 'the job match is by time', file: 'dctr-lib.mjs', clause: 'the newest record for this workspace since the seat started is the match',
    from: '  const mine = records.filter((r) => r && r.workspaceRoot === cwd && Date.parse(r.createdAt) >= notBefore)',
    to: '  const mine = records.filter((r) => r && r.workspaceRoot === cwd)' },
  { name: 'the watcher relabels with the status', file: 'dctr-seat.mjs', clause: 'relabels the pane with the status',
    from: "    try { herdr(['pane', 'rename', paneId, `${label} · ${cur.status}`]) } catch { /* label only */ }",
    to: '' },
  { name: 'the watcher exits when the job finishes', file: 'dctr-seat.mjs', clause: 'the watcher exits once the job is no longer running',
    from: "    if (!cur || cur.status === 'running' || cur.status === 'queued') return",
    to: '    return' },
  { name: 'the watcher waits while the job runs', file: 'dctr-seat.mjs', clause: 'the watcher stays alive while the job runs',
    from: "    if (!cur || cur.status === 'running' || cur.status === 'queued') return",
    to: '' },
  { name: 'the watcher waits through queued', file: 'dctr-seat.mjs', clause: 'the watcher outlives a record that was queued before it ran',
    from: "    if (!cur || cur.status === 'running' || cur.status === 'queued') return",
    to: "    if (!cur || cur.status === 'running') return" },
  { name: 'only this workspace\'s state directories are read', file: 'dctr-state.mjs', clause: "a record in another workspace's state directory is not chosen, though newer",
    from: '  try { dirs = fs.readdirSync(codexStateDir()).filter((d) => d.startsWith(prefix)) } catch { return [] }',
    to: '  try { dirs = fs.readdirSync(codexStateDir()) } catch { return [] }' },
  { name: 'the meta read is retried on any failure', file: 'dctr-state.mjs', clause: 'a meta file that is invalid JSON at first read and valid shortly after yields the description',
    from: '    catch { if (attempt) return null }',
    to: '    catch { return null }' },
  { name: 'the counter stands in for a missing description', file: 'dctr-lib.mjs', clause: 'the pane label is type plus description, or type plus counter without one',
    from: 'export const paneLabel = (type, description, n) => `${slug(type)} · ${description || n}`',
    to: 'export const paneLabel = (type, description) => `${slug(type)} · ${description}`' },
  { name: 'the meta path swaps the transcript extension', file: 'dctr-lib.mjs', clause: 'the meta path sits beside the seat transcript with .meta.json in place of .jsonl',
    from: "export const metaPath = (transcriptPath) => (transcriptPath ? transcriptPath.replace(/\\.jsonl$/, '.meta.json') : null)",
    to: "export const metaPath = (transcriptPath) => (transcriptPath ? transcriptPath.replace(/\\.jsonl$/, '.meta.jsonl') : null)" },
  { name: 'the watcher reads the log once more after the record', file: 'dctr-seat.mjs', clause: 'having shown the log written after it started',
    from: "    if (!cur || cur.status === 'running' || cur.status === 'queued') return\n    pump()",
    to: "    if (!cur || cur.status === 'running' || cur.status === 'queued') return" },
  { name: 'a pane_not_found lookup is an observation of unfocused', file: 'dctr-seat.mjs', clause: 'a finished codex tab whose PANE has gone is still swept',
    from: '            if (isPaneNotFound(e)) focused = false',
    to: '            if (false) focused = false' },
  { name: 'the gate requires an anchor to occur exactly once', file: 'dctr-lib.mjs', clause: 'anchorCount counts occurrences',
    from: 'export const anchorCount = (text, from) => text.split(from).length - 1',
    to: 'export const anchorCount = (text, from) => (text.includes(from) ? 1 : 0)' },
  { name: 'the gate REFUSES a duplicated anchor rather than applying it', file: 'dctr-lib.mjs', clause: 'the gate applies an anchor that occurs exactly once',
    from: "export const anchorVerdict = (hits) => (hits === 1 ? 'apply' : hits === 0 ? 'missing' : 'ambiguous')",
    to: "export const anchorVerdict = (hits) => (hits === 0 ? 'missing' : 'apply')" },
  { name: 'stopAction collapses an unobserved record into close', file: 'dctr-lib.mjs', clause: 'stopAction answers `unknown` for a record it has not seen',
    from: "  if (typeof rec?.focused !== 'boolean') return 'unknown'",
    to: "  if (typeof rec?.focused !== 'boolean') return 'close'" },
  { name: 'a failed tab list becomes a close by id', file: 'dctr-seat.mjs', clause: 'a tab whose LIST CALL FAILED is not closed',
    from: "      const act = listFailed ? 'unknown' : mine ? stopAction(mine) : 'close'",
    to: "      const act = mine ? stopAction(mine) : 'close'" },
  { name: 'a successful pane lookup carrying no pane becomes a close', file: 'dctr-seat.mjs', clause: 'a focused side pane is renamed to its label plus done',
    from: "      const act = lookupFailed ? 'unknown' : gone ? 'close' : stopAction(pane)",
    to: "      const act = lookupFailed ? 'unknown' : 'close'" },
  { name: 'close-on-next trusts the hoisted snapshot instead of re-asking', file: 'dctr-seat.mjs', clause: 'a finished codex tab that is FOCUSED is spared',
    from: "          if (!stillUnfocused) { log(`close-on-next: ${s.agent} is focused or unreadable now; leaving it`); continue }",
    to: '          if (false) continue' },
  { name: 'the gate launcher treats a pane that is GONE as unobservable', file: 'dctr-gate.mjs', clause: 'a pane the lookup says is GONE keeps no marker',
    from: "      catch (e) { if (isPaneNotFound(e)) gone = true }",
    to: '      catch { /* gone */ }' },
  { name: 'the gate launcher drops the record of a pane it could not observe', file: 'dctr-gate.mjs', clause: 'a focus lookup that FAILED closes nothing and KEEPS the record',
    from: "        process.stderr.write(`${PREFIX}: focus of ${paneId} could not be observed; leaving it for SessionEnd\\n`)",
    to: '        dropMarker()' },
  { name: 'the gate launcher drops a FOCUSED pane\'s record', file: 'dctr-gate.mjs', clause: 'a FOCUSED pane is relabelled and keeps its record',
    from: "        try { herdr(['pane', 'rename', paneId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }",
    to: "        dropMarker(); try { herdr(['pane', 'rename', paneId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }" },
  { name: "a failed rollback keeps reserveMarker's bare {} instead of publishing a real record", file: 'dctr-gate.mjs',
    clause: 'clause 1o — a rollback that could not close its pane leaves a record carrying the pane id',
    from: `            writeMarker(marker, { agent: name, role: GATE_ROLE, n, tabId, paneId, file: outFile, label })
            published = true`,
    to: '            published = true' },
  { name: 'the tab lookup takes whatever came first instead of matching by id', file: 'dctr-gate.mjs',
    clause: 'clause 1u — an unfocused TAB is closed BY ITS OWN ID',
    from: '        mine = tabs.find((t) => t.tab_id === tabId)', to: '        mine = tabs[0]' },
  { name: "a listed tab with no readable focus is closed rather than spared", file: 'dctr-gate.mjs',
    clause: 'clause 1x — a listed tab with NO readable focus is spared',
    from: "      const act = listFailed ? 'unknown' : mine ? stopAction(mine) : 'close'",
    to: "      const act = listFailed ? 'unknown' : mine ? (mine.focused ? 'relabel' : 'close') : 'close'" },
  { name: 'the tab close drops the record before a close that can fail', file: 'dctr-gate.mjs',
    clause: 'clause 1y2 — a tab close that FAILED keeps the record',
    from: "        try { herdr(['tab', 'close', tabId]) } catch { /* the tab may already be gone */ }",
    to: "        dropMarker(); try { herdr(['tab', 'close', tabId]) } catch { /* the tab may already be gone */ }" },
  { name: 'the completion reads the workspace from an environment the pane does not have', file: 'dctr-gate.mjs',
    clause: 'clause 1z2 — with HERDR_WORKSPACE_ID absent, the list still asks the carried workspace',
    from: "        const tabs = herdr(['tab', 'list', '--workspace', workspace]).result.tabs",
    to: "        const tabs = herdr(['tab', 'list', '--workspace', process.env.HERDR_WORKSPACE_ID]).result.tabs" },
  { name: 'the tab placement stops handing its ids to the line it types', file: 'dctr-gate.mjs',
    clause: 'clause 1e2 — the tab placement hands its own tab id and workspace to the pane line',
    from: 'gateRunCommand(self, outFile, marker, paneId, tabId, process.env.HERDR_WORKSPACE_ID, label, command)',
    to: "gateRunCommand(self, outFile, marker, paneId, '', '', label, command)" },
  { name: 'the --run guard stops requiring the separator at its own position', file: 'dctr-gate.mjs',
    clause: 'clause 1z3 — a --run argv with a positional MISSING is refused outright',
    from: '  if (dash !== 7 || !out || !label || argv.length < 9) usage()',
    to: '  if (dash < 0 || !out || !label) usage()' },
  { name: 'a TAB gate is judged and closed as if it were its root pane', file: 'dctr-gate.mjs',
    clause: 'clause 1w — all four tab answers ask the TAB, never the root pane',
    from: '    if (tabId) {', to: '    if (false) {' },
  { name: 'a TAB gate closes the root pane instead of the tab', file: 'dctr-gate.mjs',
    clause: 'clause 1u — an unfocused TAB is closed BY TAB ID',
    from: "        try { herdr(['tab', 'close', tabId]) } catch { /* the tab may already be gone */ }",
    to: "        try { herdr(['pane', 'close', paneId]) } catch { /* the tab may already be gone */ }" },
  { name: "a tab list that FAILED is read as the tab's absence", file: 'dctr-gate.mjs',
    clause: 'clause 1s — a TAB gate whose list FAILED closes nothing and keeps its record',
    from: "      const act = listFailed ? 'unknown' : mine ? stopAction(mine) : 'close'",
    to: "      const act = mine ? stopAction(mine) : 'close'" },
  // IT2 (2026-09-11): this named clause 2b and could not redden it. Dropping two placeholders makes the
  // `--run` argv short, so the positional guard refuses before any output file exists — herdr is still
  // called zero times and 2b passes, while clause 1, the first clause that drives the detached path and
  // reads its result file, is the one that goes red. The harness accepts any failing clause, so the
  // mis-aimed entry passed while advertising a pin on the tripwire it never touched.
  { name: 'the detached path stops emitting its positional placeholders', file: 'dctr-gate.mjs',
    clause: 'clause 1 — a failing check puts exit=3 in the RESULT file',
    from: "    const child = spawn('node', [self, '--run', outFile, '', '', '', '', label, '--', ...command], { detached: true, stdio: 'ignore' })",
    to: "    const child = spawn('node', [self, '--run', outFile, '', '', label, '--', ...command], { detached: true, stdio: 'ignore' })" },
  { name: 'the pane line stops carrying the tab id and workspace', file: 'dctr-lib.mjs',
    clause: 'clause 1q — a TAB gate carries its tab id and workspace into --run',
    from: "  `node ${shq(script)} --run ${shq(out)} ${shq(marker)} ${shq(paneId || '')} ${shq(tabId || '')} ${shq(workspace || '')} ${shq(label)} -- ${[].concat(command).map(shq).join(' ')}`",
    to: "  `node ${shq(script)} --run ${shq(out)} ${shq(marker)} ${shq(paneId || '')} ${shq(label)} -- ${[].concat(command).map(shq).join(' ')}`" },
  { name: 'the gate launcher drops the record BEFORE a close that can fail', file: 'dctr-gate.mjs',
    clause: 'clause 1p — a close that FAILED keeps the record of the pane it could not close',
    from: "        try { herdr(['pane', 'close', paneId]) } catch { /* the shell may already be gone */ }",
    to: "        dropMarker()\n        try { herdr(['pane', 'close', paneId]) } catch { /* the shell may already be gone */ }" },
  // The clause named here is the one that must go red, and it is NOT the focus-lookup clause this
  // entry named until 2026-09-11: that clause spawns a command that succeeds and never reaches the
  // spawn-error handler this mutation edits. `anySuiteNotices` accepts ANY failing clause, so a
  // mis-named entry passes the gate while advertising the wrong pin. Re-aimed at 1n, the clause that
  // drives an unspawnable check.
  { name: 'a spawn failure drops the record of the pane it left running', file: 'dctr-gate.mjs', clause: 'clause 1n: a check that could not be spawned keeps its record',
    from: "  child.on('error', (e) => { try { fs.closeSync(file) } catch { captureFailed = true }; writeResult(127, e.message); process.exit(127) })",
    to: "  child.on('error', (e) => { try { fs.closeSync(file) } catch { captureFailed = true }; writeResult(127, e.message); if (marker) try { fs.rmSync(marker, { force: true }) } catch {} ; process.exit(127) })" },
  { name: 'the spawn error is written into the transcript instead of the result', file: 'dctr-gate.mjs',
    clause: 'clause 3e: and the spawn really did fail, proved by the result file and the status, with the transcript EMPTY',
    from: "  child.on('error', (e) => { try { fs.closeSync(file) } catch { captureFailed = true }; writeResult(127, e.message); process.exit(127) })",
    to: "  child.on('error', (e) => { raw(Buffer.from(`${e.message}\\n`)); try { fs.closeSync(file) } catch { captureFailed = true }; writeResult(127); process.exit(127) })" },
  { name: 'a stale result that cannot be removed no longer stops the launch', file: 'dctr-gate.mjs',
    clause: 'clause 8c — a stale result that cannot be removed makes the launcher REFUSE',
    from: "  catch (e) { console.error(`${PREFIX}-gate: could not clear a previous ${outFile}.result (${e.message}); refusing to run`); process.exit(1) }",
    to: "  catch (e) { console.error(`${PREFIX}-gate: could not clear a previous ${outFile}.result (${e.message}); refusing to run`) }" },
  { name: "a previous run's result on the same path is left in place, so the wait ends on a stale verdict", file: 'dctr-gate.mjs',
    clause: "clause 8 — a previous run's result on the same path is gone before the check starts",
    from: "  try { fs.rmSync(`${outFile}.result`, { force: true }); fs.rmSync(`${outFile}.result.partial`, { force: true }) }",
    to: "  try { fs.rmSync(`${outFile}.result.partial`, { force: true }) }" },
  { name: 'the darwin recorder drops its command', file: 'dctr-pane.mjs', clause: 'darwin: file first, script itself takes no -c, and the command is actually carried',
    from: "    ? `script -q -F ${shq(tee)} bash -c ${shq(connect)}`",
    to: '    ? `script -q -F ${shq(tee)} `' },
  { name: 'the tab close reads the TAB not-found code', file: 'dctr-seat.mjs', clause: 'a finished codex TAB herdr says is not there has its marker removed too',
    from: '            const gone = s.tabId ? isTabNotFound(e) : isPaneNotFound(e)',
    to: '            const gone = isPaneNotFound(e)' },
  { name: 'an absent marker is not this seat\'s', file: 'dctr-seat.mjs', clause: 'a marker removed while the stop worked is NOT recreated',
    from: '          if (!current || current.agent_id !== seat.agent_id) { log(',
    to: '          if (current && current.agent_id !== seat.agent_id) { log(' },
  { name: 'focus that could not be read never closes a pane', file: 'dctr-lib.mjs', clause: 'focus that could not be READ never closes a pane',
    from: '  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status) && c.focused === false).map((c) => c.seat)',
    to: '  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status) && c.focused !== true).map((c) => c.seat)' },
  { name: 'a non-finite pool limit still runs every item', file: 'dctr-lib.mjs', clause: 'a non-finite limit still runs every item',
    from: 'Math.min(Number.isFinite(limit) ? limit : 1, items.length)',
    to: 'Math.min(limit, items.length)' },
  { name: 'poolShortfall counts the results a pool never produced', file: 'dctr-lib.mjs', clause: 'poolShortfall counts the results a pool never produced',
    from: '  Math.max(0, expected - results.filter((r) => r !== undefined).length)',
    to: '  Math.max(0, expected - results.length)' },
  { name: 'the watcher honours an injected poll interval', file: 'dctr-seat.mjs', clause: 'the injected poll interval is HONOURED',
    from: '  setInterval(poll, Number(process.env.DCTR_POLL_MS) || POLL_MS)',
    to: '  setInterval(poll, POLL_MS)' },
  { name: 'close-on-next reads the not-found code as an answer', file: 'dctr-seat.mjs', clause: 'a pane herdr says is NOT THERE has its marker removed',
    from: '            const gone = s.tabId ? isTabNotFound(e) : isPaneNotFound(e)\n            if (!gone) {',
    to: '            const gone = false\n            if (!gone) {' },
  { name: 'the stop write checks the marker is still this seat', file: 'dctr-seat.mjs', clause: 'the stop does not overwrite a marker that now belongs to a replacement seat',
    from: "          if (!current || current.agent_id !== seat.agent_id) {",
    to: "          if (current && false) {" },
  { name: 'the gate ticker reports real elapsed time', file: 'dctr-gate.mjs', clause: 'elapsed time that INCREASES',
    from: 'elapsedLabel(label, Date.now() - started)',
    to: 'elapsedLabel(label, 0)' },
  { name: 'mapPool keeps at most `limit` in flight', file: 'dctr-lib.mjs', clause: 'mapPool never runs more than `limit` at once',
    from: '  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number.isFinite(limit) ? limit : 1, items.length)) }, worker))',
    to: '  await Promise.all(Array.from({ length: Math.max(1, items.length) }, worker))' },
  { name: 'mapPool returns results in INPUT order', file: 'dctr-lib.mjs', clause: 'mapPool visits every item exactly once and returns results in INPUT order',
    from: '    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i], i)',
    to: '    for (let i = next++; i < items.length; i = next++) results.push(await fn(items[i], i))' },
  { name: 'elapsedLabel switches to m/s at one minute', file: 'dctr-lib.mjs', clause: 'elapsedLabel prints seconds under a minute and zero-padded m/s at or above one',
    from: '  return `${label} · ${s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, \'0\')}s`} elapsed`',
    to: '  return `${label} · ${s < 3600 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, \'0\')}s`} elapsed`' },
  { name: 'elapsedLabel zero-pads the seconds half', file: 'dctr-lib.mjs', clause: 'zero-padded m/s',
    from: "String(s % 60).padStart(2, '0')",
    to: 'String(s % 60)' },
  { name: 'elapsedLabel floors a negative age at zero', file: 'dctr-lib.mjs', clause: 'elapsedLabel never prints a negative age',
    from: '  const s = Math.max(0, Math.floor(ms / 1000))',
    to: '  const s = Math.floor(ms / 1000)' },
  { name: 'only the SPLIT path is renamed at placement', file: 'dctr-gate.mjs', clause: 'the tab path is NOT renamed at placement',
    from: "        if (!tabId) try { herdr(['pane', 'rename', paneId, label]) }",
    to: "        if (true) try { herdr(['pane', 'rename', paneId, label]) }" },
  { name: 'an unreadable job record is not terminal', file: 'dctr-lib.mjs', clause: 'an unreadable job record is NOT terminal, matching the watcher',
    from: "export const codexTerminal = (status) => Boolean(status) && status !== 'running' && status !== 'queued'",
    to: "export const codexTerminal = (status) => status !== 'running' && status !== 'queued'" },
  // 2026-09-12: this named the teardown clause "a FINISHED codex pane someone is looking at still stays",
  // which stays green under the mutation because the seat hook rechecks focus independently before
  // closing. The pure clause 1am is what reddens, verified by applying the mutation to a copy.
  { name: 'close-on-next spares a FOCUSED finished pane', file: 'dctr-lib.mjs', clause: 'clause 1am — close-on-next closes exactly the terminal, unfocused, codex-job panes',
    from: '  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status) && c.focused === false).map((c) => c.seat)',
    to: '  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status)).map((c) => c.seat)' },
  { name: 'close-on-next only considers seats following a codex job', file: 'dctr-lib.mjs', clause: 'close-on-next closes exactly the terminal, unfocused, codex-job panes',
    from: '  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status) && c.focused === false).map((c) => c.seat)',
    to: '  candidates.filter((c) => codexTerminal(c.status) && c.focused === false).map((c) => c.seat)' },
  { name: 'only a CODEX placement sweeps finished codex panes', file: 'dctr-seat.mjs', clause: 'an ordinary seat placement closes nothing',
    from: '      if (payload.agent_type === CODEX_ROLE) {',
    to: '      if (true) {' },
  { name: 'the stop path records which job the pane follows', file: 'dctr-seat.mjs', clause: 'the marker records WHICH job the pane follows',
    from: "          writeMarker(file, { ...seat, codexJob: job.file })",
    to: "          writeMarker(file, { ...seat })" },
  { name: 'the gate names the pane it split', file: 'dctr-gate.mjs', clause: 'the pane path NAMES the pane it split',
    from: "        if (!tabId) try { herdr(['pane', 'rename', paneId, label]) } catch (e) { hookLog(sessionId, `gate \"${label}\": rename of ${paneId} failed (${String(e.message).split('\\n')[0]})`) }\n",
    to: '' },
  { name: 'a running gate re-names its pane with elapsed time', file: 'dctr-gate.mjs', clause: 'the pane name carries elapsed time',
    from: '  const ticker = paneId\n',
    to: '  const ticker = null && paneId\n' },
  { name: 'a finished pane is relabelled with its exit status', file: 'dctr-gate.mjs', clause: 'the LAST name a finished pane carries is its exit status',
    from: "        try { herdr(['pane', 'rename', paneId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }",
    to: '        /* the relabel branch does nothing */' },
  { name: 'a finished FOCUSED tab is not relabelled', file: 'dctr-gate.mjs',
    clause: 'clause 1t — a FOCUSED tab is RENAMED, not closed',
    from: "        try { herdr(['tab', 'rename', tabId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }",
    to: '        /* the relabel branch does nothing */' },
  { name: 'SESSION_END_WAIT_MS outgrows the hook timeout that kills it', file: 'dctr-state.mjs', clause: "SESSION_END_WAIT_MS fits inside the SessionEnd hook's own configured timeout",
    from: 'export const SESSION_END_WAIT_MS = 8000',
    to: 'export const SESSION_END_WAIT_MS = 30000' },
  { name: 'a focused side pane keeps its title on stop', file: 'dctr-seat.mjs', clause: 'a focused side pane is renamed to its label plus done',
    from: "        try { herdr(['pane', 'rename', seat.paneId, `${seat.label || seat.agent} · done`]) } catch { /* label only */ }",
    to: "        try { herdr(['pane', 'rename', seat.paneId, `${seat.agent} · done`]) } catch { /* label only */ }" },
  // F14. The relabel branches keep the marker; without that the thing the user is watching lives on
  // with no record and NOTHING can reclaim it, because SessionEnd enumerates markers and
  // staleSideSeats filters recorded seats. One entry per branch, because they are two sites.
  { name: 'a relabelled TAB loses its marker again', file: 'dctr-seat.mjs',
    clause: 'and its MARKER survives, so SessionEnd can still reclaim it (F14)',
    from: "        spared = `${seat.tabId} is focused`",
    to: "        spared = null" },
  { name: 'a relabelled PANE loses its marker again', file: 'dctr-seat.mjs',
    clause: 'and its MARKER survives, because a pane that LIVES must stay reclaimable (F14)',
    from: "        spared = `${seat.paneId} is focused`",
    to: "        spared = null" },
  { name: 'the relabel reason is filed as a close failure', file: 'dctr-seat.mjs',
    clause: 'and never says a close failed, because none was attempted',
    from: "        spared = `${seat.tabId} is focused`\n        try { herdr(['tab', 'rename', seat.tabId, `${mine.label} · done`]) } catch { /* label only */ }",
    to: "        closeFailed = `${seat.tabId} is focused`\n        try { herdr(['tab', 'rename', seat.tabId, `${mine.label} · done`]) } catch { /* label only */ }" },
  { name: 'the shared block stops honouring spared', file: 'dctr-seat.mjs',
    clause: 'both F14 MARKER clauses, tab and pane',
    from: "    } else if (spared) {",
    to: "    } else if (false) {" },

  // dctr-project.mjs (2026-09-13): each entry removes or inverts one check rule, or one unknown-versus-
  // none separation in status, and names the selftest clause that must go red.
  { name: 'project: a project State outside the set is accepted', file: 'dctr-project.mjs', clause: 'state — a project State outside Proposed, Ruled, Done [1: trips]',
    from: '  if (!PROJECT_STATES.includes(ps?.value)) add(', to: '  if (false) add(' },
  { name: 'project: an epic State outside the set is accepted', file: 'dctr-project.mjs', clause: 'state — an epic State outside the six [1: trips]',
    from: 'if (!EPIC_STATES.includes(s))', to: 'if (false)' },
  { name: 'project: an epic past Proposed needs no baseline ruling', file: 'dctr-project.mjs', clause: 'evidence — an epic Done with no baseline ruling [1: trips]',
    from: "if (['Not started', 'Open', 'Done'].includes(s) && !rulingsOf(doc, 'baseline').length)", to: 'if (false)' },
  { name: 'project: an Open or Done epic needs no phase member', file: 'dctr-project.mjs', clause: 'evidence — an epic Open or Done with no phase member [1: trips]',
    from: "if (['Open', 'Done'].includes(s) && !doc.phases.length)", to: 'if (false)' },
  { name: 'project: Combined check none is accepted (W1)', file: 'dctr-project.mjs', clause: 'evidence — an epic Done with Combined check none (W1) [1: trips]',
    from: "if (!cc || cc === 'none')", to: 'if (!cc)' },
  { name: 'project: a Done epic needs no counting return', file: 'dctr-project.mjs', clause: 'evidence — an epic Done whose only return is on a stale revision [1: trips]',
    from: "if (s === 'Done' && !passesAll(doc", to: 'if (false && !passesAll(doc' },
  { name: 'project: a return on a stale revision still counts', file: 'dctr-project.mjs', clause: 'evidence — an epic Done whose only return is on a stale revision [1: trips]',
    from: '  if (ret.fields.Revision?.value !== target) return false\n', to: '' },
  { name: 'project: a return on a superseded baseline still counts', file: 'dctr-project.mjs', clause: 'evidence — an epic Done whose return is on a superseded baseline [1: trips]',
    from: '  if (ret.fields.Baseline?.value !== currentBaseline(doc)) return false\n', to: '' },
  { name: 'project: a later regression does not void a return', file: 'dctr-project.mjs', clause: 'evidence — a regression after the return voids it (Done to Open) [1: trips]',
    from: 'return !later.some(', to: 'return true || !later.some(' },
  { name: 'project: a PASS with empty evidence counts as PASS', file: 'dctr-project.mjs', clause: 'evidence — a PASS with an empty evidence reference counts as UNVERIFIED [1: trips]',
    from: "(r.result === 'PASS' && !r.evidence ? 'UNVERIFIED' : r.result)", to: '(r.result)' },
  { name: 'project: Dropped needs no drop ruling', file: 'dctr-project.mjs', clause: 'evidence — an epic Dropped without a drop ruling [1: trips]',
    from: "if (s === 'Dropped' && !rulingsOf(doc, 'drop').length)", to: 'if (false)' },
  { name: 'project: a Successor off the roster is accepted', file: 'dctr-project.mjs', clause: 'evidence — an epic Superseded whose Successor is not on the roster [1: trips]',
    from: 'if (!rosterIds.has(succ))', to: 'if (!succ)' },
  { name: 'project: a project with no end-state item is accepted', file: 'dctr-project.mjs', clause: 'evidence — a project with no end-state item [1: trips]',
    from: 'PROJECT_STATES.includes(ps?.value) && !p.items.length', to: 'false' },
  { name: 'project: a Ruled or Done project needs no baseline ruling', file: 'dctr-project.mjs', clause: 'evidence — a project Ruled or Done with no baseline ruling [1: trips]',
    from: "if (['Ruled', 'Done'].includes(ps?.value) && !rulingsOf(p, 'baseline').length)", to: 'if (false)' },
  { name: 'project: a Done project accepts a non-terminal epic', file: 'dctr-project.mjs', clause: 'evidence — a project Done while a roster epic is Open [1: trips]',
    from: 'if (!TERMINAL.includes(s))', to: 'if (false)' },
  { name: 'project: a Done project needs no counting project return', file: 'dctr-project.mjs', clause: 'evidence — a project Done without a PASS for every end-state item [1: trips]',
    from: 'if (!passesAll(p, p.items.map((i) => i.id)))', to: 'if (false)' },
  { name: 'project: a roster Record that does not resolve is accepted', file: 'dctr-project.mjs', clause: 'roster — a Record path that does not resolve [1: trips]',
    from: 'if (!exists(r.record)) {', to: 'if (false) {' },
  { name: 'project: a record headed with another ID is accepted', file: 'dctr-project.mjs', clause: 'roster — a record whose heading names a different ID [1: trips]',
    from: 'if (hid !== r.id) add(', to: 'if (false) add(' },
  { name: 'project: a duplicate roster ID is accepted', file: 'dctr-project.mjs', clause: 'roster — a duplicate ID [1: trips]',
    from: 'if (seen.has(r.id)) add(', to: 'if (false) add(' },
  { name: 'project: an uncovered end-state item is accepted', file: 'dctr-project.mjs', clause: 'coverage — an end-state item with no satisfy and no project-level [1: trips]',
    from: 'if (!c.satisfy.length && !c.projectLevel) add(', to: 'if (false) add(' },
  { name: 'project: two satisfy epics are accepted (ER2)', file: 'dctr-project.mjs', clause: 'coverage — more than one satisfy epic (ER2) [1: trips]',
    from: 'if (c.satisfy.length > 1)', to: 'if (false)' },
  { name: 'project: a satisfy epic off the roster is accepted', file: 'dctr-project.mjs', clause: 'coverage — a satisfy epic not on the roster [1: trips]',
    from: 'if (!rosterIds.has(e)) {', to: 'if (false) {' },
  { name: 'project: a Dropped satisfy epic is accepted', file: 'dctr-project.mjs', clause: 'coverage — a satisfy epic that is Dropped [1: trips]',
    from: "if (stateOf(e) === 'Dropped') add", to: 'if (false) add' },
  { name: 'project: a Superseded satisfy epic covers before its successor is Done (ER3)', file: 'dctr-project.mjs', clause: 'coverage — a Superseded satisfy epic whose successor is not Done (ER3) [1: trips]',
    from: "if (st !== 'Done') add(P, ln, 'coverage'", to: "if (false) add(P, ln, 'coverage'" },
  { name: 'project: any ruling with the ID satisfies project-level', file: 'dctr-project.mjs', clause: 'coverage — project-level naming no project-level ruling that lists the item [1: trips]',
    from: "rulingsOf(p, 'project-level').some(", to: 'p.entries.some(' },
  { name: 'project: an empty epic Coverage is accepted', file: 'dctr-project.mjs', clause: 'coverage — an epic item with an empty Coverage [1: trips]',
    from: "if (!cov.value) { add(file, cov.line, 'coverage'", to: "if (false) { add(file, cov.line, 'coverage'" },
  { name: 'project: one phase with two obligations is accepted (W2)', file: 'dctr-project.mjs', clause: 'coverage — one phase given two obligations for one item (W2) [1: trips]',
    from: 'if (ph && phases.has(ph))', to: 'if (false)' },
  { name: 'project: an item missing a field is accepted', file: 'dctr-project.mjs', clause: 'item — an item missing one of the seven fields [1: trips]',
    from: "if (!fv || (f !== 'Coverage' && !fv.value))", to: 'if (false)' },
  { name: 'project: Type T5 is accepted', file: 'dctr-project.mjs', clause: 'item — a Type outside T1 to T4 [1: trips]',
    from: '!/^T[1-4]$/.test(ty.value)', to: '!/^T[1-5]$/.test(ty.value)' },
  { name: 'project: a done-means-change needs no impact ruling (W3)', file: 'dctr-project.mjs', clause: 'impact — a done-means-change with no later impact ruling (W3, ER7) [1: trips]',
    from: 'if (!later.some((x) => items.every(', to: 'if (false && !later.some((x) => items.every(' },
  { name: 'project: any issue Destination is accepted', file: 'dctr-project.mjs', clause: 'issues — a Destination outside the three forms [1: trips]',
    from: "else if (is.destination !== 'out of scope' && is.destination !== 'post-done backlog')", to: 'else if (false)' },
  { name: 'project: an issue member of an epic off the roster is accepted', file: 'dctr-project.mjs', clause: 'issues — member naming an epic not on the roster [1: trips]',
    from: 'if (!rosterIds.has(m[1])) add(P, is.line', to: 'if (false) add(P, is.line' },
  { name: 'project: a Current epic off the roster is accepted (ER5)', file: 'dctr-project.mjs', clause: 'pointer — Current epic neither none nor a roster epic (ER5) [1: trips]',
    from: "if (ce?.value !== 'none' && !rosterIds.has(ce?.value))", to: 'if (false)' },
  { name: 'project: an ID outside the pattern is accepted', file: 'dctr-project.mjs', clause: 'id — a phase name outside the pattern [1: trips]',
    from: 'if (!ID_RE.test(id)) add(', to: 'if (false) add(' },
  { name: 'project: a duplicate item ID within one file is accepted', file: 'dctr-project.mjs', clause: 'id — a duplicate item ID within one file [1: trips]',
    from: 'if (itemIds.has(it.id)) add(', to: 'if (false) add(' },
  { name: 'project: a duplicate entry ID within one file is accepted', file: 'dctr-project.mjs', clause: 'id — a duplicate entry ID within one file [1: trips]',
    from: 'if (entryIds.has(e.id)) add(', to: 'if (false) add(' },
  { name: 'project: an epic past Proposed needs no Done means item', file: 'dctr-project.mjs', clause: 'evidence — an epic Done with no Done means item [1: trips]',
    from: "if (['Not started', 'Open', 'Done'].includes(s) && !doc.items.length)", to: 'if (false)' },
  { name: 'project: a regression Item that names no item in its file is accepted', file: 'dctr-project.mjs', clause: 'reference — a regression recorded against the end-state item ID in the satisfy epic record [1: trips]',
    from: "if (e.type === 'regression') ref(", to: 'if (false) ref(' },
  { name: 'project: a return result for an undefined item is accepted', file: 'dctr-project.mjs', clause: 'reference — a return result for an item its file does not define [1: trips]',
    from: 'for (const r of e.results) ref(', to: 'for (const r of []) ref(' },
  { name: 'project: a ruling Items naming an undefined item is accepted', file: 'dctr-project.mjs', clause: 'reference — a ruling Items naming an item its file does not define [1: trips]',
    from: 'for (const id of ids) ref(', to: 'for (const id of []) ref(' },
  { name: 'project: a done-means-change or impact ruling with no Items is accepted', file: 'dctr-project.mjs', clause: 'reference — a done-means-change ruling with no Items [1: trips]',
    from: "if (!ids.length && kind(e) !== 'project-level') add(", to: 'if (false) add(' },
  { name: 'project: a return Baseline may name any ruling', file: 'dctr-project.mjs', clause: 'reference — a return Baseline naming a ruling that is not a baseline or done-means-change [1: trips]',
    from: "x.id === b?.value && ['baseline', 'done-means-change'].includes(kind(x))", to: 'x.id === b?.value' },
  { name: 'project: findings exit 0', file: 'dctr-project.mjs', clause: 'CLI check — a broken tree exits 1 with a <path>:<line>: <rule>: <message> line',
    from: 'process.exit(findings.length ? 1 : 0)', to: 'process.exit(0)' },
  { name: 'project status: a reader that threw prints (none) instead of unknown', file: 'dctr-project.mjs', clause: 'T-status 6 — every reader that throws or returns null prints unknown, never a guess',
    from: 'const ask = (fn) => { try { return fn() ?? null } catch { return null } }', to: 'const ask = (fn) => { try { return fn() ?? [] } catch { return [] } }' },
  { name: 'project status: a return that does not count is not listed as obsolete (ER9)', file: 'dctr-project.mjs', clause: 'T-status 4 — a return that does not count is labelled obsolete with its baseline and revision (ER9), and a counting one is not',
    from: "if (e.type === 'return' && !counts(doc, e)) obsolete.push", to: 'if (false) obsolete.push' },
  { name: "project status: a record's FIRST state line is read, not its last", file: 'dctr-project.mjs', clause: 'CLI status — exits 0 on the good tree and reads records',
    from: '.at(-1)?.trim()', to: '.at(0)?.trim()' },
  { name: 'project status: a .out with a .result is still pending', file: 'dctr-project.mjs', clause: 'CLI status — exits 0 on the good tree and reads records',
    from: "if (n.endsWith('.out') && !fs.existsSync(`${abs}.result`))", to: "if (n.endsWith('.out'))" },
  { name: 'project status: herdr is asked with HERDR_ENV unset', file: 'dctr-project.mjs', clause: 'CLI status — the tripwire herdr on PATH was called ZERO times with HERDR_ENV unset',
    from: "if (env.HERDR_ENV !== '1' || env.DCTR_VIEW_REQUEST_DIR) return null", to: 'if (env.DCTR_VIEW_REQUEST_DIR) return null' },
  { name: 'project status: a contained session asks herdr', file: 'dctr-project.mjs', clause: 'CLI status — a contained session (DCTR_VIEW_REQUEST_DIR set) prints unknown and still calls herdr ZERO times',
    from: "if (env.HERDR_ENV !== '1' || env.DCTR_VIEW_REQUEST_DIR) return null", to: "if (env.HERDR_ENV !== '1') return null" },
  { name: 'project status: an empty snapshot reply reads as zero seats', file: 'dctr-project.mjs', clause: 'CLI status — inside herdr, an EMPTY snapshot reply is "could not look"',
    from: 'if (!Array.isArray(panes)) return null', to: 'if (!Array.isArray(panes)) return []' },
  { name: 'project status: a missing codex state dir reads as no jobs', file: 'dctr-project.mjs', clause: 'CLI status — HERDR_ENV unset prints live seats: unknown, and a missing codex state dir prints codex jobs: unknown',
    from: 'for (const d of fs.readdirSync(stateDir).filter(', to: 'for (const d of (fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : []).filter(' },
  // Repairs of 2026-09-13, second round: each names the clause that reddened when it was applied.
  { name: 'project: any counting return with a PASS for every item decides, not the latest', file: 'dctr-project.mjs',
    clause: 'evidence — a later counting project return with a FAIL decides, though an earlier one passed every item [1: trips]',
    from: "const passesAll = (doc, ids) => { const e = latestCounting(doc); return Boolean(e) && ids.every((id) => e.results.some((r) => r.item === id && resultOf(r) === 'PASS')) }",
    to: "const passesAll = (doc, ids) => doc.entries.some((e) => e.type === 'return' && counts(doc, e) && ids.every((id) => e.results.some((r) => r.item === id && resultOf(r) === 'PASS')))" },
  { name: 'project status: a project-level item shows the latest result from any counting return', file: 'dctr-project.mjs',
    clause: "T-status 8 — a project-level item shows the latest counting return's result, or says that return has none",
    from: 'const last = latestCounting(p), r = last?.results.filter((x) => x.item === it.id).at(-1)',
    to: "const last = latestCounting(p), r = p.entries.filter((e) => e.type === 'return' && counts(p, e)).flatMap((e) => e.results.filter((x) => x.item === it.id)).at(-1)" },
  { name: 'project: the table header row above the separator is kept as a data row', file: 'dctr-project.mjs',
    clause: 'T-check good — the known-good project (Done, Done epic, Superseded epic with a Done successor, project-level item) has ZERO findings',
    from: '{ if (lastRow?.line === line - 1 && lastRow.rows === rows) rows.pop(); lastRow = null; return }', to: '{ lastRow = null; return }' },
  { name: 'project: a table row is skipped by its first cell reading ID or Issue', file: 'dctr-project.mjs',
    clause: 'id — epic E1 renamed ID [1/2: check has ZERO findings and neither check nor status throws]',
    from: "      rows.push(section === 'Epics'", to: "      if (c[0] === 'ID' || c[0] === 'Issue') return\n      rows.push(section === 'Epics'" },
  { name: 'project: an epic ID lookup reaches inherited names', file: 'dctr-project.mjs',
    clause: 'id — epic E1 renamed constructor [1/2: check has ZERO findings and neither check nor status throws]',
    from: '!byId.has(r.id)) byId.set(r.id, { path: r.record, doc })',
    to: '!Object.fromEntries(byId)[r.id]) byId.set(r.id, { path: r.record, doc })' },
  { name: 'project: an epic Coverage obligation outside the three is accepted (W2)', file: 'dctr-project.mjs',
    clause: 'item — an epic Coverage obligation outside satisfy, contribute, preserve (W2) [1: trips]',
    from: 'if (!OBLIGATIONS.includes(m?.[2])) add(', to: 'if (false) add(' },
  { name: 'project: a project Coverage part with an unknown keyword is dropped silently', file: 'dctr-project.mjs',
    clause: 'coverage — a project Coverage part whose keyword is outside the four [1: trips]',
    from: 'for (const u of c.unknown) add(', to: 'for (const u of []) add(' },
  { name: 'project: a ruling Kind outside the ten is accepted', file: 'dctr-project.mjs', clause: 'entry — a ruling Kind outside the ten [1: trips]',
    from: "if (e.type === 'ruling' && !KINDS.includes(kind(e))) add(", to: 'if (false) add(' },
  { name: 'project: a return result outside the three is accepted', file: 'dctr-project.mjs', clause: 'entry — a return result outside PASS, FAIL, UNVERIFIED [1: trips]',
    from: 'if (!RESULTS.includes(r.result)) add(', to: 'if (false) add(' },
  { name: 'project: a malformed entry heading is dropped silently', file: 'dctr-project.mjs',
    clause: 'entry — a heading in Rulings and returns that is not <entry ID> ruling|return|regression, <time> [1: trips]',
    from: 'if (e.type === null) add(', to: 'if (false) add(' },
  { name: 'project: a roster record that exists and cannot be read is skipped silently', file: 'dctr-project.mjs', clause: 'roster — a record that exists and cannot be read [1: trips]',
    from: "if (!doc) { add(P, r.line, 'roster', `record ${r.record} for ${r.id} could not be read`); continue }", to: 'if (!doc) continue' },
  { name: 'project status: obsolete returns are listed though a roster record was not read', file: 'dctr-project.mjs',
    clause: 'T-status 7b — obsolete returns: unknown when a roster record could not be read or resolved, and a list when every one was',
    from: "block('obsolete returns', allRead ? obsolete : null)", to: "block('obsolete returns', obsolete)" },
  { name: 'project status: a jobs directory that cannot be read reads as no jobs', file: 'dctr-project.mjs',
    clause: 'codex [1: a jobs directory that cannot be read, a job file that cannot be read, and a job file that does not parse each throw, printed unknown]',
    from: "try { names = fs.readdirSync(jobs) } catch (e) { if (e.code === 'ENOENT') continue; throw e }", to: 'try { names = fs.readdirSync(jobs) } catch { continue }' },
  { name: 'project status: a matching directory with no jobs directory reads as unknown', file: 'dctr-project.mjs',
    clause: "codex [2: a healthy state dir lists only this workspace's unfinished jobs; a matching directory with no jobs is none, not unknown]",
    from: "try { names = fs.readdirSync(jobs) } catch (e) { if (e.code === 'ENOENT') continue; throw e }", to: 'try { names = fs.readdirSync(jobs) } catch (e) { throw e }' },
  { name: 'project status: a job file that cannot be read or parsed is skipped', file: 'dctr-project.mjs',
    clause: 'codex [1: a jobs directory that cannot be read, a job file that cannot be read, and a job file that does not parse each throw, printed unknown]',
    from: "const file = path.join(jobs, f), r = JSON.parse(fs.readFileSync(file, 'utf8'))",
    to: "const file = path.join(jobs, f); let r; try { r = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }" },
  { name: "project status: another workspace's or a finished job is listed", file: 'dctr-project.mjs',
    clause: "codex [2: a healthy state dir lists only this workspace's unfinished jobs; a matching directory with no jobs is none, not unknown]",
    from: 'if (r?.workspaceRoot === root && !codexTerminal(r.status)) out.push(', to: 'if (r) out.push(' },
  { name: 'project: the reference helper itself stops reporting', file: 'dctr-project.mjs',
    clause: 'reference — a return result for an item its file does not define [1: trips]',
    from: 'if (!resolves) add(', to: 'if (false) add(' },
  { name: 'project: an absent Combined check is accepted (W1)', file: 'dctr-project.mjs',
    clause: 'evidence — an epic Not started with Combined check absent (W1) [1: trips]',
    from: "if (!cc || cc === 'none')", to: "if (cc === 'none')" },
  // Repairs of 2026-09-13, third round.
  { name: 'project: an ID a done-means-change ruling removed no longer resolves in older entries', file: 'dctr-project.mjs',
    clause: 'known good — an item removed by a done-means-change ruling after a return that named it [2: ZERO findings]',
    from: " || at.some((j) => j >= i) || (e.type === 'ruling' && kind(e) === 'impact' && at.length > 0)", to: '' },
  { name: 'project: the ER3 finding tells the orchestrator to wait for the successor to be Done', file: 'dctr-project.mjs',
    clause: "coverage — a Superseded satisfy epic's chain end reopened by a regression before the owner ruled it the satisfy epic [1: trips]",
    from: "the fix is a coverage ruling naming ${end}, the ${st} epic at the end of the chain, as this item's satisfy epic`", to: 'rule the successor as the satisfy epic once it is Done`' },
  // Repairs of 2026-09-13, fourth round: each named clause is in hooks/dctr-project.history.selftest.mjs.
  { name: 'project: a retired ID resolves in a regression written after the ruling that retired it (E1)', file: 'dctr-project.mjs',
    clause: 'S4 illegal: a regression written after the split against the retired ID D1 [1: reference',
    from: 'at.some((j) => j >= i)', to: 'at.length > 0' },
  { name: 'project: an impact ruling naming a removed item no longer resolves', file: 'dctr-project.mjs',
    clause: 'S3 the impact ruling that finding names (W3, ER7), listing the removed D2 [2: ZERO findings]',
    from: " || (e.type === 'ruling' && kind(e) === 'impact' && at.length > 0)", to: '' },
  { name: 'project: a chain ending at a Dropped epic prescribes reassignment to it (E2)', file: 'dctr-project.mjs',
    clause: 'S6 owner drops the Done successor E2 (ER6) [1: coverage',
    from: 'const fix = LIVE.includes(st)', to: 'const fix = true' },
  { name: 'project: a looping chain is described as ending at an epic', file: 'dctr-project.mjs',
    clause: 'S6b owner supersedes E1 by E2 and E2 back by E1 [1: coverage',
    from: "st === 'Superseded' ? `it loops back to ${end}`", to: "false ? `it loops back to ${end}`" },
  { name: 'project: coverage is not a ruling Kind', file: 'dctr-project.mjs',
    clause: 'S5 the prescribed fix: a coverage ruling naming E2 [2: ZERO findings]',
    from: "'project-level', 'coverage', 'destination'", to: "'project-level', 'destination'" },
  { name: 'project: a coverage ruling needs no Items', file: 'dctr-project.mjs',
    clause: 'S5 illegal: a coverage ruling with no Items [1: reference',
    from: "['done-means-change', 'impact', 'project-level', 'coverage'].includes(kind(e))", to: "['done-means-change', 'impact', 'project-level'].includes(kind(e))" },
  { name: 'project: an escaped pipe splits a table cell', file: 'dctr-project.mjs',
    clause: 'known good — a roster row whose Title cell carries an escaped pipe [2: ZERO findings]',
    from: '.split(/(?<!\\\\)\\|/)', to: ".split('|')" },
  { name: 'project: a table row with no closing pipe is not read', file: 'dctr-project.mjs',
    clause: 'evidence — a roster row with no closing pipe is read (a Done project with an Open epic) [1: trips]',
    from: 'const m = /^ {0,3}(?=\\S)(.*\\|.*)$/.exec(t)', to: 'const m = /^ {0,3}(?=\\S)(\\|.*\\|)$/.exec(t)' },
  { name: 'project: an indented table row is not read', file: 'dctr-project.mjs',
    clause: 'evidence — an indented roster row is read (a Done project with an Open epic) [1: trips]',
    from: 'const m = /^ {0,3}(?=\\S)(.*\\|.*)$/.exec(t)', to: 'const m = /^(?=\\S)(.*\\|.*)$/.exec(t)' },
  { name: 'project: a line in a table section that is not a row is dropped silently', file: 'dctr-project.mjs',
    clause: 'roster — a line in ## Epics that is not a table row [1: trips]',
    from: '      if (!c) { odd(); return }', to: '      if (!c) return' },
  { name: 'project: a malformed line in an item section is dropped silently', file: 'dctr-project.mjs',
    clause: 'item — an indented field line in ## End state [1: trips]',
    from: 'item.fields[f[1]] = { value: f[2].trim(), line }\n      else odd()\n', to: 'item.fields[f[1]] = { value: f[2].trim(), line }\n' },
  { name: 'project: an item field outside the six is stored silently', file: 'dctr-project.mjs',
    clause: 'item — a field outside the six in ## End state [1: trips]',
    from: 'if (f && item && FIELDS.includes(f[1]))', to: 'if (f && item)' },
  { name: 'project: a malformed Members line is dropped silently', file: 'dctr-project.mjs',
    clause: 'members — a line in ## Members that is not a phase or an issue [1: trips]',
    from: "      else if (!/^- issue \\S/.test(t)) odd()\n", to: '' },
  { name: 'project: a malformed line in Rulings and returns is dropped silently', file: 'dctr-project.mjs',
    clause: 'entry — an indented result line in a return [1: trips]',
    from: '      else if (!(entry && /^>/.test(t))) odd()\n', to: '' },
  { name: 'project: two results for one item in one return are accepted', file: 'dctr-project.mjs',
    clause: 'entry — two results for one item in one return [1: trips]',
    from: 'if (given.has(r.item)) add(', to: 'if (false) add(' },
  { name: 'project: a Coverage giving project-level with another part is accepted', file: 'dctr-project.mjs',
    clause: 'coverage — a Coverage giving both a satisfy epic and a project-level ruling [1: trips]',
    from: 'if (c.projectLevel && c.parts > 1) add(', to: 'if (false) add(' },
  { name: 'project: a contribute or preserve epic off the roster is accepted', file: 'dctr-project.mjs',
    clause: 'coverage — a contribute epic not on the roster [1: trips]',
    from: 'for (const e of c.others) if (!rosterIds.has(e)) add(', to: 'for (const e of []) if (!rosterIds.has(e)) add(' },
  { name: 'project: an entry heading with no time is accepted', file: 'dctr-project.mjs',
    clause: 'entry — a heading with no time after the comma [1: trips]',
    from: ',\\s*\\S.*$/.exec(t)', to: ',\\s*.*$/.exec(t)' },
  { name: 'project: only a done-means-change ruling needs Items, not an impact ruling', file: 'dctr-project.mjs',
    clause: 'reference — an impact ruling with no Items [1: trips]',
    from: "if (!ids.length && kind(e) !== 'project-level') add(", to: "if (!ids.length && kind(e) === 'done-means-change') add(" },
  // Repair of 2026-09-13, fifth round (F4-1).
  { name: 'project: a return graded on a baseline written before a done-means-change no longer resolves the ID it retired', file: 'dctr-project.mjs',
    clause: 'S9 exit passes step 4: the return arrives and is recorded as the seat gave it, on the baseline it was briefed on [2: ZERO findings]',
    from: ' || (graded >= 0 && at.some((j) => j > graded))', to: '' },
  // Repairs of 2026-09-13, sixth round (DP1-DP3, DP17): S10 and S11 are in hooks/dctr-project.history.selftest.mjs.
  { name: 'project: destination is not a ruling Kind (DP1)', file: 'dctr-project.mjs',
    clause: 'S11 owner rules each destination: the open issue, and the markdown tracker item by its path:line (DP1, DP7) [2: ZERO findings]',
    from: "'coverage', 'destination', ", to: "'coverage', " },
  { name: 'project: cutover is not a ruling Kind (DP1)', file: 'dctr-project.mjs',
    clause: 'S11 owner rules the one cutover edit, removing CLAUDE.md:3 (the adopt end state) [2: ZERO findings]',
    from: "'destination', 'cutover', ", to: "'destination', " },
  { name: 'project: scope is not a ruling Kind (DP1)', file: 'dctr-project.mjs',
    clause: 'S10 owner rules the end state, the project-level ruling and the initial coverage map (W1), and strikes one never-becomes entry [2: ZERO findings]',
    from: "'cutover', 'scope']", to: "'cutover']" },
  { name: 'project: a destination ruling needs no Issues (DP1)', file: 'dctr-project.mjs', clause: 'reference — a destination ruling with no Issues [1: trips]',
    from: "['destination', ['Issues', 'To']]", to: "['destination', ['To']]" },
  { name: 'project: a destination ruling needs no To (DP1)', file: 'dctr-project.mjs', clause: 'reference — a destination ruling with no To [1: trips]',
    from: "['destination', ['Issues', 'To']]", to: "['destination', ['Issues']]" },
  { name: 'project: a cutover ruling needs no Edit (DP1)', file: 'dctr-project.mjs', clause: 'reference — a cutover ruling with no Edit [1: trips]',
    from: "['cutover', ['Edit']]", to: "['cutover', []]" },
  { name: 'project: a scope ruling needs no Entries (DP1)', file: 'dctr-project.mjs', clause: 'reference — a scope ruling with no Entries [1: trips]',
    from: "['scope', ['Entries']]", to: "['scope', []]" },
  { name: 'project: a destination ruling may name an ID with no Open issues row (DP1)', file: 'dctr-project.mjs',
    clause: 'issues — a destination ruling naming an issue that is not a row in Open issues [1: trips]',
    from: "if (!row) add(P, e.fields.Issues.line, 'issues', ", to: "if (!row) void (P, e.fields.Issues.line, 'issues', " },
  { name: 'project: a destination ruling may give a To its row does not carry (DP1)', file: 'dctr-project.mjs',
    clause: 'issues — a destination ruling whose To is not the Destination its row carries [1: trips]',
    from: 'else if (to && row.destination !== to)', to: 'else if (false)' },
  { name: 'project: the earliest destination ruling naming an ID decides, not the latest (DP1)', file: 'dctr-project.mjs',
    clause: 'S11 owner moves #10 out of scope by a later destination ruling, and its row follows [2: ZERO findings]',
    from: 'for (const id of list(e.fields.Issues?.value)) latestTo.set(id, e)', to: 'for (const id of list(e.fields.Issues?.value)) if (!latestTo.has(id)) latestTo.set(id, e)' },
  { name: 'project: a Proposed project must already carry its project-level ruling (DP3)', file: 'dctr-project.mjs',
    clause: 'S10 start: the end state with a project-level item whose ruling is not yet written, never-becomes entries, and E1 with planned phases p1 and p2 proposed (DP3) [2: ZERO findings]',
    from: "c.projectLevel && ['Ruled', 'Done'].includes(ps?.value) && ", to: 'c.projectLevel && ' },
  { name: 'project: an Open or Done epic Coverage may name a phase that is not a member (DP2)', file: 'dctr-project.mjs',
    clause: 'coverage — a Done epic whose Coverage names a phase that is not a phase member (DP2) [1: trips]',
    from: 'if (!members.has(ph)) add(', to: 'if (false) add(' },
  { name: 'project: an Open or Done epic may carry a phase member no Coverage names (DP2)', file: 'dctr-project.mjs',
    clause: 'coverage — a Done epic with a phase member no Coverage names (DP2) [1: trips]',
    from: 'if (!named.has(m.name)) add(', to: 'if (false) add(' },
  { name: 'project: planned phase names on a Not started epic must already be members (DP2)', file: 'dctr-project.mjs',
    clause: 'S10 owner rules E1: its Done means, its coverage map naming planned phases p1 and p2, and its combined check with a pass rule (the start end state) [2: ZERO findings]',
    from: "    if (['Open', 'Done'].includes(s)) {\n", to: "    if (['Not started', 'Open', 'Done'].includes(s)) {\n" },
  { name: 'project: a Combined check needs no pass rule (DP17)', file: 'dctr-project.mjs',
    clause: 'evidence — a Done epic whose Combined check has no pass rule (DP17) [1: trips]',
    from: 'else if (!/; pass when \\S/.test(cc)) add(', to: 'else if (false) add(' },
  { name: 'the token script calls herdr in a contained session', file: 'dctr-token.mjs',
    clause: 'clause 1bf — T-token: contained (DCTR_VIEW_REQUEST_DIR set, inside herdr, pane set) it stands down with exit 0 and calls herdr ZERO times',
    from: "(process.env.DCTR_VIEW_REQUEST_DIR ? 'contained session", to: "(false ? 'contained session" },
  { name: 'the owed suffix is published', file: 'dctr-lib.mjs', clause: 'T-token: each option set builds its exact argv',
    from: "`doctrine=r${round}·e${exitCount}·v${valve}${owed ? '·owed' : ''}`,",
    to: "`doctrine=r${round}·e${exitCount}·v${valve}`," },
  { name: 'the epic token is published', file: 'dctr-lib.mjs', clause: 'T-token: each option set builds its exact argv',
    from: "    ...(epic ? ['--token', `epic=${epic}`] : []),\n", to: '' },
  { name: 'the phase token is published', file: 'dctr-lib.mjs', clause: 'T-token: each option set builds its exact argv',
    from: "    ...(phase ? ['--token', `phase=${phase}`] : []),\n", to: '' },
  { name: 'an epic or phase value must match the ID pattern', file: 'dctr-token.mjs', clause: 'T-token: every malformed call exits 1',
    from: '  if (value === undefined || !ID_RE.test(value)) usage()', to: '  if (value === undefined) usage()' },
  { name: 'a repeated flag is refused', file: 'dctr-token.mjs', clause: 'T-token: every malformed call exits 1',
    from: '  if (!key || Object.hasOwn(opts, key)) usage()', to: '  if (!key) usage()' },
  { name: 'flag lookup cannot reach inherited names', file: 'dctr-token.mjs', clause: 'T-token: every malformed call exits 1',
    from: '  const key = FLAGS.get(rest[i])', to: '  const key = Object.fromEntries(FLAGS)[rest[i]]' },
  // Repair of 2026-09-13: a suite that never ran was read as a suite that noticed nothing.
  { name: 'a suite that could not be run is read as one that stayed green', file: 'dctr-lib.mjs',
    clause: 'clause 1bg — a suite that NEVER RAN is error, never a clause staying green',
    from: "(typeof code !== 'number' ? 'error'", to: "(false ? 'error'" },
  { name: 'a suite that died without a FAIL line is read as one that noticed', file: 'dctr-lib.mjs',
    clause: 'clause 2bg — and the three outcomes of a suite that DID run are unchanged',
    from: "? 'noticed' : 'silent')", to: "? 'noticed' : 'noticed')" },
  { name: 'the parsed options reach the builder', file: 'dctr-token.mjs', clause: 'T-token: each well-formed call makes exactly one herdr call',
    from: 'const args = metadataTokenArgs(process.env.HERDR_PANE_ID, round, exitCount, valve, opts)',
    to: 'const args = metadataTokenArgs(process.env.HERDR_PANE_ID, round, exitCount, valve)' },
]

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-mutations-'))
const execFileAsync = promisify(execFile)

/** How many mutations run at once. Each works on its own copy of the tree and touches nothing
 *  shared, so they were always independent; they were merely run one at a time, for 17 minutes.
 *  Not `availableParallelism()`: the suites make real timing assertions (a watcher that must still
 *  be alive after N polls), and a box loaded to its core count is where those go flaky. Eight is
 *  well inside the headroom on the 32-core host this was measured on; DCTR_JOBS overrides it. */
// `|| default` read 0 as absent, so DCTR_JOBS=0 silently ran the full parallel default — the
// OPPOSITE of what the operator asked for, and silently, which is how a measurement run reports a
// number that means the other thing. Any finite value is honoured and clamped to at least 1.
const ENV_JOBS = Number(process.env.DCTR_JOBS)
const JOBS = process.env.DCTR_JOBS && Number.isFinite(ENV_JOBS)
  ? Math.max(1, Math.floor(ENV_JOBS))
  : Math.min(8, os.availableParallelism?.() ?? 4)

/** A mutation is caught if ANY suite notices it. Running all of them is what lets one harness cover
 *  the launcher and the seat hook's teardown without deciding in advance which suite owns which line. */
const runSuite = async (dir, suite) => {
  try {
    const { stdout } = await execFileAsync('node', [path.join(dir, suite)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'mutation-harness' } })
    return { code: 0, out: String(stdout || '') }
  } catch (e) {
    // `e.code ?? 1` used to be here, which turned a spawn that never started (`EAGAIN`) and a
    // process a signal killed (`code` null) into the exit status 1 of a suite that ran. Both are
    // carried through untouched now; `suiteOutcome` is what reads them.
    return { code: e.code, signal: e.signal, out: String(e.stdout || '') + String(e.stderr || '') }
  }
}

/** A mutation is caught when a CLAUSE goes red, which is not the same as the suite exiting non-zero.
 *  A mutation that leaves the file unparseable also exits non-zero, and counting that as "the clause
 *  noticed" certifies a pin the suite does not have — the same defect this harness exists to catch,
 *  one level up. Replacing a mutation's replacement text with `deliberately invalid javascript @@@`
 *  used to yield `all 15 repairs are pinned`. So a FAIL line is required, and a suite that never ran
 *  at all is a third answer, not a quiet "no": see `suiteOutcome`.
 *
 *  Sequential inside one mutation, so the cheapest suite still short-circuits the expensive ones.
 *  The parallelism is ACROSS mutations, where there is nothing to short-circuit.
 *
 *  A suite that could not run is retried ONCE before the mutation is given up as unjudgeable: what
 *  produced this class was momentary load at eight workers, and one retry is what turns it back
 *  into a verdict instead of a re-run of the whole gate. */
const judge = async (dir, suite) => {
  const first = await runSuite(dir, suite)
  const outcome = suiteOutcome(first)
  if (outcome !== 'error') return { res: first, outcome }
  const again = await runSuite(dir, suite)
  return { res: again, outcome: suiteOutcome(again) }
}
const whyUnrun = (res) => `could not be run (${res.signal || res.code})`
const anySuiteNotices = async (dir) => {
  for (const s of SUITES) {
    const { res, outcome } = await judge(dir, s)
    if (outcome === 'error') return { caught: false, error: `${s} ${whyUnrun(res)}` }
    if (outcome === 'noticed') return { caught: true, error: null }
  }
  return { caught: false, error: null }
}

let failures = 0
/** Mutations the run could not judge, because a suite never started or a signal killed it. Counted
 *  apart from `failures`: "nothing pins this clause" and "this clause was never asked" are different
 *  reports, and merging them is what sent an operator after three repairs that were pinned all along. */
let errors = 0
const baseline = path.join(work, 'baseline')
fs.mkdirSync(baseline)
for (const f of FILES) fs.copyFileSync(path.join(HERE, f), path.join(baseline, f))
const baselineResults = await mapPool(SUITES, JOBS, async (suite) => ({ suite, ...await judge(baseline, suite) }))
const baselineShort = poolShortfall(baselineResults, SUITES.length)
if (baselineShort) {
  console.log(`  FAIL the baseline pool produced ${SUITES.length - baselineShort} of ${SUITES.length} results`)
  failures += 1
}
for (const r of baselineResults) {
  // `r` can be undefined when the pool short-changed us, and the shortfall above has already been
  // counted; dereferencing it here died with a TypeError instead of printing the footer.
  if (r && r.outcome === 'error') {
    // Not "this suite fails": it never ran, twice. Saying it failed sends the operator into a suite
    // that is fine, which is the same misreport the mutation loop's ERROR line exists to stop.
    console.log(`  FAIL baseline ${r.suite} ${whyUnrun(r.res)}; nothing can be judged against a suite that did not run`)
    failures += 1
  } else if (r && r.res.code !== 0) {
    console.log(`  FAIL baseline ${r.suite} — every suite must pass before any mutation means anything`)
    failures += 1
  }
}
// STOP HERE. Every mutation below compares against a suite that is already red, so all of them
// report "reverted, and the suite stayed green" whether they are pinned or not. Running them anyway
// cost four minutes and printed eleven confident, meaningless failures under one true line at the
// top — which the operator then read from the bottom. A result nobody can act on is worse than no
// result, because it looks like one.
if (failures) {
  console.log(`\nBASELINE RED — ${failures} suite(s) fail before any mutation. Nothing below would mean anything, so nothing below ran.`)
  process.exit(1)
}

// Printed in INPUT order as results settle, never completion order: a run must read the same twice,
// and a reader lining a FAIL up against the mutation list must not have to sort it first. A slow
// early mutation holds back the lines behind it, which is honest — it is what is actually happening.
const results = new Array(MUTATIONS.length)
let cursor = 0
const drain = () => { while (cursor < results.length && results[cursor] !== undefined) console.log(results[cursor++]) }

await mapPool(MUTATIONS, JOBS, async (m, idx) => {
  const dir = path.join(work, String(idx).padStart(3, '0') + '-' + m.name.replace(/[^a-z]+/gi, '-'))
  fs.mkdirSync(dir)
  for (const f of FILES) fs.copyFileSync(path.join(HERE, f), path.join(dir, f))
  const target = path.join(dir, m.file)
  const before = fs.readFileSync(target, 'utf8')
  const hits = anchorCount(before, m.from)
  const verdict = anchorVerdict(hits)
  if (verdict !== 'apply') {
    failures += 1
    results[idx] = verdict === 'missing'
      ? `  FAIL ${m.name} — its anchor is no longer in ${m.file}; a mutation that cannot apply guards nothing`
      : `  FAIL ${m.name} — its anchor occurs ${hits} times in ${m.file}; replace() takes the first and the rest go unguarded`
  } else {
    fs.writeFileSync(target, before.replace(m.from, m.to))
    const v = await anySuiteNotices(dir)
    if (v.error) {
      errors += 1
      results[idx] = `  ERROR ${m.name} — ${v.error}; this mutation was not judged either way`
    } else if (!v.caught) {
      failures += 1
      results[idx] = `  FAIL ${m.name} — reverted, and the suite stayed green. Nothing pins "${m.clause}"`
    } else {
      results[idx] = `  ok   ${m.name}`
    }
  }
  drain()
})

// The gate's guard against its own machinery. A pool that silently ran nothing would leave every
// slot undefined and this file would still print "all N repairs are pinned" and exit 0 — a red team
// produced exactly that footer, with zero suites executed, by substituting a pool that returned []
// without invoking its callback. Counting the results is what makes that impossible to miss.
const shortfall = poolShortfall(results, MUTATIONS.length)
if (shortfall) {
  console.log(`  FAIL the pool produced ${MUTATIONS.length - shortfall} of ${MUTATIONS.length} results; this run certifies nothing`)
  failures += shortfall
}

fs.rmSync(work, { recursive: true, force: true })
// An unjudged mutation is still a red run — it certifies nothing about the clause it names — but it
// is reported as its own number, so a reader can tell a repair nothing pins from a suite that never
// started. Re-running the gate is the answer to the second one, and never to the first.
const tail = errors ? ` (${errors} unjudged: a suite could not be run)` : ''
console.log(failures || errors
  ? `\n${failures} FAILED${tail}`
  : `\nall ${MUTATIONS.length} repairs are pinned by a clause that goes red without them`)
process.exit(failures || errors ? 1 : 0)
