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

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0
}

function dedent(line: string, columns: number): string {
  return line.slice(Math.min(columns, indentOf(line)))
}

function isClosing(line: string, fence: string, maxIndent: number): boolean {
  const match = /^( *)(`{3,}|~{3,})\s*$/.exec(line)
  return match !== null && (match[1]?.length ?? 0) <= maxIndent && match[2]?.[0] === fence[0] && (match[2]?.length ?? 0) >= fence.length
}

// The content column of the list item that line `i`, indented `indent`
// columns, belongs to, or 0 at the top level: the nearest line above it that
// is indented less must be that item's first line.
function containerColumn(lines: string[], i: number, indent: number): number {
  for (let j = i - 1; j >= 0; j--) {
    const line = lines[j] ?? ''
    if (line.trim() === '' || indentOf(line) >= indent) continue
    const item = LIST_ITEM.exec(line)
    if (!item) return 0
    const column = (item[1]?.length ?? 0) + (item[2]?.length ?? 0) + (item[3]?.length ?? 0)
    return column <= indent ? column : 0
  }
  return 0
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
// before its container ends: a reply still streaming in leaves an open fence
// as text until it closes. A fence at the top level may be indented up to
// three columns; one in a list item sits at the item's content column, and
// one indented four or more columns past that is an indented code block, as
// it is in Markdown.
//
// Cutting a list at a diagram must not flatten it: the rest of the item after
// the diagram, and then the rest of each item around that one, comes out as
// text with its indent removed and recorded, so it can be drawn at the indent
// it had.
export function splitReply(text: string): Segment[] {
  const lines = text.split('\n')
  const out: Segment[] = []
  let pending: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const opening = OPENING.exec(line)
    const indent = opening?.[1]?.length ?? 0
    const column = opening && indent > 0 ? containerColumn(lines, i, indent) : 0
    const fence = opening?.[2] ?? '```'
    const info = (opening?.[3] ?? '').trim()
    // A backtick fence's info string may not hold a backtick.
    if (!opening || indent > column + 3 || (fence[0] === '`' && info.includes('`'))) {
      pending.push(line)
      i++
      continue
    }
    // The block ends at its closing fence, or where its list item ends.
    let end = -1
    let stop = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j] ?? ''
      if (column > 0 && candidate.trim() !== '' && indentOf(candidate) < column) {
        stop = j
        break
      }
      if (isClosing(candidate, fence, column + 3)) {
        end = j
        break
      }
    }
    if (end < 0) {
      // A fence that never closes runs to the end of its container: that is code.
      pending.push(...lines.slice(i, stop))
      i = stop
      continue
    }
    const block = lines.slice(i, end + 1)
    i = end + 1
    const language = info.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (language !== 'mermaid') {
      pending.push(...block)
      continue
    }
    pushText(out, pending)
    pending = []
    const source = block.slice(1, -1).map(content => dedent(content, indent))
    out.push(withIndent({ kind: 'mermaid', source: source.join('\n'), raw: block.map(row => dedent(row, column)).join('\n') }, column))
    let at = column
    while (at > 0 && i < lines.length) {
      const run: string[] = []
      while (i < lines.length && ((lines[i] ?? '').trim() === '' || indentOf(lines[i] ?? '') >= at)) {
        run.push(dedent(lines[i] ?? '', at))
        i++
      }
      for (const segment of splitReply(run.join('\n'))) out.push(withIndent(segment, (segment.indent ?? 0) + at))
      if (i < lines.length) at = containerColumn(lines, i, indentOf(lines[i] ?? ''))
    }
  }
  pushText(out, pending)
  return out
}

export function hasMermaid(text: string): boolean {
  return splitReply(text).some(segment => segment.kind === 'mermaid')
}
