import type { Page } from '@playwright/test'

/**
 * Nothing is measured while it is still moving.
 *
 * Shared rather than copied into each spec, which is how this went wrong: one copy
 * learned to skip infinite animations and the other did not, and the table grew a
 * second forever-looping animation that hung the older copy for thirty seconds.
 *
 * Infinite animations are excluded rather than awaited. Their `finished` promise never
 * resolves, so waiting on it times the test out instead of failing it. The table has
 * two - the urgent clock and the lit south bar - and neither moves layout: they breathe
 * an opacity and a scale.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.allSettled(finite.map((animation) => animation.finished))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}
