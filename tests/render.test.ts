import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

const SESSION = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }
const DIAGRAM = '```mermaid\ngraph LR\n  A --> B\n```'
const REPLY = 'Before.\n\n' + DIAGRAM + '\n\nAfter.'

// The engine beneath the plugin: no terminal variables, default settings or
// those given, a cache that answers `cached` for every key (or holds nothing),
// and a message drawing that shows the text it was handed, a bullet marking the
// reply's first, or an engine element when `engineElement` is set.
function engine(on: On, cached?: unknown, options: { engineElement?: boolean; settings?: Record<string, unknown> } = {}) {
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('env.get', async () => ({ value: undefined }))
  on('settings.read', async () => ({ value: options.settings ?? {} }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('clock.every', async () => ({ value: undefined }))
  on('fs.exists', async () => ({ value: cached !== undefined }))
  on('fs.read', async () => ({ value: JSON.stringify(cached) }))
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    if (options.engineElement) return { type: 'engine', ref: 1 } as never
    return { type: 'Text', props: {}, children: [(e.props.isFirstOfReply ? '● ' : '') + e.props.text] }
  })
}

async function draw($: Engine, text: string, isFirstOfReply = true) {
  return $.ui.mount({ plugin: 'mermaid-inline', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply } })
}

const PICTURE = { file: '/tmp/diagram.png', columns: 40, rows: 9 }

async function rowsOf(ui: Awaited<ReturnType<typeof draw>>) {
  const drawn = await ui.drawn()
  return drawn.type === 'Box' ? (drawn.children ?? []) : []
}

const ENGINE_IN_GUTTER = [{ type: 'Box', props: { width: 2 } }, { type: 'Box', children: [{ type: 'engine', ref: 1 }] }]

test('a diagram that opens the reply starts with the blank row Claude Code puts above a reply', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM + '\n\nAfter.')
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { marginTop: 1 } })
})

test('with message timestamps shown, a diagram that opens the reply starts under the header with no blank row', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE, { settings: { showMessageTimestamps: true } })
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM + '\n\nAfter.')
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { marginTop: 0 } })
})

test('a diagram in a part that does not open the reply brings its own blank row', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM, false)
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { marginTop: 1 } })
})

test('a block Claude Code draws gets the gutter whenever it does not open the reply', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE, { engineElement: true })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY, false)
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { flexDirection: 'row', marginTop: 0 }, children: ENGINE_IN_GUTTER })
})

test('a tree from a mod below is placed as it comes, with no margin added', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await rowsOf(ui))[2]).toMatchObject({ type: 'Text', children: ['After.'] })
})

test('with message timestamps shown, a later block Claude Code draws gets the blank row it leaves out', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE, { engineElement: true, settings: { showMessageTimestamps: true } })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await rowsOf(ui))[2]).toMatchObject({ type: 'Box', props: { flexDirection: 'row', marginTop: 1 }, children: ENGINE_IN_GUTTER })
})

test('a reply without a diagram is left to the engine', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const ui = await draw($, 'Just text.')
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Just text.'])
})

test('a diagram still rendering shows its code block, and the text around it is drawn beneath', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Before.', DIAGRAM, 'After.'])
})

test('a drawn diagram replaces its code block with the picture', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ source: { file: '/tmp/diagram.png', format: 'png' }, columns: 40, rows: 9 })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  expect(texts).toContain('● Before.')
  expect(texts).toContain('After.')
  expect(texts).not.toContain(DIAGRAM)
})

test('a diagram that opens the reply carries the bullet', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM + '\n\nAfter.')
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  expect(texts).toEqual(['⏺', 'After.'])
})

test('in text mode a diagram is drawn as box drawing', { options: { mode: 'text' } }, async ($, on) => {
  engine(on, { text: '┌───┐\n│ A │\n└───┘', columns: 5, rows: 3 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toContain('┌───┐\n│ A │\n└───┘')
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
})

test('a diagram that cannot be drawn keeps its code block', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { error: 'Invalid mermaid header: "pie"' })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Before.', DIAGRAM, 'After.'])
})

test('with mode off a reply is drawn as written', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● ' + REPLY])
})
