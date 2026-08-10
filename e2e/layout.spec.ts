import { expect, test, type Page } from '@playwright/test'

/**
 * Layout, measured rather than looked at.
 *
 * Every assertion here is a number read out of a real browser after its
 * animations have finished. This project has shipped two defects that only
 * geometry showed, and once refused a fix for a "bug" that was a screenshot
 * caught mid-transition — so nothing in this file compares pixels.
 */

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 430, height: 940 }

/** Nothing is measured while it is still moving. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

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

  const themeRow = await boxOf(page, '.theme-row')
  const langRow = await boxOf(page, '.lang-row:not(.theme-row)')

  for (const [name, box] of [
    ['theme previews', themeRow],
    ['language chips', langRow],
  ] as const) {
    expect(box.top, `${name} start above the fold`).toBeGreaterThanOrEqual(0)
    expect(box.bottom, `${name} end above the fold`).toBeLessThanOrEqual(viewport.height)
    expect(box.width, `${name} are actually laid out`).toBeGreaterThan(0)
  }

  /* And they are in the column that had the room, not merely shorter: the help
     panel is the right column's first child and both controls sit under it. */
  const help = await boxOf(page, '.help')
  expect(themeRow.top).toBeGreaterThanOrEqual(help.bottom - 1)
  expect(themeRow.left).toBeGreaterThanOrEqual(help.left - 1)
})

test('the phone layout keeps both controls on the page and never scrolls sideways', async ({
  page,
}) => {
  /* One column at this width, so "above the fold" is not the claim — the claim is
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

  // Still both there, and still after the help panel rather than lost above it.
  const help = await boxOf(page, '.help')
  const themeRow = await boxOf(page, '.theme-row')
  const langRow = await boxOf(page, '.lang-row:not(.theme-row)')
  expect(themeRow.top).toBeGreaterThanOrEqual(help.bottom - 1)
  expect(langRow.top).toBeGreaterThanOrEqual(themeRow.bottom - 1)

  // A tap target is a tap target on a phone especially.
  const swatch = await page.locator('.theme-swatch').first().boundingBox()
  expect(swatch?.height ?? 0).toBeGreaterThanOrEqual(44)
})
