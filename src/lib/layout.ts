import dagre from 'dagre'
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { FilteredGraph } from './graphFilters'
import type { ParsedMermaidGraph } from './mermaidParser'

export interface DependencyNodeData extends Record<string, unknown> {
  dependencyCount: number
  dependentCount: number
  groupLabel?: string
  label: string
  matched: boolean
  nodeId: string
  path: boolean
  rawLines: number[]
}

export interface DependencyEdgeData extends Record<string, unknown> {
  label?: string
  orientation: 'horizontal' | 'vertical'
  path: boolean
  rawLines: number[]
  routeOffset: number
  sourceOffset: number
  targetOffset: number
}

const NODE_WIDTH = 218
const NODE_HEIGHT = 88

export function layoutDependencyGraph(
  graph: ParsedMermaidGraph,
  filtered: FilteredGraph,
  matchedNodeIds: Set<string>,
  pathNodeIds: Set<string>,
  pathEdgeIds: Set<string>,
): {
  nodes: Array<Node<DependencyNodeData>>
  edges: Array<Edge<DependencyEdgeData>>
} {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    align: 'UL',
    marginx: 44,
    marginy: 44,
    nodesep: 54,
    rankdir: normalizeRankDirection(graph.direction),
    ranksep: 86,
  })

  for (const node of filtered.visibleNodes) {
    dagreGraph.setNode(node.id, { height: NODE_HEIGHT, width: NODE_WIDTH })
  }

  for (const edge of filtered.visibleEdges) {
    dagreGraph.setEdge(edge.source, edge.target)
  }

  dagre.layout(dagreGraph)

  const groupsById = new Map(graph.groups.map((group) => [group.id, group]))
  const incomingCounts = countEdges(graph, 'target')
  const outgoingCounts = countEdges(graph, 'source')
  const nodeCenters = new Map<string, { x: number; y: number }>()

  const nodes = filtered.visibleNodes.map<Node<DependencyNodeData>>((node) => {
    const position = dagreGraph.node(node.id) as { x: number; y: number } | undefined
    const group = node.groupId ? groupsById.get(node.groupId) : undefined
    nodeCenters.set(node.id, {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
    })

    return {
      id: node.id,
      type: 'dependency',
      position: {
        x: (position?.x ?? 0) - NODE_WIDTH / 2,
        y: (position?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        dependencyCount: outgoingCounts.get(node.id) ?? 0,
        dependentCount: incomingCounts.get(node.id) ?? 0,
        groupLabel: group?.label,
        label: node.label,
        matched: matchedNodeIds.has(node.id),
        nodeId: node.id,
        path: pathNodeIds.has(node.id),
        rawLines: node.rawLines,
      },
      className: [
        'dependency-node',
        matchedNodeIds.has(node.id) ? 'is-match' : '',
        pathNodeIds.has(node.id) ? 'is-path' : '',
      ]
        .filter(Boolean)
        .join(' '),
      style: {
        height: NODE_HEIGHT,
        width: NODE_WIDTH,
      },
      initialHeight: NODE_HEIGHT,
      initialWidth: NODE_WIDTH,
      sourcePosition: graph.direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: graph.direction === 'LR' ? Position.Left : Position.Top,
    }
  })

  const anchorOffsets = computeAnchorOffsets(filtered.visibleEdges, nodeCenters)

  const edges = filtered.visibleEdges.map<Edge<DependencyEdgeData>>((edge) => {
    const sourceCenter = nodeCenters.get(edge.source)
    const targetCenter = nodeCenters.get(edge.target)
    const orientation = isHorizontalEdge(sourceCenter, targetCenter)
      ? 'horizontal'
      : 'vertical'
    const offsets = anchorOffsets.get(edge.id) ?? {
      routeOffset: 0,
      sourceOffset: 0,
      targetOffset: 0,
    }
    const isPath = pathEdgeIds.has(edge.id)
    const edgeColor = isPath ? '#c2410c' : '#59636b'

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: isPath,
      className: isPath ? 'is-path' : undefined,
      data: {
        label: edge.label,
        orientation,
        path: isPath,
        rawLines: edge.rawLines,
        routeOffset: offsets.routeOffset,
        sourceOffset: offsets.sourceOffset,
        targetOffset: offsets.targetOffset,
      },
      label: edge.label,
      markerEnd: {
        color: edgeColor,
        height: 16,
        type: MarkerType.ArrowClosed,
        width: 16,
      },
      style: {
        stroke: edgeColor,
        strokeWidth: isPath ? 3 : 1.8,
      },
      type: 'readableDependency',
    }
  })

  return { nodes, edges }
}

function computeAnchorOffsets(
  edges: FilteredGraph['visibleEdges'],
  nodeCenters: Map<string, { x: number; y: number }>,
): Map<string, { routeOffset: number; sourceOffset: number; targetOffset: number }> {
  const offsets = new Map<
    string,
    { routeOffset: number; sourceOffset: number; targetOffset: number }
  >()

  assignEndpointOffsets(
    groupEdges(edges, 'source'),
    nodeCenters,
    'sourceOffset',
    offsets,
  )
  assignEndpointOffsets(
    groupEdges(edges, 'target'),
    nodeCenters,
    'targetOffset',
    offsets,
  )

  for (const edge of edges) {
    const current = offsets.get(edge.id) ?? {
      routeOffset: 0,
      sourceOffset: 0,
      targetOffset: 0,
    }
    current.routeOffset = Math.round((current.sourceOffset + current.targetOffset) / 2)
    offsets.set(edge.id, current)
  }

  return offsets
}

function groupEdges(
  edges: FilteredGraph['visibleEdges'],
  side: 'source' | 'target',
): Map<string, FilteredGraph['visibleEdges']> {
  const grouped = new Map<string, FilteredGraph['visibleEdges']>()
  for (const edge of edges) {
    grouped.set(edge[side], [...(grouped.get(edge[side]) ?? []), edge])
  }
  return grouped
}

function assignEndpointOffsets(
  groupedEdges: Map<string, FilteredGraph['visibleEdges']>,
  nodeCenters: Map<string, { x: number; y: number }>,
  offsetKey: 'sourceOffset' | 'targetOffset',
  offsets: Map<string, { routeOffset: number; sourceOffset: number; targetOffset: number }>,
): void {
  for (const edges of groupedEdges.values()) {
    if (edges.length < 2) {
      continue
    }

    const sorted = [...edges].sort((a, b) => {
      const aOther = nodeCenters.get(offsetKey === 'sourceOffset' ? a.target : a.source)
      const bOther = nodeCenters.get(offsetKey === 'sourceOffset' ? b.target : b.source)
      return (aOther?.y ?? 0) - (bOther?.y ?? 0) || (aOther?.x ?? 0) - (bOther?.x ?? 0)
    })

    const step = Math.min(28, Math.max(14, NODE_HEIGHT / (sorted.length + 1)))
    const centerIndex = (sorted.length - 1) / 2

    for (const [index, edge] of sorted.entries()) {
      const current = offsets.get(edge.id) ?? {
        routeOffset: 0,
        sourceOffset: 0,
        targetOffset: 0,
      }
      current[offsetKey] = Math.round((index - centerIndex) * step)
      offsets.set(edge.id, current)
    }
  }
}

function isHorizontalEdge(
  sourceCenter: { x: number; y: number } | undefined,
  targetCenter: { x: number; y: number } | undefined,
): boolean {
  if (!sourceCenter || !targetCenter) {
    return true
  }

  return Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y)
}

function normalizeRankDirection(direction: string): 'TB' | 'BT' | 'LR' | 'RL' {
  return direction === 'TD' ? 'TB' : (direction as 'TB' | 'BT' | 'LR' | 'RL')
}

function countEdges(
  graph: ParsedMermaidGraph,
  side: 'source' | 'target',
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const edge of graph.edges) {
    counts.set(edge[side], (counts.get(edge[side]) ?? 0) + 1)
  }
  return counts
}
