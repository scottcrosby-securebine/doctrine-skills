// Behavioral tamper test for the Codex host's pure seams in dctr-lib.mjs (E10 e10-hookport, seams S1, S4, S5 and
// the watcher and typer decisions built on them), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-codex.seams.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every rollout, payload and pane text is a real Codex capture (0.156.1, or 0.160.0 where the constant says so), cut
// verbatim into dctr-codex.fixtures.mjs (each constant names its probe file). A fixture a clause needs in another shape is derived here, and says so.
// Clause 1 pins each decision on those fixtures. Clause 2 runs the known-good cases that must stay quiet. Clause 3
// proves, without calling any function under test, that each fixture carries what clause 1 rests on.

import * as F from './dctr-codex.fixtures.mjs'

let bad = 0
// A throw outside a clause (a mutated function called while deriving a clause's input) is a FAIL line naming the
// last clause that ran, never an exit with no verdict, which the mutation gate cannot judge (E10H-B8).
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const {
  hostOf, transcriptEntries, readUsage, gaugeSkip, codexObservations, watchedTurn, watchStep, WATCH_TIMES, typerStep,
  pauseReason, pauseCode, samePause, userTyped, CODEX_RESUME_LINE, RESUME_LINE, notifyDecision, cycleDecision, codexAncestor, codexBackground,
  codexUnderClaude, composerIdle, composerLine, codexAborted, PAUSES, pauseActionAt, pausedAfterWarned, unknownBackgroundReason,
} = await import('./dctr-lib.mjs')

const text = (...ls) => ls.flat(Infinity).join('\n') + '\n'
const J = (l) => JSON.parse(l)
const CLAUDE_T = { ...F.POST_MAIN, hook_event_name: 'PostToolUse', transcript_path: '/home/u/.claude/projects/p/5f1c2e.jsonl' }

// ---------------------------------------------------------------- clause 1: the decisions on the real captures

clause('clause 1a — hostOf: a payload whose transcript_path is a rollout- file is codex; a Claude Code transcript and no path are claude (S3)',
  hostOf(F.POST_MAIN) === 'codex' && hostOf(F.SS_CLEAR) === 'codex' && hostOf(CLAUDE_T) === 'claude' && hostOf({}) === 'claude' && hostOf(null) === 'claude',
  JSON.stringify([hostOf(F.POST_MAIN), hostOf(CLAUDE_T)]))

const te = transcriptEntries(text(F.TUI_TURN), 'codex')
const users = te.entries.filter((e) => e.type === 'user'), assts = te.entries.filter((e) => e.type === 'assistant')
clause('clause 1b — transcriptEntries on a rollout: each user and assistant message item becomes one entry in the callers\' shape, the environment context is meta, the prompt is not, every other item is dropped (S1)',
  te.partial === false && users.length === 2 && users[0].isMeta === true && users[1].isMeta === false &&
  users[1].message.content[0].text === "Run the shell command 'echo tui-one', then reply with the word alpha." && users[1].timestamp === '2026-09-28T18:52:47.184Z' &&
  assts.length === 2 && assts[1].message.content[0].type === 'text' && assts[1].message.content[0].text === 'alpha' && te.entries.length === 4,
  JSON.stringify(te.entries.map((e) => [e.type, e.isMeta, e.message?.content?.[0]?.text?.slice(0, 30)])))
const cut = text(F.TUI_TURN).slice(0, -40)
clause('clause 1b2 — transcriptEntries on a rollout keeps the read rules: a last line still being written is partial, a damaged line before the last makes the read unreadable (S1, RB6-1)',
  transcriptEntries(cut, 'codex')?.partial === true && transcriptEntries(cut, 'codex').entries.length === 4 &&
  transcriptEntries(text(F.TUI_TURN[0], F.TUI_TURN[5].slice(0, 50), F.TUI_TURN[6]), 'codex') === null,
  JSON.stringify(transcriptEntries(cut, 'codex')?.partial))

const ru = (t, last = null) => readUsage(t, last, 'codex')
const r1 = ru(text(F.TUI_TURN))
clause('clause 1c — readUsage on a rollout: the latest token_count read as last_token_usage.input_tokens, its window model_context_window, its timestamp the id (S1)',
  r1.used === 17503 && r1.window === 258400 && r1.uuid === '2026-09-28T18:52:52.673Z' && r1.at === r1.uuid, JSON.stringify(r1))
clause('clause 1c2 — readUsage on a rollout: the token_count the latch already read is stale, so the PostToolUse events after one token_count are one batch',
  ru(text(F.TUI_TURN), '2026-09-28T18:52:52.673Z').unknown === 'stale' && ru(text(F.TUI_TURN), '2026-09-28T18:52:50.867Z').used === 17503, JSON.stringify(ru(text(F.TUI_TURN), r1.uuid)))
clause('clause 1c3 — readUsage on a rollout: the zero-input token_count a /compact writes is skipped for the reading before it (E8-D10 zero totals)',
  ru(text(F.TUI_TURN, F.TUI_COMPACT)).used === 17503 && ru(text(F.TUI_TURN, F.TUI_COMPACT, F.TUI_NEXT)).used === 17501, JSON.stringify(ru(text(F.TUI_TURN, F.TUI_COMPACT))))
// RUN3 up to the first PostToolUse hook's marker: what that hook saw on disk, no token_count yet (probe A2).
const firstPost = F.RUN3.slice(0, F.RUN3.findIndex((l) => l.includes('POST-MARKER')))
clause('clause 1c4 — readUsage on a rollout: before any token_count (a session\'s first tool call) it is unknown as none, a missing rollout is missing, a token_count cut mid-line with nothing before it is unparseable (E8-D10)',
  ru(text(firstPost)).unknown === 'none' && ru(null).unknown === 'missing' &&
  ru(text(F.TUI_TURN.slice(0, 10), F.TUI_TURN[10].slice(0, 90))).unknown === 'unparseable' && !('used' in ru(text(firstPost))),
  JSON.stringify([ru(text(firstPost)), ru(text(F.TUI_TURN.slice(0, 10), F.TUI_TURN[10].slice(0, 90)))]))
// Derived: TUI_TURN's token_counts with model_context_window removed, the E10 table's no-bridge-file case.
const noWindow = F.TUI_TURN.map((l) => l.replace(/,"model_context_window":258400/, ''))
clause('clause 1c5 — readUsage on a rollout: a token_count without model_context_window reads its tokens and an unknown (null) window (E8-D11 through the table)',
  ru(text(noWindow)).used === 17503 && ru(text(noWindow)).window === null, JSON.stringify(ru(text(noWindow))))
clause('clause 1c6 — readUsage called as today reads a Claude Code transcript: a rollout read without the host holds no usage entry',
  readUsage(text(F.TUI_TURN), null).unknown === 'unparseable', JSON.stringify(readUsage(text(F.TUI_TURN), null)))

clause('clause 1d — gaugeSkip: a Codex main-session PostToolUse acts; a Codex seat\'s PostToolUse, a Claude Code PostToolUse and a SessionStart stand down (E8-D21 through the table)',
  gaugeSkip(F.POST_MAIN) === null && gaugeSkip(F.POST_SEAT) === 'a seat batch (agent_id present)' && /not a PostToolBatch/.test(gaugeSkip(CLAUDE_T)) && gaugeSkip(F.SS_CLEAR) !== null,
  JSON.stringify([gaugeSkip(F.POST_MAIN), gaugeSkip(F.POST_SEAT), gaugeSkip(CLAUDE_T)]))

// E10H-R3-B4: the background work is read from the process tree, never the rollout. PROC_BYPASS and PROC_WS are the
// probe P-PROC listings, one per Stop, in each posture; `procs` hands one to codexObservations as the hook does.
const procs = (cap) => ({ listing: cap.listing, codex: codexAncestor(cap.listing, cap.self) })
const NOBG = procs(F.PROC_BYPASS.TTY_GONE), LIVE = procs(F.PROC_BYPASS.TTY)
const obs = (t, st = 'done', p = NOBG) => codexObservations(text(t), st, p)
const CAPS = [['BYPASS', F.PROC_BYPASS], ['WS', F.PROC_WS]].flatMap(([post, caps]) => Object.entries(caps).map(([k, c]) => [`${post}.${k}`, c]))
const bgOf = (c) => codexBackground(c.listing, codexAncestor(c.listing, c.self))
const bgWrong = CAPS.filter(([k, c]) => bgOf(c).running !== /\.(TTY|PROC|CELL)$/.test(k) || bgOf(c).unknown !== null)
clause('clause 1f — codexBackground on every probe P-PROC capture, both postures: work running under the tty loop, the non-tty loop and the cell awaiting two commands; none on a plain turn or after each exited (E10H-R3-B4)',
  CAPS.length === 14 && bgWrong.length === 0, JSON.stringify(bgWrong.map(([k, c]) => [k, bgOf(c)])))
const ancWrong = CAPS.filter(([, c]) => !/\/vendor\/x86_64-unknown-linux-musl\/bin\/codex$/.test(c.listing.procs.find((p) => p.pid === codexAncestor(c.listing, c.self)?.pid)?.argv0 ?? ''))
// Derived from the workspace-write capture: a process under the sandbox's inner codex-linux-sandbox (whose exe is the
// codex binary) looks up its Codex, which is the one above the sandbox.
const wsT = F.PROC_WS.TTY, inner = wsT.listing.procs.find((p) => p.argv0 === 'codex-linux-sandbox')
const underSandbox = { procs: [...wsT.listing.procs, { pid: 1e9, ppid: inner.pid, state: 'R', start: null, argv0: 'node', session: '' }] }
clause('clause 1f2 — codexAncestor on every capture is the native codex binary above the hook, not the npm launcher (node) above it; the sandbox\'s codex-linux-sandbox is not the Codex process; a listing with no codex above the pid, and a pid not in it, give none (E10H-R3-B4)',
  ancWrong.length === 0 && codexAncestor(underSandbox, 1e9)?.pid === codexAncestor(wsT.listing, wsT.self).pid &&
  codexAncestor({ procs: [{ pid: 5, ppid: 1, argv0: 'node' }, { pid: 1, ppid: 0, argv0: '/sbin/init' }] }, 5) === null &&
  codexAncestor(F.PROC_BYPASS.TTY.listing, 999999999) === null, JSON.stringify(ancWrong.map(([k]) => k)))
// The B5 run 1 capture (CELL_RUNNING, then CELL_DONE: its cell reports running and no output of it ever ends it, P3-B1)
// and every other real rollout read beside the listing of work running, then of work gone: the rollout says nothing.
const ROLLOUTS = { B5_RUN1: [F.CELL_RUNNING, F.CELL_DONE], BG_RUNNING: F.BG_RUNNING, POLLED_CELL: F.POLLED_CELL, MULTI_CELL: F.MULTI_CELL, ESC_ABORTED: F.ESC_ABORTED,
  RACE_EXITED: F.RACE_EXITED, TUI_TURN: F.TUI_TURN, N11: [...F.TUI_TURN.slice(0, -1), F.N11_OUTPUT[0], F.TUI_TURN.at(-1)],
  // Derived, the round 3 red team's two shapes: R3-B1, a progress output on the cell's own call after "Script running";
  // R3-B2, a command result printed inside an array, `text(await Promise.all([...]))`, on TUI_TURN's exec output.
  R3_B1: [...F.CELL_RUNNING.slice(0, -1), F.CELL_RUNNING.find((l) => /cell ID 6/.test(l)).replace(/Script running with cell ID 6[^"]*/, 'progress 1 of 12'), F.CELL_RUNNING.at(-1)],
  R3_B2: F.TUI_TURN.map((l) => (JSON.parse(l).payload?.type === 'custom_tool_call_output' ? JSON.stringify({ ...JSON.parse(l), payload: { ...JSON.parse(l).payload, output: [{ type: 'input_text', text: 'Script completed' }, { type: 'input_text', text: '[{"chunk_id":"a1","wall_time_seconds":1.0,"session_id":4242,"original_token_count":0,"output":""}]' }] } }) : l)) }
const textWrong = Object.entries(ROLLOUTS).filter(([, r]) => obs(r, 'done', LIVE).backgroundRunning !== true || obs(r, 'done', NOBG).backgroundRunning !== false)
clause('clause 1f3 — codexObservations reads background work from the listing alone: every real rollout, the B5 run 1 cell that reports running forever among them, reads running beside the tty listing and not running beside the one after it exited, and B5 run 1 then reads idle (E10H-R3-B4, P3-B1)',
  textWrong.length === 0 && obs(ROLLOUTS.B5_RUN1, 'done', NOBG).idle === true && obs(ROLLOUTS.B5_RUN1, 'done', LIVE).idle === false,
  JSON.stringify(textWrong.map(([k]) => k)))
// Derived from the captures: the listing with the Codex process's start time set, then another start (the pid reused);
// a zombie of the loop; the loop's environment unreadable, alone and beside a readable one; a detached copy of the loop
// reparented to pid 1.
const L = F.PROC_BYPASS.TTY.listing, C = codexAncestor(L, F.PROC_BYPASS.TTY.self), loop = codexBackground(L, C).pids
const edit = (lst, f) => ({ procs: lst.procs.map((p) => f(p) ?? p) })
const started = edit(L, (p) => (p.pid === C.pid ? { ...p, start: 777 } : null))
const zombie = edit(L, (p) => (loop.includes(p.pid) ? { ...p, state: 'Z' } : null))
const blind = edit(L, (p) => (loop.includes(p.pid) ? { ...p, session: null } : null))
const halfBlind = edit(L, (p) => (p.pid === loop[1] ? { ...p, session: null } : null))
const detached = edit(L, (p) => (loop.includes(p.pid) ? { ...p, ppid: 1 } : null))
clause('clause 1f7 — codexBackground unknown, counted running: no listing, a listing that failed, no Codex process, the Codex process gone or its pid reused, a live descendant whose environment cannot be read; known: a zombie is not work, a readable work process wins over an unreadable one, and work that left the tree is not the session\'s (E10H-R3-B4)',
  codexBackground(undefined, C).unknown === 'no process listing' && codexBackground({ error: '/proc could not be read (ENOENT)' }, C).unknown === '/proc could not be read (ENOENT)' &&
  codexBackground(L, null).unknown === 'no Codex process above the hook' && codexBackground(L, { pid: 999999999, start: null }).unknown === 'the Codex process is gone' &&
  codexBackground(started, { ...C, start: 777 }).running === true && codexBackground(started, { ...C, start: 778 }).unknown === 'the Codex process is gone' &&
  [undefined, { error: 'x' }].every((l) => codexBackground(l, C).running === true) && codexBackground(L, null).running === true &&
  codexBackground(zombie, C).running === false && /could not be read$/.test(codexBackground(blind, C).unknown) && codexBackground(blind, C).running === true &&
  codexBackground(halfBlind, C).unknown === null && codexBackground(halfBlind, C).running === true && codexBackground(detached, C).running === false &&
  codexObservations(text(F.TUI_TURN), 'done').backgroundUnknown === 'no process listing' && codexObservations(text(F.TUI_TURN), 'done').idle === false && obs(F.TUI_TURN).backgroundUnknown === null,
  JSON.stringify([codexBackground(blind, C), codexBackground(halfBlind, C), codexBackground(zombie, C)]))
// Standards R4-N2. Derived: P-PROC's bypass listings with an inherited CODEX_SESSION_ID ('outer') on everything Codex
// did not start a command in: the hook, codex-code-mode-host and Codex itself, as a Codex launched with the variable
// set passes it on. The commands keep the session's own id.
const ISID = '01a0ea6f-1c15-7372-a6fa-ded272b978f2'
const inherit = (c) => ({ procs: c.listing.procs.map((p) => (p.session === ISID ? p : p.pid === c.self || /codex(-code-mode-host)?$/.test(p.argv0) ? { ...p, session: 'outer' } : p)) })
const inhBg = (c, own) => codexBackground(inherit(c), codexAncestor(inherit(c), c.self), own)
clause('clause 1f8 — codexBackground with an inherited CODEX_SESSION_ID: the hook and codex-code-mode-host carrying it are not work, so an idle turn reads none and the tty loop reads only its own processes; an inherited value equal to the session\'s own excludes nothing (Standards R4-N2)',
  inhBg(F.PROC_BYPASS.IDLE, { inherited: 'outer', session: ISID }).running === false && inhBg(F.PROC_BYPASS.TTY_GONE, { inherited: 'outer', session: ISID }).running === false &&
  JSON.stringify(inhBg(F.PROC_BYPASS.TTY, { inherited: 'outer', session: ISID }).pids) === JSON.stringify(F.PROC_BYPASS.TTY.listing.procs.filter((p) => p.session === ISID).map((p) => p.pid)) &&
  codexBackground(F.PROC_BYPASS.TTY.listing, codexAncestor(F.PROC_BYPASS.TTY.listing, F.PROC_BYPASS.TTY.self), { inherited: ISID, session: ISID }).pids.length === 2 && inherit(F.PROC_BYPASS.TTY).procs.filter((p) => p.session === 'outer').length === 3,
  JSON.stringify([inhBg(F.PROC_BYPASS.IDLE, { inherited: 'outer', session: ISID }), inhBg(F.PROC_BYPASS.TTY, { inherited: 'outer', session: ISID })]))
clause('clause 1f4 — codexObservations: a task_complete carrying an error after the last user turn is the API error, and that turn is not idle (S5, B6)',
  obs(F.API_ERROR, 'idle').apiError === 'internal_server_error' && obs(F.API_ERROR, 'idle').idle === false, JSON.stringify(obs(F.API_ERROR, 'idle')))
// Derived: TUI_TURN with its final answer and task_complete ending in the ready line, and TUI_TURN cut before its end.
const readyTurn = F.TUI_TURN.map((l) => l.replace('"last_agent_message":"alpha"', '"last_agent_message":"handed off\\nauto-cycle: ready"'))
clause('clause 1f5 — codexObservations idle: an ended turn reads idle while herdr says done or idle, not while it says working or blocked, not when the last message is the ready line, not while the turn runs (S5, E8-D18)',
  obs(F.TUI_TURN, 'done').idle && obs(F.TUI_TURN, 'idle').idle && obs(F.TUI_TURN, null).idle && !obs(F.TUI_TURN, 'working').idle && !obs(F.TUI_TURN, 'blocked').idle &&
  !obs(readyTurn).idle && !obs(F.TUI_TURN.slice(0, 12)).idle,
  JSON.stringify([obs(F.TUI_TURN, 'working'), obs(readyTurn), obs(F.TUI_TURN.slice(0, 12))]))
clause('clause 1f6 — codexObservations: a new prompt after an API-error turn clears the error (it is read after the last user turn only)',
  obs([F.API_ERROR, F.TUI_NEXT]).apiError === null, JSON.stringify(obs([F.API_ERROR, F.TUI_NEXT])))

const W = { poll: 10, idle: 100, max: 10000, stall: 120000 }
const ws = (o) => watchStep({ active: true, turn: { ended: true, newTurn: false }, obs: { backgroundRunning: false, apiError: null, idle: false }, held: false, liveWork: null, session: 's1', paneSession: null, idleFor: 0, age: 0, times: W, ...o })
clause('clause 1g — watchedTurn: a turn is ended at its task_complete, and a task_started after that end is a new turn',
  watchedTurn(text(F.TUI_TURN.slice(3))).ended === true && watchedTurn(text(F.TUI_TURN.slice(3))).newTurn === false &&
  watchedTurn(text(F.TUI_TURN.slice(3, 10))).ended === false && watchedTurn(text(F.TUI_TURN.slice(3), F.TUI_COMPACT)).newTurn === true,
  JSON.stringify([watchedTurn(text(F.TUI_TURN.slice(3))), watchedTurn(text(F.TUI_TURN.slice(3), F.TUI_COMPACT))]))
clause('clause 1g2 — watchStep: an inactive record or a new turn exits; a running turn waits; an API error is a StopFailure; a Stop held for live work is re-run once that work is gone and waits while it is not; idle past the grace is an idle_prompt, inside it waits',
  ws({ active: false }).act === 'exit' && ws({ turn: { ended: true, newTurn: true } }).act === 'exit' && ws({ turn: { ended: false, newTurn: false } }).act === 'wait' &&
  ws({ obs: { apiError: 'internal_server_error' } }).act === 'stopFailure' && ws({ held: true }).act === 'stop' &&
  ws({ held: true, obs: { backgroundRunning: true } }).act === 'wait' && ws({ obs: { idle: true }, idleFor: 150 }).act === 'idle' &&
  ws({ obs: { idle: true }, idleFor: 50 }).act === 'wait' && ws({ age: 20000, turn: { ended: false } }).act === 'exit' && WATCH_TIMES.idle === 60000 &&
  ws({ ready: true }).act === 'exit' && ws({ ready: true, held: true }).act === 'stop' && ws({ ready: true, obs: { backgroundRunning: true } }).act === 'wait',
  JSON.stringify([ws({ held: true }), ws({ obs: { idle: true }, idleFor: 150 })]))
clause('clause 1g4 — watchStep: a Stop held for a live gate waits while the gate is live, even on the ready line with no terminal running, and is re-run once it is not (E10H-R2-B2, red team R2-N2)',
  ws({ ready: true, held: true, liveWork: 'gate dctr-gate-1 is live' }).act === 'wait' && ws({ held: true, liveWork: 'gate dctr-gate-1 is live' }).act === 'wait' &&
  ws({ ready: true, held: true, liveWork: null }).act === 'stop', JSON.stringify(ws({ ready: true, held: true, liveWork: 'gate dctr-gate-1 is live' })))
clause('clause 1g5 — watchStep: herdr naming another session in the pane ends the watch, before any event is handed on; its own session, or none read, does not (Spec N2)',
  ws({ paneSession: 's2', obs: { idle: true }, idleFor: 150 }).act === 'exit' && ws({ paneSession: 's2', held: true }).act === 'exit' &&
  ws({ paneSession: 's1', obs: { idle: true }, idleFor: 150 }).act === 'idle' && ws({ paneSession: null, held: true }).act === 'stop',
  JSON.stringify(ws({ paneSession: 's2', obs: { idle: true }, idleFor: 150 })))

clause('clause 1g6 — watchStep: a Stop held while the background work cannot be read waits inside the idle grace and hands on the unknown past it; a live gate, known work running, or no held Stop never does (E10H-R3-B4, E8-D16)',
  ws({ held: true, obs: { backgroundRunning: true, backgroundUnknown: 'no Codex process above the hook' }, unknownFor: 50 }).act === 'wait' &&
  ws({ held: true, obs: { backgroundRunning: true, backgroundUnknown: 'no Codex process above the hook' }, unknownFor: 150 }).act === 'unknown' &&
  ws({ held: true, ready: true, obs: { backgroundRunning: true, backgroundUnknown: 'x' }, unknownFor: 150 }).act === 'unknown' &&
  ws({ held: true, liveWork: 'gate dctr-gate-1 is live', obs: { backgroundRunning: true, backgroundUnknown: 'x' }, unknownFor: 150 }).act === 'wait' &&
  ws({ held: true, obs: { backgroundRunning: true, backgroundUnknown: null }, unknownFor: 150 }).act === 'wait' &&
  ws({ held: false, obs: { backgroundRunning: true, backgroundUnknown: 'x' }, unknownFor: 150 }).act === 'wait' &&
  ws({ held: true, obs: { backgroundRunning: false, backgroundUnknown: null }, unknownFor: 150 }).act === 'stop',
  JSON.stringify(ws({ held: true, obs: { backgroundRunning: true, backgroundUnknown: 'x' }, unknownFor: 150 })))
clause('clause 1g7 — notifyDecision on the watcher\'s unknown background work writes the paused line naming it; the Claude Code kinds are unchanged (E10H-R3-B4, E8-D16)',
  notifyDecision('background_unknown', { why: 'the Codex process is gone', host: 'codex' }) === 'could not tell whether background work is still running: the Codex process is gone' &&
  notifyDecision('idle_prompt', { lastStop: { backgroundEmpty: true, cronsEmpty: true, ready: false } }) === 'session idle, waiting for you' && notifyDecision('other', {}) === null,
  JSON.stringify(notifyDecision('background_unknown', { why: 'w' })))

const unfinished = { turn: { ended: false, newTurn: false } }
const STALL_MS = 15 * 60 * 1000
const STALL_REASON = 'Codex API error: turn stalled, no rollout write for 120 s with the turn unfinished'
clause('clause 1g8 — watchStep: an unfinished turn whose rollout has not grown for the stall time hands the hook a StopFailure naming the stall, which notifyDecision writes as the Codex API error pause; inside the time it waits, a finished turn never stalls, and the longest watch exits first (E10-R29)',
  ws({ ...unfinished, stalledFor: 120000 }).act === 'stall' && notifyDecision('StopFailure', { error: ws({ ...unfinished, stalledFor: 120000 }).error, host: 'codex' }) === STALL_REASON &&
  ws({ ...unfinished, stalledFor: 119990 }).act === 'wait' && ws({ ...unfinished }).act === 'wait' &&
  ws({ stalledFor: 500000 }).act !== 'stall' && ws({ obs: { idle: true }, idleFor: 150, stalledFor: 500000 }).act === 'idle' &&
  ws({ ...unfinished, stalledFor: 500000, age: 20000 }).act === 'exit' && WATCH_TIMES.stall === STALL_MS,
  JSON.stringify([ws({ ...unfinished, stalledFor: 120000 }), ws({ stalledFor: 500000 }), WATCH_TIMES]))

clause('clause 1h — the API-error and different-session pauses name Codex on Codex and Claude as today, and each host\'s text is the same pause (E10 table)',
  pauseReason('R9', 'internal_server_error', 'codex') === 'Codex API error: internal_server_error' && pauseReason('R9', 'x') === 'Claude API error: x' &&
  pauseCode('Codex API error: y') === 'R9' && pauseCode('Claude API error: y') === 'R9' && samePause('Codex API error: a', 'Claude API error: b') &&
  pauseReason('R12', undefined, 'codex') === 'could not cycle: this pane now runs a different Codex session' &&
  pauseReason('R12') === 'could not cycle: this pane now runs a different Claude session' && pauseCode(pauseReason('R12', undefined, 'codex')) === 'R12' && pauseCode(pauseReason('R12')) === 'R12' &&
  notifyDecision('StopFailure', { error: 'internal_server_error', host: 'codex' }) === 'Codex API error: internal_server_error' &&
  notifyDecision('StopFailure', { error: 'rate_limit' }) === 'Claude API error: rate_limit',
  JSON.stringify([pauseReason('R9', 'x', 'codex'), pauseReason('R12', undefined, 'codex')]))
const cd = (host) => { try { return cycleDecision({ sessionId: 's', warned: true, ready: true, handoffLanded: true, paneSession: 'other', host }) } catch (e) { return { reason: `cycleDecision threw: ${e.message}` } } }
clause('clause 1h2 — cycleDecision on Codex names Codex in the different-session pause, and as today names Claude',
  cd('codex').reason === 'could not cycle: this pane now runs a different Codex session' && cd(undefined).reason === 'could not cycle: this pane now runs a different Claude session',
  JSON.stringify([cd('codex'), cd(undefined)]))

// E10H-R4-B2: every pause the Codex paths write names, in its action, the remedy that clears it. A paused line after
// the session's warned line refuses every later Stop of that session (pausedAfterWarned) until a /clear and a typed
// resume start a new one, so there its action must name those; before the warned line the session's next turn goes
// on. The Codex kinds: the unknown background work, and every D2 reason Codex words differently (R9 and R12 today).
const { parseRecord } = await import('./dctr-record.mjs')
const codexWorded = Object.keys(PAUSES).filter((c) => PAUSES[c].reason('x', 'codex') !== PAUSES[c].reason('x'))
const codexKinds = [unknownBackgroundReason('the Codex process is gone'), unknownBackgroundReason('the environment of process 4242 could not be read'),
  ...codexWorded.map((c) => pauseReason(c, 'internal_server_error', 'codex'))]
const recOf = (...ls) => parseRecord(['# r', '- State: Open', '- auto-cycle: on cap 10 tier 10000', ...ls, ''].join('\n')).entries
const actionAfter = (r) => { const es = recOf('- auto-cycle: warned s1 10000', `- auto-cycle paused: ${r}`); return { held: pausedAfterWarned(es, 's1'), action: pauseActionAt(es.at(-1), es) } }
const actionBefore = (r) => { const es = recOf(`- auto-cycle paused: ${r}`); return { held: pausedAfterWarned(es, 's1'), action: pauseActionAt(es.at(-1), es) } }
const unclear = codexKinds.filter((r) => { const a = actionAfter(r); return !a.held || !a.action.includes('/clear and type resume') })
clause('clause 1h3 — every pause the Codex paths write names what clears it: after the warned line, where it holds every later Stop of the session, the unknown background work, R9 and R12 in Codex\'s words each name the /clear and the typed resume; the unknown background work names the pane first; R9 before any warned line asks only for the retry; the Claude Code actions are unchanged (E10H-R4-B2)',
  codexWorded.join() === 'R9,R12' && unclear.length === 0 &&
  actionAfter(codexKinds[0]).action === 'check the pane for work still running, then /clear and type resume by hand' &&
  actionBefore(pauseReason('R9', 'internal_server_error', 'codex')).action === 'retry in the pane' &&
  actionAfter(pauseReason('R9', 'x')).action === 'retry in the pane' && actionAfter(pauseReason('R12')).action === 'check the pane',
  JSON.stringify(codexKinds.map((r) => [r, actionAfter(r)])))

// Derived: TUI_TURN's prompt line with its text replaced by the resume line, as the typer's send records it.
const resumeLine = F.TUI_TURN[2].replace("Run the shell command 'echo tui-one', then reply with the word alpha.", CODEX_RESUME_LINE)
const resumeUser = transcriptEntries(text(resumeLine), 'codex').entries[0]
clause('clause 1i — the Codex resume line is the skill\'s $-mention with the not-a-ruling argument; read off a rollout it is meta, so userTyped does not count it, nor the harness\'s meta messages or an assistant message, while a typed prompt counts',
  CODEX_RESUME_LINE === '$doctrine:doctrine-resume (typed by doctrine auto-cycle, not a ruling)' && resumeUser?.isMeta === true && !userTyped(resumeUser) &&
  !userTyped(users[0]) && userTyped(users[1]) && !userTyped(assts[0]) && RESUME_LINE.startsWith('/doctrine:'),
  JSON.stringify([resumeUser, userTyped(users[0]), userTyped(users[1])]))

const T = { poll: 20, idle: 150, restore: 400, session: 400, firstTurn: 300 }
const idle = { status: 'done', focused: false, session: 'old' }
const NEW = { session: 'new', transcript: '/n.jsonl' }
const base = { host: 'codex', stage: 'clear', active: true, pausedSinceClaim: false, pane: idle, oldSession: 'old', grew: false, restore: null, waited: 0, notIdle: 0, sessionWait: 0, resumes: 0, firstTurn: false, composer: true, aborted: false, times: T }
const ts = (o) => typerStep({ ...base, ...o })
clause('clause 1j — Codex typerStep before /clear is Claude Code\'s: idle, unfocused, the old session and nothing new clears; focused waits; typing is R16',
  ts({}).act === 'clear' && ts({ pane: { ...idle, focused: true } }).act === 'wait' && ts({ grew: true }).code === 'R16' && !ts({}).cycle,
  JSON.stringify(ts({})))
clause('clause 1j2 — Codex typerStep after /clear reads no screen sign that it took: it waits one poll, then on a ready, unfocused pane with an empty composer and herdr still on the old session it sends the resume line, with no cycle flag (S1)',
  ts({ stage: 'resume', waited: 0 }).act === 'wait' && ts({ stage: 'resume', waited: 20 }).act === 'resume' && !ts({ stage: 'resume', waited: 20 }).cycle &&
  ts({ stage: 'resume', waited: 5000 }).act === 'resume', JSON.stringify([ts({ stage: 'resume', waited: 0 }), ts({ stage: 'resume', waited: 20 })]))
clause('clause 1j3 — Codex typerStep after /clear: a composer that could not be read pauses with R17, a draft with R16, a focused pane waits, a busy one waits inside the grace and then R17; it never waits out the restore wait to R18 (S1)',
  ts({ stage: 'resume', waited: 20, composer: null }).reason === 'could not type into the pane: herdr could not read the pane' &&
  ts({ stage: 'resume', waited: 20, composer: false }).code === 'R16' && ts({ stage: 'resume', waited: 20, pane: { ...idle, focused: true } }).act === 'wait' &&
  ts({ stage: 'resume', waited: 20, pane: { ...idle, status: 'working' }, notIdle: 100 }).act === 'wait' &&
  ts({ stage: 'resume', waited: 20, pane: { ...idle, status: 'working' }, notIdle: 200 }).reason === 'could not type into the pane: the session stayed busy' &&
  [0, 20, 500, 5000].every((waited) => ts({ stage: 'resume', waited }).code !== 'R18'),
  JSON.stringify([ts({ stage: 'resume', waited: 20, composer: null }), ts({ stage: 'resume', waited: 20, composer: false })]))
clause('clause 1j8 — Codex typerStep after the resume line: a gated marker naming the old session pauses with R18 naming it, no cycle flag; one naming another session pauses with R14; with none it waits for the restore file as before (S1)',
  ts({ stage: 'confirm', resumes: 1, gated: 'old', waited: 20 }).code === 'R18' && ts({ stage: 'confirm', resumes: 1, gated: 'old', waited: 20 }).reason === '/clear did not take: session old still running' &&
  !ts({ stage: 'confirm', resumes: 1, gated: 'old', waited: 20 }).cycle &&
  ts({ stage: 'confirm', resumes: 1, gated: 'new', waited: 20, pane: { ...idle, session: 'new' } }).code === 'R14' &&
  ts({ stage: 'confirm', resumes: 1, gated: null, waited: 20 }).act === 'wait',
  JSON.stringify([ts({ stage: 'confirm', resumes: 1, gated: 'old', waited: 20 }), ts({ stage: 'confirm', resumes: 1, gated: 'new', waited: 20 })]))
clause('clause 1j9 — Codex typerStep, a new session before the resume line (a restore file, or herdr naming it): one poll beside the restore file waits; then typing in the new chat is R16, an unread new rollout waits, nothing typed sends the resume line, a draft is R16; herdr on a new session with no restore file waits for it, then R14, never R16 (S1)',
  ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 0, typedNew: false }).act === 'wait' &&
  ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 20, typedNew: true }).code === 'R16' &&
  ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 20, typedNew: null }).act === 'wait' &&
  ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 20, typedNew: false }).act === 'resume' &&
  ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 20, typedNew: false, composer: false }).code === 'R16' &&
  ts({ stage: 'resume', waited: 100, pane: { ...idle, session: 'new' } }).act === 'wait' && ts({ stage: 'resume', waited: 500, pane: { ...idle, session: 'new' } }).code === 'R14',
  JSON.stringify([ts({ stage: 'resume', waited: 20, restore: NEW, pane: { ...idle, session: 'new' }, sessionWait: 20, typedNew: false }), ts({ stage: 'resume', waited: 500, pane: { ...idle, session: 'new' } })]))
clause('clause 1j4 — Codex typerStep after the resume: no restore file waits, then pauses with R14 (clear 1, resume 1); herdr not yet on the new session waits, then R17; a third session is R16',
  ts({ stage: 'confirm', resumes: 1, cycled: true, waited: 100 }).act === 'wait' && ts({ stage: 'confirm', resumes: 1, cycled: true, waited: 500 }).code === 'R14' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, sessionWait: 100 }).act === 'wait' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, sessionWait: 500 }).reason === 'could not type into the pane: herdr did not report the new session within 30 s' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, sessionWait: 500, pane: { ...idle, session: null } }).reason === 'could not type into the pane: herdr could not read the pane' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, pane: { ...idle, session: 'third' } }).code === 'R16',
  JSON.stringify(ts({ stage: 'confirm', resumes: 1, waited: 500 })))
const NP = { ...idle, session: 'new' }
clause('clause 1j5 — Codex typerStep confirming: typing into the new chat is R16, a first turn confirms, none waits, then the resume line once more, then R15',
  ts({ stage: 'confirm', resumes: 1, restore: NEW, pane: NP, typedNew: true }).code === 'R16' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, pane: NP, firstTurn: true, typedNew: false }).act === 'confirm' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, pane: NP, waited: 100, typedNew: false }).act === 'wait' &&
  ts({ stage: 'confirm', resumes: 1, restore: NEW, pane: NP, waited: 400, typedNew: false }).act === 'resume' &&
  ts({ stage: 'confirm', resumes: 2, restore: NEW, pane: NP, waited: 400, typedNew: false }).code === 'R15',
  'wrong')

// ---------------------------------------------------------------- clause 1, gate round 1 repair: real rollouts from ~/.codex/sessions

// E10H-B7: Codex labels each user message's items; the AGENTS.md block and the environment context are injected, typed
// text is user.text, whatever the text starts with.
const am = transcriptEntries(text(F.AGENTS_MD_TURN), 'codex').entries.filter((e) => e.type === 'user')
const tk = transcriptEntries(text(F.TASK_TYPED), 'codex').entries[0]
clause('clause 1k — the AGENTS.md block Codex injects (no user.text label) is meta and not typing; the prompt after it is typing; a typed prompt opening with a tag (user.text) is typing too (E10H-B7)',
  am.length === 2 && am[0].isMeta === true && !userTyped(am[0]) && am[1].isMeta === false && userTyped(am[1]) && tk?.isMeta === false && userTyped(tk),
  JSON.stringify([am.map((e) => [e.isMeta, userTyped(e)]), tk?.isMeta]))
clause('clause 2i — the AGENTS.md block does not start a turn: the turn it sits in ended, so its rollout reads no running turn (E10H-B7)',
  obs(F.AGENTS_MD_TURN).backgroundRunning === false && obs(F.AGENTS_MD_TURN, 'done').idle === true, JSON.stringify(obs(F.AGENTS_MD_TURN)))

// E10H-R4-B1: every Codex send (the /clear, the first resume and the retry) checks the same guards: focus, ready, an
// empty composer read from the pane, and, once the resume is sent, no turn_aborted or typed turn in the new chat.
// Derived pane texts: PANE_0160_BEFORE with a draft in its composer; PANE_0160_CLEARED after the resume line was
// submitted and interrupted (INTERRUPTED_LINE, B6's pane), above a composer holding `c`.
const DRAFT_BEFORE = F.PANE_0160_BEFORE.replace('› Ask Codex to do anything', '› my own draft')
const RETRY_PANE = (c) => F.PANE_0160_CLEARED.replace('› Ask Codex to do anything', `› ${CODEX_RESUME_LINE}\n\n\n${F.INTERRUPTED_LINE}\n\n\n› ${c}`)
const abortedNew = transcriptEntries(text(F.RESUME_ABORTED), 'codex')
const RETRY = { stage: 'confirm', resumes: 1, restore: NEW, pane: NP, typedNew: false }
clause('clause 1j6 — Codex typerStep confirming: a resume turn interrupted before its first answer (turn_aborted, no assistant message, nothing typed) pauses with R16 and never sends the resume line again, inside or past the first-turn wait; a first turn still confirms (E10H-R4-B1)',
  codexAborted(text(F.RESUME_ABORTED)) === true && codexAborted(text(F.TUI_TURN)) === false && codexAborted(null) === null &&
  !abortedNew.entries.some(userTyped) && !abortedNew.entries.some((e) => e.type === 'assistant') &&
  [100, 400].every((waited) => ts({ ...RETRY, waited, aborted: true, composer: false }).code === 'R16' && ts({ ...RETRY, waited, aborted: true }).code === 'R16') &&
  ts({ ...RETRY, aborted: true, firstTurn: true }).act === 'confirm',
  JSON.stringify([codexAborted(text(F.RESUME_ABORTED)), ts({ ...RETRY, waited: 400, aborted: true, composer: false }), ts({ ...RETRY, waited: 400, aborted: true })]))
clause('clause 1j7 — Codex typerStep: the retry sends nothing into a draft (R16, focused or not) or when the pane text was not read (R17), the /clear likewise (a focused pane waits first, as before), and each goes ahead on an empty composer (E10H-R4-B1)',
  ts({ ...RETRY, waited: 400, composer: false }).code === 'R16' && ts({ ...RETRY, waited: 400, composer: null }).reason === 'could not type into the pane: herdr could not read the pane' &&
  ts({ ...RETRY, waited: 400 }).act === 'resume' &&
  ts({ composer: false }).code === 'R16' && ts({ composer: null }).reason === 'could not type into the pane: herdr could not read the pane' && ts({}).act === 'clear' &&
  ts({ ...RETRY, waited: 400, composer: false, pane: { ...NP, focused: true } }).code === 'R16' && ts({ composer: false, pane: { ...idle, focused: true } }).act === 'wait',
  JSON.stringify([ts({ ...RETRY, waited: 400, composer: false }), ts({ composer: false }), ts({ composer: null })]))
const SUBMITTED = F.PANE_0160_CLEARED.replace('› Ask Codex to do anything', '› hello there\n\n• Hi.\n\n› Ask Codex to do anything')
clause('clause 1n3 — composerIdle reads the pane\'s composer, its last › line, on 0.156.1 and 0.160.0 captures alike: the placeholder or nothing is empty, before the /clear, after it, and under a prompt already answered; a draft (one wrapped onto a second line included), and a draft under an interrupted resume are not; an unread pane says nothing (E10H-R4-B1, S1)',
  [F.NARROW_BEFORE, F.NARROW_AFTER, F.NARROW_R18, F.CLEAR_SCREEN, F.PANE_0160_BEFORE, F.PANE_0160_CLEARED, SUBMITTED, RETRY_PANE('Ask a follow-up question'), RETRY_PANE('')].every((t) => composerIdle(t) === true) &&
  composerIdle(F.PANE_0160_DRAFT) === false && composerIdle(DRAFT_BEFORE) === false && composerIdle(RETRY_PANE('my own draft')) === false && composerIdle(null) === null,
  JSON.stringify([F.NARROW_BEFORE, F.NARROW_AFTER, F.NARROW_R18, F.CLEAR_SCREEN, F.PANE_0160_BEFORE, F.PANE_0160_CLEARED, SUBMITTED].map(composerIdle).concat([composerIdle(F.PANE_0160_DRAFT), composerIdle(DRAFT_BEFORE)])))

// E10-D28: a pane read with no composer line is absent, never a draft: a blank read right after the /clear and the
// new chat's splash before its composer is drawn (SPLASH_0160 below) wait, a draft on the composer line still reads
// draft, and a draft whose first line is blank (a bare ›, its text on the line below) reads draft too.
// SPLASH_0160 is CONSTRUCTED, not captured: PANE_0160_CLEARED cut above its composer line, since the live captures after
// a /clear caught the pane blank or fully drawn and never the splash without its composer.
const SPLASH_0160 = F.PANE_0160_CLEARED.slice(0, F.PANE_0160_CLEARED.indexOf('› Ask Codex to do anything'))
const ABSENT = [F.PANE_0160_BLANK, SPLASH_0160, '• working\n']
clause('clause 1n4 — composerIdle on a pane with no composer line is absent, never a draft and never empty: codex-cli 0.160.0\'s blank read right after a /clear, the new chat\'s splash before its composer is drawn, and a working pane; an unread pane stays null (E10-D28, S1)',
  ABSENT.every((t) => composerIdle(t) === 'absent') && composerIdle(null) === null && composerIdle(undefined) === null,
  JSON.stringify(ABSENT.map(composerIdle)))
clause('clause 1n5 — composerIdle on a draft whose first line is blank (a bare › with the draft on the indented line below, codex-cli 0.160.0) is a draft; a bare › with the blank line under it is still empty (E10-D28, Q2)',
  composerIdle(F.PANE_0160_DRAFT_BLANKFIRST) === false && composerLine(F.PANE_0160_DRAFT_BLANKFIRST) === '' && composerIdle(RETRY_PANE('')) === true,
  JSON.stringify([composerIdle(F.PANE_0160_DRAFT_BLANKFIRST), composerLine(F.PANE_0160_DRAFT_BLANKFIRST), composerIdle(RETRY_PANE(''))]))

// N1: a Codex process under a Claude Code session (codex app-server started by codex:codex-rescue) is the Claude session's.
clause('clause 1o — codexUnderClaude: a Codex payload with CLAUDE_CODE_SESSION_ID set; not without it, and never a Claude Code payload (N1)',
  codexUnderClaude({ CLAUDE_CODE_SESSION_ID: 'c' }, 'codex') === true && codexUnderClaude({}, 'codex') === false && codexUnderClaude({ CLAUDE_CODE_SESSION_ID: '' }, 'codex') === false &&
  codexUnderClaude({ CLAUDE_CODE_SESSION_ID: 'c' }, 'claude') === false, 'wrong')

// ---------------------------------------------------------------- clause 2: known-good captures stay quiet

clause('clause 2a — a plain turn with one exec call that completed in its call shows no background terminal and no API error; neither does the /compact turn',
  !obs(F.TUI_TURN).backgroundRunning && obs(F.TUI_TURN).apiError === null && !obs(F.RUN3).backgroundRunning && obs([F.TUI_TURN, F.TUI_COMPACT]).apiError === null,
  JSON.stringify([obs(F.TUI_TURN), obs(F.RUN3)]))
clause('clause 2b — a Claude Code call as today is untouched: transcriptEntries without the host returns the raw lines, and a Codex payload\'s event is not a Claude batch',
  transcriptEntries(text(F.TUI_TURN)).entries.length === F.TUI_TURN.length && transcriptEntries(text(F.TUI_TURN)).entries[0].type === 'event_msg' &&
  userTyped({ type: 'user', message: { content: CODEX_RESUME_LINE } }) === true, 'Claude path changed')
clause('clause 2c — Claude typerStep is unchanged by the Codex branch: without the host a resume stage with no restore still waits for the restore file, not the pane',
  typerStep({ ...base, host: undefined, stage: 'resume', waited: 100 }).reason === 'waiting for the restore file', JSON.stringify(typerStep({ ...base, host: undefined, stage: 'resume', waited: 100 })))

// ---------------------------------------------------------------- clause 3: the fixtures carry the defect, no function under test called

clause('clause 3b — without the lib: CELL_RUNNING has a "Script running with cell ID" output and no CommandExecution completion after it; CELL_DONE is one of the same turn',
  F.CELL_RUNNING.some((l) => /Script running with cell ID 6/.test(l)) && !F.CELL_RUNNING.slice(F.CELL_RUNNING.findIndex((l) => /cell ID 6/.test(l))).some((l) => /"CommandExecution"/.test(l)) &&
  J(F.CELL_DONE[0]).payload.turn_id === J(F.CELL_RUNNING.find((l) => /cell ID 6/.test(l))).payload.internal_chat_message_metadata_passthrough.turn_id,
  'cell fixture wrong')
clause('clause 3c — without the lib: API_ERROR ends in a task_complete whose error is internal_server_error and whose last_agent_message is null, after the user\'s prompt',
  J(F.API_ERROR.at(-1)).payload.type === 'task_complete' && J(F.API_ERROR.at(-1)).payload.error.codex_error_info === 'internal_server_error' &&
  J(F.API_ERROR.at(-1)).payload.last_agent_message === null && F.API_ERROR.some((l) => l.includes('"role":"user"') && l.includes('Reply with the single word: again.')), 'api error fixture wrong')
const tc = F.TUI_TURN.filter((l) => J(l).payload?.type === 'token_count').map((l) => J(l).payload.info)
clause('clause 3e — without the lib: TUI_TURN\'s last token_count reads input 17503 of a 258400 window; the /compact one reads input 0; the rollout before RUN3\'s first hook marker holds no token_count',
  tc.at(-1).last_token_usage.input_tokens === 17503 && tc.at(-1).model_context_window === 258400 &&
  F.TUI_COMPACT.map(J).find((e) => e.payload?.type === 'token_count').payload.info.last_token_usage.input_tokens === 0 &&
  !firstPost.some((l) => l.includes('"token_count"')) && F.RUN3.some((l) => l.includes('"token_count"')), 'token fixtures wrong')
clause('clause 3f — without the lib: the seat\'s PostToolUse carries agent_id, the main one does not, and both name rollout- transcripts; the Stop of the background turn says nothing of the running process',
  'agent_id' in F.POST_SEAT && !('agent_id' in F.POST_MAIN) && /\/rollout-[^/]*$/.test(F.POST_MAIN.transcript_path) && /\/rollout-[^/]*$/.test(F.POST_SEAT.transcript_path) &&
  !('background_tasks' in F.STOP_BG) && F.STOP_BG.last_assistant_message === 'started', 'payload fixtures wrong')
const kinds = (l) => J(l).payload.internal_chat_message_metadata_passthrough?.content_item_kinds
clause('clause 3g — without the lib: the AGENTS.md message opens "# AGENTS.md instructions for", not a tag, and its labels lack user.text; the typed prompts carry user.text, one of them opening with a tag',
  J(F.AGENTS_MD_TURN[1]).payload.content[0].text.startsWith('# AGENTS.md instructions for') && !kinds(F.AGENTS_MD_TURN[1]).includes('user.text') &&
  kinds(F.AGENTS_MD_TURN[1]).includes('agents_md.instructions') && kinds(F.AGENTS_MD_TURN[2]).includes('user.text') &&
  J(F.TASK_TYPED[0]).payload.content[0].text.startsWith('<task>') && kinds(F.TASK_TYPED[0]).includes('user.text'), 'label fixtures wrong')
const kidsOf = (c, pid) => c.listing.procs.filter((p) => p.ppid === pid)
const under = (c, pid) => kidsOf(c, pid).flatMap((p) => [p, ...under(c, p.pid)])
const codexPid = (c) => c.listing.procs.find((p) => p.pid === c.self).ppid
const proofWrong = CAPS.filter(([k, c]) => {
  const d = under(c, codexPid(c)), withSession = d.filter((p) => p.session)
  const self = c.listing.procs.find((p) => p.pid === c.self), launcher = c.listing.procs.find((p) => p.pid === codexPid(c))
  return !(self.session === '' && /bin\/codex$/.test(launcher.argv0) && d.some((p) => p.pid === c.self) &&
    (/\.(TTY|PROC|CELL)$/.test(k) ? withSession.length > 0 : withSession.length === 0) &&
    d.filter((p) => /codex-code-mode-host$/.test(p.argv0)).every((p) => p.session === ''))
})
const sandbox = under(F.PROC_WS.TTY, codexPid(F.PROC_WS.TTY)).filter((p) => /codex-linux-sandbox$|^bwrap$/.test(p.argv0.split('/').at(-1)))
clause('clause 3p — without the lib: in every capture the hook\'s parent is the codex binary and the hook is under it; its descendants carry CODEX_SESSION_ID exactly while a loop or cell runs, codex-code-mode-host never does; in workspace-write the sandbox\'s own processes carry it; the probe\'s detached child sits under pid 1',
  proofWrong.length === 0 && sandbox.length === 3 && sandbox.every((p) => p.session) && CAPS.filter(([, c]) => c.listing.procs.some((p) => p.argv0 === 'sleep' && p.ppid === 1)).length >= 4,
  JSON.stringify(proofWrong.map(([k]) => k)))
const lastPrompt = (t) => t.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('›')).at(-1)
clause('clause 3q — without the lib: RESUME_ABORTED is a task_started, the resume line typed (user.text), the developer <turn_aborted> note and a turn_aborted event (reason interrupted), with no assistant message; the retry pane shows the resume line submitted, the interrupted line, then the draft as its last › line; DRAFT_BEFORE\'s last › line is the draft (E10H-R4-B1)',
  J(F.RESUME_ABORTED[0]).payload.type === 'task_started' && J(F.RESUME_ABORTED[1]).payload.content[0].text === CODEX_RESUME_LINE &&
  J(F.RESUME_ABORTED[1]).payload.internal_chat_message_metadata_passthrough.content_item_kinds.includes('user.text') &&
  J(F.RESUME_ABORTED[2]).payload.role === 'developer' && J(F.RESUME_ABORTED[2]).payload.content[0].text.startsWith('<turn_aborted>') &&
  J(F.RESUME_ABORTED[3]).payload.type === 'turn_aborted' && J(F.RESUME_ABORTED[3]).payload.reason === 'interrupted' &&
  F.RESUME_ABORTED.every((l) => J(l).payload.role !== 'assistant') &&
  lastPrompt(RETRY_PANE('my own draft')) === '› my own draft' && RETRY_PANE('x').includes(`› ${CODEX_RESUME_LINE}`) && RETRY_PANE('x').includes(F.INTERRUPTED_LINE) &&
  lastPrompt(DRAFT_BEFORE) === '› my own draft' && lastPrompt(F.PANE_0160_BEFORE) === '› Ask Codex to do anything' &&
  lastPrompt(F.PANE_0160_DRAFT) === '› draft text typed after clear, not' && lastPrompt(SUBMITTED) === '› Ask Codex to do anything' && SUBMITTED.includes('› hello there'), 'R4-B1 fixtures wrong')
const blankFirst = F.PANE_0160_DRAFT_BLANKFIRST.split('\n').map((l) => l.trim()), bare = blankFirst.findLastIndex((l) => l.startsWith('›'))
clause('clause 3s — without the lib: PANE_0160_BLANK and the constructed splash carry no › line, the splash keeps the new chat\'s greeting and art; PANE_0160_DRAFT_BLANKFIRST\'s last › line is a bare ›, the draft on the line under it and a blank line after that (E10-D28)',
  F.PANE_0160_BLANK === '' && !SPLASH_0160.includes('›') && SPLASH_0160.includes('Hello, you. Got an idea?') && SPLASH_0160.includes('⣿') &&
  blankFirst[bare] === '›' && blankFirst[bare + 1] === 'second line draft, never sent' && blankFirst[bare + 2] === '', 'E10-D28 fixtures wrong')
const stalledTypes = F.STALLED_TURN.map((l) => JSON.parse(l).payload?.type), stalledTimes = F.STALLED_TURN.map((l) => Date.parse(JSON.parse(l).timestamp))
clause('clause 3r — without the lib: STALLED_TURN starts a turn and never ends it (no task_complete or turn_aborted), and all its lines fall within one second, so a watcher reading it sees no growth after its last line (E10-R29)',
  stalledTypes.includes('task_started') && !stalledTypes.includes('task_complete') && !stalledTypes.includes('turn_aborted') &&
  Math.max(...stalledTimes) - Math.min(...stalledTimes) < 1000, JSON.stringify([stalledTypes, stalledTimes]))
process.exit(bad ? 1 : 0)
