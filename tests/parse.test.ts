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
  const reply = '- A\n  - B\n    ```mermaid\n    graph LR\n      A --> B\n    ```\n    - under B\n  - C\n\nTop.'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: '- A\n  - B' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 4 },
    { kind: 'text', text: '- under B', indent: 4 },
    { kind: 'text', text: '- C', indent: 2 },
    { kind: 'text', text: 'Top.' },
  ])
})

test('a lazy continuation line keeps the paragraph, and the diagram after it, in the list item', () => {
  const reply = '- Item\nlazy continuation\n  ```mermaid\n  graph LR\n    A --> B\n  ```\n  - child'
  expect(splitReply(reply)).toEqual([
    { kind: 'text', text: '- Item\nlazy continuation' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 2 },
    { kind: 'text', text: '- child', indent: 2 },
  ])
})

test('a list marker inside an indented code block is code, and so is a fence under it', () => {
  const reply = 'Example:\n\n    - Item\n      ```mermaid\n      graph LR\n        A --> B\n      ```'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
  const inItem = '1. Item\n\n       - code\n         ```mermaid\n         graph LR\n         ```'
  expect(splitReply(inItem)).toEqual([{ kind: 'text', text: inItem }])
})

test('a thematic break is no list item, so indented code under it stays code', () => {
  const reply = '* * *\n\n    ```mermaid\n    graph LR\n      A --> B\n    ```'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('a code block opened on a list marker line keeps a mermaid fence inside it as text', () => {
  const reply = '- ````markdown\n  ```mermaid\n  graph LR\n    A --> B\n  ```\n  ````'
  expect(splitReply(reply)).toEqual([{ kind: 'text', text: reply }])
})

test('a diagram opened on a list marker line, or under an empty marker, is in that item', () => {
  const diagram = { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 2 }
  const child = { kind: 'text', text: '- child', indent: 2 }
  expect(splitReply('- ```mermaid\n  graph LR\n    A --> B\n  ```\n  - child')).toEqual([{ kind: 'text', text: '-' }, diagram, child])
  expect(splitReply('-\n  ```mermaid\n  graph LR\n    A --> B\n  ```\n  - child')).toEqual([{ kind: 'text', text: '-' }, diagram, child])
})

test('a fence opened on a marker line under a paragraph leaves its marker as an item, not an underline', () => {
  expect(splitReply('Intro\n- ```mermaid\n  graph LR\n  ```')).toEqual([
    { kind: 'text', text: 'Intro\n\n-' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 2 },
  ])
})

test('one line can open nested items, and an item can start with indented code', () => {
  expect(splitReply('- - ```mermaid\n    graph LR\n    ```')).toEqual([
    { kind: 'text', text: '- -' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 4 },
  ])
  expect(splitReply('-     code\n  ```mermaid\n  graph LR\n  ```')).toEqual([
    { kind: 'text', text: '-     code' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 2 },
  ])
})

test('an item opened with no text ends at a blank line', () => {
  expect(splitReply('-\n\n  ```mermaid\n  graph LR\n  ```')).toEqual([
    { kind: 'text', text: '-' },
    { kind: 'mermaid', source: 'graph LR', raw: '  ```mermaid\n  graph LR\n  ```' },
  ])
})

test('a numbered item that does not start at 1 cannot interrupt a paragraph', () => {
  expect(splitReply('Steps:\n2. two\n   ```mermaid\n   graph LR\n   ```')).toEqual([
    { kind: 'text', text: 'Steps:\n2. two' },
    { kind: 'mermaid', source: 'graph LR', raw: '   ```mermaid\n   graph LR\n   ```' },
  ])
})

test('a line without `>` leaves a block quote, so it does not interrupt or continue the code in it', () => {
  expect(splitReply('> A quote.\n2. Second\n   ```mermaid\n   graph LR\n   ```')).toEqual([
    { kind: 'text', text: '> A quote.\n2. Second' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 3 },
  ])
  expect(splitReply('- > ```js\n  > x\ny\n  ```mermaid\n  graph LR\n  ```')).toEqual([
    { kind: 'text', text: '- > ```js\n  > x\ny' },
    { kind: 'mermaid', source: 'graph LR', raw: '  ```mermaid\n  graph LR\n  ```' },
  ])
})

test('a lazy line after a diagram stays in its paragraph when the item is cut out', () => {
  expect(splitReply('- Item\n  ```mermaid\n  graph LR\n  ```\n  more\n===')).toEqual([
    { kind: 'text', text: '- Item' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 2 },
    { kind: 'text', text: 'more\n    ===', indent: 2 },
  ])
  expect(splitReply('   - Item\n     ```mermaid\n     graph LR\n     ```\n     text\n    ```mermaid')).toEqual([
    { kind: 'text', text: '   - Item' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 5 },
    { kind: 'text', text: 'text\n    ```mermaid', indent: 5 },
  ])
})

test('a tab in the indent or after a marker counts up to the next multiple of four columns', () => {
  const diagram = { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```', indent: 4 }
  const child = { kind: 'text', text: '- child', indent: 4 }
  const rest = '\n    ```mermaid\n    graph LR\n      A --> B\n    ```\n    - child'
  expect(splitReply('-\tItem' + rest)).toEqual([{ kind: 'text', text: '-\tItem' }, diagram, child])
  expect(splitReply('-   Item' + rest)).toEqual([{ kind: 'text', text: '-   Item' }, diagram, child])
  expect(splitReply('- Item\n\t```mermaid\n\tgraph LR\n\t```')).toEqual([
    { kind: 'text', text: '- Item' },
    { kind: 'mermaid', source: 'graph LR', raw: '  ```mermaid\n  graph LR\n  ```', indent: 2 },
  ])
})

test("a tab after a marker in the rest of an item keeps that item's columns, and a diagram keeps the tabs in its code", () => {
  expect(splitReply('- A\n  ```mermaid\n  graph LR\n  ```\n  -\tchild\n    ```mermaid\n    graph LR\n    ```')).toEqual([
    { kind: 'text', text: '- A' },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 2 },
    { kind: 'text', text: '- child', indent: 2 },
    { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 4 },
  ])
  expect(splitReply('```mermaid\n1.\tx\n```')).toEqual([{ kind: 'mermaid', source: '1.\tx', raw: '```mermaid\n1.\tx\n```' }])
})

test('code after a diagram in a list item keeps its own tabs, past the columns the items take', () => {
  const diagram = { kind: 'mermaid', source: 'graph LR', raw: '```mermaid\ngraph LR\n```', indent: 2 }
  expect(splitReply('- Item\n  ```mermaid\n  graph LR\n  ```\n\n  ```makefile\n  target:\n  \techo hello\n  ```')).toEqual([
    { kind: 'text', text: '- Item' },
    diagram,
    { kind: 'text', text: '```makefile\ntarget:\n\techo hello\n```', indent: 2 },
  ])
  // The second tab is half the item's indent and half code: its code half
  // comes out as spaces, as CommonMark reads it.
  expect(splitReply('- Item\n  ```mermaid\n  graph LR\n  ```\n  -   B\n      ```sh\n  \t\techo\n      ```')).toEqual([
    { kind: 'text', text: '- Item' },
    diagram,
    { kind: 'text', text: '-   B\n    ```sh\n      echo\n    ```', indent: 2 },
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
