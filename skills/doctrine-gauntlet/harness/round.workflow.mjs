// One fused-gate gauntlet round as a Workflow script: structure and counters only.
// Every prompt arrives assembled in `args` (see workflow.md). Pure-gauntlet counters are
// not encoded.
//
// args = {
//   sections: [{ name, builderPrompt, criticPrompt, priorNotes? }],   // critic prompts per the critic brief,
//                                        // each stating it is a step-6 section review
//   floorPrompt,                         // an agent runs the floor (and every documented
//                                        // gate) and returns the report; '' blocks, it is not a skip
//   blindPrompt,                         // the blind comparison pass; '' on a no-reference run
//   candidateIs: 'A',                    // which neutral filename is the build
//   inherited: [],                       // failures step 7 rules inherited; recorded, not blocking
//   waived: [],                          // reasons the user has waived; recorded, not blocking
//   criticPrompt,                        // the integrated critic, assembled from the critic brief
//   criticAxes: [...],                   // the roll-call set the dispatcher fixed for it; the
//                                        // floor's [JUDGE]/[UNMEASURED] lines are added by the script
//   redTeamPrompt,                       // assembled from the red team brief
//   redTeamItems: [1, 2, 3, 4],
//   tieIsPass: false,                    // fidelity runs score a tie as a pass
//   counters: { cleanPasses, unresolvedRounds, sectionRejections: { [name]: n }, sectionResets: { [name]: n } },
// }
// Returns the round's structured results and the counters after this round. The
// orchestrator writes them to the ledger's run-state block, does the blast-radius check
// and the user escalations, and calls the next round (or resumes this one by run id).

export const meta = {
  name: 'gauntlet-round',
  description: 'One fused-gate gauntlet round: section pairs, floor, blind pass, integrated critic, red team, counters',
  phases: [
    { title: 'Sections', detail: 'one builder/critic pair per section, up to three rejections' },
    { title: 'Integrate', detail: 'floor and documented gates, then the blind comparison' },
    { title: 'Gate', detail: 'integrated critic and red team, roll calls counted' },
  ],
}

const WORDS = { critic: ['CLEAR', 'BLOCKING', 'CANNOT JUDGE'], redTeam: ['BROKE', 'HELD', 'NOT RUN'] }

const SECTION_CRITIC = {
  type: 'object',
  properties: {
    accept: { type: 'boolean' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['accept', 'notes'],
}
const FLOOR = {
  type: 'object',
  properties: {
    exitCode: { type: 'integer' },
    report: { type: 'string' },
    unmeasured: { type: 'array', items: { type: 'string' } },
    failedGates: { type: 'array', items: { type: 'string' } },
  },
  required: ['exitCode', 'report', 'unmeasured', 'failedGates'],
}
const BLIND = {
  type: 'object',
  properties: { winner: { type: 'string', enum: ['A', 'B', 'tie'] }, why: { type: 'string' } },
  required: ['winner', 'why'],
}
const AXIS_FINDING = { type: 'object', properties: { axis: { type: 'string' }, finding: { type: 'string' } }, required: ['axis', 'finding'] }
const CRITIC = {
  type: 'object',
  properties: {
    rollCall: { type: 'array', items: { type: 'object', properties: { axis: { type: 'string' }, word: { type: 'string' }, line: { type: 'string' } }, required: ['axis', 'word'] } },
    blocking: { type: 'array', items: AXIS_FINDING },
    polish: { type: 'array', items: { type: 'string' } },
    recorded: { type: 'array', items: AXIS_FINDING },
  },
  required: ['rollCall', 'blocking', 'polish', 'recorded'],
}
const ITEM_FINDING = { type: 'object', properties: { item: { type: 'integer' }, finding: { type: 'string' } }, required: ['item', 'finding'] }
const RED_TEAM = {
  type: 'object',
  properties: {
    rollCall: { type: 'array', items: { type: 'object', properties: { item: { type: 'integer' }, word: { type: 'string' }, line: { type: 'string' } }, required: ['item', 'word', 'line'] } },
    blocking: { type: 'array', items: ITEM_FINDING },
    polish: { type: 'array', items: ITEM_FINDING },
    recorded: { type: 'array', items: ITEM_FINDING },
    attackList: { type: 'array', items: { type: 'string' } },
  },
  required: ['rollCall', 'blocking', 'polish', 'recorded', 'attackList'],
}

const a = args || {}
const ITEMS = a.redTeamItems || [1, 2, 3, 4]
const INHERITED = a.inherited || []
const WAIVED = a.waived || []
const counters = { cleanPasses: 0, unresolvedRounds: 0, sectionRejections: {}, sectionResets: {}, ...(a.counters || {}) }
const blocking = []   // every reason this round is not clean, as a string the orchestrator can read
const recorded = []   // reasons that would block but the user ruled inherited or waived; named, never silent
const usedRulings = new Map()   // ruling -> how many distinct reasons it excused

// A reason blocks unless the user already ruled it inherited (step 7) or waived it; either
// way it is written down, because a recorded failure that nobody can see is a silent pass.
// A ruling matches by containment, because the same fact reaches here under more than one
// name — an [UNMEASURED] item's text, and the full report line that became a critic axis.
function match(names, rulings) {
  return rulings.find((r) => r.trim() && names.some((n) => n.includes(r.trim())))
}
function block(reason, names) {
  const named = names || [reason]
  const inh = match(named, INHERITED)
  const wav = inh ? null : match(named, WAIVED)
  const ruled = inh ? 'inherited' : wav ? 'waived' : null
  if (ruled) {
    const r = inh || wav
    usedRulings.set(r, (usedRulings.get(r) || 0) + 1)
    recorded.push(`${ruled}: ${reason}`)
  } else blocking.push(reason)
}
// The other kind. A return that is internally malformed, a reviewer contradicting its own
// vocabulary, or a dead agent — none of which a ruling may touch. `block()` is for defects in
// the *work*, and `inherited`/`waived` excuse those; this is for defects in the *report*, and
// the user rules on the page, never on whether a report is well-formed. Two names rather than
// one so the choice is visible at every call site, and greppable: a check whose reason quotes a
// reviewer's finding text is otherwise excused by a ruling that happens to appear inside the
// very finding it caught, which was observed. A `NOT RUN` and a `CANNOT JUDGE` are the two
// abstentions and stay on `block()`: evidence failing to reach a reviewer IS a fact about the
// run that a user may rule on. Abstaining *and filing a finding anyway* is not.
function malformed(reason) { blocking.push(reason) }
// A finding whose text is empty is not a finding. Both briefs say the carrying words carry
// their finding *below*, so an empty string satisfies the schema and satisfies nothing else:
// a `BLOCKING` or `BROKE` with an empty finding under it was observed reaching cleanPasses 2
// with exit true on a waived axis, because the roll-call reason and the finding reason are
// both waivable and the shape check saw an object and called it filed.
const said = (f) => !!(f && (f.finding || '').trim())

// One line per axis or item the dispatcher fixed; a missing line, a duplicate, a line for
// nothing the dispatcher named, or a word outside the vocabulary, blocks. Returns the map.
function checkRollCall(rollCall, expected, words, key, who) {
  const seen = new Map()
  for (const r of rollCall) {
    if (seen.has(r[key])) malformed(`${who} roll call: ${key} ${r[key]} appears twice — which line counts is a reading, not a count`)
    else if (!expected.includes(r[key])) malformed(`${who} roll call: ${key} "${r[key]}" is nothing the dispatcher named`)
    else seen.set(r[key], r)
  }
  for (const k of expected) {
    const r = seen.get(k)
    if (!r) malformed(`${who} roll call: ${key} missing — ${k} (nobody ran it)`)
    else if (!words.includes(r.word)) malformed(`${who} roll call: ${k} carries "${r.word}", not a word of the vocabulary`)
  }
  return seen
}

if (!(a.criticAxes || []).length) malformed('critic axes: none named — a roll call against an empty set counts nothing')
if (!ITEMS.length) malformed('red team items: none named — a roll call against an empty set counts nothing')

// ---- Sections: builder then critic, three rejections put it to the user. The tool cannot keep
// one critic alive across retries, so each retry's critic is handed every earlier rejection. ----
phase('Sections')
const deadlocked = []
const sections = await pipeline(a.sections || [], async (s) => {
  let rejections = counters.sectionRejections[s.name] || 0
  let notes = []
  const history = (s.priorNotes || []).map((h) => h.slice())   // prior rounds' rejections you pass in,
  // then every rejection this round — handed to each retry's critic in place of memory
  let work = null
  let dead = false
  while (true) {
    const buildPrompt = notes.length ? `${s.builderPrompt}\n\nThe section critic rejected the previous attempt with these notes; address every one:\n- ${notes.join('\n- ')}` : s.builderPrompt
    work = await agent(buildPrompt, { label: `build:${s.name}`, phase: 'Sections' })
    if (!work) { malformed(`section ${s.name}: builder returned nothing`); dead = true; break }
    const priors = history.length ? `\n\nYou are the same critic across retries; your earlier rejections of this section, oldest first, which the builder was told to address:\n${history.map((h, n) => `Rejection ${n + 1}:\n- ${h.join('\n- ')}`).join('\n')}` : ''
    const verdict = await agent(`${s.criticPrompt}${priors}\n\nThe builder's return:\n${work}`, { label: `critic:${s.name}`, phase: 'Sections', schema: SECTION_CRITIC })
    if (!verdict) { malformed(`section ${s.name}: critic returned nothing`); dead = true; break }
    if (verdict.accept) { notes = verdict.notes; break }   // an accept can carry notes; they go to the docket, not the floor
    rejections += 1
    counters.sectionRejections[s.name] = rejections
    notes = verdict.notes
    history.push(verdict.notes)
    if (rejections >= 3) { deadlocked.push({ name: s.name, notes, resets: counters.sectionResets[s.name] || 0 }); break }
  }
  return { name: s.name, work, rejections, notes, dead }
})
// A round that rebuilt any section is a diff after the last clean pass, so the count restarts
// here — before the deadlock return can carry a stale count out — and two clean passes must
// both be over the work as it now stands.
if ((a.sections || []).length) counters.cleanPasses = 0
// A dead builder or critic means that section never passed, and the gate begins only after
// every section passes — so a dead pair returns pre-gate exactly as a deadlock does.
if (deadlocked.length || sections.some((s) => s && s.dead)) {
  // The pair is deadlocked; the round counters never see section loops, so this goes to the
  // user before any gate runs. A section already reset once by the user is deadlocked again,
  // and the counter says so: the user rules once, not every three rounds.
  for (const d of deadlocked) malformed(`section deadlock — ${d.name}${d.resets ? ` (already reset ${d.resets} time(s) by the user — terminal without a new ruling)` : ''} — put it to the user before any gate runs`)
  return { clean: false, exit: false, valve: false, counters, blocking, recorded, sections, floor: null, blind: null, critic: null, redTeam: null, deadlocked }
}

// ---- Integrate: the floor and every documented gate, then the blind pass ----
phase('Integrate')
let floor = null
const floorLines = []   // every [JUDGE] and [UNMEASURED] line becomes an axis the critic must answer
if (!a.floorPrompt) block('floor: not run — a gate you did not run is not a clean gate', ['floor'])
else {
  floor = await agent(a.floorPrompt, { label: 'floor', phase: 'Integrate', schema: FLOOR })
  if (!floor) malformed('floor: no report returned — a gate you did not run is not a clean gate')
  else {
    for (const line of floor.report.split('\n')) if (/\[(JUDGE|UNMEASURED)\]/.test(line)) floorLines.push(line.trim())
    for (const u of floor.unmeasured) {
      if (!u.trim()) { malformed('floor: returned an empty unmeasured entry — nothing a waiver can name'); continue }
      block(`floor: [UNMEASURED] ${u} — blocks until the user waives it`, [u])
    }
    // The report is the instrument's word; an [UNMEASURED] line the agent left out of its array is
    // still unmeasured, and a critic's CLEAR on it is a judgment on a thing nobody measured.
    for (const line of floorLines) if (line.includes('[UNMEASURED]') && !floor.unmeasured.some((u) => u.trim() && line.includes(u.trim()))) malformed(`floor: report carries "${line}" but the return's unmeasured list does not — unmeasured is not clean`)
    for (const g of floor.failedGates) block(`native check failed: ${g}`, [g])
    if (floor.exitCode !== 0 && !floor.unmeasured.length && !floor.failedGates.length) malformed(`floor: exit ${floor.exitCode} with no failed gate and no unmeasured item named — an exit nobody explained`)
  }
}
let blind = null
if (!a.blindPrompt) recorded.push('blind pass not dispatched (not a failure) — no reference this round, per The comparison')
else if (a.candidateIs !== 'A' && a.candidateIs !== 'B') {
  // A verdict nobody can read is not worth dispatching for; one block, not a spurious loss on top.
  malformed('blind pass: candidateIs must be A or B — without it the verdict cannot be read')
} else {
  blind = await agent(a.blindPrompt, { label: 'blind-pass', phase: 'Integrate', schema: BLIND })
  if (!blind) malformed('blind pass: no verdict returned')
  else if (blind.winner === 'tie' ? !a.tieIsPass : blind.winner !== a.candidateIs) block(`blind pass: candidate lost (${blind.winner})`, ['blind pass'])
}

// ---- Gate: integrated critic and red team, both read off their roll calls ----
phase('Gate')
const criticAxes = [...(a.criticAxes || []), ...floorLines]
const criticPrompt = floor
  ? `${a.criticPrompt}\n\nItem 1 — this round's floor report, every line of it:\n${floor.report}\n\nYour roll call answers every axis you were told to and, in addition, each of these floor lines as its own axis, quoted exactly:\n- ${floorLines.join('\n- ') || '(none)'}`
  : a.criticPrompt
const critic = await agent(criticPrompt, { label: 'integrated-critic', phase: 'Gate', schema: CRITIC })
if (!critic) malformed('integrated critic: no return')
else {
  const seen = checkRollCall(critic.rollCall, criticAxes, WORDS.critic, 'axis', 'critic')
  for (const axis of criticAxes) {
    const r = seen.get(axis)
    if (!r || !WORDS.critic.includes(r.word)) continue
    // Item 8: a CANNOT JUDGE names what was missing — it is cleared by handing that over,
    // and a line naming nothing forces the orchestrator to ask again, which the law forbids.
    if (r.word === 'CANNOT JUDGE' && !(r.line || '').trim()) { malformed(`critic roll call: ${axis} CANNOT JUDGE naming nothing missing — cleared by re-dispatch with a named lack`); continue }
    // Item 8's own vocabulary, enforced the way item 5's is on the red team: a `CLEAR` is
    // "an axis you ran and found nothing on", so a finding filed under one contradicts the
    // word, and a `BLOCKING` "carries its finding below", so one with nothing below it never
    // filed what it found. These three are defects in the *return*, not in the work, so they
    // are pushed straight to `blocking` and cannot be waived. That is not decoration: `block()`
    // matches a ruling by containment against the reason text. These three quote the **axis**,
    // and the axis is exactly what a ruling names, so routing them through it lets a ruling on
    // an axis excuse the check that caught the critic contradicting itself about that axis; the
    // unnamed-axis check below quotes the **finding**, and was observed being excused by an
    // `inherited` word inside the very finding it caught. Different text, same hole. The user
    // rules on the work, never on whether a reviewer's return is well-formed.
    // A `CLEAR` carrying a **polish** note is deliberately not here: `polish` is untagged
    // strings by schema, and the red team this mirrors counts polish as satisfying a `BROKE`
    // (below) and never blocks a `HELD` that has one. Blocking it would reject honest work.
    if (r.word === 'CLEAR' && critic.blocking.some((b) => b.axis === axis && said(b))) malformed(`critic roll call: ${axis} CLEAR with a blocking finding under it — a CLEAR is an axis you found nothing on`)
    if (r.word === 'CLEAR' && critic.recorded.some((c) => c.axis === axis && said(c))) malformed(`critic roll call: ${axis} CLEAR with a recorded finding under it — recorded is where a non-CLEAR goes`)
    if (r.word === 'BLOCKING' && !critic.blocking.some((b) => b.axis === axis && said(b)) && !critic.recorded.some((c) => c.axis === axis && said(c))) malformed(`critic roll call: ${axis} BLOCKING with no finding under it — a BLOCKING carries its finding below`)
    // Item 8: a `CANNOT JUDGE` is "an axis whose evidence never reached you". Evidence that
    // never arrived cannot have produced a finding, so a finding filed under one contradicts
    // the word. This check is **not** redundant with the non-`CLEAR` block below, and the
    // argument that it was is the one this fixed: that block is waivable, so on an axis the
    // user ruled inherited or waived BOTH the abstention and the finding are recorded, the
    // round comes back clean, and a phase can exit on a critic that abstained and filed a
    // defect on the same axis. Observed at cleanPasses 2 with exit true before this line.
    if (r.word === 'CANNOT JUDGE' && (critic.blocking.some((b) => b.axis === axis && said(b)) || critic.recorded.some((c) => c.axis === axis && said(c)))) malformed(`critic roll call: ${axis} CANNOT JUDGE with a finding under it — evidence that never reached you cannot have produced one`)
    if (r.word !== 'CLEAR') block(`critic roll call: ${axis} ${r.word}${(r.line || '').trim() ? ` — ${r.line.trim()}` : ''}`, [axis])
  }
  for (const f of [...critic.blocking, ...critic.recorded]) if (!said(f)) malformed(`critic: a finding on ${f.axis} carries no text — the word carries its finding below`)
  for (const b of critic.blocking) {
    if (!criticAxes.includes(b.axis)) malformed(`critic finding names no axis: ${b.finding}`)
    else block(`critic: ${b.axis} — ${b.finding}`, [b.axis])
  }
  // Step 7's inherited failures are recorded, named as inherited, and do not block — the
  // same per-finding rule as the red team's recorded list, checked against the same list.
  for (const r of critic.recorded) {
    // The axis test comes first and short-circuits, and both halves of that matter. A finding on
    // an axis nobody named must not *also* be filed as a legitimate inherited record, and must not
    // consume the ruling that would have excused it — run as a second pass this check blocked the
    // round and left both of those behind anyway, which is the defect it exists to prevent. Its
    // sentence differs from the `critic.blocking` check above on purpose: that one is waivable,
    // this one is not, and two identical strings with opposite waivability cannot be read apart
    // in the return.
    if (!criticAxes.includes(r.axis)) { malformed(`critic recorded finding names no axis: ${r.finding}`); continue }
    const named = match([r.finding], INHERITED)
    if (!named) malformed(`critic: recorded finding names no inherited failure of this dispatch — ${r.axis}: ${r.finding}`)
    else {
      usedRulings.set(named, (usedRulings.get(named) || 0) + 1)
      recorded.push(`critic, inherited per its prompt: ${r.axis} — ${r.finding}`)
    }
  }
}
const redTeamPrompt = critic
  ? `${a.redTeamPrompt}\n\nThe integrated critic's report this round, which item 1 attacks:\n${JSON.stringify(critic, null, 2)}`
  : a.redTeamPrompt
const redTeam = await agent(redTeamPrompt, { label: 'red-team', phase: 'Gate', schema: RED_TEAM })
if (!redTeam) malformed('red team: no return')
else {
  const seen = checkRollCall(redTeam.rollCall, ITEMS, WORDS.redTeam, 'item', 'red team')
  // A recorded finding exists only where the prompt named its failure inherited, and the prompt's
  // inherited lines are exactly `inherited` — so each recorded finding must name one of them,
  // checked by the same containment rule; anything else is a defect parked where the counters
  // cannot see it.
  for (const r of redTeam.recorded) {
    const named = match([r.finding], INHERITED)
    if (!named) malformed(`red team: recorded finding names no inherited failure of this dispatch — item ${r.item}: ${r.finding}`)
    else {
      usedRulings.set(named, (usedRulings.get(named) || 0) + 1)
      recorded.push(`red team, inherited per its prompt: item ${r.item} — ${r.finding}`)
    }
  }
  for (const item of ITEMS) {
    const r = seen.get(item)
    if (!r || !WORDS.redTeam.includes(r.word)) continue
    if (r.word === 'NOT RUN') block(`red team roll call: item ${item} NOT RUN — ${(r.line || '').trim() || '(no line)'} — blocks until handed over and re-run, or the user waives it`, [`red team item ${item}`])
    // Whether a HELD names its object, defect and evidence is the orchestrator's read of the
    // line; the script can only see that a line was written at all.
    if (r.word === 'HELD' && (r.line || '').trim() === '') malformed(`red team roll call: item ${item} HELD with an empty line`)
    const filed = redTeam.blocking.some((b) => b.item === item && said(b))
    if (r.word === 'BROKE' && !filed && !redTeam.polish.some((p) => p.item === item && said(p)) && !redTeam.recorded.some((p) => p.item === item && said(p))) malformed(`red team roll call: item ${item} BROKE with no finding under it`)
    if (r.word === 'HELD' && filed) malformed(`red team roll call: item ${item} HELD with a blocking finding under it`)
    if (r.word === 'HELD' && redTeam.recorded.some((p) => p.item === item && said(p))) malformed(`red team roll call: item ${item} HELD with a recorded finding under it — recorded is where a BROKE goes`)
    // **No `NOT RUN`-with-a-finding check here, and that is ruled, not an omission.** The
    // critic's `CANNOT JUDGE` equivalent above looks like it should mirror onto this loop and
    // must not: item 5 says that where only part of an item's evidence arrived the word is
    // still `NOT RUN`, the reviewer runs what the partial evidence allows, and "a finding under
    // a `NOT RUN` names the partial evidence it was run against". Item 8 gives the critic no
    // such exception. A check here would reject the shape the brief prescribes. This was added
    // as a mirror, shipped, and caught by a red team reading item 5 — see do-not-merge.md.
  }
  for (const f of [...redTeam.blocking, ...redTeam.polish, ...redTeam.recorded]) if (!said(f)) malformed(`red team: a finding on item ${f.item} carries no text — the word carries its finding below`)
  for (const b of redTeam.blocking) {
    if (!ITEMS.includes(b.item)) malformed(`red team finding names no item: ${b.finding}`)
    else block(`red team: item ${b.item} — ${b.finding}`, [`red team item ${b.item}`])
  }
  for (const p of [...redTeam.polish, ...redTeam.recorded]) if (!ITEMS.includes(p.item)) malformed(`red team finding names no item: ${p.finding}`)
  if (!redTeam.blocking.length && !redTeam.polish.length && !redTeam.recorded.length && !redTeam.attackList.length) malformed('red team: no findings and no attack list — it has reported nothing')
}

// A ruling that matched nothing is a typo or a stale line the user believes took; one that
// matched several distinct reasons may have excused a failure nobody meant it to. Neither
// line is itself a failure — both are the script refusing to be quiet about a ruling.
for (const r of [...INHERITED, ...WAIVED]) {
  const n = usedRulings.get(r) || 0
  if (n === 0) recorded.push(`unused ruling (not a failure): "${r}" matched nothing this round — a fixed defect, or a spelling that matches nothing the script names`)
  if (n > 1) recorded.push(`broad ruling (not a failure — check it): "${r}" excused ${n} reasons this round, listed above — if any was not meant, re-run without it`)
}

// ---- Counters, per the table in Modes (fused) ----
const clean = blocking.length === 0
if (clean) counters.cleanPasses += 1
else { counters.cleanPasses = 0; counters.unresolvedRounds += 1 }
const exit = counters.cleanPasses >= 2
const valve = !clean && counters.unresolvedRounds % 4 === 0
log(`round ${clean ? 'clean' : 'not clean'} — clean passes ${counters.cleanPasses}, unresolved rounds ${counters.unresolvedRounds}, recorded ${recorded.length}${exit ? ' — phase exits' : ''}${valve ? ' — VALVE: stop and ask the user' : ''}`)

return { clean, exit, valve, counters, blocking, recorded, sections, floor, blind, critic, redTeam, deadlocked }
