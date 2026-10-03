import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { wrapperValue, parseRecord, unwrapLine } from './dctr-record.mjs'
import { RESUME_MARK, carriesMark } from './dctr-promptgate.mjs'

// Shared decisions for doctrine's hooks: the herdr seat visibility (issue #17), the restore hook's kickoff chain
// (E8-D1) and the context gauge (E8-D4, E8-D10, E8-D11).
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
/** doctrine-project's ID and phase-name pattern: short enough to publish as a sidebar token unchanged. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/

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
 *
 * A PARTIALLY observed layout is not an observed one. An entry carrying no `pane_id` puts
 * `undefined` in the live set and every real pane then fails the `has`, so a reply with one
 * incomplete entry declares EVERY live side seat stale — and both callers unlink those markers with
 * no existence lookup, so the panes leak and the cap goes wrong. Emptiness was already read as "I
 * could not look"; this reads partiality the same way, which is the same distinction the herdr
 * readers make everywhere else in these files.
 */
export function staleSideSeats(liveSeats, layoutPanes) {
  if (!layoutPanes?.length) return []
  if (!layoutPanes.every((p) => p && typeof p.pane_id === 'string' && p.pane_id)) return []
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

/**
 * What one suite run told the mutation gate about the mutation it was given.
 *
 *   noticed  it exited non-zero AND printed a FAIL line: a clause went red.
 *   clean    it exited 0: every clause held with the repair reverted.
 *   silent   it exited non-zero and printed no FAIL line: the MUTATION killed it (an import-time
 *            SyntaxError prints none), which is not a clause noticing anything.
 *   error    it never rendered a verdict at all: the spawn itself failed (`code` is an errno string
 *            such as EAGAIN, not an exit status) or a signal killed it (`code` is then null, which
 *            is why one test on `code` covers both and there is no second test on `signal`; the
 *            selftest's fixtures read a real SIGKILL and a real failed spawn to hold that). Says
 *            NOTHING about the mutation either way.
 *
 * The last one is the split this function exists for. The gate read `error` as `silent` and `silent`
 * as "the clause stayed green", so a run at eight workers beside live seats reported three repairs
 * unpinned that a re-run on the same tree reported pinned (2026-09-13, o3-mutations.out against
 * o3-mutations2.out). A harness that could not start a check must not file a verdict on it.
 */
export const suiteOutcome = ({ code, out }) =>
  (typeof code !== 'number' ? 'error'
    : code === 0 ? 'clean'
      : /^ *FAIL /m.test(String(out ?? '')) ? 'noticed' : 'silent')

export const TOKEN_TTL_MS = 3600000

/** How often a long run reports where it is (user ruling, 2026-09-07: a long gate must show where it
 *  is). Two users: the launcher re-names its pane with elapsed time, and the mutation gate prints a
 *  progress line. Overridden by DCTR_ELAPSED_MS so a fixture asserts a condition instead of sleeping
 *  on the production interval. */
export const ELAPSED_MS = 10000

/** A running gate's pane name: the launcher's label plus elapsed time. Elapsed counts UP rather
 *  than down because the launcher is generic and cannot know a check's total without imposing an
 *  output format on every check it runs. */
export const elapsedLabel = (label, ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${label} · ${s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`} elapsed`
}

/**
 * One progress line for a pool that releases its results in input order (issue #62).
 *
 * Such a pool is silent for as long as its slowest EARLY item takes, however much work is finishing
 * behind that item, so its pane shows one line for minutes and reads as hung. What distinguishes
 * working from hung is WHICH items are in flight and for how long: the mutation gate's slowest suite
 * sleeps on real timing waits at 0% CPU, so a process list cannot tell you either. The settled count
 * beside it is a different number and is worth printing for that reason: it rises as workers finish
 * behind the blocked item, while nothing at all is released.
 *
 * `inflight` is whatever is running now, each with the clock time it started. The oldest is the one
 * worth naming, since it is the item holding the line back.
 */
export const progressLine = (settled, total, inflight, now) => {
  const running = [...inflight].filter((x) => x && Number.isFinite(x.started))
  const head = `  · ${settled}/${total} settled`
  if (!running.length) return `${head}, none running`
  const oldest = running.reduce((a, b) => (b.started < a.started ? b : a))
  return `${head}, ${running.length} running, oldest ${elapsedLabel(oldest.label, now - oldest.started)}`
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
 * `epic`, `phase` and `owed` (doctrine-project) add `$epic`, `$phase` and the `·owed` suffix to the
 * same call; with none given the argv is unchanged. dctr-token.mjs validates the values.
 */
export const metadataTokenArgs = (paneId, round, exitCount, valve, { epic, phase, owed } = {}) =>
  ['pane', 'report-metadata', paneId, '--source', 'custom:doctrine',
    '--token', `doctrine=r${round}·e${exitCount}·v${valve}${owed ? '·owed' : ''}`,
    ...(epic ? ['--token', `epic=${epic}`] : []),
    ...(phase ? ['--token', `phase=${phase}`] : []),
    '--ttl-ms', String(TOKEN_TTL_MS)]

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
 * What SessionEnd does with one of the ending session's markers (E8-R13: the sweep skips running
 * gates). A gate whose `<file>.result` does not exist yet is still running, and closing its pane
 * would kill the check, so its marker MOVES to the unowned gate directory and its pane is left
 * alone. Everything else closes, a finished gate included. The caller reads the file; this decides.
 */
export const sweepAction = (seat, resultExists) => (seat?.detached ? 'leave' : seat?.role === GATE_ROLE && !resultExists ? 'move' : 'close')

/** The name a moved gate marker takes in the unowned directory. Gate names are allocated per session,
 *  so two sessions' `dctr-gate-1.json` moved under their bare names would overwrite each other (F4). */
export const movedGateName = (sessionId, name) => `${sessionId}.${name}.json`

/**
 * Whether a placement drops a moved gate marker, from a SERVER-WIDE lookup of its pane or tab:
 * `'found'`, `'not_found'` or `'failed'`. Only an observed absence drops it. A lookup that failed is
 * "I could not look", and a found pane is a gate still on screen somewhere, which a layout cannot
 * say: the moved marker may belong to a pane in another tab, and a tab gate's root pane is in no
 * layout at all (F3). Never judged from a layout.
 */
export const movedGateVerdict = (answer) => (answer === 'not_found' ? 'drop' : 'keep')

/**
 * The line typed into the gate's pane: this script in `--run` mode, which runs the check, tees its
 * output to `out`, writes the verdict to `<out>.result` (never into `out` itself, Scott's ruling
 * 2026-09-11), then relabels or closes the pane. It does NOT then drop the
 * marker, and said it did until 2026-09-08: a relabelled pane keeps its record because the user is
 * watching it, and a closed one keeps it because the close call kills this shell and a close that
 * failed must leave SessionEnd something to act on. An observed-absent pane drops it, and so does a
 * completion that was handed no pane and no tab at all, which is the detached path's own shape and
 * has no marker to drop. Every
 * argument goes through shq, one per argv element, so `bash -c "a; b"` reaches `--run` as the three
 * arguments the caller gave and not one flattened string (the first live use lost its quoting this
 * way). `paneId` is empty on the detached path, and `--run` then touches no pane.
 */
/** `tabId` and `workspace` are carried because the completion path runs INSIDE the pane, whose shell
 *  starts with a fresh environment: `HERDR_WORKSPACE_ID` is not there, and `tab list --workspace` is
 *  the only tab read this codebase has. Deriving the workspace from the tab id's prefix was rejected
 *  on evidence — dctr-seat.selftest.mjs runs workspace `w4W` with tab ids `w4Z:t9`, so the prefix is
 *  not the workspace id even here, and `workspaceOf` in dctr-pane.mjs only ever compares two ids
 *  with it. For a side-column gate `tabId` is empty and the WORKSPACE IS NOT: the launcher passes
 *  HERDR_WORKSPACE_ID on both paths, and only the empty tab id is what sends the completion down the
 *  pane branch. */
export const gateRunCommand = (script, out, marker, paneId, tabId, workspace, label, command) =>
  `node ${shq(script)} --run ${shq(out)} ${shq(marker)} ${shq(paneId || '')} ${shq(tabId || '')} ${shq(workspace || '')} ${shq(label)} -- ${[].concat(command).map(shq).join(' ')}`

/** The one line the gate's RESULT file starts with, `<out>.result`, which the launcher alone writes
 *  and only at completion. Its existence is the orchestrator's completion signal and its first line
 *  the check's exit status. It is never written into the transcript: a check's own output printing
 *  `exit=0` ended the old in-transcript wait while the check was still running. */
export const exitLine = (code) => `exit=${code === null || code === undefined ? 'signal' : code}`

// ---------------------------------------------------------------- session restore (E8-D1, E8-D1b)

/** Why the restore hook stands down, or null when it acts: only on SessionStart after /clear, in the main
 *  session. A subagent's event carries `agent_id`, whatever its value; every other source (startup, resume, compact) is left
 *  alone (E8-D1b). */
export function restoreSkip(p) {
  if (!p || p.hook_event_name !== 'SessionStart') return `not a SessionStart event (${p?.hook_event_name || 'none'})`
  if (p.source !== 'clear') return `source is ${p.source || 'missing'}, not clear`
  if ('agent_id' in p) return 'a subagent event'
  if (!p.session_id) return 'no session_id in the payload'
  return null
}

/** The `handoff:` path from the first line of `## Next Session Kickoff` that has the machine shape
 *  `handoff: <path> | state: <word>` (doctrine-backup), backticks stripped, or null for `none`, for no
 *  kickoff section, and for a kickoff with no such line: a `handoff:` line without its `| state:` half is not
 *  the machine line and selects nothing. */
export function kickoffHandoff(memoryText) {
  const lines = String(memoryText ?? '').split('\n')
  const at = lines.findIndex((l) => /^##\s+Next Session Kickoff\s*$/i.test(l.trim()))
  if (at < 0) return null
  for (const l of lines.slice(at + 1)) {
    if (/^##\s/.test(l)) return null
    const m = /^handoff:\s*`?([^`|\s]+)`?\s*\|\s*state:/i.exec(l.trim())
    if (m) return m[1].toLowerCase() === 'none' ? null : m[1]
  }
  return null
}

/** The header lines of a handoff, above its first `##` section (doctrine step 5, doctrine-handoff step 3),
 *  whether they sit above or below the file's `#` title. Each value is the first word after the key, as the hub
 *  states the forms: backticks, quotes, `*` and a trailing comma, semicolon or period stripped; for `record:` a
 *  trailing `:<line>` cut off too; `wrapper:` read as a record's wrapper line is. The first line for each key wins.
 *  A key may be bold or a list item. Each null when absent. */
export function handoffHeader(text) {
  const out = { phase: null, record: null, wrapper: null }
  for (const raw of String(text ?? '').split('\n')) {
    if (/^##\s/.test(raw.trim())) break
    const m = /^(?:-\s+)?(?:\*\*)?(phase|record|wrapper)(?:\*\*)?:(?:\*\*)?\s*(.*)$/i.exec(raw.trim())
    if (!m) continue
    const key = m[1].toLowerCase(), v = m[2].trim()
    if (out[key] !== null) continue
    const tok = v.split(/\s+/)[0].replace(/[`'"*]/g, '').replace(/[.,;]+$/, '')
    if (key === 'phase') {
      out.phase = tok || null
    } else if (key === 'record') {
      out.record = tok.replace(/:\d+$/, '') || null
    } else {
      out.wrapper = wrapperValue(tok)
    }
  }
  return out
}

/** The state the restore hook acts on: `Open` or `Blocked` as the first word of a state entry's value, else
 *  null (scope choice SC1: any other state injects nothing). */
export const restoreState = (value) => /^(Open|Blocked)\b/i.exec(value || '')?.[1] || null

/** The record a handoff names, resolved in this order, the first that exists (scope choice SC2): absolute
 *  as written; relative to the project dir; relative to its parent, the sibling-repo form a handoff uses
 *  for a companion tracking repo. `exists` is injected so this stays pure. Null when none exists. */
export function resolveRecordPath(ref, projectDir, exists) {
  if (!ref) return null
  const tries = path.isAbsolute(ref) ? [ref] : [path.resolve(projectDir, ref), path.resolve(projectDir, '..', ref)]
  return tries.find((p) => exists(p)) || null
}

/**
 * The kickoff chain the restore hook and the gauge both follow (Q1): SESSION_MEMORY.md in the project dir, its
 * kickoff `handoff:` line, that handoff's `record:` header line, the record, and the record's last state line,
 * which must read Open or Blocked. `read(file)` returns a file's text or throws, `exists(file)` says whether a path
 * exists; both are injected so this stays pure. Returns `{ handoffPath, header, recordPath, record, state }`, or
 * `{ why }` naming where the chain stopped, which the caller reports as its stand-down reason.
 */
export function followKickoff({ projectDir, read, exists }) {
  const load = (file, what) => {
    try { return { text: read(file) } } catch (e) { return { why: `could not read the ${what} ${file} (${e.code || e.message})` } }
  }
  const memory = load(path.join(projectDir, 'SESSION_MEMORY.md'), 'memory file')
  if (memory.why) return memory
  const handoffRef = kickoffHandoff(memory.text)
  if (!handoffRef) return { why: 'the kickoff names no handoff' }
  const handoffPath = path.resolve(projectDir, handoffRef)
  const handoff = load(handoffPath, 'handoff')
  if (handoff.why) return handoff
  const header = handoffHeader(handoff.text)
  if (!header.record) return { why: `the handoff ${handoffPath} names no record` }
  const recordPath = resolveRecordPath(header.record, projectDir, exists)
  if (!recordPath) return { why: `the record ${header.record} named by ${handoffPath} was not found` }
  const loaded = load(recordPath, 'record')
  if (loaded.why) return loaded
  const record = parseRecord(loaded.text)
  const state = restoreState(record.state?.value)
  if (!state) return { why: `the record ${recordPath} last state line reads ${record.state ? `"${record.state.value}"` : 'nothing'}, not Open or Blocked` }
  return { handoffPath, header, recordPath, record, state }
}

/** The restore hook's text is under this many characters, far inside the harness's 10,000 cap. */
export const RESTORE_MAX = 2000

/** The facts a cleared session is handed (E8-D1): the phase, the record's path, its last state line quoted,
 *  the wrapper, and the handoff. Facts only, never orders: imperative text is shown to the user instead of
 *  used. Over RESTORE_MAX the quoted state line is cut first, then the whole. */
export function restoreContext({ phase, state, stateLine, recordPath, wrapper, handoffPath }) {
  const build = (q) => [
    `doctrine restore: this session was cleared while doctrine phase ${phase || '(unnamed in the handoff)'} was ${state}.`,
    `The phase record is ${recordPath}; its last state line reads: "${q}".`,
    wrapper && wrapper.toLowerCase() === 'none' ? 'The phase runs under no wrapper (wrapper: none).'
      : `The phase runs under wrapper ${wrapper ? `doctrine:${wrapper}` : '(none named in the record or the handoff)'}.`,
    `The current handoff is ${handoffPath}.`,
    'The record is the authority for phase state; doctrine-resume reads it and routes on it.',
  ].join(' ')
  const full = build(stateLine)
  if (full.length < RESTORE_MAX) return full
  const room = Math.max(0, stateLine.length - (full.length - RESTORE_MAX) - 2)
  const cut = build(`${stateLine.slice(0, room)}…`)
  return cut.length < RESTORE_MAX ? cut : cut.slice(0, RESTORE_MAX - 1)
}

// ---------------------------------------------------------------- context gauge (E8-D4, E8-D21, E8-D10, E8-D11)

/** Why the gauge stands down, or null when it acts: only on PostToolBatch in the main session. A seat's batch
 *  carries `agent_id` and the parent's session id, so it is filtered before anything is read or written (E8-D21). */
export function gaugeSkip(p) {
  // Codex has no PostToolBatch: its main-session PostToolUse events stand in for it (E10 adaptation table), and the
  // gauge reads each token_count once (readUsage's stale reading), so the PostToolUse events after one are one batch.
  const batch = p?.hook_event_name === 'PostToolBatch' || (p?.hook_event_name === 'PostToolUse' && hostOf(p) === 'codex')
  if (!p || !batch) return `not a PostToolBatch event (${p?.hook_event_name || 'none'})`
  if ('agent_id' in p) return 'a seat batch (agent_id present)'
  if (!p.session_id) return 'no session_id in the payload'
  if (!p.transcript_path) return 'no transcript_path in the payload'
  return null
}

/** The record's last `auto-cycle` on or off entry, or null (E8-R10: auto-cycle is on only while that entry is on). */
export const lastOnOffEntry = (entries) =>
  (entries || []).filter((e) => e.kind === 'auto-cycle' && (e.sub === 'on' || e.sub === 'off')).at(-1) || null

/**
 * The used tokens from a transcript's text (E8-D10): the last main-thread assistant entry whose usage totals more
 * than zero, read as that one entry's input plus cache tokens, never summed across the repeated entries of one
 * response. Sidechain, API-error and zero-total entries are skipped, and so is a line that does not parse (a
 * truncated tail). `{ used, uuid, at }`, or `{ unknown }`: `missing` for no text, `unparseable` for no such entry,
 * `stale` when that entry is the one the latch saw at the previous batch (SC2).
 */
export function readUsage(transcriptText, lastUuid, host = 'claude') {
  if (transcriptText === null || transcriptText === undefined) return { unknown: 'missing' }
  if (host === 'codex') return readCodexUsage(transcriptText, lastUuid)
  const ls = String(transcriptText).split('\n')
  for (let i = ls.length - 1; i >= 0; i--) {
    let e
    try { e = JSON.parse(ls[i]) } catch { continue }
    const u = e?.message?.usage
    if (e?.type !== 'assistant' || !u || e.isSidechain === true || e.isApiErrorMessage) continue
    const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
    if (used <= 0) continue
    if (lastUuid && e.uuid === lastUuid) return { unknown: 'stale' }
    return { used, uuid: e.uuid, at: e.timestamp || null }
  }
  return { unknown: 'unparseable' }
}

/** The handoff cost the floor adds to a session's first reading (SC5): the tokens from the gauge's warning to the
 *  ready line, as E8-D22's opus drive in E8-X1 measured them: 64,268, rounded up to the thousand (E8-R42). With a
 *  doctrine gate step in flight the same span ran 47,538 to 91,687 (the E8-D12 runs), which the floor does not bound:
 *  a tier is safe only where it leaves the window room for that span, which the 90% check does not know. */
export const HANDOFF_COST_TOKENS = 65000

/**
 * The tier the gauge warns at (E8-D11): `<n>` tokens, `<n>%` of the window, or `default`, which is 60% of it
 * (SC4). `tierText` in the result is the tier as resolved, which the warned line carries (SC9): the percent as
 * written, `60%` for the default, the number for a token tier or a raised floor. Every error is named, and the
 * caller reports each on every batch. The 90% check reads the tier after any floor raise. A tier below the floor, the session's first reading plus `handoffCost`
 * (SC5), is raised to the floor; an unknown window leaves a percent or default tier unresolved (SC3).
 */
export function resolveTier({ tierText, window, firstUsed, handoffCost }) {
  const text = tierText ?? 'default'
  const errors = []
  const win = Number.isFinite(window) && window > 0 ? window : null
  if (!win) errors.push('window unknown')
  let tier = null, label = text
  const pct = text === 'default' ? 60 : /^(\d+)%$/.exec(text)?.[1]
  if (pct !== undefined) {
    label = `${Number(pct)}%`
    if (win) tier = Math.round((win * Number(pct)) / 100)
  } else if (/^\d+$/.test(text)) {
    tier = Number(text)
  } else {
    errors.push(`malformed tier "${text}"`)
    return { tier: null, tierText: text, errors }
  }
  if (tier !== null && Number.isFinite(firstUsed)) {
    const floor = firstUsed + handoffCost
    if (tier < floor) {
      errors.push(`tier ${tier} below the floor ${floor}, raised to the floor`)
      tier = floor
      label = String(floor)
    }
  }
  // Read after the floor raise, so a floor above 90% of the window is reported too.
  if (win && tier !== null && tier > win * 0.9) errors.push('configuration error: the auto-cycle tier set in the record is above 90% of the window, not a reading of context use')
  return { tier, tierText: label, errors }
}

/** The latch as this session's own, or null: a latch left by another session id in the same directory is nobody's. */
export const ownLatch = (latch, sessionId) => (latch && latch.session_id === sessionId ? latch : null)

/** The session's first reading (SC5): the latch's where it has one, else this batch's reading, else null while unknown. */
export const firstUsedOf = (latch, reading) => latch?.firstUsed ?? (reading?.unknown ? null : reading?.used ?? null)

/**
 * One batch's decision (E8-D4, E8-D10, SC2, SC7, SC10). The latch is per session id: another id's latch is
 * replaced by a fresh one. A good reading records the first reading and the entry seen, resets the unknown run,
 * and warns the first time used tokens reach the tier. An unknown reading is a fact, and the third in a row warns
 * with `unknown`. Once warned, a session never warns again. `warnedInRecord` is true when the record already
 * carries an `auto-cycle: warned` line for this session id; it counts as warned whatever the latch says, so a latch
 * write that failed never produces a second warning or a second line. Pure: the caller writes the latch it returns.
 */
export function gaugeStep({ latch, reading, tier, tierText, sessionId, warnedInRecord = false }) {
  const own = ownLatch(latch, sessionId)
  const l = own ? { ...own } : { session_id: sessionId, firstUsed: null, lastUuid: null, unknownRun: 0, warned: false, warnedTier: null }
  if (warnedInRecord) l.warned = true
  const facts = []
  let crossed = false, label = null
  if (reading.unknown) {
    l.unknownRun += 1
    facts.push(`the context reading is unknown (${reading.unknown}), reading ${l.unknownRun} in a row`)
    if (l.unknownRun >= 3) { crossed = true; label = 'unknown' }
  } else {
    l.unknownRun = 0
    l.lastUuid = reading.uuid
    l.firstUsed = firstUsedOf(l, reading)
    if (tier !== null && tier !== undefined && reading.used >= tier) { crossed = true; label = tierText }
  }
  const warn = crossed && !l.warned
  if (warn) { l.warned = true; l.warnedTier = label }
  return { latch: l, warn, warnedTier: warn ? label : null, facts }
}

/** The gauge's text is at most this many characters (SC8). */
export const GAUGE_MAX = 1000

/**
 * The additionalContext the gauge hands the main session (SC8): with `warn`, the reading, the window (or unknown),
 * the percent where known and the tier as resolved, then the actions doctrine step 5 states for the warning, one
 * sentence each and pointing at step 5 as their source, both ready-line placements included (E8-D12, SC14); then
 * every fact. Facts, never orders. Over GAUGE_MAX the facts are cut first, so the warning survives whole.
 */
export function gaugeContext({ warn = false, used, window, tier, tierText, facts = [] }) {
  const win = Number.isFinite(window) && window > 0 ? window : null
  const windowText = win ? `${win}-token context window` : 'context window of unknown size'
  const head = !warn ? '' : [
    Number.isFinite(used)
      ? `doctrine gauge: this session has used ${used} tokens of a ${win ? `${windowText} (${Math.round((used / win) * 100)}%)` : windowText}, reaching the auto-cycle tier ${tierText}${Number.isFinite(tier) && String(tier) !== tierText ? ` (${tier} tokens)` : ''}.`
      : `doctrine gauge: three context readings in a row were unknown, so the used tokens of a ${windowText} are unknown and the auto-cycle warning fires as tier unknown.`,
    'Doctrine step 5 states what follows this warning while auto-cycle is on.',
    'No new wave, round or repair is started.',
    'The seats already out are waited for.',
    'Their returns are integrated and their record lines written.',
    'The record\'s state line is written next.',
    'doctrine-handoff is run after that.',
    'The ready line `- auto-cycle: ready` is appended to the record.',
    'The turn ends with `auto-cycle: ready` as the last line of the assistant message.',
  ].join(' ')
  const tail = facts.length ? `doctrine gauge facts: ${facts.join('; ')}.` : ''
  const full = [head, tail].filter(Boolean).join(' ')
  if (full.length <= GAUGE_MAX) return full
  if (!head) return full.slice(0, GAUGE_MAX - 1) + '…'
  const room = GAUGE_MAX - head.length - 2
  return room > 0 ? `${head} ${tail.slice(0, room)}…`.slice(0, GAUGE_MAX) : head.slice(0, GAUGE_MAX)
}

// ---------------------------------------------------------------- auto-cycle (E8-D7, E8-D15, E8-D16, E8-D17, E8-D18, E8-D26)

/** The file that stops auto-cycle, looked for in the session's repo and in the record's repo; either stops (Q1). */
export const STOP_FILE = '.doctrine/auto-cycle.stop'
/** The last line of the assistant message that says the handoff is done and the session may be cleared. */
export const READY_LINE = 'auto-cycle: ready'
export const RESUME_COMMAND = '/doctrine:doctrine-resume'
export const RESUME_ARGS = RESUME_MARK
/** What the typer types after /clear (E8-R24, E8-R32): the doctrine-resume skill's slash command, so the new session
 *  runs doctrine-resume, with an argument saying it is not a ruling. */
export const RESUME_LINE = `${RESUME_COMMAND} ${RESUME_ARGS}`
/**
 * The prompt gate's decision (E10 S1, dctr-promptgate.mjs) over one UserPromptSubmit: `prompt` and `session` from the
 * payload, `pane` the HERDR_PANE_ID, `restored` the session id this pane's restore file names, or null, `raw` the
 * payload's text. A line is marked when `prompt` carries RESUME_MARK or `raw` does (carriesMark: in its text or any
 * string once decoded); an unmarked one passes, and a marked one
 * whose `prompt` is not a string is blocked. A marked one passes only when the restore file names this session, which
 * is the session the auto-cycle's /clear started; it is blocked with no pane, no session id, no restore file, or one
 * naming another session. Returns `{ act: 'pass' | 'block', reason }`.
 */
export function promptGate({ prompt, session, pane, restored, raw }) {
  const block = (why) => ({ act: 'block', reason: `doctrine auto-cycle: not sent, ${why}` })
  const marked = (typeof prompt === 'string' && prompt.includes(RESUME_MARK)) || carriesMark(raw)
  if (!marked) return { act: 'pass', reason: 'not a line the auto-cycle typed' }
  if (typeof prompt !== 'string') return block('the payload is marked but its prompt is not text the gate can read')
  if (!pane) return block('this session has no herdr pane')
  if (!session) return block('the prompt names no session')
  if (!restored) return block('no session was started in this pane by the auto-cycle\'s /clear')
  if (restored !== session) return block(`the auto-cycle's /clear started session ${restored} in this pane, not this one`)
  return { act: 'pass', reason: 'the session the auto-cycle\'s /clear started' }
}
/** What the Stop hook prints in the pane when it launches the typer (E8-R23). */
export const LAUNCH_MESSAGE = 'doctrine auto-cycle: will type /clear and resume here once you move focus off this pane'
/** The sidebar token's source and lifetime (E8-R23): its own source, apart from the orchestrator's custom:doctrine. */
export const AUTOCYCLE_SOURCE = 'custom:autocycle'
export const AUTOCYCLE_TTL_MS = 24 * 3600 * 1000
/** How much of a pause reason the sidebar token carries. */
export const TOKEN_REASON_MAX = 40

/**
 * The pause reasons and what to do about each, verbatim from the D2 table (Scott). Each paused line is
 * `auto-cycle paused: <reason>`; the pane message and the toast add the action. A reason already written is
 * recognised by `match` where the reason carries an argument, and by equality where it carries none, so an alert
 * raised for a line another process wrote still names its action.
 */
export const PAUSES = {
  R1: { reason: (repo) => `stopped by .doctrine/auto-cycle.stop in ${repo}`, action: 'delete it, then /clear and type resume', match: /^stopped by \.doctrine\/auto-cycle\.stop in / },
  R2: { reason: (line) => `phase Blocked: ${line}`, action: 'answer in the pane', match: /^phase Blocked: / },
  R3: { reason: (which) => `${which} alarm fired, ruling needed`, action: 'rule in the pane', match: /^(round|time) alarm fired, ruling needed$/ },
  R4: { reason: (q) => `open question ${q.id}: ${q.text}`, action: 'answer in the pane', match: /^open question / },
  R5: { reason: (cap) => `cycle cap ${cap} reached`, action: 'add an on line with a higher cap, then /clear and type resume', match: /^cycle cap \d+ reached$/ },
  R6: { reason: () => 'no progress in 2 cycles', action: "read the record's last work, then /clear and type resume" },
  R7: { reason: () => 'waiting for your permission approval', action: 'approve or deny in the pane' },
  R8: { reason: () => 'session idle, waiting for you', action: 'reply in the pane' },
  R9: { reason: (error, host) => `${hostName(host)} API error: ${error}`, action: 'retry in the pane', match: /^(Claude|Codex) API error: / },
  R10: { reason: () => 'could not cycle: handoff not written', action: 'run doctrine-handoff, then /clear and type resume' },
  R11: { reason: () => 'could not cycle: another Stop hook kept the session running', action: '/clear and type resume by hand' },
  R12: { reason: (_, host) => `could not cycle: this pane now runs a different ${hostName(host)} session`, action: 'check the pane', match: /^could not cycle: this pane now runs a different (Claude|Codex) session$/ },
  R13: { reason: () => 'could not cycle: contained session', action: '/clear and type resume by hand' },
  R14: { reason: () => 'cleared, but the new session did not start doctrine', action: 'type resume' },
  R15: { reason: () => 'resume typed twice, no reply from the new session', action: 'check the pane' },
  R16: { reason: () => 'auto-cycle stopped: you typed in this pane', action: 'nothing, or /clear and type resume' },
  R17: { reason: (why) => `could not type into the pane: ${why}`, action: '/clear and type resume by hand', match: /^could not type into the pane: / },
  R18: { reason: (id) => `/clear did not take: session ${id} still running`, action: 'clear your draft, then /clear and type resume', match: /^\/clear did not take: session \S+ still running$/ },
}
export const pauseReason = (code, arg, host) => PAUSES[code].reason(arg, host)
/** R17's `<reason>`, one fixed phrase per failure (SP7): never a raw herdr status or error message, which go to
 *  hook.log. No phrase says stall, typer, claim or blocked (D2). */
export const R17_WHY = {
  lookup: 'herdr could not read the pane',
  busy: 'the session stayed busy',
  send: 'herdr could not send to the pane',
  transcript: 'the transcript could not be read',
  session: 'herdr did not report the new session within 30 s',
  composer: 'the pane showed no composer within 30 s',
  noPane: 'this session is not in a herdr pane',
  hash: 'the working tree could not be hashed',
  error: 'an unexpected error',
}
/** herdr's agent_status values that mean ready for input (herdr 0.9.1: `idle` and `done` both do; `done` is an
 *  unseen finish, which an unattended, unfocused pane reports after its turn). */
export const READY_STATUSES = ['idle', 'done']
/** The PAUSES code a reason as written matches, by `match` where the reason carries an argument and by equality
 *  where it carries none, or null for a reason the table does not know. */
export const pauseCode = (reason) => Object.keys(PAUSES).find((c) => (PAUSES[c].match ? PAUSES[c].match.test(reason) : PAUSES[c].reason() === reason)) || null
/** Whether two reasons name the same pause (E8-R27): the same PAUSES code, so two R9 lines with different error text
 *  are one pause, or, for a reason no code matches, the same text. */
export const samePause = (a, b) => (pauseCode(a) ?? `text:${a}`) === (pauseCode(b) ?? `text:${b}`)
/** The skills' `question: <text>` pause (doctrine-backup), which carries no id and so never resolves (pauseResolved). */
const SKILL_QUESTION = /^question: /
/** The action for a reason as written: the D2 table's for a reason it knows, else an answer in the pane. The skills'
 *  question can need more, which only its place in the record decides (pauseActionAt). */
export const pauseAction = (reason) => CODEX_ACTIONS.find((c) => c.match.test(reason))?.action || PAUSES[pauseCode(reason)]?.action || 'answer in the pane'
/** The actions for the pauses only Codex writes, or writes in its own words, where the D2 table's would not clear
 *  them (E10H-R4-B2). Each is written only after the session's warned line, where it holds every later Stop of that
 *  session (pausedAfterWarned) until a /clear and a typed resume start a new one, so its action names those. R9 in
 *  Codex's words can come before the warned line too, and pauseActionAt decides it by where it sits. */
const CODEX_ACTIONS = [
  { match: /^could not tell whether background work is still running: /, action: 'check the pane for work still running, then /clear and type resume by hand' },
  { match: /^could not cycle: this pane now runs a different Codex session$/, action: 'check the pane, then /clear and type resume by hand' },
]
const CODEX_R9 = /^Codex API error: /
export const pausedLine = (reason) => `- auto-cycle paused: ${reason}`
/** The pane message and the toast body for a paused line (E8-R23): the reason, then what to do. */
export const pauseMessage = (reason, action = pauseAction(reason)) => `doctrine auto-cycle paused: ${reason}. ${action}`
export const pausedToken = (reason) => `auto-cycle paused·${String(reason).slice(0, TOKEN_REASON_MAX)}`
export const onToken = (n, cap) => `auto-cycle on·cycle ${n} of ${cap}`
/** The report-metadata call for the autocycle token (E8-D26, E8-R23). Never dctr-token: its own source. */
export const autocycleTokenArgs = (paneId, value) =>
  ['pane', 'report-metadata', paneId, '--source', AUTOCYCLE_SOURCE, '--token', `autocycle=${value}`, '--ttl-ms', String(AUTOCYCLE_TTL_MS)]
/** The toast (E8-R24): `<repo> <phase>: doctrine auto-cycle paused`, the body the reason and the action. */
export const pauseToastArgs = (repo, phase, reason, action = pauseAction(reason)) =>
  ['notification', 'show', `${repo} ${phase || 'unnamed phase'}: doctrine auto-cycle paused`, '--body', `${reason}. ${action}`, '--sound', 'request']

/** The last auto-cycle entry of any sub-form, or null. The claim key reads it, and standingPauses where the record
 *  has no anchor. */
export const latestAutoCycle = (entries) => (entries || []).filter((e) => e.kind === 'auto-cycle').at(-1) || null

/**
 * THE PAUSE MODEL (E8-R25), stated once; step 3, the dedup, the sidebar token and the alerts all read it.
 *
 * A paused line P is resolved only when it is an R2, R3 or R4 pause, whoever wrote it, and a line AFTER P answers
 * it: a state line not reading Blocked (R2), a ruling line (R3), a `question: <id> answered` line for its id (R4).
 * It is judged against the lines after P and never the whole record, so a later alarm or Blocked of the same kind
 * never makes an old, answered pause stand again. Every other paused line never resolves, the skills' `question:
 * <text>` form included, which carries no id.
 */
export function pauseResolved(paused, entries) {
  const after = (entries || []).filter((e) => e.line > paused.line), reason = paused?.reason || ''
  if (PAUSES.R2.match.test(reason)) return after.some((e) => e.kind === 'state' && !/^Blocked\b/i.test(e.value || ''))
  if (PAUSES.R3.match.test(reason)) return after.some((e) => e.kind === 'ruling')
  const q = /^open question (\S+): /.exec(reason)
  if (q) return after.some((e) => e.kind === 'question-answered' && e.id === q[1])
  return false
}

/** The unresolved paused lines after line `after` (E8-R25). */
export const unresolvedPausesAfter = (entries, after) =>
  (entries || []).filter((e) => e.kind === 'auto-cycle' && e.sub === 'paused' && e.line > after && !pauseResolved(e, entries))

/** The latest `warned`, `cycle` or `auto-cycle: on` line before line `before`, or null: the record's own anchors. */
const latestMark = (entries, before = Infinity) =>
  (entries || []).filter((e) => e.kind === 'auto-cycle' && ['warned', 'cycle', 'on'].includes(e.sub) && e.line < before).at(-1) || null

/**
 * The standing pauses, in record order: the unresolved paused lines after the latest anchor, which is the later of
 * the record's latest `warned`, `cycle` or `auto-cycle: on` line and `startLine`, the record's line count when the
 * restore hook saw this session start after a /clear (RB3-2; 0 when none was recorded). An on line is an anchor
 * because R5's action appends one; a session start is, because a /clear and a resume start a new session, which must
 * not inherit the old one's pauses, whoever typed them: many pause actions ask the user for them, and the typer types
 * them itself. With no anchor at all, the latest auto-cycle line when it is an unresolved paused line. A ready line after a pause hides
 * nothing. The dedup (pauseStands), the token (autocycleToken, paused while any stands, naming the last) and the
 * alerts (each line once) read this one set; step 3 (pausedAfterWarned) refuses on every one of them after this
 * session's warned line.
 */
export function standingPauses(entries, startLine = 0) {
  const es = entries || []
  const anchor = Math.max(latestMark(es)?.line ?? 0, startLine)
  if (anchor > 0) return unresolvedPausesAfter(es, anchor)
  const latest = latestAutoCycle(es)
  return latest?.sub === 'paused' && !pauseResolved(latest, es) ? [latest] : []
}

/** The event pauses (E8-D18): a permission prompt, an idle stop and an API error, each answered by the session going on. */
const EVENT_PAUSES = ['R7', 'R8', 'R9']

/** The dedup (E8-D18, E8-R27, E8-R28, E8-R29): no new paused line for `reason` while a standing pause names the same
 *  pause (samePause), and no idle pause (R8) while any pause stands, since a session waiting on any pause is idle for
 *  that reason; any other pause that differs from every standing one is written. `turnEnd` is the record's line count
 *  at this session's latest turn end (a Stop, a StopFailure or the next submitted prompt, E8-R31), 0 when none is
 *  known: an R7, R8 or R9 line at or before it was answered by the turn that ended there, so it counts for neither
 *  rule (E8-R29, E8-R30), and a second prompt, idle stop or error is written. Every other
 *  pause counts whatever the Stop, and step 3, the token and the alerts read standingPauses unchanged. */
export const pauseStands = (entries, startLine, reason, turnEnd = 0) => {
  const standing = standingPauses(entries, startLine).filter((p) => !(EVENT_PAUSES.includes(pauseCode(p.reason)) && p.line <= turnEnd))
  return pauseCode(reason) === 'R8' ? standing.length > 0 : standing.some((p) => samePause(p.reason, reason))
}

/** This session's latest warned line, or null: B2 step 2's warning and step 3's anchor both read it. */
export const sessionWarned = (entries, sessionId) =>
  (entries || []).filter((e) => e.kind === 'auto-cycle' && e.sub === 'warned' && e.session === sessionId).at(-1) || null

/** B2 step 3 (E8-R25): an unresolved paused line follows this session's latest warned line, whatever anchor follows
 *  it, since only an R2, R3 or R4 pause that resolves lets the same session cycle again. False with no such line.
 *  Every pause standingPauses returns after that warned line is one of these. */
export function pausedAfterWarned(entries, sessionId) {
  const mine = sessionWarned(entries, sessionId)
  return Boolean(mine) && unresolvedPausesAfter(entries, mine.line).length > 0
}

/** The action for paused line `p` of `entries` (RB5-1). The D2 table's for a reason it knows. The skills' question
 *  never resolves, so where the latest anchor before it is a warned line of the session still running (no session
 *  start after that line), step 3 holds that session and the question asks, once answered, for a /clear and a typed
 *  resume; before the warning the next warned line moves the anchor past it, so it asks only for an answer. */
export function pauseActionAt(p, entries, startLine = 0) {
  const question = SKILL_QUESTION.test(p.reason)
  // Codex's API error likewise: after the warned line the retry alone leaves step 3 holding the session (E10H-R4-B2).
  if (!question && !CODEX_R9.test(p.reason)) return pauseAction(p.reason)
  const mark = latestMark(entries, p.line)
  const first = question ? 'answer in the pane' : PAUSES.R9.action
  return mark?.sub === 'warned' && mark.line > startLine ? `${first}, then /clear and type resume` : first
}

/** The autocycle token's value (E8-D26, LB2): the last standing pause while any stands, else the latest cycle line's
 *  count (0 with none) of the last on line's cap. */
export function autocycleToken(entries, startLine = 0) {
  const es = entries || [], standing = standingPauses(es, startLine)
  if (standing.length) return pausedToken(standing.at(-1).reason)
  return onToken(es.filter((e) => e.kind === 'auto-cycle' && e.sub === 'cycle').at(-1)?.n ?? 0, lastOnOffEntry(es)?.cap ?? 10)
}

/** The typer's claim key (RB3-1): the line number of the record's latest auto-cycle line of any kind at launch, 0
 *  with none. Any auto-cycle line written after a claim, a pause included, makes a new key, so a session whose pause
 *  resolved can launch again, while the same record state launches once. */
export const claimKey = (entries) => latestAutoCycle(entries)?.line ?? 0

/** The directory holding `.git` at or above `file`'s directory, or that directory when none does. `exists` is
 *  injected so this stays pure. The record's repo is found this way, with no git process. */
export function repoOf(file, exists) {
  const start = path.dirname(path.resolve(file))
  for (let d = start; ; d = path.dirname(d)) {
    if (exists(path.join(d, '.git'))) return d
    if (path.dirname(d) === d) return start
  }
}

/** The first of `repos` holding the stop file, or null (Q1: either repo stops). */
export const stopFileRepo = (repos, exists) => [...new Set(repos.filter(Boolean))].find((r) => exists(path.join(r, STOP_FILE))) || null

/**
 * B1, the one definition of "auto-cycle is active" (U4): the record's last state line is Open or Blocked, its
 * last auto-cycle on/off line is on, and no stop file exists. The gauge and the Stop, Notification and StopFailure
 * hook ask this with `stopFilePresent`, the caller's look in both repos. The typer asks it with false, the record's
 * own half, and tests the stop file after it, so an off or closed record never gets an R1 line (RB4-1).
 */
export function autoCycleActive(entries, stopFilePresent) {
  const state = (entries || []).filter((e) => e.kind === 'state').at(-1)
  return Boolean(restoreState(state?.value)) && lastOnOffEntry(entries)?.sub === 'on' && !stopFilePresent
}

/**
 * The record's pausing states (B2 step 1), each null when absent: `blocked`, the last state line without its list
 * marker when it reads Blocked; `alarm`, which alarm fired with no ruling line after it; `question`, the last
 * question opened with no answer line for its id after it.
 */
export function pausingStates(entries) {
  const es = entries || []
  const state = es.filter((e) => e.kind === 'state').at(-1)
  const blocked = /^Blocked\b/i.test(state?.value || '') ? state.raw.replace(/^-\s+/, '') : null
  const alarm = es.filter((e) => e.kind === 'alarm' && !es.some((r) => r.kind === 'ruling' && r.line > e.line)).at(-1)?.which || null
  const question = es.filter((e) => e.kind === 'question-opened' &&
    !es.some((a) => a.kind === 'question-answered' && a.id === e.id && a.line > e.line)).at(-1) || null
  return { blocked, alarm, question: question && { id: question.id, text: question.text } }
}

/** The last line of an assistant message is the ready line, bare or as an agent may wrap it (unwrapLine: a list
 *  marker, inline code, bold or italics around the whole line), with nothing else on that line (K4-RL). */
export const endsReady = (message) => unwrapLine(String(message ?? '').trimEnd().split('\n').at(-1)) === READY_LINE

/** A Stop payload field that lists live work (`session_crons`): non-empty as an array, an object with keys, or any
 *  other present value. Absent, null, [] and {} are empty. */
/** The statuses a background task has once it has ended (E8-R33). */
const BACKGROUND_ENDED = ['completed', 'failed', 'killed']
/** Whether a Stop's `background_tasks` holds live work (E8-D7, E8-R33): an entry whose status is not completed,
 *  failed or killed, a missing or unknown status and a non-object entry included. A list of only ended tasks, an
 *  empty one and an absent one are not live; a present value that is not a list is live when nonEmpty. */
export const backgroundLive = (tasks) => (Array.isArray(tasks)
  ? tasks.some((t) => !(t && typeof t === 'object' && BACKGROUND_ENDED.includes(t.status))) : nonEmpty(tasks))
export const nonEmpty = (v) => (v === undefined || v === null ? false : Array.isArray(v) ? v.length > 0 : typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v))

/**
 * Whether one seat marker is live work (E8-D7, E8-R8): a gate while its result file is missing, a codex seat
 * while its job's status is not terminal (an unreadable status is not terminal), and any other seat, since its
 * marker goes at SubagentStop.
 */
export function seatLive(seat, resultExists, jobStatus) {
  if (seat?.role === GATE_ROLE) return !resultExists
  if (seat?.codexJob) return !codexTerminal(jobStatus)
  return true
}

/** A record line that counts as progress (B7, E8-R9): a wave, round, finding raised, finding cleared or ruling
 *  line, a wave the continuity skills dispatched excepted. */
const isWork = (e) => ['wave', 'round', 'finding-raised', 'finding-cleared', 'ruling'].includes(e.kind) && !(e.kind === 'wave' && e.via)

/**
 * The paths B7's tree hash leaves out of one repo (E8-D17), as pathspecs relative to it: the memory file, the
 * handoffs, the auto-cycle files, and, in the repo holding the record, the record and its run-state file. No skill
 * names a record's run-state file, so it is the record's sibling named by its basename with `-run-state` (SP4); a
 * file named run-state anywhere else is work like any other.
 */
export function treeExcludes(recordPath, repo) {
  const rel = path.relative(repo, recordPath)
  const inRepo = rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  return ['SESSION_MEMORY.md', 'docs/handoffs', ':(glob).doctrine/auto-cycle*',
    ...(inRepo ? [rel, `:(glob)${rel.replace(/\.md$/, '')}-run-state*`] : [])]
}

/**
 * B7's count and pause (E8-D17): `n` is the next cycle's number, the last cycle line's plus one wherever it sits,
 * so the count continues across session ids and across on lines; `cap` is the last on line's. It pauses with
 * `cap <cap>` when `n` would exceed the cap, and `no progress` when the last two cycle intervals, cycle to cycle
 * and cycle to now, each show neither a work line nor a changed tree hash. With fewer than two cycle lines there
 * is no second interval to judge.
 */
export function cycleProgress(entries, hashNow) {
  const es = entries || []
  const cap = lastOnOffEntry(es)?.cap ?? 10
  const cycles = es.filter((e) => e.kind === 'auto-cycle' && e.sub === 'cycle')
  const n = (cycles.at(-1)?.n ?? 0) + 1
  if (n > cap) return { n, cap, pause: `cap ${cap}` }
  if (cycles.length >= 2) {
    const [a, b] = cycles.slice(-2)
    const workIn = (lo, hi) => es.some((e) => e.line > lo && e.line < hi && isWork(e))
    if (!workIn(a.line, b.line) && a.hash === b.hash && !workIn(b.line, Infinity) && hashNow === b.hash) return { n, cap, pause: 'no progress' }
  }
  return { n, cap, pause: null }
}

/**
 * B2's ordered steps over plain facts; the first that applies decides. Returns `{ act, code?, reason }`, act one of
 * `none`, `wait`, `pause` or `launch`. `handoffLanded`, `paneSession` and `progress` may be functions, called
 * only when their step is reached, so a case decided earlier costs no git and no herdr read: `paneSession()`
 * returns the session id herdr reports for the pane, or `{ error }`; `progress()` returns cycleProgress's value,
 * or `{ error }` when the tree could not be hashed. Each `error` is an R17_WHY key.
 */
export function cycleDecision(f) {
  const v = (x) => (typeof x === 'function' ? x() : x)
  const pause = (code, arg) => ({ act: 'pause', code, reason: pauseReason(code, arg, f.host) })
  // 1. Pausing states.
  if (f.stopRepo) return pause('R1', f.stopRepo)
  if (f.blocked) return pause('R2', f.blocked)
  if (f.alarm) return pause('R3', f.alarm)
  if (f.question) return pause('R4', f.question)
  // 2, 3. An ordinary turn, or an unresolved pause after this session's warning (E8-R25).
  if (!f.warned) return { act: 'none', reason: 'no warned line for this session' }
  if (f.pausedAfterWarned) return { act: 'none', reason: "an unresolved paused line follows this session's warned line" }
  // A Stop after this record state's typer launched, carrying stop_hook_active: another Stop hook blocked the Stop that
  // launched it and the session ran on, whatever the continuation ended on. Written here, the line stops that typer.
  if (f.stopHookActive && f.claimTaken) return pause('R11')
  // 4. Live work: wait for the next Stop.
  if (f.backgroundTasks) return { act: 'wait', reason: 'background tasks are running' }
  if (f.liveWork) return { act: 'wait', reason: f.liveWork }
  if (f.sessionCrons) return { act: 'wait', reason: 'session crons are scheduled' }
  if (!f.ready) return { act: 'wait', reason: 'the last assistant message does not end with the ready line' }
  // 5. A stall: idle_prompt is suppressed here (E8-D18), so nothing else would ever alert.
  if (!v(f.handoffLanded)) return pause('R10')
  if (f.contained) return pause('R13')
  if (f.stopHookActive) return pause('R11')
  const session = v(f.paneSession)
  if (session?.error) return pause('R17', R17_WHY[session.error] || R17_WHY.error)
  if (session !== f.sessionId) return pause('R12')
  // 6. Cap and no progress.
  const p = v(f.progress)
  if (p?.error) return pause('R17', R17_WHY[p.error] || R17_WHY.error)
  if (p.pause === 'no progress') return pause('R6')
  if (p.pause) return pause('R5', p.cap)
  if (f.claimTaken) return { act: 'none', reason: "the claim for this ready line is already taken" }
  return { act: 'launch', n: p.n, reason: `cycle ${p.n} of ${p.cap}` }
}

/**
 * Whether an old-transcript entry is the user's own turn after the Stop (E8-D15, K2-R16): a user or assistant entry
 * whose timestamp is not before `stopAt`, the moment the Stop hook started. Judged by the entry's own time, never by
 * where it sits in the file: Claude Code writes the transcript asynchronously, so the turn's final assistant entry
 * can land past the byte length the Stop read, and it carries a time before the Stop. An entry with no readable
 * time counts as new, the direction that pauses rather than clears. System entries never count.
 */
export const typedAfter = (e, stopAt) =>
  (e?.type === 'user' || e?.type === 'assistant') && !(Date.parse(e.timestamp) < stopAt)

/**
 * Whether a new-session transcript entry is the user's own typing (E8-D15, DP-1): a `user` entry that is not meta,
 * carries no tool result, and is neither the entry /clear itself writes (`<command-name>/clear</command-name>`) nor
 * the entry the typer's own resume command leaves (E8-R32): a `user` entry holding exactly its `<command-message>`,
 * `<command-name>` and `<command-args>` tags, as Claude Code writes a typed slash command, the skill's loaded text
 * following as meta. /clear also writes a meta `user` entry and a `system` entry, and no assistant entry. Any other
 * slash command, or that one with other arguments, is typing.
 */
export function userTyped(e) {
  if (e?.type !== 'user' || e.isMeta) return false
  if (contentParts(e).some((x) => x?.type === 'tool_result')) return false
  const text = entryText(e).trim()
  return !text.startsWith('<command-name>/clear</command-name>') && !ownResume(text)
}
const contentParts = (e) => { const c = e?.message?.content; return typeof c === 'string' ? [c] : Array.isArray(c) ? c : [] }
/** A transcript entry's text: its string content, or its text parts joined. */
export const entryText = (e) => contentParts(e).map((x) => (typeof x === 'string' ? x : x?.type === 'text' ? x.text : '')).join('')

/** The typer's own resume command as Claude Code records it: the three command tags and nothing else. */
const ownResume = (text) => {
  const tag = (t) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(text)?.[1]
  return tag('command-name') === RESUME_COMMAND && tag('command-message') === RESUME_COMMAND.slice(1) &&
    tag('command-args')?.trim() === RESUME_ARGS && !text.replace(/<(command-message|command-name|command-args)>[^<]*<\/\1>/g, '').trim()
}

/**
 * The entries of a transcript's text (RB6-1), for the typer's reads. An unparseable line is never absence: one before
 * the last line makes the read unreadable (null), which never authorizes a send (RB2); a last line with no newline
 * that does not parse yet is a write in progress, `partial`, neither typing nor nothing. Blank lines are skipped.
 */
export function transcriptEntries(text, host = 'claude') {
  const read = readEntries(text)
  return host === 'codex' && read ? { entries: read.entries.flatMap(codexEntry), partial: read.partial } : read
}
function readEntries(text) {
  const lines = String(text).split('\n'), last = lines.pop(), entries = []
  for (const l of lines) {
    if (!l.trim()) continue
    try { entries.push(JSON.parse(l)) } catch { return null }
  }
  if (!last.trim()) return { entries, partial: false }
  try { entries.push(JSON.parse(last)); return { entries, partial: false } } catch { return { entries, partial: true } }
}

/** The typer's timings in ms (E8-D15): poll, how long a pane may read not idle once unfocused, how long to wait
 *  for the restore file, for herdr to report the new session (30 s), and for the first turn (2 min). */
export const TYPER_TIMES = { poll: 1000, idle: 10000, restore: 60000, session: 30000, firstTurn: 120000 }

/**
 * B4's next action from one observation (E8-D15). The typer is a loop around it. `o.stage` is `clear` before the
 * /clear, `resume` after it and before the first resume, `confirm` after a resume. `o.pane` is herdr's reading,
 * `{ error }` when the lookup failed. `o.grew` is whether the old transcript holds a user or assistant entry the
 * user typed after the Stop (typedAfter), and null when it could not be read, is shorter than the Stop's length, or
 * holds a damaged line before its last.
 * `o.stopRepo` is the repo holding the stop file, or null. `o.waited` is ms in this stage, `o.notIdle` ms unfocused and not idle,
 * `o.sessionWait` ms since the restore file was seen. `o.midWrite` is how long the transcript being read has ended in
 * a line still being written (transcriptEntries' `partial`), null when it does not: the step waits a poll while it
 * does, and pauses with R17 once that outlasts the idle grace, so neither a partial entry nor a damaged one ever
 * reads as nothing typed (RB6-1). `o.typedNew`, after the /clear, is whether the new session's
 * transcript holds an entry the user typed (userTyped), and null when it could not be read: before the resume and
 * before a first turn counts, typing pauses with R16, and an unreadable transcript never reads as nothing typed, so
 * it sends nothing (DP-1, RB2). Returns `{ act, code?, reason }`, act one of `wait`,
 * `clear`, `resume`, `confirm` (the first turn is there: done), `abort` and `pause`. `o.active` is the record's
 * own half of B1, its last on/off line on and its last state line Open or Blocked, without the stop file. An abort
 * writes nothing, and each is a stop someone else already recorded: the record switched off or no longer Open or
 * Blocked, whether or not a stop file exists too, or a paused line written since the claim. Only on a record still
 * active does a stop file pause with R1 (RN3-3, E8-D16, RB4-1). Ready means an agent_status in READY_STATUSES.
 *
 * After the /clear, with `o.cycled` false, any step but an abort also carries `cycle: true` when this observation is
 * the first to show the /clear took: a restore file (`o.restore`, whose session is never the old one) or herdr
 * naming a session other than the old one. The typer appends the cycle line before acting on that step, and never
 * otherwise, so a /clear nobody saw take counts no cycle (E8-D17, E8-D28).
 */
export function typerStep(o) {
  const step = o.host === 'codex' ? codexTyperAct(o) : typerAct(o)
  const s = paneSession(o.pane)
  const took = Boolean(o.restore) || (s !== null && s !== o.oldSession)
  return o.stage !== 'clear' && !o.cycled && step.act !== 'abort' && took ? { ...step, cycle: true } : step
}

/** The session herdr reported, or null when the reading failed, is missing or names none: a session is a non-empty
 *  string, and an empty one is no answer (RT2-B1). */
const paneSession = (pane) => (pane && !pane.error && typeof pane.session === 'string' && pane.session !== '' ? pane.session : null)

/** The checks every typer observation passes first, on both hosts: auto-cycle still active, no stop file, no pause
 *  since the claim, no transcript line mid-write. A step, or null to go on. */
function typerGuard(o, t, pause) {
  if (!o.active) return { act: 'abort', reason: 'auto-cycle is no longer active' }
  if (o.stopRepo) return pause('R1', o.stopRepo)
  if (o.pausedSinceClaim) return { act: 'abort', reason: 'a paused line was written since the claim' }
  if (o.midWrite !== null && o.midWrite !== undefined) {
    return o.midWrite < t.idle ? { act: 'wait', reason: 'the transcript ends in a line still being written' } : pause('R17', R17_WHY.transcript)
  }
  return null
}

/** The pane checks before any send, on both hosts: herdr names a session, the pane is unfocused and ready for input.
 *  A step, or null when the typer may type. */
function typerReady(o, t, pause) {
  // A reply with no Claude session is a failed lookup, never a changed session (ST2).
  if (paneSession(o.pane) === null) return pause('R17', R17_WHY.lookup)
  if (o.pane.focused !== false) return { act: 'wait', reason: 'the pane is focused' }
  if (!READY_STATUSES.includes(o.pane.status)) {
    // New entries since the Stop: the session ran on (a prompt, or another Stop hook that blocked), and the turn
    // running ends in a Stop, which pauses with R11 for the second. herdr reads it ready only once that Stop's hooks
    // have returned, so the typer waits for it rather than pausing on the busy grace.
    if (o.stage === 'clear' && o.grew === true) return { act: 'wait', reason: 'the session ran on after the Stop' }
    return o.notIdle < t.idle ? { act: 'wait', reason: 'the session is not ready for input' } : pause('R17', R17_WHY.busy)
  }
  return null
}

function typerAct(o) {
  const t = o.times || TYPER_TIMES
  const pause = (code, arg) => ({ act: 'pause', code, reason: pauseReason(code, arg) })
  const guard = typerGuard(o, t, pause)
  if (guard) return guard
  if (o.stage === 'confirm') {
    if (o.typedNew) return pause('R16')
    if (o.firstTurn) return { act: 'confirm', reason: 'the new session took its first turn' }
    if (o.waited < t.firstTurn) return { act: 'wait', reason: 'waiting for the first turn' }
    if (o.typedNew === null) return pause('R17', R17_WHY.transcript)
    if (o.resumes >= 2) return pause('R15')
  }
  if (o.stage === 'resume' && !o.restore) {
    if (o.waited < t.restore) return { act: 'wait', reason: 'waiting for the restore file' }
    const s = paneSession(o.pane)
    // No reading names either session, so neither R14 nor R18 can be claimed (E8-D28).
    if (s === null) return pause('R17', R17_WHY.lookup)
    // herdr still on the old session: a draft in the pane merged with the /clear, which never ran (E8-D28).
    return s === o.oldSession ? pause('R18', o.oldSession) : pause('R14')
  }
  const ready = typerReady(o, t, pause)
  if (ready) return ready
  if (o.stage === 'clear') {
    // A transcript that could not be read, or is now shorter than at the Stop, says nothing about new entries (RB2).
    if (o.grew === null) return pause('R17', R17_WHY.transcript)
    if (o.pane.session !== o.oldSession || o.grew) return pause('R16')
    return { act: 'clear', reason: 'idle, unfocused, the same session, no new entries' }
  }
  if (o.pane.session === o.restore?.session) {
    if (o.typedNew) return pause('R16')
    if (o.typedNew === null) return o.sessionWait < t.session ? { act: 'wait', reason: 'the new transcript could not be read yet' } : pause('R17', R17_WHY.transcript)
    return { act: 'resume', reason: 'herdr reports the new session, and nothing was typed into it' }
  }
  if (o.pane.session !== o.oldSession) return pause('R16')
  return o.sessionWait < t.session ? { act: 'wait', reason: 'herdr still reports the old session' } : pause('R17', R17_WHY.session)
}

/**
 * B6's reason for a Notification or StopFailure event while auto-cycle is active (E8-D18), or null. `event` is
 * `StopFailure` or the notification type. idle_prompt pauses only when no live claim is held for this pane,
 * nothing is live, and the last Stop's persisted facts say none of its background tasks was live (backgroundLive: each
 * one completed, failed or killed, E8-R33), its session crons were empty (E8-D7's live-work test, E8-R22) and its
 * message did not end with the ready line; a missing record of the last
 * Stop, or one missing a field, is not a known-empty one (RB6-3). Its R8 line is then written only while no paused
 * line stands but a permission prompt, idle stop or API error the session has ended a turn since, which the dedup
 * decides (pauseStands, E8-R28, E8-R30).
 */
export function notifyDecision(event, f = {}) {
  if (event === 'StopFailure') return pauseReason('R9', f.error || 'unknown', f.host)
  if (event === 'permission_prompt') return pauseReason('R7')
  // Codex only: the watcher's held Stop whose background work stayed unknown past the idle grace (E10H-R3-B4).
  if (event === 'background_unknown') return unknownBackgroundReason(f.why || 'unknown')
  if (event !== 'idle_prompt') return null
  if (f.claimHeld || f.liveWork || f.lastStop?.backgroundEmpty !== true || f.lastStop?.cronsEmpty !== true || f.lastStop?.ready !== false) return null
  return pauseReason('R8')
}

// ---------------------------------------------------------------- Codex host: seats, their panes, the /clear sweep (E10)
//
// One set of hook scripts serves both hosts (E10's ruling: never a Codex-only copy of a hook). What differs is read
// from the payload here. Facts about Codex CLI 0.156.1 below are from the E10 probes (doctrine-skills-project,
// .doctrine/records/e10-scope and e10-hookport/probes), each as the comment beside it says.

/** Which harness wrote this hook input: 'codex' when its transcript_path is a Codex rollout (`rollout-<ts>-<id>.jsonl`),
 *  else 'claude'. Codex hands every hook a rollout: SubagentStart the seat's own, SubagentStop the parent's. */
export const hostOf = (input) => (path.basename(String(input?.transcript_path ?? '')).startsWith('rollout-') ? 'codex' : 'claude')

/** The seat's own transcript. SubagentStop's `agent_transcript_path` on either host; without it, on Codex, SubagentStart's
 *  `transcript_path`, which IS the seat's rollout there, and on Claude Code the path derived from the parent's. */
export const seatTranscriptPath = (p) => p?.agent_transcript_path ||
  (hostOf(p) === 'codex' ? p?.transcript_path || null : transcriptPath(p?.transcript_path, p?.agent_id))

/** A Codex seat's name: the task_name of the spawn_agent call that started it, which the seat rollout's first record,
 *  its session_meta, carries as `agent_path` (`/root/echo_task`, last segment `echo_task`). Codex writes no meta file
 *  beside a rollout and encrypts the task message, so this is the one title a seat has. Null for a rollout whose first
 *  line is not a complete session_meta naming a path: the parent's names none, and one not yet written is empty. */
export function codexTaskName(rolloutText) {
  let first
  try { first = JSON.parse(String(rolloutText ?? '').split('\n', 1)[0]) } catch { return null }
  if (first?.type !== 'session_meta') return null
  const p = first.payload?.agent_path ?? first.payload?.source?.subagent?.thread_spawn?.agent_path
  return (typeof p === 'string' && p.split('/').filter(Boolean).at(-1)) || null
}

/** A tool result's text. A code-mode exec output is a list of parts, one of them JSON whose `output` is the command's
 *  own output beside bookkeeping (chunk_id, wall time); that output is shown instead of the JSON around it. */
const rolloutOutput = (output) => (Array.isArray(output) ? output : [{ text: output }])
  .map((c) => {
    const t = typeof c?.text === 'string' ? c.text : typeof c === 'string' ? c : ''
    try { const j = JSON.parse(t); if (typeof j?.output === 'string') return j.output } catch { /* plain text */ }
    return t
  }).join('')

/** One rendered line for a Codex rollout record, or null for one that shows nothing: renderRecord's counterpart. A seat's
 *  task (agent_message), its assistant and user messages, each tool call and each result are shown; developer messages,
 *  reasoning, event_msg, token and session records are not, as renderRecord drops thinking and attachments. */
export function renderRollout(rec, { head = RESULT_HEAD, tail = RESULT_TAIL } = {}) {
  if (rec?.type !== 'response_item') return null
  const p = rec.payload || {}
  const texts = () => (Array.isArray(p.content) ? p.content : []).filter((c) => typeof c?.text === 'string' && c.text.trim()).map((c) => c.text)
  let out = []
  if (p.type === 'message' && p.role === 'assistant') out = texts().map((t) => t.trim())
  else if (p.type === 'message' && p.role === 'user') out = texts().map((t) => `» ${firstLine(t)}`)
  else if (p.type === 'agent_message') out = texts().map((t) => `» ${t.trim().split('\n').filter(Boolean).join(' · ').slice(0, 160)}`)
  else if (p.type === 'function_call') out = [`→ ${p.name}  ${firstLine(p.arguments ?? '')}`]
  else if (p.type === 'custom_tool_call') out = [`→ ${p.name}  ${firstLine(p.input ?? '')}`]
  else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
    const raw = rolloutOutput(p.output)
    if (raw.trim()) out = [indent(truncate(raw, head, tail))]
  }
  const text = out.join('\n').trimEnd()
  return text || null
}

/** Why the Codex /clear sweep stands down, or null when it runs (E10-D22, E8-D6 through E10's table). On Codex a /clear
 *  ends no session: SessionEnd fires only when the process exits (probe-clear.txt), so the ending chat's seats and gates
 *  would hold their panes and column slots through the whole new chat. The new chat's SessionStart with source clear,
 *  which Codex fires at its first prompt, sweeps them instead. Claude Code sweeps on SessionEnd and stands down here. */
export const clearSweepSkip = (p) => restoreSkip(p) ?? (hostOf(p) === 'codex' ? null : 'not a Codex session; Claude Code sweeps on SessionEnd')

/** The sessions the /clear sweep takes: every session other than the new one holding a marker whose `sessionPane`, the
 *  HERDR_PANE_ID of the session that placed it, is this pane. `sessions` is `[{ id, seats }]`. A session's markers all
 *  carry one pane, since every hook and launcher of a session inherits its process's environment. */
export const clearSweepTargets = (sessions, newSessionId, paneId) => (paneId
  ? (sessions || []).filter((s) => s && s.id !== newSessionId && (s.seats || []).some((m) => m?.sessionPane === paneId)).map((s) => s.id)
  : [])

/** The orchestrator's session id for a launcher run from its shell (dctr-gate.mjs): Claude Code's CLAUDE_CODE_SESSION_ID,
 *  else CODEX_SESSION_ID, which Codex 0.156.1 sets in every command its model runs (probed 2026-09-28) and which equals the
 *  session_id its hooks receive, so a gate joins its session's seats under one lock. Claude Code's first: a Claude Code
 *  run reads what it always read. */
export const shellSessionId = (env) => env.CLAUDE_CODE_SESSION_ID || env.CODEX_SESSION_ID || null

/** Whether a launcher runs from a Codex session's own shell: CODEX_SESSION_ID with no Claude Code session id. A Codex
 *  process under a Claude Code session is that session's, as shellSessionId and codexUnderClaude have it (N3). */
export const codexShell = (env) => !env.CLAUDE_CODE_SESSION_ID && Boolean(env.CODEX_SESSION_ID)

/** Whether a gate with no pane must run in the foreground rather than detached, from the command line of PID 1 in the
 *  launcher's PID namespace (`/proc/1/cmdline`, NUL-separated): true inside Codex's Linux sandbox, where PID 1 is
 *  `codex-linux-sandbox` (probed 2026-09-28) and every process in the namespace dies when the command returns. A
 *  detached gate launched there was killed before it opened its transcript (E10-D14, live run 2026-09-28). Waiting costs
 *  nothing there: Codex keeps a command that outlives its tool call as a background terminal until it exits (probe B5).
 *  Everywhere else, a Codex session run without the sandbox included, the gate detaches as it always has. */
export const gateWaits = (pid1Cmdline) => path.basename(String(pid1Cmdline ?? '').split('\0')[0]) === 'codex-linux-sandbox'

// ---------------------------------------------------------------- Codex host: transcripts, the gauge, auto-cycle and the typer (E10)
// The fixtures in dctr-codex.fixtures.mjs are cut from the probes' rollouts and payloads.

const hostName = (host) => (host === 'codex' ? 'Codex' : 'Claude')

/** A Codex user message the harness wrote rather than the user typed, for a rollout that does not label its items: the
 *  environment context, an injected skill body, a Stop hook's prompt, a turn-aborted note, and the like, each a tagged
 *  block (probe rollouts). */
const CODEX_META = /^<[a-z_]+[\s>]/

/** Whether a Codex user message is one the harness wrote. Codex 0.156.1 labels each message's items in
 *  internal_chat_message_metadata_passthrough.content_item_kinds: typed text is `user.text`, and the AGENTS.md block
 *  (`agents_md.instructions`), the environment context, an injected skill and the like are not, so a message whose
 *  labels lack user.text was injected whatever its text starts with, and one carrying it was typed, a prompt that
 *  opens with a tag included (real rollouts under ~/.codex/sessions, E10H-B7). A message with no labels falls back to
 *  the tagged-block test. */
const codexInjected = (p, text) => {
  const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds
  return Array.isArray(kinds) ? !kinds.includes('user.text') : CODEX_META.test(text.trimStart())
}

/** One rollout line as the entries the typer's readers take (seam S1): each user or assistant message item mapped to
 *  `{ type, timestamp, message: { content: [{ type: 'text', text }] }, isMeta }`; every other item maps to nothing.
 *  isMeta marks a user message nobody typed: what the harness injected, and the typer's own resume line, so
 *  userTyped reads a Codex entry as it reads a Claude Code one. */
function codexEntry(e) {
  const p = e?.payload
  if (e?.type !== 'response_item' || p?.type !== 'message' || (p.role !== 'user' && p.role !== 'assistant')) return []
  const text = (Array.isArray(p.content) ? p.content : []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('')
  return [{ type: p.role, timestamp: e.timestamp, message: { content: [{ type: 'text', text }] }, isMeta: p.role === 'user' && (codexInjected(p, text) || text.trim() === CODEX_RESUME_LINE) }]
}

/**
 * readUsage for a Codex rollout (seam S1): the latest token_count event carrying info, read as used =
 * info.last_token_usage.input_tokens and window = info.model_context_window, its timestamp standing in for the entry
 * id. A token_count whose input is zero (the one a compaction writes) is skipped, as E8-D10 skips zero totals, and so
 * is a line that does not parse. `stale` when that token_count is the one the latch read at the previous batch: the
 * PostToolUse events after one token_count are one batch (E10 table), so the gauge reads it once. With no such event,
 * `unparseable` when a line did not parse, else `none`: no token_count yet, the first tool call of a session (probe A2).
 */
function readCodexUsage(text, lastUuid) {
  const ls = String(text).split('\n')
  let bad = false
  for (let i = ls.length - 1; i >= 0; i--) {
    if (!ls[i].trim()) continue
    let e
    try { e = JSON.parse(ls[i]) } catch { bad = true; continue }
    const info = e?.type === 'event_msg' && e.payload?.type === 'token_count' ? e.payload.info : null
    const used = info?.last_token_usage?.input_tokens
    if (!Number.isFinite(used) || used <= 0) continue
    if (lastUuid && e.timestamp === lastUuid) return { unknown: 'stale' }
    const window = info.model_context_window
    return { used, uuid: e.timestamp, at: e.timestamp || null, window: Number.isFinite(window) && window > 0 ? window : null }
  }
  return { unknown: bad ? 'unparseable' : 'none' }
}

/** What the typer types on Codex after the /clear takes: the skill's exact registered name after `$`, the one form
 *  Codex itself injects as a skill (probe B1), with the not-a-ruling argument. Sent as one line, the TUI's skill popup
 *  never opens and one Enter submits it (seat III live run, III-evidence/popup-resume-line-rollout.jsonl). */
export const CODEX_RESUME_LINE = `$doctrine:doctrine-resume ${RESUME_ARGS}`

/** What the TUI shows in an empty composer: a new chat's placeholder, and a follow-up's (both in the 0.156.1 binary). */
const COMPOSER_PLACEHOLDERS = ['Ask Codex to do anything', 'Ask a follow-up question']

/** Whether the pane's composer, its last `›` line, is empty (E10H-R4-B1, E10 S1): the check before every Codex send.
 *  A submitted prompt sits above the composer, so the last `›` line is the composer. `'absent'` when the pane shows
 *  none, as a blank read or the new chat's splash right after a /clear does: not a draft, and not empty (E10-D28). A
 *  draft whose first line is blank shows a bare `›` with its text on the line below, and reads as a draft; an empty
 *  composer has a blank line under it. Null when the pane text was not read. */
export function composerIdle(text) {
  if (typeof text !== 'string') return null
  const composer = composerLine(text)
  if (composer === null) return 'absent'
  const lines = text.split('\n').map((l) => l.trim())
  if (composer === '' && lines[lines.findLastIndex((l) => l.startsWith('›')) + 1]) return false
  return ['', ...COMPOSER_PLACEHOLDERS].includes(composer)
}

/** The text in the pane's composer, its last `›` line, trimmed; null when the pane shows none or was not read. */
export function composerLine(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).findLast((l) => l.startsWith('›'))
  return line === undefined ? null : line.slice(1).trim()
}

/** Whether a rollout holds a turn_aborted event, the one mark Esc leaves on a turn (probe B6: no Stop fires, and
 *  herdr reads done). Null when the rollout was not read (E10H-R4-B1). */
export function codexAborted(text) {
  if (typeof text !== 'string') return null
  return text.split('\n').some((l) => { try { const e = JSON.parse(l); return e?.type === 'event_msg' && e.payload?.type === 'turn_aborted' } catch { return false } })
}

/** Whether a Codex process belongs to a Claude Code session: a Codex hook payload whose environment carries
 *  CLAUDE_CODE_SESSION_ID, as `codex app-server` does when codex:codex-rescue starts it from Claude Code's shell. Its
 *  hooks stand down, since the herdr pane, the project and the record are the Claude session's, and a gate it launches
 *  joins that session, as shellSessionId has it (N1, N3). */
export const codexUnderClaude = (env, host) => host === 'codex' && Boolean(env?.CLAUDE_CODE_SESSION_ID)
export const UNDER_CLAUDE_WHY = 'a Codex process under a Claude Code session (CLAUDE_CODE_SESSION_ID set), whose own hooks own its pane and record'

/**
 * The state of a rollout's last turn: a turn starts at task_started or at a user message the user typed, and ends at
 * task_complete (its error and last_agent_message kept) or turn_aborted. Background work is not read from here: a
 * rollout shows a background terminal only in text the model chose to print, which can read "running" forever (probe
 * B5 run 1) or show nothing of a loop that runs on (probe P-PROC's tty turn) (E10H-R3-B4); codexBackground reads the
 * process tree instead.
 */
function codexTurnState(text) {
  let ended = false, error = null, lastMessage = null
  for (const l of String(text ?? '').split('\n')) {
    if (!l.trim()) continue
    let e
    try { e = JSON.parse(l) } catch { continue }
    const p = e?.payload
    if (!p || typeof p !== 'object') continue
    const started = (e.type === 'event_msg' && p.type === 'task_started') || codexEntry(e).some((x) => x.type === 'user' && !x.isMeta)
    if (started) { ended = false; error = null; lastMessage = null }
    if (e.type === 'event_msg' && (p.type === 'task_complete' || p.type === 'turn_aborted')) {
      ended = true
      lastMessage = typeof p.last_agent_message === 'string' ? p.last_agent_message : null
      error = p.error ? String(p.error.codex_error_info || p.error.message || 'unknown') : null
    }
  }
  return { ended, error, lastMessage }
}

/** The Codex process a hook runs under (E10H-R3-B4): in a processListing, the nearest ancestor of `pid` whose argv0's
 *  last path segment is `codex`, the native binary that runs every hook as its child (probe P-PROC, R3 repair notes:
 *  hook > codex > the npm launcher `node .../bin/codex`). Never the launcher (argv0 `node`), and never the sandbox's
 *  own process (argv0 `codex-linux-sandbox`). `{ pid, start }`, or null when no ancestor is one. */
export function codexAncestor(listing, pid) {
  const byPid = new Map((listing?.procs || []).map((p) => [p.pid, p]))
  const seen = new Set()
  for (let p = byPid.get(byPid.get(pid)?.ppid); p && !seen.has(p.pid); p = byPid.get(p.ppid)) {
    seen.add(p.pid)
    if (String(p.argv0 || '').split('/').at(-1) === 'codex') return { pid: p.pid, start: p.start ?? null }
  }
  return null
}

/**
 * Whether the session's background work is live (E8-D7's background_tasks on Codex, E10H-R3-B4, R3-B1, R3-B2), from
 * a processListing and the session's Codex process (codexAncestor's). The work is every live (not zombie) descendant
 * of that process whose environment carries CODEX_SESSION_ID: Codex sets it on every command it runs, and on the
 * sandbox's own processes for one, and never on a hook, on codex-code-mode-host or on anything else it keeps for the
 * whole session (probe P-PROC, both postures). A process that left the tree (a detached daemon) is no background
 * terminal of Codex's, and is not counted. `{ running, unknown, pids }`: `unknown` names why it cannot tell (no
 * listing, no Codex process, that process gone or its pid reused, a descendant whose environment cannot be read), and
 * then `running` is true, the direction E8-D7 takes. `own` is `{ inherited, session }`: the CODEX_SESSION_ID the
 * calling hook inherited, and the session's id. A Codex started with the variable already set passes it to its hooks
 * and helpers unchanged, and only the commands it runs get the session's own, so a value that differs from the
 * session's is no command's and counts as none (Standards R4-N2).
 */
export function codexBackground(listing, codex, own = {}) {
  const unknown = (why) => ({ running: true, unknown: why, pids: [] })
  if (!listing?.procs) return unknown(listing?.error || 'no process listing')
  if (!codex) return unknown('no Codex process above the hook')
  const kids = new Map()
  let root = null
  for (const p of listing.procs) {
    if (p.pid === codex.pid) root = p
    if (!kids.has(p.ppid)) kids.set(p.ppid, [])
    kids.get(p.ppid).push(p)
  }
  if (!root || (codex.start != null && root.start != null && root.start !== codex.start)) return unknown('the Codex process is gone')
  const live = []
  for (let queue = [...(kids.get(root.pid) || [])], seen = new Set([root.pid]); queue.length;) {
    const p = queue.shift()
    if (seen.has(p.pid)) continue
    seen.add(p.pid)
    if (p.state !== 'Z') live.push(p)
    queue.push(...(kids.get(p.pid) || []))
  }
  const foreign = own.inherited && own.inherited !== own.session ? own.inherited : null
  const work = live.filter((p) => p.session && p.session !== foreign)
  if (work.length) return { running: true, unknown: null, pids: work.map((p) => p.pid) }
  const blind = live.find((p) => p.session === null || p.session === undefined)
  return blind ? unknown(`the environment of process ${blind.pid} could not be read`) : { running: false, unknown: null, pids: [] }
}

/**
 * The observations Codex's hooks do not carry (seam S5), from the session's rollout, herdr's agent_status for its pane
 * (null when there is no pane, or none may be read) and `procs`, `{ listing, codex, inherited, session }` for
 * codexBackground (absent, it is unknown): `backgroundRunning`, the session's background work live or unknown (E8-D7's background_tasks), with
 * `backgroundUnknown` naming why it is unknown, else null; `apiError`, the error a task_complete carries after the
 * last user turn, as a 5xx ends a turn with no Stop (probe B6, E8-D18's StopFailure), else null; `idle`, the turn
 * ended with no error and no background work, its last assistant message not the ready line, and herdr reporting the
 * pane ready for input where it was read (E8-D18's idle_prompt).
 */
export function codexObservations(rolloutText, herdrStatus, procs) {
  const t = codexTurnState(rolloutText)
  const bg = codexBackground(procs?.listing, procs?.codex, procs)
  const apiError = t.ended && t.error ? t.error : null
  const ready = herdrStatus === null || herdrStatus === undefined || READY_STATUSES.includes(herdrStatus)
  return { backgroundRunning: bg.running, backgroundUnknown: bg.unknown, apiError, idle: t.ended && !apiError && !bg.running && !endsReady(t.lastMessage) && ready }
}

/** The paused line for background work the watcher could not read past its idle grace (E10H-R3-B4, E8-D16): E8-D7's
 *  direction holds the Stop, and this makes the hold visible, so E8-D26 alerts. Not a D2 table code: its reason is its
 *  text, and its action CODEX_ACTIONS' (E10H-R4-B2). */
export const unknownBackgroundReason = (why) => `could not tell whether background work is still running: ${why}`

/** The watcher's turn, from the rollout text written since it started (at its UserPromptSubmit): `ended` once a
 *  task_complete or turn_aborted is there, and `newTurn` once a task_started follows that end. */
export function watchedTurn(text) {
  let ended = false, newTurn = false
  for (const l of String(text ?? '').split('\n')) {
    let e
    try { e = JSON.parse(l) } catch { continue }
    if (e?.type !== 'event_msg') continue
    if (!ended && (e.payload?.type === 'task_complete' || e.payload?.type === 'turn_aborted')) ended = true
    else if (ended && e.payload?.type === 'task_started') newTurn = true
  }
  return { ended, newTurn }
}

/** The watcher's timings in ms: poll, how long a turn end stays idle before the idle pause (Claude Code raises
 *  idle_prompt after about 60 s), the longest it watches one turn, and how long an unfinished turn's rollout may go
 *  without growing before the turn reads stalled (E10-R29). A turn whose provider stops answering never ends and
 *  writes nothing more (Codex retries "waiting for network"). A healthy turn also goes quiet: a wait on seats writes
 *  nothing until its timeout, which Codex sessions have set to 600 s, and a long answer or a compaction has run past
 *  5 minutes with no write. The stall time sits above all of those. */
export const WATCH_TIMES = { poll: 2000, idle: 60000, max: 12 * 3600 * 1000, stall: 15 * 60 * 1000 }

/**
 * The Codex watcher's next action (E10 table rows for idle_prompt, StopFailure and background_tasks): Codex fires no
 * hook for a turn ended by an API error, for a session left idle, or for a background terminal's exit (probes B5, B6),
 * so a detached watcher started at each UserPromptSubmit reads the rollout and herdr and hands the auto-cycle hook the
 * event Claude Code would have fired. `o.turn` is watchedTurn's, `o.obs` codexObservations', `o.held` whether this
 * turn's Stop decided to wait for live work, as that Stop itself persisted it (the Stop runs before Codex writes the
 * task_complete, so what the rollout shows at the turn's end is not what the Stop read: E10H-R2-B2), `o.liveWork`
 * liveWork's reason or null, `o.session` the watched session and `o.paneSession` the session herdr names in the pane
 * (null when unread), `o.ready` whether the turn's last message ends with the ready line, `o.idleFor` ms the
 * observation has read idle, `o.unknownFor` ms it has read the background work unknown, `o.stalledFor` ms the
 * rollout has not grown while the turn is unfinished, `o.age` ms watched. A turn
 * ended on the ready line with no terminal running and no Stop held leaves nothing to watch: its Stop decided, and an
 * idle pause never follows the ready line (E8-D18). A held Stop whose background work cannot be read stays held, E8-D7's
 * direction, but never silently: past the idle grace the watcher hands on the unknown (E10H-R3-B4).
 * Acts: `exit`, `wait`, `stopFailure` (an API error ended the turn), `stall` (the turn stalled: handed on as a
 * StopFailure whose `error` names the stall, E10-R29), `stop` (the work that held the Stop back is gone:
 * the background work finished and no seat or gate is live, so the Stop is decided again), `idle` and `unknown`.
 */
export function watchStep(o) {
  const t = o.times || WATCH_TIMES
  if (!o.active) return { act: 'exit', reason: 'auto-cycle is not active' }
  if (o.turn.newTurn) return { act: 'exit', reason: 'a new turn started, and its own watcher follows it' }
  if (o.paneSession && o.paneSession !== o.session) return { act: 'exit', reason: 'herdr names another session in the pane' }
  if (o.age >= t.max) return { act: 'exit', reason: 'the turn was watched for the longest time allowed' }
  if (!o.turn.ended) {
    return o.stalledFor >= t.stall
      ? { act: 'stall', error: `turn stalled, no rollout write for ${Math.round(t.stall / 1000)} s with the turn unfinished`, reason: 'the turn is unfinished and its rollout has not grown for the stall time' }
      : { act: 'wait', reason: 'the turn is running' }
  }
  if (o.obs.apiError) return { act: 'stopFailure', reason: `the turn ended with an API error (${o.obs.apiError})` }
  if (o.held && !o.liveWork && o.obs.backgroundUnknown) {
    return o.unknownFor >= t.idle ? { act: 'unknown', reason: `the background work could not be read (${o.obs.backgroundUnknown})` } : { act: 'wait', reason: 'the background work could not be read, inside the grace' }
  }
  if (o.held) return o.obs.backgroundRunning || o.liveWork ? { act: 'wait', reason: 'the Stop is held for live work' } : { act: 'stop', reason: 'the work that held the Stop back is gone' }
  if (o.ready && !o.obs.backgroundRunning) return { act: 'exit', reason: 'the turn ended on the ready line, so the Stop hook and the typer take it from here' }
  if (o.obs.idle && o.idleFor >= t.idle) return { act: 'idle', reason: 'the session has been idle, waiting for the user' }
  return { act: 'wait', reason: o.obs.idle ? 'idle, inside the grace' : 'nothing to report' }
}

/**
 * typerAct on Codex (E10 table rows for the typer, E10 S1). Before the /clear it is typerAct itself. After it the
 * typer waits one poll, then sends the resume line once herdr reads the pane ready and unfocused and the composer read
 * finds it empty; it never reads the screen for a sign that the /clear took. The prompt gate (dctr-promptgate.mjs)
 * blocks the resume line in any session but the one this pane's restore file names, and its gated marker (`o.gated`,
 * the session it blocked) settles the /clear: the old session means it did not take, R18, nothing more sent; another
 * session means the new chat started without doctrine, R14. Otherwise the restore file and the first turn confirm,
 * as on Claude Code.
 *
 * A new session before the resume line (a restore file, or herdr naming a session other than the old one) is one the
 * user started by typing in the new chat, as codex-cli 0.160.0 starts it at the first prompt, or one a host started at
 * the /clear itself, as Claude Code does. Only the new chat's rollout tells them apart, so after one poll beside the
 * restore file the step is typerAct's: typing pauses R16, nothing typed sends the resume line.
 */
function codexTyperAct(o) {
  const t = o.times || TYPER_TIMES
  const pause = (code, arg) => ({ act: 'pause', code, reason: pauseReason(code, arg, 'codex') })
  if (o.stage === 'clear') {
    const step = typerAct(o)
    return step.act === 'clear' ? codexSendGuard(o, t, pause) || step : step
  }
  const guard = typerGuard(o, t, pause)
  if (guard) return guard
  if (o.stage === 'resume') {
    if (o.waited < t.poll) return { act: 'wait', reason: 'one poll after the /clear before the next send' }
    const s = paneSession(o.pane)
    if (o.restore || (s !== null && s !== o.oldSession)) {
      if (o.restore && o.sessionWait < t.poll) return { act: 'wait', reason: 'one poll beside the restore file, for the new chat\'s rollout' }
      const step = typerAct(o)
      return step.act === 'resume' ? codexSendGuard(o, t, pause) || step : step
    }
    return codexSendGuard(o, t, pause) || { act: 'resume', reason: 'the pane is ready, unfocused and its composer empty after the /clear' }
  }
  if (o.gated) return o.gated === o.oldSession ? pause('R18', o.oldSession) : pause('R14')
  if (!o.restore) return o.waited < t.restore ? { act: 'wait', reason: 'waiting for the restore file' } : pause('R14')
  const s = paneSession(o.pane)
  if (s !== o.restore.session) {
    if (s !== null && s !== o.oldSession) return pause('R16')
    return o.sessionWait < t.session ? { act: 'wait', reason: 'herdr does not report the new session yet' } : pause('R17', s === null ? R17_WHY.lookup : R17_WHY.session)
  }
  if (o.typedNew) return pause('R16')
  if (o.firstTurn) return { act: 'confirm', reason: 'the new session took its first turn' }
  // Esc on the resume turn before its first answer: turn_aborted, no Stop, herdr done (probe B6). The user holds the
  // pane, so nothing is sent again (E10H-R4-B1).
  if (o.aborted) return pause('R16')
  if (o.waited < t.firstTurn) return { act: 'wait', reason: 'waiting for the first turn' }
  if (o.typedNew === null) return pause('R17', R17_WHY.transcript)
  if (o.resumes >= 2) return pause('R15')
  return codexSendGuard(o, t, pause) || { act: 'resume', reason: 'no first turn yet, so the resume line once more' }
}

/**
 * The checks before every Codex send, the /clear, the first resume line and a second one alike (E10H-R4-B1): a
 * composer that is not empty (`o.composer`, composerIdle's) is typing,
 * R16 whether or not the pane is focused; then typerReady (a session named, unfocused, ready); then a pane showing no
 * composer line is not ready: it waits while the absent reads have lasted (`o.absentFor`, ms since the first of them)
 * under the session wait, then pauses with R17 naming the composer (E10-D28); then a composer nobody read (null)
 * pauses with R17, since only a read pane says it is empty. A step, or null when the typer may send. What the new
 * chat's rollout shows (typing, an interrupted resume turn) is checked before the retry reaches this.
 */
function codexSendGuard(o, t, pause) {
  if (o.composer === false) return pause('R16')
  if (o.composer === 'absent') return typerReady(o, t, pause) || (o.absentFor < t.session ? { act: 'wait', reason: 'the pane shows no composer yet' } : pause('R17', R17_WHY.composer))
  return typerReady(o, t, pause) || (o.composer === true ? null : pause('R17', R17_WHY.lookup))
}

// ---------------------------------------------------------------- the Codex install (E10-D1 to E10-D6)
//
// Codex 0.156.1 loads no plugin hooks under the root manifest, so the doctrine's hooks reach Codex through the
// user's CODEX_HOME/hooks.json, which `dctr-codex.mjs install` writes from codexInstallPlan below. Codex runs a
// user hook only when config.toml carries `[hooks.state."<hooks.json path>:<event>:<group>:<handler>"]
// trusted_hash = "<trustedHash>"`; without it `codex exec` skips the hook silently. Source of every fact here:
// doctrine-skills-project .doctrine/records/e10-hookport/probes/A-hook-runtime.md (A5), and codex-rs at
// rust-v0.156.1 (hooks/src/engine/discovery.rs hook_hash, hooks/src/events/common.rs matcher_pattern_for_event).

/** What the install registers on Codex: [event, script, timeout in seconds, matcher]. One script serves both
 *  hosts; a matcher only where Codex applies one (SessionStart matches its source). Codex clamps a SessionEnd
 *  timeout to 1..3 seconds, so 3 is the most it can have. No Interrupt entry: dctr-cycle.mjs acts on no Interrupt (N2). */
export const CODEX_HOOKS = [
  ['SessionStart', 'dctr-restore.mjs', 5, 'clear'],
  ['SessionStart', 'dctr-seat.mjs', 10, 'clear'],
  ['SubagentStart', 'dctr-seat.mjs', 10],
  ['SubagentStop', 'dctr-seat.mjs', 10],
  ['SessionEnd', 'dctr-seat.mjs', 3],
  ['PostToolUse', 'dctr-gauge.mjs', 5],
  ['Stop', 'dctr-cycle.mjs', 60],
  ['UserPromptSubmit', 'dctr-cycle.mjs', 5],
  ['UserPromptSubmit', 'dctr-promptgate.mjs', 30],
  ['PermissionRequest', 'dctr-cycle.mjs', 30],
]
/** `SessionStart` -> `session_start`, the label Codex keys trust lines and hashes by. */
export const hookEventLabel = (ev) => String(ev).replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase()
const CONTEXT_LIMIT_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SubagentStart']
/** JSON with keys sorted at every level and no spaces, as serde_json writes Codex's TOML identity value. */
const sortedJson = (v) => (Array.isArray(v) ? `[${v.map(sortedJson).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(v[k])}`).join(',')}}`
  : JSON.stringify(v))

/** The trusted_hash Codex 0.156.1 computes for handler `hi` of `group` under `eventName`. */
export function trustedHash(eventName, group, hi = 0) {
  const h = group.hooks[hi]
  const t = typeof h.timeout === 'number' ? h.timeout : null
  const handler = { type: 'command', command: h.command, async: Boolean(h.async),
    timeout: ['SessionEnd', 'Interrupt'].includes(eventName) ? Math.min(Math.max(t ?? 1, 1), 3) : Math.max(t ?? 600, 1) }
  if (h.statusMessage != null) handler.statusMessage = h.statusMessage
  if (h.additionalContextLimit != null && h.additionalContextLimit !== 2500 && CONTEXT_LIMIT_EVENTS.includes(eventName)) handler.additionalContextLimit = h.additionalContextLimit
  const identity = { event_name: hookEventLabel(eventName), hooks: [handler] }
  if (group.matcher != null) identity.matcher = group.matcher
  return 'sha256:' + crypto.createHash('sha256').update(sortedJson(identity)).digest('hex')
}

// A line editor for config.toml, enough for the two keys the install writes and correct on everything around them:
// it never rewrites a line it does not own, and it tracks strings and brackets so a line inside a multi-line string
// or a nested array that opens with "[" is never read as a table. A shape it cannot edit in place, it refuses.
const TOML_ESC = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', e: '\x1b', '"': '"', '\\': '\\' }
function parseTomlKey(s, i) {
  const segs = []
  for (;;) {
    while (s[i] === ' ' || s[i] === '\t') i++
    let seg = ''
    if (s[i] === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) {
        if (s[i] !== '\\') { seg += s[i]; continue }
        const e = s[++i], n = { u: 4, U: 8, x: 2 }[e]
        if (n) { seg += String.fromCodePoint(parseInt(s.slice(i + 1, i + 1 + n), 16)); i += n } else if (e in TOML_ESC) seg += TOML_ESC[e]; else return null
      }
      if (s[i++] !== '"') return null
    } else if (s[i] === "'") {
      const j = s.indexOf("'", i + 1)
      if (j < 0) return null
      seg = s.slice(i + 1, j); i = j + 1
    } else {
      seg = /^[A-Za-z0-9_-]*/.exec(s.slice(i))[0]
      if (!seg) return null
      i += seg.length
    }
    segs.push(seg)
    while (s[i] === ' ' || s[i] === '\t') i++
    if (s[i] !== '.') return { segs, end: i }
    i++
  }
}
/** Each line tagged header, array-header, key, cont (inside a value begun on an earlier line) or other (blank or
 *  comment). A header carries its table path; a key line its table, its full path, where its `=` is and where
 *  its comment starts. */
export function tomlLines(text) {
  let state = null, depth = 0, table = []
  return text.split('\n').map((line) => {
    const row = { text: line, kind: 'cont' }
    if (state === null && depth === 0) {
      const t = line.trimStart(), off = line.length - t.length
      if (t === '' || t.startsWith('#')) row.kind = 'other'
      else if (t.startsWith('[')) {
        const arr = t.startsWith('[[')
        const k = parseTomlKey(t, arr ? 2 : 1)
        if (!k || !t.startsWith(arr ? ']]' : ']', k.end)) throw new Error(`config.toml: unreadable table header ${JSON.stringify(line)}`)
        Object.assign(row, { kind: arr ? 'array-header' : 'header', path: k.segs })
        table = arr ? ['\0array', ...k.segs] : k.segs
      } else {
        const k = parseTomlKey(t, 0)
        if (!k || t[k.end] !== '=') throw new Error(`config.toml: unreadable line ${JSON.stringify(line)}`)
        Object.assign(row, { kind: 'key', table, path: [...table, ...k.segs], eq: off + k.end })
      }
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (state === null) {
        if (c === '#') { row.commentAt = i; break }
        if (c === '"' || c === "'") { if (line.startsWith(c.repeat(3), i)) { state = c.repeat(3); i += 2 } else state = c }
        else if (c === '[' || c === '{') depth++
        else if (c === ']' || c === '}') depth--
      } else if (c === '\\' && state[0] === '"') i++
      else if (state.length === 1 ? c === state : line.startsWith(state, i)) {
        // A multi-line string may end in up to two more quotes of its own content: `""""` is `"` then the close.
        if (state.length === 3) { i += 2; for (let n = 0; n < 2 && line[i + 1] === state[0]; n++) i++ }
        state = null
      }
    }
    if (state === '"' || state === "'") state = null
    return row
  })
}
const eqPath = (a, b) => a.length === b.length && a.every((s, i) => s === b[i])
const underPath = (a, pre) => a.length > pre.length && pre.every((s, i) => s === a[i])
const tomlKey = (seg) => (/^[A-Za-z0-9_-]+$/.test(seg) ? seg : JSON.stringify(seg))
const tomlPath = (p) => p.map(tomlKey).join('.')
/** The index after the last line a table's block holds (its header, keys and their continuations). */
function tomlBlockEnd(rows, h) {
  let last = h
  for (let i = h + 1; i < rows.length && !rows[i].kind.endsWith('header'); i++) if (rows[i].kind !== 'other') last = i
  return last + 1
}
/** `tablePath.key = value`, written in place where the key exists, under the table's header where only the table
 *  does, and otherwise as a new table after the last table under `anchor`, else at the end. Returns whether the
 *  lines changed. */
function tomlSet(lines, tablePath, key, value, anchor = null) {
  const rows = tomlLines(lines.join('\n'))
  const full = [...tablePath, key]
  for (const [i, r] of rows.entries()) {
    if (r.kind !== 'key') continue
    if (eqPath(r.path, full)) {
      if (rows[i + 1]?.kind === 'cont') throw new Error(`config.toml: ${tomlPath(full)} spans several lines; set it to ${value} by hand and re-run`)
      if (r.text.slice(r.eq + 1, r.commentAt ?? r.text.length).trim() === value) return false
      lines[i] = `${r.text.slice(0, r.eq + 1)} ${value}`
      return true
    }
    if (underPath(full, r.path)) throw new Error(`config.toml sets ${tomlPath(r.path)} inline, so the install cannot add ${tomlPath(full)} without rewriting it; write ${tomlPath(r.path)} as a [${tomlPath(r.path)}] table and re-run`)
    if (r.table.length < tablePath.length && underPath(r.path, tablePath)) throw new Error(`config.toml defines ${tomlPath(tablePath)} with dotted keys; write it as a [${tomlPath(tablePath)}] table and re-run`)
  }
  const h = rows.findIndex((r) => r.kind === 'header' && eqPath(r.path, tablePath))
  if (h >= 0) { lines.splice(h + 1, 0, `${tomlKey(key)} = ${value}`); return true }
  const last = anchor ? rows.findLastIndex((r) => r.kind === 'header' && (eqPath(r.path, anchor) || underPath(r.path, anchor))) : -1
  const at = last >= 0 ? tomlBlockEnd(rows, last) : lines.length
  lines.splice(at, 0, ...(at > 0 && lines[at - 1].trim() !== '' ? [''] : []), `[${tomlPath(tablePath)}]`, `${tomlKey(key)} = ${value}`)
  return true
}
/** A setting at `full` (table path plus key) as config.toml holds it: `value`, its text, as a `key = value` line or as
 *  a key inside an inline table on the table's own line; `inline`, whether the table is such a line. */
function optionalValue(lines, full) {
  const rows = tomlLines(lines.join('\n'))
  const row = rows.find((r) => r.kind === 'key' && eqPath(r.path, full))
  if (row) return { value: row.text.slice(row.eq + 1, row.commentAt ?? row.text.length).trim(), inline: false }
  const table = rows.find((r) => r.kind === 'key' && eqPath(r.path, full.slice(0, -1)))
  if (!table) return { value: undefined, inline: false }
  return { value: inlineTopValue(table.text.slice(table.eq + 1, table.commentAt ?? table.text.length), full.at(-1)), inline: true }
}
/** The text of `key`'s value among the top-level keys of the inline table `text` (`{ k = v, ... }`), or undefined: a
 *  key of that name in a nested table or inside a string is not it. */
function inlineTopValue(text, key) {
  const parts = []
  let depth = 0, q = null, start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '{' || c === '[') { if (depth++ === 0) start = i + 1 }
    else if (c === '}' || c === ']') { if (--depth === 0) parts.push(text.slice(start, i)) }
    else if (c === ',' && depth === 1) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  for (const p of parts) {
    const t = p.trimStart(), k = parseTomlKey(t, 0)
    if (k && k.segs.length === 1 && k.segs[0] === key && t[k.end] === '=') return t.slice(k.end + 1).trim()
  }
  return undefined
}

/** tomlSet for a setting the install does not own: true when written, false when already so, and tomlSet's refusal
 *  message, not thrown, where it would have to rewrite a line the user wrote (an inline table, dotted keys). */
function optionalSet(lines, full, value) {
  try { return tomlSet(lines, full.slice(0, -1), full.at(-1), value) } catch (e) { return e.message }
}

/** Remove a table's block and the blank line before it. */
function tomlRemove(lines, tablePath) {
  const rows = tomlLines(lines.join('\n'))
  const h = rows.findIndex((r) => r.kind === 'header' && eqPath(r.path, tablePath))
  if (h < 0) return
  const from = h > 0 && lines[h - 1].trim() === '' ? h - 1 : h
  lines.splice(from, tomlBlockEnd(rows, h) - from)
}
function tomlRename(lines, from, to) {
  const h = tomlLines(lines.join('\n')).findIndex((r) => r.kind === 'header' && eqPath(r.path, from))
  if (h >= 0) lines[h] = `[${tomlPath(to)}]`
}

/** The concurrent seats a Codex session may run, which the install writes as agents.max_concurrent_threads_per_session (E10-R17). */
const CODEX_SEATS = 8

/**
 * The install as text in, text out: hooks.json with the CODEX_HOOKS entries running the scripts in `hookDir`, and
 * config.toml with a trust line for each, and sandbox_workspace_write.network_access = true (Q3) and the seat limit
 * where each is absent. An entry is the
 * install's own when its group is one handler running `node '<hookDir>/dctr-*.mjs'`; every other entry and trust
 * line is left byte-identical (E10-D2). Own entries are rewritten in place, so no foreign group changes index and
 * its trust key still names it; a foreign group that does move, because a surplus own entry before it went, has
 * its trust table renamed to its new key. Run on its own output it changes nothing (E10-D4). Throws on a shape it
 * cannot edit without rewriting something it does not own. `hooksJson` and `configToml` are the files' text, or
 * null where the file is absent.
 */
export function codexInstallPlan({ hooksJson, configToml, hookDir, hooksJsonPath }) {
  let doc = { hooks: {} }
  const hasHooks = hooksJson != null && hooksJson.trim() !== ''
  if (hasHooks) {
    try { doc = JSON.parse(hooksJson) } catch (e) { throw new Error(`hooks.json is not JSON: ${e.message}`) }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('hooks.json is not a JSON object')
    doc.hooks ??= {}
    if (!doc.hooks || typeof doc.hooks !== 'object' || Array.isArray(doc.hooks)) throw new Error('hooks.json: "hooks" is not an object')
  }
  const ownPrefix = `node ${shq(hookDir + '/')}`.slice(0, -1)
  const isOwn = (g) => Array.isArray(g?.hooks) && g.hooks.length === 1 && typeof g.hooks[0]?.command === 'string' &&
    g.hooks[0].command.startsWith(ownPrefix) && /^dctr-[a-z]+\.mjs'$/.test(g.hooks[0].command.slice(ownPrefix.length))
  const want = {}
  for (const [ev, script, timeout, matcher] of CODEX_HOOKS) {
    (want[ev] ||= []).push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: `node ${shq(path.join(hookDir, script))}`, timeout }] })
  }
  const keyOf = (ev, gi, hi = 0) => ['hooks', 'state', `${hooksJsonPath}:${hookEventLabel(ev)}:${gi}:${hi}`]
  const drops = [], moves = [], trust = []
  for (const ev of new Set([...Object.keys(doc.hooks), ...Object.keys(want)])) {
    const old = doc.hooks[ev] ?? []
    if (!Array.isArray(old)) throw new Error(`hooks.json: hooks.${ev} is not an array`)
    const desired = want[ev] || [], next = []
    let di = 0
    const place = () => { trust.push([keyOf(ev, next.length), trustedHash(ev, desired[di])]); next.push(desired[di++]) }
    old.forEach((g, gi) => {
      if (!isOwn(g)) {
        if (next.length !== gi) for (let hi = 0; hi < (g?.hooks?.length || 0); hi++) moves.push([keyOf(ev, gi, hi), keyOf(ev, next.length, hi)])
        next.push(g)
      } else if (di < desired.length) place()
      else drops.push(keyOf(ev, gi))
    })
    while (di < desired.length) place()
    if (doc.hooks[ev] !== undefined || next.length) doc.hooks[ev] = next
  }

  const messages = []
  const indent = /\n([ \t]+)\S/.exec(hooksJson || '')?.[1] ?? 2
  const nl = (text) => (!text || text.endsWith('\n') ? '\n' : '')
  if (hasHooks && JSON.stringify(JSON.parse(hooksJson), null, indent) + nl(hooksJson) !== hooksJson) {
    // The file is written back whole. Where it round-trips through JSON.stringify every entry the install did not
    // write comes back byte for byte; any other layout would come back changed, which E10-D2 forbids, so it is
    // refused before either file is written (E10H-B5). ponytail: refuse, not splice; splice the text if a
    // hand-laid-out hooks.json must be accepted as it stands.
    throw new Error(`hooks.json is not laid out as JSON.stringify(value, null, ${JSON.stringify(indent)}) lays it out, so writing the doctrine entries would change the bytes of entries the install does not own; lay it out that way, or add the entries by hand, and re-run`)
  }
  const hooksOut = JSON.stringify(doc, null, indent) + nl(hooksJson)
  messages.push(hooksOut === hooksJson ? 'hooks.json: no change, the doctrine entries are current'
    : `hooks.json: ${trust.length} doctrine entries (${[...new Set(CODEX_HOOKS.map(([ev]) => ev))].join(', ')}) run the hooks in ${hookDir}`)

  const lines = configToml ? configToml.replace(/\n$/, '').split('\n') : []
  // A trust entry is moved or removed with its hook only as a [hooks.state."<key>"] table; one written as a dotted
  // key or inside an inline table would stay behind at its old index, leaving the hook it names untrusted there
  // (E10H-R2-B3). So any such entry is refused before either file is written, as a hooks.json layout is (E10H-B5).
  const HS = ['hooks', 'state']
  const loose = tomlLines(lines.join('\n')).findIndex((r) => r.kind === 'key' && r.table.length < 3 && (underPath(r.path, HS) || underPath(HS, r.path) || eqPath(r.path, HS)))
  if (loose >= 0) throw new Error(`config.toml line ${loose + 1} writes a hook trust entry as a dotted key or an inline table, which the install cannot move with the hook it names; write each [hooks.state] entry as its own [hooks.state."<key>"] table and re-run`)
  for (const k of drops) tomlRemove(lines, k)
  for (const [from, to] of moves) tomlRename(lines, from, to)
  const written = trust.filter(([k, hash]) => tomlSet(lines, k, 'trusted_hash', JSON.stringify(hash), ['hooks', 'state'])).length
  messages.push(written || drops.length || moves.length ? `config.toml: ${written} doctrine hook trust lines written` : 'config.toml: the doctrine trust lines are current')
  // The two settings below are not the install's to own. Where the user wrote the table they sit in on one line (an
  // inline table), or in another shape tomlSet will not edit, that line is left byte-identical, the install says so
  // and how to add the setting, and the rest of the install goes ahead; only the trust lines above refuse.
  // Each is written only where absent; a value the user set, whatever it is, is left byte-identical, comment and all,
  // and the install says so in one line (the owner's ruling).
  const NET = ['sandbox_workspace_write', 'network_access']
  const netNow = optionalValue(lines, NET)
  const net = netNow.value === undefined ? optionalSet(lines, NET, 'true') : null
  messages.push(net === true
    ? 'config.toml: set sandbox_workspace_write.network_access = true, so a command Codex runs in its workspace-write sandbox can reach herdr (and the network)'
    : netNow.value === 'true' ? 'config.toml: sandbox_workspace_write.network_access = true was already set'
      : netNow.value !== undefined ? `config.toml: sandbox_workspace_write.network_access = ${netNow.value} left as it is; the doctrine sets true only where it is absent, and while it is not true a command Codex runs in its workspace-write sandbox cannot reach herdr`
      : netNow.inline ? 'config.toml: sandbox_workspace_write is an inline table, so the install left it as it is and did not set sandbox_workspace_write.network_access = true; add network_access = true inside its braces so a command Codex runs in its workspace-write sandbox can reach herdr'
        : `config.toml: did not set sandbox_workspace_write.network_access = true, and left the line as it is: ${net}`)
  // The seat limit (E10-R17): Codex refuses a spawn past agents.max_concurrent_threads_per_session.
  const SEATS = ['agents', 'max_concurrent_threads_per_session']
  const seats = optionalValue(lines, SEATS), seatsNow = seats.value
  const seatsSet = seatsNow === undefined ? optionalSet(lines, SEATS, String(CODEX_SEATS)) : null
  messages.push(seatsSet === true
    ? `config.toml: set agents.max_concurrent_threads_per_session = ${CODEX_SEATS}, so Codex runs up to ${CODEX_SEATS} seats at once`
    : seatsNow === undefined ? (seats.inline ? `config.toml: agents is an inline table, so the install left it as it is and did not add agents.max_concurrent_threads_per_session = ${CODEX_SEATS}; to let Codex run up to ${CODEX_SEATS} seats at once, add max_concurrent_threads_per_session = ${CODEX_SEATS} inside its braces`
      : `config.toml: did not add agents.max_concurrent_threads_per_session = ${CODEX_SEATS}, and left the line as it is: ${seatsSet}`)
      : seatsNow === String(CODEX_SEATS) ? `config.toml: agents.max_concurrent_threads_per_session = ${CODEX_SEATS} was already set`
        : `config.toml: agents.max_concurrent_threads_per_session = ${seatsNow} left as it is; the doctrine sets ${CODEX_SEATS} only where it is absent`)
  return { hooksJson: hooksOut, configToml: lines.join('\n') + (lines.length ? nl(configToml) : ''), messages }
}

// ---------------------------------------------------------------- the doctor (E10 S12, E10-R33)
//
// dctr-doctor.mjs drives the installed Codex and Claude Code in scratch homes under its own herdr server and records
// what it saw; doctorVerdict reads that record, signal by signal, against the facts the hooks depend on. The drive,
// per host: launch in a herdr pane, type DOCTOR_MARKED in the startup session (the gate must block it), type
// DOCTOR_PLAIN (one turn), /clear, type a draft and erase it (Codex), type DOCTOR_MARKED again (the gate must pass
// it: one turn), quit. `obs` is { host, launched, log, blocked, passed, transcript, composer, pane, hookLogs }:
// `log` the probe logger's lines in order, each a hook payload's event, the fields below, its keys and `restored`,
// the session this pane's restore file named when the hook ran; `blocked` and `passed` the pane's gated marker after
// each marked line; `transcript` the plain turn's transcript path and text read at its Stop; `composer` the pane text
// read first after the /clear (`afterClear`: the first read with no composer line where the TUI showed one, else the
// first read), a few seconds after it (`cleared`) and with the draft (Codex); `pane` herdr's agent_status and
// agent_session after the last turn; `hookLogs` every doctrine hook.log of the run.

/** The line the doctor types for a plain turn, and the marked line the gate decides on. */
export const DOCTOR_PLAIN = 'Reply with the single word ok. Use no tools.'
export const DOCTOR_MARKED = `${DOCTOR_PLAIN} ${RESUME_MARK}`
/** The draft the doctor types into the Codex composer after /clear and erases unsent. */
export const DOCTOR_DRAFT = 'doctor draft, never sent'

/** Each signal's stable code and what holds when it is ok. codexOnly: read on Codex only. */
export const DOCTOR_SIGNALS = {
  L1: { what: 'the host launches in a herdr pane and reaches its prompt' },
  E1: { what: 'SessionStart fires for the startup and the /clear session, with session_id, transcript_path, source and cwd' },
  E2: { what: 'UserPromptSubmit fires with session_id, transcript_path, cwd and the prompt raw as typed (on Codex also turn_id)' },
  E3: { what: 'Stop fires after a turn with session_id, transcript_path, cwd, stop_hook_active and the reply as last_assistant_message (on Codex also turn_id)' },
  E4: { what: 'SessionEnd fires with session_id when the session quits' },
  T1: { what: 'the doctrine hook entries run (on Codex: are trusted): restore, prompt gate, and the cycle hook on UserPromptSubmit and Stop' },
  O1: { what: 'on a fresh chat, SessionStart(clear) has written the restore file before UserPromptSubmit runs' },
  G1: { what: 'the gate blocks a marked line in the old session: no turn follows it' },
  G2: { what: 'the gate passes a marked line in the session /clear started: a turn follows it' },
  R1: { what: 'hostOf reads the host from the transcript path' },
  R2: { what: 'transcriptEntries reads the typed prompt and the reply from the transcript, each with its text' },
  R3: { what: 'readUsage reads a used-token count from the transcript, from every field it sums, with the entry id (and on Codex the window)' },
  R4: { what: 'codexTurnState and the watcher\'s watchedTurn read the turn\'s start, its end and its last message from the rollout', codexOnly: true },
  C1: { what: 'composerIdle reads the composer after /clear as empty', codexOnly: true },
  C2: { what: 'composerIdle reads a composer showing the typed draft as not empty', codexOnly: true },
  C3: { what: 'composerIdle reads a pane with no composer line, read right after /clear, as absent, never as a draft', codexOnly: true },
  H1: { what: 'herdr reports the pane ready (agent_status idle or done) after the turn' },
  H2: { what: 'herdr reports the session /clear started as the pane\'s agent_session' },
}

/** The doctrine hook entries the drive fires, each with the mark it leaves (T1). */
const DOCTOR_RUNS = [
  ['SessionStart dctr-restore.mjs', (o) => /SessionStart restore injected/.test(o.hookLogs ?? '')],
  ['UserPromptSubmit dctr-promptgate.mjs', (o, s0) => Boolean(s0) && o.blocked?.gated?.session_id === s0],
  ['UserPromptSubmit dctr-cycle.mjs', (o) => / UserPromptSubmit auto-cycle /.test(o.hookLogs ?? '')],
  ['Stop dctr-cycle.mjs', (o) => / Stop auto-cycle /.test(o.hookLogs ?? '')],
]

/** The verdict over one host's observations: a row { code, ok, what, why } per signal the host is read for. Every
 *  field a row reads drifts that row when it is missing or wrong, and a malformed observation never makes the
 *  verdict throw. */
export function doctorVerdict(obs) {
  const o = obs || {}, host = o.host === 'claude' ? 'claude' : 'codex'
  const log = Array.isArray(o.log) ? o.log.filter((e) => e && typeof e === 'object') : []
  const marked = (e) => typeof e.prompt === 'string' && e.prompt.includes(RESUME_MARK)
  const missing = (e, keys) => keys.filter((k) => e?.[k] === null || e?.[k] === undefined)
  const ss = (source) => log.find((e) => e.event === 'SessionStart' && e.source === source)
  const start = ss('startup'), clr = ss('clear'), s0 = start?.session_id, s1 = clr?.session_id
  const at = (e) => log.indexOf(e)
  const ups = (session, isMarked) => log.find((e) => e.event === 'UserPromptSubmit' && e.session_id === session && marked(e) === isMarked)
  const upsBlock = s0 && ups(s0, true), upsPlain = s0 && ups(s0, false), upsPass = s1 && ups(s1, true)
  const stopAfter = (u, session, before = Infinity) => u && log.find((e, i) => e.event === 'Stop' && e.session_id === session && i > at(u) && i < before)
  const plainStop = stopAfter(upsPlain, s0)
  const rows = []
  const stopped = o.launched !== true || o.stuck ? ' (the drive stopped, see L1)' : ''
  const row = (code, ok, why) => {
    if (host === 'codex' || !DOCTOR_SIGNALS[code].codexOnly) rows.push({ code, ok: Boolean(ok), what: DOCTOR_SIGNALS[code].what, why: ok ? '' : code === 'L1' ? why : why + stopped })
  }
  const lacks = (name, e, keys) => (e ? `${name} lacks ${missing(e, keys).join(', ')}` : `no ${name} seen`)
  const keysOk = (e, keys) => Boolean(e) && missing(e, keys).length === 0

  const shown = (s) => String(s?.screen ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-14).join(' / ') || 'nothing read'
  row('L1', o.launched === true && !o.stuck && !o.covered, o.launched !== true || o.stuck
    ? `${o.launched === true ? 'the composer did not come back empty' : 'the host did not reach its prompt'} before ${JSON.stringify(o.stuck?.before ?? 'the first line')}, so nothing after it was observed; the pane showed: ${shown(o.stuck)}`
    : `a screen covered the composer before ${JSON.stringify(o.covered?.before)} and was dismissed with esc: ${shown(o.covered)}`)
  const ssKeys = ['session_id', 'transcript_path', 'source', 'cwd']
  row('E1', keysOk(start, ssKeys) && keysOk(clr, ssKeys) && s0 !== s1,
    !start || !clr ? `no SessionStart with source ${!start ? 'startup' : 'clear'} seen` : s0 === s1 ? 'the /clear session has the startup session\'s id'
      : lacks(keysOk(start, ssKeys) ? 'SessionStart(clear)' : 'SessionStart(startup)', keysOk(start, ssKeys) ? clr : start, ssKeys))
  // The turn id the watcher matches a held Stop by, read from UserPromptSubmit and Stop on Codex only.
  const turnKey = host === 'codex' ? ['turn_id'] : []
  const upsKeys = ['session_id', 'transcript_path', 'cwd', 'prompt', ...turnKey]
  row('E2', keysOk(upsPlain, upsKeys) && upsPlain.prompt === DOCTOR_PLAIN,
    !upsPlain ? 'no UserPromptSubmit for the plain line seen' : upsPlain.prompt !== DOCTOR_PLAIN ? `the prompt arrived as ${JSON.stringify(String(upsPlain.prompt).slice(0, 80))}, not as typed` : lacks('UserPromptSubmit', upsPlain, upsKeys))
  // The cycle hook reads the reply's last line from last_assistant_message (endsReady), so an empty one drifts.
  const stopKeys = ['session_id', 'transcript_path', 'cwd', 'stop_hook_active', ...turnKey]
  const replyOk = typeof plainStop?.last_assistant_message === 'string' && plainStop.last_assistant_message.trim() !== ''
  row('E3', keysOk(plainStop, stopKeys) && typeof plainStop.stop_hook_active === 'boolean' && replyOk,
    !plainStop ? 'no Stop after the plain turn seen' : !keysOk(plainStop, stopKeys) ? lacks('Stop', plainStop, stopKeys)
      : !replyOk ? 'the Stop carries no last_assistant_message with the reply\'s text' : 'the Stop\'s stop_hook_active is not a boolean')
  row('E4', Boolean(s1) && log.some((e) => e.event === 'SessionEnd' && e.session_id === s1), 'no SessionEnd naming the session that quit seen')
  const notRun = DOCTOR_RUNS.filter(([, ran]) => !ran(o, s0)).map(([name]) => name)
  row('T1', notRun.length === 0, `no sign that ${notRun.join(', ')} ran${host === 'codex' ? '; is its trust line in config.toml current?' : ''}`)
  row('O1', Boolean(upsPass) && at(clr) < at(upsPass) && upsPass.restored === s1,
    !upsPass ? 'no UserPromptSubmit for the marked line after /clear seen' : `at UserPromptSubmit the restore file named ${upsPass.restored ?? 'no session'}, not ${s1}`)
  const blockTurn = stopAfter(upsBlock, s0, upsPlain ? at(upsPlain) : Infinity)
  row('G1', Boolean(upsBlock) && !blockTurn,
    !upsBlock ? 'no UserPromptSubmit for the marked line in the startup session seen' : 'the marked line ran a turn (a Stop followed it)')
  row('G2', Boolean(s1) && Boolean(stopAfter(upsPass, s1)),
    s1 && o.passed?.gated?.session_id === s1 ? 'the gate blocked the marked line in the session /clear started' : 'no turn (Stop) followed the marked line after /clear')
  const t = o.transcript || {}, text = typeof t.text === 'string' ? t.text : null
  row('R1', hostOf({ transcript_path: t.path }) === host, `hostOf reads ${hostOf({ transcript_path: t.path })} from ${t.path}`)
  const read = text === null ? null : transcriptEntries(text, host)
  const typed = Boolean(read) && read.entries.some((e) => userTyped(e) && entryText(e).includes(DOCTOR_PLAIN))
  const replied = Boolean(read) && read.entries.some((e) => e?.type === 'assistant' && entryText(e).trim() !== '')
  row('R2', typed && replied, !read ? 'the transcript was not read or did not parse'
    : !typed ? 'no typed user entry holding the plain line among its entries' : 'no assistant entry whose text is not empty among its entries')
  const usage = readUsage(text, null, host)
  row('R3', Number.isFinite(usage.used) && usage.used > 0 && typeof usage.uuid === 'string' && usageFieldsOk(text, usage, host),
    usage.unknown ? `readUsage: ${usage.unknown}` : `the usage entry lacks a field readUsage reads (${host === 'codex' ? 'model_context_window' : 'uuid, input_tokens, cache_creation_input_tokens or cache_read_input_tokens'})`)
  // The rollout read twice over is a turn that ended followed by one that started: the order the watcher reads.
  const turn = text === null ? null : codexTurnState(text), watched = text === null ? null : watchedTurn(`${text}\n${text}`)
  row('R4', Boolean(turn?.ended) && typeof turn.lastMessage === 'string' && watched.ended && watched.newTurn,
    !turn ? 'the rollout was not read' : !turn.ended ? 'no ended turn in the rollout' : typeof turn.lastMessage !== 'string' ? 'the ended turn carries no last_agent_message' : 'no task_started the watcher reads as a new turn')
  row('C1', composerIdle(o.composer?.cleared) === true, 'the composer after /clear did not read empty')
  row('C2', composerIdle(o.composer?.draft) === false && composerLine(o.composer?.draft) === DOCTOR_DRAFT,
    composerLine(o.composer?.draft) === null ? 'no composer line on the screen with the draft' : `the composer read ${JSON.stringify(composerLine(o.composer?.draft))}, not the draft`)
  const ac = o.composer?.afterClear
  row('C3', composerIdle(ac) === (composerLine(ac) === null ? 'absent' : true),
    typeof ac !== 'string' ? 'no pane read was taken right after /clear' : composerLine(ac) === null ? `a pane with no composer line read ${JSON.stringify(composerIdle(ac))}, not absent` : `the first read after /clear read ${JSON.stringify(composerIdle(ac))}, not empty`)
  row('H1', READY_STATUSES.includes(o.pane?.agent_status), `herdr agent_status is ${o.pane?.agent_status ?? 'unread'}`)
  row('H2', Boolean(s1) && o.pane?.agent_session === s1, `herdr agent_session is ${o.pane?.agent_session ?? 'unread'}, not ${s1 ?? 'the /clear session'}`)
  return rows
}

/** Whether the usage entry readUsage chose carries every field it reads: on Claude Code the entry's uuid and the three
 *  token counts it sums (one renamed still leaves a total above zero), on Codex the window beside the input count. */
function usageFieldsOk(text, usage, host) {
  if (host === 'codex') return Number.isFinite(usage.window)
  for (const l of String(text).split('\n')) {
    let e
    try { e = JSON.parse(l) } catch { continue }
    if (e?.uuid === usage.uuid && e.type === 'assistant') return ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].every((k) => Number.isFinite(e.message?.usage?.[k]))
  }
  return false
}

/** 0 when every signal holds, 1 on any drift (2, cannot run, is the driver's). */
export const doctorExit = (rows) => (rows.every((r) => r.ok) ? 0 : 1)

/** The hook areas the drive never exercises, which a green run says nothing about. */
export const DOCTOR_UNEXERCISED = [
  'the context gauge (PostToolBatch, and PostToolUse on Codex)',
  'the seat hooks (SubagentStart, SubagentStop, and the SessionEnd sweep of seat panes)',
  'PermissionRequest',
  'Notification (permission_prompt, idle_prompt) and StopFailure',
  'a running background terminal holding a Stop',
  'a turn ended by Esc (turn_aborted) or by an API error (task_complete\'s error)',
]

/** What the doctor prints for `results`, { host: doctorVerdict rows }: each host's rows, the areas the drive does not
 *  exercise, and the verdict, which names the drifted signals or says every signal it reads holds. */
export function doctorSummary(results) {
  const out = [], drift = []
  for (const [host, rows] of Object.entries(results)) {
    out.push(host)
    for (const r of rows) {
      out.push(`  ${r.ok ? 'ok   ' : 'DRIFT'}  ${r.code}  ${r.what}${r.ok ? '' : `: ${r.why}`}`)
      if (!r.ok) drift.push(`${host} ${r.code}`)
    }
  }
  out.push('dctr-doctor: this run does not exercise:', ...DOCTOR_UNEXERCISED.map((a) => `  - ${a}`))
  out.push(drift.length ? `dctr-doctor: drift in ${drift.join(', ')}` : 'dctr-doctor: every signal it reads holds (not the areas above)')
  return out.join('\n')
}

// Account identifiers a capture can carry: a key naming an e-mail, an account, a user or an organization id,
// any e-mail address, and a connector's tool name (the session's connected MCP servers).
const PRIVATE_KEY = /email|account_?(id|uuid)|organization_?(id|uuid)|user_?id|org_?id/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const MCP_TOOL = /\bmcp__[A-Za-z0-9_-]+/g
const REDACTED = '[redacted]'

/** The doctor's observations with every account identifier replaced by `[redacted]`: a private key's value, an
 *  e-mail address and a connector tool name anywhere, and every field of an entry whose type names mcp. A string of
 *  JSON lines (a transcript) is redacted line by line, and a line that does not parse as a string. */
export function doctorRedact(obs) {
  const scrub = (s) => s.replace(EMAIL, REDACTED).replace(MCP_TOOL, REDACTED)
  const text = (s) => (!/^\s*\{/m.test(s) ? scrub(s) : s.split('\n').map((l) => {
    let e
    try { e = JSON.parse(l) } catch { return scrub(l) }
    return e && typeof e === 'object' ? JSON.stringify(walk(e)) : scrub(l)
  }).join('\n'))
  const walk = (v) => {
    if (typeof v === 'string') return text(v)
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== 'object') return v
    const mcp = typeof v.type === 'string' && /mcp/i.test(v.type)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x !== null && (PRIVATE_KEY.test(k) || (mcp && k !== 'type')) ? REDACTED : walk(x)]))
  }
  return walk(obs)
}

/** The account identifiers in a file's text, one line each: an e-mail address, a connector tool name, or a private
 *  key holding a string other than `[redacted]`, quoted or JSON-escaped. Empty when it carries none. */
export function privateFindings(text) {
  const t = String(text ?? ''), out = []
  for (const m of t.matchAll(EMAIL)) out.push(`e-mail ${m[0]}`)
  for (const m of t.matchAll(MCP_TOOL)) out.push(`connector tool ${m[0]}`)
  for (const m of t.matchAll(/\\?"([A-Za-z_]+)\\?"\s*:\s*\\?"(?!\[redacted\])([^"\\]*)/g)) if (PRIVATE_KEY.test(m[1])) out.push(`${m[1]} ${m[2]}`)
  return out
}
