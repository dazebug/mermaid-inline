// Run with `node --test tests/*.test.mjs`; `claude plugin test` runs the *.test.ts files.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { mixColors, resolveCss } from '../bin/css.mjs'
import { cellWidth, diagramColors, fitToCells, renderPicture, renderText } from '../bin/diagram.mjs'

const JETBRAINS = { rowPx: 48, cellRatio: 2.125, lineEm: 1.308, textScale: 1 }

test('color-mix weighs the two colors by their shares', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const black = { r: 0, g: 0, b: 0, a: 1 }
  assert.deepEqual(mixColors(white, 0.2, black, undefined), { r: 51, g: 51, b: 51, a: 1 })
  // Mixing with transparent keeps the color and scales its alpha.
  assert.deepEqual(mixColors(white, 0.2, { r: 0, g: 0, b: 0, a: 0 }, undefined), { r: 255, g: 255, b: 255, a: 0.2 })
})

test('var() and color-mix() become plain colors, the base winning over the document', () => {
  const svg = [
    '<svg style="--bg:#ffffff;--fg:#000000">',
    '<style>svg { --_line: var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg))); --_text: var(--fg); }</style>',
    '<path stroke="var(--_line)" fill="var(--_text)"/><rect fill="var(--accent, var(--_text))"/>',
    '</svg>',
  ].join('')
  const out = resolveCss(svg, { '--bg': '#282c34' })
  // Half of #000000 into the base's #282c34.
  assert.ok(out.includes('<path stroke="#14161a" fill="#000000"/>'), out)
  assert.ok(!out.includes('var('), out)
  assert.ok(!out.includes('color-mix('), out)
  assert.ok(out.includes('<rect fill="#000000"'), out)
})

test('a diagram is sized to its labels at the text size, and shrunk to the room', () => {
  // 260 x 130 px of SVG at JetBrains Mono 13pt: 13px labels drawn at the 36.7px text size.
  const fit = fitToCells({ width: 260, height: 130 }, JETBRAINS, 200)
  assert.equal(fit.columns, Math.ceil((260 * fit.scale) / (48 / 2.125)))
  assert.equal(fit.rows, Math.ceil((130 * fit.scale) / 48))
  const narrow = fitToCells({ width: 260, height: 130 }, JETBRAINS, 20)
  assert.equal(narrow.columns, 20)
  assert.ok(narrow.scale < fit.scale)
})

test('a tall diagram is shrunk toward the screen height, but not below 60% of its labels', () => {
  const natural = fitToCells({ width: 100, height: 2000 }, JETBRAINS, 200)
  const fitted = fitToCells({ width: 100, height: 2000 }, JETBRAINS, 200, 40)
  assert.ok(Math.abs(fitted.scale - natural.scale * 0.6) < 1e-9)
  const short = fitToCells({ width: 100, height: 400 }, JETBRAINS, 200, 40)
  assert.ok(short.rows <= 40)
})

test('auto colors follow the terminal; a named theme brings its own background as a card', () => {
  assert.deepEqual(diagramColors({ terminal: { background: '#1e1e1e', foreground: '#cccccc' } }), {
    colors: { bg: '#1e1e1e', fg: '#cccccc', accent: '#d77757' },
    card: false,
    theme: 'auto',
  })
  assert.deepEqual(diagramColors({ prefersDark: false }).colors, { bg: '#ffffff', fg: '#24292f', accent: '#d77757' })
  const nord = diagramColors({ theme: 'nord', overrides: { accent: '#ff0000' } })
  assert.equal(nord.card, true)
  assert.equal(nord.colors.bg, '#2e3440')
  assert.equal(nord.colors.accent, '#ff0000')
  assert.equal(diagramColors({ theme: 'no-such-theme' }).theme, 'auto')
})

test('Hangul and CJK take two cells', () => {
  assert.equal(cellWidth('A→B'), 3)
  assert.equal(cellWidth('요청'), 4)
})

test('box drawing for a flowchart, and an error for a diagram too wide', () => {
  const item = { key: 'k', source: 'graph LR\n  A --> B', kind: 'text', maxColumns: 80 }
  const art = renderText(item)
  assert.ok(art.text.includes('A') && art.text.includes('►'), art.text)
  assert.equal(art.rows, art.text.split('\n').length)
  assert.throws(() => renderText({ ...item, maxColumns: 5 }), /wider than the 5/)
})

test('a picture is a PNG of whole cells; an unsupported diagram fails', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-inline-'))
  const request = { ...JETBRAINS, outDir, theme: 'auto', overrides: {}, terminal: {}, prefersDark: true, font: 'auto' }
  const result = renderPicture({ key: 'p', source: 'graph TD\n  A[Start] --> B[End]', maxColumns: 80, maxRows: 40 }, request)
  const png = fs.readFileSync(result.file)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  // The PNG's size is the box of cells it fills.
  assert.equal(png.readUInt32BE(16), Math.round(result.columns * (48 / 2.125)))
  assert.equal(png.readUInt32BE(20), result.rows * 48)
  assert.throws(() => renderPicture({ key: 'q', source: 'pie title Pets\n  "Dogs" : 3', maxColumns: 80, maxRows: 40 }, request), /Invalid mermaid header/)
  fs.rmSync(outDir, { recursive: true, force: true })
})
