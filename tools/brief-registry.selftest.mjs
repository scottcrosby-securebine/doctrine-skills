// Three-clause tamper test for tools/brief-registry.mjs, per CLAUDE.md: break the thing and confirm
// the check trips, run it against a known-good input and confirm it stays quiet, and prove each
// tampered input really carries its defect without calling the check.
//
// Every tamper is made on an in-memory copy of the three files; the real files are never edited.
// Dependencies arrive as an argument, never as an import, for the reason herdr-lint's sidecar gives:
// importing the checker here forms a cycle with a module suspended at a top-level await.
//
// Run it through the checker, never directly:  node tools/brief-registry.mjs --selftest

export default function selftest({ check, callSites, loadRepo, REGISTRY, SEATS, TARGETS }) {

let failed = 0
const clause = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) { failed = 1; if (detail) console.log(`      ${detail}`) }
}
const count = (text, s) => text.split(s).length - 1
const repo = loadRepo()
const briefed = REGISTRY.filter((r) => r.seat !== 'excluded' && r.anchor)

// ---------------------------------------------------------------- clause 2: it stays quiet
// First, because a check that reports everything would pass clause 1 too.
const live = check(repo)
clause('clause 2a: the repo as it stands is quiet', live.length === 0, live.join(' | '))
clause('clause 2b: and it is quiet because it looked, not because it found nothing to look at: every call site in the runner has a row',
  callSites(repo.runner).length > 0 && callSites(repo.runner).every((s) => REGISTRY.some((r) => s.text.includes(r.stem))),
  'a locator that found no call sites would also print zero findings')

// The line in the target text that holds a row's anchor, found by plain line search on the target
// openings rather than by the checker's own locator, so clause 3 does not lean on what it proves.
const fileOf = (seat) => TARGETS[SEATS[seat][0]].file
// A paragraph target is one physical line; a `start` target (the args table) runs from its opening
// to the next `## ` heading, so any line in that span counts.
const anchorLine = (text, seat, anchor) => {
  const lines = text.split('\n')
  return lines.findIndex((l, i) => l.includes(anchor) && SEATS[seat].some((t) => {
    if (!TARGETS[t].start) return l.startsWith(TARGETS[t].opening)
    const o = lines.findIndex((x) => x.startsWith(TARGETS[t].opening))
    return o >= 0 && i >= o && !lines.slice(o + 1, i + 1).some((x) => x.startsWith('## '))
  }))
}

// ---------------------------------------------------------------- clause 1: it trips
// 1a and 3a: each briefed row's anchor removed from its file.
const missedRemoval = []
const unprovedRemoval = []
for (const r of briefed) {
  const f = fileOf(r.seat)
  const tampered = { ...repo, [f]: repo[f].split(r.anchor).join('') }
  if (!check(tampered).some((x) => x.includes(JSON.stringify(r.stem)) && x.includes('occurs 0 times'))) missedRemoval.push(r.stem)
  if (!(count(repo[f], r.anchor) >= 1 && count(tampered[f], r.anchor) === 0)) unprovedRemoval.push(r.stem)
}
clause('clause 1a: removing any row\'s anchor from the brief that reaches its seat is reported', missedRemoval.length === 0, missedRemoval.join(' | '))

// 1b and 3b: a call site no row names.
const NEW_SITE = "if (a.surprise) malformed('surprise: a rule the runner enforces and no brief states')"
const withSite = { ...repo, runner: `${repo.runner}\n${NEW_SITE}\n` }
const tripped = check(withSite)
clause('clause 1b: an unregistered malformed( call site is reported',
  tripped.some((x) => x.includes('no registry row') && x.includes('surprise: a rule')), tripped.join(' | '))
const NEW_BLOCK = "if (a.other) block('other: a work defect no row names', ['other'])"
clause('clause 1c: and so is an unregistered block( call site',
  check({ ...repo, runner: `${repo.runner}\n${NEW_BLOCK}\n` }).some((x) => x.includes('no registry row') && x.includes('other: a work defect')))

// 1d and 3d: each briefed row's anchor duplicated inside the target paragraph that holds it.
const missedDup = []
const unprovedDup = []
for (const r of briefed) {
  const f = fileOf(r.seat)
  const lines = repo[f].split('\n')
  const i = anchorLine(repo[f], r.seat, r.anchor)
  if (i < 0) { missedDup.push(`${r.stem} (no target line holds the anchor)`); continue }
  lines[i] = lines[i].replace(r.anchor, `${r.anchor} ${r.anchor}`)
  const tampered = { ...repo, [f]: lines.join('\n') }
  if (!check(tampered).some((x) => x.includes(JSON.stringify(r.stem)) && x.includes('occurs 2 times'))) missedDup.push(r.stem)
  const j = anchorLine(tampered[f], r.seat, `${r.anchor} ${r.anchor}`)
  if (!(j === i && count(tampered[f], r.anchor) === count(repo[f], r.anchor) + 1)) unprovedDup.push(r.stem)
}
clause('clause 1d: duplicating any row\'s anchor inside its target text is reported', missedDup.length === 0, missedDup.join(' | '))

// 1e-1g: the registry's own defects, on a copied registry.
const dupSite = repo.runner.split('\n').find((l) => l.includes(briefed[0].stem))
clause('clause 1e: a stem matching two call sites is reported',
  check({ ...repo, runner: `${repo.runner}\n${dupSite}\n` }).some((x) => x.includes(JSON.stringify(briefed[0].stem)) && x.includes('matches 2 call sites')))
clause('clause 1f: a stem matching no call site is reported',
  check(repo, [...REGISTRY, { stem: 'no such message anywhere', seat: 'excluded', reason: 'test' }]).some((x) => x.includes('matches 0 call sites')))
clause('clause 1g: an excluded row with no reason is reported',
  check(repo, REGISTRY.map((r) => (r.seat === 'excluded' ? { ...r, reason: ' ' } : r))).some((x) => x.includes('excluded with no reason')))
clause('clause 1i: a briefed row with no anchor is reported, never read as satisfied',
  check(repo, REGISTRY.map((r) => (r === briefed[0] ? { ...r, anchor: null } : r))).some((x) => x.includes(JSON.stringify(briefed[0].stem)) && x.includes('no anchor')))
clause('clause 1h: a brief whose target heading is gone is reported, never read as empty',
  check({ ...repo, skill: repo.skill.replace('\n## The red team brief\n', '\n## Renamed\n') }).some((x) => x.includes('target not found')))

// ---------------------------------------------------------------- clause 3: the inputs really are broken
// No check is called below.
clause('clause 3a: each anchor-removed copy really lacks the anchor, and the original really had it', unprovedRemoval.length === 0, unprovedRemoval.join(' | '))
clause('clause 3b: the added call site really is a malformed( call, and no registry stem occurs in it',
  NEW_SITE.includes('malformed(') && withSite.runner.includes(NEW_SITE) && !REGISTRY.some((r) => NEW_SITE.includes(r.stem)) &&
  NEW_BLOCK.includes('block(') && !REGISTRY.some((r) => NEW_BLOCK.includes(r.stem)))
clause('clause 3d: each anchor-duplicated copy really carries the anchor twice on the target line, one more time than the original',
  unprovedDup.length === 0, unprovedDup.join(' | '))
clause('clause 3e: the duplicated call line really carries the stem, so the copy has two sites for it',
  !!dupSite && count(`${repo.runner}\n${dupSite}\n`, briefed[0].stem) === count(repo.runner, briefed[0].stem) + 1)

console.log(failed ? '\nSOME CLAUSES FAILED' : '\nall clauses passed')
return failed
}
