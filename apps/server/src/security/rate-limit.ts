export type RateLimiter = {
  allow(key: string): boolean
  forget(key: string): void
  size(): number
}

type Bucket = { tokens: number; lastRefill: number }

/**
 * Token bucket per key. The clock is injectable so tests run instantly and
 * deterministically instead of waiting on real time.
 */
export function createRateLimiter(options: {
  capacity: number
  refillPerSecond: number
  now?: () => number
}): RateLimiter {
  const { capacity, refillPerSecond } = options
  const now = options.now ?? (() => Date.now())
  const buckets = new Map<string, Bucket>()
  // A bucket idle this long is full again, the same as no bucket: safe to drop.
  const refillMs = (capacity / refillPerSecond) * 1000
  let lastSweep = now()

  /* Keys outlive their socket once they are client IPs, so nothing calls forget for them.
     At most one pass per refill period, so the cost stays linear in the keys swept. */
  const sweep = (current: number): void => {
    if (current - lastSweep < refillMs) return
    lastSweep = current
    for (const [key, bucket] of buckets) {
      if (current - bucket.lastRefill >= refillMs) buckets.delete(key)
    }
  }

  return {
    allow(key) {
      const current = now()
      sweep(current)
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: current }
      const elapsedSeconds = Math.max(0, current - bucket.lastRefill) / 1000
      const tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond)

      if (tokens < 1) {
        buckets.set(key, { tokens, lastRefill: current })
        return false
      }
      buckets.set(key, { tokens: tokens - 1, lastRefill: current })
      return true
    },
    forget(key) {
      buckets.delete(key)
    },
    size() {
      return buckets.size
    },
  }
}
