// Behavioral tamper test for the restore, gauge, auto-cycle, watcher and typer hooks run on Codex payloads (E10
// e10-hookport: E8-D1, D1b, D4, D7, D10, D11, D15, D16, D18, D21, D23, D26, D28 through the adaptation table), per
// CLAUDE.md's three clauses.
//
//   node hooks/dctr-codex.hooks.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Every payload and rollout line is a real Codex 0.156.1 capture from dctr-codex.fixtures.mjs, with its session id,
// transcript_path and cwd pointed at the fixture tree (the only fields a case rewrites). Clause 1 drives each hook
// end to end on a fixture tree with a `herdr` PATH shim that logs every call and plays a pane. Clause 2 runs the
// known-good cases that must stay quiet. Clause 3 proves the staged inputs carry what clause 1 rests on, without
// running a hook.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import * as F from './dctr-codex.fixtures.mjs'

// The hooks read the session's background work under the Codex process above them (codexAncestor: the nearest ancestor
// whose argv0 is `codex`), so the suite runs as that process: it runs itself again under argv0 `codex`, and every hook
// and watcher it spawns sits under it, as they sit under Codex (probe P-PROC).
if (path.basename(process.argv0) !== 'codex') {
  const r = spawnSync(process.execPath, process.argv.slice(1), { argv0: 'codex', stdio: 'inherit' })
  if (r.status === null) console.log(`FAIL  the suite under argv0 codex ended without an exit code (${r.signal || r.error?.message})`)
  process.exit(r.status ?? 1)
}

let bad = 0
// A throw outside a clause (a mutated function called while deriving a clause's input) is a FAIL line naming the
// last clause that ran, never an exit with no verdict, which the mutation gate cannot judge (E10H-B8).
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-codex-hooks-'))
// Removed at every exit, pass, fail or throw: a run left about 2,500 inodes, and the mutation gate runs it hundreds of
// times (E10H-R3-B3). The orphaned watchers it started are killed first, so none writes into it while it goes.
const orphans = []
process.on('exit', () => {
  for (const pid of orphans) { try { process.kill(pid) } catch { /* already gone */ } }
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }) } catch (e) { console.log(`FAIL  the suite's temp dir ${tmp} was not removed: ${e.code || e.message}`); process.exitCode = 1 }
})
process.env.TMPDIR = tmp
const { CODEX_RESUME_LINE, LAUNCH_MESSAGE } = await import('./dctr-lib.mjs')
const { stateDir, restoreFile, stopFactsFile, stopHeldFile, processListing } = await import('./dctr-state.mjs')

const here = import.meta.dirname
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jl = (...ls) => ls.flat(Infinity).join('\n') + '\n'
const genv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (repo, ...args) => execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: genv, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- the herdr shim: logs every call, plays one pane

const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
let st = {}; try { st = JSON.parse(fs.readFileSync(process.env.SHIM_STATE, 'utf8')) } catch {}
const save = () => fs.writeFileSync(process.env.SHIM_STATE, JSON.stringify(st))
fs.appendFileSync(process.env.SHIM_LOG, JSON.stringify(args) + '\\n')
if (args[0] === 'pane' && args[1] === 'get') {
  if (st.gone) { process.stderr.write('{"error":{"code":"pane_not_found","message":"no such pane"}}\\n'); process.exit(1) }
  st.gets = (st.gets || 0) + 1; save()
  const session = st.resumed ? st.newSession : st.session
  console.log(JSON.stringify({ result: { pane: { pane_id: args[2], agent_status: st.status || 'done', focused: st.gets <= (st.focusedGets || 0), ...(session ? { agent_session: { value: session } } : {}) } } }))
} else if (args[0] === 'pane' && args[1] === 'read') {
  if (st.readFails) { process.stderr.write('{"error":{"code":"server_error"}}\\n'); process.exit(1) }
  process.stdout.write(st.resumed && st.afterResume ? st.afterResume : st.clearedAt ? (st.after ?? st.before) : st.before)
} else if (args[0] === 'pane' && args[1] === 'run') {
  if (args[3] === '/clear') {
    st.clearedAt = Date.now()
    // The user submits a prompt in the new chat before the typer's resume line: Codex fires SessionStart, so the
    // restore file and herdr's session name the new chat.
    if (st.userStarts) { st.resumed = true; fs.writeFileSync(st.restoreFile, JSON.stringify({ session_id: st.newSession, transcript_path: st.newTranscript })) }
    save()
  }
  else if (st.onResume === 'write' || st.onResume === 'abort' || st.onResume === 'silent') {
    st.resumed = true; save()
    fs.writeFileSync(st.restoreFile, JSON.stringify({ session_id: st.newSession, transcript_path: st.newTranscript }))
    const at = new Date().toISOString(), msg = (role, text) => JSON.stringify({ timestamp: at, type: 'response_item', payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } })
    // abort: the resume turn interrupted before any answer (st.abortLines, RESUME_ABORTED); silent: no answer yet.
    const lines = st.onResume === 'abort' ? st.abortLines : st.onResume === 'silent' ? [msg('user', args[3])]
      : [...(st.firstLines || []), msg('user', args[3]), msg('user', '<skill>\\n<name>doctrine:doctrine-resume</name>'), msg('assistant', 'Resuming.')]
    fs.appendFileSync(st.newTranscript, lines.join('\\n') + '\\n')
  }
}
process.exit(0)
`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const baseEnv = { ...genv, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, HERDR_PANE_ID: 'wX:p1' }
for (const k of ['HERDR_ENV', 'HERDR_WORKSPACE_ID', 'DCTR_VIEW_REQUEST_DIR', 'DCTR_TYPER_SCRIPT', 'DCTR_WATCH_SCRIPT', 'DCTR_CYCLE_SCRIPT', 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID']) delete baseEnv[k]
// A CLAUDE_PROJECT_DIR naming another directory: a Codex session inherits whatever launched it, and must read its own cwd.
const decoy = path.join(tmp, 'decoy'); fs.mkdirSync(decoy)
baseEnv.CLAUDE_PROJECT_DIR = decoy

// ---------------------------------------------------------------- the fixture tree

function repo(dir) {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q'); write(path.join(dir, 'src.txt'), 'one\n'); write(path.join(dir, '.gitignore'), 'SESSION_MEMORY.md\ndocs/handoffs/\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'init')
  return dir
}
/** A project whose memory file names a handoff naming the record; `lines` follow the on line. */
function project(name, { on = '- auto-cycle: on cap 10 tier 10000', lines = [], state = 'Open' } = {}) {
  const dir = path.join(tmp, 'fx', name), proj = repo(path.join(dir, 'proj'))
  const record = path.join(proj, '.doctrine/records/r.md')
  write(record, ['# e10-fixture record', 'Wrapper: doctrine-code', '', `- State: ${state}`, ...(on ? [on] : []), ...lines, ''].join('\n'))
  write(path.join(proj, 'SESSION_MEMORY.md'), '# Session memory\n\n## Next Session Kickoff\nhandoff: docs/handoffs/h.md | state: open\n')
  write(path.join(proj, 'docs/handoffs/h.md'), 'supersedes: none\nphase: `e10-fixture`, state: Open\nrecord: `.doctrine/records/r.md`\nwrapper: doctrine-code\n\n# Handoff\n')
  return { name, dir, proj, record, shimLog: path.join(dir, 'shim.log'), shimState: path.join(dir, 'shim.json') }
}
const rollout = (f, id, lines) => { const p = path.join(f.dir, 'sessions', `rollout-2026-09-28T18-52-46-${id}.jsonl`); write(p, lines.length ? jl(lines) : ''); return p }
const as = (base, f, id, transcript, more = {}) => ({ ...base, session_id: id, transcript_path: transcript, cwd: f.proj, ...more })
function hook(name, f, payload, env = {}) {
  const r = spawnSync('node', [path.join(here, name)], { input: JSON.stringify(payload), env: { ...baseEnv, SHIM_LOG: f.shimLog, SHIM_STATE: f.shimState, ...env }, encoding: 'utf8', timeout: 30000 })
  let j = null
  try { j = r.stdout ? JSON.parse(r.stdout) : null } catch { /* the clause reports it */ }
  return { code: r.status, out: r.stdout, err: r.stderr, j }
}
/** Background work of the session: a command as Codex runs one, CODEX_SESSION_ID in its environment, under this
 *  process (the suite's Codex). `end` kills it and resolves once it is reaped, so no listing reads it after. */
const work = () => {
  const c = spawn('sleep', ['120'], { env: { ...baseEnv, CODEX_SESSION_ID: 'work' }, stdio: 'ignore' })
  return { pid: c.pid, end: () => new Promise((r) => { if (c.exitCode !== null || c.signalCode !== null) r(); else { c.on('exit', r); c.kill() } }) }
}
const recLines = (f, re) => fs.readFileSync(f.record, 'utf8').split('\n').filter((l) => re.test(l))
const calls = (f) => (fs.existsSync(f.shimLog) ? fs.readFileSync(f.shimLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const shim = (f, st) => write(f.shimState, JSON.stringify(st))

// ---------------------------------------------------------------- clause 1a: restore on SessionStart clear (E8-D1, D1b)

const rs = project('restore')
const rsT = rollout(rs, 'r-new', [])
const rs1 = hook('dctr-restore.mjs', rs, as(F.SS_CLEAR, rs, 'r-new', rsT))
const rsFile = (() => { try { return JSON.parse(fs.readFileSync(restoreFile('wX:p1'), 'utf8')) } catch { return null } })()
clause('clause 1a — restore on a Codex SessionStart clear: the four facts as SessionStart additionalContext under 2,000 characters, read from the payload\'s cwd and not an inherited CLAUDE_PROJECT_DIR, and the restore file carries the new session and its rollout (E8-D1)',
  rs1.code === 0 && rs1.j?.hookSpecificOutput?.hookEventName === 'SessionStart' && rs1.j.hookSpecificOutput.additionalContext.includes(rs.record) &&
  rs1.j.hookSpecificOutput.additionalContext.includes('e10-fixture') && rs1.j.hookSpecificOutput.additionalContext.includes('doctrine:doctrine-code') &&
  rs1.j.hookSpecificOutput.additionalContext.length < 2000 && rsFile?.session_id === 'r-new' && rsFile?.transcript_path === rsT && calls(rs).length === 0,
  `code ${rs1.code} out ${rs1.out} err ${rs1.err} restore ${JSON.stringify(rsFile)}`)
const rsQuiet = [as(F.SS_COMPACT, rs, 'r-c', rsT), as(F.SS_STARTUP, rs, 'r-s', rsT), as(F.SS_CLEAR, rs, 'r-a', rsT, { agent_id: 'a1', agent_type: 'worker' })].map((p) => hook('dctr-restore.mjs', rs, p))
clause('clause 1a2 — restore on Codex: SessionStart compact (the one Codex fires after compaction), startup, and a clear carrying agent_id inject nothing and call no herdr (E8-D1b)',
  rsQuiet.every((r) => r.code === 0 && r.out === '') && calls(rs).length === 0, JSON.stringify(rsQuiet.map((r) => [r.code, r.out, r.err.trim()])))

// ---------------------------------------------------------------- clause 1b: the gauge on PostToolUse (E8-D4, D10, D11, D21, D23)

// The tier sits above the floor (the first reading 17503 plus 65000), so a crossing needs a later, larger reading:
// TUI_NEXT's token_count with its input raised (derived fixture, the only field changed), and a third one larger still.
const gg = project('gauge', { on: '- auto-cycle: on cap 10 tier 90000' })
const up95 = F.TUI_NEXT.map((l) => l.replace('"last_token_usage":{"input_tokens":17501', '"last_token_usage":{"input_tokens":95000'))
const up99 = F.TUI_NEXT.map((l) => l.replace('"last_token_usage":{"input_tokens":17501', '"last_token_usage":{"input_tokens":99000').replace('2026-09-28T18:53:17.141Z', '2026-09-28T18:53:59.000Z'))
const gT = rollout(gg, 'g1', F.TUI_TURN)
const post = (id, t = gT, more = {}) => hook('dctr-gauge.mjs', gg, as(F.POST_MAIN, gg, id, t, more))
const latch = (id) => { try { return JSON.parse(fs.readFileSync(path.join(stateDir(id), 'gauge.json'), 'utf8')) } catch { return null } }
const warned = () => recLines(gg, /^- auto-cycle: warned /)
const g0 = post('g1')
fs.appendFileSync(gT, jl(up95))
const g1 = post('g1'), l1 = latch('g1')
const g2 = post('g1')
fs.appendFileSync(gT, jl(up99))
const g3 = post('g1')
clause('clause 1b — gauge on Codex: below the tier it is silent; the first PostToolUse after a token_count past the tier warns once with the rollout\'s reading and window, as PostToolUse additionalContext, and appends the warned line (E8-D4)',
  g0.code === 0 && g0.out === '' && g1.code === 0 && g1.j?.hookSpecificOutput?.hookEventName === 'PostToolUse' && g1.j.hookSpecificOutput.additionalContext.includes('95000 tokens of a 258400-token context window') &&
  JSON.stringify(warned()) === '["- auto-cycle: warned g1 90000"]' && l1?.lastUuid === '2026-09-28T18:53:17.141Z' && l1?.firstUsed === 17503, `latch ${JSON.stringify(l1)} g0 ${g0.out} out ${g1.out} err ${g1.err} ${JSON.stringify(warned())}`)
clause('clause 1b2 — gauge on Codex: a second PostToolUse after the same token_count is the same batch and stands down silently; a later token_count in the same session warns no second time (E8-D4, E10 table)',
  g2.code === 0 && g2.out === '' && g3.code === 0 && !g3.out.includes('auto-cycle: ready') && warned().length === 1 && latch('g1')?.lastUuid === '2026-09-28T18:53:59.000Z',
  `g2 ${g2.out} g3 ${g3.out} ${JSON.stringify(latch('g1'))}`)
const g2T = rollout(gg, 'g2', F.TUI_TURN)
post('g2', g2T)
fs.appendFileSync(g2T, jl(up95))
const g4 = post('g2', g2T)
clause('clause 1b3 — gauge on Codex: a new session id warns once more, with its own warned line (E8-D4)',
  g4.j?.hookSpecificOutput?.additionalContext.includes('auto-cycle: ready') && warned().length === 2 && warned()[1] === '- auto-cycle: warned g2 90000', `${g4.out} ${JSON.stringify(warned())}`)
const gs = post('g3', gT, { agent_id: 'a1', agent_type: 'worker' })
const gSeat = hook('dctr-gauge.mjs', gg, as(F.POST_SEAT, gg, 'g3', gT))
clause('clause 1b4 — gauge on Codex: a seat\'s PostToolUse (the real payload, agent_id present) stands down with no warning and no latch (E8-D21)',
  gs.out === '' && gSeat.out === '' && latch('g3') === null && warned().length === 2, `${gs.out} ${gSeat.out} ${JSON.stringify(latch('g3'))}`)
const gFirst = rollout(gg, 'g4', F.RUN3.slice(0, F.RUN3.findIndex((l) => l.includes('POST-MARKER'))))
const g5 = post('g4', gFirst)
clause('clause 1b5 — gauge on Codex: a PostToolUse before any token_count (the first tool call, probe A2) is no batch: silent, no latch, no unknown counted',
  g5.code === 0 && g5.out === '' && latch('g4') === null, `${g5.out} ${g5.err} ${JSON.stringify(latch('g4'))}`)
const pctG = project('gauge-pct', { on: '- auto-cycle: on cap 10 tier 5%' })
const pctT = rollout(pctG, 'p1', F.TUI_TURN)
const p1 = hook('dctr-gauge.mjs', pctG, as(F.POST_MAIN, pctG, 'p1', pctT))
const nwG = project('gauge-nowin', { on: '- auto-cycle: on cap 10 tier 60%' })
const nwT = rollout(nwG, 'n1', F.TUI_TURN.map((l) => l.replace(/,"model_context_window":258400/, '')))
const n1 = hook('dctr-gauge.mjs', nwG, as(F.POST_MAIN, nwG, 'n1', nwT))
clause('clause 1b6 — gauge on Codex: a percent tier resolves against the rollout\'s model_context_window (5% of 258400 is 12920, raised to the floor 17503 + 65000), and a rollout with no window reports window unknown (E8-D11 through the table)',
  p1.j?.hookSpecificOutput?.additionalContext.includes('tier 12920 below the floor 82503, raised to the floor') && !p1.j.hookSpecificOutput.additionalContext.includes('auto-cycle: ready') &&
  n1.j?.hookSpecificOutput?.additionalContext.includes('window unknown'), `${p1.out} || ${n1.out}`)
const unG = project('gauge-unknown', { on: '- auto-cycle: on cap 10 tier 90000' })
const unT = rollout(unG, 'u1', [F.TUI_TURN.slice(0, 10), F.TUI_TURN[10].slice(0, 90)])
const u = [1, 2, 3].map(() => hook('dctr-gauge.mjs', unG, as(F.POST_MAIN, unG, 'u1', unT)))
clause('clause 1b7 — gauge on Codex: a rollout whose only token_count is cut mid-line reads unknown three times, and the third warns as unknown with its warned line (E8-D10)',
  u[0].j?.hookSpecificOutput?.additionalContext.includes('unknown (unparseable), reading 1 in a row') && !u[1].out.includes('auto-cycle: ready') &&
  u[2].j?.hookSpecificOutput?.additionalContext.includes('three context readings in a row were unknown') && JSON.stringify(recLines(unG, /warned/)) === '["- auto-cycle: warned u1 unknown"]',
  u.map((r) => r.out).join(' || '))
// E8-D23's session-isolation half: a newer rollout of another session in the same directory, reading far higher.
const isoG = project('gauge-iso', { on: '- auto-cycle: on cap 10 tier 100000' })
const isoT = rollout(isoG, 'i1', F.TUI_TURN)
write(path.join(isoG.dir, 'sessions', 'rollout-2026-09-28T19-00-00-other.jsonl'), jl(F.TUI_TURN.map((l) => l.replace('"input_tokens":17503', '"input_tokens":230000'))))
const iso = hook('dctr-gauge.mjs', isoG, as(F.POST_MAIN, isoG, 'i1', isoT))
clause('clause 1b8 — gauge on Codex reads only the rollout at its own transcript_path: another session\'s newer rollout past the tier leaves it unwarned (E8-D23 through the table)',
  iso.code === 0 && iso.out === '' && latch('i1')?.firstUsed === 17503 && recLines(isoG, /warned/).length === 0, `${iso.out} ${JSON.stringify(latch('i1'))}`)
// Derived: past the last token_count, one tool output line of 700 KB, longer than the gauge's first tail read.
const bigG = project('gauge-big', { on: '- auto-cycle: on cap 10 tier 100000' })
const bigLine = F.TUI_TURN[9].replace(/"output":\[.*\],"internal_chat/, `"output":${JSON.stringify('x'.repeat(700 * 1024))},"internal_chat`)
const bigT = rollout(bigG, 'big1', [F.TUI_TURN, bigLine])
const big = hook('dctr-gauge.mjs', bigG, as(F.POST_MAIN, bigG, 'big1', bigT))
clause('clause 1b10 — gauge on Codex: a token_count further back than the first tail read (a 700 KB tool output after it) is still found: the reading is 17503, not "no token_count yet"',
  big.code === 0 && big.out === '' && latch('big1')?.firstUsed === 17503 && fs.statSync(bigT).size > 700 * 1024 && bigLine.length > 700 * 1024, `${big.out} ${big.err} ${JSON.stringify(latch('big1'))} ${bigLine.length}`)
const offG = project('gauge-off', { on: '- auto-cycle: off' })
const off = hook('dctr-gauge.mjs', offG, as(F.POST_MAIN, offG, 'o1', rollout(offG, 'o1', F.TUI_TURN)))
clause('clause 1b9 — gauge on Codex with auto-cycle off: nothing, and no latch (E8-D4)', off.out === '' && latch('o1') === null, off.out)

// ---------------------------------------------------------------- clause 1c: the auto-cycle hook on Codex events (E8-D7, D16, D18, D26)

const pr = project('perm')
const prT = rollout(pr, 'k1', F.TUI_TURN)
const pr1 = hook('dctr-cycle.mjs', pr, as(F.PERMISSION, pr, 'k1', prT))
clause('clause 1c — a Codex PermissionRequest stands for Notification permission_prompt: the paused line, a herdr notification with the reason and the autocycle token, and no decision printed that could answer the prompt (E8-D18, E8-D26)',
  pr1.code === 0 && JSON.stringify(recLines(pr, /^- auto-cycle paused: /)) === '["- auto-cycle paused: waiting for your permission approval"]' &&
  calls(pr).some((c) => c[0] === 'notification' && c.includes('--body') && String(c[c.indexOf('--body') + 1]).startsWith('waiting for your permission approval')) &&
  calls(pr).some((c) => c[1] === 'report-metadata' && c.includes('autocycle=auto-cycle paused·waiting for your permission approval')) && !/"decision"|permissionDecision/.test(pr1.out),
  `${pr1.out} ${pr1.err} ${JSON.stringify(recLines(pr, /paused/))} ${JSON.stringify(calls(pr))}`)
const pr3 = hook('dctr-cycle.mjs', pr, as(F.PERMISSION, pr, 'k1', prT))
clause('clause 1c1 — a second Codex PermissionRequest while the first\'s paused line stands writes no second line: a permission prompt ends no turn (E8-D18, E8-R31)',
  pr3.code === 0 && recLines(pr, /^- auto-cycle paused: /).length === 1, JSON.stringify(recLines(pr, /paused/)))
const prOff = project('perm-off', { on: '- auto-cycle: off' })
const pr2 = hook('dctr-cycle.mjs', prOff, as(F.PERMISSION, prOff, 'k2', rollout(prOff, 'k2', F.TUI_TURN)))
clause('clause 1c2 — a Codex PermissionRequest with auto-cycle off does nothing (E8-D18)', pr2.out === '' && recLines(prOff, /paused/).length === 0 && calls(prOff).length === 0, pr2.out)

const sf = project('stopfail')
const sf1 = hook('dctr-cycle.mjs', sf, as(F.STOP_MAIN, sf, 'e1', rollout(sf, 'e1', F.API_ERROR), { hook_event_name: 'StopFailure', error: 'internal_server_error', dctr_watch: true }))
clause('clause 1c3 — the StopFailure the watcher hands the hook for a Codex API error writes the paused line naming Codex (E8-D18, E10 table)',
  JSON.stringify(recLines(sf, /^- auto-cycle paused: /)) === '["- auto-cycle paused: Codex API error: internal_server_error"]', `${sf1.out} ${sf1.err}`)

// The Stop's background half (E8-D7 through the table): every other precondition true, a background terminal running.
const stub = path.join(tmp, 'stub.mjs')
fs.writeFileSync(stub, `import fs from 'node:fs'\nfs.appendFileSync(process.env.STUB_LOG, (process.argv[2] ?? fs.readFileSync(0, 'utf8')) + '\\n')\n`)
const bg = project('bg', { lines: ['- auto-cycle: warned b1 10000'] })
write(path.join(stateDir('b1'), 'gauge.json'), JSON.stringify({ session_id: 'b1', warned: true, warnedAt: Date.now() - 60000 }))
const bgT = rollout(bg, 'b1', F.BG_RUNNING)
const bgLog = path.join(bg.dir, 'typer.log')
const stopBg = (more = {}) => hook('dctr-cycle.mjs', bg, as(F.STOP_BG, bg, 'b1', bgT, { last_assistant_message: 'Handoff written.\nauto-cycle: ready', ...more }), { DCTR_TYPER_SCRIPT: stub, STUB_LOG: bgLog })
shim(bg, { session: 'b1' })
// Read inside the try, file name and all: under a mutation the name itself may throw, and a clause must still judge.
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return null } }
const bgWork = work()
const b1 = stopBg()
const facts1 = readJson(() => stopFactsFile('b1')), held1 = readJson(() => stopHeldFile('b1'))
const launches1 = fs.existsSync(bgLog) ? fs.readFileSync(bgLog, 'utf8').trim().split('\n').length : 0
fs.appendFileSync(bgT, jl(F.BG_DONE))
await bgWork.end()
const b2 = stopBg()
const held2 = readJson(() => stopHeldFile('b1'))
await sleep(500)
const launch = (() => { try { return JSON.parse(fs.readFileSync(bgLog, 'utf8').trim().split('\n').at(-1)) } catch { return null } })()
clause('clause 1c4 — a Codex Stop with background work running under its Codex process launches no typer and records it live; once that work has exited the same Stop launches the typer, told the host (E8-D7 through the table, E10H-R3-B4)',
  b1.code === 0 && launches1 === 0 && !(b1.j?.systemMessage || '').includes(LAUNCH_MESSAGE) && facts1?.backgroundEmpty === false &&
  (b2.j?.systemMessage || '').includes(LAUNCH_MESSAGE) && launch?.host === 'codex' && launch?.session === 'b1' && recLines(bg, /paused/).length === 0 && !/"decision"/.test(b1.out + b2.out),
  `b1 ${b1.out} ${b1.err} b2 ${b2.out} ${b2.err} launch ${JSON.stringify(launch)} paused ${JSON.stringify(recLines(bg, /paused/))}`)
// Standards R4-N2: a Codex started with CODEX_SESSION_ID already in its environment hands that value to its hooks, which
// Codex does not overwrite (only the commands it runs get this session's id). With no work running, the Stop hook,
// itself a descendant of Codex carrying the inherited id, must not count as work.
const ih = project('inherited', { lines: ['- auto-cycle: warned i1 10000'] })
write(path.join(stateDir('i1'), 'gauge.json'), JSON.stringify({ session_id: 'i1', warned: true, warnedAt: Date.now() - 60000 }))
shim(ih, { session: 'i1' })
const ihLog = path.join(ih.dir, 'typer.log')
const ih1 = hook('dctr-cycle.mjs', ih, as(F.STOP_BG, ih, 'i1', rollout(ih, 'i1', [F.BG_RUNNING, F.BG_DONE]), { last_assistant_message: 'Handoff written.\nauto-cycle: ready' }),
  { DCTR_TYPER_SCRIPT: stub, STUB_LOG: ihLog, CODEX_SESSION_ID: '01a0eb00-0000-7000-8000-0000000000aa' })
clause('clause 1c9 — a Codex Stop whose hook inherited another CODEX_SESSION_ID from the environment Codex started in, with no work running, is not held by itself: it launches the typer (Standards R4-N2)',
  ih1.code === 0 && (ih1.j?.systemMessage || '').includes(LAUNCH_MESSAGE) && readJson(() => stopHeldFile('i1'))?.held === false, `${ih1.out} ${ih1.err} ${JSON.stringify(readJson(() => stopHeldFile('i1')))}`)
clause('clause 1c8 — a Codex Stop persists its own decision for its turn: held for the running work, then not held once the Stop launched (E10H-R2-B2)',
  held1?.turn === F.STOP_BG.turn_id && held1.held === true && Number.isFinite(held1.at) && held2?.turn === F.STOP_BG.turn_id && held2.held === false,
  `${JSON.stringify(held1)} ${JSON.stringify(held2)}`)
// E10H-B4: the claude -p red team's marker, captured from a real dispatch (REDTEAM_MARKER), in the session's seats with
// its result file not yet written: every other precondition true, the Stop waits; once the result is written, the
// same Stop launches the typer.
const rt = project('redteam', { lines: ['- auto-cycle: warned t1 10000'] })
write(path.join(stateDir('t1'), 'gauge.json'), JSON.stringify({ session_id: 't1', warned: true, warnedAt: Date.now() - 60000 }))
const rtOut = path.join(rt.dir, 'red-team.out')
write(path.join(stateDir('t1'), 'seats', 'dctr-gate-1.json'), JSON.stringify({ ...F.REDTEAM_MARKER, file: rtOut }))
shim(rt, { session: 't1' })
const rtLog = path.join(rt.dir, 'typer.log')
const rtT = rollout(rt, 't1', F.TUI_TURN)
const stopRt = () => hook('dctr-cycle.mjs', rt, as(F.STOP_MAIN, rt, 't1', rtT, { last_assistant_message: 'Handoff written.\nauto-cycle: ready' }), { DCTR_TYPER_SCRIPT: stub, STUB_LOG: rtLog })
const rt1 = stopRt()
const rtHook1 = (() => { try { return fs.readFileSync(path.join(stateDir('t1'), 'hook.log'), 'utf8') } catch { return '' } })()
write(`${rtOut}.result`, 'exit=0\n')
const rt2 = stopRt()
await sleep(500)
clause('clause 1c7 — a Codex Stop with the claude -p red team\'s marker (captured from a real dispatch) and no result file waits on it and launches no typer; once the result file exists the same Stop launches the typer (E10H-B4, E8-D7 through the table)',
  rt1.code === 0 && /Stop decided wait: gate dctr-gate-1 is live/.test(rtHook1) && !(rt1.j?.systemMessage || '').includes(LAUNCH_MESSAGE) &&
  (rt2.j?.systemMessage || '').includes(LAUNCH_MESSAGE) && fs.existsSync(rtLog) && recLines(rt, /paused/).length === 0,
  `rt1 ${rt1.out} ${rt1.err} log ${rtHook1.split('\n').filter((l) => /Stop decided/.test(l)).join(' | ')} rt2 ${rt2.out} ${rt2.err} paused ${JSON.stringify(recLines(rt, /paused/))}`)
const r12 = project('r12', { lines: ['- auto-cycle: warned z1 10000'] })
write(path.join(stateDir('z1'), 'gauge.json'), JSON.stringify({ session_id: 'z1', warned: true, warnedAt: Date.now() - 60000 }))
shim(r12, { session: 'someone-else' })
hook('dctr-cycle.mjs', r12, as(F.STOP_BG, r12, 'z1', rollout(r12, 'z1', [F.BG_RUNNING, F.BG_DONE]), { last_assistant_message: 'auto-cycle: ready' }), { DCTR_TYPER_SCRIPT: stub, STUB_LOG: path.join(r12.dir, 't.log') })
clause('clause 1c5 — a Codex Stop whose pane herdr says runs another session pauses naming a different Codex session (E10 table: a reason naming Claude names Codex)',
  JSON.stringify(recLines(r12, /paused/)) === '["- auto-cycle paused: could not cycle: this pane now runs a different Codex session"]', JSON.stringify(recLines(r12, /paused/)))

const up = project('ups')
const upLog = path.join(up.dir, 'watch.log')
const upT = rollout(up, 'w1', F.TUI_TURN.slice(0, 3))
hook('dctr-cycle.mjs', up, as(F.UPS_MAIN, up, 'w1', upT), { DCTR_WATCH_SCRIPT: stub, STUB_LOG: upLog })
const upOffLog = path.join(up.dir, 'watch-claude.log')
hook('dctr-cycle.mjs', up, { ...as(F.UPS_MAIN, up, 'w2', path.join(up.dir, 'claude.jsonl')) }, { DCTR_WATCH_SCRIPT: stub, STUB_LOG: upOffLog })
const upOff = project('ups-off', { on: '- auto-cycle: off' })
hook('dctr-cycle.mjs', upOff, as(F.UPS_MAIN, upOff, 'w3', rollout(upOff, 'w3', [])), { DCTR_WATCH_SCRIPT: stub, STUB_LOG: path.join(upOff.dir, 'w.log') })
await sleep(300)
const watchArgs = (() => { try { return JSON.parse(fs.readFileSync(upLog, 'utf8').trim()) } catch { return null } })()
clause('clause 1c6 — a Codex UserPromptSubmit while auto-cycle is active starts the watcher on its rollout from the rollout\'s length, told its turn (whose Stop decision it reads, E10H-R2-B2) and the Codex process above the hook (E10H-R3-B4); a Claude Code one and an inactive record start none',
  watchArgs?.session === 'w1' && watchArgs.transcript === upT && watchArgs.from === fs.statSync(upT).size && watchArgs.pane === 'wX:p1' && watchArgs.turn === F.UPS_MAIN.turn_id && watchArgs.codex?.pid === process.pid &&
  !fs.existsSync(upOffLog) && !fs.existsSync(path.join(upOff.dir, 'w.log')), JSON.stringify(watchArgs))

// ---------------------------------------------------------------- clause 1d: the watcher end to end

const WT = JSON.stringify({ poll: 20, idle: 150, max: 5000 })
// Started as the UserPromptSubmit hook starts it, detached from a process that exits at once, so it runs orphaned
// (under pid 1 or a subreaper) and never under the suite's Codex: a watcher is never under Codex (probe P-PROC, the
// detached `sleep 301`), and the live tty run (R3 repair notes) found a retried Stop that looked for Codex above
// itself. Resolves once the watcher has exited.
function watcher(f, id, transcript, from, env = {}, turn = null, codex = { pid: process.pid, start: null }) {
  return new Promise((resolve) => {
    const args = JSON.stringify({ session: id, transcript, cwd: f.proj, project: f.proj, pane: 'wX:p1', from, turn, codex })
    const sh = spawn('sh', ['-c', 'node "$0" "$1" </dev/null >/dev/null 2>&1 & echo $!', path.join(here, 'dctr-watch.mjs'), args],
      { env: { ...baseEnv, SHIM_LOG: f.shimLog, SHIM_STATE: f.shimState, DCTR_WATCH_TIMES: WT, ...env }, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    sh.stdout.on('data', (d) => { out += d })
    // 'close', not 'exit': only once stdout has closed has the pid been read (under load 'exit' came first, the pid
    // read as 0, and the watcher counted as gone before it ran).
    sh.on('close', () => {
      const pid = Number(out.trim())
      if (!pid) { console.log(`FAIL  a watcher for ${id} gave no pid`); bad++; resolve(); return }
      orphans.push(pid)
      const gone = () => { try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] === 'Z' } catch { return true } }
      const t = setInterval(() => { if (gone()) { clearInterval(t); resolve() } }, 20)
    })
  })
}
const we = project('watch-err')
const weT = rollout(we, 'x1', [F.TUI_TURN, F.API_ERROR])
await watcher(we, 'x1', weT, Buffer.byteLength(jl(F.TUI_TURN)))
clause('clause 1d — the watcher, on a turn a provider 500 ended with no Stop, hands the hook a StopFailure: the paused line names the Codex API error and herdr raises its notification (E8-D18, D26 through the table)',
  JSON.stringify(recLines(we, /^- auto-cycle paused: /)) === '["- auto-cycle paused: Codex API error: internal_server_error"]' &&
  calls(we).some((c) => c[0] === 'notification' && String(c[c.indexOf('--body') + 1]).startsWith('Codex API error: internal_server_error')),
  `${JSON.stringify(recLines(we, /paused/))} ${JSON.stringify(calls(we))}`)
const wi = project('watch-idle')
const wiT = rollout(wi, 'y1', F.TUI_TURN)
shim(wi, { session: 'y1', status: 'done' })
hook('dctr-cycle.mjs', wi, as(F.STOP_MAIN, wi, 'y1', wiT, { last_assistant_message: 'alpha' }))
await watcher(wi, 'y1', wiT, Buffer.byteLength(jl(F.TUI_TURN.slice(0, 2))))
clause('clause 1d2 — the watcher, on a turn ended with a prose answer and no ready line while herdr reads done, hands the hook an idle_prompt past the grace: the idle paused line (E8-D18 through the table)',
  JSON.stringify(recLines(wi, /^- auto-cycle paused: /)) === '["- auto-cycle paused: session idle, waiting for you"]', JSON.stringify(recLines(wi, /paused/)))
// A session whose Stop reaches the live-work step (warned, its latch, herdr naming it): the real Stop runs first, as
// Codex runs it before writing the turn's task_complete, and persists that it held.
function heldProject(name, id) {
  const f = project(name, { lines: [`- auto-cycle: warned ${id} 10000`] })
  write(path.join(stateDir(id), 'gauge.json'), JSON.stringify({ session_id: id, warned: true, warnedAt: Date.now() - 60000 }))
  shim(f, { session: id })
  return f
}
const stopNow = (f, id, t, more = {}) => hook('dctr-cycle.mjs', f, as(F.STOP_BG, f, id, t, more), { DCTR_TYPER_SCRIPT: stub, STUB_LOG: path.join(f.dir, 'typer.log') })
const wb = heldProject('watch-bg', 'v1')
const wbT = rollout(wb, 'v1', F.BG_RUNNING)
const wbWork = work()
stopNow(wb, 'v1', wbT)
const wbLog = path.join(wb.dir, 'events.log')
const wbRun = watcher(wb, 'v1', wbT, Buffer.byteLength(jl(F.BG_RUNNING.slice(0, 2))), { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wbLog }, F.STOP_BG.turn_id)
await sleep(400)
const wbBefore = fs.existsSync(wbLog) ? fs.readFileSync(wbLog, 'utf8') : ''
fs.appendFileSync(wbT, jl(F.BG_DONE))
await wbWork.end()
await wbRun
const wbEvents = fs.readFileSync(wbLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
clause('clause 1d3 — the watcher fires nothing while the background work runs, then, once it has exited, hands the hook the Stop again with the turn\'s last message (E8-D7 through the table, E10H-R3-B4)',
  wbBefore === '' && wbEvents[0]?.hook_event_name === 'Stop' && wbEvents[0].last_assistant_message === 'started' && wbEvents[0].stop_hook_active === false && wbEvents[0].session_id === 'v1',
  `${wbBefore} || ${JSON.stringify(wbEvents)}`)
// E10H-R2-B2, the order Codex writes (probe B5b: Stop at 54.324, task_complete at 54.334): the Stop reads the rollout
// before its task_complete, sees the terminal running and holds; the terminal's completion lands next, and the
// task_complete after it. Read at the task_complete, nothing was running; the Stop still held and must be re-run.
const events = (file) => { try { return fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) } catch { return [] } }
// Standards R4-N2, the watcher's half: Codex started with CODEX_SESSION_ID set, so its helpers (a sleep standing in for
// codex-code-mode-host) and the hook and watcher carry that inherited value. The Stop holds for the real work; once
// that exits, the helper carrying the inherited value must not hold the watcher.
const wih = heldProject('watch-inherited', 'v9')
const wihT = rollout(wih, 'v9', F.BG_RUNNING)
const OUTER = { CODEX_SESSION_ID: '01a0eb00-0000-7000-8000-0000000000aa' }
const helper = spawn('sleep', ['120'], { env: { ...baseEnv, ...OUTER }, stdio: 'ignore' })
orphans.push(helper.pid)
const wihWork = work()
hook('dctr-cycle.mjs', wih, as(F.STOP_BG, wih, 'v9', wihT), { DCTR_TYPER_SCRIPT: stub, STUB_LOG: path.join(wih.dir, 'typer.log'), ...OUTER })
const wihHeld = readJson(() => stopHeldFile('v9'))
const wihLog = path.join(wih.dir, 'events.log')
const wihRun = watcher(wih, 'v9', wihT, Buffer.byteLength(jl(F.BG_RUNNING.slice(0, 2))), { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wihLog, ...OUTER }, F.STOP_BG.turn_id)
await sleep(300)
fs.appendFileSync(wihT, jl(F.BG_DONE))
await wihWork.end()
await wihRun
helper.kill()
clause('clause 1d13 — with an inherited CODEX_SESSION_ID on Codex\'s helpers, the hook and the watcher, the Stop holds for the real work only, and once that exits the watcher hands the hook the Stop again (Standards R4-N2)',
  wihHeld?.held === true && events(wihLog)[0]?.hook_event_name === 'Stop', `${JSON.stringify(wihHeld)} ${JSON.stringify(events(wihLog))}`)
const wb2 = heldProject('watch-bg-between', 'v2')
const wb2T = rollout(wb2, 'v2', F.BG_RUNNING.slice(0, -1))
const wb2Work = work()
stopNow(wb2, 'v2', wb2T)
const wb2Held = readJson(() => stopHeldFile('v2'))
await wb2Work.end()
fs.appendFileSync(wb2T, jl(F.BG_DONE, F.BG_RUNNING.at(-1)))
const wb2Log = path.join(wb2.dir, 'events.log')
await watcher(wb2, 'v2', wb2T, Buffer.byteLength(jl(F.BG_RUNNING.slice(0, 2))), { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wb2Log }, F.STOP_BG.turn_id)
const wb2Events = events(wb2Log)
clause('clause 1d6 — the terminal finishing between the Stop\'s read and the task_complete: the Stop held, and the watcher hands the hook the Stop again, though the rollout at the task_complete shows nothing running (E10H-R2-B2, red team R2-B2, Spec N1)',
  wb2Held?.held === true && wb2Events[0]?.hook_event_name === 'Stop' && wb2Events[0].last_assistant_message === 'started' && wb2Events[0].turn_id === F.STOP_BG.turn_id,
  `${JSON.stringify(wb2Held)} ${JSON.stringify(wb2Events)}`)
// E10H-R2-B2 for a live gate (red team R2-N2): the claude -p red team's marker with no result file, a turn ended on the
// ready line with no terminal running; the Stop holds on the gate, and its result file is what re-runs it.
const wgt = heldProject('watch-gate', 'v3')
const wgtOut = path.join(wgt.dir, 'red-team.out')
write(path.join(stateDir('v3'), 'seats', 'dctr-gate-1.json'), JSON.stringify({ ...F.REDTEAM_MARKER, file: wgtOut }))
const readyTurn = F.TUI_TURN.map((l) => l.replace('"last_agent_message":"alpha"', '"last_agent_message":"Handoff written.\\nauto-cycle: ready"'))
const wgtT = rollout(wgt, 'v3', readyTurn)
stopNow(wgt, 'v3', wgtT, { turn_id: 'turn-v3', last_assistant_message: 'Handoff written.\nauto-cycle: ready' })
const wgtLog = path.join(wgt.dir, 'events.log')
const wgtRun = watcher(wgt, 'v3', wgtT, 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wgtLog }, 'turn-v3')
await sleep(400)
const wgtBefore = events(wgtLog)
write(`${wgtOut}.result`, 'exit=0\n')
await wgtRun
const wgtEvents = events(wgtLog)
clause('clause 1d8 — a Stop held on a detached gate: the watcher hands nothing on while the gate is live, even on the ready line, and hands the hook the Stop again once its result file exists (E10H-R2-B2, red team R2-N2)',
  wgtBefore.length === 0 && wgtEvents.length === 1 && wgtEvents[0].hook_event_name === 'Stop' && wgtEvents[0].turn_id === 'turn-v3',
  `${JSON.stringify(wgtBefore)} ${JSON.stringify(wgtEvents)}`)
// E10H-R3-B4 point 3, on probe B5 run 1 (P3-B1): the tty cell whose output reports "running" and that nothing in the
// rollout ever ends. Derived: its turn's task_complete ends on the ready line (the capture ends "started"), and the
// loop is a work process under the suite's Codex. It must end in the typer launching once the loop has exited.
const B5_TURN = '01a0e95a-6186-7120-8a91-6828965a9158', READY = 'Handoff written.\nauto-cycle: ready'
const b5Lines = F.CELL_RUNNING.map((l) => l.replace('"last_agent_message":"started"', `"last_agent_message":${JSON.stringify(READY)}`))
const b5 = heldProject('watch-b5', 'v6')
const b5T = rollout(b5, 'v6', b5Lines)
const b5Work = work()
stopNow(b5, 'v6', b5T, { turn_id: B5_TURN, last_assistant_message: READY })
const b5Held = readJson(() => stopHeldFile('v6'))
const b5Log = path.join(b5.dir, 'typer.log')
const b5Run = watcher(b5, 'v6', b5T, 0, { DCTR_TYPER_SCRIPT: stub, STUB_LOG: b5Log }, B5_TURN)
await sleep(400)
const b5Before = fs.existsSync(b5Log)
fs.appendFileSync(b5T, jl(F.CELL_DONE))
await b5Work.end()
await b5Run
await sleep(300)
const b5Launches = fs.existsSync(b5Log) ? fs.readFileSync(b5Log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
clause('clause 1d11 — probe B5 run 1 on the ready line, its cell reporting running forever: the Stop holds while the loop runs under its Codex process, and once the loop has exited the watcher re-runs the real Stop hook, which launches the typer once; no paused line (E10H-R3-B4, P3-B1)',
  b5Held?.turn === B5_TURN && b5Held.held === true && !b5Before && b5Launches.length === 1 && b5Launches[0].session === 'v6' && b5Launches[0].host === 'codex' && recLines(b5, /paused/).length === 0,
  `${JSON.stringify(b5Held)} ${b5Before} ${JSON.stringify(b5Launches)} ${JSON.stringify(recLines(b5, /paused/))}`)
// The same held Stop, its background work unreadable to the watcher (the Codex process it was told of is gone): past the
// idle grace it hands the hook the unknown, which writes the paused line and alerts; the next turn's Stop reads its own
// listing and holds nothing, whatever the earlier turn could not read.
const b6 = heldProject('watch-unknown', 'v7')
const b6T = rollout(b6, 'v7', b5Lines)
const b6Work = work()
stopNow(b6, 'v7', b6T, { turn_id: B5_TURN, last_assistant_message: READY })
const b6Held = readJson(() => stopHeldFile('v7'))
await b6Work.end()
await watcher(b6, 'v7', b6T, 0, {}, B5_TURN, { pid: 999999999, start: null })
const b6Paused = recLines(b6, /paused/)
stopNow(b6, 'v7', b6T, { turn_id: 'a-later-turn', last_assistant_message: READY })
const b6Later = readJson(() => stopHeldFile('v7'))
const UNKNOWN_LINE = '- auto-cycle paused: could not tell whether background work is still running: the Codex process is gone'
clause('clause 1d12 — a held Stop whose background work the watcher cannot read (its Codex process gone): past the idle grace the hook writes the paused line naming it and herdr raises the notification, whose action names the /clear and the typed resume that clear it; a later turn\'s Stop holds nothing (E10H-R3-B4, E8-D16, E8-D26, E10H-R4-B2)',
  b6Held?.held === true && JSON.stringify(b6Paused) === JSON.stringify([UNKNOWN_LINE]) &&
  calls(b6).some((c) => c[0] === 'notification' && c[c.indexOf('--body') + 1] === `${UNKNOWN_LINE.slice('- auto-cycle paused: '.length)}. check the pane for work still running, then /clear and type resume by hand`) &&
  b6Later?.turn === 'a-later-turn' && b6Later.held === false,
  `${JSON.stringify(b6Held)} ${JSON.stringify(b6Paused)} ${JSON.stringify(b6Later)} ${JSON.stringify(calls(b6).filter((c) => c[0] === 'notification'))}`)
// Spec N2: the user quit Codex and a later session runs in the pane; herdr names that session, so the old watcher ends.
const wos = project('watch-other-session')
shim(wos, { session: 'someone-else', status: 'done' })
const wosLog = path.join(wos.dir, 'events.log')
await watcher(wos, 'v4', rollout(wos, 'v4', F.TUI_TURN), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wosLog })
const wosHook = (() => { try { return fs.readFileSync(path.join(stateDir('v4'), 'hook.log'), 'utf8') } catch { return '' } })()
clause('clause 1d9 — the watcher exits handing nothing on when herdr names another session in its pane (Spec N2)',
  !fs.existsSync(wosLog) && wosHook.includes('exit: herdr names another session in the pane'), `${wosHook} ${events(wosLog).length}`)
// A held fact an earlier turn's Stop left (its turn is not this watcher's) says nothing about this turn: the turn ended
// idle with nothing running, so the watcher raises the idle pause and never re-runs a Stop.
const wst = project('watch-stale-held')
shim(wst, { session: 'v5', status: 'done' })
write(stopHeldFile('v5'), JSON.stringify({ turn: 'an-earlier-turn', held: true, at: 1 }))
const wstLog = path.join(wst.dir, 'events.log')
await watcher(wst, 'v5', rollout(wst, 'v5', F.TUI_TURN), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wstLog }, 'this-turn')
const wstEvents = events(wstLog)
clause('clause 1d10 — a held fact written for another turn is not this turn\'s: the watcher hands on the idle_prompt, never a Stop (E10H-R2-B2)',
  wstEvents.length === 1 && wstEvents[0].hook_event_name === 'Notification' && wstEvents[0].notification_type === 'idle_prompt', JSON.stringify(wstEvents))
const wn = project('watch-new')
const wnLog = path.join(wn.dir, 'events.log')
await watcher(wn, 'q1', rollout(wn, 'q1', [F.TUI_TURN, F.TUI_COMPACT]), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wnLog })
const wo = project('watch-off', { on: '- auto-cycle: off' })
const woLog = path.join(wo.dir, 'events.log')
await watcher(wo, 'q2', rollout(wo, 'q2', F.API_ERROR), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: woLog })
const wr = project('watch-ready')
const wrLog = path.join(wr.dir, 'events.log')
await watcher(wr, 'q3', rollout(wr, 'q3', F.TUI_TURN.map((l) => l.replace('"last_agent_message":"alpha"', '"last_agent_message":"auto-cycle: ready"'))), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: wrLog })
const wg = project('watch-gone')
shim(wg, { gone: true })
const wgT0 = Date.now()
await watcher(wg, 'q4', rollout(wg, 'q4', F.TUI_TURN), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: path.join(wg.dir, 'events.log'), DCTR_WATCH_TIMES: JSON.stringify({ poll: 20, idle: 150, max: 8000 }) })
const wgLog = (() => { try { return fs.readFileSync(path.join(stateDir('q4'), 'hook.log'), 'utf8') } catch { return '' } })()
clause('clause 1d5 — the watcher exits when herdr answers that its pane does not exist, long before its watch ends, handing nothing on',
  wgLog.includes('exit: the pane is gone') && Date.now() - wgT0 < 6000 && !fs.existsSync(path.join(wg.dir, 'events.log')), `${wgLog} ${Date.now() - wgT0}ms`)
// E10H-B9: the TUI closed mid-turn, so the turn never ends; the watcher must still notice its pane is gone.
const wm = project('watch-gone-midturn')
shim(wm, { gone: true })
const wmT0 = Date.now()
await watcher(wm, 'q5', rollout(wm, 'q5', F.TUI_TURN.filter((l) => !l.includes('"task_complete"'))), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: path.join(wm.dir, 'events.log'), DCTR_WATCH_TIMES: JSON.stringify({ poll: 20, idle: 150, max: 8000 }) })
const wmLog = (() => { try { return fs.readFileSync(path.join(stateDir('q5'), 'hook.log'), 'utf8') } catch { return '' } })()
clause('clause 1d7 — the watcher exits when its pane is gone while the turn has not ended (the TUI closed mid-turn), long before its watch ends (E10H-B9)',
  wmLog.includes('exit: the pane is gone') && Date.now() - wmT0 < 6000 && !fs.existsSync(path.join(wm.dir, 'events.log')), `${wmLog} ${Date.now() - wmT0}ms`)
// R4-N2 (round 4 real-environment run): the session ended (SessionEnd removed its state dir) while its watcher still
// ran; the watcher then found its pane gone and logged its exit, which must not re-create the dir.
const wend = project('watch-after-end')
shim(wend, { session: 'q6', status: 'working' })
const wendRun = watcher(wend, 'q6', rollout(wend, 'q6', F.TUI_TURN.filter((l) => !l.includes('"task_complete"'))), 0, { DCTR_CYCLE_SCRIPT: stub, STUB_LOG: path.join(wend.dir, 'events.log'), DCTR_WATCH_TIMES: JSON.stringify({ poll: 20, idle: 150, max: 8000 }) })
await sleep(400)
const wendStarted = fs.existsSync(stateDir('q6'))
fs.rmSync(stateDir('q6'), { recursive: true, force: true })
shim(wend, { gone: true })
await wendRun
clause('clause 1d14 — a watcher whose session ended (its state dir removed) and whose pane is then gone exits without re-creating the session\'s state dir (R4-N2)',
  wendStarted && !fs.existsSync(stateDir('q6')), `started ${wendStarted} dir after ${fs.existsSync(stateDir('q6'))}`)
clause('clause 1d4 — the watcher exits handing nothing on when a new turn has started, when auto-cycle is off, and when the turn ended on the ready line',
  !fs.existsSync(wnLog) && !fs.existsSync(woLog) && !fs.existsSync(wrLog), [wnLog, woLog, wrLog].filter((p) => fs.existsSync(p)).join(' '))

// ---------------------------------------------------------------- clause 1e: the typer on Codex (E8-D15, D28 through the table)

const OLD = '01a0e972-9d87-7ff1-be2f-23687e355bc9'
const TT = JSON.stringify({ poll: 20, idle: 150, restore: 400, session: 400, firstTurn: 300 })
function typerCase(name, st = {}, env = {}) {
  const f = project(`typer-${name}`, { lines: [`- auto-cycle: warned ${OLD} 10000`, '- auto-cycle: ready'] })
  const caseTmp = path.join(f.dir, 'tmp'); fs.mkdirSync(caseTmp)
  const old = rollout(f, OLD, F.TUI_TURN), newT = path.join(f.dir, 'sessions', 'rollout-2026-09-28T19-17-00-new.jsonl')
  write(newT, '')
  const restorePath = path.join(caseTmp, 'dctr-autocycle', 'pane-wX_p1.restored')
  shim(f, { session: OLD, newSession: 'new-1', status: 'done', before: F.NARROW_BEFORE, after: F.NARROW_AFTER, onResume: 'write', restoreFile: restorePath, newTranscript: newT, ...st })
  const args = { pane: 'wX:p1', session: OLD, transcript: old, length: fs.statSync(old).size, record: f.record, hash: 'h0', project: f.proj, n: 1, phase: 'e10-fixture', stopAt: Date.parse('2026-09-28T18:53:00Z'), keyLine: 6, host: 'codex' }
  const r = spawnSync('node', [path.join(here, 'dctr-typer.mjs'), JSON.stringify(args)], { env: { ...baseEnv, TMPDIR: caseTmp, SHIM_LOG: f.shimLog, SHIM_STATE: f.shimState, DCTR_TYPER_TIMES: TT, ...env }, encoding: 'utf8', timeout: 20000 })
  const runs = calls(f).filter((c) => c[1] === 'run')
  return { ...f, code: r.status, calls: calls(f), sends: `${runs.filter((c) => c[3] === '/clear').length},${runs.filter((c) => c[3] === CODEX_RESUME_LINE).length}`,
    paused: recLines(f, /^- auto-cycle paused: /), cycled: recLines(f, /^- auto-cycle: cycle /), otherSends: runs.filter((c) => c[3] !== '/clear' && c[3] !== CODEX_RESUME_LINE) }
}
const td = (c) => `code ${c.code} sends ${c.sends} paused ${JSON.stringify(c.paused)} cycled ${JSON.stringify(c.cycled)} calls ${JSON.stringify(c.calls.map((x) => x.slice(0, 2).join(' ')))}`
const tNormal = typerCase('normal')
const iClear = tNormal.calls.findIndex((c) => c[1] === 'run' && c[3] === '/clear'), iResume = tNormal.calls.findIndex((c) => c[1] === 'run' && c[3] === CODEX_RESUME_LINE)
clause('clause 1e — typer on Codex, normal: the pane read before /clear, /clear once, the pane read again, the $-resume line once, the cycle line, no pause (clear 1, resume 1)',
  tNormal.sends === '1,1' && tNormal.otherSends.length === 0 && JSON.stringify(tNormal.cycled) === '["- auto-cycle: cycle 1 tree h0"]' && tNormal.paused.length === 0 &&
  tNormal.calls.slice(0, iClear).some((c) => c[1] === 'read') && tNormal.calls.slice(iClear, iResume).some((c) => c[1] === 'read'), td(tNormal))
const tNoTake = typerCase('notake', { after: F.NARROW_BEFORE })
clause('clause 1e2 — typer on Codex, the /clear did not take (no continue line appears): no resume sent, no cycle line, paused naming the /clear not taking and the old session id (clear 1, resume 0, E8-D28 through the table)',
  tNoTake.sends === '1,0' && tNoTake.cycled.length === 0 && JSON.stringify(tNoTake.paused) === `["- auto-cycle paused: /clear did not take: session ${OLD} still running"]`, td(tNoTake))
// E10H-R5-B1: the old session's continue line is already on the pane before the /clear (a codex resume in the same
// pane), and the /clear does not take. Only the before/after comparison (Q6) tells the stale line from a new one.
const tSeen = typerCase('seen-before', { before: F.NARROW_AFTER, after: F.NARROW_AFTER })
clause('clause 1e14 — typer on Codex, the old session\'s continue line already on the pane before the /clear and the /clear does not take: no resume sent, paused naming the /clear not taking (clear 1, resume 0; the pre-/clear pane is what clearTook compares against, Q6)',
  tSeen.sends === '1,0' && tSeen.cycled.length === 0 && JSON.stringify(tSeen.paused) === `["- auto-cycle paused: /clear did not take: session ${OLD} still running"]`, td(tSeen))
const tNoRestore = typerCase('norestore', { onResume: 'none' })
clause('clause 1e3 — typer on Codex, the resume sent and no restore file follows: paused with the no-restore reason (clear 1, resume 1, E8-D15 through the table)',
  tNoRestore.sends === '1,1' && JSON.stringify(tNoRestore.paused) === '["- auto-cycle paused: cleared, but the new session did not start doctrine"]' && tNoRestore.cycled.length === 1, td(tNoRestore))
const tReadFail = typerCase('readfail', { readFails: true })
clause('clause 1e4 — typer on Codex, the pane cannot be read before the /clear: nothing sent, paused with R17 (Q6: an unread pane never reads as a /clear that took)',
  tReadFail.sends === '0,0' && JSON.stringify(tReadFail.paused) === '["- auto-cycle paused: could not type into the pane: herdr could not read the pane"]', td(tReadFail))
const tFocus = typerCase('focus', { focusedGets: 3 })
clause('clause 1e5 — typer on Codex, the pane focused at first: it waits, then sends /clear and the resume line once each (E8-D15)',
  tFocus.sends === '1,1' && tFocus.calls.filter((c) => c[1] === 'get').length > 3 && tFocus.paused.length === 0, td(tFocus))
const tContained = typerCase('contained', {}, { DCTR_VIEW_REQUEST_DIR: path.join(tmp, 'views') })
clause('clause 1e6 — typer on Codex in a contained session: no herdr call at all (E8-D15)', tContained.calls.length === 0 && tContained.sends === '0,0', td(tContained))

// Gate round 1 repair. Derived pane texts: NARROW_AFTER with its empty composer replaced by a draft, and with a prompt
// the user submitted and its answer above a fresh composer.
const DRAFT = F.NARROW_AFTER.replace('› Ask Codex to do anything', '› my own draft')
const SUBMITTED = F.NARROW_AFTER.replace('› Ask Codex to do anything', '› hello there\n\n• Hi.\n\n› Ask Codex to do anything')
const tDraft = typerCase('draft', { after: DRAFT })
clause('clause 1e7 — typer on Codex, a draft typed into the new chat\'s composer after the /clear: the resume line is never sent into it, paused R16 (clear 1, resume 0, E10H-B1)',
  tDraft.sends === '1,0' && JSON.stringify(tDraft.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]' && tDraft.otherSends.length === 0, td(tDraft))
const tStarted = typerCase('started', { after: SUBMITTED, userStarts: true })
clause('clause 1e8 — typer on Codex, the user submitted a prompt in the new chat before the resume line (restore file and herdr on the new session): no resume sent, paused R16 (E10H-B1)',
  tStarted.sends === '1,0' && JSON.stringify(tStarted.paused) === '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]', td(tStarted))
// The new chat's rollout opening with the AGENTS.md block Codex injects (AGENTS_MD_TURN's real line, cut from a user's
// session) before the resume line: that is not the user typing.
const tAgents = typerCase('agents', { firstLines: [F.AGENTS_MD_TURN[1]] })
clause('clause 1e9 — typer on Codex, the new chat opens with the injected AGENTS.md block: the cycle confirms with no pause (clear 1, resume 1, E10H-B7)',
  tAgents.sends === '1,1' && tAgents.paused.length === 0 && tAgents.cycled.length === 1, td(tAgents))

// E10H-R4-B1: every Codex send checks the composer, and the retry an interrupted resume. Derived pane texts:
// NARROW_BEFORE with a draft in its composer; NARROW_AFTER after the resume line was submitted and interrupted
// (INTERRUPTED_LINE, probe B6's pane) above a draft.
const R16_LINE = '["- auto-cycle paused: auto-cycle stopped: you typed in this pane"]'
const DRAFT_BEFORE = F.NARROW_BEFORE.replace('› Ask Codex to do anything', '› my own draft')
const RETRY_DRAFT = F.NARROW_AFTER.replace('› Ask Codex to do anything', `› ${CODEX_RESUME_LINE}\n\n\n${F.INTERRUPTED_LINE}\n\n\n› my own draft`)
const tInterrupted = typerCase('interrupted', { onResume: 'abort', abortLines: F.RESUME_ABORTED, afterResume: RETRY_DRAFT })
clause('clause 1e10 — typer on Codex, the resume turn interrupted (Esc) before its first answer, a draft left in the composer, the pane unfocused: the resume line is not sent again, paused R16 (clear 1, resume 1, E10H-R4-B1)',
  tInterrupted.sends === '1,1' && JSON.stringify(tInterrupted.paused) === R16_LINE && tInterrupted.otherSends.length === 0 && tInterrupted.cycled.length === 1, td(tInterrupted))
const tRetryDraft = typerCase('retry-draft', { onResume: 'silent', afterResume: RETRY_DRAFT })
clause('clause 1e11 — typer on Codex, no first turn within the wait and a draft in the composer: the retry is not sent into the draft, paused R16 (clear 1, resume 1, E10H-R4-B1)',
  tRetryDraft.sends === '1,1' && JSON.stringify(tRetryDraft.paused) === R16_LINE && tRetryDraft.otherSends.length === 0, td(tRetryDraft))
const tInterruptedEmpty = typerCase('interrupted-empty', { onResume: 'abort', abortLines: F.RESUME_ABORTED, afterResume: RETRY_DRAFT.replace('› my own draft', '› Ask Codex to do anything') })
clause('clause 1e13 — typer on Codex, the resume turn interrupted before its first answer and the composer left empty: the resume line is not sent again, paused R16 (clear 1, resume 1, E10H-R4-B1)',
  tInterruptedEmpty.sends === '1,1' && JSON.stringify(tInterruptedEmpty.paused) === R16_LINE && tInterruptedEmpty.otherSends.length === 0, td(tInterruptedEmpty))
const tClearDraft = typerCase('clear-draft', { before: DRAFT_BEFORE, after: DRAFT_BEFORE })
clause('clause 1e12 — typer on Codex, a draft in the composer before the /clear: the /clear is not sent into it, paused R16 (clear 0, resume 0, E10H-R4-B1)',
  tClearDraft.sends === '0,0' && JSON.stringify(tClearDraft.paused) === R16_LINE && tClearDraft.otherSends.length === 0, td(tClearDraft))

// Standards R4-N1: processListing's reads of /proc/<pid>/stat, against this process's own stat and a real zombie: sh
// execs into sleep and never reaps the `true` it started. proc(5): after "(comm) " come field 3, the state, and field
// 22, the start time in clock ticks. The zombie and its state are found with ps(1), not the listing.
const zParent = spawn('sh', ['-c', 'true & exec sleep 5'], { stdio: 'ignore' })
orphans.push(zParent.pid)
await sleep(300)
const psZ = (() => { try { return execFileSync('ps', ['-o', 'pid=,stat=', '--ppid', String(zParent.pid)], { encoding: 'utf8' }).trim().split(/\s+/) } catch { return [] } })()
const zPid = Number(psZ[0])
const selfStat = fs.readFileSync('/proc/self/stat', 'utf8'), selfFields = selfStat.slice(selfStat.lastIndexOf(') ') + 2).split(' ')
const nowList = processListing()
zParent.kill()
const me = nowList.procs?.find((p) => p.pid === process.pid), zom = nowList.procs?.find((p) => p.pid === zPid)
clause('clause 1g — processListing reads /proc/<pid>/stat as proc(5) lays it out: this process is running (R) with the start time field 22 holds, its parent the suite\'s own; a zombie ps names reads Z, started no earlier than this process (Standards R4-N1)',
  me?.state === 'R' && me.start === Number(selfFields[19]) && me.ppid === process.ppid && Number.isInteger(me.start) && me.start > 0 &&
  zom?.state === 'Z' && zom.ppid === zParent.pid && zom.start >= me.start,
  `${JSON.stringify(me)} ${JSON.stringify(zom)} ps ${JSON.stringify(psZ)}`)
clause('clause 3g — without the listing: ps names one child of the zombie\'s parent and its state is Z; this process\'s stat field 22 is a positive tick count',
  psZ.length === 2 && /^Z/.test(psZ[1]) && Number(selfFields[19]) > 0 && selfFields[0] === 'R', JSON.stringify([psZ, selfFields.slice(0, 1), selfFields[19]]))

// ---------------------------------------------------------------- clause 2: known-good inputs stay quiet

const q = project('quiet')
const qT = rollout(q, 'm1', F.TUI_TURN)
const qStop = hook('dctr-cycle.mjs', q, as(F.STOP_MAIN, q, 'm1', qT, { last_assistant_message: 'alpha' }))
const qUps = hook('dctr-cycle.mjs', q, as(F.UPS_MAIN, q, 'm1', qT), { DCTR_WATCH_SCRIPT: stub, STUB_LOG: path.join(q.dir, 'w.log') })
clause('clause 2a — an ordinary Codex turn (no warned line) writes no paused line and prints nothing on Stop, and UserPromptSubmit prints nothing',
  qStop.code === 0 && qStop.out === '' && qUps.out === '' && recLines(q, /paused/).length === 0, `${qStop.out} ${qStop.err} ${qUps.out}`)
const qg = project('quiet-gauge', { on: '- auto-cycle: on cap 10 tier 100000' })
const qg1 = hook('dctr-gauge.mjs', qg, as(F.POST_MAIN, qg, 'm2', rollout(qg, 'm2', F.TUI_TURN)))
clause('clause 2b — gauge on Codex below the tier: silent, a latch recording the first reading, no warned line',
  qg1.out === '' && latch('m2')?.firstUsed === 17503 && recLines(qg, /warned/).length === 0, `${qg1.out} ${JSON.stringify(latch('m2'))}`)

// N1: a Codex process started from a Claude Code shell (codex:codex-rescue's app-server) inherits CLAUDE_CODE_SESSION_ID
// and the Claude session's pane. Each Codex payload that acts above (a PermissionRequest, a Stop that launches the
// typer, a gauge crossing, a restore) stands down there, writing nothing and calling no herdr.
const uc = project('under-claude', { on: '- auto-cycle: on cap 10 tier 90000', lines: ['- auto-cycle: warned u1 10000'] })
write(path.join(stateDir('u1'), 'gauge.json'), JSON.stringify({ session_id: 'u1', warned: true, warnedAt: Date.now() - 60000 }))
shim(uc, { session: 'u1' })
const ucEnv = { CLAUDE_CODE_SESSION_ID: 'c1a0de00-0000-4000-8000-00000000000c', DCTR_TYPER_SCRIPT: stub, STUB_LOG: path.join(uc.dir, 'typer.log') }
const ucT = rollout(uc, 'u1', [F.TUI_TURN, up99])
const ucBefore = fs.readFileSync(uc.record, 'utf8')
const ucRuns = [
  hook('dctr-cycle.mjs', uc, as(F.PERMISSION, uc, 'u1', ucT), ucEnv),
  hook('dctr-cycle.mjs', uc, as(F.STOP_MAIN, uc, 'u1', ucT, { last_assistant_message: 'Handoff written.\nauto-cycle: ready' }), ucEnv),
  hook('dctr-gauge.mjs', uc, as(F.POST_MAIN, uc, 'u2', ucT), ucEnv),
  hook('dctr-restore.mjs', uc, as(F.SS_CLEAR, uc, 'u3', ucT), ucEnv),
]
clause('clause 1f — a Codex process under a Claude Code session: PermissionRequest, Stop, PostToolUse and SessionStart clear stand down, the record unchanged, no typer, no restore file, no herdr call (N1)',
  ucRuns.every((r) => r.code === 0 && r.out === '') && fs.readFileSync(uc.record, 'utf8') === ucBefore && !fs.existsSync(path.join(uc.dir, 'typer.log')) &&
  calls(uc).length === 0 && latch('u2') === null,
  `${JSON.stringify(ucRuns.map((r) => [r.code, r.out, r.err.trim().slice(0, 80)]))} calls ${JSON.stringify(calls(uc))}`)

// ---------------------------------------------------------------- clause 3: the staged inputs carry the defect, no hook run

const J = (l) => JSON.parse(l)
clause('clause 3a — without the hooks: the Codex payloads carry no agent_id where the main session is meant, agent_id where the seat is, a rollout- transcript each, SessionStart sources clear, compact and startup, and PermissionRequest names the escalated command',
  F.SS_CLEAR.source === 'clear' && F.SS_COMPACT.source === 'compact' && F.SS_STARTUP.source === 'startup' && !('agent_id' in F.POST_MAIN) && 'agent_id' in F.POST_SEAT &&
  F.PERMISSION.hook_event_name === 'PermissionRequest' && /e10probe-outside/.test(F.PERMISSION.tool_input.command) && [F.SS_CLEAR, F.POST_MAIN, F.PERMISSION, F.STOP_BG].every((p) => /\/rollout-[^/]+\.jsonl$/.test(p.transcript_path)),
  'payload fixtures wrong')
clause('clause 3b — without the hooks: the background rollout\'s turn ended while its terminal ran, the completion came after the task_complete, and the Stop payload of that turn lists no background task',
  F.BG_RUNNING.map(J).at(-1).payload.type === 'task_complete' && J(F.BG_DONE[0]).timestamp > F.BG_RUNNING.map(J).at(-1).timestamp && !('background_tasks' in F.STOP_BG), 'bg fixture wrong')
clause('clause 3c — without the hooks: the typer\'s narrow pane text holds the old session id only after the /clear, and the gauge tier 10000 is below the rollout\'s 17503 while 100000 is above it',
  !F.NARROW_BEFORE.includes(OLD) && F.NARROW_AFTER.includes(OLD) && F.TUI_TURN.some((l) => l.includes('"input_tokens":17503')) && 10000 < 17503 && 100000 > 17503, 'typer or gauge fixture wrong')
const b5Out = F.CELL_RUNNING.filter((l) => /Script running with cell ID 6/.test(l))
const envWork = work()
await sleep(200)
const workEnv = (() => { try { return fs.readFileSync(`/proc/${envWork.pid}/environ`, 'utf8') } catch { return '' } })()
await envWork.end()
clause('clause 3f — without the hooks: B5 run 1 reports cell 6 running and no later output of cell 6, its turn ends in a task_complete, CELL_DONE is the loop\'s completion after it; the derived lines differ from the capture only in that task_complete\'s last message; the suite runs as argv0 codex, and a work process carries CODEX_SESSION_ID',
  b5Out.length === 1 && F.CELL_DONE.every((l) => !/cell ID 6|Script completed/.test(l)) && J(F.CELL_RUNNING.at(-1)).payload.type === 'task_complete' &&
  J(F.CELL_DONE[0]).payload.item.type === 'CommandExecution' && b5Lines.filter((l, i) => l !== F.CELL_RUNNING[i]).length === 1 &&
  J(b5Lines.at(-1)).payload.last_agent_message === READY && path.basename(process.argv0) === 'codex' &&
  workEnv.split("\0").includes("CODEX_SESSION_ID=work"),
  'B5 run 1 fixture wrong')
clause('clause 3e — without the hooks: the captured red-team marker is a gate with no pane, marked detached, naming a red-team transcript and the red-team label',
  F.REDTEAM_MARKER.role === 'gate' && F.REDTEAM_MARKER.paneId === '' && F.REDTEAM_MARKER.detached === true && F.REDTEAM_MARKER.label === 'red-team' &&
  /red-team\.out$/.test(F.REDTEAM_MARKER.file), 'marker fixture wrong')
clause('clause 3d — without the hooks: the other session\'s rollout in the isolation case reads 230000, past its tier, so a gauge reading it would have warned',
  fs.readFileSync(path.join(isoG.dir, 'sessions', 'rollout-2026-09-28T19-00-00-other.jsonl'), 'utf8').includes('"input_tokens":230000'), 'isolation fixture wrong')

process.exit(bad ? 1 : 0)
