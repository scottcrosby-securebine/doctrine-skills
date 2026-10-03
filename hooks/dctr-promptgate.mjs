// doctrine — the auto-cycle prompt gate (E10 S1, D19, D28, D41).
//
// UserPromptSubmit on both hosts (hooks.json, and CODEX_HOOKS in dctr-lib.mjs), beside dctr-cycle.mjs. A payload that
// does not carry RESUME_MARK, neither in its text nor in any string once decoded (carriesMark: a JSON escape can hide
// it from the text), is never touched: the gate prints nothing and exits 0 before it imports anything but node's own
// modules. A marked payload whose `prompt` is not a string is blocked. A marked prompt passes only when this pane's restore file names the
// payload's session_id, so the auto-cycle's resume line runs only in the session its /clear started; otherwise the gate
// prints a block naming the auto-cycle and writes the pane's gated marker, which the typer reads as the /clear not
// taking. promptGate in dctr-lib.mjs owns that decision.
//
// It fails closed for a marked prompt: everything past the marker check, the imports included, runs inside one catch
// that prints the block. Both hosts let a prompt through when a hook exits non-zero, prints malformed JSON or times
// out (probe-ups U5), so the block is printed as the one well-formed JSON line and the exit is always 0. It reads one
// file and calls no herdr. A gate that cannot start at all (node missing), or cannot read its stdin, lets the prompt
// through: nothing then shows the prompt is marked.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The words every line the auto-cycle types carries, which mark it as typed by the auto-cycle and not a ruling. */
export const RESUME_MARK = '(typed by doctrine auto-cycle, not a ruling)'

/** Whether a payload's text is marked: RESUME_MARK in the raw text, or in any key or string value once the
 *  JSON is decoded, since an escape hides it from the text whatever the prompt's type. A payload that cannot be
 *  walked counts as marked, so the gate decides on it. */
export function carriesMark(raw) {
  if (typeof raw !== 'string') return false
  if (raw.includes(RESUME_MARK)) return true
  let v
  try { v = JSON.parse(raw) } catch { return false }
  const walk = (x) => (typeof x === 'string' ? x.includes(RESUME_MARK)
    : x !== null && typeof x === 'object' ? Object.entries(x).some(([k, y]) => k.includes(RESUME_MARK) || walk(y)) : false)
  try { return walk(v) } catch { return true }
}

const block = (reason) => JSON.stringify({ decision: 'block', reason })

/** The gate over one payload's text: what to print, '' to let the prompt through. Never throws. */
export async function gate(raw, env) {
  try {
    const payload = JSON.parse(raw)
    const { promptGate } = await import('./dctr-lib.mjs')
    const { restoreFile, gatedFile, writeMarker } = await import('./dctr-state.mjs')
    const pane = env.HERDR_PANE_ID || null
    let restored = null
    // A restore file that is missing, half-written or unreadable names no session, and the line is blocked.
    if (pane) try { restored = JSON.parse(fs.readFileSync(restoreFile(pane), 'utf8')).session_id ?? null } catch { /* none */ }
    const d = promptGate({ prompt: payload.prompt, session: payload.session_id, pane, restored, raw })
    if (d.act === 'pass') return ''
    if (pane) writeMarker(gatedFile(pane), { session_id: payload.session_id ?? null, at: Date.now() })
    return block(d.reason)
  } catch (e) {
    return block(`doctrine auto-cycle: not sent, the gate could not check this line (${String(e?.message || e).split('\n')[0]})`)
  }
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (isMain) {
  let raw = null
  try { raw = fs.readFileSync(0, 'utf8') } catch { /* unread: nothing shows the line is marked */ }
  if (!carriesMark(raw)) process.exit(0)
  gate(raw, process.env).then((out) => { if (out) process.stdout.write(out) })
}
