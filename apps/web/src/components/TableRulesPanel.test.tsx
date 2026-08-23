import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CATALOGUES } from '../i18n/index.js'
import { TableRulesPanel } from './TableRulesPanel.js'

/**
 * One component, two modes, and the assertion that keeps them one component.
 *
 * The failure this file exists to catch is a second, read-only copy of the rule list
 * rendered for guests. It would pass every behavioural test on the day it was written and
 * then go stale: a fifth rule added to the host's switches and forgotten in the guest's
 * would leave half the table reading a game nobody is playing, and the type checker cannot
 * see it because both copies are just JSX.
 *
 * What is checkable is that the two modes agree - same rules, same labels, same order -
 * which is exactly the property a drifted copy breaks. A copy that is still
 * character-identical to the original is undetectable behaviourally, and this file does not
 * pretend otherwise; it fails the moment the two part company, which is the moment that
 * matters.
 */

const ALL_OFF: TableRules = { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false }

/** Every rule label the panel rendered, in the order it rendered them. */
const labelsOnScreen = (): string[] =>
  [...document.querySelectorAll('.rule')].map((rule) => {
    /* The name only: the switch's own `<span>`, or the read-only row's first child. Never
       the disclosure, whose accessible name deliberately repeats the rule. */
    const named = rule.querySelector('.switch-row span, .rule-state span')
    return named?.textContent ?? ''
  })

describe('TableRulesPanel', () => {
  it('renders the same rules, in the same order, whether or not this seat may change them', () => {
    const { unmount } = render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} onChange={vi.fn()} />)
    const editable = labelsOnScreen()
    unmount()

    render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} />)
    const readOnly = labelsOnScreen()

    expect(editable).toHaveLength(4)
    // Ordering included: a list a player has read once must not reshuffle on them.
    expect(readOnly).toEqual(editable)
  })

  it('covers every flag the engine has, so a fifth rule cannot be half-added', () => {
    /* Counted against `TableRules` itself rather than against the number four. A flag added
       to the engine and not to this panel is a rule the table plays by and nobody is shown. */
    render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} />)
    expect(labelsOnScreen()).toHaveLength(Object.keys(DEFAULT_TABLE_RULES).length)
  })

  it('takes every label and every explanation from the catalogue', () => {
    render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} onChange={vi.fn()} />)
    const t = CATALOGUES.en
    expect(labelsOnScreen()).toEqual([
      t.config.liar,
      t.config.sevenZero,
      t.config.jumpIn,
      t.config.playDrawnCard,
    ])
    for (const hint of [t.config.liarHint, t.config.sevenZeroHint, t.config.jumpInHint]) {
      expect(screen.getByText(hint)).toBeTruthy()
    }
  })

  it('reports each flag independently in read-only mode', () => {
    render(<TableRulesPanel rules={{ ...ALL_OFF, sevenZero: true }} />)
    const states = [...document.querySelectorAll('.rule-state strong')].map(
      (node) => node.textContent,
    )
    expect(states).toEqual(['off', 'on', 'off', 'off'])
  })

  it('sends the whole rules object when one flag is toggled', () => {
    const onChange = vi.fn()
    render(<TableRulesPanel rules={{ ...ALL_OFF, liar: true }} onChange={onChange} />)
    return userEvent.click(screen.getByRole('checkbox', { name: /jump-in/i })).then(() => {
      /* The server replaces the `rules` field wholesale, so a lone flag would silently
         reset the other three to their defaults. */
      expect(onChange).toHaveBeenCalledWith({ ...ALL_OFF, liar: true, jumpIn: true })
    })
  })

  it('renders no control at all without an onChange', () => {
    render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} />)
    expect(screen.queryAllByRole('checkbox')).toEqual([])
  })

  it('says under the list who may change it, when given a note', () => {
    render(<TableRulesPanel rules={DEFAULT_TABLE_RULES} note="Ana règle la table." />)
    expect(screen.getByText('Ana règle la table.')).toBeTruthy()
  })
})
