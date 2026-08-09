import { buildDeck, cardPoints, type Card, type CardId } from '@uno/engine'
import { useMessages } from '../i18n/index.js'

/**
 * What the cards are worth, read from the engine rather than written out here.
 *
 * A points table copied into help text is a table that goes quietly wrong the
 * first time the rule changes. Every number below is produced by calling
 * `cardPoints` on a representative card, so the page cannot disagree with the
 * scoring it describes — if it ever did, the tests comparing the two would fail
 * before a player ever saw it.
 */
const NUMBER_LOW: Card = { id: 'help-0' as CardId, kind: 'number', color: 'R', value: 0 }
const NUMBER_HIGH: Card = { id: 'help-9' as CardId, kind: 'number', color: 'R', value: 9 }
const SKIP: Card = { id: 'help-skip' as CardId, kind: 'skip', color: 'G' }
const REVERSE: Card = { id: 'help-reverse' as CardId, kind: 'reverse', color: 'B' }
const DRAW2: Card = { id: 'help-draw2' as CardId, kind: 'draw2', color: 'Y' }
const WILD: Card = { id: 'help-wild' as CardId, kind: 'wild' }
const WILD4: Card = { id: 'help-wild4' as CardId, kind: 'wild4' }

/** Counted from the real deck, so it stays true if the deck ever changes. */
const DECK_TOTAL = buildDeck().reduce((sum, card) => sum + cardPoints(card), 0)

export function CardValues() {
  const t = useMessages()

  const ROWS: { label: string; value: string }[] = [
    {
      label: t.help.numberCardsLabel,
      value: t.help.numberCards(cardPoints(NUMBER_LOW), cardPoints(NUMBER_HIGH)),
    },
    { label: t.help.skip, value: String(cardPoints(SKIP)) },
    { label: t.help.reverse, value: String(cardPoints(REVERSE)) },
    { label: t.help.drawTwo, value: String(cardPoints(DRAW2)) },
    { label: t.help.wild, value: String(cardPoints(WILD)) },
    { label: t.help.wildFour, value: String(cardPoints(WILD4)) },
  ]
  return (
    <aside className="help" aria-labelledby="help-title">
      <h2 className="help-title" id="help-title">
        {t.help.title}
      </h2>
      <div className="help-body">
        <p className="hint">{t.help.intro}</p>

        <dl className="value-list">
          {ROWS.map((row) => (
            <div className="value-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="hint">{t.help.deckTotal(DECK_TOTAL)}</p>
      </div>
    </aside>
  )
}
