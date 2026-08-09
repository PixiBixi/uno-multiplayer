import { buildDeck, cardPoints, type Card, type CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CardValues } from './CardValues.js'

/* Every expectation here is computed from the engine, never written out. A test
   that hardcodes 20 passes just as happily when the help and the scoring have
   drifted apart, which is the one failure this component exists to prevent. */
const card = (partial: Omit<Card, 'id'> | Card): Card => ({ ...partial, id: 'x' as CardId }) as Card

const valueFor = (label: string): string | undefined =>
  screen.getByText(label).parentElement?.querySelector('dd')?.textContent ?? undefined

describe('CardValues', () => {
  it('is readable without opening anything', () => {
    // It was a disclosure first, which meant a click and a scroll to read six
    // numbers on a screen that had room to spare.
    render(<CardValues />)
    expect(screen.getByText(/win a round and you score/i)).toBeTruthy()
    expect(document.querySelector('details')).toBeNull()
  })

  it('is a landmark with a name, so it can be skipped to and skipped over', () => {
    render(<CardValues />)
    const region = screen.getByRole('complementary', { name: /what the cards are worth/i })
    expect(region).toBeTruthy()
  })

  it('shows the engine’s value for each action card', () => {
    render(<CardValues />)

    const expected = [
      { label: 'Skip', card: card({ kind: 'skip', color: 'G' }) },
      { label: 'Reverse', card: card({ kind: 'reverse', color: 'B' }) },
      { label: 'Draw Two', card: card({ kind: 'draw2', color: 'Y' }) },
      { label: 'Wild', card: card({ kind: 'wild' }) },
      { label: 'Wild Draw Four', card: card({ kind: 'wild4' }) },
    ]

    for (const row of expected) {
      expect(valueFor(row.label)).toBe(String(cardPoints(row.card)))
    }
  })

  it('describes number cards by the range the engine actually produces', () => {
    render(<CardValues />)
    const low = cardPoints(card({ kind: 'number', color: 'R', value: 0 }))
    const high = cardPoints(card({ kind: 'number', color: 'R', value: 9 }))

    const row = valueFor('Number cards')
    expect(row).toContain(String(low))
    expect(row).toContain(String(high))
  })

  it('totals the real deck rather than quoting a remembered number', () => {
    render(<CardValues />)
    const total = buildDeck().reduce((sum, deckCard) => sum + cardPoints(deckCard), 0)
    // Inside a sentence now that the copy is translated, so match on the text
    // rather than expecting the number to be a node of its own.
    expect(screen.getByText(new RegExp(String(total)))).toBeTruthy()
  })

  it('says the losers score nothing, which is the part people get wrong', () => {
    render(<CardValues />)
    expect(screen.getByText(/nobody scores for the cards they were still holding/i)).toBeTruthy()
  })

  it('warns that a target costs more rounds at two players than at four', () => {
    render(<CardValues />)
    expect(screen.getByText(/far more rounds at two players than at four/i)).toBeTruthy()
  })
})
