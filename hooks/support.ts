export type DiagramStyle = 'pictures' | 'text' | 'off'

// Pictures reach the screen through the kitty graphics protocol's Unicode
// placeholders, which Ghostty (and cmux, built on it) and kitty speak; tmux
// passes none of it through.
export function showsPictures(env: Record<string, string | undefined>): boolean {
  if (env.TMUX) return false
  return (
    env.TERM_PROGRAM === 'ghostty' ||
    env.TERM === 'xterm-ghostty' ||
    Boolean(env.TERM?.includes('kitty')) ||
    Boolean(env.KITTY_WINDOW_ID)
  )
}

// How replies show their diagrams: pictures where the terminal can draw them,
// Unicode box drawing elsewhere. `mode` is the user's override: `on` always
// draws pictures, `text` always draws box drawing, `off` leaves the code
// blocks as written.
export function diagramStyle(env: Record<string, string | undefined>, mode: string): DiagramStyle {
  if (mode === 'off') return 'off'
  if (mode === 'text') return 'text'
  if (mode === 'on') return 'pictures'
  return showsPictures(env) ? 'pictures' : 'text'
}

const COLOR_KEYS = ['bg', 'fg', 'line', 'accent', 'muted', 'surface', 'border'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

// The `colors` option: `key=#rrggbb` pairs separated by spaces or commas,
// such as `accent=#d77757 line=#5c6370`. Unknown keys and malformed colors
// are dropped and named in `rejected`.
export function parseColors(text: string): { colors: Partial<Record<ColorKey, string>>; rejected: string[] } {
  const colors: Partial<Record<ColorKey, string>> = {}
  const rejected: string[] = []
  for (const pair of text.split(/[\s,;]+/).filter(Boolean)) {
    const [key, value] = pair.split('=')
    const name = (key ?? '').trim().toLowerCase() as ColorKey
    const color = (value ?? '').trim()
    if (COLOR_KEYS.includes(name) && /^#[0-9a-fA-F]{6}$/.test(color)) colors[name] = color.toLowerCase()
    else rejected.push(pair)
  }
  return { colors, rejected }
}
