// Behavioral tamper test for the orchestrator's pause notification on Codex (E8-D19 through E10's table), per
// CLAUDE.md's three clauses.
//
//   node hooks/dctr-notify.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Drives hooks/dctr-notify.mjs as the command the Codex reference names, with a logging `herdr` shim first on PATH.
// Clause 1 confirms each stand-down and each malformed call makes zero herdr calls; clause 2 confirms a session in a
// herdr pane makes exactly one `herdr notification show` whose title is the hub's pause text and which carries no
// --body; clause 3 proves the shim logs what it is given and that each stand-down fixture lacks what the send needs,
// without running the command.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

let bad = 0
// A throw outside a clause (a mutated function called while deriving a clause's input) is a FAIL line naming the
// last clause that ran, never an exit with no verdict, which the mutation gate cannot judge (E10H-B8).
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const cmd = path.join(import.meta.dirname, 'dctr-notify.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-notify-'))
// Removed at every exit, pass, fail or throw (E10H-R3-B3).
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const log = path.join(tmp, 'herdr.log')
// One JSON array of argv per call; exits with $SHIM_EXIT so a refusal can be staged.
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
require('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')
if (process.env.SHIM_EXIT) { process.stderr.write('herdr: refused by the shim'); process.exit(Number(process.env.SHIM_EXIT)) }
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const calls = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }

const base = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
for (const k of ['HERDR_ENV', 'HERDR_WORKSPACE_ID', 'HERDR_PANE_ID', 'DCTR_VIEW_REQUEST_DIR', 'SHIM_EXIT']) delete base[k]
const inHerdr = { ...base, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'wFX', HERDR_PANE_ID: 'wFX:p3' }
const run = (args, env) => { fs.rmSync(log, { force: true }); const r = spawnSync('node', [cmd, ...args], { env, encoding: 'utf8' }); return { ...r, calls: calls() } }

const PHASE = 'e10-fixture', REASON = 'round alarm fired, ruling needed'
const BLOCKED = 'phase Blocked: Blocked. Q2 open: which host runs the drive?'

// ---------------------------------------------------------------- clause 2: a session in a herdr pane

const sent = run([PHASE, REASON], inHerdr)
clause('clause 2a — in a herdr pane: exit 0 and exactly one herdr call, `notification show <phase>: doctrine auto-cycle paused, <reason>`',
  sent.status === 0 && sent.calls.length === 1 && sent.calls[0][0] === 'notification' && sent.calls[0][1] === 'show' &&
    sent.calls[0][2] === `${PHASE}: doctrine auto-cycle paused, ${REASON}`, JSON.stringify({ status: sent.status, calls: sent.calls, out: sent.stdout, err: sent.stderr }))
clause('clause 2b — the call carries no --body, so the title is the whole text (E8-D19: that text and nothing more)',
  sent.calls.length === 1 && !sent.calls[0].includes('--body') && sent.calls[0].slice(3).every((a) => a.startsWith('--') || ['none', 'done', 'request'].includes(a)), JSON.stringify(sent.calls))
const split = run([PHASE, ...BLOCKED.split(' ')], inHerdr)
const quoted = run([PHASE, BLOCKED], inHerdr)
clause('clause 2c — a reason given as several words, or as one quoted argument, reaches the title the same, colons and all',
  split.calls.length === 1 && quoted.calls.length === 1 && split.calls[0][2] === `${PHASE}: doctrine auto-cycle paused, ${BLOCKED}` && quoted.calls[0][2] === split.calls[0][2],
  JSON.stringify([split.calls, quoted.calls]))
const refusedRun = run([PHASE, REASON], { ...inHerdr, SHIM_EXIT: '3' })
clause('clause 2d — herdr refusing is reported and exits 1, so the orchestrator knows to say it in its turn',
  refusedRun.status === 1 && refusedRun.calls.length === 1 && /herdr refused/.test(refusedRun.stdout + refusedRun.stderr), JSON.stringify(refusedRun))

// ---------------------------------------------------------------- clause 1: stand-downs and malformed calls

const standDowns = {
  'contained (DCTR_VIEW_REQUEST_DIR set, even inside herdr with a pane)': { ...inHerdr, DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'requests') },
  'outside herdr (HERDR_ENV unset)': { ...inHerdr, HERDR_ENV: undefined },
  'no HERDR_WORKSPACE_ID': { ...inHerdr, HERDR_WORKSPACE_ID: undefined },
  'no HERDR_PANE_ID': { ...inHerdr, HERDR_PANE_ID: undefined },
}
const clean = (e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined))
for (const [name, env] of Object.entries(standDowns)) {
  const r = run([PHASE, REASON], clean(env))
  clause(`clause 1 — ${name}: stands down with exit 0, says why, and calls herdr ZERO times`,
    r.status === 0 && r.calls.length === 0 && /standing down/.test(r.stdout), JSON.stringify({ status: r.status, calls: r.calls, out: r.stdout }))
}
for (const [name, args] of Object.entries({ 'no arguments': [], 'a phase and no reason': [PHASE], 'an empty reason': [PHASE, ''], 'an empty phase': ['', REASON] })) {
  const r = run(args, inHerdr)
  clause(`clause 1 — ${name}: usage error exit 2, and calls herdr ZERO times`, r.status === 2 && r.calls.length === 0, JSON.stringify({ status: r.status, calls: r.calls }))
}

// ---------------------------------------------------------------- clause 3: the fixtures, without the command

fs.rmSync(log, { force: true })
spawnSync('herdr', ['probe', 'a b'], { env: base })
clause('clause 3a — the shim first on PATH logs each call\'s argv exactly, so zero logged calls means zero calls',
  JSON.stringify(calls()) === '[["probe","a b"]]', JSON.stringify(calls()))
clause('clause 3b — each stand-down fixture differs from the sending one only in the variable it names',
  Object.values(standDowns).every((e) => [...new Set([...Object.keys(inHerdr), ...Object.keys(e)])].filter((k) => e[k] !== inHerdr[k]).length === 1), 'a fixture changes more than one variable')

console.log(bad ? `\n${bad} FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
