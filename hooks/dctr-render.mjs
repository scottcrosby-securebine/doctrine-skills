// doctrine — seat transcript renderer (issue #17).
//
// Runs inside the pane a seat's tab owns, and follows that seat's own transcript as it is written.
//
//   node dctr-render.mjs <path-to-agent-transcript.jsonl>
//
// This exists rather than a PostToolUse hook because a hook fires once per tool call per seat, in
// every project, for every installer. One reader per pane costs one process for the life of a seat
// and does its formatting outside that hot path.
//
// It renders; it never writes to the transcript and never reports state. If the file is missing it
// waits, because the hook creates the tab at SubagentStart and the harness may not have written the
// first record yet.

import fs from 'node:fs'
import { renderRecord } from './dctr-lib.mjs'

const file = process.argv[2]
if (!file) { console.error('usage: dctr-render.mjs <transcript.jsonl>'); process.exit(2) }

const POLL_MS = 250
let offset = 0
let carry = ''
let announced = false

console.log(`\x1b[2m── doctrine seat · ${file}\x1b[0m`)

/** Reads whatever has been appended since the last pass and renders complete lines only. */
function pump() {
  let size
  try {
    size = fs.statSync(file).size
  } catch {
    // Not written yet. Say so once, then keep waiting rather than exiting: an empty pane and a
    // crashed renderer look identical otherwise.
    if (!announced) { console.log('\x1b[2m   waiting for the seat to start writing…\x1b[0m'); announced = true }
    return
  }
  // A truncated or replaced file means the harness started over; follow it rather than reading past
  // the end forever.
  if (size < offset) { offset = 0; carry = '' }
  if (size === offset) return

  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    offset = size
    const lines = (carry + buf.toString('utf8')).split('\n')
    carry = lines.pop() ?? ''   // a write can land mid-line; hold the remainder for the next pass
    for (const line of lines) {
      if (!line.trim()) continue
      let rec
      try { rec = JSON.parse(line) } catch { continue }  // a partial or malformed record is skipped, never fatal
      const text = renderRecord(rec)
      if (text) console.log(text)
    }
  } finally {
    fs.closeSync(fd)
  }
}

setInterval(pump, POLL_MS)
pump()
