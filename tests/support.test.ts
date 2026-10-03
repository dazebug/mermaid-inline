import { expect, test } from 'claude-code/testing'

import { diagramStyle, parseColors, showsPictures } from '../hooks/support'

test('pictures in Ghostty, cmux and kitty, not inside tmux', () => {
  expect(showsPictures({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(showsPictures({ TERM: 'xterm-kitty' })).toBe(true)
  expect(showsPictures({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux-501/default,1,0' })).toBe(false)
  expect(showsPictures({ TERM_PROGRAM: 'iTerm.app' })).toBe(false)
})

test('mode overrides what the terminal shows', () => {
  expect(diagramStyle({ TERM_PROGRAM: 'iTerm.app' }, 'auto')).toBe('text')
  expect(diagramStyle({ TERM_PROGRAM: 'iTerm.app' }, 'on')).toBe('pictures')
  expect(diagramStyle({ TERM_PROGRAM: 'ghostty' }, 'text')).toBe('text')
  expect(diagramStyle({ TERM_PROGRAM: 'ghostty' }, 'off')).toBe('off')
})

test('color overrides are key=#rrggbb pairs; the rest is named as rejected', () => {
  expect(parseColors('accent=#D77757 line=#5c6370, fg=#fff nope=#000000 bg')).toEqual({
    colors: { accent: '#d77757', line: '#5c6370' },
    rejected: ['fg=#fff', 'nope=#000000', 'bg'],
  })
  expect(parseColors('')).toEqual({ colors: {}, rejected: [] })
})
