import { expect, test, type Browser, type Page } from '@playwright/test'
import { settle } from './settle.js'

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
     is asserted by id in the server's views.test.ts.

     Counted by `data-face-down`, not by comparing the label to the English for
     "face-down". That label is translated now, so the old form would have counted
     every card as face-up on a French page and passed this test vacuously - a leak
     assertion that quietly stops asserting is worse than one that fails. */
  const faceUp = (page: Page) =>
    page
      .locator('[role="img"]')
      .evaluateAll((nodes) => nodes.filter((node) => !node.hasAttribute('data-face-down')).length)

  expect(await faceUp(host)).toBe(8)
  expect(await faceUp(guest)).toBe(8)
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
     legitimately costs a drawn card - see the test below - which would confound
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

test('the draw pile is still a card once the draw ghost has finished', async ({ browser }) => {
  /* A player reported the draw pile as a blank pale rectangle while every other
     back on the table drew correctly, and it was real.

     `.pile-draw::after` is the ghost card that peels off the pile: `background:
     var(--bone)`, `inset: 0`, and an animation from 0.55 opacity to 0. It declared
     no `opacity` of its own and no `animation-fill-mode`, so the moment the 420ms
     animation ended the element reverted to its un-animated opacity - the initial
     value, 1 - and the class is deliberately never removed, since `drawNonce > 0`
     for the rest of the game. An opaque cream rectangle then covered the pile for
     good, which is why the `UNO` text was still in the DOM and why the fanned backs
     beside it were fine: they have no `::after`.

     Measured after the animation finishes, on purpose. Screenshotting during it
     would show the ghost mid-flight and prove nothing, and this project has already
     rejected a real fix over a screenshot taken mid-transition. */
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  await host.getByRole('button', { name: 'Draw card' }).click()
  await expect(host.locator('.pile-draw')).toBeAttached()
  await expect(host.locator('.hand-card')).toHaveCount(8)

  /* Shared helper, and it skips animations that loop forever. Awaiting every animation
     here is what this line used to do, and the lit south bar - which is up whenever the
     move is yours, as it is right after a draw - timed the spec out. */
  await settle(host)

  const measured = await host.evaluate(() => {
    const pile = document.querySelector('.pile-draw')
    const back = pile?.querySelector('[data-back-word]')
    if (pile === null || back === null || back === undefined) {
      throw new Error('the draw pile is missing')
    }
    const ghost = getComputedStyle(pile, '::after')
    const box = back.getBoundingClientRect()

    /* And the flourish is still a flourish: read out of the keyframes rather than
       caught mid-flight, so the assertion is deterministic. Zeroing the base opacity
       must leave the ghost something to show while it flies - the cheapest wrong fix
       for the bug above is to delete the effect. */
    const opacityAtStart = [...document.styleSheets].flatMap((sheet) =>
      [...sheet.cssRules]
        .filter(
          (rule): rule is CSSKeyframesRule =>
            rule instanceof CSSKeyframesRule && rule.name === 'fxDrawGhost',
        )
        .flatMap((rule) =>
          [...rule.cssRules]
            .filter((frame): frame is CSSKeyframeRule => frame instanceof CSSKeyframeRule)
            .filter((frame) => frame.keyText === '0%')
            .map((frame) => Number(frame.style.opacity)),
        ),
    )

    return {
      ghostOpacity: Number(ghost.opacity),
      // Belt and braces: the word is not merely present, it is on screen with a size.
      wordVisible: box.width > 0 && box.height > 0,
      wordFill: getComputedStyle(back).fill,
      opacityAtStart,
    }
  })

  // The ghost has flown. Anything above zero is a veil left over the pile.
  expect(measured.ghostOpacity).toBe(0)
  expect(measured.wordVisible).toBe(true)
  expect(measured.wordFill).not.toBe('none')
  expect(measured.opacityAtStart).toHaveLength(1)
  expect(measured.opacityAtStart[0]).toBeGreaterThan(0)
})

test('the End turn control is on screen once a drawn card can be played', async ({ browser }) => {
  /* The one part of the drawn-card rule a jsdom test cannot settle: a player who draws and
     sees the Draw button go dead needs something in its place, on the felt, in a real
     browser. Driven by drawing on every turn, because the sub-state exists only after a
     voluntary draw whose card happens to be playable. */
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)
  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  for (const page of [host, guest]) await expect(page.locator('.hand-card')).toHaveCount(7)

  let deciding: Page | null = null
  for (let turn = 0; turn < 60 && deciding === null; turn += 1) {
    for (const page of [host, guest]) {
      const draw = page.getByRole('button', { name: 'Draw card' })
      if (await draw.isEnabled().catch(() => false)) {
        await draw.click()
        await page.waitForTimeout(100)
      }
      if (
        await page
          .getByRole('button', { name: 'End turn' })
          .isVisible()
          .catch(() => false)
      ) {
        deciding = page
        break
      }
    }
  }
  if (deciding === null) throw new Error('never reached the drawn-card decision')

  // The prompt is beside the control, which is the whole reason it exists.
  await expect(deciding.locator('.drawn-prompt')).toBeVisible()
  // And exactly one card is offered: the one just drawn, never the rest of the hand.
  await expect(deciding.locator('.hand-card button:not([disabled])')).toHaveCount(1)

  const held = await deciding.locator('.hand-card').count()
  await deciding.getByRole('button', { name: 'End turn' }).click()

  // The control goes with the turn, and the card stays: passing declines to play it.
  await expect(deciding.getByRole('button', { name: 'End turn' })).toHaveCount(0)
  await expect(deciding.locator('.hand-card')).toHaveCount(held)
  await expect(
    deciding
      .locator('.sys-line')
      .filter({ hasText: /ended (your|their) turn/ })
      .first(),
  ).toBeVisible()
})

test('a long log scrolls inside its panel instead of growing the page', async ({ browser }) => {
  /* Needs more chat than a person would ever send in a second, which the webServer
     block grants by raising CHAT_BURST. Against an already-running instance that
     block does not apply, so the limiter - correctly - stops this at 5 messages.
     Skipped rather than weakened: the assertion is about a long log, and a short
     one would prove nothing. */
  test.skip(
    process.env['E2E_BASE_URL'] !== undefined,
    'needs a raised chat rate limit, which only the suite-managed server has',
  )

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
  /* Contained rather than equal: every line names its author now, mine included, so the
     first line reads "You" and then the message. What is being guarded is which line is
     reachable at the top of the scroll box, not how it is composed. */
  expect(measured.firstLineText).toContain('line number 0')
})
