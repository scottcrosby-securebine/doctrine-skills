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
// THE SAME CLASS IN herdr-core (issue #111): a herdr-app listing that FAILED read as "that pane is gone", and a status
// whose focus came back unknown (null) read as "nobody is looking".
const BROKEN_HC_E1 = `
import { appPanes } from './dctr-host.mjs'
function sweepCore(id) {
  let present
  try {
    present = appPanes().some((x) => x.pane === id)
  } catch {
    present = false
  }
  if (!present) destroy(id)
}
`
const BROKEN_HC_E2 = `
import { appFocus } from './dctr-host.mjs'
function watcher() { return appFocus().pane ? 'someone' : 'nobody' }
`
const BROKEN_HC_E2_GET = `
function runs(id) { return hcGet(id).state ? 'running' : 'over' }
`
const BROKEN_HC_E2_NOT = `
function over(id) { return !hcGet(id).state }
`
const FIXED_HC_E2 = `
function runsFixed(id) {
  const t = hcGet(id)
  if (t.state !== 'live' && t.state !== 'finished') throw new Error('no state')
  return t.state === 'live'
}
`
const FIXED_HC = `
import { appPanes } from './dctr-host.mjs'
function sweepCoreFixed(id) {
  let present
  try {
    present = appPanes().some((x) => x.pane === id)
  } catch (e) {
    if (isAppNotFound(e, 'pane')) present = false
    else throw e
  }
  if (present === false) destroy(id)
}
`
// THE SAME CLASS ONE LAYER UP (round 1 S1): the seat hook and the gate launcher decide on the seam's answers, so a
// catch around a seam read that turns "I could not look" into an absence is the defect at the caller.
const BROKEN_SEAM = `
function stopSeam(host, id) {
  let info
  try {
    info = host.paneInfo(id)
  } catch {
    info = { exists: false }
  }
  if (!info.exists) dropMarker(id)
}
`
const FIXED_SEAM = `
function stopSeamFixed(host, id) {
  let info = null
  // herdr-lint: a lookup that throws leaves info null, which drops nothing.
  try { info = host.paneInfo(id) } catch { info = null }
  if (info && !info.exists) dropMarker(id)
}
`
// The pane launcher's recorder check, and hc's own reader under it (issue #111, phase B): a lookup that FAILED read as "the
// recorder is running" lets a write through to whatever the pane now runs.
const BROKEN_REC = `
function writeRec(host, id) {
  let alive
  try {
    alive = host.recorderAlive(id)
  } catch {
    alive = true
  }
  if (alive) send(id)
}
`
const BROKEN_HCGET = `
function writeHc(id) {
  let alive
  try {
    alive = hcGet(id).state === 'live'
  } catch {
    alive = true
  }
  if (alive) send(id)
}
`
const FIXED_REC = `
function writeRecFixed(host, id) {
  let alive = false
  try { alive = host.recorderAlive(id) } catch (e) { if (!isPaneNotFound(e)) throw e }
  if (alive) send(id)
}
function writeHcFixed(id) {
  let alive = false
  try { alive = hcGet(id).state === 'live' } catch (e) { if (!isHcNotFound(e)) throw e }
  if (alive) send(id)
}
`
fs.writeFileSync(path.join(tmp, 'dctr-brokenrec.mjs'), BROKEN_REC)
fs.writeFileSync(path.join(tmp, 'dctr-brokenhcget.mjs'), BROKEN_HCGET)
const PANE_SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'dctr-pane.mjs'), 'utf8')
fs.writeFileSync(path.join(tmp, 'dctr-panebare.mjs'), PANE_SRC.replace(/herdr-lint:/g, 'was-lint:'))
fs.writeFileSync(path.join(tmp, 'dctr-brokenseam.mjs'), BROKEN_SEAM)
const SEAT_SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'dctr-seat.mjs'), 'utf8')
fs.writeFileSync(path.join(tmp, 'dctr-seatbare.mjs'), SEAT_SRC.replace(/herdr-lint:/g, 'was-lint:'))
const GATE_SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'dctr-gate.mjs'), 'utf8')
fs.writeFileSync(path.join(tmp, 'dctr-gatebare.mjs'), GATE_SRC.replace(/herdr-lint:/g, 'was-lint:'))
fs.writeFileSync(path.join(tmp, 'dctr-brokenhc1.mjs'), BROKEN_HC_E1)
fs.writeFileSync(path.join(tmp, 'dctr-brokenhc2.mjs'), BROKEN_HC_E2)
fs.writeFileSync(path.join(tmp, 'dctr-brokenhc3.mjs'), BROKEN_HC_E2_GET)
fs.writeFileSync(path.join(tmp, 'dctr-brokenhc4.mjs'), BROKEN_HC_E2_NOT)
// The real seam with its written reasons taken out: the rule must reach the herdr-core sites in shipping code, not only
// a fixture shaped for it.
const SEAM = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'dctr-host.mjs'), 'utf8')
fs.writeFileSync(path.join(tmp, 'dctr-hostbare.mjs'), SEAM.replace(/herdr-lint:/g, 'was-lint:'))
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

clause('clause 1d: a herdr-core listing whose FAILURE is read as an absence is reported (E1)',
  tripped.some((f) => f.rule === 'E1' && f.file === 'dctr-brokenhc1.mjs'), JSON.stringify(tripped))
clause('clause 1e: a herdr-core read navigated into a ternary is reported (E2)',
  tripped.some((f) => f.rule === 'E2' && f.file === 'dctr-brokenhc2.mjs'), JSON.stringify(tripped))
clause('clause 1j: an hc get navigated into a ternary, and one negated, are each reported (E2)',
  ['dctr-brokenhc3.mjs', 'dctr-brokenhc4.mjs'].every((n) => tripped.some((f) => f.rule === 'E2' && f.file === n)), JSON.stringify(tripped))
// Each finding's line and the one after it, since a try whose body starts on the next line is reported at `try {`.
const bare = tripped.filter((f) => f.file === 'dctr-hostbare.mjs').map((f) => SEAM.split('\n').slice(f.line - 1, f.line + 1).map((l) => l.trim()).join(' '))
clause('clause 1f: the real seam with its reasons removed is reported at its herdr-core reads (self and layout), so the rule reaches shipping code',
  bare.some((l) => /appPanes\(\)\.find\(\(x\) => x\.terminal/.test(l)) && bare.some((l) => /^try \{ const rows = appPanes\(\)$/.test(l)),
  JSON.stringify(bare))

clause('clause 1g: a catch around a SEAM read that turns a failed lookup into an absence is reported (E1)',
  tripped.some((f) => f.rule === 'E1' && f.file === 'dctr-brokenseam.mjs'), JSON.stringify(tripped))
const seatBare = tripped.filter((f) => f.file === 'dctr-seatbare.mjs').map((f) => SEAT_SRC.replace(/herdr-lint:/g, 'was-lint:').split('\n')[f.line - 1].trim())
const gateBare = tripped.filter((f) => f.file === 'dctr-gatebare.mjs').map((f) => GATE_SRC.replace(/herdr-lint:/g, 'was-lint:').split('\n')[f.line - 1].trim())
clause('clause 1h: the real seat hook and gate launcher with their reasons removed are reported at their seam reads and closes, so the rule reaches the decisions behind the seam in both callers',
  seatBare.some((l) => /host\.paneInfo\(seat\.paneId\)/.test(l)) && seatBare.some((l) => /host\.closePane\(seat\.paneId, seat\.terminal\)/.test(l)) && seatBare.length >= 10 &&
  gateBare.some((l) => /host\.paneInfo\(paneId\)/.test(l)) && gateBare.some((l) => /host\.closePane\(paneId\)/.test(l)),
  JSON.stringify({ seatBare, gateBare }))

const paneBare = tripped.filter((f) => f.file === 'dctr-panebare.mjs').map((f) => PANE_SRC.split('\n').slice(f.line - 1, f.line + 1).map((l) => l.trim()).join(' '))
clause('clause 1i: a recorder check, or hc\'s reader under it, whose FAILURE is read as alive is reported (E1), and the real pane launcher with its reasons removed is reported at its pane lookups',
  ['dctr-brokenrec.mjs', 'dctr-brokenhcget.mjs'].every((n) => tripped.some((f) => f.rule === 'E1' && f.file === n)) &&
  paneBare.some((l) => /const pane = host\.paneInfo\(paneId, terminal\)/.test(l)) && paneBare.some((l) => /host\.paneInfo\(dead\.paneId, dead\.terminal\)/.test(l)), JSON.stringify({ tripped, paneBare }))

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
fs.writeFileSync(path.join(quiet, 'dctr-fixedhc.mjs'), FIXED_HC)
fs.writeFileSync(path.join(quiet, 'dctr-fixedseam.mjs'), FIXED_SEAM)
fs.writeFileSync(path.join(quiet, 'dctr-fixedrec.mjs'), FIXED_REC)
fs.writeFileSync(path.join(quiet, 'dctr-fixedhce2.mjs'), FIXED_HC_E2)
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
//
// The forms are COMPILED FROM THE FIXTURE TEXT, never re-typed beside it. A hand copy proves the copy
// is broken, so a fixture that lost its defect left clauses 3a-3c green while clause 1a went on
// asserting that the checker reports a defect the fixture no longer carried.
const load = (src, name, ...deps) => new Function(...deps, `${src.replace(/^import .*$/m, '')}\nreturn ${name}`)
const askFrom = (src) => (reply) => load(src, 'askPane', 'herdr', 'isPaneNotFound')(() => reply, () => false)('p1')
const stubReplyWithoutPane = { result: {} }
const brokenAsk = askFrom(BROKEN_E2)
const fixedAsk = askFrom(FIXED)
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
// The broken form is compiled from BROKEN_E1 for the reason given above clause 3a. The separated
// form has no fixture text of its own to compile.
const brokenSweep = (call) => {
  let destroyed = false
  load(BROKEN_E1, 'sweep', 'herdr', 'destroy')(call, () => { destroyed = true })('p1')
  return destroyed ? 'destroyed' : 'kept'
}
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

// herdr-core's two fixtures run against stub readers, no linter called: a listing that THREW is read as absent and
// the pane destroyed, and a focus herdr-app could not report (null) reads as "nobody".
const coreSweep = (reader) => {
  let destroyed = false
  load(BROKEN_HC_E1, 'sweepCore', 'appPanes', 'destroy')(reader, () => { destroyed = true })('p1')
  return destroyed
}
clause('clause 3k: the herdr-core E1 fixture really destroys a listed pane when the listing merely FAILED, and keeps it when the listing carries it — proved without the checker',
  coreSweep(throwsTransport) === true && coreSweep(() => [{ pane: 'p1' }]) === false, '')
clause('clause 3l: the herdr-core E2 fixture really answers "nobody" for a focus herdr-app could not report — proved without the checker',
  load(BROKEN_HC_E2, 'watcher', 'appFocus')(() => ({ pane: null }))() === 'nobody' && load(BROKEN_HC_E2, 'watcher', 'appFocus')(() => ({ pane: 'p1' }))() === 'someone', '')
const seamStop = (src, name, paneInfo) => {
  let dropped = false
  load(src, name, 'dropMarker')(() => { dropped = true })({ paneInfo }, 'p1')
  return dropped
}
clause('clause 3n: the seam-caller fixture really drops a live pane\'s marker when the lookup merely FAILED, and the reasoned form really does not — proved without the checker',
  seamStop(BROKEN_SEAM, 'stopSeam', throwsTransport) === true && seamStop(FIXED_SEAM, 'stopSeamFixed', throwsTransport) === false &&
  seamStop(BROKEN_SEAM, 'stopSeam', () => ({ exists: true })) === false && seamStop(FIXED_SEAM, 'stopSeamFixed', () => ({ exists: false })) === true, '')
const wrote = (src, name, dep, via) => {
  let sent = false
  try { load(src, name, 'send', 'hcGet', 'isPaneNotFound', 'isHcNotFound')(() => { sent = true }, dep, () => false, () => false)(...via) } catch { /* the repaired form throws */ }
  return sent
}
clause('clause 3o: the recorder fixtures really send when the lookup merely FAILED, and the repaired forms really do not — proved without the checker',
  wrote(BROKEN_REC, 'writeRec', null, [{ recorderAlive: throwsTransport }, 'p1']) && wrote(BROKEN_HCGET, 'writeHc', throwsTransport, ['p1']) &&
  !wrote(FIXED_REC, 'writeRecFixed', null, [{ recorderAlive: throwsTransport }, 'p1']) && !wrote(FIXED_REC, 'writeHcFixed', throwsTransport, ['p1']) &&
  wrote(FIXED_REC, 'writeRecFixed', null, [{ recorderAlive: () => true }, 'p1']) && wrote(FIXED_REC, 'writeHcFixed', () => ({ state: 'live' }), ['p1']), '')
const nothing = () => ({})
const threw = (f) => { try { f(); return false } catch { return true } }
clause('clause 3p: the two hc get fixtures really answer "over" for a reply that carried no state, and the separated form really throws — proved without the checker',
  load(BROKEN_HC_E2_GET, 'runs', 'hcGet')(nothing)('t1') === 'over' && load(BROKEN_HC_E2_NOT, 'over', 'hcGet')(nothing)('t1') === true &&
  threw(() => load(FIXED_HC_E2, 'runsFixed', 'hcGet')(nothing)('t1')) && load(FIXED_HC_E2, 'runsFixed', 'hcGet')(() => ({ state: 'live' }))('t1') === true && load(BROKEN_HC_E2_GET, 'runs', 'hcGet')(() => ({ state: 'live' }))('t1') === 'running', '')
clause('clause 3m: the bare seam copy really differs from the shipping seam only in its suppression markers',
  SEAM.includes('herdr-lint:') && SEAM.replace(/herdr-lint:/g, 'was-lint:') === fs.readFileSync(path.join(tmp, 'dctr-hostbare.mjs'), 'utf8'), '')

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
