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
import { mapPool, poolShortfall, anchorCount, anchorVerdict } from './dctr-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Everything a suite READS, not only what a mutation targets. hooks.json is here because a clause
// pins SESSION_END_WAIT_MS against the SessionEnd timeout declared there; without the copy that
// clause threw ENOENT, the whole pure suite died on load, and eleven previously-pinned functions
// reported unpinned in one run. A suite that reads a file outside this list is silently disabled
// inside the gate, which is the loudest quiet failure this harness has.
const FILES = ['dctr-lib.mjs', 'dctr-state.mjs', 'dctr-pane.mjs', 'dctr-pane.selftest.mjs',
  'dctr-seat.mjs', 'dctr-seat.selftest.mjs', 'dctr-seat.teardown.selftest.mjs', 'dctr-gate.mjs', 'dctr-gate.selftest.mjs',
  'hooks.json']
/** Cheapest first, and the order is the MEASURED one: `some` stops at the first suite that notices,
 *  so a mutation pays for every suite ahead of the one that catches it. Measured standalone at
 *  008014d: seat 17ms, gate 439ms, pane 8.2s, teardown 19.1s. This list previously read seat, pane,
 *  teardown, gate, was commented "cheapest first", and was not: every mutation only the gate suite
 *  caught paid 27.8s instead of 0.5s. Re-measure before reordering; the comment is a claim. */
const SUITES = ['dctr-seat.selftest.mjs', 'dctr-gate.selftest.mjs', 'dctr-pane.selftest.mjs', 'dctr-seat.teardown.selftest.mjs']

/** Each entry reverts one repair to what it replaced. `clause` names what should go red — it is
 *  reported when the mutation survives, so the failure says which behaviour is unpinned. */
const MUTATIONS = [
  { name: 'the single-string gate path drops pipefail, so a piped check reports its last stage', file: 'dctr-gate.mjs',
    clause: 'clause 4 — a piped check whose upstream fails under a succeeding last stage records a FAILURE',
    from: "spawn('bash', ['-o', 'pipefail', '-c', command[0]]",
    to: "spawn('bash', ['-c', command[0]]" },
  { name: 'the child writes the completion marker unescaped, forging the wait predicate', file: 'dctr-gate.mjs',
    clause: "clause 5 — a check that prints its own exit= line leaves exactly ONE marker line, and it is the launcher's real status",
    from: "      if (atLineStart && line.length >= MARKER.length && line.subarray(0, MARKER.length).equals(MARKER)) parts.push(SPACE)",
    to: "      if (false) parts.push(SPACE)" },
  { name: 'the guard decodes each chunk as a string, corrupting a split multi-byte character', file: 'dctr-gate.mjs',
    // Aimed at 6d, not 6: 6d forces the boundary with two deliberate writes, while 6's bulk fixture
    // survives the mutation whenever the reader's chunks happen to align to the character width.
    clause: 'clause 6d — a three-byte character split across two writes arrives intact',
    from: "    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(String(input))",
    to: "    const chunk = Buffer.from(String(input))" },
  { name: "the launcher's own header is written unguarded, so a command's text can forge a marker", file: 'dctr-gate.mjs',
    clause: 'clause 6b — a command whose own text contains a marker line cannot forge one through the echoed header',
    from: "  guarded(`\\x1b[2m── doctrine gate · ${label}\\x1b[0m\\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\\n`)",
    to: "  raw(Buffer.from(`\\x1b[2m── doctrine gate · ${label}\\x1b[0m\\n$ ${command.length === 1 ? command[0] : command.map(shq).join(' ')}\\n`))" },
  { name: 'a held-back marker prefix is never flushed, so the last unterminated write lands after the exit line', file: 'dctr-gate.mjs',
    clause: "clause 5f — a check whose LAST write is an unterminated marker prefix keeps that output, and the status is still the check's",
    from: "    if (carry.length) { raw(carry); carry = Buffer.alloc(0); atLineStart = false }",
    to: "    if (false) { raw(carry); carry = Buffer.alloc(0); atLineStart = false }" },
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
  { name: 'the detached path stops emitting its positional placeholders', file: 'dctr-gate.mjs',
    clause: 'clause 2b — the no-herdr path called herdr ZERO times',
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
    from: "  child.on('error', (e) => { guarded(`${e.message}\\n`); receipt(`${exitLine(127)}\\n`); fs.closeSync(file); process.exit(127) })",
    to: "  child.on('error', (e) => { guarded(`${e.message}\\n`); receipt(`${exitLine(127)}\\n`); fs.closeSync(file); if (marker) try { fs.rmSync(marker, { force: true }) } catch {} ; process.exit(127) })" },
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
  { name: 'close-on-next spares a FOCUSED finished pane', file: 'dctr-lib.mjs', clause: 'a FINISHED codex pane someone is looking at still stays',
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
  } catch (e) { return { code: e.code ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
}

/** A mutation is caught when a CLAUSE goes red, which is not the same as the suite exiting non-zero.
 *  A mutation that leaves the file unparseable also exits non-zero, and counting that as "the clause
 *  noticed" certifies a pin the suite does not have — the same defect this harness exists to catch,
 *  one level up. Replacing a mutation's replacement text with `deliberately invalid javascript @@@`
 *  used to yield `all 15 repairs are pinned`. So require the suite to print a FAIL line: an
 *  import-time SyntaxError prints none, and a real clause failure always does. */
const noticed = (r) => r.code !== 0 && /^ *FAIL /m.test(r.out)
/** Sequential inside one mutation, so the cheapest suite still short-circuits the expensive ones.
 *  The parallelism is ACROSS mutations, where there is nothing to short-circuit. */
const anySuiteNotices = async (dir) => {
  for (const s of SUITES) if (noticed(await runSuite(dir, s))) return true
  return false
}

let failures = 0
const baseline = path.join(work, 'baseline')
fs.mkdirSync(baseline)
for (const f of FILES) fs.copyFileSync(path.join(HERE, f), path.join(baseline, f))
const baselineResults = await mapPool(SUITES, JOBS, async (suite) => ({ suite, res: await runSuite(baseline, suite) }))
const baselineShort = poolShortfall(baselineResults, SUITES.length)
if (baselineShort) {
  console.log(`  FAIL the baseline pool produced ${SUITES.length - baselineShort} of ${SUITES.length} results`)
  failures += 1
}
for (const r of baselineResults) {
  // `r` can be undefined when the pool short-changed us, and the shortfall above has already been
  // counted; dereferencing it here died with a TypeError instead of printing the footer.
  if (r && r.res.code !== 0) {
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
    if (!await anySuiteNotices(dir)) {
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
console.log(failures ? `\n${failures} FAILED` : `\nall ${MUTATIONS.length} repairs are pinned by a clause that goes red without them`)
process.exit(failures ? 1 : 0)
