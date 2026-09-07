// A gate over the ONE defect class this repo keeps re-finding by review round.
//
//   node tools/herdr-lint.mjs              # exit 0 clean, 1 on any finding
//   node tools/herdr-lint.mjs --selftest   # its three-clause tamper test, exit 2 if the sidecar is missing
//
// The class, in the words three separate rounds have used for it: a herdr reply whose FAILURE or
// whose EMPTINESS is read as an answer that authorizes destruction. "It is gone", "I could not
// look", and "that reply carried nothing" are three different answers, and collapsing any of them
// into another is how this codebase closes the pane the user is watching.
//
// It has been diagnosed in three consecutive rounds and repaired by hand each time, at nine
// separate sites. The instrument was named in the run record every time and built none of them,
// which is why round 2 found two more of it in the one hooks file the previous sweep never opened.
// A finding class a script can catch is caught by the script from then on, never by a review round.
//
// WHAT IT CHECKS
//
//   E1 unseparated failure — a `try` containing a herdr call whose `catch` body names no not-found
//      predicate. The catch cannot be distinguishing "gone" from "could not look", because it has
//      nothing to distinguish them with.
//
//   E2 unseparated emptiness — a herdr reply's `.result...` navigated straight into a truthiness
//      test (a ternary, a `!`, an `&&`/`||`, an `if`). A reply carrying `result` but not the field
//      is not the same as a field that is absent, and truthiness cannot tell them apart. This is
//      the half that stayed broken at dctr-pane.mjs:243 through three rounds of sweeping the other
//      half, because every reviewer was looking at catch blocks.
//
// WHAT IT DOES NOT CHECK, and this list is the honest part:
//
//   - Whether the separation a catch DOES make is the right one. `isPaneNotFound` where
//     `isTabNotFound` was meant satisfies this lint and is still a defect; a mutation entry is what
//     catches that, and dctr-mutations.mjs carries one.
//   - Whether a decision downstream of a correctly-separated call is correct.
//   - Anything in a selftest. Fixtures deliberately drive degenerate replies; that is their job.
//   - Data flow. It reads text, not a syntax tree, so it cannot see a herdr result stored in one
//     function and consumed as a decision in another.
//   - A COMMAND whose failure matters. It only judges reads (`.result`), because a rename that fails
//     loses a label and decides nothing. The gate launcher's `child.on('error')` orphaning a pane is
//     a real instance of the same family and this lint cannot see it: there is no herdr call there
//     at all. Round 2 found that one by reading. Do not read a clean run as covering it.
//
// SUPPRESSION. Not every herdr call decides something. A rename is display, and display failing is
// not a decision. Put `herdr-lint: <reason>` in a comment on the call's line or the line above it.
// The reason is required and is the point: it makes "this one is display only" a written claim a
// reader can check, instead of a bare catch that looks identical to the defect.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOOKS = path.join(HERE, '..', 'hooks')

/** Shipping hook code. Selftests are excluded by design: a fixture's whole job is to answer with the
 *  degenerate replies this lint exists to make the shipping side handle. */
export const isShipping = (name) =>
  name.endsWith('.mjs') && !name.includes('.selftest.') && name !== 'dctr-mutations.mjs'
// dctr-mutations.mjs is excluded because it is a DATA file: its entries quote hook source as strings,
// and a text scanner reads those quotes as code. Seventeen of the first run's thirty-two findings
// were mutation payloads. It calls herdr nowhere itself.

/** The predicates that turn an error into an ANSWER. A catch naming none of these has not separated
 *  anything, whatever its comment claims. */
const SEPARATORS = /isPaneNotFound|isTabNotFound|alreadyGone|NOT_FOUND|notFound/

export const isSuppressed = (line, prev) => /herdr-lint:\s*\S/.test(line) || /herdr-lint:\s*\S/.test(prev || '')

/**
 * E2: a herdr reply navigated into a truthiness test. Matches `herdr(...).result` followed by any
 * property access, then a `?`, or preceded by `!`. Deliberately narrow: it wants the reply and the
 * test on ONE line, which is how every instance in this repo has been written, and it would rather
 * miss a split-line one than cry wolf on every `.result` read in the file.
 */
export const emptinessFinding = (line) => {
  const stripped = line.replace(/\/\/.*$/, '')
  if (!/herdr\s*\(/.test(stripped)) return null
  // `?.` is the separated form and must not match; a bare `.result.x ?` or `!herdr(...)...` is not.
  const ternary = /herdr\s*\([^)]*\)[^?\n]*\.result[^?\n]*\?[^.]/.test(stripped)
  const negated = /!\s*herdr\s*\(/.test(stripped)
  if (!ternary && !negated) return null
  return ternary
    ? 'a herdr reply is navigated straight into a ternary: a reply carrying `result` but not the field reads as a definite answer'
    : 'a herdr reply is negated directly: a reply carrying no field reads as a definite absence'
}

/**
 * E1: walk the file tracking `try {` / `catch` pairs by brace depth. A try whose body calls herdr and
 * whose catch names no separator is the finding. Brace counting rather than a parser because this
 * file must run with nothing installed, which is the same reason doc-check.mjs reads text.
 */
export const failureFindings = (src) => {
  const lines = src.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!/\btry\s*\{/.test(lines[i])) continue
    let depth = 0, j = i, sawHerdr = false, sawRead = false, started = false
    for (; j < lines.length; j++) {
      const code = lines[j].replace(/\/\/.*$/, '')
      if (/herdr\s*\(/.test(code)) sawHerdr = true
      if (/herdr\s*\([^)]*\)[^\n]*\.result/.test(code)) sawRead = true
      for (const ch of code) {
        if (ch === '{') { depth++; started = true }
        else if (ch === '}') depth--
      }
      if (started && depth <= 0) break
    }
    // A READ decides; a COMMAND does not. `herdr(['pane','rename',...])` failing loses a label, and
    // that is not a decision anyone acts on. `pane = herdr(['pane','get',...]).result.pane` is the
    // shape every instance of this class has had. Requiring `.result` in the try is what separates
    // them, and it is why the first run flagged twenty display-only renames.
    if (!sawHerdr || !sawRead) continue
    // The catch is on the closing line or the one after it.
    const tail = `${lines[j] || ''}\n${lines[j + 1] || ''}`
    if (!/\bcatch\b/.test(tail)) continue
    // Read the catch body: from the catch to its own closing brace, same walk.
    let cd = 0, k = j, body = '', begun = false
    for (; k < lines.length && k < j + 40; k++) {
      const code = lines[k]
      if (begun || /\bcatch\b/.test(code)) { body += `${code}\n`; begun = true } else continue
      for (const ch of code.slice(code.indexOf('catch') >= 0 ? code.indexOf('catch') : 0)) {
        if (ch === '{') cd++
        else if (ch === '}') cd--
      }
      if (cd <= 0 && /\{/.test(body)) break
    }
    if (SEPARATORS.test(body)) continue
    // Honoured at the line this finding REPORTS (the try's opening) or the line above it, as well as
    // in the catch body. An earlier revision checked only the closing brace, so the report pointed at
    // one line and the suppression had to go on another — a check whose own contract misdirects the
    // reader is the shape of defect this repo builds instruments to stop.
    if (isSuppressed(lines[i] || '', lines[i - 1] || '')) continue
    if (isSuppressed(lines[j] || '', lines[j - 1] || '') || isSuppressed(body, '')) continue
    out.push({ line: i + 1, why: 'a try calling herdr whose catch names no not-found predicate: it cannot be telling "it is gone" from "I could not look"' })
  }
  return out
}

export function scan(dir = HOOKS) {
  const findings = []
  for (const name of fs.readdirSync(dir).filter(isShipping).sort()) {
    const src = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const f of failureFindings(src)) findings.push({ file: name, ...f, rule: 'E1' })
    src.split('\n').forEach((line, n) => {
      if (isSuppressed(line, src.split('\n')[n - 1])) return
      const why = emptinessFinding(line)
      if (why) findings.push({ file: name, line: n + 1, why, rule: 'E2' })
    })
  }
  return findings
}

if (process.argv[2] === '--selftest') {
  // Exit 2, distinct from the 1 a failing clause gives, so "the tamper test failed" and "the tamper
  // test never ran" are never the same signal. The sidecar is CALLED with its dependencies rather
  // than importing them back: an import here is a cycle, and a cycle into a module suspended at a
  // top-level await deadlocks and prints nothing.
  const mod = await import('./herdr-lint.selftest.mjs').catch((e) => {
    console.error(`herdr-lint: the selftest sidecar did not load — ${e.message}`)
    console.error('herdr-lint: tools/herdr-lint.selftest.mjs must sit beside this file. No clause ran.')
    process.exit(2)
  })
  process.exit(mod.default({ scan, emptinessFinding, failureFindings, isShipping, isSuppressed }))
} else if (process.argv[1] && process.argv[1].endsWith('herdr-lint.mjs')) {
  const findings = scan()
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}] ${f.why}`)
  console.log(`\n${findings.length} finding(s)`)
  process.exit(findings.length ? 1 : 0)
}
