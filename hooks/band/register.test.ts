import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

// The engine seam: register.tsx against the engine's own `$`, with the files and the seat list answered beneath it.
const MEMORY = '# State\n\n## Next Session Kickoff\nhandoff: docs/h.md | state: open\n'
const HANDOFF = 'phase: `p1` (fixture). State: Open.\nrecord: `r.md` :1\n\n## 1. State\n'
const OPEN = '- round: 5 closed 2026-10-09T21:00:00Z at f5 blockers 1 alarm 2\n- State: Open\n'
const BLOCKED = '- question: Q7 opened 2026-10-09T21:00:00Z which\n- State: Blocked\n'
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120 } as any

const seat = (status: AgentInfo['status']): AgentInfo => ({ id: 'a' + status, description: 'd', type: 'general-purpose', status } as AgentInfo)

/** Files under /w/repo, the seat list and the clock, answered beneath the plugin; files and seats change while the
 *  test runs. `delay` makes the seat list answer that late on the mocked clock; `most` is the most seat lists ever
 *  out at once. */
function world(on: On, record: string) {
  const clock = mock.clock(on)
  const files: Record<string, string> = { '/w/repo/SESSION_MEMORY.md': MEMORY, '/w/repo/docs/h.md': HANDOFF, '/w/repo/r.md': record }
  const agents: { list: AgentInfo[]; deny?: string; delay?: number; out: number; most: number } = { list: [], out: 0, most: 0 }
  on('fs.read', async ($, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT: ' + e.path } : { value: text }
  })
  on('agent.list', async () => {
    agents.out += 1
    agents.most = Math.max(agents.most, agents.out)
    if (agents.delay) await clock.sleep(agents.delay)
    agents.out -= 1
    return agents.deny ? { deny: agents.deny } : { value: agents.list }
  })
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  // What draws beneath the band (another plugin's band, or the engine's): it must survive the band drawing.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'beneath') as any
  })
  return { files, agents, clock }
}

const begin = ($: any) => $.session.start({ cwd: '/w/repo', surface: 'terminal', isInteractive: true })
/** Starts the session and lets the band's first refresh, which session.start does not wait for, settle. */
const start = async ($: any, clock: { settle: () => Promise<void> }) => {
  await begin($)
  await clock.settle()
}
const band = async ($: any) => {
  const ui = await $.ui.mount({ plugin: 'doctrine', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const line = await ui.find({ type: 'Text', text: 'doctrine ' })
  return { ui, line }
}
const part = async (ui: any, text: string) => (await ui.find({ type: 'Text', text }))?.props

describe('register', () => {
  test('an Open record draws the phase, Open in green, and grey counts', async ($, on) => {
    const { clock } = world(on, OPEN)
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeDefined()
    expect((await ui.find({ type: 'Text', text: 'p1' }))?.props).toMatchObject({ bold: true })
    expect(await part(ui, 'Open')).toMatchObject({ color: 'green' })
    expect(await part(ui, 'round 5')).toMatchObject({ dimColor: true })
    expect(await part(ui, 'alarm 2')).toMatchObject({ dimColor: true })
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })

  test('a Blocked record draws Blocked and the owed question in bold magenta', async ($, on) => {
    const { clock } = world(on, BLOCKED)
    await start($, clock)
    const { ui } = await band($)
    expect(await part(ui, 'Blocked')).toMatchObject({ color: 'magenta', bold: true })
    expect(await part(ui, 'ruling owed Q7')).toMatchObject({ color: 'magenta', bold: true })
  })

  test('seats pending, running or waiting count as out, in cyan, and the count follows the list at the next poll', async ($, on) => {
    const { agents, clock } = world(on, OPEN)
    agents.list = [seat('running'), seat('waiting'), seat('pending'), seat('completed'), seat('idle'), seat('failed'), seat('killed')]
    await start($, clock)
    const { ui } = await band($)
    expect(await part(ui, '3 seats out')).toMatchObject({ color: 'cyan' })
    agents.list = []
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: /seats? out/ })).toBeUndefined()
  })

  test('a record that turns Exited stops the band at the next poll', async ($, on) => {
    const { files, clock } = world(on, OPEN)
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeDefined()
    files['/w/repo/r.md'] = OPEN + '- State: Exited. One clean pass.\n'
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: 'doctrine ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })

  test('a refused seat list draws the band with no seats, and does not keep it once the record turns Exited', async ($, on) => {
    const { files, agents, clock } = world(on, OPEN)
    agents.deny = 'refused'
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /seats? out/ })).toBeUndefined()
    files['/w/repo/r.md'] = OPEN + '- State: Exited. One clean pass.\n'
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: 'doctrine ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })

  test('a record that turns Exited clears at the next poll while a seat list answers late', async ($, on) => {
    const { files, agents, clock } = world(on, OPEN)
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeDefined()
    agents.delay = 60000
    files['/w/repo/r.md'] = OPEN + '- State: Exited. One clean pass.\n'
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: 'doctrine ' })).toBeUndefined()
  })

  test('with a seat list slower than the poll, refreshes never overlap and the band still follows the record', async ($, on) => {
    const { files, agents, clock } = world(on, OPEN)
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeDefined()
    agents.delay = 6000
    files['/w/repo/r.md'] = OPEN.replace('round: 5', 'round: 6')
    await clock.advance(30000)
    expect(await ui.find({ type: 'Text', text: 'round 6' })).toBeDefined()
    files['/w/repo/r.md'] = OPEN + '- State: Exited. One clean pass.\n'
    await clock.advance(15000)
    expect(await ui.find({ type: 'Text', text: 'doctrine ' })).toBeUndefined()
    expect(agents.most).toBe(1)
  })

  test('a seat list that never answers does not hold the session start, and polls do not pile up behind it', async ($, on) => {
    const { agents, clock } = world(on, OPEN)
    agents.delay = 1e12
    let started = false
    void begin($).then(() => {
      started = true
    })
    await clock.settle()
    expect(started).toBe(true)
    expect(agents.most).toBe(1)
    await clock.advance(20000)
    expect(agents.most).toBe(1)
  })

  test('no memory file draws nothing', async ($, on) => {
    const { files, clock } = world(on, OPEN)
    delete files['/w/repo/SESSION_MEMORY.md']
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })

  test('the band yields to a survey', async ($, on) => {
    const { clock } = world(on, OPEN)
    await start($, clock)
    const ui = await $.ui.mount({ plugin: 'doctrine', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, hasSurvey: true } })
    expect(await ui.find({ type: 'Text', text: 'doctrine ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })

  test('the band config row off registers nothing, so an Open record draws nothing', { options: { band: false } }, async ($, on) => {
    const { clock } = world(on, OPEN)
    await start($, clock)
    const { ui, line } = await band($)
    expect(line).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  })
})
