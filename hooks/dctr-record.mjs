// doctrine — the parser for a phase record's event lines (E8-D24).
//
// Pure: a string in, a value out. No filesystem, no clock, no herdr. The line forms are the ones hub step 5
// (skills/doctrine/SKILL.md) defines; this file pins exactly those and nothing looser, and the selftest's fixture
// record holds every key and every auto-cycle sub-form as a list item and bare, and every parsed entry is compared whole
// against a hand-written table, so a form or field this file loses is a selftest failure and never a silent miss. The selftest never reads the hub: a hub change to the forms is caught by review, not here.
//
// Every form may be a list item (`- `) or bare, its key in any case. The forms the agent writes (auto-cycle on, off,
// ready and paused) are also read with inline code, bold or italic markers wrapping the whole line (unwrapLine). A
// line that starts like a form but does not parse is not an entry, and neither is prose: a hook acts only on a line it
// can read whole.

/** A state line starts with `state:` after an optional `- ` and an optional `**`, the two forms run records
 *  use. hooks/dctr-project.mjs reads records with this same test. */
export const STATE_LINE = /^(?:-\s+)?(?:\*\*)?state:\s*/i

/** A line as an agent may write it, with its list marker and the inline code, bold or italic markers that wrap all
 *  the rest removed, and nothing else: `` - `auto-cycle: ready` ``, `**auto-cycle: off**` and `*auto-cycle: ready*`
 *  read as their text, and a line with other words beside the wrapped text is left as it was (K4-RL). */
export function unwrapLine(l) {
  let t = String(l ?? '').trim().replace(/^(?:[-*+]|\d+\.)\s+/, '')
  for (let m; (m = /^(`+|\*\*|\*|__|_)(\S(?:.*\S)?)\1$/.exec(t)); ) t = m[2].trim()
  return t
}

const TIME = '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?Z)'
const form = (body) => new RegExp(`^(?:-\\s+)?${body}$`, 'i')
const num = Number

/** Marks a form the agent writes (the on, off, ready and paused lines, hub step 5), which is also read through
 *  unwrapLine; the hook-written forms (warned, cycle) and the rest are read only as written. */
const AGENT = true

/** Each form: its regex and how its captures become fields. The tier is kept as written, since judging a
 *  malformed tier is the gauge's job (E8-D11) and a parser that dropped the line would hide it. */
const FORMS = [
  [form(`wave:\\s+${TIME}\\s+seat\\s+(\\S+)\\s+handle\\s+(\\S+)(?:\\s+via\\s+(doctrine-handoff|doctrine-backup))?\\s*`),
    (m) => ({ kind: 'wave', time: m[1], seat: m[2], handle: m[3], via: m[4] ? m[4].toLowerCase() : null })],
  [form(`round:\\s+(\\d+)\\s+closed\\s+${TIME}\\s+at\\s+(\\S+)\\s+blockers\\s+(\\d+)\\s+alarm\\s+(\\d+)\\s*`),
    (m) => ({ kind: 'round', n: num(m[1]), time: m[2], revision: m[3], blockers: num(m[4]), alarm: num(m[5]) })],
  [form(`finding:\\s+(\\S+)\\s+raised\\s+${TIME}\\s+(blocking|non-blocking)\\s+(\\S.*)`),
    (m) => ({ kind: 'finding-raised', id: m[1], time: m[2], blocking: m[3].toLowerCase() === 'blocking', text: m[4].trim() })],
  [form(`finding:\\s+(\\S+)\\s+cleared\\s+${TIME}\\s+(\\S.*)`),
    (m) => ({ kind: 'finding-cleared', id: m[1], time: m[2], evidence: m[3].trim() })],
  [form(`ruling:\\s+(\\S+)\\s+${TIME}\\s+(\\S.*)`),
    (m) => ({ kind: 'ruling', id: m[1], time: m[2], text: m[3].trim() })],
  [form(`alarm:\\s+(round|time)\\s+fired\\s+${TIME}\\s+count\\s+(\\d+)\\s*`),
    (m) => ({ kind: 'alarm', which: m[1].toLowerCase(), time: m[2], count: num(m[3]) })],
  [form(`question:\\s+(\\S+)\\s+(opened|answered)\\s+${TIME}\\s+(\\S.*)`),
    (m) => ({ kind: `question-${m[2].toLowerCase()}`, id: m[1], time: m[3], text: m[4].trim() })],
  [form('auto-cycle:\\s+on\\s+cap\\s+(\\d+)\\s+tier\\s+(\\S+)\\s*'), (m) => ({ kind: 'auto-cycle', sub: 'on', cap: num(m[1]), tier: m[2] }), AGENT],
  [form('auto-cycle:\\s+off\\s*'), () => ({ kind: 'auto-cycle', sub: 'off' }), AGENT],
  [form('auto-cycle:\\s+warned\\s+(\\S+)\\s+(\\S+)\\s*'), (m) => ({ kind: 'auto-cycle', sub: 'warned', session: m[1], tier: m[2] })],
  [form('auto-cycle:\\s+cycle\\s+(\\d+)\\s+tree\\s+([0-9a-f]+)\\s*'), (m) => ({ kind: 'auto-cycle', sub: 'cycle', n: num(m[1]), hash: m[2] })],
  [form('auto-cycle:\\s+ready\\s*'), () => ({ kind: 'auto-cycle', sub: 'ready' }), AGENT],
  [form('auto-cycle paused:\\s+(\\S.*)'), (m) => ({ kind: 'auto-cycle', sub: 'paused', reason: m[1].trim() }), AGENT],
]

/** `wrapper: <name>`, key in any case, as a list item or bare, optionally bold. The value is the first
 *  whitespace-delimited token after the key with backticks, `**`, a `doctrine:` prefix and a trailing period, comma
 *  or semicolon stripped: the E7 drive kit's line `Wrapper: doctrine:doctrine-code. Opened 2026-09-20T09:00:00Z.` reads
 *  `doctrine-code`. */
const WRAPPER_LINE = /^(?:-\s+)?(?:\*\*)?wrapper:\s*(?:\*\*)?\s*(\S+)/i
export const wrapperValue = (tok) => tok.replace(/[`*]/g, '').replace(/^doctrine:/i, '').replace(/[.,;]+$/, '') || null

/**
 * `{ entries, state, wrapper }`. `entries` is every line that parses as a form, in file order, each
 * `{ kind, line, ...fields }` with `line` 1-based. A state entry carries `raw`, the line as written, and `value`,
 * what follows the key with every `**` removed, so `- **State: Open.** limiter phase.` and `**State:** Open` both
 * read `Open`. `state` is the last state entry or null: where a record
 * carries more than one state line the last is current (hub step 5). `wrapper` is the last wrapper line's
 * value or null, the last for the same reason: a record is corrected by appending.
 */
export function parseRecord(text) {
  const entries = []
  let state = null, wrapper = null
  String(text ?? '').split('\n').forEach((raw, i) => {
    const l = raw.trim()
    const line = i + 1
    if (STATE_LINE.test(l)) {
      state = { kind: 'state', line, raw: l, value: l.replace(STATE_LINE, '').replace(/\*\*/g, '').trim() }
      entries.push(state)
      return
    }
    const w = WRAPPER_LINE.exec(l)
    if (w) { wrapper = wrapperValue(w[1]); return }
    for (const [re, fields, agent] of FORMS) {
      const m = re.exec(l) || (agent ? re.exec(unwrapLine(l)) : null)
      if (m) { entries.push({ ...fields(m), line }); return }
    }
  })
  return { entries, state, wrapper }
}
