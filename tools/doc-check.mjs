// Gate for the one artifact in this repo that had none: the prose.
//
// The harness code is held down by round.tamper.json and a mutation battery. The documents
// beside it were checked only by reading, which is why every hard finding across five review
// rounds was a claim that had gone stale rather than a defect in the code. Each of those
// failures was mechanically detectable. This is the detector.
//
//   node tools/doc-check.mjs            run the gate over the repo
//   node tools/doc-check.mjs --selftest three-clause tamper test, per CLAUDE.md
//
// Exit 0 clean, 1 on any finding. It reports; it never edits.
//
// What this does NOT catch, stated because a silent limitation is worse than a small one.
//
// The corpus is `doctrine-gauntlet`'s markdown **plus the prose inside `round.tamper.json`** —
// its `_readme` and every fixture `_note`. That second half is not incidental: the echo defect
// this tool was built after happened there, in seven fixture notes.
//
// The dangling check reads only documents that name at least one *live* fixture. Today that is
// `workflow.md` and `do-not-merge.md`; `SKILL.md`, `floor.md`, `tools.md` and `UNAUDITED.md` name
// none and are therefore never scanned for dangling references at all. That scoping is derived from the corpus rather than from an
// allowlist that would rot, and it is why `background-image`, `data-theme` and `max-w-3xl` are
// not read as fixture references — though note that those tokens are excluded by living in
// out-of-scope files, not by any judgement about the words themselves. Add one backticked live
// fixture name to `floor.md` and every hyphenated CSS token in it becomes a finding.
//
// A document naming only a stale fixture and no live one is out of scope: that is the rename
// case where the last reference in a file goes stale, and nothing here will catch it.
//
// Only `backticked` tokens are read. A fixture named in plain prose or inside a Markdown link is
// invisible, and fenced code blocks are not excluded. Reading unticked words would mean guessing
// which ordinary hyphenated words are fixture names, which is the false-positive problem the
// scoping rule exists to avoid.
//
// A fixture whose key has no hyphen — `clean`, `broken` — can never be reported as dangling,
// because a bare English word in backticks is indistinguishable from a fixture reference. Renaming
// one of those is invisible here.
//
// The thresholds are three names in a sentence and fifteen words in a repeated claim; a two-name
// list and a shorter repeated phrase pass. A roster spread across bullet points, one name each, passes: a bullet is treated as its own
// sentence so that an ordinary three-item list is not a false positive, and that cuts both ways.
//
// `CLAUDE.md` and `README.md` are outside the corpus, so this tool cannot police its own
// description. And these rules catch reference, roster and echo defects only: a stale *number*,
// or a claim paraphrased rather than copied, passes untouched. This narrows the class that has to
// be caught by reading; it does not close it.

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const SKILL = path.join(ROOT, 'skills/doctrine-gauntlet')

// A roster is a list in one sentence. Individual claims about named fixtures are separate
// sentences and are legitimate — that distinction is the whole reason this is per-sentence.
// Both thresholds are deliberately loose. A two-name list and a short repeated phrase pass;
// the rules exist to catch registers and copied rules, not to police every recurrence.
const ROSTER_IN_ONE_SENTENCE = 3
// Long enough that an echoed rule trips it and an ordinary shared phrase does not.
const ECHO_MIN_WORDS = 15

// A bullet is its own sentence. Without the list-marker boundaries a three-item list reads as
// one sentence and trips the roster rule, which is a false positive in a gate.
const sentences = (text) => text.split(/(?<=[.!?])\s+|\n\n+|\n(?=\s*[-*+]\s)|\n(?=\s*\d+[.)]\s)/).map((s) => s.trim()).filter(Boolean)
const ticked = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
// A fixture name is lowercase-hyphenated with no dot or slash — `clean-exits`, not `floor.md`.
const fixtureShaped = (t) => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(t)

function check({ tamper, docs }) {
  const findings = []
  const keys = Object.keys(tamper).filter((k) => k !== '_readme')
  const keySet = new Set(keys)

  // The rule the documents tell readers to use, asserted against the file itself. If this ever
  // fails, every "known-good" claim downstream is unmoored.
  for (const k of keys) {
    if (!(tamper[k].expect && 'clean' in tamper[k].expect)) {
      findings.push(`derivation: fixture \`${k}\` has no \`clean\` in its expect — the known-good rule cannot classify it`)
    }
  }

  // Prose carried by the fixture file counts as prose.
  const proseSources = [...docs, ...keys.filter((k) => tamper[k]._note).map((k) => ({
    name: `round.tamper.json → ${k}._note`, text: tamper[k]._note,
  }))]
  if (tamper._readme) proseSources.push({ name: 'round.tamper.json → _readme', text: tamper._readme })

  // Only a document that names at least one real fixture is a document about fixtures. Without
  // this, `background-image`, `data-theme`, `max-w-3xl` and every skill name are fixture-shaped
  // and the check drowns in them. Derived from the corpus, so there is no allowlist to rot.
  const aboutFixtures = new Set(proseSources.filter((src) => ticked(src.text).some((t) => keySet.has(t))).map((s) => s.name))

  for (const src of proseSources) {
    for (const s of sentences(src.text)) {
      const named = [...new Set(ticked(s).filter((t) => keySet.has(t)))]
      if (named.length >= ROSTER_IN_ONE_SENTENCE) {
        findings.push(`roster: ${src.name} names ${named.length} fixtures in one sentence (${named.join(', ')}) — a roster goes stale whenever any other fixture is added`)
      }
      for (const t of ticked(s)) {
        if (aboutFixtures.has(src.name) && fixtureShaped(t) && !keySet.has(t)) {
          findings.push(`dangling: ${src.name} references \`${t}\`, which is not a fixture in round.tamper.json`)
        }
      }
    }
  }

  // A claim restated in two places is an unversioned fork: correcting one cannot reach the other.
  const seen = new Map()
  for (const src of proseSources) {
    for (const s of sentences(src.text)) {
      const norm = s.replace(/\s+/g, ' ').trim()
      if (norm.split(' ').length < ECHO_MIN_WORDS) continue
      if (!seen.has(norm)) seen.set(norm, [])
      seen.get(norm).push(src.name)
    }
  }
  for (const [norm, where] of seen) {
    if (where.length > 1) {
      findings.push(`echo: the same ${norm.split(' ').length}-word claim appears in ${where.length} places (${where.join('; ')}) — "${norm.slice(0, 70)}…"`)
    }
  }
  return findings
}

function loadRepo() {
  const tamper = JSON.parse(fs.readFileSync(path.join(SKILL, 'harness/round.tamper.json'), 'utf8'))
  const docs = fs.readdirSync(SKILL).filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(SKILL, f), 'utf8') }))
  return { tamper, docs }
}

if (process.argv.includes('--selftest')) {
  // Three clauses, per CLAUDE.md. The fixtures are synthetic and inline so the test never
  // depends on the repo's current prose, which is the thing under review.
  const base = {
    _readme: 'Read each fixture against its expect.',
    'alpha-one': { expect: { clean: true }, _note: 'A known-good fixture that must stay quiet.' },
    'beta-two': { expect: { clean: false }, _note: 'A broken fixture that must block.' },
    'gamma-three': { expect: { clean: false }, _note: 'Another broken fixture.' },
  }
  const clone = () => JSON.parse(JSON.stringify(base))
  const run = (t, d) => check({ tamper: t, docs: d })
  let bad = 0
  const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

  // Clause 2 first: a known-good input must stay silent, or clause 1 proves nothing.
  const cleanRun = run(clone(), [{ name: 'ok.md', text: 'The `alpha-one` fixture must stay quiet. Separately, `beta-two` must block.' }])
  clause('clause 2 — known-good input is silent', cleanRun.length === 0, JSON.stringify(cleanRun))

  // Clause 1, one defect at a time, each must trip its own check and nothing else.
  // The doc names a live fixture too, which is what puts it in scope — see the limitation above.
  const dangling = run(clone(), [{ name: 'x.md', text: 'The `alpha-one` fixture is fine. See the `delta-four` fixture for the other case.' }])
  clause('clause 1a — a dangling fixture reference trips', dangling.length === 1 && dangling[0].startsWith('dangling:'), JSON.stringify(dangling))

  const roster = run(clone(), [{ name: 'x.md', text: 'The known-good fixtures are `alpha-one`, `beta-two` and `gamma-three`.' }])
  clause('clause 1b — a three-name roster in one sentence trips', roster.length === 1 && roster[0].startsWith('roster:'), JSON.stringify(roster))

  const echoed = clone()
  const line = 'This guard is per-check and no single fixture anywhere covers the whole class of them.'
  echoed['alpha-one']._note = line; echoed['beta-two']._note = line
  const echo = run(echoed, [])
  clause('clause 1c — the same claim in two places trips', echo.length === 1 && echo[0].startsWith('echo:'), JSON.stringify(echo))

  const broken = clone(); delete broken['beta-two'].expect.clean
  const derived = run(broken, [])
  clause('clause 1d — a fixture the derivation rule cannot classify trips', derived.length === 1 && derived[0].startsWith('derivation:'), JSON.stringify(derived))

  // Clause 3, per CLAUDE.md: prove the broken input really carries the defect, **independently of
  // the check**. So these assertions read the fixture data directly and never call check(). An
  // earlier version of this block only printed the claims and could not fail, which made the
  // "three-clause" label false — a red team filed exactly that.
  const keysOf = Object.keys(base).filter((k) => k !== '_readme')
  const danglingDoc = 'The `alpha-one` fixture is fine. See the `delta-four` fixture for the other case.'
  const rosterDoc = 'The known-good fixtures are `alpha-one`, `beta-two` and `gamma-three`.'
  const countKeys = (t) => keysOf.filter((k) => t.includes('`' + k + '`')).length

  clause('clause 3a — the referenced name really is absent from the fixture keys',
    !keysOf.includes('delta-four') && danglingDoc.includes('`delta-four`') && danglingDoc.includes('`alpha-one`'),
    `keys=${keysOf.join(',')}`)
  clause('clause 3b — the roster sentence really names three keys, counted without the check',
    countKeys(rosterDoc) === 3 && sentences(rosterDoc).length === 1,
    `named=${countKeys(rosterDoc)} sentences=${sentences(rosterDoc).length}`)
  clause('clause 3c — the two notes really are byte-identical and long enough to qualify',
    echoed['alpha-one']._note === echoed['beta-two']._note && line.split(' ').length >= ECHO_MIN_WORDS,
    `identical=${echoed['alpha-one']._note === echoed['beta-two']._note} words=${line.split(' ').length}`)
  clause('clause 3d — the classified fixture really has no `clean` key',
    !('clean' in broken['beta-two'].expect), JSON.stringify(broken['beta-two'].expect))

  process.exit(bad ? 1 : 0)
}

const findings = check(loadRepo())
for (const f of findings) console.log(f)
console.log(`\n${findings.length} finding(s)`)
process.exit(findings.length ? 1 : 0)
