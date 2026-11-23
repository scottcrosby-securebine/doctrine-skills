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
// Every program the fake runs in a pane dies once this pid is gone, however this suite ends (dctr-host.fake.mjs).
process.env.DCTR_FAKE_OWNER = String(process.pid)
// A new calls file for every fresh model: a detached `hc rm` from one run logs into that run's file, never the next.
let runs = 0

let bad = 0
const clause = (n, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log(`        ${detail}`) } }

/** A fresh model: one space S1 whose tab T1 holds the session pane P1 (terminal t1), and a second tab T2 holding P2. */
const fresh = (extra = {}) => {
  // Ids never repeat across fresh models: a remover still waiting from an earlier run must not find this run's terminal.
  fs.writeFileSync(STATE, JSON.stringify({ n: 1000 * (runs + 1), exec: false, splitFocuses: false, focus: { tab: 'T1', pane: 'P1' },
    spaces: [{ id: 'S1', name: 'proj', tabs: [{ id: 'T1', name: '1', panes: [{ pane: 'P1', terminal: 't1' }] }, { id: 'T2', name: 'two', panes: [{ pane: 'P2', terminal: 't2' }] }] }],
    terminals: { t1: 'live', t2: 'live' }, ...extra }))
  process.env.DCTR_FAKE_CALLS = path.join(tmp, `calls-${++runs}`)
  fs.writeFileSync(process.env.DCTR_FAKE_CALLS, '')
}
const model = () => JSON.parse(fs.readFileSync(STATE, 'utf8'))
const calls = () => fs.readFileSync(process.env.DCTR_FAKE_CALLS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const waitFor = (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { if (fn()) return true; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50) } return fn() }
const panesOf = (m, tab) => m.spaces.flatMap((s) => s.tabs).find((t) => t.id === tab)?.panes ?? []
const allTabs = (m) => m.spaces.flatMap((s) => s.tabs)
const hasPane = (m, p) => allTabs(m).some((t) => t.panes.some((x) => x.pane === p))
const withFail = (fail, fn) => { process.env.DCTR_FAKE_FAIL = JSON.stringify(fail); try { return fn() } finally { delete process.env.DCTR_FAKE_FAIL } }
const throws = (fn) => { try { fn(); return false } catch { return true } }
/** The fake called directly, no seam: clause 3's witness. */
const direct = (name, args, fail = {}) => spawnSync(path.join(bin, name), args, { encoding: 'utf8', env: { ...process.env, DCTR_FAKE_FAIL: JSON.stringify(fail) } })

const { herdrHost, hcHost, hostFor, gateAnswer, isAppNotFound, hcArgv, handoffPath } = await import('./dctr-host.mjs')
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
const FOCUS = { herdr: 'herdr pane get', hc: 'herdr-app status' }
const CREATE = { herdr: { split: 'herdr pane split', tab: 'herdr tab create' }, hc: { split: 'herdr-app do pane.split', tab: 'herdr-app do tab.new' } }

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
    // The leaked HERDR_PANE_ID names a pane ls DOES list, so a self that read it would find one.
    const lost = hcHost({ ...HOST_ENV.hc, HC_TERMINAL_ID: 't99', HERDR_PANE_ID: 'P2' }).self()
    const failed = withFail({ 'herdr-app ls': 'transport' }, () => host.self())
    clause('clause 1a hc — a terminal ls does not list, and a failed ls, are a null self, never the leaked HERDR_PANE_ID', lost === null && failed === null, JSON.stringify({ lost, failed }))
    const listed = JSON.parse(direct('herdr-app', ['ls']).stdout).spaces.flatMap((sp) => sp.tabs).flatMap((t) => t.terminals)
    clause('clause 3a1 hc — that fixture really lists P2 and really lists no terminal t99, proved without the seam',
      listed.some((x) => x.pane === 'P2') && !listed.some((x) => x.terminal === 't99'), JSON.stringify(listed))
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
    // B2: an empty string names no pane or tab either. Read as an id, it made every listed pane and tab unfocused.
    const blankPane = withFail({ 'herdr-app status': 'blank' }, () => host.paneInfo('P1'))
    const blankTabs = withFail({ 'herdr-app status': 'blank' }, () => host.tabs())
    clause('clause 1c4 hc — a status reply naming the focus as empty strings leaves paneInfo and tabs focus UNKNOWN (undefined), never false',
      blankPane.exists === true && blankPane.focused === undefined && blankTabs.every((t) => t.focused === undefined), JSON.stringify({ blankPane, blankTabs }))
    const sb = direct('herdr-app', ['status'], { 'herdr-app status': 'blank' })
    clause('clause 3c4 hc — that status fixture really names its pane and tab as empty strings on exit 0, proved without the seam',
      sb.status === 0 && JSON.parse(sb.stdout).focused_pane === '' && JSON.parse(sb.stdout).tab === '', sb.stdout)
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
      argvs.every((a) => JSON.stringify(a) === JSON.stringify(hcArgv('/w d', 'echo hi'))) && spawnSync('sh', hcArgv('/', 'pwd').slice(1), { encoding: 'utf8', env: { ...process.env, SHELL: '/bin/sh' } }).stdout.split('\n')[0] === '/' && tab.focusArg === 'false',
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
    const removed = waitFor(() => model().terminals?.t2 === 'removed')
    clause('clause 2i hc — a close leaves the closed pane\'s terminal REMOVED in hc, by a detached child that outlives the caller', removed, JSON.stringify(model().terminals))
    // RT3: only the measured {"ok":true} is a close. An empty reply closed nothing anyone saw, and must not drop a record.
    fresh()
    const emptyPane = withFail({ 'herdr-app do pane.close': 'empty' }, () => { try { return host.closePane('P2') } catch { return 'threw' } })
    const emptyTab = withFail({ 'herdr-app do tab.close': 'empty' }, () => { try { return host.closeTab('T2') } catch { return 'threw' } })
    clause('clause 1g2 hc — a close answered with an empty reply THROWS, for a pane and a tab, never \'closed\'', emptyPane === 'threw' && emptyTab === 'threw', JSON.stringify({ emptyPane, emptyTab }))
    const ek = direct('herdr-app', ['do', 'pane.close', '--pane', 'P2'], { 'herdr-app do pane.close': 'empty' })
    clause('clause 3g2 hc — that fixture really answers {} on exit 0 and really closes nothing, proved without the seam', ek.status === 0 && ek.stdout.trim() === '{}' && hasPane(model(), 'P2'), ek.stdout)
    // RT2: a listing with an incomplete entry is partial, and an id absent from it is unknown, never gone.
    fresh({ lsJunk: [{ tab: 'T1' }] })
    const pl = host.layout({ pane: 'P1', tab: 'T1' })
    const pAbsent = (() => { try { return host.paneInfo('P404') } catch { return 'threw' } })()
    const pPresent = host.paneInfo('P2')
    fresh({ lsJunk: [{ tab: null }] })
    const plTab = host.layout({ pane: 'P1', tab: 'T1' })
    const pAbsentTab = (() => { try { return host.paneInfo('P404') } catch { return 'threw' } })()
    const tAbsent = (() => { try { return host.tabInfo('T404') } catch { return 'threw' } })()
    const tList = (() => { try { return host.tabs() } catch { return 'threw' } })()
    clause('clause 1l hc — a listing carrying a terminal with no pane, or a tab with no id, is partial: layout is null (unknown, as an unreadable one is), and an absent pane or tab, and the tab list, THROW rather than answer gone',
      pl === null && plTab === null && pAbsent === 'threw' && pAbsentTab === 'threw' && pPresent.exists === true && tAbsent === 'threw' && tList === 'threw', JSON.stringify({ pl, plTab, pAbsent, pAbsentTab, tAbsent, tList }))
    fresh({ lsJunk: [{ tab: 'T1' }, { tab: null }] })
    const junkLs = JSON.parse(direct('herdr-app', ['ls']).stdout)
    clause('clause 3l hc — that listing really carries a terminal with no pane and a tab with no id, proved without the seam',
      junkLs.spaces[0].tabs[0].terminals.some((x) => !('pane' in x)) && junkLs.spaces[0].tabs.some((t) => !('id' in t)), JSON.stringify(junkLs))
    // RT5: the fake holds the terminal lifecycle the clauses read. rm refuses a live terminal and takes a finished one.
    // A terminal of its own: a remover still waiting from an earlier clause may name t2, and would race this one.
    fresh()
    const own = JSON.parse(direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', '["true"]']).stdout)
    const rmLive = direct('hc', ['rm', own.terminal]).status
    direct('herdr-app', ['do', 'pane.close', '--pane', own.pane])
    const afterClose = model().terminals[own.terminal]
    const rmDone = direct('hc', ['rm', own.terminal]).status
    clause('clause 3i hc — the fake\'s terminals really live, finish on close and are removed by rm, which refuses a live one, proved without the seam',
      rmLive !== 0 && afterClose === 'finished' && rmDone === 0 && model().terminals[own.terminal] === 'removed', JSON.stringify({ rmLive, afterClose, rmDone, t: model().terminals }))
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
clause('clause 1p — a hand-off file is bound to its seat: two agents under one marker name get two files',
  handoffPath('/s/dctr-explore-1.json', 'a1') !== handoffPath('/s/dctr-explore-1.json', 'a2') && handoffPath('/s/dctr-explore-1.json', 'a1').startsWith('/s/dctr-explore-1.json.'),
  handoffPath('/s/dctr-explore-1.json', 'a1'))
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
/** What a pane shows: the TUI's pane name, or what a herdr-core pane's program printed (no rename exists there). */
const shows = (h, pane, text) => (h === 'hc'
  ? (() => { try { return fs.readFileSync(`${STATE}.${pane}.out`, 'utf8').includes(text) } catch { return false } })()
  : allTabs(model()).some((t) => t.panes.some((x) => x.pane === pane && x.name?.includes(text))))
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const setExec = () => { const m = model(); m.exec = true; fs.writeFileSync(STATE, JSON.stringify(m)) }
const focusPane = (p) => { const m = model(); m.focus = { tab: allTabs(m).find((t) => t.panes.some((x) => x.pane === p)).id, pane: p }; fs.writeFileSync(STATE, JSON.stringify(m)) }

/** How many split or tab calls (`kind`) this run's model was sent in host `h`, each its own create attempt. */
const createCalls = (h, kind) => calls().filter((c) => `${c.bin} ${c.args.slice(0, 2).join(' ')}` === CREATE[h][kind]).length
/** Panes in the model that were started or typed the seat renderer. */
const renderers = () => allTabs(model()).flatMap((t) => t.panes).filter((x) => [...(x.argv ?? []), ...(x.ran ?? [])].some((a) => a.includes('dctr-render'))).length
/** Whether this session's hook.log says a herdr-core create call failed, as B1's stand-downs must. */
const loggedCreate = () => { try { return fs.readFileSync(path.join(tmp, `dctr-${SESSION}`, 'hook.log'), 'utf8').includes('herdr-core create call failed') } catch { return false } }
/** A gate check that appends a line to `count` each time it runs: its result, then how many times it ran, read once any
 *  second copy has had time to run too. */
const ranOnce = (out, count) => {
  const done = waitFor(() => fs.existsSync(`${out}.result`))
  sleep(1500)
  return { done, runs: fs.existsSync(count) ? fs.readFileSync(count, 'utf8').split('\n').filter(Boolean).length : 0 }
}
/** A gate whose check appends to a count file, launched with `extra` in its environment: what it printed, and ranOnce. */
const countedGate = (h, tag, extra = {}) => {
  const out = path.join(tmp, `${tag}-${h}.out`), count = path.join(tmp, `${tag}-${h}.count`)
  const said = execFileSync('node', [GATE, 'g', out, '--', `echo run >> ${count}`], { env: hookEnv(h, extra), encoding: 'utf8', cwd: tmp })
  return { said, out, ...ranOnce(out, count) }
}
/** Sets `lsJunk` on the model. */
const junk = (j) => { const m = model(); m.lsJunk = j; fs.writeFileSync(STATE, JSON.stringify(m)) }
/** herdr-core's create answering an empty id (`kind` split or tab); the TUI half runs the same row with no fault. */
const noid = (h, kind) => ({ DCTR_FAKE_FAIL: JSON.stringify(h === 'hc' ? { [CREATE.hc[kind]]: 'noid' } : {}) })
/** A gate launched with `extra` in its environment, its check waiting on a go file; returns once its result is written.
 *  The gate runs in a split (the column has room) and nobody is looking at it. */
const gateWith = (h, extra) => {
  setExec()
  const out = path.join(tmp, `gatewith-${h}-${runs}.out`)
  execFileSync('node', [GATE, 'g', out, '--', 'exit 0'], { env: hookEnv(h, extra), encoding: 'utf8', cwd: tmp })
  const pane = markers().find((x) => x.role === 'gate')?.paneId
  const done = waitFor(() => fs.existsSync(`${out}.result`))
  sleep(1000)   // long enough for a close the completion made to land
  return { done, pane }
}

/** One table: every row runs in both hosts against a fresh model and session, and asserts on the model alone. */
const TABLE = [
  { row: 'placement, the cap and overflow: the first seat splits right, the next five stack down, the seventh takes a tab',
    run(h) { for (let i = 1; i <= SIDE_CAP + 1; i++) start(h, i); return model() },
    ok: (m, h) => {
      const side = panesOf(m, 'T1').slice(1)
      // herdr-core cannot rename a pane or type into one: the renderer is given its label and hand-off file at creation.
      const first = markers().find((x) => x.paneId === side[0]?.pane)
      if (h === 'hc' && !(side[0]?.argv?.[2]?.includes(`'${first?.label}'`) && side[0].argv[2].includes(first ? handoffPath(path.join(seatsDir, `${first.agent}.json`), first.agent_id) : '?'))) return false
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
      const removed = waitFor(() => model().terminals?.[terminal] === 'removed')
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
  // F1 (live run, 2026-11-23): a herdr-core pane closes when its program exits, so a pane spared because the user is
  // looking at it vanished with its result. In the TUI it is a shell and stays; herdr-core must match.
  { row: 'a gate PANE the user is looking at when it finishes stays open, shows its exit status, and keeps its record',
    run(h) {
      setExec()
      const out = path.join(tmp, `gatestay-${h}.out`), go = path.join(tmp, `stay-${h}`)
      execFileSync('node', [GATE, 'g', out, '--', `until [ -f ${go} ]; do sleep 0.05; done; exit 4`], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      const pane = markers().find((x) => x.role === 'gate')?.paneId
      waitFor(() => pane && hasPane(model(), pane)); focusPane(pane)
      fs.writeFileSync(go, '')
      const done = waitFor(() => fs.existsSync(`${out}.result`)) && waitFor(() => shows(h, pane, 'g · exit=4'))
      sleep(1000)   // long enough for a pane whose program ended to have been taken out
      return { done, pane }
    },
    ok: ({ done, pane }, h) => done && hasPane(model(), pane) && shows(h, pane, 'g · exit=4') && Boolean(markers().find((x) => x.role === 'gate')) },
  { row: 'a seat PANE the user is looking at when it stops stays open, shows its label · done, and keeps its marker',
    run(h) {
      setExec(); start(h, 1)
      const p = markerOf(1).paneId
      waitFor(() => hasPane(model(), p)); focusPane(p); stop(h, 1)
      const shown = waitFor(() => shows(h, p, '· done'))
      sleep(1000)
      return { p, shown }
    },
    ok: ({ p, shown }, h) => shown && hasPane(model(), p) && Boolean(markerOf(1)) },
  // P2: the close and focus failures, in both hosts. A close that FAILED, or a focus nobody could read, keeps the pane
  // and its record, for the seat's stop, for SessionEnd and for a gate's own completion.
  { row: 'a side seat whose close FAILS keeps its pane and its marker',
    run(h) { start(h, 1); const p = markerOf(1).paneId; stop(h, 1, { DCTR_FAKE_FAIL: JSON.stringify({ [CLOSE[h].pane]: 'transport' }) }); return { p } },
    ok: ({ p }) => hasPane(model(), p) && Boolean(markerOf(1)) },
  { row: 'a SessionEnd whose close FAILS keeps the pane, its marker and the state directory',
    run(h) { start(h, 1); const p = markerOf(1).paneId; seatHook(h, { hook_event_name: 'SessionEnd' }, { DCTR_FAKE_FAIL: JSON.stringify({ [CLOSE[h].pane]: 'transport' }) }); return { p } },
    ok: ({ p }) => hasPane(model(), p) && Boolean(markerOf(1)) },
  { row: 'a gate whose own close FAILS at completion keeps its pane and its record',
    run(h) { return gateWith(h, { DCTR_FAKE_FAIL_IN_PANE: JSON.stringify({ [CLOSE[h].pane]: 'transport' }) }) },
    ok: ({ done, pane }) => done && hasPane(model(), pane) && Boolean(markers().find((x) => x.role === 'gate')) },
  { row: 'a gate whose focus could not be read at completion closes nothing and keeps its record',
    run(h) { return gateWith(h, { DCTR_FAKE_FAIL_IN_PANE: JSON.stringify({ [READ[h].pane]: 'transport' }) }) },
    ok: ({ done, pane }) => done && hasPane(model(), pane) && Boolean(markers().find((x) => x.role === 'gate')) },
  // RT2: a layout with an incomplete entry is partial, and a marker whose pane it does not carry is not dropped.
  { row: 'a placement whose layout carries an incomplete entry drops no marker, even one whose pane is gone',
    run(h) {
      start(h, 1); const p = markerOf(1).paneId
      const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== p); m.lsJunk = [{ tab: 'T1' }]; fs.writeFileSync(STATE, JSON.stringify(m))
      start(h, 2)
      return {}
    },
    ok: () => Boolean(markerOf(1)) && Boolean(markerOf(2)) },
  // P1: a hand-off is the seat's own. A seat that reuses a name must not run the line left for the seat before it.
  { row: 'a seat reusing the name of a seat that was relabelled does not run that seat\'s hand-off, and the old hand-off is gone',
    run(h) {
      setExec(); start(h, 1)
      const one = markerOf(1); waitFor(() => hasPane(model(), one.paneId)); focusPane(one.paneId); stop(h, 1)
      waitFor(() => h !== 'hc' || shows(h, one.paneId, '· done'))
      const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== one.paneId); m.focus = { tab: 'T1', pane: 'P1' }; fs.writeFileSync(STATE, JSON.stringify(m))
      start(h, 2)
      const two = markerOf(2)
      sleep(1000)
      return { one, two }
    },
    ok: ({ one, two }, h) => two?.agent === one.agent && hasPane(model(), two.paneId) && !shows(h, two.paneId, '· done') &&
      !fs.readdirSync(seatsDir).some((f) => f.endsWith('.handoff')) },
  { row: 'a codex seat reusing the name of one handed to its watcher does not run that watcher, and the old hand-off is gone',
    run(h) {
      setExec()
      const jobs = path.join(tmp, 'cfg', 'plugins', 'data', 'codex-openai-codex', 'state', `${path.basename(tmp)}-ws`, 'jobs')
      fs.mkdirSync(jobs, { recursive: true })
      const cx = (id, ev) => seatHook(h, { hook_event_name: ev, agent_id: id, agent_type: 'codex:codex-rescue', agent_transcript_path: path.join(tmp, `${id}.jsonl`) })
      cx('cx1', 'SubagentStart')
      const one = markers().find((x) => x.agent_id === 'cx1')
      fs.writeFileSync(path.join(jobs, `job-${h}.json`), JSON.stringify({ id: `job-${h}`, status: 'running', workspaceRoot: tmp, createdAt: new Date().toISOString() }))
      cx('cx1', 'SubagentStop')
      waitFor(() => h !== 'hc' || shows(h, one.paneId, 'doctrine codex'))
      const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== one.paneId); fs.writeFileSync(STATE, JSON.stringify(m))
      cx('cx2', 'SubagentStart')
      const two = markers().find((x) => x.agent_id === 'cx2')
      sleep(1000)
      fs.rmSync(path.join(jobs, `job-${h}.json`), { force: true })
      return { one, two }
    },
    ok: ({ one, two }, h) => two?.agent === one?.agent && hasPane(model(), two.paneId) && !shows(h, two.paneId, 'doctrine codex') &&
      !fs.readdirSync(seatsDir).some((f) => f.endsWith('.handoff')) },
  { row: 'a finished codex seat closed by the next codex placement takes its hand-off file with its marker',
    run(h) {
      setExec()
      const jobs = path.join(tmp, 'cfg', 'plugins', 'data', 'codex-openai-codex', 'state', `${path.basename(tmp)}-ws`, 'jobs')
      fs.mkdirSync(jobs, { recursive: true })
      const job = path.join(jobs, `next-${h}.json`)
      const cx = (id, ev) => seatHook(h, { hook_event_name: ev, agent_id: id, agent_type: 'codex:codex-rescue', agent_transcript_path: path.join(tmp, `${id}.jsonl`) })
      cx('cn1', 'SubagentStart')
      fs.writeFileSync(job, JSON.stringify({ id: `next-${h}`, status: 'running', workspaceRoot: tmp, createdAt: new Date().toISOString() }))
      cx('cn1', 'SubagentStop')
      const one = markers().find((x) => x.agent_id === 'cn1')
      const had = h !== 'hc' || fs.existsSync(handoffPath(path.join(seatsDir, `${one.agent}.json`), 'cn1'))
      fs.writeFileSync(job, JSON.stringify({ id: `next-${h}`, status: 'completed', workspaceRoot: tmp, createdAt: new Date().toISOString() }))
      cx('cn2', 'SubagentStart')
      fs.rmSync(job, { force: true })
      return { one, had }
    },
    ok: ({ one, had }) => had && Boolean(one?.codexJob) && !markers().some((x) => x.agent_id === 'cn1') && !fs.readdirSync(seatsDir).some((f) => f.includes('cn1')) },
  { row: 'a gate placement that drops a seat\'s stale marker drops its hand-off file too',
    run(h) {
      setExec(); start(h, 1)
      const one = markerOf(1); waitFor(() => hasPane(model(), one.paneId)); focusPane(one.paneId); stop(h, 1)
      const had = h !== 'hc' || waitFor(() => fs.existsSync(handoffPath(path.join(seatsDir, `${one.agent}.json`), 'a1')))
      const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== one.paneId); m.focus = { tab: 'T1', pane: 'P1' }; fs.writeFileSync(STATE, JSON.stringify(m))
      const out = path.join(tmp, `gatestale-${h}.out`)
      execFileSync('node', [GATE, 'g', out, '--', 'true'], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      waitFor(() => fs.existsSync(`${out}.result`))
      return { had }
    },
    ok: ({ had }) => had && !markerOf(1) && !fs.readdirSync(seatsDir).some((f) => f.endsWith('.handoff')) },
  // RT4: a check that may already be running is never launched a second time, whatever fails after its pane exists.
  { row: 'a gate whose marker cannot be written once its pane exists runs its check exactly once',
    run(h) {
      setExec()
      fs.mkdirSync(seatsDir, { recursive: true })
      const m = model(); m.chmodAfterCreate = seatsDir; fs.writeFileSync(STATE, JSON.stringify(m))
      const out = path.join(tmp, `gateonce-${h}.out`), count = path.join(tmp, `gateonce-${h}.count`)
      execFileSync('node', [GATE, 'g', out, '--', `echo run >> ${count}`], { env: hookEnv(h), encoding: 'utf8', cwd: tmp })
      const r = ranOnce(out, count)
      fs.chmodSync(seatsDir, 0o700)
      return r
    },
    ok: ({ done, runs }) => done && runs === 1 },
  // B2: a partial listing is an unknown layout, never a whole one missing a pane, and an empty focus is an unknown one.
  { row: 'a placement whose listing files a live side pane under a tab with no id drops neither its marker nor its hand-off',
    run(h) {
      start(h, 1)
      const one = markerOf(1), handoff = handoffPath(path.join(seatsDir, `${one.agent}.json`), 'a1')
      fs.writeFileSync(handoff, 'true')
      const m = model(); m.lsJunk = [{ tab: null, panes: [one.paneId] }]; fs.writeFileSync(STATE, JSON.stringify(m))
      start(h, 2)
      return { one, handoff }
    },
    ok: ({ one, handoff }) => Boolean(markerOf(1)) && fs.existsSync(handoff) && hasPane(model(), one.paneId) && Boolean(markerOf(2)) },
  { row: 'six side seats and a listing carrying one of them with no pane: the cap holds (the seventh takes a tab) and no marker drops',
    run(h) {
      for (let i = 1; i <= SIDE_CAP; i++) start(h, i)
      const m = model(); m.lsJunk = [{ nopane: markerOf(SIDE_CAP).paneId }]; fs.writeFileSync(STATE, JSON.stringify(m))
      start(h, SIDE_CAP + 1)
      return {}
    },
    ok: () => panesOf(model(), 'T1').length === SIDE_CAP + 1 && Boolean(markerOf(SIDE_CAP + 1)?.tabId) && markers().length === SIDE_CAP + 1 },
  { row: 'a side seat and a tab seat whose focus is answered with empty strings are not closed and keep their markers',
    run(h) {
      for (let i = 1; i <= SIDE_CAP + 1; i++) start(h, i)
      const side = markerOf(1).paneId, tab = markerOf(SIDE_CAP + 1).tabId
      const blank = { DCTR_FAKE_FAIL: JSON.stringify({ [FOCUS[h]]: 'blank', 'herdr tab list': 'blank' }) }
      stop(h, 1, blank); stop(h, SIDE_CAP + 1, blank)
      return { side, tab }
    },
    ok: ({ side, tab }) => hasPane(model(), side) && allTabs(model()).some((t) => t.id === tab) && Boolean(markerOf(1)) && Boolean(markerOf(SIDE_CAP + 1)) },
  // P1-3: an empty id names no pane or tab. A herdr-core split answering one already runs its program, so reading it as
  // no pane took the tab path and ran a second copy. And a self whose space or tab has no id cannot place anything.
  { row: 'a gate whose herdr-core split answers an empty pane id runs its check exactly once',
    run(h) { setExec(); return countedGate(h, 'gatenoidsplit', noid(h, 'split')) },
    ok: (r, h) => r.done && r.runs === 1 && (h !== 'hc' || (createCalls(h, 'tab') === 0 && !markers().some((x) => x.role === 'gate') && loggedCreate())) },
  { row: 'a gate whose herdr-core tab answers an empty tab id keeps no record naming an empty tab',
    run(h) { for (let i = 1; i <= SIDE_CAP; i++) start(h, i); setExec(); return countedGate(h, 'gatenoidtab', noid(h, 'tab')) },
    ok: (r, h) => r.done && r.runs === 1 && (h !== 'hc' || (!markers().some((x) => x.role === 'gate') && loggedCreate())) },
  { row: 'a seat whose herdr-core split answers an empty pane id makes no second renderer pane',
    run(h) { setExec(); start(h, 1, noid(h, 'split')); sleep(500); return { renderers: renderers() } },
    ok: ({ renderers }, h) => renderers === 1 && (h !== 'hc' || (createCalls(h, 'tab') === 0 && !markers().length && loggedCreate())) },
  { row: 'a seat whose herdr-core tab answers an empty tab id keeps no record naming an empty tab',
    run(h) { for (let i = 1; i <= SIDE_CAP; i++) start(h, i); setExec(); start(h, SIDE_CAP + 1, noid(h, 'tab')); sleep(500); return {} },
    ok: (r, h) => createCalls(h, 'tab') === 1 && (h !== 'hc' || (!markerOf(SIDE_CAP + 1) && loggedCreate())) },
  { row: 'a gate whose own listing names its space or its tab with no id runs detached exactly once',
    run(h) {
      setExec()
      junk([{ noid: 'S1' }]); const space = countedGate(h, 'gatenoidspace')
      junk([{ noid: 'T1' }]); const tab = countedGate(h, 'gatenoidself')
      return { space, tab }
    },
    ok: ({ space, tab }, h) => [space, tab].every((r) => r.done && r.runs === 1 && (h !== 'hc' || r.said.includes('running detached'))) },
  { row: 'a seat whose own listing names its tab with no id stands down and makes no pane',
    run(h) { junk([{ noid: 'T1' }]); start(h, 1); return {} },
    ok: (r, h) => h !== 'hc' || (!markers().length && createCalls(h, 'split') + createCalls(h, 'tab') === 0 && allTabs(model()).length === 2 && panesOf(model(), 'T1').length === 1) },
  // B1: on herdr-core a create call can fail after its pane exists and its program started (a timeout, a reply with no
  // pane), so a retry or a fallback would run a second copy. The TUI starts nothing at creation and keeps its retries.
  { row: 'a gate whose split call fails after its pane exists runs its check exactly once; the TUI retries the split and then takes a tab',
    run(h) {
      setExec()
      const fail = { [CREATE[h].split]: 'after' }
      const out = path.join(tmp, `gatesplit-${h}.out`), count = path.join(tmp, `gatesplit-${h}.count`)
      const said = execFileSync('node', [GATE, 'g', out, '--', `echo run >> ${count}`], { env: hookEnv(h, { DCTR_FAKE_FAIL: JSON.stringify(fail) }), encoding: 'utf8', cwd: tmp })
      return { said, out, ...ranOnce(out, count) }
    },
    ok: (r, h) => r.done && r.runs === 1 && r.said.includes(`${r.out}.result`) && createCalls(h, 'split') === (h === 'hc' ? 1 : 2) && createCalls(h, 'tab') === (h === 'hc' ? 0 : 1) &&
      (h === 'hc' ? !markers().some((x) => x.role === 'gate') && loggedCreate() : true) },
  { row: 'a gate whose tab call fails after its tab exists runs its check exactly once',
    run(h) {
      for (let i = 1; i <= SIDE_CAP; i++) start(h, i)
      setExec()
      const out = path.join(tmp, `gatenewtab-${h}.out`), count = path.join(tmp, `gatenewtab-${h}.count`)
      const said = execFileSync('node', [GATE, 'g', out, '--', `echo run >> ${count}`], { env: hookEnv(h, { DCTR_FAKE_FAIL: JSON.stringify({ [CREATE[h].tab]: 'after' }) }), encoding: 'utf8', cwd: tmp })
      return { said, out, ...ranOnce(out, count) }
    },
    ok: (r, h) => r.done && r.runs === 1 && r.said.includes(`${r.out}.result`) && createCalls(h, 'tab') === 1 && !markers().some((x) => x.role === 'gate') && (h !== 'hc' || loggedCreate()) },
  { row: 'a seat whose split call fails after its pane exists makes no second pane on herdr-core; the TUI retries the split and then takes a tab',
    run(h) { setExec(); start(h, 1, { DCTR_FAKE_FAIL: JSON.stringify({ [CREATE[h].split]: 'after' }) }); sleep(500); return { renderers: renderers() } },
    ok: ({ renderers }, h) => h === 'hc'
      ? renderers === 1 && createCalls(h, 'split') === 1 && createCalls(h, 'tab') === 0 && !markers().length && loggedCreate()
      : renderers === 1 && createCalls(h, 'split') === 2 && createCalls(h, 'tab') === 1 && Boolean(markerOf(1)?.tabId) },
  { row: 'a seat whose tab call fails after its tab exists makes no second pane, and on herdr-core leaves no reservation and logs why',
    run(h) {
      for (let i = 1; i <= SIDE_CAP; i++) start(h, i)
      setExec(); start(h, SIDE_CAP + 1, { DCTR_FAKE_FAIL: JSON.stringify({ [CREATE[h].tab]: 'after' }) }); sleep(500)
      return { tabs: allTabs(model()).length }
    },
    ok: ({ tabs }, h) => tabs === 3 && createCalls(h, 'tab') === 1 && !markerOf(SIDE_CAP + 1)?.paneId && (h !== 'hc' || (markers().length === SIDE_CAP && loggedCreate())) },
  { row: 'a seat pane that went away by itself (its program and shell ended): SessionEnd reads it gone, drops its marker and removes its terminal',
    run(h) {
      start(h, 1)
      const { paneId: p, terminal } = markerOf(1)
      // The pane went with its program: its terminal is finished, and only the marker's record can name it now.
      const m = model(); m.spaces[0].tabs[0].panes = m.spaces[0].tabs[0].panes.filter((x) => x.pane !== p)
      if (h === 'hc') m.terminals[terminal] = 'finished'
      fs.writeFileSync(STATE, JSON.stringify(m))
      seatHook(h, { hook_event_name: 'SessionEnd' })
      const removed = h !== 'hc' || waitFor(() => model().terminals?.[terminal] === 'removed')
      return { removed, terminal }
    },
    ok: ({ removed, terminal }, h) => removed && !fs.existsSync(path.join(tmp, `dctr-${SESSION}`)) && (h === 'hc' ? Boolean(terminal) : terminal === undefined) },
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
  const handoff = handoffPath(path.join(seatsDir, `${seat?.agent}.json`), 'cx')
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

// The fixture F1 needed: in the fake, a herdr-core pane really goes when its program exits and a TUI pane really does
// not, and a program ending in hcArgv's shell really keeps its pane. Proved with the fake alone.
fresh({ exec: true })
// One at a time: the fake rewrites its model whole, so a supervisor's write racing another call's would be lost.
const hcEnd = JSON.parse(direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', JSON.stringify(['sh', '-c', 'echo bye'])]).stdout).pane
waitFor(() => !hasPane(model(), hcEnd))
const hcKept = JSON.parse(direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', JSON.stringify(hcArgv('/', 'echo kept'))]).stdout).pane
direct('herdr', ['pane', 'split', 'P1', '--direction', 'right'])
const tuiPane = panesOf(model(), 'T1').find((x) => x.split === 'right').pane
direct('herdr', ['pane', 'run', tuiPane, 'echo bye'])
sleep(500)
clause('clause 3f1 — the fake closes a herdr-core pane whose program exited, keeps one ending in the shell hcArgv adds, and keeps a TUI pane whose typed line ended, proved without the hooks',
  !hasPane(model(), hcEnd) && hasPane(model(), hcKept) && shows('hc', hcKept, 'kept') && hasPane(model(), tuiPane), JSON.stringify(model().spaces[0].tabs[0].panes))
direct('herdr-app', ['do', 'pane.close', '--pane', hcKept])

// The round-1 knobs, proved with the fake alone: a fault meant for what runs IN a pane reaches it and not the caller,
// a marker directory made unwritable at creation really refuses a write, and the TUI layout really carries the
// incomplete entry the partial-listing row stands on.
{
  const probe = path.join(tmp, 'probe-exit'), lockd = path.join(tmp, 'lockd'); fs.mkdirSync(lockd)
  fresh({ exec: true, chmodAfterCreate: lockd, lsJunk: [{ tab: 'T1' }] })
  const env = { ...process.env, DCTR_FAKE_FAIL_IN_PANE: JSON.stringify({ 'herdr-app ls': 'transport' }) }
  spawnSync(path.join(bin, 'herdr-app'), ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', JSON.stringify(['sh', '-c', `herdr-app ls >/dev/null 2>&1; echo $? > ${probe}`])], { env })
  waitFor(() => fs.existsSync(probe))
  const callerLs = spawnSync(path.join(bin, 'herdr-app'), ['ls'], { env, encoding: 'utf8' }).status
  let refused = false; try { fs.writeFileSync(path.join(lockd, 'x'), '') } catch { refused = true }
  fs.chmodSync(lockd, 0o700)
  const lay = JSON.parse(direct('herdr', ['pane', 'layout', '--pane', 'P1']).stdout).result.layout.panes
  clause('clause 3k — the fake\'s in-pane fault reaches the pane\'s program (ls exits 1 there) and not the caller (0), the creation-time chmod really refuses a write, and the TUI layout really carries an entry with no pane_id, proved without the hooks',
    fs.readFileSync(probe, 'utf8').trim() === '1' && callerLs === 0 && refused && lay.some((x) => !('pane_id' in x)), JSON.stringify({ probe: fs.readFileSync(probe, 'utf8'), callerLs, refused, lay }))
}

// B2's listings, proved with the fake alone: a pane filed under a tab with no id is missing from its own tab, a pane
// listed with no pane id leaves a bare terminal row, and the TUI's focus reply really carries an empty string.
{
  fresh({ lsJunk: [{ tab: null, panes: ['P2'] }, { nopane: 'P1' }] })
  const ls = JSON.parse(direct('herdr-app', ['ls']).stdout).spaces[0].tabs
  const pg = JSON.parse(direct('herdr', ['pane', 'get', 'P1'], { 'herdr pane get': 'blank' }).stdout).result.pane
  clause('clause 3l2 hc — that listing really files P2 under a tab with no id and not under T2, and lists P1\'s terminal with no pane, proved without the seam',
    ls.find((t) => t.id === 'T2').terminals.length === 0 && ls.find((t) => !('id' in t))?.terminals.some((x) => x.pane === 'P2') &&
    ls.find((t) => t.id === 'T1').terminals.some((x) => x.terminal === 't1' && !('pane' in x)) && pg.focused === '', JSON.stringify({ ls, pg }))
}

// P1-3's fixtures, proved with the fake alone: a create under `noid` exits 0 with an empty id while its pane is in the
// model and its program runs, and a listing can name a space or a tab with no id.
{
  fresh({ exec: true })
  const ran = (n) => path.join(tmp, `noid-${n}`)
  const fail = { 'herdr-app do pane.split': 'noid', 'herdr-app do tab.new': 'noid' }
  const sp = direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', JSON.stringify(['sh', '-c', `touch ${ran('split')}; sleep 30`])], fail)
  const tb = direct('herdr-app', ['do', 'tab.new', '--space', 'S1', '--name', 'x', '--folder', tmp, '--argv', JSON.stringify(['sh', '-c', `touch ${ran('tab')}; sleep 30`]), '--focus', 'false'], fail)
  const started = waitFor(() => fs.existsSync(ran('split')) && fs.existsSync(ran('tab')))
  const m = model()
  junk([{ noid: 'S1' }, { noid: 'T1' }])
  const ls = JSON.parse(direct('herdr-app', ['ls']).stdout).spaces
  clause('clause 3n — the fake\'s `noid` fault answers a split and a tab.new on exit 0 with an empty id while the pane and tab are in the model and their programs run, and its listing names a space and a tab with no id, proved without the hooks',
    sp.status === 0 && JSON.parse(sp.stdout).pane === '' && tb.status === 0 && JSON.parse(tb.stdout).tab === '' && started &&
    panesOf(m, 'T1').length === 2 && allTabs(m).length === 3 && !('id' in ls[0]) && !('id' in ls[0].tabs[0]) && ls[0].tabs[1].id === 'T2',
    JSON.stringify({ sp: sp.stdout, tb: tb.stdout, started, ls }))
  for (const x of allTabs(m).flatMap((t) => t.panes)) if (x.pid) try { process.kill(-x.pid, 'SIGKILL') } catch { /* gone */ }
}

// B1's fault, proved with the fake alone: a create under `after` exits non-zero with no reply, yet its pane or tab is in
// the model and, on herdr-core, its program is already running.
{
  fresh({ exec: true })
  const ran = (n) => path.join(tmp, `after-${n}`)
  const fail = Object.fromEntries(Object.values(CREATE).flatMap((c) => [[c.split, 'after'], [c.tab, 'after']]))
  const sp = direct('herdr-app', ['do', 'pane.split', '--pane', 'P1', '--direction', 'down', '--argv', JSON.stringify(['sh', '-c', `touch ${ran('split')}; sleep 30`])], fail)
  const tb = direct('herdr-app', ['do', 'tab.new', '--space', 'S1', '--name', 'x', '--folder', tmp, '--argv', JSON.stringify(['sh', '-c', `touch ${ran('tab')}; sleep 30`]), '--focus', 'false'], fail)
  const hs = direct('herdr', ['pane', 'split', 'P1', '--direction', 'right'], fail)
  const ht = direct('herdr', ['tab', 'create', '--workspace', 'S1', '--label', 'y'], fail)
  const started = waitFor(() => fs.existsSync(ran('split')) && fs.existsSync(ran('tab')))
  const m = model()
  clause('clause 3b1 — the fake\'s `after` fault fails a split and a tab create in both CLIs with no reply, while the pane and tab are in the model and herdr-core\'s programs already run, proved without the hooks',
    [sp, tb, hs, ht].every((r) => r.status === 1 && r.stdout === '') && started && panesOf(m, 'T1').length === 3 && allTabs(m).length === 4,
    JSON.stringify({ status: [sp, tb, hs, ht].map((r) => r.status), started, tabs: allTabs(m) }))
  for (const x of allTabs(m).flatMap((t) => t.panes)) if (x.pid) try { process.kill(-x.pid, 'SIGKILL') } catch { /* gone */ }
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
