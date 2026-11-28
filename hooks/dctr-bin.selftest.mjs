// Behavioral tamper test for bin/dctr, the runtime's one entry command (E19, W11), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-bin.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Clause 1 trips: an unknown subcommand and an unknown second word exit 2, `--help` runs no script, and a skill
// text naming a subcommand the command lacks is caught. Clause 2 stays quiet on the real thing: `--version` is the
// runtime manifest's version, every subcommand and second word answers `--help`, a run passes its argv and exit
// code through, and every `dctr` use the skills name answers `--help`. Clause 3 proves the fixtures carry what
// they are built to carry without running the command.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

let bad = 0
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const ROOT = path.join(import.meta.dirname, '..')
const DCTR = path.join(ROOT, 'bin', 'dctr')
const SKILLS = path.join(ROOT, 'plugins', 'doctrine', 'skills')
const run = (file, args, opts = {}) => {
  const r = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...opts })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' }
}
const version = (f) => JSON.parse(fs.readFileSync(f, 'utf8')).version

// A copy of bin/dctr beside a fake hooks/ whose every script records its argv and exits 7.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-bin-'))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
fs.mkdirSync(path.join(tmp, 'bin')); fs.mkdirSync(path.join(tmp, 'hooks'))
const FAKE = path.join(tmp, 'bin', 'dctr')
if (fs.existsSync(DCTR)) fs.copyFileSync(DCTR, FAKE)
const trip = path.join(tmp, 'ran.log')
for (const f of fs.readdirSync(path.join(ROOT, 'hooks')).filter((f) => /^dctr-[a-z-]+\.mjs$/.test(f) && !f.includes('selftest'))) {
  fs.writeFileSync(path.join(tmp, 'hooks', f), `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(trip)}, JSON.stringify([${JSON.stringify(f)}, ...process.argv.slice(2)]) + '\\n')\nprocess.exit(7)\n`)
}
const ran = () => (fs.existsSync(trip) ? fs.readFileSync(trip, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

// Every `dctr <w1> [<w2>]` a text names in a code span or a fenced line: E19-D5's reading, offline.
function named(text) {
  const code = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
  let fence = false
  for (const l of text.split('\n')) { if (/^\s*```/.test(l)) { fence = !fence; continue } if (fence) code.push(l) }
  const out = new Set()
  for (const c of code) for (const m of c.replace(/\s+/g, ' ').matchAll(/(?:^|[\s;&|(])dctr ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?/g)) out.add(m[2] ? `${m[1]} ${m[2]}` : m[1])
  return [...out]
}
// A named use answers when `dctr w1 w2 --help` exits 0, or `dctr w1 --help` does and its usage takes an argument there.
function answers(file, use) {
  const [w1, w2] = use.split(' ')
  if (w2) {
    if (run(file, [w1, w2, '--help']).code === 0) return true
    const top = run(file, [w1, '--help'])
    return top.code === 0 && new RegExp(`dctr ${w1} <`).test(top.out)
  }
  return run(file, [w1, '--help']).code === 0
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const HOOKPATH = /(<plugin-root>|CLAUDE_PLUGIN_ROOT\}?|PLUGIN_ROOT\}?)\/hooks\/|\bhooks\/dctr-/

// ---- clause 1: it trips
const unk = run(FAKE, ['frobnicate', '--help'])
clause('1a an unknown subcommand exits 2 naming it', unk.code === 2 && /frobnicate/.test(unk.out), JSON.stringify(unk))
const unk2 = run(FAKE, ['project', 'chek', '--help'])
clause('1b an unknown second word of a subcommand with listed words exits 2 naming it', unk2.code === 2 && /chek/.test(unk2.out), JSON.stringify(unk2))
const before = ran().length
for (const a of [['gate', '--help'], ['project', 'check', '--help'], ['send', 'report', '--help'], ['codex', 'install', '--help']]) run(FAKE, a)
clause('1c --help runs no script', ran().length === before, JSON.stringify(ran()))
clause('1d a skill text naming a subcommand the command lacks is caught', fs.existsSync(DCTR) && !answers(DCTR, 'project chek') && !answers(DCTR, 'frobnicate'), 'answers() accepted a use the command lacks')

// ---- clause 2: quiet on the real thing
const runtimeV = version(path.join(ROOT, '.claude-plugin', 'plugin.json'))
const v = run(DCTR, ['--version'])
clause('2a --version prints the runtime manifest version', v.code === 0 && v.stdout.trim() === runtimeV, JSON.stringify(v) + ' want ' + runtimeV)
const vs = [path.join(ROOT, 'plugin.json'), path.join(ROOT, 'plugins', 'doctrine', '.claude-plugin', 'plugin.json'), path.join(ROOT, 'plugins', 'doctrine', 'plugin.json')].map(version)
const direct = spawnSync(DCTR, ['--version'], { encoding: 'utf8' })
clause('2a2 bin/dctr is executable and runs by its own name', (fs.statSync(DCTR).mode & 0o111) !== 0 && direct.status === 0 && direct.stdout.trim() === runtimeV, JSON.stringify({ status: direct.status, out: direct.stdout, err: String(direct.error || '') }))
fs.rmSync(trip, { force: true })
const gateRun = run(FAKE, ['gate', 'l', 'o', '--', 'npm', 'test', '--help'])
clause('2a3 a --help inside the command after -- is passed through, not answered', gateRun.code === 7 && JSON.stringify(ran()) === JSON.stringify([['dctr-gate.mjs', 'l', 'o', '--', 'npm', 'test', '--help']]), JSON.stringify({ gateRun, ran: ran() }))
clause('2b every manifest carries the runtime version (one release)', vs.every((x) => x === runtimeV), JSON.stringify(vs))
const help = run(DCTR, ['--help'])
const subs = [...help.stdout.matchAll(/^\s*dctr ([a-z][a-z-]*)(?: ([a-z][a-z-]*|<[^>]+>))?/gm)].map((m) => [m[1], m[2]])
const fails = subs.filter(([a, b]) => run(DCTR, b && !b.startsWith('<') ? [a, b, '--help'] : [a, '--help']).code !== 0)
clause('2c every subcommand and second word the usage lists answers --help', help.code === 0 && subs.length >= 11 && !fails.length, JSON.stringify({ code: help.code, n: subs.length, fails }))
fs.rmSync(trip, { force: true })
const pass = run(FAKE, ['project', 'check', '/a b', '--x'])
clause('2d a run passes argv and exit code through', pass.code === 7 && JSON.stringify(ran()) === JSON.stringify([['dctr-project.mjs', 'check', '/a b', '--x']]), JSON.stringify({ pass, ran: ran() }))
const uses = new Map()
for (const f of walk(SKILLS)) for (const u of named(fs.readFileSync(f, 'utf8'))) if (!uses.has(u)) uses.set(u, path.relative(ROOT, f))
const dead = [...uses].filter(([u]) => !answers(DCTR, u))
clause('2e every dctr use the skills name answers --help', uses.size > 0 && !dead.length, JSON.stringify({ n: uses.size, dead }))
const paths = walk(SKILLS).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => HOOKPATH.test(l)).map(([f, i]) => `${path.relative(ROOT, f)}:${i}`))
clause('2f no skill line names a path into hooks/', !paths.length, paths.join(', '))

// ---- clause 3: the fixtures carry their defects, proved without the command
clause('3a the fake hooks folder holds a script per runtime script and no real one', fs.readdirSync(path.join(tmp, 'hooks')).some((f) => f === 'dctr-project.mjs') && !fs.readFileSync(path.join(tmp, 'hooks', 'dctr-project.mjs'), 'utf8').includes('PROJECT.md'), 'the fake is not a tripwire')
clause('3b the typo fixture names a word no runtime script header lists', !fs.readFileSync(path.join(ROOT, 'hooks', 'dctr-project.mjs'), 'utf8').includes('dctr-project.mjs chek') && named('run `dctr project chek`').includes('project chek'), 'the reader or the fixture is wrong')
clause('3c the reader finds a fenced use and an inline one', JSON.stringify(named('a `dctr gate x y -- t` b\n```\ndctr send report r t\n```')) === JSON.stringify(['gate x', 'send report']), JSON.stringify(named('a `dctr gate x y -- t` b\n```\ndctr send report r t\n```')))
clause('3d the hooks-path pattern matches the forms it is for', ['`node <plugin-root>/hooks/dctr-gate.mjs`', 'node hooks/dctr-send.mjs', '${CLAUDE_PLUGIN_ROOT}/hooks/x'].every((l) => HOOKPATH.test(l)) && !HOOKPATH.test('`dctr gate`'), 'pattern')

if (bad) { console.log(`${bad} clause(s) failed`); process.exit(1) }
console.log('all clauses passed')
