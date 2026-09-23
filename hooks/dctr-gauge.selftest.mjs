// Behavioral tamper test for the context gauge (E8-D4, E8-D21, E8-D10, E8-D11), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-gauge.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins the pure decisions in dctr-lib.mjs on hand-built transcripts and tiers. Clause 2 drives
// hooks/dctr-gauge.mjs end to end over fixture trees (memory file, handoff, record, transcript, bridge file)
// with a tripwire `herdr` first on PATH: the hook must never exec one (SC1). Clause 3 proves the fixtures carry
// what those clauses rest on without calling the gauge.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-gauge-'))
process.env.TMPDIR = tmp
const lib = await import('./dctr-lib.mjs')
const { gaugeSkip, autoCycleOn, readUsage, resolveTier, gaugeStep, gaugeContext, GAUGE_MAX, HANDOFF_COST_TOKENS } = lib
const { parseRecord } = await import('./dctr-record.mjs')
const { stateDir } = await import('./dctr-state.mjs')
const { bridgeFile } = await import('./dctr-bridge.mjs')

const hook = path.join(import.meta.dirname, 'dctr-gauge.mjs')
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const tripwire = path.join(tmp, 'herdr-was-called')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }

// ---------------------------------------------------------------- transcript fixtures, in the probed shape

let seq = 0
const entry = (used, { uuid = `u${++seq}`, side = false, apiError = false, msgId = 'msg_1' } = {}) => JSON.stringify({
  parentUuid: null, isSidechain: side, type: 'assistant', uuid, timestamp: `2026-09-23T12:00:${String(seq % 60).padStart(2, '0')}.000Z`,
  ...(apiError ? { isApiErrorMessage: true } : {}),
  message: { id: msgId, role: 'assistant', usage: { input_tokens: used === 0 ? 0 : 2, cache_creation_input_tokens: used === 0 ? 0 : 1000, cache_read_input_tokens: used === 0 ? 0 : used - 1002, output_tokens: 10 } },
})
const user = () => JSON.stringify({ type: 'user', uuid: `u${++seq}`, isSidechain: false, message: { role: 'user', content: 'x' } })
const lines = (...ls) => ls.join('\n') + '\n'

const REPEAT = lines(user(), entry(50000, { uuid: 'r1' }), entry(50000, { uuid: 'r2' }), entry(50000, { uuid: 'r3' }))
const APIERR = lines(entry(70000, { uuid: 'real' }), user(), entry(90000, { uuid: 'err', apiError: true }))
const APIERR0 = lines(entry(70000, { uuid: 'real-z' }), user(), entry(0, { uuid: 'err-z', apiError: true }))
const ZERO = lines(entry(70000, { uuid: 'real0' }), entry(0, { uuid: 'zero' }))
const SIDE = lines(entry(30000, { uuid: 'main' }), entry(90000, { uuid: 'side', side: true }))
const TRUNC = lines(user(), entry(60000, { uuid: 't1' }).slice(0, 80))
const TRUNC_AFTER_GOOD = lines(entry(40000, { uuid: 'good' }), entry(60000, { uuid: 't2' }).slice(0, 80))

// ---------------------------------------------------------------- clause 1: the pure decisions

const P = (more = {}) => ({ hook_event_name: 'PostToolBatch', session_id: 's', transcript_path: '/t.jsonl', cwd: '/p', tool_calls: [], ...more })
clause('clause 1a — gaugeSkip acts only on a main-session PostToolBatch with a session_id and a transcript_path (E8-D21)',
  gaugeSkip(P()) === null && gaugeSkip(P({ hook_event_name: 'Stop' })) !== null && gaugeSkip(P({ agent_id: 'a1', agent_type: 'Explore' })) !== null &&
  gaugeSkip(P({ agent_id: '' })) !== null && gaugeSkip(P({ session_id: '' })) !== null && gaugeSkip(P({ transcript_path: '' })) !== null,
  'gaugeSkip mis-gated')

const rec = (...ls) => parseRecord(ls.join('\n')).entries
clause('clause 1b — autoCycleOn returns the last on or off line, and a warned or ready line after it changes nothing',
  autoCycleOn(rec('- auto-cycle: on cap 10 tier 60%'))?.sub === 'on' &&
  autoCycleOn(rec('- auto-cycle: on cap 10 tier 60%', '- auto-cycle: off'))?.sub === 'off' &&
  autoCycleOn(rec('- auto-cycle: off', '- auto-cycle: on cap 3 tier 1000', '- auto-cycle: warned s1 1000', '- auto-cycle: ready'))?.tier === '1000' &&
  autoCycleOn(rec('- State: Open')) === null,
  'autoCycleOn read the wrong line')

const ru = (t, last = null) => readUsage(t, last)
clause('clause 1c — readUsage: a missing transcript is unknown, never a zero (E8-D10)',
  ru(null).unknown === 'missing' && !('used' in ru(null)), JSON.stringify(ru(null)))
clause('clause 1d — readUsage: a transcript whose only usage entry is a truncated line is unknown (E8-D10)',
  ru(TRUNC).unknown === 'unparseable' && ru('').unknown === 'unparseable', JSON.stringify(ru(TRUNC)))
clause('clause 1e — readUsage: a truncated last line after a good entry is skipped, not fatal',
  ru(TRUNC_AFTER_GOOD).used === 40000 && ru(TRUNC_AFTER_GOOD).uuid === 'good', JSON.stringify(ru(TRUNC_AFTER_GOOD)))
clause('clause 1f — readUsage: a reading whose last entry is the one the latch saw at the previous batch is stale (SC2)',
  ru(REPEAT, 'r3').unknown === 'stale' && ru(REPEAT, 'r2').used === 50000, JSON.stringify(ru(REPEAT, 'r3')))
clause('clause 1g — readUsage: repeated-usage entries of one response are read once, as the last entry\'s own value',
  ru(REPEAT).used === 50000 && ru(REPEAT).uuid === 'r3' && typeof ru(REPEAT).at === 'string', JSON.stringify(ru(REPEAT)))
clause('clause 1h — readUsage: an API-error entry with nonzero usage after a real one reports the real one',
  ru(APIERR).used === 70000 && ru(APIERR).uuid === 'real', JSON.stringify(ru(APIERR)))
clause('clause 1h2 — readUsage: an API-error entry with zero usage after a real one reports the real one (E8-D10)',
  ru(APIERR0).used === 70000 && ru(APIERR0).uuid === 'real-z', JSON.stringify(ru(APIERR0)))
clause('clause 1i — readUsage: a zero-total entry and a sidechain entry are skipped',
  ru(ZERO).used === 70000 && ru(SIDE).used === 30000, `${JSON.stringify(ru(ZERO))} ${JSON.stringify(ru(SIDE))}`)

const W = 200000
const rt = (tierText, window = W, firstUsed = null) => resolveTier({ tierText, window, firstUsed, handoffCost: HANDOFF_COST_TOKENS })
clause('clause 1j — resolveTier: a token tier, a percent tier and the default resolve to tokens with no error (E8-D11)',
  rt('120000').tier === 120000 && rt('120000').errors.length === 0 && rt('60%').tier === 120000 && rt('60%').errors.length === 0 &&
  rt('default').tier === 120000 && rt('default').tierText === '60%' && rt('70%').tierText === '70%',
  JSON.stringify([rt('120000'), rt('60%'), rt('default')]))
clause('clause 1k — resolveTier: a malformed tier is an error and resolves to no number',
  rt('12k').tier === null && rt('12k').errors.includes('malformed tier "12k"') && rt('60').tier === 60 && rt('%').tier === null,
  JSON.stringify(rt('12k')))
clause('clause 1l — resolveTier: a tier above 90% of the window is an error, as tokens or as a percent',
  rt('190000').errors.includes('tier above 90% of the window') && rt('95%').errors.includes('tier above 90% of the window') &&
  !rt('90%').errors.includes('tier above 90% of the window'),
  JSON.stringify([rt('190000'), rt('95%')]))
clause('clause 1l2 — resolveTier: the 90% check reads the tier after the floor raise, so a floor above 90% of the window is an error',
  rt('60%', W, 150000).tier === 150000 + HANDOFF_COST_TOKENS && rt('60%', W, 150000).errors.includes('tier above 90% of the window') &&
  !rt('20000', W, 10000).errors.includes('tier above 90% of the window'),
  JSON.stringify([rt('60%', W, 150000), rt('20000', W, 10000)]))
clause('clause 1m — resolveTier: a tier below the floor (first reading plus the handoff cost) is raised to the floor, with the error',
  rt('20000', W, 10000).tier === 10000 + HANDOFF_COST_TOKENS &&
  rt('20000', W, 10000).errors.includes(`tier 20000 below the floor ${10000 + HANDOFF_COST_TOKENS}, raised to the floor`) &&
  rt('20000', W, 10000).tierText === String(10000 + HANDOFF_COST_TOKENS) && rt('120000', W, 10000).errors.length === 0,
  JSON.stringify(rt('20000', W, 10000)))
clause('clause 1n — resolveTier: an unknown window is an error; a token tier still resolves, a percent or default tier does not (SC3)',
  rt('120000', null).tier === 120000 && rt('120000', null).errors.includes('window unknown') &&
  rt('60%', null).tier === null && rt('60%', null).errors.includes('window unknown') && rt('default', null).tier === null,
  JSON.stringify([rt('120000', null), rt('60%', null)]))

const reading = (used, uuid) => ({ used, uuid, at: '2026-09-23T12:00:00Z' })
const step = (latch, rd, sessionId = 's1', tier = 100000) => gaugeStep({ latch, reading: rd, tier, tierText: String(tier), sessionId })
const a = step(null, reading(10000, 'a'))
const b = step(a.latch, reading(110000, 'b'))
const c = step(b.latch, reading(150000, 'c'))
const d = step(c.latch, reading(150000, 'd'), 's2')
clause('clause 1o — gaugeStep: below the tier no warning, the crossing warns once, a second crossing in the same session does not (E8-D4)',
  !a.warn && b.warn && b.warnedTier === '100000' && !c.warn && c.latch.warned === true && a.latch.firstUsed === 10000 && c.latch.lastUuid === 'c',
  JSON.stringify([a, b, c]))
clause('clause 1p — gaugeStep: a new session id starts a fresh latch and warns again (E8-D4)',
  d.warn && d.latch.session_id === 's2' && d.latch.firstUsed === 150000, JSON.stringify(d))

const u1 = step(null, { unknown: 'missing' })
const u2 = step(u1.latch, { unknown: 'stale' })
const u3 = step(u2.latch, { unknown: 'unparseable' })
const u4 = step(u3.latch, { unknown: 'missing' })
const g1 = step(u2.latch, reading(5000, 'g'))
clause('clause 1q — gaugeStep: three consecutive unknown readings warn once with unknown; each unknown is a fact (E8-D10, SC10)',
  !u1.warn && !u2.warn && u3.warn && u3.warnedTier === 'unknown' && !u4.warn && u1.facts.some((f) => /unknown/.test(f)) && u3.latch.unknownRun === 3,
  JSON.stringify([u1, u2, u3, u4]))
clause('clause 1r — gaugeStep: a good reading resets the unknown run (SC10)',
  g1.latch.unknownRun === 0 && step(step(g1.latch, { unknown: 'missing' }).latch, { unknown: 'missing' }).warn === false,
  JSON.stringify(g1))
clause('clause 1s — gaugeStep: an unresolved tier never warns on a reading',
  !gaugeStep({ latch: null, reading: reading(190000, 'x'), tier: null, tierText: '12k', sessionId: 's' }).warn, 'warned with no tier')

const ctx = gaugeContext({ warn: true, used: 130000, window: W, tier: 120000, tierText: '120000', facts: ['window unknown'] })
const ctxLong = gaugeContext({ warn: true, used: 130000, window: W, tier: 120000, tierText: '120000', facts: ['y'.repeat(3000)] })
clause('clause 1t — gaugeContext: the warning names used tokens, the window, the percent, the tier, doctrine step 5 as the rule\'s source and each action, both ready-line placements included, as facts, under the limit (SC8, SC14)',
  ctx.includes('130000') && ctx.includes('200000') && ctx.includes('65%') && ctx.includes('120000') && ctx.includes('window unknown') &&
  /state line/.test(ctx) && /doctrine-handoff/.test(ctx) && ctx.includes('auto-cycle: ready') && /current step/.test(ctx) &&
  /step 5/.test(ctx) && /`- auto-cycle: ready` is appended to the record/.test(ctx) && /last line of the assistant message/.test(ctx) &&
  !/\b(you must|must|system:|SYSTEM)\b/.test(ctx) && ctx.length <= GAUGE_MAX && ctxLong.length <= GAUGE_MAX && ctxLong.includes('auto-cycle: ready'),
  ctx)
const ctxU = gaugeContext({ warn: true, used: null, window: null, tier: null, tierText: 'unknown', facts: [] })
clause('clause 1u — gaugeContext: an unknown warning says the reading is unknown and never states a token count',
  /unknown/.test(ctxU) && !/\b\d{4,}\b/.test(ctxU) && ctxU.includes('auto-cycle: ready'), ctxU)
const ctxUW = gaugeContext({ warn: true, used: null, window: W, tier: null, tierText: 'unknown', facts: [] })
clause('clause 1u2 — gaugeContext: an unknown warning names the window when the bridge knows it, and unknown otherwise (SC8)',
  ctxUW.includes('200000-token context window') && /context window of unknown size/.test(ctxU), `${ctxUW} | ${ctxU}`)

// ---------------------------------------------------------------- clause 2: the hook end to end

const memoryText = (handoff) => ['# Session memory', '', '## Next Session Kickoff', `handoff: ${handoff} | state: open`, 'Pick up the phase.', ''].join('\n')
const handoffText = (record) => ['supersedes: none', 'phase: `e8-fixture`, state: Open', `record: \`${record}\``, 'wrapper: doctrine-code', '', '# Handoff', ''].join('\n')
const recordText = (state, cycle) => ['# e8-fixture record', 'Wrapper: doctrine-code', '', '- State: Open', ...cycle, `- State: ${state}`, ''].join('\n')

function fixture(name, { state = 'Open', cycle = ['- auto-cycle: on cap 10 tier 120000'], memory = true } = {}) {
  const proj = path.join(tmp, name)
  const recordAbs = path.join(proj, '.doctrine/records/r.md')
  if (memory) write(path.join(proj, 'SESSION_MEMORY.md'), memoryText('docs/handoffs/h.md'))
  write(path.join(proj, 'docs/handoffs/h.md'), handoffText('.doctrine/records/r.md'))
  write(recordAbs, recordText(state, cycle))
  return { proj, recordAbs, transcript: path.join(proj, 't.jsonl') }
}
const bridge = (sessionId, window = W, other = null) => write(bridgeFile(sessionId), JSON.stringify({ session_id: other || sessionId, window, used: null, pct: null, t: Date.now() }))
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp }
delete env.CLAUDE_PROJECT_DIR
const run = (f, sessionId, more = {}) => {
  const r = spawnSync('node', [hook], { input: JSON.stringify(P({ session_id: sessionId, transcript_path: f.transcript, cwd: f.proj, ...more })), env, encoding: 'utf8' })
  let j = null
  try { j = r.stdout ? JSON.parse(r.stdout) : null } catch { /* the clause reports it */ }
  return { code: r.status, out: r.stdout, err: r.stderr, ctx: j?.hookSpecificOutput?.additionalContext || '', j }
}
const warnedLines = (f) => fs.readFileSync(f.recordAbs, 'utf8').split('\n').filter((l) => /^- auto-cycle: warned /.test(l))
const latchOf = (sid) => { try { return JSON.parse(fs.readFileSync(path.join(stateDir(sid), 'gauge.json'), 'utf8')) } catch { return null } }
const isWarning = (r) => r.ctx.includes('auto-cycle: ready')

// E8-D4: below, crossing, second crossing, a new session id.
const main = fixture('main')
bridge('sess-1')
write(main.transcript, lines(user(), entry(10000)))
const m1 = run(main, 'sess-1')
const w1 = warnedLines(main).length, l1 = latchOf('sess-1')
fs.appendFileSync(main.transcript, lines(user(), entry(130000), entry(130000)))
const m2 = run(main, 'sess-1')
fs.appendFileSync(main.transcript, lines(user(), entry(140000)))
const m3 = run(main, 'sess-1')
clause('clause 2a — below the tier: exit 0, nothing on stdout, no warned line, a latch written for the session (E8-D4)',
  m1.code === 0 && m1.out === '' && w1 === 0 && l1?.session_id === 'sess-1' && l1?.firstUsed === 10000, `code ${m1.code} out ${m1.out} err ${m1.err}`)
clause('clause 2b — the crossing: one PostToolBatch JSON object with the warning and a systemMessage, and the warned line appended (E8-D4, SC9)',
  m2.code === 0 && m2.j?.hookSpecificOutput?.hookEventName === 'PostToolBatch' && isWarning(m2) && typeof m2.j?.systemMessage === 'string' &&
  m2.ctx.includes('130000') && warnedLines(main).length === 1 && warnedLines(main)[0] === '- auto-cycle: warned sess-1 120000',
  `out ${m2.out} err ${m2.err} lines ${JSON.stringify(warnedLines(main))}`)
clause('clause 2c — a second crossing in the same session: no second warning, no second warned line (E8-D4)',
  m3.code === 0 && !isWarning(m3) && warnedLines(main).length === 1 && latchOf('sess-1')?.warned === true, `out ${m3.out} lines ${JSON.stringify(warnedLines(main))}`)

// E8-D21: a seat's batch carries agent_id and the PARENT's session id; it touches nothing. The parent is not yet
// warned and the seat's batch reads past the tier, so admitting it would warn; the last run below shows that.
const par = fixture('seat-parent')
bridge('sess-p')
write(par.transcript, lines(user(), entry(10000)))
const p1 = run(par, 'sess-p')
fs.appendFileSync(par.transcript, lines(user(), entry(160000)))
const parLatchFile = path.join(stateDir('sess-p'), 'gauge.json')
const latchBefore = fs.readFileSync(parLatchFile, 'utf8')
const s1 = run(par, 'sess-p', { agent_id: 'a123', agent_type: 'Explore' })
const parLatchAfter = fs.readFileSync(parLatchFile, 'utf8'), parWarnedAfterSeat = warnedLines(par).length
const seatFresh = fixture('seat-fresh')
write(seatFresh.transcript, lines(entry(150000)))
const s2 = run(seatFresh, 'sess-seat', { agent_id: 'a124', agent_type: 'Explore' })
const admitted = run(par, 'sess-p')
clause('clause 2d — a seat\'s batch past the tier on an unwarned parent: nothing on stdout, no warned line, the parent\'s latch byte-identical, no seat latch; the same batch admitted warns (E8-D21)',
  p1.out === '' && JSON.parse(latchBefore).warned === false && s1.code === 0 && s1.out === '' && s2.out === '' && parLatchAfter === latchBefore &&
  parWarnedAfterSeat === 0 && !fs.existsSync(path.join(stateDir('sess-seat'), 'gauge.json')) && warnedLines(seatFresh).length === 0 &&
  /gauge skipped — \S/.test(s1.err) && isWarning(admitted) && warnedLines(par).length === 1,
  `s1 ${s1.out} ${s1.err} s2 ${s2.out} admitted ${admitted.out}`)

// The same record and the same transcript path as sess-1, whose warned line the record already carries: a new
// session id starts its own latch and warns in its own right, and the record then holds one line per session.
bridge('sess-2')
write(main.transcript, lines(entry(10000)))
run(main, 'sess-2')
fs.appendFileSync(main.transcript, lines(user(), entry(125000)))
const n2 = run(main, 'sess-2')
clause('clause 2e — a new session id on a record already carrying the first session\'s warned line warns once in its own right, and the record holds one line per session (E8-D4)',
  isWarning(n2) && JSON.stringify(warnedLines(main)) === JSON.stringify(['- auto-cycle: warned sess-1 120000', '- auto-cycle: warned sess-2 120000']) && latchOf('sess-2')?.warned === true,
  `out ${n2.out} err ${n2.err} lines ${JSON.stringify(warnedLines(main))}`)

// auto-cycle off, and the other stand-downs.
const off = fixture('off', { cycle: ['- auto-cycle: on cap 10 tier 1000', '- auto-cycle: off'] })
const none = fixture('none', { cycle: [] })
const exited = fixture('exited', { state: 'Exited.' })
const noMem = fixture('no-mem', { memory: false })
for (const f of [off, none, exited, noMem]) { write(f.transcript, lines(entry(190000))); bridge(`sd-${path.basename(f.proj)}`) }
for (const [n, what, f] of [['2f', 'auto-cycle off after an on line', off], ['2g', 'no auto-cycle line', none], ['2h', 'an Exited record', exited], ['2i', 'no memory file', noMem]]) {
  const sid = `sd-${path.basename(f.proj)}`
  const r1 = run(f, sid), r2 = run(f, sid), r3 = run(f, sid)
  clause(`clause ${n} — ${what}, three batches past any tier: exit 0, nothing on stdout, no warned line, no latch, a reason on stderr`,
    [r1, r2, r3].every((r) => r.code === 0 && r.out === '' && /gauge skipped — \S/.test(r.err)) && warnedLines(f).length === 0 && latchOf(sid) === null,
    `out ${r1.out} err ${r1.err}`)
}

// E8-D10: three unknown readings in a row, end to end.
const unk = fixture('unknown')
bridge('sess-u')
const k = [run(unk, 'sess-u'), run(unk, 'sess-u'), run(unk, 'sess-u')]
clause('clause 2j — a missing transcript three batches running: two unknown facts, then the warning with unknown and its warned line (E8-D10)',
  !isWarning(k[0]) && /unknown/.test(k[0].ctx) && !isWarning(k[1]) && isWarning(k[2]) && warnedLines(unk).length === 1 &&
  warnedLines(unk)[0] === '- auto-cycle: warned sess-u unknown' && !/\b0 tokens\b/.test(k[0].ctx) &&
  k[2].ctx.includes(String(W)) && k[2].j?.systemMessage?.includes(String(W)),
  JSON.stringify(k.map((r) => r.ctx)))

// E8-D11: every error fact on every batch, and the floor.
const mal = fixture('malformed', { cycle: ['- auto-cycle: on cap 10 tier 12k'] })
bridge('sess-m'); write(mal.transcript, lines(entry(10000)))
const ma = run(mal, 'sess-m')
fs.appendFileSync(mal.transcript, lines(entry(190000)))
const mb = run(mal, 'sess-m')
clause('clause 2k — a malformed tier: the named error on every batch and no warning (E8-D11)',
  ma.ctx.includes('malformed tier "12k"') && mb.ctx.includes('malformed tier "12k"') && !isWarning(mb) && warnedLines(mal).length === 0,
  `${ma.out} | ${mb.out}`)
const hi = fixture('high', { cycle: ['- auto-cycle: on cap 10 tier 95%'] })
bridge('sess-h'); write(hi.transcript, lines(entry(10000)))
const ha = run(hi, 'sess-h'), hb = run(hi, 'sess-h')
clause('clause 2l — a tier above 90% of the window: the named error on every batch (E8-D11)',
  ha.ctx.includes('tier above 90% of the window') && hb.ctx.includes('tier above 90% of the window'), `${ha.out} | ${hb.out}`)
const low = fixture('low', { cycle: ['- auto-cycle: on cap 10 tier 1000'] })
bridge('sess-l'); write(low.transcript, lines(entry(10000)))
const floor = 10000 + HANDOFF_COST_TOKENS
const la = run(low, 'sess-l')
fs.appendFileSync(low.transcript, lines(entry(floor - 1)))
const lb = run(low, 'sess-l')
fs.appendFileSync(low.transcript, lines(entry(floor + 1)))
const lc = run(low, 'sess-l')
clause('clause 2m — a tier below the floor: the named error, no warning under the floor, the warning above it, the warned line naming the floor (E8-D11)',
  la.ctx.includes(`tier 1000 below the floor ${floor}, raised to the floor`) && !isWarning(la) && !isWarning(lb) && isWarning(lc) &&
  lc.ctx.includes(`tier 1000 below the floor ${floor}`) && warnedLines(low)[0] === `- auto-cycle: warned sess-l ${floor}`,
  `${la.out} | ${lb.out} | ${lc.out}`)
const lowEq = fixture('low-eq', { cycle: ['- auto-cycle: on cap 10 tier 1000'] })
bridge('sess-le'); write(lowEq.transcript, lines(entry(10000)))
const lea = run(lowEq, 'sess-le')
fs.appendFileSync(lowEq.transcript, lines(entry(floor - 1)))
const leb = run(lowEq, 'sess-le')
fs.appendFileSync(lowEq.transcript, lines(entry(floor)))
const lec = run(lowEq, 'sess-le')
clause('clause 2m2 — a tier below the floor, a reading exactly at the floor: the warning fires at it, one below it does not (E8-D11)',
  !isWarning(lea) && !isWarning(leb) && isWarning(lec) && lec.ctx.includes(`${floor} tokens`) && warnedLines(lowEq)[0] === `- auto-cycle: warned sess-le ${floor}`,
  `${lea.out} | ${leb.out} | ${lec.out}`)
const nob = fixture('no-bridge', { cycle: ['- auto-cycle: on cap 10 tier 120000'] })
write(nob.transcript, lines(entry(10000)))
const na = run(nob, 'sess-nb')
fs.appendFileSync(nob.transcript, lines(entry(130000)))
const nb2 = run(nob, 'sess-nb')
const pct = fixture('pct-no-bridge', { cycle: ['- auto-cycle: on cap 10 tier 60%'] })
write(pct.transcript, lines(entry(190000)))
const pa = run(pct, 'sess-pnb')
clause('clause 2n — no bridge file: window unknown on every batch; a token tier still warns, a percent tier never does (SC3)',
  na.ctx.includes('window unknown') && nb2.ctx.includes('window unknown') && isWarning(nb2) && pa.ctx.includes('window unknown') && !isWarning(pa),
  `${na.out} | ${nb2.out} | ${pa.out}`)
const oth = fixture('other-bridge', { cycle: ['- auto-cycle: on cap 10 tier 60%'] })
bridge('sess-o', W, 'sess-someone-else'); write(oth.transcript, lines(entry(10000)))
const oa = run(oth, 'sess-o')
clause('clause 2o — a bridge file whose session_id is another session\'s is ignored: window unknown (E8-D23)',
  oa.ctx.includes('window unknown'), oa.out)

// SC9: a record the gauge cannot append to is a fact, and the warning still goes out.
const ro = fixture('record-ro')
bridge('sess-ro'); write(ro.transcript, lines(entry(10000)))
run(ro, 'sess-ro')
fs.appendFileSync(ro.transcript, lines(user(), entry(130000)))
fs.chmodSync(ro.recordAbs, 0o444)
let roBlocked = false
try { fs.accessSync(ro.recordAbs, fs.constants.W_OK) } catch { roBlocked = true }
const rob = run(ro, 'sess-ro')
fs.chmodSync(ro.recordAbs, 0o644)
clause('clause 2q — a record that cannot be appended to: the warning still goes out and a fact names the failure (SC9)',
  roBlocked && isWarning(rob) && /warned line could not be appended to .+ \(EACCES\)/.test(rob.ctx) && warnedLines(ro).length === 0,
  `blocked ${roBlocked} out ${rob.out} err ${rob.err}`)

// E8-D4: the record's own warned line for this session holds when the latch write failed.
const lro = fixture('latch-ro')
bridge('sess-lro'); write(lro.transcript, lines(entry(10000)))
run(lro, 'sess-lro')
fs.chmodSync(stateDir('sess-lro'), 0o555)
let lroBlocked = false
try { fs.writeFileSync(path.join(stateDir('sess-lro'), 'probe'), 'x') } catch { lroBlocked = true }
fs.appendFileSync(lro.transcript, lines(user(), entry(130000)))
const lrb = run(lro, 'sess-lro')
const lroLatch = latchOf('sess-lro')
fs.appendFileSync(lro.transcript, lines(user(), entry(140000)))
const lrc = run(lro, 'sess-lro')
fs.chmodSync(stateDir('sess-lro'), 0o755)
clause('clause 2r — a latch write that failed: the next batch past the tier reads the record\'s warned line, so no second warning and no second line (E8-D4)',
  lroBlocked && isWarning(lrb) && /latch .+ could not be written/.test(lrb.ctx) && lroLatch?.warned === false &&
  !isWarning(lrc) && warnedLines(lro).length === 1,
  `blocked ${lroBlocked} latch ${JSON.stringify(lroLatch)} b ${lrb.out} c ${lrc.out} lines ${JSON.stringify(warnedLines(lro))}`)

// E8-D10: one tool-result entry larger than the first read chunk after the last usage entry.
const big = fixture('big-tail')
bridge('sess-big'); write(big.transcript, lines(entry(10000)))
run(big, 'sess-big')
const BIG_RESULT = JSON.stringify({ type: 'user', uuid: 'big', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', content: 'x'.repeat(600 * 1024) }] } })
fs.appendFileSync(big.transcript, lines(user(), entry(130000, { uuid: 'before-big' }), BIG_RESULT))
const bgb = run(big, 'sess-big')
clause('clause 2s — a 600 KB tool result after the last usage entry: the entry is still read and the crossing warns (E8-D10)',
  isWarning(bgb) && bgb.ctx.includes('130000') && latchOf('sess-big')?.lastUuid === 'before-big', `out ${bgb.out.slice(0, 400)} err ${bgb.err}`)

const huge = fixture('huge-tail', { cycle: ['- auto-cycle: on cap 10 tier 120000'] })
bridge('sess-huge'); write(huge.transcript, lines(entry(10000)))
run(huge, 'sess-huge')
const HUGE_RESULT = JSON.stringify({ type: 'user', uuid: 'huge', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', content: 'y'.repeat(2200 * 1024) }] } })
fs.appendFileSync(huge.transcript, lines(user(), entry(130000, { uuid: 'before-huge' }), HUGE_RESULT))
const hgb = run(huge, 'sess-huge')
clause('clause 2s2 — a tool result past the second chunk after the last usage entry: the whole file is read, the entry found and the crossing warns (E8-D10)',
  isWarning(hgb) && hgb.ctx.includes('130000') && latchOf('sess-huge')?.lastUuid === 'before-huge', `out ${hgb.out.slice(0, 400)} err ${hgb.err}`)

clause('clause 2p — the tripwire herdr on PATH never fired across every run (SC1)', !fs.existsSync(tripwire), 'the gauge exec\'d herdr')

// ---------------------------------------------------------------- clause 3: the fixtures carry it

const parsed = (t) => t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
const tot = (e) => e.message.usage.input_tokens + e.message.usage.cache_creation_input_tokens + e.message.usage.cache_read_input_tokens
clause('clause 3a — without the gauge: the repeated-usage entries share one usage, have distinct uuids, and summing them would triple it',
  (() => { const es = parsed(REPEAT).filter((e) => e?.type === 'assistant'); return es.length === 3 && new Set(es.map(tot)).size === 1 && new Set(es.map((e) => e.uuid)).size === 3 && tot(es[0]) === 50000 })(),
  'REPEAT is not three entries of one response')
clause('clause 3b — without the gauge: the API-error entry is last, flagged, with more usage than the real one; the zero and sidechain fixtures carry what they claim',
  (() => { const es = parsed(APIERR).filter((e) => e?.type === 'assistant'); const z = parsed(ZERO); const s = parsed(SIDE)
    return es.at(-1).isApiErrorMessage === true && tot(es.at(-1)) > tot(es[0]) && tot(es[0]) === 70000 && tot(z[1]) === 0 && !z[1].isApiErrorMessage && s[1].isSidechain === true && tot(s[1]) > tot(s[0]) })(),
  'an API-error, zero or sidechain fixture is not what its clause names')
clause('clause 3c — without the gauge: each truncated line fails to parse, and the truncated fixture holds no other assistant entry',
  parsed(TRUNC).at(-1) === null && parsed(TRUNC).filter((e) => e?.type === 'assistant').length === 0 && parsed(TRUNC_AFTER_GOOD).at(-1) === null,
  'a truncated fixture parses')
const lastOnOff = (f) => fs.readFileSync(f.recordAbs, 'utf8').split('\n').filter((l) => /^- auto-cycle: (on|off)\b/.test(l)).at(-1) || null
clause('clause 3d — without the gauge: the off fixture ends on off after an on line, the none fixture has no line, the others end on on',
  lastOnOff(off) === '- auto-cycle: off' && /auto-cycle: on/.test(fs.readFileSync(off.recordAbs, 'utf8')) && lastOnOff(none) === null &&
  [main, exited, unk, mal, hi, low].every((f) => /^- auto-cycle: on /.test(lastOnOff(f))) &&
  !fs.existsSync(path.join(noMem.proj, 'SESSION_MEMORY.md')) && /State: Exited/.test(fs.readFileSync(exited.recordAbs, 'utf8')),
  'a record fixture does not carry the auto-cycle or state line its clause relies on')
clause('clause 3e — without the gauge: the unknown fixture has no transcript, no-bridge has no bridge file, other-bridge names another session',
  !fs.existsSync(unk.transcript) && !fs.existsSync(bridgeFile('sess-nb')) &&
  JSON.parse(fs.readFileSync(bridgeFile('sess-o'), 'utf8')).session_id === 'sess-someone-else',
  'a fixture carries what it should lack')
const onTier = (f) => /^- auto-cycle: on cap \d+ tier (\S+)$/m.exec(fs.readFileSync(f.recordAbs, 'utf8'))?.[1]
const usages = (f) => parsed(fs.readFileSync(f.transcript, 'utf8')).filter((e) => e?.type === 'assistant' && e.message?.usage).map(tot)
clause('clause 3f — without the gauge: the floor fixtures\' on lines carry a token tier under their first reading plus the handoff cost, and their readings sit one under, one over and exactly at that floor',
  (() => { const [lu, eu] = [usages(low), usages(lowEq)]; const fl = lu[0] + HANDOFF_COST_TOKENS
    return onTier(low) === '1000' && onTier(lowEq) === '1000' && Number(onTier(low)) < fl && fl === floor && eu[0] === lu[0] &&
      JSON.stringify(lu) === JSON.stringify([lu[0], fl - 1, fl + 1]) && JSON.stringify(eu) === JSON.stringify([eu[0], fl - 1, fl]) })(),
  `low ${onTier(low)} ${JSON.stringify(usages(low))} low-eq ${onTier(lowEq)} ${JSON.stringify(usages(lowEq))}`)
clause('clause 3b2 — without the gauge: the zero-usage API-error fixture ends in an entry flagged isApiErrorMessage whose three input counts total zero, after a real one (E8-D10)',
  (() => { const es = parsed(APIERR0).filter((e) => e?.type === 'assistant'); return es.length === 2 && es[1].isApiErrorMessage === true && tot(es[1]) === 0 && tot(es[0]) === 70000 })(),
  'APIERR0 does not carry a zero-usage API-error entry after a real one')
clause('clause 3h — without the gauge: the big-tail transcript\'s last 512 KB holds no assistant entry with usage, and the whole file does',
  (() => { const buf = fs.readFileSync(big.transcript); const t = buf.subarray(buf.length - 512 * 1024).toString('utf8')
    const has = (x) => parsed(x).some((e) => e?.type === 'assistant' && e.message?.usage)
    return !has(t.slice(t.indexOf('\n') + 1)) && has(buf.toString('utf8')) })(),
  'the big-tail fixture does not push its last usage entry out of the first chunk')
clause('clause 3h2 — without the gauge: the huge-tail transcript\'s last 2 MB holds no assistant entry with usage, and the whole file does',
  (() => { const buf = fs.readFileSync(huge.transcript); const t = buf.subarray(buf.length - 2 * 1024 * 1024).toString('utf8')
    const has = (x) => parsed(x).some((e) => e?.type === 'assistant' && e.message?.usage)
    return !has(t.slice(t.indexOf('\n') + 1)) && has(buf.toString('utf8')) })(),
  'the huge-tail fixture does not push its last usage entry out of the second chunk')
clause('clause 3g — without the gauge: bridgeFile is the session\'s state dir plus bridge.json (SC6)',
  bridgeFile('sess-x') === path.join(stateDir('sess-x'), 'bridge.json'), bridgeFile('sess-x'))

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
