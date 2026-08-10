import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * The table configuration, in two real browsers.
 *
 * The point of moving it into the lobby is that a guest can see what they are about to
 * play by. That is a claim about two documents, so it needs two of them: a component test
 * proves the panel renders what it is handed, and a socket test proves the server
 * broadcasts to every member, and neither proves a guest's screen changes. This project
 * has shipped two defects that were exactly that gap.
 */

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

/** What a read-only panel says about one rule: the value beside its name. */
function ruleState(page: Page, name: RegExp) {
  return page.locator('.rule-state').filter({ hasText: name }).locator('strong')
}

test('the guest sees the host toggle a rule, before anything is dealt', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await expect(guest.locator('.roster').getByText('Ana')).toBeVisible()

  // The guest starts out reading the defaults, not a blank panel.
  await expect(ruleState(guest, /Seven-Zero/)).toHaveText('off')
  await expect(ruleState(guest, /jump-in/i)).toHaveText('off')

  /* `.click()` rather than `.check()`, and the difference is the design: every control
     here is rendered from the lobby view the server pushed, so the box does not flip until
     the change comes back. `.check()` asserts the new state the instant after the click and
     would be asserting that the client decided on its own — which is the one thing it must
     not do, because the server is free to refuse. */
  await host.getByRole('checkbox', { name: /Seven-Zero/ }).click()
  await expect(host.getByRole('checkbox', { name: /Seven-Zero/ })).toBeChecked()

  /* The assertion the whole change exists for. Nobody has dealt, the guest has touched
     nothing, and their screen changed because the server broadcast to every member rather
     than answering the sender. */
  await expect(ruleState(guest, /Seven-Zero/)).toHaveText('on')
  await expect(ruleState(guest, /jump-in/i)).toHaveText('off')
  await expect(guest.locator('.hand-card')).toHaveCount(0)

  // A second field, and the one that used to arrive on the wire and be thrown away.
  await host.getByRole('button', { name: 'A set number of rounds' }).click()
  await expect(guest.getByText(/Best of 3 rounds/)).toBeVisible()

  // And a clock, which a guest had no way at all of learning about before playing.
  await host.getByRole('checkbox', { name: 'Put a clock on every turn' }).click()
  await expect(guest.getByText(/15 seconds per turn/)).toBeVisible()
})

test('a guest is given no control to configure the table with', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await expect(guest.locator('.roster').getByText('Ana')).toBeVisible()

  // Not disabled controls — none at all, and the host has the four the guest lacks.
  await expect(guest.getByRole('checkbox')).toHaveCount(0)
  await expect(host.getByRole('checkbox')).toHaveCount(5)
  await expect(guest.getByText(/Ana sets these for the table/)).toBeVisible()
})

test('a rule chosen in the lobby is the rule the round is dealt with', async ({ browser }) => {
  /* The end of the chain. Everything above is about what a screen says; this is about
     whether the engine received it, and it is the half a component test and a socket test
     between them still leave open.

     `playDrawnCard` is the flag to prove it with, because switching it OFF has an effect
     that does not depend on the shuffle: with the rule on, a voluntary draw may or may not
     end the turn depending on whether the card happens to be playable, and with it off a
     draw always ends the turn. Seat 0 always opens and can always draw, so this cannot
     pass vacuously — something has to change hands. Seven-Zero would have been the obvious
     choice and is the wrong one: its visible effect needs a 7 within reach, which is a
     question about the deal. */
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await expect(guest.locator('.roster').getByText('Ana')).toBeVisible()

  await host.getByRole('checkbox', { name: /drawn card/ }).click()
  await expect(host.getByRole('checkbox', { name: /drawn card/ })).not.toBeChecked()
  await expect(ruleState(guest, /drawn card/)).toHaveText('off')

  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  // The configuration is frozen, and the host's controls are gone with it.
  await expect(host.getByRole('checkbox')).toHaveCount(0)

  // Seat 0 opens, so the host holds the turn and may always draw.
  await expect(host.getByText(/your turn/)).toBeVisible()
  await host.getByRole('button', { name: 'Draw card' }).click()

  /* The rule is off, so the draw ended the turn — no End turn control, no one-card hand,
     and the turn is at the other seat. Every one of those would be false on a table
     playing the default, which is what makes this an assertion about the flag. */
  await expect(host.locator('.hand-card')).toHaveCount(8)
  await expect(host.getByRole('button', { name: 'End turn' })).toHaveCount(0)
  await expect(host.locator('.drawn-prompt')).toHaveCount(0)
  await expect(guest.getByText(/your turn/)).toBeVisible()
})
