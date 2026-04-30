import { describe, expect, it } from 'vitest'
import { parseMermaidFlowchart } from './mermaidParser'

const sampleDiagram = `flowchart LR
  subgraph apps [Applications]
    web[apps/web]
    admin["apps/admin"]
  end

  subgraph libs [Shared libraries]
    ui[libs/ui]
    data[(libs/data-access)]
  end

  web -->|imports| ui
  web --> data
  admin -.-> ui
  ui --> data
`

describe('parseMermaidFlowchart', () => {
  it('extracts nodes, groups, edges, labels, and source line references', () => {
    const graph = parseMermaidFlowchart(sampleDiagram)

    expect(graph.diagramType).toBe('flowchart')
    expect(graph.direction).toBe('LR')
    expect(graph.groups).toEqual([
      {
        id: 'apps',
        label: 'Applications',
        parentId: undefined,
        rawLines: [2],
      },
      {
        id: 'libs',
        label: 'Shared libraries',
        parentId: undefined,
        rawLines: [7],
      },
    ])
    expect(graph.nodes).toEqual([
      {
        id: 'web',
        label: 'apps/web',
        groupId: 'apps',
        rawLines: [3, 12, 13],
      },
      {
        id: 'admin',
        label: 'apps/admin',
        groupId: 'apps',
        rawLines: [4, 14],
      },
      {
        id: 'ui',
        label: 'libs/ui',
        groupId: 'libs',
        rawLines: [8, 12, 14, 15],
      },
      {
        id: 'data',
        label: 'libs/data-access',
        groupId: 'libs',
        rawLines: [9, 13, 15],
      },
    ])
    expect(graph.edges).toEqual([
      {
        id: 'web-->ui:12',
        source: 'web',
        target: 'ui',
        label: 'imports',
        kind: '-->',
        rawLines: [12],
      },
      {
        id: 'web-->data:13',
        source: 'web',
        target: 'data',
        label: undefined,
        kind: '-->',
        rawLines: [13],
      },
      {
        id: 'admin-.->ui:14',
        source: 'admin',
        target: 'ui',
        label: undefined,
        kind: '-.->',
        rawLines: [14],
      },
      {
        id: 'ui-->data:15',
        source: 'ui',
        target: 'data',
        label: undefined,
        kind: '-->',
        rawLines: [15],
      },
    ])
    expect(graph.warnings).toEqual([])
  })

  it('parses chained edges and quoted ids used by package names', () => {
    const graph = parseMermaidFlowchart(`graph TD
  "@scope/web"[Web shell] --> "@scope/ui"[UI kit] --> "@scope/tokens"[Design tokens]
`)

    expect(graph.nodes.map((node) => node.id)).toEqual([
      '@scope/web',
      '@scope/ui',
      '@scope/tokens',
    ])
    expect(graph.nodes.map((node) => node.label)).toEqual([
      'Web shell',
      'UI kit',
      'Design tokens',
    ])
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['@scope/web', '@scope/ui'],
      ['@scope/ui', '@scope/tokens'],
    ])
  })

  it('marks unsupported Mermaid diagram types without throwing', () => {
    const graph = parseMermaidFlowchart(`sequenceDiagram
  participant A
  participant B
  A->>B: hello
`)

    expect(graph.diagramType).toBe('unsupported')
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.warnings[0]).toContain('Only Mermaid flowchart/graph diagrams')
  })
})
