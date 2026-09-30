// Three-clause tamper test for round.codex.mjs, the Codex runner for one gauntlet round, per CLAUDE.md.
//
//   node skills/doctrine-gauntlet/harness/round.codex.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every seat here is a stand-in that returns the exact text its stub prompt in round.tamper.json
// states. Clause 1 breaks things and confirms each is caught: an altered expect is reported, a script
// with one check removed fails that check's fixture, and the runner refuses an answer asked under
// another prompt or one its schema rejects. Clause 2 runs every fixture through the runner and
// confirms each meets its expect, and runs one end to end through the CLI. Clause 3 proves, without
// the runner, that the stand-in's returns are the stub prompts' own text and that the mutated script
// really lacks the check.

import { readFileSync, mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
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

console.log(bad ? `${bad} clause(s) FAILED` : 'all clauses passed')
process.exit(bad ? 1 : 0)
