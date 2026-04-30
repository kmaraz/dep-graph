export type MermaidDiagramType = 'flowchart' | 'graph' | 'unsupported'
export type MermaidDirection = 'TB' | 'TD' | 'BT' | 'RL' | 'LR'

export interface ParsedNode {
  id: string
  label: string
  groupId?: string
  rawLines: number[]
}

export interface ParsedEdge {
  id: string
  source: string
  target: string
  label?: string
  kind: string
  rawLines: number[]
}

export interface ParsedGroup {
  id: string
  label: string
  parentId?: string
  rawLines: number[]
}

export interface ParsedMermaidGraph {
  diagramType: MermaidDiagramType
  direction: MermaidDirection
  nodes: ParsedNode[]
  edges: ParsedEdge[]
  groups: ParsedGroup[]
  warnings: string[]
  rawLines: string[]
}

interface NodeToken {
  id: string
  label: string
}

interface EdgeToken {
  text: string
  kind: string
  label?: string
}

const DEFAULT_DIRECTION: MermaidDirection = 'TD'
const SUPPORTED_DIRECTIONS = new Set<MermaidDirection>([
  'TB',
  'TD',
  'BT',
  'RL',
  'LR',
])

const IGNORED_PREFIXES = [
  'accdescr',
  'acctitle',
  'class ',
  'classdef',
  'click ',
  'direction ',
  'linkstyle',
  'style ',
]

export function parseMermaidFlowchart(source: string): ParsedMermaidGraph {
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  const warnings: string[] = []
  const groups = new Map<string, ParsedGroup>()
  const nodes = new Map<string, ParsedNode>()
  const edges: ParsedEdge[] = []
  const groupStack: string[] = []

  const firstStatement = rawLines.find((line) => {
    const normalized = line.trim().toLowerCase()
    return normalized !== '' && !normalized.startsWith('%%')
  })
  const header = parseHeader(firstStatement ?? '')

  if (!header) {
    return {
      diagramType: 'unsupported',
      direction: DEFAULT_DIRECTION,
      nodes: [],
      edges: [],
      groups: [],
      warnings: [
        'Only Mermaid flowchart/graph diagrams can be explored. Other diagram types are available in SVG preview only.',
      ],
      rawLines,
    }
  }

  for (const [lineIndex, rawLine] of rawLines.entries()) {
    const lineNumber = lineIndex + 1
    const line = stripLineTerminator(rawLine)
    const trimmed = line.trim()
    const lowered = trimmed.toLowerCase()

    if (
      trimmed === '' ||
      trimmed.startsWith('%%') ||
      lowered.startsWith('flowchart ') ||
      lowered.startsWith('graph ') ||
      IGNORED_PREFIXES.some((prefix) => lowered.startsWith(prefix))
    ) {
      continue
    }

    if (lowered === 'end') {
      groupStack.pop()
      continue
    }

    if (lowered.startsWith('subgraph ')) {
      const token = parseSubgraphToken(trimmed.slice('subgraph '.length))
      if (!token) {
        warnings.push(`Line ${lineNumber}: skipped malformed subgraph declaration.`)
        continue
      }
      const parentId = groupStack.at(-1)
      const group: ParsedGroup = {
        id: token.id,
        label: token.label,
        parentId,
        rawLines: [lineNumber],
      }
      groups.set(group.id, group)
      groupStack.push(group.id)
      continue
    }

    const edgeChain = parseEdgeChain(trimmed)
    if (edgeChain) {
      for (const segment of edgeChain) {
        const sourceNode = upsertNode(nodes, segment.source, groupStack.at(-1), lineNumber)
        const targetNode = upsertNode(nodes, segment.target, groupStack.at(-1), lineNumber)
        const edgeId = createEdgeId(
          segment.source.id,
          segment.target.id,
          segment.edge.kind,
          lineNumber,
          edges,
        )

        edges.push({
          id: edgeId,
          source: sourceNode.id,
          target: targetNode.id,
          label: segment.edge.label,
          kind: segment.edge.kind,
          rawLines: [lineNumber],
        })
      }
      continue
    }

    const nodeToken = parseNodeToken(trimmed)
    if (nodeToken) {
      upsertNode(nodes, nodeToken, groupStack.at(-1), lineNumber)
    } else {
      warnings.push(`Line ${lineNumber}: skipped unsupported flowchart statement.`)
    }
  }

  return {
    diagramType: header.type,
    direction: header.direction,
    nodes: [...nodes.values()],
    edges,
    groups: [...groups.values()],
    warnings,
    rawLines,
  }
}

function parseHeader(line: string):
  | { type: 'flowchart' | 'graph'; direction: MermaidDirection }
  | undefined {
  const match = line.trim().match(/^(flowchart|graph)\s+([A-Za-z]{2})\b/i)
  if (!match) {
    return undefined
  }
  const direction = match[2].toUpperCase() as MermaidDirection
  return {
    type: match[1].toLowerCase() as 'flowchart' | 'graph',
    direction: SUPPORTED_DIRECTIONS.has(direction) ? direction : DEFAULT_DIRECTION,
  }
}

function stripLineTerminator(line: string): string {
  return line.endsWith(';') ? line.slice(0, -1) : line
}

function parseSubgraphToken(raw: string): NodeToken | undefined {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    const label = cleanLabel(trimmed)
    return {
      id: slugify(label),
      label,
    }
  }

  return parseNodeToken(trimmed)
}

function parseEdgeChain(line: string):
  | Array<{ source: NodeToken; edge: EdgeToken; target: NodeToken }>
  | undefined {
  const parts: Array<{ type: 'node' | 'edge'; text: string }> = []
  let cursor = 0

  while (cursor < line.length) {
    const connector = findNextConnector(line, cursor)
    if (!connector) {
      break
    }

    const nodeText = line.slice(cursor, connector.start).trim()
    if (nodeText === '') {
      return undefined
    }
    parts.push({ type: 'node', text: nodeText })
    parts.push({ type: 'edge', text: connector.text })
    cursor = connector.end
  }

  if (parts.length === 0) {
    return undefined
  }

  const finalNode = line.slice(cursor).trim()
  if (finalNode === '') {
    return undefined
  }
  parts.push({ type: 'node', text: finalNode })

  const segments: Array<{ source: NodeToken; edge: EdgeToken; target: NodeToken }> = []
  for (let index = 0; index < parts.length - 2; index += 2) {
    const source = parseNodeToken(parts[index].text)
    const edge = parseEdgeToken(parts[index + 1].text)
    const target = parseNodeToken(parts[index + 2].text)

    if (!source || !edge || !target) {
      return undefined
    }
    segments.push({ source, edge, target })
  }

  return segments.length > 0 ? segments : undefined
}

function findNextConnector(
  line: string,
  start: number,
): { start: number; end: number; text: string } | undefined {
  let quote: string | undefined
  let squareDepth = 0
  let parenDepth = 0
  let braceDepth = 0

  for (let index = start; index < line.length; index += 1) {
    const char = line[index]
    const previous = line[index - 1]

    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? undefined : quote ?? char
      continue
    }

    if (quote) {
      continue
    }

    if (char === '[') squareDepth += 1
    if (char === ']') squareDepth = Math.max(0, squareDepth - 1)
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1)
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)

    if (squareDepth > 0 || parenDepth > 0 || braceDepth > 0) {
      continue
    }

    const connector = readConnector(line, index)
    if (connector) {
      return {
        start: index,
        end: connector.end,
        text: line.slice(index, connector.end).trim(),
      }
    }
  }

  return undefined
}

function readConnector(
  line: string,
  start: number,
): { end: number } | undefined {
  const rest = line.slice(start)
  const direct = [
    '-.->',
    '-->',
    '==>',
    '---',
    '===',
    '--x',
    'x--',
    '--o',
    'o--',
  ].find((token) => rest.startsWith(token))

  if (direct) {
    let end = start + direct.length
    if (line[end] === '|') {
      const labelEnd = line.indexOf('|', end + 1)
      if (labelEnd > end) {
        end = labelEnd + 1
      }
    }
    return { end }
  }

  if (rest.startsWith('--')) {
    const arrowEnd = line.indexOf('-->', start + 2)
    const solidEnd = line.indexOf('---', start + 2)
    const end = firstPositive([arrowEnd, solidEnd])
    if (end !== undefined) {
      return { end: end + 3 }
    }
  }

  if (rest.startsWith('==')) {
    const arrowEnd = line.indexOf('==>', start + 2)
    const solidEnd = line.indexOf('===', start + 2)
    const end = firstPositive([arrowEnd, solidEnd])
    if (end !== undefined) {
      return { end: end + 3 }
    }
  }

  if (rest.startsWith('-.')) {
    const arrowEnd = line.indexOf('.->', start + 2)
    if (arrowEnd >= 0) {
      return { end: arrowEnd + 3 }
    }
  }

  return undefined
}

function firstPositive(values: number[]): number | undefined {
  const found = values.filter((value) => value >= 0).sort((a, b) => a - b)[0]
  return found === undefined ? undefined : found
}

function parseEdgeToken(raw: string): EdgeToken | undefined {
  const text = raw.trim()
  if (text === '') {
    return undefined
  }

  const pipeLabel = text.match(/\|([^|]+)\|/)
  const textLabel =
    pipeLabel?.[1] ??
    text.match(/^--\s*(.*?)\s*--?>$/)?.[1] ??
    text.match(/^==\s*(.*?)\s*==>$/)?.[1] ??
    text.match(/^-\.\s*(.*?)\s*\.->$/)?.[1]

  return {
    text,
    kind: normalizeEdgeKind(text),
    label: textLabel?.trim() || undefined,
  }
}

function normalizeEdgeKind(text: string): string {
  if (text.includes('-.')) return '-.->'
  if (text.includes('==')) return '==>'
  if (/(^|-)x|x(-|$)/.test(text)) return '--x'
  if (/(^|-)o|o(-|$)/.test(text)) return '--o'
  if (text.includes('---') && !text.includes('>')) return '---'
  return '-->'
}

function parseNodeToken(raw: string): NodeToken | undefined {
  const token = raw.trim().replace(/,$/, '')
  if (token === '') {
    return undefined
  }

  let id: string
  let rest: string

  if (token.startsWith('"') || token.startsWith("'")) {
    const quote = token[0]
    const end = findClosingQuote(token, quote)
    if (end < 1) {
      return undefined
    }
    id = token.slice(1, end)
    rest = token.slice(end + 1).trim()
  } else {
    const match = token.match(/^([^\s[\](){},;]+)/)
    if (!match) {
      return undefined
    }
    id = match[1]
    rest = token.slice(match[0].length).trim()
  }

  if (!id) {
    return undefined
  }

  return {
    id: unquote(id),
    label: rest ? cleanLabel(rest) : unquote(id),
  }
}

function findClosingQuote(token: string, quote: string): number {
  for (let index = 1; index < token.length; index += 1) {
    if (token[index] === quote && token[index - 1] !== '\\') {
      return index
    }
  }
  return -1
}

function cleanLabel(raw: string): string {
  let label = raw.trim()

  while (
    (label.startsWith('[') && label.endsWith(']')) ||
    (label.startsWith('(') && label.endsWith(')')) ||
    (label.startsWith('{') && label.endsWith('}'))
  ) {
    label = label.slice(1, -1).trim()
  }

  if (
    (label.startsWith('"') && label.endsWith('"')) ||
    (label.startsWith("'") && label.endsWith("'")) ||
    (label.startsWith('/') && label.endsWith('/')) ||
    (label.startsWith('\\') && label.endsWith('\\'))
  ) {
    label = label.slice(1, -1).trim()
  }

  return unquote(label)
}

function unquote(value: string): string {
  return value.trim().replace(/\\"/g, '"').replace(/\\'/g, "'")
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'group'
}

function upsertNode(
  nodes: Map<string, ParsedNode>,
  token: NodeToken,
  groupId: string | undefined,
  lineNumber: number,
): ParsedNode {
  const existing = nodes.get(token.id)
  if (existing) {
    if (existing.label === existing.id && token.label !== token.id) {
      existing.label = token.label
    }
    if (!existing.groupId && groupId) {
      existing.groupId = groupId
    }
    if (!existing.rawLines.includes(lineNumber)) {
      existing.rawLines.push(lineNumber)
    }
    return existing
  }

  const node: ParsedNode = {
    id: token.id,
    label: token.label,
    groupId,
    rawLines: [lineNumber],
  }
  nodes.set(node.id, node)
  return node
}

function createEdgeId(
  source: string,
  target: string,
  kind: string,
  lineNumber: number,
  edges: ParsedEdge[],
): string {
  const baseId = `${source}${kind}${target}:${lineNumber}`
  if (!edges.some((edge) => edge.id === baseId)) {
    return baseId
  }

  let suffix = 2
  while (edges.some((edge) => edge.id === `${baseId}:${suffix}`)) {
    suffix += 1
  }
  return `${baseId}:${suffix}`
}
