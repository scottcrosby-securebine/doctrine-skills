// Tamper test for the round guard (issue #62, visibility-62 seams S1 and S2), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-roundguard.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 pins roundGuardDecision in dctr-lib.mjs: each refusal case beside its known-good twin. Clause 2 drives
// hooks/dctr-roundguard.mjs end to end with a tripwire `herdr` first on PATH and a scratch TMPDIR. Clause 3 proves
// fixtures without calling the decision or the hook; each clause's label says what it proves. The one coverage
// guarantee: TABLES lists the fixture tables, every clause-3 proof obtains its fixture through prove(), and
// clause 3n fails naming each key of a listed table that no proof obtained (3o proves it can fail). That shows each
// listed key reached a clause-3 proof, not that the proof is strong; a fixture written inline in a clause, or a table
// left out of TABLES, is not checked. Clause 3m runs fixtures under real bash, so the suite needs bash.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { roundGuardDecision, followLinks } from './dctr-lib.mjs'
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
  writeMjs: ['Write', { file_path: '/home/u/r/x.mjs', content: `${LINE(2)}\n` }],
  editMd: ['Edit', { file_path: REC, old_string: LINE(1), new_string: `${LINE(1)}\n${LINE(2)}` }],
  editTs: ['Edit', { file_path: '/home/u/r/x.ts', old_string: 'a', new_string: LINE(2) }],
  template: ['Write', { file_path: REC, content: 'round: <n> closed <time> at <rev> blockers <n> alarm <n>\n' }],
  dateQuoted: bash(`echo "- round: 3 closed $(date -u +"%Y-%m-%dT%H:%M:%SZ") at abc1234 blockers 0 alarm 0" >> ${REC}`),
  dateQuotedToken: bash(`echo "- round: 3 closed $(date -u +"%Y-%m-%dT%H:%M:%SZ") at abc1234 blockers 0 alarm 0" >> ${REC} && ${TOKEN(3)}`),
  nested: bash(`echo "- round: 3 closed $(date -u +%FT%TZ) at $(basename "$(pwd)") blockers 0 alarm 0" >> ${REC}`),
  python: bash(`python3 -c 'from pathlib import Path; Path("r.md").write_text("round: 1 closed 2026-10-14T00:00:00Z at abc1234 blockers 0 alarm 0\\n")'`),
  commentToken: bash(`echo '${LINE(3)}' >> ${REC} # ${TOKEN(3)}`),
  printfToken: bash(`echo '${LINE(3)}' >> ${REC}; printf '${TOKEN(3)}'`),
  echoToken: bash(`echo '${LINE(3)}' >> ${REC}; echo "${TOKEN(3)}"`),
  commentSepToken: bash(`echo '${LINE(3)}' >> ${REC} # publish later; ${TOKEN(3)}`),
  echoSepToken: bash(`echo '${LINE(3)}' >> ${REC}; echo "publish next; ${TOKEN(3)}"`),
  printfSepToken: bash(`echo '${LINE(3)}' >> ${REC}; printf '%s\\n' 'then && ${TOKEN(3)}'`),
  heredocBodyToken: bash(`cat >> ${REC} <<'EOF'\n${LINE(4)}\n${TOKEN(4)}\nEOF`),
  rewrite: ['Write', { file_path: REC, content: `# r\n${LINE(1)}\n${LINE(2)}\nmore prose\n` }],
  inTextGate: bash(`echo '${LINE(3)} gate /tmp/g.output' >> ${REC} && ${TOKEN(3)}`),
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
  relGates: '# r\n- gate: gates/r1.out.result\n',
  envTmp: '# r\n- gate: $TMPDIR/g.out and ${TMPDIR}/h.output\n',
  old12: `# r\n${LINE(1)}\n${LINE(2)}\n`,
  fresh: '# r\n',
  relGate: '# r\n- gate: gates/r1.out exit=0\n',
}
// Fake links for the pure decision's resolver: `from` is a durable-looking path the decision is handed, `to` where a
// symlink would put it. viaLink(l) is ENV with a resolver that maps exactly that one path.
const LK = {
  relGatesLink: { from: '/home/u/r/gates/r1.out.result', to: '/tmp/s/r1.out.result' },
  logStem: { from: '/home/u/r/.doctrine/records/gate-r1-npm-test.log', to: '/tmp/s/gate-r1-npm-test.log' },
  orchLink: { from: '/home/u/proj/gates/r1.out', to: '/tmp/s/r1.out' },
}
const viaLink = (l) => ({ ...ENV, resolve: (p) => (p === l.from ? l.to : p) })
// Environment overrides below (a cwd of /tmp/w, a home of /tmp/h) are where a fixture is judged, not fixtures.

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
  const d = decide(F.template), rw = decide(F.rewrite, R.old12), rwFresh = decide(F.rewrite, R.fresh)
  clause('clause 1f — template text does not parse as a round line; a Write that re-writes rounds already on disk writes no new round, and the same Write over a record without them does',
    allows(d) && d.round === null && allows(rw) && rw.round === null && refuses(rwFresh) && rwFresh.round === 2, [d, rw, rwFresh].map(show).join(' '))
}
{
  const d = decide(F.bashToken, R.tmpOut), t = decide(F.bashToken, R.homeOut), j = decide(F.bashToken, R.tmpJsonl)
  clause('clause 1h — a record naming /tmp/x/gate.out is refused, naming the path and telling the orchestrator to append a correction, never edit (step 5); /home/u/r/gate.out and /tmp/agent.jsonl are not',
    refuses(d, '/tmp/x/gate.out lies under /tmp, which dies with the session', 'append a correction line', 'never edit the earlier line', 'doctrine step 5') && d.reasons.length === 1 && allows(t) && allows(j),
    [d, t, j].map(show).join(' '))
}
{
  const r = decide(F.bashToken, R.tmpResult), o = decide(F.bashToken, R.tmpOutput), h = decide(F.bashToken, R.homeResult)
  clause('clause 1i — .out.result under /tmp and .output under another tmp dir (os.tmpdir()) are refused; the same names under home are not',
    refuses(r, 'gate.out.result lies under /tmp') && refuses(o, '/var/tmpx/m.output lies under /var/tmpx') && allows(h), [r, o, h].map(show).join(' '))
}
{
  const tilde = decide(F.bashToken, R.homeTmp, { ...ENV, home: '/tmp/h' }), rel = decide(F.bashToken, R.relOut)
  clause('clause 1j — a ~/ path is expanded before it is judged; a relative path under a durable cwd is durable',
    refuses(tilde, '~/gate.out (resolves to /tmp/h/gate.out) lies under /tmp') && allows(rel), `${show(tilde)} ${show(rel)}`)
}
{
  const tmpCwd = decide(F.bashToken, R.relGates, { ...ENV, cwd: '/tmp/w' }), homeCwd = decide(F.bashToken, R.relGates)
  const env = decide(F.bashToken, R.envTmp)
  const linked = decide(F.bashToken, R.relGates, viaLink(LK.relGatesLink))
  clause('clause 1l — a relative gate path resolves against the call\'s cwd (refused under /tmp/w, allowed under /home/u/r), $TMPDIR and ${TMPDIR} expand to the temp directory, and the resolver env passes is applied (a symlink into /tmp)',
    refuses(tmpCwd, 'gates/r1.out.result', 'lies under /tmp') && allows(homeCwd) &&
    refuses(env, '/var/tmpx/g.out', '/var/tmpx/h.output') && env.reasons.length === 2 &&
    refuses(linked, '/tmp/s/r1.out.result', 'lies under /tmp'), [tmpCwd, homeCwd, env, linked].map(show).join(' '))
}
{
  const q = decide(F.dateQuoted), qt = decide(F.dateQuotedToken), n = decide(F.nested), py = decide(F.python)
  clause('clause 1m — a round line is found wherever round: sits once every expansion is replaced: a quoted date format inside $(...), a nested $(... "$(pwd)"), a python3 -c write_text with a literal \\n',
    refuses(q, 'does not run dctr-token.mjs') && q.round === 3 && allows(qt) && qt.round === 3 && refuses(n) && n.round === 3 && refuses(py) && py.round === 1,
    [q, qt, n, py].map(show).join(' '))
}
{
  const ds = [F.commentToken, F.commentSepToken, F.printfToken, F.printfSepToken, F.echoToken, F.echoSepToken, F.heredocBodyToken].map((f) => decide(f))
  clause('clause 1n — dctr-token.mjs in a # comment, inside a quoted printf or echo argument, or inside a heredoc body is not a publish, even after a ; or && in that text',
    ds.every((d) => refuses(d, 'does not run dctr-token.mjs')), ds.map(show).join(' '))
}
{
  const both = decide(F.bashNoToken, R.tmpOut), inText = decide(F.inTextGate)
  clause('clause 1k — both defects are named in one refusal; a gate path in the incoming text alone is judged too',
    refuses(both, 'does not run dctr-token.mjs', '/tmp/x/gate.out') && both.reasons.length === 2 && refuses(inText, '/tmp/g.output', 'record the gate transcript at a durable path (doctrine step 3)') && !inText.reasons.some((r) => r.includes('correction')), `${show(both)} ${show(inText)}`)
}

// Round 2 (F-A to F-D): the forms seen in real seat captures and records, each beside its twin. G1 to G7 are those
// forms as written; the escapes are literal backslash-n and backslash-t in the command, as printf and echo -e read them.
const RT = '.doctrine/records/truncate.md'
const G = {
  heredocDollarT: bash(`T=$(date -u +%Y-%m-%dT%H:%M:%SZ) && cat >> ${RT} <<EOF\n- gate: npm test exit=0\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\n`),
  heredocDollarTToken: bash(`T=$(date -u +%Y-%m-%dT%H:%M:%SZ) && cat >> ${RT} <<EOF && node "/p/hooks/dctr-token.mjs" 1 0 0\n- gate: npm test exit=0\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\n`),
  heredocDollarTAfter: bash(`T=$(date -u +%Y-%m-%dT%H:%M:%SZ) && cat >> ${RT} <<EOF\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\nnode "/p/hooks/dctr-token.mjs" 1 0 0`),
  printfToken: bash(`printf -- '- gate npm test exit=0\\n${LINE(1)}\\n' >> rec.md && ${TOKEN(1)}`),
  printfNoToken: bash(`printf -- '- gate npm test exit=0\\n${LINE(1)}\\n' >> rec.md`),
  printfTmpGate: bash(`printf -- '- gate /tmp/x/r2.out\\n${LINE(2)}\\n' >> rec.md && ${TOKEN(2)}`),
  printfHomeGate: bash(`printf -- '- gate /home/u/r/r2.out\\n${LINE(2)}\\n' >> rec.md && ${TOKEN(2)}`),
  echoTabTmpGate: bash(`echo -e "- gate\\t/tmp/x/r2.out\\n${LINE(2)}" >> rec.md && ${TOKEN(2)}`),
  // MR12-B1: a gate path in escaped backticks inside an unquoted heredoc, the form most captured round writes take.
  heredocEscTick: bash(`T=$(date -u +%Y-%m-%dT%H:%M:%SZ) && cat >> ${RT} <<EOF\nGate: \\\`/tmp/x/r3.out\\\`, exit 0.\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\nnode "/p/hooks/dctr-token.mjs" 1 0 0`),
  heredocEscTickHome: bash(`T=$(date -u +%Y-%m-%dT%H:%M:%SZ) && cat >> ${RT} <<EOF\nGate: \\\`/home/u/r/r3.out\\\`, exit 0.\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\nnode "/p/hooks/dctr-token.mjs" 1 0 0`),
  delimDash: bash(`cat >> ${REC} <<'END-RECORD'\n${LINE(4)}\n${TOKEN(4)}\nEND-RECORD`),
  delimDashToken: bash(`cat >> ${REC} <<'END-RECORD'\n${LINE(4)}\nEND-RECORD\n${TOKEN(4)}`),
  delimDouble: bash(`cat >> ${REC} <<"EOF"\n${LINE(4)}\n${TOKEN(4)}\nEOF`),
  delimDoubleToken: bash(`cat >> ${REC} <<"EOF"\n${LINE(4)}\nEOF\n${TOKEN(4)}`),
  delimTab: bash(`cat >> ${REC} <<-EOF\n\t${LINE(4)}\n\t${TOKEN(4)}\n\tEOF`),
  delimTabToken: bash(`cat >> ${REC} <<-EOF\n\t${LINE(4)}\n\tEOF\n${TOKEN(4)}`),
}
const GR = {
  relResult: '# r\n- gate `.doctrine/records/gate-r1-npm-test.out.result` reads `exit=0`\n',
  logPair: '# r\n- gate `.doctrine/records/gate-r1-npm-test.log` with its `.doctrine/records/gate-r1-npm-test.log.result`\n',
  launch: '# r\n- gate `node /c/hooks/dctr-gate.mjs npm-test-r1 .doctrine/records/gate-r1-npm-test.log -- npm test`, result `.doctrine/records/gate-r1-npm-test.log.result`\n',
  durableResult: '# r\n- result /home/u/r/x.result\n- seat /tmp/agent.jsonl\n',
}
{
  const ds = [G.printfTmpGate, G.echoTabTmpGate].map((f) => decide(f)), home = decide(G.printfHomeGate)
  clause('clause 1o — a gate path glued to a printf \\n or an echo -e \\t is read once the escape is decoded (F-A): /tmp/x/r2.out refused, /home/u/r/r2.out allowed',
    ds.every((d) => refuses(d, '/tmp/x/r2.out lies under /tmp', 'record the gate transcript at a durable path') && d.round === 2 && d.reasons.length === 1) && allows(home) && home.round === 2,
    [...ds, home].map(show).join(' '))
}
{
  const d = decide(G.heredocEscTick), home = decide(G.heredocEscTickHome)
  clause('clause 1w — a gate path in escaped backticks inside an unquoted heredoc is read as the shell writes it (MR12-B1): /tmp/x/r3.out refused, /home/u/r/r3.out allowed',
    refuses(d, '/tmp/x/r3.out lies under /tmp', 'record the gate transcript at a durable path') && d.round === 1 && d.reasons.length === 1 && allows(home) && home.round === 1,
    [d, home].map(show).join(' '))
}
{
  const d = decide(G.heredocDollarT), t = decide(G.heredocDollarTToken), a = decide(G.heredocDollarTAfter), p = decide(G.printfNoToken), pt = decide(G.printfToken)
  clause('clause 1p — the captured forms: T=$(date) && cat >> record <<EOF with $T in the line, refused without the token and allowed with it on the heredoc line or after EOF; printf -- \'...\\n- round: ...\\n\' >> rec.md likewise',
    refuses(d, 'does not run dctr-token.mjs') && d.round === 1 && d.target === `/home/u/r/${RT}` && allows(t) && t.round === 1 && allows(a) && a.round === 1 &&
    refuses(p, 'does not run dctr-token.mjs') && p.round === 1 && p.target === '/home/u/r/rec.md' && allows(pt) && pt.round === 1, [d, t, a, p, pt].map(show).join(' '))
}
{
  const ds = [G.delimDash, G.delimDouble, G.delimTab].map((f) => decide(f)), ts = [G.delimDashToken, G.delimDoubleToken, G.delimTabToken].map((f) => decide(f))
  clause('clause 1q — every heredoc delimiter form (<<\'END-RECORD\', <<"EOF", <<-EOF with a tab-indented terminator) ends its body where the shell does: a publish inside the body is refused, one after the terminator is allowed',
    ds.every((d) => refuses(d, 'does not run dctr-token.mjs') && d.round === 4) && ts.every((t) => allows(t) && t.round === 4), [...ds, ...ts].map(show).join(' '))
}
{
  const tmpCwd = { ...ENV, cwd: '/tmp/w' }
  const rel = decide(F.bashToken, GR.relResult, tmpCwd), relHome = decide(F.bashToken, GR.relResult)
  const stem = decide(F.bashToken, GR.logPair, viaLink(LK.logStem))
  const launch = decide(F.bashToken, GR.launch, tmpCwd), launchHome = decide(F.bashToken, GR.launch), dur = decide(F.bashToken, GR.durableResult)
  clause('clause 1r — any path ending .result is gate-shaped and so is its stem (PATHEXT): a relative .out.result and a .log.result under a tmp cwd are refused, a .log whose .result names it is judged as the transcript, a durable x.result and a .jsonl under /tmp are not',
    refuses(rel, '.doctrine/records/gate-r1-npm-test.out.result', 'lies under /tmp') && allows(relHome) &&
    refuses(stem, '.doctrine/records/gate-r1-npm-test.log (resolves to /tmp/s/gate-r1-npm-test.log)') && stem.reasons.length === 1 &&
    refuses(launch, '.doctrine/records/gate-r1-npm-test.log.result', '.doctrine/records/gate-r1-npm-test.log (resolves to /tmp/w/') && allows(launchHome) && allows(dur),
    [rel, relHome, stem, launch, launchHome, dur].map(show).join(' '))
}

// The fake filesystems followLinks walks in 1t and 1v: `start` the path walked, `links` each link and its target as
// readlink returns it, `exists` the paths that exist.
const FS = {
  up: { start: '/durable/gates/r1.out', links: { '/durable/gates/r1.out': 'hop/../r1.out', '/durable/gates/hop': '/tmp/s/nest' }, exists: ['/tmp/s/nest', '/tmp/s/r1.out'] },
  back: { start: '/tmp/s/r1.out', links: { '/tmp/s/r1.out': '/tmp/s/hop/../r1.out', '/tmp/s/hop': '/durable/d/x' }, exists: ['/durable/d/x', '/durable/d/r1.out'] },
  chain: { start: '/a/x', links: { '/a/x': 'y', '/a/y': '/b/z' }, exists: ['/b/z'] },
  gone: { start: '/d/g.out', links: { '/d/g.out': 'h.out', '/d/h.out': '/tmp/gone/r1.out' }, exists: ['/d'] },
  cycle: { start: '/c/p/f.out', links: { '/c/p': 'q', '/c/q': 'p' }, exists: [] },
}

// Round 3 (R3-A to R3-C). R3-A: the base a literal cd sets, in the orchestrator's form (cd && cat >> rel <<EOF) and the
// kit seats' (cd, newline, T=$(date), newline, cat >> rel <<EOF), and every form whose base cannot be known.
// The kit seat's form, cd then a newline: a generator, used only to build the two H fixtures below.
const kitCmd = (dir, gate) => bash(`cd ${dir}\nT=$(date -u +%Y-%m-%dT%H:%M:%SZ)\ncat >> .doctrine/records/truncate.md <<EOF\n- gate ${gate}\n- round: 1 closed $T at abc1234 blockers 0 alarm 0\nEOF\n${TOKEN(1)}`)
const H = {
  orch: bash(`cd /home/u/proj && cat >> .doctrine/records/e1.md <<EOF\n- gate: npm test exit=0\n${LINE(3)}\nEOF\n${TOKEN(3)}`),
  kitDurable: kitCmd('/home/u/fixture', '.doctrine/records/gate-r1.out.result'),
  kitTmp: kitCmd('/tmp/k', '.doctrine/records/gate-r1.out.result'),
  unknown: ['cd "$D"', 'cd -', 'cd ~/proj', 'cd', 'cd /home/u/a && cd /home/u/b', 'cd -P /home/u/proj']
    .map((cd) => bash(`${cd} && cat >> rec.md <<EOF\n- gate gates/r.out\n${LINE(3)}\nEOF\n${TOKEN(3)}`)),
  hereString: bash(`cat >> r.md <<< "- round: 3 closed 2026-10-15T00:00:00Z at abc blockers 0 alarm 0"\n${TOKEN(3)}`),
  hereStringNoToken: bash(`cat >> r.md <<< "- round: 3 closed 2026-10-15T00:00:00Z at abc blockers 0 alarm 0"`),
  arith: bash(`(( x = 1<<2 )); echo "- round: 3 closed 2026-10-15T00:00:00Z at abc blockers 0 alarm 0" >> r.md\n${TOKEN(3)}`),
}
{
  const o = decide(H.orch, R.relGate, viaLink(LK.orchLink)), ok = decide(H.orch, R.relGate)
  const k = decide(H.kitDurable, null, { ...ENV, cwd: '/tmp/w' })
  const kt = decide(H.kitTmp)
  // A decision that throws (a guard reverted so a bare cd reaches path.resolve) is this clause's FAIL, not a crash.
  const u = H.unknown.map((f) => { try { return decide(f, null, { ...ENV, cwd: '/tmp/w' }) } catch (e) { return { threw: String(e) } } })
  clause('clause 1s — one literal cd before the redirect moves the base for the record and every relative gate path (R3-A): the orchestrator\'s cd && cat >> rel <<EOF names the record under the cd target and judges its gates there; the kit seat\'s cd-newline form judges its incoming gate under the cd target, not the call\'s cwd; a cd it cannot read names no record and judges the incoming text against the call\'s cwd',
    o.target === '/home/u/proj/.doctrine/records/e1.md' && refuses(o, 'gates/r1.out (resolves to /tmp/s/r1.out) lies under /tmp', 'append a correction line') && o.reasons.length === 1 && allows(ok) &&
    k.target === '/home/u/fixture/.doctrine/records/truncate.md' && allows(k) && k.round === 1 &&
    kt.target === '/tmp/k/.doctrine/records/truncate.md' && refuses(kt, '.doctrine/records/gate-r1.out.result (resolves to /tmp/k/', 'record the gate transcript at a durable path') &&
    u.every((d) => d.target === null && refuses(d, 'gates/r.out (resolves to /tmp/w/gates/r.out) lies under /tmp') && d.reasons.length === 1),
    [o, ok, k, kt, ...u].map(show).join(' '))
}
{
  // A fake filesystem: `links` maps a path to its target, `exists` lists paths that exist (and so their parents),
  // anything else is missing. The filesystems themselves are the FS table above.
  const fakeFs = (links, exists) => ({
    lstat: (p) => { if (p in links) return { isSymbolicLink: () => true }; if (exists.some((e) => e === p || e.startsWith(p + '/'))) return { isSymbolicLink: () => false }; throw new Error('ENOENT') },
    readlink: (p) => links[p],
  })
  const walk = (f) => followLinks(f.start, fakeFs(f.links, f.exists))
  const up = walk(FS.up), back = walk(FS.back), chain = walk(FS.chain), gone = walk(FS.gone)
  clause('clause 1t — followLinks walks component by component (R3-B): a target\'s .. is taken after the link before it (/durable/gates/r1.out -> hop/../r1.out with hop -> /tmp/s/nest is /tmp/s/r1.out, and /tmp/s/r1.out -> /tmp/s/hop/../r1.out with hop -> /durable/d/x is /durable/d/r1.out), a plain chain ends at its target, and a chain into a wiped dir is still followed (a cycle is 1v)',
    up === '/tmp/s/r1.out' && back === '/durable/d/r1.out' && chain === '/b/z' && gone === '/tmp/gone/r1.out', JSON.stringify({ up, back, chain, gone }))
  // A cycle, counted: the fake fs reads each link it follows, and past a budget of 200 lstat calls it answers
  // as if the path were missing, which ends any walk, so a walk with no hop cap stops here and shows its count.
  let reads = 0, lstats = 0
  const counted = fakeFs(FS.cycle.links, FS.cycle.exists)
  const bounded = followLinks(FS.cycle.start, {
    lstat: (p) => { if (++lstats > 200) throw new Error('budget'); return counted.lstat(p) },
    readlink: (p) => { reads++; return counted.readlink(p) },
  })
  clause('clause 1v — a link cycle is followed for at most 40 links and then kept as written (N1)',
    reads === 40 && lstats <= 200 && typeof bounded === 'string', JSON.stringify({ reads, lstats, bounded }))
}
{
  const hs = decide(H.hereString), hsNo = decide(H.hereStringNoToken), ar = decide(H.arith)
  clause('clause 1u — a here-string (<<<) and a << inside (( )) open no heredoc (R3-C), so the publish on the next line is read as code; without it the here-string\'s round line is refused',
    allows(hs) && hs.round === 3 && allows(ar) && ar.round === 3 && refuses(hsNo, 'does not run dctr-token.mjs') && hsNo.round === 3, [hs, hsNo, ar].map(show).join(' '))
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
// Clause 2's fixtures, in two tables listed in TABLES so clause 3 must prove each one. C holds what the hook is handed:
// append(record, n) writes round n's line into a record and appendToken also runs the publish; garbage, empty and
// nullInput are payloads it cannot read; latchGarbage a latch it cannot parse. D holds each file, link and dir the
// hook reads, by path, assigned where it is built below.
const C = {
  append: (record, n) => `echo '${LINE(n)}' >> ${record}`,
  appendToken: (record, n) => `echo '${LINE(n)}' >> ${record} && ${TOKEN(n)}`,
  garbage: '{not json',
  empty: '',
  nullInput: { session_id: 's5', tool_name: 'Bash', tool_input: null },
  latchGarbage: '{not json',
}
// Every file, link and dir the clauses below hand the hook is registered in D as it is built, and clause 3h and 3i
// prove each one by reading the disk. The other literals in clause 2 are where a fixture is judged, not fixtures: the
// environment (TMPDIR, the herdr variables, a cwd), a session id, and the payload envelope (agent_id, tool_name).
const D = { rec: path.join(durable, 'r.md'), recTmp: path.join(durable, 'rt.md') }
const { rec, recTmp } = D
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
  const cmd = C.append(rec, 3)
  const first = run(pay('s1', cmd)), again = run(pay('s1', cmd)), r4 = run(pay('s1', C.append(rec, 4))), other = run(pay('s2', cmd))
  clause('clause 2a — a round line without the token is denied with the exact PreToolUse shape, naming the publish and "refuses round 3 once"',
    denied(first, 'does not run dctr-token.mjs', 'ONE Bash call', 'Fix it and repeat the write; this guard refuses round 3 once.'), JSON.stringify(first))
  clause('clause 2b — the identical retry goes through; round 4 of the same record is refused again; another session is refused on its own latch',
    allowed(again) && denied(r4, 'round 4') && denied(other), [again, r4, other].map((x) => JSON.stringify(x)).join(' '))
  clause('clause 2c — the latch file lives in the session state directory under TMPDIR',
    fs.existsSync(path.join(scratchTmp, 'dctr-s1', 'roundguard.json')), fs.readdirSync(scratchTmp).join(','))
}
{
  const ok = run(pay('s3', C.appendToken(rec, 3)))
  const tmpRec = run(pay('s3', C.appendToken(recTmp, 3)))
  clause('clause 2d — the record on disk is read: a durable gate path with the token goes through; a TMPDIR gate path in the record is denied',
    allowed(ok) && denied(tmpRec, 'scratchpad/gate.out lies under', 'append a correction line'), `${JSON.stringify(ok)} ${JSON.stringify(tmpRec)}`)
}
{
  const cmd = C.append(rec, 3)
  const cases = [
    ['HERDR_ENV unset', run(pay('s4', cmd), { HERDR_ENV: '' })],
    ['no HERDR_WORKSPACE_ID', run(pay('s4', cmd), { HERDR_WORKSPACE_ID: '' })],
    ['no HERDR_PANE_ID', run(pay('s4', cmd), { HERDR_PANE_ID: '' })],
    ['DCTR_VIEW_REQUEST_DIR set', run(pay('s4', cmd), { DCTR_VIEW_REQUEST_DIR: tmp })],
    ['agent_id present', run(pay('s4', cmd, { agent_id: 'a1', agent_type: 'general-purpose' }))],
    ['tool is Read', run({ ...pay('s4', cmd), tool_name: 'Read', tool_input: { file_path: rec } })],
  ]
  clause('clause 2e — it stands down (no output, exit 0) outside herdr, in a contained session, for a subagent and for another tool',
    cases.every(([, r]) => allowed(r)) && !fs.existsSync(path.join(scratchTmp, 'dctr-s4', 'roundguard.json')),
    cases.filter(([, r]) => !allowed(r)).map(([n, r]) => `${n}: ${JSON.stringify(r)}`).join('; '))
}
{
  const garbage = run(C.garbage), nullInput = run(C.nullInput), empty = run(C.empty)
  clause('clause 2f — a payload that cannot be read allows the call (a crash never blocks a run)',
    allowed(garbage) && allowed(nullInput) && allowed(empty), [garbage, nullInput, empty].map((x) => JSON.stringify(x)).join(' '))
}
{
  const notDir = D.notDir = path.join(tmp, 'a-file'); fs.writeFileSync(notDir, 'x')
  const cmd = C.append(rec, 3)
  const a = run(pay('s6', cmd), { TMPDIR: notDir })
  D.badLatch = path.join(scratchTmp, 'dctr-s7', 'roundguard.json')
  fs.mkdirSync(path.dirname(D.badLatch), { recursive: true }); fs.writeFileSync(D.badLatch, C.latchGarbage)
  const b = run(pay('s7', cmd))
  // No latch yet (the read finds nothing) and a state directory the hook cannot write into: the write half fails alone.
  // As root a mode does not stop the write, so there the case is not run (it would refuse and read as a regression).
  const ro = D.roDir = path.join(scratchTmp, 'dctr-s9'); fs.mkdirSync(ro); fs.chmodSync(ro, 0o500)
  const c = process.getuid?.() === 0 ? { code: 0, out: '' } : run(pay('s9', cmd))
  // Left at 0500: clause 3h reads the mode, and removing an empty dir needs only its parent writable.
  clause('clause 2g — a latch that cannot be read (state dir path is a file, or the latch is not JSON), or cannot be written (read-only state dir), allows the call (fail open); no latch yet refuses (2a)',
    allowed(a) && allowed(b) && allowed(c), `${JSON.stringify(a)} ${JSON.stringify(b)} ${JSON.stringify(c)}`)
}
{
  const gates = path.join(durable, '.doctrine', 'records', 'gates'); fs.mkdirSync(gates, { recursive: true })
  const real = path.join(scratchTmp, 'scratchpad'); fs.mkdirSync(real, { recursive: true }); fs.writeFileSync(path.join(real, 'r1.out.result'), 'exit=0\n')
  D.gateLink = path.join(gates, 'r1.out.result'); D.gateReal = path.join(gates, 'r2.out.result')
  fs.symlinkSync(path.join(real, 'r1.out.result'), D.gateLink)
  fs.writeFileSync(D.gateReal, 'exit=0\n')
  const recLink = D.recLink = path.join(durable, 'rl.md'), recReal = D.recReal = path.join(durable, 'rr.md')
  fs.writeFileSync(recLink, '# r\n- gate: .doctrine/records/gates/r1.out.result\n')
  fs.writeFileSync(recReal, '# r\n- gate: .doctrine/records/gates/r2.out.result\n- seat ' + scratchTmp + '/agent.jsonl\n')
  const link = run(pay('s8', C.appendToken(recLink, 3))), plain = run(pay('s8', C.appendToken(recReal, 3)))
  clause('clause 2i — a relative gate path in the record that is a symlink into TMPDIR is resolved through it and denied; a real file at the same kind of path, and a .jsonl under TMPDIR, go through',
    denied(link, '.doctrine/records/gates/r1.out.result', 'lies under') && allowed(plain), `${JSON.stringify(link)} ${JSON.stringify(plain)}`)
}
// F-B: TMPDIR is a link (as /tmp and $TMPDIR are on macOS) from one durable-looking dir to another, so `$TMPDIR/g.out`
// resolves to a path under the link's target and under no tmp dir written as such.
const linkTmp = path.join(durable, 'linktmp'), realTmp = path.join(durable, 'realtmp')
fs.mkdirSync(realTmp); fs.symlinkSync(realTmp, linkTmp); fs.writeFileSync(path.join(realTmp, 'g.out'), 'ok\n')
Object.assign(D, { linkTmp, realTmp })
const recEnv = D.recEnv = path.join(durable, 're.md'), recEnvDur = D.recEnvDur = path.join(durable, 'red.md')
fs.writeFileSync(recEnv, '# r\n- gate: $TMPDIR/g.out exit=0\n'); fs.writeFileSync(recEnvDur, `# r\n- gate: ${durable}/kept/g.out exit=0\n`)
// F-C: gates/r1.out -> r1-hop.out (relative, same dir) -> <TMPDIR>/gone/r1.out, a scratchpad since wiped; its twin
// gates/r2.out -> <durable>/gone/r2.out, also dangling, under no tmp dir.
const gatesC = path.join(durable, 'c', 'gates'); fs.mkdirSync(gatesC, { recursive: true })
const goneTmp = path.join(scratchTmp, 'gone'); fs.mkdirSync(goneTmp)
fs.symlinkSync(path.join(goneTmp, 'r1.out'), path.join(gatesC, 'r1-hop.out')); fs.symlinkSync('r1-hop.out', path.join(gatesC, 'r1.out'))
fs.symlinkSync(path.join(durable, 'gone', 'r2.out'), path.join(gatesC, 'r2.out'))
fs.rmSync(goneTmp, { recursive: true })
Object.assign(D, { chainLink: path.join(gatesC, 'r1.out'), durableDangle: path.join(gatesC, 'r2.out') })
const recDangle = D.recDangle = path.join(durable, 'c', 'rd.md'), recDangleDur = D.recDangleDur = path.join(durable, 'c', 'rdd.md')
fs.writeFileSync(recDangle, R.relGate); fs.writeFileSync(recDangleDur, '# r\n- gate: gates/r2.out exit=0\n')
// F-D: a .log.result linked into TMPDIR, and a durable x.result beside a .jsonl under TMPDIR.
const recordsD = path.join(durable, 'd', '.doctrine', 'records'); fs.mkdirSync(recordsD, { recursive: true })
fs.writeFileSync(path.join(scratchTmp, 'gate-r1-npm-test.log.result'), 'exit=0\n')
fs.symlinkSync(path.join(scratchTmp, 'gate-r1-npm-test.log.result'), path.join(recordsD, 'gate-r1-npm-test.log.result'))
fs.writeFileSync(path.join(recordsD, 'x.result'), 'exit=0\n')
Object.assign(D, { logResultLink: path.join(recordsD, 'gate-r1-npm-test.log.result'), durableResult: path.join(recordsD, 'x.result') })
const recLog = D.recLog = path.join(durable, 'd', 'rl.md'), recResult = D.recResult = path.join(durable, 'd', 'rx.md')
fs.writeFileSync(recLog, '# r\n- gate `.doctrine/records/gate-r1-npm-test.log.result` reads `exit=0`\n')
fs.writeFileSync(recResult, `# r\n- gate \`.doctrine/records/x.result\` reads \`exit=0\`\n- seat ${scratchTmp}/agent.jsonl\n`)
{
  const throughLink = run(pay('s10', C.appendToken(recEnv, 3)), { TMPDIR: linkTmp })
  const plain = run(pay('s10', C.appendToken(recEnvDur, 3)), { TMPDIR: linkTmp })
  clause('clause 2j — with TMPDIR a symlink, $TMPDIR/g.out resolves under the link\'s real target and is denied there (F-B); a gate path beside that target, under no tmp dir, goes through',
    denied(throughLink, `$TMPDIR/g.out (resolves to ${realTmp}/g.out) lies under ${realTmp}`) && allowed(plain), `${JSON.stringify(throughLink)} ${JSON.stringify(plain)}`)
}
{
  const cwd = path.join(durable, 'c')
  const gone = run(pay('s11', C.appendToken(recDangle, 3), { cwd })), dur = run(pay('s11', C.appendToken(recDangleDur, 3), { cwd }))
  clause('clause 2k — a gate path that is a chain of symlinks ending in a wiped tmp dir is followed to its missing target and denied (F-C); a dangling link into a durable dir goes through',
    denied(gone, `gates/r1.out (resolves to ${goneTmp}/r1.out) lies under`) && allowed(dur), `${JSON.stringify(gone)} ${JSON.stringify(dur)}`)
}
{
  const cwd = path.join(durable, 'd')
  const log = run(pay('s12', C.appendToken(recLog, 3), { cwd })), x = run(pay('s12', C.appendToken(recResult, 3), { cwd }))
  clause('clause 2l — a .log.result linked into TMPDIR is denied (PATHEXT); a durable x.result and a .jsonl under TMPDIR go through',
    denied(log, '.doctrine/records/gate-r1-npm-test.log.result', 'lies under') && allowed(x), `${JSON.stringify(log)} ${JSON.stringify(x)}`)
}
// R3-A: the orchestrator's form, run from a cwd that is not the record's repo. proj's record names gates/r1.out, a link
// into TMPDIR; proj2's names a real file at the same path. The call's own cwd holds a record of the same relative
// name that names nothing, which is what a guard reading the wrong record sees.
const projA = path.join(durable, 'proj'), projB = path.join(durable, 'proj2'), elsewhere = path.join(durable, 'elsewhere')
for (const d of [projA, projB, elsewhere]) fs.mkdirSync(path.join(d, '.doctrine', 'records'), { recursive: true })
for (const d of [projA, projB]) fs.mkdirSync(path.join(d, 'gates'))
fs.writeFileSync(path.join(scratchTmp, 'r1-a.out'), 'ok\n'); fs.symlinkSync(path.join(scratchTmp, 'r1-a.out'), path.join(projA, 'gates', 'r1.out'))
fs.writeFileSync(path.join(projB, 'gates', 'r1.out'), 'ok\n')
for (const d of [projA, projB]) fs.writeFileSync(path.join(d, '.doctrine', 'records', 'e1.md'), R.relGate)
fs.writeFileSync(path.join(elsewhere, '.doctrine', 'records', 'e1.md'), R.fresh)
Object.assign(D, { projA, projB, elsewhere, recA: path.join(projA, '.doctrine', 'records', 'e1.md'), recB: path.join(projB, '.doctrine', 'records', 'e1.md') })
// H.orch with its cd moved to a scratch repo.
const orch = (dir) => H.orch[1].command.replace('/home/u/proj', dir)
{
  const a = run(pay('s13', orch(projA), { cwd: elsewhere })), b = run(pay('s13', orch(projB), { cwd: elsewhere }))
  clause('clause 2m — cd <repo> && cat >> rel.md <<EOF from another cwd reads the record under the cd target (R3-A): its gate linked into TMPDIR is denied with the append-a-correction reason; the same record with a real file there goes through',
    denied(a, 'gates/r1.out (resolves to', 'append a correction line') && allowed(b), `${JSON.stringify(a)} ${JSON.stringify(b)}`)
}
// R3-B: gates/r1.out -> hop/../r1.out with hop -> <TMPDIR>/nest lands in TMPDIR; <TMPDIR>/fh/r1.out ->
// <TMPDIR>/fh/hop/../r1.out with hop -> a durable dir lands outside every tmp dir.
const bDir = path.join(durable, 'b'), bGates = path.join(bDir, 'gates'), nest = path.join(scratchTmp, 'nest'), fh = path.join(scratchTmp, 'fh'), b2x = path.join(durable, 'b2', 'x')
for (const d of [bGates, nest, fh, b2x]) fs.mkdirSync(d, { recursive: true })
fs.symlinkSync(nest, path.join(bGates, 'hop')); fs.symlinkSync('hop/../r1.out', path.join(bGates, 'r1.out')); fs.writeFileSync(path.join(scratchTmp, 'r1.out'), 'ok\n')
fs.symlinkSync(b2x, path.join(fh, 'hop')); fs.symlinkSync(`${fh}/hop/../r1.out`, path.join(fh, 'r1.out')); fs.writeFileSync(path.join(durable, 'b2', 'r1.out'), 'ok\n')
const recUp = path.join(bDir, 'ru.md'), recBack = path.join(bDir, 'rb.md')
fs.writeFileSync(recUp, R.relGate); fs.writeFileSync(recBack, `# r\n- gate: ${fh}/r1.out exit=0\n`)
Object.assign(D, { recUp, recBack, upLink: path.join(bGates, 'r1.out'), backLink: path.join(fh, 'r1.out') })
{
  const up = run(pay('s14', C.appendToken(recUp, 3), { cwd: bDir })), back = run(pay('s14', C.appendToken(recBack, 3), { cwd: bDir }))
  clause('clause 2n — a link target\'s .. is taken after the link before it (R3-B): gates/r1.out -> hop/../r1.out with hop into TMPDIR is denied; a TMPDIR path whose target climbs out through a link to a durable dir goes through',
    denied(up, `gates/r1.out (resolves to ${scratchTmp}/r1.out) lies under`) && allowed(back), `${JSON.stringify(up)} ${JSON.stringify(back)}`)
}
clause('clause 2h — herdr was called zero times across every run (tripwire on PATH)', !fs.existsSync(tripwire), 'the tripwire herdr ran')

// ---------------------------------------------------------------- clause 3: the fixtures carry their defects

// The registry (RT6): every fixture table a clause decides on, and each clause-3 proof obtains its fixture through
// prove(), which records `<table>.<key>` as the proof runs. Clause 3n enumerates every table's keys at run time and
// names each one no proof obtained. A table left out of TABLES is not enumerated.
const TABLES = { F, R, G, GR, H, LK, FS, C, D }
const proved = new Set()
const prove = (table, key) => {
  if (!Object.hasOwn(TABLES[table] ?? {}, key)) throw new Error(`no fixture ${table}.${key}`)
  proved.add(`${table}.${key}`)
  return TABLES[table][key]
}
const unproved = (tables, done) => Object.entries(tables).flatMap(([t, tab]) => Object.keys(tab).map((k) => `${t}.${k}`)).filter((x) => !done.has(x))


const isRound = (t) => String(t).split('\n').some((l) => parseRecord(l.trim()).entries.some((e) => e.kind === 'round'))
const unquoted = (cmd) => cmd.replace(/'/g, '').replace(/"/g, '').replace(/\$\(date[^)]*\)/, '2026-10-14T10:00:00Z').replace(/\$\(git[^)]*\)/, 'abc1234')
const lines = (cmd) => unquoted(cmd).split(/\n|\\n/).map((l) => l.replace(/^\s*echo /, '').replace(/\s*(>>|\|).*$/, ''))
clause('clause 3a — every refused fixture carries a round line the parser reads, the Bash ones once the shell has run, and the template fixture carries none',
  [prove('F', 'bashNoToken'), prove('F', 'bashDateNoToken'), prove('F', 'heredocNoToken'), prove('F', 'teeNoToken'), prove('F', 'mentionToken')].every(([, i]) => lines(i.command).some(isRound)) &&
  isRound(prove('F', 'writeMd')[1].content) && isRound(prove('F', 'writeMjs')[1].content) && isRound(prove('F', 'editMd')[1].new_string) && !isRound(prove('F', 'template')[1].content),
  'a defective fixture carries no round line, or the template does')
clause('clause 3b — no refused-for-publish Bash fixture runs node on dctr-token.mjs, and every allowed twin does',
  [prove('F', 'bashNoToken'), prove('F', 'bashDateNoToken'), prove('F', 'heredocNoToken'), prove('F', 'teeNoToken'), prove('F', 'mentionToken')].every(([, i]) => !/node\s+\S*dctr-token/.test(i.command)) &&
  [prove('F', 'bashToken'), prove('F', 'bashDateToken'), prove('F', 'heredocToken')].every(([, i]) => /node\s+"?\S*dctr-token\.mjs/.test(i.command)), 'a fixture does not carry what its clause rests on')
clause('clause 3c — each tmp-path record names a gate-shaped path that starts with a tmp dir, and each durable twin does not',
  ['/tmp/x/gate.out', '/tmp/claude-1000/s/scratchpad/gate.out.result', '/var/tmpx/m.output'].every((p, i) => [prove('R', 'tmpOut'), prove('R', 'tmpResult'), prove('R', 'tmpOutput')][i].includes(p)) &&
  ![prove('R', 'homeOut'), prove('R', 'homeResult'), prove('R', 'tmpJsonl'), fs.readFileSync(prove('D', 'rec'), 'utf8')].some((t) => /(\/tmp|\/var\/tmpx)\/\S*\.(out|output)\b/.test(t)) && !prove('R', 'relOut').includes(' /') && prove('R', 'relGates').includes(' gates/r1.out.result') && prove('R', 'envTmp').includes('$TMPDIR/g.out'),
  'a record fixture does not carry what its clause rests on')

{
  const T = '2026-10-14T10:00:00Z', body = (n) => `- round: ${n} closed ${T} at abc1234 blockers 0 alarm 0`
  const ran = [
    [prove('F', 'dateQuoted')[1].command.replace('$(date -u +"%Y-%m-%dT%H:%M:%SZ")', T), body(3)],
    [prove('F', 'nested')[1].command.replace('$(date -u +%FT%TZ)', T).replace('$(basename "$(pwd)")', 'abc1234'), body(3)],
    [prove('F', 'python')[1].command, 'round: 1 closed 2026-10-14T00:00:00Z at abc1234 blockers 0 alarm 0'],
  ]
  clause('clause 3d — without the guard: each H2 fixture, its expansions replaced by hand, holds a line the parser reads as a round line',
    ran.every(([c, l]) => c.includes(l) && isRound(l)), 'an H2 fixture does not carry its round line')
  clause('clause 3e — without the guard: each H3 fixture holds the literal text `node /p/hooks/dctr-token.mjs`, so a text match would read it as a publish',
    [prove('F', 'commentToken'), prove('F', 'commentSepToken'), prove('F', 'printfToken'), prove('F', 'printfSepToken'), prove('F', 'echoToken'), prove('F', 'echoSepToken'), prove('F', 'heredocBodyToken')].every(([, i]) => /node \/p\/hooks\/dctr-token\.mjs/.test(i.command)) &&
    [prove('F', 'commentSepToken'), prove('F', 'echoSepToken'), prove('F', 'printfSepToken')].every(([, i]) => /(?:;|&&) node \/p\/hooks\/dctr-token\.mjs/.test(i.command)), 'an H3 fixture does not carry the decoy')
}
{
  const T = '2026-10-14T10:00:00Z'
  const decoded = (f) => f[1].command.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  clause('clause 3f — without the guard: each F-A fixture carries /tmp/x/r2.out glued to a literal \\n or \\t, and once those are decoded by hand that path stands alone on its line and the round line parses',
    [prove('G', 'printfTmpGate'), prove('G', 'echoTabTmpGate')].every((f) => /\\[nt]\/tmp\/x\/r2\.out\\n|\/tmp\/x\/r2\.out\\n/.test(f[1].command) && decoded(f).split(/\s/).includes('/tmp/x/r2.out') && decoded(f).split('\n').some((l) => isRound(l.replace(/["'].*$/, '')))) &&
    !prove('G', 'printfHomeGate')[1].command.includes('/tmp/'),
    'an F-A fixture does not carry its glued path')
  clause('clause 3g — without the guard: each captured form carries its round line once $T is replaced by hand, and each delimiter fixture holds the decoy publish between its opening and its terminator as the shell reads it',
    [prove('G', 'heredocDollarT'), prove('G', 'heredocDollarTToken'), prove('G', 'heredocDollarTAfter')].every(([, i]) => isRound(i.command.replace('$T', T))) && isRound(prove('G', 'printfNoToken')[1].command.split('\\n')[1]) &&
    [[prove('G', 'delimDash'), 'END-RECORD'], [prove('G', 'delimDouble'), 'EOF'], [prove('G', 'delimTab'), '\tEOF']].every(([f, end]) => { const l = f[1].command.split('\n'); return l.indexOf(end) > l.findIndex((x) => x.includes('dctr-token.mjs')) && l.findIndex((x) => x.includes('dctr-token.mjs')) > 0 }),
    'a captured-form fixture does not carry what its clause rests on')
}
{
  // Clause 2's disk fixtures (D), read here with lstat, readlink, readFileSync and the kernel's realpath, never through
  // the hook. `inside` is whether a path lies under a dir.
  const inside = (p, d) => p === d || p.startsWith(d + '/')
  const text = (k) => fs.readFileSync(prove('D', k), 'utf8')
  const link = (k) => { const p = prove('D', k); return fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : null }
  const plainFile = (k) => { const p = prove('D', k); return !fs.lstatSync(p).isSymbolicLink() && fs.statSync(p).isFile() }
  const tmpRoots = ['/tmp', os.tmpdir()].map((d) => fs.realpathSync.native(d))
  const durableOk = !tmpRoots.some((d) => inside(fs.realpathSync.native(durable), d)) && !tmpRoots.some((d) => inside(os.homedir(), d))
  clause('clause 3h — without the guard: the latch and payload fixtures of 2a to 2g: rec names a ~/ gate under a home outside every tmp dir, recTmp a gate under TMPDIR, notDir is a file, badLatch is not JSON, roDir has mode 0500, the garbage payloads do not parse, empty is empty and nullInput has a null tool_input',
    durableOk && text('rec').includes('~/gates/g.out') && text('recTmp').includes(`${scratchTmp}/scratchpad/gate.out`) && inside(scratchTmp, tmp) &&
    fs.lstatSync(prove('D', 'notDir')).isFile() && (() => { try { JSON.parse(text('badLatch')); return false } catch { return true } })() &&
    (fs.statSync(prove('D', 'roDir')).mode & 0o777) === 0o500 &&
    [prove('C', 'garbage'), prove('C', 'latchGarbage')].every((t) => { try { JSON.parse(t); return false } catch { return true } }) &&
    text('badLatch') === C.latchGarbage && prove('C', 'empty') === '' && prove('C', 'nullInput').tool_input === null,
    'a latch, payload or record fixture of 2a to 2g does not carry what its clause rests on')
  clause('clause 3i — without the guard: each link fixture of 2i to 2n is what its clause names: gateLink and logResultLink and projA\'s gate link into TMPDIR, gateReal and durableResult and projB\'s gate are plain files, linkTmp links to realTmp outside every tmp dir, chainLink is r1-hop.out then a missing path under TMPDIR, durableDangle a missing durable path, upLink hop/../r1.out with hop into TMPDIR, backLink climbs out of TMPDIR through a link to a durable dir; each record names the path its clause judges',
    inside(link('gateLink'), scratchTmp) && plainFile('gateReal') &&
    text('recLink').includes('.doctrine/records/gates/r1.out.result') && path.join(durable, '.doctrine/records/gates/r1.out.result') === prove('D', 'gateLink') &&
    text('recReal').includes('.doctrine/records/gates/r2.out.result') && text('recReal').includes(`${scratchTmp}/agent.jsonl`) &&
    link('linkTmp') === prove('D', 'realTmp') && !tmpRoots.some((d) => inside(prove('D', 'realTmp'), d)) && fs.existsSync(path.join(realTmp, 'g.out')) &&
    text('recEnv').includes('$TMPDIR/g.out') && text('recEnvDur').includes(`${durable}/kept/g.out`) &&
    link('chainLink') === 'r1-hop.out' && inside(fs.readlinkSync(path.join(gatesC, 'r1-hop.out')), scratchTmp) && !fs.existsSync(fs.readlinkSync(path.join(gatesC, 'r1-hop.out'))) &&
    inside(link('durableDangle'), durable) && !fs.existsSync(link('durableDangle')) && text('recDangle').includes('gates/r1.out') && text('recDangleDur').includes('gates/r2.out') &&
    inside(link('logResultLink'), scratchTmp) && plainFile('durableResult') && text('recLog').includes('.doctrine/records/gate-r1-npm-test.log.result') &&
    text('recResult').includes('.doctrine/records/x.result') && text('recResult').includes(`${scratchTmp}/agent.jsonl`) &&
    text('recA').includes('gates/r1.out') && text('recB').includes('gates/r1.out') &&
    inside(fs.realpathSync.native(path.join(prove('D', 'projA'), 'gates', 'r1.out')), scratchTmp) && !fs.lstatSync(path.join(prove('D', 'projB'), 'gates', 'r1.out')).isSymbolicLink() &&
    !/gate/.test(fs.readFileSync(path.join(prove('D', 'elsewhere'), '.doctrine', 'records', 'e1.md'), 'utf8')) &&
    link('upLink') === 'hop/../r1.out' && fs.realpathSync.native(prove('D', 'upLink')) === path.join(scratchTmp, 'r1.out') && text('recUp').includes('gates/r1.out') &&
    link('backLink') === `${fh}/hop/../r1.out` && fs.realpathSync.native(prove('D', 'backLink')) === path.join(durable, 'b2', 'r1.out') && text('recBack').includes(`${fh}/r1.out`),
    'a link fixture does not carry what its clause rests on')
}
{
  // The pure clauses' fake links (LK) and filesystems (FS), and the records they are paired with.
  const tmpish = (p) => p.startsWith('/tmp/') || p.startsWith('/var/tmpx/')
  clause('clause 3p — without the guard: each LK link maps the absolute path its record names (relative to the cwd its clause uses) out of no tmp dir into /tmp; fresh carries no round line and no gate, relGate names gates/r1.out',
    prove('LK', 'relGatesLink').from === path.resolve('/home/u/r', 'gates/r1.out.result') && R.relGates.includes('gates/r1.out.result') &&
    prove('LK', 'logStem').from === path.resolve('/home/u/r', '.doctrine/records/gate-r1-npm-test.log') && GR.logPair.includes('.doctrine/records/gate-r1-npm-test.log') &&
    prove('LK', 'orchLink').from === path.resolve('/home/u/proj', 'gates/r1.out') && prove('R', 'relGate').includes('gates/r1.out') &&
    Object.values(LK).every((l) => !tmpish(l.from) && l.to.startsWith('/tmp/')) && !isRound(prove('R', 'fresh')) && !/\.(out|output|result)\b/.test(R.fresh),
    'an LK link or an R record does not carry what its clause rests on')
  const fsx = (k) => prove('FS', k)
  const reach = (f, p) => f.exists.some((e) => e === p || e.startsWith(p + '/'))
  clause('clause 3q — without the guard: each FS filesystem encodes the structure its clause names: up a relative hop/../ target whose hop links into /tmp/s, back an absolute hop/../ target whose hop links to a durable dir, chain two links ending at an existing /b/z, gone two links ending under a /tmp/gone that does not exist, cycle two links that point at each other on the start path',
    fsx('up').links[FS.up.start] === 'hop/../r1.out' && FS.up.links['/durable/gates/hop'].startsWith('/tmp/s/') && reach(FS.up, '/tmp/s/r1.out') &&
    fsx('back').links[FS.back.start] === '/tmp/s/hop/../r1.out' && FS.back.links['/tmp/s/hop'].startsWith('/durable/') && reach(FS.back, '/durable/d/r1.out') &&
    fsx('chain').links[FS.chain.start] === 'y' && FS.chain.links['/a/y'] === '/b/z' && reach(FS.chain, '/b/z') &&
    fsx('gone').links[FS.gone.start] === 'h.out' && FS.gone.links['/d/h.out'] === '/tmp/gone/r1.out' && !reach(FS.gone, '/tmp/gone') &&
    fsx('cycle').links['/c/p'] === 'q' && FS.cycle.links['/c/q'] === 'p' && FS.cycle.start.startsWith('/c/p/'),
    'an FS filesystem does not encode the structure its clause names')
}
{
  // Without the decision, the remaining fixtures as text: each refused one carries the round line or gate path its
  // refusal rests on, and each allowed twin differs from it only in what its clause says decides it.
  const under = (p, cwd) => ['/tmp/', '/var/tmpx/'].some((d) => path.resolve(cwd, p).startsWith(d))
  clause('clause 3j — without the guard: the record fixtures name what their clauses rest on: homeTmp a ~/gate.out that lies under /tmp once home is /tmp/h, relResult a relative .out.result and logPair and launch a .log.result (and its .log stem) that lie under a tmp cwd, and durableResult only a durable x.result and a .jsonl',
    prove('R', 'homeTmp').includes('~/gate.out') && path.join('/tmp/h', 'gate.out').startsWith('/tmp/') &&
    prove('GR', 'relResult').includes('`.doctrine/records/gate-r1-npm-test.out.result`') && under('.doctrine/records/gate-r1-npm-test.out.result', '/tmp/w') &&
    [prove('GR', 'logPair'), prove('GR', 'launch')].every((t) => t.includes('.doctrine/records/gate-r1-npm-test.log.result') && /\.doctrine\/records\/gate-r1-npm-test\.log[\s`]/.test(t)) && under('.doctrine/records/gate-r1-npm-test.log', '/tmp/w') &&
    prove('GR', 'durableResult').includes('/home/u/r/x.result') && !under('/home/u/r/x.result', '/') && !/\.(out|output|result)\b/.test(prove('GR', 'durableResult').replace('/home/u/r/x.result', '')),
    'a record fixture does not carry what its clause rests on')
  clause('clause 3k — without the guard: editTs carries a round line and differs from a record write only in its .ts path; rewrite carries rounds 1 and 2, every one of them already in old12, so only the fresh record makes them new',
    isRound(prove('F', 'editTs')[1].new_string) && prove('F', 'editTs')[1].file_path.endsWith('.ts') &&
    isRound(prove('F', 'rewrite')[1].content) && prove('F', 'rewrite')[1].content.split('\n').filter(isRound).every((l) => prove('R', 'old12').split('\n').includes(l)) && !isRound('# r\n'),
    'editTs or rewrite does not carry what its clause rests on')
  const unknownCd = /^(?:cd "\$D"|cd -|cd ~\/proj|cd|cd \/home\/u\/a && cd \/home\/u\/b|cd -P \/home\/u\/proj) && cat >> rec\.md <<EOF\n/
  clause('clause 3l — without the guard: each unknown fixture opens with the cd form it names (an expansion, cd -, cd ~/..., a bare cd, two cds, an option) and carries a round line and the relative gates/r.out, which lies under the tmp cwd /tmp/w',
    prove('H', 'unknown').length === 6 && prove('H', 'unknown').every(([, i]) => unknownCd.test(i.command) && isRound(i.command.split('\n')[2]) && i.command.includes('- gate gates/r.out')) && under('gates/r.out', '/tmp/w') &&
    isRound(prove('H', 'orch')[1].command.split('\n')[2]) && prove('H', 'orch')[1].command.startsWith('cd /home/u/proj && cat >> .doctrine/records/e1.md <<EOF\n') &&
    [['kitDurable', '/home/u/fixture'], ['kitTmp', '/tmp/k']].every(([k, dir]) => { const c = prove('H', k)[1].command; return c.startsWith(`cd ${dir}\n`) && c.includes('- gate .doctrine/records/gate-r1.out.result') && isRound(c.split('\n')[4].replace('$T', '2026-10-14T10:00:00Z')) }) &&
    path.resolve('/tmp/k', '.doctrine/records/gate-r1.out.result').startsWith('/tmp/') && !path.resolve('/home/u/fixture', '.doctrine/records/gate-r1.out.result').startsWith('/tmp/') &&
    isRound(prove('F', 'inTextGate')[1].command.split("'")[1]) && F.inTextGate[1].command.split("'")[1].split(' ').includes('/tmp/g.output'),
    'an unknown, orch or kit fixture does not carry the form its clause names')

  // The shell's own reading, without the guard: each command run by real bash with a stub `node` first on PATH that
  // prints its argv, the record paths moved into a scratch dir. RAN is a publish the shell really runs.
  const stub = path.join(tmp, 'stub'); fs.mkdirSync(stub)
  fs.writeFileSync(path.join(stub, 'node'), '#!/bin/sh\necho "RAN $*"\n'); fs.chmodSync(path.join(stub, 'node'), 0o755)
  const sh = (cmd, cwd) => {
    fs.mkdirSync(cwd, { recursive: true })
    const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env: { ...process.env, PATH: `${stub}:${process.env.PATH}` } })
    return { out: r.stdout, code: r.status }
  }
  const box = path.join(durable, 'bash'), recB = path.join(box, 'r.md')
  fs.mkdirSync(path.join(box, '.doctrine', 'records'), { recursive: true })
  const moved = (f) => f[1].command.split(REC).join(recB)
  const ranRound = (n, f, cwd = box, rec = recB) => {
    fs.rmSync(rec, { force: true })
    const r = sh(f, cwd), text = fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8') : ''
    return { ran: r.out.includes(`RAN /p/hooks/dctr-token.mjs ${n} 0 0`), round: isRound(text), out: r.out }
  }
  const twins = [
    ['hereString', ranRound(3, prove('H', 'hereString')[1].command, box, path.join(box, 'r.md')), true],
    ['hereStringNoToken', ranRound(3, prove('H', 'hereStringNoToken')[1].command, box, path.join(box, 'r.md')), false],
    ['arith', ranRound(3, prove('H', 'arith')[1].command, box, path.join(box, 'r.md')), true],
    ['dateQuotedToken', ranRound(3, moved(prove('F', 'dateQuotedToken'))), true],
    ['delimDashToken', ranRound(4, moved(prove('G', 'delimDashToken'))), true],
    ['delimDoubleToken', ranRound(4, moved(prove('G', 'delimDoubleToken'))), true],
    ['delimTabToken', ranRound(4, moved(prove('G', 'delimTabToken'))), true],
    ['delimDash', ranRound(4, moved(prove('G', 'delimDash'))), false],
    ['delimDouble', ranRound(4, moved(prove('G', 'delimDouble'))), false],
    ['delimTab', ranRound(4, moved(prove('G', 'delimTab'))), false],
    // RT6-1 and MR6-B1(d): the printf form and the T=$(date) heredoc form, the publish on the `<<EOF &&` line or after
    // EOF, each beside its refused twin.
    ['printfToken', ranRound(1, prove('G', 'printfToken')[1].command, box, path.join(box, 'rec.md')), true],
    ['printfNoToken', ranRound(1, prove('G', 'printfNoToken')[1].command, box, path.join(box, 'rec.md')), false],
    ['heredocDollarTToken', ranRound(1, prove('G', 'heredocDollarTToken')[1].command, box, path.join(box, RT)), true],
    ['heredocDollarTAfter', ranRound(1, prove('G', 'heredocDollarTAfter')[1].command, box, path.join(box, RT)), true],
    ['heredocDollarT', ranRound(1, prove('G', 'heredocDollarT')[1].command, box, path.join(box, RT)), false],
    ['inTextGate', ranRound(3, moved(prove('F', 'inTextGate'))), true],
    // C's two builders, as every clause-2 call uses them.
    ['C.appendToken', ranRound(3, prove('C', 'appendToken')(recB, 3)), true],
    ['C.append', ranRound(3, prove('C', 'append')(recB, 3)), false],
  ]
  const projX = path.join(box, 'proj'), kitX = path.join(box, 'fixture'), away = path.join(box, 'away')
  fs.mkdirSync(path.join(projX, '.doctrine', 'records'), { recursive: true }); fs.mkdirSync(path.join(kitX, '.doctrine', 'records'), { recursive: true })
  const orchRun = ranRound(3, prove('H', 'orch')[1].command.replace('/home/u/proj', projX), away, path.join(projX, '.doctrine', 'records', 'e1.md'))
  const kitRun = ranRound(1, prove('H', 'kitDurable')[1].command.replace('/home/u/fixture', kitX), away, path.join(kitX, '.doctrine', 'records', 'truncate.md'))
  // F-A under the shell: printf and echo -e decode the escape, so the gate path lands on a line of its own.
  const decodedLine = (f, want) => { fs.rmSync(path.join(box, 'rec.md'), { force: true }); sh(f[1].command, box); return fs.readFileSync(path.join(box, 'rec.md'), 'utf8').split('\n').includes(want) }
  const glued = [['printfTmpGate', '- gate /tmp/x/r2.out'], ['echoTabTmpGate', '- gate\t/tmp/x/r2.out']].filter(([k, want]) => !decodedLine(prove('G', k), want))
  // MR12-B1 under the shell: the escaped backticks reach the record unescaped, and the command really carries \`.
  const unescaped = (f, want) => { const p = path.join(box, RT); fs.rmSync(p, { force: true }); sh(f[1].command, box); const r = fs.readFileSync(p, 'utf8'); return f[1].command.includes('\\`') && r.includes(want) && !r.includes('\\`') && r.split('\n').some(isRound) }
  const escaped = [['heredocEscTick', '`/tmp/x/r3.out`'], ['heredocEscTickHome', '`/home/u/r/r3.out`']].filter(([k, want]) => !unescaped(prove('G', k), want))
  const wrong = [...twins, ['orch', orchRun, true], ['kit', kitRun, true]].filter(([, r, ran]) => r.ran !== ran || !r.round)
    .concat(glued.map(([k]) => [k, { decoded: false }]), escaped.map(([k]) => [k, { unescaped: false }]))
  clause('clause 3m — without the guard, under real bash with a stub node: each allowed twin (hereString, arith, dateQuotedToken, the delim*Token forms, printfToken, heredocDollarTToken with the publish on the <<EOF && line, heredocDollarTAfter with it after EOF) writes its round line and runs the publish, each refused one (hereStringNoToken, delimDash, delimDouble, delimTab, printfNoToken, heredocDollarT) writes it and runs none, orch and kit, run from another cwd, write the record under their cd target, printfTmpGate and echoTabTmpGate put /tmp/x/r2.out on a line of its own, and heredocEscTick and heredocEscTickHome carry \\` and write their gate path in plain backticks beside a round line',
    wrong.length === 0 && !fs.existsSync(path.join(away, '.doctrine')), wrong.map(([k, r]) => `${k}: ${JSON.stringify(r)}`).join('; '))
}
{
  // The meta-check, read at run time: every key of every table in TABLES that no clause-3 proof obtained.
  const left = unproved(TABLES, proved)
  clause('clause 3n — every fixture in every table of TABLES was obtained by a clause-3 proof through prove()', left.length === 0, `unproved: ${left.join(' ')}`)
  const S = { seen: 1, tmpOut2: 2 }, done = new Set(['S.seen'])
  clause('clause 3o — the meta-check trips: over a synthetic table whose key tmpOut2 no proof obtained it names S.tmpOut2 and only that; the synthetic really holds tmpOut2 unrecorded',
    JSON.stringify(unproved({ S }, done)) === '["S.tmpOut2"]' && Object.hasOwn(S, 'tmpOut2') && !done.has('S.tmpOut2') && done.has('S.seen'),
    JSON.stringify(unproved({ S }, done)))
}
fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(durable, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
