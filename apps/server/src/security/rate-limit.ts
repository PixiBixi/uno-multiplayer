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

  return {
    allow(key) {
      const current = now()
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
