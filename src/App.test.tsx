// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { toPng } from 'html-to-image'
import App from './App'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,test'),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async () => ({
      svg: '<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"><path d="M10 10H110" /></svg>',
    })),
  },
}))

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => true),
  })
})

afterEach(() => {
  cleanup()
  vi.mocked(toPng).mockClear()
})

describe('App', () => {
  it('renders the Mermaid dependency graph workspace', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Mermaid dependency graph' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Mermaid diagram source')).toBeInTheDocument()
    expect(screen.getByText('Nodes')).toBeInTheDocument()
    expect(screen.getByText('Edges')).toBeInTheDocument()
    const minimap = screen.getByLabelText('Dependency graph minimap')
    expect(minimap).toBeInTheDocument()
    expect(minimap.closest('[data-testid="rf__minimap"]')).toHaveStyle({
      height: '96px',
      width: '150px',
    })
  })

  it('exports only the graph viewport as PNG', async () => {
    render(<App />)

    fireEvent.click(screen.getByTitle('Export graph PNG'))

    await waitFor(() => expect(toPng).toHaveBeenCalled())

    const [target, options] = vi.mocked(toPng).mock.calls[0]
    expect(target).toHaveClass('react-flow__viewport')
    expect(options).toEqual(
      expect.objectContaining({
        backgroundColor: '#f7f8f4',
        cacheBust: true,
        pixelRatio: 2,
      }),
    )
    expect(options?.style).toEqual(
      expect.objectContaining({
        transform: expect.stringMatching(/^translate\(.+\) scale\(.+\)$/),
      }),
    )
  })

  it('provides zoom controls for the SVG preview', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'SVG' }))

    const previewViewport = screen.getByTestId('svg-preview-viewport')
    await waitFor(() => expect(screen.getByTitle('Zoom in SVG preview')).toBeEnabled())

    expect(previewViewport).toHaveStyle({
      transform: 'translate(0px, 0px) scale(1)',
    })

    fireEvent.click(screen.getByTitle('Zoom in SVG preview'))

    expect(previewViewport).toHaveStyle({
      transform: 'translate(0px, 0px) scale(1.2)',
    })
    expect(screen.getByText('120%')).toBeInTheDocument()
  })

  it('pans the SVG preview by dragging', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: 'SVG' }))

    const previewFrame = screen.getByTestId('svg-preview-frame')
    const previewViewport = screen.getByTestId('svg-preview-viewport')
    await waitFor(() => expect(screen.getByTitle('Zoom in SVG preview')).toBeEnabled())

    fireEvent.pointerDown(previewFrame, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    })
    fireEvent.pointerMove(previewFrame, {
      clientX: 42,
      clientY: 36,
      pointerId: 1,
    })
    fireEvent.pointerUp(previewFrame, {
      clientX: 42,
      clientY: 36,
      pointerId: 1,
    })

    expect(previewViewport).toHaveStyle({
      transform: 'translate(32px, 26px) scale(1)',
    })
  })
})
