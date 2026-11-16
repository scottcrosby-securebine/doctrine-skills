// Tamper test for `dctr-orchestrate.mjs capacity` (KS-1), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-orchestrate.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins `capacityDecision` in dctr-lib.mjs on the seven cases E15-D51 names, the margin read from
// HANDOFF_COST_TOKENS. Clause 2 runs the command on fixture transcripts: the window from the model id (E15-D208) or,
// where a usable one exists, the transcript session's bridge file (E15-D256), the load from the first usage reading
// (E15-D209), and the refusals that are not arithmetic. Clause 3 proves the
// fixture transcripts and bridge files carry the readings the clauses rest on, by parsing them without the command or
// the library.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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
// R1-O1: a session that ran claude-opus-5-5, its last main-thread entry naming it, followed by a seat's entry naming
// claude-haiku-5-5 and an API error's <synthetic> one, with a fresh 1,000,000 bridge reading in the fresh TMPDIR.
const R = 'ran-session'
const ranOpus = transcript(`${R}.jsonl`, [user, assistant(101825, { message: { role: 'assistant', model: 'claude-opus-5-5', usage: { input_tokens: 4, cache_creation_input_tokens: 101821, cache_read_input_tokens: 0, output_tokens: 10 } } }),
  JSON.stringify({ type: 'assistant', uuid: 'side', isSidechain: true, message: { role: 'assistant', model: 'claude-haiku-5-5', content: [] } }),
  JSON.stringify({ type: 'assistant', uuid: 'syn', isSidechain: false, message: { role: 'assistant', model: '<synthetic>', content: [] } })])
const ranBridge = path.join(fresh.dir, `dctr-${R}`, 'bridge.json')
fs.mkdirSync(path.dirname(ranBridge), { recursive: true })
fs.writeFileSync(ranBridge, JSON.stringify({ session_id: R, window: 1000000, used: 101825, pct: 10, t: new Date().toISOString() }))

// Each run gets a TMPDIR of its own, so the bridge file it reads is the one its clause wrote (E15-D256).
const runIn = (tmpdir, ...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmpdir } })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const emptyTmp = path.join(tmp, 'tmpdir-none'); fs.mkdirSync(emptyTmp)
const run = (...args) => runIn(emptyTmp, ...args)
const show = (r) => `exit ${r.code}, stdout "${r.out}"${r.err ? `, stderr "${r.err}"` : ''}`

// ---------------------------------------------------------------- clause 2: the command

{
  const r = run('capacity', 'claude-opus-5-5[1m]', '220000', orch)
  clause('clause 2a — a [1m] id: accept at the window 1,000,000', r.code === 0 && /^accept window 1000000 from model id load 47600 tier 220000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '220000', orch)
  clause('clause 2b — a known id without [1m]: refuse at the window 200,000', r.code === 1 && /^refuse window 200000 from model id\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'not-a-model', '220000', orch)
  clause('clause 2c — an unknown id: refuse, naming it unknown, with no window', r.code === 1 && /^refuse\b/.test(r.out) && r.out.includes('"not-a-model" is unknown') && !/window/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '160000', lowFirst)
  clause('clause 2d — first reading 94,999, later 100,000: accept on the first', r.code === 0 && /^accept window 200000 from model id load 94999 tier 160000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '160000', highFirst)
  clause('clause 2e — first reading 100,000, later 94,999: refuse on the first', r.code === 1 && /^refuse window 200000 from model id load 100000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '160000', noUsage)
  const m = run('capacity', 'claude-opus-5-5', '160000', path.join(tmp, 'absent.jsonl'))
  clause('clause 2f — a transcript with no usage, or none at all: refuse, the load unknown', r.code === 1 && /load is unknown/.test(r.out) && m.code === 1 && /load is unknown/.test(m.out), `${show(r)}; ${show(m)}`)
}
{
  const r = run('capacity', 'claude-opus-5-5[1m]', 'lots', orch)
  clause('clause 2g — a tier resolveTier cannot read: refuse with its error', r.code === 1 && /malformed tier/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5[1m]', '60%', orch)
  clause('clause 2h — a percent tier resolves against the derived window: 60% of 1,000,000', r.code === 0 && /tier 600000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', orch)
  clause('clause 2i — a missing argument: exit 2 and no verdict', r.code === 2 && r.out === '', show(r))
}

{
  // 190,000 in 200,000: within the window and above the load plus margin, so only resolveTier's 90% rule refuses it.
  const r = run('capacity', 'claude-opus-5-5', '190000', lowFirst)
  const ok = run('capacity', 'claude-opus-5-5', '180000', lowFirst)
  clause('clause 2j — a tier above 90% of the window but within it: refuse with the configuration error, and 90% itself accepts',
    r.code === 1 && /^refuse\b/.test(r.out) && /configuration error/.test(r.out) && ok.code === 0 && /^accept window 200000 from model id load 94999 tier 180000\b/.test(ok.out), `${show(r)}; ${show(ok)}`)
}

{
  const r = runIn(fresh.dir, 'capacity', 'claude-opus-5-5', 'default', hostStart)
  clause('clause 2k — a fresh bridge reading of 1,000,000 for the transcript\'s session: accept at that window, naming the bridge (E15-D256)',
    r.code === 0 && /^accept window 1000000 from bridge load 101825\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', 'default', hostStart)
  clause('clause 2l — no bridge file: the window 200,000 from the model id, naming the model id and not the bridge (E15-D256)',
    r.code === 1 && /^refuse window 200000 from model id load 101825\b/.test(r.out) && !/bridge/.test(r.out), show(r))
}
for (const [n, b, what] of [['2m', stale, 'older than the expiry'], ['2n', garbled, 'that does not parse'], ['2o', textWindow, 'whose window is not a number']]) {
  const r = runIn(b.dir, 'capacity', 'claude-opus-5-5', 'default', hostStart)
  clause(`clause ${n} — a bridge file ${what} is no bridge reading: the window 200,000 from the model id (E15-D256)`,
    r.code === 1 && /^refuse window 200000 from model id load 101825\b/.test(r.out) && !/bridge/.test(r.out), show(r))
}
{
  const r = runIn(fresh.dir, 'capacity', 'not-a-model', 'default', hostStart)
  clause('clause 2p — an unknown id still refuses with a bridge reading present', r.code === 1 && r.out === 'refuse model id "not-a-model" is unknown', show(r))
}

{
  const same = runIn(fresh.dir, 'capacity', 'claude-opus-5-5', 'default', ranOpus)
  const other = runIn(fresh.dir, 'capacity', 'claude-sonnet-5-5', 'default', ranOpus)
  clause('clause 2q — a session that ran the model id asked about, with a fresh bridge reading: accept at the bridge window 1,000,000, naming the bridge (R1-O1)',
    same.code === 0 && /^accept window 1000000 from bridge load 101825\b/.test(same.out), show(same))
  clause('clause 2r — the same session and bridge reading asked about another model id: the window 200,000 from the model id, naming the model id and not the bridge (R1-O1)',
    other.code === 1 && /^refuse window 200000 from model id load 101825\b/.test(other.out) && !/bridge/.test(other.out), show(other))
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
  const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const models = (f) => lines(f).map((e) => [e.isSidechain === true, e.message?.model ?? null])
  const rb = parse(ranBridge)
  clause('clause 3i — S.jsonl names no model on any entry; ran-session.jsonl reads 101,825 first, names claude-opus-5-5 on its one main-thread entry with usage, then a seat entry naming claude-haiku-5-5 and a main-thread <synthetic> entry last; its bridge file names it with window 1,000,000 and is under the expiry old (R1-O1)',
    models(hostStart).every(([, m]) => m === null) && String(readings(ranOpus)) === '101825' &&
      JSON.stringify(models(ranOpus)) === JSON.stringify([[false, null], [false, 'claude-opus-5-5'], [true, 'claude-haiku-5-5'], [false, '<synthetic>']]) &&
      path.basename(ranOpus, '.jsonl') === R && rb?.session_id === R && rb.window === 1000000 && age(ranBridge) < 300000,
    `${JSON.stringify(models(hostStart))} ${readings(ranOpus)} ${JSON.stringify(models(ranOpus))} ${JSON.stringify(rb)}`)
}
console.log(bad ? `\n${bad} FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
