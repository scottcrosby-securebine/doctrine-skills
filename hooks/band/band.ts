// The doctrine band's pure decisions: which record the session's kickoff chain reaches, and what one line says
// about it. Every reader comes from ../dctr-record.mjs, the plugin's one record parser (E11-D14).
import { handoffHeader, kickoffHandoff, parseRecord, restoreState } from '../dctr-record.mjs'

/** ok: a live phase with nothing owed. owed: waits on the owner. flight: seats out. quiet: labels and counts.
 *  plain: the state word Open while something is owed. One colour per tone, each meaning one thing. */
export type Tone = 'ok' | 'owed' | 'flight' | 'quiet' | 'plain'
export type Part = { text: string; tone: Tone }
export type Summary = { phase: string; parts: Part[] }

/** `read(path)` resolves a file's text, or null when it cannot be read. */
export type Read = (path: string) => Promise<string | null>

/** The chain the restore hook follows (followKickoff in dctr-lib.mjs): SESSION_MEMORY.md under `root`, its kickoff's
 *  handoff, that handoff's `record:` line resolved absolute, else under `root`, else under its parent. Null where it
 *  stops. */
export async function followChain(root: string, read: Read): Promise<{ phase: string; recordText: string } | null> {
  const at = (ref: string, dir: string) => (ref.startsWith('/') ? ref : dir + '/' + ref)
  const memory = await read(root + '/SESSION_MEMORY.md')
  const ref = memory === null ? null : kickoffHandoff(memory)
  const handoff = ref === null ? null : await read(at(ref, root))
  const header = handoff === null ? null : handoffHeader(handoff)
  if (!header?.record) return null
  const parent = root.slice(0, root.lastIndexOf('/')) || '/'
  const tries = header.record.startsWith('/') ? [header.record] : [at(header.record, root), at(header.record, parent)]
  for (const file of tries) {
    const recordText = await read(file)
    if (recordText !== null) return { phase: header.phase ?? '(unnamed)', recordText }
  }
  return null
}

/** What the band says about one record, `seatsOut` from the engine, or null when the record's last state line reads
 *  anything but Open or Blocked, so the band draws nothing (E11-D11). The alarm count is the last round line's, with
 *  no threshold beside it and no colour for nearness, since the record does not carry the owner's figure (E11-D5, D6). */
export function bandParts(phase: string, recordText: string, seatsOut: number): Summary | null {
  const { entries, state } = parseRecord(recordText)
  const word = restoreState(state?.value)
  if (!word) return null
  const last = (kind: string) => entries.filter(e => e.kind === kind).at(-1)
  const round = last('round')
  const alarm = last('alarm')
  const ruling = last('ruling')
  const answered = new Set(entries.filter(e => e.kind === 'question-answered').map(e => e.id))
  const open = [...new Set(entries.filter(e => e.kind === 'question-opened' && !answered.has(e.id)).map(e => e.id))]

  const owed: Part[] = []
  if (alarm && (!ruling || ruling.line < alarm.line)) owed.push({ text: alarm.which + ' alarm fired: ruling owed', tone: 'owed' })
  if (open.length) owed.push({ text: 'ruling owed ' + open.join(' '), tone: 'owed' })
  const blocked = /^blocked$/i.test(word)

  return {
    phase,
    parts: [
      { text: word, tone: blocked ? 'owed' : owed.length ? 'plain' : 'ok' },
      { text: 'round ' + (round ? round.n : 0), tone: 'quiet' },
      { text: 'alarm ' + (round ? round.alarm : 0), tone: 'quiet' },
      ...(seatsOut > 0 ? [{ text: seatsOut + (seatsOut === 1 ? ' seat out' : ' seats out'), tone: 'flight' as Tone }] : []),
      ...owed,
    ],
  }
}
