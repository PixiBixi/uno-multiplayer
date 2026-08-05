import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActiveEffect } from '../lib/play-effects.js'
import { PlayEffects } from './PlayEffects.js'

/* Purely presentational now: what to show and for how long is decided by
   useTableEffects, which has its own tests. These cover the drawing. */

describe('PlayEffects', () => {
  it('renders nothing but the layer when no burst is live', () => {
    const { container } = render(<PlayEffects effects={[]} />)
    expect(container.querySelector('.fx-layer')).not.toBeNull()
    expect(container.querySelector('.fx-label')).toBeNull()
  })

  it('labels each card kind the way a player would name it', () => {
    const cases: [ActiveEffect, string][] = [
      [{ key: 'a', kind: 'wild4', color: 'G' }, '+4'],
      [{ key: 'b', kind: 'wild', color: 'Y' }, 'WILD'],
      [{ key: 'c', kind: 'draw2', color: 'B' }, '+2'],
      [{ key: 'd', kind: 'skip', color: 'R' }, 'SKIP'],
      [{ key: 'e', kind: 'reverse', color: 'G' }, 'REVERSE'],
      [{ key: 'f', kind: 'uno' }, 'UNO!'],
    ]
    for (const [effect, label] of cases) {
      const { container, unmount } = render(<PlayEffects effects={[effect]} />)
      expect(container.querySelector('.fx-label')?.textContent).toBe(label)
      unmount()
    }
  })

  it('tints a card burst with the colour it was given', () => {
    const { container } = render(<PlayEffects effects={[{ key: 'a', kind: 'skip', color: 'G' }]} />)
    expect(container.querySelector<HTMLElement>('.fx-label')?.style.color).toBe('var(--green)')
  })

  it('gives wild4 the four-colour pinwheel, since it has no colour of its own', () => {
    const { container } = render(
      <PlayEffects effects={[{ key: 'a', kind: 'wild4', color: 'G' }]} />,
    )
    expect(container.querySelector<HTMLElement>('.fx-flash')?.style.background).toContain(
      'conic-gradient',
    )
  })

  it('falls back to the UNO red for a burst with no colour', () => {
    const { container } = render(<PlayEffects effects={[{ key: 'a', kind: 'uno' }]} />)
    expect(container.querySelector<HTMLElement>('.fx-label')?.style.color).toBe('var(--red)')
  })

  it('marks the uno burst so it can bounce differently from a card landing', () => {
    const { container } = render(<PlayEffects effects={[{ key: 'a', kind: 'uno' }]} />)
    expect(container.querySelector('.fx-label-uno')).not.toBeNull()
  })

  it('does not mark a card burst as a uno burst', () => {
    const { container } = render(
      <PlayEffects effects={[{ key: 'a', kind: 'draw2', color: 'B' }]} />,
    )
    expect(container.querySelector('.fx-label-uno')).toBeNull()
  })

  it('drives each burst with the duration its kind declares', () => {
    const { container } = render(
      <PlayEffects effects={[{ key: 'a', kind: 'wild4', color: 'G' }]} />,
    )
    expect(container.querySelector<HTMLElement>('.fx-label')?.style.animationDuration).toBe('900ms')
  })

  it('draws several live bursts at once', () => {
    const { container } = render(
      <PlayEffects
        effects={[
          { key: 'a', kind: 'skip', color: 'R' },
          { key: 'b', kind: 'uno' },
        ]}
      />,
    )
    expect(container.querySelectorAll('.fx-label')).toHaveLength(2)
  })

  it('renders as a decorative, non-blocking layer', () => {
    const { container } = render(<PlayEffects effects={[]} />)
    expect(container.querySelector('.fx-layer')?.getAttribute('aria-hidden')).toBe('true')
  })
})
