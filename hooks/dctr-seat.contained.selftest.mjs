// Behavioral tamper test for the CONTAINED posture (Scott's containment ruling, 2026-09-01).
//
//   node hooks/dctr-seat.contained.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// The pure selftest covers the request-path/token functions. This one covers the guarantee those
// functions exist to serve and that no pure test can reach: a contained agent (DCTR_VIEW_REQUEST_DIR
// set) drives the hook to write a request file and call herdr ZERO times — the container must reach
// nothing on the host. It proves the negative by putting a tripwire `herdr` first on PATH: if the
// hook ever execs herdr, the tripwire fires and the run fails. A pure assertion cannot catch a
// process the code should never spawn; this can.

// A herdr-core terminal running the suite would hand every child its HC_TERMINAL_ID, and termHost would read herdr-core where a clause means a herdr TUI pane or no host.
delete process.env.HC_TERMINAL_ID
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const hook = path.join(import.meta.dirname, 'dctr-seat.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-contained-'))
const bridge = path.join(tmp, 'bridge'); fs.mkdirSync(bridge)
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const tripwire = path.join(tmp, 'herdr-was-called')

// A `herdr` earlier on PATH than the real one, and herdr-core's `hc` and `herdr-app` beside it (issue #111): if the
// hook execs any of the three, the tripwire appears.
for (const name of ['herdr', 'hc', 'herdr-app']) {
  fs.writeFileSync(path.join(bin, name), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
  fs.chmodSync(path.join(bin, name), 0o755)
}

const AGENT_ID = 'ad1a7dbb0d453a08d'
const run = (event) => execFileSync('node', [hook], {
  input: JSON.stringify({
    hook_event_name: event, session_id: 's1', agent_id: AGENT_ID, agent_type: 'Explore',
    transcript_path: '/home/u/.claude/projects/-p/sess.jsonl',
  }),
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DCTR_VIEW_REQUEST_DIR: bridge, HERDR_ENV: '', HERDR_WORKSPACE_ID: '' },
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
})

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const reqFile = path.join(bridge, `view-${AGENT_ID}.json`)

run('SubagentStart')
clause('clause A — SubagentStart writes exactly the seat\'s request file',
  fs.existsSync(reqFile) && fs.readdirSync(bridge).length === 1,
  fs.readdirSync(bridge).join(','))

const req = JSON.parse(fs.readFileSync(reqFile, 'utf8'))
clause('clause B — the request carries the four fields and the transcript is the seat\'s',
  ['container_id', 'renderer_path', 'transcript_path', 'role'].every((k) => k in req) &&
  req.transcript_path.includes(AGENT_ID) && req.renderer_path.endsWith('/dctr-render.mjs'),
  JSON.stringify(req))

clause('clause C — the contained hook called herdr ZERO times (the containment guarantee)',
  !fs.existsSync(tripwire),
  'the tripwire herdr on PATH fired: a contained agent reached the host')

run('SubagentStop')
clause('clause D — SubagentStop removes the request and still never calls herdr',
  !fs.existsSync(reqFile) && !fs.existsSync(tripwire),
  `req exists: ${fs.existsSync(reqFile)}, tripwire: ${fs.existsSync(tripwire)}`)

// A parent event (no agent_id) must write nothing and call nothing.
try {
  execFileSync('node', [hook], {
    input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 's1', transcript_path: '/x' }),
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DCTR_VIEW_REQUEST_DIR: bridge, HERDR_ENV: '' },
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })
} catch { /* stand_down exits 0; nothing to catch, but be safe */ }
clause('clause E — a parent event in contained mode writes nothing and calls nothing',
  fs.readdirSync(bridge).length === 0 && !fs.existsSync(tripwire),
  fs.readdirSync(bridge).join(','))

// The same guarantee from a herdr-core terminal, where the seat hook and the gate launcher now place panes: contained,
// they still reach no host of either kind. The gate's check still runs, detached.
const CORE = { HC_TERMINAL_ID: 't7', TERM_PROGRAM: 'ghostty' }
execFileSync('node', [hook], {
  input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 's2', agent_id: AGENT_ID, agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-p/sess.jsonl' }),
  env: { ...process.env, ...CORE, PATH: `${bin}:${process.env.PATH}`, DCTR_VIEW_REQUEST_DIR: bridge, HERDR_ENV: '' }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
})
const out = path.join(tmp, 'gate.out')
execFileSync('node', [path.join(import.meta.dirname, 'dctr-gate.mjs'), 'g', out, '--', 'true'], {
  env: { ...process.env, ...CORE, PATH: `${bin}:${process.env.PATH}`, DCTR_VIEW_REQUEST_DIR: bridge, HERDR_ENV: '', CLAUDE_CODE_SESSION_ID: 's2', TMPDIR: tmp }, encoding: 'utf8',
})
const until = Date.now() + 8000
while (!fs.existsSync(`${out}.result`) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
clause('clause F — in herdr-core, contained, the seat hook writes its request and the gate runs detached, and neither calls herdr, hc or herdr-app',
  fs.existsSync(reqFile) && fs.existsSync(`${out}.result`) && !fs.existsSync(tripwire),
  `req: ${fs.existsSync(reqFile)}, result: ${fs.existsSync(`${out}.result`)}, tripwire: ${fs.existsSync(tripwire)}`)
fs.rmSync(reqFile, { force: true })
const fired = (name) => { fs.rmSync(tripwire, { force: true }); execFileSync(path.join(bin, name)); const was = fs.existsSync(tripwire); fs.rmSync(tripwire, { force: true }); return was }
clause('clause 3F — each of the three tripwires really fires when run, proved without the hook', ['herdr', 'hc', 'herdr-app'].every(fired), '')

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(bad ? 1 : 0)
