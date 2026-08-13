/* doctrine-gauntlet technical floor.
 *
 *   node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both]
 *          [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR] [--expect=TEXT]
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
const THEME_CLASS = (argv.find(a => a.startsWith('--theme-class=')) || '').split('=').slice(1).join('=') || null
/* Assert the target IS what you meant before measuring it. See the identity
   block below for the run this exists because of. */
const EXPECT = (argv.find(a => a.startsWith('--expect=')) || '').split('=').slice(1).join('=') || null
/* A full-page screenshot of a long page is read scaled to fit, so a 175px
   illustration is reviewed at thumbnail size and its defects are invisible.
   "Read the images at shipped size" needs an instrument, and this is it. */
const CROP = (argv.find(a => a.startsWith('--crop=')) || '').split('=').slice(1).join('=') || null
const [target, outPrefix, themeArg = 'both'] = argv.filter(a => !a.startsWith('--'))
const USAGE = 'usage: node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both] [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR] [--expect=TEXT]'
/* An unknown flag must not run to completion. `--theme_class=dark` matched
   nothing here, rendered both passes in one palette, and reported a false
   "theme switch had no effect" whose remedy text told you to pass the flag you
   thought you had just passed — a confident wrong answer, which costs more than
   a refusal. An empty value is the same bug with a subtler spelling:
   `--crop=` parses to null and silently shoots no region at all. */
const KNOWN_FLAGS = ['--fragment', '--single-theme', '--theme-class=', '--crop=', '--expect=']
for (const a of argv.filter(a => a.startsWith('--'))) {
  const k = KNOWN_FLAGS.find(k => k.endsWith('=') ? a.startsWith(k) : a === k)
  if (!k) {
    console.error(`${USAGE}\n  unknown flag "${a}" — nothing here reads it, so it would have changed nothing while looking like it had`)
    process.exit(2)
  }
  if (k.endsWith('=') && !a.slice(k.length)) {
    console.error(`${USAGE}\n  "${a}" has no value, so it sets nothing — pass ${k}SOMETHING or drop the flag`)
    process.exit(2)
  }
}
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
/* A repo may VENDOR axe rather than depend on it — a static design system with
   no package.json has nowhere else to put it. Without these two paths the
   harness reports accessibility unmeasured on a project that ships the very
   file it is looking for, and unmeasured blocks. */
else for (const root of roots()) {
  for (const p of [join(root, 'axe-core', 'axe.min.js'),
                   join(root, 'axe.min.js'),
                   join(root, 'harness', 'axe.min.js')]) {
    if (existsSync(p)) { AXE = readFileSync(p, 'utf8'); break }
  }
  if (AXE) break
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
const blankImages = new Set()
/* axe's third bucket, split by whether the floor list names the thing it could
   not decide. See where these are emptied, below the loops. */
const contrastUndetermined = new Set()
const axeIncomplete = new Set()
/* Print at most n of a list, and SAY SO when there were more. A silent cap is
   how a builder fixes "the 6 undersized targets", ships the seventh, and reads
   next round's identically-capped report as a fresh finding. */
const show = (list, n, line) => {
  for (const x of list.slice(0, n)) console.log(line(x))
  if (list.length > n) console.log(`  … ${list.length - n} more not shown (${list.length} total)`)
}
/* Two different things, deliberately kept apart:
   - `unmeasured` is a gap in THIS run that should not have been there — axe
     missing, axe timing out, a theme switch that did nothing, only one theme
     rendered, contrast axe could not determine, images that loaded no pixels,
     a runtime with no getAnimations. It is not clean, and it drives exit 3.
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
let identity = null      // what this run actually looked at
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

        /* WHAT DID THIS RUN ACTUALLY LOOK AT? A URL that answers 200 is not
           evidence it served the artifact you meant. Seen live, twice in one
           sitting: a dev server was already holding the port, the target moved
           to the next one without failing, and two complete runs measured a
           DIFFERENT SITE and printed a clean floor. The skill has warned about
           this in prose for months; nothing checked it at the point of
           measurement. Identity is printed unconditionally — that alone would
           have caught it — and --expect turns it into a gate.
           The assertion is POSITIVE on purpose: a first attempt phrased as "is
           not the other site" passed against an empty response body, certifying
           no artifact at all as the right one. */
        if (!identity) {
          identity = await page.evaluate(() => ({
            title: document.title || '(no title)',
            h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 70) || '(no h1)',
            chars: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length,
          }))
          if (identity.chars < 30) {
            console.error(`\nFLOOR: CANNOT RUN — ${url} rendered essentially no text `
              + `(${identity.chars} chars). An empty response is not a passing page; `
              + `check the server is serving what you think it is.`)
            process.exit(2)
          }
          if (EXPECT) {
            /* The WHOLE rendered text, not a prefix of it. A 4000-character
               window silently failed any marker further down a long page, and
               the failure mode is exit 2 on an artifact that was in fact correct. */
            const hay = `${identity.title} ${identity.h1} ${await page.evaluate(() => document.body.innerText)}`
            if (!hay.toLowerCase().includes(EXPECT.toLowerCase())) {
              console.error(`\nFLOOR: CANNOT RUN — --expect=${EXPECT} not found in ${url}.`
                + `\n  title: ${identity.title}\n  h1:    ${identity.h1}`
                + `\nThis is the wrong artifact, or the right one failed to render. `
                + `Another dev server holding the port is the usual cause.`
                /* Say which substrate was searched. Matching RENDERED TEXT is
                   deliberate — matching source would hit the JS bundle and pass
                   on a string no reader ever sees, which is exactly how the
                   theme probe gets fooled by a chunk containing "dark". Without
                   this line an agent whose marker was merely invisible goes
                   hunting a server problem that does not exist. */
                + `\nNote: --expect matches the page's RENDERED TEXT, not its source. `
                + `Pick something a reader can see (the title above is a safe choice).`)
              process.exit(2)
            }
          }
        }

        /* The layout check above reads the DOCUMENT. A component that scrolls
           inside itself — the standard fix for a wide table — hides any amount
           of content while the page reports no horizontal scroll at all. Seen
           live: 88px of a table clipped at 1440 with a quarter of the page
           empty beside it, and 73% of it gone at 360, floor green throughout. */
        const clipped = await page.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el)
            if (!/(auto|scroll|hidden)/.test(cs.overflowX)) continue
            if (el.scrollWidth <= el.clientWidth + 1) continue
            /* VISUALLY-HIDDEN TEXT IS NOT A CLIPPED COMPONENT. `.sr-only` and
               friends are a ~1px box that hides its whole string on purpose, so
               without this the check reports "hides 555px … treat as blocking"
               against standard screen-reader markup — which is on most modern
               pages. A real scrollable component is never 1px in either axis.
               Found on a stock Next/Tailwind page, not on the kit this check
               was originally tamper-tested against. */
            if (el.clientWidth <= 4 || el.clientHeight <= 4) continue
            if (/inset\(\s*50%/.test(cs.clipPath || '')) continue
            const cls = String(el.getAttribute('class') || '').split(' ')[0]
            out.push({ sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ''), hidden: el.scrollWidth - el.clientWidth })
          }
          /* Capped, and the total travels with it: three of nine reported as
             three reads as a page with three clipped regions. */
          out.sort((a, b) => b.hidden - a.hidden)
          return { list: out.slice(0, 3), total: out.length }
        })
        for (const c of clipped.list) innerClip.add(`${c.sel} hides ${c.hidden}px at ${theme} ${w}px`)
        if (clipped.total > clipped.list.length) {
          innerClip.add(`… ${clipped.total - clipped.list.length} more clipped element(s) at ${theme} ${w}px, not shown (${clipped.total} total there)`)
        }
        if (clipped.total && w >= DESKTOP) clipAtDesktop = true

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
          /* Deduped but NOT capped here. The caps are applied where the lines
             are printed, which is the only place that can also state the total
             — capping in here throws the total away before anyone can print it. */
          return { fail: [...new Set(fail)], lone: [...new Set(lone)] }
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
          /* THE READING COLUMN, NOT THE PAGE WRAPPER. Taking the widest laid-out
             block reports growth on every full-bleed layout: a stock shadcn page
             reported "the layout grew 78%" while <main> was capped at max-w-3xl
             and the reader's column never moved an inch. A block-level text
             element fills its column, so measuring those measures the box whose
             growth would actually force the type to follow. Capped at the
             viewport so an overflowing element cannot pose as a column.
             If a page has no running text at all, container stays 0 and the
             comparison below is skipped rather than guessed. */
          let container = 0
          for (const el of document.querySelectorAll('p, li, td, h1, h2, h3')) {
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
            /* Finished loading and carrying no pixels = the resource failed.
               Two things deliberately excluded, both verified in Chromium: an
               <img> with no src or src="" is deliberate blank markup rather
               than a 404, and a sizeless SVG reports the 150x150 default, not 0. */
            blankImages: [...document.images]
              .filter(i => i.complete && !i.naturalWidth && (i.currentSrc || i.getAttribute('src'))).length,
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

        let axeOut = { serious: [], critical: [], incomplete: [] }
        if (AXE) {
          try {
            await page.evaluate(AXE)
            axeOut = await page.evaluate(async () => {
              /* 'incomplete' is named here for its NODE COUNTS, not to fetch the
                 bucket — axe returns that bucket either way, but truncates every
                 entry in it to a single node unless the type is listed. Measured
                 live: `color-contrast x1` where the true count was 124. A count
                 that is an artifact of the options object is exactly the kind of
                 number this file must never print. */
              const run = window.axe.run(document, { resultTypes: ['violations', 'incomplete'] })
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
                  const line = `${v.id} x${v.nodes.length} :: ${shown.join(' | ')}${more}`
                  /* Say when the line was cut. A silently chopped line ends
                     mid-selector and reads as a complete finding. */
                  return line.length > 400 ? `${line.slice(0, 380)} …(line truncated)` : line
                })
              /* The THIRD bucket: rules axe ran and could not decide. Reported
                 whatever the impact, because what is done with it below is
                 decided by rule id rather than by severity. */
              const incomplete = r.incomplete.map(v =>
                `${v.id} x${v.nodes.length}${v.impact ? ` [${v.impact}]` : ''} :: `
                + v.nodes.slice(0, 2).map(n => (n.target || []).join(' ')).join(' | ')
                + (v.nodes.length > 2 ? ` | +${v.nodes.length - 2} more nodes` : ''))
              return { serious: pick('serious'), critical: pick('critical'), incomplete }
            })
          } catch (e) {
            unmeasured.push(`axe at ${theme} ${w}px: ${String(e).slice(0, 90)}`)
          }
        }
        /* "Could not determine" IS the definition of unmeasured, and this
           harness threw the whole bucket away: a live production page returned
           124 undeterminable text pairs under a clean PASS with no contrast
           line printed at all, while the skill told the orchestrator contrast
           had been measured and not assumed. Split by rule id, not by impact.
           CONTRAST BLOCKS: the floor list names text contrast as measured, so a
           contrast axe could not compute is a floor item this run does not have.
           EVERYTHING ELSE GOES TO EYES: the rest of the bucket names no floor
           item and carries genuine low-value noise, and a blanket block on it
           leaves the gate unclosable on ordinary pages — which would teach
           people to waive UNMEASURED by reflex, at which point the one that
           matters gets waived with it. */
        for (const inc of axeOut.incomplete) {
          if (inc.startsWith('color-contrast')) contrastUndetermined.add(`${theme} ${w}px: ${inc}`)
          else axeIncomplete.add(`${theme} ${w}px: ${inc}`)
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
        show(smallTargets, 6, t => `  ! FAILS WCAG 2.5.8 (under 24x24, and crowded): ${t}`)
        if (h1Bad) console.log(`  ! h1 count = ${struct.h1} (${FRAGMENT ? 'at most 1 in a fragment' : 'must be exactly 1'})`)
        if (struct.headingSkip) console.log(`  ! heading level skip: ${struct.headingSkip}`)
        for (const v of axeOut.critical) console.log(`  ! axe CRITICAL: ${v}`)
        for (const v of axeOut.serious) console.log(`  ! axe serious: ${v}`)
        /* An uncaught exception means the page broke; that is gated. Console
           errors are usually dev-server hydration chatter a built page never
           has, so they are reported and left for a human to judge. */
        show([...new Set(crashes)], 3, e => `  ! page threw: ${e}`)
        show([...new Set(noise)], 2, e => `  ~ console (not gated): ${e}`)
        if (struct.blankImages) {
          console.log(`  ? ${struct.blankImages} image(s) finished loading with no pixels — the resource failed`)
          blankImages.add(`${struct.blankImages} at ${theme} ${w}px`)
        }
      } finally {
        await ctx.close()
      }
    }
  }

  /* reduced motion: content must be visible, and nothing should still be animating.
     PER THEME, because a reveal scoped to one palette is invisible in the other: a
     single pass in themes[0] gated one theme and certified two, which is the shape
     this file exists to refuse. Still 1440 only - a reduced-motion defect is almost
     always CSS-scoped rather than width-scoped, and four widths is not earned. */
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: theme })
    try {
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'load' })
      await applyTheme(page, theme)
      await page.addStyleTag({ content: HIDE_OVERLAYS })
      await SETTLE(page)   // or below-the-fold reveals are still at opacity 0
      await page.waitForTimeout(1200)
      const rm = await page.evaluate(() => ({
        hidden: [...document.querySelectorAll('h1,h2,h3,p,a,li')]
          .filter(e => e.textContent.trim() && (getComputedStyle(e).opacity === '0'
            || getComputedStyle(e).visibility === 'hidden'
            || /inset\((?!0px 0px 0px 0px)/.test(getComputedStyle(e).clipPath)))
          .map(e => e.tagName + ':' + e.textContent.trim().slice(0, 40)),
        running: document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : -1,
      }))
      await page.screenshot({ path: `${outPrefix}-reducedmotion-${theme}.png`, fullPage: true })
      if (rm.hidden.length) {
        failures++
        console.log(`\n[reduced-motion ${theme}] FAIL — content still hidden:`)
        show(rm.hidden, 6, x => '  ! ' + x)
      } else console.log(`\n[reduced-motion ${theme}] ok — all content visible`)
      if (rm.running > 0) { failures++; console.log(`  ! ${rm.running} animation(s) still running under prefers-reduced-motion in ${theme}`) }
      /* -1 is the sentinel for "this runtime has no getAnimations". Chromium
         always has it, so this cannot fire today — but a sentinel meaning
         "could not measure" that reaches neither the gate nor the unmeasured
         list is precisely the bug this file exists to refuse, and nothing
         guarantees the next runtime it is pointed at is Chromium. */
      else if (rm.running < 0) unmeasured.push(`animations under prefers-reduced-motion in ${theme} — this runtime has no document.getAnimations, so nothing counted them`)
    } finally {
      await ctx.close()
    }
  }
  /* getAnimations covers CSS and WAAPI only; motion driven by requestAnimationFrame
     or canvas is invisible to it. Pushed once, outside the loop - inside it, a
     two-theme run printed the same JUDGE line twice. */
  handoff.push('rAF/canvas-driven motion under prefers-reduced-motion — watch the page and judge')
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

/* Contrast axe could not compute is contrast nobody measured, and the floor
   list requires it measured rather than assumed. One line for the run, so that
   eight near-identical configurations do not bury the rest of the report. */
if (contrastUndetermined.size) {
  unmeasured.push(`TEXT CONTRAST — axe ran the rule and could not determine the result, so contrast on these nodes is NOT measured (a background image, a gradient, or transparency behind the text is the usual cause):\n    ${[...contrastUndetermined].join('\n    ')}\n  Check those pairs by hand against the actual painted background, or give the text an opaque backdrop and re-run. Waiving this ships contrast nobody ever checked.`)
}
/* The rest of the bucket: real "needs review" work that names no floor item. */
if (axeIncomplete.size) {
  handoff.push(`axe could not decide these — its "needs review" bucket, which is neither a pass nor a failure and which nothing above gates on:\n    ${[...axeIncomplete].join('\n    ')}`)
}

/* Neither a gate nor a note. This harness cannot tell a page that ships broken
   images from a dev server that failed to serve good ones — but under either
   reading the renders every critic is about to grade are not the artifact, and
   that is a gap in THIS run. Graded as design instead, it becomes the campaign
   whose client's complaint was that the pages had no identifiable photographs. */
if (blankImages.size) {
  unmeasured.push(`images finished loading with no pixels, so the renders are not the page as it ships: ${[...blankImages].join(', ')}. A dev-server 404 and a genuinely broken source look identical from here — serve the built artifact or fix the sources and re-run. Do not let a critic grade these screenshots as a design decision.`)
}

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
  const shownLone = [...loneTargets].slice(0, 8)
  handoff.push(`targets under 24x24 that WCAG 2.5.8 EXEMPTS because nothing is near them — the spec is satisfied and the control may still be too small to hit or read:\n    ${shownLone.join('\n    ')}`
    + (loneTargets.size > shownLone.length ? `\n    … ${loneTargets.size - shownLone.length} more not shown (${loneTargets.size} total across the run)` : ''))
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
/* The word PASS must not appear in this line when something went unmeasured.
   What a critic is handed is the TEXT report, not the exit code, and
   "PASS on what was measured" is read as PASS by everyone reading it at speed —
   which made the harness's most consequential single string its least honest. */
const verdict = failures ? `${failures} failing configuration(s)`
  : (unmeasured.length ? `NOT CLEAN — nothing failed, but ${unmeasured.length} item(s) went unmeasured` : 'PASS')
/* Printed unconditionally, and last, where a reader actually looks. Two full
   runs once measured a different site than the one intended and reported a
   clean floor; this line alone would have shown it. */
if (identity) {
  console.log(`\n[MEASURED] ${url}`)
  console.log(`  title: ${identity.title}`)
  console.log(`  h1:    ${identity.h1}   (${identity.chars} chars of text)`)
}
console.log(`\n=== TECHNICAL FLOOR: ${verdict} ===`)
if (unmeasured.length) console.log('Unmeasured is not clean. Report it; the user waives it or the run stops.')
/* exit 3, not 0: a caller keying on status must not read "nothing failed" as
   "the floor passed" when items were never measured. */
process.exit(failures ? 1 : (unmeasured.length ? 3 : 0))
