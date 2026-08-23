import type { TableRules } from '@uno/engine'
import { useMessages } from '../i18n/index.js'
import type { Messages } from '../i18n/messages.js'

/**
 * The four table rules, in the one component both the host and a guest render.
 *
 * One component rather than two is the whole design here. A guest has to be able to see
 * which rules they are about to play by - before this they found out about Seven-Zero
 * when their hand changed owner - and a second, read-only copy of the list is how one of
 * the two ends up stale: a fifth rule added to the host's copy and forgotten in the
 * guest's would leave half the table looking at a game that is not the one being played.
 *
 * So the list, the labels and the explanations are declared once, below. The only thing
 * the two modes differ in is how a row is drawn: a switch when this seat may change it,
 * the state in words when it may not. `onChange` being absent is what says which - a
 * read-only panel renders no input at all, so it cannot emit even if something tried.
 */

type TableRulesPanelProps = {
  rules: TableRules
  /** Absent for a guest, and for the host once the deal has frozen the table. */
  onChange?: (rules: TableRules) => void
  /** Said under the list: who may change these, or why nobody can any more. */
  note?: string
}

/** Each rule once: the flag it sets, its label, and what it does. */
const ruleList = (t: Messages) =>
  [
    { key: 'liar', label: t.config.liar, hint: t.config.liarHint },
    { key: 'sevenZero', label: t.config.sevenZero, hint: t.config.sevenZeroHint },
    { key: 'jumpIn', label: t.config.jumpIn, hint: t.config.jumpInHint },
    /* Last, and the only one that starts on: it is the official rule rather than a house
       rule, so a table nobody configured plays it. */
    { key: 'playDrawnCard', label: t.config.playDrawnCard, hint: t.config.playDrawnCardHint },
  ] as const satisfies readonly { key: keyof TableRules; label: string; hint: string }[]

export function TableRulesPanel({ rules, onChange, note }: TableRulesPanelProps) {
  const t = useMessages()

  return (
    <fieldset className="goal-picker">
      <legend>{t.config.tableRules}</legend>
      {ruleList(t).map((rule) => (
        <div className="rule" key={rule.key}>
          {onChange === undefined ? (
            /* The state in words, not a dimmed checkbox: a disabled control says "you
               could change this, but not now", which is not what a guest is being told,
               and it drops out of the tab order on the one surface where reading is the
               whole point. */
            <p className="rule-state">
              <span>{rule.label}</span>
              <strong>{rules[rule.key] ? t.config.ruleOn : t.config.ruleOff}</strong>
            </p>
          ) : (
            <label className="switch-row">
              <input
                type="checkbox"
                checked={rules[rule.key]}
                onChange={(event) => {
                  /* The whole object, not the one flag. `room:configure` is partial per
                     FIELD - goal, pace, rules - and `rules` is one field the server
                     replaces wholesale, so sending a lone flag would reset the other
                     three to their defaults. */
                  onChange({ ...rules, [rule.key]: event.target.checked })
                }}
              />
              <span>{rule.label}</span>
            </label>
          )}
          {/* Behind a disclosure rather than on permanent display. Four explanations at
              once is what made the home screen a wall of text; here the reader has
              already chosen to look. */}
          <details className="rule-why">
            <summary aria-label={t.config.explainRule(rule.label)}>{t.config.whatThisDoes}</summary>
            <p className="hint">{rule.hint}</p>
          </details>
        </div>
      ))}
      {note !== undefined && <p className="hint">{note}</p>}
    </fieldset>
  )
}
