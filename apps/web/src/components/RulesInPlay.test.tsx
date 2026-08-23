import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RulesInPlay } from './RulesInPlay.js'

/*
 * The strip states every rule and its state, on every table.
 *
 * It showed only the unusual ones first, to keep an ordinary table quiet. That failed for a
 * reason worth keeping in a test: an ordinary table rendered nothing, and nothing looks
 * exactly like a feature that was never deployed - the person who asked for it opened a game
 * and could not tell. Hence the first assertion below, which is the one that would have
 * caught it.
 */

const rules = (over: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...over })

const chips = (): { text: string; on: boolean }[] =>
  [...document.querySelectorAll('.chip-rule')].map((node) => ({
    text: node.textContent ?? '',
    on: node.classList.contains('chip-rule-on'),
  }))

describe('RulesInPlay', () => {
  it('says something on an ordinary table, rather than nothing', () => {
    const { container } = render(<RulesInPlay rules={DEFAULT_TABLE_RULES} />)
    expect(container.firstChild).not.toBeNull()
    expect(chips()).toHaveLength(4)
  })

  it('states all four rules whatever the table', () => {
    render(<RulesInPlay rules={rules({ liar: true, sevenZero: true, jumpIn: true })} />)
    expect(chips()).toHaveLength(4)
  })

  it('marks which are on and which are off', () => {
    render(<RulesInPlay rules={rules({ liar: true, playDrawnCard: false })} />)
    const byState = chips()
    expect(byState.filter((chip) => chip.on)).toHaveLength(1)
    expect(byState.filter((chip) => !chip.on)).toHaveLength(3)
    expect(byState.find((chip) => chip.on)?.text).toMatch(/contre-uno|missed uno/i)
  })

  /*
   * The default table is the one this has to get right, because it is the common case and
   * the one that was invisible before: three house rules off, the official drawn-card rule
   * on.
   */
  it('shows the drawn-card rule as on by default, since it is the official one', () => {
    render(<RulesInPlay rules={DEFAULT_TABLE_RULES} />)
    const drawn = chips().find((chip) => /drawn|piochée/i.test(chip.text))
    expect(drawn?.on).toBe(true)
  })

  it('never leans on colour alone for the state', () => {
    render(<RulesInPlay rules={rules({ liar: true })} />)
    // A screen reader gets the word; the tick beside it is decoration.
    const hidden = [...document.querySelectorAll('.visually-hidden')].map(
      (node) => node.textContent?.trim() ?? '',
    )
    expect(hidden).toHaveLength(4)
    expect(hidden.every((word) => word.length > 0)).toBe(true)
  })

  it('carries a heading, so four chips are not four unexplained words', () => {
    render(<RulesInPlay rules={DEFAULT_TABLE_RULES} />)
    expect(screen.getByText(/^rules$|^règles$/i)).toBeTruthy()
  })
})
