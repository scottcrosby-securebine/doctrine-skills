// doctrine — the lane worktree command (E15, RD-3): every worktree transition the orchestrator makes.
//
//   node hooks/dctr-lane.mjs create <role> <repo> <base> <handoff>
//   node hooks/dctr-lane.mjs reset <role> <revision>
//   node hooks/dctr-lane.mjs archive <role>
//   node hooks/dctr-lane.mjs remove <role>
//
// Four subcommands and no others. Each runs only where runRole() is `orchestrator`, reads the run from runRoot(),
// and refuses, exiting 1 and making nothing, on anything it cannot do; the one exception is a create that fails after
// its worktree is made, which leaves that worktree, writes no lane.log line, and names what it made. On success each
// appends one line to `<run>/lane.log`: `<ISO time> <caller tag> <subcommand> <args>`, the caller tag being
// DCTR_CALLER or else the role.
//
// create makes `<repo>/.claude/worktrees/<role>` on a new branch `<role>` at `<base>` (for `merge`, the integration
// branch `<base>` itself, refused while any worktree of the repo holds it), copies the first handoff into its
// docs/handoffs/, writes the record the handoff's `record:` line names (relative, inside the worktree) with the phase
// name and one `State: Open` line, points the memory file kickoff at the copy, sets skip-worktree on a tracked memory
// file, makes the role's own herdr tab, types the launch line, `/clear` and RESUME_LINE each once the pane reads
// ready, and only then appends `create <role> <pane> <worktree> <launch line>`. Before the launch line, ready is a
// `pane get` that answered with a pane holding no agent session and agent_status unknown; after it, READY_STATUSES. A
// reply that fails or carries no pane is not ready.
//
// reset keeps the worktree's HEAD on a side branch `<role>-was-<short sha>`, which it prints, and moves the worktree
// to the revision with `git reset --hard`, refusing while `git status --porcelain --untracked-files=no` prints
// anything. The memory file's bytes are carried across the move whether it is tracked or not, and its skip-worktree
// bit is set again wherever the revision tracks it.
//
// archive copies the lane's memory file, its docs/handoffs/ and every file under its record's directory, listed by
// find, into `<Records>/lanes/<role>/` at their worktree paths, and repoints the epic's `- phase <role>` member at the
// archived record. remove lists the same files again and refuses unless each one is archived with an equal sha256 and
// git status names no other file, then removes the worktree and keeps its branch.
//
// Contained (DCTR_VIEW_REQUEST_DIR set) create refuses before anything, and no subcommand calls herdr.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  runRole, runRoot, laneOf, kickoffHandoff, handoffHeader, RESUME_LINE, READY_STATUSES, AGENT_NAME_RE, PREFIX, tabCreateArgs, shq,
} from './dctr-lib.mjs'
import { herdr, isPaneNotFound, sleepMs } from './dctr-state.mjs'
import { parseDoc } from './dctr-project.mjs'

const MEMORY = 'SESSION_MEMORY.md'
const HANDOFFS = 'docs/handoffs'
let times = { poll: 1000, ready: 300000 }
try { times = { ...times, ...JSON.parse(process.env.DCTR_LANE_TIMES || '{}') } } catch { /* the defaults */ }

const refuse = (why) => { process.stderr.write(`dctr-lane: refused, ${why}\n`); process.exit(1) }
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const gitOk = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { stdio: 'ignore' }).status === 0
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
/** Every file under `dir`, by find, relative to `root`; none when `dir` does not exist. */
const findFiles = (root, dir) => (fs.existsSync(dir)
  ? execFileSync('find', [dir, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => path.relative(root, f)) : [])
const inside = (root, p) => { const r = path.relative(root, p); return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r) }

const [sub, ...args] = process.argv.slice(2)
const ARITY = { create: 4, reset: 2, archive: 1, remove: 1 }
if (!(sub in ARITY) || args.length !== ARITY[sub]) refuse('usage: create <role> <repo> <base> <handoff> | reset <role> <revision> | archive <role> | remove <role>')
if (runRole() !== 'orchestrator') refuse(`only the orchestrator runs this, and this session's role is ${runRole() ?? 'unset'}`)
const run = runRoot()
if (!run || !fs.existsSync(run)) refuse(`the run directory ${run ?? '(none)'} does not exist`)
const laneLog = path.join(run, 'lane.log')
const role = args[0]
if (!AGENT_NAME_RE.test(role) || role === 'orchestrator') refuse(`${JSON.stringify(role)} is not a role name`)
const caller = process.env.DCTR_CALLER || runRole()
const append = (line) => fs.appendFileSync(laneLog, `${new Date().toISOString()} ${caller} ${sub} ${line}\n`)
const readLog = () => { try { return fs.readFileSync(laneLog, 'utf8') } catch (e) { if (e.code === 'ENOENT') return ''; throw e } }

/** The lane's worktree from its latest create line, or a refusal. */
function laneWorktree() {
  const l = laneOf(readLog(), role)
  if (!l) refuse(`lane.log holds no create line for ${role}`)
  if (!fs.existsSync(l.worktree)) refuse(`the worktree ${l.worktree} of ${role} does not exist`)
  return l.worktree
}
/** `<Records>`, the directory holding the run: `<Records>/orchestrate/`. */
function recordsDir() {
  if (path.basename(run) !== 'orchestrate') refuse(`the run ${run} is not <Records>/orchestrate`)
  return path.dirname(run)
}
/** The files archive keeps and remove checks, relative to the worktree, listed by find: the memory file, every file
 *  under docs/handoffs/, and every file in the record's directory, the record and its evidence. */
function laneFiles(wt) {
  const files = new Set(findFiles(wt, path.join(wt, HANDOFFS)))
  if (fs.existsSync(path.join(wt, MEMORY))) files.add(MEMORY)
  const handoff = kickoffHandoff(fs.existsSync(path.join(wt, MEMORY)) ? fs.readFileSync(path.join(wt, MEMORY), 'utf8') : '')
  const rec = handoff && fs.existsSync(path.join(wt, handoff)) ? handoffHeader(fs.readFileSync(path.join(wt, handoff), 'utf8')).record : null
  if (!rec || !inside(wt, path.resolve(wt, rec))) refuse(`the memory file of ${wt} leads to no record inside it`)
  for (const f of findFiles(wt, path.dirname(path.resolve(wt, rec)))) files.add(f)
  return { files: [...files].sort(), record: rec }
}

// ---------------------------------------------------------------- create

function create() {
  const [, repoArg, base, handoff] = args
  if (process.env.DCTR_VIEW_REQUEST_DIR) refuse('a contained session makes no herdr pane')
  const workspace = process.env.HERDR_WORKSPACE_ID
  if (!workspace) refuse('no HERDR_WORKSPACE_ID, so there is no herdr workspace to make the pane in')
  let repo
  try { repo = git(repoArg, 'rev-parse', '--show-toplevel') } catch { refuse(`${repoArg} is not a git repo`) }
  if (!gitOk(repo, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`)) refuse(`${base} is not a commit in ${repo}`)
  const wt = path.join(repo, '.claude', 'worktrees', role)
  if (/\s/.test(wt)) refuse(`the worktree path ${JSON.stringify(wt)} holds whitespace, which a lane.log line cannot carry`)
  if (fs.existsSync(wt)) refuse(`${wt} already exists`)
  const merge = role === 'merge'
  if (merge) {
    if (!gitOk(repo, 'show-ref', '--verify', '--quiet', `refs/heads/${base}`)) refuse(`${base} is not a branch of ${repo}`)
    const held = git(repo, 'worktree', 'list', '--porcelain').split('\n').includes(`branch refs/heads/${base}`)
    if (held) refuse(`a worktree of ${repo} holds ${base}`)
  } else if (gitOk(repo, 'show-ref', '--verify', '--quiet', `refs/heads/${role}`)) refuse(`the branch ${role} already exists in ${repo}`)
  let text
  try { text = fs.readFileSync(handoff, 'utf8') } catch (e) { refuse(`the handoff ${handoff} could not be read (${e.code || e.message})`) }
  const header = handoffHeader(text)
  if (!header.record) refuse(`the handoff ${handoff} names no record`)
  if (path.isAbsolute(header.record)) refuse(`the handoff ${handoff} names its record by an absolute path`)
  const recordPath = path.resolve(wt, header.record)
  if (!inside(wt, recordPath)) refuse(`the handoff ${handoff} names a record outside the worktree`)
  const handoffRel = path.posix.join(HANDOFFS, path.basename(handoff))
  for (const rel of [handoffRel, header.record]) if (gitOk(repo, 'cat-file', '-e', `${base}:${rel}`)) refuse(`${base} already tracks ${rel}`)

  const made = [`the worktree ${wt}`]
  const fail = (why) => { process.stderr.write(`dctr-lane: create failed, ${why}; made ${made.join(', ')}, left in place, and lane.log not written\n`); process.exit(1) }
  try {
    git(repo, 'worktree', 'add', '--quiet', ...(merge ? [wt, base] : ['-b', role, wt, base]))
  } catch (e) { refuse(`git worktree add failed (${String(e.stderr || e.message).trim().split('\n')[0]})`) }
  let pane = null
  try {
    fs.mkdirSync(path.join(wt, HANDOFFS), { recursive: true })
    fs.copyFileSync(handoff, path.join(wt, handoffRel))
    fs.mkdirSync(path.dirname(recordPath), { recursive: true })
    fs.writeFileSync(recordPath, `# ${header.phase || role} record\n\n- State: Open\n`)
    const memory = path.join(wt, MEMORY)
    const kickoff = ['## Next Session Kickoff', `handoff: ${handoffRel} | state: open`]
    let lines = fs.existsSync(memory) ? fs.readFileSync(memory, 'utf8').split('\n') : ['# Session memory', '']
    const at = lines.findIndex((l) => /^##\s+Next Session Kickoff\s*$/i.test(l.trim()))
    if (at < 0) lines.push(...kickoff, '')
    else {
      let end = lines.findIndex((l, i) => i > at && /^##\s/.test(l))
      if (end < 0) end = lines.length
      lines = [...lines.slice(0, at), ...kickoff, '', ...lines.slice(end)]
    }
    fs.writeFileSync(memory, lines.join('\n'))
    if (gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)) git(wt, 'update-index', '--skip-worktree', MEMORY)

    // herdr-lint: a failed or empty tab create fails the create, which leaves what it made and closes nothing
    const tab = herdr(tabCreateArgs(workspace, `${PREFIX} · ${role}`, wt))
    pane = tab?.result?.root_pane?.pane_id ?? null
    if (typeof pane !== 'string' || !pane || /\s/.test(pane)) fail(`herdr made no usable pane (${JSON.stringify(pane)})`)
    made.push(`the herdr pane ${pane}`)
    const launch = `cd ${shq(wt)} && env DCTR_ROLE=${shq(role)} DCTR_CALLER=${shq(role)} DCTR_RUN=${shq(run)} ` +
      `CLAUDE_CONFIG_DIR=${shq(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))} PATH=${shq(process.env.PATH ?? '')} ` +
      `TMPDIR=${shq(process.env.TMPDIR || os.tmpdir())} claude --model "$(cat ${shq(path.join(run, 'model', role))})"`
    for (const [k, line] of [launch, '/clear', RESUME_LINE].entries()) {
      waitReady(pane, k === 0, fail)
      herdr(['pane', 'run', pane, line]) // herdr-lint: a failed send fails the create, so nothing follows it and nothing is closed
    }
    append(`${role} ${pane} ${wt} ${launch}`)
  } catch (e) { fail(String(e?.stderr || e?.message || e).trim().split('\n')[0]) }
}

/** Polls `pane get` until the pane reads ready (L7), or fails past the wait. `fresh`: before the launch line, ready is a
 *  pane with no agent session reading agent_status unknown; after it, a status in READY_STATUSES. */
function waitReady(pane, fresh, fail) {
  for (let waited = 0; ; waited += times.poll) {
    let p = null
    try { p = herdr(['pane', 'get', pane])?.result?.pane ?? null } catch (e) { if (isPaneNotFound(e)) fail(`the pane ${pane} is gone`) }
    if (p && (fresh ? !p.agent_session?.value && p.agent_status === 'unknown' : READY_STATUSES.includes(p.agent_status))) return
    if (waited >= times.ready) fail(`the pane ${pane} did not read ready ${fresh ? 'for the launch line' : 'after the launch line'} within ${times.ready}ms`)
    sleepMs(times.poll)
  }
}

// ---------------------------------------------------------------- reset

function reset() {
  const revision = args[1]
  const wt = laneWorktree()
  if (!gitOk(wt, 'rev-parse', '--verify', '--quiet', `${revision}^{commit}`)) refuse(`${revision} is not a commit`)
  const dirty = git(wt, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) refuse(`${wt} has uncommitted changes a move would discard:\n${dirty}`)
  const old = git(wt, 'rev-parse', 'HEAD')
  const side = `${role}-was-${old.slice(0, 12)}`
  if (!gitOk(wt, 'show-ref', '--verify', '--quiet', `refs/heads/${side}`)) git(wt, 'branch', side, old)
  else if (git(wt, 'rev-parse', `refs/heads/${side}`) !== old) refuse(`the branch ${side} exists and is not at ${old}`)
  const memory = path.join(wt, MEMORY)
  const bytes = fs.existsSync(memory) ? fs.readFileSync(memory) : null
  try {
    if (gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)) git(wt, 'update-index', '--no-skip-worktree', MEMORY)
    git(wt, 'reset', '--quiet', '--hard', revision)
  } finally {
    if (bytes) fs.writeFileSync(memory, bytes)
    if (gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)) git(wt, 'update-index', '--skip-worktree', MEMORY)
  }
  append(`${role} ${revision}`)
  process.stdout.write(`${side}\n`)
}

// ---------------------------------------------------------------- archive and remove

function archive() {
  const wt = laneWorktree()
  const dest = path.join(recordsDir(), 'lanes', role)
  const { files, record } = laneFiles(wt)
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true })
    fs.copyFileSync(path.join(wt, f), path.join(dest, f))
  }
  repointMember(path.join(dest, record))
  append(role)
  process.stdout.write(`archived ${files.length ? files.join(', ') : 'nothing'} into ${dest}\n`)
}

/** Rewrites the `- phase <role>` member line of the epic that carries it, in the project file's roster, to name the
 *  archived record by its path relative to the project repo, keeping an ordering clause. No such line: no change. */
function repointMember(archived) {
  const records = recordsDir()
  let top
  try { top = git(records, 'rev-parse', '--show-toplevel') } catch { return }
  let project
  try { project = parseDoc(fs.readFileSync(path.join(top, 'docs/PROJECT.md'), 'utf8')) } catch { return }
  const rel = path.relative(top, archived)
  for (const r of project.roster) {
    const file = path.join(top, r.record)
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const m = parseDoc(text).phases.find((p) => p.name === role)
    if (!m) continue
    const lines = text.split('\n')
    lines[m.line - 1] = `- phase ${role}: ${rel}${m.after ? ` after ${m.after} merged` : ''}`
    fs.writeFileSync(file, lines.join('\n'))
    process.stdout.write(`repointed ${path.relative(top, file)}:${m.line} at ${rel}\n`)
  }
}

function remove() {
  const wt = laneWorktree()
  const dest = path.join(recordsDir(), 'lanes', role)
  const { files } = laneFiles(wt)
  const differ = files.filter((f) => !fs.existsSync(path.join(dest, f)) || sha256(path.join(dest, f)) !== sha256(path.join(wt, f)))
  if (differ.length) refuse(`these files of ${wt} are not in ${dest} with an equal sha256: ${differ.join(', ')}`)
  const kept = new Set(files)
  const other = git(wt, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => !kept.has(f))
  if (other.length) refuse(`git status in ${wt} names files the archive does not hold: ${other.join(', ')}`)
  const common = git(wt, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  git(path.dirname(common), 'worktree', 'remove', '--force', wt)
  append(role)
  process.stdout.write(`removed ${wt}\n`)
}

;({ create, reset, archive, remove })[sub]()
