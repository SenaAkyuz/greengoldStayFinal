import { Logger } from '@nestjs/common';
import { DistributedThrottlerStorage } from './distributed-throttler.storage';
import { RateLimitStore } from './rate-limit.store';

describe('DistributedThrottlerStorage', () => {
  let storage: DistributedThrottlerStorage;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    storage = new DistributedThrottlerStorage(new RateLimitStore(null));
  });

  it('limit aşılana kadar isBlocked=false', async () => {
    const r1 = await storage.increment('ip1', 60_000, 2, 60_000, 'default');
    const r2 = await storage.increment('ip1', 60_000, 2, 60_000, 'default');
    expect(r1.totalHits).toBe(1);
    expect(r1.isBlocked).toBe(false);
    expect(r2.totalHits).toBe(2);
    expect(r2.isBlocked).toBe(false);
  });

  it('count > limit olunca isBlocked=true (guard 429 atar)', async () => {
    await storage.increment('ip2', 60_000, 2, 60_000, 'default');
    await storage.increment('ip2', 60_000, 2, 60_000, 'default');
    const r3 = await storage.increment('ip2', 60_000, 2, 60_000, 'default');
    expect(r3.totalHits).toBe(3);
    expect(r3.isBlocked).toBe(true);
    expect(r3.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('timeToExpire saniye cinsindendir', async () => {
    const r = await storage.increment('ip3', 60_000, 60, 60_000, 'default');
    expect(r.timeToExpire).toBeGreaterThan(0);
    expect(r.timeToExpire).toBeLessThanOrEqual(60);
    expect(r.timeToBlockExpire).toBe(0); // bloklanmadı
  });

  it("ayrı key'ler bağımsız sayılır", async () => {
    const a = await storage.increment('ipA', 60_000, 60, 60_000, 'default');
    const b = await storage.increment('ipB', 60_000, 60, 60_000, 'default');
    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(1);
  });
});
