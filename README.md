# Mermaid Dependency Graph

Nx dependency graph-style viewer for Mermaid flowchart diagrams.

Published at `https://www.maraz.sk/dep-graph/`.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Commands

```bash
npm test
npm run lint
npm run build
```

## Deployment

Pushes to `main` deploy the Vite build from `dist/` to GitHub Pages using
GitHub Actions.

## Features

- Mermaid `flowchart` / `graph` source editor with file import.
- React Flow dependency canvas with pan, zoom, controls, and minimap.
- Search filtering by node id, node label, or group label.
- Focus mode by node with dependency depth and direction controls.
- Directed path tracing between two nodes.
- Node and edge inspector with raw Mermaid source lines.
- Hide/reveal nodes.
- Export parsed graph JSON, graph PNG, and Mermaid SVG preview.

## Scope

The semantic graph parser supports Mermaid flowchart dependency diagrams. Other
Mermaid diagram types are rendered in the SVG preview but are not converted into
an interactive dependency model.

This is deliberate: Mermaid exposes stable browser APIs for validation and SVG
rendering, not a stable public graph AST for every diagram type.

## Implementation Notes

- `src/lib/mermaidParser.ts` extracts a focused dependency model from flowchart
  source.
- `src/lib/graphFilters.ts` handles focus neighborhoods, filtering, and path
  tracing.
- `src/lib/layout.ts` converts the parsed graph to React Flow nodes and edges
  using Dagre.
- `src/App.tsx` owns the editor, controls, React Flow canvas, inspector, Mermaid
  preview, and exports.

## Research Sources

- Nx graph UX: https://nx.dev/docs/features/explore-graph
- Nx graph CLI options: https://nx.dev/docs/reference/nx-commands
- Mermaid browser usage: https://mermaid.js.org/config/usage.html
- React Flow viewport controls: https://reactflow.dev/learn/concepts/the-viewport
- React Flow MiniMap: https://reactflow.dev/api-reference/components/minimap
