import type { TableRules } from '@uno/engine'
import { useMessages } from '../i18n/index.js'

/**
 * What this table plays by, during the game.
 *
 * The lobby already shows every setting before the deal, and that turned out to be half a
 * fix: a rule read once is not one anybody recalls twenty minutes later. A manual UNO
 * penalty got reported as a missing one, and the game was right — the table simply never
 * said the rule was on.
 *
 * All four, always, with their state. The first attempt showed only the unusual ones, on the
 * argument that a strip repeating itself every game becomes noise. The argument holds and
 * the design still failed, for a reason worth remembering: an ordinary table then rendered
 * nothing, and nothing is indistinguishable from a feature that was never deployed. The
 * person who asked for it looked at a table and could not tell. A confirmation that costs a
 * row is worth more than a row saved.
 */
export function RulesInPlay({ rules }: { rules: TableRules }) {
  const t = useMessages()

  const entries: { key: string; label: string; on: boolean }[] = [
    { key: 'liar', label: t.table.ruleShort.liar, on: rules.liar },
    { key: 'sevenZero', label: t.table.ruleShort.sevenZero, on: rules.sevenZero },
    { key: 'jumpIn', label: t.table.ruleShort.jumpIn, on: rules.jumpIn },
    { key: 'playDrawnCard', label: t.table.ruleShort.playDrawnCard, on: rules.playDrawnCard },
  ]

  return (
    <div className="rules-in-play">
      <span className="rules-in-play-heading">{t.table.rulesHeading}</span>
      {entries.map(({ key, label, on }) => (
        <span className={on ? 'chip-rule chip-rule-on' : 'chip-rule chip-rule-off'} key={key}>
          {/* The mark is decoration and the word behind it is the fact: state is never
              carried by colour alone, and a dimmed chip is not something a screen reader
              can see. */}
          <span aria-hidden="true">{on ? '✓' : '✕'}</span> {label}
          <span className="visually-hidden"> {on ? t.table.ruleOn : t.table.ruleOff}</span>
        </span>
      ))}
    </div>
  )
}
