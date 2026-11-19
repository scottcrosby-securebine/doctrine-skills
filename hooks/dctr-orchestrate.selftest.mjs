// Tamper test for `dctr-orchestrate.mjs capacity` (KS-1) and `start` (E15-SK10), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-orchestrate.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins `capacityDecision` in dctr-lib.mjs on the seven cases E15-D51 names, the margin read from
// HANDOFF_COST_TOKENS. Clause 2 runs the command on fixture transcripts: the window from the host's own reading, a
// Claude Code session's bridge file or a Codex rollout's model_context_window, refused as unknown where there is none,
// the load from the first usage reading (E15-D209), and the refusals that are not arithmetic. Clause 3 proves the
// fixture transcripts, rollouts and bridge files carry the readings the clauses rest on, by parsing them without the
// command or the library, and clause 4's herdr shim, claude stub, PATH and fixture repos are what clause 4 says. Clause
// 4 runs start under that shim: the launch, its refusals and the permission flag (E15-D269, E15-D270, E15-D280).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import * as F from './dctr-codex.fixtures.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-orchestrate-'))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
const { capacityDecision, HANDOFF_COST_TOKENS } = await import('./dctr-lib.mjs')
const cli = path.join(import.meta.dirname, 'dctr-orchestrate.mjs')

// ---------------------------------------------------------------- clause 1: the arithmetic (E15-D51)

const cases = [
  { n: '1a', window: 200000, load: 100000, tier: 160000, accept: false, why: 'load plus margin passes the tier, though it fits the window' },
  { n: '1b', window: 200000, load: 138000, tier: 160000, accept: false, why: 'load plus margin passes the tier and the window' },
  { n: '1c', window: 1000000, load: 47600, tier: 200000, accept: true, why: 'the E14 resume load at a 1M window' },
  { n: '1d', window: 200000, load: 94999, tier: 160000, accept: true, why: 'one token below the boundary' },
  { n: '1e', window: 200000, load: 95000, tier: 160000, accept: false, why: 'on the boundary: strictly below, never equal' },
  { n: '1f', window: 200000, load: 95001, tier: 160000, accept: false, why: 'one token above the boundary' },
  { n: '1g', window: 200000, load: 138000, tier: 220000, accept: false, why: 'below the tier, but the tier is above the window' },
]
for (const c of cases) {
  const d = capacityDecision(c)
  clause(`clause ${c.n} — ${c.accept ? 'accepts' : 'refuses'}: ${c.why}`, d.accept === c.accept && d.margin === HANDOFF_COST_TOKENS,
    `got accept=${d.accept} margin=${d.margin}, HANDOFF_COST_TOKENS=${HANDOFF_COST_TOKENS}`)
}

// ---------------------------------------------------------------- fixtures: transcripts in the probed shape

let seq = 0
const assistant = (used, extra = {}) => JSON.stringify({ type: 'assistant', uuid: `u${++seq}`, isSidechain: false,
  timestamp: '2026-11-08T10:00:00.000Z', message: { role: 'assistant', usage: { input_tokens: 4, cache_creation_input_tokens: used - 4, cache_read_input_tokens: 0, output_tokens: 10 } }, ...extra })
const user = JSON.stringify({ type: 'user', uuid: 'u0', message: { role: 'user', content: 'resume' } })
const transcript = (name, lines) => { const f = path.join(tmp, name); fs.writeFileSync(f, lines.join('\n') + '\n'); return f }
// Ahead of each first reading: a seat's entry and a zero-usage entry, which neither counts, and a truncated line.
const lead = [user, assistant(30000, { isSidechain: true }), JSON.stringify({ type: 'assistant', uuid: 'z', message: { usage: { input_tokens: 0 } } }), '{"type":"assis']
const orch = transcript('orch.jsonl', [...lead, assistant(47600), assistant(300000)])
const lowFirst = transcript('low-first.jsonl', [...lead, assistant(94999), assistant(100000)])
const highFirst = transcript('high-first.jsonl', [...lead, assistant(100000), assistant(94999)])
const noUsage = transcript('no-usage.jsonl', [user])
// E15-D256: an orchestrator transcript named for its session, opening at this host's normal 101,825, and one TMPDIR
// per bridge state for that session: a fresh 1,000,000 reading, one older than the watcher's expiry, one that does
// not parse, and one whose window is not a number.
const S = 'orch-session'
const hostStart = transcript(`${S}.jsonl`, [user, assistant(101825)])
const bridgeTmp = (name, body, ageMs = 0) => {
  const dir = path.join(tmp, name), f = path.join(dir, `dctr-${S}`, 'bridge.json')
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body)
  if (ageMs) { const t = new Date(Date.now() - ageMs); fs.utimesSync(f, t, t) }
  return { dir, f }
}
const reading = (window) => JSON.stringify({ session_id: S, window, used: 101825, pct: 10, t: new Date().toISOString() })
const fresh = bridgeTmp('tmpdir-fresh', reading(1000000))
const stale = bridgeTmp('tmpdir-stale', reading(1000000), 2 * 300000)
const garbled = bridgeTmp('tmpdir-garbled', '{"session_id":"orch-sess')
const textWindow = bridgeTmp('tmpdir-text-window', reading('1000000'))
// A session that ran a model no list could name, its last main-thread entry naming it, with a fresh 1,000,000 bridge
// reading in the fresh TMPDIR.
const R = 'ran-session'
const ranAny = transcript(`${R}.jsonl`, [user, assistant(101825, { message: { role: 'assistant', model: 'some-future-model-9', usage: { input_tokens: 4, cache_creation_input_tokens: 101821, cache_read_input_tokens: 0, output_tokens: 10 } } })])
const ranBridge = path.join(fresh.dir, `dctr-${R}`, 'bridge.json')
fs.mkdirSync(path.dirname(ranBridge), { recursive: true })
fs.writeFileSync(ranBridge, JSON.stringify({ session_id: R, window: 1000000, used: 101825, pct: 10, t: new Date().toISOString() }))
// The arithmetic fixtures' bridge readings, one TMPDIR holding a fresh file per session: 1,000,000 for orch, 200,000
// for the others, and one for a transcript that does not exist.
const arith = path.join(tmp, 'tmpdir-arith')
const arithBridge = (s, window) => { const f = path.join(arith, `dctr-${s}`, 'bridge.json'); fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify({ session_id: s, window, used: 1, pct: 0, t: new Date().toISOString() })); return f }
const arithFiles = { orch: arithBridge('orch', 1000000), 'low-first': arithBridge('low-first', 200000), 'high-first': arithBridge('high-first', 200000),
  'no-usage': arithBridge('no-usage', 200000), absent: arithBridge('absent', 200000) }
// Derived from TUI_TURN, a real Codex rollout: its model_context_window 258,400 made 1,000,000; the same with the
// window removed; and RUN3 up to its first PostToolUse marker, a rollout before any token_count.
const rollout = (id, lines) => transcript(`rollout-2026-09-28T18-52-46-${id}.jsonl`, lines)
const codexMillion = rollout('million', F.TUI_TURN.map((l) => l.replaceAll('"model_context_window":258400', '"model_context_window":1000000')))
const codexNoWindow = rollout('nowindow', F.TUI_TURN.map((l) => l.replaceAll(/,"model_context_window":258400/g, '')))
const codexNoCount = rollout('nocount', F.RUN3.slice(0, F.RUN3.findIndex((l) => l.includes('POST-MARKER'))))
// TUI_TURN with its first token_count's window left at 258,400 and its last one made 1,000,000: the window changes between readings.
const codexGrown = rollout('grown', (() => { const ls = [...F.TUI_TURN], i = ls.findLastIndex((l) => l.includes('"model_context_window":258400'))
  ls[i] = ls[i].replace('"model_context_window":258400', '"model_context_window":1000000'); return ls })())

// Each run gets a TMPDIR of its own, so the bridge file it reads is the one its clause wrote (E15-D256).
const runIn = (tmpdir, ...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmpdir } })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const emptyTmp = path.join(tmp, 'tmpdir-none'); fs.mkdirSync(emptyTmp)
const run = (...args) => runIn(arith, ...args)
const show = (r) => `exit ${r.code}, stdout "${r.out}"${r.err ? `, stderr "${r.err}"` : ''}`
const unknownWindow = (r) => r.code === 1 && /^refuse window unknown: /.test(r.out) && !/window \d|\d{4}/.test(r.out)

// ---------------------------------------------------------------- clause 2: the command

{
  const r = run('capacity', '220000', orch)
  clause('clause 2a — a Claude Code transcript reading 47,600 first, its bridge file reporting 1,000,000: accept at that window, naming the bridge', r.code === 0 && /^accept window 1000000 from bridge load 47600 tier 220000\b/.test(r.out), show(r))
}
{
  const r = runIn(emptyTmp, 'capacity', '220000', orch)
  clause('clause 2b — the same transcript with no bridge file: refuse, the window unknown, naming no window', unknownWindow(r), show(r))
}
{
  const r = runIn(emptyTmp, 'capacity', '220000', codexMillion)
  clause('clause 2c — a Codex rollout reporting model_context_window 1,000,000: accept at that window, naming the rollout, the load its first token_count 17,401', r.code === 0 && /^accept window 1000000 from rollout load 17401 tier 220000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', '160000', lowFirst)
  clause('clause 2d — first reading 94,999, later 100,000: accept on the first', r.code === 0 && /^accept window 200000 from bridge load 94999 tier 160000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', '160000', highFirst)
  clause('clause 2e — first reading 100,000, later 94,999: refuse on the first', r.code === 1 && /^refuse window 200000 from bridge load 100000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', '160000', noUsage)
  const m = run('capacity', '160000', path.join(tmp, 'absent.jsonl'))
  clause('clause 2f — a transcript with no usage, or none at all, each with a bridge reading: refuse, the load unknown', r.code === 1 && /load is unknown/.test(r.out) && m.code === 1 && /load is unknown/.test(m.out), `${show(r)}; ${show(m)}`)
}
{
  const r = run('capacity', 'lots', orch)
  clause('clause 2g — a tier resolveTier cannot read: refuse with its error', r.code === 1 && /malformed tier/.test(r.out), show(r))
}
{
  const r = run('capacity', '60%', orch)
  clause('clause 2h — a percent tier resolves against the host\'s window: 60% of 1,000,000', r.code === 0 && /tier 600000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', orch)
  const old = run('capacity', 'some-model', '220000', orch)
  clause('clause 2i — a missing argument, or the old form with a model id: exit 2 and no verdict', r.code === 2 && r.out === '' && old.code === 2 && old.out === '', `${show(r)}; ${show(old)}`)
}

{
  // 190,000 in 200,000: within the window and above the load plus margin, so only resolveTier's 90% rule refuses it.
  const r = run('capacity', '190000', lowFirst)
  const ok = run('capacity', '180000', lowFirst)
  clause('clause 2j — a tier above 90% of the window but within it: refuse with the configuration error, and 90% itself accepts',
    r.code === 1 && /^refuse\b/.test(r.out) && /configuration error/.test(r.out) && ok.code === 0 && /^accept window 200000 from bridge load 94999 tier 180000\b/.test(ok.out), `${show(r)}; ${show(ok)}`)
}

{
  const r = runIn(fresh.dir, 'capacity', 'default', hostStart)
  clause('clause 2k — a fresh bridge reading of 1,000,000 for the transcript\'s session: accept at that window, naming the bridge (E15-D256)',
    r.code === 0 && /^accept window 1000000 from bridge load 101825\b/.test(r.out), show(r))
}
for (const [n, b, what] of [['2m', stale, 'older than the expiry'], ['2n', garbled, 'that does not parse'], ['2o', textWindow, 'whose window is not a number']]) {
  const r = runIn(b.dir, 'capacity', 'default', hostStart)
  clause(`clause ${n} — a bridge file ${what} is no bridge reading: refuse, the window unknown, naming no window (E15-D256)`, unknownWindow(r), show(r))
}
{
  const r = runIn(fresh.dir, 'capacity', 'default', ranAny)
  clause('clause 2q — a session that ran a model no list names, with a fresh bridge reading: accept at the bridge window 1,000,000',
    r.code === 0 && /^accept window 1000000 from bridge load 101825\b/.test(r.out), show(r))
}
{
  const w = runIn(emptyTmp, 'capacity', '220000', codexNoWindow)
  const c = runIn(emptyTmp, 'capacity', '220000', codexNoCount)
  clause('clause 2r — a Codex rollout whose token_counts carry no model_context_window, or with no token_count yet: refuse, the window unknown',
    unknownWindow(w) && unknownWindow(c), `${show(w)}; ${show(c)}`)
}
{
  const r = runIn(emptyTmp, 'capacity', '220000', codexGrown)
  clause('clause 2c2 — a Codex rollout whose model_context_window grows from 258,400 to 1,000,000 between its readings: accept at the latest window, the load still its first token_count',
    r.code === 0 && /^accept window 1000000 from rollout load 17401 tier 220000\b/.test(r.out), show(r))
}
{
  const b = runIn(emptyTmp, 'capacity', '220000', orch), w = runIn(emptyTmp, 'capacity', '220000', codexNoWindow)
  clause('clause 2u — a refused unknown window names its fix: on Claude Code no fresh statusline bridge reading, to let the statusline draw once, and the bridge install command where it is not installed, on Codex no model_context_window in the rollout yet',
    unknownWindow(b) && b.out.includes('no fresh statusline bridge reading for this session') && b.out.includes('let the statusline draw once') && b.out.includes('where the bridge is not installed') && b.out.includes('node hooks/dctr-bridge.mjs install') &&
      unknownWindow(w) && w.out.includes('carries no model_context_window yet') && !w.out.includes('bridge'), `${show(b)}; ${show(w)}`)
}
{
  // A config dir that does not exist: launch-flags names the mode file under it and makes nothing.
  const pane = 'w1:p7', modeCfg = path.join(tmp, 'config-mode')
  const flags = (env) => { const r = spawnSync(process.execPath, [cli, 'launch-flags'], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: modeCfg, ...env } }); return { code: r.status, out: r.stdout } }
  const { launchFlags, shq } = await import('./dctr-lib.mjs'), { modeFile } = await import('./dctr-state.mjs')
  const was = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = modeCfg
  const want = launchFlags(modeFile(pane))
  if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was
  const on = flags({ HERDR_PANE_ID: pane }), off = flags({ HERDR_PANE_ID: '' })
  clause('clause 2v — launch-flags prints launchFlags of the calling pane\'s mode file, <config dir>/doctrine/modes/pane-<pane>.mode, and exits 0, and with no HERDR_PANE_ID an empty line and exits 0; neither run, nor computing the path, creates the config dir',
    on.code === 0 && on.out === `${want}\n` && want.includes(shq(path.join(modeCfg, 'doctrine', 'modes', 'pane-w1_p7.mode'))) && off.code === 0 && off.out === '\n' && !fs.existsSync(modeCfg), JSON.stringify([want, on, off, fs.existsSync(modeCfg)]))
}
{
  const { capacity, hostWindow } = await import('./dctr-orchestrate.mjs')
  const text = (f) => fs.readFileSync(f, 'utf8')
  const none = capacity('220000', text(orch), null), br = capacity('220000', text(orch), { window: 1000000, source: 'bridge' })
  const ro = capacity('220000', text(codexMillion), { window: 1000000, source: 'rollout' })
  clause('clause 2s — capacity, pure: no reading refuses with the window unknown; a bridge reading and a rollout reading each accept, naming their source',
    none.accept === false && /^refuse window unknown: /.test(none.line) && br.accept === true && br.line.startsWith('accept window 1000000 from bridge load 47600 tier 220000') &&
      ro.accept === true && ro.line.startsWith('accept window 1000000 from rollout load 17401 tier 220000'), JSON.stringify([none, br, ro]))
  const was = process.env.TMPDIR
  process.env.TMPDIR = arith
  const got = [hostWindow(orch), hostWindow(codexMillion), hostWindow(codexNoWindow), hostWindow(path.join(tmp, 'rollout-2026-09-28T18-52-46-gone.jsonl'))]
  process.env.TMPDIR = emptyTmp
  got.push(hostWindow(orch))
  process.env.TMPDIR = was
  const grown = hostWindow(codexGrown), given = hostWindow(codexNoWindow, text(codexMillion))
  clause('clause 2t2 — hostWindow takes a rollout\'s latest window, and reads the rollout text it is handed rather than the file',
    JSON.stringify(grown) === JSON.stringify({ window: 1000000, source: 'rollout' }) && JSON.stringify(given) === JSON.stringify({ window: 1000000, source: 'rollout' }), JSON.stringify([grown, given]))
  const cc = capacity('220000', text(orch), null, 'claude'), cx = capacity('220000', text(codexNoWindow), null, 'codex')
  clause('clause 2s2 — capacity, pure, with no reading: the Claude Code refusal names the bridge install command, the Codex one the missing model_context_window, and the three-argument form keeps the Claude Code one',
    cc.accept === false && cc.line.includes('node hooks/dctr-bridge.mjs install') && cx.accept === false && cx.line.includes('carries no model_context_window yet') && none.line === cc.line,
    JSON.stringify([cc, cx, none]))
  clause('clause 2t — hostWindow: a Claude Code transcript with a bridge reading gives it from bridge, a rollout carrying model_context_window from rollout, and a rollout without one, a missing rollout and a transcript with no bridge reading give null',
    JSON.stringify(got) === JSON.stringify([{ window: 1000000, source: 'bridge' }, { window: 1000000, source: 'rollout' }, null, null, null]), JSON.stringify(got))
}

// ---------------------------------------------------------------- clause 3: the fixtures, without the command

const readings = (f) => fs.readFileSync(f, 'utf8').split('\n').flatMap((l) => {
  try { const e = JSON.parse(l); const u = e.message?.usage; if (e.type !== 'assistant' || !u || e.isSidechain) return []
    const n = u.input_tokens + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); return n > 0 ? [n] : [] } catch { return [] }
})
clause('clause 3a — orch.jsonl reads 47,600 first and something else later', String(readings(orch)) === '47600,300000', String(readings(orch)))
clause('clause 3b — low-first.jsonl reads 94,999 then 100,000, and high-first.jsonl the reverse',
  String(readings(lowFirst)) === '94999,100000' && String(readings(highFirst)) === '100000,94999', `${readings(lowFirst)} / ${readings(highFirst)}`)
clause('clause 3c — each fixture opens with a seat entry and a zero entry ahead of its first reading',
  [orch, lowFirst, highFirst].every((f) => { const ls = fs.readFileSync(f, 'utf8').split('\n'); return JSON.parse(ls[1]).isSidechain === true && JSON.parse(ls[2]).message.usage.input_tokens === 0 }), 'lead lines missing')
clause('clause 3d — no-usage.jsonl carries no usage reading', readings(noUsage).length === 0, String(readings(noUsage)))

{
  // Literal 65,000 and 90%, so the proof uses neither the library nor the command.
  const first = readings(lowFirst)[0], win = 200000
  clause('clause 3e — 2j\'s tier 190,000 is above 90% of 200,000 while load plus 65,000 is below it and it fits the window; 180,000 is not above 90%',
    190000 > win * 0.9 && first + 65000 < 190000 && 190000 <= win && !(180000 > win * 0.9) && first + 65000 < 180000, `first ${first}`)
}
{
  // Literal 300,000, the watcher's bridge expiry, so the proof uses neither the bridge reader nor the command.
  const parse = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
  const age = (f) => Date.now() - fs.statSync(f).mtimeMs
  const fr = parse(fresh.f), st = parse(stale.f), tw = parse(textWindow.f)
  clause('clause 3f — S.jsonl reads 101,825 first; the fresh file names S with window 1,000,000 and is under the expiry old',
    String(readings(hostStart)) === '101825' && path.basename(hostStart, '.jsonl') === S && fr?.session_id === S && fr.window === 1000000 && age(fresh.f) < 300000,
    `${readings(hostStart)} ${JSON.stringify(fr)} ${age(fresh.f)}`)
  clause('clause 3g — the stale file names S with window 1,000,000 and is past the expiry old; the garbled one does not parse; the other\'s window is a string',
    st?.session_id === S && st.window === 1000000 && age(stale.f) > 300000 && parse(garbled.f) === null && tw?.session_id === S && typeof tw.window === 'string',
    `${JSON.stringify(st)} ${age(stale.f)} ${JSON.stringify(tw)}`)
  clause('clause 3h — the empty TMPDIR holds no bridge file', fs.readdirSync(emptyTmp).length === 0, String(fs.readdirSync(emptyTmp)))
  const rb = parse(ranBridge)
  const model = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((e) => e.message?.model ?? null)
  clause('clause 3i — ran-session.jsonl reads 101,825 first and names some-future-model-9; its bridge file names it with window 1,000,000 and is under the expiry old',
    String(readings(ranAny)) === '101825' && String(model(ranAny)) === ',some-future-model-9' && path.basename(ranAny, '.jsonl') === R && rb?.session_id === R && rb.window === 1000000 && age(ranBridge) < 300000,
    `${readings(ranAny)} ${model(ranAny)} ${JSON.stringify(rb)}`)
  const ab = Object.entries(arithFiles).map(([s, f]) => [s, parse(f)?.session_id, parse(f)?.window, age(f) < 300000])
  clause('clause 3j — the arithmetic TMPDIR holds a fresh bridge file per session: orch at 1,000,000, the others at 200,000; absent.jsonl does not exist',
    JSON.stringify(ab) === JSON.stringify([['orch', 'orch', 1000000, true], ['low-first', 'low-first', 200000, true], ['high-first', 'high-first', 200000, true], ['no-usage', 'no-usage', 200000, true], ['absent', 'absent', 200000, true]]) && !fs.existsSync(path.join(tmp, 'absent.jsonl')),
    JSON.stringify(ab))
}
{
  // The rollouts parsed by hand: each token_count's last_token_usage.input_tokens and model_context_window.
  const counts = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((e) => e.type === 'event_msg' && e.payload?.type === 'token_count').map((e) => [e.payload.info.last_token_usage.input_tokens, e.payload.info.model_context_window ?? null])
  clause('clause 3k — the Codex rollouts: the million one reads 17,401 then 17,503 at window 1,000,000, the no-window one carries no model_context_window at all, the no-count one has no token_count; every one is named rollout-',
    JSON.stringify(counts(codexMillion)) === '[[17401,1000000],[17503,1000000]]' && JSON.stringify(counts(codexNoWindow)) === '[[17401,null],[17503,null]]' &&
      !fs.readFileSync(codexNoWindow, 'utf8').includes('model_context_window') && counts(codexNoCount).length === 0 &&
      [codexMillion, codexNoWindow, codexNoCount].every((f) => path.basename(f).startsWith('rollout-')),
    `${JSON.stringify(counts(codexMillion))} ${JSON.stringify(counts(codexNoWindow))} ${counts(codexNoCount).length}`)
  clause('clause 3l — the grown rollout reads 17,401 at window 258,400, then 17,503 at window 1,000,000, and is named rollout-',
    JSON.stringify(counts(codexGrown)) === '[[17401,258400],[17503,1000000]]' && path.basename(codexGrown).startsWith('rollout-'), JSON.stringify(counts(codexGrown)))
}
// ---------------------------------------------------------------- clause 4: start (E15-D269, E15-D270, E15-D280)
//
// A herdr shim on PATH logs every call to shim.log: `tab create` answers a new pane, `pane get` of it reads busy with a
// session until its BUSY-th read and from then fresh (agent_status unknown, no session), and `pane run` refuses a line
// over 1,024 bytes and otherwise runs the line by /bin/sh -c in an empty environment, as a fresh pane's shell would. A
// claude stub first on PATH logs its argv, cwd and the environment the launch gave it.

const BUSY = 3
const SHIM = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process')
const dir = path.dirname(__dirname), st = path.join(dir, 'shim.json'), a = process.argv.slice(2)
const s = JSON.parse(fs.readFileSync(st, 'utf8')), entry = { argv: a }
const out = (o, code = 0) => { fs.appendFileSync(path.join(dir, 'shim.log'), JSON.stringify(entry) + '\n'); fs.writeFileSync(st, JSON.stringify(s)); if (code) process.stderr.write(o + '\n'); else process.stdout.write(JSON.stringify(o) + '\n'); process.exit(code) }
if (a[0] === 'tab' && a[1] === 'create') { const id = 'w1:p' + (++s.n); s.reads[id] = 0; entry.made = id; out({ result: { tab: { tab_id: 't' + s.n }, root_pane: { pane_id: id } } }) }
if (a[0] === 'pane' && a[1] === 'get') {
  const fresh = ++s.reads[a[2]] >= s.busy; entry.fresh = fresh
  out({ result: { pane: { pane_id: a[2], agent_status: fresh ? 'unknown' : 'working', agent_session: fresh ? null : { value: 'booting' } } } })
}
if (a[0] === 'pane' && a[1] === 'run') {
  entry.bytes = Buffer.byteLength(a[3])
  if (entry.bytes > 1024) { entry.failed = true; out('herdr: the line is over the 1024-byte limit', 1) }
  entry.status = spawnSync('/bin/sh', ['-c', a[3]], { env: {}, encoding: 'utf8' }).status
}
out({ result: {} })
`
const STUB = String.raw`#!/usr/bin/env node
require('fs').appendFileSync(__dirname + '/../claude.log', JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), role: process.env.DCTR_ROLE ?? null, caller: process.env.DCTR_CALLER ?? null, run: process.env.DCTR_RUN ?? null, path: process.env.PATH ?? null, cfg: process.env.CLAUDE_CONFIG_DIR ?? null, tmp: process.env.TMPDIR ?? null }) + '\n')
`
const sx = path.join(tmp, 'start'), sbin = path.join(sx, 'bin'), stmp = path.join(sx, 'tmp'), scfg = path.join(sx, 'cfg')
fs.mkdirSync(sbin, { recursive: true }); fs.mkdirSync(stmp)
fs.writeFileSync(path.join(sbin, 'herdr'), SHIM, { mode: 0o755 }); fs.writeFileSync(path.join(sbin, 'claude'), STUB, { mode: 0o755 })
const resetShim = (busy = BUSY) => { fs.writeFileSync(path.join(sx, 'shim.json'), JSON.stringify({ n: 0, reads: {}, busy })); fs.rmSync(path.join(sx, 'shim.log'), { force: true }); fs.rmSync(path.join(sx, 'claude.log'), { force: true }) }
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
const shimCalls = () => lines(path.join(sx, 'shim.log')), stubStarts = () => lines(path.join(sx, 'claude.log'))
const gitc = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=s@s', '-c', 'user.name=s', ...a], { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
const repo = (name, files) => {
  const d = path.join(sx, name)
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body) }
  gitc(d, 'init', '-q'); gitc(d, 'add', '-A'); gitc(d, 'commit', '-q', '-m', 'base')
  return fs.realpathSync(d)
}
const proj = repo('proj', { 'README.md': 'x\n', 'docs/PROJECT.md': '# Selftest project\n\nRecords: .doctrine/records\n' })
const bare = repo('bare', { 'README.md': 'x\n' })
const sub = path.join(proj, 'docs')
const reqText = "--help is not wanted: run lanes a and b; the owner said 'go' and $HOME stays literal.\n"
const req = path.join(sx, 'request.md'); fs.writeFileSync(req, reqText)
// Long enough that a launch line carrying it would pass herdr's limit; the shim's bin first, so it names herdr and claude.
const SPATH = [sbin, path.dirname(process.execPath), ...Array.from({ length: 40 }, (_, i) => `/nonexistent/selftest/padding/dir-${String(i).padStart(2, '0')}`), '/usr/bin', '/bin'].join(':')
const sEnv = (over = {}) => {
  const e = { ...process.env, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', TMPDIR: stmp, CLAUDE_CONFIG_DIR: scfg, PATH: SPATH, DCTR_START_TIMES: '{"poll":20,"ready":2000}', ...over }
  for (const k of ['DCTR_ROLE', 'DCTR_CALLER', 'DCTR_RUN', 'DCTR_VIEW_REQUEST_DIR', 'HERDR_PANE_ID']) if (!(k in over)) delete e[k]
  for (const [k, v] of Object.entries(e)) if (v === undefined) delete e[k]
  return e
}
const startIn = (cwd, args, over) => { const r = spawnSync(process.execPath, [cli, 'start', ...args], { cwd, env: sEnv(over), encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() } }
const tree = () => [sx, stmp].map((d) => fs.readdirSync(d, { recursive: true }).map(String).filter((f) => !/^(shim\.(json|log)|claude\.log)$/.test(f)).sort().join('\n')).join('\n--\n')
const runDir = path.join(proj, '.doctrine', 'records', 'orchestrate')
const startedLine = (r, pane) => r.out === `dctr-orchestrate: started the orchestrator in ${pane}`
const typedFile = (line) => (/^sh '([^']+)'$/.exec(line ?? '') ?? [])[1]
const flagOf = (argv) => { const own = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv, i = own.indexOf('--permission-mode'); return i >= 0 ? `--permission-mode ${own[i + 1]}` : 'none' }

{
  resetShim()
  const r = startIn(proj, ['claude-opus-5-5', req])
  const calls = shimCalls(), creates = calls.filter((e) => e.argv[1] === 'create'), runs = calls.filter((e) => e.argv[1] === 'run')
  const pane = creates[0]?.made, firstFresh = calls.findIndex((e) => e.argv[1] === 'get' && e.argv[2] === pane && e.fresh)
  const typedAt = calls.findIndex((e) => e.argv[1] === 'run'), file = typedFile(runs[0]?.argv[3]), st = stubStarts()[0], at = st ? st.argv.indexOf('--model') : -1
  const tabOk = creates.length === 1 && creates[0].argv.includes('--workspace') && creates[0].argv[creates[0].argv.indexOf('--workspace') + 1] === 'w1'
  const lineOk = runs.length === 1 && runs[0].argv[2] === pane && Boolean(file) && runs[0].bytes <= 1024 && !runs[0].failed && firstFresh >= 0 && typedAt > firstFresh
  const fileOk = Boolean(file) && fs.existsSync(file) && !file.startsWith(runDir + path.sep) && !file.startsWith(proj + path.sep)
  const stubOk = stubStarts().length === 1 && fs.realpathSync(st.cwd) === proj && st.role === 'orchestrator' && st.caller === 'orchestrator' && st.run === runDir &&
    st.path === SPATH && st.cfg === scfg && st.tmp === stmp && at >= 0 && st.argv[at + 1] === 'claude-opus-5-5' && st.argv.at(-2) === '--' && st.argv.at(-1) === reqText
  clause('clause 4a — start under a PATH past 1,024 bytes: exit 0 printing the pane, one tab in the caller\'s workspace, one typed line sh \'<file>\' within the limit after the first fresh pane get, the file its own and outside the run, and claude started once in the checkout as the orchestrator with DCTR_RUN <Records>/orchestrate, the caller\'s config dir, PATH and TMPDIR, the model, and -- then the request text last',
    r.code === 0 && startedLine(r, pane) && tabOk && lineOk && fileOk && stubOk, JSON.stringify({ r, calls, st, fileOk, PATH: Buffer.byteLength(SPATH) }))
}
{
  resetShim()
  const r = startIn(sub, ['claude-opus-5-5'])
  const st = stubStarts()[0]
  clause('clause 4b — start from a subdirectory with no request file: claude starts in the checkout\'s top level, DCTR_RUN still <Records>/orchestrate, with no -- and no prompt',
    r.code === 0 && stubStarts().length === 1 && fs.realpathSync(st.cwd) === proj && st.run === runDir && !st.argv.includes('--') && st.argv.at(-1) === 'claude-opus-5-5', JSON.stringify({ r, st }))
}
for (const [n, name, cwd, over] of [
  ['4c', 'DCTR_ROLE set', proj, { DCTR_ROLE: 'a' }],
  ['4d', 'DCTR_VIEW_REQUEST_DIR set', proj, { DCTR_VIEW_REQUEST_DIR: path.join(sx, 'views') }],
  ['4e', 'no HERDR_WORKSPACE_ID', proj, { HERDR_WORKSPACE_ID: undefined }],
  ['4f', 'no docs/PROJECT.md', bare, {}],
]) {
  resetShim()
  const t0 = tree(), r = startIn(cwd, ['claude-opus-5-5', req], over)
  const said = `${r.out}\n${r.err}`.trim().split('\n').filter(Boolean)
  clause(`clause ${n} — start with ${name}: exit 1 with one line saying why, no herdr call, no new file, nothing typed`,
    r.code === 1 && said.length === 1 && /^dctr-orchestrate: start refused/.test(said[0]) && shimCalls().length === 0 && tree() === t0 && stubStarts().length === 0, JSON.stringify({ r, calls: shimCalls(), changed: tree() !== t0 }))
}
{
  resetShim()
  const t0 = tree(), none = startIn(proj, []), extra = startIn(proj, ['claude-opus-5-5', req, 'more'])
  clause('clause 4g — start with no model id, or with an argument past the request file: exit 2 with the usage line naming start, no herdr call, no new file',
    [none, extra].every((r) => r.code === 2 && r.out === '' && /^usage: .*dctr-orchestrate\.mjs start <model id> \[<request file>\]/.test(r.err)) && shimCalls().length === 0 && tree() === t0, JSON.stringify([none, extra]))
}
{
  resetShim()
  const t0 = tree(), r = startIn(proj, ['claude-opus-5-5', path.join(sx, 'absent.md')])
  clause('clause 4h — a request file that cannot be read: exit 1 with one line, no herdr call, no new file',
    r.code === 1 && r.out === '' && r.err.split('\n').length === 1 && shimCalls().length === 0 && tree() === t0, JSON.stringify(r))
}
{
  // The pane never reads fresh within the wait: nothing is typed, the line names the pane and the launch file left.
  resetShim(1e9)
  const r = startIn(proj, ['claude-opus-5-5', req]), calls = shimCalls(), pane = calls.find((e) => e.argv[1] === 'create')?.made
  clause('clause 4i — a pane that never reads fresh: exit 1 with one line naming the pane and the launch file as left in place, nothing typed, nothing closed',
    r.code === 1 && r.err.split('\n').length === 1 && Boolean(pane) && r.err.includes(pane) && /left in place/.test(r.err) && /\/launch\.sh/.test(r.err) &&
      !calls.some((e) => e.argv[1] === 'run' || e.argv[1] === 'close') && stubStarts().length === 0, JSON.stringify({ r, calls }))
}
{
  // E15-D280: the calling pane's mode file, where modeFile puts it under the start call's config dir.
  const { modeFile } = await import('./dctr-state.mjs')
  const was = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = scfg
  const mf = modeFile('w1:p9')
  if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was
  const set = (v) => { if (v === null) fs.rmSync(mf, { force: true }); else { fs.mkdirSync(path.dirname(mf), { recursive: true }); fs.writeFileSync(mf, `${v}\n`) } }
  const got = [['bypassPermissions', '--permission-mode bypassPermissions'], ['default', 'none'], [null, 'none']].map(([v, want]) => {
    resetShim(); set(v)
    const r = startIn(proj, ['claude-opus-5-5', req], { HERDR_PANE_ID: 'w1:p9' }), st = stubStarts()
    return { v, want, code: r.code, got: st.length === 1 ? flagOf(st[0].argv) : null }
  })
  clause('clause 4j — the calling pane\'s mode file reading bypassPermissions starts claude with --permission-mode bypassPermissions; default or no mode file, with none (E15-D280)',
    got.every((g) => g.code === 0 && g.got === g.want), JSON.stringify(got))
  // The same launch file run again after the mode changes: the flag follows the mode as the file runs (E15-D265).
  resetShim(); set('bypassPermissions')
  startIn(proj, ['claude-opus-5-5', req], { HERDR_PANE_ID: 'w1:p9' })
  const file = typedFile(shimCalls().find((e) => e.argv[1] === 'run')?.argv[3])
  set('default'); spawnSync('/bin/sh', [file], { env: {} })
  set(null); spawnSync('/bin/sh', [file], { env: {} })
  const flags = stubStarts().map((s) => flagOf(s.argv))
  clause('clause 4k — the launch file start wrote, run again unchanged after the mode file reads default and then after it is removed, starts claude with no permission flag each time (E15-D265)',
    JSON.stringify(flags) === JSON.stringify(['--permission-mode bypassPermissions', 'none', 'none']), JSON.stringify(flags))
  set(null)
}

// clause 4's fixtures, proved without start
{
  resetShim()
  const sh = spawnSync('/bin/sh', ['-c', 'command -v herdr; command -v claude'], { env: { PATH: SPATH }, encoding: 'utf8' }).stdout.trim().split('\n')
  clause('clause 3m — under clause 4\'s PATH, over 1,024 bytes, herdr and claude resolve to the shim and the stub',
    Buffer.byteLength(SPATH) > 1024 && sh[0] === path.join(sbin, 'herdr') && sh[1] === path.join(sbin, 'claude'), JSON.stringify(sh))
  const env = { ...process.env, PATH: SPATH }, call = (...a) => spawnSync(path.join(sbin, 'herdr'), a, { env, encoding: 'utf8' })
  const pane = JSON.parse(call('tab', 'create', '--workspace', 'w1').stdout).result.root_pane.pane_id
  const reads = Array.from({ length: BUSY }, () => JSON.parse(call('pane', 'get', pane).stdout).result.pane.agent_session)
  const { shq } = await import('./dctr-lib.mjs')
  const long = call('pane', 'run', pane, 'x'.repeat(1025)), short = call('pane', 'run', pane, `echo ok > ${shq(path.join(sx, 'ran'))}`)
  clause('clause 3n — the shim answers a busy session until its third pane get and none from it, refuses a typed line over 1,024 bytes and runs one within it',
    reads.slice(0, BUSY - 1).every((s) => s?.value === 'booting') && reads[BUSY - 1] === null && long.status === 1 && short.status === 0 && fs.readFileSync(path.join(sx, 'ran'), 'utf8') === 'ok\n',
    JSON.stringify({ reads, long: long.status, short: short.status }))
  fs.rmSync(path.join(sx, 'ran'), { force: true })
  clause('clause 3o — the request text opens with -; proj carries docs/PROJECT.md naming Records .doctrine/records, bare carries none, and each is a git top level',
    reqText.startsWith('-') && /^Records: \.doctrine\/records$/m.test(fs.readFileSync(path.join(proj, 'docs/PROJECT.md'), 'utf8')) && !fs.existsSync(path.join(bare, 'docs/PROJECT.md')) &&
      fs.existsSync(path.join(proj, '.git')) && fs.existsSync(path.join(bare, '.git')), 'fixture repos')
  resetShim()
}

console.log(bad ? `\n${bad} FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
