// STUB for seat H1; seat H2 ships the real file
//
// Exports only what dctr-gauge.mjs imports, with the semantics spec seam S2 names: the per-session bridge file
// path (SC6) and a reader that returns the record only when its session_id is the caller's.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const bridgeFile = (sessionId) => path.join(process.env.TMPDIR || os.tmpdir(), `dctr-${sessionId}`, 'bridge.json')

export function readBridge(sessionId) {
  try {
    const rec = JSON.parse(fs.readFileSync(bridgeFile(sessionId), 'utf8'))
    return rec && rec.session_id === sessionId ? rec : null
  } catch { return null }
}
