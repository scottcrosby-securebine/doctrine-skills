#!/usr/bin/env node
// Three-clause tamper test for `dctr-mutations.mjs --anchors`.
//   1. A tree with one entry's text edited away, one with that text duplicated, and one with an entry added to the
//      table each trip it, exit 1, and the first two name the entry.
//   2. The real tree stays quiet, and stays whole-table when DCTR_SHARD is set.
//   3. Each edited tree is proved to carry its defect by counting text, without the checker.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const run = (dir, env = {}) => {
  const e = { ...process.env, ...env }
  if (!('DCTR_SHARD' in env)) delete e.DCTR_SHARD // a shard left in the caller's environment must not decide this suite
  return spawnSync('node', [path.join(dir, 'dctr-mutations.mjs'), '--anchors'], { encoding: 'utf8', env: e })
}
const count = (file, text) => fs.readFileSync(file, 'utf8').split(text).length - 1
const total = (r) => Number((/all (\d+) anchors occur exactly once/.exec(r.stdout) || [])[1] || 0)
const tail = (r) => `status ${r.status}: ${r.stdout.slice(-300)}`

// The entry tampered with. Its text sits once in dctr-host.mjs, and the checker under test does not call that code.
const NAME = '(#111 B R1) a finished terminal reads as running'
const FILE = 'dctr-host.mjs'
const TEXT = "  return t.state === 'live'\n"
const copyOf = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-anchors-')); fs.cpSync(HERE, d, { recursive: true }); return d }
const dirs = []
try {
  const gone = copyOf(); dirs.push(gone)
  fs.writeFileSync(path.join(gone, FILE), fs.readFileSync(path.join(gone, FILE), 'utf8').replace(TEXT, "  return t.state !== 'finished'\n"))
  const twice = copyOf(); dirs.push(twice)
  fs.appendFileSync(path.join(twice, FILE), `\n// a second copy of the entry's text:\n//${TEXT}`.replace(`//${TEXT}`, TEXT))
  const grown = copyOf(); dirs.push(grown)
  const table = path.join(grown, 'dctr-mutations.mjs')
  const ENTRY = `  { name: 'an entry added after the ruling', file: '${FILE}', clause: 'none', from: "import ", to: "import  " },\n`
  fs.writeFileSync(table, fs.readFileSync(table, 'utf8').replace('const MUTATIONS = [\n', 'const MUTATIONS = [\n' + ENTRY))

  const good = run(HERE)
  const whole = total(good)
  clause('clause 2a — the real tree stays quiet: exit 0, every entry counted', good.status === 0 && whole > 0, tail(good))
  const sharded = run(HERE, { DCTR_SHARD: '0/4' })
  clause('clause 2b — with DCTR_SHARD set the real tree still reads the whole table, not a quarter of it',
    sharded.status === 0 && total(sharded) === whole, `${tail(sharded)} (whole ${whole})`)

  const names = (r) => r.stdout.split('\n').some((l) => l.includes('FAIL') && l.includes(NAME) && l.includes(FILE))
  const g = run(gone)
  clause('clause 1a — an entry whose text was edited away exits 1 and is named', g.status === 1 && names(g) && /occurs 0 times/.test(g.stdout), tail(g))
  const t = run(twice)
  clause('clause 1b — an entry whose text now occurs twice exits 1 and is named', t.status === 1 && names(t) && /occurs 2 times/.test(t.stdout), tail(t))
  const w = run(grown)
  clause('clause 1c — a table with one entry more than its ceiling exits 1 and says so', w.status === 1 && /over its ceiling/.test(w.stdout), tail(w))

  const real = count(path.join(HERE, FILE), TEXT)
  const inTable = count(path.join(HERE, 'dctr-mutations.mjs'), JSON.stringify(NAME))
  clause('clause 3a — without the checker: the text is once in the real file, absent from the edited one, twice in the duplicated one, and the entry is in the table once',
    real === 1 && count(path.join(gone, FILE), TEXT) === 0 && count(path.join(twice, FILE), TEXT) === 2 && inTable === 1,
    `real ${real}, edited ${count(path.join(gone, FILE), TEXT)}, duplicated ${count(path.join(twice, FILE), TEXT)}, name in table ${inTable}`)
  const entries = (file) => (fs.readFileSync(file, 'utf8').match(/^\s*\{ name: /gm) || []).length
  clause('clause 3b — without the checker: the grown table holds exactly one entry more than the real one, and the added entry is in it once',
    entries(table) === entries(path.join(HERE, 'dctr-mutations.mjs')) + 1 && count(table, 'an entry added after the ruling') === 1,
    `real ${entries(path.join(HERE, 'dctr-mutations.mjs'))}, grown ${entries(table)}`)
} finally { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) }

process.exit(bad ? 1 : 0)
