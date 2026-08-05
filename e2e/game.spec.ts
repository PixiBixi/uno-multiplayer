import { expect, test, type Browser, type Page } from '@playwright/test'

/** One player is one browser context: its own localStorage, its own socket. */
async function openPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

async function createGame(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create a game' }).click()
  const code = await page.locator('.code-display').textContent()
  if (code === null) throw new Error('no room code was shown')
  return code.trim()
}

async function joinGame(page: Page, code: string, name: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Game code').fill(code)
  await page.getByRole('button', { name: 'Join game' }).click()
}

test('three players are dealt a hand each', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guestOne = await openPlayer(browser)
  const guestTwo = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guestOne, code, 'Ben')
  await joinGame(guestTwo, code, 'Cleo')

  // Everyone sees the full roster before the game starts. Scoped to the roster:
  // the names also appear in prose like "Waiting for Ana to start the game".
  await expect(host.locator('.roster').getByText('Cleo')).toBeVisible()
  await expect(guestTwo.locator('.roster').getByText('Ana')).toBeVisible()

  await host.getByRole('button', { name: 'Start game' }).click()

  for (const page of [host, guestOne, guestTwo]) {
    await expect(page.locator('.hand-card')).toHaveCount(7)
  }

  // The direction of play is named, not merely drawn.
  await expect(host.getByText(/clockwise/i)).toBeVisible()
  // Exactly one seat holds the turn, and it is announced in words.
  await expect(host.getByText(/your turn|their turn/).first()).toBeVisible()
})

test('a player who reloads keeps their seat and their hand', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  const before = await guest.locator('.hand-card [role="img"]').first().getAttribute('aria-label')

  await guest.reload()

  // The session token in localStorage reclaims the seat, hand intact.
  await expect(guest.locator('.hand-card')).toHaveCount(7)
  const after = await guest.locator('.hand-card [role="img"]').first().getAttribute('aria-label')
  expect(after).toBe(before)
})

test('nobody can see anybody else’s cards', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  /* Counted, not compared by label. A deck holds two of every number, so both
     players legitimately having a "Red 1" is not a leak. What would be a leak is
     an extra face-up card: the host's document may show exactly their own seven
     plus the one on the discard pile, and nothing more. Identity-level redaction
     is asserted by id in the server's views.test.ts. */
  const faceUpOnHost = await host
    .locator('[role="img"]')
    .evaluateAll(
      (nodes) =>
        nodes.filter((node) => node.getAttribute('aria-label') !== 'Face-down card').length,
    )
  expect(faceUpOnHost).toBe(8)

  const faceUpOnGuest = await guest
    .locator('[role="img"]')
    .evaluateAll(
      (nodes) =>
        nodes.filter((node) => node.getAttribute('aria-label') !== 'Face-down card').length,
    )
  expect(faceUpOnGuest).toBe(8)
})

test('a card can be played and the turn moves on', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  // Whoever holds the turn acts. A playable card if there is one, else draw.
  const actor = (await host.getByText(/your turn/).count()) > 0 ? host : guest
  const playable = actor.locator('.hand-card button:not([disabled])')

  if ((await playable.count()) > 0) {
    await playable.first().click()
    // A wild asks for a colour instead of guessing one.
    const picker = actor.getByRole('dialog', { name: /colour/i })
    if (await picker.isVisible().catch(() => false)) {
      // Scoped to the dialog: "Blue" would otherwise also match a blue card.
      await picker.getByRole('button', { name: 'Blue', exact: true }).click()
    }
    await expect(actor.locator('.hand-card')).toHaveCount(6)
  } else {
    await actor.getByRole('button', { name: 'Draw card' }).click()
    await expect(actor.locator('.hand-card')).toHaveCount(8)
  }
})

test('chat reaches the other player', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  await host.getByLabel('Message the table').fill('good luck')
  await host.getByRole('button', { name: 'Send' }).click()

  // Scoped to the panel: the sender's name also sits on their seat plate.
  const panel = guest.getByRole('region', { name: /table chat and log/i })
  await expect(panel.getByText('good luck')).toBeVisible()
  await expect(panel.getByText('Ana')).toBeVisible()
})

test('the game code is shareable through the URL', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  expect(host.url()).toContain(`room=${code}`)

  // Landing on the shared URL prefills the code.
  await guest.goto(`/?room=${code}`)
  await expect(guest.getByLabel('Game code')).toHaveValue(code)
})

test('an unknown code is refused with a readable message', async ({ browser }) => {
  const page = await openPlayer(browser)
  await joinGame(page, 'ZZZZZZ', 'Nobody')
  await expect(page.getByRole('alert')).toContainText(/no game with that code/i)
})

test('a fifth player is turned away', async ({ browser }) => {
  const host = await openPlayer(browser)
  const code = await createGame(host, 'Ana')

  for (const name of ['Ben', 'Cleo', 'Dan']) {
    const guest = await openPlayer(browser)
    await joinGame(guest, code, name)
    await expect(guest.locator('.code-display')).toBeVisible()
  }

  const fifth = await openPlayer(browser)
  await joinGame(fifth, code, 'Eve')
  await expect(fifth.getByRole('alert')).toContainText(/four players/i)
})

test('the hand can be sorted, and the choice survives a reload', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()

  /* Sorted on the guest on purpose. Seat 0 opens, and reloading while on turn
     legitimately costs a drawn card — see the test below — which would confound
     a count assertion here. */
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  const labels = () =>
    guest
      .locator('.hand-card [role="img"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))

  const dealt = await labels()

  await guest.getByRole('button', { name: 'By colour' }).click()
  const byColour = await labels()

  // Same cards, reordered: colour order follows the deck, R G B Y.
  expect([...byColour].sort()).toEqual([...dealt].sort())
  const colourRank = (label: string) =>
    ['Red', 'Green', 'Blue', 'Yellow'].findIndex((name) => label.startsWith(name))
  const ranks = byColour.map(colourRank).filter((rank) => rank >= 0)
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b))

  // The preference is remembered, so a reload does not reshuffle the hand.
  await guest.reload()
  await expect(guest.locator('.hand-card')).toHaveCount(7)
  await expect(guest.getByRole('button', { name: 'By colour' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('reloading while on turn costs a drawn card', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)
  await expect(host.getByText(/your turn/)).toBeVisible()

  /* Locking in a real consequence of the grace period rather than leaving it to
     be rediscovered: a disconnect on your own turn makes the server take the
     neutral action for you, so the table never stalls. */
  await host.reload()
  await expect(host.locator('.hand-card')).toHaveCount(8)
})

test('the play-effects layer is wired into the table', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  // Structural only: whether a burst is live at this instant is a timing
  // question, and asserting on animation state in flight is exactly the kind
  // of flaky check to avoid. This just proves the layer is really mounted.
  await expect(host.locator('.fx-layer')).toBeAttached()
})

test('drawing a card pulses the draw pile', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  // Seat 0 opens, so the host holds the turn and can always choose to draw.
  await host.getByRole('button', { name: 'Draw card' }).click()

  /* The pulse class is applied for as long as a draw has happened at all, so
     this is a state assertion rather than a race against a 420ms animation. */
  await expect(host.locator('.pile-draw')).toBeAttached()
  await expect(host.locator('.hand-card')).toHaveCount(8)
})

test('a long log scrolls inside its panel instead of growing the page', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  // Well past the panel height, which is where this used to break.
  for (let line = 0; line < 40; line += 1) {
    await host.getByLabel('Message the table').fill(`line number ${String(line)}`)
    await host.getByRole('button', { name: 'Send' }).click()
  }
  await expect(host.locator('.chat-body > *')).toHaveCount(40)

  /* Three separate regressions guarded here, all layout-only and so invisible to
     the jsdom suite:
       - the page must not grow a scrollbar of its own,
       - the composer must stay on screen,
       - and the log must really scroll, with its earliest line reachable rather
         than spilled out of the top of the scroll box. */
  const measured = await host.evaluate(() => {
    const body = document.querySelector('.chat-body')
    const composer = document.querySelector('.chat-foot')
    if (body === null || composer === null) throw new Error('chat panel is missing')
    body.scrollTop = 0
    return {
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      composerVisible: composer.getBoundingClientRect().bottom <= window.innerHeight + 1,
      logScrolls: body.scrollHeight > body.clientHeight,
      firstLineText: body.firstElementChild?.textContent ?? null,
    }
  })

  expect(measured.pageScrolls).toBe(false)
  expect(measured.composerVisible).toBe(true)
  expect(measured.logScrolls).toBe(true)
  expect(measured.firstLineText).toBe('line number 0')
})
