/* doctrine-gauntlet technical floor.
 *
 *   node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both]
 *          [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR]
 *
 * Renders 360/768/1440/2560 in the themes asked for, writes full-page
 * screenshots, and reports the floor: horizontal scroll, heading structure, axe
 * serious/critical, target size, page errors, reduced motion.
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
/* A full-page screenshot of a long page is read scaled to fit, so a 175px
   illustration is reviewed at thumbnail size and its defects are invisible.
   "Read the images at shipped size" needs an instrument, and this is it. */
const CROP = (argv.find(a => a.startsWith('--crop=')) || '').split('=').slice(1).join('=') || null
const [target, outPrefix, themeArg = 'both'] = argv.filter(a => !a.startsWith('--'))
const USAGE = 'usage: node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both] [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR]'
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
const cropNotes = new Set()
const innerClip = new Set()
/* 2560 is here because a whole defect class lives above 1440 and nothing below
   it can see the class at all: type authored at a fixed px size stays
   byte-identical while the sheet keeps expanding, so the pictures grow and the
   words do not. Measured live at 13px nav and an 11px primary call to action,
   identical at 1440, 1920, 2560 and 3840, after seven gauntlet rounds at
   360/768/1440 had passed the page every time. */
const WIDTHS = [[360, 780], [768, 1024], [1440, 900], [2560, 1440]]
const WIDEST = WIDTHS[WIDTHS.length - 1][0]
/* NOT the widest, deliberately. The inner-clip discriminator asks "does this
   still hide content when there is plenty of room?", and 1440 is where plenty
   of room starts — a component that clips at 1440 and not at 2560 is still a
   desktop layout defect. Anchoring that test to WIDEST instead would silently
   re-rule every such case as a deliberate responsive scroller the moment 2560
   joined the ladder. */
const DESKTOP = 1440
let clipAtDesktop = false
const typeScale = {}   // width -> { container, median, min }
const loneTargets = new Set()
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

/* THIS HARNESS APPLIES THE THEME ITSELF, so without this check a page whose dark
   palette is dead code passes the dark configurations exactly like one that
   ships a working switch — the instrument creates the state it then measures.
   Seen live: a page with a hardcoded data-theme="light", no media query and no
   toggle passed all six configurations while no user could reach three of them.
   Returns the mechanism found, or null. */
let reachedBy                   // undefined until probed, then string
const themeReachable = page => page.evaluate(cls => {
  let unreadable = false
  for (const sheet of document.styleSheets) {
    let rules
    /* A cross-origin sheet throws here. That is "cannot tell", NOT "absent" —
       treating it as absent reports a correctly-themed site as broken. */
    try { rules = sheet.cssRules } catch { unreadable = true; continue }
    /* cssText of a media rule contains its inner rules, so this catches nesting */
    for (const r of rules || []) {
      if (r.cssText && r.cssText.includes('prefers-color-scheme')) return 'a prefers-color-scheme rule'
    }
  }
  if (document.querySelector('[data-theme-toggle], [data-theme-switch]')) return 'a toggle attribute'
  const mentions = s => !!s && s.includes('data-theme')
  for (const s of document.scripts) if (mentions(s.textContent)) return 'a script that sets data-theme'
  for (const el of document.querySelectorAll('button, a, input, select')) {
    const t = `${el.id} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase()
    if (t.includes('dark mode') || t.includes('light mode') || /\btheme\b/.test(t)) return 'a control that looks like a theme switch'
  }
  /* Deliberately weak signals, reported as such rather than as a pass: a reset
     carrying `color-scheme: light dark`, or a bundle merely containing the theme
     class name, proves nothing about whether this page switches. */
  const weak = []
  if ((getComputedStyle(document.documentElement).colorScheme || '').includes('dark')) weak.push('a color-scheme declaration')
  if (document.querySelector('meta[name="color-scheme"]')) weak.push('a color-scheme meta')
  if (cls) for (const s of document.scripts) if (s.src || (s.textContent || '').includes(cls)) { weak.push(`a script that may reference "${cls}"`); break }
  if (unreadable) weak.push('a stylesheet this harness could not read (cross-origin)')
  return weak.length ? `only weak signals: ${weak.join(', ')}` : 'nothing'
}, THEME_CLASS)

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
    for (const [w, h] of WIDTHS) {
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
        /* Probe AFTER settling: a toggle injected by a deferred bundle does not
           exist at `load`, so probing earlier calls every hydrated app themeless. */
        if (reachedBy === undefined) reachedBy = await themeReachable(page)

        /* The layout check above reads the DOCUMENT. A component that scrolls
           inside itself — the standard fix for a wide table — hides any amount
           of content while the page reports no horizontal scroll at all. Seen
           live: 88px of a table clipped at 1440 with a quarter of the page
           empty beside it, and 73% of it gone at 360, floor green throughout. */
        const clipped = await page.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll('*')) {
            const ox = getComputedStyle(el).overflowX
            if (/(auto|scroll|hidden)/.test(ox) && el.scrollWidth > el.clientWidth + 1) {
              const cls = String(el.getAttribute('class') || '').split(' ')[0]
              out.push({ sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ''), hidden: el.scrollWidth - el.clientWidth })
            }
          }
          return out.sort((a, b) => b.hidden - a.hidden).slice(0, 3)
        })
        for (const c of clipped) innerClip.add(`${c.sel} hides ${c.hidden}px at ${theme} ${w}px`)
        if (clipped.length && w >= DESKTOP) clipAtDesktop = true

        /* WCAG 2.5.8 target size (AA). axe does not test it and a full-page
           screenshot cannot show it, which is how a primary call to action with
           a 145x14px hit area survived seven rounds of critics who were looking.
           Both of the spec's exceptions are implemented, because a check that
           fires on every prose link is a check people learn to scroll past. */
        const targetSize = await page.evaluate(() => {
          const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary,'
            + '[role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem]'
          const targets = [...document.querySelectorAll(SEL)]
            .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true')
            .map(el => ({ el, r: el.getBoundingClientRect() }))
            .filter(t => t.r.width > 0 && t.r.height > 0)
          const label = (el, r) => {
            const cls = String(el.getAttribute('class') || '').split(' ')[0]
            const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)
            return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} ${Math.round(r.width)}x${Math.round(r.height)}px${name ? ` "${name}"` : ''}`
          }
          const fail = [], lone = []
          for (const { el, r } of targets) {
            if (r.width >= 24 && r.height >= 24) continue
            /* INLINE exception — "in a sentence, or constrained by the
               line-height of non-target text". Two things it is NOT: an
               inline-BLOCK, which sets its own box and is not line-height
               constrained; and a link whose only neighbours are other links, so
               a nav bar of 13px anchors stays in scope. The test is a direct
               text node of the parent with something in it. */
            const cs = getComputedStyle(el)
            const inProse = [...(el.parentElement?.childNodes || [])]
              .some(n => n.nodeType === 3 && n.textContent.trim())
            if (cs.display === 'inline' && inProse) continue
            /* SPACING exception — a 24px DIAMETER circle centred on the target
               reaching no other target: 12px to another target's box, 24px to
               another undersized target's centre. */
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2
            const crowded = targets.some(({ r: o }) => {
              if (o === r) return false
              const dx = Math.max(o.left - cx, 0, cx - o.right)
              const dy = Math.max(o.top - cy, 0, cy - o.bottom)
              if (Math.hypot(dx, dy) < 12) return true
              return Math.hypot(cx - (o.left + o.width / 2), cy - (o.top + o.height / 2)) < 24
            })
            /* Spec-exempt but still small. Reported, never gated: 2.5.8 really
               does allow an isolated 145x14 link, and the harness must not
               invent a rule — but that link was a live campaign's primary call
               to action and a human called it a defect on sight. */
            ;(crowded ? fail : lone).push(label(el, r))
          }
          return { fail: [...new Set(fail)].slice(0, 6), lone: [...new Set(lone)].slice(0, 6) }
        })
        const smallTargets = targetSize.fail
        for (const t of targetSize.lone) loneTargets.add(`${t} at ${theme} ${w}px`)

        /* Functional type only — what a person must read or click. Decorative
           and display type may be any size it likes; that is the point of
           having a separate register, and gating it would be inventing a rule.
           Only the two widths the comparison uses: this walks every element
           twice over, and the narrow renders would pay for it unread. */
        if (w === DESKTOP || w === WIDEST) typeScale[w] = await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('p, li, a, button, label, input, td')]
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
            .map(el => parseFloat(getComputedStyle(el).fontSize))
            .filter(n => n > 0).sort((a, b) => a - b)
          /* The widest laid-out block is the sheet, whatever this project calls
             it. Capped at the viewport so an overflowing element cannot pose as
             a container that grew. */
          let container = 0
          for (const el of document.querySelectorAll('body *')) {
            if (!/^(block|flex|grid)$/.test(getComputedStyle(el).display)) continue
            const bw = el.getBoundingClientRect().width
            if (bw > container && bw <= window.innerWidth) container = bw
          }
          return {
            container: Math.round(container),
            median: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
            min: sizes.length ? sizes[0] : 0,
          }
        })

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

        /* 1:1 shot of a named region — the only way a reviewer sees a figure at
           the size it ships, rather than scaled into a full-page thumbnail. */
        if (CROP) {
          /* Everything here is best-effort. A figure hidden at one breakpoint
             makes .screenshot() wait for actionability and time out, and a
             malformed selector throws in .count() — either would escape to the
             outer catch and report CANNOT RUN on a page that rendered fine.
             A missing crop is a note, never the end of the floor. */
          try {
            if (await page.locator(CROP).count()) {
              await page.locator(CROP).first().screenshot({
                path: `${outPrefix}-${theme}-${w}-crop.png`, timeout: 5000,
              })
            } else cropNotes.add(`${CROP} matched nothing at ${theme} ${w}px`)
          } catch (e) {
            cropNotes.add(`${CROP} at ${theme} ${w}px: ${String(e).split('\n')[0].slice(0, 80)}`)
          }
        }

        let axeOut = { serious: [], critical: [] }
        if (AXE) {
          try {
            await page.evaluate(AXE)
            axeOut = await page.evaluate(async () => {
              const run = window.axe.run(document, { resultTypes: ['violations'] })
              const r = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('axe timed out')), 45000))])
              /* Name several targets, not just nodes[0]. "x21 :: .lede" reads as
                 21 of .lede and sends the fix to one element while the other 20
                 sit elsewhere — a count and a selector that describe different
                 things. Distinct selectors, because 18 sibling table cells are
                 one defect and should not crowd out the others. */
              const pick = imp => r.violations.filter(v => v.impact === imp)
                .map(v => {
                  /* Group by failure reason, not by node: 18 sibling table cells
                     failing on one colour pair are one defect, and listing four of
                     them would hide the two other defects underneath. */
                  const groups = new Map()
                  for (const n of v.nodes) {
                    const target = (n.target || []).join(' ')
                    /* Only some rules state a reason worth grouping on — contrast
                       names its colour pair. Where there is none, group by element,
                       or every node lands in one bucket and the line prints nodes[0]
                       again with the count twice: worse than what it replaced. */
                    const why = (n.any?.[0]?.message || '').match(/#[0-9a-f]{3,8}/gi)?.join(' on ') || null
                    const key = why || target
                    if (!groups.has(key)) groups.set(key, { target, why, n: 0 })
                    groups.get(key).n++
                  }
                  const shown = [...groups.values()].slice(0, 4)
                    .map(g => `${g.target}${g.n > 1 ? ` x${g.n}` : ''}${g.why ? ` (${g.why})` : ''}`)
                  const more = groups.size > shown.length ? ` +${groups.size - shown.length} more` : ''
                  return `${v.id} x${v.nodes.length} :: ${shown.join(' | ')}${more}`.slice(0, 400)
                })
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
          || smallTargets.length
        if (bad) failures++
        console.log(`\n[${theme} ${w}px] ${bad ? 'FAIL' : 'ok'}  height=${struct.height}`)
        if (struct.hScroll) console.log(`  ! HORIZONTAL SCROLL: scrollWidth=${struct.scrollW} vs ${w}`)
        for (const t of smallTargets) console.log(`  ! FAILS WCAG 2.5.8 (under 24x24, and crowded): ${t}`)
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
let switchDead = false
if (themes.length === 2) {
  const same = Object.keys(fingerprint.dark || {}).filter(w => fingerprint.dark[w] === fingerprint.light?.[w])
  switchDead = same.length > 0
  if (same.length) {
    unmeasured.push(`theme switch had no effect at ${same.join(', ')}px — the dark and light renders are the same theme. If the project themes by a class on <html> (Tailwind's \`dark\`, say), re-run with --theme-class=NAME; otherwise drive the project's own theme mechanism before trusting either render.`)
  }
} else if (!SINGLE_THEME) {
  unmeasured.push(`only the ${themes[0]} theme was rendered — the other theme is unchecked, and the floor requires both. If this project genuinely ships one theme, re-run with --single-theme and it is measured, not missing.`)
}

/* A JUDGE line, not an UNMEASURED one, and the distinction is load-bearing.
   UNMEASURED means "this run failed to measure something" — but both themes were
   measured perfectly; the defect is that one of them ships to nobody. That is a
   page defect, and UNMEASURED is waivable by the user while a floor failure is
   not. Detecting it is also heuristic — no probe separates a real toggle from a
   nav link called "Themes" — and heuristics belong in front of eyes, not in an
   exit code. A critic answering "no, a user cannot reach it" IS a floor failure
   and blocks, per the floor list in SKILL.md. */
/* Not for fragments: a card or partial is embedded in a page, and the PAGE owns
   theme switching. Asking a component preview how a user reaches dark is noise,
   and noise in a JUDGE line trains people to skip JUDGE lines. */
if (themes.length === 2 && !SINGLE_THEME && !FRAGMENT) {
  /* Defer to the fingerprint. It is evidence; the probe is a heuristic, and a
     confident "found a prefers-color-scheme rule" next to a proven-dead switch
     reads as two harnesses arguing. Tailwind emits those media queries whether
     or not the app's own theme (MUI, say) honours them. */
  handoff.push(switchDead
    ? `theme reachability — the switch above had NO effect, so whatever this page themes by, it is not what the harness drove. The probe found ${reachedBy}, which on this evidence is not the live mechanism. Either drive the project's own switch and re-run, or if it genuinely ships one theme, say so with --single-theme.`
    : `theme reachability — this harness APPLIED the theme itself, so both renders exist whether or not the page can switch. Probing the page found ${reachedBy}. Confirm a user can actually reach the second theme; if they cannot, its palette is dead code and that is a floor failure, not a note.`)
}

for (const n of cropNotes) handoff.push(`--crop could not shoot a region: ${n} — the thing you wanted at shipped size was not seen by anyone.`)

/* A JUDGE line: some scrollers are deliberate (a carousel, a wide grid by
   design) and a heuristic must not fail those. But the reader has to be told,
   because the layout check above cannot see it. */
if (innerClip.size) {
  handoff.push(`content hidden inside scrollable components — the page-level layout check cannot see this, so it passed:\n    ${[...innerClip].join('\n    ')}\n  ${clipAtDesktop
    ? `>> IT CLIPS AT ${DESKTOP}px OR WIDER. A region that still hides content with a desktop's worth of room is a layout defect, not a responsive decision. Treat as blocking unless the component is a carousel by design.`
    : `Only below ${DESKTOP}px — the signature of a deliberate responsive scroller. Confirm it is one.`}`)
}

/* Undersized but spec-exempt, so it is put in front of eyes instead of an exit
   code. The exemption is real and the defect can be real at the same time: the
   live case was an 11px "See full details" in a 145x14 box — the primary call
   to action on every card, isolated enough to pass 2.5.8, and the first thing
   the client named on sight. */
if (loneTargets.size) {
  handoff.push(`targets under 24x24 that WCAG 2.5.8 EXEMPTS because nothing is near them — the spec is satisfied and the control may still be too small to hit or read:\n    ${[...loneTargets].slice(0, 8).join('\n    ')}`)
}

/* The layout grew and the type did not. Invisible at any single width: only the
   DELTA between two widths shows it, which is why a ladder ending at 1440 could
   not have found it however many rounds it ran. Measured live: nav 13px and an
   11px card CTA byte-identical at 1440, 1920, 2560 and 3840 while the sheet
   expanded to 1848px and aspect-ratio figures grew to 674px tall.
   A JUDGE line, not a gate: a design may cap its type deliberately, and the
   harness cannot tell that from an oversight. The numbers make it answerable. */
/* Not for fragments, for the same reason reachability is not: a card specimen
   has no max-width of its own, so its container "grows" to every viewport and
   the check fires on every card in every kit. Type scale is a PAGE decision and
   the page it gets embedded in owns it. */
if (!FRAGMENT) {
  const ref = typeScale[DESKTOP], top = typeScale[WIDEST]
  if (ref && top && ref.container && top.container > ref.container * 1.05 && top.median <= ref.median) {
    const grew = Math.round((top.container / ref.container - 1) * 100)
    handoff.push(`type frozen above ${DESKTOP}px — the layout grew ${grew}% from ${DESKTOP} to ${WIDEST}px `
      + `(container ${ref.container} -> ${top.container}px) while the median functional type did not grow at all `
      + `(${ref.median}px at both, smallest ${top.min}px). If the sheet scales with the viewport the type has to, `
      + `or the words become a footnote to the pictures. Decorative type is exempt; controls and body copy are not.`)
  }
}

for (const u of unmeasured) console.log(`\n[UNMEASURED] ${u}`)
for (const h of handoff) console.log(`\n[JUDGE] ${h}`)
const verdict = failures ? `${failures} failing configuration(s)` : (unmeasured.length ? 'PASS on what was measured' : 'PASS')
console.log(`\n=== TECHNICAL FLOOR: ${verdict} ===`)
if (unmeasured.length) console.log('Unmeasured is not clean. Report it; the user waives it or the run stops.')
/* exit 3, not 0: a caller keying on status must not read "nothing failed" as
   "the floor passed" when items were never measured. */
process.exit(failures ? 1 : (unmeasured.length ? 3 : 0))
