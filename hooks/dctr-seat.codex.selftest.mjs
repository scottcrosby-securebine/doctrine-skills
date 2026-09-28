// Three-clause tamper test for the seat hook, the renderer and the gate launcher on Codex CLI (E10: E10-D7 to
// E10-D14, and E8-D6's sweep carried to Codex by E10-D22).
//
//   node hooks/dctr-seat.codex.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every fixture below is cut from a real codex-cli 0.156.1 payload or rollout, and each one names its source,
// all under doctrine-skills-project/.doctrine/records/e10-scope/:
//   probe-hooks.txt   the SubagentStart and SubagentStop payloads of a spawn_agent seat (task_name echo_task)
//   probe-rollouts/2026/09/28/rollout-2026-09-28T13-01-37-01a0e81b-4af7-...jsonl   that seat's own rollout
//   probe-rollouts/2026/09/28/rollout-2026-09-28T13-01-29-01a0e81b-2a8b-...jsonl   its parent's rollout
//   probe-clear.txt   the SessionStart payloads (startup, then clear with a new session id) around a TUI /clear
// Paths inside the payloads are rewritten to this suite's temp directory where the hook must read the file; every
// other field is as Codex wrote it. The two session_meta lines carry base_instructions cut to 40 characters and
// only the fields named in hooks/dctr-lib.mjs's Codex block kept, since the originals are some 60 KB of prompt.
//
// Clause 1 breaks something and the check trips, clause 2 is a known-good input that stays quiet, and clause 3
// proves each fixture carries the property its clause depends on without calling the code under test. A
// tripwire `herdr` first on PATH records every call, as in dctr-seat.teardown.selftest.mjs.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  hostOf, seatTranscriptPath, codexTaskName, renderRollout, renderRecord, clearSweepSkip, clearSweepTargets, shellSessionId,
  paneLabel, transcriptPath, restoreSkip,
} from './dctr-lib.mjs'
import { sleepMs } from './dctr-state.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
let bad = 0
const clause = (n, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

// ------------------------------------------------------------------------------------------------ fixtures
// probe-rollouts/.../rollout-2026-09-28T13-01-37-01a0e81b-4af7-7330-a113-bad47ba77c3e.jsonl, line 1, cut as the header says.
const SEAT_META = '{"timestamp":"2026-09-28T13:01:37.949Z","ordinal":0,"type":"session_meta","payload":{"session_id":"01a0e81b-2a8b-7240-b94c-ad2ada7813da","id":"01a0e81b-4af7-7330-a113-bad47ba77c3e","parent_thread_id":"01a0e81b-2a8b-7240-b94c-ad2ada7813da","timestamp":"2026-09-28T13:01:37.915Z","cwd":"/tmp/claude-1000/-home-radadmin-claude-projects-doctrine-skills/63c58dae-27b1-41c6-8951-11e87f30cc74/scratchpad/e10probe/work","originator":"codex_exec","cli_version":"0.156.1","source":{"subagent":{"thread_spawn":{"parent_thread_id":"01a0e81b-2a8b-7240-b94c-ad2ada7813da","depth":1,"agent_path":"/root/echo_task","agent_nickname":"Boyle","agent_role":null}}},"thread_source":"subagent","agent_nickname":"Boyle","agent_path":"/root/echo_task","model_provider":"openai","base_instructions":{"text":"You are Codex, an agent based on GPT-6. "}}}'
// probe-rollouts/.../rollout-2026-09-28T13-01-29-01a0e81b-2a8b-7240-b94c-ad2ada7813da.jsonl, line 1: the parent, no agent_path.
const PARENT_META = '{"timestamp":"2026-09-28T13:01:29.812Z","ordinal":0,"type":"session_meta","payload":{"session_id":"01a0e81b-2a8b-7240-b94c-ad2ada7813da","id":"01a0e81b-2a8b-7240-b94c-ad2ada7813da","timestamp":"2026-09-28T13:01:29.615Z","cwd":"/tmp/claude-1000/-home-radadmin-claude-projects-doctrine-skills/63c58dae-27b1-41c6-8951-11e87f30cc74/scratchpad/e10probe/work","originator":"codex_exec","cli_version":"0.156.1","source":"exec","thread_source":"user","model_provider":"openai","base_instructions":{"text":"You are Codex, an agent based on GPT-6. "}}}'
// The seat rollout, lines 2, 10, 11, 14, 15 and 17, verbatim (line 2 is the task_started event, 15 a token_count).
const SEAT_TASK_STARTED = '{"timestamp":"2026-09-28T13:01:37.950Z","ordinal":1,"type":"event_msg","payload":{"type":"task_started","turn_id":"01a0e81b-4b13-7e01-9757-144fce7e2bae","root_turn_id":"01a0e81b-2b4a-7b93-885d-fe18dcd91f39","started_at":1790600497,"model_context_window":258400,"collaboration_mode_kind":"default"}}'
const SEAT_TASK = '{"timestamp":"2026-09-28T13:01:39.543Z","ordinal":9,"type":"response_item","payload":{"type":"agent_message","id":"amsg_01a0e81b-5157-77c2-8292-e8f39035110e","author":"/root","recipient":"/root/echo_task","content":[{"type":"input_text","text":"Message Type: NEW_TASK\\nTask name: /root/echo_task\\nSender: /root\\nPayload:\\n"},{"type":"encrypted_content","encrypted_content":"gAAAAABqumUxjAv14XQsDxyUntIWonCOKhZ9OzoaJfpLu_drGokm6B39HoSn5tAJtOdXC1C9_2ALmXpg-NIK9M9Ehx8kU15NI-9jRmpAfAz2ugIGwwrS633WZ-yJ1vGjHS64_udGu5XcXtQDflZWzNg313G-ib2RZMqzryHoC00tVE0pgTHfsziWo2S_mvy4Kk686kvas6Ym"}],"internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-4b13-7e01-9757-144fce7e2bae","create_time":1790600499.5431705}}}'
const SEAT_CALL = '{"timestamp":"2026-09-28T13:01:42.418Z","ordinal":10,"type":"response_item","payload":{"type":"custom_tool_call","id":"ctc_02110f1de8cf318b016aba6535ff5087d0819baa06836c5dda","status":"completed","call_id":"call_jUEy1f2dcNuBFV9H9BmIeTCG","name":"exec","input":"text(await tools.exec_command({cmd:\\"echo sub-ok\\"}));\\n","internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-4b13-7e01-9757-144fce7e2bae","create_time":1790600500.2478}}}'
const SEAT_OUTPUT = '{"timestamp":"2026-09-28T13:01:42.538Z","ordinal":13,"type":"response_item","payload":{"type":"custom_tool_call_output","id":"ctco_01a0e81b-5d0a-7201-a4ea-11b6ee1839b0","call_id":"call_jUEy1f2dcNuBFV9H9BmIeTCG","output":[{"type":"input_text","text":"Script completed\\nWall time 0.1 seconds\\nOutput:\\n"},{"type":"input_text","text":"{\\"chunk_id\\":\\"7f0905\\",\\"wall_time_seconds\\":0.000005053,\\"exit_code\\":0,\\"original_token_count\\":2,\\"output\\":\\"sub-ok\\\\n\\"}"}],"internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-4b13-7e01-9757-144fce7e2bae","create_time":1790600502.5386221}},"metadata":{"client_authored":false,"fallback_token_limit_override":12000}}'
const SEAT_TOKENS = '{"timestamp":"2026-09-28T13:01:42.539Z","ordinal":14,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":16781,"cached_input_tokens":7808,"cache_write_input_tokens":0,"output_tokens":23,"reasoning_output_tokens":0,"total_tokens":16804},"last_token_usage":{"input_tokens":16781,"cached_input_tokens":7808,"cache_write_input_tokens":0,"output_tokens":23,"reasoning_output_tokens":0,"total_tokens":16804},"model_context_window":258400}}}'
const SEAT_ANSWER = '{"timestamp":"2026-09-28T13:01:45.302Z","ordinal":16,"type":"response_item","payload":{"type":"message","id":"msg_02110f1de8cf318b016aba65390e1487d0b66f939a39b1c66f","role":"assistant","content":[{"type":"output_text","text":"sub-ok"}],"phase":"final_answer","internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-4b13-7e01-9757-144fce7e2bae","create_time":1790600503.06185,"content_item_kinds":["unknown"]}}}'
// The seat rollout's line 3 opening, a developer message; its skills list is cut to its first sentence.
const SEAT_DEVELOPER = '{"timestamp":"2026-09-28T13:01:37.951Z","ordinal":2,"type":"response_item","payload":{"type":"message","id":"msg_01a0e81b-5148-7d51-8b01-8eb08a219782","role":"developer","content":[{"type":"input_text","text":"<skills_instructions>\\n## Skills\\nA skill is a set of local instructions to follow that is stored in a `SKILL.md` file."}]}}'
// The parent rollout, lines 13 and 16, verbatim: the spawn_agent function call and its output.
const PARENT_SPAWN = '{"timestamp":"2026-09-28T13:01:37.899Z","ordinal":12,"type":"response_item","payload":{"type":"function_call","id":"fc_035ff411ef0448be016aba6530d82487d0ad827eac532dc527","name":"spawn_agent","namespace":"collaboration","arguments":"{\\"task_name\\":\\"echo_task\\",\\"fork_turns\\":\\"none\\",\\"message\\":\\"gAAAAABqumUxjAv14XQsDxyUntIWonCOKhZ9OzoaJfpLu_drGokm6B39HoSn5tAJtOdXC1C9_2ALmXpg-NIK9M9Ehx8kU15NI-9jRmpAfAz2ugIGwwrS633WZ-yJ1vGjHS64_udGu5XcXtQDflZWzNg313G-ib2RZMqzryHoC00tVE0pgTHfsziWo2S_mvy4Kk686kvas6Ym\\"}","call_id":"call_SdAv8h0y9zwTrmpiNTHyAPTW","internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-2b4a-7b93-885d-fe18dcd91f39","create_time":1790600494.49587}}}'
const PARENT_SPAWN_OUT = '{"timestamp":"2026-09-28T13:01:37.994Z","ordinal":15,"type":"response_item","payload":{"type":"function_call_output","id":"fco_01a0e81b-4b4a-72e2-b399-f17cd20c6bb5","call_id":"call_SdAv8h0y9zwTrmpiNTHyAPTW","output":"{\\"task_name\\":\\"/root/echo_task\\"}","internal_chat_message_metadata_passthrough":{"turn_id":"01a0e81b-2b4a-7b93-885d-fe18dcd91f39","create_time":1790600497.9947078}},"metadata":{"client_authored":false,"fallback_token_limit_override":12000}}'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-codex-'))
const ROLLOUTS = path.join(tmp, 'sessions/2026/09/28')
fs.mkdirSync(ROLLOUTS, { recursive: true })
const SEAT_ROLLOUT = path.join(ROLLOUTS, 'rollout-2026-09-28T13-01-37-01a0e81b-4af7-7330-a113-bad47ba77c3e.jsonl')
const PARENT_ROLLOUT = path.join(ROLLOUTS, 'rollout-2026-09-28T13-01-29-01a0e81b-2a8b-7240-b94c-ad2ada7813da.jsonl')
fs.writeFileSync(SEAT_ROLLOUT, [SEAT_META, SEAT_TASK_STARTED, SEAT_DEVELOPER, SEAT_TASK, SEAT_CALL, SEAT_OUTPUT, SEAT_TOKENS, SEAT_ANSWER].join('\n') + '\n')
fs.writeFileSync(PARENT_ROLLOUT, [PARENT_META, PARENT_SPAWN, PARENT_SPAWN_OUT].join('\n') + '\n')

// probe-hooks.txt, events.jsonl: the seat's SubagentStart and SubagentStop, transcript paths moved into `tmp`.
const SESSION = '01a0e81b-2a8b-7240-b94c-ad2ada7813da'
const AGENT = '01a0e81b-4af7-7330-a113-bad47ba77c3e'
const START = { session_id: SESSION, turn_id: '01a0e81b-4b13-7e01-9757-144fce7e2bae', transcript_path: SEAT_ROLLOUT, cwd: tmp, hook_event_name: 'SubagentStart', model: 'gpt-6-astra', permission_mode: 'bypassPermissions', agent_id: AGENT, agent_type: 'default' }
const STOP = { session_id: SESSION, turn_id: '01a0e81b-4b13-7e01-9757-144fce7e2bae', transcript_path: PARENT_ROLLOUT, agent_transcript_path: SEAT_ROLLOUT, cwd: tmp, hook_event_name: 'SubagentStop', model: 'gpt-6-astra', permission_mode: 'bypassPermissions', stop_hook_active: false, agent_id: AGENT, agent_type: 'default', last_assistant_message: 'sub-ok' }
// probe-clear.txt: the TUI's startup SessionStart, and the SessionStart its /clear fired at the next prompt.
const OLD = '01a0e81f-1c1d-7422-9a0f-af38eabd85cc', NEW = '01a0e820-6ccd-75b2-a378-924782ef350d'
const STARTUP = { session_id: OLD, transcript_path: path.join(ROLLOUTS, `rollout-2026-09-28T13-05-48-${OLD}.jsonl`), cwd: tmp, hook_event_name: 'SessionStart', model: 'gpt-6-astra', permission_mode: 'default', source: 'startup' }
const CLEAR = { session_id: NEW, transcript_path: path.join(ROLLOUTS, `rollout-2026-09-28T13-07-14-${NEW}.jsonl`), cwd: tmp, hook_event_name: 'SessionStart', model: 'gpt-6-astra', permission_mode: 'default', source: 'clear' }
// A Claude Code SessionStart after /clear, the shape dctr-restore.selftest.mjs drives: a `.jsonl` transcript, not a rollout.
const CLAUDE_CLEAR = { session_id: 'c1a0de00-0000-4000-8000-000000000001', transcript_path: '/home/u/.claude/projects/-p/c1a0de00-0000-4000-8000-000000000001.jsonl', cwd: tmp, hook_event_name: 'SessionStart', source: 'clear' }
const CLAUDE_START = { hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'ad1a7dbb0d453a08d', agent_type: 'Explore', transcript_path: '/home/u/.claude/projects/-proj/4a9392da-bd72-4f3f-9e18-76a56c437909.jsonl' }

const rec = (line) => JSON.parse(line)

// ------------------------------------------------------------------------------------------------ clause 3: the fixtures
clause('clause 3a — the Codex seat payloads carry a rollout path, SubagentStart its own and SubagentStop the parent\'s, and the Claude one does not',
  path.basename(START.transcript_path).startsWith('rollout-') && !('agent_transcript_path' in START) &&
  path.basename(STOP.transcript_path).startsWith('rollout-') && STOP.agent_transcript_path === START.transcript_path &&
  !path.basename(CLAUDE_START.transcript_path).startsWith('rollout-'),
  JSON.stringify({ start: START.transcript_path, stop: STOP.transcript_path }))
clause('clause 3b — the seat rollout opens with a session_meta whose agent_path is /root/echo_task, and the parent\'s names none',
  rec(SEAT_META).type === 'session_meta' && rec(SEAT_META).payload.agent_path === '/root/echo_task' &&
  rec(PARENT_META).type === 'session_meta' && !('agent_path' in rec(PARENT_META).payload),
  JSON.stringify(rec(SEAT_META).payload.agent_path))
clause('clause 3c — the tool output fixture holds the command output only inside a JSON part, next to fields that are not output',
  JSON.parse(rec(SEAT_OUTPUT).payload.output[1].text).output === 'sub-ok\n' && /chunk_id/.test(rec(SEAT_OUTPUT).payload.output[1].text),
  rec(SEAT_OUTPUT).payload.output[1].text)
clause('clause 3d — the /clear fixture is a SessionStart with source clear and a new session id; the startup one is source startup',
  CLEAR.source === 'clear' && STARTUP.source === 'startup' && CLEAR.session_id !== STARTUP.session_id && !('agent_id' in CLEAR),
  JSON.stringify({ clear: CLEAR.source, startup: STARTUP.source }))
clause('clause 3e — Claude Code\'s renderer shows nothing for a rollout record, so a rollout needs a renderer of its own',
  [SEAT_TASK, SEAT_CALL, SEAT_OUTPUT, SEAT_ANSWER].every((l) => renderRecord(rec(l)) === null),
  [SEAT_TASK, SEAT_CALL, SEAT_OUTPUT, SEAT_ANSWER].map((l) => renderRecord(rec(l))).join(' | '))

// ------------------------------------------------------------------------------------------------ pure decisions
clause('clause 2a — a Claude Code seat reads as Claude, and its transcript path is the one it always was',
  hostOf(CLAUDE_START) === 'claude' && seatTranscriptPath(CLAUDE_START) === transcriptPath(CLAUDE_START.transcript_path, CLAUDE_START.agent_id) &&
  seatTranscriptPath({ ...CLAUDE_START, agent_transcript_path: '/a.jsonl' }) === '/a.jsonl',
  `${hostOf(CLAUDE_START)} ${seatTranscriptPath(CLAUDE_START)}`)
clause('clause 1a — a Codex SubagentStart reads as Codex, and the seat transcript is the rollout it names, not a derived Claude path',
  hostOf(START) === 'codex' && seatTranscriptPath(START) === SEAT_ROLLOUT,
  `${hostOf(START)} ${seatTranscriptPath(START)}`)
clause('clause 1b — a Codex SubagentStop, whose transcript_path is the PARENT\'s rollout, still reads as Codex and names the seat\'s rollout',
  hostOf(STOP) === 'codex' && seatTranscriptPath(STOP) === SEAT_ROLLOUT, `${hostOf(STOP)} ${seatTranscriptPath(STOP)}`)
clause('clause 1c — the seat\'s name is the spawn task_name from its session_meta, and its pane label is paneLabel(agent_type, task_name)',
  codexTaskName(fs.readFileSync(SEAT_ROLLOUT, 'utf8')) === 'echo_task' && paneLabel(START.agent_type, 'echo_task', 1) === 'default · echo_task',
  String(codexTaskName(fs.readFileSync(SEAT_ROLLOUT, 'utf8'))))
clause('clause 1d — no name from a rollout that is the parent\'s, not yet written, or not a rollout',
  codexTaskName(fs.readFileSync(PARENT_ROLLOUT, 'utf8')) === null && codexTaskName('') === null && codexTaskName(null) === null &&
  codexTaskName(SEAT_TASK) === null && codexTaskName('{"type":"session_meta","payload":{"agent_path":"/"}}') === null &&
  codexTaskName(SEAT_META.slice(0, 200)) === null,
  [codexTaskName(fs.readFileSync(PARENT_ROLLOUT, 'utf8')), codexTaskName(''), codexTaskName(SEAT_TASK)].join(','))

const rendered = [SEAT_META, SEAT_TASK_STARTED, SEAT_DEVELOPER, SEAT_TASK, SEAT_CALL, SEAT_OUTPUT, SEAT_TOKENS, SEAT_ANSWER].map((l) => renderRollout(rec(l)))
clause('clause 1e — the renderer shows the seat\'s task, its tool call, the command\'s own output and its answer',
  rendered[3] === '» Message Type: NEW_TASK · Task name: /root/echo_task · Sender: /root · Payload:' &&
  rendered[4] === '→ exec  text(await tools.exec_command({cmd:"echo sub-ok"}));' &&
  rendered[5] === '    Script completed\n    Wall time 0.1 seconds\n    Output:\n    sub-ok' &&
  rendered[7] === 'sub-ok',
  JSON.stringify(rendered))
clause('clause 2b — session metadata, events, token counts and developer messages render nothing',
  rendered[0] === null && rendered[1] === null && rendered[2] === null && rendered[6] === null, JSON.stringify(rendered))
clause('clause 1f — a function call and its string output render as a call and an indented result',
  renderRollout(rec(PARENT_SPAWN)).startsWith('→ spawn_agent  {"task_name":"echo_task"') &&
  renderRollout(rec(PARENT_SPAWN_OUT)) === '    {"task_name":"/root/echo_task"}',
  `${renderRollout(rec(PARENT_SPAWN))} | ${renderRollout(rec(PARENT_SPAWN_OUT))}`)
{
  const long = { type: 'response_item', payload: { type: 'function_call_output', output: Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n') } }
  clause('clause 1g — a long tool result is cut with a marker, never silently',
    /… 7 line\(s\) cut/.test(renderRollout(long)), renderRollout(long))
}

clause('clause 2c — the /clear sweep runs for a Codex SessionStart with source clear',
  clearSweepSkip(CLEAR) === null, String(clearSweepSkip(CLEAR)))
clause('clause 1h — and stands down on startup, on a seat\'s event, and on Claude Code, which sweeps on SessionEnd',
  typeof clearSweepSkip(STARTUP) === 'string' && typeof clearSweepSkip({ ...CLEAR, agent_id: AGENT }) === 'string' &&
  /Claude Code/.test(String(clearSweepSkip(CLAUDE_CLEAR))) && restoreSkip(CLAUDE_CLEAR) === null,
  [clearSweepSkip(STARTUP), clearSweepSkip({ ...CLEAR, agent_id: AGENT }), clearSweepSkip(CLAUDE_CLEAR)].join(' | '))
{
  const sessions = [
    { id: OLD, seats: [{ agent: 'dctr-default-1', sessionPane: 'w1:p1' }] },
    { id: 'another-pane', seats: [{ agent: 'dctr-default-1', sessionPane: 'w1:p9' }] },
    { id: NEW, seats: [{ agent: 'dctr-default-1', sessionPane: 'w1:p1' }] },
    { id: 'no-pane-recorded', seats: [{ agent: 'dctr-default-1' }] },
  ]
  clause('clause 1i — the sweep takes every other session with a marker naming this pane, and no session of another pane or the new one',
    JSON.stringify(clearSweepTargets(sessions, NEW, 'w1:p1')) === JSON.stringify([OLD]), JSON.stringify(clearSweepTargets(sessions, NEW, 'w1:p1')))
  clause('clause 1j — with no pane to match, it takes nothing',
    clearSweepTargets(sessions, NEW, undefined).length === 0 && clearSweepTargets(sessions, NEW, '').length === 0,
    JSON.stringify(clearSweepTargets(sessions, NEW, undefined)))
}
clause('clause 1k — a launcher reads Claude Code\'s session id first, Codex\'s CODEX_SESSION_ID without it, and nothing from neither',
  shellSessionId({ CLAUDE_CODE_SESSION_ID: 'c', CODEX_SESSION_ID: 'x' }) === 'c' && shellSessionId({ CODEX_SESSION_ID: 'x' }) === 'x' &&
  shellSessionId({ CLAUDE_CODE_SESSION_ID: '', CODEX_SESSION_ID: 'x' }) === 'x' && shellSessionId({}) === null,
  [shellSessionId({ CODEX_SESSION_ID: 'x' }), shellSessionId({})].join(','))

// ------------------------------------------------------------------------------------------------ the hook, end to end
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const calls = path.join(tmp, 'calls')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(calls)}
case "$1 $2" in
  "pane get") echo '{"result":{"pane":{"pane_id":"'"$3"'","focused":false}}}'; exit 0 ;;
  "pane layout") echo '{"result":{"layout":{"panes":[{"pane_id":"w1:p1","rect":{"height":56}}]}}}'; exit 0 ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"w1:pS"}}}'; exit 0 ;;
  "tab create") echo '{"result":{"tab":{"tab_id":"w1:tT"},"root_pane":{"pane_id":"w1:pT"}}}'; exit 0 ;;
  *) echo '{"result":{}}'; exit 0 ;;
esac
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const hook = path.join(HERE, 'dctr-seat.mjs')
const env = (extra = {}) => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1', DCTR_VIEW_REQUEST_DIR: '', CLAUDE_CONFIG_DIR: '', ...extra })
const run = (payload, extra) => {
  try { return { code: 0, out: execFileSync('node', [hook], { timeout: 30000, input: JSON.stringify(payload), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: env(extra) }) } }
  catch (e) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
}
const callText = () => { try { return fs.readFileSync(calls, 'utf8') } catch { return '' } }
const stateOf = (sid) => path.join(tmp, `dctr-${sid}`)
const markerOf = (sid, name) => path.join(stateOf(sid), 'seats', `${name}.json`)
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const waitFor = (pred, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { if (pred()) return true; sleepMs(50) } return pred() }

{
  fs.writeFileSync(calls, '')
  const r = run(START)
  const m = readJson(markerOf(SESSION, 'dctr-default-1'))
  clause('clause 1l — a Codex SubagentStart places a pane that renders the seat\'s own rollout and is named paneLabel(agent_type, task_name)',
    r.code === 0 && callText().includes(`pane run w1:pS node '${path.join(HERE, 'dctr-render.mjs')}' '${SEAT_ROLLOUT}'`) &&
    callText().includes('pane rename w1:pS default · echo_task') && m?.label === 'default · echo_task' && m?.file === SEAT_ROLLOUT,
    `${r.out}\ncalls:\n${callText()}\nmarker: ${JSON.stringify(m)}`)
  clause('clause 1m — its marker names the session\'s own pane, which the /clear sweep matches on',
    m?.sessionPane === 'w1:p1' && m?.agent_id === AGENT, JSON.stringify(m))

  fs.writeFileSync(calls, '')
  const s = run(STOP)
  clause('clause 1n — the seat\'s SubagentStop closes that pane and removes its marker',
    s.code === 0 && /^pane close w1:pS$/m.test(callText()) && !fs.existsSync(markerOf(SESSION, 'dctr-default-1')),
    `${s.out}\ncalls:\n${callText()}`)
}
{
  // The renderer, run for real on the fixture rollout: what the seat's pane shows.
  const out = (() => {
    const child = spawn('node', [path.join(HERE, 'dctr-render.mjs'), SEAT_ROLLOUT], { stdio: ['ignore', 'pipe', 'ignore'] })
    let text = ''; child.stdout.on('data', (d) => { text += d })
    return new Promise((resolve) => setTimeout(() => { child.kill(); resolve(text) }, 700))
  })()
  const text = await out
  clause('clause 1o — the renderer, pointed at a Codex rollout, prints the tool call, the command output and the answer, and no session_meta',
    text.includes('→ exec  text(await tools.exec_command') && /^ {4}sub-ok$/m.test(text) && /^sub-ok$/m.test(text) && !text.includes('base_instructions'),
    text)
}
{
  // Contained: DCTR_VIEW_REQUEST_DIR set, so no herdr call at all, and a view request naming the seat.
  fs.writeFileSync(calls, '')
  const views = path.join(tmp, 'views'); fs.mkdirSync(views)
  const r = run(START, { DCTR_VIEW_REQUEST_DIR: views, HERDR_ENV: '', HERDR_PANE_ID: '', HERDR_WORKSPACE_ID: '' })
  const req = readJson(path.join(views, `view-${AGENT.replace(/[^A-Za-z0-9_-]/g, '_')}.json`))
  clause('clause 1p — a contained Codex SubagentStart writes a view request naming the seat and its rollout, and calls herdr zero times',
    r.code === 0 && callText() === '' && JSON.stringify(req ?? {}).includes(SEAT_ROLLOUT),
    `${r.out}\nrequest: ${JSON.stringify(req)}\ncalls: ${callText()}`)
  run(STOP, { DCTR_VIEW_REQUEST_DIR: views, HERDR_ENV: '', HERDR_PANE_ID: '', HERDR_WORKSPACE_ID: '' })
  clause('clause 1q — and its SubagentStop removes the request, still with no herdr call',
    fs.readdirSync(views).length === 0 && callText() === '', `${fs.readdirSync(views).join(',')} | ${callText()}`)
}

// The /clear sweep. The ending chat's session holds a seat whose pane never closed and a gate still running, both
// placed from pane w1:p1; another session holds a marker placed from pane w1:p9.
const gatesDir = path.join(tmp, 'dctr-gates')
const stage = () => {
  for (const sid of [OLD, 'other-pane-session', NEW]) fs.rmSync(stateOf(sid), { recursive: true, force: true })
  fs.rmSync(gatesDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(stateOf(OLD), 'seats'), { recursive: true })
  fs.writeFileSync(markerOf(OLD, 'dctr-default-1'), JSON.stringify({ agent: 'dctr-default-1', agent_id: 'a-old', role: 'default', n: 1, tabId: null, paneId: 'w1:s1', file: '/t/r.jsonl', label: 'default · echo_task', sessionPane: 'w1:p1' }))
  const out = path.join(tmp, 'running-gate.out'); fs.rmSync(`${out}.result`, { force: true })
  fs.writeFileSync(markerOf(OLD, 'dctr-gate-1'), JSON.stringify({ agent: 'dctr-gate-1', role: 'gate', n: 1, tabId: null, paneId: 'w1:g1', file: out, label: 'probe', sessionPane: 'w1:p1' }))
  fs.mkdirSync(path.join(stateOf('other-pane-session'), 'seats'), { recursive: true })
  fs.writeFileSync(markerOf('other-pane-session', 'dctr-default-1'), JSON.stringify({ agent: 'dctr-default-1', agent_id: 'a-other', role: 'default', n: 1, tabId: null, paneId: 'w1:o1', file: '/t/o.jsonl', sessionPane: 'w1:p9' }))
  fs.writeFileSync(calls, '')
}
const movedGate = path.join(gatesDir, `${OLD}.dctr-gate-1.json`)
clause('clause 3f — the staged ending session carries a seat and a running gate naming pane w1:p1, and the other session names w1:p9',
  (stage(), readJson(markerOf(OLD, 'dctr-default-1'))?.sessionPane === 'w1:p1' && readJson(markerOf(OLD, 'dctr-gate-1'))?.sessionPane === 'w1:p1' &&
    !fs.existsSync(`${readJson(markerOf(OLD, 'dctr-gate-1'))?.file}.result`) && readJson(markerOf('other-pane-session', 'dctr-default-1'))?.sessionPane === 'w1:p9'),
  'staging failed')
{
  stage()
  const t0 = Date.now(); const r = run(CLEAR); const took = Date.now() - t0
  clause('clause 1r — a Codex /clear closes the ending chat\'s seat pane and moves its running gate, never closing the gate',
    r.code === 0 && /^pane close w1:s1$/m.test(callText()) && !/close w1:g1/.test(callText()) && readJson(movedGate)?.paneId === 'w1:g1',
    `${r.out}\ncalls:\n${callText()}\nmoved: ${JSON.stringify(readJson(movedGate))}`)
  clause('clause 1s — the ending chat\'s state directory goes, and another pane\'s session is untouched',
    !fs.existsSync(stateOf(OLD)) && fs.existsSync(markerOf('other-pane-session', 'dctr-default-1')) && !/w1:o1/.test(callText()),
    `old: ${fs.existsSync(stateOf(OLD))}; calls: ${callText()}`)
  clause('clause 1t — inside SessionEnd\'s budget: the hook exits under 1,500 ms', took < 1500, `took ${took}ms`)
}
{
  stage()
  const r = run(STARTUP)
  clause('clause 2d — a startup SessionStart sweeps nothing and calls herdr zero times',
    r.code === 0 && callText() === '' && fs.existsSync(markerOf(OLD, 'dctr-default-1')), `${r.out}\ncalls: ${callText()}`)
  stage()
  const c = run(CLAUDE_CLEAR)
  clause('clause 2e — a Claude Code SessionStart after /clear sweeps nothing and calls herdr zero times',
    c.code === 0 && callText() === '' && fs.existsSync(markerOf(OLD, 'dctr-default-1')), `${c.out}\ncalls: ${callText()}`)
  stage()
  const n = run(CLEAR, { HERDR_PANE_ID: 'w1:p7' })
  clause('clause 2f — a /clear in another pane sweeps nothing of this pane\'s sessions',
    n.code === 0 && !/close/.test(callText()) && fs.existsSync(markerOf(OLD, 'dctr-default-1')), `${n.out}\ncalls: ${callText()}`)
}
{
  // E8-D6's K1 through the table: the ending session's lock held by a live process at /clear.
  stage()
  fs.mkdirSync(path.join(stateOf(OLD), 'placement.lock')); fs.writeFileSync(path.join(stateOf(OLD), 'placement.lock', 'pid'), String(process.pid))
  const t0 = Date.now(); const r = run(CLEAR); const took = Date.now() - t0
  clause('clause 1u — with the ending session\'s lock held, the hook still exits under 1,500 ms and closes nothing yet',
    r.code === 0 && took < 1500 && !/close/.test(callText()), `took ${took}ms; calls: ${callText()}`)
  fs.rmSync(path.join(stateOf(OLD), 'placement.lock'), { recursive: true, force: true })
  clause('clause 1v — and once the lock is free, the detached sweep closes the seat and moves the gate within 5 s',
    waitFor(() => /^pane close w1:s1$/m.test(callText()) && fs.existsSync(movedGate) && !fs.existsSync(stateOf(OLD)), 5000),
    `calls: ${callText()}; moved ${fs.existsSync(movedGate)}; old ${fs.existsSync(stateOf(OLD))}`)
}

// ------------------------------------------------------------------------------------------------ the gate launcher from a Codex shell
{
  const gate = path.join(HERE, 'dctr-gate.mjs')
  const out = path.join(tmp, 'g', 'probe.out')
  fs.writeFileSync(calls, '')
  const genv = env({ CLAUDE_CODE_SESSION_ID: '', CODEX_SESSION_ID: SESSION, CODEX_THREAD_ID: SESSION })
  let so = ''
  try { so = execFileSync('node', [gate, 'probe', out, '--', 'true'], { encoding: 'utf8', timeout: 30000, env: genv }) } catch (e) { so = String(e.stdout || '') + String(e.stderr || '') }
  const m = readJson(markerOf(SESSION, 'dctr-gate-1'))
  clause('clause 1w — a gate launched from a Codex shell (CODEX_SESSION_ID, no Claude id) is placed in a pane named from its label, under that session',
    /running in pane w1:pS/.test(so) && /^pane rename w1:pS probe$/m.test(callText()) && m?.label === 'probe' && m?.sessionPane === 'w1:p1',
    `${so}\ncalls:\n${callText()}\nmarker ${JSON.stringify(m)}`)
  fs.rmSync(stateOf(SESSION), { recursive: true, force: true })
  fs.writeFileSync(calls, '')
  const out2 = path.join(tmp, 'g', 'contained.out')
  let so2 = ''
  try { so2 = execFileSync('node', [gate, 'probe', out2, '--', 'true'], { encoding: 'utf8', timeout: 30000, env: { ...genv, DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'views') } }) } catch (e) { so2 = String(e.stdout || '') + String(e.stderr || '') }
  clause('clause 1x — contained, it runs detached, writes exit=0 to its result file and calls herdr zero times',
    /running detached/.test(so2) && waitFor(() => /^exit=0$/m.test((() => { try { return fs.readFileSync(`${out2}.result`, 'utf8') } catch { return '' } })())) && callText() === '',
    `${so2}\ncalls: ${callText()}`)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
