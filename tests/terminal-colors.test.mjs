// Run with `node --test tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ghosttyColors, kittyColors, normalizeColor, parseGhosttyColors, themeName } from '../bin/terminal-colors.mjs'

// A file system of the files named here alone.
const files = contents => file => contents[file] ?? ''

test('colors are read as #rrggbb', () => {
  assert.equal(normalizeColor('#282C34'), '#282c34')
  assert.equal(normalizeColor('282c34'), '#282c34')
  assert.equal(normalizeColor('#fff'), '#ffffff')
  assert.equal(normalizeColor('black'), '#000000')
  assert.equal(normalizeColor('rebeccapurple'), undefined)
})

test('a light:dark theme pair picks the one for the mode', () => {
  assert.equal(themeName('Dracula', true), 'Dracula')
  assert.equal(themeName('light:GitHub Light,dark:GitHub Dark', true), 'GitHub Dark')
  assert.equal(themeName('light:GitHub Light,dark:GitHub Dark', false), 'GitHub Light')
})

test('Ghostty with nothing configured draws its default colors', () => {
  const answer = ghosttyColors({ home: '/h', platform: 'linux', prefersDark: true, readFile: files({}) })
  assert.deepEqual(answer, { ok: true, background: '#282c34', foreground: '#ffffff', source: 'Ghostty default' })
})

test("a Ghostty theme's colors, with the config's own lines winning over it", () => {
  const readFile = files({
    '/h/.config/ghostty/config': 'theme = Dracula\nforeground = #eeeeee\n',
    '/usr/share/ghostty/themes/Dracula': 'background = #282a36\nforeground = #f8f8f2\n',
  })
  assert.deepEqual(ghosttyColors({ home: '/h', platform: 'linux', prefersDark: true, readFile }), {
    ok: true,
    background: '#282a36',
    foreground: '#eeeeee',
    source: 'Ghostty theme Dracula',
  })
  const missing = ghosttyColors({ home: '/h', platform: 'linux', prefersDark: true, readFile: files({ '/h/.config/ghostty/config': 'theme = Nope' }) })
  assert.equal(missing.ok, false)
})

test('config-file includes are followed', () => {
  const readFile = files({ '/h/.config/ghostty/colors': 'background = 101010' })
  assert.deepEqual(parseGhosttyColors('config-file = colors', '/h/.config/ghostty', readFile), { background: '#101010' })
})

test("kitty's colors follow its includes, as a theme set by kitten themes is", () => {
  const readFile = files({
    '/h/.config/kitty/kitty.conf': 'font_size 12\ninclude current-theme.conf\n',
    '/h/.config/kitty/current-theme.conf': 'background #1e1e2e\nforeground #cdd6f4\n',
  })
  assert.deepEqual(kittyColors({ home: '/h', readFile }), { ok: true, background: '#1e1e2e', foreground: '#cdd6f4', source: 'kitty.conf' })
})
