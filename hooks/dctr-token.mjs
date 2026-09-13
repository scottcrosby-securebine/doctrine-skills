// Publishes doctrine's round and gate counters as herdr sidebar tokens (issue #19).
//
//   node hooks/dctr-token.mjs <round> <exit-count> <valve> [--epic <ID>] [--phase <name>] [--owed]
//
// Run by the doctrine orchestrator at step 5's per-round record write — never by a hook, because
// counters move when a gate pass completes and that is not a hook event. The token is cosmetic:
// outside herdr the script stands down with a reason and exits 0, so a doctrine round never fails
// over its own display. Only malformed arguments exit 1, because those are the caller's bug.
//
// `--epic` and `--phase` publish `$epic` and `$phase`, and `--owed` suffixes `$doctrine` with `·owed`
// (doctrine-project), all in the same one call. Each flag at most once; each value must match the ID
// pattern below, which keeps it short enough to publish as a token unchanged.
//
// The tokens render only if the user's herdr config carries `$doctrine` in a row under
// `[ui.sidebar.agents]`; docs/watching-a-run.md carries that row, with the 0.9.0 colour rules.

import { spawnSync } from 'node:child_process'
import { skipReason, metadataTokenArgs, ID_RE } from './dctr-lib.mjs'

const FLAGS = new Map([['--epic', 'epic'], ['--phase', 'phase'], ['--owed', 'owed']])
const usage = () => {
  console.error('usage: node dctr-token.mjs <round> <exit-count> <valve> [--epic <ID>] [--phase <name>] [--owed]' +
    '  (three non-negative integers; each flag at most once; ID and name match [A-Za-z0-9][A-Za-z0-9_-]{0,23})')
  process.exit(1)
}

const argv = process.argv.slice(2)
const [round, exitCount, valve, ...rest] = argv
if (argv.length < 3 || [round, exitCount, valve].some((v) => !/^\d+$/.test(v))) usage()
const opts = {}
for (let i = 0; i < rest.length; i++) {
  const key = FLAGS.get(rest[i])
  if (!key || Object.hasOwn(opts, key)) usage()
  if (key === 'owed') { opts.owed = true; continue }
  const value = rest[++i]
  if (value === undefined || !ID_RE.test(value)) usage()
  opts[key] = value
}

const reason = skipReason(process.env) ??
  (process.env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID in the environment')
if (reason) {
  console.log(`dctr-token: standing down — ${reason}`)
  process.exit(0)
}

const args = metadataTokenArgs(process.env.HERDR_PANE_ID, round, exitCount, valve, opts)
const r = spawnSync('herdr', args, { encoding: 'utf8' })
if (r.error || r.status !== 0) {
  console.log(`dctr-token: herdr refused — ${(r.error?.message || r.stderr || r.stdout || '').trim()}`)
  process.exit(0)
}
console.log(`dctr-token: published ${args.filter((_, i) => args[i - 1] === '--token').join(' ')} (ttl ${args[args.indexOf('--ttl-ms') + 1]}ms)`)
