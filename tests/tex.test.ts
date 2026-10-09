import { expect, test } from 'claude-code/testing'

import { mathToUnicode } from '../hooks/tex'

test("a diagram's math is written as the Unicode text LaTeX Inline writes it as", () => {
  expect(mathToUnicode('graph LR\n  A[$x^2$] -->|$\\alpha \\le \\beta$| B[$$\\frac{a+b}{c}$$]')).toBe('graph LR\n  A[x²] -->|α ≤ β| B[(a + b)/c]')
  expect(mathToUnicode('sequenceDiagram\n  A->>B: \\(\\pi r^2\\) and \\[\\sum_i x_i\\]')).toBe('sequenceDiagram\n  A->>B: πr² and ∑ᵢ xᵢ')
})

test('a dollar that does not open math stays as written', () => {
  const text = 'graph LR\n  A[costs $5 and $10] --> B[$ x $]'
  expect(mathToUnicode(text)).toBe(text)
})

test('a dollar pairs with one on its own line and not across an arrow or a quote', () => {
  expect(mathToUnicode('graph LR\n  A[costs $5] --> B[$x$]')).toBe('graph LR\n  A[costs $5] --> B[x]')
  expect(mathToUnicode('graph LR\n  A[$5 off]\n  B[y$]')).toBe('graph LR\n  A[$5 off]\n  B[y$]')
})
