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
// reply that fails or carries no pane is not ready. A handoff copy, record or memory file whose real path leaves the
// worktree through a link fails the create before any of the three is written.
//
// reset keeps the worktree's HEAD on a side branch `<role>-was-<short sha>`, which it prints, and moves the worktree
// to the revision with `git reset --hard`, refusing while `git status --porcelain --untracked-files=no` prints
// anything, while a file other than the memory file differs from the index under skip-worktree or assume-unchanged,
// which that test cannot see, and while the revision tracks a path where the worktree holds an untracked or ignored
// file other than the memory file, since the move would overwrite it. The memory file's bytes are carried across the
// move whether it is tracked or not, and its skip-worktree bit is set again wherever the revision tracks it.
//
// archive copies every file of the worktree other than .git, listed by find, its memory file, docs/handoffs/ and
// record's directory among them, into `<Records>/lanes/<role>/` at their worktree paths, and repoints the epic's
// `- phase` member whose path names the lane's record, whatever its phase name, at the archived record, saying so
// when no member line names it. It refuses, copying nothing, when the project file or an epic it names cannot be
// read. remove lists the files by find again and refuses unless each one is archived with an equal sha256, then
// removes the worktree and keeps its branch. Both refuse a lane whose record does not exist.
//
// Every filename read from git is read NUL-separated (-z), never from trimmed or quoted output.
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
/** A git listing read NUL-separated: pass -z in `args`. */
const gitZ = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean)
const gitOk = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { stdio: 'ignore' }).status === 0
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
/** Every file of the worktree `root` other than its .git, by find, relative to `root`. */
const findFiles = (root) => execFileSync('find', [root, '-path', path.join(root, '.git'), '-prune', '-o', '-type', 'f', '-print0'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).map((f) => path.relative(root, f))
const inside = (root, p) => { const r = path.relative(root, p); return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r) }
/** `p` with the links in its existing prefix resolved, the rest as written; a dangling link throws. */
const realish = (p) => { let rest = ''; while (!fs.lstatSync(p, { throwIfNoEntry: false })) { rest = path.join(path.basename(p), rest); p = path.dirname(p) } return path.join(fs.realpathSync(p), rest) }
/** `f`'s ancestor directories, nearest last: a/b/c gives a, a/b. */
const ancestors = (f) => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))

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
/** The files archive keeps and remove checks, relative to the worktree, listed by find: every file but .git's, so an
 *  ignored file and one skip-worktree hides are among them; and the record the memory file's kickoff leads to. */
function laneFiles(wt) {
  let memory = ''
  try { memory = fs.readFileSync(path.join(wt, MEMORY), 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
  const handoff = kickoffHandoff(memory)
  const rec = handoff && fs.existsSync(path.join(wt, handoff)) ? handoffHeader(fs.readFileSync(path.join(wt, handoff), 'utf8')).record : null
  if (!rec || !inside(wt, path.resolve(wt, rec))) refuse(`the memory file of ${wt} leads to no record inside it`)
  if (!fs.existsSync(path.resolve(wt, rec))) refuse(`the record ${rec} of ${wt} does not exist`)
  return { files: findFiles(wt).sort(), record: rec }
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
    const held = gitZ(repo, 'worktree', 'list', '--porcelain', '-z').includes(`branch refs/heads/${base}`)
    if (held) refuse(`a worktree of ${repo} holds ${base}`)
  }
  let text
  try { text = fs.readFileSync(handoff, 'utf8') } catch (e) { refuse(`the handoff ${handoff} could not be read (${e.code || e.message})`) }
  const header = handoffHeader(text)
  if (!header.record) refuse(`the handoff ${handoff} names no record`)
  if (path.isAbsolute(header.record)) refuse(`the handoff ${handoff} names its record by an absolute path`)
  const recordPath = path.resolve(wt, header.record)
  if (!inside(wt, recordPath)) refuse(`the handoff ${handoff} names a record outside the worktree`)
  const handoffRel = path.posix.join(HANDOFFS, path.basename(handoff))
  const kickoff = ['## Next Session Kickoff', `handoff: ${handoffRel} | state: open`]
  if (kickoffHandoff(kickoff.join('\n')) !== handoffRel) refuse(`the kickoff line cannot carry the handoff name ${JSON.stringify(path.basename(handoff))}`)
  if (gitOk(repo, 'cat-file', '-e', `${base}:${handoffRel}`)) refuse(`${base} already tracks ${handoffRel}`)

  const made = [`the worktree ${wt}`]
  const fail = (why) => { process.stderr.write(`dctr-lane: create failed, ${why}; made ${made.join(', ')}, left in place, and lane.log not written\n`); process.exit(1) }
  try {
    git(repo, 'worktree', 'add', '--quiet', ...(merge ? [wt, base] : ['-b', role, wt, base]))
  } catch (e) { refuse(`git worktree add failed (${String(e.stderr || e.message).trim().split('\n')[0]})`) }
  let pane = null
  try {
    const real = fs.realpathSync(wt)
    const escapes = [handoffRel, header.record, MEMORY].filter((p) => !inside(real, realish(path.resolve(wt, p))))
    if (escapes.length) fail(`${escapes.join(', ')} would leave the worktree through a link`)
    fs.mkdirSync(path.join(wt, HANDOFFS), { recursive: true })
    fs.copyFileSync(handoff, path.join(wt, handoffRel))
    fs.mkdirSync(path.dirname(recordPath), { recursive: true })
    fs.writeFileSync(recordPath, `# ${header.phase || role} record\n\n- State: Open\n`)
    const memory = path.join(wt, MEMORY)
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
    if (!pane) fail('herdr made no pane')
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
  // S is skip-worktree and a lower-case tag assume-unchanged: both hide a change from the status test above
  const hidden = gitZ(wt, 'ls-files', '-v', '-z').filter((l) => /^(S|[a-z]) /.test(l)).map((l) => l.slice(2))
    .filter((f) => f !== MEMORY && fs.existsSync(path.join(wt, f)) && git(wt, 'hash-object', '--', f) !== git(wt, 'rev-parse', `:${f}`))
  if (hidden.length) refuse(`${wt} has changes skip-worktree or assume-unchanged hides from git status: ${hidden.map((f) => JSON.stringify(f)).join(', ')}`)
  const others = new Set([...gitZ(wt, 'ls-files', '-z', '--others'), ...gitZ(wt, 'ls-files', '-z', '--others', '--exclude-standard')])
  others.delete(MEMORY) // its bytes are carried across the move below
  const target = new Set(gitZ(wt, 'ls-tree', '-r', '-z', '--name-only', revision))
  const dirs = new Set([...target].flatMap(ancestors))
  const clobbered = [...others].filter((f) => target.has(f) || dirs.has(f) || ancestors(f).some((d) => target.has(d)))
  if (clobbered.length) refuse(`${revision} tracks paths where ${wt} holds untracked or ignored files a move would overwrite: ${clobbered.map((f) => JSON.stringify(f)).join(', ')}`)
  const old = git(wt, 'rev-parse', 'HEAD')
  const side = `${role}-was-${old.slice(0, 12)}`
  if (!gitOk(wt, 'show-ref', '--verify', '--quiet', `refs/heads/${side}`)) git(wt, 'branch', side, old)
  else if (git(wt, 'rev-parse', `refs/heads/${side}`) !== old) refuse(`the branch ${side} exists and is not at ${old}`)
  const memory = path.join(wt, MEMORY)
  let bytes = null
  try { bytes = fs.readFileSync(memory) } catch (e) { if (e.code !== 'ENOENT') throw e }
  const tracked = gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)
  try {
    if (tracked) git(wt, 'update-index', '--no-skip-worktree', MEMORY)
    git(wt, 'reset', '--quiet', '--hard', revision)
  } finally {
    if (bytes) fs.writeFileSync(memory, bytes)
    // asked again after the move: the revision may track a path the old HEAD did not
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
  const live = path.join(wt, record)
  const edits = memberEdits(live, path.join(dest, record))
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true })
    fs.copyFileSync(path.join(wt, f), path.join(dest, f))
  }
  for (const e of edits) {
    fs.writeFileSync(e.file, e.text)
    process.stdout.write(`repointed ${e.file}:${e.lines.join(',')} at the archived record\n`)
  }
  if (!edits.length) process.stdout.write(`no - phase member line names ${live}, so no epic was repointed\n`)
  append(role)
  process.stdout.write(`archived ${files.join(', ')} into ${dest}\n`)
}

/** The epic rewrites that repoint each `- phase` member line, in the epics of the project file's roster, whose path
 *  names the lane's record `live`, whatever its phase name, at the archived record by its path relative to the
 *  project repo, keeping its name and ordering clause: `{ file, text, lines }` per epic that changes. Refuses when the
 *  project file or a roster epic cannot be read, so archive copies nothing and remove then refuses. */
function memberEdits(live, archived) {
  const records = recordsDir()
  let top
  try { top = git(records, 'rev-parse', '--show-toplevel') } catch { refuse(`${records} is in no git repo, so no project file names its epics`) }
  const projectFile = path.join(top, 'docs/PROJECT.md')
  let project
  try { project = parseDoc(fs.readFileSync(projectFile, 'utf8')) } catch (e) { refuse(`the project file ${projectFile} could not be read (${e.code || e.message})`) }
  const rel = path.relative(top, archived)
  const edits = []
  for (const r of project.roster) {
    const file = path.join(top, r.record)
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch (e) { refuse(`the epic ${file} could not be read (${e.code || e.message})`) }
    const lines = text.split('\n'), hit = []
    for (const m of parseDoc(text).phases.filter((p) => p.record && path.resolve(top, p.record) === live)) {
      lines[m.line - 1] = `- phase ${m.name}: ${rel}${m.after ? ` after ${m.after} merged` : ''}`
      hit.push(m.line)
    }
    if (hit.length) edits.push({ file, text: lines.join('\n'), lines: hit })
  }
  return edits
}

function remove() {
  const wt = laneWorktree()
  const dest = path.join(recordsDir(), 'lanes', role)
  const { files } = laneFiles(wt)
  const differ = files.filter((f) => !fs.existsSync(path.join(dest, f)) || sha256(path.join(dest, f)) !== sha256(path.join(wt, f)))
  if (differ.length) refuse(`these files of ${wt} are not in ${dest} with an equal sha256: ${differ.join(', ')}`)
  const common = git(wt, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  git(path.dirname(common), 'worktree', 'remove', '--force', wt)
  append(role)
  process.stdout.write(`removed ${wt}\n`)
}

;({ create, reset, archive, remove })[sub]()
