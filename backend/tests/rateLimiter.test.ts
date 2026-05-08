import { RedisSlidingWindowRateLimiter } from '../src/services/rateLimiter'
import { FakeClock, FakePrisma, FakeSlidingWindowStore } from './fakes'

describe('RedisSlidingWindowRateLimiter', () => {
  let db: FakePrisma
  let clock: FakeClock
  let limiter: RedisSlidingWindowRateLimiter

  beforeEach(() => {
    db = new FakePrisma()
    clock = new FakeClock()
    const store = new FakeSlidingWindowStore(db)
    limiter = new RedisSlidingWindowRateLimiter({
      store,
      clock,
      windowMs: 60_000,
      maxRequests: 3,
    })
  })

  it('allow under limit', async () => {
    clock.set(1_000)
    await expect(limiter.check('k1')).resolves.toEqual({ allowed: true, remaining: 2 })
  })

  it('block over limit', async () => {
    clock.set(1_000)
    await limiter.check('k1')
    await limiter.check('k1')
    await limiter.check('k1')
    await expect(limiter.check('k1')).resolves.toEqual({ allowed: false, remaining: 0 })
  })

  it("different keys don't interfere", async () => {
    clock.set(1_000)
    await limiter.check('k1')
    await limiter.check('k1')
    await limiter.check('k1')
    await expect(limiter.check('k2')).resolves.toEqual({ allowed: true, remaining: 2 })
  })

  it('blocks across the correct window duration', async () => {
    clock.set(1_000)
    await limiter.check('k1')
    await limiter.check('k1')
    await limiter.check('k1')
    await expect(limiter.check('k1')).resolves.toEqual({ allowed: false, remaining: 0 })
    clock.tick(59_000)
    await expect(limiter.check('k1')).resolves.toEqual({ allowed: false, remaining: 0 })
    clock.tick(2_000)
    await expect(limiter.check('k1')).resolves.toEqual({ allowed: true, remaining: 2 })
  })
})
