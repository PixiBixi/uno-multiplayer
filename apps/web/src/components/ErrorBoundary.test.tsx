import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary.js'

const Boom = (): never => {
  throw new Error('the table exploded')
}

/* React writes the caught error to console.error itself, on top of the boundary's
   own log. Silencing keeps the run readable without hiding a real failure: the
   assertions below are what decide whether this passes. */
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>the table</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('the table')).toBeTruthy()
  })

  it('replaces a thrown render with an explanation rather than a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/stopped working/i)
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })

  it('says the seat is still held, because it is', () => {
    // The server owns the state and the session token outlives the page, so a
    // reload really does rejoin rather than start over.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/seat is still held/i)).toBeTruthy()
  })

  it('shows the game code, read from the address bar', () => {
    /* Game state is exactly what cannot be trusted once a render has thrown, so
       the code comes from the URL the lobby wrote. */
    window.history.replaceState(null, '', '/?room=K7QM2X')
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('K7QM2X')).toBeTruthy()
  })

  it('leaves out the code when the address has none', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.queryByText(/game code/i)).toBeNull()
  })
})
