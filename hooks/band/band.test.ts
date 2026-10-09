import { describe, expect, test } from 'claude-code/testing'

import { bandParts, followChain } from './band'

const show = (s: ReturnType<typeof bandParts>) => s && s.parts.map(p => p.text + ':' + p.tone)

describe('bandParts', () => {
  test('an Open record with nothing owed: Open is ok, and the round and the alarm count are the last round line\'s, with no threshold', async () => {
    const record = [
      '- round: 4 closed 2026-10-05T06:10:01Z at r4 blockers 1 alarm 1',
      '- round: 5 closed 2026-10-05T07:10:01Z at r5 blockers 2 alarm 2',
      '- State: Open',
    ].join('\n')
    expect(show(bandParts('p', record, 0))).toEqual(['Open:ok', 'round 5:quiet', 'alarm 2:quiet'])
  })

  test('no alarm count is coloured by nearness, at any count', async () => {
    for (const n of [1, 2, 3, 7]) {
      const s = bandParts('p', `- round: ${n} closed 2026-10-05T06:10:01Z at r blockers 1 alarm ${n}\n- State: Open\n`, 0)
      expect(s?.parts[2]).toEqual({ text: 'alarm ' + n, tone: 'quiet' })
    }
  })

  test('a Blocked record with an open question and an unruled alarm owes both, and seats out are flight', async () => {
    const record = [
      '- round: 3 closed 2026-10-04T08:32:50Z at b15c475 blockers 3 alarm 3',
      '- question: Q26 opened 2026-10-04T13:30:14Z change the Control row',
      '- State: Blocked. Q26 is unanswered.',
      '- alarm: time fired 2026-10-05T04:59:41Z count 3',
    ].join('\n')
    expect(show(bandParts('e10-exit', record, 2))).toEqual([
      'Blocked:owed', 'round 3:quiet', 'alarm 3:quiet', '2 seats out:flight',
      'time alarm fired: ruling owed:owed', 'ruling owed Q26:owed',
    ])
  })

  test('Open with something owed is not green', async () => {
    const s = bandParts('p', '- State: Open\n- alarm: round fired 2026-10-04T17:03:23Z count 4\n', 0)
    expect(show(s)).toEqual(['Open:plain', 'round 0:quiet', 'alarm 0:quiet', 'round alarm fired: ruling owed:owed'])
  })

  test('a ruling after the alarm clears it, and an answered question is not owed', async () => {
    const record = [
      '- alarm: round fired 2026-10-04T17:03:23Z count 4',
      '- ruling: R2 2026-10-04T21:48:16Z continue',
      '- question: Q1 opened 2026-10-04T15:39:38Z which',
      '- question: Q1 answered 2026-10-04T15:46:58Z stay',
      '- State: Open',
    ].join('\n')
    expect(show(bandParts('p', record, 0))).toEqual(['Open:ok', 'round 0:quiet', 'alarm 0:quiet'])
  })

  test('a question answered and then opened again under the same id is owed, as an answer only clears what came before it', async () => {
    const record = [
      '- question: Q1 opened 2026-10-05T05:00:00Z which',
      '- question: Q1 answered 2026-10-05T06:00:00Z stay',
      '- question: Q1 opened 2026-10-05T07:00:00Z which again',
      '- State: Open',
    ].join('\n')
    expect(show(bandParts('p', record, 0))).toEqual(['Open:plain', 'round 0:quiet', 'alarm 0:quiet', 'ruling owed Q1:owed'])
  })

  test('a record whose last state line is not Open or Blocked, or that has none, draws nothing', async () => {
    for (const s of ['Exited. One clean pass.', 'Stopped', 'Shipped at an escalation', 'Unable: credentials gone']) {
      expect(bandParts('p', `- State: Open\n- question: Q1 opened 2026-10-05T05:03:32Z which\n- State: ${s}\n`, 1)).toBe(null)
    }
    expect(bandParts('p', '- round: 1 closed 2026-10-05T06:10:01Z at r1 blockers 8 alarm 1\n', 0)).toBe(null)
  })
})

describe('followChain', () => {
  const memory = (ref: string) => `# State\n\n## Next Session Kickoff\nhandoff: ${ref} | state: open\n1. go\n`
  const handoff = (rec: string) => `phase: \`e11-band\` (E11). State: Open.\nrecord: \`${rec}\` :18, "- State: Open"\n\n## 1. State\n`
  const files = (map: Record<string, string>) => async (p: string) => map[p] ?? null

  test('memory, handoff, then a record found under the session dir\'s parent, as a sibling repo', async () => {
    const read = files({
      '/w/repo/SESSION_MEMORY.md': memory('docs/handoffs/h.md'),
      '/w/repo/docs/handoffs/h.md': handoff('track/.doctrine/records/r.md'),
      '/w/track/.doctrine/records/r.md': '- State: Open\n',
    })
    expect(await followChain('/w/repo', read)).toEqual({ phase: 'e11-band', recordText: '- State: Open\n' })
  })

  test('a record under the session dir wins over one under its parent, and an absolute record path is read as written', async () => {
    const read = files({
      '/w/repo/SESSION_MEMORY.md': memory('h.md'),
      '/w/repo/h.md': handoff('r.md'),
      '/w/repo/r.md': 'here',
      '/w/r.md': 'parent',
    })
    expect((await followChain('/w/repo', read))?.recordText).toBe('here')
    const abs = files({ '/w/repo/SESSION_MEMORY.md': memory('/x/h.md'), '/x/h.md': handoff('/y/r.md'), '/y/r.md': 'abs' })
    expect((await followChain('/w/repo', abs))?.recordText).toBe('abs')
  })

  test('a Windows session dir: the record found under its parent, and a drive-letter record path read as written', async () => {
    const read = files({
      'C:\\w\\repo/SESSION_MEMORY.md': memory('docs/h.md'),
      'C:\\w\\repo/docs/h.md': handoff('track/r.md'),
      'C:\\w/track/r.md': 'sibling',
    })
    expect((await followChain('C:\\w\\repo', read))?.recordText).toBe('sibling')
    const abs = files({ 'C:\\w\\repo/SESSION_MEMORY.md': memory('h.md'), 'C:\\w\\repo/h.md': handoff('D:\\x\\r.md'), 'D:\\x\\r.md': 'drive' })
    expect((await followChain('C:\\w\\repo', abs))?.recordText).toBe('drive')
  })

  test('the chain stops at no memory file, a missing handoff, a kickoff of none, and a record that resolves nowhere', async () => {
    expect(await followChain('/w/repo', files({}))).toBe(null)
    expect(await followChain('/w/repo', files({ '/w/repo/SESSION_MEMORY.md': memory('h.md') }))).toBe(null)
    expect(await followChain('/w/repo', files({ '/w/repo/SESSION_MEMORY.md': memory('none') }))).toBe(null)
    expect(await followChain('/w/repo', files({ '/w/repo/SESSION_MEMORY.md': memory('h.md'), '/w/repo/h.md': handoff('r.md') }))).toBe(null)
  })
})
