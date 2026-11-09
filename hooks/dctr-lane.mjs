// doctrine — the lane worktree command (E15, RD-3): every worktree transition the orchestrator makes.
//
//   node hooks/dctr-lane.mjs create <role> <repo> <base> <handoff>
//   node hooks/dctr-lane.mjs reset <role> <revision>
//   node hooks/dctr-lane.mjs archive <role>
//   node hooks/dctr-lane.mjs remove <role>
//
// Four subcommands and no others. Each runs only where runRole() is `orchestrator`, reads the run from runRoot(),
// and refuses, exiting 1 and making nothing, on anything it checks before it writes. A failure after it writes exits 1
// and writes no lane.log line, but leaves what it made: a create, its worktree, which it names; a reset, its side
// branch, which it names, with HEAD already at the revision when only the memory file's restore or the lane.log append
// failed; an archive, the copies it made and any epic it repointed before an epic write failed, naming the copies'
// directory and the epics when only the lane.log append failed; a remove whose lane.log append fails, naming the
// worktree it removed. On success each
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
// to the revision with `git reset --hard`, refusing first, as archive does, a name find lists in the worktree that is
// not UTF-8, then while `git status --porcelain --untracked-files=no` prints
// anything, while the index holds a name that is not UTF-8, while a file other than the memory file is absent or differs from the index in bytes, mode or type under skip-worktree or
// assume-unchanged, which that test cannot see (a sparse checkout's absent files read the same and are refused too),
// while the revision tracks a path where the worktree holds an untracked or ignored file other than the memory file,
// since the move would overwrite it, and while the revision tracks the memory file as a link. The memory file's bytes
// are carried across the move whether it is tracked or not, saved first to `SESSION_MEMORY.md.was` in the worktree's
// git dir (`git rev-parse --git-path`), outside the work tree so no path the revision tracks can replace it, which is
// removed once they are back in place and which a reset that fails after saving them names; reset and remove refuse
// while that file exists. Its skip-worktree bit is set again wherever the revision tracks it.
//
// archive copies every file and link of the worktree other than .git, listed by find, its memory file, docs/handoffs/
// and record's directory among them, into `<Records>/lanes/<role>/` at their worktree paths, a link as a link, never
// writing through an entry an earlier archive left there, and repoints the epic's
// `- phase` member whose path names the lane's record, whatever its phase name, at the archived record, saying so
// when no member line names it. It refuses, copying nothing, when the project file or an epic it names cannot be
// read, a record reached through a link, an entry that is neither a file nor a link, and a name find lists that is not
// UTF-8, which remove refuses too. It appends its lane.log line
// last. remove refuses while a `- phase` member line of a roster epic still names the live record, read as archive
// reads it, since an earlier archive's lane.log line outlives a later archive that failed on the epic; and unless
// lane.log holds an archive line for the role since its latest create. remove lists the files by find again and
// refuses unless each file is archived with an equal sha256 and each link with the same target, then removes the
// worktree and keeps its branch.
// Both refuse a lane whose record does not exist.
//
// Every file listing, from find or git, is read NUL-separated, and a single path git prints (the toplevel, a git path,
// the common dir) loses only its trailing newline: none is read from trimmed or quoted output, and no listing has a
// size limit.
//
// remove also refuses while a tracked file other than the memory file has an uncommitted change, a deletion or one
// skip-worktree or assume-unchanged hides among them, a deletion it hides included, since the kept branch would lack it,
// and, as reset does, while the index holds a name that is not UTF-8, whose hidden change no decoded name can show.
//
// Contained (DCTR_VIEW_REQUEST_DIR set) create refuses before anything, and no subcommand calls herdr.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  runRole, runRoot, laneOf, LANE_LINE, kickoffHandoff, handoffHeader, RESUME_LINE, READY_STATUSES, AGENT_NAME_RE, PREFIX, tabCreateArgs, shq,
} from './dctr-lib.mjs'
import { herdr, isPaneNotFound, sleepMs } from './dctr-state.mjs'
import { parseDoc } from './dctr-project.mjs'

const MEMORY = 'SESSION_MEMORY.md'
const HANDOFFS = 'docs/handoffs'
let times = { poll: 1000, ready: 300000 }
try { times = { ...times, ...JSON.parse(process.env.DCTR_LANE_TIMES || '{}') } } catch { /* the defaults */ }

const refuse = (why) => { process.stderr.write(`dctr-lane: refused, ${why}\n`); process.exit(1) }
const LISTING = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Infinity }
// Only git's trailing newline is dropped: a path it prints may end in whitespace of its own.
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], LISTING).replace(/\n$/, '')
/** A git listing read NUL-separated: pass -z in `args`. */
const gitZ = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], LISTING).split('\0').filter(Boolean)
// A git or fs error's first line, for a refusal.
const why = (e) => String(e?.stderr || e?.message || e).trim().split('\n')[0]
const gitOk = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { stdio: 'ignore' }).status === 0
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
/** Whether `a` and `b` are both links with one target, or both files with one sha256; any failed read is not. */
const same = (a, b) => {
  try {
    const x = fs.lstatSync(a), y = fs.lstatSync(b)
    if (x.isSymbolicLink()) return y.isSymbolicLink() && fs.readlinkSync(a, 'buffer').equals(fs.readlinkSync(b, 'buffer'))
    return x.isFile() && y.isFile() && sha256(a) === sha256(b)
  } catch { return false }
}
/** Every entry of the worktree `root` but its directories and its .git, links among them, by find, relative to `root`.
 *  The listing is read as bytes and a name that does not survive a UTF-8 decode and re-encode is refused: decoded, it
 *  can read as another file's name, which is then handled twice and it never. */
const findFiles = (root) => utf8Entries(execFileSync('find', [root, '-path', path.join(root, '.git'), '-prune', '-o', '!', '-type', 'd', '-print0'], { ...LISTING, encoding: 'buffer' }))
  .map((f) => path.relative(root, f))
/** The NUL-separated listing `out`, read as bytes, as text entries, refusing first any entry whose name (`name` picks
 *  its bytes from the entry) does not survive a UTF-8 decode and re-encode. */
const utf8Entries = (out, name = (b) => b) => {
  const entries = []
  for (let at = 0, end; (end = out.indexOf(0, at)) >= 0; at = end + 1) if (end > at) entries.push(out.subarray(at, end))
  const lossy = entries.filter((b) => !Buffer.from(b.toString()).equals(b))
  if (lossy.length) refuse(`${lossy.map((b) => escaped(name(b))).join(', ')} is not a UTF-8 name, so archive, remove and reset cannot name it`)
  return entries.map(String)
}
/** `b` as text, a byte outside printable ASCII, and the backslash, as \xHH. */
const escaped = (b) => [...b].map((c) => (c >= 0x20 && c < 0x7f && c !== 0x5c ? String.fromCharCode(c) : `\\x${c.toString(16).padStart(2, '0')}`)).join('')
const inside = (root, p) => { const r = path.relative(root, p); return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r) }
/** `p` with the links in its existing prefix resolved, the rest as written; a dangling link throws. */
const realish = (p) => { let rest = ''; while (!fs.lstatSync(p, { throwIfNoEntry: false })) { rest = path.join(path.basename(p), rest); p = path.dirname(p) } return path.join(fs.realpathSync(p), rest) }
/** `f`'s ancestor directories, nearest last: a/b/c gives a, a/b. */
/** The tracked files of `wt` other than the memory file whose change skip-worktree or assume-unchanged (a lower-case
 *  tag) hides from git status: absent, a mode or type other than the index entry's, or bytes that differ from it. A
 *  sparse checkout's absent files carry the same tag and are counted too, since nothing in the index tells the two
 *  apart. Every index entry's name is read as bytes and one that is not UTF-8 is refused: decoded, it can name another
 *  file whose bytes match the entry's, and its own change goes unseen. shortcut: the executable bit is compared even where core.fileMode is false, which refuses a change git would
 *  ignore; read that setting if such a lane appears. */
const hiddenChanges = (wt) => utf8Entries(execFileSync('git', ['-C', wt, 'ls-files', '-v', '-s', '-z'], { ...LISTING, encoding: 'buffer' }), (b) => b.subarray(b.indexOf(9) + 1)).map((l) => /^(?:S|[a-z]) (\d+) ([0-9a-f]+) \d\t(.*)$/s.exec(l)).filter(Boolean)
  .filter(([, mode, blob, f]) => f !== MEMORY && !asIndexed(wt, f, mode, blob)).map((m) => m[3])
/** Whether `f` in `wt` is what git would record as `mode` and `blob`: a link by its target, a file by its bytes and its
 *  owner's executable bit, since a byte compare alone passes a mode or type change that worktree remove then drops. */
const asIndexed = (wt, f, mode, blob) => {
  const p = path.join(wt, f), st = fs.lstatSync(p, { throwIfNoEntry: false })
  const now = !st ? null : st.isSymbolicLink() ? '120000' : st.isFile() ? (st.mode & 0o100 ? '100755' : '100644') : null
  if (now !== mode) return false
  return (now === '120000' ? execFileSync('git', ['-C', wt, 'hash-object', '--stdin'], { ...LISTING, stdio: ['pipe', 'pipe', 'pipe'], input: fs.readlinkSync(p, 'buffer') }).trim() : git(wt, 'hash-object', '--', f)) === blob
}
const ancestors = (f) => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))
/** Where reset keeps the memory bytes across its move: in the worktree's own git dir, which no checkout or reset of
 *  the worktree writes, whatever paths the revision tracks. */
const savedOf = (wt) => git(wt, 'rev-parse', '--path-format=absolute', '--git-path', `${MEMORY}.was`)
const UNFINISHED = 'holds the memory bytes of an earlier reset that did not finish'

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
/** Appends the subcommand's lane.log line. With `done`, what the subcommand already did, a failed append exits 1
 *  saying so and naming it; without it the error is thrown to create's own failure path. */
const append = (line, done) => {
  try { fs.appendFileSync(laneLog, `${new Date().toISOString()} ${caller} ${sub} ${line}\n`) } catch (e) {
    if (done === undefined) throw e
    process.stderr.write(`dctr-lane: ${sub} failed, lane.log could not be written (${e.code || e.message}); ${done}\n`)
    process.exit(1)
  }
}
const readLog = () => { try { return fs.readFileSync(laneLog, 'utf8') } catch (e) { if (e.code === 'ENOENT') return ''; throw e } }

/** The lane's worktree from its latest create line, or a refusal. */
function laneWorktree() {
  const l = laneOf(readLog(), role)
  if (!l) refuse(`lane.log holds no create line for ${role}`)
  if (!fs.existsSync(l.worktree)) refuse(`the worktree ${l.worktree} of ${role} does not exist`)
  return l.worktree
}
/** Whether lane.log holds an archive line for the role after its latest create line: archive appends it last. */
function archivedSinceCreate() {
  let done = false
  for (const l of readLog().split('\n')) {
    const m = LANE_LINE.exec(l)
    if (m && m[4].split(' ')[0] === role && (m[3] === 'create' || m[3] === 'archive')) done = m[3] === 'archive'
  }
  return done
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
  const real = fs.realpathSync(wt)
  if (realish(path.resolve(real, rec)) !== path.resolve(real, rec)) refuse(`the record ${rec} of ${wt} is reached through a link`)
  const files = findFiles(wt).sort()
  const odd = files.filter((f) => { const st = fs.lstatSync(path.join(wt, f)); return !st.isFile() && !st.isSymbolicLink() })
  if (odd.length) refuse(`${odd.map((f) => JSON.stringify(f)).join(', ')} of ${wt} is neither a file nor a link, so archive cannot copy it`)
  return { files, record: rec }
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
  } catch (e) { refuse(`git worktree add failed (${why(e)})`) }
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
  } catch (e) { fail(why(e)) }
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
  findFiles(wt) // its refusal of a name that is not UTF-8, before any guard reads a decoded name (LA-1)
  if (!gitOk(wt, 'rev-parse', '--verify', '--quiet', `${revision}^{commit}`)) refuse(`${revision} is not a commit`)
  const dirty = git(wt, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) refuse(`${wt} has uncommitted changes a move would discard:\n${dirty}`)
  const hidden = hiddenChanges(wt)
  if (hidden.length) refuse(`${wt} has changes skip-worktree or assume-unchanged hides from git status: ${hidden.map((f) => JSON.stringify(f)).join(', ')}`)
  const others = new Set([...gitZ(wt, 'ls-files', '-z', '--others'), ...gitZ(wt, 'ls-files', '-z', '--others', '--exclude-standard')])
  others.delete(MEMORY) // its bytes are carried across the move below
  const target = new Set(gitZ(wt, 'ls-tree', '-r', '-z', '--name-only', revision))
  const dirs = new Set([...target].flatMap(ancestors))
  const clobbered = [...others].filter((f) => target.has(f) || dirs.has(f) || ancestors(f).some((d) => target.has(d)))
  if (clobbered.length) refuse(`${revision} tracks paths where ${wt} holds untracked or ignored files a move would overwrite: ${clobbered.map((f) => JSON.stringify(f)).join(', ')}`)
  if (gitZ(wt, 'ls-tree', '-z', revision, '--', MEMORY).some((l) => l.startsWith('120000 '))) refuse(`${revision} tracks ${MEMORY} as a link, so its bytes cannot be carried across the move`)
  const saved = savedOf(wt)
  if (fs.lstatSync(saved, { throwIfNoEntry: false })) refuse(`${saved} ${UNFINISHED}`)
  const memory = path.join(wt, MEMORY)
  let bytes = null
  // read before the side branch is made, so a file it cannot read refuses with nothing made
  try { bytes = fs.readFileSync(memory) } catch (e) { if (e.code !== 'ENOENT') refuse(`the memory file ${memory} could not be read (${e.code || e.message})`) }
  const old = git(wt, 'rev-parse', 'HEAD')
  const side = `${role}-was-${old.slice(0, 12)}`
  if (!gitOk(wt, 'show-ref', '--verify', '--quiet', `refs/heads/${side}`)) git(wt, 'branch', side, old)
  else if (git(wt, 'rev-parse', `refs/heads/${side}`) !== old) refuse(`the branch ${side} exists and is not at ${old}`)
  const tracked = gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)
  let failed = null, pending = Boolean(bytes)
  // the bytes sit in `saved` until they are back in place, so a failure anywhere below loses none of them
  if (pending) try { fs.writeFileSync(saved, bytes, { flag: 'wx' }) } catch (e) { failed = `the memory bytes could not be saved to ${saved} (${e.code || e.message})`; pending = false }
  if (!failed) {
    try {
      if (tracked) git(wt, 'update-index', '--no-skip-worktree', MEMORY)
      git(wt, 'reset', '--quiet', '--hard', revision)
    } catch (e) { failed = why(e) }
    try {
      if (pending) { fs.writeFileSync(memory, bytes); pending = false; fs.rmSync(saved) }
      // asked again after the move: the revision may track a path the old HEAD did not
      if (gitOk(wt, 'ls-files', '--error-unmatch', MEMORY)) git(wt, 'update-index', '--skip-worktree', MEMORY)
    } catch (e) { failed ??= why(e) }
  }
  if (failed) {
    process.stderr.write(`dctr-lane: reset failed, ${failed}; the old HEAD is on ${side}${pending ? `, and the memory file's bytes are in ${saved}` : ''}\n`)
    process.exit(1)
  }
  append(`${role} ${revision}`, `the old HEAD is on ${side}, and HEAD is at ${revision}`)
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
    // an earlier archive's entry where this one needs a directory, or at the file itself, is replaced, never written through
    for (const d of ancestors(f)) if (fs.lstatSync(path.join(dest, d), { throwIfNoEntry: false })?.isDirectory() === false) fs.rmSync(path.join(dest, d))
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true })
    fs.rmSync(path.join(dest, f), { recursive: true, force: true })
    if (fs.lstatSync(path.join(wt, f)).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(path.join(wt, f), 'buffer'), path.join(dest, f))
    else fs.copyFileSync(path.join(wt, f), path.join(dest, f))
  }
  for (const e of edits) {
    fs.writeFileSync(e.file, e.text)
    process.stdout.write(`repointed ${e.file}:${e.lines.join(',')} at the archived record\n`)
  }
  if (!edits.length) process.stdout.write(`no - phase member line names ${live}, so no epic was repointed\n`)
  append(role, `the copies are in ${dest}${edits.length ? `, and ${edits.map((e) => e.file).join(', ')} repointed` : ''}`)
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
  const { files, record } = laneFiles(wt)
  // the bytes sit outside the worktree, so neither archive nor the sha check below sees them, and removal deletes them
  if (fs.lstatSync(savedOf(wt), { throwIfNoEntry: false })) refuse(`${savedOf(wt)} ${UNFINISHED}`)
  // a log line since the create cannot say the epic was written: an earlier archive's line outlives a later failed one
  const naming = memberEdits(path.join(wt, record), path.join(dest, record))
  if (naming.length) refuse(`${naming.map((e) => `${e.file}:${e.lines.join(',')}`).join(', ')} still names the live record of ${role}, so no archive repointed it`)
  if (!archivedSinceCreate()) refuse(`lane.log holds no archive line for ${role} since its create, so no archive of it finished`)
  const changed = [...gitZ(wt, 'diff', '--name-only', '-z', 'HEAD'), ...hiddenChanges(wt)].filter((f) => f !== MEMORY)
  if (changed.length) refuse(`${wt} has uncommitted changes to tracked files its kept branch would lack: ${changed.map((f) => JSON.stringify(f)).join(', ')}`)
  const differ = files.filter((f) => !same(path.join(wt, f), path.join(dest, f)))
  if (differ.length) refuse(`these files of ${wt} are not in ${dest} with an equal sha256, or as a link to the same target: ${differ.join(', ')}`)
  const common = git(wt, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  git(path.dirname(common), 'worktree', 'remove', '--force', wt)
  append(role, `${wt} is removed and its branch kept`)
  process.stdout.write(`removed ${wt}\n`)
}

;({ create, reset, archive, remove })[sub]()
