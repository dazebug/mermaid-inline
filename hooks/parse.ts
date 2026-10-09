// `indent` is how many columns the part sits in from the reply's left edge:
// a diagram in a list item, and the rest of that item after it, keep the
// item's indent. Absent means the top level.
export type Segment =
  | { kind: 'text'; text: string; indent?: number }
  | { kind: 'mermaid'; source: string; raw: string; indent?: number }

// An opening code fence: three or more backticks or tildes, then the info
// string.
const OPENING = /^(`{3,}|~{3,})(.*)$/
const CLOSING = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
// A list marker, a bullet or a number, followed by a space, a tab or nothing.
const LIST_MARKER = /^(?:[-*+]|(\d{1,9})[.)])(?=[ \t]|$)/
// A thematic break, which wins over a list marker: `* * *` is a rule.
const THEMATIC_BREAK = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const ATX_HEADING = /^#{1,6}(?:[ \t]|$)/
// The line under a paragraph that makes it a heading.
const SETEXT_UNDERLINE = /^(?:=+|-+)[ \t]*$/

// A block a line can sit in: a list item, which a line stays in by being
// indented `width` columns past where the item's parent starts its content,
// or, with `quote`, a block quote, which a line stays in by starting with
// `>`. `column` is where an item's content starts in the reply; a quote keeps
// its parent's.
type Container = { id: number; column: number; width: number; quote?: true }
// A fenced code block: its opening line, its closing line (-1 while open),
// the line after it, the column its fence starts at and how far that is
// past where its container's content starts, the content column of the item
// it is in, and its fence. `interrupts` says its line, when it opens the
// block after list markers, interrupts a paragraph; `quoted`, that it is in
// a block quote.
type Fence = {
  start: number
  end: number
  stop: number
  indent: number
  offset: number
  column: number
  info: string
  char: string
  length: number
  interrupts: boolean
  quoted: boolean
}
// What a line sits in: its containers, outermost first, and the fenced code
// block it opens, if it opens one. `lazy` marks a line that continues a
// paragraph from outside some of the paragraph's containers; `content`, on a
// line of a fenced or indented code block, is the column its code starts at.
type Line = { containers: Container[]; fence?: Fence; lazy?: true; content?: number }

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0
}

// A line with the tabs in its indent and after its `>` and list markers
// turned into spaces up to the next multiple of 4 columns, which is how
// CommonMark reads tabs that set block structure. Each character keeps its
// column.
function expandTabs(line: string): string {
  let out = ''
  let at = 0
  for (;;) {
    for (; line[at] === ' ' || line[at] === '\t'; at++) out += line[at] === '\t' ? ' '.repeat(4 - (out.length % 4)) : ' '
    const rest = line.slice(at)
    const marker = rest.startsWith('>') ? '>' : LIST_MARKER.exec(rest)?.[0]
    if (!marker) return out + rest
    out += marker
    at += marker.length
  }
}

// The part of a line from a column on. A tab across that column gives the
// columns it has left as spaces, as CommonMark does when a container takes
// part of a tab.
function fromColumn(line: string, column: number): string {
  let at = 0
  for (let i = 0; i < line.length; i++) {
    if (at >= column) return line.slice(i)
    const next = line[i] === '\t' ? at + 4 - (at % 4) : at + 1
    if (next > column) return ' '.repeat(next - column) + line.slice(i + 1)
    at = next
  }
  return ''
}

function dedent(line: string, columns: number): string {
  return line.slice(Math.min(columns, indentOf(line)))
}

function openingAt(text: string): { char: string; length: number; info: string } | undefined {
  const opening = OPENING.exec(text)
  const char = opening?.[1]?.[0] ?? '`'
  const info = (opening?.[2] ?? '').trim()
  // A backtick fence's info string may not hold a backtick.
  if (!opening || (char === '`' && info.includes('`'))) return undefined
  return { char, length: opening[1]?.length ?? 3, info }
}

function isClosing(text: string, fence: Fence): boolean {
  const match = CLOSING.exec(text)
  return match !== null && match[1]?.[0] === fence.char && (match[1]?.length ?? 0) >= fence.length
}

// Whether a line, read from where its container's content starts, starts a
// block other than a paragraph, so it cannot lazily continue one.
function startsBlock(text: string): boolean {
  const lead = indentOf(text)
  const rest = text.slice(lead)
  return lead <= 3 && (rest.startsWith('>') || ATX_HEADING.test(rest) || THEMATIC_BREAK.test(rest) || LIST_MARKER.test(rest) || openingAt(rest) !== undefined)
}

// How many of the open containers a line stays in, and where its text starts
// after their indents and `>` markers. A blank line stays in an item, unless
// the item has nothing in it yet.
function enter(line: string, containers: Container[], empty: Container | null): { matched: number; at: number } {
  let at = 0
  let matched = 0
  for (const container of containers) {
    const lead = indentOf(line.slice(at))
    if (container.quote) {
      if (lead > 3 || line[at + lead] !== '>') break
      at += lead + 1
      if (line[at] === ' ') at++
    } else if (line.slice(at).trim() === '') {
      if (container === empty) break
      at += lead
    } else {
      if (lead < container.width) break
      at += container.width
    }
    matched++
  }
  return { matched, at }
}

// Reads the reply's blocks the way CommonMark does, as far as diagrams need
// them: list items, also several opened on one line or one opened with no
// text, block quotes, the lines that lazily continue a paragraph in them,
// and fenced code blocks, also one opened on a list marker's line. The other
// blocks hold nothing for diagrams and are read as text: indented code,
// thematic breaks, headings and paragraphs.
function scan(lines: string[]): Line[] {
  const out: Line[] = []
  let containers: Container[] = []
  let nextId = 0
  // Whether the innermost open block is a paragraph, which a lazy line can
  // continue and only some blocks can interrupt.
  let paragraph = false
  // An item opened with no text on the line before, which a blank line ends.
  let fresh: Container | null = null
  let open: Fence | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const { matched, at: start } = enter(line, containers, fresh)
    fresh = null
    const rest = line.slice(start)
    const all = matched === containers.length
    if (open) {
      // A fenced block ends with the containers it is in.
      if (all) {
        if (isClosing(rest, open)) {
          open.end = i
          open.stop = i + 1
          open = null
          out.push({ containers })
        } else out.push({ containers, content: start + Math.min(open.offset, indentOf(rest)) })
        continue
      }
      open.stop = i
      open = null
    }
    if (paragraph && !all && rest.trim() !== '' && !startsBlock(rest)) {
      out.push({ containers, lazy: true })
      continue
    }
    // A line in all of a paragraph's containers interrupts it, which only
    // some blocks can do.
    const interrupts: boolean = paragraph && all
    let interrupting: boolean = interrupts
    containers = containers.slice(0, matched)
    paragraph = false
    let column = containers[containers.length - 1]?.column ?? 0
    let at = start
    let fence: Fence | undefined
    let content: number | undefined
    while (line.slice(at).trim() !== '') {
      const lead = indentOf(line.slice(at))
      const text = line.slice(at + lead)
      if (lead >= 4) {
        // Indented code, or more of the paragraph it would interrupt.
        paragraph = interrupting
        if (!interrupting) content = at + 4
        break
      }
      if (text.startsWith('>')) {
        containers = [...containers, { id: nextId++, column, width: 0, quote: true }]
        at += lead + 1
        if (line[at] === ' ') at++
        interrupting = false
        continue
      }
      const opening = openingAt(text)
      if (opening) {
        fence = { start: i, end: -1, stop: lines.length, indent: at + lead, offset: lead, column, ...opening, interrupts, quoted: containers.some(container => container.quote) }
        open = fence
        break
      }
      if ((interrupting && SETEXT_UNDERLINE.test(text)) || THEMATIC_BREAK.test(text) || ATX_HEADING.test(text)) break
      const marker = LIST_MARKER.exec(text)
      const after = text.slice(marker?.[0].length ?? 0)
      const empty = after.trim() === ''
      // An item that interrupts a paragraph has text and, if numbered,
      // starts at 1.
      if (marker && !(interrupting && (empty || (marker[1] !== undefined && Number(marker[1]) !== 1)))) {
        const spaces = indentOf(after)
        // An item whose text starts on the next line, or with indented code,
        // has its content one column after the marker.
        const width = lead + marker[0].length + (empty || spaces > 4 ? 1 : spaces)
        column += width
        const item = { id: nextId++, column, width }
        containers = [...containers, item]
        interrupting = false
        if (empty) {
          fresh = item
          break
        }
        at += width
        continue
      }
      paragraph = true
      break
    }
    out.push(fence ? { containers, fence } : content !== undefined ? { containers, content } : { containers })
  }
  return out
}

// The content column of the innermost item around a diagram that a later
// line still sits in, or 0 once the line is past all of them.
function anchorOf(containers: Container[], around: Container[]): number {
  let column = 0
  for (let depth = 0; depth < around.length && containers[depth]?.id === around[depth]?.id; depth++) column = around[depth]?.column ?? 0
  return column
}

// A line of the rest of an item, with the item's indent taken off. A lazy
// line left of the item's content would lose its laziness there, so one
// that would then start a block, or underline its paragraph into a heading,
// is indented past where any block can start instead.
function continued(line: string, entry: Line | undefined, at: number): string {
  const text = line.trimStart()
  if (!entry?.lazy || indentOf(line) >= at || !(startsBlock(text) || SETEXT_UNDERLINE.test(text))) return dedent(line, at)
  let column = at
  for (const container of entry.containers) {
    if (container.quote) break
    column = container.column
  }
  return ' '.repeat(column - at + 4) + text
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
// level or in a list item, also on the item's marker line, whose markers
// then stay in the text as items with nothing in them. One in a block quote
// stays text.
//
// Cutting a list at a diagram must not flatten it: the rest of the item after
// the diagram, and then the rest of each item around that one, comes out as
// text with its indent removed and recorded, so it can be drawn at the indent
// it had.
export function splitReply(text: string): Segment[] {
  const lines = text.split('\n')
  // Text at the top level keeps the reply's own characters. The scanner, and
  // the text cut out of an item, read tabs that set block structure as their
  // columns, since taking columns off would move a tab to another tab stop.
  const expanded = lines.map(expandTabs)
  const scanned = scan(expanded)
  // A line as the scanner reads it, with the reply's own characters from
  // where its code starts: a tab in code is code, as in a Makefile recipe.
  // A tab that starts the code keeps its character but not its width once
  // its line moves left by a number of columns that is no multiple of 4.
  const faithful = (k: number): string => {
    const content = scanned[k]?.content
    const line = expanded[k] ?? ''
    return content === undefined ? line : line.slice(0, content) + fromColumn(lines[k] ?? '', content)
  }
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
    if (fence.end < 0 || fence.quoted || language !== 'mermaid') {
      pending.push(...lines.slice(i, fence.stop))
      i = fence.stop
      continue
    }
    const markers = (expanded[i] ?? '').slice(0, fence.column).trimEnd()
    // Alone under a paragraph, a marker would continue or underline it; a
    // blank line keeps it an item.
    if (markers.trim() !== '') pending.push(...(fence.interrupts ? ['', markers] : [markers]))
    pushText(out, pending)
    pending = []
    const rows = Array.from({ length: fence.end - i }, (_, k) => faithful(i + 1 + k))
    const source = rows.slice(0, -1).map(content => dedent(content, fence.indent))
    const raw = [(expanded[i] ?? '').slice(fence.column), ...rows.map(row => dedent(row, fence.column))]
    out.push(withIndent({ kind: 'mermaid', source: source.join('\n'), raw: raw.join('\n') }, fence.column))
    i = fence.end + 1
    const around = scanned[fence.start]?.containers ?? []
    while (i < lines.length) {
      let next = i
      while (next < lines.length && (lines[next] ?? '').trim() === '') next++
      const at = next < lines.length ? anchorOf(scanned[next]?.containers ?? [], around) : 0
      if (at === 0) break
      const run: string[] = []
      while (i < lines.length && ((lines[i] ?? '').trim() === '' || anchorOf(scanned[i]?.containers ?? [], around) === at)) {
        const entry = scanned[i]
        run.push(entry?.content !== undefined ? dedent(faithful(i), at) : continued(expanded[i] ?? '', entry, at))
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
