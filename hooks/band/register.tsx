import type { EngineInterface, Register } from 'claude-code'

import { bandParts, followChain } from './band'
import type { Summary, Tone } from './band'

// The doctrine band: one line above the prompt naming a live doctrine phase's state, read from the record the
// session's kickoff chain reaches. Paths are absolute, built from the session's own directory, because a relative
// path read for a seat resolves inside the seat's worktree. It draws nothing when the chain reaches no Open or
// Blocked record, hooks no tool call, and calls no herdr. The `band` config row set off registers nothing (E11-D13).
const COLOR: Record<Tone, string | undefined> = { ok: 'green', owed: 'magenta', flight: 'cyan', quiet: undefined, plain: undefined }
const OUT = new Set(['pending', 'running', 'waiting'])
// The record changes when the orchestrator writes a line, which is no engine event, so the band polls.
const POLL_MS = 5000

let root: string | null = null
let shown: Summary | null = null
let fingerprint = 'null'
let busy = false

async function readOrNull($: EngineInterface, file: string): Promise<string | null> {
  try {
    return await $.fs.read(file)
  } catch {
    return null
  }
}

/** Re-reads the chain and the seat list; true when what the band shows has changed. */
async function refresh($: EngineInterface): Promise<boolean> {
  const chain = root === null ? null : await followChain(root, file => readOrNull($, file))
  let next = chain === null ? null : bandParts(chain.phase, chain.recordText, 0)
  if (chain !== null && next !== null) {
    // Asked only for a live record, so a terminal one clears without waiting on it; a refused list reads as none.
    const agents = await $.agent.list().catch(() => [])
    next = bandParts(chain.phase, chain.recordText, agents.filter(a => OUT.has(a.status)).length)
  }
  const print = JSON.stringify(next)
  const changed = print !== fingerprint
  fingerprint = print
  shown = next
  return changed
}

/** One refresh at a time: a poll that comes due while one is still out is skipped, so refreshes never overlap and
 *  each one that settles draws what it read. Nothing awaits it, so an engine call that answers late or never holds
 *  only the band, never the session. */
function poll($: EngineInterface): void {
  if (busy) return
  busy = true
  refresh($)
    .then(changed => {
      if (changed) $.ui.invalidate('ui.render')
    }, () => {})
    .finally(() => {
      busy = false
    })
}

export const register: Register = (on, options) => {
  if (options.band === false) return

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    root = e.cwd
    poll($)
    $.clock.every(POLL_MS, () => poll($))
    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    if (e.props.hasSurvey || shown === null) return beneath

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>doctrine </Text>
          <Text bold>{shown.phase}</Text>
          {shown.parts.flatMap((part, i) => [
            <Text key={'gap' + i}>{'  '}</Text>,
            <Text key={'part' + i} color={COLOR[part.tone]} dimColor={part.tone === 'quiet'} bold={part.tone === 'owed'}>
              {part.text}
            </Text>,
          ])}
        </Box>
        {beneath}
      </Box>
    )
  })
}
