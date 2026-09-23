// The doctrine-project format check and read-only status view.
//
//   node hooks/dctr-project.mjs check  [<repo-root>]   exit 0 no findings, 1 findings, 2 no/unreadable
//                                                       docs/PROJECT.md or malformed arguments
//   node hooks/dctr-project.mjs status [<repo-root>]   read-only; exit 2 only for malformed arguments
//                                                       or no docs/PROJECT.md
//
// Formats: docs/PROJECT.md and docs/epics/<ID>.md, as skills/doctrine-project/formats.md defines them.
// `check` is offline: no network call, never runs `gh`, never dereferences an issue number. One finding
// per line, `<path>:<line>: <rule>: <message>`.
//
// `status` prints `unknown` for any field whose source cannot be read, never a guess. An empty answer
// (a readable source with nothing in it) prints `(none)`, and the two are never the same line.
//
// Pure functions (parseDoc, modelFrom, check, formatFinding, statusLines) are exported for
// hooks/dctr-project.selftest.mjs. The readers at the bottom are the only I/O.
//
// Rules: state, evidence, roster, coverage, item, entry, reference, impact, issues, pointer, id, members.
//
// WHAT `check` DOES NOT ENFORCE, stated so a clean run is not read as more:
//   - whether a return's per-item results are honest, or the certification target is the right one;
//   - uniqueness of phase names, or of item and entry IDs across files (a duplicate roster ID, and a
//     duplicate item or entry ID within one file, are findings);
//   - the format of the time in an entry heading, beyond its being present;
//   - which fields a ruling Kind requires (Successor, a cutover ruling's quoted new text), beyond what the
//     named rules read;
//   - that an open issue or tracker item has a destination ruling, or where one sits: only the project
//     file's destination rulings are compared with its ## Open issues rows;
//   - a planned phase name on an epic that is not yet Open;
//   - where an impact ruling sits: one naming an ID that any done-means-change ruling names resolves,
//     wherever it is written;
//   - that a changed end-state Coverage line has a coverage ruling, or that a coverage ruling's items had
//     their Coverage line changed: check keeps no history of the line;
//   - that a changed Combined check line has the baseline ruling SKILL.md requires, or that a change made
//     without one really left the command and the pass rule alone: same reason, no history of the line;
//   - which Done means items serve an end-state item;
//   - lines before the first `##` other than the headers the rules read, lines in a section this file
//     does not read, and a misspelled section heading, which is such a section;
//   - a header, item field or entry field given twice: the last one is read.

import fs from 'node:fs'
import path from 'node:path'
import { herdr, codexStateDir } from './dctr-state.mjs'
import { codexTerminal, ID_RE } from './dctr-lib.mjs'
import { STATE_LINE } from './dctr-record.mjs'

export const PROJECT_PATH = 'docs/PROJECT.md'
const PROJECT_STATES = ['Proposed', 'Ruled', 'Done']
const EPIC_STATES = ['Proposed', 'Not started', 'Open', 'Done', 'Dropped', 'Superseded']
const TERMINAL = ['Done', 'Dropped', 'Superseded']
const LIVE = ['Proposed', 'Not started', 'Open']
const FIELDS = ['Outcome', 'Type', 'Check', 'Control', 'Evidence', 'Coverage']
// `note` is the Kind for an owner decision that moves no state: an escalation ruled at an alarm, a
// finding ruled closed. It exists because a drive's orchestrator had nowhere to put one, reached for
// `baseline`, and voided a pass — a baseline ruling becomes the current baseline whatever it was
// written for (owner ruling, 2026-09-14).
const KINDS = ['baseline', 'done-means-change', 'impact', 'drop', 'supersede', 'project-level', 'coverage', 'destination', 'cutover', 'scope', 'note']
/** The fields a ruling of these Kinds must carry, each non-empty. A Map, since a Kind is user text. */
const REQUIRED = new Map([['destination', ['Issues', 'To']], ['cutover', ['Edit']], ['scope', ['Entries']]])
const RESULTS = ['PASS', 'FAIL', 'UNVERIFIED']
const OBLIGATIONS = ['satisfy', 'contribute', 'preserve']
/** Section to the rule a malformed line in it reports under, and the forms it accepts. */
const LINE_FORMS = {
  'End state': ['item', '### <item ID> or, under an item, - <Outcome|Type|Check|Control|Evidence|Coverage>: <value>'],
  'Done means': ['item', '### <item ID> or, under an item, - <Outcome|Type|Check|Control|Evidence|Coverage>: <value>'],
  Epics: ['roster', 'a table row'],
  'Open issues': ['issues', 'a table row'],
  Members: ['members', '- phase <phase name>[: <record path>] or - issue <tracker id>'],
  'Rulings and returns': ['entry', 'an entry heading, or under one a <Key>: <value> field, a > quoted line or a return result'],
}

// ---------------------------------------------------------------- parse

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
/** A GFM table row: up to three leading spaces, at least one pipe, leading and closing pipes optional,
 *  and `\|` a literal pipe inside a cell. ponytail: `\\|` (an escaped backslash before a pipe) is read as
 *  an escaped pipe; handle it if a real roster ever carries one. */
const cells = (t) => { const m = /^ {0,3}(?=\S)(.*\|.*)$/.exec(t); return m && m[1].replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')) }

/** Markdown to a model. Every value carries the 1-based line it came from. */
export function parseDoc(text) {
  const doc = { title: null, headers: Object.create(null), items: [], roster: [], issues: [], phases: [], entries: [], malformed: [] }
  let section = null, item = null, entry = null, lastRow = null
  String(text).split('\n').forEach((raw, i) => {
    const line = i + 1, t = raw.trimEnd()
    // A non-blank line in a read section that takes none of that section's forms.
    const odd = () => { if (t) doc.malformed.push({ section, text: t, line }) }
    const sec = /^## (.+)$/.exec(t)
    if (sec) { section = sec[1].trim(); item = entry = null; return }
    if (section === null) {
      if (!doc.title && /^# /.test(t)) { doc.title = { text: t.slice(2).trim(), line }; return }
      const h = /^([A-Za-z][A-Za-z ]*):\s?(.*)$/.exec(t)
      if (h) doc.headers[h[1]] = { value: h[2].trim(), line }
      return
    }
    if (section === 'End state' || section === 'Done means') {
      const hd = /^### ?(.*)$/.exec(t)
      if (hd) { item = { id: hd[1].trim(), line, fields: Object.create(null) }; doc.items.push(item); return }
      const f = /^- ([A-Za-z]+):\s?(.*)$/.exec(t)
      if (f && item && FIELDS.includes(f[1])) item.fields[f[1]] = { value: f[2].trim(), line }
      else odd()
      return
    }
    if (section === 'Epics' || section === 'Open issues') {
      const c = cells(t), rows = section === 'Epics' ? doc.roster : doc.issues
      if (!c) { odd(); return }
      // The header row is the row directly above the separator, by position: its text is never
      // compared, since `ID` and `Issue` are valid IDs.
      if (/^-+$/.test(c[0].replace(/:/g, ''))) { if (lastRow?.line === line - 1 && lastRow.rows === rows) rows.pop(); lastRow = null; return }
      rows.push(section === 'Epics' ? { id: c[0], record: c[2] ?? '', line } : { issue: c[0], destination: c[1] ?? '', line })
      lastRow = { rows, line }
      return
    }
    if (section === 'Members') {
      const ph = /^- phase (.+?)(?::\s*.*)?$/.exec(t)
      if (ph) doc.phases.push({ name: ph[1].trim(), line })
      else if (!/^- issue \S/.test(t)) odd()
      return
    }
    if (section === 'Rulings and returns') {
      if (/^### /.test(t)) {
        // A heading of the wrong shape still opens an entry (type null, a finding), so its lines never
        // attach to the entry above it.
        const m = /^### (\S+) (ruling|return|regression),\s*\S.*$/.exec(t)
        entry = { id: m ? m[1] : t.slice(4).trim().split(/\s+/)[0], type: m ? m[2] : null, line, fields: Object.create(null), results: [] }
        doc.entries.push(entry)
        return
      }
      const r = entry?.type === 'return' && /^- ([^:\s]+):\s*([^,]*?)\s*(?:,\s*evidence:\s*(.*))?$/.exec(t)
      if (r) { entry.results.push({ item: r[1], result: r[2], evidence: (r[3] ?? '').trim(), line }); return }
      const f = entry && /^([A-Za-z][A-Za-z ]*):\s?(.*)$/.exec(t)
      if (f) entry.fields[f[1]] = { value: f[2].trim(), line }
      else if (!(entry && /^>/.test(t))) odd()
    }
  })
  return doc
}

/** The project file plus every roster record `read(rel)` can return (null for one it cannot). */
export function modelFrom(projectText, read) {
  const project = parseDoc(projectText)
  const epics = new Map()
  for (const r of project.roster) if (!epics.has(r.record)) { const t = read(r.record); epics.set(r.record, t == null ? null : parseDoc(t)) }
  return { project, epics }
}

// ---------------------------------------------------------------- derived facts

const val = (doc, key) => doc.headers[key]?.value
const kind = (e) => e.fields.Kind?.value
const rulingsOf = (doc, k) => doc.entries.filter((e) => e.type === 'ruling' && kind(e) === k)
const epicHeadingId = (doc) => /^Epic (\S+?):/.exec(doc.title?.text ?? '')?.[1] ?? null

/** The latest `baseline` or `done-means-change` ruling. */
const currentBaseline = (doc) => doc.entries.filter((e) => e.type === 'ruling' && ['baseline', 'done-means-change'].includes(kind(e))).at(-1)?.id ?? null

/** A return counts when the file has a certification target that is not `none`, its Baseline is
 *  current, its Revision is that target, and no regression against one of its items comes after it
 *  (ER8, ER9). Those four conditions are `formats.md`'s definition of a counting return and this
 *  function is the whole of it.
 *
 *  Every way a return can stop counting is a way the combined-check rule can be narrowed with no suite
 *  noticing, and this repo's own review found the first four ONE AT A TIME, each after a repair had
 *  called the family closed. `T-counts` in `dctr-project.selftest.mjs` is the regression test that came
 *  out of that: a table that fixes an epic record, changes one thing per row, and asserts for each row
 *  whether the return counts.
 *
 *  It is a regression test and NOT a completeness proof, and three attempts at a completeness proof
 *  were broken here before that sentence was written. The table is blind to any condition every value
 *  it happens to use already satisfies — `target.length < 6` passes it, because both targets in the
 *  table are six characters, and so does a bound on how many items a return grades or how many
 *  regressions follow it, because no row varies those counts on a COUNTING return. Varying a field is
 *  not covering it. So: adding a condition here means adding a row whose values FAIL that condition,
 *  and if you cannot write such a row, the condition is unguarded and belongs in a comment saying so. */
function counts(doc, ret) {
  const target = val(doc, 'Certification target')
  if (!target || target === 'none') return false
  if (ret.fields.Baseline?.value !== currentBaseline(doc)) return false
  if (ret.fields.Revision?.value !== target) return false
  const later = doc.entries.slice(doc.entries.indexOf(ret) + 1)
  return !later.some((e) => e.type === 'regression' && ret.results.some((r) => r.item === e.fields.Item?.value))
}

/** A PASS with an empty evidence reference is UNVERIFIED. */
const resultOf = (r) => (r.result === 'PASS' && !r.evidence ? 'UNVERIFIED' : r.result)
/** An epic return's `Combined check result:` field, in the shape `resultOf` reads, or null when the
 *  field is absent. The epic's combined check covers the seam BETWEEN its phases, which no single
 *  phase's own gate covers, and the exit pass is the only context that spans them (owner ruling,
 *  2026-09-14). A field with no recognisable result keeps the raw text so the finding can quote it. */
const combinedOf = (e) => {
  const f = e.fields['Combined check result']
  if (!f) return null
  const m = /^([A-Za-z]+)\s*(?:,\s*evidence:\s*(.*))?$/.exec(f.value)
  return { result: m ? m[1] : f.value, evidence: (m?.[2] ?? '').trim(), line: f.line }
}
/** The latest counting return decides, never any earlier one that also counts. */
const latestCounting = (doc) => doc.entries.filter((e) => e.type === 'return' && counts(doc, e)).at(-1) ?? null
const passesAll = (doc, ids) => { const e = latestCounting(doc); return Boolean(e) && ids.every((id) => e.results.some((r) => r.item === id && resultOf(r) === 'PASS')) }

function projectCoverage(v) {
  const out = { satisfy: [], others: [], projectLevel: null, parts: 0, unknown: [] }
  for (const part of (v || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(satisfy|contribute|preserve|project-level)\s+(\S.*)$/.exec(part)
    if (!m) out.unknown.push(part)
    else out.parts++
    if (m?.[1] === 'satisfy') out.satisfy.push(...list(m[2]))
    if (m?.[1] === 'contribute' || m?.[1] === 'preserve') out.others.push(...list(m[2]))
    if (m?.[1] === 'project-level') out.projectLevel = m[2].trim()
  }
  return out
}

/** Roster ID to its readable, correctly headed record, as a Map: IDs are user text, and `constructor`
 *  is a valid one. The first line for an ID wins. */
function resolveRoster(model) {
  const byId = new Map()
  for (const r of model.project.roster) {
    const doc = model.epics.get(r.record)
    if (doc && epicHeadingId(doc) === r.id && !byId.has(r.id)) byId.set(r.id, { path: r.record, doc })
  }
  return byId
}

/** The project file, then each resolved epic record, as { path, doc }. */
const filesOf = (model, byId) => [{ path: PROJECT_PATH, doc: model.project }, ...byId.values()]

// ---------------------------------------------------------------- check

export function check(model, exists) {
  const findings = []
  const add = (p, line, rule, message) => findings.push({ path: p, line: line ?? 1, rule, message })
  const P = PROJECT_PATH, p = model.project
  const rosterIds = new Set(p.roster.map((r) => r.id))
  const byId = resolveRoster(model)
  const stateOf = (id) => (byId.has(id) ? val(byId.get(id).doc, 'State') : null)
  const idCheck = (file, line, what, id) => { if (!ID_RE.test(id)) add(file, line, 'id', `${what} ${JSON.stringify(id)} is outside [A-Za-z0-9][A-Za-z0-9_-]{0,23}`) }

  // roster
  const seen = new Set()
  for (const r of p.roster) {
    if (seen.has(r.id)) add(P, r.line, 'roster', `duplicate epic ID ${r.id}`)
    seen.add(r.id)
    idCheck(P, r.line, 'epic ID', r.id)
    if (!exists(r.record)) { add(P, r.line, 'roster', `record ${r.record} for ${r.id} does not resolve`); continue }
    const doc = model.epics.get(r.record)
    if (!doc) { add(P, r.line, 'roster', `record ${r.record} for ${r.id} could not be read`); continue }
    const hid = epicHeadingId(doc)
    if (hid !== r.id) add(P, r.line, 'roster', `record ${r.record} is headed Epic ${hid ?? '(no heading)'}, not ${r.id}`)
  }

  // project state and evidence
  const ps = p.headers.State
  if (!PROJECT_STATES.includes(ps?.value)) add(P, ps?.line, 'state', `project State ${JSON.stringify(ps?.value ?? null)} is not one of ${PROJECT_STATES.join(', ')}`)
  if (PROJECT_STATES.includes(ps?.value) && !p.items.length) add(P, ps.line, 'evidence', `project is ${ps.value} with no end-state item`)
  if (['Ruled', 'Done'].includes(ps?.value) && !rulingsOf(p, 'baseline').length) add(P, ps.line, 'evidence', `project is ${ps.value} with no baseline ruling`)
  if (ps?.value === 'Done') {
    for (const r of p.roster) {
      const s = stateOf(r.id)
      if (!TERMINAL.includes(s)) add(P, r.line, 'evidence', `project is Done while epic ${r.id} is ${s ?? 'unreadable'}, not Done, Dropped or Superseded`)
    }
    if (!passesAll(p, p.items.map((i) => i.id))) add(P, ps.line, 'evidence', 'project is Done without a counting project return that has PASS for every end-state item')
  }

  // pointer
  const ce = p.headers['Current epic']
  if (ce?.value !== 'none' && !rosterIds.has(ce?.value)) add(P, ce?.line, 'pointer', `Current epic ${JSON.stringify(ce?.value ?? null)} is neither none nor a roster epic`)

  // issues
  for (const is of p.issues) {
    const m = /^member (\S+)$/.exec(is.destination)
    if (m) { if (!rosterIds.has(m[1])) add(P, is.line, 'issues', `issue ${is.issue} is a member of ${m[1]}, which is not on the roster`) }
    else if (is.destination !== 'out of scope' && is.destination !== 'post-done backlog') add(P, is.line, 'issues', `issue ${is.issue} has Destination ${JSON.stringify(is.destination)}, not member <epic ID>, out of scope or post-done backlog`)
  }

  // destination rulings: the latest one naming an ID gives the Destination that ID's row carries
  const latestTo = new Map()
  for (const e of rulingsOf(p, 'destination')) for (const id of list(e.fields.Issues?.value)) latestTo.set(id, e)
  for (const [id, e] of latestTo) {
    const row = p.issues.find((is) => is.issue === id), to = e.fields.To?.value
    if (!row) add(P, e.fields.Issues.line, 'issues', `destination ruling ${e.id} names ${id}, which is not a row in ## Open issues`)
    else if (to && row.destination !== to) add(P, e.fields.Issues.line, 'issues', `destination ruling ${e.id} gives ${id} To ${JSON.stringify(to)}, but its ## Open issues row says ${JSON.stringify(row.destination)}`)
  }

  // end-state coverage
  /** The last epic on a Superseded epic's successor chain: a non-Superseded epic, an ID that is not a
   *  readable roster epic, or, on a loop, a Superseded one. */
  const chainEnd = (id) => {
    const visited = new Set()
    while (stateOf(id) === 'Superseded' && !visited.has(id)) { visited.add(id); id = rulingsOf(byId.get(id).doc, 'supersede').at(-1)?.fields.Successor?.value }
    return id
  }
  for (const it of p.items) {
    const cov = it.fields.Coverage, ln = cov?.line ?? it.line
    const c = projectCoverage(cov?.value)
    for (const u of c.unknown) add(P, ln, 'coverage', `end-state item ${it.id} Coverage part ${JSON.stringify(u)} is not satisfy, contribute or preserve <epic IDs>, or project-level <ruling ID>`)
    if (!c.satisfy.length && !c.projectLevel) add(P, ln, 'coverage', `end-state item ${it.id} has no satisfy epic and no project-level ruling`)
    if (c.satisfy.length > 1) add(P, ln, 'coverage', `end-state item ${it.id} has more than one satisfy epic (${c.satisfy.join(', ')})`)
    if (c.projectLevel && c.parts > 1) add(P, ln, 'coverage', `end-state item ${it.id} Coverage gives project-level with another part; project-level stands alone`)
    for (const e of c.others) if (!rosterIds.has(e)) add(P, ln, 'coverage', `end-state item ${it.id} contribute or preserve epic ${e} is not on the roster`)
    for (const e of c.satisfy) {
      if (!rosterIds.has(e)) { add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is not on the roster`); continue }
      if (stateOf(e) === 'Dropped') add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is Dropped`)
      if (stateOf(e) !== 'Superseded') continue
      // A chain ending at an epic with an exit is fixed by reassigning the item to it; one ending where
      // nothing can reach Done (Dropped, a loop, off the roster) needs a new epic (SKILL.md "Work nothing covers").
      const end = chainEnd(e), st = stateOf(end)
      const dead = st === 'Superseded' ? `it loops back to ${end}` : st ? `it ends at ${end}, which is ${st}` : `it ends at ${end ?? '(no Successor)'}, which is not a readable roster epic`
      const fix = LIVE.includes(st)
        ? `the fix is a coverage ruling naming ${end}, the ${st} epic at the end of the chain, as this item's satisfy epic`
        : `${dead}, so nothing on it can reach Done and the fix is a new epic on the roster and a coverage ruling naming it as this item's satisfy epic`
      if (st !== 'Done') add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is Superseded and its successor chain does not end at a Done epic; ${fix}`)
    }
    // On a Proposed project the project-level ruling may not be written yet.
    if (c.projectLevel && ['Ruled', 'Done'].includes(ps?.value) && !rulingsOf(p, 'project-level').some((r) => r.id === c.projectLevel && list(r.fields.Items?.value).includes(it.id))) {
      add(P, ln, 'coverage', `end-state item ${it.id} names ${c.projectLevel}, which is not a project-level ruling listing it`)
    }
  }

  // per-file rules, project then each resolved epic
  const files = filesOf(model, byId)
  for (const { path: file, doc } of files) {
    const what = doc === p ? 'end-state item' : 'Done means item'
    const itemIds = new Set(), entryIds = new Set()
    // An ID that is no longer an item resolves in the entry at index i only when a done-means-change
    // ruling naming it is that entry or comes after it, so history from before the change stays valid
    // and a regression written after it must name a current item; or when the entry is an impact ruling,
    // which W3 requires to list the done-means-change ruling's items; or when the entry is a return whose
    // Baseline was written before a ruling naming it, since that return graded the items as they stood
    // under its own Baseline. Such a return never counts: its Baseline is not current.
    const changedAt = (id) => doc.entries.flatMap((x, j) => (x.type === 'ruling' && kind(x) === 'done-means-change' && list(x.fields.Items?.value).includes(id) ? [j] : []))
    const ref = (i, line, id, subject) => {
      const at = changedAt(id), e = doc.entries[i]
      const graded = e.type === 'return' ? doc.entries.findIndex((x) => x.type === 'ruling' && x.id === e.fields.Baseline?.value && ['baseline', 'done-means-change'].includes(kind(x))) : -1
      const resolves = itemIds.has(id) || at.some((j) => j >= i) || (e.type === 'ruling' && kind(e) === 'impact' && at.length > 0) || (graded >= 0 && at.some((j) => j > graded))
      if (!resolves) add(file, line, 'reference', `${subject} names ${JSON.stringify(id ?? null)}, which is neither an item in this file nor named by a done-means-change ruling at or after that entry`)
    }
    for (const m of doc.malformed) { const [rule, form] = LINE_FORMS[m.section]; add(file, m.line, rule, `## ${m.section} line ${JSON.stringify(m.text)} is not ${form}`) }
    for (const it of doc.items) {
      idCheck(file, it.line, `${what} ID`, it.id)
      if (itemIds.has(it.id)) add(file, it.line, 'id', `duplicate item ID ${it.id}`)
      itemIds.add(it.id)
      for (const f of FIELDS) {
        const fv = it.fields[f]
        if (!fv || (f !== 'Coverage' && !fv.value)) add(file, it.line, 'item', `${what} ${it.id} is missing ${f}`)
      }
      const ty = it.fields.Type
      if (ty?.value && !/^T[1-4]$/.test(ty.value)) add(file, ty.line, 'item', `${what} ${it.id} has Type ${ty.value}, not T1 to T4`)
    }
    doc.entries.forEach((e, i) => {
      idCheck(file, e.line, 'entry ID', e.id)
      if (entryIds.has(e.id)) add(file, e.line, 'id', `duplicate entry ID ${e.id}`)
      entryIds.add(e.id)
      if (e.type === null) add(file, e.line, 'entry', `heading of ${e.id} is not <entry ID> ruling|return|regression, <time>`)
      if (e.type === 'ruling' && !KINDS.includes(kind(e))) add(file, e.fields.Kind?.line ?? e.line, 'entry', `ruling ${e.id} Kind ${JSON.stringify(kind(e) ?? null)} is not one of ${KINDS.join(', ')}`)
      if (e.type === 'ruling') for (const k of REQUIRED.get(kind(e)) ?? []) if (!e.fields[k]?.value) add(file, e.fields[k]?.line ?? e.line, 'reference', `${kind(e)} ruling ${e.id} has no ${k}`)
      if (e.type === 'regression') ref(i, e.fields.Item?.line ?? e.line, e.fields.Item?.value, `regression ${e.id} Item`)
      if (e.type === 'return') {
        for (const r of e.results) ref(i, r.line, r.item, `return ${e.id} result`)
        const given = new Set()
        for (const r of e.results) { if (given.has(r.item)) add(file, r.line, 'entry', `return ${e.id} gives ${r.item} more than one result`); given.add(r.item) }
        for (const r of e.results) if (!RESULTS.includes(r.result)) add(file, r.line, 'entry', `return ${e.id} result for ${r.item} is ${JSON.stringify(r.result)}, not ${RESULTS.join(', ')}`)
        const b = e.fields.Baseline
        if (!doc.entries.some((x) => x.type === 'ruling' && x.id === b?.value && ['baseline', 'done-means-change'].includes(kind(x)))) {
          add(file, b?.line ?? e.line, 'reference', `return ${e.id} Baseline ${b?.value || '(none)'} is not a baseline or done-means-change ruling in this file`)
        }
      }
      // `note` is here for the second half only: its Items are optional (it binds nothing), but where
      // it names items they must resolve, since a decision recorded against an ID nobody defines
      // records nothing.
      if (e.type === 'ruling' && ['done-means-change', 'impact', 'project-level', 'coverage', 'note'].includes(kind(e))) {
        const ids = list(e.fields.Items?.value)
        if (!ids.length && !['project-level', 'note'].includes(kind(e))) add(file, e.fields.Items?.line ?? e.line, 'reference', `${kind(e)} ruling ${e.id} has no Items`)
        for (const id of ids) ref(i, e.fields.Items.line, id, `${kind(e)} ruling ${e.id} Items`)
      }
      if (e.type !== 'ruling' || kind(e) !== 'done-means-change') return
      const items = list(e.fields.Items?.value)
      const later = doc.entries.slice(i + 1).filter((x) => x.type === 'ruling' && kind(x) === 'impact')
      if (!later.some((x) => items.every((id) => list(x.fields.Items?.value).includes(id)))) add(file, e.line, 'impact', `done-means-change ${e.id} has no later impact ruling listing ${items.join(', ') || 'its items'}`)
    })
  }

  // epics
  for (const { path: file, doc } of files.slice(1)) {
    const id = epicHeadingId(doc)
    const st = doc.headers.State, s = st?.value, sl = st?.line ?? doc.title?.line
    if (!EPIC_STATES.includes(s)) add(file, sl, 'state', `epic State ${JSON.stringify(s ?? null)} is not one of ${EPIC_STATES.join(', ')}`)
    if (['Not started', 'Open', 'Done'].includes(s) && !doc.items.length) add(file, sl, 'evidence', `epic ${id} is ${s} with no Done means item`)
    if (['Not started', 'Open', 'Done'].includes(s) && !rulingsOf(doc, 'baseline').length) add(file, sl, 'evidence', `epic ${id} is ${s} with no baseline ruling`)
    if (['Open', 'Done'].includes(s) && !doc.phases.length) add(file, sl, 'evidence', `epic ${id} is ${s} with no phase member`)
    if (['Not started', 'Open', 'Done'].includes(s)) {
      const cc = val(doc, 'Combined check')
      if (!cc || cc === 'none') add(file, sl, 'evidence', `epic ${id} is ${s} with Combined check ${cc ? 'none' : 'absent'} (W1)`)
      else if (!/; pass when \S/.test(cc)) add(file, sl, 'evidence', `epic ${id} is ${s} and its Combined check has no ; pass when <rule> part (W1)`)
    }
    if (s === 'Done' && !passesAll(doc, doc.items.map((i) => i.id))) add(file, sl, 'evidence', `epic ${id} is Done without a counting return that has PASS for every Done means item`)
    // Every epic return carries the combined check's result, and a Done epic's deciding return carries
    // a PASS. Without this an epic reached Done on a pass where the seam check its owner approved was
    // never run: the return had no slot for a result that is no item's.
    for (const e of doc.entries) {
      // Only a return that COUNTS. A return that no longer counts is history, written under whatever
      // law held when its seat gave it, and a repo adopted before this rule would otherwise carry one
      // unclearable finding per old return: the orchestrator's only ways out are inventing a result
      // nobody ran or deleting history, and SKILL.md tells it to clear findings before writing state.
      if (e.type !== 'return' || !counts(doc, e)) continue
      const cr = combinedOf(e)
      if (!cr) add(file, e.line, 'entry', `return ${e.id} has no Combined check result line`)
      else if (!RESULTS.includes(cr.result)) add(file, cr.line, 'entry', `return ${e.id} Combined check result is ${JSON.stringify(cr.result)}, not ${RESULTS.join(', ')}`)
    }
    if (s === 'Done') {
      const last = latestCounting(doc), cr = last && combinedOf(last)
      if (last && (!cr || resultOf(cr) !== 'PASS')) {
        add(file, cr?.line ?? last.line, 'evidence', `epic ${id} is Done and its counting return ${last.id} has Combined check result ${cr ? resultOf(cr) : '(none)'}, not PASS`)
      }
    }
    if (s === 'Dropped' && !rulingsOf(doc, 'drop').length) add(file, sl, 'evidence', `epic ${id} is Dropped with no drop ruling`)
    if (s === 'Superseded') {
      const succ = rulingsOf(doc, 'supersede').at(-1)?.fields.Successor?.value
      if (!rosterIds.has(succ)) add(file, sl, 'evidence', `epic ${id} is Superseded without a supersede ruling naming a Successor on the roster`)
    }
    for (const m of doc.phases) idCheck(file, m.line, 'phase name', m.name)
    // From the time an epic opens, the phases its Coverage lines name and its phase members are one set.
    if (['Open', 'Done'].includes(s)) {
      const members = new Set(doc.phases.map((m) => m.name)), named = new Set()
      for (const it of doc.items) {
        for (const part of list(it.fields.Coverage?.value)) {
          const ph = /^(.+?):/.exec(part)?.[1].trim()
          if (!ph) continue
          named.add(ph)
          if (!members.has(ph)) add(file, it.fields.Coverage.line, 'coverage', `Done means item ${it.id} Coverage names phase ${ph}, which is not a - phase member of ${s} epic ${id}`)
        }
      }
      for (const m of doc.phases) if (!named.has(m.name)) add(file, m.line, 'coverage', `phase member ${m.name} of ${s} epic ${id} is named in no Done means item's Coverage`)
    }
    for (const it of doc.items) {
      const cov = it.fields.Coverage
      if (!cov) continue
      if (!cov.value) { add(file, cov.line, 'coverage', `Done means item ${it.id} has an empty Coverage`); continue }
      const phases = new Set()
      for (const part of list(cov.value)) {
        const m = /^(.+?):\s*(.*)$/.exec(part), ph = m?.[1].trim()
        if (!OBLIGATIONS.includes(m?.[2])) add(file, cov.line, 'item', `Done means item ${it.id} Coverage part ${JSON.stringify(part)} is not <phase name>: satisfy, contribute or preserve (W2)`)
        if (ph && phases.has(ph)) add(file, cov.line, 'coverage', `Done means item ${it.id} gives phase ${ph} two obligations (W2)`)
        if (ph) phases.add(ph)
      }
    }
  }

  return findings.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1))
}

export const formatFinding = (f) => `${f.path}:${f.line}: ${f.rule}: ${f.message}`

// ---------------------------------------------------------------- status

/** Model plus posture readers to printed lines. A reader that throws or returns null is "could not
 *  look" and prints unknown; a reader that returns an empty list printed `(none)`. */
export function statusLines(model, readers) {
  const p = model.project, out = []
  const byId = resolveRoster(model)
  const stateOf = (id) => (byId.has(id) ? val(byId.get(id).doc, 'State') || 'unknown' : 'unknown')
  const ask = (fn) => { try { return fn() ?? null } catch { return null } }
  const block = (label, rows) => {
    if (rows === null) { out.push(`${label}: unknown`); return }
    out.push(`${label}:`)
    out.push(...(rows.length ? rows.map((r) => `  ${r}`) : ['  (none)']))
  }

  out.push(`project: ${val(p, 'State') || 'unknown'}`)
  out.push('end state:')
  for (const it of p.items) {
    const c = projectCoverage(it.fields.Coverage?.value)
    if (c.satisfy.length === 1) out.push(`  ${it.id}: satisfy ${c.satisfy[0]} ${stateOf(c.satisfy[0])}`)
    else if (!c.satisfy.length && c.projectLevel) {
      const last = latestCounting(p), r = last?.results.filter((x) => x.item === it.id).at(-1)
      out.push(`  ${it.id}: project-level ${!last ? 'no counting return' : r ? resultOf(r) : 'no result in the latest counting return'}`)
    } else out.push(`  ${it.id}: unknown`)
  }
  out.push('epics:')
  for (const r of p.roster) out.push(`  ${r.id} ${stateOf(r.id)}`)
  out.push(`current epic: ${val(p, 'Current epic') || 'unknown'}`)

  const rec = ask(readers.records)
  block('open records', rec && rec.open.map((r) => `${r.name}: ${r.line}`))
  block('gates', rec && rec.gates)
  if (rec) out.push('  (gates covers only .out transcripts under Records; pending means no sibling .out.result)')

  // Built only from the records it resolved, so one roster line it could not read or resolve makes the
  // whole list unknown: a return in that record would be missing from it.
  const allRead = p.roster.every((r) => byId.get(r.id)?.path === r.record)
  const obsolete = []
  for (const { path: file, doc } of filesOf(model, byId)) {
    for (const e of doc.entries) if (e.type === 'return' && !counts(doc, e)) obsolete.push(`${file} ${e.id}: obsolete (baseline ${e.fields.Baseline?.value || 'none'}, revision ${e.fields.Revision?.value || 'none'})`)
  }
  block('obsolete returns', allRead ? obsolete : null)

  block('live seats', ask(readers.seats))
  const jobs = ask(readers.codex)
  block(jobs === null ? 'codex jobs' : 'codex jobs (low confidence: the ownership test cannot separate concurrent sessions)', jobs)
  return out
}

// ---------------------------------------------------------------- readers (the only I/O)

/** Each `.md` under Records whose last state line is Open or Blocked, named by its first heading (its
 *  path where it has none), and every `.out` with `pending` or the first line of its `.out.result`. A
 *  state line starts with `state:` after an optional `- ` and an optional `**`, the two forms run
 *  records use. */
/** Throws, printed unknown, when Records is absent or unreadable or a result file that exists cannot
 *  be read. A transcript with no result file is a pending gate, never a failed read. */
export function readRecords(root, records) {
  if (!records || records === 'none') throw new Error('no Records path')
  const dir = path.join(root, records)
  const names = fs.readdirSync(dir, { recursive: true }).map(String).sort()
  const open = [], gates = []
  for (const n of names) {
    const rel = path.join(records, n), abs = path.join(dir, n)
    if (n.endsWith('.md')) {
      const raw = fs.readFileSync(abs, 'utf8').split('\n')
      const last = raw.map((l) => l.trim()).filter((l) => STATE_LINE.test(l)).at(-1)
      if (last && /^(Open|Blocked)\b/i.test(last.replace(STATE_LINE, ''))) {
        open.push({ name: raw.find((l) => l.startsWith('#'))?.replace(/^#+\s*/, '').trim() || rel, line: last })
      }
    }
    if (n.endsWith('.out')) {
      gates.push(`${rel}: ${fs.existsSync(`${abs}.result`) ? fs.readFileSync(`${abs}.result`, 'utf8').split('\n')[0].trim() : 'pending'}`)
    }
  }
  return { open, gates }
}

/** The repo whose seats and codex jobs status reads: the project file's optional `Tracks:` path,
 *  resolved against the tracking root, or the tracking root itself without one, with symlinks
 *  resolved, since herdr and codex record real paths and the readers compare against them. Throws,
 *  printed unknown, when the path is missing or not a directory: a wrong path must never read as zero
 *  seats. */
export function trackedRoot(root, model) {
  const t = val(model.project, 'Tracks')
  const dir = fs.realpathSync(t ? path.resolve(root, t) : root)
  if (!fs.statSync(dir).isDirectory()) throw new Error(`${t || root} is not a directory`)
  return dir
}

/** Panes in `herdr api snapshot` whose cwd is inside the repo root. Null, printed unknown, outside
 *  herdr, in a contained session (which must reach nothing on the host), when the call fails, and when
 *  the reply carries no pane list: an empty or failed reply is "could not look", never zero seats. */
function readSeats(root, env = process.env) {
  if (env.HERDR_ENV !== '1' || env.DCTR_VIEW_REQUEST_DIR) return null
  let reply
  try { reply = herdr(['api', 'snapshot']) } catch { return null }   // could not look; there is no not-found answer to separate here
  const panes = reply?.result?.snapshot?.panes
  if (!Array.isArray(panes)) return null
  return panes.filter((x) => typeof x?.cwd === 'string' && (x.cwd === root || x.cwd.startsWith(root + path.sep)))
    .map((x) => `${x.pane_id} ${x.agent_status ?? 'unknown'} ${x.label || x.terminal_title_stripped || ''}`.trim())
}

/** Unfinished codex jobs for this workspace, read from each `jobs/*.json` under a `<basename>-` directory of the state dir, the layout
 *  codexJobRecords in dctr-state.mjs reads. It is not called, because it answers [] or skips a record
 *  for every failure and [] must mean "none", never "could not look". This throws, printed unknown,
 *  when the state dir, a matching jobs directory or a job file cannot be read, or a job file does not
 *  parse: a record mid-write cannot be told apart from a broken one, and either may be a live job. A
 *  matching directory with no jobs directory yet holds no jobs. */
export function readCodex(root, stateDir = codexStateDir()) {
  const prefix = `${path.basename(root)}-`
  const out = []
  for (const d of fs.readdirSync(stateDir).filter((n) => n.startsWith(prefix)).sort()) {
    const jobs = path.join(stateDir, d, 'jobs')
    let names
    try { names = fs.readdirSync(jobs) } catch (e) { if (e.code === 'ENOENT') continue; throw e }
    for (const f of names.filter((n) => n.endsWith('.json')).sort()) {
      const file = path.join(jobs, f), r = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (r?.workspaceRoot === root && !codexTerminal(r.status)) out.push(`${r.id || f} ${r.status ?? 'unknown'}`)
    }
  }
  return out
}

// ---------------------------------------------------------------- CLI

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (!['check', 'status'].includes(cmd) || rest.length > 1 || rest.some((a) => a.startsWith('-'))) {
    console.error('usage: node dctr-project.mjs check|status [<repo-root>]')
    process.exit(2)
  }
  const root = path.resolve(rest[0] ?? '.')
  let text
  try { text = fs.readFileSync(path.join(root, PROJECT_PATH), 'utf8') }
  catch (e) { console.error(`dctr-project: cannot read ${PROJECT_PATH} under ${root} (${e.code || e.message})`); process.exit(2) }
  const model = modelFrom(text, (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8') } catch { return null } })
  if (cmd === 'check') {
    const findings = check(model, (rel) => fs.existsSync(path.join(root, rel)))
    for (const f of findings) console.log(formatFinding(f))
    process.exit(findings.length ? 1 : 0)
  }
  const lines = statusLines(model, {
    records: () => readRecords(root, val(model.project, 'Records')),
    seats: () => readSeats(trackedRoot(root, model)),
    codex: () => readCodex(trackedRoot(root, model)),
  })
  console.log(lines.join('\n'))
}
