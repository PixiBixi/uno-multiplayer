import { buildDeck, cardPoints, type Card, type CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CardValues } from './CardValues.js'

/* Every expectation here is computed from the engine, never written out. A test
   that hardcodes 20 passes just as happily when the help and the scoring have
   drifted apart, which is the one failure this component exists to prevent. */
const card = (partial: Omit<Card, 'id'> | Card): Card => ({ ...partial, id: 'x' as CardId }) as Card

/* A <details> keeps its content in the DOM when closed — the browser hides it, it
   is not removed — so "collapsed" is a question about the open attribute, not about
   whether the text can be found. */
const helpElement = (): HTMLDetailsElement => {
  const summary = screen.getByText(/what are the cards worth/i)
  const details = summary.closest('details')
  if (details === null) throw new Error('the summary is not inside a details')
  return details
}

const openHelp = async () => {
  render(<CardValues />)
  await userEvent.click(screen.getByText(/what are the cards worth/i))
  return helpElement()
}

describe('CardValues', () => {
  it('starts collapsed, so it never crowds the form above it', () => {
    render(<CardValues />)
    expect(helpElement().open).toBe(false)
  })

  it('opens on the summary', async () => {
    const details = await openHelp()
    expect(details.open).toBe(true)
    expect(screen.getByText(/win a round and you score/i)).toBeTruthy()
  })

  it('shows the engine’s value for each action card', async () => {
    await openHelp()

    const expected = [
      { label: 'Skip', card: card({ kind: 'skip', color: 'G' }) },
      { label: 'Reverse', card: card({ kind: 'reverse', color: 'B' }) },
      { label: 'Draw Two', card: card({ kind: 'draw2', color: 'Y' }) },
      { label: 'Wild', card: card({ kind: 'wild' }) },
      { label: 'Wild Draw Four', card: card({ kind: 'wild4' }) },
    ]

    for (const row of expected) {
      const term = screen.getByText(row.label)
      const value = term.parentElement?.querySelector('dd')?.textContent
      expect(value).toBe(String(cardPoints(row.card)))
    }
  })

  it('describes number cards by the range the engine actually produces', async () => {
    await openHelp()
    const low = cardPoints(card({ kind: 'number', color: 'R', value: 0 }))
    const high = cardPoints(card({ kind: 'number', color: 'R', value: 9 }))

    const row = screen.getByText('Number cards').parentElement?.querySelector('dd')?.textContent
    expect(row).toContain(String(low))
    expect(row).toContain(String(high))
  })

  it('totals the real deck rather than quoting a remembered number', async () => {
    await openHelp()
    const total = buildDeck().reduce((sum, deckCard) => sum + cardPoints(deckCard), 0)
    expect(screen.getByText(String(total))).toBeTruthy()
  })

  it('says the losers score nothing, which is the part people get wrong', async () => {
    await openHelp()
    expect(screen.getByText(/nobody scores for the cards they were still holding/i)).toBeTruthy()
  })
})
