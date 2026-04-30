import type { ParsedEdge, ParsedGroup, ParsedMermaidGraph, ParsedNode } from './mermaidParser'

export type FocusMode = 'dependencies' | 'dependents' | 'both'

export interface GraphFilterOptions {
  depth: number
  focusId?: string
  hiddenNodeIds: Set<string>
  mode: FocusMode
  query: string
}

export interface FilteredGraph {
  visibleNodes: ParsedNode[]
  visibleEdges: ParsedEdge[]
  visibleGroups: ParsedGroup[]
  matchedNodeIds: Set<string>
}

export function getNodeNeighborhood(
  graph: ParsedMermaidGraph,
  nodeId: string,
  depth: number,
  mode: FocusMode,
): Set<string> {
  const normalizedDepth = Math.max(0, depth)
  const result = new Set<string>([nodeId])

  if (mode === 'dependencies' || mode === 'both') {
    collectDirectionalNeighborhood(graph, nodeId, normalizedDepth, 'outgoing', result)
  }

  if (mode === 'dependents' || mode === 'both') {
    collectDirectionalNeighborhood(graph, nodeId, normalizedDepth, 'incoming', result)
  }

  return result
}

export function filterGraph(
  graph: ParsedMermaidGraph,
  options: GraphFilterOptions,
): FilteredGraph {
  const query = options.query.trim().toLowerCase()
  const visibleIds = new Set(
    graph.nodes
      .filter((node) => !options.hiddenNodeIds.has(node.id))
      .map((node) => node.id),
  )
  const matchedNodeIds = new Set(
    query
      ? graph.nodes
          .filter((node) => nodeMatchesQuery(graph, node, query))
          .map((node) => node.id)
      : graph.nodes.map((node) => node.id),
  )

  if (options.focusId) {
    const focusedIds = getNodeNeighborhood(
      graph,
      options.focusId,
      options.depth,
      options.mode,
    )
    intersectSet(visibleIds, focusedIds)
  }

  if (query) {
    intersectSet(visibleIds, matchedNodeIds)
  }

  const visibleNodes = graph.nodes.filter((node) => visibleIds.has(node.id))
  const visibleEdges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  )
  const visibleGroupIds = new Set(
    visibleNodes.map((node) => node.groupId).filter(Boolean) as string[],
  )

  return {
    visibleNodes,
    visibleEdges,
    visibleGroups: graph.groups.filter((group) => visibleGroupIds.has(group.id)),
    matchedNodeIds,
  }
}

export function findShortestPath(
  graph: ParsedMermaidGraph,
  startId: string,
  endId: string,
): string[] {
  if (startId === '' || endId === '') {
    return []
  }
  if (startId === endId) {
    return [startId]
  }

  const queue: string[][] = [[startId]]
  const visited = new Set<string>([startId])

  while (queue.length > 0) {
    const path = queue.shift() ?? []
    const current = path.at(-1)
    if (!current) {
      continue
    }

    for (const next of getOutgoingNeighbors(graph, current).sort()) {
      if (visited.has(next)) {
        continue
      }
      const nextPath = [...path, next]
      if (next === endId) {
        return nextPath
      }
      visited.add(next)
      queue.push(nextPath)
    }
  }

  return []
}

function collectDirectionalNeighborhood(
  graph: ParsedMermaidGraph,
  nodeId: string,
  depth: number,
  direction: 'incoming' | 'outgoing',
  result: Set<string>,
): void {
  let frontier = new Set<string>([nodeId])

  for (let level = 0; level < depth; level += 1) {
    const nextFrontier = new Set<string>()
    for (const current of frontier) {
      const neighbors =
        direction === 'outgoing'
          ? getOutgoingNeighbors(graph, current)
          : getIncomingNeighbors(graph, current)
      for (const neighbor of neighbors) {
        if (!result.has(neighbor)) {
          result.add(neighbor)
          nextFrontier.add(neighbor)
        }
      }
    }
    frontier = nextFrontier
  }
}

function getOutgoingNeighbors(graph: ParsedMermaidGraph, nodeId: string): string[] {
  return graph.edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.target)
}

function getIncomingNeighbors(graph: ParsedMermaidGraph, nodeId: string): string[] {
  return graph.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source)
}

function nodeMatchesQuery(
  graph: ParsedMermaidGraph,
  node: ParsedNode,
  normalizedQuery: string,
): boolean {
  const group = graph.groups.find((candidate) => candidate.id === node.groupId)
  return [node.id, node.label, group?.label, group?.id]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery))
}

function intersectSet<T>(target: Set<T>, allowed: Set<T>): void {
  for (const value of target) {
    if (!allowed.has(value)) {
      target.delete(value)
    }
  }
}
