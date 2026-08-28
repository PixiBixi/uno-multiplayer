import { expect, test, type Browser, type Page } from '@playwright/test'
import { settle } from './settle.js'

/**
 * Layout, measured rather than looked at.
 *
 * Every assertion here is a number read out of a real browser after its
 * animations have finished. This project has shipped two defects that only
 * geometry showed, and once refused a fix for a "bug" that was a screenshot
 * caught mid-transition - so nothing in this file compares pixels.
 */

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 430, height: 940 }
/** An iPhone 13, the viewport the hand-below-the-fold defect was measured on. */
const SMALL_PHONE = { width: 390, height: 844 }

type Box = { top: number; bottom: number; left: number; right: number; width: number }

async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.evaluate((query) => {
    const node = document.querySelector(query)
    if (node === null) throw new Error(`nothing matched ${query}`)
    const rect = node.getBoundingClientRect()
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
    }
  }, selector)
}

test('the language and card-theme controls sit inside a desktop viewport, unscrolled', async ({
  page,
}) => {
  /* Both were at the bottom of the left column, below the name field, the match
     format, Blazing, three house rules, the create button and the join form. On a
     900px-tall window they were off screen entirely and players reported never
     finding them. The right column held only the card-values panel, with a
     screen-high void under it. */
  await page.setViewportSize(DESKTOP)
  await page.goto('/')
  await expect(page.locator('.theme-swatch').first()).toBeVisible()
  await settle(page)

  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    scrollY: window.scrollY,
  }))
  // Measured where the page loaded, not where a scroll left it.
  expect(viewport.scrollY).toBe(0)

  const themeRow = await boxOf(page, '.theme-grid')
  const langRow = await boxOf(page, '.lang-row')

  for (const [name, box] of [
    ['theme previews', themeRow],
    ['language chips', langRow],
  ] as const) {
    expect(box.top, `${name} start above the fold`).toBeGreaterThanOrEqual(0)
    expect(box.bottom, `${name} end above the fold`).toBeLessThanOrEqual(viewport.height)
    expect(box.width, `${name} are actually laid out`).toBeGreaterThan(0)
  }

  /* And they are in the column that had the room, not merely shorter. The order within
     that column changed with the redesign - the faces come first now, and the values
     panel under them - so what is asserted is the column, not the sequence: both
     controls sit to the right of the wordmark they used to be buried under. */
  const title = await boxOf(page, '.home-title')
  const help = await boxOf(page, '.help')
  expect(themeRow.left).toBeGreaterThanOrEqual(title.right - 1)
  expect(langRow.left).toBeGreaterThanOrEqual(title.right - 1)
  expect(help.left).toBeGreaterThanOrEqual(title.right - 1)
})

test('the phone layout keeps both controls on the page and never scrolls sideways', async ({
  page,
}) => {
  /* One column at this width, so "above the fold" is not the claim - the claim is
     that nothing was pushed out of the page sideways to make the desktop layout
     work, which is the usual cost of moving a wide control into a narrow column. */
  await page.setViewportSize(PHONE)
  await page.goto('/')
  await expect(page.locator('.theme-swatch').first()).toBeVisible()
  await settle(page)

  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>('.home *')]
      .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
      .map((node) => node.className),
  }))

  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.innerWidth + 1)
  expect(measured.overflowing).toEqual([])

  /* Still both there, and still in the tail of the column rather than lost above the
     forms. The order inside that tail changed with the redesign - the faces lead now and
     the values panel follows - so the sequence asserted is the one the page actually
     claims: faces, values, language. */
  const themeRow = await boxOf(page, '.theme-grid')
  const help = await boxOf(page, '.help')
  const langRow = await boxOf(page, '.lang-row')
  expect(help.top).toBeGreaterThanOrEqual(themeRow.bottom - 1)
  expect(langRow.top).toBeGreaterThanOrEqual(help.bottom - 1)

  // A tap target is a tap target on a phone especially.
  const swatch = await page.locator('.theme-swatch').first().boundingBox()
  expect(swatch?.height ?? 0).toBeGreaterThanOrEqual(44)
})

/**
 * The lobby, which took the whole table configuration on and roughly doubled.
 *
 * Measured rather than assumed, on the viewport this project has already been bitten on.
 * Two separate claims: nothing is pushed sideways, and the panels that grew have not
 * pushed the seats and the Start button down the page - those are what a lobby is for,
 * and the points table is pure reference, so it is the one that gets capped.
 */
async function openLobby(page: Page, browser: Browser): Promise<Page> {
  await page.goto('/')
  await page.getByLabel('Your name').fill('Ana')
  await page.getByRole('button', { name: 'Create a game' }).click()
  const code = (await page.locator('.code-display').textContent())?.trim() ?? ''

  // A second seat, so the roster is the height it is in a real game rather than one row.
  const guest = await (await browser.newContext()).newPage()
  await guest.goto('/')
  await guest.getByLabel('Your name').fill('Ben')
  await guest.getByLabel('Game code').fill(code)
  await guest.getByRole('button', { name: 'Join game' }).click()
  await expect(page.locator('.roster').getByText('Ben')).toBeVisible()
  return guest
}

test('the lobby fits a 390px phone sideways and keeps the seats above the fold', async ({
  page,
  browser,
}) => {
  await page.setViewportSize(SMALL_PHONE)
  const guest = await openLobby(page, browser)
  await expect(page.getByRole('checkbox', { name: /Seven-Zero/ })).toBeVisible()
  await settle(page)

  const measured = await page.evaluate(() => {
    const values = document.querySelector('.lobby-values')
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      pageHeight: document.querySelector('.lobby')?.getBoundingClientRect().height ?? 0,
      overflowing: [...document.querySelectorAll<HTMLElement>('.lobby *')]
        .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
        .map((node) => node.className),
      // The points table is the panel that takes the scroll, and it must really do so
      // rather than merely declare an overflow it never uses.
      valuesHeight: values?.getBoundingClientRect().height ?? 0,
      valuesOverflow: values === null ? '' : getComputedStyle(values).overflowY,
    }
  })

  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.innerWidth + 1)
  expect(measured.overflowing).toEqual([])

  /* The seats and the control that ends the waiting, both inside the fold with the page
     unscrolled. The configuration below them is allowed to need a scroll; these are not,
     which is the whole reason Start stays above the settings rather than under them. */
  const roster = await boxOf(page, '.roster')
  const start = await boxOf(page, '.btn-primary')
  expect(roster.top).toBeGreaterThanOrEqual(0)
  expect(start.bottom).toBeLessThanOrEqual(measured.innerHeight)

  /* Capped, so the panel that is pure reference cannot own the page, and able to scroll
     inside that cap. Asserted as the capability rather than as "it is scrolling right
     now": the second form was really an assertion about how many rows the points table
     happens to have, and it broke the day the panel lost its padding. */
  expect(measured.valuesHeight).toBeLessThanOrEqual(measured.innerHeight * 0.45)
  expect(measured.valuesOverflow).toBe('auto')

  // Reported so the numbers are in the run output, not only in a passing assertion.
  console.log('lobby at 390x844:', JSON.stringify(measured))
  await guest.context().close()
})

test('the lobby uses the second column on a desktop instead of one tall stack', async ({
  page,
  browser,
}) => {
  /* The same fix the card-theme controls got, for the same reason: the cheapest answer to
     "it does not fit" is the empty half of the page. */
  await page.setViewportSize(DESKTOP)
  const guest = await openLobby(page, browser)
  await expect(page.getByRole('checkbox', { name: /Seven-Zero/ })).toBeVisible()
  await settle(page)

  const roster = await boxOf(page, '.roster')
  const rules = await boxOf(page, '.rule')
  // Beside the seats, not under them.
  expect(rules.left).toBeGreaterThan(roster.right)

  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    scrollY: window.scrollY,
  }))
  expect(viewport.scrollY).toBe(0)
  const start = await boxOf(page, '.btn-primary')
  expect(start.bottom).toBeLessThanOrEqual(viewport.height)
  await guest.context().close()
})

test('the home screen no longer runs two and a half phone screens tall', async ({ page }) => {
  /* The ergonomic half of the defect, measured on the same viewport as the rest: 21
     controls, 2.42 screens of them, with the game-code field last - below a match format,
     a clock and four rules that a joining player has no use for. Two of three arrivals are
     joining.
  
     Asserted as a ratio rather than a pixel count, because the claim is about screens
     rather than about a font metric, and asserted at all so the screen cannot quietly grow
     back the next time something looks like it belongs here. */
  await page.setViewportSize(SMALL_PHONE)
  await page.goto('/')
  await expect(page.locator('.theme-swatch').first()).toBeVisible()
  await settle(page)

  const measured = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    pageHeight: document.querySelector('.home')?.getBoundingClientRect().height ?? 0,
    // Every control a person can operate, which is the figure the defect was reported as.
    controls: document.querySelectorAll('.home button, .home input, .home select').length,
    // The code field is what most arrivals came for, so where it sits is the whole point.
    codeFieldTop: document.querySelector('#room-code')?.getBoundingClientRect().top ?? 0,
  }))

  console.log('home at 390x844:', JSON.stringify(measured))
  /* Measured at 1208px, 1.43 screens, down from 2043px and 2.42. The bounds moved once,
     deliberately: the palette switch added three controls and the row that holds them, so
     11 controls became 14 and 1.25 screens became 1.43. What the guard is for is a drift
     back towards the old shape - 2.42 screens and 21 controls - and 1.55 and 16 still
     catch that with room for a font metric. Moving them again wants the same paragraph:
     say what was added and what it cost. */
  expect(measured.pageHeight / measured.innerHeight).toBeLessThan(1.55)
  expect(measured.controls).toBeLessThan(16)
  // Reachable without scrolling, which it was not.
  expect(measured.codeFieldTop).toBeLessThan(measured.innerHeight)
})

/**
 * The two turn states, measured on the table rather than looked at.
 *
 * They have to be told apart at a glance, which is a claim about geometry: the inked slab
 * has to be a different shape from the bare headline, the up-next queue has to be laid out
 * rather than merely present, and the lit south bar must not swallow the cards under it.
 */
test('the seat on turn and the seat waiting are laid out as two different things', async ({
  page,
  browser,
}) => {
  await page.setViewportSize(DESKTOP)
  const guest = await openLobby(page, browser)
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(7)
  await expect(guest.locator('.hand-card')).toHaveCount(7)
  await settle(page)
  await settle(guest)

  /* Whoever the deal put on turn. Read from the DOM rather than assumed: the host is not
     always seat 0's turn once a reverse or a skip has been dealt as the first card. */
  const onTurn = (await page.locator('.turn-headline-mine').count()) > 0 ? page : guest
  const waiting = onTurn === page ? guest : page

  const slab = await boxOf(onTurn, '.turn-headline-mine')
  const bare = await boxOf(waiting, '.turn-headline')

  // The slab is painted, which is the whole point: a bare headline has no background.
  const slabInk = await onTurn.evaluate(
    () => getComputedStyle(document.querySelector('.turn-headline-mine')!).backgroundColor,
  )
  const bareInk = await waiting.evaluate(
    () => getComputedStyle(document.querySelector('.turn-headline')!).backgroundColor,
  )
  expect(slabInk, 'the slab is filled').not.toBe(bareInk)
  expect(bareInk, 'the waiting headline is not').toBe('rgba(0, 0, 0, 0)')

  // Both are actually laid out, and neither runs off the column it sits in.
  const centre = await boxOf(onTurn, '.table-centre')
  for (const [name, box] of [
    ['the slab', slab],
    ['the bare headline', bare],
  ] as const) {
    expect(box.width, `${name} is laid out`).toBeGreaterThan(0)
  }
  expect(slab.right, 'the slab stays inside the centre column').toBeLessThanOrEqual(
    centre.right + 1,
  )
  /* And it hugs the words rather than filling the block it sits in. Measured against
     `.turn-block` and not against the centre column: a stretched slab is still only
     about half the centre, so comparing with the wider box passes on the very layout
     that shipped. `.turn-block` is a flex column, the headline was a stretched flex
     item, and `inline-block` did nothing about it. It read as a banner. */
  const block = await boxOf(onTurn, '.turn-block')
  expect(slab.width, 'the slab hugs its words').toBeLessThan(block.width - 8)

  /* Its box is tall enough for the ink it holds. Every heading here carries
     `line-height: 0.92`, which sliced the accent off a capital À at the top edge - a
     crop no bounding box reports, so the line height is what gets asserted. */
  const slabType = await onTurn.evaluate(() => {
    const node = document.querySelector('.turn-headline-mine')
    if (node === null) throw new Error('no slab')
    const style = getComputedStyle(node)
    return { size: parseFloat(style.fontSize), leading: parseFloat(style.lineHeight) }
  })
  expect(slabType.leading, 'the slab leaves room for an accented capital').toBeGreaterThan(
    slabType.size,
  )

  // The queue is a row of names, not an empty heading.
  const queue = await boxOf(waiting, '.up-next')
  expect(queue.width).toBeGreaterThan(0)
  expect(await waiting.locator('.up-next-name').count()).toBeGreaterThan(0)
  const headlineBox = await boxOf(waiting, '.turn-headline')
  expect(queue.top, 'the queue sits under the headline it answers').toBeGreaterThanOrEqual(
    headlineBox.bottom - 1,
  )

  /* The lit ring is drawn over the hand, so it has to be transparent to a click. A ring
     that eats card clicks is a table that has stopped responding. */
  const ringPassesClicks = await onTurn.evaluate(() => {
    const ring = document.querySelector('.south-live')
    if (ring === null) return 'no lit south bar'
    return getComputedStyle(ring, '::after').pointerEvents
  })
  expect(ringPassesClicks).toBe('none')

  // And the cards under it are still the thing a click lands on.
  const card = onTurn.locator('.hand-card').first()
  const point = await card.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const hit = await onTurn.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.hand-card') !== null,
    point,
  )
  expect(hit, 'a card is what a click on a card reaches').toBe(true)

  // Nothing new pushes the table sideways at a desktop width.
  const sideways = await onTurn.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(sideways.scrollWidth).toBeLessThanOrEqual(sideways.innerWidth + 1)
})
