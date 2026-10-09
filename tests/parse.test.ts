import { expect, test } from 'claude-code/testing'

import { hasMermaid, splitReply } from '../hooks/parse'

const DIAGRAM = '```mermaid\ngraph LR\n  A --> B\n```'

test('a mermaid block splits the reply into text, diagram, text', () => {
  const reply = 'Here is the flow:\n\n' + DIAGRAM + '\n\nThat is all.'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: 'Here is the flow:' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: DIAGRAM },
    { kind: 'text', text: 'That is all.' },
  ])
})

test('other code blocks stay in the text, whole', () => {
  const reply = '```ts\nconst a = 1\n```\n\nText'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
  expect(hasMermaid(reply)).toBe(false)
})

test('a mermaid fence inside a longer fence is an example, not a diagram', () => {
  const reply = '````markdown\n' + DIAGRAM + '\n````'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('a fence still open while the reply streams in stays text', () => {
  const reply = 'Look:\n\n```mermaid\ngraph TD\n  A --> B'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('tildes, a longer fence and an info string after the language are read', () => {
  const reply = '~~~~ Mermaid title="x"\nsequenceDiagram\n  A->>B: hi\n~~~~'
  expect(splitReply(reply)).toEqual([{ kind: 'mermaid', source: 'sequenceDiagram\n  A->>B: hi', raw: reply }])
})

test("a fence in a list item is a diagram at the item's indent, and the rest of the item keeps that indent", () => {
  const reply = '1. First\n   ```mermaid\n   graph LR\n     A --> B\n   ```\n\n   - more on the first\n2. Second'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: '1. First' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 3 },
    { kind: 'text', text: '- more on the first', indent: 3 },
    { kind: 'text', text: '2. Second' },
  ])
})

test('after a diagram in a nested item, each enclosing item keeps its own indent', () => {
  const reply = '- A\n  - B\n    ```mermaid\n    graph LR\n      A --> B\n    ```\n    - under B\n  - C\nTop.'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: '- A\n  - B' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 4 },
    { kind: 'text', text: '- under B', indent: 4 },
    { kind: 'text', text: '- C', indent: 2 },
    { kind: 'text', text: 'Top.' },
  ])
})

test('a fence indented four spaces outside a list is an indented code block, not a diagram', () => {
  const reply = 'Example:\n\n    ```mermaid\n    graph LR\n    ```'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('another code block in a list item keeps a mermaid fence written inside it as text', () => {
  const reply = '1. Write this:\n   ````markdown\n   ' + DIAGRAM.split('\n').join('\n   ') + '\n   ````'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('a closing fence must be as long as the opening one and carry no info string', () => {
  const reply = '````mermaid\ngraph LR\n```\n```js\n````'
  expect(splitReply(reply)).toEqual([{ kind: 'mermaid', source: 'graph LR\n```\n```js', raw: reply }])
})

test('two diagrams side by side give two segments and no empty text', () => {
  expect(splitReply(DIAGRAM + '\n\n' + DIAGRAM).map(segment => segment.kind)).toEqual(['mermaid', 'mermaid'])
})

test('a line of backticks with a backtick after it is no fence', () => {
  const reply = '```js`x\n\n```mermaid\ngraph LR\n```'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: '```js`x' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```' },
  ])
})
