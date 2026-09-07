// Three-clause tamper test for the seat hook's decisions, per CLAUDE.md.
//
//   node hooks/dctr-seat.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every decision in `dctr-lib.mjs` is pure, so all of this runs with no herdr server, no codex
// plugin and no Claude Code — which is exactly what CI is. The hook and the renderer hold only I/O
// around these functions, and that split exists so this file can exist.
//
// Clause 1 breaks something and confirms the right rule trips. Clause 2 confirms a known-good input
// stays silent, without which clause 1 proves nothing. Clause 3 proves each fixture really carries
// the property its clause depends on, without calling the function under test — the clause that
// catches a check which silently measures nothing.

import fs from 'node:fs'
import { SESSION_END_WAIT_MS } from './dctr-state.mjs'
import {
  agentName, tabLabel, slug, transcriptPath, isSeatEvent, notSeatReason, skipReason, nextIndex, stopAction, anchorVerdict,
  renderRecord, truncate, AGENT_NAME_RE, PREFIX, RESULT_HEAD, RESULT_TAIL, parseHerdr, shq, tabCreateArgs,
  seatPlacement, splitArgs, isSideSeat, SIDE_CAP, SIDE_RATIO, reportsSidebarRow,
  seatEnvArgs, SEAT_HISTFILE,
  metadataTokenArgs, TOKEN_TTL_MS, staleSideSeats,
  paneToken, viewRequestPath, viewRequest, containerIdFromMountinfo,
  errorLabel, paneLabel, metaPath, codexJobMatch, CODEX_ROLE, mapPool, codexPanesToClose, codexTerminal, elapsedLabel, poolShortfall, anchorCount,
} from './dctr-lib.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

// Observed on this host 2026-08-30. The derived path matched SubagentStop's authoritative
// agent_transcript_path byte for byte; both are pinned here so a change to either is a failure.
const PARENT = '/home/u/.claude/projects/-proj/4a9392da-bd72-4f3f-9e18-76a56c437909.jsonl'
const AGENT_ID = 'ad1a7dbb0d453a08d'
const AUTHORITATIVE = '/home/u/.claude/projects/-proj/4a9392da-bd72-4f3f-9e18-76a56c437909/subagents/agent-ad1a7dbb0d453a08d.jsonl'

const seatEvent = { hook_event_name: 'SubagentStart', session_id: 's1', agent_id: AGENT_ID, agent_type: 'Explore', transcript_path: PARENT }
const parentEvent = { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Agent', transcript_path: PARENT }
// Shape of the SubagentStop Claude Code emits for its own forked queries (2.1.261): an agent_id,
// an empty agent_type. Observed 62 times against four seats in one session, 2026-09-02.
const forkEvent = { hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'c1e0c2f6b7', agent_type: '', agent_transcript_path: '/x', transcript_path: PARENT }
const goodEnv = { HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w4W' }
const LONG_ROLE = 'a-very-long-agent-type-name-that-will-not-fit'
const attachment = { type: 'attachment', message: { role: 'user', content: 'system context nobody asked for' } }

// Clause 2 first: a valid seat event in a herdr pane must raise nothing at all.
clause('clause 2 — a well-formed seat event in a herdr pane is accepted silently',
  skipReason(goodEnv) === null && isSeatEvent(seatEvent) === true &&
  transcriptPath(seatEvent.transcript_path, seatEvent.agent_id) === AUTHORITATIVE,
  JSON.stringify({ skip: skipReason(goodEnv), seat: isSeatEvent(seatEvent) }))

// Clause 1 — one defect at a time.
clause('clause 1a — the derived transcript path matches the authoritative one',
  transcriptPath(PARENT, AGENT_ID) === AUTHORITATIVE, transcriptPath(PARENT, AGENT_ID))

clause('clause 1b — the parent\'s own Agent call is not a seat',
  isSeatEvent(parentEvent) === false && isSeatEvent(seatEvent) === true,
  'PostToolUse fires twice per dispatch; only the one carrying agent_id is a seat')

clause('clause 1z — an internal forked query is not a seat, and the reason names the fork, not the parent',
  isSeatEvent(forkEvent) === false && /agent_type is empty/.test(notSeatReason(forkEvent)) &&
  /no agent_id/.test(notSeatReason(parentEvent)) && notSeatReason(seatEvent) === null,
  `${notSeatReason(forkEvent)} / ${notSeatReason(parentEvent)} / ${notSeatReason(seatEvent)}`)

clause('clause 3p — the fork fixture really carries an agent_id and an empty agent_type',
  typeof forkEvent.agent_id === 'string' && forkEvent.agent_id.length > 0 && forkEvent.agent_type === '' && !('agent_id' in parentEvent),
  JSON.stringify({ id: forkEvent.agent_id, type: forkEvent.agent_type, parentHasId: 'agent_id' in parentEvent }))

clause('clause 1c — no HERDR_ENV stands the hook down',
  typeof skipReason({ HERDR_WORKSPACE_ID: 'w4W' }) === 'string', String(skipReason({ HERDR_WORKSPACE_ID: 'w4W' })))

clause('clause 1d: no workspace id stands the hook down',
  typeof skipReason({ HERDR_ENV: '1' }) === 'string', String(skipReason({ HERDR_ENV: '1' })))

clause('clause 1e: generated names satisfy herdr\'s own constraint',
  ['Explore', 'general-purpose', 'Red Team!!', '', LONG_ROLE].every((r) => AGENT_NAME_RE.test(agentName(r, 7))),
  ['Explore', 'general-purpose', 'Red Team!!', '', LONG_ROLE].map((r) => agentName(r, 7)).join(','))

clause('clause 1f — a long role is truncated but its counter survives intact',
  agentName(LONG_ROLE, 12).endsWith('-12') && agentName(LONG_ROLE, 12).length <= 32,
  agentName(LONG_ROLE, 12))

// Two seats of one role starting in the same wave: the second must not be handed the first's name.
const taken = [agentName('Explore', 1), agentName('Explore', 2)]
clause('clause 1g — an index already taken by a live seat is skipped',
  nextIndex('Explore', taken) === 3 && nextIndex('Explore', []) === 1,
  `${nextIndex('Explore', taken)} / ${nextIndex('Explore', [])}`)

clause('clause 1h — a focused tab is relabelled and an unfocused one is closed',
  stopAction({ tab_id: 'w4W:t2', focused: true }) === 'relabel' && stopAction({ tab_id: 'w4W:t2', focused: false }) === 'close',
  `${stopAction({ focused: true })} / ${stopAction({ focused: false })}`)

// Issue #20 defect 2: a tab the workspace list does not carry was skipped, its marker deleted, and
// nothing could ever reach it again. The seat's tab, mislocated into w4X by defect 1, is absent
// from this session's own w4Z list — the stop decision must still be a close, by recorded id.
// That decision is the CALLER's now. `stopAction` cannot make it: an absent record and an
// unreachable herdr arrive here as the same `undefined`, only one of them may close anything, and a
// pure function cannot see which its caller observed. Three call sites each assumed the caller above
// had already separated them and two had not, so the collapse moved out of this function entirely.
// The close-by-id behaviour is pinned where the distinction exists, in dctr-seat.teardown.selftest.mjs.
const FOREIGN_LIST = [{ tab_id: 'w4X:t2', focused: false }, { tab_id: 'w4X:t3', focused: true }]
const SEAT_TAB_ID = 'w4Z:t9'
// The one round-2 finding whose repair no fixture in the diff could drive, which is why it was the
// one that was wrong. A constant expressing "wait longer" is meaningless past the lifetime of the
// process doing the waiting, and nothing connected the two numbers until this clause.
{
  const hooksJson = JSON.parse(fs.readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'))
  const sessionEnd = (hooksJson.hooks?.SessionEnd || []).flatMap((m) => m.hooks || [])
  const timeoutMs = Math.min(...sessionEnd.map((h) => (h.timeout ?? 60) * 1000))
  clause('clause 1ay — SESSION_END_WAIT_MS fits inside the SessionEnd hook\'s own configured timeout',
    Number.isFinite(timeoutMs) && SESSION_END_WAIT_MS < timeoutMs,
    `wait ${SESSION_END_WAIT_MS}ms vs hooks.json timeout ${timeoutMs}ms — a deadline past the process's lifetime is a silent death, not a longer wait`)
  clause('clause 1az — and it is still longer than a placement waits, which is the point of having two',
    SESSION_END_WAIT_MS > 5000, `${SESSION_END_WAIT_MS}`)
  clause('clause 3t — hooks.json really declares a SessionEnd timeout, so the clause above is reading something',
    sessionEnd.length > 0 && Number.isFinite(timeoutMs) && timeoutMs > 0,
    `parsed ${sessionEnd.length} SessionEnd hook(s), timeout ${timeoutMs}ms`)
}

clause('clause 1aw — the gate applies an anchor that occurs exactly once, and refuses both other counts',
  anchorVerdict(1) === 'apply' && anchorVerdict(0) === 'missing' && anchorVerdict(2) === 'ambiguous' && anchorVerdict(7) === 'ambiguous',
  `${anchorVerdict(1)} / ${anchorVerdict(0)} / ${anchorVerdict(2)}`)
clause('clause 1ax — and the two refusals are DISTINCT, so a runner cannot collapse "occurs twice" into "not there"',
  anchorVerdict(0) !== anchorVerdict(2),
  'a comparison of hits === 0 in place of hits !== 1 accepts duplicate anchors again, silently')

clause('clause 1p — stopAction answers `unknown` for a record it has not seen, never `close`',
  stopAction(FOREIGN_LIST.find((t) => t.tab_id === SEAT_TAB_ID)) === 'unknown',
  'collapsing unseen into close is how a transport blip destroys the tab the user is watching')
clause('clause 1p2 — and `unknown` for a record carrying no boolean focus, which a reply can do',
  stopAction({ tab_id: SEAT_TAB_ID }) === 'unknown' &&
  stopAction({ tab_id: SEAT_TAB_ID, focused: 'yes' }) === 'unknown' &&
  stopAction(null) === 'unknown',
  `${stopAction({ tab_id: SEAT_TAB_ID })} / ${stopAction({ tab_id: SEAT_TAB_ID, focused: 'yes' })} / ${stopAction(null)}`)
clause('clause 1p3 — the fixtures really are what those clauses lean on: one carries no focus key, one a non-boolean, and the list really lacks the seat tab',
  !('focused' in { tab_id: SEAT_TAB_ID }) && typeof 'yes' !== 'boolean' && !FOREIGN_LIST.some((t) => t.tab_id === SEAT_TAB_ID),
  'without this the two clauses above could pass against inputs that never carried the defect')

// Issue #20 defect 1: without --workspace the tab lands in whatever workspace the user focused.
const CREATE_ARGS = tabCreateArgs('w4Z', 'dctr · explore · 1')
clause('clause 1q — the create args pin the tab to the dispatching session\'s workspace',
  CREATE_ARGS[CREATE_ARGS.indexOf('--workspace') + 1] === 'w4Z' && CREATE_ARGS.includes('--no-focus') &&
  CREATE_ARGS[0] === 'tab' && CREATE_ARGS[1] === 'create',
  CREATE_ARGS.join(' '))

// 2026-09-05: seat shells wrote their typed renderer line into the user's ~/.bash_history — 1,388
// of its 2,000 lines. Every creation path must hand the pane shell its own HISTFILE.
const ENV_PAIR = seatEnvArgs()
const envOf = (args) => args[args.indexOf('--env') + 1]
clause('clause 1ad — tab create and both split shapes hand the seat shell its own HISTFILE',
  [CREATE_ARGS, splitArgs([], 'w4Z:p1'), splitArgs([{ agent: 'dctr-explore-1', paneId: 'w4Z:p7', tabId: null }], 'w4Z:p1')].every((a) =>
    a.includes('--env') && envOf(a) === ENV_PAIR[1] && envOf(a).startsWith('HISTFILE=')),
  `${CREATE_ARGS.join(' ')} | ${splitArgs([], 'w4Z:p1').join(' ')}`)

clause('clause 1i — an attachment record renders nothing',
  renderRecord(attachment) === null && renderRecord({ type: 'user', message: { role: 'user', content: 'hello' } }) !== null,
  JSON.stringify(renderRecord(attachment)))

const longResult = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') }] } }
const rendered = renderRecord(longResult)
clause('clause 1j — a long tool result is truncated and the cut is marked, never silently elided',
  rendered.includes('line 0') && rendered.includes('line 39') && !rendered.includes('line 20') && /line\(s\) cut/.test(rendered),
  rendered)

clause('clause 1k — a tool call renders with its tool name',
  renderRecord({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'wc -l x' } }] } }).startsWith('→ Bash'),
  'the call is the signal you judge a running seat on')

clause('clause 1l — thinking blocks render nothing',
  renderRecord({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'x'.repeat(9000) }] } }) === null,
  'the longest content in a transcript and the least useful for deciding to kill a seat')

// Wrapped: the defect this covers is a *throw*, so an unguarded assertion would crash the run
// instead of reporting a failed clause, and a crash names no clause.
const emptyOk = (() => {
  try {
    return parseHerdr('') === null && parseHerdr('   \n') === null &&
      parseHerdr('{"result":{"tab":{"tab_id":"w4W:t3"}}}').result.tab.tab_id === 'w4W:t3'
  } catch (e) { return `threw: ${e.message}` }
})()
clause('clause 1m — a herdr command that answers with nothing is a success, not a parse error',
  emptyOk === true,
  `pane run and report-agent exit 0 with empty stdout; parsing that unconditionally aborts the hook (${emptyOk})`)

// `herdr pane run` types its argument into a shell, so a path is shell-interpreted. Both values
// come from the harness, but one of them carries the project directory, and this ships to every
// installer.
const HOSTILE = "/tmp/$(touch /tmp/PWNED)/a'b/`x`/t.jsonl"
const quoted = shq(HOSTILE)
clause('clause 1n — a path carrying shell metacharacters is quoted so none of them can expand',
  quoted.startsWith("'") && quoted.endsWith("'") &&
  quoted.includes('$(touch /tmp/PWNED)') && quoted.includes('`x`') &&
  quoted.split("'\\''").length === 2,
  quoted)

clause('clause 1o — quoting is applied to an ordinary path without mangling it',
  shq('/home/u/.claude/projects/-p/s/subagents/agent-a1.jsonl') === "'/home/u/.claude/projects/-p/s/subagents/agent-a1.jsonl'",
  shq('/home/u/.claude/projects/-p/s/subagents/agent-a1.jsonl'))

// Side-pane placement fixtures: a full column, a column with room, and the shapes that must never
// count toward the cap — tab seats, and another seat's O_EXCL reservation caught mid-write.
const SIDE_SEAT = (i) => ({ agent: `dctr-explore-${i}`, paneId: `w4Z:p${i + 1}`, tabId: null })
const TAB_SEAT = (i) => ({ agent: `dctr-review-${i}`, paneId: `w4Z:p${90 + i}`, tabId: `w4Z:t${i}` })
const RESERVATION = {}
const FULL_COLUMN = Array.from({ length: SIDE_CAP }, (_, i) => SIDE_SEAT(i + 1))
const SESSION_PANE = 'w4Z:p1'

clause('clause 1r — seats side-stack until the cap, then overflow to tabs',
  seatPlacement([], SESSION_PANE) === 'pane' &&
  seatPlacement(FULL_COLUMN.slice(0, SIDE_CAP - 1), SESSION_PANE) === 'pane' &&
  seatPlacement(FULL_COLUMN, SESSION_PANE) === 'tab',
  `${seatPlacement([], SESSION_PANE)} / ${seatPlacement(FULL_COLUMN, SESSION_PANE)}`)

clause('clause 1s — tab seats and reservations never consume a side slot',
  seatPlacement([...FULL_COLUMN.slice(0, SIDE_CAP - 1), TAB_SEAT(1), RESERVATION], SESSION_PANE) === 'pane' &&
  isSideSeat(TAB_SEAT(1)) === false && isSideSeat(RESERVATION) === false && isSideSeat(SIDE_SEAT(1)) === true,
  'a reservation has no paneId to split and a tab seat holds no column row')

clause('clause 1t — no session pane id means the tab path, which needs nothing extra',
  seatPlacement([], undefined) === 'tab' && seatPlacement([], '') === 'tab',
  seatPlacement([], undefined))

const FOUNDING = splitArgs([], SESSION_PANE)
const STACKING = splitArgs([SIDE_SEAT(1), TAB_SEAT(1), SIDE_SEAT(2)], SESSION_PANE)
clause('clause 1u — the first side seat founds the column right of the session, later ones stack down',
  FOUNDING.includes(SESSION_PANE) && FOUNDING[FOUNDING.indexOf('--direction') + 1] === 'right' &&
  FOUNDING[FOUNDING.indexOf('--ratio') + 1] === String(SIDE_RATIO) &&
  STACKING.includes(SIDE_SEAT(2).paneId) && !STACKING.includes(TAB_SEAT(1).paneId) &&
  STACKING[STACKING.indexOf('--direction') + 1] === 'down' &&
  FOUNDING.includes('--no-focus') && STACKING.includes('--no-focus'),
  `${FOUNDING.join(' ')} | ${STACKING.join(' ')}`)

clause('clause 1w — only tab seats get a sidebar row; a side pane is already on screen',
  reportsSidebarRow(TAB_SEAT(1)) === true && reportsSidebarRow(SIDE_SEAT(1)) === false &&
  reportsSidebarRow(RESERVATION) === false,
  'the stop-side idle report gates on the same rule, or stop would create the row start withheld')

// The measured defect this guards: stacking under the newest pane halves the same pane every time,
// and a six-seat column rendered 28/14/7/4/2/1 rows. With the layout observed, the tallest side
// pane is the one that splits — the session's own taller pane must never be the target.
const LAYOUT = [
  { pane_id: SESSION_PANE, rect: { height: 56 } },
  { pane_id: SIDE_SEAT(1).paneId, rect: { height: 28 } },
  { pane_id: SIDE_SEAT(2).paneId, rect: { height: 14 } },
]
const BALANCED = splitArgs([SIDE_SEAT(1), SIDE_SEAT(2)], SESSION_PANE, LAYOUT)
clause('clause 1v — with the layout in hand, the tallest side pane is the one that splits',
  BALANCED.includes(SIDE_SEAT(1).paneId) && !BALANCED.includes(SESSION_PANE) && !BALANCED.includes(SIDE_SEAT(2).paneId) &&
  BALANCED[BALANCED.indexOf('--direction') + 1] === 'down',
  BALANCED.join(' '))

// Issue #19: the counter tokens the orchestrator publishes at each record write. The payload is
// built from a run-state fixture (round 3, exit 1, valve 4) and must target the session's own
// pane under the custom:doctrine source, with the ttl that lets a dead run's row expire.
const TOKEN_ARGS = metadataTokenArgs(SESSION_PANE, 3, 1, 4)
clause('clause 1x — counter tokens are the exact call verified on 0.8.2, argument for argument',
  // The whole array, not indexOf probes: a reordered flag, a duplicate, or a trailing extra all
  // passed the probe form, and the ruled sequence is the one thing this clause exists to pin.
  JSON.stringify(TOKEN_ARGS) === JSON.stringify(['pane', 'report-metadata', SESSION_PANE,
    '--source', 'custom:doctrine', '--token', 'doctrine=r3·e1·v4', '--ttl-ms', String(TOKEN_TTL_MS)]),
  TOKEN_ARGS.join(' '))

// F13 (QuoteBine, 2026-08-31): markers whose panes are gone must be dropped before placement, or
// the split targets a dead pane and every later seat demotes to a tab. The layout fixture carries
// seats 1 and 2 and not seat 3; a tab seat is never judged; no layout means nothing is dropped.
const STALE = staleSideSeats([SIDE_SEAT(1), SIDE_SEAT(2), SIDE_SEAT(3), TAB_SEAT(1)], LAYOUT)
clause('clause 1y — a side seat whose pane the layout lacks is stale; tab seats and unobserved layouts are not judged',
  STALE.length === 1 && STALE[0].paneId === SIDE_SEAT(3).paneId &&
  staleSideSeats([SIDE_SEAT(3)], null).length === 0 && staleSideSeats([SIDE_SEAT(3)], []).length === 0 &&
  staleSideSeats([TAB_SEAT(1)], LAYOUT).length === 0,
  JSON.stringify(STALE))

// A layout with an entry carrying no `pane_id` is a PARTIAL observation, and it was read as a
// complete one: `undefined` went into the live set, every real pane then failed the `has`, and EVERY
// live side seat came back stale — with both callers unlinking those markers without an existence
// lookup. Emptiness already meant "I could not look"; partiality has to mean the same thing.
const PARTIAL_LAYOUT = [{ pane_id: SIDE_SEAT(1).paneId }, {}]
clause('clause 1bb — a layout carrying an entry with no pane_id is not an observed layout, so nothing is judged stale',
  staleSideSeats([SIDE_SEAT(2)], PARTIAL_LAYOUT).length === 0 &&
  staleSideSeats([SIDE_SEAT(1), SIDE_SEAT(2), SIDE_SEAT(3)], PARTIAL_LAYOUT).length === 0,
  JSON.stringify(staleSideSeats([SIDE_SEAT(1), SIDE_SEAT(2), SIDE_SEAT(3)], PARTIAL_LAYOUT)))

// Clause 3 — the fixtures really carry their properties, shown without the functions above.
clause('clause 3a — the long-role fixture really would overflow herdr\'s limit untruncated',
  `${PREFIX}-${LONG_ROLE}-12`.length > 32 && LONG_ROLE.length > 32 - PREFIX.length - 4,
  `untruncated length ${`${PREFIX}-${LONG_ROLE}-12`.length}`)

clause('clause 3b: the parent and seat fixtures really differ only in the agent fields',
  parentEvent.agent_id === undefined && seatEvent.agent_id !== undefined &&
  parentEvent.transcript_path === seatEvent.transcript_path && parentEvent.session_id === seatEvent.session_id,
  'if they differed elsewhere, 1b would be testing something other than the agent_id test')

clause('clause 3c — the pinned pair really is a derivation and not two hardcoded strings',
  AUTHORITATIVE.startsWith(PARENT.replace(/\.jsonl$/, '') + '/') && AUTHORITATIVE.includes(AGENT_ID) &&
  PARENT.endsWith('.jsonl') && !PARENT.includes('subagents'),
  'the authoritative path must be reachable from the parent path by the rule under test')

clause('clause 3d — the truncation fixture really is longer than the window that would keep it whole',
  40 > RESULT_HEAD + RESULT_TAIL + 1 && truncate('a\nb', RESULT_HEAD, RESULT_TAIL) === 'a\nb',
  'a short block must pass through untouched, or 1j proves only that truncate always fires')

clause('clause 3e — the attachment fixture really is otherwise renderable',
  attachment.message && typeof attachment.message.content === 'string' && attachment.message.content.length > 0 &&
  renderRecord({ ...attachment, type: 'user' }) !== null,
  'change only its type and it renders, so 1i tests the type check rather than an empty payload')

clause('clause 3f — the tab label and the agent name really are different shapes',
  tabLabel('Explore', 1) !== agentName('Explore', 1) && tabLabel('Explore', 1).includes(' · ') &&
  !AGENT_NAME_RE.test(tabLabel('Explore', 1)) && slug('Explore') === 'explore',
  'the tab label is deliberately unconstrained; only the agent name must satisfy herdr')

clause('clause 3g — the empty-output fixture really is what the CLI returns, not an invented case',
  ''.trim().length === 0 && (() => { try { JSON.parse(''); return false } catch { return true } })(),
  'JSON.parse must genuinely throw on it, or 1m proves nothing about why the hook aborted')

clause('clause 3h — the hostile fixture really carries live metacharacters, and JSON.stringify really would not stop them',
  // Not merely "contains a backtick": an escaped one is inert, and an earlier version of this
  // fixture used String.raw and shipped `\\`x\\`` — the check below is what caught it.
  HOSTILE.includes('$(touch') && HOSTILE.includes('`x`') && !HOSTILE.includes('\\`') && HOSTILE.includes("'") &&
  JSON.stringify(HOSTILE).includes('$(touch /tmp/PWNED)') && JSON.stringify(HOSTILE).includes('`x`') &&
  JSON.stringify(HOSTILE).startsWith('"'),
  `a double-quoted shell string still expands $() and backticks: ${JSON.stringify(HOSTILE)}`)

// 1.47.0's literal create call, verbatim from the shipped hook — the defect-1 shape.
const PRE_FIX_ARGS = ['tab', 'create', '--label', 'dctr · explore · 1', '--no-focus']
const PAIRED = ['--workspace', '--env']
clause('clause 3i — the pre-fix args really lack a workspace and an env, and the two fixes add exactly those pairs',
  !PRE_FIX_ARGS.includes('--workspace') &&
  JSON.stringify(CREATE_ARGS.filter((a, i) => !PAIRED.includes(a) && !PAIRED.includes(CREATE_ARGS[i - 1]))) === JSON.stringify(PRE_FIX_ARGS),
  'if the fixed args drifted anywhere else, 1q would be certifying a different call than the one that failed')

clause('clause 3q — the seat HISTFILE really is a different file from bash\'s default, under the same home',
  !PRE_FIX_ARGS.includes('--env') && SEAT_HISTFILE().endsWith('/.dctr_history') &&
  SEAT_HISTFILE() !== `${process.env.HOME}/.bash_history` && SEAT_HISTFILE().startsWith(process.env.HOME),
  SEAT_HISTFILE())

clause('clause 3j — the foreign-list fixture really does not carry the seat\'s tab',
  FOREIGN_LIST.every((t) => t.tab_id !== SEAT_TAB_ID) && FOREIGN_LIST.length > 0 && FOREIGN_LIST.some((t) => t.focused),
  'if the list held the tab, 1p would be testing the focused branch rather than the unlisted one')

clause('clause 3k — the placement fixtures really are the shapes their clauses lean on',
  FULL_COLUMN.length === SIDE_CAP && FULL_COLUMN.every((s) => s.paneId && s.tabId === null) &&
  Boolean(TAB_SEAT(1).paneId && TAB_SEAT(1).tabId) && Object.keys(RESERVATION).length === 0 &&
  JSON.parse('{}').paneId === undefined,
  'the reservation must be the literal O_EXCL placeholder ({}), or 1s tests an invented shape')

clause('clause 3l — the ttl really is the hour the README promises, not merely some positive number',
  // Pinned to the value, because both documented failure directions are numbers this would
  // otherwise accept: shorter blinks a live run out between writes, longer leaves a dead run's
  // row up past the expiry the README states.
  TOKEN_TTL_MS === 3600000,
  String(TOKEN_TTL_MS))

// Pane containment: a contained agent writes a request file named by its agent_id and reaches
// nothing on the host; the id becomes part of a path, so it must never traverse.
const HOSTILE_PANE = '../../etc/passwd'
clause('clause 1aa — request tokens are filename-safe, deterministic, and cannot traverse',
  paneToken('w66:p18') === 'w66_p18' &&
  paneToken('ad1a7dbb0d453a08d') === 'ad1a7dbb0d453a08d' &&
  viewRequestPath('/bridge', 'ad1a7dbb0d453a08d') === '/bridge/view-ad1a7dbb0d453a08d.json' &&
  viewRequestPath('/bridge/', 'ad1a7dbb0d453a08d') === '/bridge/view-ad1a7dbb0d453a08d.json' &&
  !viewRequestPath('/bridge', HOSTILE_PANE).includes('..') &&
  !paneToken(HOSTILE_PANE).includes('/'),
  `${paneToken(HOSTILE_PANE)} -> ${viewRequestPath('/bridge', HOSTILE_PANE)}`)

// A compose file may set `hostname:`, so the id comes from mountinfo where docker bind-mounts
// /etc/hostname from /var/lib/docker/containers/<id>/ — and a 12-hex short id must not satisfy it.
const CID = 'a3f9'.repeat(16)
const MOUNTINFO = `1537 1489 8:1 /var/lib/docker/containers/${CID}/hostname /etc/hostname rw,relatime - ext4 /dev/sda1 rw`
clause('clause 1ab — the container id parses from mountinfo, and short or absent ids return null',
  containerIdFromMountinfo(MOUNTINFO) === CID &&
  containerIdFromMountinfo('1537 1489 8:1 / / rw - ext4 /dev/sda1 rw') === null &&
  containerIdFromMountinfo(`x /containers/${CID.slice(0, 12)}/hostname y`) === null &&
  containerIdFromMountinfo('') === null,
  String(containerIdFromMountinfo(MOUNTINFO)))

// Each field is checked, not just the key set: the host reads renderer_path and transcript_path
// straight into an argv, so a request that swapped or dropped either while keeping the right key
// names must fail here. role is display only.
const REQ = viewRequest(CID, '/p/dctr-render.mjs', '/t/a.jsonl', 'Explore')
clause('clause 1ac — a view request carries exactly the four claims, each to its own field',
  JSON.stringify(Object.keys(REQ)) === JSON.stringify(['container_id', 'renderer_path', 'transcript_path', 'role']) &&
  REQ.container_id === CID && REQ.renderer_path === '/p/dctr-render.mjs' &&
  REQ.transcript_path === '/t/a.jsonl' && REQ.role === 'Explore',
  JSON.stringify(REQ))

// F1 (field audit 2026-09-07): a gate pane started in the herdr server's cwd, so a relative check
// path ran somewhere else while the detached path ran it here. Both creation calls carry the cwd
// they are handed; a caller that hands none gets the old call.
const CWD = '/home/u/proj'
const cwdOf = (args) => args[args.indexOf('--cwd') + 1]
clause('clause 1ae: tab create and both split shapes carry the cwd they are handed',
  [tabCreateArgs('w4Z', 'lbl', CWD), splitArgs([], 'w4Z:p1', null, CWD), splitArgs([SIDE_SEAT(1)], 'w4Z:p1', LAYOUT, CWD)].every((a) => cwdOf(a) === CWD) &&
  !tabCreateArgs('w4Z', 'lbl').includes('--cwd') && !splitArgs([], 'w4Z:p1').includes('--cwd'),
  `${tabCreateArgs('w4Z', 'lbl', CWD).join(' ')} | ${splitArgs([], 'w4Z:p1', null, CWD).join(' ')}`)

// N3: every throw in the hook was logged as herdr refusing an action, including a TypeError from the
// hook's own code. execFileSync errors carry spawnargs and nothing else does.
const spawnShaped = Object.assign(new Error('Command failed: herdr pane get'), { spawnargs: ['pane', 'get', 'w4Z:p9'], status: 1 })
const bug = (() => { try { return undefinedVariableInTheHook } catch (e) { return e } })()
clause('clause 1af: a spawn-shaped error is herdr refusing, and anything else is a hook error',
  errorLabel(spawnShaped) === 'herdr refused an action' && errorLabel(bug) === 'hook error' && errorLabel(new TypeError('x')) === 'hook error',
  `${errorLabel(spawnShaped)} / ${errorLabel(bug)}`)

// N17: the pane carries the seat's status-line title, type plus description (Scott's ruling), and
// the counter stands in when the harness wrote no description.
const META = '/home/u/.claude/projects/-proj/4a9392da-bd72-4f3f-9e18-76a56c437909/subagents/agent-ad1a7dbb0d453a08d.meta.json'
clause('clause 1ag: the pane label is type plus description, or type plus counter without one',
  paneLabel('general-purpose', 'Fresh refuter of N1-N16', 3) === 'general-purpose · Fresh refuter of N1-N16' &&
  paneLabel('Explore', undefined, 3) === 'explore · 3' && paneLabel('Explore', '', 3) === 'explore · 3',
  `${paneLabel('general-purpose', 'Fresh refuter of N1-N16', 3)} / ${paneLabel('Explore', undefined, 3)}`)

clause('clause 1ah: the meta path sits beside the seat transcript with .meta.json in place of .jsonl',
  metaPath(AUTHORITATIVE) === META && metaPath(null) === null,
  String(metaPath(AUTHORITATIVE)))

// N18: the codex plugin writes two records per dispatch, and other sessions write into the same
// state directory. The match is by workspace and by time, newest last.
const NOW = Date.parse('2026-09-07T04:35:31.369Z')
const JOB = (file, createdAt, workspaceRoot, status) => ({ file, createdAt, workspaceRoot, status })
const JOBS = [
  JOB('/j/old.json', '2026-09-07T03:00:00.000Z', CWD, 'completed'),
  JOB('/j/ack.json', '2026-09-07T04:35:30.000Z', CWD, 'completed'),
  JOB('/j/other.json', '2026-09-07T04:35:32.000Z', '/home/u/elsewhere', 'running'),
  JOB('/j/run.json', '2026-09-07T04:35:31.369Z', CWD, 'running'),
]
const MATCH = codexJobMatch(JOBS, CWD, NOW - 60000)
clause('clause 1ai: the newest record for this workspace since the seat started is the match, and no record is null',
  MATCH && MATCH.file === '/j/run.json' && codexJobMatch(JOBS, '/home/u/nowhere', NOW - 60000) === null &&
  codexJobMatch([], CWD, 0) === null && codexJobMatch(JOBS, CWD, NOW + 1) === null && CODEX_ROLE === 'codex:codex-rescue',
  JSON.stringify(MATCH))

clause('clause 3r: the job fixtures really differ as their clause needs: one older, one elsewhere, and the match newest of the rest',
  Date.parse(JOBS[0].createdAt) < NOW - 60000 && JOBS[2].workspaceRoot !== CWD && Date.parse(JOBS[2].createdAt) > Date.parse(JOBS[3].createdAt) &&
  JOBS.filter((j) => j.workspaceRoot === CWD && Date.parse(j.createdAt) >= NOW - 60000).length === 2 &&
  Date.parse(JOBS[3].createdAt) > Date.parse(JOBS[1].createdAt),
  'if the other-workspace job were not newer than the match, 1ai would not show the workspace filter firing')

clause('clause 3s: the spawn-shaped fixture really carries spawnargs and the ReferenceError really does not',
  Array.isArray(spawnShaped.spawnargs) && bug instanceof ReferenceError && !('spawnargs' in bug),
  `${bug && bug.constructor.name}`)

clause('clause 3m — the layout fixture really carries seats 1 and 2 and really lacks seat 3',
  LAYOUT.some((p) => p.pane_id === SIDE_SEAT(1).paneId) && LAYOUT.some((p) => p.pane_id === SIDE_SEAT(2).paneId) &&
  !LAYOUT.some((p) => p.pane_id === SIDE_SEAT(3).paneId) && !LAYOUT.some((p) => p.pane_id === TAB_SEAT(1).paneId),
  'if the layout carried seat 3, 1y would prove staleSideSeats never fires; if it carried the tab pane, the tab clause would be vacuous')

// Third clause for 1bb, and it never calls staleSideSeats: it runs the OLD body's own expression
// (`new Set(layoutPanes.map(p => p.pane_id))`) over the fixture and shows a live seat is absent from
// it, which is exactly how a live pane got condemned. Without this, 1bb would pass just as well
// against a fixture that could never have broken anything.
clause('clause 3w — the partial-layout fixture really carries the defect: the naive live-set built from it lacks a LIVE seat, shown without staleSideSeats',
  PARTIAL_LAYOUT.length === 2 && PARTIAL_LAYOUT[0].pane_id === SIDE_SEAT(1).paneId &&
  PARTIAL_LAYOUT[1].pane_id === undefined &&
  !new Set(PARTIAL_LAYOUT.map((p) => p.pane_id)).has(SIDE_SEAT(2).paneId),
  `naive set: ${JSON.stringify([...new Set(PARTIAL_LAYOUT.map((p) => p.pane_id))])} — SIDE_SEAT(2) is live and absent from it`)

clause('clause 3n — the mountinfo fixture really carries a 64-hex id under /containers/, shown without the parser',
  MOUNTINFO.includes('/containers/') && CID.length === 64 && [...CID].every((c) => '0123456789abcdef'.includes(c)) &&
  MOUNTINFO.includes(`/containers/${CID}/`),
  'if the fixture lacked the docker shape, 1ab would prove the parser matches an invented format')

clause('clause 3o — the hostile pane fixture really carries live traversal, and the id fixture really does not',
  HOSTILE_PANE.includes('../') && !'w66:p18'.includes('.') && !'w66:p18'.includes('/'),
  'if the hostile fixture were already clean, 1aa would prove sanitizing changes nothing')

// The mutation gate's worker pool (item 1, 2026-09-07). Pinned HERE, in the pure suite, because the
// pool is the gate: a pool that silently runs nothing, or loses a result, prints exactly what a
// working one prints — "all 58 repairs are pinned" — which is the defect class this whole harness
// exists to catch, one level up.
{
  const seen = []
  const order = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (v, i) => { seen.push(i); await new Promise((r) => setTimeout(r, (7 - v) * 2)); return v * 10 })
  clause('clause 1aj — mapPool visits every item exactly once and returns results in INPUT order, not completion order',
    order.join(',') === '10,20,30,40,50,60,70' && seen.slice().sort((a, b) => a - b).join(',') === '0,1,2,3,4,5,6' && seen.length === 7,
    `results ${order.join(',')}; visited ${seen.join(',')}`)

  let active = 0, peak = 0
  await mapPool(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    active += 1; peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active -= 1
  })
  clause('clause 1ak — mapPool never runs more than `limit` at once', peak <= 4 && peak > 1, `peak ${peak}`)

  let serialPeak = 0, serialActive = 0
  await mapPool(Array.from({ length: 6 }, (_, i) => i), 1, async () => {
    serialActive += 1; serialPeak = Math.max(serialPeak, serialActive)
    await new Promise((r) => setTimeout(r, 2))
    serialActive -= 1
  })
  // CLAUDE.md's third clause, and the one that matters most here: 1ad's "never more than 4" is
  // satisfied just as well by a pool that never parallelises at all. This shows the SAME probe reads
  // 1 at limit 1 and more than 1 at limit 4, so the probe can tell the two apart.
  clause('clause 3u — the concurrency probe really discriminates: 1 at limit 1, more than 1 at limit 4',
    serialPeak === 1 && peak > 1,
    `serial peak ${serialPeak}, parallel peak ${peak}`)

  const empty = await mapPool([], 4, async () => { throw new Error('must not run') })
  clause('clause 1al — mapPool on an empty list returns an empty list and runs nothing', Array.isArray(empty) && empty.length === 0, JSON.stringify(empty))
}

// elapsedLabel, both branches. Gate clause 1g only ever sees the seconds branch — a selftest check
// finishes in well under a minute — so the minutes branch shipped executed by nothing at all.
clause('clause 1ao — elapsedLabel prints seconds under a minute and zero-padded m/s at or above one',
  elapsedLabel('gate', 5000) === 'gate · 5s elapsed' &&
  elapsedLabel('gate', 59999) === 'gate · 59s elapsed' &&
  elapsedLabel('gate', 60000) === 'gate · 1m00s elapsed' &&
  elapsedLabel('gate', 65000) === 'gate · 1m05s elapsed' &&
  elapsedLabel('gate', 3671000) === 'gate · 61m11s elapsed',
  `${elapsedLabel('gate', 65000)} / ${elapsedLabel('gate', 60000)}`)

clause('clause 1ap — elapsedLabel never prints a negative age, so a clock that moves backwards reads 0s',
  elapsedLabel('gate', -1) === 'gate · 0s elapsed' && elapsedLabel('gate', 0) === 'gate · 0s elapsed',
  elapsedLabel('gate', -1))

clause('clause 1as — anchorCount counts occurrences, so the gate can require exactly one and not merely presence',
  anchorCount('a b a', 'a') === 2 && anchorCount('a b a', 'b') === 1 && anchorCount('a b a', 'z') === 0 &&
  anchorCount('aaa', 'aa') === 1,
  `${anchorCount('a b a', 'a')}/${anchorCount('a b a', 'z')}`)

clause('clause 1aq — poolShortfall counts the results a pool never produced, which is how the gate refuses to certify an empty run',
  poolShortfall([], 3) === 3 && poolShortfall([1, undefined, 3], 3) === 1 && poolShortfall([1, 2, 3], 3) === 0 &&
  poolShortfall(new Array(5), 5) === 5 && poolShortfall([0, false, ''], 3) === 0,
  `${poolShortfall([], 3)}/${poolShortfall([1, undefined, 3], 3)}/${poolShortfall([0, false, ''], 3)}`)

{
  // A non-finite limit made Array.from({length: NaN}) produce ZERO workers, so the pool ran nothing
  // and returned a sparse array — the gate's silent-success mode, reachable from a bad env value.
  let ran = 0
  const out = await mapPool([1, 2, 3], NaN, async (v) => { ran += 1; return v })
  clause('clause 1ar — a non-finite limit still runs every item rather than silently running none',
    ran === 3 && out.join(',') === '1,2,3', `ran ${ran}, out ${out.join(',')}`)
}

// Item 2 (Scott's ruling, 2026-09-07): a finished codex pane stays until the next codex seat is
// placed, then closes; a focused pane still stays. The decision is pure so the five cases can be
// stated at once; the hook only gathers the inputs.
{
  const S = (agent, codexJob) => ({ agent, codexJob, paneId: `w1:${agent}` })
  const CANDIDATES = [
    { seat: S('done', '/j/done.json'), status: 'completed', focused: false },   // closes
    { seat: S('failed', '/j/failed.json'), status: 'failed', focused: false },  // closes: terminal is not "succeeded"
    { seat: S('busy', '/j/busy.json'), status: 'running', focused: false },     // stays: still working
    { seat: S('waiting', '/j/wait.json'), status: 'queued', focused: false },   // stays: not started yet
    { seat: S('watched', '/j/watched.json'), status: 'completed', focused: true }, // stays: someone is looking
    { seat: S('unreadable', '/j/gone.json'), status: null, focused: false },    // stays: a read failure is not an answer
    { seat: S('unreachable', '/j/unreach.json'), status: 'completed', focused: undefined }, // stays: focus UNKNOWN is not "unfocused"
    { seat: S('ordinary'), status: 'completed', focused: false },               // never a candidate: no codex job
  ]
  const closing = codexPanesToClose(CANDIDATES).map((s) => s.agent)
  clause('clause 1am — close-on-next closes exactly the terminal, unfocused, codex-job panes',
    closing.join(',') === 'done,failed', `closing ${closing.join(',') || '(none)'}`)

  clause('clause 1ba — focus that could not be READ never closes a pane: unknown is not unfocused',
    !codexPanesToClose(CANDIDATES).some((x) => x.agent === 'unreachable'),
    'a pane get that FAILED leaves focus undefined, and the pane that costs is the focused one')

  clause('clause 1an — an unreadable job record is NOT terminal, matching the watcher, which keeps waiting on one',
    codexTerminal('completed') && codexTerminal('failed') && !codexTerminal('running') && !codexTerminal('queued') &&
    !codexTerminal(null) && !codexTerminal(undefined) && !codexTerminal(''),
    'a read failure must never be read as "the job is done"')

  // CLAUDE.md's third clause: the fixture must really carry every distinction 1am rests on, or the
  // clause passes by having nothing to discriminate.
  clause('clause 3v — the candidate fixture really carries all five reasons to stay and both reasons to close',
    CANDIDATES.filter((c) => c.status === 'running' || c.status === 'queued').length === 2 &&
    CANDIDATES.some((c) => c.focused === true && codexTerminal(c.status)) &&
    CANDIDATES.some((c) => c.status === null) &&
    CANDIDATES.some((c) => c.focused === undefined && codexTerminal(c.status)) &&
    CANDIDATES.some((c) => !c.seat.codexJob) &&
    CANDIDATES.filter((c) => c.seat.codexJob && codexTerminal(c.status) && c.focused === false).length === 2,
    'if the fixture lacked the focused-and-finished case, 1am would prove nothing about focus; without the focus-unknown case, 1ba would be vacuous')
}

process.exit(bad ? 1 : 0)
