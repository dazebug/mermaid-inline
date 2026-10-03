import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

const SESSION = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }
const DIAGRAM = '```mermaid\ngraph LR\n  A --> B\n```'
const REPLY = `Before.\n\n${DIAGRAM}\n\nAfter.`

// The engine beneath the plugin: no terminal variables, default settings, a
// cache that answers `cached` for every key (or holds nothing), and a message
// drawing that shows the text it was handed, a bullet marking the reply's first.
function engine(on: On, cached?: unknown) {
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('env.get', async () => ({ value: undefined }))
  on('settings.read', async () => ({ value: {} }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('clock.every', async () => ({ value: undefined }))
  on('fs.exists', async () => ({ value: cached !== undefined }))
  on('fs.read', async () => ({ value: JSON.stringify(cached) }))
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => ({
    type: 'Text',
    props: {},
    children: [`${e.props.isFirstOfReply ? '● ' : ''}${e.props.text}`],
  }))
}

async function draw($: Engine, text: string) {
  return $.ui.mount({ plugin: 'mermaid-inline', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } })
}

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
  const ui = await draw($, `${DIAGRAM}\n\nAfter.`)
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
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual([`● ${REPLY}`])
})
