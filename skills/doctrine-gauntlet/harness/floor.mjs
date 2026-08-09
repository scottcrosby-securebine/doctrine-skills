/* doctrine-gauntlet technical floor.
 *
 *   node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both]
 *
 * Renders 360/768/1440 in the themes asked for, writes full-page screenshots,
 * and reports the floor: horizontal scroll, heading structure, axe
 * serious/critical, page errors, reduced motion.
 *
 * Portable by design: nothing here hardcodes a path. Chromium and axe are
 * resolved from whatever the host has, and anything missing is reported as
 * UNMEASURED rather than silently passing.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const FRAGMENT = argv.includes('--fragment')
const [target, outPrefix, themeArg = 'both'] = argv.filter(a => a !== '--fragment')
if (!target || !outPrefix) {
  console.error('usage: node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both] [--fragment]')
  process.exit(2)
}
/* fileURLToPath, not .pathname: the latter keeps %20 in spaced paths and
   yields /C:/... on Windows, silently breaking this resolution root. */
const HERE = dirname(fileURLToPath(import.meta.url))

/* ---- resolve a module from any root the host plausibly has ---- */
function roots() {
  const out = [process.cwd(), HERE]
  /* NODE_PATH is the escape hatch for projects that have no node_modules of
     their own — a static HTML design system, say — so they can borrow an
     install that already exists instead of adding a toolchain to the repo. */
  for (const p of (process.env.NODE_PATH || '').split(':')) if (p) out.push(p)
  const npm = (...args) => execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try { out.push(npm('root')) } catch {}
  try { out.push(npm('root', '-g')) } catch {}
  return out.filter(Boolean)
}
function tryRequire(names) {
  for (const root of roots()) {
    for (const name of names) {
      try { return createRequire(join(root, 'noop.js'))(name) } catch {}
    }
  }
  return null
}

const pw = tryRequire(['playwright-core', 'playwright'])
if (!pw) {
  console.error(`FLOOR: CANNOT RUN — no Playwright available.
Install it where the deliverable lives, then re-run:
  npm i -D playwright-core && npx playwright install chromium
Or, for a project with no node_modules of its own, point at an existing one:
  NODE_PATH=/path/to/node_modules node floor.mjs ...
The gauntlet does not proceed on an unrendered page: a critic that cannot
look has reviewed nothing. Report this to the user rather than skipping it.`)
  process.exit(2)
}

/* axe is optional; absent means UNMEASURED, never "pass" */
let AXE = null
const axePkg = tryRequire(['axe-core'])
if (axePkg?.source) AXE = axePkg.source
else {
  for (const root of roots()) {
    const p = join(root, 'axe-core', 'axe.min.js')
    if (existsSync(p)) { AXE = (await import('node:fs')).readFileSync(p, 'utf8'); break }
  }
}

const url = /^https?:/.test(target) ? target : 'file://' + resolve(target)
const themes = themeArg === 'both' ? ['dark', 'light'] : [themeArg]

let browser
try {
  browser = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] })
} catch (e) {
  console.error(`FLOOR: CANNOT RUN — Playwright is installed but no browser binary launched.
  ${String(e).split('\n')[0]}
Install the browser, then re-run:
  npx playwright install chromium`)
  process.exit(2)
}

let failures = 0
const unmeasured = []
const bgByTheme = {}
if (!AXE) unmeasured.push('axe (accessibility) — npm i -D axe-core to measure it')
/* These are floor items the skill requires and this harness cannot judge.
   Naming them keeps the verdict honest: the alternative is a bare PASS for
   things nothing ever looked at. */
unmeasured.push('non-text contrast, WCAG 1.4.11 (charts, icons, focus rings) — measure by hand')
unmeasured.push('visible focus on every interactive element — tab through and look')

/* dev-server overlays are harness artifacts, not design; hide before shooting */
const HIDE_OVERLAYS = `
  nextjs-portal, #nextjs__container, [data-nextjs-toast],
  #__next-build-watcher, vite-error-overlay, #vite-error-overlay,
  #react-refresh-overlay, .webpack-dev-server-client-overlay
  { display: none !important; }
`

for (const theme of themes) {
  for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e).slice(0, 180)))
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })

    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.addStyleTag({ content: HIDE_OVERLAYS })

    /* a full-page screenshot does NOT trigger lazy loading — scroll first, or
       the lower half comes back blank and a critic rejects content that exists */
    await page.evaluate(async () => {
      const step = window.innerHeight
      /* bounded: scrollHeight is re-read each pass, so a feed that grows as
         you scroll would never satisfy the condition, and page.evaluate has
         no timeout of its own — the process would hang with no verdict. */
      for (let y = 0, n = 0; y < document.body.scrollHeight && n < 60; y += step, n++) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
      /* bounded: a lazy image that is never fetched fires no event at all */
      await Promise.race([
        Promise.all([...document.images].filter(i => !i.complete)
          .map(i => new Promise(r => { i.onload = i.onerror = r }))),
        new Promise(r => setTimeout(r, 5000)),
      ])
    })
    await page.waitForTimeout(1200)

    const struct = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e => +e.tagName[1])
      let skip = null
      for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skip = `h${hs[i - 1]}->h${hs[i]}`
      const blank = [...document.images].filter(i => i.complete && i.naturalWidth === 0).length
      return {
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollW: document.documentElement.scrollWidth,
        h1: document.querySelectorAll('h1').length,
        headingSkip: skip, blankImages: blank, height: document.body.scrollHeight,
        bg: getComputedStyle(document.body).backgroundColor,
      }
    })
    bgByTheme[theme] = struct.bg

    await page.screenshot({ path: `${outPrefix}-${theme}-${w}.png`, fullPage: true })

    let axeOut = { serious: [], critical: [] }
    if (AXE) {
      try {
        await page.evaluate(AXE)
        axeOut = await page.evaluate(async () => {
          const r = await window.axe.run(document, { resultTypes: ['violations'] })
          const pick = imp => r.violations.filter(v => v.impact === imp)
            .map(v => `${v.id} x${v.nodes.length} :: ${(v.nodes[0]?.target || []).join(' ')}`.slice(0, 200))
          return { serious: pick('serious'), critical: pick('critical') }
        })
      } catch (e) { axeOut = { serious: [], critical: [] }; unmeasured.push('axe failed at runtime: ' + String(e).slice(0, 80)) }
    }

    /* A fragment or design-system card legitimately has no h1; gating on it
       would make that phase unable to ever pass. Two h1s is wrong anywhere. */
    const h1Bad = FRAGMENT ? struct.h1 > 1 : struct.h1 !== 1
    const bad = struct.hScroll || h1Bad || struct.headingSkip
      || axeOut.serious.length || axeOut.critical.length
    if (bad) failures++
    console.log(`\n[${theme} ${w}px] ${bad ? 'FAIL' : 'ok'}  height=${struct.height}`)
    if (struct.hScroll) console.log(`  ! HORIZONTAL SCROLL: scrollWidth=${struct.scrollW} vs ${w}`)
    if (h1Bad) console.log(`  ! h1 count = ${struct.h1} (${FRAGMENT ? 'at most 1 in a fragment' : 'must be exactly 1'})`)
    if (struct.headingSkip) console.log(`  ! heading level skip: ${struct.headingSkip}`)
    for (const v of axeOut.critical) console.log(`  ! axe CRITICAL: ${v}`)
    for (const v of axeOut.serious) console.log(`  ! axe serious: ${v}`)
    if (struct.blankImages) console.log(`  ? ${struct.blankImages} image(s) failed to load — check before judging them missing`)
    /* page errors are reported, not gated: dev servers emit hydration noise a
       built page never has. Judge them, don't let them fail the floor. */
    for (const e of [...new Set(errs)].slice(0, 3)) console.log(`  ~ js (not gated): ${e}`)
    await ctx.close()
  }
}

/* reduced motion must actually work */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: themes[0] })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.addStyleTag({ content: HIDE_OVERLAYS })
  /* scroll here too, or below-the-fold IntersectionObserver reveals are still
     at opacity 0 and get reported as content the page never showed */
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0, n = 0; y < document.body.scrollHeight && n < 60; y += step, n++) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(1500)
  const hidden = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,p,a,li')]
    .filter(e => e.textContent.trim() && (getComputedStyle(e).opacity === '0'
      || getComputedStyle(e).visibility === 'hidden'
      || /inset\((?!0px 0px 0px 0px)/.test(getComputedStyle(e).clipPath)))
    .map(e => e.tagName + ':' + e.textContent.trim().slice(0, 40)).slice(0, 6))
  await page.screenshot({ path: `${outPrefix}-reducedmotion.png`, fullPage: true })
  if (hidden.length) { failures++; console.log(`\n[reduced-motion] FAIL — content still hidden:`); hidden.forEach(x => console.log('  ! ' + x)) }
  else console.log(`\n[reduced-motion] ok — all content visible`)
  await ctx.close()
}

await browser.close()

/* Both themes must actually differ. A project using class-based dark mode
   honours neither colorScheme nor data-theme, so both passes would render the
   same theme, write -dark- and -light- files, and report two passes for one
   theme — while a critic grades "both themes designed with equal care" from
   two identical images. */
if (bgByTheme.dark && bgByTheme.light && bgByTheme.dark === bgByTheme.light) {
  unmeasured.push(`theme switch never took effect — both renders are the same theme (body background ${bgByTheme.dark} in each). Set the project's own theme mechanism before trusting either.`)
}

for (const u of unmeasured) console.log(`\n[UNMEASURED] ${u}`)
const verdict = failures ? `${failures} failing configuration(s)` : (unmeasured.length ? 'PASS on what was measured' : 'PASS')
console.log(`\n=== TECHNICAL FLOOR: ${verdict} ===`)
if (unmeasured.length) console.log('Unmeasured is not clean. Report it; the user waives it or the run stops.')
/* exit 3, not 0: a caller keying on status must not read "nothing failed" as
   "the floor passed" when items were never measured. */
process.exit(failures ? 1 : (unmeasured.length ? 3 : 0))
