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
// The corpus is every `.md` under `skills/` **plus the prose inside `round.tamper.json`** — its
// `_readme` and every fixture `_note`. That second half is not incidental: the echo defect this
// tool was built after happened there, in seven fixture notes. The hub and the wrappers were
// added because the hub is the widest-reaching file in the repo and was the one with no
// mechanical gate at all; the echo rule is what earns their place, since a wrapper restating hub
// posture is an unversioned fork of it and that is the architecture's central law.
//
// The dangling check reads only documents that name at least one *live* hyphenated fixture, so most
// of the corpus is never scanned for dangling references at all. The hyphen requirement is what
// makes that scoping safe rather than lucky: `clean` and `broken` are fixture keys and also
// ordinary English words, and while they armed the scan, one backticked `clean` anywhere turned
// every hyphenated token in that document into a finding, and a single such word added to the hub
// turned every skill name the hub mentions into one. Arming is per document: the findings all land
// against the document carrying the word.
//
// **That requirement has a losing side and it is not disclosed anywhere else.** A document armed
// only by bare-word keys is no longer scanned, so a stale hyphenated reference sitting beside a
// live `clean` is now missed where it once reported. No document in the corpus is in that state
// today, and the trade was taken knowingly: the false-positive side was reachable by one ordinary
// English word, the lost-positive side needs a document that names a bare key, names no hyphenated
// key, and carries a stale hyphenated reference. No roster of which files those are belongs
// here: it would be stale the next time a fixture is named anywhere, which is the same defect the
// roster rule below exists to catch. The scoping is derived from the corpus rather than from an
// allowlist, and it is why `background-image`, `data-theme` and `max-w-3xl` are not read as fixture
// references — though note that those tokens are excluded because the documents carrying them are
// not armed, not because they sit outside the corpus, and not by any judgement about the words. Add one backticked live fixture name to a document and
// every hyphenated CSS token in it becomes a finding.
//
// The derivation check is the one rule that reads the fixture file rather than the prose: every
// fixture must carry `clean` in its `expect`, because that is the rule the documents tell readers to
// classify fixtures by, and one it cannot classify unmoors every known-good claim downstream.
//
// A document naming only a stale fixture and no live one is out of scope: that is the rename
// case where the last reference in a file goes stale, and nothing here will catch it.
//
// **A fenced block is a code sample wherever it appears, and an HTML comment is prose the author
// struck out.** Both come out before every check in this file — not before two of them, which is
// what an earlier version of this sentence claimed while the dangling scan still read raw text.
// Neither carries a citation; neither states a rule a citation may resolve against; neither
// contributes a fixture reference. Fences open on backticks or tildes, may open under any nesting of
// list and block-quote markers in either order, and close only on a bare run at least as long as the
// opener — an info string after the markers opens, it never closes.
//
// The asymmetry that stood here briefly, keeping fences in the source so a rule written inside one
// could still be quoted, was wrong in the more expensive direction: it let a JSON blob and a diff
// hunk certify a rule that no document states. A citation resolvable only from inside a code fence
// has not found its rule. The cost of the symmetric rule is that a genuine citation written inside
// a fence is invisible, and that a rule genuinely stated only inside a fence cannot source one.
//
// Indented four-space blocks are not treated as fences, because this corpus indents list
// continuations far more often than code and stripping them would silence real citations.
//
// Only `backticked` tokens are read, wherever they sit — a name inside a Markdown link's text is
// still backticked and is still read. A fixture named in plain prose is
// invisible. Fenced blocks and HTML comments are excluded, here as everywhere. Reading unticked words would mean guessing
// which ordinary hyphenated words are fixture names, which is the false-positive problem the
// scoping rule exists to avoid.
//
// **The echo rule cannot see a claim duplicated inside citation syntax, or inside a fence.** Both
// are removed before it compares, for the reasons above, so a rule forked by two documents that each
// wrap it in an attribution is invisible to it — the anchor rule is what covers that case instead.
//
// A fixture whose key has no hyphen — `clean`, `broken` — can never be reported as dangling,
// because a bare English word in backticks is indistinguishable from a fixture reference. Renaming
// one of those is invisible here.
//
// A sentence ends at terminal punctuation followed by any of `*`, `_`, `'`, `"`, `)` or `]`. Without that the echo rule was blind to exactly
// the case it exists for: this corpus bolds the end of a rule constantly, and a sentence glued to
// the bolded one before it never matches the same sentence standing alone elsewhere. A hub rule
// copied verbatim into a wrapper went unreported until this was fixed.
//
// The backtick is deliberately **not** in that set. It was, and inline code containing terminal
// punctuation — a `` `?` `` in a prose sentence — then split mid-sentence and manufactured echoes
// out of two unrelated tails.
//
// Splitting more finely cuts both ways, and the honest statement is not "louder". It lets the echo
// rule see a claim that was previously glued to its neighbour, and it can also drop a long claim
// below the fifteen-word threshold by cutting it in two, hiding an echo the coarser split caught.
// Measured over the corpus when the change was made: nothing that was firing went silent, and no
// sentence came near the roster threshold under either splitter. Re-measure rather than trusting
// this sentence — it is a report of one run, not a property.
//
// The thresholds are three names in a sentence and fifteen words in a repeated claim; a two-name
// list and a shorter repeated phrase pass. A roster spread across bullet points or table rows, one
// name each, passes: a bullet and a table row are each their own sentence, so an ordinary three-item
// list and a fixture table are not false positives. That cuts both ways — a genuine roster written
// one name per row is not caught.
//
// The anchor check reads only an **attributed** citation — `` `floor.md`'s "quote" ``,
// `` `## Section`'s "quote" ``, `item 3's "quote"`. That shape is the one `do-not-merge.md`'s own
// re-quote rule describes. A quote used as a template string an agent must emit verbatim, as an
// illustration, as a paraphrase or as an entry title is not an anchor, and no syntax separates
// those from a citation, so **most quoted spans in the corpus are never read**. Two attribution
// shapes are also skipped on purpose: an unbackticked noun label, and `step N's`, which in this
// corpus names the question a step asks rather than that step's words — widening to it was tried
// and reported template strings as citations. A third is skipped by accident and stated here rather
// than fixed: only the ASCII apostrophe is matched, so a citation written with a typographic `'`
// is invisible. No count of any of these is recorded; re-measure if it matters. Precision was
// chosen over recall on purpose: a first draft that read every quoted span reported mostly
// paraphrases, and a gate that has to be ignored is a review round with extra steps. No count of
// either set is recorded here, because a count in a comment is not re-measured and is then cited
// as fact — the first version of this paragraph carried two and both were wrong.
//
// **Two strengths of resolution, and only one of them is provenance.** A label ending in `.md`
// names a document, so the citation must resolve in *that* document. A `.md` label the corpus does
// not hold is **not judged at all**: it may be a live file outside `skills/` — this repo backticks
// `CLAUDE.md` constantly — or a path that no longer exists, and nothing here can tell those apart,
// so a citation to a document deleted from outside the corpus is a gap this gate does not close. A `## Section` heading or an `item 3` names a
// place without saying which document it is in, so those resolve against the whole corpus instead
// — which passes a citation whose words happen to appear in an unrelated file. That is the weaker
// test, and a false clean there is possible by construction.
//
// A `.md` label resolving to several corpus paths — many documents here are named `SKILL.md` —
// identifies none of them, and is reported as ambiguous rather than searched across all of them,
// which would be the corpus-wide test wearing the strict one's message. An exact corpus key always
// wins, so a label carrying enough path to be a key is unambiguous even when longer paths end with
// it. The namespace is the corpus key, relative to `skills/`. A label may carry that one prefix —
// this repo writes `skills/<skill>/FILE.md` in its own prose — and no other. A label that merely
// *ends* with a corpus key, `archive/doctrine/SKILL.md` against a live `doctrine/SKILL.md`, is a
// different path and reads as absent, which is the stale-copy case this rule exists to catch.
//
// A section or item citation is searched across every document including the one carrying it: a
// document may state a rule and cite it elsewhere in itself, and the strip below is what makes that
// safe to allow.
//
// **A citation resolves against source prose only, never against another citation.** Every
// attributed citation is stripped from every document before the search, which is what stops a
// citation satisfying itself and stops one citation certifying another as its source. The cost is
// real: a document whose words exist only inside its own quotations cannot serve as anyone's
// source, and `do-not-merge.md` is very largely quotation.
//
// Emphasis is removed from the citation and from its source alike before comparison (fences come
// out earlier, in a pass of their own), and a code span keeps its content whatever length of
// backtick run delimits it, so two citations differing only in a backticked term are told apart.
// The citation is extracted before that removal and its source after it, so an unbalanced backtick
// inside a quotation is not handled. Citations under six words are skipped as too weak to match,
// which silently exempts a short dead citation. A citation carrying an ellipsis is skipped whole
// rather than checked fragment by fragment, so a deliberate elision is never read at all.
//
// `CLAUDE.md` and `README.md` are outside the corpus, so this tool cannot police its own
// description. And these rules catch reference, roster, echo, derivation and citation defects only:
// a stale *number*,
// or a claim paraphrased rather than copied, passes untouched. Both the echo rule and the citation
// rule read text through one normalisation: emphasis, case and spacing fall away, and a code span
// keeps its content. A rule copied and then bolded is the same rule; a rule naming `node floor.mjs`
// is not the rule naming `node other.mjs`. These were two different normalisations once, and the
// difference was wrong in both directions. This narrows the class that has to
// be caught by reading; it does not close it.

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const GAUNTLET = path.join(ROOT, 'skills/doctrine-gauntlet')
const SKILLS = path.join(ROOT, 'skills')
// Corpus keys are relative to `skills/`, and this repo writes `skills/<skill>/FILE.md` in its own
// prose, so that one prefix is accepted on a label. Any other prefix names a different path.
const CORPUS_ROOT = 'skills/'

// A roster is a list in one sentence. Individual claims about named fixtures are separate
// sentences and are legitimate — that distinction is the whole reason this is per-sentence.
// Both thresholds are deliberately loose. A two-name list and a short repeated phrase pass;
// the rules exist to catch registers and copied rules, not to police every recurrence.
const ROSTER_IN_ONE_SENTENCE = 3
// Long enough that an echoed rule trips it and an ordinary shared phrase does not.
const ECHO_MIN_WORDS = 15
// Short citations match half the corpus by accident; six words is where that stops.
const CITATION_MIN_WORDS = 6

// A citation is a quote attributed to a named source. Anything else in double quotes here is a
// template, an illustration, a paraphrase or a title, and none of those is an anchor.
const ATTRIBUTED = /(?:`([^`\n]+)`|(item \d+))'s?\s+"([^"]*?)"/g
// A fenced block is an illustration, and a citation-shaped line inside one is an example of a
// citation, not a citation. Discovery has to see the text with fences already gone, or it reports
// the example as a dead anchor.
// Everything a reader would not read as prose comes out here, once, so every check sees the same
// text. An HTML comment is prose the author struck out: a citation inside one is not made, and a
// rule inside one is not stated. A fenced block is a code sample the same way.
const prose = (text) => {
  const uncommented = text.replace(/<!--[\s\S]*?-->/g, CUT)
  let open = null
  return uncommented.split('\n').map((line) => {
    // A fence can open inside a list item or a block quote, so leading markers are skipped. It only
    // *closes* on a line that is nothing but the marker run: ```` ```not-a-close ```` opens an info
    // string, it does not close anything.
    const lead = '^(?:[ \\t]*(?:>|[-*+][ \\t]|\\d+[.)][ \\t]))*[ \\t]*'
    const opener = line.match(new RegExp(lead + '(`{3,}|~{3,})'))
    const closer = line.match(new RegExp(lead + '(`{3,}|~{3,})[ \\t]*\\r?$'))
    if (open) {
      if (closer && closer[1][0] === open[0] && closer[1].length >= open.length) open = null
      return CUT
    }
    if (opener) { open = opener[1]; return CUT }
    return line
  }).join('\n')
}
// Removing a citation must not let the prose on either side of it become adjacent: replacing it
// with a space and then collapsing whitespace manufactures a sentence that was never written, and
// a citation can then resolve against text assembled out of its own removal. A NUL is not
// whitespace, so it survives the collapse and keeps the two sides apart.
const CUT = '\u0000'
// Reduce a citation and its source to the same shape before comparing: code is formatting, not
// text, and so is emphasis. One function rather than two composed at each call site, because the
// two halves are never wanted apart and splitting them is how a comparison ends up applying one
// side's reduction and not the other's.
// Two texts say the same thing when only emphasis, case and spacing differ. Code spans keep their
// content and are protected from the emphasis pass: `run_state` and `runstate` are different names,
// and a rule naming `node floor.mjs` is not the rule naming `node other.mjs`. Deleting code spans
// instead, which this did, made those pairs indistinguishable in opposite directions — a false echo
// one way, a false resolution the other. One normaliser now, correct for both rules.
const HOLD = '\u0001'
const comparable = (t) => {
  const spans = []
  const held = t.replace(/(`+)([\s\S]*?)\1/g, (_, __, body) => HOLD + (spans.push(body) - 1) + HOLD)
  return held
    .replace(/[*_]/g, '')
    .replace(new RegExp(HOLD + '(\\d+)' + HOLD, 'g'), (_, i) => spans[Number(i)])
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}


// A bullet is its own sentence. Without the list-marker boundaries a three-item list reads as
// one sentence and trips the roster rule, which is a false positive in a gate.
const sentences = (text) => text.split(/(?<=[.!?][*_"')\]]*)\s+|\n\n+|\n(?=\s*[-*+]\s)|\n(?=\s*\d+[.)]\s)|\n(?=(?:[ \t]*(?:>|[-*+][ \t]|\d+[.)][ \t]))*[ \t]*\|)/).map((s) => s.trim()).filter(Boolean)
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
  const aboutFixtures = new Set(proseSources.filter((src) => ticked(prose(src.text)).some((t) => keySet.has(t) && fixtureShaped(t))).map((s) => s.name))

  for (const src of proseSources) {
    for (const s of sentences(prose(src.text))) {
      const named = [...new Set(ticked(s).filter((t) => keySet.has(t)))]
      if (named.length >= ROSTER_IN_ONE_SENTENCE) {
        findings.push(`roster: ${src.name} names ${named.length} fixtures in one sentence (${named.join(', ')}) — a roster goes stale whenever any other fixture is added`)
      }
      for (const t of new Set(ticked(s))) {
        if (aboutFixtures.has(src.name) && fixtureShaped(t) && !keySet.has(t)) {
          findings.push(`dangling: ${src.name} references \`${t}\`, which is not a fixture in round.tamper.json`)
        }
      }
    }
  }

  // An anchor must still resolve in source prose somewhere — outside the citation, though not
  // necessarily outside the citing document. A citation
  // whose source has moved on is worse than no citation: the reader greps it, finds nothing, and
  // cannot tell whether the rule was deleted or merely reworded. `do-not-merge.md` states this
  // rule about itself and nothing enforced it, so a quote deleted in round 18 sat cited for ten.
  // Raw NULs go before the substitution, never after: afterwards they would erase the mark that
  // keeps the prose on either side of a removed citation apart, which is what the mark is for.
  // Fences come out on both sides. A fenced block is a code sample wherever it appears: it does not
  // carry a citation, and it does not state a rule that a citation may resolve against.
  // Raw NULs come out of the text *before* anything inserts one, or the strip erases the marks
  // `prose()` just left where a fence or a comment was removed, and the words on either side of the
  // removal become adjacent again.
  const flat = new Map(proseSources.map((o) => [o.name, comparable(prose(o.text.split(CUT).join('')).replace(ATTRIBUTED, CUT))]))
  for (const src of proseSources) {
    for (const m of prose(src.text).matchAll(ATTRIBUTED)) {
      const label = (m[1] || m[2]).split(CUT).join('')
      // The quotation is NUL-stripped for the same reason its source is: a NUL carried inside a
      // quotation would otherwise be indistinguishable from the mark left by a removed citation.
      const q = comparable(m[3].split(CUT).join(''))
      if (q.split(' ').length < CITATION_MIN_WORDS || q.includes('\u2026') || q.includes('...')) continue

      // A label that ends in `.md` names a document, so the citation resolves against that one
      // document and nothing else. Searching the whole corpus instead passes a citation whose
      // words happen to appear in an unrelated file, which is a false clean on the one check whose
      // entire job is provenance. A section heading or an item number names a place inside some
      // document without saying which, so those keep the corpus-wide search — the weaker test,
      // recorded in the header rather than hidden behind the same wording.
      const named = /\.md$/.test(label)
        ? (flat.has(label) ? [label] : [...flat.keys()].filter((n) => n.endsWith('/' + label) || label === CORPUS_ROOT + n))
        : null
      // A `.md` label the corpus does not hold names a document this gate cannot read. It may be a
      // live file outside `skills/` or a path that no longer exists, and nothing here can tell those
      // apart, so the citation is not judged either way.
      if (named && named.length === 0) continue
      if (named && named.length > 1) {
        findings.push(`anchor: ${src.name} attributes a quotation to \`${label}\`, which names ${named.length} documents (${named.join(', ')}) — the citation cannot resolve against one of them`)
        continue
      }
      const haystack = named ? flat.get(named[0]) : [...flat.values()].join(CUT)
      if (!haystack.includes(q)) {
        findings.push(named
          ? `anchor: ${src.name} quotes "${q.slice(0, 70)}" as \`${label}\`'s words, and \`${label}\` does not contain it`
          : `anchor: ${src.name} quotes "${q.slice(0, 70)}" as ${label}'s words, and no document in the corpus contains it outside a citation`)
      }
    }
  }

  // A claim restated in two places is an unversioned fork: correcting one cannot reach the other.
  // Fences and attributed citations come out first, and the citation is replaced by the same mark
  // the anchor path uses: this corpus is told to re-quote rather than echo, two documents citing one
  // rule are obeying that, and a space here would splice the halves around a citation into a claim
  // nobody wrote — the identical defect the anchor path carried.
  const seen = new Map()
  for (const src of proseSources) {
    for (const s of sentences(prose(src.text).replace(ATTRIBUTED, CUT))) {
      const norm = comparable(s)
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

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith('.md') ? [path.join(dir, e.name)] : []))

function loadRepo() {
  const tamper = JSON.parse(fs.readFileSync(path.join(GAUNTLET, 'harness/round.tamper.json'), 'utf8'))
  const docs = walk(SKILLS).map((f) => ({ name: path.relative(SKILLS, f), text: fs.readFileSync(f, 'utf8') }))
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
  const rosterKeys = () => Object.assign(clone(), { 'beta-two': { expect: { clean: false } }, 'gamma-three': { expect: { clean: false } } })
  const run = (t, d) => check({ tamper: t, docs: d })
  let bad = 0
  const ownRuleText = 'hand the builder the artifact and never the filename it lives under'
  const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

  // Clause 2 first: a known-good input must stay silent, or clause 1 proves nothing.
  const liveSource = 'The `alpha-one` fixture must stay quiet. A known-good input has to be silent or the first clause proves nothing.'
  const liveCite = '`ok.md`\'s "A known-good input has to be silent or the first clause proves nothing" is the rule this file points at.'
  const cleanRun = run(clone(), [
    { name: 'ok.md', text: liveSource },
    { name: 'cite.md', text: liveCite },
  ])
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

  const deadSource = 'The rule that used to live here has since been reworded and no longer reads as it did.'
  const deadCite = '`src.md`\'s "a rule that was deleted from its source and left cited over here" vs the other half of the pair.'
  const anchored = run(clone(), [{ name: 'src.md', text: deadSource }, { name: 'cite.md', text: deadCite }])
  clause('clause 1e — a citation whose source no longer carries it trips', anchored.length === 1 && anchored[0].startsWith('anchor:'), JSON.stringify(anchored))

  // A citation resolving against the whole corpus instead of the document it names is a false
  // clean on the one check whose entire job is provenance. A red team demonstrated it; this pins it.
  const elsewhereText = 'the quoted words occur only in this unrelated document over here'
  const namedButEmpty = 'This named source does not contain the quotation at all.'
  const wrongSourceDocs = [
    { name: 'named.md', text: namedButEmpty },
    { name: 'unrelated.md', text: elsewhereText },
    { name: 'cite.md', text: '`named.md`\'s "' + elsewhereText + '".' },
  ]
  const wrongSource = run(clone(), wrongSourceDocs)
  clause('clause 1f — a citation resolving only in some other document trips', wrongSource.length === 1 && wrongSource[0].includes('does not contain it'), JSON.stringify(wrongSource))

  // A `.md` label the corpus does not hold names a document this gate cannot read — a live file
  // outside `skills/`, or a path that no longer exists. It cannot tell those apart, so it judges
  // neither. This clause once asserted the opposite, and a true citation to `CLAUDE.md`, which this
  // repo backticks fifteen times inside `skills/`, was reported as a dead anchor.
  const missingDocs = [{ name: 'cite.md', text: '`CLAUDE.md`\'s "a rule that lives in a document outside this corpus".' }]
  const missingDoc = run(clone(), missingDocs)
  clause('clause 2af — a citation naming a document outside the corpus is not judged', missingDoc.length === 0, JSON.stringify(missingDoc))

  // A document citing its own name used to resolve against the citation itself and always pass.
  const selfCiteQuote = 'these words appear nowhere at all but inside this citation'
  const selfCiteText = '`self.md`\'s "' + selfCiteQuote + '".'
  const selfCite = run(clone(), [{ name: 'self.md', text: selfCiteText }])
  clause('clause 1h — a citation that resolves only against itself trips', selfCite.length === 1 && selfCite[0].startsWith('anchor:'), JSON.stringify(selfCite))

  // A label matching several documents identifies none of them, and joining them silently restores
  // the corpus-wide search under the strict message, and this corpus has many documents named
  // `SKILL.md`.
  const ambiguousQuote = 'a rule that lives in the second copy and not the first one'
  const ambiguousDocs = [
    { name: 'one/SKILL.md', text: 'This copy does not carry the words that are cited.' },
    { name: 'two/SKILL.md', text: ambiguousQuote },
    { name: 'cite.md', text: '`SKILL.md`\'s "' + ambiguousQuote + '".' },
  ]
  const ambiguous = run(clone(), ambiguousDocs)
  clause('clause 1k — a label naming more than one document trips as ambiguous', ambiguous.length === 1 && ambiguous[0].includes('names 2 documents'), JSON.stringify(ambiguous))

  // The sentence splitter is a repair to a pre-existing check and needs its own clause: a rule that
  // ends bolded, then repeated standalone elsewhere, is the exact echo the old expression could not
  // see, because the asterisks sat between the period and the space and no split happened.
  const bolded = 'A leading clause that ends in bold.** ' + line
  const emphasis = run(clone(), [{ name: 'a.md', text: bolded }, { name: 'b.md', text: line }])
  clause('clause 1j — a rule bolded in one document and standalone in another is caught', emphasis.length === 1 && emphasis[0].startsWith('echo:'), JSON.stringify(emphasis))

  // The backtick's ABSENCE from the splitter class is a repair too, and absence is what a tamper
  // test forgets to pin. Two unrelated sentences sharing a tail after inline code must not become
  // an echo: with the backtick in the class they split after `` `?` `` and the shared tails match.
  const codeTail = 'and then the very same trailing words continue on for well past the echo threshold here'
  const inlineCodeDocs = [
    { name: 'a.md', text: 'Alpha asks about a root-element expression such as `?` ' + codeTail },
    { name: 'b.md', text: 'Beta asks about a different expression written as `?` ' + codeTail },
  ]
  const inlineCode = run(clone(), inlineCodeDocs)
  clause('clause 2b — inline code carrying terminal punctuation does not end a sentence', inlineCode.length === 0, JSON.stringify(inlineCode))

  // The corpus-wide branch is the one most live citations take, and nothing pinned it: turning it
  // off entirely left every clause passing. Both directions, since only the pair proves it runs.
  const sectionQuote = 'a rule that lives under a heading rather than in a file that can be named'
  const sectionLiveDocs = [
    { name: 'source.md', text: sectionQuote },
    { name: 'cite.md', text: '`## Some section`\'s "' + sectionQuote + '".' },
  ]
  const sectionLive = run(clone(), sectionLiveDocs)
  clause('clause 2c — a section-labelled citation resolving in the corpus stays quiet', sectionLive.length === 0, JSON.stringify(sectionLive))
  const sectionDeadDocs = [
    { name: 'source.md', text: 'This document carries nothing resembling the quotation at all.' },
  ]
  const sectionDead = run(clone(), [...sectionDeadDocs, { name: 'cite.md', text: '`## Some section`\'s "' + sectionQuote + '".' }])
  clause('clause 1l — a section-labelled citation resolving nowhere trips', sectionDead.length === 1 && sectionDead[0].startsWith('anchor:'), JSON.stringify(sectionDead))

  // The path-prefixed label is the only unambiguous strict form where a basename repeats, so it is
  // the escape hatch the header points at and it needs both directions of its own.
  const prefixedDocs = [
    { name: 'one/SKILL.md', text: ambiguousQuote },
    { name: 'two/SKILL.md', text: 'The second copy carries none of the cited words at all.' },
  ]
  const prefixedLive = run(clone(), [...prefixedDocs, { name: 'cite.md', text: '`one/SKILL.md`\'s "' + ambiguousQuote + '".' }])
  clause('clause 2d — a path-prefixed label resolves against that one document', prefixedLive.length === 0, JSON.stringify(prefixedLive))
  const prefixedDead = run(clone(), [...prefixedDocs, { name: 'cite.md', text: '`two/SKILL.md`\'s "' + ambiguousQuote + '".' }])
  clause('clause 1m — a path-prefixed label naming the wrong copy trips', prefixedDead.length === 1 && prefixedDead[0].includes('two/SKILL.md'), JSON.stringify(prefixedDead))

  // A document may state a rule in one section and cite it from another. Excluding the citing
  // document from the corpus-wide search reported that as a dead anchor.
  const ownDoc = { name: 'SKILL.md', text: '## The brief\n\n' + ownRuleText.replace('hand', 'Hand') + '.\n\n## Notes\n\n`## The brief`\'s "' + ownRuleText + '" is the rule.\n' }
  const selfSection = run(clone(), [ownDoc])
  clause('clause 2f — a document citing a rule it states elsewhere in itself stays quiet', selfSection.length === 0, JSON.stringify(selfSection))
  const selfSectionDeadDoc = { name: 'SKILL.md', text: '## Notes\n\n`## The brief`\'s "' + ownRuleText + '" is the rule.\n' }
  const selfSectionDead = run(clone(), [selfSectionDeadDoc])
  clause('clause 1n — a section citation whose rule is stated nowhere still trips', selfSectionDead.length === 1 && selfSectionDead[0].startsWith('anchor:'), JSON.stringify(selfSectionDead))

  // Removing a citation must not splice the prose on either side of it together. Both fragments
  // here are innocent; only their concatenation across the removed citation spells the rule.
  const spliceQuote = 'alpha beta gamma delta epsilon zeta'
  const spliceText = 'alpha beta gamma `## Rule`\'s "' + spliceQuote + '" delta epsilon zeta'
  const splice = run(clone(), [{ name: 'a.md', text: spliceText }])
  clause('clause 1o — a citation cannot resolve against prose spliced across its own removal', splice.length === 1 && splice[0].startsWith('anchor:'), JSON.stringify(splice))

  // A citation-shaped line inside a fenced block is an example of a citation, not one.
  const fencedText = '```md\n`## Rule`\'s "' + ownRuleText + '".\n```\n'
  const fenced = run(clone(), [{ name: 'b.md', text: fencedText }])
  clause('clause 2g — a citation-shaped line inside a fenced block is not treated as a citation', fenced.length === 0, JSON.stringify(fenced))

  // A NUL carried inside a quotation would otherwise be indistinguishable from the mark a removed
  // citation leaves, and could splice the quotation back together across its own removal.
  const nulQuote = 'alpha beta gamma delta epsilon zeta eta theta'
  const nulText = 'alpha beta gamma `## R`\'s "alpha beta gamma ' + CUT + ' delta epsilon zeta eta" delta epsilon zeta eta'
  const nulCase = run(clone(), [{ name: 'a.md', text: nulText }])
  clause('clause 1p — a NUL inside a quotation cannot impersonate the mark of a removed citation', nulCase.length === 1 && nulCase[0].startsWith('anchor:'), JSON.stringify(nulCase).slice(0, 120))

  // Tilde fences are fences too, and an example inside one is still an example.
  const tildeText = '~~~md\n`## R`\'s "' + nulQuote + '".\n~~~\n'
  const tilde = run(clone(), [{ name: 'a.md', text: tildeText }])
  clause('clause 2h — a tilde-fenced example is not treated as a citation', tilde.length === 0, JSON.stringify(tilde))

  // comparable() removes inline code and emphasis from both sides. Both are stated behaviour and
  // neither was pinned: a citation and its source differing only by those must still resolve.
  const normQuote = 'the **builder** receives the artifact and never the filename it lives under'
  const normSource = 'The rule: the builder receives the artifact and never the _filename_ it lives under.'
  const normed = run(clone(), [
    { name: 'src.md', text: normSource },
    { name: 'cite.md', text: '`## R`\'s "' + normQuote + '".' },
  ])
  clause('clause 2i — emphasis is removed from both sides before comparison', normed.length === 0, JSON.stringify(normed))

  // Inline code is unwrapped, not dropped. This clause once asserted the opposite — that two texts
  // differing only in a backticked term compare equal — and called it a disclosed loss. It was a
  // wrong answer in both directions: a citation naming one command resolved against a source naming
  // another, and two rules naming different identifiers read as one echoed rule.
  const codeSource = 'The rule: the builder hands over the `render` and never the local path it lives under.'
  const codeCase = run(clone(), [
    { name: 'src.md', text: codeSource },
    { name: 'cite.md', text: '`## R`\'s "the builder hands over the `run` and never the local path it lives under".' },
  ])
  clause('clause 1z — a citation naming a different code term does not resolve against it', codeCase.length === 1 && codeCase[0].startsWith('anchor:'), JSON.stringify(codeCase).slice(0, 100))

  // The same distinction from the echo side: two rules naming different identifiers are two rules.
  const snakeDocs = [
    { name: 'a.md', text: 'The orchestrator always writes `run_state` out to disk on every single round so that a later compaction can never lose it.' },
    { name: 'b.md', text: 'The orchestrator always writes `runstate` out to disk on every single round so that a later compaction can never lose it.' },
  ]
  const snake = run(clone(), snakeDocs)
  clause('clause 2j — two claims naming different code identifiers are not one echo', snake.length === 0, JSON.stringify(snake))

  // And a citation that quotes its source's code term exactly must still resolve.
  const sameTerm = run(clone(), [
    { name: 'src.md', text: codeSource },
    { name: 'cite.md', text: '`src.md`\'s "the builder hands over the `render` and never the local path it lives under".' },
  ])
  clause('clause 2ac — a citation quoting the same code term as its source resolves', sameTerm.length === 0, JSON.stringify(sameTerm))

  // The `item N` alternative in ATTRIBUTED is a second label shape and had no clause of its own.
  const itemText = 'Nothing here resembles it. item 3\'s "' + normQuote + '".'
  const itemDead = run(clone(), [{ name: 'a.md', text: itemText }])
  clause('clause 1q — an `item N` label is recognised as an attribution', itemDead.length === 1 && itemDead[0].includes("item 3's words"), JSON.stringify(itemDead))

  // A fence closes on a run at least as long as the one that opened it. A regex stopping at the
  // first three markers exposes a citation written inside a longer fence.
  const nestedText = '````md\n```\n`## R`\'s "' + nulQuote + '".\n```\n````\n'
  const nested = run(clone(), [{ name: 'a.md', text: nestedText }])
  clause('clause 2k — a citation inside a longer fence is still fenced', nested.length === 0, JSON.stringify(nested))

  // A fenced block is a code sample on both sides. This clause once asserted the opposite, on the
  // reasoning that a rule stated inside a fence is still stated; an adversary then certified a rule
  // from a JSON blob and from a diff hunk, neither of which states anything. A citation that can
  // only be resolved from inside a code fence has not found its rule.
  const fencedSourceDocs = [
    { name: 's.md', text: '```json\n{"example":"' + nulQuote + '"}\n```' },
    { name: 'c.md', text: '`## R`\'s "' + nulQuote + '".' },
  ]
  const fencedSource = run(clone(), fencedSourceDocs)
  clause('clause 1s — a rule that appears only inside a code fence does not source a citation', fencedSource.length === 1 && fencedSource[0].startsWith('anchor:'), JSON.stringify(fencedSource))

  // A fence can open inside a list item, and only a bare marker run closes one.
  const listFenceText = '- ```md\n  `## R`\'s "' + nulQuote + '".\n  ```\n'
  const listFence = run(clone(), [{ name: 'a.md', text: listFenceText }])
  clause('clause 2p — a fence opened inside a list item still hides its contents', listFence.length === 0, JSON.stringify(listFence))

  const falseCloseText = '```md\n```not-a-close\n`## R`\'s "' + nulQuote + '".\n```\n'
  const falseClose = run(clone(), [{ name: 'a.md', text: falseCloseText }])
  clause('clause 2q — a marker line carrying an info string does not close a fence', falseClose.length === 0, JSON.stringify(falseClose))

  // The attribution label was the one span left un-stripped, so a NUL in it defeated the `.md` test
  // and quietly dropped a named-document citation to the weaker corpus-wide search.
  // A NUL in the label defeated the `.md` test and dropped a named-document citation to the weaker
  // corpus-wide search, where an unrelated document could satisfy it. The named document here is in
  // the corpus and does not carry the words; another document does.
  const nulLabelDocs = [
    { name: 'named.md', text: 'This named source carries nothing resembling the quotation.' },
    { name: 'elsewhere.md', text: nulQuote },
    { name: 'c.md', text: '`named.md' + CUT + '`\'s "' + nulQuote + '".' },
  ]
  const nulLabel = run(clone(), nulLabelDocs)
  clause('clause 1t — a NUL in the attribution label does not downgrade the resolution', nulLabel.length === 1 && nulLabel[0].includes('named.md'), JSON.stringify(nulLabel).slice(0, 120))

  // A raw NUL in a source must not block a live citation. This is the guard that was deleted once
  // on the claim that no input exercised it; an adversary built one, so it is pinned now.
  const rawNulDocs = [
    { name: 's.md', text: 'alpha beta gamma' + CUT + ' delta epsilon zeta eta theta' },
    { name: 'c.md', text: '`## R`\'s "alpha beta gamma delta epsilon zeta eta theta".' },
  ]
  const rawNul = run(clone(), rawNulDocs)
  clause('clause 2m — a raw NUL in a source does not block a citation that resolves there', rawNul.length === 0, JSON.stringify(rawNul))

  // A source whose rule wraps across lines must still resolve: eleven live citations depend on the
  // whitespace collapse, and every other fixture here is single-line, so nothing saw it.
  const wrapDocs = [
    { name: 's.md', text: 'alpha beta gamma delta\nepsilon zeta eta theta' },
    { name: 'c.md', text: '`## R`\'s "alpha beta gamma delta epsilon zeta eta theta".' },
  ]
  const wrapped = run(clone(), wrapDocs)
  clause('clause 2n — a source whose rule wraps across lines still resolves', wrapped.length === 0, JSON.stringify(wrapped))

  // A fixture carrying no `expect` at all must be reported, not thrown on.
  const noExpect = run({ _readme: 'x', 'no-expect': {} }, [])
  clause('clause 1r — a fixture with no `expect` is reported rather than crashing the run', noExpect.length === 1 && noExpect[0].startsWith('derivation:'), JSON.stringify(noExpect))

  // Two documents re-quoting one rule are citing, not forking. The corpus is told to re-quote.
  const requoteDocs = [
    { name: 'a.md', text: '`## R`\'s "' + nulQuote + '" is the rule and the reason that it exists here.' },
    { name: 'b.md', text: '`## R`\'s "' + nulQuote + '" is the rule and the reason that it exists here.' },
    { name: 's.md', text: nulQuote },
  ]
  const requote = run(clone(), requoteDocs)
  clause('clause 2o — two documents re-quoting one rule are not an echo', requote.length === 0, JSON.stringify(requote))

  // The echo path had the splice defect the anchor path was fixed for: it replaced a citation with a
  // space and then collapsed whitespace, manufacturing a claim out of the two halves around it.
  const echoHalf1 = 'always delete production data before'
  const echoHalf2 = 'checking whether backups exist and then restore every one of them'
  const spliceEchoDocs = [
    { name: 'a.md', text: echoHalf1 + ' `## R`\'s "irrelevant words that are long enough not to be skipped" ' + echoHalf2 + '.' },
    { name: 'b.md', text: echoHalf1 + ' ' + echoHalf2 + '.' },
  ]
  const spliceEcho = run(clone(), spliceEchoDocs)
  clause('clause 2r — the echo rule does not manufacture a claim across a removed citation', !spliceEcho.some((f) => f.startsWith('echo:')), JSON.stringify(spliceEcho).slice(0, 110))

  // Two documents carrying the same fenced example are carrying an example, not a forked rule.
  const fencedEchoText = '```\n' + echoHalf1 + ' ' + echoHalf2 + ' and so on for a while\n```'
  const fencedEcho = run(clone(), [{ name: 'a.md', text: fencedEchoText }, { name: 'b.md', text: fencedEchoText }])
  clause('clause 2s — the same fenced example in two documents is not an echo', fencedEcho.length === 0, JSON.stringify(fencedEcho))

  // The separator joining documents is the cross-document twin of CUT: with an ordinary space a
  // quotation could resolve against the seam between two documents that each hold half of it.
  const seamDocs = [
    { name: 'y.md', text: echoHalf1 },
    { name: 'z.md', text: echoHalf2 },
    { name: 'c.md', text: '`## R`\'s "' + echoHalf1 + ' ' + echoHalf2 + '".' },
  ]
  const seam = run(clone(), seamDocs)
  clause('clause 1u — a quotation cannot resolve against the seam between two documents', seam.length === 1 && seam[0].startsWith('anchor:'), JSON.stringify(seam).slice(0, 110))

  // A tilde run must not close a backtick fence, or the fenced example leaks and the live one hides.
  const mixedText = '```md\n~~~\n`## R`\'s "' + nulQuote + '".\n```\n'
  const mixed = run(clone(), [{ name: 'a.md', text: mixedText }])
  clause('clause 2t — a run of the other marker does not close a fence', mixed.length === 0, JSON.stringify(mixed))

  // A fence indented under a block quote is still a fence, both ways round.
  const bqText = '> ```md\n> `a.md`\'s "' + nulQuote + '".\n> ```\n'
  const bqCite = run(clone(), [{ name: 'a.md', text: bqText }])
  clause('clause 2u — a citation inside a block-quoted fence is not a citation', bqCite.length === 0, JSON.stringify(bqCite))
  const bqSourceDocs = [
    { name: 's.md', text: '> ```md\n> ' + nulQuote + '\n> ```\n' },
    { name: 'c.md', text: '`s.md`\'s "' + nulQuote + '".' },
  ]
  const bqSource = run(clone(), bqSourceDocs)
  clause('clause 1v — a rule inside a block-quoted fence does not source a citation', bqSource.length === 1 && bqSource[0].startsWith('anchor:'), JSON.stringify(bqSource))

  // An HTML comment is prose the author struck out. It neither makes a citation nor states a rule.
  const commentText = '<!-- `a.md`\'s "' + nulQuote + '". -->\n'
  const commentCite = run(clone(), [{ name: 'a.md', text: commentText }])
  clause('clause 2v — a citation inside an HTML comment is not a citation', commentCite.length === 0, JSON.stringify(commentCite))
  const commentSourceDocs = [
    { name: 's.md', text: '<!-- ' + nulQuote + ' -->\n' },
    { name: 'c.md', text: '`s.md`\'s "' + nulQuote + '".' },
  ]
  const commentSource = run(clone(), commentSourceDocs)
  clause('clause 1w — a rule inside an HTML comment does not source a citation', commentSource.length === 1 && commentSource[0].startsWith('anchor:'), JSON.stringify(commentSource))

  // The dangling scan reads the same reduced text as everything else, so a fixture name written
  // inside a code sample is not a reference to that fixture.
  const fencedNameDocs = [{ name: 'a.md', text: 'A document naming `alpha-one`.\n\n```\nsee `delta-four` here\n```\n' }]
  const fencedName = run(clone(), fencedNameDocs)
  clause('clause 2w — a fixture name inside a fence is not a dangling reference', fencedName.length === 0, JSON.stringify(fencedName))

  // Arming reads the same reduced text as the scan it arms. A live fixture named only inside a code
  // sample does not make a document a document about fixtures.
  const armedByFenceDocs = [{ name: 'a.md', text: '```\nsee `alpha-one` here\n```\n\nAnd a `delta-four` in prose.' }]
  const armedByFence = run(clone(), armedByFenceDocs)
  clause('clause 2x — a live fixture named only inside a fence does not arm the dangling scan', armedByFence.length === 0, JSON.stringify(armedByFence))

  // A fence can be nested either way round. The recogniser once took quote-then-list and not
  // list-then-quote, which is the same compact Markdown written the other way.
  const nestA = '- > ```md\n  > `s.md`\'s "' + nulQuote + '".\n  > ```\n'
  const nestB = '> - ```md\n>   `s.md`\'s "' + nulQuote + '".\n>   ```\n'
  const nestedLead = run(clone(), [{ name: 'a.md', text: nestA }, { name: 'b.md', text: nestB }])
  clause('clause 2y — a fence nested through list and quote markers, either order, is still a fence', nestedLead.length === 0, JSON.stringify(nestedLead))

  // Three rows of a table are three claims. The roster rule counts names per sentence, and a table
  // that is not split into rows reads as one sentence naming all of them.
  const tableText = '| Fixture | Meaning |\n| --- | --- |\n| `alpha-one` | clean |\n| `beta-two` | broken |\n| `gamma-three` | other |\n'
  const tableRoster = run(rosterKeys(), [{ name: 't.md', text: tableText }])
  clause('clause 2z — a table listing one fixture per row is not a roster', tableRoster.length === 0, JSON.stringify(tableRoster))

  // The echo rule compared raw text while the citation rule compared normalised text, so a claim
  // copied and then bolded, or re-capitalised, was invisible to the check whose job is finding copies.
  const claim = 'This repeated doctrine rule has enough ordinary words to exceed the threshold and should be found.'
  const emphasised = run(clone(), [{ name: 'a.md', text: claim }, { name: 'b.md', text: claim.replace('ordinary', '**ordinary**') }])
  clause('clause 1x — a claim copied and then emphasised is still an echo', emphasised.length === 1 && emphasised[0].startsWith('echo:'), JSON.stringify(emphasised).slice(0, 100))
  const recased = run(clone(), [{ name: 'a.md', text: claim }, { name: 'b.md', text: claim[0].toLowerCase() + claim.slice(1) }])
  clause('clause 1y — a claim copied and then re-capitalised is still an echo', recased.length === 1 && recased[0].startsWith('echo:'), JSON.stringify(recased).slice(0, 100))
  const codeTermDocs = [
    { name: 'a.md', text: 'The rule names the `builder` and carries more than enough ordinary words to stay above the echo threshold even once every code span has been removed.' },
    { name: 'b.md', text: 'The rule names the `critic` and carries more than enough ordinary words to stay above the echo threshold even once every code span has been removed.' },
  ]
  const codeTerm = run(clone(), codeTermDocs)
  clause('clause 2aa — two sentences naming different code terms are not one claim', codeTerm.length === 0, JSON.stringify(codeTerm))

  // This repo writes `skills/<skill>/SKILL.md` in its own prose. Such a label reported "not a
  // document this gate reads" about a file the gate reads.
  const rootLabelDocs = [
    { name: 'doctrine/SKILL.md', text: nulQuote },
    { name: 'doctrine-gauntlet/SKILL.md', text: '`skills/doctrine/SKILL.md`\'s "' + nulQuote + '".' },
  ]
  const rootLabel = run(clone(), rootLabelDocs)
  clause('clause 2ab — a label carrying the repo-root prefix resolves against the document it names', rootLabel.length === 0, JSON.stringify(rootLabel))

  // 2ab alone cannot tell resolution from the not-judged skip: after an unresolvable `.md` label
  // became silent, both outcomes print nothing. This is its twin — the named document is in the
  // corpus and lacks the words, so the strict branch must report. Delete the root-prefix branch and
  // the label is unresolvable, the citation is skipped, and this clause fails.
  const rootLabelDeadDocs = [
    { name: 'doctrine/SKILL.md', text: 'This document carries nothing resembling the quotation at all.' },
    { name: 'doctrine-gauntlet/SKILL.md', text: nulQuote },
    { name: 'c.md', text: '`skills/doctrine/SKILL.md`\'s "' + nulQuote + '".' },
  ]
  const rootLabelDead = run(clone(), rootLabelDeadDocs)
  clause('clause 1ag — a root-prefixed label reports against the document it names, not silence', rootLabelDead.length === 1 && rootLabelDead[0].includes('skills/doctrine/SKILL.md'), JSON.stringify(rootLabelDead).slice(0, 120))

  // The roster rule's own dedupe had no clause; clause 1af covers the dangling loop's.
  const rosterRepeatText = 'The fixtures are `alpha-one`, `alpha-one`, `beta-two` and `beta-two` in one sentence.'
  const rosterRepeat = run(rosterKeys(), [{ name: 'r.md', text: rosterRepeatText }])
  clause('clause 2ah — a fixture named twice counts once toward the roster threshold', rosterRepeat.length === 0, JSON.stringify(rosterRepeat))

  // A fence closes on a run *at least* as long as the opener, not only on an equal one.
  const longCloseText = '```md\nan ordinary code sample\n`````\n\n`## R`\'s "' + nulQuote + '".\n'
  const longClose = run(clone(), [{ name: 'a.md', text: longCloseText }])
  clause('clause 1ah — a closing run longer than the opener closes the fence, so what follows is read', longClose.length === 1 && longClose[0].startsWith('anchor:'), JSON.stringify(longClose).slice(0, 100))

  // A table row inside a block quote is still a table row.
  const quotedTableText = '> | Fixture | Meaning |\n> | --- | --- |\n> | `alpha-one` | clean |\n> | `beta-two` | broken |\n> | `gamma-three` | other |\n'
  const quotedTable = run(rosterKeys(), [{ name: 't.md', text: quotedTableText }])
  clause('clause 2ad — a table inside a block quote is not a roster', quotedTable.length === 0, JSON.stringify(quotedTable))

  // Only the corpus root is a prefix a label may carry. Any other prefix names a different path, and
  // accepting it resolved a stale archived path against the live document it was copied from.
  const stalePathDocs = [
    { name: 'doctrine/SKILL.md', text: 'This live document carries nothing resembling the quotation at all.' },
    { name: 'elsewhere.md', text: nulQuote },
    { name: 'c.md', text: '`archive/doctrine/SKILL.md`\'s "' + nulQuote + '".' },
  ]
  const stalePath = run(clone(), stalePathDocs)
  clause('clause 2ag — a path that merely ends with a corpus key is not resolved against it', stalePath.length === 0, JSON.stringify(stalePath))

  // The spacing branch of the shared normaliser had no clause: a claim rewrapped across lines is the
  // same claim, and nothing failed when the collapse was removed.
  const rewrapDocs = [
    { name: 'a.md', text: 'This repeated doctrine rule has enough ordinary words to exceed the threshold and be found.' },
    { name: 'b.md', text: 'This repeated doctrine rule has enough ordinary\n   words to exceed the threshold and be found.' },
  ]
  const rewrapped = run(clone(), rewrapDocs)
  clause('clause 1ab — a claim rewrapped across lines is still the same claim', rewrapped.length === 1 && rewrapped[0].startsWith('echo:'), JSON.stringify(rewrapped).slice(0, 100))

  // A code span may be delimited by a run of backticks, which is how a span containing a backtick is
  // written. Recognising only single delimiters mispartitioned the span and let emphasis stripping
  // reach inside it.
  const dblDocs = [
    { name: 'a.md', text: 'The orchestrator always writes ``run_state`` out to disk on every single round so that a later compaction can never lose it.' },
    { name: 'b.md', text: 'The orchestrator always writes ``runstate`` out to disk on every single round so that a later compaction can never lose it.' },
  ]
  const dbl = run(clone(), dblDocs)
  clause('clause 2ae — a double-backtick code span keeps its content too', dbl.length === 0, JSON.stringify(dbl))

  // `_readme` is corpus prose by the header's promise, and nothing proved it took part in any check.
  const readmeEcho = clone()
  readmeEcho._readme = 'The orchestrator always writes the run state out to disk on every single round so that a later compaction can never lose it.'
  const readmeCase = run(readmeEcho, [{ name: 'a.md', text: readmeEcho._readme }])
  clause('clause 1ac — `_readme` prose takes part in the checks like any other document', readmeCase.length === 1 && readmeCase[0].startsWith('echo:'), JSON.stringify(readmeCase).slice(0, 110))

  // Removing a fence or a comment must not make the words on either side adjacent, for the same
  // reason removing a citation must not. Both leave the same mark.
  const seamFenceDocs = [
    { name: 's.md', text: 'alpha beta gamma delta\n```\ncode\n```\nepsilon zeta eta theta' },
    { name: 'c.md', text: '`s.md`\'s "alpha beta gamma delta epsilon zeta eta theta".' },
  ]
  const seamFence = run(clone(), seamFenceDocs)
  clause('clause 1ad — a quotation cannot resolve across a removed fence', seamFence.length === 1 && seamFence[0].startsWith('anchor:'), JSON.stringify(seamFence).slice(0, 100))
  const seamCommentDocs = [
    { name: 's.md', text: 'alpha beta gamma delta <!-- note --> epsilon zeta eta theta' },
    { name: 'c.md', text: '`s.md`\'s "alpha beta gamma delta epsilon zeta eta theta".' },
  ]
  const seamComment = run(clone(), seamCommentDocs)
  clause('clause 1ae — a quotation cannot resolve across a removed comment', seamComment.length === 1 && seamComment[0].startsWith('anchor:'), JSON.stringify(seamComment).slice(0, 100))

  // The roster rule deduped a repeated name and the dangling rule did not, so one stale name written
  // three times produced three identical findings.
  const repeatText = 'Naming `alpha-one`, then `delta-four` and `delta-four` and `delta-four`.'
  const repeated = run(clone(), [{ name: 'a.md', text: repeatText }])
  clause('clause 1af — a stale name repeated in one sentence is reported once', repeated.length === 1 && repeated[0].startsWith('dangling:'), JSON.stringify(repeated))

  // An exact corpus key is ambiguous with nothing. Without precedence it was unioned with every
  // suffix match, so the one unambiguous form of a label was reported ambiguous.
  const exactDocs = [
    { name: 'doctrine-gauntlet/SKILL.md', text: ambiguousQuote },
    { name: 'archive/doctrine-gauntlet/SKILL.md', text: 'The archived copy carries none of the cited words.' },
    { name: 'cite.md', text: '`doctrine-gauntlet/SKILL.md`\'s "' + ambiguousQuote + '".' },
  ]
  const exact = run(clone(), exactDocs)
  clause('clause 2e — an exact corpus key wins over a longer path that also ends with it', exact.length === 0, JSON.stringify(exact))

  // A bare-word fixture key must not arm the dangling scan, since it can never be reported by it.
  const bareKey = clone(); bareKey.clean = { expect: { clean: true } }
  const bareKeyText = 'A document mentioning the `clean` case and a `some-other-token` beside it.'
  const armed = run(bareKey, [{ name: 'unrelated.md', text: bareKeyText }])
  clause('clause 1i — a bare-word fixture key does not arm the dangling scan', armed.length === 0, JSON.stringify(armed))

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

  // The dead citation is dead and the live one is live, both established by reading the strings.
  const cited = 'a rule that was deleted from its source and left cited over here'
  const alive = 'A known-good input has to be silent or the first clause proves nothing'
  clause('clause 3e — the dead citation really is attributed, long enough, and absent from its source',
    deadCite.includes('`src.md`\'s "' + cited + '"') && cited.split(' ').length >= CITATION_MIN_WORDS && !deadSource.includes(cited),
    `words=${cited.split(' ').length} inSource=${deadSource.includes(cited)}`)
  clause('clause 3f — the live citation really is present in the other document, so 1e is not just any citation',
    liveCite.includes('"' + alive + '"') && liveSource.includes(alive),
    `inSource=${liveSource.includes(alive)}`)

  // Clause 3 for 1f: the words really are in the corpus and really are not in the named document,
  // so what 1f reports is provenance and not absence. Read from the strings, never from check().
  clause('clause 3h — the self-citation really names its own document and carries the words only inside the quotation',
    selfCiteText.startsWith('`self.md`') && selfCiteText.split(selfCiteQuote).length === 2,
    'expected the quoted span to occur exactly once, inside the quotation')
  clause('clause 3i — `clean` really is a bare fixture key and the document really carries a hyphenated token',
    'clean' in bareKey && !'clean'.includes('-') && /`[a-z][a-z0-9]*(-[a-z0-9]+)+`/.test(bareKeyText),
    'the bomb needs both halves: a bare key to arm it and a hyphenated token to report')

  clause('clause 3g — the wrongly-sourced quote really is present in another document and absent from the one it names',
    !namedButEmpty.includes(elsewhereText) &&
    wrongSourceDocs.some((d) => d.name === 'unrelated.md' && d.text.includes(elsewhereText)) &&
    elsewhereText.split(' ').length >= CITATION_MIN_WORDS,
    `words=${elsewhereText.split(' ').length} carriedElsewhere=${wrongSourceDocs.some((d) => d.name === 'unrelated.md' && d.text.includes(elsewhereText))}`)

  clause('clause 3j — the document the citation names really is absent from the corpus that was supplied',
    !missingDocs.some((d) => d.name === 'CLAUDE.md' || d.name.endsWith('/CLAUDE.md')),
    missingDocs.map((d) => d.name).join(','))

  clause('clause 3l — two supplied documents really do share the basename, and only one carries the words',
    ambiguousDocs.filter((d) => d.name.endsWith('/SKILL.md')).length === 2 &&
    ambiguousDocs.filter((d) => d.name.endsWith('/SKILL.md') && d.text.includes(ambiguousQuote)).length === 1,
    ambiguousDocs.map((d) => d.name).join(','))

  clause('clause 3m — the inline-code pair really shares a long tail, really differs before it, and really carries the punctuation',
    codeTail.split(' ').length >= ECHO_MIN_WORDS &&
    inlineCodeDocs.every((d) => d.text.endsWith(codeTail) && d.text.includes('`?`')) &&
    inlineCodeDocs[0].text.replace(codeTail, '') !== inlineCodeDocs[1].text.replace(codeTail, ''),
    `tail=${codeTail.split(' ').length} words`)
  clause('clause 3n — the section citation really is unresolvable in the dead case and present in the live one',
    !sectionDeadDocs.some((d) => d.text.includes(sectionQuote)) &&
    sectionLiveDocs.some((d) => d.name === 'source.md' && d.text.includes(sectionQuote)) &&
    sectionQuote.split(' ').length >= CITATION_MIN_WORDS,
    `words=${sectionQuote.split(' ').length}`)
  clause('clause 3y — the nested fixture really opens with four markers and really contains three',
    nestedText.startsWith('````') && /\n```\n/.test(nestedText) && /`[^`]+`'s\s+"/.test(nestedText),
    nestedText.slice(0, 20))
  clause('clause 3ax — the seam fixtures really break the quotation around a fence and a comment',
    !seamFenceDocs[0].text.includes('delta epsilon') && /```[\s\S]*```/.test(seamFenceDocs[0].text) &&
    !seamCommentDocs[0].text.includes('delta epsilon') && /<!--[\s\S]*-->/.test(seamCommentDocs[0].text),
    'the halves must be separated only by the thing that gets removed')
  clause('clause 3ay — the repeat fixture really names one stale fixture three times in one sentence',
    (repeatText.match(/`delta-four`/g) || []).length === 3 && !/[.!?]\s/.test(repeatText.slice(0, repeatText.lastIndexOf('`delta-four`'))),
    'all three must sit in the same sentence')

  clause('clause 3aw — the `_readme` fixture really carries a long claim and really matches the document beside it',
    readmeEcho._readme.split(' ').length >= ECHO_MIN_WORDS,
    'the shared claim must be long enough to qualify on its own')

  clause('clause 3av — the double-backtick pair really uses run delimiters and really differs only inside them',
    /``run_state``/.test(dblDocs[0].text) && /``runstate``/.test(dblDocs[1].text) &&
    dblDocs[0].text.replace('``run_state``', 'X') === dblDocs[1].text.replace('``runstate``', 'X') &&
    dblDocs[0].text.replace(/``[^`]*``/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length >= ECHO_MIN_WORDS,
    'both must use two-backtick delimiters and stay above the floor without them')

  clause('clause 3as — the quoted table really carries the quote marker on every row',
    quotedTableText.split('\n').filter(Boolean).every((l) => l.startsWith('> |')) &&
    quotedTableText.split('\n').filter((l) => /`[a-z-]+`/.test(l)).length === 3,
    'every row must be quoted and three rows must name a fixture')
  clause('clause 3at — the stale path really ends with the corpus key, is not the root-prefixed form, and the document it would wrongly resolve against really lacks the words',
    stalePathDocs[2].text.includes('`archive/doctrine/SKILL.md`') &&
    'archive/doctrine/SKILL.md'.endsWith('/' + stalePathDocs[0].name) &&
    'archive/doctrine/SKILL.md' !== 'skills/' + stalePathDocs[0].name &&
    !stalePathDocs[0].text.includes(nulQuote) && stalePathDocs[1].text.includes(nulQuote),
    'a wrong resolution must be observable as a finding, not as the same silence the skip gives')
  clause('clause 3au — the rewrapped pair really differs only in whitespace',
    rewrapDocs[0].text !== rewrapDocs[1].text &&
    rewrapDocs[0].text.replace(/\s+/g, ' ') === rewrapDocs[1].text.replace(/\s+/g, ' '),
    'collapsing whitespace alone must make them identical')

  clause('clause 3an — the two nested fixtures really carry the markers in opposite order',
    /^- >/.test(nestA) && /^> -/.test(nestB) && nestA.includes('```') && nestB.includes('```'),
    'one must be list-then-quote and the other quote-then-list')
  clause('clause 3ao — the table really puts one fixture on each of three rows',
    tableText.split('\n').filter((l) => /^\|/.test(l) && /`[a-z-]+`/.test(l)).length === 3,
    'three rows, one backticked name each')
  clause('clause 3ap — the emphasised and recased copies really differ from the original as raw text',
    claim.replace('ordinary', '**ordinary**') !== claim && (claim[0].toLowerCase() + claim.slice(1)) !== claim &&
    claim.split(' ').length >= ECHO_MIN_WORDS,
    'each copy must be a different string before normalisation')
  clause('clause 3aq — the code-term pair really differs only inside its backticks, and stays above the floor without them',
    codeTermDocs[0].text.replace('`builder`', 'X') === codeTermDocs[1].text.replace('`critic`', 'X') &&
    codeTermDocs[0].text !== codeTermDocs[1].text &&
    codeTermDocs[0].text.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length >= ECHO_MIN_WORDS,
    'length must never be the reason this pair is skipped')
  clause('clause 3ar — the root-prefixed label really is the corpus root plus a supplied key, and the dead twin really lacks the words',
    rootLabelDocs[1].text.includes('`skills/doctrine/SKILL.md`') &&
    'skills/doctrine/SKILL.md' === 'skills/' + rootLabelDocs[0].name &&
    !rootLabelDeadDocs[0].text.includes(nulQuote) && rootLabelDeadDocs[1].text.includes(nulQuote),
    'the named document must lack the words and another must carry them')
  clause('clause 3az — the roster repeat really names two fixtures twice each in one sentence',
    (rosterRepeatText.match(/`alpha-one`/g) || []).length === 2 &&
    (rosterRepeatText.match(/`beta-two`/g) || []).length === 2 &&
    rosterRepeatText.split('. ').length === 1,
    'four mentions of two names, all in one sentence')
  clause('clause 3ba — the long-close fixture really opens on three markers, closes on five, and carries its citation after the close',
    /^```md\n/.test(longCloseText) && /\n`````\n/.test(longCloseText) &&
    longCloseText.indexOf("`## R`") > longCloseText.indexOf('`````'),
    'the citation must sit after the closing run, where an unclosed fence would swallow it')

  clause('clause 3am — the arming fixture really names the live fixture only inside the fence and the stale one only outside',
    armedByFenceDocs[0].text.indexOf('`alpha-one`') < armedByFenceDocs[0].text.lastIndexOf('```') &&
    armedByFenceDocs[0].text.indexOf('`delta-four`') > armedByFenceDocs[0].text.lastIndexOf('```'),
    'the live name must sit inside the fence and the stale one after it')

  clause('clause 3aj — the block-quote fixtures really are quoted and really fenced',
    /^> ```/.test(bqText) && bqText.split('\n').filter(Boolean).every((l) => l.startsWith('>')) &&
    /^> ```/.test(bqSourceDocs[0].text),
    'every line must carry the quote marker')
  clause('clause 3ak — the comment fixtures really wrap their content in an HTML comment',
    commentText.trim().startsWith('<!--') && commentText.trim().endsWith('-->') &&
    commentSourceDocs[0].text.trim().startsWith('<!--') && commentSourceDocs[0].text.trim().endsWith('-->'),
    'the whole content must sit between the comment markers')
  clause('clause 3al — the fenced-name fixture really names one fixture outside a fence and one inside',
    /`alpha-one`[\s\S]*```/.test(fencedNameDocs[0].text) &&
    fencedNameDocs[0].text.indexOf('`delta-four`') > fencedNameDocs[0].text.indexOf('```'),
    'the armed name must precede the fence and the dangling one must sit inside it')

  clause('clause 3af — the splice-echo halves really are contiguous in one document and separated in the other',
    spliceEchoDocs[1].text.includes(echoHalf1 + ' ' + echoHalf2) &&
    !spliceEchoDocs[0].text.includes(echoHalf1 + ' ' + echoHalf2) &&
    (echoHalf1 + ' ' + echoHalf2).split(' ').length >= ECHO_MIN_WORDS,
    'only joining across the removed citation can make the two match')
  clause('clause 3ag — the fenced echo pair really is byte-identical and really fenced',
    fencedEchoText.startsWith('```') && fencedEchoText.split(' ').length >= ECHO_MIN_WORDS,
    'without the fence strip this pair is an echo')
  clause('clause 3ah — neither seam document really carries the whole quotation',
    !seamDocs[0].text.includes(echoHalf2) && !seamDocs[1].text.includes(echoHalf1) &&
    (echoHalf1 + ' ' + echoHalf2).split(' ').length >= CITATION_MIN_WORDS,
    'each document may hold only its own half')
  clause('clause 3ai — the mixed fixture really opens on backticks and really contains a tilde run',
    /^```/.test(mixedText) && /\n~~~\n/.test(mixedText),
    'the inner run must be the other marker')

  clause('clause 3z — the fenced source really carries the words only inside a fence, and as data',
    /^```json\n[\s\S]*\n```$/.test(fencedSourceDocs[0].text) && fencedSourceDocs[0].text.includes(nulQuote) &&
    fencedSourceDocs[0].text.split('\n').filter((l) => !/^```/.test(l)).every((l) => /^\{.*\}$/.test(l)),
    'every line must be either a fence marker or the JSON payload inside it')
  clause('clause 3ad — the list fence really is list-indented and the false closer really carries an info string',
    /^- `{3}/.test(listFenceText) && /^```[a-z]/m.test(falseCloseText) && /not-a-close/.test(falseCloseText),
    'both fixtures must be the shapes their clauses name')
  clause('clause 3ae — the NUL label really contains a NUL, really names a supplied document, and that document really lacks the words',
    nulLabelDocs[2].text.includes(CUT) && !/`named\.md`/.test(nulLabelDocs[2].text) &&
    nulLabelDocs[2].text.split(CUT).join('').includes('`named.md`') &&
    !nulLabelDocs[0].text.includes(nulQuote) && nulLabelDocs[1].text.includes(nulQuote),
    'removing the NUL alone must restore the .md label')
  clause('clause 3aa — the raw-NUL source really carries a NUL and really carries the rule',
    rawNulDocs[0].text.includes(CUT) && rawNulDocs[0].text.split(CUT).join('').includes('alpha beta gamma delta epsilon zeta eta theta'),
    'removing the NUL alone must reveal the rule')
  clause('clause 3ab — the wrapped source really breaks the rule across two lines',
    wrapDocs[0].text.includes('\n') && !wrapDocs[0].text.includes('alpha beta gamma delta epsilon zeta eta theta') &&
    wrapDocs[0].text.replace(/\s+/g, ' ') === 'alpha beta gamma delta epsilon zeta eta theta',
    'only the collapse can join the two halves')
  clause('clause 3ac — the re-quote pair really carries byte-identical long sentences',
    requoteDocs[0].text === requoteDocs[1].text && requoteDocs[0].text.split(' ').length >= ECHO_MIN_WORDS,
    'without the citation strip this pair is an echo')

  clause('clause 3t — the NUL fixture really carries a NUL inside its quotation and nowhere else',
    nulText.split(CUT).length === 2 && nulText.indexOf(CUT) > nulText.indexOf('"') &&
    nulText.indexOf(CUT) < nulText.lastIndexOf('"'),
    'the NUL must sit inside the quoted span')
  clause('clause 3u — the tilde fixture really is tilde-fenced and really carries a citation shape',
    tildeText.startsWith('~~~') && tildeText.trimEnd().endsWith('~~~') && /`[^`]+`'s\s+"/.test(tildeText),
    tildeText.slice(0, 30))
  clause('clause 3v — each side really carries emphasis the other lacks, so only stripping both can match them',
    !normSource.includes(normQuote) && !normSource.replace(/[*_]/g, '').includes(normQuote) &&
    normSource.replace(/[*_]/g, '').includes(normQuote.replace(/[*_]/g, '')) &&
    /\*\*/.test(normQuote) && /_/.test(normSource),
    'stripping one side alone must not be enough')
  clause('clause 3x — the code fixtures really name different terms, differ only there, and stay above the floor without them',
    /`render`/.test(codeSource) && !codeSource.includes('`run`') &&
    snakeDocs[0].text.replace('`run_state`', 'X') === snakeDocs[1].text.replace('`runstate`', 'X') &&
    snakeDocs[0].text !== snakeDocs[1].text &&
    snakeDocs[0].text.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length >= ECHO_MIN_WORDS,
    'length must never be the reason this pair is skipped')
  clause('clause 3w — the item fixture really uses an unbackticked `item N` label',
    /(^|\s)item 3's\s+"/.test(itemText) && !itemText.includes('`item 3`'),
    'the label must be the item alternative, not a backticked one')

  clause('clause 3q — the self-section document really states the rule outside the citation, and the dead one really does not',
    ownDoc.text.toLowerCase().split(ownRuleText).length === 3 &&
    ownDoc.text.toLowerCase().indexOf(ownRuleText) < ownDoc.text.indexOf('`## The brief`\'s') &&
    selfSectionDeadDoc.text.toLowerCase().split(ownRuleText).length === 2 &&
    ownRuleText.split(' ').length >= CITATION_MIN_WORDS,
    'the live document must carry the rule twice, the dead one only inside its quotation')

  clause('clause 3r — the splice fragments really are innocent apart and really spell the rule together',
    !spliceText.replace('"' + spliceQuote + '"', CUT).includes(spliceQuote) &&
    spliceText.replace(/`[^`]*`'s\s+"[^"]*"/, ' ').replace(/\s+/g, ' ').trim() === spliceQuote &&
    spliceQuote.split(' ').length >= CITATION_MIN_WORDS,
    'neither side alone may contain the rule; the two joined must be exactly it')

  clause('clause 3s — the fenced input really is fenced and really carries a citation shape',
    fencedText.startsWith('```') && fencedText.trimEnd().endsWith('```') && /`[^`]+`'s\s+"/.test(fencedText),
    fencedText.slice(0, 40))

  clause('clause 3p — one supplied key really is an exact match and another really ends with it',
    exactDocs.some((d) => d.name === 'doctrine-gauntlet/SKILL.md') &&
    exactDocs.some((d) => d.name !== 'doctrine-gauntlet/SKILL.md' && d.name.endsWith('/doctrine-gauntlet/SKILL.md')),
    exactDocs.map((d) => d.name).join(','))

  clause('clause 3o — exactly one of the two path-prefixed copies really carries the cited words',
    prefixedDocs.filter((d) => d.text.includes(ambiguousQuote)).length === 1 &&
    prefixedDocs.filter((d) => d.name.endsWith('/SKILL.md')).length === 2,
    prefixedDocs.map((d) => d.name + '=' + d.text.includes(ambiguousQuote)).join(','))

  clause('clause 3k — the bolded and standalone forms really are the same claim, differing only by what precedes it',
    bolded.endsWith(line) && bolded !== line && line.split(' ').length >= ECHO_MIN_WORDS,
    `words=${line.split(' ').length}`)

  process.exit(bad ? 1 : 0)
}

const findings = check(loadRepo())
for (const f of findings) console.log(f)
console.log(`\n${findings.length} finding(s)`)
process.exit(findings.length ? 1 : 0)
