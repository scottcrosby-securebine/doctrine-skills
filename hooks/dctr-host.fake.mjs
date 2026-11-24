// A fake host for the selftests: one model of spaces, tabs, panes and terminals answering as `herdr` (the TUI),
// `herdr-app` and `hc` (herdr-core), in the reply shapes measured on herdr 0.9.5 and hc 0.1.21 (dctr-host.mjs's
// header lists them). The suite puts a wrapper under each of the three names in a bin directory, which runs this file
// with its own path first: that path's base name says which CLI is being played. Not a hook, never loaded by one.
//
//   DCTR_FAKE_STATE  the model, JSON, rewritten whole by rename after every change
//   DCTR_FAKE_CALLS  one JSON line per call, {bin, args}, appended
//   DCTR_FAKE_FAIL   JSON {"<bin> <verb>": "transport" | "notfound" | "empty"}: that call fails as a transport error, answers
//                    not-found in its CLI's own shape (herdr and herdr-app), or answers with an empty reply. The verb is the first two words of a
//                    herdr call (`pane get`), the first word of a herdr-app call (`ls`), or `do <command>` (`do pane.close`).
//                    "after", on a call that creates a pane or tab, fails it as a transport error only once the pane or
//                    tab is in the model and its program started: a create that timed out or answered with no pane.
//                    "blank", on a focus read (`herdr pane get`, `herdr tab list`, `herdr-app status`), names the focus as
//                    empty strings. "noid", on a pane split of either CLI or a herdr-app tab.new, creates the pane and starts its
//                    program as usual, then answers with an empty pane or tab id
//
// The model: { spaces: [{ id, name, tabs: [{ id, name, panes: [{ pane, terminal, name? }] }] }], focus: { tab, pane },
// n, exec, splitFocuses, terminals: { <id>: 'live' | 'finished' | 'removed' }, hcGet, recorderGone, lag }. A herdr-core terminal is live from its
// pane's creation, finished when its pane is closed or its program exits, and removed by `hc rm`, which refuses one
// still live; `hc wait` returns once a terminal is no longer live (or after 20s). `exec` runs every created pane's command (sh -c) detached in an environment that pane would
// have: a TUI pane's HERDR_ENV and HERDR_PANE_ID, a herdr-core terminal's HC_TERMINAL_ID. A close hangs up that
// command's process group, as closing a real pane hangs up its terminal, so whatever the pane ran dies with it unless
// it detached. `splitFocuses` makes a herdr-app split take the window's focus, which herdr-app's manual leaves unsaid.
//
// A herdr-core pane's program IS the pane (measured live 2026-11-23): when it exits, Herdr.app closes the pane and the
// terminal stays in hc as finished. So a herdr-core pane's program runs under a supervisor (this file in `__supervise`
// mode) that keeps its stdin open, writes its output to `<state>.<pane>.out`, and takes the pane out of the model
// when the program exits. A TUI pane's line is typed into a shell that outlives it, so its supervisor leaves the pane.
//
// `hc get` answers a terminal's state, size and foreground program (its pane's own argv, or a shell's when `recorderGone`
// is set, as after the recorder exits; a TUI `pane process-info` follows the same switch), with `hcGet` merged over it.
// `lag` is the foreground the next answers give in its place, one per call in order, as a new tab's does before its program
// is named: 'none' is no foreground key, 'shell' is the shell Herdr.app starts a tab's program through.
// `hc attach` plays the measured client: it needs a terminal on stdin, goes raw and queries at once, throws away what
// arrives before it is attached (written to `<state>.<t>.early`), announces itself with ESC[?1004h, appends what it is
// typed to `<state>.<t>.typed` and its size to `<state>.<t>.size`, and leaves on ctrl+\. The screen it draws goes to
// its own terminal and never to a transcript. Its faults, the first three on the transcript DCTR_FAKE_TEE names, as it
// attaches: "output" appends to it, "shrink" empties it, "vanish" removes it, and "after" dies once
// it has read typed bytes, "nodetach" ignores ctrl+\\ and a hang-up (its pid is in `<state>.<t>.pid`), "hang" never
// announces itself.
//
// NOTHING OUTLIVES THE SUITE. Every supervisor watches DCTR_FAKE_OWNER, the suite's pid, and kills its program's
// process group the moment that pid is gone, however the suite ended: a renderer started by a seat row runs forever
// otherwise, and survives a kill of the suite's own process group because a supervisor is detached into its own.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** One writer at a time: every call that may change the model reads and rewrites it whole under this lock, so a
 *  supervisor or an `hc rm` finishing beside a hook's call loses neither write. A holder dead for 5s is stolen. */
const LOCK = `${process.env.DCTR_FAKE_STATE}.lock`
let held = false   // so a second unlock (hangUp, then exit) never removes a lock another process has since taken
const lock = () => {
  const until = Date.now() + 15000
  for (;;) {
    try { fs.mkdirSync(LOCK); held = true; return } catch { /* held */ }
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 5000) fs.rmSync(LOCK, { recursive: true, force: true }) } catch { /* gone */ }
    if (Date.now() > until) throw new Error('fake host lock held too long')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}
const unlock = () => { if (!held) return; held = false; try { fs.rmdirSync(LOCK) } catch { /* not ours any more */ } }

if (process.argv[2] === '__supervise') {
  const [, , , statePath, pane, argvJson, closes] = process.argv
  const out = fs.openSync(`${statePath}.${pane}.out`, 'a')
  const argv = JSON.parse(argvJson)
  const child = spawn(argv[0], argv.slice(1), { stdio: ['pipe', out, out] })   // stdin held open: a shell waits on it
  const owner = Number(process.env.DCTR_FAKE_OWNER)
  const end = () => { try { process.kill(-process.pid, 'SIGKILL') } catch { /* gone */ } }
  if (owner) setInterval(() => { try { process.kill(owner, 0) } catch { end() } }, 200)
  child.on('exit', () => {
    if (closes !== '1') process.exit(0)
    lock()
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    for (const sp of st.spaces) for (const t of sp.tabs) {
      const i = t.panes.findIndex((x) => x.pane === pane)
      if (i < 0) continue
      if (st.terminals?.[t.panes[i].terminal] === 'live') st.terminals[t.panes[i].terminal] = 'finished'
      t.panes.splice(i, 1)
      if (!t.panes.length) sp.tabs.splice(sp.tabs.indexOf(t), 1)
    }
    st.exited = [...(st.exited ?? []), pane]
    fs.writeFileSync(`${statePath}.${process.pid}`, JSON.stringify(st)); fs.renameSync(`${statePath}.${process.pid}`, statePath)
    unlock()
    process.exit(0)
  })
} else {

const bin = path.basename(process.argv[2])
const args = process.argv.slice(3)
const STATE = process.env.DCTR_FAKE_STATE
fs.appendFileSync(process.env.DCTR_FAKE_CALLS, `${JSON.stringify({ bin, args })}\n`)
const waits = bin === 'hc' && ['wait', 'attach'].includes(args[0])   // an attach stays open and a wait polls, without the lock, or it would hold every other call
if (!waits) lock()
process.on('exit', () => { if (!waits) unlock() })
const state = JSON.parse(fs.readFileSync(STATE, 'utf8'))
const save = () => { fs.writeFileSync(`${STATE}.${process.pid}`, JSON.stringify(state)); fs.renameSync(`${STATE}.${process.pid}`, STATE) }
const out = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); process.exit(0) }
const flag = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }

const verb = bin === 'herdr' ? args.slice(0, 2).join(' ') : args[0] === 'do' ? `do ${args[1]}` : args[0]
const fail = JSON.parse(process.env.DCTR_FAKE_FAIL || '{}')[`${bin} ${verb}`]
const notFound = (kind, id) => {
  if (bin === 'herdr') { process.stderr.write(`${JSON.stringify({ error: { code: `${kind}_not_found`, message: `${kind} ${id} not found` }, id: `cli:${verb}` })}\n`); process.exit(1) }
  process.stdout.write(`${JSON.stringify({ error: `no ${kind} "${id}"` })}\n`); process.exit(1)
}
if (fail === 'transport') {
  process.stderr.write(bin === 'herdr' ? '{"error":{"code":"transport_error","message":"no route to server"}}\n' : '{"error":"the window is not answering"}\n')
  process.exit(1)
}
if (fail === 'empty') { process.stdout.write(bin === 'herdr' ? '{"result":{}}\n' : '{}\n'); process.exit(0) }

const tabs = () => state.spaces.flatMap((s) => s.tabs.map((t) => ({ s, t })))
const findPane = (p) => { for (const { s, t } of tabs()) { const x = t.panes.find((q) => q.pane === p); if (x) return { s, t, x } } return null }
const findTab = (id) => tabs().find(({ t }) => t.id === id) || null
const next = (prefix) => `${prefix}${++state.n}`
/** A new herdr-core terminal, live. */
const terminalOf = () => { const t = next('t'); state.terminals = { ...(state.terminals ?? {}), [t]: 'live' }; return t }
/** Closing a pane ends its terminal: finished, unless it was already removed. */
const finish = (xs) => { for (const x of xs) if (x.terminal && state.terminals?.[x.terminal] === 'live') state.terminals[x.terminal] = 'finished' }
// The lock goes first: the hang-up can reach this very process, when the program it ends is the caller.
const hangUp = (panes) => { unlock(); for (const x of panes) if (x.pid) try { process.kill(-x.pid, 'SIGHUP') } catch { /* already gone */ } }
/** `chmodAfterCreate`: once a pane or tab is created, this directory becomes unwritable (a marker write after it fails). */
const afterCreate = () => { if (state.chmodAfterCreate) try { fs.chmodSync(state.chmodAfterCreate, 0o500) } catch { /* gone */ } }
/** A create's last step: the model saved, then its reply, or with the `after` fault a transport error in its place. */
const created = (reply) => {
  afterCreate(); save()
  if (fail === 'after') { process.stderr.write(bin === 'herdr' ? '{"error":{"code":"transport_error","message":"timed out"}}\n' : '{"error":"the window is not answering"}\n'); process.exit(1) }
  out(reply)
}
const launch = (x, terminal, argv) => {
  if (!state.exec) return
  const pane = x.pane
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('HERDR_') || k === 'HC_TERMINAL_ID' || k === 'TERM_PROGRAM') delete env[k]
  Object.assign(env, terminal ? { HC_TERMINAL_ID: terminal, TERM_PROGRAM: 'ghostty' } : { HERDR_ENV: '1', HERDR_PANE_ID: pane, TERM_PROGRAM: 'herdr' }, { SHELL: '/bin/sh' })
  // DCTR_FAKE_FAIL_IN_PANE: faults that only what runs IN the pane meets (a gate's completion), not the call that made it.
  delete env.DCTR_FAKE_FAIL
  if (env.DCTR_FAKE_FAIL_IN_PANE) env.DCTR_FAKE_FAIL = env.DCTR_FAKE_FAIL_IN_PANE
  const child = spawn(process.execPath, [import.meta.filename, '__supervise', STATE, pane, JSON.stringify(argv), terminal ? '1' : '0'], { detached: true, stdio: 'ignore', env })
  child.unref()
  x.pid = child.pid
}

/** The attach client, for `hc attach` alone. Never returns: the process ends with the client. */
async function attach(t, st) {
  const at = (name) => `${STATE}.${t}.${name}`
  if (!process.stdin.isTTY) { process.stderr.write('error: attach needs a terminal\n'); process.exit(1) }
  fs.writeFileSync(at('size'), `${process.stdout.columns}x${process.stdout.rows}`)
  fs.writeFileSync(at('pid'), String(process.pid))
  if (fail === 'nodetach') process.on('SIGHUP', () => {})
  process.stdin.setRawMode(true)
  process.stdout.write('\x1b]10;?\x1b\\\x1b[c')
  let attached = false
  process.stdin.on('data', (d) => {
    if (!attached) { fs.appendFileSync(at('early'), d); return }
    const end = fail === 'nodetach' ? -1 : d.indexOf(0x1c)
    const text = end < 0 ? d : d.subarray(0, end)
    if (text.length) fs.appendFileSync(at('typed'), text)
    if (fail === 'after') process.exit(1)
    if (end >= 0) process.exit(0)
  })
  await new Promise((r) => setTimeout(r, 300))
  if (st !== 'live') { process.stdin.setRawMode(false); process.stderr.write(`error: no terminal "${t}"\n`); process.exit(3) }
  if (fail === 'output') fs.appendFileSync(process.env.DCTR_FAKE_TEE, '---(more)---')
  if (fail === 'shrink') fs.truncateSync(process.env.DCTR_FAKE_TEE)
  if (fail === 'vanish') fs.rmSync(process.env.DCTR_FAKE_TEE)
  if (fail !== 'hang') { attached = true; process.stdout.write('\x1b[?1004h\x1b[2Jscreen') }
  await new Promise((r) => setTimeout(r, 30000))
  process.kill(process.pid, 'SIGKILL')   // not exit, which waits on a terminal nobody reads any more
  await new Promise(() => {})
}

if (bin === 'herdr') {
  if (fail === 'notfound') notFound(verb.split(' ')[0], args[2] ?? flag('pane'))
  if (verb === 'pane layout') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    const junk = (state.lsJunk ?? []).filter((j) => j.tab === at.t.id).map(() => ({ rect: { height: 10 } }))
    out({ result: { layout: { panes: [...at.t.panes.map((x) => ({ pane_id: x.pane, rect: { height: x.height ?? 10 } })), ...junk] } } })
  }
  if (verb === 'pane split') {
    const at = findPane(args[2])
    if (!at) notFound('pane', args[2])
    const pane = next('P')
    at.t.panes.splice(at.t.panes.indexOf(at.x) + 1, 0, { pane, terminal: null, split: flag('direction'), cwd: flag('cwd') })
    created({ result: { pane: { pane_id: fail === 'noid' ? '' : pane } } })
  }
  if (verb === 'tab create') {
    const s = state.spaces.find((x) => x.id === flag('workspace'))
    if (!s) { process.stderr.write('{"error":{"code":"workspace_not_found"}}\n'); process.exit(1) }
    const tab = next('T'), pane = next('P')
    s.tabs.push({ id: tab, name: flag('label'), panes: [{ pane, terminal: null, cwd: flag('cwd') }] })
    created({ result: { tab: { tab_id: tab }, root_pane: { pane_id: pane } } })
  }
  if (verb === 'pane get') {
    if (!findPane(args[2])) notFound('pane', args[2])
    if (fail === 'blank') out({ result: { pane: { pane_id: args[2], focused: '' } } })
    out({ result: { pane: { pane_id: args[2], focused: state.focus.pane === args[2] } } })
  }
  if (verb === 'tab list') {
    const s = state.spaces.find((x) => x.id === flag('workspace'))
    out({ result: { tabs: (s?.tabs ?? []).map((t) => ({ tab_id: t.id, focused: fail === 'blank' ? '' : state.focus.tab === t.id, label: t.name })) } })
  }
  if (verb === 'tab get') { if (!findTab(args[2])) notFound('tab', args[2]); out({ result: { tab: { tab_id: args[2] } } }) }
  if (verb === 'pane close') {
    const at = findPane(args[2])
    if (!at) notFound('pane', args[2])
    at.t.panes.splice(at.t.panes.indexOf(at.x), 1)
    if (!at.t.panes.length) at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    save(); hangUp([at.x]); out({ result: {} })
  }
  if (verb === 'tab close') {
    const at = findTab(args[2])
    if (!at) notFound('tab', args[2])
    at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    save(); hangUp(at.t.panes); out({ result: {} })
  }
  if (verb === 'pane rename') { const at = findPane(args[2]); if (!at) notFound('pane', args[2]); at.x.name = args[3]; save(); out({ result: {} }) }
  if (verb === 'tab rename') { const at = findTab(args[2]); if (!at) notFound('tab', args[2]); at.t.name = args[3]; save(); out({ result: {} }) }
  if (verb === 'pane run') {
    const at = findPane(args[2])
    if (!at) notFound('pane', args[2])
    at.x.ran = [...(at.x.ran ?? []), args[3]]
    launch(at.x, null, ['sh', '-c', args[3]]); save(); out({ result: {} })
  }
  if (verb === 'pane process-info') {
    if (!findPane(flag('pane'))) notFound('pane', flag('pane'))
    out({ result: { process_info: { foreground_processes: [{ name: state.recorderGone ? 'zsh' : 'script' }] } } })
  }
  out({ result: {} })   // report-agent, send-text, send-keys: accepted
}

if (bin === 'herdr-app') {
  if (fail === 'notfound') notFound(args[1]?.split('.')[0] ?? 'pane', flag('pane') ?? flag('id'))
  // `lsJunk` puts an incomplete entry in the listing: a terminal with no pane in tab `tab`, or (tab: null) a tab with no id
  // listing the panes `panes` names in place of their own tab, ({ nopane: P }) pane P's terminal listed with no pane, or
  // ({ noid: X }) space or tab X listed with no id.
  if (verb === 'ls') {
    const junk = state.lsJunk ?? []
    const noid = new Set(junk.map((j) => j.noid).filter(Boolean)), idOf = (x) => (noid.has(x) ? undefined : x)
    const moved = new Set(junk.flatMap((j) => j.panes ?? [])), hidden = new Set(junk.map((j) => j.nopane).filter(Boolean))
    const row = (x) => (hidden.has(x.pane) ? { terminal: x.terminal } : { terminal: x.terminal, pane: x.pane })
    out({ spaces: state.spaces.map((s, i) => ({ id: idOf(s.id), name: s.name, tabs: [...s.tabs.map((t) => ({ id: idOf(t.id), name: t.name,
      terminals: [...t.panes.filter((x) => !moved.has(x.pane)).map(row), ...junk.filter((j) => j.tab === t.id).map(() => ({ terminal: 't999' }))] })),
    ...(i === 0 ? junk.filter((j) => j.tab === null).map((j) => ({ name: 'no id', terminals: (j.panes ?? []).map((p) => row(findPane(p).x)) })) : [])] })) })
  }
  if (fail === 'blank' && verb === 'status') out({ space: '', tab: '', focused_pane: '' })
  if (verb === 'status') out({ space: state.spaces.find((s) => s.tabs.some((t) => t.id === state.focus.tab))?.id ?? null, tab: state.focus.tab, focused_pane: state.focus.pane })
  if (verb === 'do pane.split') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    const pane = next('P'), terminal = terminalOf(), argv = JSON.parse(flag('argv'))
    const x = { pane, terminal, split: flag('direction'), argv }
    at.t.panes.splice(at.t.panes.indexOf(at.x) + 1, 0, x)
    if (state.splitFocuses) state.focus = { tab: at.t.id, pane }
    launch(x, terminal, argv); created({ pane: fail === 'noid' ? '' : pane, terminal })
  }
  if (verb === 'do tab.new') {
    const s = state.spaces.find((x) => x.id === flag('space'))
    if (!s) out({ error: `no space "${flag('space')}"` })
    const tab = next('T'), pane = next('P'), terminal = terminalOf(), argv = JSON.parse(flag('argv'))
    const x = { pane, terminal, argv, cwd: flag('folder') }
    s.tabs.push({ id: tab, name: flag('name'), panes: [x], focusArg: flag('focus') })
    launch(x, terminal, argv); created({ space: s.id, tab: fail === 'noid' ? '' : tab, terminal })
  }
  if (verb === 'do pane.close') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    at.t.panes.splice(at.t.panes.indexOf(at.x), 1)
    if (!at.t.panes.length) at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    finish([at.x])
    save(); hangUp([at.x]); out({ ok: true })
  }
  if (verb === 'do tab.close') {
    const at = findTab(flag('id'))
    if (!at) notFound('tab', flag('id'))
    at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    finish(at.t.panes)
    save(); hangUp(at.t.panes); out({ ok: true })
  }
  // Measured: park takes the pane out of the window and leaves its terminal running.
  if (verb === 'do terminal.park') {
    const at = tabs().map(({ s, t }) => ({ s, t, x: t.panes.find((q) => q.terminal === flag('terminal')) })).find((q) => q.x)
    if (!at) notFound('terminal', flag('terminal'))
    at.t.panes.splice(at.t.panes.indexOf(at.x), 1)
    if (!at.t.panes.length) at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    save(); out({ ok: true })
  }
  if (verb === 'do tab.rename') { const at = findTab(flag('id')); if (!at) notFound('tab', flag('id')); at.t.name = flag('name'); save(); out({ ok: true }) }
  if (verb === 'do pane.focus') { const at = findPane(flag('pane')); if (!at) notFound('pane', flag('pane')); state.focus = { tab: at.t.id, pane: at.x.pane }; save(); out({ ok: true }) }
  out({ error: `unknown command ${verb}` })
}

// hc, over the terminals' lifecycle. Errors as the manual gives them: {error: {kind, message}} on stderr, exit 3 for
// not_found; a live terminal is refused by rm (exit 11 is `finished`'s code, so a live one gets a generic 1).
if (bin === 'hc') {
  const t = args[1], st = () => JSON.parse(fs.readFileSync(STATE, 'utf8')).terminals?.[t]
  const err = (kind, code) => { process.stderr.write(`${JSON.stringify({ error: { kind, message: `${kind}: ${t}` } })}\n`); process.exit(code) }
  if (args[0] === 'get') {
    const now = st()
    if (!now || now === 'removed') err('not_found', 3)
    const x = tabs().flatMap(({ t: tab }) => tab.panes).find((p) => p.terminal === t)
    const foreground = now === 'live' ? { argv: state.recorderGone || !x?.argv ? ['/bin/zsh', '-l'] : x.argv } : undefined
    const late = state.lag?.shift()
    if (late) save()
    if (late) out({ address: t, state: now, cols: 132, rows: 43, ...(late === 'shell' ? { foreground: { argv: ['/bin/zsh', '-lic', '"$@"; exec "$0" -li', '/bin/zsh', ...(x?.argv ?? [])] } } : {}) })
    out({ address: t, state: now, cols: 132, rows: 43, foreground, ...(state.hcGet ?? {}) })
  }
  if (args[0] === 'attach') await attach(t, st())
  if (args[0] === 'wait') {
    const until = Date.now() + 20000
    while (st() === 'live' && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    if (!st()) err('not_found', 3)
    out({ terminal: t, state: st() })
  }
  if (args[0] === 'rm') {
    const now = st()
    if (!now || now === 'removed') err('not_found', 3)
    if (now === 'live') err('still_running', 1)
    state.terminals[t] = 'removed'; save(); out({ ok: true })
  }
  out({ ok: true })
}
}
