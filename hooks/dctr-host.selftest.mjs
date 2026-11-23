// Three-clause tamper test for the host seam (dctr-host.mjs), and the seat hook and gate launcher run in BOTH hosts
// from one table (issue #111, phase A).
//
//   node hooks/dctr-host.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// A fake host, dctr-host.fake.mjs, is linked first on PATH as `herdr`, `herdr-app` and `hc`, so one model of spaces,
// tabs and panes answers whichever CLI a host calls, in that CLI's measured reply shapes, and logs every call.
//
// Part A, the seam: each method in each host, clause 1 a not-found answer or a failed call and what the method makes of
// it, clause 2 the known-good answer, clause 3 the fixture's own reply read straight from the fake with no seam.
// Part B, the table: placement, the cap, overflow, focus and close for the seat hook and the gate launcher, every row
// run once per host and asserted on the model the fake keeps, so the two hosts are held to one behaviour.

// The suite forces each host itself, so it inherits neither a herdr-core terminal's id nor a TUI pane's variables.
for (const k of Object.keys(process.env)) if (k.startsWith('HERDR_') || k === 'HC_TERMINAL_ID' || k === 'TERM_PROGRAM') delete process.env[k]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { SIDE_CAP } from './dctr-lib.mjs'

const HERE = import.meta.dirname
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-host-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
for (const name of ['herdr', 'herdr-app', 'hc']) {
  fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec node ${JSON.stringify(path.join(HERE, 'dctr-host.fake.mjs'))} "$0" "$@"\n`)
  fs.chmodSync(path.join(bin, name), 0o755)
}
// The fake reads its CLI name from the wrapper's own path, "$0".
const STATE = path.join(tmp, 'state.json')
process.env.PATH = `${bin}:${process.env.PATH}`
process.env.DCTR_FAKE_STATE = STATE
// A new calls file for every fresh model: a detached `hc rm` from one run logs into that run's file, never the next.
let runs = 0

let bad = 0
const clause = (n, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log(`        ${detail}`) } }

/** A fresh model: one space S1 whose tab T1 holds the session pane P1 (terminal t1), and a second tab T2 holding P2. */
const fresh = (extra = {}) => {
  fs.writeFileSync(STATE, JSON.stringify({ n: 100, exec: false, splitFocuses: false, focus: { tab: 'T1', pane: 'P1' },
    spaces: [{ id: 'S1', name: 'proj', tabs: [{ id: 'T1', name: '1', panes: [{ pane: 'P1', terminal: 't1' }] }, { id: 'T2', name: 'two', panes: [{ pane: 'P2', terminal: 't2' }] }] }], ...extra }))
  process.env.DCTR_FAKE_CALLS = path.join(tmp, `calls-${++runs}`)
  fs.writeFileSync(process.env.DCTR_FAKE_CALLS, '')
}
const model = () => JSON.parse(fs.readFileSync(STATE, 'utf8'))
const calls = () => fs.readFileSync(process.env.DCTR_FAKE_CALLS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const panesOf = (m, tab) => m.spaces.flatMap((s) => s.tabs).find((t) => t.id === tab)?.panes ?? []
const allTabs = (m) => m.spaces.flatMap((s) => s.tabs)
const hasPane = (m, p) => allTabs(m).some((t) => t.panes.some((x) => x.pane === p))
const withFail = (fail, fn) => { process.env.DCTR_FAKE_FAIL = JSON.stringify(fail); try { return fn() } finally { delete process.env.DCTR_FAKE_FAIL } }
const throws = (fn) => { try { fn(); return false } catch { return true } }
/** The fake called directly, no seam: clause 3's witness. */
const direct = (name, args, fail = {}) => spawnSync(path.join(bin, name), args, { encoding: 'utf8', env: { ...process.env, DCTR_FAKE_FAIL: JSON.stringify(fail) } })

const { herdrHost, hcHost, hostFor, gateAnswer, isAppNotFound, hcArgv } = await import('./dctr-host.mjs')
const HOST_ENV = {
  herdr: { TERM_PROGRAM: 'herdr', HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'S1', HERDR_PANE_ID: 'P1', HERDR_TAB_ID: 'T1' },
  // The measured herdr-core case: a core first started from a TUI pane leaks that pane's HERDR_* into every terminal.
  hc: { TERM_PROGRAM: 'ghostty', HC_TERMINAL_ID: 't1', HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w2Z', HERDR_PANE_ID: 'w2Z:p1', HERDR_TAB_ID: 'w2Z:t1' },
}
const HOSTS = { herdr: herdrHost(HOST_ENV.herdr), hc: hcHost(HOST_ENV.hc) }
// Per host, which call a failure is injected into for each read, and the CLI that answers it.
const READ = { herdr: { pane: 'herdr pane get', tabs: 'herdr tab list', tab: 'herdr tab get', layout: 'herdr pane layout' },
  hc: { pane: 'herdr-app ls', tabs: 'herdr-app ls', tab: 'herdr-app ls', layout: 'herdr-app ls' } }
const CLOSE = { herdr: { pane: 'herdr pane close', tab: 'herdr tab close' }, hc: { pane: 'herdr-app do pane.close', tab: 'herdr-app do tab.close' } }

// ------------------------------------------------------------------ part A: the seam, method by method, both hosts
clause('clause 2s — hostFor picks herdr-core for an HC_TERMINAL_ID terminal, leaked HERDR_* or not, and the herdr TUI otherwise',
  hostFor(HOST_ENV.hc).name === 'herdr-core' && hostFor(HOST_ENV.herdr).name === 'herdr' && hostFor({}).name === 'herdr',
  `${hostFor(HOST_ENV.hc).name} ${hostFor(HOST_ENV.herdr).name}`)

for (const [h, host] of Object.entries(HOSTS)) {
  fresh()
  const me = host.self()
  clause(`clause 2a ${h} — self names the session's pane, tab and space`, me?.pane === 'P1' && me?.tab === 'T1' && me?.space === 'S1', JSON.stringify(me))
  if (h === 'hc') {
    // The leaked TUI variables must not be read: the pane comes from herdr-app ls, by HC_TERMINAL_ID.
    const lost = hcHost({ ...HOST_ENV.hc, HC_TERMINAL_ID: 't99' }).self()
    const failed = withFail({ 'herdr-app ls': 'transport' }, () => host.self())
    clause('clause 1a hc — a terminal ls does not list, and a failed ls, are a null self, never the leaked HERDR_PANE_ID', lost === null && failed === null, JSON.stringify({ lost, failed }))
  }
  const layout = host.layout(me)
  clause(`clause 2b ${h} — layout lists the session tab's panes, by pane_id`, JSON.stringify(layout?.map((p) => p.pane_id)) === '["P1"]', JSON.stringify(layout))
  const blind = withFail({ [READ[h].layout]: 'transport' }, () => host.layout(me))
  const empty = withFail({ [READ[h].layout]: 'empty' }, () => host.layout(me))
  clause(`clause 1b ${h} — a failed or empty layout read is null ("I could not look"), never an empty column`, blind === null && empty === null, JSON.stringify({ blind, empty }))

  fresh({ focus: { tab: 'T1', pane: 'P1' } })
  const info = host.paneInfo('P1'), other = host.paneInfo('P2'), gone = host.paneInfo('P404')
  clause(`clause 2c ${h} — paneInfo: the focused pane is focused, another is not`, info.exists && info.focused === true && other.exists && other.focused === false, JSON.stringify({ info, other }))
  clause(`clause 1c ${h} — paneInfo: a pane the host does not have is { exists: false }, with no focus to misread`, gone.exists === false && !('focused' in gone), JSON.stringify(gone))
  clause(`clause 1c2 ${h} — paneInfo: a failed or empty lookup THROWS, never answers gone`,
    withFail({ [READ[h].pane]: 'transport' }, () => throws(() => host.paneInfo('P1'))) && withFail({ [READ[h].pane]: 'empty' }, () => { try { return host.paneInfo('P1').exists !== false } catch { return true } }),
    'a lookup that failed must not read as an absence')

  const tabs = host.tabs()
  clause(`clause 2d ${h} — tabs lists each tab with its focus and label`, tabs.find((t) => t.tab_id === 'T1')?.focused === true && tabs.find((t) => t.tab_id === 'T2')?.focused === false && tabs.find((t) => t.tab_id === 'T2')?.label === 'two', JSON.stringify(tabs))
  clause(`clause 1d ${h} — tabs: a failed list or one that is not a list THROWS`,
    withFail({ [READ[h].tabs]: 'transport' }, () => throws(() => host.tabs())) && withFail({ [READ[h].tabs]: 'empty' }, () => throws(() => host.tabs())), 'a list that failed must not read as no tabs')
  if (h === 'hc') {
    // A status that names no focus is an unknown focus, never "not focused": that is the one a blind close destroys.
    const blindPane = withFail({ 'herdr-app status': 'empty' }, () => host.paneInfo('P1'))
    const blindTabs = withFail({ 'herdr-app status': 'empty' }, () => host.tabs())
    clause('clause 1c3 hc — a status reply naming no focus leaves paneInfo and tabs focus UNKNOWN (undefined), never false',
      blindPane.exists === true && blindPane.focused === undefined && blindTabs.every((t) => t.focused === undefined), JSON.stringify({ blindPane, blindTabs }))
    const st = direct('herdr-app', ['status'], { 'herdr-app status': 'empty' })
    clause('clause 3c3 hc — that status fixture really answers {} on exit 0, proved without the seam', st.status === 0 && st.stdout.trim() === '{}', st.stdout)
  }
  clause(`clause 2e/1e ${h} — tabInfo: a listed tab exists, an unlisted one does not, a failed lookup throws`,
    host.tabInfo('T2').exists === true && host.tabInfo('T404').exists === false && withFail({ [READ[h].tab]: 'transport' }, () => throws(() => host.tabInfo('T2'))), '')

  // Creation: the right split founds the column, down stacks under its target, a tab is not focused.
  fresh()
  const r = host.splitRight('P1', '/w d', 'echo hi', 'lbl')
  const d = host.splitDown(r.paneId, '/w d', 'echo hi', 'lbl')
  const t = host.newTab(me, '/w d', 'echo hi', 'lbl')
  const m = model()
  const tab = allTabs(m).find((x) => x.id === t.tabId)
  clause(`clause 2f ${h} — splitRight and splitDown add panes in the session tab, newTab a named tab in the session's space`,
    JSON.stringify(panesOf(m, 'T1').map((x) => [x.pane, x.split ?? null])) === JSON.stringify([['P1', null], [r.paneId, 'right'], [d.paneId, 'down']]) &&
    m.spaces[0].tabs.some((x) => x.id === t.tabId) && tab?.name === 'lbl' && tab?.panes[0]?.pane === t.paneId && m.focus.pane === 'P1',
    JSON.stringify(m.spaces[0].tabs))
  if (h === 'hc') {
    const argvs = [panesOf(m, 'T1')[1].argv, tab.panes[0].argv]
    clause('clause 2f hc — herdr-core gets the command at creation, in the cwd, and the tab is made with focus false',
      argvs.every((a) => JSON.stringify(a) === JSON.stringify(hcArgv('/w d', 'echo hi'))) && spawnSync('sh', hcArgv('/', 'pwd').slice(1), { encoding: 'utf8' }).stdout.trim() === '/' && tab.focusArg === 'false',
      JSON.stringify({ argvs, focus: tab.focusArg }))
    fresh({ splitFocuses: true })
    const stolen = host.splitRight('P1', '/', 'true', 'lbl')
    clause('clause 1f hc — a split that takes the window\'s focus hands it back to the pane that held it', model().focus.pane === 'P1' && stolen.paneId !== 'P1', JSON.stringify(model().focus))
  } else {
    const cs = calls().filter((c) => c.args[1] === 'split' || c.args[1] === 'create')
    clause('clause 2f herdr — the TUI argv is unchanged: --no-focus, the seat HISTFILE and --cwd on every creation, --ratio on the right split',
      cs.length === 3 && cs.every((c) => c.args.includes('--no-focus') && c.args.includes('--cwd') && c.args.some((a) => a.startsWith('HISTFILE='))) && cs[0].args.includes('--ratio') && !cs[1].args.includes('--ratio'),
      JSON.stringify(cs))
  }

  // Close: closed, gone, or a throw for anything else; on herdr-core the finished terminal is removed.
  fresh()
  const closed = host.closePane('P2')
  const again = host.closePane('P2')
  const failedClose = withFail({ [CLOSE[h].pane]: 'transport' }, () => { try { return host.closePane('P1') } catch { return 'threw' } })
  clause(`clause 2g/1g ${h} — closePane: 'closed', then 'gone' for the same pane, and a failed close THROWS`,
    closed === 'closed' && again === 'gone' && failedClose === 'threw' && hasPane(model(), 'P1') && !hasPane(model(), 'P2'), JSON.stringify({ closed, again, failedClose }))
  fresh()
  const tclosed = host.closeTab('T2'), tagain = host.closeTab('T2')
  const tfailed = withFail({ [CLOSE[h].tab]: 'transport' }, () => { try { return host.closeTab('T1') } catch { return 'threw' } })
  clause(`clause 2h/1h ${h} — closeTab: 'closed', then 'gone', and a failed close THROWS`, tclosed === 'closed' && tagain === 'gone' && tfailed === 'threw', JSON.stringify({ tclosed, tagain, tfailed }))
  if (h === 'hc') {
    const until = Date.now() + 5000
    let rm = []
    while (Date.now() < until && rm.length < 2) { rm = calls().filter((c) => c.bin === 'hc' && c.args[0] === 'rm').map((c) => c.args[1]); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50) }
    clause('clause 2i hc — a close removes the closed pane\'s terminal from hc, from a detached child that outlives the caller', rm.includes('t2'), JSON.stringify(calls().filter((c) => c.bin === 'hc')))
  }

  // gateAnswer: found, not_found, failed, and another host's gate is never judged.
  fresh()
  const ans = (g, fail = {}) => withFail(fail, () => gateAnswer(host, g))
  const tag = h === 'hc' ? { host: 'herdr-core' } : {}
  const foreign = h === 'hc' ? {} : { host: 'herdr-core' }
  clause(`clause 2j/1j ${h} — gateAnswer: found, not_found for a pane and a tab, failed for a failed lookup and for another host's gate`,
    ans({ paneId: 'P2', ...tag }) === 'found' && ans({ paneId: 'P404', ...tag }) === 'not_found' && ans({ tabId: 'T404', paneId: 'P2', ...tag }) === 'not_found' &&
    ans({ paneId: 'P2', ...tag }, { [READ[h].pane]: 'transport' }) === 'failed' && ans({ paneId: 'P404', ...foreign }) === 'failed',
    '')
}

// The not-found shapes, read from the fake with no seam: what clauses 1c, 1g and 1h stand on.
const nfPane = direct('herdr-app', ['do', 'pane.close', '--pane', 'P404']), nfTab = direct('herdr-app', ['do', 'tab.close', '--id', 'T404'])
const tr = direct('herdr-app', ['ls'], { 'herdr-app ls': 'transport' })
const hnf = direct('herdr', ['pane', 'close', 'P404']), htr = direct('herdr', ['pane', 'get', 'P1'], { 'herdr pane get': 'transport' })
clause('clause 3a — the fixtures really answer as measured: herdr-app `no pane`/`no tab` on exit 1, herdr pane_not_found on exit 1, and a transport failure that is neither',
  nfPane.status === 1 && JSON.parse(nfPane.stdout).error === 'no pane "P404"' && nfTab.status === 1 && JSON.parse(nfTab.stdout).error === 'no tab "T404"' &&
  tr.status === 1 && !/no (pane|tab)/.test(tr.stdout + tr.stderr) && hnf.status === 1 && /pane_not_found/.test(hnf.stderr) && htr.status === 1 && !/not_found/.test(htr.stderr),
  JSON.stringify({ nfPane: nfPane.stdout, nfTab: nfTab.stdout, tr: tr.stderr, hnf: hnf.stderr }))
clause('clause 1k — isAppNotFound reads the kind it is asked about, and a transport error is never not-found',
  isAppNotFound({ stdout: '{"error":"no pane \\"P1\\""}' }, 'pane') && !isAppNotFound({ stdout: '{"error":"no pane \\"P1\\""}' }, 'tab') &&
  !isAppNotFound({ stderr: '{"error":"the window is not answering"}' }, 'pane') && !isAppNotFound({ stderr: 'no pane "x" mentioned in passing' }, 'pane'), '')

// ------------------------------------------------------------------ part B: the seat hook and the gate launcher, one table, both hosts
const SEAT = path.join(HERE, 'dctr-seat.mjs'), GATE = path.join(HERE, 'dctr-gate.mjs')
const SESSION = 'host-session'
const hookEnv = (h, extra = {}) => ({ ...process.env, ...HOST_ENV[h], TMPDIR: tmp, DCTR_VIEW_REQUEST_DIR: '', CLAUDE_CONFIG_DIR: path.join(tmp, 'cfg'), CLAUDE_CODE_SESSION_ID: SESSION, ...extra })
const seatHook = (h, payload, extra) => spawnSync('node', [SEAT], { input: JSON.stringify({ session_id: SESSION, transcript_path: path.join(tmp, 'parent.jsonl'), cwd: tmp, ...payload }), encoding: 'utf8', env: hookEnv(h, extra), timeout: 30000 })
const start = (h, i, extra) => seatHook(h, { hook_event_name: 'SubagentStart', agent_id: `a${i}`, agent_type: 'Explore', agent_transcript_path: path.join(tmp, `a${i}.jsonl`) }, extra)
const stop = (h, i, extra) => seatHook(h, { hook_event_name: 'SubagentStop', agent_id: `a${i}`, agent_type: 'Explore', agent_transcript_path: path.join(tmp, `a${i}.jsonl`) }, extra)
const seatsDir = path.join(tmp, `dctr-${SESSION}`, 'seats')
const markers = () => { try { return fs.readdirSync(seatsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(seatsDir, f), 'utf8'))) } catch { return [] } }
const markerOf = (i) => markers().find((m) => m.agent_id === `a${i}`)
const resetSession = () => fs.rmSync(path.join(tmp, `dctr-${SESSION}`), { recursive: true, force: true })
const waitFor = (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { if (fn()) return true; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50) } return fn() }

/** One table: every row runs in both hosts against a fresh model and session, and asserts on the model alone. */
const TABLE = [
  { row: 'placement, the cap and overflow: the first seat splits right, the next five stack down, the seventh takes a tab',
    run(h) { for (let i = 1; i <= SIDE_CAP + 1; i++) start(h, i); return model() },
    ok: (m, h) => {
      const side = panesOf(m, 'T1').slice(1)
      // herdr-core cannot rename a pane or type into one: the renderer is given its label and hand-off file at creation.
      const first = markers().find((x) => x.paneId === side[0]?.pane)
      if (h === 'hc' && !(side[0]?.argv?.[2]?.includes(`'${first?.label}'`) && side[0].argv[2].includes(`${first ? path.join(seatsDir, `${first.agent}.json`) : '?'}.handoff`))) return false
      const seatTab = allTabs(m).find((t) => !['T1', 'T2'].includes(t.id))
      return side.length === SIDE_CAP && side[0].split === 'right' && side.slice(1).every((x) => x.split === 'down') && seatTab?.panes.length === 1 &&
        markers().length === SIDE_CAP + 1 && markers().filter((x) => x.tabId).length === 1 && m.focus.pane === 'P1'
    } },
  { row: 'an unfocused side seat closes on stop and its marker goes',
    run(h) { start(h, 1); const p = markerOf(1).paneId; stop(h, 1); return { p } },
    ok: ({ p }) => !hasPane(model(), p) && !markerOf(1) },
  { row: 'a FOCUSED side seat is spared on stop and keeps its marker',
    run(h) { start(h, 1); const p = markerOf(1).paneId; const m = model(); m.focus = { tab: 'T1', pane: p }; fs.writeFileSync(STATE, JSON.stringify(m)); stop(h, 1); return { p } },
    ok: ({ p }) => hasPane(model(), p) && Boolean(markerOf(1)) },
  { row: 'a side seat whose pane the user already closed: the stop reads it gone and drops its marker',
    run(h) { start(h, 1); const p = markerOf(1).paneId; const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== p); fs.writeFileSync(STATE, JSON.stringify(m)); stop(h, 1); return { p } },
    ok: () => !markerOf(1) },
  { row: 'a side seat whose focus lookup FAILED is not closed and keeps its marker',
    run(h) { start(h, 1); const p = markerOf(1).paneId; stop(h, 1, { DCTR_FAKE_FAIL: JSON.stringify({ [READ[h].pane]: 'transport' }) }); return { p } },
    ok: ({ p }) => hasPane(model(), p) && Boolean(markerOf(1)) },
  { row: 'a tab seat: focused it is spared and renamed, unfocused it closes',
    run(h) {
      for (let i = 1; i <= SIDE_CAP + 2; i++) start(h, i)
      const [a, b] = [SIDE_CAP + 1, SIDE_CAP + 2].map((i) => markerOf(i).tabId)
      const m = model(); m.focus = { tab: a, pane: panesOf(m, a)[0].pane }; fs.writeFileSync(STATE, JSON.stringify(m))
      stop(h, SIDE_CAP + 1); stop(h, SIDE_CAP + 2)
      return { a, b }
    },
    ok: ({ a, b }) => allTabs(model()).find((t) => t.id === a)?.name.endsWith('· done') && !allTabs(model()).some((t) => t.id === b) && Boolean(markerOf(SIDE_CAP + 1)) && !markerOf(SIDE_CAP + 2) },
  { row: 'SessionEnd closes every seat left and removes the state directory',
    run(h) { start(h, 1); start(h, 2); const ps = markers().map((x) => x.paneId); seatHook(h, { hook_event_name: 'SessionEnd' }); return { ps } },
    ok: ({ ps }) => ps.length === 2 && ps.every((p) => !hasPane(model(), p)) && !fs.existsSync(path.join(tmp, `dctr-${SESSION}`)) },
  { row: 'a gate runs in a split beside the session, writes exit=N, and closes its own unfocused pane',
    run(h) {
      const m = model(); m.exec = true; fs.writeFileSync(STATE, JSON.stringify(m))
      const out = path.join(tmp, `gate-${h}.out`)
      execFileSync('node', [GATE, 'g', out, '--', 'echo gated; exit 3'], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      const done = waitFor(() => fs.existsSync(`${out}.result`))
      const marker = markers().find((x) => x.role === 'gate'), pane = marker?.paneId
      const terminal = model().spaces.flatMap((s) => s.tabs).flatMap((t) => t.panes).find((x) => x.pane === pane)?.terminal
      waitFor(() => pane && !hasPane(model(), pane))
      const removed = waitFor(() => calls().some((c) => c.bin === 'hc' && c.args[0] === 'rm' && c.args[1] === terminal))
      return { done, out, pane, marker, terminal, removed }
    },
    ok: ({ done, out, pane, marker, terminal, removed }, h) => done && fs.readFileSync(`${out}.result`, 'utf8').startsWith('exit=3') && fs.readFileSync(out, 'utf8') === 'gated\n' && Boolean(pane) && !hasPane(model(), pane) &&
      // A herdr-core marker says so, a TUI marker carries no host field, as every TUI marker always has; and herdr-core's
      // closed terminal is removed by a child that outlived the gate the close hung up.
      (h === 'hc' ? marker?.host === 'herdr-core' && removed : marker && !('host' in marker)) },
  { row: 'with the column full, a gate takes a tab and closes that TAB at completion',
    run(h) {
      for (let i = 1; i <= SIDE_CAP; i++) start(h, i)
      const m = model(); m.exec = true; fs.writeFileSync(STATE, JSON.stringify(m))
      const out = path.join(tmp, `gatetab-${h}.out`)
      execFileSync('node', [GATE, 'g', out, '--', 'true'], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      const tab = markers().find((x) => x.role === 'gate')?.tabId
      const done = waitFor(() => fs.existsSync(`${out}.result`)) && waitFor(() => tab && !allTabs(model()).some((t) => t.id === tab))
      return { done, tab }
    },
    ok: ({ done, tab }) => done && Boolean(tab) && !allTabs(model()).some((t) => t.id === tab) },
  { row: 'a tab gate the user is looking at when it finishes is relabelled with its exit status, and stays',
    run(h) {
      for (let i = 1; i <= SIDE_CAP; i++) start(h, i)
      const m = model(); m.exec = true; fs.writeFileSync(STATE, JSON.stringify(m))
      const out = path.join(tmp, `gatefocus-${h}.out`), go = path.join(tmp, `go-${h}`)
      execFileSync('node', [GATE, 'g', out, '--', `until [ -f ${go} ]; do sleep 0.05; done; exit 4`], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      const tab = markers().find((x) => x.role === 'gate')?.tabId
      const m2 = model(); m2.focus = { tab, pane: panesOf(m2, tab)[0]?.pane }; fs.writeFileSync(STATE, JSON.stringify(m2))
      fs.writeFileSync(go, '')
      const done = waitFor(() => fs.existsSync(`${out}.result`)) && waitFor(() => allTabs(model()).find((t) => t.id === tab)?.name.endsWith('exit=4'))
      return { done, tab }
    },
    ok: ({ done, tab }) => done && allTabs(model()).some((t) => t.id === tab && t.name.endsWith('· exit=4')) },
]
for (const t of TABLE) {
  const res = {}
  for (const h of ['herdr', 'hc']) {
    fresh(); resetSession()
    const r = t.run(h)
    res[h] = Boolean(t.ok(r, h))
    // Each host uses its own CLIs only: herdr-core never calls herdr, the TUI never calls herdr-app or hc.
    const bins = new Set(calls().map((c) => c.bin))
    res[`${h}-own`] = h === 'hc' ? !bins.has('herdr') : !bins.has('herdr-app') && !bins.has('hc')
    resetSession()
  }
  clause(`clause 2t — ${t.row}: in the herdr TUI and in herdr-core alike, each calling only its own host`,
    res.herdr && res.hc && res['herdr-own'] && res['hc-own'], JSON.stringify(res))
}

// The codex watcher on herdr-core, which can type nothing into a pane: the seat's stop writes the watcher line to the
// hand-off file its renderer was started with, and the renderer runs that line in its own place.
{
  fresh(); resetSession()
  const cfg = path.join(tmp, 'cfg'), jobs = path.join(cfg, 'plugins', 'data', 'codex-openai-codex', 'state', `${path.basename(tmp)}-ws`, 'jobs')
  fs.mkdirSync(jobs, { recursive: true })
  seatHook('hc', { hook_event_name: 'SubagentStart', agent_id: 'cx', agent_type: 'codex:codex-rescue', agent_transcript_path: path.join(tmp, 'cx.jsonl') })
  const seat = markers().find((x) => x.agent_id === 'cx')
  const job = path.join(jobs, 'job-1.json')
  fs.writeFileSync(job, JSON.stringify({ id: 'job-1', status: 'running', workspaceRoot: tmp, createdAt: new Date().toISOString() }))
  seatHook('hc', { hook_event_name: 'SubagentStop', agent_id: 'cx', agent_type: 'codex:codex-rescue', agent_transcript_path: path.join(tmp, 'cx.jsonl') })
  const handoff = `${path.join(seatsDir, `${seat?.agent}.json`)}.handoff`
  const line = fs.existsSync(handoff) ? fs.readFileSync(handoff, 'utf8') : ''
  clause('clause 2w hc — a codex seat\'s stop on herdr-core writes the watcher line to its renderer\'s hand-off file, keeps the pane and records the job',
    line.includes('--codex-tail') && line.includes(job) && hasPane(model(), seat?.paneId) && markers().find((x) => x.agent_id === 'cx')?.codexJob === job, JSON.stringify({ line, marker: markers() }))
  resetSession()
  const hand = path.join(tmp, 'hand'), tr = path.join(tmp, 'never.jsonl')
  const child = spawnSync('sh', ['-c', `node ${JSON.stringify(path.join(HERE, 'dctr-render.mjs'))} ${tr} 'seat · label' ${hand} & sleep 0.6; printf 'echo handed-off; exit 5' > ${hand}.p; mv ${hand}.p ${hand}; wait $!`], { encoding: 'utf8', timeout: 15000 })
  clause('clause 2r — the renderer prints its label first, then runs the hand-off line in its place and exits with its status',
    child.stdout.split('\n')[0] === 'seat · label' && child.stdout.includes('handed-off') && child.status === 5, JSON.stringify({ out: child.stdout, status: child.status }))
  const plain = spawnSync('node', [path.join(HERE, 'dctr-render.mjs'), tr], { encoding: 'utf8', timeout: 1500 })
  clause('clause 2r2 — given no label and no hand-off file, as the herdr TUI types it, the renderer prints its old header first and runs on',
    plain.stdout.startsWith('\x1b[2m── doctrine seat') && plain.signal === 'SIGTERM', JSON.stringify({ out: plain.stdout, signal: plain.signal }))
}

// Clause 3 for the table: the fake's model really is what the rows read, shown without either hook.
fresh()
direct('herdr', ['pane', 'split', 'P1', '--direction', 'right'])
direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', '["true"]'])
const m3 = model()
clause('clause 3t — the fake records a split in the model under either CLI, and a close takes it out, proved without the hooks',
  panesOf(m3, 'T1').length === 3 && panesOf(m3, 'T1')[2].split === 'right' && panesOf(m3, 'T1')[1].split === 'down' &&
  direct('herdr-app', ['do', 'pane.close', '--pane', panesOf(m3, 'T1')[1].pane]).status === 0 && panesOf(model(), 'T1').length === 2,
  JSON.stringify(panesOf(m3, 'T1')))

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
