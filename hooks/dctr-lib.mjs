import os from 'node:os'

// Shared decisions for doctrine's herdr seat visibility (issue #17).
//
// Everything here is a pure function of a hook payload plus observed state. No herdr, no
// filesystem, no clock. That is what lets `dctr-seat.selftest.mjs` cover the whole of it with
// fixtures on a machine that has neither herdr nor a codex plugin, which is what CI is.
//
// The I/O lives in `dctr-seat.mjs` (the hook), `dctr-render.mjs` (the pane renderer), `dctr-gate.mjs`
// (the long-check launcher) and `dctr-state.mjs` (the markers, lock, log and herdr call they share).

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
 *
 * `agent_type` is required too, and that half fires far more often. Claude Code runs its own
 * forked queries after a turn — a prompt suggestion after most turns, memory extraction every so
 * often — and each one ends with a SubagentStop that carries an `agent_id` and an empty
 * `agent_type` (the emitter falls back to "" when the fork has no type). Read from the 2.1.261
 * bundle on 2026-09-05, after one session logged 62 of these against four real seats. They are
 * not seats, and a hooks.json matcher cannot exclude them: the dispatcher runs every matcher when
 * the match query is empty. So every one of them costs one process spawn that ends here.
 */
export const isSeatEvent = (p) => Boolean(p && p.agent_id && p.agent_type)

/** Why a payload failed `isSeatEvent`, for the stand-down log; null for a seat. */
export const notSeatReason = (p) => {
  if (isSeatEvent(p)) return null
  if (!p || !p.agent_id) return 'not a seat event: no agent_id, so this is the parent'
  return 'not a seat event: agent_type is empty, so this is one of Claude Code\'s own forked queries (prompt suggestion, memory extraction), not a dispatched seat'
}

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
/** The highest index a seat name can carry. `nextIndex` stops here, and so must any caller that
 *  increments past its answer — one that did not spun past this bound forever. Stated once, and
 *  exported, so the bound and the loops that respect it cannot drift apart. */
export const MAX_SEAT_INDEX = 999

export function nextIndex(role, takenNames) {
  const taken = new Set(takenNames)
  for (let n = 1; n <= MAX_SEAT_INDEX; n++) if (!taken.has(agentName(role, n))) return n
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
 * What to do with a seat's pane or tab once the seat has stopped, given that pane or tab's own
 * record. THREE answers, not two: `relabel` for a definite focused, `close` for a definite
 * unfocused, and `unknown` for everything else — a lookup that failed, a reply carrying no record,
 * a record with no boolean `focused`.
 *
 * It returns `unknown` rather than collapsing to `close` because the pane a blind close destroys is
 * the focused one the user is watching, and because a pure function cannot see its caller's guard:
 * three separate call sites each believed the caller above it had already separated the unknown
 * case, and two of them had not. What `unknown` MEANS is the caller's to decide and differs by
 * site, which is exactly why this function must not decide it. An unlisted tab is still closed by
 * id where the list itself SUCCEEDED (herdr tab ids are global, and a skipped tab outlives its
 * marker — issue #20), but that is an absence the caller observed, not this function's guess.
 */
export const stopAction = (rec) => {
  if (typeof rec?.focused !== 'boolean') return 'unknown'
  return rec.focused ? 'relabel' : 'close'
}

/**
 * The full argument list for creating a seat's tab. `--workspace` is not optional: without it the
 * tab lands in whatever workspace the *user* has focused, which under several concurrent sessions
 * is usually somebody else's — four seats from two sessions landed in a third session's workspace
 * the first multi-session evening (issue #20). The id is the one `skipReason` already validated.
 */
export const tabCreateArgs = (workspaceId, label, cwd) =>
  ['tab', 'create', '--workspace', workspaceId, '--label', label, '--no-focus', ...seatEnvArgs(), ...cwdArgs(cwd)]

/** The pane shell starts in the herdr server's cwd, not the caller's, and with a fresh environment.
 *  A relative check path handed to the gate launcher therefore ran in one directory on the pane
 *  path and another on the detached path (field audit, 2026-09-07). Every creation call passes the
 *  cwd it was given; a caller that gives none gets the old call. */
export const cwdArgs = (cwd) => (cwd ? ['--cwd', cwd] : [])

/**
 * Every seat pane runs an interactive shell, and `pane run` types the renderer command into it, so
 * the shell records that line and writes it to the user's `~/.bash_history` when the pane closes.
 * 1,388 of the 2,000 lines Scott's history held on 2026-09-05 were seat renderers, and his own
 * commands had scrolled off the end. The pane shell gets its own HISTFILE instead: the record is
 * kept, and kept out of his. Both creation paths carry it, since a seat is a pane on either.
 * Bash reads HISTFILE from the environment at start-up; a bashrc that sets it would win.
 */
export const SEAT_HISTFILE = () => `${os.homedir()}/.dctr_history`
export const seatEnvArgs = () => ['--env', `HISTFILE=${SEAT_HISTFILE()}`]

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

/**
 * Side-seat markers whose pane the observed layout no longer carries. The marker is advisory and
 * the layout authoritative: a pane closed by hand, or a stop whose cleanup never ran, leaves a
 * marker that still counts toward the cap and — worse — becomes the split target, so the split
 * fails on pane_not_found and every later seat in the session demotes to a tab (QuoteBine,
 * 2026-08-31: two markers from 08:56 sent the 15:25 seat to a tab). With no layout observed
 * nothing is known stale, so nothing is dropped; a tab seat is never judged here because its pane
 * lives in another tab the session-pane layout does not show.
 */
export function staleSideSeats(liveSeats, layoutPanes) {
  if (!layoutPanes?.length) return []
  const live = new Set(layoutPanes.map((p) => p.pane_id))
  return liveSeats.filter((s) => isSideSeat(s) && !live.has(s.paneId))
}

/** How long a run's sidebar tokens live without a refresh (issue #19). Each per-round record write
 *  republishes them, so a live run never blinks out; a run that dies stops writing and its row
 *  clears itself within the hour instead of sitting stale forever. An hour rather than the ten
 *  minutes the issue's probe used, because a single wave can outlast ten minutes between writes. */
/**
 * How many of `expected` results a pool never produced. The mutation gate's own guard against the
 * defect it exists to catch, one level up: a pool that silently runs nothing leaves every slot
 * undefined and the gate would otherwise print "all N repairs are pinned" having executed no suite
 * at all. A red team demonstrated exactly that by substituting a pool that returned [] without
 * invoking its callback, and got `exit=0` with zero suites run.
 *
 * Pure, so a clause and a mutation can pin it; the gate's wiring of it cannot be pinned by the gate
 * itself, which is the honest limit of a harness that tests with the machinery it is testing.
 */
export const poolShortfall = (results, expected) =>
  Math.max(0, expected - results.filter((r) => r !== undefined).length)

/**
 * How many times a mutation's anchor text occurs in its file. The gate requires exactly one: it
 * tested only PRESENCE and then replaced the FIRST hit, so an anchor that came to appear twice would
 * mutate one site, leave the other intact, and pass — a mutation that guards half of what it names
 * reports the same "ok" as one that guards all of it.
 */
export const anchorCount = (text, from) => text.split(from).length - 1

/**
 * What the gate does with an anchor that occurred `hits` times. Pure so that a clause and a mutation
 * can reach the DECISION: `anchorCount` alone only counts, and a runner that kept counting correctly
 * while comparing wrongly — `hits === 0` in place of `hits !== 1` — accepted duplicate anchors again
 * with the counter's own clause and mutation still green. That regression is now one mutation away
 * from red. What remains unpinnable is the single `if` in dctr-mutations.mjs that consumes this, for
 * the reason poolShortfall's block gives: the gate cannot mutate the file it runs from.
 */
export const anchorVerdict = (hits) => (hits === 1 ? 'apply' : hits === 0 ? 'missing' : 'ambiguous')

export const TOKEN_TTL_MS = 3600000

/** How often a running gate re-names its pane with elapsed time (user ruling, 2026-09-07: a long
 *  gate must show where it is). Overridden by DCTR_ELAPSED_MS so a fixture asserts a condition
 *  instead of sleeping on the production interval. */
export const ELAPSED_MS = 10000

/** A running gate's pane name: the launcher's label plus elapsed time. Elapsed counts UP rather
 *  than down because the launcher is generic and cannot know a check's total without imposing an
 *  output format on every check it runs. */
export const elapsedLabel = (label, ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${label} · ${s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`} elapsed`
}

/** The codex watcher's two intervals: how often it drains the job's log, and how often it re-reads
 *  the job record to see whether the job has left running. POLL_MS alone is overridable, by
 *  DCTR_POLL_MS, for the same reason as ELAPSED_MS. PUMP_MS is NOT: an override existed briefly,
 *  nothing needed it, and no clause could show whether it was honoured. */
export const PUMP_MS = 250
export const POLL_MS = 2000

/**
 * Run `fn` over `items` with at most `limit` in flight, results in INPUT order.
 *
 * Written for the mutation gate, whose mutations each work on their own copy of the tree and so were
 * always independent — they were merely run one at a time, for 17 minutes. Order is preserved
 * because a caller lines results up against the input by index; completion order would silently
 * mis-attribute a mutation's verdict to its neighbour, which is worse than being slow.
 *
 * `next++` is the whole synchronisation: JavaScript is single-threaded between awaits, so no two
 * workers can read the same index. Pinned by clauses 1aj, 1ak, 1al and 3u in dctr-seat.selftest.mjs.
 */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i], i)
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number.isFinite(limit) ? limit : 1, items.length)) }, worker))
  return results
}


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

/** Filename-safe token for an id: `w66:p18` -> `w66_p18`, an agent_id passes through unchanged.
 *  The contained hook names a request file by the subagent's `agent_id` (unique per seat, no herdr
 *  pane exists to name it by); the host watcher and `agent-shell view` rebuild the same token from
 *  the token the watcher carries, so the mapping must be deterministic. Every char outside
 *  `[A-Za-z0-9_-]` becomes `_`, so no traversal or separator survives into the filename. */
export const paneToken = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_')

/** Where a request lives. The dir is a container mount point the launcher chose, never user input;
 *  the id is tokenised so the leaf cannot escape it. */
export const viewRequestPath = (dir, id) => `${String(dir).replace(/\/+$/, '')}/view-${paneToken(id)}.json`

/** The request body the host-side viewer validates before it execs anything. Every field is a
 *  claim, not an instruction: the host checks the container against its own docker inspect and the
 *  paths against its own rules before any of this reaches an argv. `role` is display metadata only;
 *  neither the validator nor today's watcher reads it, and a host viewer that ever does must treat
 *  it as untrusted text (a label, never a path or command). */
export const viewRequest = (containerId, rendererPath, transcriptPath, role) =>
  ({ container_id: containerId, renderer_path: rendererPath, transcript_path: transcriptPath, role })

/**
 * The container's own 64-hex id, parsed from a /proc/self/mountinfo listing — the hostname trick is
 * not enough because compose files may set `hostname:`. Docker bind-mounts /etc/hostname et al from
 * `/var/lib/docker/containers/<id>/`, so the id rides every such line. Null when the text carries
 * none, which the caller treats as "not in a docker container" and falls back to os.hostname().
 */
export function containerIdFromMountinfo(text) {
  const m = String(text).match(/\/containers\/([0-9a-f]{64})\//)
  return m ? m[1] : null
}

/**
 * The split that creates a seat's side pane. The first side seat splits the session's pane right at
 * SIDE_RATIO, founding the column; each later one splits the **tallest** side pane down. Tallest,
 * not newest: stacking under the newest halves the same pane every time and a six-seat column comes
 * out 28/14/7/4/2/1 rows (measured), while splitting the tallest keeps the skew within a factor of
 * two and re-balances by itself when a mid-column seat closes and donates its rows to a neighbour.
 * `layoutPanes` is the observed layout (pane_id + rect); without it the newest side pane stands in.
 * `--no-focus` for the same reason as the tab path: a seat must never steal the user's cursor.
 */
export function splitArgs(liveSeats, sessionPaneId, layoutPanes, cwd) {
  const side = liveSeats.filter(isSideSeat)
  if (!side.length) {
    return ['pane', 'split', sessionPaneId, '--direction', 'right', '--ratio', String(SIDE_RATIO), '--no-focus', ...seatEnvArgs(), ...cwdArgs(cwd)]
  }
  let target = side[side.length - 1]
  if (layoutPanes?.length) {
    const height = new Map(layoutPanes.map((p) => [p.pane_id, p.rect?.height ?? 0]))
    target = side.reduce((a, b) => ((height.get(b.paneId) ?? 0) > (height.get(a.paneId) ?? 0) ? b : a))
  }
  return ['pane', 'split', target.paneId, '--direction', 'down', '--no-focus', ...seatEnvArgs(), ...cwdArgs(cwd)]
}

/** What the stand-down line calls a throw. execFileSync errors carry `spawnargs`; a ReferenceError
 *  or TypeError from this code does not, and calling one "herdr refused an action" sent a reader
 *  to the herdr log for a defect in the hook. */
export const errorLabel = (e) => (e && e.spawnargs ? 'herdr refused an action' : 'hook error')

/** The seat's pane name: type plus the Agent tool's description, which is the status-line title
 *  (Scott's ruling, 2026-09-07). The counter stands in when the harness wrote no description. */
export const paneLabel = (type, description, n) => `${slug(type)} · ${description || n}`

/** Where the harness writes a seat's spawn metadata (`{agentType, description, toolUseId,
 *  spawnDepth}`): beside the seat transcript, `.meta.json` in place of `.jsonl`. */
export const metaPath = (transcriptPath) => (transcriptPath ? transcriptPath.replace(/\.jsonl$/, '.meta.json') : null)

/** The role the codex plugin's rescue subagent dispatches under. Its SubagentStop fires when the
 *  wrapper returns, about a minute in, while the codex job it started runs on for as long as an
 *  hour; the seat's pane follows the job rather than the wrapper. */
export const CODEX_ROLE = 'codex:codex-rescue'

/**
 * Is a codex job's status terminal? A record that cannot be read is NOT terminal, deliberately:
 * the watcher in dctr-seat.mjs --codex-tail treats an unreadable record as "keep waiting", and a
 * close-on-next that read a failed read as "finished" would destroy the one pane showing what the
 * job was doing, at the moment it became hardest to find out.
 */
export const codexTerminal = (status) => Boolean(status) && status !== 'running' && status !== 'queued'

/**
 * Which finished codex panes to close when the NEXT codex seat is placed (Scott's ruling,
 * 2026-09-07: a finished codex pane stays until the next codex seat is placed, then closes; a
 * focused pane still stays — the same relabel-vs-close courtesy every other seat gets).
 *
 * Each candidate is `{ seat, status, focused }`; the hook gathers those, this decides. A seat with
 * no `codexJob` was never handed to a watcher and is not a candidate at all: an ordinary seat's
 * pane is closed by its own SubagentStop and must never be swept by somebody else's placement.
 *
 * `focused === false`, never `focused !== true`. The caller cannot always answer: a `pane get` that
 * FAILED leaves focus unknown, and unknown must not read as unfocused. The one pane that costs is
 * the focused one, the pane the user is watching — which is the same trap the ordinary stop path
 * fell into and documents at length. Only a definite "not focused" closes anything.
 * Pinned by clauses 1am, 1an and 3v in dctr-seat.selftest.mjs.
 */
export const codexPanesToClose = (candidates) =>
  candidates.filter((c) => c.seat?.codexJob && codexTerminal(c.status) && c.focused === false).map((c) => c.seat)

/**
 * The codex job a stopping seat started: the newest record for this workspace created at or after
 * `notBefore` (epoch ms), or null. Newest, because the plugin writes an acknowledgement record and
 * then the real one for a single dispatch; by workspace, because every session on the host writes
 * into one state directory; by time, because the directory keeps every job ever run there.
 */
export function codexJobMatch(records, cwd, notBefore) {
  const mine = records.filter((r) => r && r.workspaceRoot === cwd && Date.parse(r.createdAt) >= notBefore)
  if (!mine.length) return null
  return mine.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a))
}

/** The role a long native check is registered under. It shares the seat markers, the cap and the
 *  lock, so a wave arriving while a gate runs stacks beside it instead of founding a second column. */
export const GATE_ROLE = 'gate'

/**
 * The line typed into the gate's pane: this script in `--run` mode, which runs the check, tees its
 * output to `out`, appends `exit=N`, then relabels or closes the pane and drops the marker. Every
 * argument goes through shq, one per argv element, so `bash -c "a; b"` reaches `--run` as the three
 * arguments the caller gave and not one flattened string (the first live use lost its quoting this
 * way). `paneId` is empty on the detached path, and `--run` then touches no pane.
 */
export const gateRunCommand = (script, out, marker, paneId, label, command) =>
  `node ${shq(script)} --run ${shq(out)} ${shq(marker)} ${shq(paneId || '')} ${shq(label)} -- ${[].concat(command).map(shq).join(' ')}`

/** The last line the output file ends with; the orchestrator's completion signal and the record's
 *  exit status in one. A file without it is a check still running, or one that never finished. */
export const exitLine = (code) => `exit=${code === null || code === undefined ? 'signal' : code}`
