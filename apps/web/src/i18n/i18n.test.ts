import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { CARD_THEMES } from '../lib/card-themes.js'
import { CATALOGUES, LOCALES, detectLocale } from './index.js'
import type { Messages } from './messages.js'

const num = (value: 0 | 7): Card => ({ id: 'n' as CardId, kind: 'number', color: 'R', value })
const wild4: Card = { id: 'w' as CardId, kind: 'wild4' }

/** Every leaf of a catalogue, as dotted paths, so two can be compared. */
const leaves = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('the catalogues', () => {
  it('cover exactly the same keys', () => {
    // A missing key is a blank in the interface, and TypeScript only catches it
    // while the shape is a type rather than a Record with optional members.
    const [first, ...rest] = LOCALES.map((locale) => leaves(CATALOGUES[locale]).sort())
    for (const other of rest) expect(other).toEqual(first)
  })

  it('leave nothing empty', () => {
    for (const locale of LOCALES) {
      const messages: Messages = CATALOGUES[locale]
      const flat = (value: unknown): unknown[] =>
        typeof value === 'object' && value !== null ? Object.values(value).flatMap(flat) : [value]
      for (const entry of flat(messages)) {
        if (typeof entry === 'string') expect(entry.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('grammar each language owns', () => {
  it('conjugates a round win in the second person, differently per language', () => {
    // English changes the verb ending; French changes the whole stem. A shared
    // template with a name hole could not express both.
    expect(CATALOGUES.en.event.roundWon('Ana', true, 30)).toContain('You win')
    expect(CATALOGUES.en.event.roundWon('Ana', false, 30)).toContain('Ana wins')
    expect(CATALOGUES.fr.event.roundWon('Ana', true, 30)).toContain('Tu gagnes')
    expect(CATALOGUES.fr.event.roundWon('Ana', false, 30)).toContain('Ana gagne')
  })

  it('pluralises by each language’s own rule, which differ at zero and one', () => {
    expect(CATALOGUES.en.count.cards(0)).toBe('0 cards')
    expect(CATALOGUES.en.count.cards(1)).toBe('1 card')
    expect(CATALOGUES.en.count.cards(2)).toBe('2 cards')

    // French keeps the singular at zero, where English does not.
    expect(CATALOGUES.fr.count.cards(0)).toBe('0 carte')
    expect(CATALOGUES.fr.count.cards(1)).toBe('1 carte')
    expect(CATALOGUES.fr.count.cards(2)).toBe('2 cartes')
  })

  it('joins a list with each language’s own conjunction', () => {
    expect(CATALOGUES.en.count.list(['Ana', 'Ben', 'Cleo'])).toBe('Ana, Ben and Cleo')
    expect(CATALOGUES.fr.count.list(['Ana', 'Ben', 'Cleo'])).toBe('Ana, Ben et Cleo')
  })

  it('names cards in the language, not in English with a translated colour', () => {
    expect(CATALOGUES.en.card(num(7))).toBe('Red 7')
    expect(CATALOGUES.fr.card(num(7))).toBe('Rouge 7')
    expect(CATALOGUES.en.card(wild4)).toBe('Wild draw four')
    expect(CATALOGUES.fr.card(wild4)).toBe('+4')
  })

  it('says a card is unplayable as a whole sentence, not a translated suffix', () => {
    /* The accessible label of every greyed card in a hand. English hangs a clause off
       a dash; French makes it an adjective and drops the dash entirely. A shared
       "{card} {suffix}" would have made French borrow the dash. */
    expect(CATALOGUES.en.cardUnplayable(num(7))).toBe('Red 7 — not playable this turn')
    expect(CATALOGUES.fr.cardUnplayable(num(7))).toBe('Rouge 7, injouable ce tour-ci')
    // And it still contains the card's own name in that language, not the English one.
    for (const locale of LOCALES) {
      const catalogue = CATALOGUES[locale]
      expect(catalogue.cardUnplayable(num(7))).toContain(catalogue.card(num(7)))
    }
  })

  it('names a face-down card in both languages', () => {
    // On the draw pile and in every opponent's fan, so it is on screen constantly.
    expect(CATALOGUES.en.cardFaceDown).toBe('Face-down card')
    expect(CATALOGUES.fr.cardFaceDown).toBe('Carte face cachée')
  })

  it('shouts each burst in the language, figures excepted', () => {
    /* `aria-hidden` decoration, translated anyway: it is the largest type on the
       screen. "+2" and "+4" are figures and stay put; the four words do not. */
    expect(CATALOGUES.en.effect.skip).toBe('SKIP')
    expect(CATALOGUES.fr.effect.skip).toBe('PASSE')
    expect(CATALOGUES.fr.effect.reverse).toBe('INVERSION')
    expect(CATALOGUES.fr.effect.wild).toBe('JOKER')
    for (const locale of LOCALES) {
      expect(CATALOGUES[locale].effect.wild4).toBe('+4')
      expect(CATALOGUES[locale].effect.draw2).toBe('+2')
      // French spaces its exclamation mark and English does not.
      expect(CATALOGUES[locale].effect.uno).toBe(CATALOGUES[locale].table.callUno)
    }
  })

  it('names the colour in play through the catalogue rather than a table in lib/', () => {
    /* `lib/palette.ts` used to hold `COLOR_NAME`, an English table three components
       read, which is why a French table said "Green in play". `lib/` is pure and knows
       no language; naming is the catalogue's job. */
    expect(CATALOGUES.en.table.inPlay(CATALOGUES.en.colour('G'))).toBe('Green in play')
    expect(CATALOGUES.fr.table.inPlay(CATALOGUES.fr.colour('G'))).toBe('Vert en jeu')
  })

  it('counts the draw pile and the stacked debt by each language’s own rule', () => {
    expect(CATALOGUES.en.table.left(34)).toBe('34 left')
    expect(CATALOGUES.fr.table.left(34)).toBe('34 restantes')
    expect(CATALOGUES.en.table.stacked(6)).toBe('+6 stacked')
    expect(CATALOGUES.fr.table.stacked(6)).toBe('+6 en attente')
  })

  it('says a seat has gone in each language, and more plainly than the lobby does', () => {
    /* Deliberately not the lobby's one-word badge: on the felt this sits beside
       "Anticlockwise", where an English "left" reads as a direction. */
    expect(CATALOGUES.en.table.hasLeft).toBe('left the game')
    expect(CATALOGUES.fr.table.hasLeft).toBe('a quitté la partie')
    expect(CATALOGUES.en.table.hasLeft).not.toBe(CATALOGUES.en.lobby.left)
  })

  it('names the host in a sentence when the roster has not named them yet', () => {
    // A noun dropped into `waitingForHost`, so it has to read as one — and French
    // needs its elision.
    expect(CATALOGUES.en.lobby.waitingForHost(CATALOGUES.en.lobby.theHost)).toBe(
      'Waiting for the host to start the game.',
    )
    expect(CATALOGUES.fr.lobby.waitingForHost(CATALOGUES.fr.lobby.theHost)).toBe(
      'En attente que l’hôte lance la partie.',
    )
  })

  it('translates the two banners a player only sees when something is wrong', () => {
    expect(CATALOGUES.en.connection.lost).toContain('Connection lost')
    expect(CATALOGUES.fr.connection.lost).toContain('Connexion perdue')
    for (const locale of LOCALES)
      expect(CATALOGUES[locale].crash.heading.length).toBeGreaterThan(10)
  })

  it('names a toast’s close button, in each language’s own punctuation', () => {
    // Several toasts can stand at once, so the name has to carry the title. French
    // spaces its colon.
    expect(CATALOGUES.en.dismissToast('Round over')).toBe('Dismiss: Round over')
    expect(CATALOGUES.fr.dismissToast('Manche terminée')).toBe('Fermer : Manche terminée')
  })

  it('translates every label a control is only reachable by, not just the visible ones', () => {
    /* Accessible names are the class of string a sighted reviewer never sees, and the
       class the last two sweeps missed almost entirely. */
    for (const locale of LOCALES) {
      const t = CATALOGUES[locale]
      for (const label of [
        t.config.matchFormat,
        t.home.codePlaceholder,
        t.table.messageTable,
        t.table.chooseColour,
        t.table.cancel,
        t.table.panelTitle,
        t.table.collapsePanel,
        t.cardFaceDown,
      ]) {
        expect(label.length).toBeGreaterThan(0)
      }
    }
    expect(CATALOGUES.fr.config.matchFormat).toBe('Format de la partie')
    expect(CATALOGUES.fr.table.chooseColour).toBe('Choisis une couleur')
    expect(CATALOGUES.fr.table.cancel).toBe('Annuler')
  })

  it('describes a played card as a whole sentence per language', () => {
    // Not "{name} played a {card}" with the card slotted in: French puts the verb
    // in the perfect and needs no article here.
    expect(CATALOGUES.en.event.cardPlayed('Ana', false, num(7))).toBe('Ana played a Red 7')
    expect(CATALOGUES.fr.event.cardPlayed('Ana', false, num(7))).toBe('Ana a posé Rouge 7')
  })

  it('conjugates the second person where a language needs it and not where it does not', () => {
    /* Caught by playing a game in French rather than by reading the catalogue:
       "Toi a posé Joker" is wrong, and no amount of reviewing an English-shaped
       message list would have shown it. English keeps one form for both persons
       here; French does not, so the person is passed to every event and each
       language decides whether it cares. */
    expect(CATALOGUES.en.event.cardPlayed('You', true, num(7))).toBe('You played a Red 7')
    expect(CATALOGUES.fr.event.cardPlayed('Toi', true, num(7))).toBe('Tu as posé Rouge 7')

    expect(CATALOGUES.fr.event.unoCalled('Toi', true)).toBe('Tu as crié UNO')
    expect(CATALOGUES.fr.event.unoCalled('Ana', false)).toBe('Ana a crié UNO')

    expect(CATALOGUES.fr.event.cardsDrawn('Toi', true, 2)).toContain('Tu as pioché')
    expect(CATALOGUES.fr.event.cardsDrawn('Ana', false, 2)).toContain('Ana a pioché')

    /* A call-out has two people in it, so both persons have to be handled: the
       accuser and the accused each change the verb in French. */
    expect(CATALOGUES.fr.event.calledOut('Toi', true, 'Ana', false)).toContain('Tu as pris')
    expect(CATALOGUES.fr.event.calledOut('Ana', false, 'Toi', true)).toContain('t’a pris')
  })

  /* Pinned rather than merely non-empty, because the wording is the point: neither
     language accuses anybody of lying. Forgetting to say UNO is an omission, and a
     button that calls a friend a liar reads badly at a table of four. */
  it('names the call-out button in each language, without alleging bad faith', () => {
    expect(CATALOGUES.en.table.callOut).toBe('Caught!')
    expect(CATALOGUES.fr.table.callOut).toBe('Contre-UNO !')
    for (const catalogue of Object.values(CATALOGUES)) {
      expect(catalogue.table.callOut.toLowerCase()).not.toMatch(/liar|menteur/)
      expect(catalogue.table.callOutOn('Ana').toLowerCase()).not.toMatch(/liar|menteur/)
    }
  })

  it('names the Seven-Zero option in each language', () => {
    // The variant has a French name of its own; leaving it in English would be the
    // one untranslated word on the screen.
    expect(CATALOGUES.en.config.sevenZero).toContain('Seven-Zero')
    expect(CATALOGUES.fr.config.sevenZero).toContain('Sept-Zéro')
  })

  it('names the jump-in option in each language', () => {
    /* Unlike Seven-Zero, this variant has no French name in circulation — players
       say "jump-in" — so the label keeps it rather than inventing one. The sentence
       around it is still French. */
    expect(CATALOGUES.en.config.jumpIn).toContain('jump-in')
    expect(CATALOGUES.fr.config.jumpIn).toContain('Jump-in')
    expect(CATALOGUES.fr.config.jumpInHint).toContain('hors de ton tour')
    expect(CATALOGUES.en.table.jumpIn).toBe('Jump in!')
    expect(CATALOGUES.fr.table.jumpIn).toBe('Jump-in !')
  })

  it('conjugates a jump-in for the person who made it', () => {
    expect(CATALOGUES.en.event.jumpedIn('Ana', true)).toContain('You jumped in')
    expect(CATALOGUES.en.event.jumpedIn('Ana', false)).toContain('Ana jumped in')
    expect(CATALOGUES.fr.event.jumpedIn('Toi', true)).toContain('Tu as sauté')
    expect(CATALOGUES.fr.event.jumpedIn('Ana', false)).toContain('Ana a sauté')
  })

  it('names the drawn-card option and its control in each language', () => {
    /* No jargon to preserve in either language, unlike jump-in: the rule is described by
       what it lets you do. And the control says it ends the turn rather than "pass", which
       in a card game reads as declining to draw — precisely backwards here. */
    expect(CATALOGUES.en.config.playDrawnCard).toContain('drawn card')
    expect(CATALOGUES.fr.config.playDrawnCard).toContain('piocher')
    expect(CATALOGUES.en.config.playDrawnCardHint).toContain('official rule')
    expect(CATALOGUES.fr.config.playDrawnCardHint).toContain('règle officielle')
    expect(CATALOGUES.en.table.endTurn).toBe('End turn')
    expect(CATALOGUES.fr.table.endTurn).toBe('Terminer mon tour')
    for (const locale of LOCALES) {
      // Neither label may be the word "pass", in either language.
      expect(CATALOGUES[locale].table.endTurn.toLowerCase()).not.toMatch(/^pass/)
    }
    expect(CATALOGUES.en.table.playDrawnCard).toContain('end your turn')
    expect(CATALOGUES.fr.table.playDrawnCard).toContain('termine ton tour')
  })

  it('conjugates a kept card and an ended turn for the person who did it', () => {
    expect(CATALOGUES.en.event.turnPassed('Ana', true)).toContain('You kept')
    expect(CATALOGUES.en.event.turnPassed('Ana', false)).toContain('Ana kept')
    expect(CATALOGUES.fr.event.turnPassed('Toi', true)).toContain('Tu as gardé')
    expect(CATALOGUES.fr.event.turnPassed('Ana', false)).toContain('Ana a gardé')
  })

  it('conjugates a swap for both people in it, and counts the hand each way', () => {
    expect(CATALOGUES.fr.event.handsSwapped('Toi', true, 'Ana', false)).toContain('Tu as posé')
    expect(CATALOGUES.fr.event.handsSwapped('Ana', false, 'Toi', true)).toContain('pris ta main')

    // The target button pluralises by each language's own rule, zero included.
    expect(CATALOGUES.en.table.swapTarget('Ana', 1)).toBe('Ana, 1 card')
    expect(CATALOGUES.fr.table.swapTarget('Ana', 1)).toBe('Ana, 1 carte')
    expect(CATALOGUES.en.table.swapTarget('Ana', 4)).toBe('Ana, 4 cards')
    expect(CATALOGUES.fr.table.swapTarget('Ana', 4)).toBe('Ana, 4 cartes')
  })

  it('names every card theme in both languages, and names them in the language', () => {
    /* Unlike "jump-in", every one of these has an ordinary French word. Leaving them
       in English would put four untranslated words in the middle of a French page. */
    expect(CATALOGUES.en.cardTheme.name.classic).toBe('Classic')
    expect(CATALOGUES.fr.cardTheme.name.classic).toBe('Classique')
    expect(CATALOGUES.fr.cardTheme.name.flat).toBe('Épuré')
    expect(CATALOGUES.fr.cardTheme.name.letterpress).toBe('Typographié')
    expect(CATALOGUES.fr.cardTheme.name.neon).toBe('Néon')
    expect(CATALOGUES.fr.cardTheme.label).toBe('Thème des cartes')

    for (const locale of LOCALES) {
      const catalogue = CATALOGUES[locale]
      for (const theme of CARD_THEMES) {
        // The control's accessible name has to carry the theme's own name inside it,
        // in each language's own punctuation — French spaces its colon, English does
        // not.
        expect(catalogue.cardTheme.named(catalogue.cardTheme.name[theme])).toContain(
          catalogue.cardTheme.name[theme],
        )
      }
    }
    expect(CATALOGUES.fr.cardTheme.named('Néon')).toBe('Thème des cartes : Néon')
    expect(CATALOGUES.en.cardTheme.named('Neon')).toBe('Card theme: Neon')
  })

  it('covers every error code in both languages', () => {
    const codes = Object.keys(CATALOGUES.en.error).sort()
    expect(Object.keys(CATALOGUES.fr.error).sort()).toEqual(codes)
    expect(codes.length).toBeGreaterThan(10)
  })
})

describe('detectLocale', () => {
  it('prefers what was stored', () => {
    window.localStorage.setItem('uno.pref.locale', 'fr')
    expect(detectLocale()).toBe('fr')
    window.localStorage.clear()
  })

  it('ignores a stored value that is not a locale', () => {
    window.localStorage.setItem('uno.pref.locale', 'klingon')
    expect(LOCALES).toContain(detectLocale())
    window.localStorage.clear()
  })

  it('falls back to a locale that exists', () => {
    window.localStorage.clear()
    expect(LOCALES).toContain(detectLocale())
  })
})
