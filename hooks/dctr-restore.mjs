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
// It always exits 0 and calls no herdr and nothing on the network. Every reason it stood down is printed
// to stderr and logged, so a skip and a silent success are never the same signal. The decisions are pure,
// in dctr-lib.mjs and dctr-record.mjs; this file holds only the reads around them.

import fs from 'node:fs'
import path from 'node:path'
import { restoreSkip, kickoffHandoff, handoffHeader, resolveRecordPath, restoreContext, restoreState, PREFIX } from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'
import { hookLog } from './dctr-state.mjs'

let sessionId = null
const stand_down = (why) => {
  hookLog(sessionId, `SessionStart restore skipped — ${why}`)
  process.stderr.write(`${PREFIX}: restore skipped — ${why}\n`)
  process.exit(0)
}
const read = (file, what) => {
  try { return fs.readFileSync(file, 'utf8') } catch (e) { stand_down(`could not read the ${what} ${file} (${e.code || e.message})`) }
}

try {
  let payload
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { stand_down('hook payload was not readable JSON') }
  sessionId = payload.session_id || null
  const why = restoreSkip(payload)
  if (why) stand_down(why)

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd
  if (!projectDir) stand_down('no CLAUDE_PROJECT_DIR and no cwd in the payload')

  const memory = read(path.join(projectDir, 'SESSION_MEMORY.md'), 'memory file')
  const handoffRef = kickoffHandoff(memory)
  if (!handoffRef) stand_down('the kickoff names no handoff')
  const handoffPath = path.resolve(projectDir, handoffRef)
  const header = handoffHeader(read(handoffPath, 'handoff'))
  if (!header.record) stand_down(`the handoff ${handoffPath} names no record`)

  const recordPath = resolveRecordPath(header.record, projectDir, fs.existsSync)
  if (!recordPath) stand_down(`the record ${header.record} named by ${handoffPath} was not found`)
  const record = parseRecord(read(recordPath, 'record'))
  const state = restoreState(record.state?.value)
  if (!state) stand_down(`the record ${recordPath} last state line reads ${record.state ? `"${record.state.value}"` : 'nothing'}, not Open or Blocked`)

  const additionalContext = restoreContext({
    phase: header.phase, state, stateLine: record.state.raw, recordPath,
    wrapper: record.wrapper || header.wrapper, handoffPath,
  })
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }))
  hookLog(sessionId, `SessionStart restore injected — ${header.phase || 'unnamed phase'} ${state}, record ${recordPath}`)
  process.exit(0)
} catch (e) {
  stand_down(`hook error (${String(e?.message || e).split('\n')[0]})`)
}
