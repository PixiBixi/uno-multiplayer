import { DEFAULT_TABLE_RULES, type Card as CardData, type CardId } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type LobbyView, type PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { Card } from '../components/Card.js'
import { CardBack } from '../components/CardBack.js'
import { CentreStack } from '../components/CentreStack.js'
import { ChatPanel } from '../components/ChatPanel.js'
import { ColourPicker } from '../components/ColourPicker.js'
import { PlayEffects } from '../components/PlayEffects.js'
import { Seat } from '../components/Seat.js'
import { Toaster } from '../components/Toaster.js'
import { Lobby } from '../screens/Lobby.js'
import { LocaleProvider } from './LocaleProvider.js'

/**
 * The other half of `no-english.test.ts`.
 *
 * That one reads source and proves no component *contains* an English phrase. This
 * one renders them in French and proves that what a French player actually receives
 * is French — including the accessible names, which is where every one of these
 * defects lived. A string can be absent from a component and still arrive in English
 * from a lookup table two modules away, which is exactly what `COLOR_NAME` did.
 *
 * jsdom, so it is cheap and runs on every commit. `e2e/i18n.spec.ts` does the same
 * thing to a whole game in a real browser, which is what catches a screen these
 * fixtures do not reach.
 */

const id = (value: string) => value as CardId
const num = (value: number): CardData => ({
  id: id('c1'),
  kind: 'number',
  color: 'R',
  value: value as 0,
})

/** Through the real provider and the real preference, the way a French browser does
 *  it — not by handing a catalogue straight to a context. */
const inFrench = (node: ReactElement) => {
  window.localStorage.setItem('uno.pref.locale', 'fr')
  const result = render(<LocaleProvider>{node}</LocaleProvider>)
  window.localStorage.clear()
  return result
}

const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  you: { seat: 0, hand: [], legalMoves: [] },
  opponents: [],
  discardTop: { id: id('top'), kind: 'number', color: 'B', value: 7 },
  currentColor: 'G',
  pendingDraw: null,
  currentSeat: 0,
  direction: 1,
  drawPileCount: 34,
  phase: 'playing',
  winner: null,
  turnDeadline: null,
  nextRoundDeadline: null,
  match: { goal: DEFAULT_MATCH_GOAL, scores: [0, 0], round: 1, winners: null, stats: [] },
  ...overrides,
})

describe('a card, in French', () => {
  it('announces itself in French, which is the string a French player hears most', () => {
    /* One `aria-label` per card in a hand of seven, plus the pile, plus every preview.
       It read "Red 7" in French for as long as the feature existed. */
    inFrench(<Card card={num(7)} />)
    expect(screen.getByRole('img', { name: 'Rouge 7' })).toBeTruthy()
  })

  it('says in French why it cannot be played', () => {
    inFrench(<Card card={{ id: id('w4'), kind: 'wild4' }} onPlay={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: '+4, injouable ce tour-ci' })).toBeTruthy()
  })

  it('names a face-down card in French, on the pile and in every fan', () => {
    inFrench(<CardBack />)
    expect(screen.getByRole('img', { name: 'Carte face cachée' })).toBeTruthy()
  })
})

describe('the centre of the table, in French', () => {
  it('counts the draw pile in French', () => {
    inFrench(<CentreStack view={viewWith()} />)
    expect(screen.getByText('34 restantes')).toBeTruthy()
  })

  it('names the colour in play in French', () => {
    // The one that proved `COLOR_NAME` was still being read: "Green in play".
    inFrench(<CentreStack view={viewWith({ currentColor: 'G' })} />)
    expect(screen.getByText('Vert en jeu')).toBeTruthy()
  })

  it('names the stacked draw debt in French', () => {
    inFrench(<CentreStack view={viewWith({ pendingDraw: { amount: 6, kind: 'draw2' } })} />)
    expect(screen.getByText('+6 en attente')).toBeTruthy()
  })
})

describe('the pickers and panels, in French', () => {
  it('offers colours by their French names, and a French way out', () => {
    inFrench(
      <ColourPicker
        options={[
          { type: 'play', cardId: id('w'), chosenColor: 'B' },
          { type: 'play', cardId: id('w'), chosenColor: 'G' },
        ]}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Bleu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vert' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
    // Named by its own heading now, so the dialog's name is the title, in French.
    expect(screen.getByRole('dialog', { name: 'Choisis une couleur' })).toBeTruthy()
  })

  it('labels the chat composer in French', () => {
    inFrench(<ChatPanel feed={[]} mySeat={0} nameOf={() => 'Ana'} onSend={vi.fn()} />)
    expect(screen.getByLabelText('Écrire à la table')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Discussion et journal de la table' })).toBeTruthy()
  })

  it('names a toast’s close button in French', () => {
    inFrench(
      <Toaster
        toasts={[{ id: 1, tone: 'info', title: 'Manche terminée', detail: 'Le classement.' }]}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fermer : Manche terminée' })).toBeTruthy()
  })
})

describe('a seat and a burst, in French', () => {
  it('says in French that a seat is reconnecting or gone', () => {
    const base = {
      name: 'Ben',
      handCount: 3,
      isTurn: false,
      orientation: 'horizontal' as const,
      onCallOut: null,
    }
    const away = inFrench(<Seat {...base} status="disconnected" />)
    expect(away.getByText('reconnexion…')).toBeTruthy()
    away.unmount()

    const gone = inFrench(<Seat {...base} status="left" />)
    expect(gone.getByText('a quitté la partie')).toBeTruthy()
  })

  it('shouts in French across the middle of the table', () => {
    /* `aria-hidden`, and still the biggest type on the screen. A French table used to
       be told SKIP and REVERSE in English. */
    for (const [effect, word] of [
      [{ key: 'a', kind: 'skip', color: 'R' }, 'PASSE'],
      [{ key: 'b', kind: 'reverse', color: 'G' }, 'INVERSION'],
      [{ key: 'c', kind: 'wild', color: 'Y' }, 'JOKER'],
      [{ key: 'd', kind: 'uno' }, 'UNO !'],
    ] as const) {
      const { container, unmount } = inFrench(<PlayEffects effects={[effect]} />)
      expect(container.querySelector('.fx-label')?.textContent, word).toBe(word)
      unmount()
    }
  })
})

describe('the lobby, in French', () => {
  const lobby: LobbyView = {
    roomCode: 'K7QM2X',
    hostSeat: 9,
    canStart: false,
    seats: [{ seat: 0, name: 'Ana', status: 'active' }],
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
    rules: DEFAULT_TABLE_RULES,
    configurable: true,
  }

  it('falls back to a French noun when the host is not in the roster', () => {
    // `hostSeat` 9 is nobody, which is the branch that used to read "the host".
    inFrench(
      <Lobby lobby={lobby} mySeat={0} onStart={vi.fn()} onLeave={vi.fn()} onConfigure={vi.fn()} />,
    )
    expect(screen.getByText('En attente que l’hôte lance la partie.')).toBeTruthy()
  })
})

describe('the whole rendered tree', () => {
  it('carries no English word from the old catalogue-free surfaces', () => {
    /* A sweep rather than a list of expectations: render the table's centre, a seat, a
       card and the chat together and search the text for the words that used to be
       there. Naming them is the point — these are the exact strings two sweeps
       reported as absent. */
    const { container } = inFrench(
      <>
        <Card card={num(7)} />
        <CardBack />
        <CentreStack view={viewWith({ pendingDraw: { amount: 6, kind: 'draw2' } })} />
        <Seat
          name="Ben"
          handCount={2}
          status="left"
          isTurn={false}
          orientation="horizontal"
          onCallOut={null}
        />
        <ChatPanel feed={[]} mySeat={0} nameOf={() => 'Ana'} onSend={vi.fn()} />
      </>,
    )

    const spoken = [
      ...(container.textContent ?? '').split(/\s+/),
      ...[...container.querySelectorAll('[aria-label]')].map(
        (node) => node.getAttribute('aria-label') ?? '',
      ),
    ].join(' ')

    for (const word of [
      'Red',
      'Green',
      'Blue',
      'Yellow',
      'left the game',
      'in play',
      'stacked',
      'Face-down',
      'reconnecting',
      'Message the table',
    ]) {
      expect(spoken, word).not.toContain(word)
    }
  })
})

/* Belt and braces on the fixture itself: a French render that silently fell back to
   English would make every assertion above fail loudly, but a French render that
   produced an empty tree would make the sweep pass for nothing. */
describe('the French fixture', () => {
  it('really rendered in French rather than rendering nothing', () => {
    const { container } = inFrench(<CentreStack view={viewWith()} />)
    expect(container.textContent).toContain('Vert')
    expect(document.documentElement.lang).toBe('fr')
  })
})
