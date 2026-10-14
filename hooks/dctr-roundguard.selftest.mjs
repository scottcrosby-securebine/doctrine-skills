// Tamper test for the round guard (issue #62, visibility-62 seams S1 and S2), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-roundguard.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins roundGuardDecision in dctr-lib.mjs: each refusal case beside its known-good twin. Clause 2 drives
// hooks/dctr-roundguard.mjs end to end with a tripwire `herdr` first on PATH and a scratch TMPDIR and HOME: the deny
// JSON, the latch, every stand-down, the crash path, the record read from disk, and zero herdr calls. Clause 3 proves
// each defective fixture carries its defect (a round line the parser reads, a gate path under a tmp dir) without
// calling the decision.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { roundGuardDecision } from './dctr-lib.mjs'
import { parseRecord } from './dctr-record.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const LINE = (n) => `- round: ${n} closed 2026-10-14T10:00:00Z at abc1234 blockers 0 alarm 0`
const TOKEN = (n) => `node /p/hooks/dctr-token.mjs ${n} 0 0`
const ENV = { tmpDirs: ['/tmp', '/var/tmpx'], home: '/home/u', cwd: '/home/u/r', pluginRoot: '/p' }
const REC = '/home/u/r/.doctrine/records/r.md'
const bash = (command) => ['Bash', { command }]
const decide = ([tool, input], recordText = null, env = ENV) => roundGuardDecision(tool, input, recordText, env)
const show = (d) => JSON.stringify(d)

// ---------------------------------------------------------------- the fixtures, each defective one beside its twin

const F = {
  bashNoToken: bash(`echo '${LINE(3)}' >> ${REC}`),
  bashToken: bash(`echo '${LINE(3)}' >> ${REC} && ${TOKEN(3)}`),
  bashDateNoToken: bash(`echo "- round: 3 closed $(date -u +%FT%TZ) at $(git rev-parse --short HEAD) blockers 0 alarm 0" >> ${REC}`),
  bashDateToken: bash(`echo "- round: 3 closed $(date -u +%FT%TZ) at $(git rev-parse --short HEAD) blockers 0 alarm 0" >> ${REC}; node "\${CLAUDE_PLUGIN_ROOT}/hooks/dctr-token.mjs" 3 0 0`),
  heredocNoToken: bash(`cat >> ${REC} <<'EOF'\n${LINE(4)}\nEOF`),
  heredocToken: bash(`cat >> ${REC} <<'EOF'\n${LINE(4)}\nEOF\n${TOKEN(4)}`),
  teeNoToken: bash(`printf '%s\\n' '${LINE(5)}' | tee -a ~/r/rec.md`),
  mentionToken: bash(`echo '${LINE(3)} via dctr-token.mjs' >> ${REC}`),
  writeMd: ['Write', { file_path: REC, content: `# r\n${LINE(2)}\n` }],
  writeMjs: ['Write', { file_path: '/home/u/r/x.mjs', content: `// ${LINE(2)}\n` }],
  editMd: ['Edit', { file_path: REC, old_string: LINE(1), new_string: `${LINE(1)}\n${LINE(2)}` }],
  editTs: ['Edit', { file_path: '/home/u/r/x.ts', old_string: 'a', new_string: LINE(2) }],
  template: ['Write', { file_path: REC, content: 'round: <n> closed <time> at <rev> blockers <n> alarm <n>\n' }],
  rewrite: ['Write', { file_path: REC, content: `# r\n${LINE(1)}\n${LINE(2)}\nmore prose\n` }],
}
const R = {
  tmpOut: '# r\n- gate: /tmp/x/gate.out exit=0\n',
  homeOut: '# r\n- gate: /home/u/r/gate.out exit=0\n',
  tmpJsonl: '# r\n- seat transcript /tmp/agent.jsonl\n',
  tmpResult: '# r\n- gate result `/tmp/claude-1000/s/scratchpad/gate.out.result`\n',
  tmpOutput: '# r\n- gate log /var/tmpx/m.output.\n',
  homeResult: '# r\n- gate result `/home/u/r/gate.out.result` and /home/u/r/m.output\n',
  homeTmp: '# r\n- gate: ~/gate.out\n',
  relOut: '# r\n- gate: tmp/gate.out\n',
  old12: `# r\n${LINE(1)}\n${LINE(2)}\n`,
}

// ---------------------------------------------------------------- clause 1: the pure decision

const refuses = (d, ...has) => d.refuse && has.every((h) => d.reasons.some((r) => r.includes(h)))
const allows = (d) => !d.refuse && d.reasons.length === 0
{
  const d = decide(F.bashNoToken), t = decide(F.bashToken)
  clause('clause 1a — a Bash append of a round line without dctr-token.mjs is refused, naming the publish; with it, allowed',
    refuses(d, 'does not run dctr-token.mjs', 'ONE Bash call', '/p/hooks/dctr-token.mjs') && d.round === 3 && d.target === REC && allows(t) && t.round === 3, `${show(d)} ${show(t)}`)
}
{
  const d = decide(F.bashDateNoToken), t = decide(F.bashDateToken)
  clause('clause 1b — a round line whose time and revision are $(...) expansions is still a round line; the quoted ${CLAUDE_PLUGIN_ROOT} token call counts',
    refuses(d, 'does not run dctr-token.mjs') && d.round === 3 && allows(t) && t.round === 3, `${show(d)} ${show(t)}`)
}
{
  const d = decide(F.heredocNoToken), t = decide(F.heredocToken), tee = decide(F.teeNoToken)
  clause('clause 1c — a heredoc append is refused without the token and allowed with it; a `tee -a ~/...` target is read and expanded',
    refuses(d) && d.round === 4 && d.target === REC && allows(t) && refuses(tee) && tee.round === 5 && tee.target === '/home/u/r/rec.md', `${show(d)} ${show(t)} ${show(tee)}`)
}
{
  const d = decide(F.mentionToken)
  clause('clause 1d — dctr-token.mjs named in the line\'s text but not run by node is still a missing publish', refuses(d, 'does not run dctr-token.mjs'), show(d))
}
{
  const w = decide(F.writeMd), wj = decide(F.writeMjs), e = decide(F.editMd), et = decide(F.editTs)
  clause('clause 1e — a round line written by Write or Edit to a .md is refused as unpublishable; to .mjs or .ts it is not a round-line write',
    refuses(w, 'Write tool, which cannot run dctr-token.mjs', 'ONE Bash call') && w.round === 2 && refuses(e, 'Edit tool') && e.round === 2 &&
    allows(wj) && wj.round === null && allows(et) && et.round === null, [w, wj, e, et].map(show).join(' '))
}
{
  const d = decide(F.template), rw = decide(F.rewrite, R.old12), rwFresh = decide(F.rewrite, '# r\n')
  clause('clause 1f — template text does not parse as a round line; a Write that re-writes rounds already on disk writes no new round, and the same Write over a record without them does',
    allows(d) && d.round === null && allows(rw) && rw.round === null && refuses(rwFresh) && rwFresh.round === 2, [d, rw, rwFresh].map(show).join(' '))
}
{
  const d = decide(F.bashToken, R.tmpOut), t = decide(F.bashToken, R.homeOut), j = decide(F.bashToken, R.tmpJsonl)
  clause('clause 1h — a record naming /tmp/x/gate.out is refused, naming the path and step 3; /home/u/r/gate.out and /tmp/agent.jsonl are not',
    refuses(d, '/tmp/x/gate.out lies under /tmp, which dies with the session', 'doctrine step 3') && d.reasons.length === 1 && allows(t) && allows(j),
    [d, t, j].map(show).join(' '))
}
{
  const r = decide(F.bashToken, R.tmpResult), o = decide(F.bashToken, R.tmpOutput), h = decide(F.bashToken, R.homeResult)
  clause('clause 1i — .out.result under /tmp and .output under another tmp dir (os.tmpdir()) are refused; the same names under home are not',
    refuses(r, 'gate.out.result lies under /tmp') && refuses(o, '/var/tmpx/m.output lies under /var/tmpx') && allows(h), [r, o, h].map(show).join(' '))
}
{
  const tilde = decide(F.bashToken, R.homeTmp, { ...ENV, home: '/tmp/h' }), rel = decide(F.bashToken, R.relOut)
  clause('clause 1j — a ~/ path is expanded before it is judged; a relative path never counts',
    refuses(tilde, '/tmp/h/gate.out lies under /tmp') && allows(rel), `${show(tilde)} ${show(rel)}`)
}
{
  const both = decide(F.bashNoToken, R.tmpOut), inText = decide(bash(`echo '${LINE(3)} gate /tmp/g.output' >> ${REC} && ${TOKEN(3)}`))
  clause('clause 1k — both defects are named in one refusal; a gate path in the incoming text alone is judged too',
    refuses(both, 'does not run dctr-token.mjs', '/tmp/x/gate.out') && both.reasons.length === 2 && refuses(inText, '/tmp/g.output'), `${show(both)} ${show(inText)}`)
}

// ---------------------------------------------------------------- clause 2: the hook end to end

const hook = path.join(import.meta.dirname, 'dctr-roundguard.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-roundguard-'))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const tripwire = path.join(tmp, 'herdr-was-called')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(tripwire)}\nexit 0\n`)
fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const scratchTmp = path.join(tmp, 't'); fs.mkdirSync(scratchTmp)
const durable = fs.mkdtempSync(path.join(os.homedir(), '.dctr-roundguard-'))   // a record dir outside every tmp dir
const rec = path.join(durable, 'r.md'), recTmp = path.join(durable, 'rt.md')
fs.writeFileSync(rec, '# r\n- gate: ~/gates/g.out exit=0\n')
fs.writeFileSync(recTmp, `# r\n- gate: ${scratchTmp}/scratchpad/gate.out exit=0\n`)
const IN = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: scratchTmp, HERDR_ENV: '1', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'p1' }
delete IN.DCTR_VIEW_REQUEST_DIR
const run = (stdin, env = {}) => {
  const r = spawnSync('node', [hook], { input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin), env: { ...IN, ...env }, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const pay = (session, command, more = {}) => ({ hook_event_name: 'PreToolUse', session_id: session, cwd: durable, tool_name: 'Bash', tool_input: { command }, ...more })
const denied = (r, ...has) => {
  try {
    const j = JSON.parse(r.out), h = j.hookSpecificOutput
    return r.code === 0 && Object.keys(j).length === 1 && Object.keys(h).sort().join() === 'hookEventName,permissionDecision,permissionDecisionReason' &&
      h.hookEventName === 'PreToolUse' && h.permissionDecision === 'deny' && has.every((x) => h.permissionDecisionReason.includes(x))
  } catch { return false }
}
const allowed = (r) => r.code === 0 && r.out === ''

{
  const cmd = `echo '${LINE(3)}' >> ${rec}`
  const first = run(pay('s1', cmd)), again = run(pay('s1', cmd)), r4 = run(pay('s1', `echo '${LINE(4)}' >> ${rec}`)), other = run(pay('s2', cmd))
  clause('clause 2a — a round line without the token is denied with the exact PreToolUse shape, naming the publish and "refuses round 3 once"',
    denied(first, 'does not run dctr-token.mjs', 'ONE Bash call', 'Fix it and repeat the write; this guard refuses round 3 once.'), JSON.stringify(first))
  clause('clause 2b — the identical retry goes through; round 4 of the same record is refused again; another session is refused on its own latch',
    allowed(again) && denied(r4, 'round 4') && denied(other), [again, r4, other].map((x) => JSON.stringify(x)).join(' '))
  clause('clause 2c — the latch file lives under TMPDIR/dctr-roundguard and names the session',
    fs.existsSync(path.join(scratchTmp, 'dctr-roundguard', 's1.json')), fs.readdirSync(scratchTmp).join(','))
}
{
  const ok = run(pay('s3', `echo '${LINE(3)}' >> ${rec} && ${TOKEN(3)}`))
  const tmpRec = run(pay('s3', `echo '${LINE(3)}' >> ${recTmp} && ${TOKEN(3)}`))
  clause('clause 2d — the record on disk is read: a durable gate path with the token goes through; a TMPDIR gate path in the record is denied',
    allowed(ok) && denied(tmpRec, 'scratchpad/gate.out lies under', 'durable path'), `${JSON.stringify(ok)} ${JSON.stringify(tmpRec)}`)
}
{
  const cmd = `echo '${LINE(3)}' >> ${rec}`
  const cases = [
    ['HERDR_ENV unset', run(pay('s4', cmd), { HERDR_ENV: '' })],
    ['no HERDR_WORKSPACE_ID', run(pay('s4', cmd), { HERDR_WORKSPACE_ID: '' })],
    ['no HERDR_PANE_ID', run(pay('s4', cmd), { HERDR_PANE_ID: '' })],
    ['DCTR_VIEW_REQUEST_DIR set', run(pay('s4', cmd), { DCTR_VIEW_REQUEST_DIR: tmp })],
    ['agent_id present', run(pay('s4', cmd, { agent_id: 'a1', agent_type: 'general-purpose' }))],
    ['tool is Read', run({ ...pay('s4', cmd), tool_name: 'Read', tool_input: { file_path: rec } })],
  ]
  clause('clause 2e — it stands down (no output, exit 0) outside herdr, in a contained session, for a subagent and for another tool',
    cases.every(([, r]) => allowed(r)) && !fs.existsSync(path.join(scratchTmp, 'dctr-roundguard', 's4.json')),
    cases.filter(([, r]) => !allowed(r)).map(([n, r]) => `${n}: ${JSON.stringify(r)}`).join('; '))
}
{
  const garbage = run('{not json'), nullInput = run({ session_id: 's5', tool_name: 'Bash', tool_input: null }), empty = run('')
  clause('clause 2f — a payload that cannot be read allows the call (a crash never blocks a run)',
    allowed(garbage) && allowed(nullInput) && allowed(empty), [garbage, nullInput, empty].map((x) => JSON.stringify(x)).join(' '))
}
{
  const notDir = path.join(tmp, 'a-file'); fs.writeFileSync(notDir, 'x')
  const cmd = `echo '${LINE(3)}' >> ${rec}`
  const a = run(pay('s6', cmd), { TMPDIR: notDir }), b = run(pay('s6', cmd), { TMPDIR: notDir })
  clause('clause 2g — a latch that cannot be written still refuses, every time', denied(a) && denied(b), `${JSON.stringify(a)} ${JSON.stringify(b)}`)
}
clause('clause 2h — herdr was called zero times across every run (tripwire on PATH)', !fs.existsSync(tripwire), 'the tripwire herdr ran')

// ---------------------------------------------------------------- clause 3: the fixtures carry their defects

const isRound = (t) => String(t).split('\n').some((l) => parseRecord(l.trim()).entries.some((e) => e.kind === 'round'))
const unquoted = (cmd) => cmd.replace(/'/g, '').replace(/"/g, '').replace(/\$\(date[^)]*\)/, '2026-10-14T10:00:00Z').replace(/\$\(git[^)]*\)/, 'abc1234')
const lines = (cmd) => unquoted(cmd).split(/\n|\\n/).map((l) => l.replace(/^\s*echo /, '').replace(/\s*(>>|\|).*$/, ''))
clause('clause 3a — every refused fixture carries a round line the parser reads, the Bash ones once the shell has run, and the template fixture carries none',
  [F.bashNoToken, F.bashDateNoToken, F.heredocNoToken, F.teeNoToken, F.mentionToken].every(([, i]) => lines(i.command).some(isRound)) &&
  isRound(F.writeMd[1].content) && isRound(F.editMd[1].new_string) && !isRound(F.template[1].content),
  'a defective fixture carries no round line, or the template does')
clause('clause 3b — no refused-for-publish Bash fixture runs node on dctr-token.mjs, and every allowed twin does',
  [F.bashNoToken, F.bashDateNoToken, F.heredocNoToken, F.teeNoToken, F.mentionToken].every(([, i]) => !/node\s+\S*dctr-token/.test(i.command)) &&
  [F.bashToken, F.bashDateToken, F.heredocToken].every(([, i]) => /node\s+"?\S*dctr-token\.mjs/.test(i.command)), 'a fixture does not carry what its clause rests on')
clause('clause 3c — each tmp-path record names a gate-shaped path that starts with a tmp dir, and each durable twin does not',
  ['/tmp/x/gate.out', '/tmp/claude-1000/s/scratchpad/gate.out.result', '/var/tmpx/m.output'].every((p, i) => [R.tmpOut, R.tmpResult, R.tmpOutput][i].includes(p)) &&
  fs.readFileSync(recTmp, 'utf8').includes(`${scratchTmp}/scratchpad/gate.out`) &&
  ![R.homeOut, R.homeResult, R.tmpJsonl, fs.readFileSync(rec, 'utf8')].some((t) => /(\/tmp|\/var\/tmpx)\/\S*\.(out|output)\b/.test(t)) && !R.relOut.includes(' /'),
  'a record fixture does not carry what its clause rests on')

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(durable, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
