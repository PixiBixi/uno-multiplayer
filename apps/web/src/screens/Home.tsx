import type { Card as CardData, CardId } from '@uno/engine'
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@uno/protocol'
import { useState, type FormEvent } from 'react'
import { Card } from '../components/Card.js'
import { CardValues } from '../components/CardValues.js'
import { useCardTheme, useSetCardTheme } from '../components/CardThemeProvider.js'
import { CARD_THEMES } from '../lib/card-themes.js'
import { LOCALES, LOCALE_NAME, useLocale, useMessages, useSetLocale } from '../i18n/index.js'

/**
 * Getting to a table, and nothing else.
 *
 * It used to configure one as well: measured on v1.1.0 the screen carried 21 controls,
 * ran 2.42 screens tall on a phone, and put the game-code field last - below a match
 * format, a clock and four rules that a joining player has no use for at all. On three
 * players, two of them are joining, and their job is two fields.
 *
 * Every table setting now lives in the lobby, where the host adjusts it while waiting for
 * players and where everybody about to play can read it. What stays here is what is not
 * table configuration: a name, a code, and the two per-player display preferences. A card
 * theme and a language change what one person sees - two people at the same table can run
 * different ones and the game is identical - so they cross no wire and belong to nothing
 * the server broadcasts.
 */

/**
 * The card every preview shows. The same card in all four, because the question a
 * player is answering is which face they prefer, not which colour - and one card
 * rendered four ways is the only way to see the difference.
 */
const PREVIEW_CARD: CardData = {
  id: 'theme-preview' as CardId,
  kind: 'number',
  color: 'R',
  value: 7,
}

type HomeProps = {
  onCreate: (name: string) => void
  onJoin: (roomCode: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

export function Home({ onCreate, onJoin, error, prefilledCode }: HomeProps) {
  const t = useMessages()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const cardTheme = useCardTheme()
  const setCardTheme = useSetCardTheme()
  const [name, setName] = useState('')
  const [code, setCode] = useState(prefilledCode ?? '')

  const trimmedName = name.trim()
  const normalisedCode = code.trim().toUpperCase()
  const canCreate = trimmedName.length > 0
  const canJoin = canCreate && normalisedCode.length === ROOM_CODE_LENGTH

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    if (canCreate) onCreate(trimmedName)
  }
  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    if (canJoin) onJoin(normalisedCode, trimmedName)
  }

  return (
    <main className="home">
      <div className="home-column">
        <h1>UNO</h1>
        <p className="hint">{t.home.tagline}</p>

        {error !== null && (
          <p className="banner banner-bad" role="alert">
            {error}
          </p>
        )}

        <form className="home-form" onSubmit={submitCreate}>
          <label htmlFor="player-name">{t.home.yourName}</label>
          <input
            id="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder={t.home.namePlaceholder}
          />
          <button type="submit" className="btn btn-primary" disabled={!canCreate}>
            {t.home.createGame}
          </button>
        </form>

        <div className="home-divider">
          <span>{t.home.orJoin}</span>
        </div>

        <form className="home-form" onSubmit={submitJoin}>
          <label htmlFor="room-code">{t.home.gameCode}</label>
          <input
            id="room-code"
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder={t.home.codePlaceholder}
          />
          <button type="submit" className="btn" disabled={!canJoin}>
            {t.home.joinGame}
          </button>
        </form>
      </div>

      {/* The second column of the desktop grid, and the tail of the single column
          on a phone.

          Both preferences live here rather than under the join form because that
          column used to run to 1272px of name field, match format, Blazing, four
          rules, a create button and a join form, which put these two 372px below a
          900px fold. Players reported never finding them. The column is far shorter
          now that the settings have moved to the lobby, but the preferences stay
          beside the card values: this is where they were found. */}
      <div className="home-aside">
        <CardValues />

        {/* Four real cards rather than four named options: you pick by looking. Each
            preview renders the same `Card` component the table does, with the theme
            forced, so a preview cannot drift from the face it is offering. */}
        <div className="lang-row theme-row" role="group" aria-label={t.cardTheme.label}>
          <span className="hint">{t.cardTheme.label}</span>
          {CARD_THEMES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === cardTheme ? 'theme-swatch theme-swatch-on' : 'theme-swatch'}
              aria-pressed={option === cardTheme}
              aria-label={t.cardTheme.named(t.cardTheme.name[option])}
              title={t.cardTheme.name[option]}
              onClick={() => {
                setCardTheme(option)
              }}
            >
              {/* Hidden from assistive technology: the button already says which
                  theme it is, and the card inside would otherwise announce itself as
                  a Red 7 that cannot be played. */}
              <span className="theme-swatch-card" aria-hidden="true">
                <Card card={PREVIEW_CARD} theme={option} />
              </span>
            </button>
          ))}
        </div>

        <div className="lang-row">
          <span className="hint">{t.home.language}</span>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === locale ? 'chip chip-on' : 'chip'}
              aria-pressed={option === locale}
              lang={option}
              onClick={() => {
                setLocale(option)
              }}
            >
              {LOCALE_NAME[option]}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
