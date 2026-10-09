import { expect, test } from 'claude-code/testing'

import { mathSpans } from '../hooks/tex'

// A source with every formula mathSpans finds put in as its text.
function convert(source: string): string {
  let out = ''
  let at = 0
  for (const span of mathSpans(source)) {
    out += source.slice(at, span.start) + span.text
    at = span.end
  }
  return out + source.slice(at)
}

test("a diagram's math is written as the Unicode text LaTeX Inline writes it as", () => {
  expect(convert('graph LR\n  A[$x^2$] -->|$\\alpha \\le \\beta$| B[$$\\frac{a+b}{c}$$]')).toBe('graph LR\n  A[x²] -->|α ≤ β| B[(a + b)/c]')
  expect(convert('sequenceDiagram\n  A->>B: \\(\\pi r^2\\) and \\[\\sum_i x_i\\]')).toBe('sequenceDiagram\n  A->>B: πr² and ∑ᵢ xᵢ')
})

test('a dollar that does not open math stays as written', () => {
  const text = 'graph LR\n  A[costs $5 and $10] --> B[$ x $]'
  expect(convert(text)).toBe(text)
})

test('a dollar pairs with one on its own line and not across an arrow or a quote', () => {
  expect(convert('graph LR\n  A[costs $5] --> B[$x$]')).toBe('graph LR\n  A[costs $5] --> B[x]')
  expect(convert('graph LR\n  A[$5 off]\n  B[y$]')).toBe('graph LR\n  A[$5 off]\n  B[y$]')
})

test('a formula holds no `&` and its brackets close in order, so it stays inside one label', () => {
  expect(convert('graph LR\n  A[costs $5] & B[$x$] --> C')).toBe('graph LR\n  A[costs $5] & B[x] --> C')
  expect(convert('graph LR\n  A[costs $5] B[$x$]')).toBe('graph LR\n  A[costs $5] B[x]')
  expect(convert('graph LR\n  A[$[0,1)$]')).toBe('graph LR\n  A[$[0,1)$]')
})

test('the formulas come out as spans of the source with their text', () => {
  expect(mathSpans('graph LR\n  A[$x^2$] --> B')).toEqual([{ start: 13, end: 18, text: 'x²' }])
})
