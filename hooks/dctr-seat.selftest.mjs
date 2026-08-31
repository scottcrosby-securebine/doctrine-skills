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

import {
  agentName, tabLabel, slug, transcriptPath, isSeatEvent, skipReason, nextIndex, stopAction,
  renderRecord, truncate, AGENT_NAME_RE, PREFIX, RESULT_HEAD, RESULT_TAIL, parseHerdr, shq, tabCreateArgs,
  seatPlacement, splitArgs, isSideSeat, SIDE_CAP, SIDE_RATIO, reportsSidebarRow,
  metadataTokenArgs, TOKEN_TTL_MS, staleSideSeats,
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

clause('clause 1c — no HERDR_ENV stands the hook down',
  typeof skipReason({ HERDR_WORKSPACE_ID: 'w4W' }) === 'string', String(skipReason({ HERDR_WORKSPACE_ID: 'w4W' })))

clause('clause 1d — no workspace id stands the hook down',
  typeof skipReason({ HERDR_ENV: '1' }) === 'string', String(skipReason({ HERDR_ENV: '1' })))

clause('clause 1e — generated names satisfy herdr\'s own constraint',
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
const FOREIGN_LIST = [{ tab_id: 'w4X:t2', focused: false }, { tab_id: 'w4X:t3', focused: true }]
const SEAT_TAB_ID = 'w4Z:t9'
clause('clause 1p — a tab absent from the workspace list is closed by id, never skipped',
  stopAction(FOREIGN_LIST.find((t) => t.tab_id === SEAT_TAB_ID)) === 'close',
  'a skipped tab outlives its marker and the SessionEnd sweep can never reach it')

// Issue #20 defect 1: without --workspace the tab lands in whatever workspace the user focused.
const CREATE_ARGS = tabCreateArgs('w4Z', 'dctr · explore · 1')
clause('clause 1q — the create args pin the tab to the dispatching session\'s workspace',
  CREATE_ARGS[CREATE_ARGS.indexOf('--workspace') + 1] === 'w4Z' && CREATE_ARGS.includes('--no-focus') &&
  CREATE_ARGS[0] === 'tab' && CREATE_ARGS[1] === 'create',
  CREATE_ARGS.join(' '))

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

// Clause 3 — the fixtures really carry their properties, shown without the functions above.
clause('clause 3a — the long-role fixture really would overflow herdr\'s limit untruncated',
  `${PREFIX}-${LONG_ROLE}-12`.length > 32 && LONG_ROLE.length > 32 - PREFIX.length - 4,
  `untruncated length ${`${PREFIX}-${LONG_ROLE}-12`.length}`)

clause('clause 3b — the parent and seat fixtures really differ only in the agent fields',
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
clause('clause 3i — the pre-fix args really lack a workspace, and the fix adds exactly that pair',
  !PRE_FIX_ARGS.includes('--workspace') &&
  JSON.stringify(CREATE_ARGS.filter((a, i) => a !== '--workspace' && CREATE_ARGS[i - 1] !== '--workspace')) === JSON.stringify(PRE_FIX_ARGS),
  'if the fixed args drifted anywhere else, 1q would be certifying a different call than the one that failed')

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

clause('clause 3m — the layout fixture really carries seats 1 and 2 and really lacks seat 3',
  LAYOUT.some((p) => p.pane_id === SIDE_SEAT(1).paneId) && LAYOUT.some((p) => p.pane_id === SIDE_SEAT(2).paneId) &&
  !LAYOUT.some((p) => p.pane_id === SIDE_SEAT(3).paneId) && !LAYOUT.some((p) => p.pane_id === TAB_SEAT(1).paneId),
  'if the layout carried seat 3, 1y would prove staleSideSeats never fires; if it carried the tab pane, the tab clause would be vacuous')

process.exit(bad ? 1 : 0)
