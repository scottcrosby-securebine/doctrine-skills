// A fake host for the selftests: one model of spaces, tabs, panes and terminals answering as `herdr` (the TUI),
// `herdr-app` and `hc` (herdr-core), in the reply shapes measured on herdr 0.9.5 and hc 0.1.21 (dctr-host.mjs's
// header lists them). The suite links this file into a bin directory under all three names; argv[1]'s base name says
// which CLI is being played. Not a hook, never loaded by one.
//
//   DCTR_FAKE_STATE  the model, JSON, rewritten whole by rename after every change
//   DCTR_FAKE_CALLS  one JSON line per call, {bin, args}, appended
//   DCTR_FAKE_FAIL   JSON {"<bin> <verb>": "transport" | "notfound" | "empty"}: that call fails as a transport error, answers
//                    not-found in its CLI's own shape, or answers with an empty reply. The verb is the first two words of a
//                    herdr call (`pane get`), the first word of a herdr-app call (`ls`), or `do <command>` (`do pane.close`)
//
// The model: { spaces: [{ id, name, tabs: [{ id, name, panes: [{ pane, terminal, name? }] }] }], focus: { tab, pane },
// n, exec, splitFocuses }. `exec` runs every created pane's command (sh -c) detached in an environment that pane would
// have: a TUI pane's HERDR_ENV and HERDR_PANE_ID, a herdr-core terminal's HC_TERMINAL_ID. A close hangs up that
// command's process group, as closing a real pane hangs up its terminal, so whatever the pane ran dies with it unless
// it detached. `splitFocuses` makes a herdr-app split take the window's focus, which herdr-app's manual leaves unsaid.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const bin = path.basename(process.argv[2])
const args = process.argv.slice(3)
const STATE = process.env.DCTR_FAKE_STATE
fs.appendFileSync(process.env.DCTR_FAKE_CALLS, `${JSON.stringify({ bin, args })}\n`)
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
const hangUp = (panes) => { for (const x of panes) if (x.pid) try { process.kill(-x.pid, 'SIGHUP') } catch { /* already gone */ } }
const launch = (x, terminal, argv) => {
  if (!state.exec) return
  const pane = x.pane
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('HERDR_') || k === 'HC_TERMINAL_ID' || k === 'TERM_PROGRAM') delete env[k]
  Object.assign(env, terminal ? { HC_TERMINAL_ID: terminal, TERM_PROGRAM: 'ghostty' } : { HERDR_ENV: '1', HERDR_PANE_ID: pane, TERM_PROGRAM: 'herdr' })
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore', env })
  child.unref()
  x.pid = child.pid
}

if (bin === 'herdr') {
  if (fail === 'notfound') notFound(verb.split(' ')[0], args[2] ?? flag('pane'))
  if (verb === 'pane layout') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    out({ result: { layout: { panes: at.t.panes.map((x) => ({ pane_id: x.pane, rect: { height: x.height ?? 10 } })) } } })
  }
  if (verb === 'pane split') {
    const at = findPane(args[2])
    if (!at) notFound('pane', args[2])
    const pane = next('P')
    at.t.panes.splice(at.t.panes.indexOf(at.x) + 1, 0, { pane, terminal: null, split: flag('direction'), cwd: flag('cwd') })
    save(); out({ result: { pane: { pane_id: pane } } })
  }
  if (verb === 'tab create') {
    const s = state.spaces.find((x) => x.id === flag('workspace'))
    if (!s) { process.stderr.write('{"error":{"code":"workspace_not_found"}}\n'); process.exit(1) }
    const tab = next('T'), pane = next('P')
    s.tabs.push({ id: tab, name: flag('label'), panes: [{ pane, terminal: null, cwd: flag('cwd') }] })
    save(); out({ result: { tab: { tab_id: tab }, root_pane: { pane_id: pane } } })
  }
  if (verb === 'pane get') {
    if (!findPane(args[2])) notFound('pane', args[2])
    out({ result: { pane: { pane_id: args[2], focused: state.focus.pane === args[2] } } })
  }
  if (verb === 'tab list') {
    const s = state.spaces.find((x) => x.id === flag('workspace'))
    out({ result: { tabs: (s?.tabs ?? []).map((t) => ({ tab_id: t.id, focused: state.focus.tab === t.id, label: t.name })) } })
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
  out({ result: {} })   // report-agent, send-keys: accepted
}

if (bin === 'herdr-app') {
  if (fail === 'notfound') notFound(args[1]?.split('.')[0] ?? 'pane', flag('pane') ?? flag('id'))
  if (verb === 'ls') out({ spaces: state.spaces.map((s) => ({ id: s.id, name: s.name, tabs: s.tabs.map((t) => ({ id: t.id, name: t.name, terminals: t.panes.map((x) => ({ terminal: x.terminal, pane: x.pane })) })) })) })
  if (verb === 'status') out({ space: state.spaces.find((s) => s.tabs.some((t) => t.id === state.focus.tab))?.id ?? null, tab: state.focus.tab, focused_pane: state.focus.pane })
  if (verb === 'do pane.split') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    const pane = next('P'), terminal = next('t'), argv = JSON.parse(flag('argv'))
    const x = { pane, terminal, split: flag('direction'), argv }
    at.t.panes.splice(at.t.panes.indexOf(at.x) + 1, 0, x)
    if (state.splitFocuses) state.focus = { tab: at.t.id, pane }
    launch(x, terminal, argv); save(); out({ pane, terminal })
  }
  if (verb === 'do tab.new') {
    const s = state.spaces.find((x) => x.id === flag('space'))
    if (!s) out({ error: `no space "${flag('space')}"` })
    const tab = next('T'), pane = next('P'), terminal = next('t'), argv = JSON.parse(flag('argv'))
    const x = { pane, terminal, argv, cwd: flag('folder') }
    s.tabs.push({ id: tab, name: flag('name'), panes: [x], focusArg: flag('focus') })
    launch(x, terminal, argv); save(); out({ space: s.id, tab, terminal })
  }
  if (verb === 'do pane.close') {
    const at = findPane(flag('pane'))
    if (!at) notFound('pane', flag('pane'))
    at.t.panes.splice(at.t.panes.indexOf(at.x), 1)
    if (!at.t.panes.length) at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    state.finished = [...(state.finished ?? []), at.x.terminal]
    save(); hangUp([at.x]); out({ ok: true })
  }
  if (verb === 'do tab.close') {
    const at = findTab(flag('id'))
    if (!at) notFound('tab', flag('id'))
    at.s.tabs.splice(at.s.tabs.indexOf(at.t), 1)
    state.finished = [...(state.finished ?? []), ...at.t.panes.map((x) => x.terminal)]
    save(); hangUp(at.t.panes); out({ ok: true })
  }
  if (verb === 'do tab.rename') { const at = findTab(flag('id')); if (!at) notFound('tab', flag('id')); at.t.name = flag('name'); save(); out({ ok: true }) }
  if (verb === 'do pane.focus') { const at = findPane(flag('pane')); if (!at) notFound('pane', flag('pane')); state.focus = { tab: at.t.id, pane: at.x.pane }; save(); out({ ok: true }) }
  out({ error: `unknown command ${verb}` })
}

// hc: `wait` answers at once and `rm` records the removal; the log is what a clause reads.
if (bin === 'hc') out({ ok: true })
