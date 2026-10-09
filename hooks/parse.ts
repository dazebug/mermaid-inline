// `indent` is how many columns the part sits in from the reply's left edge:
// a diagram in a list item, and the rest of that item after it, keep the
// item's indent. Absent means the top level.
export type Segment =
  | { kind: 'text'; text: string; indent?: number }
  | { kind: 'mermaid'; source: string; raw: string; indent?: number }

// An opening code fence: three or more backticks or tildes, then the info
// string. How far it may be indented depends on the list item around it.
const OPENING = /^( *)(`{3,}|~{3,})(.*)$/
// A list item's first line: its indent, its bullet or number, and the spaces
// before its text, which start at the item's content column.
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( {1,4})(?=\S)/
// The lines that start a new block instead of continuing a paragraph.
const INTERRUPTS = /^ {0,3}(?:[-*+] +\S|\d{1,9}[.)] +\S|`{3,}|~{3,}|#{1,6}(?: |$)|>|(?:[-*_] *){3,}$)/
// A heading or a rule ends a paragraph instead of being one.
const NOT_A_PARAGRAPH = /^ {0,3}(?:#{1,6}(?: |$)|(?:[-*_] *){3,}$)/

type Item = { column: number; id: number }
type Fence = { start: number; end: number; stop: number; indent: number; column: number; info: string; char: string; length: number }
// What a line sits in: the list items around it, outermost first, and the
// fenced code block it opens, if it opens one.
type Line = { items: Item[]; fence?: Fence }

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0
}

function dedent(line: string, columns: number): string {
  return line.slice(Math.min(columns, indentOf(line)))
}

function isClosing(line: string, fence: Fence): boolean {
  const match = /^( *)(`{3,}|~{3,})\s*$/.exec(line)
  return match !== null && (match[1]?.length ?? 0) <= fence.column + 3 && match[2]?.[0] === fence.char && (match[2]?.length ?? 0) >= fence.length
}

// Reads the reply's blocks the way Markdown does, as far as diagrams need
// them: list items, including the unindented lines that lazily continue an
// item's paragraph, fenced code blocks, and indented code, whose lines hold
// nothing. A list marker or a fence inside indented code is text.
function scan(lines: string[]): Line[] {
  const out: Line[] = []
  let items: Item[] = []
  let nextId = 0
  let paragraph = false
  let open: Fence | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const blank = line.trim() === ''
    const indent = indentOf(line)
    if (open) {
      // A fenced block in a list item ends with the item.
      if (blank || indent >= open.column) {
        out.push({ items })
        if (isClosing(line, open)) {
          open.end = i
          open.stop = i + 1
          open = null
        }
        continue
      }
      open.stop = i
      open = null
    }
    if (blank) {
      out.push({ items })
      paragraph = false
      continue
    }
    const kept = items.filter(item => item.column <= indent)
    if (paragraph && kept.length < items.length && !INTERRUPTS.test(line)) {
      out.push({ items })
      continue
    }
    items = kept
    const column = items[items.length - 1]?.column ?? 0
    if (!paragraph && indent >= column + 4) {
      out.push({ items })
      continue
    }
    const opening = OPENING.exec(line)
    const char = opening?.[2]?.[0] ?? '`'
    const info = (opening?.[3] ?? '').trim()
    // A backtick fence's info string may not hold a backtick.
    if (opening && indent - column <= 3 && !(char === '`' && info.includes('`'))) {
      open = { start: i, end: -1, stop: lines.length, indent, column, info, char, length: opening[2]?.length ?? 3 }
      out.push({ items, fence: open })
      paragraph = false
      continue
    }
    const marker = LIST_ITEM.exec(line)
    out.push({ items })
    if (marker && indent - column <= 3) {
      items = [...items, { column: indent + (marker[2]?.length ?? 1) + (marker[3]?.length ?? 1), id: nextId++ }]
      paragraph = true
      continue
    }
    paragraph = !NOT_A_PARAGRAPH.test(line)
  }
  return out
}

// The content column of the innermost item around a diagram that a later
// line still sits in, or 0 once the line is past all of them.
function anchorOf(items: Item[], around: Item[]): number {
  let column = 0
  for (let depth = 0; depth < around.length && items[depth]?.id === around[depth]?.id; depth++) column = around[depth]?.column ?? 0
  return column
}

function withIndent<S extends Segment>(segment: S, indent: number): S {
  return indent > 0 ? { ...segment, indent } : segment
}

function pushText(out: Segment[], lines: string[]): void {
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
  if (lines.length > 0) out.push({ kind: 'text', text: lines.join('\n') })
}

// Splits a reply into its Mermaid code blocks and the markdown around them.
// A Mermaid block is a fence whose info string starts with `mermaid`, closed
// before its list item or the reply ends: a reply still streaming in leaves
// an open fence as text until it closes. The fence may stand at the top
// level or in a list item.
//
// Cutting a list at a diagram must not flatten it: the rest of the item after
// the diagram, and then the rest of each item around that one, comes out as
// text with its indent removed and recorded, so it can be drawn at the indent
// it had.
export function splitReply(text: string): Segment[] {
  const lines = text.split('\n')
  const scanned = scan(lines)
  const out: Segment[] = []
  let pending: string[] = []
  let i = 0
  while (i < lines.length) {
    const fence = scanned[i]?.fence
    if (!fence) {
      pending.push(lines[i] ?? '')
      i++
      continue
    }
    const language = fence.info.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (fence.end < 0 || language !== 'mermaid') {
      pending.push(...lines.slice(i, fence.stop))
      i = fence.stop
      continue
    }
    pushText(out, pending)
    pending = []
    const block = lines.slice(i, fence.end + 1)
    const source = block.slice(1, -1).map(content => dedent(content, fence.indent))
    out.push(withIndent({ kind: 'mermaid', source: source.join('\n'), raw: block.map(row => dedent(row, fence.column)).join('\n') }, fence.column))
    i = fence.end + 1
    const around = scanned[fence.start]?.items ?? []
    while (i < lines.length) {
      let next = i
      while (next < lines.length && (lines[next] ?? '').trim() === '') next++
      const at = next < lines.length ? anchorOf(scanned[next]?.items ?? [], around) : 0
      if (at === 0) break
      const run: string[] = []
      while (i < lines.length && ((lines[i] ?? '').trim() === '' || anchorOf(scanned[i]?.items ?? [], around) === at)) {
        run.push(dedent(lines[i] ?? '', at))
        i++
      }
      for (const segment of splitReply(run.join('\n'))) out.push(withIndent(segment, (segment.indent ?? 0) + at))
    }
  }
  pushText(out, pending)
  return out
}

export function hasMermaid(text: string): boolean {
  return splitReply(text).some(segment => segment.kind === 'mermaid')
}
