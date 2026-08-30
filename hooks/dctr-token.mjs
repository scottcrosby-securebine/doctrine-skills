// Publishes doctrine's round and gate counters as herdr sidebar tokens (issue #19).
//
//   node hooks/dctr-token.mjs <round> <exit-count> <valve>
//
// Run by the doctrine orchestrator at step 5's per-round record write — never by a hook, because
// counters move when a gate pass completes and that is not a hook event. The token is cosmetic:
// outside herdr the script stands down with a reason and exits 0, so a doctrine round never fails
// over its own display. Only malformed arguments exit 1, because those are the caller's bug.
//
// The tokens render only if the user's herdr config carries `$doctrine` in a row under
// `[ui.sidebar.agents]`; the README's herdr bullet documents that one line.

import { spawnSync } from 'node:child_process'
import { skipReason, metadataTokenArgs } from './dctr-lib.mjs'

const argv = process.argv.slice(2)
const [round, exitCount, valve] = argv
if (argv.length !== 3 || argv.some((v) => !/^\d+$/.test(v))) {
  console.error('usage: node dctr-token.mjs <round> <exit-count> <valve>  (exactly three non-negative integers)')
  process.exit(1)
}

const reason = skipReason(process.env) ??
  (process.env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID in the environment')
if (reason) {
  console.log(`dctr-token: standing down — ${reason}`)
  process.exit(0)
}

const args = metadataTokenArgs(process.env.HERDR_PANE_ID, round, exitCount, valve)
const r = spawnSync('herdr', args, { encoding: 'utf8' })
if (r.error || r.status !== 0) {
  console.log(`dctr-token: herdr refused — ${(r.error?.message || r.stderr || r.stdout || '').trim()}`)
  process.exit(0)
}
console.log(`dctr-token: published r${round}·e${exitCount}·v${valve} (ttl ${args[args.indexOf('--ttl-ms') + 1]}ms)`)
