// Gate for the one artifact in this repo that had none: the prose.
//
// The harness code has tamper fixtures: `round.tamper.json` for the workflow script, and the
// clauses `floor.md` defines for the floor. Both are run by hand. The documents beside it were
// checked only by reading, which is why every hard finding across five review rounds was a claim
// that had gone stale rather than a defect in the code. Each of those
// failures was mechanically detectable. This is the detector.
//
//   node tools/doc-check.mjs            run the gate over the repo
//   node tools/doc-check.mjs --selftest three-clause tamper test, per CLAUDE.md
//
// Exit 0 clean, 1 on any finding, and 2 when `--selftest` could not load its sidecar and so ran no
// clause at all. It reports; it never edits.
//
// Two files. This one holds the checker; `doc-check.selftest.mjs` holds the clauses that test it and
// says why they are not here. The gate runs without it; only `--selftest` loads it.
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
// `` `## Section`'s "quote" ``, `item 3's "quote"`. A quote used as a template string an agent must emit verbatim, as an
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
// source, and a document that is very largely quotation is exactly that case.
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
/** Strips everything a reader would not read as prose: HTML comments and fenced blocks, each
    replaced by a CUT so the text on either side never becomes adjacent. */
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
/** Reduces a text to the form two claims are compared in: emphasis and case dropped, whitespace
    collapsed, code spans kept verbatim. */
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
//
// The five ways a sentence can end, in the order the alternation tries them:
//   1. terminal punctuation, with trailing quotes and emphasis pulled along
//   2. a blank line
//   3. the next bullet
//   4. the next numbered item
//   5. the next table row, however deeply nested in quotes or lists
// Written as one literal rather than a joined array of commented parts: a literal is checked by the
// parser on every run, where a constructed pattern is checked by nothing here.
const SENTENCE_BOUNDARY = /(?<=[.!?][*_"')\]]*)\s+|\n\n+|\n(?=\s*[-*+]\s)|\n(?=\s*\d+[.)]\s)|\n(?=(?:[ \t]*(?:>|[-*+][ \t]|\d+[.)][ \t]))*[ \t]*\|)/

/** Splits prose into sentence-like units. Two checks count against these, the roster/dangling pass
    and the echo pass; derivation reads fixture objects and the anchor pass scans whole prose. */
const sentences = (text) => text.split(SENTENCE_BOUNDARY).map((s) => s.trim()).filter(Boolean)
/** Every backticked span in a text, contents only, in source order. */
const ticked = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
// A fixture name is lowercase-hyphenated with no dot or slash — `clean-exits`, not `floor.md`.
/** True when a token could name a fixture. Shape only; says nothing about whether one exists. */
const fixtureShaped = (t) => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(t)

// What every check runs against.

/** The fixture names, `_readme` excluded because it is prose rather than a fixture. */
const fixtureKeys = (tamper) => Object.keys(tamper).filter((k) => k !== '_readme')

/** Assembles what every check runs against, from the corpus the header defines: `.md` under
    `skills/`, plus the `_note` and `_readme` prose inside the fixture file. Root files such as
    CLAUDE.md and README.md are outside it. */
function buildCorpus(keys, tamper, docs) {
  const noted = keys.filter((k) => tamper[k]._note).map((k) => ({
    name: `round.tamper.json → ${k}._note`, text: tamper[k]._note,
  }))
  const sources = [...docs, ...noted]
  if (tamper._readme) sources.push({ name: 'round.tamper.json → _readme', text: tamper._readme })
  return sources
}

/** The set of source names that name at least one real fixture, and are therefore documents *about*
    fixtures. Without this scoping, `background-image`, `data-theme`, `max-w-3xl` and every skill
    name are fixture-shaped and the dangling check drowns in them. Derived from the corpus, so
    there is no allowlist to rot. */
function documentsAboutFixtures(sources, keySet) {
  return new Set(sources
    .filter((src) => ticked(prose(src.text)).some((t) => keySet.has(t) && fixtureShaped(t)))
    .map((s) => s.name))
}

// The five checks. Each returns its own findings rather than pushing into a shared array, so
// none of them can silently depend on what another one did first.

/** The rule the documents tell readers to use, asserted against the fixture file itself. If this
    ever fails, every "known-good" claim downstream is unmoored. */
function checkDerivation(keys, tamper) {
  return keys
    .filter((k) => !(tamper[k].expect && 'clean' in tamper[k].expect))
    .map((k) => `derivation: fixture \`${k}\` has no \`clean\` in its expect — the known-good rule cannot classify it`)
}

/** Roster and dangling, together and in this order on purpose. Both read the same sentence, and a
    document carrying one of each reports them interleaved. Splitting these into two passes would
    reorder real findings, and no clause below pins that, so this comment is the only thing keeping
    it. */
function checkFixtureReferences(sources, keySet) {
  const aboutFixtures = documentsAboutFixtures(sources, keySet)
  const findings = []
  for (const src of sources) {
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
  return findings
}

/** An anchor must still resolve in source prose somewhere: outside the citation, though not
    necessarily outside the citing document. A citation whose source has moved on is worse than no
    citation, because the reader greps it, finds nothing, and cannot tell whether the rule was
    deleted or merely reworded. A rule that stated this about itself, with nothing enforcing it, sat
    cited for ten rounds after the quote was deleted.

    On the NUL handling, which is the same rule in three places and is stated once here. Raw NULs
    come out of a text BEFORE anything inserts one. Afterwards, the strip would erase the marks
    `prose()` just left where a fence or comment was removed, and the words on either side of the
    removal would become adjacent again — which is exactly what the mark exists to prevent. That
    applies to the searchable text, to the label, and to the quotation alike. */
function checkAnchors(sources) {
  const findings = []
  const searchable = new Map(sources.map((o) =>
    [o.name, comparable(prose(o.text.split(CUT).join('')).replace(ATTRIBUTED, CUT))]))

  for (const src of sources) {
    for (const m of prose(src.text).matchAll(ATTRIBUTED)) {
      const label = (m[1] || m[2]).split(CUT).join('')
      const quote = comparable(m[3].split(CUT).join(''))
      // Too short to be distinctive, or elided, so it cannot be matched against anything.
      if (quote.split(' ').length < CITATION_MIN_WORDS || quote.includes('…') || quote.includes('...')) continue

      // A label ending in `.md` names a document, so the citation resolves against that one document
      // and nothing else. Searching the whole corpus instead passes a citation whose words happen to
      // appear in an unrelated file, which is a false clean on the one check whose entire job is
      // provenance. A section heading or an item number names a place inside some document without
      // saying which, so those keep the corpus-wide search — the weaker test, recorded in the header.
      const target = resolveLabel(label, searchable)

      // A `.md` label the corpus does not hold names a document this gate cannot read. It may be a
      // live file outside `skills/` or a path that no longer exists, and nothing here can tell those
      // apart, so the citation is not judged either way.
      if (target && target.length === 0) continue
      if (target && target.length > 1) {
        findings.push(`anchor: ${src.name} attributes a quotation to \`${label}\`, which names ${target.length} documents (${target.join(', ')}) — the citation cannot resolve against one of them`)
        continue
      }
      const haystack = target ? searchable.get(target[0]) : [...searchable.values()].join(CUT)
      if (!haystack.includes(quote)) {
        findings.push(target
          ? `anchor: ${src.name} quotes "${quote.slice(0, 70)}" as \`${label}\`'s words, and \`${label}\` does not contain it`
          : `anchor: ${src.name} quotes "${quote.slice(0, 70)}" as ${label}'s words, and no document in the corpus contains it outside a citation`)
      }
    }
  }
  return findings
}

/** Which documents a citation label points at. Returns null for a label that names no document —
    a section heading or an item number — which is the caller's signal to search the whole corpus
    instead. Otherwise an array: empty when the label resolves nowhere in the corpus, longer than
    one when it is ambiguous. */
function resolveLabel(label, searchable) {
  if (!/\.md$/.test(label)) return null
  if (searchable.has(label)) return [label]
  return [...searchable.keys()].filter((n) => n.endsWith('/' + label) || label === CORPUS_ROOT + n)
}

/** A claim restated in two places is an unversioned fork: correcting one cannot reach the other.
    Fences and attributed citations come out first, and the citation is replaced by the same CUT the
    anchor path uses. This corpus is told to re-quote rather than echo, so two documents citing one
    rule are obeying that; a space here instead would splice the halves around a citation into a
    claim nobody wrote. */
function checkEchoes(sources) {
  const placesByClaim = new Map()
  for (const src of sources) {
    for (const s of sentences(prose(src.text).replace(ATTRIBUTED, CUT))) {
      const claim = comparable(s)
      if (claim.split(' ').length < ECHO_MIN_WORDS) continue
      if (!placesByClaim.has(claim)) placesByClaim.set(claim, [])
      placesByClaim.get(claim).push(src.name)
    }
  }
  const findings = []
  for (const [claim, where] of placesByClaim) {
    if (where.length > 1) {
      findings.push(`echo: the same ${claim.split(' ').length}-word claim appears in ${where.length} places (${where.join('; ')}) — "${claim.slice(0, 70)}…"`)
    }
  }
  return findings
}

// The gate itself.

/** Runs every check over one corpus and returns the findings as printable strings, in the order
    they are reported. Pure: it reads nothing and writes nothing. The order below is the output
    contract. Nothing standing verifies it: every selftest clause asserts a single finding, so none
    of them can observe an ordering at all. */
function check({ tamper, docs }) {
  const keys = fixtureKeys(tamper)
  // Derivation first, which is the order the reads happened in before this was split up.
  const derivation = checkDerivation(keys, tamper)
  const sources = buildCorpus(keys, tamper, docs)
  return [
    ...derivation,
    ...checkFixtureReferences(sources, new Set(keys)),
    ...checkAnchors(sources),
    ...checkEchoes(sources),
  ]
}

/** Every `.md` path under a directory, recursively. */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith('.md') ? [path.join(dir, e.name)] : []))

/** Reads the fixture file and the whole `.md` corpus off disk. The only function here that does I/O. */
function loadRepo() {
  const tamper = JSON.parse(fs.readFileSync(path.join(GAUNTLET, 'harness/round.tamper.json'), 'utf8'))
  const docs = walk(SKILLS).map((f) => ({ name: path.relative(SKILLS, f), text: fs.readFileSync(f, 'utf8') }))
  return { tamper, docs }
}

if (process.argv.includes('--selftest')) {
  // Exit 2, distinct from the 1 a failing clause gives, so "the tamper test failed" and "the tamper
  // test never ran" are never the same signal. A sidecar that has gone missing is the quiet
  // direction: the gate itself still exits 0 while its own test silently stops existing.
  const sidecar = await import('./doc-check.selftest.mjs').catch((e) => {
    console.error(`doc-check: the selftest sidecar did not load — ${e.message}`)
    console.error('doc-check: tools/doc-check.selftest.mjs must sit beside this file. No clause ran.')
    process.exit(2)
  })
  process.exit(sidecar.runSelftest({ check, CUT, ECHO_MIN_WORDS, CITATION_MIN_WORDS }))
}

const findings = check(loadRepo())
for (const f of findings) console.log(f)
console.log(`\n${findings.length} finding(s)`)
process.exit(findings.length ? 1 : 0)
