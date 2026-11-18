#!/usr/bin/env node
// Tamper test for render.mjs: a figure past the canvas, one without the set's fonts, one whose script throws and
// one with a missing file are each refused and write nothing, the specimen renders to 2400x1350, and each broken
// fixture is shown to carry its defect without render.mjs.
// Needs what render.mjs needs (its header says what). Exit 0 when every clause holds.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const css = pathToFileURL(join(here, 'figure.css')).href, js = pathToFileURL(join(here, 'figure.js')).href
const dir = mkdtempSync(join(tmpdir(), 'figure-selftest-'))
const page = (head, body) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`
const fixtures = {
  overflow: page(`<link rel="stylesheet" href="${css}">`, '<div style="width:1300px;height:10px"></div>'),
  nofonts: page('', '<p>plain</p>'),
  pageerror: page(`<link rel="stylesheet" href="${css}">`, `<svg class="wires" data-from="#nowhere" data-to="#nowhere"></svg><script src="${js}"></script>`),
  missing: page(`<link rel="stylesheet" href="${css}"><link rel="stylesheet" href="missing.css">`, '<p>plain</p>'),
}
let failed = 0
const clause = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++ }
const render = (src, out) => spawnSync(process.execPath, [join(here, 'render.mjs'), src, out], { encoding: 'utf8' })

try {
  for (const [k, v] of Object.entries(fixtures)) writeFileSync(join(dir, `${k}.html`), v)

  const o = render(join(dir, 'overflow.html'), join(dir, 'overflow.png'))
  if (o.status === 2) { console.error(o.stderr); process.exit(2) }
  clause('1a an element past the canvas is refused', o.status === 1 && /past the 1200x675 canvas/.test(o.stderr) && !existsSync(join(dir, 'overflow.png')))
  const n = render(join(dir, 'nofonts.html'), join(dir, 'nofonts.png'))
  clause('1b a page without the set\'s fonts is refused', n.status === 1 && /font not loaded: Archivo, IBM Plex Sans, IBM Plex Mono/.test(n.stderr) && !existsSync(join(dir, 'nofonts.png')))

  const e = render(join(dir, 'pageerror.html'), join(dir, 'pageerror.png'))
  clause('1c a script error in the page is refused', e.status === 1 && /page error: wires: nothing matches #nowhere/.test(e.stderr) && !existsSync(join(dir, 'pageerror.png')))
  const m = render(join(dir, 'missing.html'), join(dir, 'missing.png'))
  clause('1d a file the page cannot load is refused', m.status === 1 && /request failed: \S*missing\.css/.test(m.stderr) && !existsSync(join(dir, 'missing.png')))

  const s = render(join(here, 'specimen.html'), join(dir, 'specimen.png'))
  const b = s.status === 0 && readFileSync(join(dir, 'specimen.png'))
  clause('2  the specimen renders to a 2400x1350 PNG', !!b && b.toString('hex', 0, 8) === '89504e470d0a1a0a' && b.toString('latin1', 12, 16) === 'IHDR' && b.readUInt32BE(16) === 2400 && b.readUInt32BE(20) === 1350)

  clause('3a the overflow fixture is wider than the canvas', Number(/width:(\d+)px/.exec(fixtures.overflow)[1]) > 1200)
  clause('3b the fontless fixture loads no stylesheet and names no font', !/stylesheet|font/i.test(fixtures.nofonts))
  clause('3c the error fixture\'s wires name an id no element carries', !/id="nowhere"/.test(fixtures.pageerror) && /data-from="#nowhere"/.test(fixtures.pageerror))
  clause('3d the missing fixture links a file that does not exist', /href="missing\.css"/.test(fixtures.missing) && !existsSync(join(dir, 'missing.css')))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
