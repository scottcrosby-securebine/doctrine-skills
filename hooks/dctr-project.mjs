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
// Rules: state, evidence, roster, coverage, item, entry, reference, impact, issues, pointer, id.
//
// WHAT `check` DOES NOT ENFORCE, stated so a clean run is not read as more:
//   - whether a return's per-item results are honest, or the certification target is the right one;
//   - uniqueness of phase names, or of item and entry IDs across files (a duplicate roster ID, and a
//     duplicate item or entry ID within one file, are findings);
//   - the format of the time in an entry heading, beyond its being present;
//   - which fields a ruling Kind requires (Successor), beyond what the named rules read.

import fs from 'node:fs'
import path from 'node:path'
import { herdr, codexStateDir } from './dctr-state.mjs'
import { codexTerminal, ID_RE } from './dctr-lib.mjs'

export const PROJECT_PATH = 'docs/PROJECT.md'
const PROJECT_STATES = ['Proposed', 'Ruled', 'Done']
const EPIC_STATES = ['Proposed', 'Not started', 'Open', 'Done', 'Dropped', 'Superseded']
const TERMINAL = ['Done', 'Dropped', 'Superseded']
const FIELDS = ['Outcome', 'Type', 'Check', 'Control', 'Evidence', 'Coverage']
const KINDS = ['baseline', 'done-means-change', 'impact', 'drop', 'supersede', 'project-level']
const RESULTS = ['PASS', 'FAIL', 'UNVERIFIED']
const OBLIGATIONS = ['satisfy', 'contribute', 'preserve']

// ---------------------------------------------------------------- parse

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const cells = (t) => t.slice(1, -1).split('|').map((c) => c.trim())

/** Markdown to a model. Every value carries the 1-based line it came from. */
export function parseDoc(text) {
  const doc = { title: null, headers: Object.create(null), items: [], roster: [], issues: [], phases: [], entries: [] }
  let section = null, item = null, entry = null, lastRow = null
  String(text).split('\n').forEach((raw, i) => {
    const line = i + 1, t = raw.trimEnd()
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
      if (f && item) item.fields[f[1]] = { value: f[2].trim(), line }
      return
    }
    if ((section === 'Epics' || section === 'Open issues') && /^\|.*\|$/.test(t)) {
      const c = cells(t), rows = section === 'Epics' ? doc.roster : doc.issues
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
      if (!entry) return
      const r = entry.type === 'return' && /^- ([^:\s]+):\s*([^,]*?)\s*(?:,\s*evidence:\s*(.*))?$/.exec(t)
      if (r) { entry.results.push({ item: r[1], result: r[2], evidence: (r[3] ?? '').trim(), line }); return }
      const f = /^([A-Za-z][A-Za-z ]*):\s?(.*)$/.exec(t)
      if (f) entry.fields[f[1]] = { value: f[2].trim(), line }
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

/** A return counts when its Baseline is current, its Revision is the certification target, and no
 *  regression against one of its items comes after it (ER8, ER9). */
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
/** The latest counting return decides, never any earlier one that also counts. */
const latestCounting = (doc) => doc.entries.filter((e) => e.type === 'return' && counts(doc, e)).at(-1) ?? null
const passesAll = (doc, ids) => { const e = latestCounting(doc); return Boolean(e) && ids.every((id) => e.results.some((r) => r.item === id && resultOf(r) === 'PASS')) }

function projectCoverage(v) {
  const out = { satisfy: [], projectLevel: null, unknown: [] }
  for (const part of (v || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(satisfy|contribute|preserve|project-level)\s+(\S.*)$/.exec(part)
    if (!m) out.unknown.push(part)
    if (m?.[1] === 'satisfy') out.satisfy.push(...list(m[2]))
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

  // end-state coverage
  const chainEndsDone = (id) => {
    const visited = new Set()
    while (stateOf(id) === 'Superseded' && !visited.has(id)) { visited.add(id); id = rulingsOf(byId.get(id).doc, 'supersede').at(-1)?.fields.Successor?.value }
    return stateOf(id) === 'Done'
  }
  for (const it of p.items) {
    const cov = it.fields.Coverage, ln = cov?.line ?? it.line
    const c = projectCoverage(cov?.value)
    for (const u of c.unknown) add(P, ln, 'coverage', `end-state item ${it.id} Coverage part ${JSON.stringify(u)} is not satisfy, contribute or preserve <epic IDs>, or project-level <ruling ID>`)
    if (!c.satisfy.length && !c.projectLevel) add(P, ln, 'coverage', `end-state item ${it.id} has no satisfy epic and no project-level ruling`)
    if (c.satisfy.length > 1) add(P, ln, 'coverage', `end-state item ${it.id} has more than one satisfy epic (${c.satisfy.join(', ')})`)
    for (const e of c.satisfy) {
      if (!rosterIds.has(e)) { add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is not on the roster`); continue }
      if (stateOf(e) === 'Dropped') add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is Dropped`)
      if (stateOf(e) === 'Superseded' && !chainEndsDone(e)) add(P, ln, 'coverage', `end-state item ${it.id} satisfy epic ${e} is Superseded and its successor chain does not end at a Done epic; rule the successor as the satisfy epic once it is Done`)
    }
    if (c.projectLevel && !rulingsOf(p, 'project-level').some((r) => r.id === c.projectLevel && list(r.fields.Items?.value).includes(it.id))) {
      add(P, ln, 'coverage', `end-state item ${it.id} names ${c.projectLevel}, which is not a project-level ruling listing it`)
    }
  }

  // per-file rules, project then each resolved epic
  const files = filesOf(model, byId)
  for (const { path: file, doc } of files) {
    const what = doc === p ? 'end-state item' : 'Done means item'
    const itemIds = new Set(), entryIds = new Set()
    const ref = (line, id, subject) => { if (!itemIds.has(id)) add(file, line, 'reference', `${subject} names ${JSON.stringify(id ?? null)}, which is not an item in this file`) }
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
      if (e.type === 'regression') ref(e.fields.Item?.line ?? e.line, e.fields.Item?.value, `regression ${e.id} Item`)
      if (e.type === 'return') {
        for (const r of e.results) ref(r.line, r.item, `return ${e.id} result`)
        for (const r of e.results) if (!RESULTS.includes(r.result)) add(file, r.line, 'entry', `return ${e.id} result for ${r.item} is ${JSON.stringify(r.result)}, not ${RESULTS.join(', ')}`)
        const b = e.fields.Baseline
        if (!doc.entries.some((x) => x.type === 'ruling' && x.id === b?.value && ['baseline', 'done-means-change'].includes(kind(x)))) {
          add(file, b?.line ?? e.line, 'reference', `return ${e.id} Baseline ${b?.value || '(none)'} is not a baseline or done-means-change ruling in this file`)
        }
      }
      if (e.type === 'ruling' && ['done-means-change', 'impact', 'project-level'].includes(kind(e))) {
        const ids = list(e.fields.Items?.value)
        if (!ids.length && kind(e) !== 'project-level') add(file, e.fields.Items?.line ?? e.line, 'reference', `${kind(e)} ruling ${e.id} has no Items`)
        for (const id of ids) ref(e.fields.Items.line, id, `${kind(e)} ruling ${e.id} Items`)
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
    }
    if (s === 'Done' && !passesAll(doc, doc.items.map((i) => i.id))) add(file, sl, 'evidence', `epic ${id} is Done without a counting return that has PASS for every Done means item`)
    if (s === 'Dropped' && !rulingsOf(doc, 'drop').length) add(file, sl, 'evidence', `epic ${id} is Dropped with no drop ruling`)
    if (s === 'Superseded') {
      const succ = rulingsOf(doc, 'supersede').at(-1)?.fields.Successor?.value
      if (!rosterIds.has(succ)) add(file, sl, 'evidence', `epic ${id} is Superseded without a supersede ruling naming a Successor on the roster`)
    }
    for (const m of doc.phases) idCheck(file, m.line, 'phase name', m.name)
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
  block('open records', rec && rec.open.map((r) => `${r.path}: ${r.line}`))
  block('pending gates', rec && rec.pending)
  if (rec) out.push('  (pending covers only .out transcripts under Records with no sibling .out.result)')

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

/** Each `.md` under Records whose last `state:` line is Open or Blocked, and each `.out` with no
 *  sibling `.out.result`. Throws when Records is absent or unreadable, which prints unknown. */
function readRecords(root, records) {
  if (!records || records === 'none') throw new Error('no Records path')
  const dir = path.join(root, records)
  const names = fs.readdirSync(dir, { recursive: true }).map(String).sort()
  const open = [], pending = []
  for (const n of names) {
    const rel = path.join(records, n), abs = path.join(dir, n)
    if (n.endsWith('.md')) {
      const last = fs.readFileSync(abs, 'utf8').split('\n').filter((l) => /^state:/i.test(l.trim())).at(-1)?.trim()
      if (last && /^state:\s*(Open|Blocked)\b/i.test(last)) open.push({ path: rel, line: last })
    }
    if (n.endsWith('.out') && !fs.existsSync(`${abs}.result`)) pending.push(rel)
  }
  return { open, pending }
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
    seats: () => readSeats(root),
    codex: () => readCodex(root),
  })
  console.log(lines.join('\n'))
}
