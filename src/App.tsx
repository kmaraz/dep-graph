import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MiniMap,
  Panel,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'
import { toPng } from 'html-to-image'
import {
  CircleSlash,
  Crosshair,
  Download,
  Eye,
  FileCode2,
  FilterX,
  GitBranch,
  ImageDown,
  LocateFixed,
  Route,
  Search,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import './App.css'
import { exampleDiagram } from './lib/exampleDiagram'
import {
  filterGraph,
  findShortestPath,
  type FocusMode,
} from './lib/graphFilters'
import {
  type DependencyEdgeData,
  type DependencyNodeData,
  layoutDependencyGraph,
} from './lib/layout'
import { parseMermaidFlowchart, type ParsedEdge, type ParsedNode } from './lib/mermaidParser'

const nodeTypes = {
  dependency: DependencyNode,
}

const edgeTypes = {
  readableDependency: ReadableDependencyEdge,
}

const EXPORT_PADDING = 48
const EXPORT_MIN_HEIGHT = 520
const EXPORT_MIN_WIDTH = 960
const PREVIEW_MAX_ZOOM = 4
const PREVIEW_MIN_ZOOM = 0.25
const PREVIEW_ZOOM_STEP = 0.2

type SelectedElement =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | undefined

type PreviewState =
  | { status: 'rendering'; svg: string; error?: undefined }
  | { status: 'ready'; svg: string; error?: undefined }
  | { status: 'error'; svg: string; error: string }

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  flowchart: {
    htmlLabels: false,
    useMaxWidth: false,
  },
  theme: 'base',
  themeVariables: {
    background: '#f7f8f4',
    lineColor: '#59636b',
    primaryBorderColor: '#3c454d',
    primaryColor: '#f5f7ef',
    primaryTextColor: '#162026',
    tertiaryColor: '#e8eee6',
  },
})

function App() {
  return (
    <ReactFlowProvider>
      <DependencyGraphWorkspace />
    </ReactFlowProvider>
  )
}

function DependencyGraphWorkspace() {
  const graphPaneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewPanStartRef = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0 })
  const { fitView, getNodes, setCenter } = useReactFlow()
  const [source, setSource] = useState(exampleDiagram)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState('')
  const [focusMode, setFocusMode] = useState<FocusMode>('both')
  const [focusDepth, setFocusDepth] = useState(1)
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set())
  const [pathStartId, setPathStartId] = useState('')
  const [pathEndId, setPathEndId] = useState('')
  const [selectedElement, setSelectedElement] = useState<SelectedElement>()
  const [activeView, setActiveView] = useState<'graph' | 'preview'>('graph')
  const [preview, setPreview] = useState<PreviewState>({
    status: 'rendering',
    svg: '',
  })
  const [previewTransform, setPreviewTransform] = useState({
    x: 0,
    y: 0,
    zoom: 1,
  })
  const [isPreviewPanning, setIsPreviewPanning] = useState(false)

  const parsedGraph = useMemo(() => parseMermaidFlowchart(source), [source])
  const selectedNode = useMemo(
    () =>
      selectedElement?.type === 'node'
        ? parsedGraph.nodes.find((node) => node.id === selectedElement.id)
        : undefined,
    [parsedGraph.nodes, selectedElement],
  )
  const selectedEdge = useMemo(
    () =>
      selectedElement?.type === 'edge'
        ? parsedGraph.edges.find((edge) => edge.id === selectedElement.id)
        : undefined,
    [parsedGraph.edges, selectedElement],
  )
  const path = useMemo(
    () => findShortestPath(parsedGraph, pathStartId, pathEndId),
    [parsedGraph, pathEndId, pathStartId],
  )
  const pathNodeIds = useMemo(() => new Set(path), [path])
  const pathEdgeIds = useMemo(
    () => findPathEdgeIds(parsedGraph.edges, path),
    [parsedGraph.edges, path],
  )
  const filteredGraph = useMemo(
    () =>
      filterGraph(parsedGraph, {
        depth: focusDepth,
        focusId: focusId || undefined,
        hiddenNodeIds,
        mode: focusMode,
        query,
      }),
    [focusDepth, focusId, focusMode, hiddenNodeIds, parsedGraph, query],
  )
  const flowElements = useMemo(
    () =>
      layoutDependencyGraph(
        parsedGraph,
        filteredGraph,
        filteredGraph.matchedNodeIds,
        pathNodeIds,
        pathEdgeIds,
      ),
    [filteredGraph, parsedGraph, pathEdgeIds, pathNodeIds],
  )
  const lineLookup = useMemo(
    () => new Map(parsedGraph.rawLines.map((line, index) => [index + 1, line])),
    [parsedGraph.rawLines],
  )

  useEffect(() => {
    const timeoutIds = [0, 90].map((delay) =>
      window.setTimeout(() => {
        fitView({ duration: 0, padding: 0.28 })
      }, delay),
    )

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
  }, [fitView, flowElements.edges.length, flowElements.nodes.length, activeView])

  useEffect(() => {
    let active = true
    const renderPreview = async () => {
      setPreview((current) => ({ status: 'rendering', svg: current.svg }))
      try {
        const parsed = await mermaid.parse(source, { suppressErrors: true })
        if (!parsed) {
          throw new Error('Mermaid syntax validation failed.')
        }
        const renderId = `mermaid-preview-${Date.now()}`
        const { svg } = await mermaid.render(renderId, source)
        if (active) {
          setPreview({ status: 'ready', svg })
        }
      } catch (error) {
        if (active) {
          setPreview({
            status: 'error',
            svg: '',
            error: error instanceof Error ? error.message : 'Mermaid render failed.',
          })
        }
      }
    }

    void renderPreview()
    return () => {
      active = false
    }
  }, [source])

  const nodeOptions = parsedGraph.nodes
  const selectedNodeStats = selectedNode
    ? getNodeStats(parsedGraph.edges, selectedNode.id)
    : undefined

  function updateSource(nextSource: string) {
    setSource(nextSource)
    resetSvgPreview()
  }

  function handleSourceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateSource(String(reader.result ?? ''))
      event.target.value = ''
    }
    reader.readAsText(file)
  }

  function hideSelectedNode() {
    if (!selectedNode) {
      return
    }
    setHiddenNodeIds((current) => new Set([...current, selectedNode.id]))
    setSelectedElement(undefined)
  }

  function revealAllNodes() {
    setHiddenNodeIds(new Set())
  }

  function focusSelectedNode() {
    if (!selectedNode) {
      return
    }
    setFocusId(selectedNode.id)
    setActiveView('graph')
  }

  function centerSelectedNode() {
    if (!selectedNode) {
      fitView({ duration: 220, padding: 0.16 })
      return
    }
    const node = flowElements.nodes.find((candidate) => candidate.id === selectedNode.id)
    if (node) {
      void setCenter(node.position.x + 110, node.position.y + 38, {
        duration: 220,
        zoom: 1.24,
      })
    }
  }

  function exportJson() {
    downloadText(
      'mermaid-dependency-graph.json',
      JSON.stringify(parsedGraph, null, 2),
      'application/json',
    )
  }

  function exportSvg() {
    if (preview.status !== 'ready') {
      return
    }
    downloadText('mermaid-preview.svg', preview.svg, 'image/svg+xml')
  }

  async function exportPng() {
    const target = graphPaneRef.current?.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement | null
    if (!target) {
      return
    }
    const exportNodes = getNodes()
    const bounds = getNodesBounds(exportNodes.length > 0 ? exportNodes : flowElements.nodes)
    const width = Math.ceil(Math.max(bounds.width + EXPORT_PADDING * 2, EXPORT_MIN_WIDTH))
    const height = Math.ceil(Math.max(bounds.height + EXPORT_PADDING * 2, EXPORT_MIN_HEIGHT))
    const viewport = getViewportForBounds(
      bounds,
      width,
      height,
      1,
      1,
      `${EXPORT_PADDING}px`,
    )
    const dataUrl = await toPng(target, {
      backgroundColor: '#f7f8f4',
      cacheBust: true,
      height,
      pixelRatio: 2,
      style: {
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
        width: `${width}px`,
      },
      width,
    })
    downloadUrl('mermaid-dependency-graph.png', dataUrl)
  }

  function zoomSvgPreview(direction: 1 | -1) {
    setPreviewTransform((current) => ({
      ...current,
      zoom: clampPreviewZoom(current.zoom + direction * PREVIEW_ZOOM_STEP),
    }))
  }

  function resetSvgPreview() {
    setPreviewTransform({ x: 0, y: 0, zoom: 1 })
    setIsPreviewPanning(false)
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    zoomSvgPreview(event.deltaY > 0 ? -1 : 1)
  }

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Programmatic pointer events do not always have an active native pointer.
    }
    previewPanStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: previewTransform.x,
      y: previewTransform.y,
    }
    setIsPreviewPanning(true)
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isPreviewPanning) {
      return
    }

    const start = previewPanStartRef.current
    setPreviewTransform((current) => ({
      ...current,
      x: start.x + event.clientX - start.pointerX,
      y: start.y + event.clientY - start.pointerY,
    }))
  }

  function stopPreviewPanning(event: PointerEvent<HTMLDivElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore synthetic pointer events without active capture.
    }
    setIsPreviewPanning(false)
  }

  return (
    <main className="app-shell">
      <section className="source-pane" aria-label="Mermaid source">
        <header className="product-header">
          <div className="mark" aria-hidden="true">
            <GitBranch size={22} />
          </div>
          <div>
            <h1>Mermaid dependency graph</h1>
            <p>Flowchart source, Nx-style exploration.</p>
          </div>
        </header>

        <div className="source-toolbar">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Import
          </button>
          <button type="button" onClick={() => updateSource(exampleDiagram)}>
            <FileCode2 size={16} />
            Example
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".mmd,.mermaid,.txt,.md"
            onChange={handleSourceFile}
          />
        </div>

        <label className="editor-label" htmlFor="diagram-source">
          Mermaid diagram source
        </label>
        <textarea
          id="diagram-source"
          spellCheck={false}
          value={source}
          onChange={(event) => updateSource(event.target.value)}
          wrap="off"
        />

        <div className="status-strip" data-state={preview.status}>
          <span>{parsedGraph.diagramType === 'unsupported' ? 'Preview only' : parsedGraph.direction}</span>
          <span>{preview.status}</span>
        </div>
        {parsedGraph.warnings.length > 0 ? (
          <div className="warning-list">
            {parsedGraph.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="workspace-pane">
        <header className="graph-toolbar">
          <div className="stats-row" aria-label="Graph statistics">
            <Metric label="Nodes" value={parsedGraph.nodes.length} />
            <Metric label="Edges" value={parsedGraph.edges.length} />
            <Metric label="Visible" value={filteredGraph.visibleNodes.length} />
            <Metric label="Hidden" value={hiddenNodeIds.size} />
          </div>

          <div className="view-tabs" role="tablist" aria-label="View">
            <button
              aria-selected={activeView === 'graph'}
              role="tab"
              type="button"
              onClick={() => setActiveView('graph')}
            >
              <GitBranch size={16} />
              Graph
            </button>
            <button
              aria-selected={activeView === 'preview'}
              role="tab"
              type="button"
              onClick={() => setActiveView('preview')}
            >
              <Eye size={16} />
              SVG
            </button>
          </div>
        </header>

        <div className="control-band" aria-label="Graph controls">
          <label className="control-field search-field">
            <span>
              <Search size={15} />
              Search
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="node, group, package"
            />
          </label>

          <label className="control-field">
            <span>
              <Crosshair size={15} />
              Focus
            </span>
            <select value={focusId} onChange={(event) => setFocusId(event.target.value)}>
              <option value="">All nodes</option>
              {nodeOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control-field compact">
            <span>Mode</span>
            <select
              value={focusMode}
              onChange={(event) => setFocusMode(event.target.value as FocusMode)}
            >
              <option value="both">Both</option>
              <option value="dependencies">Deps</option>
              <option value="dependents">Users</option>
            </select>
          </label>

          <label className="control-field depth-field">
            <span>Depth {focusDepth}</span>
            <input
              min={0}
              max={5}
              type="range"
              value={focusDepth}
              onChange={(event) => setFocusDepth(Number(event.target.value))}
            />
          </label>

          <button type="button" onClick={() => setFocusId('')} title="Clear focus">
            <FilterX size={16} />
            Clear
          </button>
        </div>

        <div className="path-band" aria-label="Path tracing controls">
          <span>
            <Route size={15} />
            Path
          </span>
          <select value={pathStartId} onChange={(event) => setPathStartId(event.target.value)}>
            <option value="">Start</option>
            {nodeOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
          <select value={pathEndId} onChange={(event) => setPathEndId(event.target.value)}>
            <option value="">End</option>
            {nodeOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
          <output>{path.length > 0 ? path.join(' -> ') : 'No path selected'}</output>
        </div>

        <div className="graph-stage" ref={graphPaneRef}>
          {activeView === 'graph' ? (
            <ReactFlow
              colorMode="light"
              edges={flowElements.edges}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              nodes={flowElements.nodes}
              edgeTypes={edgeTypes}
              nodeTypes={nodeTypes}
              onEdgeClick={(_, edge) => setSelectedElement({ type: 'edge', id: edge.id })}
              onNodeClick={(_, node) => setSelectedElement({ type: 'node', id: node.id })}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#c6cec7" gap={20} size={1} />
              <Controls position="bottom-left" />
              <MiniMap
                ariaLabel="Dependency graph minimap"
                bgColor="rgba(247, 248, 244, 0.92)"
                maskColor="rgba(22, 32, 38, 0.08)"
                maskStrokeColor="#1d766f"
                maskStrokeWidth={2}
                nodeColor={miniMapNodeColor}
                nodeStrokeColor="#1d766f"
                nodeStrokeWidth={8}
                pannable
                position="top-left"
                style={{ height: 96, width: 150 }}
                zoomable
                zoomStep={1.4}
              />
              <Panel className="export-panel" position="top-right">
                <button type="button" onClick={exportJson} title="Export graph JSON">
                  <Download size={16} />
                  JSON
                </button>
                <button type="button" onClick={exportPng} title="Export graph PNG">
                  <ImageDown size={16} />
                  PNG
                </button>
              </Panel>
            </ReactFlow>
          ) : (
            <div className="preview-pane">
              <div className="preview-toolbar">
                <span>{preview.status === 'error' ? 'Render failed' : 'Mermaid SVG preview'}</span>
                <div className="preview-actions">
                  <button
                    type="button"
                    disabled={preview.status !== 'ready'}
                    onClick={() => zoomSvgPreview(-1)}
                    title="Zoom out SVG preview"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <output>{Math.round(previewTransform.zoom * 100)}%</output>
                  <button
                    type="button"
                    disabled={preview.status !== 'ready'}
                    onClick={() => zoomSvgPreview(1)}
                    title="Zoom in SVG preview"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={preview.status !== 'ready'}
                    onClick={resetSvgPreview}
                    title="Reset SVG pan and zoom"
                  >
                    <LocateFixed size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={preview.status !== 'ready'}
                    onClick={exportSvg}
                    title="Export Mermaid SVG"
                  >
                    <Download size={16} />
                    SVG
                  </button>
                </div>
              </div>
              {preview.status === 'error' ? (
                <pre className="render-error">{preview.error}</pre>
              ) : (
                <div
                  className="svg-frame"
                  data-panning={isPreviewPanning}
                  data-testid="svg-preview-frame"
                  onPointerCancel={stopPreviewPanning}
                  onPointerDown={handlePreviewPointerDown}
                  onPointerLeave={stopPreviewPanning}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={stopPreviewPanning}
                  onWheel={handlePreviewWheel}
                >
                  <div
                    className="svg-viewport"
                    data-testid="svg-preview-viewport"
                    style={{
                      transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.zoom})`,
                    }}
                    dangerouslySetInnerHTML={{ __html: preview.svg }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="inspector-pane" aria-label="Graph inspector">
        <header>
          <h2>Inspector</h2>
          <button type="button" onClick={centerSelectedNode} title="Center selected node">
            <LocateFixed size={16} />
            Center
          </button>
        </header>

        {selectedNode ? (
          <NodeInspector
            lineLookup={lineLookup}
            node={selectedNode}
            stats={selectedNodeStats}
            onFocus={focusSelectedNode}
            onHide={hideSelectedNode}
          />
        ) : selectedEdge ? (
          <EdgeInspector edge={selectedEdge} lineLookup={lineLookup} />
        ) : (
          <div className="empty-inspector">
            <CircleSlash size={20} />
            <span>No selection</span>
          </div>
        )}

        <section className="hidden-section">
          <div className="section-title">
            <span>Hidden nodes</span>
            <button type="button" onClick={revealAllNodes}>
              Reveal all
            </button>
          </div>
          {hiddenNodeIds.size === 0 ? (
            <p>None</p>
          ) : (
            <ul>
              {[...hiddenNodeIds].map((nodeId) => (
                <li key={nodeId}>
                  <button
                    type="button"
                    onClick={() =>
                      setHiddenNodeIds((current) => {
                        const next = new Set(current)
                        next.delete(nodeId)
                        return next
                      })
                    }
                  >
                    {nodeId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function DependencyNode({ data, sourcePosition, targetPosition }: NodeProps<Node<DependencyNodeData>>) {
  return (
    <div className="dependency-node-card">
      <Handle position={targetPosition ?? Position.Left} type="target" />
      <div className="node-meta">
        <span>{data.groupLabel ?? 'Ungrouped'}</span>
        <span>{data.rawLines[0]}</span>
      </div>
      <div className="node-label">{data.label}</div>
      <div className="node-id">{data.nodeId}</div>
      <div className="node-counts">
        <span>{data.dependencyCount} deps</span>
        <span>{data.dependentCount} users</span>
      </div>
      <Handle position={sourcePosition ?? Position.Right} type="source" />
    </div>
  )
}

function ReadableDependencyEdge({
  data,
  id,
  interactionWidth,
  label,
  markerEnd,
  markerStart,
  sourceX,
  sourceY,
  style,
  targetX,
  targetY,
}: EdgeProps<Edge<DependencyEdgeData>>) {
  const orientation = data?.orientation ?? 'horizontal'
  const sourceOffset = data?.sourceOffset ?? 0
  const targetOffset = data?.targetOffset ?? 0
  const routeOffset = data?.routeOffset ?? 0

  const startX = orientation === 'horizontal' ? sourceX : sourceX + sourceOffset
  const startY = orientation === 'horizontal' ? sourceY + sourceOffset : sourceY
  const endX = orientation === 'horizontal' ? targetX : targetX + targetOffset
  const endY = orientation === 'horizontal' ? targetY + targetOffset : targetY
  const distance =
    orientation === 'horizontal'
      ? Math.abs(endX - startX)
      : Math.abs(endY - startY)
  const controlDistance = Math.min(Math.max(distance * 0.42, 86), 260)
  const path =
    orientation === 'horizontal'
      ? `M ${startX},${startY} C ${startX + controlDistance},${startY + routeOffset} ${endX - controlDistance},${endY + routeOffset} ${endX},${endY}`
      : `M ${startX},${startY} C ${startX + routeOffset},${startY + controlDistance} ${endX + routeOffset},${endY - controlDistance} ${endX},${endY}`
  const labelX = (startX + endX) / 2
  const labelY = (startY + endY) / 2 + routeOffset

  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={interactionWidth}
        markerEnd={markerEnd}
        markerStart={markerStart}
        path={path}
        style={style}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

function NodeInspector({
  lineLookup,
  node,
  onFocus,
  onHide,
  stats,
}: {
  lineLookup: Map<number, string>
  node: ParsedNode
  onFocus: () => void
  onHide: () => void
  stats?: { dependencies: number; dependents: number }
}) {
  return (
    <section className="inspector-card">
      <p className="eyebrow">Node</p>
      <h3>{node.label}</h3>
      <dl>
        <div>
          <dt>ID</dt>
          <dd>{node.id}</dd>
        </div>
        <div>
          <dt>Group</dt>
          <dd>{node.groupId ?? 'None'}</dd>
        </div>
        <div>
          <dt>Dependencies</dt>
          <dd>{stats?.dependencies ?? 0}</dd>
        </div>
        <div>
          <dt>Dependents</dt>
          <dd>{stats?.dependents ?? 0}</dd>
        </div>
      </dl>
      <div className="inspector-actions">
        <button type="button" onClick={onFocus}>
          <Crosshair size={16} />
          Focus
        </button>
        <button type="button" onClick={onHide}>
          <CircleSlash size={16} />
          Hide
        </button>
      </div>
      <RawLines lineLookup={lineLookup} lines={node.rawLines} />
    </section>
  )
}

function EdgeInspector({
  edge,
  lineLookup,
}: {
  edge: ParsedEdge
  lineLookup: Map<number, string>
}) {
  return (
    <section className="inspector-card">
      <p className="eyebrow">Edge</p>
      <h3>
        {edge.source}
        {' -> '}
        {edge.target}
      </h3>
      <dl>
        <div>
          <dt>Kind</dt>
          <dd>{edge.kind}</dd>
        </div>
        <div>
          <dt>Label</dt>
          <dd>{edge.label ?? 'None'}</dd>
        </div>
      </dl>
      <RawLines lineLookup={lineLookup} lines={edge.rawLines} />
    </section>
  )
}

function RawLines({
  lineLookup,
  lines,
}: {
  lineLookup: Map<number, string>
  lines: number[]
}) {
  return (
    <div className="raw-lines">
      <span>Source lines</span>
      {lines.map((lineNumber) => (
        <code key={lineNumber}>
          {lineNumber}: {lineLookup.get(lineNumber)?.trim()}
        </code>
      ))}
    </div>
  )
}

function getNodeStats(edges: ParsedEdge[], nodeId: string) {
  return {
    dependencies: edges.filter((edge) => edge.source === nodeId).length,
    dependents: edges.filter((edge) => edge.target === nodeId).length,
  }
}

function findPathEdgeIds(edges: ParsedEdge[], path: string[]): Set<string> {
  const ids = new Set<string>()
  for (let index = 0; index < path.length - 1; index += 1) {
    const edge = edges.find(
      (candidate) => candidate.source === path[index] && candidate.target === path[index + 1],
    )
    if (edge) {
      ids.add(edge.id)
    }
  }
  return ids
}

function miniMapNodeColor(node: Node<DependencyNodeData>): string {
  if (node.data.path) return '#c2410c'
  if (node.data.matched) return '#1d766f'
  return '#3c454d'
}

function clampPreviewZoom(zoom: number): number {
  return Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, zoom))
}

function downloadText(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  downloadUrl(filename, url)
  URL.revokeObjectURL(url)
}

function downloadUrl(filename: string, url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

export default App
