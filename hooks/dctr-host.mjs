// doctrine — the host seam (issue #111, phase A): the one file that runs `herdr`, `hc` or `herdr-app` for the seat
// hook and the gate launcher.
//
// Two hosts, one object each with the same methods, chosen by termHost (dctr-lib.mjs):
//
//   herdr       the TUI multiplexer, through dctr-state.mjs's herdr(). Every argv here is the one the seat hook and
//               the gate launcher sent before the seam existed, byte for byte.
//   herdr-core  `hc` (the runtime) and `herdr-app` (the window behind Herdr.app), measured on hc 0.1.21:
//               - `herdr-app do pane.split --pane P --direction right|down --argv '[...]'` answers {pane, terminal};
//                 the new terminal starts in the split pane's folder, so a command is prefixed `cd <cwd> &&`
//               - `herdr-app do tab.new --space S --name N --folder F --argv '[...]' --focus false` answers
//                 {space, tab, terminal}: a named tab, not focused, with no pane id in the reply
//               - `pane.close` / `tab.close` answer {"ok":true}, or {"error":"no pane \"P\""} / {"error":"no tab \"T\""}
//                 and exit 1 for one already gone. The closed pane's terminal stays in hc as `finished` until `hc rm`
//               - `herdr-app ls` maps spaces > tabs > terminals with their panes; `herdr-app status` names the
//                 window's shown space, tab and focused pane. Neither carries geometry
//               - no pane rename exists, so a herdr-core pane prints its label as its first line instead, and a
//                 command is passed at creation rather than typed in afterwards (`run` is a no-op there)
//               - a pane's PROGRAM is the pane: Herdr.app closes the pane when it exits, and leaves its terminal in hc
//                 as `finished` (measured live, 2026-11-23: a focused gate pane vanished at completion). A TUI pane is
//                 a shell the command was typed into and outlives it, so herdr-core's command ends in the user's shell
//                 (hcArgv): a pane spared because someone is looking at it stays, with its result line on screen
//
// THE RULE EVERY READ HERE KEEPS, and tools/herdr-lint.mjs checks it over both hosts: a reply that failed or carried
// nothing is "I could not look", never "it is gone". Only a not-found answer (herdr's pane_not_found and
// tab_not_found codes, herdr-app's `no pane` and `no tab` errors) or a successful listing that does not carry the id
// is an observed absence. Every other failure throws, and the caller keeps its record.

import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { PREFIX, termHost, shq, splitPaneArgs, tabCreateArgs, paneToken } from './dctr-lib.mjs'
import { herdr, hostExec, isPaneNotFound, isTabNotFound } from './dctr-state.mjs'

/** herdr-app's error string from a failed call, read from the top-level `error` of a JSON line on either stream, or
 *  null. Parsed, never grepped, for the reason herdrErrorCode in dctr-state.mjs gives. */
function appError(e) {
  for (const stream of [e?.stdout, e?.stderr]) {
    for (const line of String(stream ?? '').split('\n')) {
      const t = line.trim()
      if (!t.startsWith('{')) continue
      try { const err = JSON.parse(t)?.error; if (typeof err === 'string') return err } catch { /* not this line */ }
    }
  }
  return null
}
/** herdr-app's answer for a pane or tab that does not exist (`kind` 'pane' or 'tab'). Measured: `no pane "<p>"`. */
export const isAppNotFound = (e, kind) => (appError(e) ?? '').startsWith(`no ${kind} "`)

/** One herdr-app call, its JSON reply parsed. A reply that is not JSON throws. */
export const herdrApp = (args) => JSON.parse(hostExec('herdr-app', args))

/** The sh argv a herdr-core terminal runs: the command, in `cwd` when one is given (the TUI's `--cwd`), then the user's
 *  shell in its place, as a TUI pane's shell outlives the line typed into it. Whatever ends the command, the pane stays
 *  until it is closed or its shell exits; a pane gone that way reads not-found, and its marker goes on the next read. */
export const hcArgv = (cwd, command) => ['sh', '-c', `${cwd ? `cd ${shq(cwd)} && ` : ''}${command}; exec "\${SHELL:-/bin/sh}" -l`]

/** Every tab and every terminal herdr-app lists, as `{ space, tab, tabName, terminal, pane }` rows (a tab's own row
 *  carries `isTab`). Throws when the listing is not one, so an empty or malformed reply is never read as "no panes".
 *  An entry missing an id still gets its row, with null for what it lacks, and marks the listing PARTIAL: `tabsPartial`
 *  for a space or tab with no id, `panesPartial` for that or a terminal with no terminal id or no pane. An id absent
 *  from a partial listing may be the one the incomplete entry stands for, so it is never an observed absence (absent). */
function appPanes() {
  const spaces = herdrApp(['ls']).spaces
  if (!Array.isArray(spaces)) throw new Error('herdr-app ls answered with no spaces list')
  const id = (v) => (typeof v === 'string' && v ? v : null)
  const out = []
  let tabsPartial = false, panesPartial = false
  for (const s of spaces) {
    if (!Array.isArray(s?.tabs)) throw new Error(`herdr-app ls answered space ${s?.id} with no tabs list`)
    if (!id(s.id)) tabsPartial = true
    for (const t of s.tabs) {
      if (!Array.isArray(t?.terminals)) throw new Error(`herdr-app ls answered tab ${t?.id} with no terminals list`)
      if (!id(t.id)) tabsPartial = true
      out.push({ space: id(s.id), tab: id(t.id), tabName: t.name, terminal: null, pane: null, isTab: true })
      for (const x of t.terminals) {
        if (!id(x?.terminal) || !id(x?.pane)) panesPartial = true
        out.push({ space: id(s.id), tab: id(t.id), tabName: t.name, terminal: id(x?.terminal), pane: id(x?.pane) })
      }
    }
  }
  return Object.assign(out, { tabsPartial, panesPartial: panesPartial || tabsPartial })
}
/** "Not in this listing" as an answer: { exists: false } from a complete listing, a throw ("I could not look") from a
 *  partial one. The one place a herdr-core absence is decided. */
function absent(partial, what) {
  if (partial) throw new Error(`herdr-app ls carried an incomplete entry, so ${what} cannot be judged absent`)
  return { exists: false }
}
/** herdr-app's measured answer to a close is exactly {"ok":true}. Anything else, an empty object included, closed
 *  nothing anyone observed, and the caller keeps its record. */
function closedOk(r, what) {
  if (r?.ok !== true) throw new Error(`${what} answered ${JSON.stringify(r)}, not {"ok":true}`)
  return 'closed'
}
/** The window's focus as herdr-app status reports it. A field that is not a non-empty string names nothing, so it is
 *  unknown, never a mismatch: read as an id, an empty one made every listed pane and tab unfocused. */
function appFocus() {
  const st = herdrApp(['status'])
  const named = (v) => (typeof v === 'string' && v ? v : null)
  return { pane: named(st?.focused_pane), tab: named(st?.tab) }
}

/**
 * Remove a herdr-core terminal once it has finished, from a detached child: a close ends the terminal, and when the
 * caller runs inside it (a gate closing its own pane) the caller dies with it, so the removal must not be its own.
 * `hc wait` returns when a plain program exits. Best effort: a terminal that never finishes stays listed.
 */
function removeWhenFinished(terminals) {
  for (const t of terminals.filter(Boolean)) {
    try {
      spawn('sh', ['-c', `hc wait ${shq(t)} >/dev/null 2>&1; hc rm ${shq(t)} >/dev/null 2>&1`], { detached: true, stdio: 'ignore' }).unref()
    } catch { /* the finished terminal stays listed in hc */ }
  }
}

export const herdrHost = (env = process.env, { space = env.HERDR_WORKSPACE_ID } = {}) => ({
  name: 'herdr',
  startsAtCreation: false,   // a TUI pane's line is typed in by run(), after its record is written
  tag: {},   // what a marker records about its host: nothing, as every TUI marker always has
  self: () => ({ pane: env.HERDR_PANE_ID, tab: env.HERDR_TAB_ID, space }),
  noSelf: 'no HERDR_PANE_ID in the environment',
  layout(me) {
    // herdr-lint: creation, not destruction. An unreadable layout is null, which takes the tab path and drops no marker.
    try { return herdr(['pane', 'layout', '--pane', me.pane]).result.layout.panes } catch { return null }
  },
  splitRight: (pane, cwd) => ({ paneId: herdr(splitPaneArgs(pane, 'right', cwd)).result.pane.pane_id, terminal: null }),
  splitDown: (pane, cwd) => ({ paneId: herdr(splitPaneArgs(pane, 'down', cwd)).result.pane.pane_id, terminal: null }),
  newTab(me, cwd, command, label) {
    const tab = herdr(tabCreateArgs(me.space, label, cwd))
    return { tabId: tab.result.tab.tab_id, paneId: tab.result.root_pane.pane_id, terminal: null }
  },
  paneInfo(paneId) {
    let pane
    try { pane = herdr(['pane', 'get', paneId]).result?.pane }
    catch (e) { if (isPaneNotFound(e)) return { exists: false }; throw e }
    // A reply carrying no pane, or no boolean focus, is a pane whose focus is unknown: `focused` is left as it came.
    return { exists: true, focused: pane?.focused }
  },
  /** The session's tabs, `[{ tab_id, focused, label }]`; throws on a failed list or a reply that is not a list. */
  tabs() {
    const tabs = herdr(['tab', 'list', '--workspace', space]).result?.tabs
    if (!Array.isArray(tabs)) throw new Error('tab list answered with no tabs list')
    return tabs
  },
  tabInfo(tabId) {
    try { herdr(['tab', 'get', tabId]); return { exists: true } }
    catch (e) { if (isTabNotFound(e)) return { exists: false }; throw e }
  },
  closePane(paneId) {
    try { herdr(['pane', 'close', paneId]); return 'closed' }
    catch (e) { if (isPaneNotFound(e)) return 'gone'; throw e }
  },
  closeTab(tabId) {
    try { herdr(['tab', 'close', tabId]); return 'closed' }
    catch (e) { if (isTabNotFound(e)) return 'gone'; throw e }
  },
  renamePane: (paneId, label) => { herdr(['pane', 'rename', paneId, label]) },
  renameTab: (tabId, label) => { herdr(['tab', 'rename', tabId, label]) },
  /** A finished gate's result on its own pane, called from inside that pane: the TUI renames it. */
  relabelOwn: (paneId, label) => { herdr(['pane', 'rename', paneId, label]) },
  /** A stopped seat's result on its pane, called from the hook: the TUI renames it. */
  relabelSeat: (paneId, label) => { herdr(['pane', 'rename', paneId, label]) },
  run: (paneId, command) => { herdr(['pane', 'run', paneId, command]) },
  /** The sidebar's agent row, herdr only. `message` is omitted on the idle report, as it always was. */
  reportAgent: (paneId, name, state, message) => {
    herdr(['pane', 'report-agent', paneId, '--source', `custom:${PREFIX}`, '--agent', name, '--state', state, ...(message === undefined ? [] : ['--message', message])])
  },
  /** Replace what a seat pane runs (the codex watcher): stop the renderer, then type the line into the pane's shell.
   *  A failed interrupt is logged and the line is still typed; a failed `pane run` throws. */
  handOff(paneId, command, log) {
    try { herdr(['pane', 'send-keys', paneId, 'ctrl+c']) } catch (e) { log(`interrupting the renderer in ${paneId} failed (${String(e.message).split('\n')[0]})`) }
    herdr(['pane', 'run', paneId, command])
  },
})

export const hcHost = (env = process.env) => ({
  name: 'herdr-core',
  startsAtCreation: true,    // the command is the pane's program, running from the moment it is created
  tag: { host: 'herdr-core' },   // so another host's placement never judges this pane (gateAnswer)
  /** This terminal's pane, tab and space from herdr-app ls, or null when it cannot be read or is not there. */
  self() {
    let me
    // herdr-lint: no destruction follows. A null self stands the seat down and sends the gate to its detached path.
    try { me = appPanes().find((x) => x.terminal && x.terminal === env.HC_TERMINAL_ID) } catch { return null }
    return me?.pane ? { pane: me.pane, tab: me.tab, space: me.space } : null
  },
  noSelf: `herdr-app ls could not place this terminal (HC_TERMINAL_ID ${env.HC_TERMINAL_ID || 'unset'}) in a pane`,
  /** The session tab's panes in herdr-app ls order, with no rect: herdr-core reports no geometry. A partial listing is
   *  null, as an unreadable one is: a pane it leaves out or files under a tab with no id may be a live seat, so the
   *  placement takes the tab path, drops no marker and never counts the column short. */
  layout(me) {
    // herdr-lint: creation, not destruction. An unreadable or partial layout is null, which takes the tab path and drops no marker.
    try {
      const rows = appPanes()
      return rows.panesPartial ? null : rows.filter((x) => !x.isTab && x.tab === me.tab).map((x) => ({ pane_id: x.pane }))
    } catch { return null }
  },
  splitRight: (pane, cwd, command) => appSplit(pane, 'right', cwd, command),
  splitDown: (pane, cwd, command) => appSplit(pane, 'down', cwd, command),
  newTab(me, cwd, command, label) {
    const r = herdrApp(['do', 'tab.new', '--space', me.space, '--name', label, '--folder', cwd, '--argv', JSON.stringify(hcArgv(cwd, command)), '--focus', 'false'])
    if (typeof r?.tab !== 'string') throw new Error(`tab.new answered with no tab (${JSON.stringify(r)})`)
    // The reply names the terminal, not its pane. A pane this listing cannot find stays null: the tab id closes it.
    let paneId = null
    // herdr-lint: creation. The pane id is display and the tab id is what any close uses.
    try { paneId = appPanes().find((x) => x.terminal === r.terminal)?.pane ?? null } catch { /* the tab id is enough */ }
    return { tabId: r.tab, paneId, terminal: r.terminal ?? null }
  },
  paneInfo(paneId) {
    const rows = appPanes()
    if (!rows.some((x) => x.pane === paneId)) return absent(rows.panesPartial, `pane ${paneId}`)
    const { pane } = appFocus()
    return { exists: true, focused: pane === null ? undefined : pane === paneId }
  },
  /** Every tab herdr-app lists, in every space, `[{ tab_id, focused, label }]`. Tab ids are global, so a tab absent
   *  from this list is absent everywhere. */
  tabs() {
    const rows = appPanes()
    if (rows.tabsPartial) throw new Error('herdr-app ls carried a space or tab with no id, so the tab list is not whole')
    const tabs = rows.filter((x) => x.isTab)
    const { tab } = appFocus()
    return tabs.map((x) => ({ tab_id: x.tab, focused: tab === null ? undefined : tab === x.tab, label: x.tabName }))
  },
  tabInfo(tabId) {
    const rows = appPanes()
    return rows.some((x) => x.isTab && x.tab === tabId) ? { exists: true } : absent(rows.tabsPartial, `tab ${tabId}`)
  },
  /** `terminal`, the one its marker recorded, is removed too: a pane the user already closed is in no listing. */
  closePane(paneId, terminal) {
    removeWhenFinished([...new Set([terminal, ...appPanes().filter((x) => x.pane === paneId).map((x) => x.terminal)])])
    try { return closedOk(herdrApp(['do', 'pane.close', '--pane', paneId]), 'pane.close') }
    catch (e) { if (isAppNotFound(e, 'pane')) return 'gone'; throw e }
  },
  closeTab(tabId, terminal) {
    removeWhenFinished([...new Set([terminal, ...appPanes().filter((x) => !x.isTab && x.tab === tabId).map((x) => x.terminal)])])
    try { return closedOk(herdrApp(['do', 'tab.close', '--id', tabId]), 'tab.close') }
    catch (e) { if (isAppNotFound(e, 'tab')) return 'gone'; throw e }
  },
  renamePane: () => {},   // measured: herdr-core has no pane rename; the pane printed its label as its first line
  renameTab: (tabId, label) => { herdrApp(['do', 'tab.rename', '--id', tabId, '--name', label]) },
  /** No rename, so the gate prints its result as its pane's last line, and the shell hcArgv ends in keeps it there. */
  relabelOwn: (paneId, label) => { process.stdout.write(`${label}\n`) },
  /** The seat's renderer is handed a line that prints the result in its place; the shell after it keeps the pane. */
  relabelSeat(paneId, label, log, handoff) { this.handOff(paneId, `printf '%s\\n' ${shq(label)}`, log, handoff) },
  run: () => {},          // the command was passed at creation
  reportAgent: () => {},  // herdr-core has no agent-row report
  /** The codex watcher on herdr-core: the renderer was started with `handoff` as its hand-off file and runs whatever
   *  line appears there in its place. Written whole by rename, so the renderer never reads half a line. */
  handOff(paneId, command, log, handoff) {
    if (!handoff) throw new Error(`no hand-off file for ${paneId}`)
    fs.writeFileSync(`${handoff}.partial`, command)
    fs.renameSync(`${handoff}.partial`, handoff)
  },
})

/** A split on herdr-core. pane.split has no focus argument and takes focus inside its space (measured), so when the new
 *  pane took the window's focus, focus goes back to the pane that held it: a seat must never steal the user's cursor,
 *  and a focused seat is never closed. When the session's space is not the one shown, the split moves that space's
 *  remembered focus, which `status` (window-level) cannot see, so nothing is restored: a pane.focus there would switch
 *  the space the user is looking at. */
function appSplit(pane, direction, cwd, command) {
  let before = null
  // herdr-lint: display only. An unreadable focus skips the focus restore and decides nothing else.
  try { before = appFocus().pane } catch { /* no restore */ }
  const r = herdrApp(['do', 'pane.split', '--pane', pane, '--direction', direction, '--argv', JSON.stringify(hcArgv(cwd, command))])
  if (typeof r?.pane !== 'string') throw new Error(`pane.split answered with no pane (${JSON.stringify(r)})`)
  if (before && before !== r.pane) {
    // herdr-lint: display only. A failed restore leaves focus where the split put it.
    try { if (appFocus().pane === r.pane) herdrApp(['do', 'pane.focus', '--pane', before]) } catch { /* focus stays */ }
  }
  return { paneId: r.pane, terminal: r.terminal ?? null }
}

/** The host this environment's session runs in. Anything but herdr-core is the herdr TUI, as it always was. */
export const hostFor = (env = process.env, opts = {}) => (termHost(env) === 'herdr-core' ? hcHost(env) : herdrHost(env, opts))

/**
 * A moved gate's server-wide answer for dropGoneGates: 'found', 'not_found' or 'failed'. A gate another host placed
 * is never judged here ('failed' keeps it): a TUI pane id asked of herdr-core answers not-found and would drop a gate
 * still running in the TUI.
 */
export function gateAnswer(host, g) {
  if ((g.host || 'herdr') !== host.name) return 'failed'
  // herdr-lint: a lookup that throws is 'failed', which movedGateVerdict keeps.
  try { return (g.tabId ? host.tabInfo(g.tabId) : host.paneInfo(g.paneId)).exists ? 'found' : 'not_found' } catch { return 'failed' }
}

/** The renderer's hand-off file for a seat, beside its marker and bound to the seat by its agent id: names are reused
 *  (the lowest free index), so a file named for the marker alone would be read by the next seat to take that name. */
export const handoffPath = (marker, agentId) => `${marker}.${paneToken(agentId)}.handoff`
/** Remove a seat's hand-off file with its marker. Bound to the agent id, so a leftover one is never read, but it is
 *  still not left lying in the seats directory. A gate's marker names no agent and has none. */
export const dropHandoff = (marker, agentId) => {
  if (!agentId) return
  for (const f of [handoffPath(marker, agentId), `${handoffPath(marker, agentId)}.partial`]) try { fs.rmSync(f, { force: true }) } catch { /* best effort */ }
}
/** The seat renderer's creation command, which herdr-core runs and the herdr TUI ignores: its label, printed first
 *  since no pane rename exists there, and the hand-off file the codex watcher arrives through. */
export const seatCommand = (renderer, file, label, handoff) => `node ${shq(renderer)} ${shq(file)} ${shq(label)} ${shq(handoff)}`
/** The line the TUI types into a seat pane: the renderer alone, as it always was. */
export const seatRunLine = (renderer, file) => `node ${shq(renderer)} ${shq(file)}`

