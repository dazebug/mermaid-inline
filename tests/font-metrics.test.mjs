// Run with `node --test tests/*.test.mjs`; `claude plugin test` runs the *.test.ts files.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { findFontFile, ghosttyCell, parseGhosttyConfig, readFontMetrics } from '../bin/font-metrics.mjs'

const FIRA_CODE = { unitsPerEm: 1950, ascent: 1800, descent: -600, lineGap: 0, maxAsciiAdvance: 1200 }
const JETBRAINS_MONO = { unitsPerEm: 1000, ascent: 1020, descent: -300, lineGap: 0, maxAsciiAdvance: 600 }

test('Ghostty cells are the rounded line height over the rounded widest ASCII advance', () => {
  // Fira Code at 12pt on a 2x display: a 15 x 30 px cell, baseline 7 px from the bottom.
  assert.deepEqual(ghosttyCell(FIRA_CODE, 12, 2), { cell_aspect: 2, baseline: 23 / 30, line_height: 30 / 24 })
  // JetBrains Mono at 13pt on a 2x display: a 16 x 34 px cell, baseline 8 px from the bottom.
  assert.deepEqual(ghosttyCell(JETBRAINS_MONO, 13, 2), { cell_aspect: 34 / 16, baseline: 26 / 34, line_height: 34 / 26 })
})

test('the first non-empty font-family is the primary font, and the last font-size wins', () => {
  const config = [
    '# comment',
    'font-family = "Fira Code"',
    'font-family = D2Coding',
    'font-size = 12',
    'font-size = 14.5',
  ].join('\n')
  assert.deepEqual(parseGhosttyConfig(config), { fontFamily: 'Fira Code', fontSize: 14.5 })
  assert.deepEqual(parseGhosttyConfig('font-family = A\nfont-family =\nfont-family = B'), { fontFamily: 'B', fontSize: undefined })
  assert.deepEqual(parseGhosttyConfig('theme = dark'), { fontFamily: undefined, fontSize: undefined })
})

const firaFile = [path.join(os.homedir(), 'Library/Fonts/FiraCode-Regular.ttf'), '/usr/share/fonts/truetype/firacode/FiraCode-Regular.ttf'].find(file => fs.existsSync(file))

test('a font file yields the metrics Ghostty reads', { skip: firaFile === undefined && 'Fira Code is not installed' }, () => {
  assert.deepEqual(readFontMetrics(firaFile), FIRA_CODE)
})

test('a family name finds its regular face among the font folders', { skip: firaFile === undefined && 'Fira Code is not installed' }, () => {
  assert.equal(findFontFile('Fira Code', [path.dirname(firaFile)]), firaFile)
  assert.equal(findFontFile('No Such Font', [path.dirname(firaFile)]), undefined)
})
