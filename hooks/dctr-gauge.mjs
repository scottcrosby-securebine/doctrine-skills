// doctrine — context gauge hook (E8-D4, E8-D21, E8-D10, E8-D11).
//
// PostToolBatch, no matcher, in hooks.json. While a doctrine phase's record is Open or Blocked and its last
// auto-cycle on/off line is on (E8-R10), it reads how much of the context window the main session has used and,
// the first time that reaches the tier, hands the session the warning as facts, appends
// `- auto-cycle: warned <session id> <tier>` to the record (SC9) and latches so the session is warned once (SC7).
// It finds the record through the chain the restore hook follows: SESSION_MEMORY.md's kickoff `handoff:` line,
// that handoff's `record:` header line, the record (Q1). The window comes from the statusline bridge's
// per-session file (SC6); the reading comes from the end of the session's own transcript, read back in growing
// chunks until a usage entry is found.
//
// A seat's batch stands down before anything is read or written (E8-D21). It always exits 0 and calls no herdr
// and nothing on the network (SC1). Every reason it stood down goes to stderr and the session's hook.log. The
// decisions are pure, in dctr-lib.mjs and dctr-record.mjs; this file holds only the reads and writes around them.

import fs from 'node:fs'
import path from 'node:path'
import {
  gaugeSkip, followKickoff, autoCycleOn, readUsage, resolveTier, gaugeStep, gaugeContext, HANDOFF_COST_TOKENS,
} from './dctr-lib.mjs'
import { hookLog, stateDir, standDown, writeMarker } from './dctr-state.mjs'
import { readBridge } from './dctr-bridge.mjs'

/** How much of the transcript's end each read covers, growing until a usage entry is found: one tool result can
 *  be larger than the first chunk, so the last usage entry may sit further back (E8-D10). */
const TAIL_CHUNKS = [512 * 1024, 2 * 1024 * 1024, Infinity]

let sessionId = null
const stand_down = standDown('PostToolBatch', 'gauge', () => sessionId)

/** The transcript's reading (readUsage), from its last TAIL_CHUNKS[i] bytes cut to the first complete line, read
 *  again with the next, larger chunk while no usage entry is found and the file has more. Missing when unreadable. */
function readTranscript(file, lastUuid) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    let reading
    for (const chunk of TAIL_CHUNKS) {
      const start = Math.max(0, size - chunk)
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      const text = buf.toString('utf8')
      reading = readUsage(start > 0 ? text.slice(text.indexOf('\n') + 1) : text, lastUuid)
      if (reading.unknown !== 'unparseable' || start === 0) break
    }
    return reading
  } catch { return readUsage(null, lastUuid) } finally { if (fd !== undefined) fs.closeSync(fd) }
}

try {
  let payload
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { stand_down('hook payload was not readable JSON') }
  const why = gaugeSkip(payload)
  if (why) stand_down(why)
  sessionId = payload.session_id

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd
  if (!projectDir) stand_down('no CLAUDE_PROJECT_DIR and no cwd in the payload')
  const chain = followKickoff({ projectDir, read: (f) => fs.readFileSync(f, 'utf8'), exists: fs.existsSync })
  if (chain.why) stand_down(chain.why)
  const { recordPath, record } = chain
  const cycle = autoCycleOn(record.entries)
  if (cycle?.sub !== 'on') stand_down(`auto-cycle is ${cycle ? 'off' : 'not switched on'} in ${recordPath}`)

  const latchFile = path.join(stateDir(sessionId), 'gauge.json')
  let latch = null
  try { latch = JSON.parse(fs.readFileSync(latchFile, 'utf8')) } catch { /* no latch yet: a fresh session */ }
  if (latch?.session_id !== sessionId) latch = null
  const window = readBridge(sessionId)?.window ?? null
  const reading = readTranscript(payload.transcript_path, latch?.lastUuid ?? null)

  // The floor is the session's first reading plus the handoff cost (SC5); on the first batch that reading is this one.
  const firstUsed = latch?.firstUsed ?? (reading.unknown ? null : reading.used)
  const resolved = resolveTier({ tierText: cycle.tier, window, firstUsed, handoffCost: HANDOFF_COST_TOKENS })
  // The record's own warned line for this session counts as warned, so a latch write that failed never repeats it.
  const warnedInRecord = record.entries.some((e) => e.kind === 'auto-cycle' && e.sub === 'warned' && e.session === sessionId)
  const stepped = gaugeStep({ latch, reading, tier: resolved.tier, tierText: resolved.tierText, window, sessionId, warnedInRecord })
  const facts = [...resolved.errors, ...stepped.facts]

  if (stepped.warn) {
    const line = `- auto-cycle: warned ${sessionId} ${stepped.warnedTier}\n`
    try {
      const text = fs.readFileSync(recordPath, 'utf8')
      fs.appendFileSync(recordPath, (text === '' || text.endsWith('\n') ? '' : '\n') + line)
    } catch (e) {
      facts.push(`the warned line could not be appended to ${recordPath} (${e.code || e.message})`)
    }
  }
  try {
    fs.mkdirSync(path.dirname(latchFile), { recursive: true })
    writeMarker(latchFile, stepped.latch)
  } catch (e) {
    facts.push(`the gauge latch ${latchFile} could not be written (${e.code || e.message})`)
  }

  if (!stepped.warn && !facts.length) {
    hookLog(sessionId, `PostToolBatch gauge read ${reading.unknown ? `unknown (${reading.unknown})` : reading.used}, tier ${resolved.tier ?? 'unresolved'}`)
    process.exit(0)
  }
  const used = reading.unknown ? null : reading.used
  const additionalContext = gaugeContext({ warn: stepped.warn, used, window, tier: resolved.tier, tierText: stepped.warnedTier ?? resolved.tierText, facts })
  const systemMessage = stepped.warn
    ? `dctr gauge: auto-cycle warning at ${used ?? 'unknown'} tokens of a ${window ?? 'unknown'}-token window, tier ${stepped.warnedTier}${facts.length ? `; ${facts.join('; ')}` : ''}`
    : `dctr gauge: ${facts.join('; ')}`
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolBatch', additionalContext }, systemMessage }))
  hookLog(sessionId, `PostToolBatch gauge ${stepped.warn ? `warned, tier ${stepped.warnedTier}` : 'reported facts'} — ${facts.join('; ') || 'no facts'}`)
  process.exit(0)
} catch (e) {
  stand_down(`hook error (${String(e?.message || e).split('\n')[0]})`)
}
