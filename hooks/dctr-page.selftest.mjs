// Three-clause tamper test for the page server, hooks/dctr-page.mjs, per CLAUDE.md.
//
//   node hooks/dctr-page.selftest.mjs      exit 0 all clauses passed, 1 otherwise
//
// Seams: S-B startRefusal (start arguments and env to a refusal line or null), S-C requestDecision (one
// request's method, url, Host and Authorization to a refusal or null, never a reader), S-D pageHtml and
// errorHtml (lines to escaped HTML). Each is checked pure, then end to end on a server spawned with
// --port 0 over a fixture tracking root, its page compared with what `dctr-project.mjs status` prints for
// the same tree in the same environment. Each seam gets the three clauses:
//   (1) a broken input trips the refusal or the escape only its branch makes,
//   (2) a known-good input stays quiet: null, 200, or the status text unchanged,
//   (3) the fixture carries its defect, asserted without calling the server.
// A tripwire herdr is first on PATH with HERDR_ENV unset, so "herdr called zero times" is counted.

import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { startRefusal, requestDecision, pageHtml, errorHtml } from './dctr-page.mjs'

let bad = 0
const clause = (n, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) { bad++; console.log('        ' + detail) } }

const PAGE = path.join(import.meta.dirname, 'dctr-page.mjs')
const PROJECT = path.join(import.meta.dirname, 'dctr-project.mjs')
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dctr-page-')))
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin)
const trip = path.join(tmp, 'herdr-was-called')
fs.writeFileSync(path.join(bin, 'herdr'), `#!/bin/sh\ntouch ${JSON.stringify(trip)}\nexit 0\n`); fs.chmodSync(path.join(bin, 'herdr'), 0o755)
const home = path.join(tmp, 'home')
// An empty codex state dir: codex jobs read as (none), while live seats, outside herdr, read as unknown.
fs.mkdirSync(path.join(home, '.claude', 'plugins', 'data', 'codex-openai-codex', 'state'), { recursive: true })
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, HERDR_WORKSPACE_ID: '', HERDR_PANE_ID: '', DCTR_VIEW_REQUEST_DIR: '', DCTR_PAGE_PASSWORD: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_CONFIG_DIR: '' }
delete env.HERDR_ENV

// ---------------------------------------------------------------- the fixture tracking root
const root = path.join(tmp, 'track')
const P = path.join(root, 'docs/PROJECT.md')
const write = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body) }
write(P, '# Project: page\nState: Ruled\nCurrent epic: E7\nCertification target: none\nRecords: docs/records\n\n## Epics\n| ID | Title | Record |\n|---|---|---|\n| E7 | One | docs/epics/E7.md |\n')
write(path.join(root, 'docs/epics/E7.md'), '# Epic E7: One\nState: Open\n')
write(path.join(root, 'docs/records/alpha.md'), '# Phase alpha <i>&amp;</i> "q"\nstate: Open\n')
// Values the page shows and no refusal body may carry.
const VALUES = ['project: Ruled', '  E7 ', 'current epic: E7', 'Phase alpha', 'state: Open']
const carriesValue = (body) => VALUES.some((v) => body.includes(v))

const cliStatus = () => spawnSync('node', [PROJECT, 'status', root], { env, encoding: 'utf8' })
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
// The text inside the one <pre>, unescaped, less the newline after <pre> the HTML parser drops.
const preText = (html) => { const m = /<pre>\n?([\s\S]*?)<\/pre>/.exec(html); return m ? unescape(m[1]) : null }

// ---------------------------------------------------------------- spellings of --host (P1-B1, P1-B2, N6)
// Every --host is judged on one canonical form, so each spelling below must get the verdict its address gets.
const WILDCARD_SPELLINGS = ['0.0.0.0', '0', '0x0', '0.0', '00.0.0.0', '::', '::0', '0:0:0:0:0:0:0:0', '::ffff:0.0.0.0', '[::]']
const LOOPBACK_SPELLINGS = ['127.0.0.1', '127.1', '127.9.9.9', '0177.0.0.1', '2130706433', '::1', '0:0:0:0:0:0:0:1', '[::1]', 'localhost', 'LOCALHOST', 'LocalHost']
// ::ffff:127.0.0.1 stays non-loopback: the spec's list is 127.0.0.0/8, ::1 and localhost (G5).
const NONLOOP_SPELLINGS = ['192.0.2.1', '10.0.0.1', '128.0.0.1', '1.127.0.0', '::ffff:127.0.0.1', 'mymac.local', 'MyMac.local', 'localhost.', '127.0.0.1.example']
const MALFORMED_HOSTS = ['127.0.0.1:80', '127.0.0.1:8080', '[::1]:80', 'a b', 'a/b', 'u@h', 'h?x', 'h#x', '256.0.0.1',
  // Each of these the URL parser normalises to a clean 127.0.0.1, so only the raw text shows it is not one host (P2-C1).
  '127.0.0.1/a/..', '127.0.0.1/..', '@127.0.0.1', '//127.0.0.1', '\\127.0.0.1', '127.0.0.1\t', '127.0.0.1\n', '\n127.0.0.1', '127.0.0.1\u0000']
// A non-internal IPv4 address of this host, where it has one: what a wildcard answers on and a loopback bind does not.
const LAN = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
const UNSPECIFIED = ['0.0.0.0', '::', '::ffff:0.0.0.0']

// ---------------------------------------------------------------- S-B startRefusal (pure)
{
  const file = path.join(tmp, 'a-file'); fs.writeFileSync(file, 'x')
  const missing = path.join(tmp, 'no-such-dir')
  const ok = { host: '127.0.0.1', port: '8787', root }
  const goods = [
    ['the default bind', ok, {}],
    ['--port 0', { ...ok, port: '0' }, {}],
    ['another 127/8 address with no password', { ...ok, host: '127.9.9.9' }, {}],
    ['::1 with no password', { ...ok, host: '::1' }, {}],
    ['localhost with no password', { ...ok, host: 'localhost' }, {}],
    ['a non-loopback host with a password', { ...ok, host: '192.0.2.1' }, { DCTR_PAGE_PASSWORD: 'pw' }],
    ['a relative root that is a directory', { ...ok, root: path.relative(process.cwd(), root) }, {}],
  ]
  for (const h of LOOPBACK_SPELLINGS) goods.push([`loopback spelling --host ${h} with no password`, { ...ok, host: h }, {}])
  for (const h of NONLOOP_SPELLINGS) goods.push([`non-loopback spelling --host ${h} with a password`, { ...ok, host: h }, { DCTR_PAGE_PASSWORD: 'pw' }])
  for (const [name, args, e] of goods) clause(`S-B [2: ${name} is not refused]`, startRefusal(args, e) === null, String(startRefusal(args, e)))
  const NONLOOP = ['192.0.2.1', '10.0.0.1', '128.0.0.1', '1.127.0.0']
  const WILDCARD = WILDCARD_SPELLINGS
  const refusals = [
    ['a contained session', ok, { DCTR_VIEW_REQUEST_DIR: tmp }, /contained/],
    ['a contained session with every other argument bad too', { host: '192.0.2.1', port: 'x' }, { DCTR_VIEW_REQUEST_DIR: tmp }, /contained/],
    ...NONLOOP.flatMap((h) => [
      [`--host ${h} with DCTR_PAGE_PASSWORD unset`, { ...ok, host: h }, {}, /DCTR_PAGE_PASSWORD/],
      [`--host ${h} with DCTR_PAGE_PASSWORD empty`, { ...ok, host: h }, { DCTR_PAGE_PASSWORD: '' }, /DCTR_PAGE_PASSWORD/],
    ]),
    ...['abc', '65536', '-1', '', '1.5', ' 80', '8e3'].map((p) => [`--port ${JSON.stringify(p)}`, { ...ok, port: p }, {}, /port/]),
    ...WILDCARD.flatMap((h) => [
      [`--host ${h}, a wildcard bind, with no password`, { ...ok, host: h }, {}, /wildcard.*specific address/],
      [`--host ${h}, a wildcard bind, with DCTR_PAGE_PASSWORD set`, { ...ok, host: h }, { DCTR_PAGE_PASSWORD: 'pw' }, /wildcard.*specific address/],
    ]),
    ...NONLOOP_SPELLINGS.map((h) => [`non-loopback spelling --host ${h} with no password`, { ...ok, host: h }, {}, /DCTR_PAGE_PASSWORD/]),
    ...MALFORMED_HOSTS.map((h) => [`--host ${JSON.stringify(h)}, which is not one host`, { ...ok, host: h }, { DCTR_PAGE_PASSWORD: 'pw' }, /--host .* is not a host/]),
    ['an empty --host', { ...ok, host: '' }, {}, /host/],
    ['no tracking root', { host: ok.host, port: ok.port }, {}, /usage/],
    ['a tracking root that is a file', { ...ok, root: file }, {}, /not a directory/],
    ['a tracking root that does not exist', { ...ok, root: missing }, {}, /not a directory/],
    ['a tracking root whose name holds a newline', { ...ok, root: `${missing}\nsecond line` }, {}, /not a directory/],
  ]
  for (const [name, args, e, re] of refusals) {
    const r = startRefusal(args, e)
    clause(`S-B [1: ${name} is refused with one line naming why]`, typeof r === 'string' && !r.includes('\n') && re.test(r), String(r))
  }
  // An oracle that does not call the server: node's own subnet matcher over the loopback ranges.
  const loop = new net.BlockList(); loop.addSubnet('127.0.0.0', 8, 'ipv4'); loop.addAddress('::1', 'ipv6')
  clause('S-B [3: every non-loopback host above is outside 127.0.0.0/8 and ::1, and not localhost, by net.BlockList]',
    NONLOOP.every((h) => !loop.check(h, net.isIPv6(h) ? 'ipv6' : 'ipv4')) && ['127.9.9.9', '::1'].every((h) => loop.check(h, net.isIPv6(h) ? 'ipv6' : 'ipv4')), 'fixture')
  // The first eight P2-C1 spellings; the NUL one the parser rejects by itself.
  clause('S-B [3: eight P2-C1 spellings each carry a /, \\, @, whitespace or control character, yet the URL parser alone reads each as 127.0.0.1]',
    MALFORMED_HOSTS.slice(9, 17).length === 8 && MALFORMED_HOSTS.slice(9, 17).every((h) => /[/\\@\s\u0000-\u001f]/.test(h) && new URL(`http://${h}/`).hostname === '127.0.0.1'), 'fixture')
  clause('S-B [3: the file root is a regular file, the missing root does not exist, and the good root is a directory]',
    fs.statSync(file).isFile() && !fs.existsSync(missing) && fs.statSync(root).isDirectory(), 'fixture')
}

// ---------------------------------------------------------------- S-C requestDecision (pure)
{
  const L = { bind: '127.0.0.1', port: 8787, password: '' }
  const N = { bind: '192.0.2.1', port: 8787, password: 's3cret' }
  const V6 = { bind: '::1', port: 8787, password: '' }
  const basic = (user, pw) => `Basic ${Buffer.from(`${user}:${pw}`).toString('base64')}`
  const req = (over) => ({ method: 'GET', url: '/', host: '127.0.0.1:8787', authorization: undefined, ...over })
  const nreq = (over) => req({ host: '192.0.2.1:8787', authorization: basic('anyone', 's3cret'), ...over })
  const served = [
    ['GET / on the bind address', req({}), L],
    ['HEAD /', req({ method: 'HEAD' }), L],
    ['Host localhost:<port> on a loopback bind', req({ host: 'localhost:8787' }), L],
    ['a query string on /', req({ url: '/?x=1' }), L],
    ['a loopback bind with no credentials at all', req({ authorization: undefined }), L],
    ['[::1]:<port> on an ::1 bind', req({ host: '[::1]:8787' }), V6],
    ['localhost:<port> on an ::1 bind', req({ host: 'localhost:8787' }), V6],
    ['the right password under any username', nreq({}), N],
    ['the right password with an empty username', nreq({ authorization: basic('', 's3cret') }), N],
    // Mixed-case and shorthand binds (P1-B2): the bind is judged on its canonical form, the Host header case-blind.
    ...['mymac.local:8787', 'MYMAC.LOCAL:8787', 'MyMac.local:8787'].map((h) => [`Host ${h} on bind MyMac.local`, nreq({ host: h }), { ...N, bind: 'MyMac.local' }]),
    ...['localhost:8787', 'LocalHost:8787'].map((h) => [`Host ${h} on bind LOCALHOST`, req({ host: h }), { ...L, bind: 'LOCALHOST' }]),
    ['Host 127.0.0.1:<port> on bind 127.1', req({ host: '127.0.0.1:8787' }), { ...L, bind: '127.1' }],
    ['Host [::1]:<port> on bind 0:0:0:0:0:0:0:1', req({ host: '[::1]:8787' }), { ...L, bind: '0:0:0:0:0:0:0:1' }],
    ['no credentials on bind LOCALHOST, which is loopback', req({ host: 'localhost:8787', authorization: undefined }), { ...L, bind: 'LOCALHOST' }],
  ]
  // Every case runs with the fs readers counted: a decision that reads a file is a reader call.
  const counted = ['readFileSync', 'readdirSync', 'statSync', 'existsSync', 'realpathSync']
  const real = Object.fromEntries(counted.map((k) => [k, fs[k]]))
  let reads = 0
  for (const k of counted) fs[k] = (...a) => { reads++; return real[k](...a) }
  const results = []
  try {
    for (const [name, r, cfg] of served) results.push([`S-C [2: ${name} is served (null)]`, requestDecision(r, cfg), null])
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'get']
    for (const m of methods) results.push([`S-C [1: ${m} / gets 405]`, requestDecision(req({ method: m }), L), 405])
    results.push(['S-C [1: POST to a wrong path with a wrong Host gets 405, method checked first]', requestDecision(req({ method: 'POST', url: '/x', host: 'evil:1' }), L), 405])
    for (const u of ['/x', '//', '/index.html', '/favicon.ico', 'http://127.0.0.1:8787/'])
      results.push([`S-C [1: GET ${u} gets 404]`, requestDecision(req({ url: u }), L), 404])
    results.push(['S-C [1: a wrong path with a wrong Host gets 404, path checked before Host]', requestDecision(req({ url: '/x', host: 'evil:1' }), L), 404])
    const hosts = [['attacker.example:8787', L], ['127.0.0.1:9999', L], ['127.0.0.1', L], [undefined, L], ['', L], ['127.0.0.1:8787.evil', L],
      ['localhost:8787', N], ['::1:8787', V6], ['[::1]', V6], ['127.0.0.1:8787', V6],
      ['othermac.local:8787', { ...N, bind: 'MyMac.local' }], ['mymac.local:9999', { ...N, bind: 'MyMac.local' }], ['other:8787', { ...L, bind: 'LOCALHOST' }]]
    for (const [h, cfg] of hosts) results.push([`S-C [1: Host ${JSON.stringify(h)} on bind ${cfg.bind} gets 421]`, requestDecision((cfg === N ? nreq : req)({ host: h }), cfg), 421])
    // Missing credentials too, so an auth check moved ahead of the Host check would answer 401 here (P1-C5).
    results.push(['S-C [1: a wrong Host with NO credentials on a non-loopback bind gets 421, not 401: Host is checked before credentials]', requestDecision(nreq({ host: 'evil:8787', authorization: undefined }), N), 421])
    results.push(['S-C [1: a wrong Host with the right password gets 421]', requestDecision(nreq({ host: 'evil:8787' }), N), 421])
    const auths = [['no Authorization', undefined], ['a wrong password', basic('u', 'wrong')], ['the password with a character added', basic('u', 's3cret!')],
      ['a prefix of the password', basic('u', 's3cre')], ['a Bearer token carrying the password', 'Bearer s3cret'], ['Basic with no colon', `Basic ${Buffer.from('s3cret').toString('base64')}`],
      ['the password as the username', basic('s3cret', '')], ['Basic with nothing after it', 'Basic ']]
    for (const [name, a] of auths) results.push([`S-C [1: ${name} on a non-loopback bind gets 401]`, requestDecision(nreq({ authorization: a }), N), 401])
    clause('S-C [2: a password holding a colon is the whole text after the first colon]',
      requestDecision(nreq({ authorization: basic('u', 'a:b') }), { ...N, password: 'a:b' }) === null, 'refused')
  } finally { for (const k of counted) fs[k] = real[k] }
  for (const [name, got, want] of results) {
    const ok = want === null ? got === null : got?.status === want
    clause(name, ok, JSON.stringify(got))
  }
  const r405 = requestDecision(req({ method: 'POST' }), L), r401 = requestDecision(nreq({ authorization: undefined }), N)
  clause('S-C [1: 405 names GET and HEAD in Allow, and 401 carries WWW-Authenticate: Basic realm="doctrine"]',
    r405?.headers?.Allow === 'GET, HEAD' && r401?.headers?.['WWW-Authenticate'] === 'Basic realm="doctrine"', JSON.stringify([r405, r401]))
  clause('S-C — requestDecision made ZERO file reads over every case above', reads === 0, `${reads} reads`)
  clause('S-C [3: the mixed-case names differ from the bind only in case, and the refused ones differ in name or port]',
    ['MYMAC.LOCAL', 'MyMac.local'].every((n) => n !== 'mymac.local' && n.toLowerCase() === 'mymac.local') && 'LocalHost' !== 'LOCALHOST' && 'LocalHost'.toLowerCase() === 'LOCALHOST'.toLowerCase() &&
    'othermac.local' !== 'mymac.local' && 'other' !== 'localhost', 'fixture')
  clause('S-C [3: the attacker Host names neither the bind nor localhost, and the wrong passwords differ from s3cret]',
    !['127.0.0.1:8787', 'localhost:8787'].includes('attacker.example:8787') && ['wrong', 's3cret!', 's3cre'].every((p) => p !== N.password), 'fixture')
}

// ---------------------------------------------------------------- S-D pageHtml, errorHtml (pure)
{
  const lines = ['project: <b>Ruled</b> & "x" \'y\'', 'a < b < c', '(none)', 'unknown', '']
  const html = pageHtml(lines)
  clause('S-D [1: every <, >, &, " and \' in every line is escaped, the second < on a line included]',
    !html.includes('<b>') && html.includes('&lt;b&gt;Ruled&lt;/b&gt; &amp; &quot;x&quot; &#39;y&#39;') && html.includes('a &lt; b &lt; c'), html)
  clause('S-D [2: the <pre> holds the lines exactly, (none) and unknown kept distinct, a trailing empty line kept]', preText(html) === lines.join('\n'), JSON.stringify(preText(html)))
  clause('S-D [2: the page has a <title> and no script, no external resource and no link to another URL]',
    /<title>[^<]+<\/title>/.test(html) && !/<script|src=|href=|url\(|https?:|<link|<img|<iframe|<form/i.test(html), html)
  const leading = pageHtml(['', 'second'])
  clause('S-D [2: a first line that is empty survives the newline the HTML parser drops after <pre>]', preText(leading) === '\nsecond', JSON.stringify(preText(leading)))
  const msg = 'dctr-project: cannot read docs/PROJECT.md under /x/<y> & z (ENOENT)'
  const err = errorHtml(msg)
  clause('S-D [1: errorHtml escapes its message and carries it whole]', !err.includes('<y>') && preText(err) === msg, err)
  clause('S-D [2: errorHtml has a <title> and no script, resource or link]', /<title>[^<]+<\/title>/.test(err) && !/<script|src=|href=|https?:/i.test(err), err)
  clause('S-D [3: the inputs carry raw <, &, quotes, two < on one line, and an empty first line]',
    lines[0].includes('<b>') && lines[0].includes('&') && lines[0].includes('"') && lines[0].includes("'") && (lines[1].match(/</g) ?? []).length === 2 && msg.includes('<y>'), 'fixture')
}

// ---------------------------------------------------------------- end to end on a spawned server
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (pred, ms = 5000) => { const t = Date.now(); while (!pred() && Date.now() - t < ms) await sleep(20); return pred() }
const startServer = (args, extra = {}) => {
  const child = spawn('node', [PAGE, ...args], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  const s = { child, out: '', err: '', code: undefined }
  child.stdout.on('data', (d) => { s.out += d }); child.stderr.on('data', (d) => { s.err += d })
  child.on('exit', (c, sig) => { s.code = c ?? sig })
  return s
}
const stop = async (s) => { if (s.code === undefined) { s.child.kill('SIGTERM'); await waitFor(() => s.code !== undefined) } }
const request = (port, { method = 'GET', path: p = '/', headers = {}, host = '127.0.0.1' } = {}) => new Promise((resolve) => {
  const r = http.request({ host, port, method, path: p, headers }, (res) => {
    let body = ''; res.setEncoding('utf8'); res.on('data', (d) => { body += d }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
  })
  // A deadline, so a response that never comes fails its clause instead of hanging the suite.
  r.setTimeout(5000, () => { r.destroy(); resolve({ error: 'TIMEOUT after 5s' }) })
  r.on('error', (e) => resolve({ error: e.code })); r.end()
})
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const connects = (port, host = '127.0.0.1') => new Promise((resolve) => { const c = net.connect(port, host); c.on('connect', () => { c.destroy(); resolve(true) }); c.on('error', () => resolve(false)) })

// The loopback server.
{
  const s = startServer([root, '--port', '0'])
  await waitFor(() => s.out.includes('\n') || s.code !== undefined)
  await sleep(150)
  const m = /^http:\/\/127\.0\.0\.1:(\d+)\/\n$/.exec(s.out), port = Number(m?.[1])
  clause('E2E start [2: with no --host, stdout is exactly one line http://127.0.0.1:<real port>/ and stderr is empty]', !!m && port > 0 && s.err === '', JSON.stringify([s.out, s.err, s.code]))
  if (m) {
    const host = `127.0.0.1:${port}`
    const want1 = cliStatus()
    const r1 = await request(port, { headers: { Host: host } })
    clause('E2E page [2: GET / is 200, text/html; charset=utf-8, Cache-Control: no-store, and no CORS header]',
      r1.status === 200 && r1.headers['content-type'] === 'text/html; charset=utf-8' && r1.headers['cache-control'] === 'no-store' && !Object.keys(r1.headers).some((k) => k.startsWith('access-control-')), JSON.stringify([r1.status, r1.headers]))
    clause('E2E page [2: the <pre> is exactly what status prints for the same tree in the same environment]',
      want1.status === 0 && preText(r1.body ?? '') === want1.stdout.replace(/\n$/, ''), `${JSON.stringify(preText(r1.body ?? ''))} vs ${JSON.stringify(want1.stdout)}`)
    clause('E2E page [1: the record heading\'s <i> and &amp; arrive escaped, never as markup]', !r1.body?.includes('<i>') && r1.body?.includes('&lt;i&gt;&amp;amp;&lt;/i&gt;'), r1.body)
    clause('E2E page [3: status itself prints the raw heading, live seats: unknown and codex jobs (none)]',
      want1.stdout.includes('Phase alpha <i>&amp;</i> "q": state: Open') && want1.stdout.includes('live seats: unknown') && /codex jobs[^\n]*:\n {2}\(none\)/.test(want1.stdout), want1.stdout)
    const rHead = await request(port, { method: 'HEAD', headers: { Host: host } })
    clause('E2E page [2: HEAD / is 200 with no body]', rHead.status === 200 && rHead.body === '', JSON.stringify(rHead))
    const rLocal = await request(port, { headers: { Host: `localhost:${port}` } })
    clause('E2E page [2: Host localhost:<port> is served on a loopback bind]', rLocal.status === 200, JSON.stringify(rLocal.status))

    // No state between requests: the next request reads the changed file.
    fs.writeFileSync(P, fs.readFileSync(P, 'utf8').replace('State: Ruled', 'State: Done'))
    const want2 = cliStatus(), r2 = await request(port, { headers: { Host: host } })
    clause('E2E fresh [1: after the project State changes, the next GET shows the new state, matching status, and differs from the first]',
      preText(r2.body ?? '') === want2.stdout.replace(/\n$/, '') && preText(r2.body ?? '') !== preText(r1.body ?? '') && r2.body.includes('project: Done'), r2.body)
    clause('E2E fresh [3: the project file really changed between the two requests]', /^State: Done$/m.test(fs.readFileSync(P, 'utf8')) && want1.stdout.includes('project: Ruled'), 'fixture')
    fs.writeFileSync(P, fs.readFileSync(P, 'utf8').replace('State: Done', 'State: Ruled'))

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const r = await request(port, { method, headers: { Host: host } })
      clause(`E2E refuse [1: ${method} / is 405 with no status value in the body]`, r.status === 405 && !carriesValue(r.body), JSON.stringify(r))
    }
    const r404 = await request(port, { path: '/status', headers: { Host: host } })
    clause('E2E refuse [1: GET /status is 404 with no status value]', r404.status === 404 && !carriesValue(r404.body), JSON.stringify(r404))
    const r421 = await request(port, { headers: { Host: `attacker.example:${port}` } })
    clause('E2E refuse [1: Host attacker.example:<port> is 421 with no status value in the body (E5-S18)]', r421.status === 421 && !carriesValue(r421.body), JSON.stringify(r421))
    clause('E2E refuse [3: a served body does carry those values, so their absence above is a refusal]', carriesValue(r1.body ?? ''), 'fixture')

    // Records unreadable (E5-S9): the page says what status says.
    const recs = path.join(root, 'docs/records'), away = path.join(root, 'docs/records-away')
    fs.renameSync(recs, away)
    const want3 = cliStatus(), r3 = await request(port, { headers: { Host: host } })
    clause('E2E records [1: with Records renamed away the page matches status, which prints open records: unknown with no entry]',
      preText(r3.body ?? '') === want3.stdout.replace(/\n$/, '') && /^open records: unknown\nobsolete/m.test(want3.stdout), want3.stdout)
    clause('E2E records [3: Records really is gone]', !fs.existsSync(recs), 'fixture')
    fs.renameSync(away, recs)

    // docs/PROJECT.md unreadable: 503 carrying status's own message.
    fs.renameSync(P, `${P}.away`)
    const want4 = cliStatus(), r4 = await request(port, { headers: { Host: host } })
    clause('E2E unreadable [1: no docs/PROJECT.md is 503 carrying exactly the message status prints, escaped, and no status value]',
      r4.status === 503 && want4.status === 2 && preText(r4.body ?? '') === want4.stderr.replace(/\n$/, '') && !carriesValue(r4.body), JSON.stringify([r4, want4.stderr]))
    clause('E2E unreadable [3: the project file really is absent]', !fs.existsSync(P), 'fixture')
    fs.renameSync(`${P}.away`, P)
    const r5 = await request(port, { headers: { Host: host } })
    clause('E2E unreadable [2: with the file back, the page is 200 again]', r5.status === 200, String(r5.status))
    await sleep(100)
    clause('E2E quiet [2: after every request the server wrote nothing more: stdout is still the one URL line, stderr empty]', s.out === `http://127.0.0.1:${port}/\n` && s.err === '', JSON.stringify([s.out, s.err]))
  }
  await stop(s)
}

// Refusals before listening: non-zero, one stderr line, no stdout, and nothing listening on the port.
{
  const refusedStart = async (name, args, extra, re) => {
    const port = await freePort()
    const s = startServer([...args.map((a) => (a === '<port>' ? String(port) : a))], extra)
    await waitFor(() => s.code !== undefined)
    const lines = s.err.split('\n').filter(Boolean)
    clause(`E2E start [1: ${name} exits non-zero with one stderr line and no stdout]`, typeof s.code === 'number' && s.code !== 0 && lines.length === 1 && re.test(lines[0]) && s.out === '', JSON.stringify([s.code, s.out, s.err]))
    clause(`E2E start [1: ${name} left no listener on its port]`, !(await connects(port)), 'something answers on the port')
    await stop(s)
  }
  await refusedStart('a contained session (E5-S19)', [root, '--port', '<port>'], { DCTR_VIEW_REQUEST_DIR: tmp }, /contained/)
  await refusedStart('a non-loopback --host with no password (E5-S16)', [root, '--host', '192.0.2.1', '--port', '<port>'], {}, /DCTR_PAGE_PASSWORD/)
  await refusedStart('a non-loopback --host with an empty password', [root, '--host', '192.0.2.1', '--port', '<port>'], { DCTR_PAGE_PASSWORD: '' }, /DCTR_PAGE_PASSWORD/)
  // A wildcard bind answers on loopback too, so "no listener on 127.0.0.1:<port>" is what it would have broken.
  await refusedStart('--host 0.0.0.0 with a password set (a wildcard bind)', [root, '--host', '0.0.0.0', '--port', '<port>'], { DCTR_PAGE_PASSWORD: 'pw' }, /wildcard.*specific address/)
  await refusedStart('--host :: with a password set (a wildcard bind)', [root, '--host', '::', '--port', '<port>'], { DCTR_PAGE_PASSWORD: 'pw' }, /wildcard.*specific address/)
  for (const h of ['0', '::0', '0:0:0:0:0:0:0:0', '::ffff:0.0.0.0'])
    await refusedStart(`--host ${h} with a password set (a wildcard spelling)`, [root, '--host', h, '--port', '<port>'], { DCTR_PAGE_PASSWORD: 'pw' }, /wildcard.*specific address/)
  await refusedStart('--host 127.0.0.1:80, which is not one host', [root, '--host', '127.0.0.1:80', '--port', '<port>'], { DCTR_PAGE_PASSWORD: 'pw' }, /is not a host/)
  await refusedStart('--port given twice (N1)', [root, '--port', '<port>', '--port', '<port>'], {}, /usage/)
  await refusedStart('--host given twice (N1)', [root, '--host', '127.0.0.1', '--host', '127.0.0.1', '--port', '<port>'], {}, /usage/)
  await refusedStart('a malformed --port', [root, '--port', 'abc'], {}, /port/)
  await refusedStart('an unknown flag', [root, '--port', '<port>', '--bogus'], {}, /usage/)
  await refusedStart('a flag with no value', [root, '--port'], {}, /usage/)
  await refusedStart('two tracking roots', [root, root, '--port', '<port>'], {}, /usage/)
  await refusedStart('no tracking root', ['--port', '<port>'], {}, /usage/)
  await refusedStart('a tracking root that is a file', [P, '--port', '<port>'], {}, /not a directory/)
  // A value holding a newline is printed escaped, so the refusal stays one stderr line (P2-C2).
  await refusedStart('a --host holding a newline', [root, '--host', '127.0.0.1\nsecond line', '--port', '<port>'], {}, /is not a host/)
  await refusedStart('a tracking root holding a newline', [`${root}\nsecond line`, '--port', '<port>'], {}, /not a directory/)
  clause('E2E start [3: both values really hold a newline, and the root with it does not exist]', '127.0.0.1\nsecond line'.includes('\n') && !fs.existsSync(`${root}\nsecond line`), 'fixture')
  clause('E2E start [3: the file root is a file]', fs.statSync(P).isFile(), 'fixture')
  // The spellings proved without the server: what a plain net listener bound to each one reports and answers on.
  const plain = async (h) => {
    const srv = net.createServer()
    const a = await new Promise((r) => { srv.once('error', (e) => r({ error: e.code })); srv.listen(0, h, () => r(srv.address())) })
    const answers = a.error ? false : await connects(a.port)
    const answersLan = a.error || !LAN ? false : await connects(a.port, LAN)
    await new Promise((r) => srv.close(() => r()))
    return { ...a, answers, answersLan }
  }
  // A wildcard is proved by what only a wildcard has (P2-C3): it reports an unspecified address, in whichever of the
  // three forms the platform uses (Linux keeps ::ffff:0.0.0.0, macOS reports ::), and where this host has a LAN
  // address it answers there too. Answering on 127.0.0.1 alone proves nothing, since a loopback listener does that.
  const isWildcardBind = (a) => UNSPECIFIED.includes(a.address) && (!LAN || a.answersLan)
  if (!LAN) console.log('SKIP  E2E spellings [3: the LAN half of the wildcard proof]: this host has no non-internal IPv4 address')
  const any = await plain('0.0.0.0')
  clause('E2E start [3: 0.0.0.0 really is a wildcard: a plain listener there reports an unspecified address and, where this host has a LAN address, answers on it]',
    isWildcardBind(any), JSON.stringify(any))
  // The twin that shows the proof discriminates: a loopback listener answers on 127.0.0.1 and still fails it.
  const lo = await plain('127.0.0.1')
  clause('E2E start [3: the proof discriminates: a plain listener on 127.0.0.1 answers on 127.0.0.1 yet reports no unspecified address and answers on no LAN address]',
    lo.answers && !isWildcardBind(lo) && !lo.answersLan, JSON.stringify(lo))
  // Only what holds on Linux and macOS alike. A loopback spelling is proved by
  // its reported address falling in 127.0.0.0/8 or ::1, never by which one: LOCALHOST binds ::1 on macOS and
  // 127.0.0.1 under a usual Linux /etc/hosts. The IPv6 spellings need IPv6, so where ::1 cannot be bound they skip
  // loudly; the verdict each one gets is still pinned by the pure S-B tables, which need no socket.
  const v6 = await plain('::1')
  const noV6 = ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(v6.error)
  for (const h of ['0', '0x0', '::0', '0:0:0:0:0:0:0:0', '::ffff:0.0.0.0']) {
    if (noV6 && h.includes(':')) { console.log(`SKIP  E2E spellings [3: --host ${h}]: this host cannot bind IPv6 (${v6.error})`); continue }
    const a = await plain(h)
    clause(`E2E spellings [3: --host ${h} really is a wildcard: a plain listener there reports an unspecified address and, where this host has a LAN address, answers on it]`,
      isWildcardBind(a), JSON.stringify(a))
  }
  const loop = new net.BlockList(); loop.addSubnet('127.0.0.0', 8, 'ipv4'); loop.addAddress('::1', 'ipv6')
  for (const h of ['127.1', '2130706433', '0:0:0:0:0:0:0:1', 'LOCALHOST']) {
    if (noV6 && h.includes(':')) { console.log(`SKIP  E2E spellings [3: --host ${h}]: this host cannot bind IPv6 (${v6.error})`); continue }
    const a = await plain(h)
    clause(`E2E spellings [3: --host ${h} really is loopback: a plain listener there reports an address in 127.0.0.0/8 or ::1]`,
      !!a.address && loop.check(a.address, net.isIPv6(a.address) ? 'ipv6' : 'ipv4'), JSON.stringify(a))
  }

  // The bind fails: the port is held by another listener.
  const holder = net.createServer().listen(0, '127.0.0.1'); await waitFor(() => holder.address())
  const held = holder.address().port
  const s = startServer([root, '--port', String(held)])
  await waitFor(() => s.code !== undefined)
  clause('E2E start [1: a port already in use exits non-zero with one stderr line and no URL line]',
    typeof s.code === 'number' && s.code !== 0 && s.err.split('\n').filter(Boolean).length === 1 && s.out === '', JSON.stringify([s.code, s.out, s.err]))
  clause('E2E start [3: that port really was held by another listener]', await connects(held), 'nothing on the port')
  await stop(s); holder.close()
}

// A non-loopback bind, where the host has such an address: the URL line, the TLS line, and Basic auth (E5-S17).
{
  const addr = LAN
  if (!addr) console.log('SKIP  E2E non-loopback start and auth: this host has no non-internal IPv4 address')
  else {
    const PW = `pw-${process.pid}-secret`
    const s = startServer([root, '--host', addr, '--port', '0'], { DCTR_PAGE_PASSWORD: PW })
    await waitFor(() => s.out.split('\n').length >= 3 || s.code !== undefined)
    await sleep(150)
    const lines = s.out.split('\n'), m = new RegExp(`^http://${addr.replace(/\./g, '\\.')}:(\\d+)/$`).exec(lines[0]), port = Number(m?.[1])
    clause('E2E non-loopback start [2: --host <a non-internal IPv4 address of this host> prints http://<that address>:<port>/ and then one line on plain-HTTP Basic auth and TLS]',
      !!m && lines.length === 3 && lines[2] === '' && /Basic auth/.test(lines[1]) && /TLS/.test(lines[1]), JSON.stringify([s.out, s.err]))
    clause('E2E non-loopback start [2: the password appears nowhere on stdout or stderr]', !s.out.includes(PW) && !s.err.includes(PW), 'printed')
    if (m) {
      const host = `${addr}:${port}`, auth = (pw) => `Basic ${Buffer.from(`u:${pw}`).toString('base64')}`
      const none = await request(port, { host: addr, headers: { Host: host } })
      const wrong = await request(port, { host: addr, headers: { Host: host, Authorization: auth('nope') } })
      const right = await request(port, { host: addr, headers: { Host: host, Authorization: auth(PW) } })
      clause('E2E auth [1: no credentials is 401 with WWW-Authenticate: Basic realm="doctrine" and no status value]',
        none.status === 401 && none.headers['www-authenticate'] === 'Basic realm="doctrine"' && !carriesValue(none.body), JSON.stringify(none))
      clause('E2E auth [1: a wrong password is 401 with no status value]', wrong.status === 401 && !carriesValue(wrong.body), JSON.stringify(wrong))
      clause('E2E auth [2: the right password is 200 and the page matches status]', right.status === 200 && preText(right.body ?? '') === cliStatus().stdout.replace(/\n$/, ''), JSON.stringify(right.status))
      const local = await request(port, { host: addr, headers: { Host: `localhost:${port}`, Authorization: auth(PW) } })
      clause('E2E auth [1: on a non-loopback bind a Host naming localhost is 421, since only <bind>:<port> is the server\'s own]', local.status === 421, String(local.status))
      clause('E2E auth [3: the wrong password differs from the one the server was started with]', 'nope' !== PW, 'fixture')
    }
    await stop(s)
  }
}

// Shorthand and mixed-case loopback binds (P1-B2): the URL line names the canonical address, and a client sending
// back exactly that Host is served.
for (const [h, want] of [['127.1', '127.0.0.1'], ['0177.0.0.1', '127.0.0.1'], ['LOCALHOST', 'localhost']]) {
  const s = startServer([root, '--host', h, '--port', '0'])
  await waitFor(() => s.out.includes('\n') || s.code !== undefined)
  const m = new RegExp(`^http://${want.replace(/\./g, '\\.')}:(\\d+)/\n$`).exec(s.out)
  const r = m ? await request(Number(m[1]), { host: want, headers: { Host: `${want}:${m[1]}` } }) : {}
  clause(`E2E canonical [1: --host ${h} prints http://${want}:<port>/ and a GET with that Host is 200]`, !!m && r.status === 200, JSON.stringify([s.out, s.err, r.status]))
  await stop(s)
}

// The handler's own reader calls (P3-C2). Run inside herdr (HERDR_ENV=1) with a logging herdr shim first on PATH:
// each statusFor makes one `herdr api snapshot` through readSeats, so the log counts reader calls. A refused request
// (405, 404, 421, 401) must add none, and an accepted one exactly one.
{
  const shimBin = path.join(tmp, 'shim-bin'), log = path.join(tmp, 'herdr-shim.log')
  fs.mkdirSync(shimBin)
  fs.writeFileSync(path.join(shimBin, 'herdr'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\necho '{"result":{"snapshot":{"panes":[]}}}'\n`)
  fs.chmodSync(path.join(shimBin, 'herdr'), 0o755)
  const inHerdr = { HERDR_ENV: '1', PATH: `${shimBin}:${env.PATH}` }
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0)
  // Clause 3, without the server: the shim logs one line per call and answers in the shape readSeats reads.
  const probe = spawnSync('herdr', ['api', 'snapshot'], { env: { ...env, ...inHerdr }, encoding: 'utf8' })
  let panes; try { panes = JSON.parse(probe.stdout).result.snapshot.panes } catch { panes = null }
  clause('E2E readers [3: the herdr shim, run alone, logs one line per call and answers result.snapshot.panes as an empty list]',
    calls() === 1 && fs.readFileSync(log, 'utf8') === 'api snapshot\n' && Array.isArray(panes) && panes.length === 0, JSON.stringify([calls(), probe.stdout]))
  fs.rmSync(log)
  const counted = async (s, port, name, reqOpts, wantStatus, wantCalls) => {
    const before = calls(), r = await request(port, reqOpts)
    clause(`E2E readers [${wantCalls ? 2 : 1}: ${name} is ${wantStatus} and makes ${wantCalls} reader call${wantCalls === 1 ? '' : 's'}]`,
      r.status === wantStatus && calls() - before === wantCalls, JSON.stringify([r.status, calls() - before]))
    return r
  }
  const s = startServer([root, '--port', '0'], inHerdr)
  await waitFor(() => s.out.includes('\n') || s.code !== undefined)
  const port = Number(/:(\d+)\/\n$/.exec(s.out)?.[1]), host = `127.0.0.1:${port}`
  if (!port) clause('E2E readers — the loopback server started inside herdr', false, JSON.stringify([s.out, s.err]))
  else {
    await counted(s, port, 'POST /', { method: 'POST', headers: { Host: host } }, 405, 0)
    await counted(s, port, 'GET /x', { path: '/x', headers: { Host: host } }, 404, 0)
    await counted(s, port, 'GET / with Host attacker.example', { headers: { Host: `attacker.example:${port}` } }, 421, 0)
    const ok = await counted(s, port, 'an accepted GET /', { headers: { Host: host } }, 200, 1)
    clause('E2E readers [2: the accepted page read the shim\'s empty pane list: live seats prints (none), not unknown]', /^live seats:\n {2}\(none\)$/m.test(preText(ok.body ?? '') ?? ''), ok.body)
  }
  await stop(s)
  if (!LAN) console.log('SKIP  E2E readers [1: a 401 makes no reader call]: this host has no non-internal IPv4 address')
  else {
    const PW = 'pw-readers'
    const n = startServer([root, '--host', LAN, '--port', '0'], { ...inHerdr, DCTR_PAGE_PASSWORD: PW })
    await waitFor(() => n.out.split('\n').length >= 3 || n.code !== undefined)
    const np = Number(new RegExp(`^http://${LAN.replace(/\./g, '\\.')}:(\\d+)/$`, 'm').exec(n.out)?.[1])
    if (!np) clause('E2E readers — the non-loopback server started inside herdr', false, JSON.stringify([n.out, n.err]))
    else {
      await counted(n, np, 'GET / with no credentials on a non-loopback bind', { host: LAN, headers: { Host: `${LAN}:${np}` } }, 401, 0)
      await counted(n, np, 'GET / with the right password on a non-loopback bind', { host: LAN, headers: { Host: `${LAN}:${np}`, Authorization: `Basic ${Buffer.from(`u:${PW}`).toString('base64')}` } }, 200, 1)
    }
    await stop(n)
  }
}

// IPv6 loopback, where the host has it: the URL brackets the address.
{
  const s = startServer([root, '--host', '::1', '--port', '0'])
  await waitFor(() => s.out.includes('\n') || s.code !== undefined)
  if (s.code !== undefined && /EADDRNOTAVAIL|EAFNOSUPPORT/.test(s.err)) console.log('SKIP  E2E ::1: this host cannot bind ::1')
  else {
    const m = /^http:\/\/\[::1\]:(\d+)\/\n$/.exec(s.out)
    clause('E2E ::1 [2: --host ::1 prints http://[::1]:<port>/ and serves Host [::1]:<port>]',
      !!m && (await request(Number(m[1]), { host: '::1', headers: { Host: `[::1]:${m[1]}` } })).status === 200, JSON.stringify([s.out, s.err]))
  }
  await stop(s)
}

clause('E2E — the tripwire herdr on PATH was called ZERO times with HERDR_ENV unset', !fs.existsSync(trip) && !('HERDR_ENV' in env), 'herdr was called')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} clause(s) FAILED` : '\nall clauses passed')
process.exit(bad ? 1 : 0)
