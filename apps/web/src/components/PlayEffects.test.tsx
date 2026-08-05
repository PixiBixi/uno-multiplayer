import type { Card, CardId } from '@uno/engine'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EFFECT_DURATION_MS } from '../lib/play-effects.js'
import { PlayEffects } from './PlayEffects.js'

const id = (value: string) => value as CardId
const num = (cardId: string): Card => ({ id: id(cardId), kind: 'number', color: 'R', value: 3 })
const wild4 = (cardId: string): Card => ({ id: id(cardId), kind: 'wild4' })
const skip = (cardId: string): Card => ({ id: id(cardId), kind: 'skip', color: 'G' })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PlayEffects', () => {
  it('bursts for nothing on first paint, even when the top card is already a wild4', () => {
    const { container } = render(<PlayEffects discardTop={wild4('a')} currentColor="R" />)
    expect(container.querySelector('.fx-label')).toBeNull()
  })

  it('bursts when a new wild4 lands on the pile', () => {
    const { container, rerender } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    rerender(<PlayEffects discardTop={wild4('b')} currentColor="Y" />)
    expect(container.querySelector('.fx-label')?.textContent).toBe('+4')
  })

  it('colours the burst with the view’s own post-move colour', () => {
    const { container, rerender } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    rerender(<PlayEffects discardTop={skip('b')} currentColor="G" />)
    expect(container.querySelector<HTMLElement>('.fx-label')?.style.color).toBe('var(--green)')
  })

  it('does nothing for a plain number card', () => {
    const { container, rerender } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    rerender(<PlayEffects discardTop={num('b')} currentColor="R" />)
    expect(container.querySelector('.fx-label')).toBeNull()
  })

  it('does not re-fire while the same top card stays up, such as after a draw', () => {
    const { container, rerender } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    rerender(<PlayEffects discardTop={wild4('b')} currentColor="R" />)
    rerender(<PlayEffects discardTop={wild4('b')} currentColor="R" />)
    expect(container.querySelectorAll('.fx-label')).toHaveLength(1)
  })

  it('clears the burst once its duration elapses', () => {
    const { container, rerender } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    rerender(<PlayEffects discardTop={wild4('b')} currentColor="R" />)
    expect(container.querySelector('.fx-label')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(EFFECT_DURATION_MS.wild4 + 10)
    })
    expect(container.querySelector('.fx-label')).toBeNull()
  })

  it('reports shaking only while a wild4 burst is live', () => {
    const onShake = vi.fn()
    const { rerender } = render(
      <PlayEffects discardTop={num('a')} currentColor="R" onShake={onShake} />,
    )
    onShake.mockClear()
    rerender(<PlayEffects discardTop={wild4('b')} currentColor="R" onShake={onShake} />)
    expect(onShake).toHaveBeenLastCalledWith(true)
    act(() => {
      vi.advanceTimersByTime(EFFECT_DURATION_MS.wild4 + 10)
    })
    expect(onShake).toHaveBeenLastCalledWith(false)
  })

  it('does not shake for a lesser card such as skip', () => {
    const onShake = vi.fn()
    const { rerender } = render(
      <PlayEffects discardTop={num('a')} currentColor="R" onShake={onShake} />,
    )
    onShake.mockClear()
    rerender(<PlayEffects discardTop={skip('b')} currentColor="G" onShake={onShake} />)
    expect(onShake).not.toHaveBeenCalledWith(true)
  })

  it('renders as a decorative, non-blocking layer', () => {
    const { container } = render(<PlayEffects discardTop={num('a')} currentColor="R" />)
    expect(container.querySelector('.fx-layer')?.getAttribute('aria-hidden')).toBe('true')
  })
})
