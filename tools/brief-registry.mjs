// A gate tying each rule the gauntlet round enforces to the brief that tells the judged seat about it.
//
//   node tools/brief-registry.mjs              # exit 0 clean, 1 on any finding
//   node tools/brief-registry.mjs --selftest   # its three-clause tamper test, exit 2 if the sidecar is missing
//
// `skills/doctrine-gauntlet/harness/round.workflow.mjs` files every reason a round is not clean
// through `malformed()` (a defect in a report, unwaivable) or `block()` (a defect in the work,
// waivable). A seat can only obey a rule its prompt states, and the script holds no brief text, so a
// rule the script enforces and no brief states is a block nobody was told to avoid. The registry
// below gives each call site a row: a stem, a literal substring of the call's own text that picks
// out its message template; the seat whose report or call it judges; and an anchor, a phrase that
// must occur exactly once in the text that reaches that seat.
//
// The texts, each located by a heading and an item or row opening, never by a line number:
//   critic        SKILL.md, The critic brief, item 8; and the Fused gate bullet under Modes
//   redTeam       SKILL.md, The red team brief, items 1 and 5; and the Fused gate bullet
//   orchestrator  workflow.md, the `args` table under On Codex and the paragraph after it
// Section critics share item 8, so a site judging both critics is one `critic` row. A site judging
// both reviewers (the shared roll-call and recorded-finding checks) carries one row per seat. An
// `excluded` row is a site no seat decides, a dead agent or a counter firing, and carries its reason.
//
// A row whose anchor is null is a rule no text states: it stays a finding until a brief states it.
//
// FINDINGS: a call site with no row; a row with no anchor; a row whose stem matches no call site or more than one; an
// anchor that does not occur exactly once in its seat's text; a target text that cannot be found;
// an excluded row with no reason; a row naming a seat that does not exist.
//
// WHAT IT DOES NOT CATCH:
//   - Meaning. It matches phrases. An anchor that occurs once passes even where the same brief
//     contradicts it elsewhere, words it so a seat would misread it, or no longer says what the
//     call site enforces. Choosing an anchor that states the rule is a reviewer's job; this only
//     keeps the chosen phrase from silently disappearing or forking.
//   - Whether the row's seat is the right one. A row mapped to the wrong seat passes.
//   - Whether a seat's prompt is assembled from these texts. That is workflow.md's and the
//     orchestrator's; this reads the source texts, not any assembled prompt.
//   - Rules the script enforces without either function: a schema the host rejects, an early
//     return, a counter. Only `malformed(` and `block(` call sites are read.
//   - Call sites it cannot see as text. It strips a `//` comment that follows whitespace on each
//     line, reads the name then optional whitespace and line breaks then `(`, and skips the two
//     function declarations. A call written through another name, through a block comment between
//     the name and its paren, or a template string carrying ` //`, is misread.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GAUNTLET = path.join(HERE, '..', 'skills', 'doctrine-gauntlet')

/** Where each text lives: the file key in the repo object, the `## ` heading of its section, and
 *  the opening its paragraph starts with (a `start` row starts the text and runs to the section end). */
export const TARGETS = {
  critic8: { file: 'skill', heading: '## The critic brief', opening: '8. **Return**' },
  redTeam1: { file: 'skill', heading: '## The red team brief', opening: '1. **Attack what this round PASSED.**' },
  redTeam5: { file: 'skill', heading: '## The red team brief', opening: '5. **Try to kill the round' },
  fused: { file: 'skill', heading: '## Modes', opening: '- **Fused gate**' },
  args: { file: 'workflow', heading: '## On Codex', opening: '| key | what it is |', start: true },
}
/** The texts that reach each seat. */
export const SEATS = {
  critic: ['critic8', 'fused'],
  redTeam: ['redTeam1', 'redTeam5', 'fused'],
  orchestrator: ['args'],
}

const DEAD = 'a dead agent: the seat returned nothing, so no report exists to break a rule a brief could state'
export const REGISTRY = [
  // Orchestrator: the arguments it passes.
  { stem: '${label}: present but not an array', seat: 'orchestrator', anchor: 'A truthy non-array files a blocking finding' },
  { stem: 'round alarm: present but not a positive integer', seat: 'orchestrator', anchor: 'a value that is not a positive integer is a miscall' },
  { stem: 'critic axes: none named', seat: 'orchestrator', anchor: 'an empty `criticAxes` blocks too' },
  { stem: 'red team items: none named', seat: 'orchestrator', anchor: 'an empty `redTeamItems` blocks' },
  { stem: 'sections: missing or not an array', seat: 'orchestrator', anchor: 'Omitting the key is a miscall, not a way to ask for that round, and it blocks' },
  { stem: "block('floor: not run", seat: 'orchestrator', anchor: '`\'\'` is not a skip — the round blocks on a floor nobody ran' },
  { stem: 'blind pass: candidateIs must be A or B', seat: 'orchestrator', anchor: '`\'A\'` or `\'B\'` — which neutral filename is the build' },
  // The floor and blind seats' returns, whose contract is the argument row the orchestrator writes their prompt from.
  { stem: 'floor: returned an empty unmeasured entry', seat: 'orchestrator', anchor: 'an empty `unmeasured` entry' },
  { stem: 'floor: [UNMEASURED] ${u}', seat: 'orchestrator', anchor: 'an `[UNMEASURED]` item\'s text, a critic axis' },
  { stem: 'but the return\'s unmeasured list does not', seat: 'orchestrator', anchor: 'a tagged line there re-enters the cross-check' },
  { stem: 'native check failed: ${g}', seat: 'orchestrator', anchor: 'a failed gate, unmeasured item' },
  { stem: 'floor: exit ${floor.exitCode} with no failed gate', seat: 'orchestrator', anchor: 'a nonzero exit with no failed gate and no unmeasured item named' },
  { stem: 'blind pass: candidate lost', seat: 'orchestrator', anchor: '`blind pass`, `red team item 3`' },
  // Shared by both reviewers.
  { stem: 'recorded finding names no inherited failure or marked-stale clause', seat: 'critic', anchor: 'whose cause is missing or numbers no inherited failure or marked-stale clause your prompt numbers' },
  { stem: 'recorded finding names no inherited failure or marked-stale clause', seat: 'redTeam', anchor: 'a recorded line whose cause is missing or numbers nothing your prompt numbers blocks' },
  { stem: 'appears twice', seat: 'critic', anchor: 'one line per axis you were told to answer' },
  { stem: 'appears twice', seat: 'redTeam', anchor: 'one line per item this brief numbers as an attack' },
  { stem: 'is nothing the dispatcher named', seat: 'critic', anchor: 'one line per axis you were told to answer' },
  { stem: 'is nothing the dispatcher named', seat: 'redTeam', anchor: 'one line per item this brief numbers as an attack' },
  { stem: '${key} missing — ${k} (nobody ran it)', seat: 'critic', anchor: 'an axis missing from the roll call altogether is itself blocking' },
  { stem: '${key} missing — ${k} (nobody ran it)', seat: 'redTeam', anchor: 'because a missing line is read as an attack nobody ran' },
  { stem: 'not a word of the vocabulary', seat: 'critic', anchor: 'and say the word — `CLEAR`, `BLOCKING`, or `CANNOT JUDGE`' },
  { stem: 'not a word of the vocabulary', seat: 'redTeam', anchor: 'and say the word: `BROKE`, `HELD`, or `NOT RUN`' },
  // Critic, integrated and section.
  { stem: 'CANNOT JUDGE naming nothing missing', seat: 'critic', anchor: 'a `CANNOT JUDGE` naming nothing missing' },
  { stem: 'CLEAR with a blocking finding under it', seat: 'critic', anchor: 'a `CLEAR` on an axis carrying a **blocking or recorded** finding' },
  { stem: 'CLEAR with a recorded finding under it', seat: 'critic', anchor: 'not `CLEAR`, which says you found nothing on an axis you just filed a finding against' },
  { stem: 'BLOCKING with no finding under it', seat: 'critic', anchor: 'a `BLOCKING` carrying no blocking or recorded finding' },
  { stem: 'CANNOT JUDGE with a finding under it', seat: 'critic', anchor: 'a `CANNOT JUDGE` beside a finding on that same axis' },
  { stem: 'block(`${who} roll call: ${axis} ${r.word}', seat: 'critic', anchor: 'it blocks exactly as an unmeasured floor item does' },
  { stem: '${who}: a finding on ${f.axis} carries no text', seat: 'critic', anchor: 'A finding with empty text, in the blocking or recorded list, is no finding and blocks' },
  { stem: '${who} finding names no axis', seat: 'critic', anchor: 'or a finding naming an axis nobody dispatched' },
  { stem: 'block(`${who}: ${b.axis} — ${b.finding}`', seat: 'critic', anchor: 'A **`BLOCKING`** carries its finding below' },
  { stem: '${who} recorded finding names no axis', seat: 'critic', anchor: 'or that names an axis nobody dispatched' },
  // Red team.
  { stem: 'item ${item} NOT RUN', seat: 'redTeam', anchor: 'A **`NOT RUN`** is an item none of whose evidence reached you' },
  { stem: 'item ${item} HELD with an empty line', seat: 'redTeam', anchor: 'a `HELD` missing any of the three reads downstream as a line nobody wrote' },
  { stem: 'item ${item} BROKE with no finding under it', seat: 'redTeam', anchor: 'a `BROKE` with no finding under it' },
  { stem: 'item ${item} HELD with a blocking finding under it', seat: 'redTeam', anchor: 'a blocking or recorded finding whose item you marked `HELD`' },
  { stem: 'item ${item} HELD with a recorded finding under it', seat: 'redTeam', anchor: 'a blocking or recorded finding whose item you marked `HELD`' },
  { stem: 'red team: a finding on item ${f.item} carries no text', seat: 'redTeam', anchor: 'An empty finding text under any word is no finding' },
  { stem: 'red team finding names no item: ${b.finding}', seat: 'redTeam', anchor: 'or a finding naming no item, reads the same way' },
  { stem: 'block(`red team: item ${b.item}', seat: 'redTeam', anchor: 'Blocking is the verdict that the work is unfinished' },
  { stem: 'red team finding names no item: ${p.finding}', seat: 'redTeam', anchor: 'every finding below names the item it belongs to' },
  { stem: 'red team: no findings and no attack list', seat: 'redTeam', anchor: 'An adversary that returns "no findings" with no attack list has reported nothing' },
  // No seat decides these.
  { stem: 'builder returned nothing', seat: 'excluded', reason: DEAD },
  { stem: 'critic returned nothing', seat: 'excluded', reason: DEAD },
  { stem: 'floor: no report returned', seat: 'excluded', reason: DEAD },
  { stem: 'blind pass: no verdict returned', seat: 'excluded', reason: DEAD },
  { stem: 'integrated critic: no return', seat: 'excluded', reason: DEAD },
  { stem: 'red team: no return', seat: 'excluded', reason: DEAD },
  { stem: 'section deadlock', seat: 'excluded', reason: 'a counter firing: three rejections of one section, which no seat decides and no report carries' },
]

/** Every `malformed(` and `block(` call in the runner, whitespace and line breaks before the paren
 *  included, at the line the name is on. Its text runs from the call to the next call or the end of
 *  the line the paren is on, with the gap before the paren closed so a stem reads either form.
 *  Comments and the two declarations are skipped. */
export function callSites(src) {
  const code = src.split('\n').map((raw) => raw.replace(/(^|\s)\/\/.*$/, '')).join('\n')
  const calls = [...code.matchAll(/\b(malformed|block)\s*\(/g)].filter((m) => !/function\s+$/.test(code.slice(0, m.index)))
  return calls.map((m, k) => {
    const open = m.index + m[0].length
    const eol = code.indexOf('\n', open)
    const end = Math.min(eol < 0 ? code.length : eol, k + 1 < calls.length ? calls[k + 1].index : code.length)
    return { line: code.slice(0, m.index).split('\n').length, text: `${m[1]}(${code.slice(open, end)}` }
  })
}

/** The paragraph a target names, or null when its heading or opening is gone. */
export function targetText(repo, key) {
  const t = TARGETS[key]
  const lines = repo[t.file].split('\n')
  const h = lines.indexOf(t.heading)
  if (h < 0) return null
  const end = lines.findIndex((l, i) => i > h && l.startsWith('## '))
  const body = lines.slice(h + 1, end < 0 ? undefined : end)
  const o = body.findIndex((l) => l.startsWith(t.opening))
  if (o < 0) return null
  if (t.start) return body.slice(o).join('\n')
  const stop = body.findIndex((l, i) => i > o && (!l.trim() || /^(\d+\. |- )/.test(l)))
  return body.slice(o, stop < 0 ? undefined : stop).join('\n')
}

const count = (text, s) => text.split(s).length - 1

export function check(repo, registry = REGISTRY) {
  const out = []
  const sites = callSites(repo.runner)
  for (const s of sites) if (!registry.some((r) => s.text.includes(r.stem))) out.push(`round.workflow.mjs:${s.line}: call site with no registry row — ${s.text.trim()}`)
  const texts = {}
  for (const key of Object.keys(TARGETS)) {
    texts[key] = targetText(repo, key)
    if (texts[key] === null) out.push(`target not found: ${key} (${TARGETS[key].heading}, opening ${JSON.stringify(TARGETS[key].opening)})`)
  }
  for (const r of registry) {
    const n = sites.filter((s) => s.text.includes(r.stem)).length
    if (n !== 1) out.push(`row ${JSON.stringify(r.stem)}: stem matches ${n} call sites, not 1`)
    if (r.seat === 'excluded') { if (!(r.reason || '').trim()) out.push(`row ${JSON.stringify(r.stem)}: excluded with no reason`); continue }
    if (!SEATS[r.seat]) { out.push(`row ${JSON.stringify(r.stem)}: seat ${JSON.stringify(r.seat)} is not critic, redTeam, orchestrator or excluded`); continue }
    if (!r.anchor) { out.push(`row ${JSON.stringify(r.stem)}: no anchor — the rule this site enforces is stated in no text that reaches the ${r.seat}`); continue }
    const seatTexts = SEATS[r.seat].map((k) => texts[k])
    if (seatTexts.some((t) => t === null)) continue   // reported above as target not found
    const k = count(seatTexts.join('\n\n'), r.anchor)
    if (k !== 1) out.push(`row ${JSON.stringify(r.stem)}: anchor ${JSON.stringify(r.anchor)} occurs ${k} times in the ${r.seat}'s text, not once`)
  }
  return out
}

export function loadRepo() {
  const read = (...p) => fs.readFileSync(path.join(GAUNTLET, ...p), 'utf8')
  return { runner: read('harness', 'round.workflow.mjs'), skill: read('SKILL.md'), workflow: read('workflow.md') }
}

if (process.argv[2] === '--selftest') {
  // Exit 2, distinct from a failing clause's 1, so "the tamper test failed" and "it never ran" differ.
  const mod = await import('./brief-registry.selftest.mjs').catch((e) => {
    console.error(`brief-registry: the selftest sidecar did not load — ${e.message}`)
    console.error('brief-registry: tools/brief-registry.selftest.mjs must sit beside this file. No clause ran.')
    process.exit(2)
  })
  process.exit(mod.default({ check, callSites, loadRepo, REGISTRY, SEATS, TARGETS }))
} else if (process.argv[1] && process.argv[1].endsWith('brief-registry.mjs')) {
  const findings = check(loadRepo())
  for (const f of findings) console.log(f)
  console.log(`\n${findings.length} finding(s)`)
  process.exit(findings.length ? 1 : 0)
}
