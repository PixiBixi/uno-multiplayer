import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * A whole game played in a French browser, checked for English.
 *
 * Every earlier check on the translation read the source and reported the language
 * complete. Both times it was not, and both times the reason was the same: reading a
 * catalogue tells you what has been translated, never what a page renders. Only the
 * rendered document knows, and only a browser can produce one — a card's
 * `aria-label` is assembled at render time from a component, a lookup table and a
 * context, and the three of them disagreed for months without a single file looking
 * wrong on its own.
 *
 * The language comes from `locale`, not from a click: a French browser must arrive in
 * French with nothing stored and nothing chosen, which is the path a guest actually
 * takes off somebody's invite link.
 */

const FRENCH = { locale: 'fr-FR' }

/** One player is one browser context, and this one asks for French. */
async function openFrenchPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext(FRENCH)
  return context.newPage()
}

async function createGame(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Ton prénom').fill(name)
  await page.getByRole('button', { name: 'Créer une partie' }).click()
  const code = await page.locator('.code-display').textContent()
  if (code === null) throw new Error('no room code was shown')
  return code.trim()
}

async function joinGame(page: Page, code: string, name: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Ton prénom').fill(name)
  await page.getByLabel('Code de la partie').fill(code)
  await page.getByRole('button', { name: 'Rejoindre' }).click()
}

/**
 * Everything the page says, visible text and accessible names together.
 *
 * The names matter more than the text here. A card carries no visible words at all —
 * its face is a numeral and a shape — so its `aria-label` is the only place its
 * identity is written, and it was the single biggest miss: a French player heard
 * "Red 7" on every card in their hand.
 */
async function everythingSaid(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spoken = [...document.querySelectorAll('[aria-label], [title], [placeholder]')].flatMap(
      (node) => [
        node.getAttribute('aria-label') ?? '',
        node.getAttribute('title') ?? '',
        node.getAttribute('placeholder') ?? '',
      ],
    )
    return [document.body.innerText, ...spoken].join('\n')
  })
}

/**
 * Words that could only come from the English catalogue or from a literal left in a
 * component. Named individually rather than detected, because "is this word English"
 * has no answer a test can compute — "Table" and "Ana" are French too, and `UNO`,
 * `Blazing` and `Jump-in` are deliberately untranslated and documented as such.
 *
 * Whole words, so `Vert` does not trip on the substring of something else and
 * `restantes` does not trip the search for `left`.
 */
const ENGLISH_ONLY = [
  'Red',
  'Green',
  'Blue',
  'Yellow',
  'Wild',
  'skip',
  'reverse',
  'draw two',
  'left',
  'stacked',
  'in play',
  'Face-down',
  'Clockwise',
  'Anticlockwise',
  'reconnecting',
  'Draw card',
  'Cancel',
  'Dismiss',
  'your turn',
  'their turn',
  'Send',
  'Start game',
  'Leave table',
  'Waiting',
  'Host',
  'seconds',
  'Liar',
  'Choose',
  'Match format',
  'not playable',
]

function englishFoundIn(said: string): string[] {
  return ENGLISH_ONLY.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(said)
  })
}

test('the detector would notice English if there were any', () => {
  /* The assertion this file rests on, tested rather than trusted — an emptied word
     list, or a regex that never matches, would make every check below pass. */
  expect(englishFoundIn('C’est un Red 7, injouable')).toEqual(['Red'])
  expect(englishFoundIn('34 restantes')).toEqual([])
  expect(englishFoundIn('Rouge 7 en jeu')).toEqual([])
  expect(englishFoundIn('Face-down card')).toEqual(['Face-down'])
})

test('a French browser gets a French home screen with nothing stored', async ({ browser }) => {
  const page = await openFrenchPlayer(browser)
  await page.goto('/')

  // The document declares the language too, or a screen reader speaks French in an
  // English voice — measured here rather than assumed.
  expect(await page.getAttribute('html', 'lang')).toBe('fr')
  expect(englishFoundIn(await everythingSaid(page))).toEqual([])
})

test('a whole French game says nothing in English, card labels included', async ({ browser }) => {
  const host = await openFrenchPlayer(browser)
  const guest = await openFrenchPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')

  // The lobby, before anything is dealt.
  expect(englishFoundIn(await everythingSaid(host))).toEqual([])

  await host.getByRole('button', { name: 'Lancer la partie' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  /* The hand, one label at a time. This is the check that would have caught the
     defect: the words are nowhere in the visible text, only in the accessible name of
     a card nobody reads with their eyes. */
  const handLabels = await host
    .locator('.hand-card [role="img"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
  expect(handLabels).toHaveLength(7)
  for (const label of handLabels) {
    expect(label.length, 'a card with no accessible name at all').toBeGreaterThan(0)
    expect(englishFoundIn(label), label).toEqual([])
  }

  // And the backs, which are the majority of the cards on the table.
  const backLabel = await host.locator('[data-face-down]').first().getAttribute('aria-label')
  expect(backLabel).toBe('Carte face cachée')

  // Seat 0 opens, so the host can always draw. That moves the game on and raises the
  // draw-pile count, the direction badge and a log line.
  await host.getByRole('button', { name: 'Piocher' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(8)

  for (const page of [host, guest]) {
    expect(englishFoundIn(await everythingSaid(page))).toEqual([])
  }

  /* The log, specifically. It is the one surface built from server events rather than
     from static labels, so it is where an untranslated `describeEvent` case would show
     up — and it must have something in it by now. */
  const log = await host.locator('.sys-line').allInnerTexts()
  expect(log.length).toBeGreaterThan(0)
  for (const line of log) expect(englishFoundIn(line), line).toEqual([])
})

/** Seat 0 opens, so a wild in the host's opening hand is a wild that can be played
 *  immediately. A wild in French is `Joker` or `+4`. */
const isWild = (label: string): boolean => label.startsWith('Joker') || label === '+4'

test('a French player choosing a colour is asked in French', async ({ browser }) => {
  /* A dealt hand of seven holds a wild about 43% of the time, so this deals again
     until it does rather than skipping — a check that quietly opts out most runs is
     the same as no check. Twelve deals leave a one-in-a-thousand chance of never
     seeing one, and it normally takes two. */
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const host = await openFrenchPlayer(browser)
    const guest = await openFrenchPlayer(browser)
    const code = await createGame(host, 'Ana')
    await joinGame(guest, code, 'Ben')
    await host.getByRole('button', { name: 'Lancer la partie' }).click()
    await expect(host.locator('.hand-card')).toHaveCount(7)

    const playable = host.locator('.hand-card button:not([disabled])')
    const labels = await playable.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label') ?? ''),
    )
    const index = labels.findIndex(isWild)

    if (index < 0) {
      await host.context().close()
      await guest.context().close()
      continue
    }

    await playable.nth(index).click()
    const picker = host.getByRole('dialog', { name: 'Choisis une couleur' })
    await expect(picker).toBeVisible()
    // All four names, and the way out, in French.
    for (const name of ['Rouge', 'Vert', 'Bleu', 'Jaune']) {
      await expect(picker.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(picker.getByRole('button', { name: 'Annuler' })).toBeVisible()
    expect(englishFoundIn(await everythingSaid(host))).toEqual([])

    // And choosing one leaves the colour in play named in French on the felt.
    await picker.getByRole('button', { name: 'Bleu', exact: true }).click()
    await expect(host.getByText('Bleu en jeu')).toBeVisible()
    expect(englishFoundIn(await everythingSaid(host))).toEqual([])
    return
  }

  throw new Error('twelve deals in a row held no wild, which is not a plausible shuffle')
})

test('the English build is still English, so the switch is a switch', async ({ browser }) => {
  /* Guards the other direction. A "translation" that hard-codes French is not a
     translation, and this file would not have noticed. */
  const context = await browser.newContext({ locale: 'en-GB' })
  const page = await context.newPage()
  await page.goto('/')

  expect(await page.getAttribute('html', 'lang')).toBe('en')
  await expect(page.getByLabel('Your name')).toBeVisible()
})
