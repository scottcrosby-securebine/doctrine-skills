/* doctrine-gauntlet technical floor.
 *
 *   node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both]
 *                  [--fragment] [--single-theme] [--theme-class=NAME]
 *
 * Renders 360/768/1440 in the themes asked for, writes full-page screenshots,
 * and reports the floor: horizontal scroll, heading structure, axe
 * serious/critical, page errors, reduced motion.
 *
 * Exit codes:  0 clean · 1 failing configurations · 2 could not run ·
 *              3 nothing failed but something went unmeasured (NOT a pass).
 *
 * Two rules govern every change here. Nothing may be machine-specific: this
 * ships to strangers' machines. And nothing may report a pass for something it
 * did not measure — an honest UNMEASURED is the whole point of the file.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, dirname, join, delimiter } from 'node:path'

const argv = process.argv.slice(2)
const FRAGMENT = argv.includes('--fragment')
/* A project that genuinely ships one theme is not "unmeasured" — without this
   it can never reach a clean floor, because the missing theme reports forever. */
const SINGLE_THEME = argv.includes('--single-theme')
/* data-theme and colorScheme are two of the three common mechanisms. The third
   is a class on <html> (Tailwind's `dark`), which nothing else here can set. */
const THEME_CLASS = (argv.find(a => a.startsWith('--theme-class=')) || '').split('=')[1] || null
const [target, outPrefix, themeArg = 'both'] = argv.filter(a => !a.startsWith('--'))
const USAGE = 'usage: node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both] [--fragment] [--single-theme] [--theme-class=NAME]'
if (!target || !outPrefix) { console.error(USAGE); process.exit(2) }
if (!['dark', 'light', 'both'].includes(themeArg)) {
  console.error(`${USAGE}\n  unknown theme "${themeArg}" — expected dark, light or both`)
  process.exit(2)   // validate before launching, or it throws with a browser open
}
if (SINGLE_THEME && themeArg === 'both') {
  console.error(`${USAGE}\n  --single-theme needs the one theme named: pass dark or light, not both`)
  process.exit(2)
}

/* Exactly one place applies the theme. Two call sites drift: the reduced-motion
   pass set data-theme without the class, so a class-themed project measured
   reduced motion in whichever theme the page happened to load in. */
const applyTheme = (page, theme) => page.evaluate(({ t, cls }) => {
  document.documentElement.setAttribute('data-theme', t)
  if (cls) document.documentElement.classList.toggle(cls, t === 'dark')
}, { t: theme, cls: THEME_CLASS })
/* fileURLToPath, not .pathname: the latter keeps %20 in spaced paths and
   yields /C:/... on Windows, silently breaking this resolution root. */
const HERE = dirname(fileURLToPath(import.meta.url))

/* ---- resolve a module from any root the host plausibly has ---- */
function roots() {
  const out = [process.cwd(), HERE]
  /* NODE_PATH is the escape hatch for projects with no node_modules of their
     own — a static HTML design system, say. `delimiter`, not ':', because on
     Windows the separator is ';' and drive letters contain a colon. */
  for (const p of (process.env.NODE_PATH || '').split(delimiter)) if (p) out.push(p)
  const npm = (...args) => execFileSync('npm', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000, killSignal: 'SIGKILL',   // a broken npm shim can block forever
  }).trim()
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
else for (const root of roots()) {
  const p = join(root, 'axe-core', 'axe.min.js')
  if (existsSync(p)) { AXE = readFileSync(p, 'utf8'); break }
}

/* pathToFileURL handles spaces, #, % and Windows drive letters; a file: or
   other URL the caller already supplied is passed through untouched. */
const url = /^[a-z][a-z0-9+.-]*:/i.test(target) ? target : pathToFileURL(resolve(target)).href
const themes = themeArg === 'both' ? ['dark', 'light'] : [themeArg]

let browser
try {
  browser = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] })
} catch (e) {
  console.error(`FLOOR: CANNOT RUN — Playwright is installed but no browser launched.
  ${String(e).split('\n')[0]}
Install the browser, then re-run:
  npx playwright install chromium`)
  process.exit(2)
}

let failures = 0
/* Two different things, deliberately kept apart:
   - `unmeasured` is a gap in THIS run that should not have been there — axe
     missing, axe timing out, a theme switch that did nothing. It is not clean,
     and it drives exit 3.
   - `handoff` is work this harness never does by design, because it needs eyes.
     It is printed for the critic, and it does NOT touch the exit code. Folding
     these into `unmeasured` made exit 0 unreachable, which made the fused
     gate's two-clean-pass exit unreachable with it. */
const unmeasured = []
const handoff = [
  'non-text contrast, WCAG 1.4.11 (charts, icons, focus rings) — axe does not check it',
  'visible focus on every interactive element — tab through and look',
]
const fingerprint = {}   // theme -> width -> computed-style signature
if (!AXE) unmeasured.push('axe (accessibility) — npm i -D axe-core to measure it')

/* dev-server overlays are harness artifacts, not design; hide before shooting */
const HIDE_OVERLAYS = `
  nextjs-portal, #nextjs__container, [data-nextjs-toast],
  #__next-build-watcher, vite-error-overlay, #vite-error-overlay,
  #react-refresh-overlay, .webpack-dev-server-client-overlay
  { display: none !important; }
`

/* Scroll the whole page so lazy images load. Bounded: scrollHeight is re-read
   each pass, so a feed that grows as you scroll would never satisfy the
   condition, and page.evaluate has no timeout — the process would just hang. */
const SETTLE = async page => page.evaluate(async () => {
  const step = window.innerHeight
  for (let y = 0, n = 0; y < document.body.scrollHeight && n < 60; y += step, n++) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120))
  }
  window.scrollTo(0, 0)
  await Promise.race([
    Promise.all([...document.images].filter(i => !i.complete)
      .map(i => new Promise(r => { i.onload = i.onerror = r }))),
    new Promise(r => setTimeout(r, 5000)),
  ])
})

let fatal = null
try {
  for (const theme of themes) {
    fingerprint[theme] = {}
    for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1 })
      try {
        const page = await ctx.newPage()
        const crashes = []   // uncaught exceptions: the page actually broke
        const noise = []     // console.error: usually dev-server chatter
        page.on('pageerror', e => crashes.push(String(e).slice(0, 180)))
        page.on('console', m => { if (m.type() === 'error') noise.push(m.text().slice(0, 160)) })

        await page.goto(url, { waitUntil: 'load' })
        await applyTheme(page, theme)
        await page.addStyleTag({ content: HIDE_OVERLAYS })
        await SETTLE(page)
        await page.waitForTimeout(1200)

        const struct = await page.evaluate(() => {
          const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e => +e.tagName[1])
          let skip = null
          for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skip = `h${hs[i - 1]}->h${hs[i]}`
          const cs = getComputedStyle(document.body)
          /* also the root: a page that paints its ground on html/:root leaves
             body transparent in both themes, which would read as "the theme
             never switched" on a page whose themes are fine */
          const rs = getComputedStyle(document.documentElement)
          const first = document.querySelector('main, section, article, div')
          const fcs = first ? getComputedStyle(first) : cs
          return {
            hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
            scrollW: document.documentElement.scrollWidth,
            h1: document.querySelectorAll('h1').length,
            headingSkip: skip,
            blankImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
            height: document.body.scrollHeight,
            /* several theme-sensitive values, not one: a page can change an
               incidental body background while the real theme never switched */
            sig: [rs.backgroundColor, rs.color, cs.backgroundColor, cs.color, fcs.backgroundColor, fcs.borderTopColor].join('|'),
          }
        })
        fingerprint[theme][w] = struct.sig

        await page.screenshot({ path: `${outPrefix}-${theme}-${w}.png`, fullPage: true })

        let axeOut = { serious: [], critical: [] }
        if (AXE) {
          try {
            await page.evaluate(AXE)
            axeOut = await page.evaluate(async () => {
              const run = window.axe.run(document, { resultTypes: ['violations'] })
              const r = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('axe timed out')), 45000))])
              const pick = imp => r.violations.filter(v => v.impact === imp)
                .map(v => `${v.id} x${v.nodes.length} :: ${(v.nodes[0]?.target || []).join(' ')}`.slice(0, 200))
              return { serious: pick('serious'), critical: pick('critical') }
            })
          } catch (e) {
            unmeasured.push(`axe at ${theme} ${w}px: ${String(e).slice(0, 90)}`)
          }
        }

        /* A fragment or design-system card legitimately has no h1; gating on it
           would make that phase unable to ever pass. Two h1s is wrong anywhere. */
        const h1Bad = FRAGMENT ? struct.h1 > 1 : struct.h1 !== 1
        const bad = struct.hScroll || h1Bad || struct.headingSkip
          || axeOut.serious.length || axeOut.critical.length || crashes.length
        if (bad) failures++
        console.log(`\n[${theme} ${w}px] ${bad ? 'FAIL' : 'ok'}  height=${struct.height}`)
        if (struct.hScroll) console.log(`  ! HORIZONTAL SCROLL: scrollWidth=${struct.scrollW} vs ${w}`)
        if (h1Bad) console.log(`  ! h1 count = ${struct.h1} (${FRAGMENT ? 'at most 1 in a fragment' : 'must be exactly 1'})`)
        if (struct.headingSkip) console.log(`  ! heading level skip: ${struct.headingSkip}`)
        for (const v of axeOut.critical) console.log(`  ! axe CRITICAL: ${v}`)
        for (const v of axeOut.serious) console.log(`  ! axe serious: ${v}`)
        /* An uncaught exception means the page broke; that is gated. Console
           errors are usually dev-server hydration chatter a built page never
           has, so they are reported and left for a human to judge. */
        for (const e of [...new Set(crashes)].slice(0, 3)) console.log(`  ! page threw: ${e}`)
        for (const e of [...new Set(noise)].slice(0, 2)) console.log(`  ~ console (not gated): ${e}`)
        if (struct.blankImages) console.log(`  ? ${struct.blankImages} image(s) failed to load — check before judging them missing`)
      } finally {
        await ctx.close()
      }
    }
  }

  /* reduced motion: content must be visible, and nothing should still be animating */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: themes[0] })
    try {
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'load' })
      await applyTheme(page, themes[0])
      await page.addStyleTag({ content: HIDE_OVERLAYS })
      await SETTLE(page)   // or below-the-fold reveals are still at opacity 0
      await page.waitForTimeout(1200)
      const rm = await page.evaluate(() => ({
        hidden: [...document.querySelectorAll('h1,h2,h3,p,a,li')]
          .filter(e => e.textContent.trim() && (getComputedStyle(e).opacity === '0'
            || getComputedStyle(e).visibility === 'hidden'
            || /inset\((?!0px 0px 0px 0px)/.test(getComputedStyle(e).clipPath)))
          .map(e => e.tagName + ':' + e.textContent.trim().slice(0, 40)).slice(0, 6),
        running: document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : -1,
      }))
      await page.screenshot({ path: `${outPrefix}-reducedmotion.png`, fullPage: true })
      if (rm.hidden.length) {
        failures++
        console.log(`\n[reduced-motion] FAIL — content still hidden:`)
        rm.hidden.forEach(x => console.log('  ! ' + x))
      } else console.log(`\n[reduced-motion] ok — all content visible`)
      if (rm.running > 0) { failures++; console.log(`  ! ${rm.running} animation(s) still running under prefers-reduced-motion`) }
      /* getAnimations covers CSS and WAAPI only; motion driven by
         requestAnimationFrame or canvas is invisible to it. */
      handoff.push('rAF/canvas-driven motion under prefers-reduced-motion — watch the page and judge')
    } finally {
      await ctx.close()
    }
  }
} catch (e) {
  fatal = e            // a bad URL, a dead server, a navigation timeout
} finally {
  await browser.close()   // every path, or a Chromium process leaks
}

if (fatal) {
  /* exit 2, not 1: nothing was measured, so this is "could not run", not
     "the page failed". Letting it throw at top level exits 1 with a stack,
     which reads as a floor failure the page never had. */
  console.error(`\nFLOOR: CANNOT RUN — could not render ${url}
  ${String(fatal).split('\n')[0]}
Check the target is reachable and the dev server is up, then re-run.`)
  process.exit(2)
}

/* Both themes must actually differ. A project using class-based dark mode
   honours neither colorScheme nor data-theme, so both passes would render the
   same theme, write -dark- and -light- files, and report two passes for one
   theme — while a critic grades "both themes designed with equal care" from
   two identical images. Compared per width, not once. */
if (themes.length === 2) {
  const same = Object.keys(fingerprint.dark || {}).filter(w => fingerprint.dark[w] === fingerprint.light?.[w])
  if (same.length) {
    unmeasured.push(`theme switch had no effect at ${same.join(', ')}px — the dark and light renders are the same theme. If the project themes by a class on <html> (Tailwind's \`dark\`, say), re-run with --theme-class=NAME; otherwise drive the project's own theme mechanism before trusting either render.`)
  }
} else if (!SINGLE_THEME) {
  unmeasured.push(`only the ${themes[0]} theme was rendered — the other theme is unchecked, and the floor requires both. If this project genuinely ships one theme, re-run with --single-theme and it is measured, not missing.`)
}

for (const u of unmeasured) console.log(`\n[UNMEASURED] ${u}`)
for (const h of handoff) console.log(`\n[JUDGE] ${h}`)
const verdict = failures ? `${failures} failing configuration(s)` : (unmeasured.length ? 'PASS on what was measured' : 'PASS')
console.log(`\n=== TECHNICAL FLOOR: ${verdict} ===`)
if (unmeasured.length) console.log('Unmeasured is not clean. Report it; the user waives it or the run stops.')
/* exit 3, not 0: a caller keying on status must not read "nothing failed" as
   "the floor passed" when items were never measured. */
process.exit(failures ? 1 : (unmeasured.length ? 3 : 0))
