// doctrine — session restore hook (E8-D1, E8-D1b).
//
// SessionStart, matcher `clear` in hooks.json. When the user clears a session while a doctrine phase is
// open, this hands the new session the facts it needs to resume the phase: the phase name, the record's
// path, the record's last state line, the wrapper and the current handoff. It follows the chain the
// continuity skills write: SESSION_MEMORY.md at the project root, its kickoff's `handoff:` line, that
// handoff's `record:` header line, and the record itself, which is the authority for phase state.
//
// It injects only when the record's last state line reads Open or Blocked (scope choice SC1). Every other
// case prints nothing to stdout, so the session starts exactly as it would without the plugin.
//
// When it injected and HERDR_PANE_ID is set, it also writes the restore file `<autocycle dir>/pane-<token>.restored`
// carrying the new session id and transcript path, which the auto-cycle typer waits for before it types the resume
// line (B5, E8-D15). It always exits 0 and calls no herdr and nothing on the network. Every reason it stood down is printed
// to stderr and logged, so a skip and a silent success are never the same signal. The decisions are pure,
// in dctr-lib.mjs and dctr-record.mjs; this file holds only the reads around them.

import fs from 'node:fs'
import { restoreSkip, followKickoff, restoreContext } from './dctr-lib.mjs'
import { hookLog, standDown, restoreFile, writeMarker } from './dctr-state.mjs'

let sessionId = null
const stand_down = standDown('SessionStart', 'restore', () => sessionId)

try {
  let payload
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { stand_down('hook payload was not readable JSON') }
  sessionId = payload.session_id || null
  const why = restoreSkip(payload)
  if (why) stand_down(why)

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd
  if (!projectDir) stand_down('no CLAUDE_PROJECT_DIR and no cwd in the payload')
  const chain = followKickoff({ projectDir, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
  if (chain.why) stand_down(chain.why)
  const { header, handoffPath, recordPath, record, state } = chain

  const additionalContext = restoreContext({
    phase: header.phase, state, stateLine: record.state.raw, recordPath,
    wrapper: record.wrapper || header.wrapper, handoffPath,
  })
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }))
  if (process.env.HERDR_PANE_ID) {
    try {
      writeMarker(restoreFile(process.env.HERDR_PANE_ID), { session_id: sessionId, transcript_path: payload.transcript_path || null })
    } catch (e) { hookLog(sessionId, `SessionStart restore file not written (${e.code || e.message})`) }
  }
  hookLog(sessionId, `SessionStart restore injected — ${header.phase || 'unnamed phase'} ${state}, record ${recordPath}`)
  process.exit(0)
} catch (e) {
  stand_down(`hook error (${String(e?.message || e).split('\n')[0]})`)
}
