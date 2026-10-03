export type Segment = { kind: 'text'; text: string } | { kind: 'mermaid'; source: string; raw: string }

// An opening code fence: up to three spaces, then three or more backticks or
// tildes, then the info string.
const OPENING = /^( {0,3})(`{3,}|~{3,})(.*)$/

function isClosing(line: string, fence: string): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)
  return match !== null && match[1]?.[0] === fence[0] && (match[1]?.length ?? 0) >= fence.length
}

function pushText(out: Segment[], lines: string[]): void {
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
  if (lines.length > 0) out.push({ kind: 'text', text: lines.join('\n') })
}

// Splits a reply into its Mermaid code blocks and the markdown around them.
// A Mermaid block is a fence at the start of a line whose info string starts
// with `mermaid`, closed before the reply ends: a reply still streaming in
// leaves an open fence as text until it closes. An indented fence, as in a
// list item, stays in the text, so cutting the reply there never splits a
// list.
export function splitReply(text: string): Segment[] {
  const lines = text.split('\n')
  const out: Segment[] = []
  let pending: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const opening = OPENING.exec(line)
    if (!opening) {
      pending.push(line)
      continue
    }
    const fence = opening[2] ?? '```'
    const info = (opening[3] ?? '').trim()
    // A backtick fence's info string may not hold a backtick.
    if (fence[0] === '`' && info.includes('`')) {
      pending.push(line)
      continue
    }
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (isClosing(lines[j] ?? '', fence)) {
        end = j
        break
      }
    }
    if (end < 0) {
      // A fence that never closes runs to the end: the rest is code.
      pending.push(...lines.slice(i))
      break
    }
    const block = lines.slice(i, end + 1)
    const language = info.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (language === 'mermaid' && (opening[1] ?? '') === '') {
      pushText(out, pending)
      pending = []
      out.push({ kind: 'mermaid', source: block.slice(1, -1).join('\n'), raw: block.join('\n') })
    } else {
      pending.push(...block)
    }
    i = end
  }
  pushText(out, pending)
  return out
}

export function hasMermaid(text: string): boolean {
  return splitReply(text).some(segment => segment.kind === 'mermaid')
}
