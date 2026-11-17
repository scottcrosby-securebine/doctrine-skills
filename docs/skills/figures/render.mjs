#!/usr/bin/env node
// Renders one figure source to a 2400x1350 PNG.
//
// Usage, from the repo root:
//   node docs/skills/figures/render.mjs docs/skills/figures/<skill>.html docs/skills/<skill>.png
//
// A figure source is an HTML page that links figure.css beside this file and lays out a 1200x675 canvas, which
// renders at device scale 2. Copy specimen.html to start one: its comments say where each value goes.
//
// It needs playwright-core and its Chromium, untracked here on purpose (CLAUDE.md says why). It looks for the
// module from this file's directory upward, then from the main checkout `git rev-parse --git-common-dir` leads to,
// so a worktree uses the one install. Where neither has it, install it in the main checkout:
//   npm i -D playwright-core && node node_modules/playwright-core/cli.js install chromium
// The stylesheet loads its fonts from Google Fonts, so a render needs the network.
//
// Exit 0: the PNG is written. Exit 1: nothing is written, and the reason is printed: a font that did not load,
// content past the canvas's right or bottom edge, a page error or a failed request. Exit 2: bad arguments or no
// playwright-core. render.selftest.mjs beside this file is its tamper test.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const W = 1200, H = 675, SCALE = 2
const FONTS = ['Archivo', 'IBM Plex Sans', 'IBM Plex Mono']
const here = dirname(fileURLToPath(import.meta.url))
const fail = (code, msg) => { console.error(`render: ${msg}`); process.exit(code) }

const [src, out] = process.argv.slice(2)
if (!src || !out) fail(2, 'usage: node docs/skills/figures/render.mjs <source.html> <out.png>')
if (!existsSync(src)) fail(2, `${src} does not exist`)

function loadPlaywright() {
  const roots = [here]
  try {
    const common = execFileSync('git', ['-C', here, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    roots.push(dirname(common))
  } catch {}
  for (const r of roots) try { return createRequire(join(r, 'noop.js'))('playwright-core') } catch {}
  fail(2, `playwright-core not found from ${roots.join(' or ')}; in the main checkout run: npm i -D playwright-core && node node_modules/playwright-core/cli.js install chromium`)
}

const { chromium } = loadPlaywright()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })
  const problems = []
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`))
  await page.goto(pathToFileURL(resolve(src)).href, { waitUntil: 'networkidle' })
  const state = await page.evaluate(async (fonts) => {
    await document.fonts.ready
    const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))
    const el = document.documentElement
    return { missing: fonts.filter((f) => !loaded.has(f)), w: el.scrollWidth, h: el.scrollHeight }
  }, FONTS)
  if (state.missing.length) problems.push(`font not loaded: ${state.missing.join(', ')}`)
  if (state.w > W || state.h > H) problems.push(`content is ${state.w}x${state.h}, past the ${W}x${H} canvas`)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } })
  // Checked after the capture, so an error raised during it still refuses.
  if (problems.length) fail(1, problems.join('\n'))
  writeFileSync(out, png)
} finally {
  await browser.close()
}
console.log(`${out}: ${W * SCALE}x${H * SCALE}`)
