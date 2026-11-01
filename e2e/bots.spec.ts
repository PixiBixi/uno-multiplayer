import { expect, test, type Page } from '@playwright/test'

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

/** Acts once if it is this player's turn; returns whether it did anything. */
async function actOnce(page: Page): Promise<boolean> {
  // Clicks give up fast: a view that changes under the click means the turn moved on.
  const quick = { timeout: 2_000 }
  if ((await page.getByText('your turn', { exact: true }).count()) === 0) return false

  const picker = page.getByRole('dialog', { name: /colour/i })
  if (await picker.isVisible()) {
    await picker.getByRole('button', { name: 'Blue', exact: true }).click(quick)
    return true
  }
  const playable = page.locator('.hand-card button:not([disabled])')
  if ((await playable.count()) > 0) {
    await playable.first().click(quick)
    return true
  }
  // Facing a stacked penalty the draw control is labelled "Take N" instead.
  for (const name of ['End turn', 'Draw card', /^Take \d+$/]) {
    const button = page.getByRole('button', { name })
    if ((await button.count()) > 0 && (await button.isEnabled())) {
      await button.click(quick)
      return true
    }
  }
  return false
}

test('solo player plays a round against three bots', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await (await browser.newContext()).newPage()
  await createGame(page, 'Ana')

  for (let bots = 1; bots <= 3; bots += 1) {
    await page.getByLabel('Level of the new bot').first().selectOption('easy')
    await page.getByRole('button', { name: 'Add a bot' }).first().click()
    await expect(page.locator('.bot-tag')).toHaveCount(bots)
  }
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(7)

  const roundOver = page.locator('.over-title')
  const deadline = Date.now() + 110_000
  let moves = 0
  while (!(await roundOver.isVisible())) {
    if (Date.now() > deadline) {
      throw new Error(`the round did not finish within 110 s: ${String(moves)} moves made`)
    }
    if (await actOnce(page).catch(() => false)) moves += 1
    else await page.waitForTimeout(100)
  }
  await expect(roundOver).toContainText(/the (round|match)/)
})

test('a dropped player is stood in for and takes the seat back', async ({ browser }) => {
  test.setTimeout(60_000)
  const host = await (await browser.newContext()).newPage()
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.locator('.hand-card')).toHaveCount(7)
  const roomLink = guest.url()

  await guest.close()
  // The stand-in takes over on Ben's turn, so the host plays until it comes round.
  const tookOver = host.getByText('A bot is playing for Ben').first()
  const deadline = Date.now() + 30_000
  while (!(await tookOver.isVisible())) {
    if (Date.now() > deadline) throw new Error('no bot took over for Ben within 30 s')
    if (!(await actOnce(host).catch(() => false))) await host.waitForTimeout(100)
  }

  // Once the host holds the turn the stand-in cannot move, so Ben's count is stable.
  await expect(host.getByText('your turn', { exact: true })).toBeVisible()
  const benSeat = host.locator('.seat', { hasText: 'Ben' })
  await expect(benSeat.getByText('Bot playing')).toBeVisible()
  const shown = Number(await benSeat.locator('.seat-count').textContent())

  const back = await guestContext.newPage()
  await back.goto(roomLink)
  await expect(back.locator('.hand-card')).toHaveCount(shown)
})
