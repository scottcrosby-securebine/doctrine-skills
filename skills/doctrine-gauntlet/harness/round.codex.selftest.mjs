// Three-clause tamper test for round.codex.mjs, the Codex runner for one gauntlet round, per CLAUDE.md.
//
//   node skills/doctrine-gauntlet/harness/round.codex.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every seat here is a stand-in that returns the exact text its stub prompt in round.tamper.json
// states. Clause 1 breaks things and confirms each is caught: an altered expect is reported, a script
// with one check removed fails that check's fixture, the runner refuses an answer asked under
// another prompt or one its schema rejects, the CLI exits as its header says on every refusal, a
// runner failure and a throw, runs through a symlinked directory, resumes past a half-written record of its own, leaves the caller's args as given,
// hands a schema call its schema, and pends every section's builder at once. Clause 2 runs every
// fixture through the runner and confirms each meets its expect, and runs one end to end through the
// CLI. Clause 3 proves, without the CLI, that the stand-in's returns are the stub prompts' own text,
// that the mutated script really lacks the check, and that the throwing args really throw.

import { readFileSync, mkdtempSync, readdirSync, writeFileSync, rmSync, existsSync, symlinkSync, chmodSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { step, readAnswer, promptHash } from './round.codex.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = readFileSync(join(here, 'round.workflow.mjs'), 'utf8')
const FIXTURES = JSON.parse(readFileSync(join(here, 'round.tamper.json'), 'utf8'))
const NAMES = Object.keys(FIXTURES).filter((k) => !k.startsWith('_'))

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

// The stand-in seat: the text after the stub's own "Return ... exactly" marker.
const TEXT = 'Return exactly the text: '
const JSONM = 'Return via StructuredOutput exactly: '
function balanced(s) {
  let depth = 0, inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') { if (--depth === 0) return s.slice(0, i + 1) }
  }
  return null
}
function stubReply(prompt) {
  const j = prompt.indexOf(JSONM)
  if (j >= 0) return balanced(prompt.slice(j + JSONM.length))
  const t = prompt.indexOf(TEXT)
  if (t >= 0) return prompt.slice(t + TEXT.length).split('\n')[0]
  return null
}

// Drive one args set to the end, answering every pending call with the stand-in.
async function run(script, args) {
  const answers = {}
  for (let i = 0; i < 200; i++) {
    const r = await step(script, args, answers)
    if (r.done) return r.result
    for (const p of r.pending) {
      const got = readAnswer(stubReply(p.prompt) ?? 'null', p.schema)
      if (!got.ok) throw new Error(`${p.key}: ${got.why}`)
      answers[p.key] = { hash: p.hash, value: got.value }
    }
  }
  throw new Error('did not finish in 200 steps')
}

// The comparison round.tamper.json's _readme defines.
function misses(result, expect) {
  const out = []
  const leaf = (path, want, got) => {
    if (want && typeof want === 'object' && !Array.isArray(want)) {
      for (const k of Object.keys(want)) leaf(`${path}.${k}`, want[k], got == null ? undefined : got[k])
    } else if (JSON.stringify(want) !== JSON.stringify(got)) out.push(`${path}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }
  for (const [k, want] of Object.entries(expect)) {
    if (k === 'blocking_contains') { for (const s of want) if (!(result.blocking || []).some((l) => l.includes(s))) out.push(`blocking lacks "${s}"`) }
    else if (k === 'recorded_excludes') { for (const s of want) if ((result.recorded || []).some((l) => l.includes(s))) out.push(`recorded has "${s}"`) }
    else leaf(k, want, result[k])
  }
  return out
}
const judge = async (script, name, expect = FIXTURES[name].expect) => { try { return misses(await run(script, FIXTURES[name].args), expect) } catch (e) { return [`threw: ${e.message}`] } }

// A script with one check removed. The anchor must occur exactly once, or the mutation proves nothing.
const ANCHOR = "if (!a.floorPrompt) block('floor: not run"
const MUTANT = SCRIPT.replace(ANCHOR, "if (false) block('floor: not run")

// ---- Clause 3 first: the fixtures and the mutant carry what clauses 1 and 2 rest on ----
{
  const stubs = []
  const walk = (o) => { if (typeof o === 'string') { if (o.startsWith('HARNESS SELF-TEST')) stubs.push(o) } else if (o && typeof o === 'object') Object.values(o).forEach(walk) }
  for (const n of NAMES) walk(FIXTURES[n].args)
  const unread = stubs.filter((s) => {
    const r = stubReply(s)
    if (r == null) return true
    if (s.includes(JSONM)) { try { JSON.parse(r) } catch { return true } return !s.includes(JSONM + r) }
    return !s.includes(TEXT + r)
  })
  clause(`3a every stub prompt (${stubs.length}) states the reply the stand-in gives, read as the prompt's own text`, stubs.length > 100 && !unread.length, unread[0])
  const count = SCRIPT.split(ANCHOR).length - 1
  clause('3b the mutation anchor occurs exactly once, and the mutant no longer carries it', count === 1 && !MUTANT.includes(ANCHOR), `count ${count}`)
  const throwArgs = { ...FIXTURES.clean.args, sections: [{ ...FIXTURES.clean.args.sections[0], priorNotes: [5] }] }
  const threw = await step(SCRIPT, throwArgs, {}).then(() => null, (e) => e)
  clause('3d the throwing args clause 1e uses really make the script throw', threw instanceof TypeError, String(threw))
  clause('3c the floor-not-run fixture really runs with no floor prompt', FIXTURES['floor-not-run-blocks'] && FIXTURES['floor-not-run-blocks'].args.floorPrompt === '', 'fixture missing or floorPrompt set')
}

// ---- Clause 2: every fixture meets its expect through the runner ----
{
  const failed = []
  for (const n of NAMES) { const m = await judge(SCRIPT, n); if (m.length) failed.push([n, m]) }
  clause(`2a all ${NAMES.length} fixtures meet their expect through the runner`, NAMES.length > 0 && !failed.length, failed.map(([n, m]) => `${n}: ${m[0]}`).join('; '))

  const dir = mkdtempSync(join(tmpdir(), 'round-codex-'))
  try {
    const argsFile = join(dir, 'args.json')
    writeFileSync(argsFile, JSON.stringify(FIXTURES.clean.args))
    const cli = () => spawnSync(process.execPath, [join(here, 'round.codex.mjs'), argsFile, join(dir, 'j')], { encoding: 'utf8' })
    let r, codes = []
    for (let i = 0; i < 50; i++) {
      r = cli(); codes.push(r.status)
      if (r.status !== 3) break
      for (const f of readdirSync(join(dir, 'j', 'pending'))) {
        const key = f.replace(/\.md$/, '')
        const msg = readFileSync(join(dir, 'j', 'pending', f), 'utf8')
        writeFileSync(join(dir, 'j', 'answers', key + '.txt'), stubReply(msg) ?? 'null')
      }
    }
    const result = r.status === 0 ? JSON.parse(readFileSync(join(dir, 'j', 'result.json'), 'utf8')) : null
    const m = result ? misses(result, FIXTURES.clean.expect) : ['no result']
    clause(`2b the CLI stops with exit 3 while calls are pending, then finishes with exit 0 and a result meeting the clean fixture's expect (exits ${codes.join(',')})`, codes[0] === 3 && r.status === 0 && !m.length, m[0] || r.stderr)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// ---- Clause 1: break it ----
{
  const flipped = { ...FIXTURES.clean.expect, clean: !FIXTURES.clean.expect.clean }
  clause('1a an altered expect is reported by the comparison', (await judge(SCRIPT, 'clean', flipped)).length > 0, 'no mismatch reported')
  clause('1b the script with its floor-not-run check removed fails that fixture', (await judge(MUTANT, 'floor-not-run-blocks')).length > 0, 'fixture still met its expect')

  const first = await step(SCRIPT, FIXTURES.clean.args, {})
  const p = first.pending && first.pending[0]
  const stale = await step(SCRIPT, FIXTURES.clean.args, { [p.key]: { hash: promptHash('another prompt', p.schema), value: 'x' } })
  clause('1c an answer journaled under another prompt is refused, never replayed', stale.refused && stale.refused.key === p.key, JSON.stringify(stale).slice(0, 200))

  const schema = { type: 'object', properties: { accept: { type: 'boolean' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['accept', 'notes'] }
  const verdicts = [
    ['not JSON', readAnswer('I accept it', schema).ok === false],
    ['a required key missing', readAnswer('{"accept": true}', schema).ok === false],
    ['a wrong type', readAnswer('{"accept": "yes", "notes": []}', schema).ok === false],
    ['an item of the wrong type', readAnswer('{"accept": true, "notes": [1]}', schema).ok === false],
    ['an enum miss', readAnswer('{"w": "C"}', { type: 'object', properties: { w: { type: 'string', enum: ['A', 'B'] } }, required: ['w'] }).ok === false],
    ['a fenced valid answer is read', readAnswer('```json\n{"accept": true, "notes": []}\n```', schema).ok === true],
    ['exactly null is a seat that returned nothing', readAnswer('null', schema).ok === true && readAnswer('null', schema).value === null],
  ]
  const wrong = verdicts.filter(([, ok]) => !ok).map(([n]) => n)
  clause('1d readAnswer refuses what its schema rejects and reads what it accepts', !wrong.length, wrong.join(', '))
}

// ---- Clause 1, the CLI's refusals: each exits as its header says, and the pass after it does not run ----
{
  const dir = mkdtempSync(join(tmpdir(), 'round-codex-'))
  try {
    const cliIn = (argsFile, j) => spawnSync(process.execPath, [join(here, 'round.codex.mjs'), argsFile, j], { encoding: 'utf8' })
    const answer = (j, key, text) => writeFileSync(join(j, 'answers', encodeURIComponent(key) + '.txt'), text)
    const argsFile = join(dir, 'args.json')
    writeFileSync(argsFile, JSON.stringify(FIXTURES.clean.args))
    const j = join(dir, 'j')
    const seen = []
    let r = cliIn(argsFile, j); seen.push(['first run pends the builder', r.status === 3 && existsSync(join(j, 'pending', encodeURIComponent('build:hero#1') + '.md'))])
    answer(j, 'build:hero#1', stubReply(readFileSync(join(j, 'pending', encodeURIComponent('build:hero#1') + '.md'), 'utf8')))
    r = cliIn(argsFile, j); seen.push(['then the critic', r.status === 3 && existsSync(join(j, 'pending', encodeURIComponent('critic:hero#1') + '.md'))])
    answer(j, 'critic:hero#1', 'I accept it')
    r = cliIn(argsFile, j); seen.push(['a reply its schema refuses exits 2, keeps the message to re-ask with, and writes no result', r.status === 2 && /re-ask/.test(r.stderr) && existsSync(join(j, 'pending', encodeURIComponent('critic:hero#1') + '.md')) && !existsSync(join(j, 'result.json'))])
    answer(j, 'critic:hero#1', '{"accept": true, "notes": []}')
    r = cliIn(argsFile, j); seen.push(['a valid re-ask is taken', r.status === 3])
    answer(j, 'build:hero#1', 'a different build')
    r = cliIn(argsFile, j); seen.push(['an answer asked under another prompt exits 2 and names a new journal', r.status === 2 && /new journal/.test(r.stderr) && !existsSync(join(j, 'result.json'))])
    answer(j, 'build:hero#1', 'stub build of hero')
    writeFileSync(join(j, 'answers', 'bogus%231.txt'), 'x')
    r = cliIn(argsFile, j); seen.push(['an answer no call asked for exits 2', r.status === 2 && /no call was asked/.test(r.stderr)])
    rmSync(join(j, 'answers', 'bogus%231.txt'))
    writeFileSync(argsFile, JSON.stringify({ ...FIXTURES.clean.args, waived: ['contrast on the banner'] }))
    r = cliIn(argsFile, j); seen.push(['changed args in the same journal exit 2 and name a new journal', r.status === 2 && /new journal/.test(r.stderr) && !existsSync(join(j, 'result.json'))])
    writeFileSync(argsFile, JSON.stringify(FIXTURES.clean.args))
    const j2 = join(dir, 'j2')
    cliIn(argsFile, j2)
    answer(j2, 'build:hero#1', 'build A')
    r = cliIn(argsFile, j2); seen.push(['with the critic asked on build A', r.status === 3])
    answer(j2, 'build:hero#1', 'build B')
    r = cliIn(argsFile, j2); seen.push(['a pending call whose prompt changed since it was asked exits 2 and names a new journal', r.status === 2 && /new journal/.test(r.stderr)])
    writeFileSync(join(dir, 'notadir'), '')
    r = cliIn(argsFile, join(dir, 'notadir')); seen.push(['a journal the runner cannot write exits 2, not as a script throw', r.status === 2 && /runner failed/.test(r.stderr)])
    const throwing = join(dir, 'throw.json')
    writeFileSync(throwing, JSON.stringify({ ...FIXTURES.clean.args, sections: [{ ...FIXTURES.clean.args.sections[0], priorNotes: [5] }] }))
    const two = join(dir, 'two.json')
    writeFileSync(two, JSON.stringify({ ...FIXTURES.clean.args, sections: [FIXTURES.clean.args.sections[0], { ...FIXTURES.clean.args.sections[0], name: 'footer' }] }))
    r = cliIn(two, join(dir, 't')); seen.push(['two sections pend both builders at once', r.status === 3 && ['build:hero#1', 'build:footer#1'].every((k) => existsSync(join(dir, 't', 'pending', encodeURIComponent(k) + '.md')))])
    answer(join(dir, 't'), 'build:hero#1', 'stub build of hero'); answer(join(dir, 't'), 'build:footer#1', 'stub build of hero')
    r = cliIn(two, join(dir, 't'))
    const critMsg = r.status === 3 ? readFileSync(join(dir, 't', 'pending', encodeURIComponent('critic:hero#1') + '.md'), 'utf8') : ''
    seen.push(['a schema call\'s message carries its schema and the one-JSON-value instruction', critMsg.includes('Reply with one JSON value') && critMsg.includes('"required": [') && critMsg.includes('"accept"')])
    r = cliIn(throwing, join(dir, 'k')); seen.push(['a script that throws exits 1', r.status === 1])
    const wrong = seen.filter(([, ok]) => !ok).map(([n]) => n)
    clause('1e the CLI refuses a schema-breaking reply, a stale answer, an unasked answer, changed args, a changed pending prompt and an unusable journal with exit 2, and a throw with exit 1', !wrong.length, wrong.join('; '))
    // A crash mid-write: the runner's own records are written once, and a half-written one is written again.
    const c = join(dir, 'c')
    r = cliIn(argsFile, c)
    // Read-only records make any rewrite fail (EACCES), so a resume that still runs wrote neither. Root ignores the mode.
    const records = ['round.sha256', join('asked', encodeURIComponent('build:hero#1') + '.json')].map((f) => join(c, f))
    for (const f of records) chmodSync(f, 0o444)
    r = cliIn(argsFile, c)
    const kept = r.status === 3 && process.getuid() !== 0
    for (const f of records) chmodSync(f, 0o644)
    writeFileSync(join(c, 'asked', encodeURIComponent('build:hero#1') + '.json'), '{"key": "build:he')
    r = cliIn(argsFile, c)
    const askedHealed = r.status === 3 && JSON.parse(readFileSync(join(c, 'asked', encodeURIComponent('build:hero#1') + '.json'), 'utf8')).hash
    const c2 = join(dir, 'c2'); mkdirSync(c2); writeFileSync(join(c2, 'round.sha256'), '')
    r = cliIn(argsFile, c2)
    const roundHealed = r.status === 3 && /^[0-9a-f]{64}$/.test(readFileSync(join(c2, 'round.sha256'), 'utf8').trim())
    clause('1h a resume leaves the runner\'s records as written, and one a crash left half written is written again rather than refusing the journal', kept && !!askedHealed && roundHealed, `kept ${kept}, asked healed ${!!askedHealed}, round healed ${roundHealed}`)

    const link = join(dir, 'link')
    symlinkSync(here, link)
    r = spawnSync(process.execPath, [join(link, 'round.codex.mjs'), argsFile, join(dir, 'viaLink')], { encoding: 'utf8' })
    clause('1g the CLI reached through a symlinked directory runs, and does not exit 0 having done nothing', r.status === 3 && existsSync(join(dir, 'viaLink', 'pending')), `exit ${r.status}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }

  const args = structuredClone(FIXTURES['section-deadlock'] ? FIXTURES['section-deadlock'].args : FIXTURES.clean.args)
  const before = JSON.stringify(args)
  await run(SCRIPT, args)
  clause('1f a round run through step() leaves the caller\'s args as given', JSON.stringify(args) === before, 'args changed')
}

console.log(bad ? `${bad} clause(s) FAILED` : 'all clauses passed')
process.exit(bad ? 1 : 0)
