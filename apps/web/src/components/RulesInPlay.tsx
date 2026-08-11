import type { TableRules } from '@uno/engine'
import { useMessages } from '../i18n/index.js'

/**
 * What is unusual about this table, during the game.
 *
 * The lobby already shows every setting before the deal, and that turned out to be half a
 * fix: a rule read once is not one anybody recalls twenty minutes later. A manual UNO
 * penalty got reported as a missing one, and the game was right — the table simply never
 * said the rule was on.
 *
 * Deliberately not a list of all four. A strip that says the same thing every game is
 * noise, and noise is what gets ignored, which is the defect this exists to fix. So it
 * answers one question — what is different here — and an ordinary table renders nothing
 * at all.
 */
export function RulesInPlay({ rules }: { rules: TableRules }) {
  const t = useMessages()

  /*
   * `playDrawnCard` is inverted, and this is the only place that knows it: it is the
   * official rule and on by default, so its presence says nothing about a table. Its
   * ABSENCE does, so the flag being off is what earns a chip.
   */
  const unusual: string[] = [
    rules.liar ? t.table.ruleShort.liar : null,
    rules.sevenZero ? t.table.ruleShort.sevenZero : null,
    rules.jumpIn ? t.table.ruleShort.jumpIn : null,
    rules.playDrawnCard ? null : t.table.ruleShort.noPlayDrawnCard,
  ].filter((name): name is string => name !== null)

  // Nothing unusual needs no explaining, and an empty strip would still take a row of a
  // phone screen that the hand already struggles to fit into.
  if (unusual.length === 0) return null

  return (
    <div className="rules-in-play">
      <span className="rules-in-play-heading">{t.table.rulesHeading}</span>
      {unusual.map((name) => (
        <span className="chip chip-rule" key={name}>
          {name}
        </span>
      ))}
    </div>
  )
}
