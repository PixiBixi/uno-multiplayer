import { expect, test, type Browser, type Page } from '@playwright/test'

/** One player is one browser context: its own localStorage, its own socket. */
async function openPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ['microphone'] })
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

test('two players reach a connected voice link', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Bo')
  await host.getByRole('button', { name: 'Start game' }).click()

  await host.getByRole('button', { name: 'Join voice' }).click()
  await guest.getByRole('button', { name: 'Join voice' }).click()

  // The roster is server state and settles first.
  await expect(host.getByText('Bo')).toBeVisible()

  /* The connection state is the assertion that matters: it proves ICE completed
     between two real browsers, which no unit test can establish. */
  await expect
    .poll(
      () =>
        host.evaluate(() =>
          document.querySelector('[data-voice-state]')?.getAttribute('data-voice-state'),
        ),
      { timeout: 20_000 },
    )
    .toBe('connected')

  await expect(host.getByText(/unavailable/i)).toHaveCount(0)
})
