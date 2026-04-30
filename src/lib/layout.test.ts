import { describe, expect, it } from 'vitest'
import { filterGraph } from './graphFilters'
import { layoutDependencyGraph } from './layout'
import type { ParsedMermaidGraph } from './mermaidParser'

const graph: ParsedMermaidGraph = {
  diagramType: 'flowchart',
  direction: 'LR',
  nodes: [
    { id: 'web', label: 'apps/web', groupId: 'apps', rawLines: [1] },
    { id: 'shell', label: 'libs/shell', groupId: 'libs', rawLines: [2] },
    { id: 'ui', label: 'libs/ui', groupId: 'libs', rawLines: [3] },
  ],
  edges: [
    { id: 'web-shell', source: 'web', target: 'shell', kind: '-->', rawLines: [10] },
    { id: 'web-ui', source: 'web', target: 'ui', kind: '-->', rawLines: [11] },
  ],
  groups: [
    { id: 'apps', label: 'Applications', rawLines: [4] },
    { id: 'libs', label: 'Libraries', rawLines: [5] },
  ],
  warnings: [],
  rawLines: [],
}

describe('layoutDependencyGraph', () => {
  it('uses readable curved edges with separated anchors for shared source nodes', () => {
    const filtered = filterGraph(graph, {
      depth: 1,
      hiddenNodeIds: new Set(),
      mode: 'both',
      query: '',
    })

    const { edges } = layoutDependencyGraph(
      graph,
      filtered,
      new Set(graph.nodes.map((node) => node.id)),
      new Set(),
      new Set(),
    )

    expect(edges.map((edge) => edge.type)).toEqual([
      'readableDependency',
      'readableDependency',
    ])
    expect(edges.map((edge) => edge.data?.orientation)).toEqual([
      'horizontal',
      'horizontal',
    ])
    expect(edges[0].data?.sourceOffset).not.toBe(edges[1].data?.sourceOffset)
  })

  it('sets inline stroke styles on edges so PNG export keeps connections visible', () => {
    const filtered = filterGraph(graph, {
      depth: 1,
      hiddenNodeIds: new Set(),
      mode: 'both',
      query: '',
    })

    const { edges } = layoutDependencyGraph(
      graph,
      filtered,
      new Set(graph.nodes.map((node) => node.id)),
      new Set(),
      new Set(),
    )

    expect(edges[0].style).toMatchObject({
      stroke: '#59636b',
      strokeWidth: 1.8,
    })
  })
})
