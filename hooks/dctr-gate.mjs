// Runs a long native check where the user can watch it (issue #17's gap, found 2026-09-05).
//
//   node hooks/dctr-gate.mjs <label> <out-file> -- <command...>
//
// Run by the doctrine orchestrator at step 3 for a check that will outrun the Bash tool's own
// ceiling — a full mutation gate is the known case. Inside herdr the check runs in a pane placed
// beside the session under the same rules, cap and lock as a seat, so a wave arriving mid-gate
// stacks next to it. Outside herdr the check runs detached from the harness with the same output
// file. Either way the output file ends with `exit=N` when the check is done; that line is the
// completion signal to monitor and the exit status to record. The pane is display; the file is the
// record. It exits 0 once the check is launched, 1 only on malformed arguments, and the check's
// own status is in the file — a display failure must never fail the gate it is showing.
//
// The pane runs this same script in `--run` mode, which is also what the detached path runs:
//
//   node hooks/dctr-gate.mjs --run <out> <marker> <pane-id|''> <label> -- <command>

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  PREFIX, GATE_ROLE, agentName, tabLabel, skipReason, nextIndex, stopAction, tabCreateArgs,
  seatPlacement, splitArgs, staleSideSeats, gateRunCommand, exitLine,
} from './dctr-lib.mjs'
import { seatsDir, herdr, liveSeats, withPlacementLock } from './dctr-state.mjs'

const self = path.resolve(process.argv[1])
const argv = process.argv.slice(2)
const usage = () => {
  console.error('usage: node dctr-gate.mjs <label> <out-file> -- <command...>')
  process.exit(1)
}

if (argv[0] === '--run') {
  // Inside the pane, or detached. Run the check, tee, mark the exit, tidy the pane.
  const [, out, marker, paneId, label] = argv
  const dash = argv.indexOf('--')
  if (dash < 0 || !out || !label) usage()
  const command = argv.slice(dash + 1).join(' ')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const file = fs.openSync(out, 'w')
  const both = (chunk) => { fs.writeSync(file, chunk); try { process.stdout.write(chunk) } catch { /* no terminal on the detached path */ } }
  both(`\x1b[2m── doctrine gate · ${label}\x1b[0m\n$ ${command}\n`)
  const child = spawn('bash', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', both)
  child.stderr.on('data', both)
  child.on('close', (code) => {
    both(`${exitLine(code)}\n`)
    fs.closeSync(file)
    // The marker goes before the pane: closing the pane kills the shell this process runs in, so
    // nothing after that call is guaranteed to run (the first live run left a marker behind).
    if (marker) try { fs.rmSync(marker, { force: true }) } catch { /* nothing to undo */ }
    if (paneId) {
      // Same rule as a seat's stop: leave the pane if someone is looking at it, close it otherwise.
      let pane
      try { pane = herdr(['pane', 'get', paneId]).result.pane } catch { /* gone */ }
      if (stopAction(pane) === 'relabel') try { herdr(['pane', 'rename', paneId, `${label} · ${exitLine(code)}`]) } catch { /* label only */ }
      else try { herdr(['pane', 'close', paneId]) } catch { /* already gone */ }
    }
    process.exit(code ?? 1)
  })
} else {
  const dash = argv.indexOf('--')
  const [label, out] = argv
  if (dash !== 2 || !label || !out || argv.length < 4) usage()
  const command = argv.slice(dash + 1).join(' ')
  const outFile = path.resolve(out)
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID

  const detached = (reason) => {
    const child = spawn('node', [self, '--run', outFile, '', '', label, '--', command], { detached: true, stdio: 'ignore' })
    child.unref()
    console.log(`${PREFIX}-gate: no pane (${reason}) — running detached, pid ${child.pid}; output ${outFile}, done when its last line is exit=N`)
    process.exit(0)
  }

  // Contained posture first, as in the hook: a contained agent must reach nothing on the host, and
  // the pane a herdr server spawns is a host process. The check still runs, detached.
  const reason = (process.env.DCTR_VIEW_REQUEST_DIR ? 'contained session (DCTR_VIEW_REQUEST_DIR set), no host pane' : null) ??
    skipReason(process.env) ??
    (process.env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID in the environment') ??
    (sessionId ? null : 'no CLAUDE_CODE_SESSION_ID in the environment')
  if (reason) detached(reason)

  let placed
  try {
    fs.mkdirSync(seatsDir(sessionId), { recursive: true })
    placed = withPlacementLock(sessionId, () => {
      let layout = null
      try { layout = herdr(['pane', 'layout', '--pane', process.env.HERDR_PANE_ID]).result.layout.panes } catch { /* newest stands in */ }
      let seats = liveSeats(sessionId)
      for (const s of staleSideSeats(seats, layout)) {
        try { fs.rmSync(path.join(seatsDir(sessionId), `${s.agent}.json`), { force: true }) } catch { /* best effort */ }
      }
      seats = seats.filter((s) => !staleSideSeats([s], layout).length)
      const taken = seats.map((s) => s.agent)
      let n = nextIndex(GATE_ROLE, taken)
      let marker = null, name = null
      while (n && !marker) {
        name = agentName(GATE_ROLE, n)
        try {
          marker = path.join(seatsDir(sessionId), `${name}.json`)
          fs.writeFileSync(marker, '{}', { flag: 'wx' })
        } catch { marker = null; n += 1 }
      }
      if (!marker) throw new Error('could not allocate a gate name')

      let tabId = null, paneId = null
      try {
        if (seatPlacement(seats, process.env.HERDR_PANE_ID) === 'pane') {
          try { paneId = herdr(splitArgs(seats, process.env.HERDR_PANE_ID, layout)).result.pane.pane_id }
          catch { try { paneId = herdr(splitArgs([], process.env.HERDR_PANE_ID)).result.pane.pane_id } catch { paneId = null } }
        }
        if (!paneId) {
          const tab = herdr(tabCreateArgs(process.env.HERDR_WORKSPACE_ID, tabLabel(GATE_ROLE, n)))
          tabId = tab.result.tab.tab_id
          paneId = tab.result.root_pane.pane_id
        }
        fs.writeFileSync(marker, JSON.stringify({ agent: name, role: GATE_ROLE, n, tabId, paneId, file: outFile, label }))
        herdr(['pane', 'run', paneId, gateRunCommand(self, outFile, marker, paneId, label, command)])
      } catch (e) {
        try { fs.rmSync(marker, { force: true }) } catch { /* nothing to undo */ }
        if (paneId) try { herdr(tabId ? ['tab', 'close', tabId] : ['pane', 'close', paneId]) } catch { /* already gone */ }
        throw e
      }
      return { name, paneId, tabId }
    })
  } catch (e) {
    detached(`herdr refused — ${String(e.message).split('\n')[0]}`)
  }
  console.log(`${PREFIX}-gate: ${placed.name} running in ${placed.tabId ? 'tab ' + placed.tabId : 'pane ' + placed.paneId}; output ${outFile}, done when its last line is exit=N`)
}
