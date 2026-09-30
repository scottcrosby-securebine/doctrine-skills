// Runs one gauntlet round (round.workflow.mjs, unchanged) on a host with no Workflow tool.
//
//   node round.codex.mjs <args.json> <journal-dir>
//
// Each run replays every agent call answered in the journal and stops once no branch of the round
// can go further. The calls still unanswered are written to <journal-dir>/pending/<key>.md, each the
// message to hand one seat verbatim; the orchestrator puts each seat's final reply, verbatim, in
// <journal-dir>/answers/<key>.txt and runs this again. A seat that returned nothing is answered with
// exactly `null`. workflow.md is the manual.
//
// A journal belongs to one args file and one round.workflow.mjs: a run with either changed is
// refused, since a ruling or a counter changes the round's result without changing any prompt.
// The runner writes its own records (round.sha256, asked/) once, and one a crash left half written
// is written again, since no answer can rest on it yet; so a crash is resumed by running again.
//
// Exit 0 the round finished and <journal-dir>/result.json holds its return; 3 calls are pending;
// 2 a miscall, a runner failure (a journal it cannot write, say), or a refusal named on stderr: a
// journal begun for other args or another script, an answer asked under another prompt or a pending
// call whose prompt changed since it was asked (each means a new journal), or an answer the call's
// schema does not allow (re-ask the seat); 1 the script threw.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const promptHash = (prompt, schema) => createHash('sha256').update(JSON.stringify([prompt, schema || null])).digest('hex')

// The keywords the round's schemas use, and nothing else.
function invalid(v, s, at = 'reply') {
  if (!s) return null
  if (s.enum && !s.enum.includes(v)) return `${at} is not one of ${s.enum.join(', ')}`
  const t = s.type
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return `${at} is not an object`
    for (const k of s.required || []) if (!(k in v)) return `${at} lacks ${k}`
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) { const e = invalid(v[k], sub, `${at}.${k}`); if (e) return e }
  } else if (t === 'array') {
    if (!Array.isArray(v)) return `${at} is not an array`
    for (let i = 0; i < v.length; i++) { const e = invalid(v[i], s.items, `${at}[${i}]`); if (e) return e }
  } else if (t === 'integer') { if (!Number.isInteger(v)) return `${at} is not an integer` }
  else if (t && typeof v !== t) return `${at} is not a ${t}`
  return null
}

export function readAnswer(text, schema) {
  const raw = text.trim()
  if (raw === 'null') return { ok: true, value: null }
  if (!schema) return { ok: true, value: text }
  const fenced = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  let value
  try { value = JSON.parse(fenced ? fenced[1] : raw) } catch { return { ok: false, why: 'reply is not one JSON value' } }
  const why = invalid(value, schema)
  return why ? { ok: false, why } : { ok: true, value }
}

// One pass over the round. `answers` maps a call's key to { hash, value }. Every answered call
// resolves in the same tick, so one macrotask drains the round as far as it can go.
export async function step(scriptSource, argsIn, answers) {
  const args = structuredClone(argsIn)   // the round writes its counters into args; the caller's copy stays as given
  const body = scriptSource.replace(/^export const meta/m, 'const meta')
  const seen = {}
  const pending = []
  let refused = null
  const agent = (prompt, opts = {}) => {
    const label = opts.label || 'agent'
    seen[label] = (seen[label] || 0) + 1
    const key = `${label}#${seen[label]}`
    const hash = promptHash(prompt, opts.schema)
    const a = answers[key]
    if (a && a.hash !== hash) { refused = refused || { key, why: 'its answer was given to another prompt' }; return new Promise(() => {}) }
    if (a) return Promise.resolve(a.value)
    pending.push({ key, label, prompt, schema: opts.schema || null, hash })
    return new Promise(() => {})
  }
  const parallel = (fns) => Promise.all(fns.map((f) => f()))
  const pipeline = (items, fn) => Promise.all(items.map((x, i) => fn(x, i)))
  const noop = () => {}
  let settled = null
  // The body is round.workflow.mjs from this directory, wrapped as the Workflow tool wraps it.
  const run = new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow', `return (async()=>{${body}})()`)
  run(args, agent, parallel, pipeline, noop, noop, {}, {}).then((result) => { settled = { result } }, (error) => { settled = { error } })
  await new Promise((r) => setImmediate(r))
  if (refused) return { done: false, refused, pending: [] }
  if (settled && 'error' in settled) throw settled.error
  if (settled) return { done: true, result: settled.result }
  if (!pending.length) throw new Error('the round stopped with no call pending')
  return { done: false, pending }
}

const fileOf = (key) => encodeURIComponent(key)

function message(p) {
  if (!p.schema) return p.prompt
  return `${p.prompt}\n\n---\nReply with one JSON value and nothing else: no prose, no code fence. It must match this JSON Schema:\n${JSON.stringify(p.schema, null, 2)}\n`
}

async function main([argsFile, dir]) {
  if (!argsFile || !dir) { console.error('usage: node round.codex.mjs <args.json> <journal-dir>'); return 2 }
  let args
  try { args = JSON.parse(readFileSync(argsFile, 'utf8')) } catch (e) { console.error(`cannot read ${argsFile}: ${e.message}`); return 2 }
  // A call's key is its label and its place among that label's calls; two sections of one name share
  // labels, so their keys would follow whichever answers a resume found, and the script's own counters
  // are keyed by name too. Names are compared as the labels print them, so 1 and "1" are one name.
  const names = Array.isArray(args.sections) ? args.sections.map((s) => String(s && s.name)) : []
  if (new Set(names).size !== names.length) { console.error('sections must have distinct names: two of one name cannot be told apart on resume'); return 2 }
  const here = dirname(fileURLToPath(import.meta.url))
  const script = readFileSync(join(here, 'round.workflow.mjs'), 'utf8')
  const round = createHash('sha256').update(JSON.stringify(args)).update('\0').update(script).digest('hex')
  const roundFile = join(dir, 'round.sha256')
  const had = existsSync(roundFile) ? readFileSync(roundFile, 'utf8').trim() : null
  const answered = existsSync(join(dir, 'answers')) && readdirSync(join(dir, 'answers')).some((f) => f.endsWith('.txt'))
  if (had !== null && had !== round && (/^[0-9a-f]{64}$/.test(had) || answered)) { console.error(`${dir} was begun for other args or another round.workflow.mjs: start a new journal directory`); return 2 }
  for (const d of ['pending', 'answers', 'asked']) mkdirSync(join(dir, d), { recursive: true })
  if (had !== round) writeFileSync(roundFile, round + '\n')
  const readAsked = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
  const answers = {}
  for (const f of readdirSync(join(dir, 'answers'))) {
    if (!f.endsWith('.txt')) continue
    const name = f.slice(0, -4)
    const key = decodeURIComponent(name)
    const askedFile = join(dir, 'asked', name + '.json')
    const asked = existsSync(askedFile) ? readAsked(askedFile) : null
    if (!asked) { console.error(`${key}: answered, but no call was asked under that key`); return 2 }
    const got = readAnswer(readFileSync(join(dir, 'answers', f), 'utf8'), asked.schema)
    if (!got.ok) { console.error(`${key}: answer refused: ${got.why}; re-ask the seat once with its message, and answer null only if that reply is refused too`); return 2 }
    answers[key] = { hash: asked.hash, value: got.value }
  }
  let r
  try { r = await step(script, args, answers) } catch (e) { console.error(e && e.stack || String(e)); return 1 }
  if (r.refused) { console.error(`${r.refused.key}: answer refused: ${r.refused.why}; the journal no longer matches this round: start a new journal directory`); return 2 }
  const askedBefore = {}
  for (const p of r.pending || []) {
    const askedFile = join(dir, 'asked', fileOf(p.key) + '.json')
    askedBefore[p.key] = existsSync(askedFile) ? readAsked(askedFile) : null
    if (askedBefore[p.key] && askedBefore[p.key].hash !== p.hash) { console.error(`${p.key}: its prompt changed since it was asked; the journal no longer matches this round: start a new journal directory`); return 2 }
  }
  rmSync(join(dir, 'pending'), { recursive: true, force: true })
  mkdirSync(join(dir, 'pending'))
  if (r.done) {
    writeFileSync(join(dir, 'result.json'), JSON.stringify(r.result, null, 2) + '\n')
    console.log(join(dir, 'result.json'))
    return 0
  }
  for (const p of r.pending) {
    if (!askedBefore[p.key]) writeFileSync(join(dir, 'asked', fileOf(p.key) + '.json'), JSON.stringify({ key: p.key, hash: p.hash, schema: p.schema }) + '\n')
    writeFileSync(join(dir, 'pending', fileOf(p.key) + '.md'), message(p))
    console.log(`pending ${p.key}: ${join(dir, 'pending', fileOf(p.key) + '.md')} -> ${join(dir, 'answers', fileOf(p.key) + '.txt')}`)
  }
  return 3
}

// Both paths through realpath: Node resolves symlinks in import.meta.url, so a symlinked plugin root
// would otherwise make the CLI exit 0 having done nothing (ORC7-1 in hooks/).
const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`runner failed: ${e && e.stack || e}`); process.exit(2) })
