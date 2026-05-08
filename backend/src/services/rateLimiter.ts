import type { IClock, ISlidingWindowStore } from './interfaces'

export class RedisSlidingWindowRateLimiter {
  constructor(
    private readonly deps: {
      store: ISlidingWindowStore
      clock: IClock
      windowMs: number
      maxRequests: number
    }
  ) {}

  async check(key: string) {
    const now = this.deps.clock.now()
    const windowStart = now - this.deps.windowMs
    await this.deps.store.prune(key, windowStart)
    const count = await this.deps.store.countSince(key, windowStart)
    if (count >= this.deps.maxRequests) {
      return { allowed: false as const, remaining: 0 }
    }
    await this.deps.store.add(key, now)
    return { allowed: true as const, remaining: this.deps.maxRequests - (count + 1) }
  }
}
