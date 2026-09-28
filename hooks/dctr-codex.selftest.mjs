// Behavioral tamper test for the Codex host's pure seams in dctr-lib.mjs (E10 e10-hookport, seams S1, S4, S5 and
// the watcher and typer decisions built on them), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-codex.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every rollout, payload and pane text is a real Codex 0.156.1 capture, cut verbatim into dctr-codex.fixtures.mjs
// (each constant names its probe file). A fixture a clause needs in another shape is derived here, and says so.
// Clause 1 pins each decision on those fixtures. Clause 2 runs the known-good cases that must stay quiet. Clause 3
// proves, without calling any function under test, that each fixture carries what clause 1 rests on.

import * as F from './dctr-codex.fixtures.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const {
  hostOf, transcriptEntries, readUsage, gaugeSkip, clearTook, codexObservations, watchedTurn, watchStep, WATCH_TIMES, typerStep,
  pauseReason, pauseCode, samePause, userTyped, CODEX_RESUME_LINE, RESUME_LINE, notifyDecision, cycleDecision,
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
  JSON.stringify(te.entries.map((e) => [e.type, e.isMeta, e.message.content[0].text.slice(0, 30)])))
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

const obs = (t, st = 'done') => codexObservations(text(t), st)
clause('clause 1f — codexObservations: a background terminal whose output carries its session_id and no completion is running, and the session is not idle (S5, B5 sandboxed path)',
  obs(F.BG_RUNNING).backgroundRunning === true && obs(F.BG_RUNNING).idle === false && obs(F.BG_RUNNING).apiError === null, JSON.stringify(obs(F.BG_RUNNING)))
clause('clause 1f2 — codexObservations: once its item_completed names that process_id it is not running, and the ended turn reads idle (S5)',
  obs([F.BG_RUNNING, F.BG_DONE]).backgroundRunning === false && obs([F.BG_RUNNING, F.BG_DONE]).idle === true, JSON.stringify(obs([F.BG_RUNNING, F.BG_DONE])))
clause('clause 1f3 — codexObservations: the tty path\'s running cell is a background terminal until a completion of its turn follows (S5, B5 tty path)',
  obs(F.CELL_RUNNING).backgroundRunning === true && obs([F.CELL_RUNNING, F.CELL_DONE]).backgroundRunning === false, JSON.stringify([obs(F.CELL_RUNNING), obs([F.CELL_RUNNING, F.CELL_DONE])]))
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
const ws = (o) => watchStep({ active: true, turn: { ended: true, newTurn: false }, obs: { backgroundRunning: false, apiError: null, idle: false }, bgAtEnd: false, idleFor: 0, age: 0, times: W, ...o })
clause('clause 1g — watchedTurn: a turn is ended at its task_complete, and a task_started after that end is a new turn',
  watchedTurn(text(F.TUI_TURN.slice(3))).ended === true && watchedTurn(text(F.TUI_TURN.slice(3))).newTurn === false &&
  watchedTurn(text(F.TUI_TURN.slice(3, 10))).ended === false && watchedTurn(text(F.TUI_TURN.slice(3), F.TUI_COMPACT)).newTurn === true,
  JSON.stringify([watchedTurn(text(F.TUI_TURN.slice(3))), watchedTurn(text(F.TUI_TURN.slice(3), F.TUI_COMPACT))]))
clause('clause 1g2 — watchStep: an inactive record or a new turn exits; a running turn waits; an API error is a StopFailure; the terminal that held the Stop exiting re-runs the Stop; idle past the grace is an idle_prompt, inside it waits',
  ws({ active: false }).act === 'exit' && ws({ turn: { ended: true, newTurn: true } }).act === 'exit' && ws({ turn: { ended: false, newTurn: false } }).act === 'wait' &&
  ws({ obs: { apiError: 'internal_server_error' } }).act === 'stopFailure' && ws({ bgAtEnd: true }).act === 'stop' &&
  ws({ bgAtEnd: true, obs: { backgroundRunning: true } }).act === 'wait' && ws({ obs: { idle: true }, idleFor: 150 }).act === 'idle' &&
  ws({ obs: { idle: true }, idleFor: 50 }).act === 'wait' && ws({ age: 20000, turn: { ended: false } }).act === 'exit' && WATCH_TIMES.idle === 60000 &&
  ws({ ready: true }).act === 'exit' && ws({ ready: true, bgAtEnd: true }).act === 'stop' && ws({ ready: true, obs: { backgroundRunning: true } }).act === 'wait',
  JSON.stringify([ws({ bgAtEnd: true }), ws({ obs: { idle: true }, idleFor: 150 })]))

clause('clause 1h — the API-error and different-session pauses name Codex on Codex and Claude as today, and each host\'s text is the same pause (E10 table)',
  pauseReason('R9', 'internal_server_error', 'codex') === 'Codex API error: internal_server_error' && pauseReason('R9', 'x') === 'Claude API error: x' &&
  pauseCode('Codex API error: y') === 'R9' && pauseCode('Claude API error: y') === 'R9' && samePause('Codex API error: a', 'Claude API error: b') &&
  pauseReason('R12', undefined, 'codex') === 'could not cycle: this pane now runs a different Codex session' &&
  pauseReason('R12') === 'could not cycle: this pane now runs a different Claude session' && pauseCode(pauseReason('R12', undefined, 'codex')) === 'R12' && pauseCode(pauseReason('R12')) === 'R12' &&
  notifyDecision('StopFailure', { error: 'internal_server_error', host: 'codex' }) === 'Codex API error: internal_server_error' &&
  notifyDecision('StopFailure', { error: 'rate_limit' }) === 'Claude API error: rate_limit',
  JSON.stringify([pauseReason('R9', 'x', 'codex'), pauseReason('R12', undefined, 'codex')]))
const cd = (host) => cycleDecision({ sessionId: 's', warned: true, ready: true, handoffLanded: true, paneSession: 'other', host })
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
  ts({ stage: 'resume', took: true }).act === 'resume' && ts({ stage: 'resume', took: true }).cycle === true && !ts({ stage: 'resume', took: true, cycled: true }).cycle &&
  ts({ stage: 'resume', took: true, pane: { ...idle, focused: true } }).act === 'wait' && ts({ stage: 'resume', took: true, pane: { ...idle, focused: true } }).cycle === true,
  JSON.stringify([ts({ stage: 'resume', took: null }), ts({ stage: 'resume', took: true })]))
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

const outText = (l) => { const p = J(l).payload; return typeof p.output === 'string' ? p.output : JSON.stringify(p.output) }
clause('clause 3a — without the lib: BG_RUNNING has a call output carrying session_id 40576 and no item_completed naming process_id 40576; BG_DONE is that completion',
  F.BG_RUNNING.some((l) => J(l).payload?.type === 'custom_tool_call_output' && outText(l).includes('\\"session_id\\":40576')) &&
  !F.BG_RUNNING.some((l) => J(l).payload?.item?.process_id === '40576') && J(F.BG_DONE[0]).payload.item.process_id === '40576' && J(F.BG_DONE[0]).payload.item.type === 'CommandExecution',
  'background fixture wrong')
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
const tc = F.TUI_TURN.filter((l) => J(l).payload?.type === 'token_count').map((l) => J(l).payload.info)
clause('clause 3e — without the lib: TUI_TURN\'s last token_count reads input 17503 of a 258400 window; the /compact one reads input 0; the rollout before RUN3\'s first hook marker holds no token_count',
  tc.at(-1).last_token_usage.input_tokens === 17503 && tc.at(-1).model_context_window === 258400 &&
  F.TUI_COMPACT.map(J).find((e) => e.payload?.type === 'token_count').payload.info.last_token_usage.input_tokens === 0 &&
  !firstPost.some((l) => l.includes('"token_count"')) && F.RUN3.some((l) => l.includes('"token_count"')), 'token fixtures wrong')
clause('clause 3f — without the lib: the seat\'s PostToolUse carries agent_id, the main one does not, and both name rollout- transcripts; the Stop of the background turn says nothing of the running process',
  'agent_id' in F.POST_SEAT && !('agent_id' in F.POST_MAIN) && /\/rollout-[^/]*$/.test(F.POST_MAIN.transcript_path) && /\/rollout-[^/]*$/.test(F.POST_SEAT.transcript_path) &&
  !('background_tasks' in F.STOP_BG) && F.STOP_BG.last_assistant_message === 'started', 'payload fixtures wrong')
process.exit(bad ? 1 : 0)
