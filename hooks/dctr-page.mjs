// The read-only status page: what `node hooks/dctr-project.mjs status <tracking root>` prints, served over HTTP.
//
//   node hooks/dctr-page.mjs <tracking root> [--port N] [--host ADDR]
//
// Started by hand, in the foreground, and by nothing else: no hook entry names it (E5-S20). Binds to 127.0.0.1
// port 8787 by default; --port 0 takes a free port. A --host outside loopback (127.0.0.0/8, ::1, localhost)
// needs DCTR_PAGE_PASSWORD, which every request must then carry as its HTTP Basic password (E5-R8). It refuses to
// start in a contained session (DCTR_VIEW_REQUEST_DIR set), as the pane launcher does, and on a wildcard --host
// (0.0.0.0 or ::), which must name a specific address instead.
//
// Every refusal before listening exits 1 with one line on stderr and opens no listener. Once listening it prints
// its URL, and nothing per request. Each GET or HEAD of / that passes the method, path, Host and credential
// checks calls statusFor(root) fresh and renders its lines escaped in a <pre>; nothing read is kept between
// requests (E5-S14), and nothing is written but the response (E5-S12, S13).
//
// Pure functions (startRefusal, requestDecision, pageHtml, errorHtml) are exported for hooks/dctr-page.selftest.mjs.

import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { statusFor } from './dctr-project.mjs'

const USAGE = 'usage: node dctr-page.mjs <tracking root> [--port N] [--host ADDR]'
const DEFAULTS = { host: '127.0.0.1', port: '8787' }

export const isLoopback = (h) => h === 'localhost' || h === '::1' || (net.isIPv4(h) && h.startsWith('127.'))
const hostPort = (h, port) => `${net.isIPv6(h) ? `[${h}]` : h}:${port}`

/** argv to `{ root, port, host }` as given, or null when its shape is wrong: an unknown flag, a flag with no
 *  value or given twice, or more than one tracking root. */
function parseArgs(argv) {
  const out = { ...DEFAULTS }, seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '--host') {
      if (seen.has(a) || i + 1 >= argv.length) return null
      seen.add(a); out[a.slice(2)] = argv[++i]
    } else if (a.startsWith('-') || 'root' in out) return null
    else out.root = a
  }
  return out
}

/** Null when the server may start, or the one line it refuses with: a contained session, malformed arguments
 *  (no root, a port that is not 0 to 65535, an empty host), a tracking root that is not a directory, a wildcard
 *  host (0.0.0.0 or ::, refused by ruling), or a non-loopback host with DCTR_PAGE_PASSWORD unset or empty. */
export function startRefusal({ host, port, root }, env) {
  if (env.DCTR_VIEW_REQUEST_DIR) return 'dctr-page: refused: a contained session (DCTR_VIEW_REQUEST_DIR set) must reach nothing on the host'
  if (root === undefined) return USAGE
  if (!/^\d{1,5}$/.test(port ?? '') || Number(port) > 65535) return `dctr-page: refused: --port ${JSON.stringify(port)} is not a port from 0 to 65535`
  if (!host) return 'dctr-page: refused: --host is empty'
  let dir = false
  try { dir = fs.statSync(path.resolve(root)).isDirectory() } catch { /* not there: refused below */ }
  if (!dir) return `dctr-page: refused: tracking root ${root} is not a directory`
  if (host === '0.0.0.0' || host === '::') return `dctr-page: refused: --host ${host} is a wildcard bind; name a specific address`
  if (!isLoopback(host) && !env.DCTR_PAGE_PASSWORD) return `dctr-page: refused: --host ${host} is not loopback and DCTR_PAGE_PASSWORD is unset or empty`
  return null
}

const sha = (s) => crypto.createHash('sha256').update(s).digest()
/** The password in a Basic Authorization header, or null. The username is ignored. */
const basicPassword = (authorization) => {
  const m = /^Basic +(\S+)$/i.exec(authorization ?? '')
  const text = m ? Buffer.from(m[1], 'base64').toString('utf8') : ''
  return text.includes(':') ? text.slice(text.indexOf(':') + 1) : null
}

/** Null to serve the page, or `{ status, headers }` refusing the request, checked in this order: method (405),
 *  path (404), Host (421), and on a non-loopback bind the Basic password (401). Reads nothing. */
export function requestDecision({ method, url, host, authorization }, { bind, port, password }) {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405, headers: { Allow: 'GET, HEAD' } }
  if (String(url).split('?')[0] !== '/') return { status: 404, headers: {} }
  const own = [hostPort(bind, port), ...(isLoopback(bind) ? [`localhost:${port}`] : [])]
  if (!own.includes(String(host ?? '').toLowerCase())) return { status: 421, headers: {} }
  if (!isLoopback(bind)) {
    const given = basicPassword(authorization)
    // Hashed first so the comparison runs on equal lengths and takes the same time for any guess.
    if (given === null || !crypto.timingSafeEqual(sha(given), sha(password))) return { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="doctrine"' } }
  }
  return null
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// The newline after <pre> is the one the HTML parser drops, so an empty first line still shows.
const doc = (title, text) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>\n<body><pre>\n${text}</pre></body></html>\n`
/** The status lines as a page: each line escaped, in one <pre>, as `status` prints them. */
export const pageHtml = (lines) => doc('doctrine status', lines.map(esc).join('\n'))
/** The page for a statusFor that threw: its one-line message, escaped, and no status value. */
export const errorHtml = (message) => doc('doctrine status unavailable', esc(message))

function send(req, res, status, headers, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers })
  res.end(req.method === 'HEAD' ? undefined : body)
}

function serve({ root, host, port }, password) {
  const server = http.createServer((req, res) => {
    const cfg = { bind: host, port: server.address().port, password }
    const refusal = requestDecision({ method: req.method, url: req.url, host: req.headers.host, authorization: req.headers.authorization }, cfg)
    if (refusal) return send(req, res, refusal.status, refusal.headers, `${refusal.status} ${http.STATUS_CODES[refusal.status]}\n`)
    let lines
    try { lines = statusFor(root) } catch (e) { return send(req, res, 503, {}, errorHtml(e.message)) }
    send(req, res, 200, {}, pageHtml(lines))
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 30_000
  server.on('error', (e) => { console.error(`dctr-page: cannot listen on ${hostPort(host, port)} (${e.code || e.message})`); process.exit(1) })
  server.listen(Number(port), host, () => {
    const real = server.address().port
    console.log(`http://${hostPort(host, real)}/`)
    if (!isLoopback(host)) console.log('Basic auth over plain HTTP sends the password unencrypted; on an open network put a TLS reverse proxy in front of this server')
  })
}

// Both through realpath, as dctr-project.mjs does: a symlinked plugin dir must still dispatch.
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename) } catch { return false } })()
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const why = startRefusal(args ?? {}, process.env)
  if (why) { console.error(why); process.exit(1) }
  serve({ ...args, root: path.resolve(args.root) }, process.env.DCTR_PAGE_PASSWORD || '')
}
