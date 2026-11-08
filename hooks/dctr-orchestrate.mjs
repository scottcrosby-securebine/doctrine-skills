// The commands `doctrine-orchestrate` runs instead of computing a number in prose (KS-1).
//
//   node hooks/dctr-orchestrate.mjs capacity <model id> <tier> <transcript path>
//
// Prints one line: `accept window <n> load <n> tier <n> margin <n>`, or `refuse` with the window where it derived
// one and every reason. Exit 0 accept, 1 refuse, 2 malformed arguments.
//
// The window comes from the model id alone: 1,000,000 for a known id ending `[1m]`, 200,000 for a known id without
// it, and refusal with no window for any other id (E15-D208). The load is the transcript's FIRST main-thread usage
// reading, the resume load (E15-D209). The tier is read as the gauge reads it (`resolveTier`: a number, `<n>%` or
// `default`), and any error it reports refuses, its floor raise included. The arithmetic is `capacityDecision` in
// dctr-lib.mjs (E15-D51). It reads one file and calls nothing else.

import fs from 'node:fs'
import { capacityDecision, firstUsage, resolveTier, HANDOFF_COST_TOKENS } from './dctr-lib.mjs'

// shortcut: a fixed list of API model ids as of 2026-10; a new model is refused until its id is added here.
export const MODEL_IDS = ['claude-fable-5-1', 'claude-mythos-5-1', 'claude-fable-5', 'claude-opus-5-5', 'claude-opus-5',
  'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-haiku-5-5', 'claude-haiku-4-5']

/** The context window a model id names, or null for an id this file does not know. */
export function windowOf(id) {
  const base = String(id).endsWith('[1m]') ? String(id).slice(0, -4) : String(id)
  if (!MODEL_IDS.includes(base)) return null
  return String(id).endsWith('[1m]') ? 1000000 : 200000
}

/** The capacity verdict as the line it prints and whether it accepts. */
export function capacity(modelId, tierText, transcriptText) {
  const window = windowOf(modelId)
  if (window === null) return { accept: false, line: `refuse model id "${modelId}" is unknown` }
  const reading = firstUsage(transcriptText)
  if (reading.unknown) return { accept: false, line: `refuse window ${window}: the resume load is unknown (${reading.unknown})` }
  const load = reading.used
  const resolved = resolveTier({ tierText, window, firstUsed: load, handoffCost: HANDOFF_COST_TOKENS })
  if (resolved.errors.length) return { accept: false, line: `refuse window ${window} load ${load}: ${resolved.errors.join('; ')}` }
  const d = capacityDecision({ window, load, tier: resolved.tier })
  const facts = `window ${d.window} load ${d.load} tier ${d.tier} margin ${d.margin}`
  if (d.accept) return { accept: true, line: `accept ${facts}` }
  // resolveTier has already refused a tier above 90% of the window, so only the margin can refuse here.
  return { accept: false, line: `refuse ${facts}: load plus margin ${d.need} is not below the tier` }
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename) } catch { return false } })()
if (isMain) {
  const [cmd, modelId, tierText, transcript, ...extra] = process.argv.slice(2)
  if (cmd !== 'capacity' || !modelId || !tierText || !transcript || extra.length) {
    console.error('usage: node hooks/dctr-orchestrate.mjs capacity <model id> <tier> <transcript path>')
    process.exit(2)
  }
  let text = null
  try { text = fs.readFileSync(transcript, 'utf8') } catch {}
  const v = capacity(modelId, tierText, text)
  console.log(v.line)
  process.exit(v.accept ? 0 : 1)
}
