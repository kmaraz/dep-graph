import { describe, expect, it } from 'vitest'
import type { ParsedMermaidGraph } from './mermaidParser'
import { filterGraph, findShortestPath, getNodeNeighborhood } from './graphFilters'

const graph: ParsedMermaidGraph = {
  diagramType: 'flowchart',
  direction: 'LR',
  nodes: [
    { id: 'web', label: 'apps/web', groupId: 'apps', rawLines: [1] },
    { id: 'ui', label: 'libs/ui', groupId: 'libs', rawLines: [2] },
    { id: 'data', label: 'libs/data', groupId: 'libs', rawLines: [3] },
    { id: 'admin', label: 'apps/admin', groupId: 'apps', rawLines: [4] },
    { id: 'auth', label: 'libs/auth', groupId: 'libs', rawLines: [5] },
  ],
  edges: [
    { id: 'web-ui', source: 'web', target: 'ui', kind: '-->', rawLines: [10] },
    { id: 'ui-data', source: 'ui', target: 'data', kind: '-->', rawLines: [11] },
    { id: 'admin-ui', source: 'admin', target: 'ui', kind: '-->', rawLines: [12] },
    { id: 'admin-auth', source: 'admin', target: 'auth', kind: '-->', rawLines: [13] },
    { id: 'auth-data', source: 'auth', target: 'data', kind: '-->', rawLines: [14] },
  ],
  groups: [
    { id: 'apps', label: 'Applications', rawLines: [6] },
    { id: 'libs', label: 'Libraries', rawLines: [7] },
  ],
  warnings: [],
  rawLines: [],
}

describe('getNodeNeighborhood', () => {
  it('returns dependencies, dependents, or both up to the requested depth', () => {
    expect([...getNodeNeighborhood(graph, 'ui', 1, 'dependencies')].sort()).toEqual([
      'data',
      'ui',
    ])
    expect([...getNodeNeighborhood(graph, 'ui', 1, 'dependents')].sort()).toEqual([
      'admin',
      'ui',
      'web',
    ])
    expect([...getNodeNeighborhood(graph, 'admin', 2, 'both')].sort()).toEqual([
      'admin',
      'auth',
      'data',
      'ui',
    ])
  })
})

describe('filterGraph', () => {
  it('combines hidden nodes, search matches, and focus neighborhoods', () => {
    const result = filterGraph(graph, {
      depth: 1,
      focusId: 'admin',
      hiddenNodeIds: new Set(['auth']),
      mode: 'dependencies',
      query: 'lib',
    })

    expect(result.visibleNodes.map((node) => node.id).sort()).toEqual(['ui'])
    expect(result.visibleEdges).toEqual([])
    expect(result.matchedNodeIds).toEqual(new Set(['ui', 'data', 'auth']))
  })
})

describe('findShortestPath', () => {
  it('finds a directed dependency path between two nodes', () => {
    expect(findShortestPath(graph, 'admin', 'data')).toEqual(['admin', 'auth', 'data'])
    expect(findShortestPath(graph, 'data', 'admin')).toEqual([])
  })
})
