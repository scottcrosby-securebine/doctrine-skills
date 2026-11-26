#!/usr/bin/env node
// Three-clause tamper test for `dctr-mutations.mjs --anchors`: a tree with one entry's text edited away trips it and
// names that entry, the real tree stays quiet, and the edited tree is proved to lack the text without the checker.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const run = (dir) => spawnSync('node', [path.join(dir, 'dctr-mutations.mjs'), '--anchors'], { encoding: 'utf8' })

// The entry tampered with: its text sits once in dctr-lib.mjs and is one table entry's `from`.
const TEXT = 'export const anchorCount = (text, from) => text.split(from).length - 1'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-anchors-'))
try {
  fs.cpSync(HERE, tmp, { recursive: true })
  const lib = path.join(tmp, 'dctr-lib.mjs')
  fs.writeFileSync(lib, fs.readFileSync(lib, 'utf8').replace(TEXT, TEXT.replace('split(from)', 'split( from)')))

  const good = run(HERE)
  clause('clause 2 — the real tree stays quiet: exit 0 and every anchor counted once',
    good.status === 0 && /all \d+ anchors occur exactly once/.test(good.stdout), `status ${good.status}: ${good.stdout.slice(-300)}`)

  const broken = run(tmp)
  clause('clause 1 — an entry whose text was edited away trips the check, exits 1 and is named',
    broken.status === 1 && broken.stdout.split('\n').some((l) => l.includes('FAIL') && l.includes('dctr-lib.mjs')),
    `status ${broken.status}: ${broken.stdout.slice(-300)}`)

  const real = fs.readFileSync(path.join(HERE, 'dctr-lib.mjs'), 'utf8').split(TEXT).length - 1
  const edited = fs.readFileSync(lib, 'utf8').split(TEXT).length - 1
  const table = fs.readFileSync(path.join(HERE, 'dctr-mutations.mjs'), 'utf8')
  clause('clause 3 — the fixture carries the defect without the checker: the text is once in the real file, gone from the edited one, and named in the table',
    real === 1 && edited === 0 && table.includes(TEXT), `real ${real}, edited ${edited}, in table ${table.includes(TEXT)}`)
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }

process.exit(bad ? 1 : 0)
