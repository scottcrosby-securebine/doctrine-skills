// Shared decisions for doctrine's herdr seat visibility (issue #17).
//
// Everything here is a pure function of a hook payload plus observed state. No herdr, no
// filesystem, no clock. That is what lets `dctr-seat.selftest.mjs` cover the whole of it with
// fixtures on a machine that has neither herdr nor a codex plugin, which is what CI is.
//
// The I/O lives in `dctr-seat.mjs` (the hook) and `dctr-render.mjs` (the pane renderer).

/** Prefix that marks everything doctrine owns. Scott's term; do not paraphrase it. */
export const PREFIX = 'dctr'
/** Tool results are truncated to this many lines at each end. A constant until something needs it
 *  otherwise: the transcript on disk stays complete, so a quieter view discards nothing. */
export const RESULT_HEAD = 3
export const RESULT_TAIL = 2

/** herdr requires `[a-z][a-z0-9_-]{0,31}`, unique among live agents. Anything else is rejected. */
export const AGENT_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/

/** `Explore` -> `explore`, `general-purpose` -> `general-purpose`. Empty input becomes `seat`. */
export const slug = (role) =>
  (String(role || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seat')

/**
 * `dctr-explore-1`. Truncates the role rather than the counter, because a colliding counter would
 * break uniqueness while a shortened role only reads worse.
 */
export function agentName(role, n) {
  const tail = `-${n}`
  const room = 32 - PREFIX.length - 1 - tail.length
  return `${PREFIX}-${slug(role).slice(0, Math.max(1, room))}${tail}`
}

/** `dctr · explore · 1`. Tabs are not name-constrained, so this one stays readable. */
export const tabLabel = (role, n) => `${PREFIX} · ${slug(role)} · ${n}`

/**
 * Where a subagent's own transcript lives, derived from the parent's.
 * Verified 2026-08-30: the value derived at SubagentStart matched SubagentStop's authoritative
 * `agent_transcript_path` exactly. Prefer the authoritative field wherever the payload carries it.
 */
export function transcriptPath(parentTranscript, agentId) {
  if (!parentTranscript || !agentId) return null
  const base = parentTranscript.replace(/\.jsonl$/, '')
  return `${base}/subagents/agent-${agentId}.jsonl`
}

/**
 * Whether this payload is a seat event doctrine should act on.
 *
 * `PostToolUse` fires twice per dispatch — once in the parent with `tool_name: "Agent"` and no
 * `agent_id`, once inside the subagent with one. Only the second is a seat. Nothing here subscribes
 * to PostToolUse, but the same test guards every event: no `agent_id` means the parent, not a seat.
 */
export const isSeatEvent = (p) => Boolean(p && p.agent_id && p.agent_type)

/**
 * Guard for every hook. Returns a reason string when doctrine must stand down, else null.
 * A skip is always a reason, never silence: a watcher that failed and a run that dispatched nothing
 * print the same thing otherwise, and the user waits for a tab that was never coming.
 */
export function skipReason(env) {
  if (env.HERDR_ENV !== '1') return 'not running inside a herdr pane (HERDR_ENV is not 1)'
  if (!env.HERDR_WORKSPACE_ID) return 'no HERDR_WORKSPACE_ID in the environment'
  return null
}

/** One rendered line, or null for a record that shows nothing. Pure; the renderer does the I/O. */
export function renderRecord(rec, { head = RESULT_HEAD, tail = RESULT_TAIL } = {}) {
  if (!rec || rec.type === 'attachment') return null
  const msg = rec.message
  if (!msg) return null
  const content = msg.content
  const out = []

  if (typeof content === 'string') {
    if (msg.role === 'user') out.push(`» ${firstLine(content)}`)
    else out.push(content.trim())
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type === 'text' && b.text?.trim()) out.push(b.text.trim())
      else if (b.type === 'tool_use') out.push(`→ ${b.name}  ${firstLine(JSON.stringify(b.input ?? {}))}`)
      else if (b.type === 'tool_result') {
        const raw = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '')
        out.push(indent(truncate(raw, head, tail)))
      }
      // `thinking` is deliberately dropped: it is the longest content in a seat's transcript and
      // the least useful for deciding whether to let the seat keep going.
    }
  }
  const text = out.join('\n').trimEnd()
  return text ? text : null
}

const firstLine = (s) => String(s).split('\n')[0].slice(0, 160)
const indent = (s) => s.split('\n').map((l) => `    ${l}`).join('\n')

/**
 * Head and tail of a block, with a marker naming what was cut. Never silently elides: an
 * unmarked truncation and a short result are indistinguishable, which is the same failure the
 * doctrine's unrun-check rule exists to stop.
 */
export function truncate(text, head, tail) {
  const lines = String(text).replace(/\s+$/, '').split('\n')
  if (lines.length <= head + tail + 1) return lines.join('\n')
  const cut = lines.length - head - tail
  return [...lines.slice(0, head), `… ${cut} line(s) cut, full record on disk`, ...lines.slice(-tail)].join('\n')
}

/**
 * The first free counter for a role, given the seats already live. The caller still creates the
 * marker with O_EXCL and retries on collision — doctrine dispatches waves, so two seats of one role
 * can start in the same millisecond and a read-then-write allocation loses one of them.
 */
export function nextIndex(role, takenNames) {
  const taken = new Set(takenNames)
  for (let n = 1; n <= 999; n++) if (!taken.has(agentName(role, n))) return n
  return null
}

/**
 * A herdr CLI response, or null where it returned nothing.
 *
 * Not every command answers. `pane run` and `pane report-agent` both exit 0 with **empty stdout**,
 * verified on 0.8.2, while `tab create` and `tab list` return JSON. Parsing unconditionally turns a
 * successful call into a thrown SyntaxError, which the hook then reports as herdr refusing the
 * action — it created the tab and stood down before reporting the seat, so the tab existed, the
 * sidebar stayed empty and the marker was left half-written. Nineteen passing fixtures did not see
 * this; the first live run did.
 */
export function parseHerdr(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return null
  return JSON.parse(text)
}

/** What to do with a seat's tab once the seat has stopped. */
export const stopAction = (focused) => (focused ? 'relabel' : 'close')
