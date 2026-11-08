// Tamper test for `dctr-orchestrate.mjs capacity` (KS-1), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-orchestrate.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins `capacityDecision` in dctr-lib.mjs on the seven cases E15-D51 names, the margin read from
// HANDOFF_COST_TOKENS. Clause 2 runs the command on fixture transcripts: the window from the model id (E15-D208),
// the load from the first usage reading (E15-D209), and the refusals that are not arithmetic. Clause 3 proves the
// fixture transcripts carry the readings the clauses rest on, by parsing them without the command or the library.

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

const run = (...args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const show = (r) => `exit ${r.code}, stdout "${r.out}"${r.err ? `, stderr "${r.err}"` : ''}`

// ---------------------------------------------------------------- clause 2: the command

{
  const r = run('capacity', 'claude-opus-5-5[1m]', '220000', orch)
  clause('clause 2a — a [1m] id: accept at the window 1,000,000', r.code === 0 && /^accept window 1000000 load 47600 tier 220000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '220000', orch)
  clause('clause 2b — a known id without [1m]: refuse at the window 200,000', r.code === 1 && /^refuse window 200000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'not-a-model', '220000', orch)
  clause('clause 2c — an unknown id: refuse, naming it unknown, with no window', r.code === 1 && /^refuse\b/.test(r.out) && r.out.includes('"not-a-model" is unknown') && !/window/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '160000', lowFirst)
  clause('clause 2d — first reading 94,999, later 100,000: accept on the first', r.code === 0 && /^accept window 200000 load 94999 tier 160000\b/.test(r.out), show(r))
}
{
  const r = run('capacity', 'claude-opus-5-5', '160000', highFirst)
  clause('clause 2e — first reading 100,000, later 94,999: refuse on the first', r.code === 1 && /^refuse window 200000 load 100000\b/.test(r.out), show(r))
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

console.log(bad ? `\n${bad} FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
