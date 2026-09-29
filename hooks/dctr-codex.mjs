// The doctrine's hooks on Codex CLI (E10-D1 to E10-D6).
//
//   node hooks/dctr-codex.mjs install [--codex-home DIR]
//
// Copies this hooks directory to <CODEX_HOME>/doctrine/hooks, so a plugin update never strands the absolute paths
// hooks.json holds, then writes the doctrine entries into <CODEX_HOME>/hooks.json, a trust line for each into
// config.toml, and sandbox_workspace_write.network_access = true, which a command Codex runs in its workspace-write
// sandbox needs to reach herdr. What it writes is codexInstallPlan's in dctr-lib.mjs; this file only reads, copies
// and writes. CODEX_HOME is resolved as Codex resolves it: --codex-home, else $CODEX_HOME, each of which must be an
// existing directory and is canonicalized, else ~/.codex. Exit 0 installed or already current, 2 usage, 1 failed: a
// refusal (a layout it cannot edit in place, an unreadable file) writes nothing, but a write that fails after the hooks
// copy or hooks.json has landed leaves those changes in place, and the message says it failed part way.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { codexInstallPlan } from './dctr-lib.mjs'

const USAGE = 'usage: node dctr-codex.mjs install [--codex-home DIR]\n'
const refuse = (msg) => { process.stderr.write(`dctr-codex install refused: ${msg}\n`); process.exit(1) }

const [mode, ...rest] = process.argv.slice(2)
if (mode !== 'install' || !(rest.length === 0 || (rest.length === 2 && rest[0] === '--codex-home'))) { process.stderr.write(USAGE); process.exit(2) }

const given = rest[1] ?? (process.env.CODEX_HOME || null)
let home = path.join(os.homedir(), '.codex')
if (given !== null) {
  try { home = fs.realpathSync(given) } catch { refuse(`CODEX_HOME ${given} does not exist`) }
  if (!fs.statSync(home).isDirectory()) refuse(`CODEX_HOME ${given} is not a directory`)
}
const hooksPath = path.join(home, 'hooks.json'), configPath = path.join(home, 'config.toml')
const hookDir = path.join(home, 'doctrine', 'hooks')
const read = (file) => { try { return fs.readFileSync(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; refuse(`${file}: ${e.message}`) } }
const before = { hooks: read(hooksPath), config: read(configPath) }

let plan
try { plan = codexInstallPlan({ hooksJson: before.hooks, configToml: before.config, hookDir, hooksJsonPath: hooksPath }) } catch (e) { refuse(e.message) }

/** Written through a symlink to the file it names, with that file's mode (a new file gets 0600: config.toml can hold
 *  tokens), so a dotfiles link stays a link and a 0600 config stays 0600 whatever the umask (E10H-B6). */
const writeAtomic = (file, data) => {
  let target = file
  try { target = fs.realpathSync(file) } catch { /* a new file */ }
  let mode = 0o600
  try { mode = fs.statSync(target).mode & 0o777 } catch { /* a new file */ }
  const tmp = `${target}.tmp.${process.pid}`
  fs.writeFileSync(tmp, data, { mode })
  fs.chmodSync(tmp, mode)
  fs.renameSync(tmp, target)
}
const src = import.meta.dirname
const same = (a, b) => { try { return Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0 } catch { return false } }
const current = (() => {
  try { const want = fs.readdirSync(src).sort(), have = fs.readdirSync(hookDir).sort()
    return JSON.stringify(want) === JSON.stringify(have) && want.every((f) => same(path.join(src, f), path.join(hookDir, f))) } catch { return false }
})()
try {
  fs.mkdirSync(home, { recursive: true })
  if (current) console.log(`${hookDir} is current`)
  else {
    // Replace the whole directory, so a script a newer version dropped does not linger.
    const tmp = `${hookDir}.tmp.${process.pid}`
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.cpSync(src, tmp, { recursive: true })
    fs.rmSync(hookDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(hookDir), { recursive: true })
    fs.renameSync(tmp, hookDir)
    console.log(`copied the doctrine hooks to ${hookDir}`)
  }
  if (plan.hooksJson !== before.hooks) writeAtomic(hooksPath, plan.hooksJson)
  if (plan.configToml !== before.config) writeAtomic(configPath, plan.configToml)
} catch (e) { process.stderr.write(`dctr-codex install failed part way: ${e.message}\n`); process.exit(1) }
for (const m of plan.messages) console.log(m.replace(/^(hooks\.json|config\.toml)/, (f) => path.join(home, f)))
