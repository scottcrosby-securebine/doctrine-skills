// Behavioral tamper test for the Codex host's pure seams in dctr-lib.mjs (E10 e10-hookport, seams S1, S4, S5 and
// the watcher and typer decisions built on them), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-codex.seams.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every rollout, payload and pane text is a real Codex 0.156.1 capture, cut verbatim into dctr-codex.fixtures.mjs
// (each constant names its probe file). A fixture a clause needs in another shape is derived here, and says so.
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
  hostOf, transcriptEntries, readUsage, gaugeSkip, clearTook, codexObservations, watchedTurn, watchStep, WATCH_TIMES, typerStep,
  pauseReason, pauseCode, samePause, userTyped, CODEX_RESUME_LINE, RESUME_LINE, notifyDecision, cycleDecision, codexAncestor, codexBackground,
  composerEmpty, codexUnderClaude,
} = await import('./dctr-lib.mjs')

const text = (...ls) => ls.flat(Infinity).join('\n') + '\n'
const J = (l) => JSON.parse(l)
const OLD_NARROW = '01a0e972-9d87-7ff1-be2f-23687e355bc9', OLD_WIDE = '01a0e81f-1c1d-7422-9a0f-af38eabd85cc'
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

clause('clause 1e — clearTook: a narrow pane whose continue line wraps the old session id onto the next line took; the wide pane\'s one-line form took (S4)',
  clearTook(F.NARROW_BEFORE, F.NARROW_AFTER, OLD_NARROW) === true && clearTook('', F.CLEAR_SCREEN, OLD_WIDE) === true,
  JSON.stringify([clearTook(F.NARROW_BEFORE, F.NARROW_AFTER, OLD_NARROW), clearTook('', F.CLEAR_SCREEN, OLD_WIDE)]))
clause('clause 1e2 — clearTook: a line already there before the send, another session\'s id, no id and the pane before the /clear are not a /clear that took (S4)',
  !clearTook(F.NARROW_AFTER, F.NARROW_AFTER, OLD_NARROW) && !clearTook(F.NARROW_BEFORE, F.NARROW_AFTER, OLD_WIDE) &&
  !clearTook(F.NARROW_BEFORE, F.NARROW_AFTER, '') && !clearTook(F.NARROW_BEFORE, F.NARROW_BEFORE, OLD_NARROW) && !clearTook('', F.CLEAR_SCREEN, OLD_NARROW),
  'a /clear read as taken')
// E10H-R3-B5: Codex wraps the continue line anywhere. NARROW_R18 is the real 45-column capture, its id broken after a
// hyphen. The sweep is derived: the same continue line on one line, wrapped at every width from 40 to 120 three ways
// (at spaces with a word too long cut at the width; after a space or a hyphen; mid-word at exactly the width), each
// after a token line and before the empty composer, as the capture has them.
const OLD_R18 = '01a0ea5c-7200-70c2-9556-138eea3f9cde'
const LINE_R18 = `To continue this session, run codex resume, then select Identify doctrine session metadata (${OLD_R18})`
const greedy = (tokens, w) => {
  const out = []
  let cur = ''
  for (let t of tokens) {
    if ((cur + t).trimEnd().length <= w) { cur += t; continue }
    if (cur) out.push(cur.trimEnd())
    while (t.length > w) { out.push(t.slice(0, w)); t = t.slice(w) }
    cur = t
  }
  return [...out, cur.trimEnd()].join('\n')
}
const WRAPS = {
  space: (s, w) => greedy(s.match(/[^ ]+ ?/g), w),
  hyphen: (s, w) => greedy(s.match(/[^ -]+[ -]?|[ -]/g), w),
  hard: (s, w) => s.match(new RegExp(`.{1,${w}}`, 'g')).join('\n'),
}
const sweep = Object.entries(WRAPS).flatMap(([how, wrap]) => Array.from({ length: 81 }, (_, i) => 40 + i)
  .map((w) => ({ how, w, pane: `Token usage: total=139,195 input=135,309 (+ 1,730,304\ncached) output=3,886\n${wrap(LINE_R18, w)}\n\n› Ask Codex to do anything\n` })))
clause('clause 1e3 — clearTook and composerEmpty on the real 45-column pane whose continue line breaks the old session id after a hyphen: the /clear took, and the composer is empty (E10H-R3-B5)',
  clearTook('', F.NARROW_R18, OLD_R18) === true && composerEmpty(F.NARROW_R18, OLD_R18) === true && clearTook(F.NARROW_R18, F.NARROW_R18, OLD_R18) === false,
  JSON.stringify([clearTook('', F.NARROW_R18, OLD_R18), composerEmpty(F.NARROW_R18, OLD_R18)]))
const missed = sweep.filter((c) => !(clearTook('', c.pane, OLD_R18) === true && composerEmpty(c.pane, OLD_R18) === true))
clause('clause 1e4 — clearTook and composerEmpty on the continue line wrapped at every width from 40 to 120, at spaces, after hyphens and mid-word: each took with an empty composer (E10H-R3-B5)',
  sweep.length === 243 && missed.length === 0, JSON.stringify(missed.slice(0, 5).map((c) => [c.how, c.w])))

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

const W = { poll: 10, idle: 100, max: 10000 }
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
const base = { host: 'codex', stage: 'clear', active: true, pausedSinceClaim: false, pane: idle, oldSession: 'old', grew: false, restore: null, waited: 0, notIdle: 0, sessionWait: 0, resumes: 0, firstTurn: false, times: T }
const ts = (o) => typerStep({ ...base, ...o })
clause('clause 1j — Codex typerStep before /clear is Claude Code\'s: idle, unfocused, the old session and nothing new clears; focused waits; typing is R16',
  ts({}).act === 'clear' && ts({ pane: { ...idle, focused: true } }).act === 'wait' && ts({ grew: true }).code === 'R16' && !ts({}).cycle,
  JSON.stringify(ts({})))
clause('clause 1j2 — Codex typerStep after /clear: the pane not showing the continue line waits, then pauses with R18 naming the old session and never resumes (clear 1, resume 0, E8-D28 through the table)',
  ts({ stage: 'resume', took: false, waited: 100 }).act === 'wait' && ts({ stage: 'resume', took: false, waited: 500 }).code === 'R18' &&
  ts({ stage: 'resume', took: false, waited: 500 }).reason === '/clear did not take: session old still running' && !ts({ stage: 'resume', took: false, waited: 500 }).cycle,
  JSON.stringify(ts({ stage: 'resume', took: false, waited: 500 })))
clause('clause 1j3 — Codex typerStep after /clear: a pane that could not be read pauses with R17; the continue line seen resumes and carries the cycle flag once; focused waits with it (Q6)',
  ts({ stage: 'resume', took: null }).reason === 'could not type into the pane: herdr could not read the pane' &&
  ts({ stage: 'resume', took: true, composer: true }).act === 'resume' && ts({ stage: 'resume', took: true, composer: true }).cycle === true && !ts({ stage: 'resume', took: true, composer: true, cycled: true }).cycle &&
  ts({ stage: 'resume', took: true, composer: true, pane: { ...idle, focused: true } }).act === 'wait' && ts({ stage: 'resume', took: true, composer: true, pane: { ...idle, focused: true } }).cycle === true,
  JSON.stringify([ts({ stage: 'resume', took: null }), ts({ stage: 'resume', took: true, composer: true })]))
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

// E10H-B1: after the /clear the composer must be empty, and nothing may show the user started the new chat.
const DRAFT = F.NARROW_AFTER.replace('› Ask Codex to do anything', '› my own draft')
const SUBMITTED = F.NARROW_AFTER.replace('› Ask Codex to do anything', '› hello there\n\n• Hi.\n\n› Ask Codex to do anything')
clause('clause 1n — composerEmpty: the new chat\'s placeholder after the continue line is empty; a draft, or a prompt submitted after it, is not; no continue line names nothing (E10H-B1)',
  composerEmpty(F.NARROW_AFTER, OLD_NARROW) === true && composerEmpty(F.CLEAR_SCREEN, OLD_WIDE) === true && composerEmpty(DRAFT, OLD_NARROW) === false &&
  composerEmpty(SUBMITTED, OLD_NARROW) === false && composerEmpty(F.NARROW_BEFORE, OLD_NARROW) === null,
  JSON.stringify([composerEmpty(F.NARROW_AFTER, OLD_NARROW), composerEmpty(DRAFT, OLD_NARROW), composerEmpty(SUBMITTED, OLD_NARROW)]))
clause('clause 1n2 — Codex typerStep after /clear sends no resume line into a draft or after the user started the new chat: a composer that is not empty, a restore file, or herdr naming another session is R16 (E10H-B1)',
  ts({ stage: 'resume', took: true, composer: false }).code === 'R16' && ts({ stage: 'resume', took: true, composer: true, restore: NEW }).code === 'R16' &&
  ts({ stage: 'resume', took: true, composer: true, pane: { ...idle, session: 'new' } }).code === 'R16' &&
  ts({ stage: 'resume', took: false, waited: 100, restore: NEW }).code === 'R16' && ts({ stage: 'resume', took: true, composer: true }).act === 'resume',
  JSON.stringify([ts({ stage: 'resume', took: true, composer: false }), ts({ stage: 'resume', took: true, composer: true, restore: NEW })]))

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
  typerStep({ ...base, host: undefined, stage: 'resume', took: false, waited: 100 }).reason === 'waiting for the restore file', JSON.stringify(typerStep({ ...base, host: undefined, stage: 'resume', waited: 100 })))

// ---------------------------------------------------------------- clause 3: the fixtures carry the defect, no function under test called

clause('clause 3b — without the lib: CELL_RUNNING has a "Script running with cell ID" output and no CommandExecution completion after it; CELL_DONE is one of the same turn',
  F.CELL_RUNNING.some((l) => /Script running with cell ID 6/.test(l)) && !F.CELL_RUNNING.slice(F.CELL_RUNNING.findIndex((l) => /cell ID 6/.test(l))).some((l) => /"CommandExecution"/.test(l)) &&
  J(F.CELL_DONE[0]).payload.turn_id === J(F.CELL_RUNNING.find((l) => /cell ID 6/.test(l))).payload.internal_chat_message_metadata_passthrough.turn_id,
  'cell fixture wrong')
clause('clause 3c — without the lib: API_ERROR ends in a task_complete whose error is internal_server_error and whose last_agent_message is null, after the user\'s prompt',
  J(F.API_ERROR.at(-1)).payload.type === 'task_complete' && J(F.API_ERROR.at(-1)).payload.error.codex_error_info === 'internal_server_error' &&
  J(F.API_ERROR.at(-1)).payload.last_agent_message === null && F.API_ERROR.some((l) => l.includes('reply with the word alpha')), 'api error fixture wrong')
const nl = F.NARROW_AFTER.split('\n'), ci = nl.findIndex((l) => l.includes('To continue this session, run codex resume'))
clause('clause 3d — without the lib: the narrow pane\'s continue line does not hold the old session id and the next line does; the pane before holds no continue line; the wide one holds line and id together',
  ci >= 0 && !nl[ci].includes(OLD_NARROW) && nl[ci + 1].includes(OLD_NARROW) && !F.NARROW_BEFORE.includes('To continue this session') &&
  F.CLEAR_SCREEN.split('\n').some((l) => l.includes('To continue this session, run codex resume') && l.includes(OLD_WIDE)), 'pane fixtures wrong')
const r18 = F.NARROW_R18.split('\n'), r18at = r18.findIndex((l) => l.includes('To continue this session, run codex resume'))
const lineOf = (pane) => pane.split('\n')
clause('clause 3o — without the lib: NARROW_R18 has the continue text, no line holds the old id whole, the line two below its text ends "(01a0ea5c-7200-70c2-" and the next starts "9556-", then a blank line and the placeholder composer; the sweep breaks the id after a hyphen, breaks it mid-word, and splits the continue text itself',
  r18at >= 0 && !r18.some((l) => l.includes(OLD_R18)) && r18[r18at + 1].endsWith('(01a0ea5c-7200-70c2-') && r18[r18at + 2].startsWith('9556-138eea3f9cde)') &&
  !r18[r18at + 3].trim() && r18.slice(r18at).find((l) => l.startsWith('›')) === '› Ask Codex to do anything' &&
  sweep.some((c) => lineOf(c.pane).some((l, i, a) => l.endsWith('-') && /^[0-9a-f]/.test(a[i + 1] ?? '') && !a.some((x) => x.includes(OLD_R18)))) &&
  sweep.some((c) => lineOf(c.pane).some((l, i, a) => /[0-9a-f]$/.test(l) && /^[0-9a-f]/.test(a[i + 1] ?? '') && !a.some((x) => x.includes(OLD_R18)))) &&
  sweep.some((c) => !lineOf(c.pane).some((l) => l.includes('To continue this session, run codex resume'))) &&
  sweep.every((c) => lineOf(c.pane).join('').replace(/\s+/g, '').includes(OLD_R18)),
  'wrapped pane fixtures wrong')
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
clause('clause 3j — without the lib: the draft and submitted panes keep the continue line naming the old session, and their first composer line after it is not the placeholder',
  [DRAFT, SUBMITTED].every((t) => t.includes(OLD_NARROW) && t.split('To continue this session')[1].split('\n').find((l) => l.trim().startsWith('›')).trim() !== '› Ask Codex to do anything') &&
  F.NARROW_AFTER.split('To continue this session')[1].split('\n').find((l) => l.trim().startsWith('›')).trim() === '› Ask Codex to do anything', 'pane fixtures wrong')
process.exit(bad ? 1 : 0)
