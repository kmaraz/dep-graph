// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { toPng } from 'html-to-image'
import App from './App'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,test'),
}))

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
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
})
