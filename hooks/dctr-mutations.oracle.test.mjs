// Tests for `dctr-mutations.mjs --file <unit> --tests <test file>`, each on a copy of hooks/ whose table it writes.
//   1. A break trips it: a missed entry, an unjudged load failure, a bad anchor and a red baseline each exit 1, and
//      each unusable argument exits 2.
//   2. A known-good case stays quiet: a test file that catches every selected entry exits 0.
//   3. Each fixture is proved to carry its defect by running `node --test` on a hand-mutated copy, without the mode.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const UNIT = 'dctr-gate.mjs'
const OTHER = 'dctr-token.mjs'
const UNIT_SRC = 'export const add = (a, b) => a + b\nexport const neg = (a) => -a\n'
const OTHER_SRC = 'export const one = 1\n'
const E = {
  sum: { name: 'add subtracts', file: UNIT, clause: 'add sums', from: 'a + b', to: 'a - b' },
  load: { name: 'neg breaks the parse', file: UNIT, clause: 'neg negates', from: 'export const neg', to: 'export cnst neg' },
  twice: { name: 'an anchor found twice', file: UNIT, clause: 'none', from: 'export const', to: 'export let' },
  other: { name: 'one becomes two', file: OTHER, clause: 'one is one', from: '= 1', to: '= 2' },
  neg: { name: 'neg doubles', file: UNIT, clause: 'neg negates', from: '-a', to: '-a * 2' },
  throws: { name: 'the unit throws on load', file: UNIT, clause: 'inner', from: 'export const neg = (a) => -a', to: 'export const neg = (a) => -a\nthrow new Error("load")' },
}
const TESTS = {
  'catching.test.mjs': `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add, neg } from './${UNIT}'\nimport { one } from './${OTHER}'\ntest('add sums', () => assert.equal(add(2, 3), 5))\ntest('neg negates', () => assert.equal(neg(2), -2))\ntest('one is one', () => assert.equal(one, 1))\n`,
  'empty.test.mjs': `import test from 'node:test'\nimport './${UNIT}'\ntest('nothing checked', () => {})\n`,
  'red.test.mjs': `import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('always red', () => assert.equal(1, 2))\n`,
  'skipped.test.mjs': `import test from 'node:test'\ntest('never runs', { skip: true }, () => {})\n`,
  'addonly.test.mjs': `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add } from './${UNIT}'\ntest('add sums', () => assert.equal(add(2, 3), 5))\n`,
  'tapname.test.mjs': `import test from 'node:test'\nimport { add } from './${UNIT}'\ntest('stable', () => {})\nif (add(2, 3) !== 5) test('appears', () => { throw new Error('\\nnot ok 1 - stable\\n') })\n`,
  'cancel.test.mjs': `import test, { describe } from 'node:test'\ndescribe('loads the unit', async () => { test('inner', () => {}); await import('./${UNIT}') })\n`,
  'suite.test.mjs': `import test, { describe } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add } from './${UNIT}'\ndescribe('group', () => { test('old', () => {}); if (add(2, 3) !== 5) test('new', () => assert.fail('new fails')) })\n`,
  'notests.test.mjs': `import './${UNIT}'\n`,
}

/** A copy of hooks/ whose table holds `entries`, whose two units are the small modules above, and whose suites each
 *  record that they ran. */
const fixture = (t, entries) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-oracle-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.cpSync(HERE, dir, { recursive: true })
  const script = path.join(dir, 'dctr-mutations.mjs')
  const src = fs.readFileSync(script, 'utf8')
  const start = src.indexOf('const MUTATIONS = [\n')
  const end = src.indexOf('\n]\n', start)
  fs.writeFileSync(script, src.slice(0, start) + 'const MUTATIONS = [\n' + entries.map((e) => JSON.stringify(e) + ',').join('\n') + src.slice(end))
  fs.writeFileSync(path.join(dir, UNIT), UNIT_SRC)
  fs.writeFileSync(path.join(dir, OTHER), OTHER_SRC)
  for (const [f, s] of Object.entries(TESTS)) fs.writeFileSync(path.join(dir, f), s)
  const trip = path.join(dir, 'suites-ran.log')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.selftest.mjs'))) {
    fs.writeFileSync(path.join(dir, f), `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(trip)}, ${JSON.stringify(f + '\n')})\n`)
  }
  return { dir, trip }
}
const run = (dir, args) => {
  const env = { ...process.env, DCTR_JOBS: '2' }
  delete env.DCTR_SHARD
  return spawnSync('node', [path.join(dir, 'dctr-mutations.mjs'), ...args], { cwd: path.dirname(dir), encoding: 'utf8', env, timeout: 60000 })
}
const lines = (r) => r.stdout.split('\n').filter(Boolean)
const say = (r) => `status ${r.status}\n${r.stdout}${r.stderr}`
const lineFor = (r, name) => lines(r).filter((l) => l.includes(name))
const passes = (r, name) => r.stdout.split('\n').some((l) => /^\s*ok \d+ - /.test(l) && l.trim().endsWith(` - ${name}`))
const fails = (r, name) => r.stdout.split('\n').some((l) => /^\s*not ok \d+ - /.test(l) && l.trim().endsWith(` - ${name}`))
/** `node --test` on one test file in a copy of `dir` with `entry` applied by hand, the mode not involved. */
const byHand = (t, dir, testFile, entry) => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-oracle-hand-'))
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }))
  for (const f of [UNIT, OTHER, testFile]) fs.copyFileSync(path.join(dir, f), path.join(copy, f))
  if (entry) {
    const target = path.join(copy, entry.file)
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(entry.from, entry.to))
  }
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync('node', ['--test', '--test-reporter=tap', path.join(copy, testFile)], { cwd: copy, encoding: 'utf8', env })
}

test('a test file that catches every selected entry is reported caught and exits 0', (t) => {
  const { dir } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  assert.equal(r.status, 0, say(r))
  assert.match(lineFor(r, E.sum.name)[0] || '', /caught/, say(r))
  assert.match(lines(r).at(-1), /1 caught, 0 missed, 0 unjudged/, say(r))
})

test('a test file that asserts nothing makes every selected entry missed and exits 1', (t) => {
  const { dir } = fixture(t, [E.sum, E.neg])
  const r = run(dir, ['--file', UNIT, '--tests', 'empty.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(lineFor(r, 'add subtracts')[0] || '', /missed/, say(r))
  assert.match(lineFor(r, 'neg doubles')[0] || '', /missed/, say(r))
  assert.match(lines(r).at(-1), /0 caught, 2 missed, 0 unjudged/, say(r))
})

test('a mutant that makes the test file fail to load is unjudged and never caught', (t) => {
  const { dir } = fixture(t, [E.load])
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  assert.equal(r.status, 1, say(r))
  const l = lineFor(r, E.load.name)
  assert.equal(l.length, 1, say(r))
  assert.match(l[0], /unjudged/, say(r))
  assert.doesNotMatch(l[0], /caught/, say(r))
  assert.match(lines(r).at(-1), /0 caught, 0 missed, 1 unjudged/, say(r))
})

test('an entry whose anchor does not occur exactly once fails the run', (t) => {
  const { dir } = fixture(t, [E.sum, E.twice])
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(lineFor(r, E.twice.name)[0] || '', /unjudged.*anchor occurs 2 times/, say(r))
  assert.match(lineFor(r, E.sum.name)[0] || '', /caught/, say(r))
})

test('a red baseline stops the run with exit 1 before any entry', (t) => {
  const { dir } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT, '--tests', 'red.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(r.stdout, /baseline is red/, say(r))
  assert.equal(lineFor(r, E.sum.name).length, 0, say(r))
})

test('a baseline with no test passed is red', (t) => {
  const { dir } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT, '--tests', 'skipped.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(r.stdout, /baseline is red/, say(r))
})

test('no tests argument exits 2', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT])
  assert.equal(r.status, 2, say(r))
  assert.equal(fs.existsSync(trip), false, say(r))
})

test('a tests argument with no file argument exits 2 and starts no full run', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, ['--tests', 'catching.test.mjs'])
  assert.equal(r.status, 2, say(r))
  assert.equal(fs.existsSync(trip), false, say(r))
})

test('a test file that is not there exits 2', (t) => {
  const { dir } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT, '--tests', 'absent.test.mjs'])
  assert.equal(r.status, 2, say(r))
})

test('a unit no entry names exits 2', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, ['--file', 'dctr-nothing.mjs', '--tests', 'catching.test.mjs'])
  assert.equal(r.status, 2, say(r))
  assert.equal(fs.existsSync(trip), false, say(r))
})

test('the first line is started and the UTC time read when the command ran', (t) => {
  const { dir } = fixture(t, [E.sum])
  const before = Date.now() - 1000
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  const after = Date.now() + 1000
  const m = /^started (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z)$/.exec(lines(r)[0] || '')
  assert.ok(m, say(r))
  const at = Date.parse(m[1])
  assert.ok(at >= before && at <= after, say(r))
})

test('only the named unit entries are applied, in table order', (t) => {
  const { dir } = fixture(t, [E.other, E.sum, E.neg])
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  assert.equal(r.status, 0, say(r))
  assert.equal(lineFor(r, E.other.name).length, 0, say(r))
  const order = lines(r).filter((l) => /^ +(caught|missed|unjudged) /.test(l)).map((l) => l.trim().replace(/^\S+\s+/, ''))
  assert.deepEqual(order, [E.sum.name, E.neg.name], say(r))
  assert.match(lines(r).at(-1), /2 caught, 0 missed, 0 unjudged/, say(r))
})

test('the table suites are never run', (t) => {
  const { dir, trip } = fixture(t, [E.sum, E.load])
  const r = run(dir, ['--file', UNIT, '--tests', 'catching.test.mjs'])
  assert.notEqual(r.status, null, say(r))
  assert.equal(fs.existsSync(trip), false, fs.existsSync(trip) ? fs.readFileSync(trip, 'utf8') : '')
})

test('the fixtures carry their defects without the mode', (t) => {
  const { dir, trip } = fixture(t, [])
  const clean = byHand(t, dir, 'catching.test.mjs')
  assert.ok(clean.status === 0 && passes(clean, 'add sums') && passes(clean, 'neg negates') && passes(clean, 'one is one'), say(clean))
  const sum = byHand(t, dir, 'catching.test.mjs', E.sum)
  assert.ok(sum.status === 1 && fails(sum, 'add sums'), say(sum))
  const load = byHand(t, dir, 'catching.test.mjs', E.load)
  assert.ok(load.status === 1 && !['add sums', 'neg negates', 'one is one'].some((n) => fails(load, n)) && /^\s*not ok \d+ - \S*catching\.test\.mjs$/m.test(load.stdout), say(load))
  const neg = byHand(t, dir, 'catching.test.mjs', E.neg)
  assert.ok(neg.status === 1 && fails(neg, 'neg negates') && passes(neg, 'add sums'), say(neg))
  const addOnlyNeg = byHand(t, dir, 'addonly.test.mjs', E.neg)
  assert.ok(addOnlyNeg.status === 0 && passes(addOnlyNeg, 'add sums'), say(addOnlyNeg))
  const addOnlySum = byHand(t, dir, 'addonly.test.mjs', E.sum)
  assert.ok(addOnlySum.status === 1 && fails(addOnlySum, 'add sums'), say(addOnlySum))
  const other = byHand(t, dir, 'catching.test.mjs', E.other)
  assert.ok(other.status === 1 && fails(other, 'one is one'), say(other))
  const empty = byHand(t, dir, 'empty.test.mjs', E.sum)
  assert.ok(empty.status === 0 && passes(empty, 'nothing checked'), say(empty))
  const red = byHand(t, dir, 'red.test.mjs')
  assert.ok(red.status === 1 && fails(red, 'always red'), say(red))
  const skipped = byHand(t, dir, 'skipped.test.mjs')
  assert.ok(skipped.status === 0 && /^# pass 0$/m.test(skipped.stdout), say(skipped))
  assert.equal(UNIT_SRC.split(E.twice.from).length - 1, 2)
  assert.ok(fs.readdirSync(dir).filter((f) => f.endsWith('.selftest.mjs')).length > 0 && !fs.existsSync(trip))
})

test('two entries each caught by a different test are judged apart', (t) => {
  const { dir } = fixture(t, [E.sum, E.neg])
  const r = run(dir, ['--file', UNIT, '--tests', 'addonly.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.deepEqual(lineFor(r, E.sum.name).map((l) => l.trim().split(/\s+/)[0]), ['caught'], say(r))
  assert.deepEqual(lineFor(r, E.neg.name).map((l) => l.trim().split(/\s+/)[0]), ['missed'], say(r))
  assert.match(lines(r).at(-1), /1 caught, 1 missed, 0 unjudged/, say(r))
})

test('a tests value that is not a bare test file name in hooks exits 2 and runs nothing', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  for (const tests of ['dctr-mutations.mjs', 'dctr-record.selftest.mjs', 'catching.test', path.join(dir, 'catching.test.mjs'), 'sub/catching.test.mjs', 'sub\\catching.test.mjs']) {
    const r = run(dir, ['--file', UNIT, '--tests', tests])
    assert.equal(r.status, 2, `${tests}\n${say(r)}`)
    assert.match(lines(r).at(-1) || '', /bare file name/, `${tests}\n${say(r)}`)
    assert.equal(fs.existsSync(trip), false, `${tests}\n${say(r)}`)
  }
})

test('a tests value that climbs out of hooks with dot dot exits 2', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, ['--file', UNIT, '--tests', `../${path.basename(dir)}/catching.test.mjs`])
  assert.equal(r.status, 2, say(r))
  assert.match(lines(r).at(-1) || '', /bare file name/, say(r))
  assert.equal(fs.existsSync(trip), false, say(r))
})

test('the equals spellings of the by-file flags exit 2 and start no full run', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, [`--file=${UNIT}`, '--tests=catching.test.mjs'])
  assert.equal(r.status, 2, say(r))
  assert.match(r.stdout, /^usage: /m, say(r))
  assert.equal(fs.existsSync(trip), false, say(r))
})

test('a stray extra argument or an unknown flag exits 2 and starts nothing', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  for (const args of [['--file', UNIT, '--tests', 'catching.test.mjs', 'extra'], ['--bogus'], ['--anchors', '--bogus'], ['--file', UNIT, '--file', UNIT]]) {
    const r = run(dir, args)
    assert.equal(r.status, 2, `${args.join(' ')}\n${say(r)}`)
    assert.match(r.stdout, /^usage: /m, `${args.join(' ')}\n${say(r)}`)
    assert.doesNotMatch(r.stdout, /caught|anchors occur/, `${args.join(' ')}\n${say(r)}`)
    assert.equal(fs.existsSync(trip), false, `${args.join(' ')}\n${say(r)}`)
  }
})

test('anchors together with a by-file flag exits 2', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  for (const args of [['--file', UNIT, '--tests', '--anchors'], ['--anchors', '--file', UNIT, '--tests', 'catching.test.mjs']]) {
    const r = run(dir, args)
    assert.equal(r.status, 2, `${args.join(' ')}\n${say(r)}`)
    assert.doesNotMatch(r.stdout, /anchors occur/, `${args.join(' ')}\n${say(r)}`)
    assert.equal(fs.existsSync(trip), false, `${args.join(' ')}\n${say(r)}`)
  }
})

test('the by-file flags are accepted in either order', (t) => {
  const { dir } = fixture(t, [E.sum])
  const r = run(dir, ['--tests', 'catching.test.mjs', '--file', UNIT])
  assert.equal(r.status, 0, say(r))
  assert.match(lines(r).at(-1), /1 caught, 0 missed, 0 unjudged/, say(r))
})

test('no arguments still starts the full run', (t) => {
  const { dir, trip } = fixture(t, [E.sum])
  const r = run(dir, [])
  assert.notEqual(r.status, null, say(r))
  assert.equal(fs.existsSync(trip), true, say(r))
})

test('a result line inside another test diagnostic is not read as a failure', (t) => {
  const { dir } = fixture(t, [E.sum])
  const hand = byHand(t, dir, 'tapname.test.mjs', E.sum)
  assert.ok(hand.status === 1 && /^ok 1 - stable$/m.test(hand.stdout) && /^not ok 2 - appears$/m.test(hand.stdout) && /^ +not ok 1 - stable$/m.test(hand.stdout), say(hand))
  const r = run(dir, ['--file', UNIT, '--tests', 'tapname.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(lineFor(r, E.sum.name)[0] || '', /^ +unjudged /, say(r))
})

test('a test cancelled because the unit threw on load is unjudged and never caught', (t) => {
  const { dir } = fixture(t, [E.throws])
  const clean = byHand(t, dir, 'cancel.test.mjs')
  assert.ok(clean.status === 0 && passes(clean, 'inner'), say(clean))
  const hand = byHand(t, dir, 'cancel.test.mjs', E.throws)
  assert.ok(hand.status === 1 && fails(hand, 'inner') && /failureType: 'cancelledByParent'/.test(hand.stdout), say(hand))
  const r = run(dir, ['--file', UNIT, '--tests', 'cancel.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(lineFor(r, E.throws.name)[0] || '', /^ +unjudged /, say(r))
})

test('a describe group that fails is never the test that catches an entry', (t) => {
  const { dir } = fixture(t, [E.sum])
  const clean = byHand(t, dir, 'suite.test.mjs')
  assert.ok(clean.status === 0 && passes(clean, 'group') && passes(clean, 'old'), say(clean))
  const hand = byHand(t, dir, 'suite.test.mjs', E.sum)
  assert.ok(hand.status === 1 && /^not ok 1 - group\n  ---\n  duration_ms: \S+\n  type: 'suite'$/m.test(hand.stdout) && passes(hand, 'old') && fails(hand, 'new'), say(hand))
  const r = run(dir, ['--file', UNIT, '--tests', 'suite.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(lineFor(r, E.sum.name)[0] || '', /^ +unjudged /, say(r))
})

test('a test file that declares no test is a red baseline', (t) => {
  const { dir } = fixture(t, [E.sum])
  assert.doesNotMatch(TESTS['notests.test.mjs'], /test\(/)
  const hand = byHand(t, dir, 'notests.test.mjs')
  assert.ok(hand.status === 0 && /^ok 1 - \S*notests\.test\.mjs$/m.test(hand.stdout) && /^# pass 1$/m.test(hand.stdout), say(hand))
  const r = run(dir, ['--file', UNIT, '--tests', 'notests.test.mjs'])
  assert.equal(r.status, 1, say(r))
  assert.match(r.stdout, /baseline is red/, say(r))
})
