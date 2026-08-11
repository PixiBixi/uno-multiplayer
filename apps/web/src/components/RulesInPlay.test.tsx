import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RulesInPlay } from './RulesInPlay.js'

/*
 * The strip answers one question — what is unusual about this table — and the tests are
 * mostly about what it refuses to say. A strip that appears every game with the same
 * contents is noise, and noise is ignored, which is the defect this exists to fix.
 */

const rules = (over: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...over })

const chips = (): string[] =>
  [...document.querySelectorAll('.chip-rule')].map((node) => node.textContent ?? '')

describe('RulesInPlay', () => {
  it('renders nothing on an ordinary table', () => {
    const { container } = render(<RulesInPlay rules={DEFAULT_TABLE_RULES} />)
    // Not an empty strip: on a phone an empty row still costs height the hand needs.
    expect(container.firstChild).toBeNull()
  })

  it('names each house rule that is on', () => {
    render(<RulesInPlay rules={rules({ liar: true, sevenZero: true, jumpIn: true })} />)
    expect(chips()).toHaveLength(3)
  })

  it('names only the ones that are on', () => {
    render(<RulesInPlay rules={rules({ sevenZero: true })} />)
    expect(chips()).toHaveLength(1)
    expect(chips()[0]).toMatch(/seven-zero/i)
  })

  /*
   * The inversion, and the case most likely to be got wrong. Playing a drawn card is the
   * official rule and on by default, so announcing it tells nobody anything — while a table
   * where it is OFF is precisely the unusual one worth naming.
   */
  it('says nothing about the drawn card when the official rule is on', () => {
    const { container } = render(<RulesInPlay rules={rules({ playDrawnCard: true })} />)
    expect(container.firstChild).toBeNull()
  })

  it('names the drawn card when the table has turned it off', () => {
    render(<RulesInPlay rules={rules({ playDrawnCard: false })} />)
    expect(chips()).toHaveLength(1)
    expect(chips()[0]?.toLowerCase()).toContain('turn')
  })

  it('carries a heading, so four chips are not four unexplained words', () => {
    render(<RulesInPlay rules={rules({ liar: true })} />)
    expect(screen.getByText(/this table also plays/i)).toBeTruthy()
  })
})
