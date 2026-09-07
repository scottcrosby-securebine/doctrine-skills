// Three-clause tamper test for tools/herdr-lint.mjs, per CLAUDE.md: break the thing and confirm the
// check trips, run it against a known-good artifact and confirm it stays quiet, and PROVE the broken
// fixture really carries the defect independently of the check.
//
// The third clause is the one that matters here. This lint's whole claim is that it can tell a
// separated herdr read from an unseparated one, and a lint that silently matched nothing would print
// exactly what a clean run prints. So clause 3 evaluates the fixture's own logic with a stub herdr
// and shows the broken form really does answer "gone" for a reply that answered nothing, with the
// linter never called.

// Dependencies arrive as an ARGUMENT, never as an import, for the same reason doc-check's sidecar
// does it: importing the checker here forms a cycle, and a cycle whose importer is suspended at a
// top-level await deadlocks. Node then reports exit 13 and an "unsettled top-level await" warning
// and prints NO clause results at all — a tamper test that silently stops running, which is the one
// failure mode a tamper test must not have.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export default function selftest({ scan, emptinessFinding, failureFindings, isShipping, isSuppressed }) {

let failed = 0
const clause = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) { failed = 1; if (detail) console.log(`      ${detail}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-lint-selftest-'))

// ---------------------------------------------------------------- clause 1: it trips
const BROKEN_E2 = `
import { herdr } from './dctr-state.mjs'
function askPane(paneId) {
  try { return herdr(['pane', 'get', paneId]).result.pane ? 'live' : 'gone' }
  catch (e) { return isPaneNotFound(e) ? 'gone' : 'unknowable' }
}
`
const BROKEN_E1 = `
import { herdr } from './dctr-state.mjs'
function sweep(id) {
  let rec
  try {
    rec = herdr(['pane', 'get', id]).result.pane
  } catch { rec = null }
  if (!rec) destroy(id)
}
`
// THE SAME DEFECT WITH THE CATCH ON MORE THAN ONE LINE, which is the ordinary way it is written.
// BROKEN_E1 above puts the catch on one physical line, and that was the only shape E1 could see: the
// walk tested its brace depth after the whole line, so `} catch (e) {` netted back up and the walk
// ran past the catch to the catch's own closing brace, where the tail test found no `catch` and
// dropped the block. Five real blocks in `hooks/` were discarded that way. A fixture that differs
// from the one above ONLY in line breaks is what makes that visible.
const BROKEN_E1_MULTILINE = `
import { herdr } from './dctr-state.mjs'
function sweepAgain(id) {
  let rec
  try {
    rec = herdr(['pane', 'get', id]).result.pane
  } catch (e) {
    rec = null
  }
  if (!rec) destroy(id)
}
`
fs.writeFileSync(path.join(tmp, 'dctr-broken2.mjs'), BROKEN_E2)
fs.writeFileSync(path.join(tmp, 'dctr-broken1.mjs'), BROKEN_E1)
fs.writeFileSync(path.join(tmp, 'dctr-broken3.mjs'), BROKEN_E1_MULTILINE)
const tripped = scan(tmp)
clause('clause 1a: an unseparated SUCCESS half (the ternary) is reported',
  tripped.some((f) => f.rule === 'E2' && f.file === 'dctr-broken2.mjs'),
  JSON.stringify(tripped))
clause('clause 1b: an unseparated FAILURE half (a catch naming no predicate) is reported',
  tripped.some((f) => f.rule === 'E1' && f.file === 'dctr-broken1.mjs'),
  JSON.stringify(tripped))
clause('clause 1c: and the same defect with the catch spread over several lines is reported too, which is how it is normally written',
  tripped.some((f) => f.rule === 'E1' && f.file === 'dctr-broken3.mjs'),
  JSON.stringify(tripped))

// ---------------------------------------------------------------- clause 2: it stays quiet
const FIXED = `
import { herdr } from './dctr-state.mjs'
function askPane(paneId) {
  try {
    const reply = herdr(['pane', 'get', paneId]).result
    if (reply && typeof reply === 'object' && 'pane' in reply) return reply.pane ? 'live' : 'gone'
    return 'unknowable'
  }
  catch (e) { return isPaneNotFound(e) ? 'gone' : 'unknowable' }
}
`
const SUPPRESSED = `
import { herdr } from './dctr-state.mjs'
function place() {
  let layout
  // herdr-lint: creation, not destruction. An unreadable layout falls to the tab path.
  try { layout = herdr(['pane', 'layout']).result.layout.panes } catch { layout = null }
  return layout
}
`
const quiet = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-lint-quiet-'))
fs.writeFileSync(path.join(quiet, 'dctr-fixed.mjs'), FIXED)
fs.writeFileSync(path.join(quiet, 'dctr-suppressed.mjs'), SUPPRESSED)
const stayed = scan(quiet)
clause('clause 2a: the repaired form is NOT reported', stayed.length === 0, JSON.stringify(stayed))

// The known-good corpus is the real one. This is the clause that caught the rule being too broad:
// the first draft reported thirty-two findings here, seventeen of them mutation payloads.
const live = scan()
clause('clause 2b: and the repo\'s own shipping hooks are clean', live.length === 0,
  live.map((f) => `${f.file}:${f.line} [${f.rule}]`).join(' | '))

clause('clause 2c: a selftest and the mutation DATA file are out of scope, by name',
  !isShipping('dctr-seat.selftest.mjs') && !isShipping('dctr-mutations.mjs') && isShipping('dctr-seat.mjs'),
  'a fixture answering degenerate replies is doing its job, and a file of quoted source is not code')

// ---------------------------------------------------------------- clause 3: the fixture really is broken
// No linter is called here. The broken and repaired forms are executed against a stub herdr that
// answers the way a real one can: a reply carrying `result` but no `pane` at all.
const stubReplyWithoutPane = { result: {} }
const brokenAsk = (reply) => (reply.result.pane ? 'live' : 'gone')
const fixedAsk = (reply) => {
  const r = reply.result
  if (r && typeof r === 'object' && 'pane' in r) return r.pane ? 'live' : 'gone'
  return 'unknowable'
}
clause('clause 3a: the broken form really answers "gone" for a reply that answered nothing — proved without the checker',
  brokenAsk(stubReplyWithoutPane) === 'gone',
  `got ${brokenAsk(stubReplyWithoutPane)}`)
clause('clause 3b: and the repaired form really answers "unknowable" for the same reply',
  fixedAsk(stubReplyWithoutPane) === 'unknowable',
  `got ${fixedAsk(stubReplyWithoutPane)}`)
clause('clause 3c: both still agree on a reply that DOES carry a pane, so 3a is about emptiness and not about breaking the read',
  brokenAsk({ result: { pane: { id: 'p1' } } }) === 'live' && fixedAsk({ result: { pane: { id: 'p1' } } }) === 'live' &&
  brokenAsk({ result: { pane: null } }) === 'gone' && fixedAsk({ result: { pane: null } }) === 'gone',
  'without this, clause 3a could pass because the repaired form is simply broken differently')

// The same third clause for E1, which had none: clauses 1b and 1c prove the CHECKER reports those
// fixtures, and 3f proves it stays quiet without a herdr call, but nothing showed the E1 fixtures
// carry a real defect. No linter is called below. Both forms run against a stub herdr that throws
// the way a real one does when the server is unreachable, which is not a not-found answer.
const throwsTransport = () => { throw new Error('no route to server') }
const answersPane = () => ({ result: { pane: { pane_id: 'p1' } } })
const isNotFoundStub = () => false   // a transport error carries no not-found code
const brokenSweep = (call) => { let rec; try { rec = call().result.pane } catch { rec = null } ; return rec ? 'kept' : 'destroyed' }
const fixedSweep = (call) => {
  let rec, gone = false
  try { rec = call().result.pane } catch (e) { gone = isNotFoundStub(e) }
  return gone ? 'destroyed' : 'kept'
}
clause('clause 3g: the E1 fixture shape really destroys a live pane when the lookup merely FAILED — proved without the checker',
  brokenSweep(throwsTransport) === 'destroyed',
  `got ${brokenSweep(throwsTransport)}`)
clause('clause 3h: and the separated form really keeps it for the same failure',
  fixedSweep(throwsTransport) === 'kept',
  `got ${fixedSweep(throwsTransport)}`)
clause('clause 3i: both still agree on a reply that DOES carry a pane, so 3g is about the failure and not about breaking the read',
  brokenSweep(answersPane) === 'kept' && fixedSweep(answersPane) === 'kept',
  'without this, 3g could pass because the broken form never keeps anything')
clause('clause 3j: the two E1 fixtures really differ ONLY in line breaks, so clause 1c isolates the multi-line catch',
  BROKEN_E1.replace(/\s+/g, ' ').replace('sweep(', 'X(') === BROKEN_E1_MULTILINE.replace(/\s+/g, ' ').replace('sweepAgain(', 'X(').replace('catch (e)', 'catch'),
  'if they differed in substance, 1c would be measuring something other than the line breaks')

// The two pure helpers, so a rule change that stops matching anything is visible.
clause('clause 3d: emptinessFinding really discriminates, on strings alone',
  emptinessFinding("return herdr(['pane','get',id]).result.pane ? 'live' : 'gone'") !== null &&
  emptinessFinding("const r = herdr(['pane','get',id]).result") === null &&
  emptinessFinding("const x = 1 ? 2 : 3") === null,
  'a rule matching everything and a rule matching nothing both print what a clean run prints')
clause('clause 3e: isSuppressed requires a REASON, not a bare marker',
  isSuppressed('// herdr-lint: because X', '') && !isSuppressed('// herdr-lint:', '') && !isSuppressed('// nothing', ''),
  'a bare marker would let a site opt out while documenting nothing')
clause('clause 3f: failureFindings finds nothing in a try that never calls herdr',
  failureFindings('try {\n  const x = read()\n} catch { x = null }\n').length === 0,
  'the rule must key on the herdr call, not on try/catch')

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(quiet, { recursive: true, force: true })
console.log(failed ? '\nSOME CLAUSES FAILED' : '\nall clauses passed')
return failed
}
