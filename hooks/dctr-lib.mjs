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

/**
 * Shell-quotes one argument for a command string.
 *
 * `herdr pane run` types its argument into the pane's shell, so the string is shell-interpreted.
 * `JSON.stringify` is not sufficient: it produces double quotes, and a double-quoted shell string
 * still expands `$`, backticks and `${...}`. Single quotes suppress all three, and an embedded
 * single quote is closed, escaped and reopened. Both values interpolated into that command are
 * paths the harness supplies — a plugin install directory and a transcript path containing the
 * project directory — so neither is attacker-chosen in the ordinary case and both are outside this
 * code's control.
 */
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

/**
 * What to do with a seat's tab once the seat has stopped, given the tab's record from this
 * session's workspace list — or `undefined` where the list does not carry it. An unlisted tab is
 * closed by id (herdr tab ids are global), never skipped: a skipped tab outlives its marker, and
 * once the marker is gone nothing — not even the SessionEnd sweep — can ever reach it (issue #20).
 */
export const stopAction = (tab) => (tab && tab.focused ? 'relabel' : 'close')

/**
 * The full argument list for creating a seat's tab. `--workspace` is not optional: without it the
 * tab lands in whatever workspace the *user* has focused, which under several concurrent sessions
 * is usually somebody else's — four seats from two sessions landed in a third session's workspace
 * the first multi-session evening (issue #20). The id is the one `skipReason` already validated.
 */
export const tabCreateArgs = (workspaceId, label) =>
  ['tab', 'create', '--workspace', workspaceId, '--label', label, '--no-focus']

/** How many seats stack beside the session before the rest overflow to tabs. Scott's call,
 *  2026-08-31: six. On a 56-row terminal a full column leaves ~9 rows per seat; the seventh seat
 *  and beyond keep the tab behavior. */
export const SIDE_CAP = 6
/** Width of the seat column: the session keeps 60% of the tab. */
export const SIDE_RATIO = 0.4

/**
 * A live seat riding in a side pane rather than a tab. A marker without a tabId is a side seat —
 * no separate mode field, so the two can never disagree. The paneId requirement excludes another
 * seat's reservation ('{}', written with O_EXCL before the record): counting one would be harmless
 * for placement (it overflows to a tab early) but fatal for splitting (no paneId to split).
 */
export const isSideSeat = (s) => Boolean(s && s.paneId && !s.tabId)

/**
 * Whether a seat gets a row in the sidebar's agent list. Scott's ruling, 2026-08-31: a side pane is
 * already on screen, so it gets no row — the left list stays for real sessions; a tab seat keeps
 * its row, because a tab with no row anywhere is invisible. Both report-agent calls (working at
 * start, idle at stop) gate on this, or the stop call would create the very row the start withheld.
 */
export const reportsSidebarRow = (seat) => Boolean(seat && seat.tabId)

/**
 * Where a starting seat goes: a side pane while a slot is free and the session's own pane is known,
 * else a tab. No HERDR_PANE_ID means the hook cannot know what to split beside, and the tab path is
 * the one that needs nothing it does not already have.
 */
export const seatPlacement = (liveSeats, sessionPaneId, cap = SIDE_CAP) =>
  sessionPaneId && liveSeats.filter(isSideSeat).length < cap ? 'pane' : 'tab'

/** How long a run's sidebar tokens live without a refresh (issue #19). Each per-round record write
 *  republishes them, so a live run never blinks out; a run that dies stops writing and its row
 *  clears itself within the hour instead of sitting stale forever. An hour rather than the ten
 *  minutes the issue's probe used, because a single wave can outlast ten minutes between writes. */
export const TOKEN_TTL_MS = 3600000

/**
 * The report-metadata call that publishes doctrine's round and gate counters as sidebar tokens
 * (issue #19). Invoked by the orchestrator at step 5's per-round record write via dctr-token.mjs,
 * never by a hook: counters move when a gate pass completes, which is not a hook event, so a
 * hook-written token would show round 3 while the run is at round 5 — the stale-display failure
 * #16's D9 rejected. Dark by default: rendering needs `$doctrine` in the sidebar's rows config.
 */
export const metadataTokenArgs = (paneId, round, exitCount, valve) =>
  ['pane', 'report-metadata', paneId, '--source', 'custom:doctrine',
    '--token', `doctrine=r${round}·e${exitCount}·v${valve}`, '--ttl-ms', String(TOKEN_TTL_MS)]

/**
 * The split that creates a seat's side pane. The first side seat splits the session's pane right at
 * SIDE_RATIO, founding the column; each later one splits the **tallest** side pane down. Tallest,
 * not newest: stacking under the newest halves the same pane every time and a six-seat column comes
 * out 28/14/7/4/2/1 rows (measured), while splitting the tallest keeps the skew within a factor of
 * two and re-balances by itself when a mid-column seat closes and donates its rows to a neighbour.
 * `layoutPanes` is the observed layout (pane_id + rect); without it the newest side pane stands in.
 * `--no-focus` for the same reason as the tab path: a seat must never steal the user's cursor.
 */
export function splitArgs(liveSeats, sessionPaneId, layoutPanes) {
  const side = liveSeats.filter(isSideSeat)
  if (!side.length) {
    return ['pane', 'split', sessionPaneId, '--direction', 'right', '--ratio', String(SIDE_RATIO), '--no-focus']
  }
  let target = side[side.length - 1]
  if (layoutPanes?.length) {
    const height = new Map(layoutPanes.map((p) => [p.pane_id, p.rect?.height ?? 0]))
    target = side.reduce((a, b) => ((height.get(b.paneId) ?? 0) > (height.get(a.paneId) ?? 0) ? b : a))
  }
  return ['pane', 'split', target.paneId, '--direction', 'down', '--no-focus']
}
