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
// A mutation whose `from` text is absent is a FAILURE, not a skip. Otherwise renaming a line
// silently retires the mutation that guarded it, which is the same defect one level up.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILES = ['dctr-lib.mjs', 'dctr-state.mjs', 'dctr-pane.mjs', 'dctr-pane.selftest.mjs',
  'dctr-seat.mjs', 'dctr-seat.selftest.mjs', 'dctr-seat.teardown.selftest.mjs', 'dctr-gate.mjs', 'dctr-gate.selftest.mjs']
/** Cheapest first: the pure suite answers in milliseconds, and `some` stops at the first that notices. */
const SUITES = ['dctr-seat.selftest.mjs', 'dctr-pane.selftest.mjs', 'dctr-seat.teardown.selftest.mjs', 'dctr-gate.selftest.mjs']

/** Each entry reverts one repair to what it replaced. `clause` names what should go red — it is
 *  reported when the mutation survives, so the failure says which behaviour is unpinned. */
const MUTATIONS = [
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
  { name: 'a lookup that failed does not become a close', file: 'dctr-seat.mjs', clause: 'a pane whose lookup failed is NOT closed',
    from: '      catch (e) { if (!isPaneNotFound(e)) lookupFailed = String(e.message).split(\'\\n\')[0] }',
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
  { name: 'a focused side pane keeps its title on stop', file: 'dctr-seat.mjs', clause: 'a focused side pane is renamed to its label plus done',
    from: "      } else if (stopAction(pane) === 'relabel') try { herdr(['pane', 'rename', seat.paneId, `${seat.label || seat.agent} · done`]) } catch { /* label only */ }",
    to: "      } else if (stopAction(pane) === 'relabel') try { herdr(['pane', 'rename', seat.paneId, `${seat.agent} · done`]) } catch { /* label only */ }" },
]

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-mutations-'))
/** A mutation is caught if ANY suite notices it. Running both is what lets one harness cover the
 *  launcher and the seat hook's teardown without deciding in advance which suite owns which line. */
const runSuite = (dir, suite) => {
  try {
    const out = execFileSync('node', [path.join(dir, suite)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'mutation-harness' } })
    return { code: 0, out: String(out || '') }
  } catch (e) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
}

/** A mutation is caught when a CLAUSE goes red, which is not the same as the suite exiting non-zero.
 *  A mutation that leaves the file unparseable also exits non-zero, and counting that as "the clause
 *  noticed" certifies a pin the suite does not have — the same defect this harness exists to catch,
 *  one level up. Replacing a mutation's replacement text with `deliberately invalid javascript @@@`
 *  used to yield `all 15 repairs are pinned`. So require the suite to print a FAIL line: an
 *  import-time SyntaxError prints none, and a real clause failure always does.
 *
 *  Running both suites is what lets one harness cover the launcher and the seat hook's teardown
 *  without deciding in advance which suite owns which line. */
const noticed = (r) => r.code !== 0 && /^ *FAIL /m.test(r.out)
const anySuiteNotices = (dir) => SUITES.some((s) => noticed(runSuite(dir, s)))

let failures = 0
const baseline = path.join(work, 'baseline')
fs.mkdirSync(baseline)
for (const f of FILES) fs.copyFileSync(path.join(HERE, f), path.join(baseline, f))
for (const suite of SUITES) {
  if (runSuite(baseline, suite).code !== 0) {
    console.log(`  FAIL baseline ${suite} — every suite must pass before any mutation means anything`)
    failures += 1
  }
}

for (const m of MUTATIONS) {
  const dir = path.join(work, m.name.replace(/[^a-z]+/gi, '-'))
  fs.mkdirSync(dir)
  for (const f of FILES) fs.copyFileSync(path.join(HERE, f), path.join(dir, f))
  const target = path.join(dir, m.file)
  const before = fs.readFileSync(target, 'utf8')
  if (!before.includes(m.from)) {
    console.log(`  FAIL ${m.name} — its anchor is no longer in ${m.file}; a mutation that cannot apply guards nothing`)
    failures += 1
    continue
  }
  fs.writeFileSync(target, before.replace(m.from, m.to))
  if (!anySuiteNotices(dir)) {
    console.log(`  FAIL ${m.name} — reverted, and the suite stayed green. Nothing pins "${m.clause}"`)
    failures += 1
  } else {
    console.log(`  ok   ${m.name}`)
  }
}

fs.rmSync(work, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : `\nall ${MUTATIONS.length} repairs are pinned by a clause that goes red without them`)
process.exit(failures ? 1 : 0)
