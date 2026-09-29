// The orchestrator's pause notification on Codex, which has no notification tool (E8-D19 through E10's table).
//
//   node hooks/dctr-notify.mjs <phase> <reason...>
//
// Run by the orchestrator when it pauses auto-cycle itself, never by a hook. Shows one herdr notification whose
// title is the hub's pause text, `<phase>: doctrine auto-cycle paused, <reason>`, and nothing more: no --body.
// The reason may be one argument or several words, joined by single spaces. Stands down with exit 0, calling no
// herdr, outside herdr and in a contained session, exactly as dctr-token.mjs does; herdr refusing exits 1, so the
// orchestrator knows to say it in its turn instead. Malformed arguments exit 2.

import { spawnSync } from 'node:child_process'
import { skipReason } from './dctr-lib.mjs'

const [phase, ...words] = process.argv.slice(2)
const reason = words.join(' ')
if (!phase || !reason) { process.stderr.write('usage: node dctr-notify.mjs <phase> <reason...>\n'); process.exit(2) }

const why = (process.env.DCTR_VIEW_REQUEST_DIR ? 'contained session (DCTR_VIEW_REQUEST_DIR is set), which reaches nothing on the host' : null) ??
  skipReason(process.env) ??
  (process.env.HERDR_PANE_ID ? null : 'no HERDR_PANE_ID in the environment')
if (why) {
  console.log(`dctr-notify: standing down — ${why}`)
  process.exit(0)
}

const title = `${phase}: doctrine auto-cycle paused, ${reason}`
const r = spawnSync('herdr', ['notification', 'show', title, '--sound', 'request'], { encoding: 'utf8' })
if (r.error || r.status !== 0) {
  console.log(`dctr-notify: herdr refused — ${(r.error?.message || r.stderr || r.stdout || '').trim()}`)
  process.exit(1)
}
console.log(`dctr-notify: shown "${title}"`)
