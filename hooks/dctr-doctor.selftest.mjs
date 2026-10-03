// Three-clause tamper test for the doctor's verdict (doctorVerdict in dctr-lib.mjs, E10 S12), on observations the
// doctor captured from live runs on both hosts (dctr-doctor.fixtures.json, written by `dctr-doctor.mjs --save`). No
// live host: each tamper edits one captured fact the way a host update would move it. The same three clauses cover
// the summary the doctor prints, the scan of hooks/ and skills/ for account identifiers with the redaction --save
// applies, --save taking no path, and the doctor's cleanup when it is interrupted, which runs the doctor itself under
// a stub herdr and reads /proc for what it left running (Linux).
//   1. each tampered capture makes exactly the signals named for it drift, and the exit code 1;
//   2. the captures as taken drift nothing, every signal for the host is reported, and the exit code is 0;
//   3. each tampered capture really differs from the capture in the fact named, checked without the verdict.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import * as lib from './dctr-lib.mjs'
import { doctorVerdict, doctorExit, DOCTOR_SIGNALS } from './dctr-lib.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }
const caps = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'dctr-doctor.fixtures.json'), 'utf8'))
const copy = (o) => JSON.parse(JSON.stringify(o))
const drifted = (obs) => doctorVerdict(obs).filter((r) => r.ok === false).map((r) => r.code).sort()
const sessionOf = (obs, source) => obs.log.find((e) => e.event === 'SessionStart' && e.source === source)?.session_id
const mark = (e) => String(e.prompt ?? '').includes('(typed by doctrine auto-cycle, not a ruling)')
/** The transcript text with `edit` applied to each line that parses and passes `pick`. */
const editLines = (text, pick, edit) => text.split('\n').map((l) => { let e; try { e = JSON.parse(l) } catch { return l } if (!pick(e)) return l; edit(e); return JSON.stringify(e) }).join('\n')
const lineHas = (text, pick, test) => text.split('\n').some((l) => { try { const e = JSON.parse(l); return pick(e) && test(e) } catch { return false } })
const codexMsg = (role) => (e) => e.type === 'response_item' && e.payload?.type === 'message' && e.payload.role === role
const claudeUsage = (e) => e.type === 'assistant' && Boolean(e.message?.usage)
const renameKey = (o, from, to) => { if (o && from in o) { o[to] = o[from]; delete o[from] } }
// Payload fields each hook row reads: deleting one from every payload of the event drifts that row and no other.
const PAYLOAD_TAMPERS = [['SessionStart', 'E1'], ['UserPromptSubmit', 'E2'], ['Stop', 'E3']].flatMap(([ev, code]) => ['cwd', 'transcript_path'].flatMap((k) =>
  ['codex', 'claude'].map((host) => [`${ev} carries no ${k}`, host, [code], (o) => { o.log.filter((e) => e.event === ev).forEach((e) => { delete e[k]; e.keys = e.keys.filter((x) => x !== k) }) },
    (o) => o.log.filter((e) => e.event === ev).every((e) => !(k in e))])))

// [name, host, codes that must drift, tamper, proof of the defect read without the verdict]
const TAMPERS = [
  ['the host never reached its prompt', 'codex', ['L1'], (o) => { o.launched = false }, (o) => o.launched === false],
  ['SessionStart(clear) carries no transcript_path', 'codex', ['E1'], (o) => { const e = o.log.find((x) => x.event === 'SessionStart' && x.source === 'clear'); delete e.transcript_path; e.keys = e.keys.filter((k) => k !== 'transcript_path') },
    (o) => !('transcript_path' in o.log.find((e) => e.event === 'SessionStart' && e.source === 'clear'))],
  ['a screen covered the composer and was dismissed', 'codex', ['L1'], (o) => { o.covered = { before: '/clear', screen: 'Hooks need review\n1 hook is new or changed.' } }, (o) => Boolean(o.covered)],
  ['UserPromptSubmit carries the prompt expanded, not raw', 'claude', ['E2'], (o) => { o.log.filter((e) => e.event === 'UserPromptSubmit' && !mark(e)).forEach((e) => { e.prompt = `<expanded>${e.prompt}</expanded>` }) },
    (o) => o.log.some((e) => e.event === 'UserPromptSubmit' && e.prompt.startsWith('<expanded>'))],
  ['Stop carries no stop_hook_active', 'codex', ['E3'], (o) => { o.log.filter((e) => e.event === 'Stop').forEach((e) => { delete e.stop_hook_active; e.keys = e.keys.filter((k) => k !== 'stop_hook_active') }) },
    (o) => o.log.filter((e) => e.event === 'Stop').every((e) => !('stop_hook_active' in e))],
  ['SessionEnd never fires for the session at quit', 'claude', ['E4'], (o) => { o.log = o.log.filter((e) => e.event !== 'SessionEnd') },
    (o) => !o.log.some((e) => e.event === 'SessionEnd')],
  ['the prompt gate is not trusted, so it never runs', 'codex', ['G1', 'T1'], (o) => {
    const s0 = sessionOf(o, 'startup'), i = o.log.findIndex((e) => e.event === 'UserPromptSubmit' && mark(e) && e.session_id === s0)
    o.blocked.gated = null
    o.log.splice(i + 1, 0, { event: 'Stop', session_id: s0, transcript_path: o.log[i].transcript_path, cwd: o.log[i].cwd, stop_hook_active: false, keys: ['session_id', 'transcript_path', 'cwd', 'stop_hook_active'] })
  }, (o) => o.blocked.gated === null],
  ['the host ignores the gate\'s block: a turn follows the marked line', 'codex', ['G1'], (o) => {
    const s0 = sessionOf(o, 'startup'), i = o.log.findIndex((e) => e.event === 'UserPromptSubmit' && mark(e) && e.session_id === s0)
    o.log.splice(i + 1, 0, { event: 'Stop', session_id: s0, transcript_path: o.log[i].transcript_path, cwd: o.log[i].cwd, stop_hook_active: false, keys: ['session_id', 'transcript_path', 'cwd', 'stop_hook_active'] })
  }, (o) => o.log.filter((e) => e.event === 'Stop').length === 3],
  ['the cycle hook leaves no sign it ran on Stop', 'claude', ['T1'], (o) => { o.hookLogs = o.hookLogs.split('\n').filter((l) => !/ Stop auto-cycle /.test(l)).join('\n') },
    (o) => !/ Stop auto-cycle /.test(o.hookLogs)],
  ['UserPromptSubmit runs before SessionStart(clear) wrote the restore file', 'codex', ['O1'], (o) => {
    const s1 = sessionOf(o, 'clear'); o.log.filter((e) => e.event === 'UserPromptSubmit' && e.session_id === s1).forEach((e) => { e.restored = null })
  }, (o) => o.log.some((e) => e.event === 'UserPromptSubmit' && e.session_id === sessionOf(o, 'clear') && e.restored === null)],
  ['the marked line after /clear is blocked', 'claude', ['G2'], (o) => {
    const s1 = sessionOf(o, 'clear'); o.passed.gated = { session_id: s1 }; o.log = o.log.filter((e) => !(e.event === 'Stop' && e.session_id === s1))
  }, (o) => !o.log.some((e) => e.event === 'Stop' && e.session_id === sessionOf(o, 'clear'))],
  ['the transcript path no longer names a rollout', 'codex', ['R1'], (o) => { o.transcript.path = o.transcript.path.replace(/rollout-/, 'session-') },
    (o) => !path.basename(o.transcript.path).startsWith('rollout-')],
  ['the transcript lines no longer parse', 'claude', ['R2', 'R3'], (o) => { o.transcript.text = o.transcript.text.split('\n').map((l) => (l ? `v2:${l}` : l)).join('\n') },
    (o) => o.transcript.text.split('\n').filter(Boolean).every((l) => l.startsWith('v2:'))],
  ['token_count events moved their usage', 'codex', ['R3'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"last_token_usage"', '"latest_usage"') },
    (o) => !o.transcript.text.includes('"last_token_usage"')],
  ['task_complete is renamed', 'codex', ['R4'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"task_complete"', '"turn_complete"') },
    (o) => !o.transcript.text.includes('"task_complete"')],
  ['the composer after /clear no longer reads empty', 'codex', ['C1'], (o) => { o.composer.cleared = o.composer.cleared.replaceAll('›', '>') },
    (o) => !o.composer.cleared.includes('›')],
  ['a draft reads as an empty composer', 'codex', ['C2'], (o) => { o.composer.draft = o.composer.cleared },
    (o) => o.composer.draft === o.composer.cleared],
  // C3 reads composer.afterClear, the first pane read after the /clear, which in the capture shows no composer line;
  // one showing a composer line is unobserved, below.
  ['no pane read was taken right after /clear', 'codex', ['C3'], (o) => { delete o.composer.afterClear }, (o) => !('afterClear' in o.composer)],
  ['herdr reports the pane working', 'claude', ['H1'], (o) => { o.pane.agent_status = 'working' }, (o) => o.pane.agent_status === 'working'],
  ['herdr keeps the old session for the pane', 'codex', ['H2'], (o) => { o.pane.agent_session = sessionOf(o, 'startup') },
    (o) => o.pane.agent_session === sessionOf(o, 'startup')],
  ['SessionEnd carries no session_id', 'codex', ['E4'], (o) => { o.log.filter((e) => e.event === 'SessionEnd').forEach((e) => { delete e.session_id }) },
    (o) => o.log.filter((e) => e.event === 'SessionEnd').every((e) => !('session_id' in e))],
  // The watcher's reads (watchedTurn, codexTurnState in dctr-watch.mjs): each event and field name it keys on.
  ['task_started is renamed', 'codex', ['R4'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"task_started"', '"turn_started"') },
    (o) => !o.transcript.text.includes('"task_started"')],
  ['last_agent_message is renamed', 'codex', ['R4'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"last_agent_message"', '"final_message"') },
    (o) => !o.transcript.text.includes('"last_agent_message"')],
  ['the composer placeholder after /clear is reworded', 'codex', ['C1'], (o) => { o.composer.cleared = o.composer.cleared.replaceAll('Ask Codex to do anything', 'What should Codex do?') },
    (o) => !o.composer.cleared.includes('Ask Codex to do anything')],
  ['the draft screen\'s composer line holds other text than the draft', 'codex', ['C2'], (o) => { o.composer.draft = o.composer.draft.replace('› doctor draft, never sent', '› other text, never sent') },
    (o) => o.composer.draft.split('\n').some((l) => l.trim() === '› other text, never sent') && !o.composer.draft.includes('doctor draft, never sent')],
  ['the user message text moved out of content[].text', 'codex', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, codexMsg('user'), (e) => e.payload.content.forEach((c) => renameKey(c, 'text', 'body'))) },
    (o) => !lineHas(o.transcript.text, codexMsg('user'), (e) => e.payload.content.some((c) => 'text' in c))],
  ['token_count drops model_context_window', 'codex', ['R3'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"model_context_window"', '"context_window_tokens"') },
    (o) => !o.transcript.text.includes('"model_context_window"')],
  ['the user entry content moved', 'claude', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.type === 'user', (e) => renameKey(e.message, 'content', 'parts')) },
    (o) => !lineHas(o.transcript.text, (e) => e.type === 'user', (e) => 'content' in e.message)],
  ...['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].map((k) => [`usage drops ${k}`, 'claude', ['R3'],
    (o) => { o.transcript.text = editLines(o.transcript.text, claudeUsage, (e) => renameKey(e.message.usage, k, `${k}_v2`)) },
    (o) => !lineHas(o.transcript.text, claudeUsage, (e) => k in e.message.usage)]),
  ['assistant entries carry no uuid', 'claude', ['R3'], (o) => { o.transcript.text = editLines(o.transcript.text, claudeUsage, (e) => { delete e.uuid }) },
    (o) => !lineHas(o.transcript.text, claudeUsage, (e) => 'uuid' in e)],
  ...PAYLOAD_TAMPERS,
  // R2-B3: every field each row's reader reads, one tamper each where none pinned it.
  ['the assistant reply moved out of content[]', 'codex', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, codexMsg('assistant'), (e) => renameKey(e.payload, 'content', 'parts')) },
    (o) => !lineHas(o.transcript.text, codexMsg('assistant'), (e) => 'content' in e.payload)],
  ['the assistant reply moved out of message.content', 'claude', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.type === 'assistant', (e) => renameKey(e.message, 'content', 'parts')) },
    (o) => !lineHas(o.transcript.text, (e) => e.type === 'assistant', (e) => 'content' in e.message)],
  ['the assistant reply text is empty', 'codex', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, codexMsg('assistant'), (e) => e.payload.content.forEach((c) => { c.text = '' })) },
    (o) => !lineHas(o.transcript.text, codexMsg('assistant'), (e) => e.payload.content.some((c) => c.text))],
  ['the assistant reply text part moved out of text', 'claude', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.type === 'assistant', (e) => e.message.content.forEach((c) => renameKey(c, 'text', 'body'))) },
    (o) => !lineHas(o.transcript.text, (e) => e.type === 'assistant', (e) => e.message.content.some((c) => 'text' in c))],
  ['the drive stopped on a screen it could not clear', 'claude', ['L1'], (o) => { o.stuck = { before: '/clear', screen: 'a dialog' } }, (o) => Boolean(o.stuck)],
  ['SessionStart(clear) carries no source', 'codex', ['E1', 'E4', 'G2', 'H2', 'O1'], (o) => { const e = o.log.find((x) => x.event === 'SessionStart' && x.source === 'clear'); delete e.source },
    (o) => !o.log.some((e) => e.event === 'SessionStart' && e.source === 'clear')],
  ['SessionStart(startup) carries no session_id', 'claude', ['E1', 'E2', 'E3', 'G1', 'T1'], (o) => { delete o.log.find((x) => x.event === 'SessionStart' && x.source === 'startup').session_id },
    (o) => !('session_id' in o.log.find((x) => x.event === 'SessionStart' && x.source === 'startup'))],
  ['the clear session keeps the startup session id', 'codex', ['E1', 'H2', 'O1'], (o) => {
    const s0 = sessionOf(o, 'startup'), s1 = sessionOf(o, 'clear'); o.log.filter((e) => e.session_id === s1).forEach((e) => { e.session_id = s0 }) },
    (o) => sessionOf(o, 'startup') === sessionOf(o, 'clear')],
  ['UserPromptSubmit carries no prompt', 'codex', ['E2'], (o) => { o.log.filter((e) => e.event === 'UserPromptSubmit' && !mark(e)).forEach((e) => { delete e.prompt }) },
    (o) => o.log.filter((e) => e.event === 'UserPromptSubmit').some((e) => !('prompt' in e))],
  ['UserPromptSubmit carries the prompt expanded, not raw', 'codex', ['E2'], (o) => { o.log.filter((e) => e.event === 'UserPromptSubmit' && !mark(e)).forEach((e) => { e.prompt = `<expanded>${e.prompt}</expanded>` }) },
    (o) => o.log.some((e) => e.event === 'UserPromptSubmit' && e.prompt.startsWith('<expanded>'))],
  ['Stop carries stop_hook_active as a string', 'claude', ['E3'], (o) => { o.log.filter((e) => e.event === 'Stop').forEach((e) => { e.stop_hook_active = String(e.stop_hook_active) }) },
    (o) => o.log.filter((e) => e.event === 'Stop').every((e) => typeof e.stop_hook_active === 'string')],
  ['the restore hook leaves no sign it injected', 'codex', ['T1'], (o) => { o.hookLogs = o.hookLogs.split('\n').filter((l) => !/SessionStart restore injected/.test(l)).join('\n') },
    (o) => !/SessionStart restore injected/.test(o.hookLogs)],
  ['the cycle hook leaves no sign it ran on UserPromptSubmit', 'claude', ['T1'], (o) => { o.hookLogs = o.hookLogs.split('\n').filter((l) => !/ UserPromptSubmit auto-cycle /.test(l)).join('\n') },
    (o) => !/ UserPromptSubmit auto-cycle /.test(o.hookLogs)],
  // The entry and event names, and the fields beside them, that the transcript readers key on.
  ['token_count events carry no timestamp, the entry id readUsage returns', 'codex', ['R3'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.payload?.type === 'token_count', (e) => { delete e.timestamp }) },
    (o) => !lineHas(o.transcript.text, (e) => e.payload?.type === 'token_count', (e) => 'timestamp' in e)],
  ['token_count renames input_tokens', 'codex', ['R3'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"input_tokens"', '"prompt_tokens"') }, (o) => !o.transcript.text.includes('"input_tokens"')],
  ['response_item is renamed', 'codex', ['R2'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"type":"response_item"', '"type":"response"') }, (o) => !o.transcript.text.includes('"type":"response_item"')],
  ['a message\'s role is renamed', 'codex', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.payload?.type === 'message', (e) => renameKey(e.payload, 'role', 'author')) },
    (o) => !lineHas(o.transcript.text, (e) => e.payload?.type === 'message', (e) => 'role' in e.payload)],
  ['event_msg is renamed', 'codex', ['R3', 'R4'], (o) => { o.transcript.text = o.transcript.text.replaceAll('"type":"event_msg"', '"type":"event"') }, (o) => !o.transcript.text.includes('"type":"event_msg"')],
  ['assistant entries are renamed', 'claude', ['R2', 'R3'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.type === 'assistant', (e) => { e.type = 'agent' }) },
    (o) => !lineHas(o.transcript.text, () => true, (e) => e.type === 'assistant')],
  ['user entries are renamed', 'claude', ['R2'], (o) => { o.transcript.text = editLines(o.transcript.text, (e) => e.type === 'user', (e) => { e.type = 'human' }) },
    (o) => !lineHas(o.transcript.text, () => true, (e) => e.type === 'user')],
  ['usage moved out of message.usage', 'claude', ['R3'], (o) => { o.transcript.text = editLines(o.transcript.text, claudeUsage, (e) => renameKey(e.message, 'usage', 'tokens')) },
    (o) => !lineHas(o.transcript.text, (e) => e.type === 'assistant', (e) => 'usage' in e.message)],
  ['the transcript path names a rollout', 'claude', ['R1'], (o) => { o.transcript.path = path.join(path.dirname(o.transcript.path), 'rollout-1.jsonl') }, (o) => path.basename(o.transcript.path).startsWith('rollout-')],
  ...['codex', 'claude'].map((host) => ['Stop carries no last_assistant_message', host, ['E3'], (o) => { o.log.filter((e) => e.event === 'Stop').forEach((e) => { delete e.last_assistant_message }) },
    (o) => o.log.filter((e) => e.event === 'Stop').every((e) => !('last_assistant_message' in e))]),
  ['the Stop\'s last_assistant_message is empty', 'claude', ['E3'], (o) => { o.log.filter((e) => e.event === 'Stop').forEach((e) => { e.last_assistant_message = '' }) },
    (o) => o.log.filter((e) => e.event === 'Stop').every((e) => e.last_assistant_message === '')],
  ['UserPromptSubmit carries no turn_id', 'codex', ['E2'], (o) => { o.log.filter((e) => e.event === 'UserPromptSubmit').forEach((e) => { delete e.turn_id }) },
    (o) => o.log.filter((e) => e.event === 'UserPromptSubmit').every((e) => !('turn_id' in e))],
  ['Stop carries no turn_id', 'codex', ['E3'], (o) => { o.log.filter((e) => e.event === 'Stop').forEach((e) => { delete e.turn_id }) },
    (o) => o.log.filter((e) => e.event === 'Stop').every((e) => !('turn_id' in e))],
  ['the marked line after /clear is submitted before SessionStart(clear)', 'claude', ['O1'], (o) => {
    const c = o.log.findIndex((e) => e.event === 'SessionStart' && e.source === 'clear'), [e] = o.log.splice(c, 1)
    o.log.splice(o.log.findIndex((x) => x.event === 'UserPromptSubmit' && x.session_id === e.session_id) + 1, 0, e) },
    (o) => o.log.findIndex((e) => e.event === 'UserPromptSubmit' && e.session_id === sessionOf(o, 'clear')) < o.log.findIndex((e) => e.event === 'SessionStart' && e.source === 'clear')],
]

for (const [name, host, want, tamper, proof] of TAMPERS) {
  const o = copy(caps[host]); tamper(o)
  const got = drifted(o)
  clause(`1 ${host}: ${name} drifts ${want.join(', ')} and exits 1`, JSON.stringify(got) === JSON.stringify(want) && doctorExit(doctorVerdict(o)) === 1, `drifted ${JSON.stringify(got)}`)
  clause(`3 ${host}: the capture tampered for "${name}" carries the defect`, proof(o) && !proof(copy(caps[host])), 'the tamper did not change the fact it names')
}

// The codex capture's composer.afterClear is codex-cli 0.160.0's first pane read after a /clear, taken under herdr
// 0.9.3 outside the doctor (the doctor's own capture predates C3): it shows no composer line.
clause('3 codex: the capture\'s first read after /clear shows no › line, read without the verdict',
  typeof caps.codex.composer.afterClear === 'string' && !caps.codex.composer.afterClear.split('\n').some((l) => l.trim().startsWith('›')), JSON.stringify(caps.codex.composer.afterClear))

for (const host of ['codex', 'claude']) {
  const rows = doctorVerdict(caps[host])
  const want = Object.keys(DOCTOR_SIGNALS).filter((c) => host === 'codex' || !DOCTOR_SIGNALS[c].codexOnly)
  clause(`2 ${host}: the capture drifts nothing and exits 0`, rows.every((r) => r.ok) && doctorExit(rows) === 0, JSON.stringify(rows.filter((r) => !r.ok)))
  clause(`2 ${host}: every signal for the host is reported once`, JSON.stringify(rows.map((r) => r.code).sort()) === JSON.stringify(want.sort()), JSON.stringify(rows.map((r) => r.code)))
}
// The summary the doctor prints: its rows, then the hook areas the drive does not exercise, then the verdict, so a
// green run never reads as covering them.
const AREAS = ['PostToolUse', 'SubagentStart', 'SubagentStop', 'SessionEnd sweep', 'PermissionRequest', 'Notification', 'background terminal']
const summary = (results) => (typeof lib.doctorSummary === 'function' ? lib.doctorSummary(results) : '')
const green = summary({ codex: doctorVerdict(caps.codex), claude: doctorVerdict(caps.claude) })
const notEx = green.split('\n').findIndex((l) => /does not exercise/.test(l))
clause('2 the green summary names every area the drive does not exercise, after the rows and before the verdict', notEx > green.split('\n').findIndex((l) => /H2/.test(l)) &&
  AREAS.every((a) => green.split('\n').slice(notEx).join('\n').includes(a)) && /every signal it reads holds/.test(green.split('\n').at(-1)), green)
const drift1 = copy(caps.codex); drift1.pane.agent_status = 'working'
clause('1 a drifted summary names the drift and still lists the areas not exercised', /drift in codex H1/.test(summary({ codex: doctorVerdict(drift1) })) && /does not exercise/.test(summary({ codex: doctorVerdict(drift1) })), summary({ codex: doctorVerdict(drift1) }))
clause('3 the drifted capture differs from the capture in the fact named', drift1.pane.agent_status === 'working' && caps.codex.pane.agent_status !== 'working', 'tamper did nothing')
// C3 on a host whose first read after /clear already shows a composer line: the absent path never ran, so the row is
// unobserved (ok null), neither a pass nor a drift: the exit stays 0 when nothing drifts, and the summary marks the row
// and names it in the verdict, so a green run never reads as covering it.
const SHOWN = [['the empty composer', (o) => o.composer.cleared], ['a composer holding text', (o) => o.composer.draft]]
for (const [name, pick] of SHOWN) {
  const o = copy(caps.codex); o.composer.afterClear = pick(o)
  const rows = doctorVerdict(o), c3 = rows.find((r) => r.code === 'C3'), text = summary({ codex: rows })
  clause(`1 codex: the read right after /clear shows ${name}: C3 is unobserved, neither ok nor drift, the exit 0 and the summary names it`,
    c3?.ok === null && drifted(o).length === 0 && doctorExit(rows) === 0 && /^ {2}unobs {2}C3 /m.test(text) && /not observed: codex C3/.test(text.split('\n').at(-1)),
    JSON.stringify([c3, text.split('\n').filter((l) => /C3|signal|drift/.test(l))]))
  clause(`3 codex: the read tampered to show ${name} has a › line and the capture's has none, read without the verdict`,
    o.composer.afterClear.split('\n').some((l) => l.trim().startsWith('›')) && !caps.codex.composer.afterClear.split('\n').some((l) => l.trim().startsWith('›')), 'tamper did nothing')
}
clause('2 the summary of the capture marks no row unobserved and names none', !/^ {2}unobs /m.test(green) && !/not observed:/.test(green), green)

// Account identifiers never ship: every file under hooks/ and skills/ is scanned. The planted identifiers are
// built at run time, so this file carries none of them.
const at = (a, b) => [a, b].join('@')
const PLANT = { email: at('owner', 'example.net'), creator: 'user-' + 'Q'.repeat(20), account: 'f'.repeat(8) + '-0000-4000-8000-' + 'f'.repeat(12), org: '0'.repeat(8) + '-1111-4111-8111-' + '1'.repeat(12), tool: ['mcp', 'claude_ai_Gmail', 'authenticate'].join('__') }
const plantedLines = [
  { type: 'session_meta', payload: { creator_user_id: PLANT.creator, creator_account_id: PLANT.account, session_id: 's', cwd: '/x' } },
  { type: 'attachment', attachment: { type: 'session_context', context: { userEmail: `The user's email address is ${PLANT.email}.` } } },
  { type: 'attachment', attachment: { type: 'credential_org', organizationUuid: PLANT.org } },
  { type: 'attachment', attachment: { type: 'deferred_tools_delta', addedNames: ['WebFetch', PLANT.tool] } },
  { type: 'attachment', attachment: { type: 'mcp_instructions_delta', addedNames: ['claude.ai Gmail'], addedBlocks: ['## claude.ai Gmail'] } },
  { type: 'auth', tokens: { account_id: PLANT.account } },
]
const planted = copy(caps.claude)
planted.transcript.text = plantedLines.map((l) => JSON.stringify(l)).join('\n') + '\n' + planted.transcript.text
planted.composer = { screen: `signed in as ${PLANT.email}` }
const plantedText = JSON.stringify(planted, null, 1)
const finds = (t) => (typeof lib.privateFindings === 'function' ? lib.privateFindings(t) : [])
const Q = Object.values(PLANT)
clause('1 a capture carrying account identifiers is caught: each planted identifier is named', Q.every((v) => finds(plantedText).some((f) => f.includes(v))) &&
  ['creator_user_id', 'creator_account_id', 'userEmail', 'organizationUuid', 'account_id'].every((k) => finds(plantedText).some((f) => f.includes(k))) &&
  finds(planted.composer.screen).some((f) => f.includes(PLANT.email)), JSON.stringify(finds(plantedText)))
clause('3 the planted capture carries each identifier, read without the scanner', Q.every((v) => plantedText.includes(v)) && plantedText.includes('claude.ai Gmail') && ['creator_user_id', 'creator_account_id', 'userEmail', 'organizationUuid', 'account_id'].every((k) => plantedText.includes(k)), 'the plant is missing an identifier')
const shipped = []
// This file's own directory is hooks/ in the repo and the flat copy the mutation gate runs from, which holds no
// skills/; skills/ is scanned wherever it sits beside it.
const skillsDir = path.join(import.meta.dirname, '..', 'skills')
for (const [top, base] of [['hooks', import.meta.dirname], ...(fs.existsSync(skillsDir) ? [['skills', skillsDir]] : [])]) {
  for (const f of fs.readdirSync(base, { recursive: true })) {
    const full = path.join(base, String(f))
    try { if (fs.statSync(full).isFile()) shipped.push([`${top}/${f}`, fs.readFileSync(full, 'utf8')]) } catch { /* gone */ }
  }
}
const leaks = shipped.flatMap(([f, t]) => finds(t).map((x) => `${f}: ${x}`))
clause('2 no file under hooks/ or skills/ carries an account identifier', typeof lib.privateFindings === 'function' && shipped.length > 20 && leaks.length === 0, JSON.stringify(leaks.slice(0, 8)))
const redacted = typeof lib.doctorRedact === 'function' ? lib.doctorRedact(planted) : planted
clause('1 the capture the doctor saves is redacted: nothing the scanner names is left, and the verdict reads it as it reads the capture',
  finds(JSON.stringify(redacted, null, 1)).length === 0 && !JSON.stringify(redacted).includes('claude.ai Gmail') && JSON.stringify(doctorVerdict(redacted)) === JSON.stringify(doctorVerdict(planted)) &&
  ['codex', 'claude'].every((h) => JSON.stringify(doctorVerdict(typeof lib.doctorRedact === 'function' ? lib.doctorRedact(caps[h]) : null)) === JSON.stringify(doctorVerdict(caps[h]))),
  JSON.stringify(finds(JSON.stringify(redacted, null, 1))))

// A transcript whose JSON lines are indented (a pretty-printed record) is redacted like one whose lines are not.
const indented = copy(planted)
indented.transcript.text = plantedLines.map((l) => '  ' + JSON.stringify(l)).join('\n')
const indentedOut = typeof lib.doctorRedact === 'function' ? JSON.stringify(lib.doctorRedact(indented), null, 1) : ''
clause('1 an indented JSON line is redacted: nothing the scanner names is left', indentedOut !== '' && finds(indentedOut).length === 0, JSON.stringify(finds(indentedOut)))
clause('3 the indented transcript has no line starting with {, and carries every identifier', !/^\{/m.test(indented.transcript.text) && Q.every((v) => indented.transcript.text.includes(v)), 'the indented fixture is not indented')

// --save takes no path: it writes inside the run's scratch dir only. The doctor runs with a PATH holding only
// sh, so a doctor that took the path would stop at its prerequisites, never reaching a host.
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-doctor-st-'))
fs.symlinkSync('/bin/sh', path.join(bin, 'sh'))
const outside = path.join(bin, 'outside.json')
const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'dctr-doctor.mjs'), '--save', outside], { encoding: 'utf8', env: { PATH: bin, HOME: bin, TMPDIR: bin }, timeout: 30000 })
clause('1 --save with a path is refused with the usage line, exit 2, and nothing written there', r.status === 2 && /^usage: .*--save\b(?! FILE)/.test(r.stderr) && !fs.existsSync(outside), `exit ${r.status} ${r.stderr}`)
const r2 = spawnSync(process.execPath, [path.join(import.meta.dirname, 'dctr-doctor.mjs'), '--save'], { encoding: 'utf8', env: { PATH: bin, HOME: bin, TMPDIR: bin }, timeout: 30000 })
clause('2 --save alone is accepted: the doctor goes on to its prerequisites', r2.status === 2 && /cannot run: no herdr on PATH/.test(r2.stderr), `exit ${r2.status} ${r2.stderr}`)
fs.rmSync(bin, { recursive: true, force: true })

// A record the drive never writes (a null transcript line, a field of the wrong type) never makes the verdict throw, which
// the doctor would report as cannot-run.
const odd = []
for (const h of ['codex', 'claude']) {
  for (const line of ['null', '[]', '1', '"s"']) { const o = copy(caps[h]); o.transcript.text = `${line}\n${o.transcript.text}`; odd.push([`${h} transcript line ${line}`, o]) }
  for (const k of ['log', 'blocked', 'passed', 'transcript', 'composer', 'pane', 'hookLogs', 'covered', 'stuck']) for (const v of [null, 5, 'x', [], [null]]) { const o = copy(caps[h]); o[k] = v; odd.push([`${h} ${k} ${JSON.stringify(v)}`, o]) }
  const o = copy(caps[h]); o.log = o.log.map((e) => (e.event === 'Stop' ? null : e)); odd.push([`${h} null log entries`, o])
}
const threw = odd.filter(([, o]) => { try { doctorVerdict(o); return false } catch { return true } }).map(([n]) => n)
clause('2 an observation holding a null or wrongly typed record never throws', threw.length === 0, JSON.stringify(threw))
clause('3 the odd observations hold a null transcript line and null and wrongly typed fields, read without the verdict',
  odd.some(([, o]) => o.transcript?.text?.startsWith?.('null\n')) && odd.some(([, o]) => o.log === null) && odd.length > 80, 'the fixtures lack the odd records')

// R2-B8: an interrupted doctor stops what it started and removes its scratch dir, which holds copies of the user's
// credentials, on a host with /proc and on one without (macOS, here /proc made unreadable to the doctor alone). A stub
// herdr plays the server (a shell holding a child, neither ever stopped by `server stop`, and in one run an orphan
// re-parented away from it), a stub claude answers
// --version, and fake credentials sit in a scratch HOME. The run is interrupted while the drive waits for the host.
// The stub's own settings (STUB_DIR, STUB_SAVE, STUB_ORPHAN) are written into the script, since the doctor passes
// no variable of its caller's through to it; the server records the environment it was started with, and `environ`
// prints the one the stub is run with.
const STUB_HERDR = `#!/bin/sh
echo "$*" >> "$STUB_DIR/calls"
case "$1" in
  --version) echo "herdr 0.0.0-stub" ;;
  environ) env ;;
  server) [ "$2" = stop ] && exit 0
    env > "$STUB_DIR/env"; ls -ld "$XDG_RUNTIME_DIR" > "$STUB_DIR/runtime" 2>&1
    mkdir -p "$XDG_CONFIG_HOME/herdr" && : > "$XDG_CONFIG_HOME/herdr/herdr.sock"
    [ -n "$STUB_SAVE" ] && echo '{}' > "$DCTR_DOCTOR_RUN/observations.json"
    [ -n "$STUB_ORPHAN" ] && ( sleep 301 & )
    echo "$DCTR_DOCTOR_RUN" > "$STUB_DIR/root"; sleep 300 & echo "$$ $!" > "$STUB_DIR/server.pid"; wait ;;
  integration) mkdir -p "$CLAUDE_CONFIG_DIR" && echo '{}' > "$CLAUDE_CONFIG_DIR/settings.json" ;;
  workspace) echo '{"result":{"root_pane":{"pane_id":"p1"}}}' ;;
  *) echo '{}' ;;
esac
`
const NO_PROC = 'data:text/javascript,' + encodeURIComponent(`import fs from 'node:fs'
const gone = (p) => { if (String(p).startsWith('/proc')) { const e = new Error('ENOENT: no /proc'); e.code = 'ENOENT'; throw e } }
const rd = fs.readdirSync, rf = fs.readFileSync
fs.readdirSync = (p, ...a) => { gone(p); return rd(p, ...a) }
fs.readFileSync = (p, ...a) => { gone(p); return rf(p, ...a) }`)
// The system tools the fixtures run, linked into one dir without herdr, codex or claude: a stub whose exec fails must
// not fall through PATH to a real host binary, which would start a real server.
const SYS = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-doctor-sys-'))
for (const d of ['/usr/bin', '/bin']) {
  let names = []
  try { names = fs.readdirSync(d) } catch { /* no such dir on this host */ }
  for (const n of names) if (!['herdr', 'codex', 'claude'].includes(n)) try { fs.symlinkSync(path.join(d, n), path.join(SYS, n)) } catch { /* already linked from the other dir */ }
}
const markerProcs = (root) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((pid) => {
  try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').includes(`DCTR_DOCTOR_RUN=${root}`) } catch { return false }
})
const waitFor = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) { const v = fn(); if (v) return v } return null }
const DECOYS = ['XDG_RUNTIME_DIR', 'XDG_STATE_HOME', 'SSH_AUTH_SOCK', 'FOO_SECRET', 'CLAUDE_CODE_SESSION_ID', 'HERDR_PANE_ID']
const envOf = (text) => Object.fromEntries(String(text ?? '').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
/** One interrupted doctor run: { code, roots (the doctor dirs left under its TMPDIR), left (files left in the run's dir),
 *  procs (processes still carrying the run's marker), started (the stub server ran), stderr, decoys (the decoy
 *  variables the doctor was started with), parent (the environment the stub reads when run with the doctor's own),
 *  seen (the environment the stub server was started with), runtime (ls -ld of its XDG_RUNTIME_DIR) }. */
async function interrupted({ sig = 'SIGINT', args = [], noProc = false, save = false, orphan = false, herdrScript = STUB_HERDR, signal = true, tmpLen = 0, versionSleep = 0 }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-doctor-int-')), stub = path.join(base, 'stub'), bin = path.join(base, 'bin')
  // tmpLen: the doctor's TMPDIR made exactly that many bytes long, under /tmp where the caller's TMPDIR leaves no room.
  const outer = tmpLen && base.length + 2 > tmpLen ? fs.mkdtempSync('/tmp/dctr-doctor-len-') : null
  const tmp = tmpLen ? path.join(outer ?? base, 't'.repeat(tmpLen - (outer ?? base).length - 1)) : path.join(base, 't')
  for (const d of [stub, bin, tmp, path.join(base, 'home', '.claude')]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(bin, 'herdr'), herdrScript.replace('\n', `\nSTUB_DIR='${stub}' STUB_SAVE=${save ? 1 : ''} STUB_ORPHAN=${orphan ? 1 : ''}\n`), { mode: 0o755 })
  // versionSleep: the stub claude marks that --version started, then sleeps that many seconds before it answers.
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\n${versionSleep ? `[ "$1" = --version ] && { : > '${stub}/versioning'; sleep ${versionSleep}; }\n` : ''}echo "0.0.0-stub (Claude Code)"\n`, { mode: 0o755 })
  fs.writeFileSync(path.join(base, 'home', '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'stub', expiresAt: Date.now() + 864e5 } }))
  // Decoys in the doctor's own environment: two XDG dirs outside its scratch dir, and four names its hosts need none of.
  const decoys = Object.fromEntries(DECOYS.map((k) => [k, path.join(base, 'decoy', k)]))
  const env = { PATH: `${bin}:${SYS}`, HOME: path.join(base, 'home'), TMPDIR: tmp, ...decoys }
  const parent = envOf(spawnSync(path.join(bin, 'herdr'), ['environ'], { env, encoding: 'utf8', timeout: 30000 }).stdout)
  const child = spawn(process.execPath, [...(noProc ? ['--import', NO_PROC] : []), path.join(import.meta.dirname, 'dctr-doctor.mjs'), '--host', 'claude', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  child.stdout.resume()
  const exited = new Promise((r) => child.on('exit', (code, signal) => r(code ?? signal)))
  // A versionSleep run is signalled while --version sleeps; window records what was there at that moment.
  const started = signal && Boolean(await waitFor(() => (versionSleep ? fs.existsSync(path.join(stub, 'versioning')) :
    fs.existsSync(path.join(stub, 'server.pid')) && /pane run/.test(fs.readFileSync(path.join(stub, 'calls'), 'utf8'))), 60000))
  const window = versionSleep && started ? { roots: fs.readdirSync(tmp).filter((d) => d.startsWith('dctr-doctor-')).length, server: fs.existsSync(path.join(stub, 'server.pid')) } : null
  // The orphan, seen before the signal: a sleep 301 carrying the run's marker.
  let orphans = 0
  if (started && orphan) await waitFor(() => { const r = fs.readFileSync(path.join(stub, 'root'), 'utf8').trim(); orphans = markerProcs(r).filter((pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('301') } catch { return false } }).length; return orphans }, 20000)
  if (signal && started) child.kill(sig)
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 60000))])
  if (code === 'timeout') child.kill('SIGKILL')
  const roots = fs.readdirSync(tmp).filter((d) => d.startsWith('dctr-doctor-')).map((d) => path.join(tmp, d))
  // The run's dir as the server saw it, so processes are looked for whether or not the dir is still there.
  let runRoot = null
  try { runRoot = fs.readFileSync(path.join(stub, 'root'), 'utf8').trim() || null } catch { /* the server never ran */ }
  const procs = runRoot ? markerProcs(runRoot) : []
  const left = roots.flatMap((r) => fs.readdirSync(r))
  let seen = {}, runtime = ''
  try { seen = envOf(fs.readFileSync(path.join(stub, 'env'), 'utf8')); runtime = fs.readFileSync(path.join(stub, 'runtime'), 'utf8') } catch { /* the server never ran */ }
  // Whatever the doctor left running is stopped here, so a failed clause leaves nothing behind.
  for (const pid of procs) try { process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ }
  try { for (const pid of fs.readFileSync(path.join(stub, 'server.pid'), 'utf8').trim().split(' ')) process.kill(Number(pid), 'SIGKILL') } catch { /* gone */ }
  fs.rmSync(base, { recursive: true, force: true })
  if (outer) fs.rmSync(outer, { recursive: true, force: true })
  return { code, roots, left, procs, started, runRoot, orphans, stderr, decoys, parent, seen, runtime, tmp, window }
}
const RUNS = {
  // The plain run's server also leaves an orphan outside its tree, which only the /proc scan finds.
  plain: { orphan: true }, noProc: { noProc: true }, term: { sig: 'SIGTERM', noProc: true }, keep: { args: ['--keep'] }, save: { args: ['--save'], save: true },
  // A herdr whose interpreter is missing: found on PATH, so the prerequisites pass, and its spawn fails.
  spawnFail: { herdrScript: '#!/nonexistent/sh\n', signal: false },
  // TMPDIRs of 62 and 60 bytes: at 62 herdr's socket path is 100 bytes and Claude Code's, at a 7-digit pid, 105; at 60
  // Claude Code's is 103, the most it binds inside XDG_RUNTIME_DIR.
  long62: { tmpLen: 62, signal: false }, long60: { tmpLen: 60 },
  // Interrupted while the stub claude answers --version, after the scratch dir exists and before the server starts.
  version: { versionSleep: 3 },
}
// A known umask, under which a runtime dir left at the mode mkdir gives it is not 0700.
process.umask(0o022)
const ints = Object.fromEntries(await Promise.all(Object.entries(RUNS).map(async ([k, o]) => [k, await interrupted(o)])))
const show = (r) => JSON.stringify({ ...r, stderr: r.stderr.slice(-300) })
for (const [name, r] of [['plain', ints.plain], ['without /proc', ints.noProc]]) {
  clause(`1 an interrupted doctor (${name}) exits 130, removes its scratch dir and leaves no process carrying its run marker`,
    r.started && r.code === 130 && r.roots.length === 0 && r.procs.length === 0, show(r))
}
clause('1 a SIGTERM without /proc exits 143 with the same cleanup', ints.term.started && ints.term.code === 143 && ints.term.roots.length === 0 && ints.term.procs.length === 0, show(ints.term))
clause('2 an interrupted doctor with --keep keeps its scratch dir and still stops what it started', ints.keep.started && ints.keep.code === 130 && ints.keep.roots.length === 1 && ints.keep.left.length > 1 && ints.keep.procs.length === 0, show(ints.keep))
clause('2 an interrupted doctor with --save keeps observations.json alone', ints.save.started && ints.save.code === 130 && ints.save.roots.length === 1 && JSON.stringify(ints.save.left) === '["observations.json"]' && ints.save.procs.length === 0, show(ints.save))
clause('3 the fixtures\' tool dir holds sh and no herdr, codex or claude, read without the doctor', fs.existsSync(path.join(SYS, 'sh')) && ['herdr', 'codex', 'claude'].every((n) => !fs.existsSync(path.join(SYS, n))), JSON.stringify(fs.readdirSync(SYS).filter((n) => ['herdr', 'codex', 'claude'].includes(n))))
clause('1 a herdr server that cannot be spawned is cannot-run: exit 2, the scratch dir removed', ints.spawnFail.code === 2 && ints.spawnFail.roots.length === 0 && /cannot run/.test(ints.spawnFail.stderr), show(ints.spawnFail))
// What the doctor runs gets an allowlisted environment: no variable of the caller's steers where a host writes.
{
  const p = ints.plain, inside = (v) => Boolean(p.runRoot) && String(v ?? '').startsWith(p.runRoot + '/')
  const SCRATCH = ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR']
  const outside = [...new Set([...SCRATCH, ...Object.keys(p.seen).filter((k) => k.startsWith('XDG_'))])].filter((k) => !inside(p.seen[k]))
  clause('1 the herdr server the doctor starts sees HOME, TMPDIR and every XDG_* dir inside the scratch dir, the runtime dir mode 0700',
    outside.length === 0 && inside(p.runtime.trim().split(' ').at(-1)) && p.runtime.startsWith('drwx------'), JSON.stringify({ outside, runtime: p.runtime, runRoot: p.runRoot }))
  const leaked = DECOYS.filter((k) => Object.values(p.seen).includes(p.decoys[k]) || (!k.startsWith('XDG_') && k in p.seen))
  clause('1 the herdr server the doctor starts sees none of the decoy variables the doctor was started with', Object.keys(p.seen).length > 0 && leaked.length === 0, JSON.stringify(leaked))
  clause('3 the decoy variables were in the environment the doctor was started with, read by the stub run without the doctor',
    DECOYS.every((k) => p.parent[k] === p.decoys[k]) && DECOYS.length === 6, JSON.stringify(p.parent))
}
clause('3 the interrupted runs reached the stub server before the signal, and the --keep run shows the scratch dir held more than one file',
  ['plain', 'noProc', 'term', 'keep', 'save'].every((k) => ints[k].started && ints[k].runRoot) && ints.keep.left.length > 1 && ints.plain.orphans > 0, JSON.stringify(Object.fromEntries(Object.entries(ints).map(([k, r]) => [k, r.started]))))

// Claude Code binds its socket in XDG_RUNTIME_DIR only while the path is at most 103 bytes, so a TMPDIR that pushes it
// past that is cannot-run, while one that brings it to 103 runs.
const atRoot = (tmp, ...p) => Buffer.byteLength(path.join(tmp, 'dctr-doctor-XXXXXX', ...p))
clause('1 a 62-byte TMPDIR is cannot-run, naming Claude Code\'s socket path: exit 2, the scratch dir removed, no server started',
  ints.long62.code === 2 && /cannot run: Claude Code's socket path .* is too long/.test(ints.long62.stderr) && ints.long62.roots.length === 0 && !ints.long62.runRoot, show(ints.long62))
clause('2 a 60-byte TMPDIR runs: the doctor reaches the stub server, and an interrupt exits 130 with the cleanup',
  ints.long60.started && ints.long60.code === 130 && ints.long60.roots.length === 0 && ints.long60.procs.length === 0, show(ints.long60))
clause('3 the 62-byte TMPDIR puts herdr\'s socket at 100 bytes and Claude Code\'s at 105, the 60-byte one Claude Code\'s at 103, read without the doctor',
  Buffer.byteLength(ints.long62.tmp) === 62 && Buffer.byteLength(ints.long60.tmp) === 60 && atRoot(ints.long62.tmp, 'x', 'herdr', 'herdr.sock') === 100 &&
  atRoot(ints.long62.tmp, 'r', 'cc-socks', '9999999.sock') === 105 && atRoot(ints.long60.tmp, 'r', 'cc-socks', '9999999.sock') === 103, JSON.stringify([ints.long62.tmp, ints.long60.tmp]))
// An interrupt between the scratch dir and the herdr server, here while a host answers --version, still cleans up.
clause('1 a doctor interrupted while a host answers --version exits 130 and removes its scratch dir', ints.version.started && ints.version.code === 130 &&
  ints.version.roots.length === 0 && ints.version.procs.length === 0, show(ints.version))
clause('3 the --version run was signalled with the scratch dir made and the stub server not yet started, read without the doctor',
  ints.version.window?.roots === 1 && ints.version.window?.server === false, JSON.stringify(ints.version.window))

clause('2 an empty observation drifts every signal and never throws', (() => { try { return doctorVerdict({ host: 'codex' }).every((r) => !r.ok) } catch { return false } })(), 'it threw or passed a signal')

fs.rmSync(SYS, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
