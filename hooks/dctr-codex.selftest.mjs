// Behavioral tamper test for the Codex install (E10-D1 to E10-D6), per CLAUDE.md's three clauses.
//
//   node hooks/dctr-codex.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Pins trustedHash against hashes Codex 0.156.1 itself wrote, and codexInstallPlan and the
// `dctr-codex.mjs install` command against fixture homes. Clause 1 confirms each refusal and each
// tampered entry trips; clause 2 confirms a known-good home is installed into with every foreign entry and
// trust line byte-identical, a second run changes nothing, and every trust line the install leaves is the
// hash Codex computes; clause 3 proves the fixtures carry what those clauses rest on without running the
// install, using the probe's own Python port of Codex's hash (checked against Codex) and Python's tomllib.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { trustedHash, codexInstallPlan, CODEX_HOOKS } from './dctr-lib.mjs'

let bad = 0
// A throw outside a clause (a mutated function called while deriving a clause's input) is a FAIL line naming the
// last clause that ran, never an exit with no verdict, which the mutation gate cannot judge (E10H-B8).
let lastClause = null
process.on('uncaughtException', (e) => {
  console.log(`FAIL  the suite threw after ${lastClause ?? 'its first line'}: ${String(e?.message || e).split('\n')[0]}`)
  process.exit(1)
})
const clause = (n, ok, detail) => { lastClause = n.split(' — ')[0]; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const cli = path.join(import.meta.dirname, 'dctr-codex.mjs')
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-codex-')))
// Removed at every exit, pass, fail or throw (E10H-R3-B3).
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))

// The probe's port of Codex 0.156.1's hook_hash(), which reproduced all 12 hashes Codex wrote and Scott's herdr
// entry (doctrine-skills-project .doctrine/records/e10-hookport/probes/A-evidence/trusted_hash.py), extended only
// to report as JSON and to read TOML with tomllib. It is the independent instrument for clause 3 and for every
// trust line the install leaves: none of the JavaScript under test runs inside it.
const PY = String.raw`
import hashlib, json, re, sys, tomllib
def label(ev): return re.sub(r'(?<!^)([A-Z])', r'_\1', ev).lower()
def norm_timeout(ev, t):
    if ev in ("SessionEnd", "Interrupt"): return min(max(t if t is not None else 1, 1), 3)
    return max(t if t is not None else 600, 1)
def trusted_hash(ev, handler, matcher=None):
    h = {"type": "command", "command": handler["command"], "timeout": norm_timeout(ev, handler.get("timeout")),
         "async": bool(handler.get("async", False))}
    if handler.get("statusMessage") is not None: h["statusMessage"] = handler["statusMessage"]
    lim = handler.get("additionalContextLimit")
    if lim is not None and lim != 2500 and ev in ("PreToolUse","PostToolUse","SessionStart","UserPromptSubmit","SubagentStart"):
        h["additionalContextLimit"] = lim
    ident = {"event_name": label(ev), "hooks": [h]}
    if matcher is not None: ident["matcher"] = matcher
    return "sha256:" + hashlib.sha256(json.dumps(ident, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
mode = sys.argv[1]
if mode == "toml":
    try: print(json.dumps({"ok": True, "doc": tomllib.loads(open(sys.argv[2]).read())}))
    except Exception as e: print(json.dumps({"ok": False, "error": str(e)}))
elif mode == "trust":
    hooks_path, config_path, key_path = sys.argv[2], sys.argv[3], sys.argv[4]
    try:
        cfg = tomllib.load(open(config_path, "rb")).get("hooks", {}).get("state", {})
        hj = json.load(open(hooks_path))["hooks"]
    except Exception as e:
        print(json.dumps([{"key": "unreadable", "stored": None, "computed": str(e), "command": ""}])); sys.exit(0)
    rows = []
    for ev, groups in hj.items():
        for gi, g in enumerate(groups):
            for hi, h in enumerate(g["hooks"]):
                key = f"{key_path}:{label(ev)}:{gi}:{hi}"
                want = cfg.get(key, {}).get("trusted_hash"); got = trusted_hash(ev, h, g.get("matcher"))
                rows.append({"key": key, "stored": want, "computed": got, "command": h["command"]})
    print(json.dumps(rows))
`
const py = (...args) => {
  const r = spawnSync('python3', ['-c', PY, ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`python3 failed (tomllib needs Python 3.11+): ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file }
const scratch = (name, text) => put(path.join(tmp, 'scratch', name), text)
const tomlOk = (text) => py('toml', scratch('t.toml', text))
const trustRows = (hooksText, configText, keyPath) => py('trust', scratch('h.json', hooksText), scratch('c.toml', configText), keyPath)

// ---------------------------------------------------------------- fixtures

// F1: the hooks.json probe A registered for all 12 events and the trusted_hash values Codex 0.156.1's TUI wrote for
// it on "Trust all and continue" (A-evidence/hooks.json and A-evidence/config-after-trust.toml). Timeout 10 on every
// handler, so SessionEnd and Interrupt also pin the 1..3 clamp.
const W = '/tmp/claude-1000/-home-radadmin-claude-projects-doctrine-skills/63c58dae-27b1-41c6-8951-11e87f30cc74/scratchpad/probeA'
const CODEX_WROTE = {
  PreToolUse: 'sha256:8c33ad4b816ed887beb3d8bbf086e91ee7da7893e80b96795454b4ea1ea1aea6',
  PermissionRequest: 'sha256:35682e10776fd38da35cea1a1fbf9c7ad124ee7252982fc4ae12fa4fa224ba45',
  PostToolUse: 'sha256:0667cd63f09e724b2f60399b078a3301c1be4c89bf014419e30c683a36701f9f',
  PreCompact: 'sha256:d45e9ca2e9340e4af5015c1d961145e752738ff659920254f6b0756eba307ce1',
  PostCompact: 'sha256:1bf44a76c33bd5624137d94f25286834ada680c1c331316514c2549a05fa7c1f',
  SessionStart: 'sha256:ea8e848a8b90130a7e789fcd0794558baba2e33aeaf64868098d630e5764153c',
  SessionEnd: 'sha256:c49635731bfefe084a921496c1aa2b66738be488fcc055ed515c779ec1e7d625',
  UserPromptSubmit: 'sha256:c5e06f5ef2eec0c8de0c5e38d9ae560ee2310f53dc8c06e085b1df23ea8a1552',
  SubagentStart: 'sha256:ed4e178ffaf5b83edd8a0e243cd4f403a5fa67632a6f52d3192deb1d5b2c5e66',
  SubagentStop: 'sha256:6984f11a587b9ae1bfd70188387d48ee0bc058f844e7843dfe973a5720077d9a',
  Stop: 'sha256:de3428f5bd65a3cae79c582408fbcaef20e48ba793b971d3477b4dd5fab2263b',
  Interrupt: 'sha256:1324a0923c18d6036787727905540c02d7248deeffa2a70d5c4804f774cd5721',
}
const probeGroup = (ev) => ({ hooks: [{ type: 'command', command: `${W}/hook.sh ${ev}`, timeout: 10 }] })

// F2: herdr's own Codex SessionStart entry and the hash Codex wrote for it in Scott's config.toml (read-only,
// 2026-09-28, ~/.codex/hooks.json and ~/.codex/config.toml [hooks.state."/home/radadmin/.codex/hooks.json:session_start:0:0"]).
const HERDR_GROUP_TEXT = `{
        "hooks": [
          {
            "command": "bash '/home/radadmin/.codex/herdr-agent-state.sh' session",
            "timeout": 10,
            "type": "command"
          }
        ]
      }`
const HERDR_HASH = 'sha256:4f14ef9545eb02020369ecb95e40b1a2c30eb15b21152faea8c52661d1988483'

// F3: a matcher-bearing entry whose trust line Codex 0.156.1 accepted in a live `codex exec` run with no bypass
// flag: the startup-matched hook fired and the clear-matched one did not, and with one hex digit of this hash
// changed nothing fired (doctrine-skills-project .doctrine/records/e10-hookport/build/I-live/matcher-run.txt and
// matcher-run-badhash.txt, 2026-09-28).
const MATCHER_LIVE = { event: 'SessionStart', hash: 'sha256:f9f7a7320c7166878ea388be7646ea444b161ef73011ff8f8d900d23cb5cee27',
  group: { matcher: 'startup', hooks: [{ type: 'command', timeout: 10,
    command: 'echo startup >> /tmp/claude-1000/-home-radadmin-claude-projects-doctrine-skills/63c58dae-27b1-41c6-8951-11e87f30cc74/scratchpad/seatI/m-live-good/fired.log' }] } }

// F4: a home shaped like Scott's (herdr's hooks.json byte for byte, without a trailing newline as herdr wrote it; a
// config.toml with his table layout and herdr's trust line), under a scratch CODEX_HOME.
const scottHooks = (home) => `{
  "hooks": {
    "SessionStart": [
      ${HERDR_GROUP_TEXT}
    ]
  }
}`
const scottConfig = (home) => `model = "gpt-6-astra"
model_reasoning_effort = "medium"
check_for_update_on_startup = false
[tools]
web_search = true

[tui]
status_line = ["project-name", "git-branch", "context-remaining"]
screen_reader_detection_done = true

[projects."/home/example/projects/sbsforge"]
trust_level = "trusted"

[hooks.state]

[hooks.state."${home}/hooks.json:session_start:0:0"]
trusted_hash = "${HERDR_HASH}"

[features]
hooks = true

[marketplaces.doctrine-skills]
source_type = "git"
source = "https://github.com/scottcrosby-securebine/doctrine-skills.git"

[plugins."doctrine@doctrine-skills"]
enabled = true
`
// F5: TOML a line scanner gets wrong: a multi-line string and a nested array whose lines open with "[", and a
// [sandbox_workspace_write] table holding network_access = false and another key.
const TRICKY = `developer_instructions = """
[hooks.state."fake"]
trusted_hash = "not a table"
"""
matrix = [
  ["a", "b"],
  [1, 2],
]
[sandbox_workspace_write]
writable_roots = ["/tmp/x"]
network_access = false # off by default
[profiles.x]
model = "o"
`
// F6: shapes the line editor must refuse rather than corrupt: hooks.state as an inline table, and
// sandbox_workspace_write as an inline table at the root.
const INLINE_STATE = `[hooks]\nstate = { "x:session_start:0:0" = { trusted_hash = "sha256:00" } }\n`
const INLINE_SANDBOX = `sandbox_workspace_write = { writable_roots = ["/tmp"] }\n`

const hookDirFor = (home) => path.join(home, 'doctrine', 'hooks')
const planFor = (home, hooksJson, configToml) => codexInstallPlan({ hooksJson, configToml, hookDir: hookDirFor(home), hooksJsonPath: path.join(home, 'hooks.json') })
// A plan that throws on a known-good fixture must fail its clauses, never crash the suite: a crash renders no verdict.
const goodPlan = (...a) => { try { return planFor(...a) } catch (e) { return { hooksJson: '{"hooks":{}}', configToml: '', messages: [`threw: ${e.message}`] } } }
const readOr = (file) => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const throws = (f) => { try { f(); return null } catch (e) { return e.message || String(e) } }
const allTrusted = (rows) => rows.length > 0 && rows.every((r) => r.stored === r.computed)
/** Removing every line the install added leaves the original text exactly: the original lines are a subsequence
 *  of the output, and each other output line is blank or one the install writes. */
function onlyAdded(before, after, allowed) {
  const a = before.split('\n'), b = after.split('\n')
  let i = 0; const extra = []
  for (const line of b) { if (i < a.length && line === a[i]) i++; else extra.push(line) }
  return { ok: i === a.length && extra.every((l) => l === '' || allowed(l)), extra, consumed: i, of: a.length }
}
const ourLine = (home) => (l) => l.startsWith(`[hooks.state."${home}/hooks.json:`) || /^trusted_hash = "sha256:[0-9a-f]{64}"$/.test(l) ||
  l === '[sandbox_workspace_write]' || l === 'network_access = true'

// ---------------------------------------------------------------- clause 2: known-good inputs

const probeKey = `${W}/home/hooks.json`
const got = Object.fromEntries(Object.keys(CODEX_WROTE).map((ev) => [ev, trustedHash(ev, probeGroup(ev))]))
clause('clause 2a — trustedHash reproduces all 12 hashes Codex 0.156.1 wrote for the probe hooks.json, SessionEnd and Interrupt clamped to 3',
  Object.keys(CODEX_WROTE).every((ev) => got[ev] === CODEX_WROTE[ev]), JSON.stringify(Object.keys(CODEX_WROTE).filter((ev) => got[ev] !== CODEX_WROTE[ev])))
clause("clause 2b — trustedHash reproduces the hash Codex wrote for herdr's own SessionStart entry",
  trustedHash('SessionStart', JSON.parse(HERDR_GROUP_TEXT)) === HERDR_HASH, trustedHash('SessionStart', JSON.parse(HERDR_GROUP_TEXT)))
clause('clause 2c — trustedHash of a matcher-bearing entry is the hash Codex accepted in a live run',
  trustedHash(MATCHER_LIVE.event, MATCHER_LIVE.group) === MATCHER_LIVE.hash, trustedHash(MATCHER_LIVE.event, MATCHER_LIVE.group))

// A Scott-shaped home, installed into twice through the command.
const home = fs.mkdtempSync(path.join(tmp, 'home-'))
put(path.join(home, 'hooks.json'), scottHooks(home))
put(path.join(home, 'config.toml'), scottConfig(home))
const before = { hooks: scottHooks(home), config: scottConfig(home) }
// HOME is a scratch directory on every run, so a CODEX_HOME resolved to the default can never be the real ~/.codex,
// whatever a mutation does to the resolution.
const fakeHome = fs.mkdtempSync(path.join(tmp, 'user-'))
const run = (args, env = {}) => {
  const e = { ...process.env, HOME: fakeHome, ...env }
  if (!('CODEX_HOME' in env)) delete e.CODEX_HOME
  return spawnSync('node', [cli, ...args], { encoding: 'utf8', env: e })
}
const first = run(['install', '--codex-home', home])
const after1 = { hooks: fs.readFileSync(path.join(home, 'hooks.json'), 'utf8'), config: fs.readFileSync(path.join(home, 'config.toml'), 'utf8') }
const second = run(['install', '--codex-home', home])
const after2 = { hooks: fs.readFileSync(path.join(home, 'hooks.json'), 'utf8'), config: fs.readFileSync(path.join(home, 'config.toml'), 'utf8') }
const hd = hookDirFor(home)
const parsed1 = JSON.parse(after1.hooks)

clause('clause 2d — the command exits 0 and copies the hooks directory under CODEX_HOME, runnable from there',
  first.status === 0 && ['dctr-seat.mjs', 'dctr-restore.mjs', 'dctr-gauge.mjs', 'dctr-cycle.mjs', 'dctr-typer.mjs', 'dctr-lib.mjs', 'dctr-state.mjs', 'dctr-record.mjs', 'dctr-render.mjs']
    .every((f) => fs.existsSync(path.join(hd, f))) && Buffer.compare(fs.readFileSync(path.join(hd, 'dctr-lib.mjs')), fs.readFileSync(path.join(import.meta.dirname, 'dctr-lib.mjs'))) === 0,
  `status ${first.status} out ${first.stdout} err ${first.stderr}`)
const wantEntries = CODEX_HOOKS.map(([ev, script, timeout, matcher]) => `${ev}|${matcher || ''}|node '${hd}/${script}'|${timeout}`)
const haveEntries = Object.entries(parsed1.hooks).flatMap(([ev, gs]) => gs.filter((g) => g.hooks.some((h) => h.command.includes(hd)))
  .map((g) => `${ev}|${g.matcher || ''}|${g.hooks[0].command}|${g.hooks[0].timeout}`))
clause('clause 2e — hooks.json gains exactly the doctrine entries CODEX_HOOKS names, each one handler pointing into the copied directory',
  JSON.stringify(haveEntries.sort()) === JSON.stringify([...wantEntries].sort()), `have ${JSON.stringify(haveEntries)} want ${JSON.stringify(wantEntries)}`)
clause("clause 2f — herdr's SessionStart group is byte-identical and still first in its array (E10-D2, E10-D3)",
  after1.hooks.includes(HERDR_GROUP_TEXT) && JSON.stringify(parsed1.hooks.SessionStart[0]) === JSON.stringify(JSON.parse(HERDR_GROUP_TEXT)), after1.hooks)
const added = onlyAdded(before.config, after1.config, ourLine(home))
clause("clause 2g — config.toml keeps every line it had, byte for byte and in order, herdr's trust line included, and gains only doctrine trust lines and the network setting (E10-D2)",
  added.ok, `consumed ${added.consumed} of ${added.of}; extra ${JSON.stringify(added.extra)}`)
const rows1 = trustRows(after1.hooks, after1.config, path.join(home, 'hooks.json'))
clause('clause 2h — every handler in the new hooks.json, herdr\'s and doctrine\'s, has a trust line equal to the hash the probe\'s Python port of Codex computes (E10-D1, E10-D3)',
  allTrusted(rows1) && rows1.length === CODEX_HOOKS.length + 1, JSON.stringify(rows1.filter((r) => r.stored !== r.computed)))
const toml1 = tomlOk(after1.config)
clause('clause 2i — the new config.toml parses in tomllib and sets sandbox_workspace_write.network_access = true (E10-D5)',
  toml1.ok && toml1.doc.sandbox_workspace_write?.network_access === true, JSON.stringify(toml1).slice(0, 300))
clause('clause 2j — the command names sandbox_workspace_write.network_access = true in its output (E10-D6), on the first run and on a re-run',
  first.stdout.includes('sandbox_workspace_write.network_access = true') && second.stdout.includes('sandbox_workspace_write.network_access = true'), first.stdout + second.stdout)
clause('clause 2k — a second run exits 0 and leaves hooks.json and config.toml byte-identical (E10-D4)',
  second.status === 0 && after2.hooks === after1.hooks && after2.config === after1.config, `status ${second.status} ${second.stderr}`)

// CODEX_HOME resolved as Codex resolves it: $CODEX_HOME when no flag, canonicalized, and ~/.codex otherwise.
const realHome = fs.mkdtempSync(path.join(tmp, 'real-')), link = path.join(tmp, 'link-home')
fs.symlinkSync(realHome, link)
const viaEnv = run(['install'], { CODEX_HOME: link })
const envKeys = Object.keys(tomlOk(readOr(path.join(realHome, 'config.toml'))).doc?.hooks?.state || {})
clause('clause 2q — with no flag, $CODEX_HOME is the home, and a symlinked one is canonicalized as Codex canonicalizes it: every trust key names the real hooks.json path',
  viaEnv.status === 0 && envKeys.length === CODEX_HOOKS.length && envKeys.every((k) => k.startsWith(`${realHome}/hooks.json:`)) &&
    JSON.parse(readOr(path.join(realHome, 'hooks.json')) || '{}').hooks?.Stop?.[0]?.hooks[0].command === `node '${realHome}/doctrine/hooks/dctr-cycle.mjs'`,
  `status ${viaEnv.status} ${viaEnv.stderr} keys ${JSON.stringify(envKeys)}`)
const viaDefault = run(['install'])
clause('clause 2r — with neither, the home is ~/.codex, created when absent',
  viaDefault.status === 0 && fs.existsSync(path.join(fakeHome, '.codex', 'hooks.json')) && fs.existsSync(path.join(fakeHome, '.codex', 'doctrine', 'hooks', 'dctr-seat.mjs')),
  `status ${viaDefault.status} ${viaDefault.stderr}`)

// The tricky TOML, with no hooks.json at all.
const trickyPlan = goodPlan(home, null, TRICKY)
const trickyToml = tomlOk(trickyPlan.configToml)
const trickyRows = trustRows(trickyPlan.hooksJson, trickyPlan.configToml, path.join(home, 'hooks.json'))
clause('clause 2l — a multi-line string and a nested array opening lines with "[" are not read as tables: the output parses, the string is unchanged, and every doctrine entry is trusted',
  trickyToml.ok && trickyToml.doc.developer_instructions === '[hooks.state."fake"]\ntrusted_hash = "not a table"\n' && allTrusted(trickyRows),
  `${JSON.stringify(trickyToml).slice(0, 300)} ${JSON.stringify(trickyRows.filter((r) => r.stored !== r.computed))}`)
clause('clause 2m — network_access = false in an existing [sandbox_workspace_write] becomes true in place, and its other keys stay',
  trickyToml.ok && trickyToml.doc.sandbox_workspace_write?.network_access === true && JSON.stringify(trickyToml.doc.sandbox_workspace_write?.writable_roots) === '["/tmp/x"]' &&
    trickyPlan.configToml.split('\n').filter((l) => l.startsWith('[sandbox_workspace_write]')).length === 1 && trickyToml.doc.profiles?.x?.model === 'o',
  trickyPlan.configToml)

// An earlier install whose Stop entry had another timeout, a second (duplicate) doctrine Stop group, and a user's
// Stop group after them. The stale entry is rewritten in place, the duplicate removed, and the user's group, which
// moves from index 2 to 1, keeps its trust line under its new key.
const userStop = { hooks: [{ type: 'command', command: 'echo user-stop', timeout: 7 }] }
const staleStop = { hooks: [{ type: 'command', command: `node '${hd}/dctr-cycle.mjs'`, timeout: 42 }] }
const staleHooks = JSON.stringify({ hooks: { Stop: [staleStop, staleStop, userStop] } }, null, 2) + '\n'
const key = (ev, gi) => `${home}/hooks.json:${ev}:${gi}:0`
const staleConfig = `[hooks.state."${key('stop', 0)}"]\ntrusted_hash = "${trustedHash('Stop', staleStop)}"\n\n[hooks.state."${key('stop', 1)}"]\ntrusted_hash = "${trustedHash('Stop', staleStop)}"\n\n` +
  `[hooks.state."${key('stop', 2)}"]\ntrusted_hash = "${trustedHash('Stop', userStop)}"\n`
const stalePlan = goodPlan(home, staleHooks, staleConfig)
const staleOut = JSON.parse(stalePlan.hooksJson).hooks.Stop || []
const staleRows = trustRows(stalePlan.hooksJson, stalePlan.configToml, path.join(home, 'hooks.json'))
clause('clause 2n — an earlier install\'s stale Stop entry is rewritten in place at index 0 and its duplicate removed',
  staleOut.length === 2 && staleOut[0].hooks[0].timeout === 60 && staleOut[0].hooks[0].command === `node '${hd}/dctr-cycle.mjs'`, JSON.stringify(staleOut))
clause("clause 2o — the user's Stop group that moved from index 2 to 1 keeps a trust line under its new key, and no trust line is left for index 2",
  JSON.stringify(staleOut[1]) === JSON.stringify(userStop) && allTrusted(staleRows) && !stalePlan.configToml.includes(key('stop', 2)), stalePlan.configToml)
// A user's own entry running a dctr script from somewhere else is not the install's to rewrite.
const foreign = { hooks: [{ type: 'command', command: "node '/opt/elsewhere/dctr-cycle.mjs'", timeout: 60 }] }
const foreignPlan = goodPlan(home, JSON.stringify({ hooks: { Stop: [foreign] } }, null, 2), '')
clause('clause 2p — a dctr script registered from another directory is left in place, and the doctrine entry is added after it',
  JSON.stringify(JSON.parse(foreignPlan.hooksJson).hooks.Stop?.[0]) === JSON.stringify(foreign) && JSON.parse(foreignPlan.hooksJson).hooks.Stop?.length === 2, foreignPlan.hooksJson)

// ---------------------------------------------------------------- clause 1: what must trip

const tamperedRows = trustRows(after1.hooks.replace(`"timeout": 60`, `"timeout": 61`), after1.config, path.join(home, 'hooks.json'))
clause('clause 1a — a doctrine entry edited after the install no longer matches its trust line (Codex would read it as Modified and not run it)',
  tamperedRows.some((r) => r.stored !== r.computed), JSON.stringify(tamperedRows.filter((r) => r.stored !== r.computed)))
const matcherless = { hooks: MATCHER_LIVE.group.hooks }
clause('clause 1b — dropping the matcher, or changing the timeout or the command, changes trustedHash',
  trustedHash('SessionStart', matcherless) !== trustedHash('SessionStart', MATCHER_LIVE.group) &&
    trustedHash('Stop', { hooks: [{ ...userStop.hooks[0], timeout: 8 }] }) !== trustedHash('Stop', userStop) &&
    trustedHash('Stop', { hooks: [{ ...userStop.hooks[0], command: 'echo other' }] }) !== trustedHash('Stop', userStop), 'a field left out of the identity')
const inlineErr = throws(() => planFor(home, null, INLINE_STATE))
const sandboxErr = throws(() => planFor(home, null, INLINE_SANDBOX))
clause('clause 1c — hooks.state or sandbox_workspace_write set as an inline table is refused, naming the key, rather than rewritten',
  /hooks\.state/.test(inlineErr || '') && /sandbox_workspace_write/.test(sandboxErr || ''), `${inlineErr} | ${sandboxErr}`)
clause('clause 1d — a hooks.json that is not JSON, or whose hooks is not an object, is refused',
  Boolean(throws(() => planFor(home, '{ nope', ''))) && Boolean(throws(() => planFor(home, '{"hooks": []}', ''))), 'accepted')
const refusedHome = fs.mkdtempSync(path.join(tmp, 'refused-'))
put(path.join(refusedHome, 'hooks.json'), scottHooks(refusedHome))
put(path.join(refusedHome, 'config.toml'), INLINE_STATE)
const refused = run(['install', '--codex-home', refusedHome])
clause('clause 1e — a refused install exits 1 and writes nothing: hooks.json and config.toml unchanged, no hooks directory copied',
  refused.status === 1 && fs.readFileSync(path.join(refusedHome, 'hooks.json'), 'utf8') === scottHooks(refusedHome) &&
    fs.readFileSync(path.join(refusedHome, 'config.toml'), 'utf8') === INLINE_STATE && !fs.existsSync(hookDirFor(refusedHome)), `status ${refused.status} ${refused.stderr}`)
const missing = run(['install', '--codex-home', path.join(tmp, 'no-such-home')])
clause('clause 1f — a --codex-home that does not exist is refused, as Codex refuses such a CODEX_HOME, and nothing is created',
  missing.status === 1 && !fs.existsSync(path.join(tmp, 'no-such-home')), `status ${missing.status} ${missing.stderr}`)
clause('clause 1g — an unknown argument is a usage error',
  run(['instal']).status === 2 && run(['install', '--codex-home']).status === 2, 'accepted')

clause('clause 1j — no Interrupt entry is installed: dctr-cycle.mjs acts on no Interrupt, so each Esc would only start a process that stands down (N2)',
  !CODEX_HOOKS.some(([ev]) => ev === 'Interrupt') && !('Interrupt' in parsed1.hooks), JSON.stringify(Object.keys(parsed1.hooks)))

// E10H-B5. Derived from herdr's real group (F2, HERDR_GROUP_TEXT): the same hooks.json laid out on one line, and laid
// out as herdr lays it out but with herdr's group written on one line. Written back whole, either would change that
// group's bytes, so the install refuses before writing either file.
const COMPACT = JSON.stringify({ hooks: { SessionStart: [JSON.parse(HERDR_GROUP_TEXT)] } })
const MIXED = `{\n  "hooks": {\n    "SessionStart": [\n      ${JSON.stringify(JSON.parse(HERDR_GROUP_TEXT))}\n    ]\n  }\n}\n`
const layoutRuns = [COMPACT, MIXED].map((text) => {
  const h = fs.mkdtempSync(path.join(tmp, 'layout-'))
  put(path.join(h, 'hooks.json'), text)
  put(path.join(h, 'config.toml'), scottConfig(h))
  const r = run(['install', '--codex-home', h])
  return { r, same: readOr(path.join(h, 'hooks.json')) === text && readOr(path.join(h, 'config.toml')) === scottConfig(h), copied: fs.existsSync(hookDirFor(h)) }
})
clause('clause 1h — a hooks.json laid out on one line, or with a foreign entry on one line, is refused naming its layout, and both files are left byte-identical with no hooks copied (E10H-B5, E10-D2)',
  layoutRuns.every(({ r, same, copied }) => r.status === 1 && /not laid out as JSON\.stringify/.test(r.stderr) && same && !copied),
  JSON.stringify(layoutRuns.map(({ r, same, copied }) => [r.status, r.stderr.trim(), same, copied])))

// E10H-R2-B3. An earlier install's Interrupt entry (the one N2 dropped) at index 0, a user's Interrupt handler after it
// at index 1, each trusted, the user's as a dotted key under [hooks.state] (valid TOML Codex reads). Removing the
// doctrine entry moves the user's handler to index 0, and a dotted trust key would stay behind at index 1, so the
// install refuses the file before writing either one.
const oldInterrupt = { hooks: [{ type: 'command', command: `node '${hd}/dctr-cycle.mjs'`, timeout: 3 }] }
const userInterrupt = { hooks: [{ type: 'command', command: 'echo user-interrupt', timeout: 2 }] }
const dottedHooks = JSON.stringify({ hooks: { Interrupt: [oldInterrupt, userInterrupt] } }, null, 2) + '\n'
const dottedConfig = (h) => `[hooks.state."${h}/hooks.json:interrupt:0:0"]\ntrusted_hash = "${trustedHash('Interrupt', oldInterrupt)}"\n\n` +
  `[hooks.state]\n"${h}/hooks.json:interrupt:1:0".trusted_hash = "${trustedHash('Interrupt', userInterrupt)}"\n`
const dottedHome = fs.mkdtempSync(path.join(tmp, 'dotted-'))
put(path.join(dottedHome, 'hooks.json'), dottedHooks)
put(path.join(dottedHome, 'config.toml'), dottedConfig(dottedHome))
const dottedRun = run(['install', '--codex-home', dottedHome])
clause('clause 1k — a trust entry written as a dotted key under [hooks.state] is refused, naming its line, and both files are left byte-identical with no hooks copied (E10H-R2-B3, E10-D2, E10-D3)',
  dottedRun.status === 1 && /line 5 writes a hook trust entry as a dotted key/.test(dottedRun.stderr) && readOr(path.join(dottedHome, 'hooks.json')) === dottedHooks &&
    readOr(path.join(dottedHome, 'config.toml')) === dottedConfig(dottedHome) && !fs.existsSync(hookDirFor(dottedHome)) &&
    /dotted key or an inline table/.test(throws(() => planFor(dottedHome, dottedHooks, `[hooks]\nstate."${dottedHome}/hooks.json:interrupt:1:0".trusted_hash = "sha256:00"\n`)) || ''),
  `status ${dottedRun.status} ${dottedRun.stderr}`)

// E10H-B6. A 0600 config.toml, installed under umask 0002, and a config.toml that is a symlink into a dotfiles
// directory: the mode stays 0600, the link stays a link, and the file it names gets the install's lines.
const oldMask = process.umask(0o002)
const modeHome = fs.mkdtempSync(path.join(tmp, 'mode-'))
put(path.join(modeHome, 'hooks.json'), scottHooks(modeHome))
put(path.join(modeHome, 'config.toml'), scottConfig(modeHome))
fs.chmodSync(path.join(modeHome, 'config.toml'), 0o600)
const modeRun = run(['install', '--codex-home', modeHome])
const modeAfter = fs.statSync(path.join(modeHome, 'config.toml')).mode & 0o777
const linkHome = fs.mkdtempSync(path.join(tmp, 'link-')), dots = fs.mkdtempSync(path.join(tmp, 'dotfiles-'))
put(path.join(linkHome, 'hooks.json'), scottHooks(linkHome))
put(path.join(dots, 'config.toml'), scottConfig(linkHome))
fs.chmodSync(path.join(dots, 'config.toml'), 0o600)
fs.symlinkSync(path.join(dots, 'config.toml'), path.join(linkHome, 'config.toml'))
const linkWas = fs.lstatSync(path.join(linkHome, 'config.toml')).isSymbolicLink() && (fs.statSync(path.join(dots, 'config.toml')).mode & 0o777) === 0o600
const linkRun = run(['install', '--codex-home', linkHome])
const freshMode = (() => { const f = path.join(tmp, 'umask-probe'); fs.writeFileSync(f, ''); return fs.statSync(f).mode & 0o777 })()
process.umask(oldMask)
clause('clause 1i — the install keeps a 0600 config.toml at 0600 under umask 0002, and writes through a symlinked config.toml to the file it names, leaving the link (E10H-B6)',
  modeRun.status === 0 && modeAfter === 0o600 && readOr(path.join(modeHome, 'config.toml')).includes('network_access = true') &&
  linkRun.status === 0 && fs.lstatSync(path.join(linkHome, 'config.toml')).isSymbolicLink() && readOr(path.join(dots, 'config.toml')).includes('network_access = true') &&
  (fs.statSync(path.join(dots, 'config.toml')).mode & 0o777) === 0o600,
  `mode ${modeAfter.toString(8)} ${modeRun.stderr} link ${fs.lstatSync(path.join(linkHome, 'config.toml')).isSymbolicLink()} ${linkRun.stderr}`)

// ---------------------------------------------------------------- clause 3: the fixtures carry it, without the install

const probeHooks = JSON.stringify({ hooks: Object.fromEntries(Object.keys(CODEX_WROTE).map((ev) => [ev, [probeGroup(ev)]])) })
const probeConfig = Object.entries(CODEX_WROTE).map(([ev, h]) => `[hooks.state."${probeKey}:${ev.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase()}:0:0"]\ntrusted_hash = "${h}"\n`).join('\n')
const probeRows = trustRows(probeHooks, probeConfig, probeKey)
clause("clause 3a — the Python port, run alone, matches all 12 Codex-written hashes of F1 and herdr's F2: the fixture hashes are Codex's own",
  allTrusted(probeRows) && probeRows.length === 12 &&
    allTrusted(trustRows(JSON.stringify({ hooks: { SessionStart: [JSON.parse(HERDR_GROUP_TEXT)] } }), `[hooks.state."/k:session_start:0:0"]\ntrusted_hash = "${HERDR_HASH}"\n`, '/k')),
  JSON.stringify(probeRows.filter((r) => r.stored !== r.computed)))
const matcherRows = trustRows(JSON.stringify({ hooks: { SessionStart: [MATCHER_LIVE.group] } }), `[hooks.state."/k:session_start:0:0"]\ntrusted_hash = "${MATCHER_LIVE.hash}"\n`, '/k')
clause('clause 3b — the Python port, run alone, gives the live-accepted hash for F3, so the matcher is inside the identity',
  allTrusted(matcherRows), JSON.stringify(matcherRows))
const staleBefore = trustRows(JSON.stringify({ hooks: { Stop: [staleStop, staleStop, userStop] } }), staleConfig, path.join(home, 'hooks.json'))
const renamedAway = trustRows(JSON.stringify({ hooks: { Stop: [staleStop, userStop] } }), staleConfig, path.join(home, 'hooks.json'))
clause("clause 3c — in the stale fixture every line is trusted before the install, and simply dropping the duplicate leaves the user's group untrusted at its new index",
  allTrusted(staleBefore) && !allTrusted(renamedAway), `${JSON.stringify(staleBefore)} ${JSON.stringify(renamedAway)}`)
const trickyParsed = tomlOk(TRICKY)
const naive = tomlOk(TRICKY.replace('matrix = [\n', `matrix = [\n[hooks.state."k"]\n`))
clause('clause 3d — F5 parses, its string really holds a line opening with "[", and a table header placed on such a line is a TOML error',
  trickyParsed.ok && trickyParsed.doc.developer_instructions.startsWith('[hooks.state.') && JSON.stringify(trickyParsed.doc.matrix) === '[["a","b"],[1,2]]' &&
    trickyParsed.doc.sandbox_workspace_write.network_access === false && !naive.ok, `${JSON.stringify(trickyParsed).slice(0, 200)} naive ${JSON.stringify(naive)}`)
const inlineAppended = tomlOk(INLINE_STATE + `\n[hooks.state."k:stop:0:0"]\ntrusted_hash = "sha256:00"\n`)
const sandboxAppended = tomlOk(INLINE_SANDBOX + `\n[sandbox_workspace_write]\nnetwork_access = true\n`)
clause('clause 3e — F6 parses as written, and appending a table the naive way to either shape is a TOML error, so the refusal is needed',
  tomlOk(INLINE_STATE).ok && tomlOk(INLINE_SANDBOX).ok && !inlineAppended.ok && !sandboxAppended.ok, `${JSON.stringify(inlineAppended)} ${JSON.stringify(sandboxAppended)}`)
const scottParsed = tomlOk(scottConfig(home))
const scottRows = trustRows(scottHooks(home), scottConfig(home), path.join(home, 'hooks.json'))
clause("clause 3f — F4 parses, has no sandbox_workspace_write table, and its herdr trust line is already the one Codex computes",
  scottParsed.ok && scottParsed.doc.sandbox_workspace_write === undefined && allTrusted(scottRows) && scottRows.length === 1, JSON.stringify(scottRows))
clause('clause 3g — without the install: the compact and mixed hooks.json hold the same value as herdr\'s own, only laid out otherwise, and neither survives a round trip through JSON.stringify; under umask 0002 a file written with no mode is 0664, and the dotfiles config.toml is 0600 behind a symlink',
  [COMPACT, MIXED].every((t) => JSON.stringify(JSON.parse(t)) === JSON.stringify(JSON.parse(scottHooks(home))) && JSON.stringify(JSON.parse(t), null, 2) + (t.endsWith('\n') ? '\n' : '') !== t) &&
  freshMode === 0o664 && linkWas, `fresh mode ${freshMode.toString(8)}`)

const dottedPath = path.join(dottedHome, 'hooks.json')
const dottedBefore = trustRows(dottedHooks, dottedConfig(dottedHome), dottedPath)
const dottedMoved = trustRows(JSON.stringify({ hooks: { Interrupt: [userInterrupt] } }), dottedConfig(dottedHome), dottedPath)
clause("clause 3h — without the install: the dotted-key fixture parses and trusts both handlers, and dropping the doctrine entry with the trust keys left where they are leaves the user's handler untrusted at its new index 0",
  tomlOk(dottedConfig(dottedHome)).ok && dottedBefore.length === 2 && allTrusted(dottedBefore) && !allTrusted(dottedMoved),
  `${JSON.stringify(dottedBefore)} ${JSON.stringify(dottedMoved)}`)

console.log(bad ? `\n${bad} FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
