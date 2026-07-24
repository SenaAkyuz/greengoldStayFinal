import { Logger } from '@nestjs/common';
import { RateLimitStore, RedisLike } from './rate-limit.store';

/**
 * Gerçek bir Redis sunucusu paylaşan iki "instance"ı simüle eder: aynı FakeRedis
 * örneğini iki RateLimitStore'a verince sayaç paylaşılır (INCR/PEXPIRE/PTTL).
 */
class FakeSharedRedis implements RedisLike {
  private readonly store = new Map<
    string,
    { count: number; expireAt: number }
  >();

  // eslint-disable-next-line @typescript-eslint/require-await
  async eval(
    _script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown> {
    const key = keys[0];
    const windowMs = Number(args[0]);
    const now = Date.now();
    let e = this.store.get(key);
    if (!e || now >= e.expireAt) {
      e = { count: 0, expireAt: now + windowMs };
      this.store.set(key, e);
    }
    e.count += 1; // INCR
    const pttl = Math.max(0, e.expireAt - now); // PTTL
    return [e.count, pttl];
  }
}

describe('RateLimitStore', () => {
  describe('bellek-içi fallback (Redis env yok)', () => {
    it('distributed=false ve başlangıçta UYARI loglar', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const store = new RateLimitStore(null);
      expect(store.distributed).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('bellek içi'));
      warn.mockRestore();
    });

    it('aynı key art arda vuruşlarda sayacı artırır', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const store = new RateLimitStore(null);
      expect((await store.hit('k', 60_000)).count).toBe(1);
      expect((await store.hit('k', 60_000)).count).toBe(2);
      expect((await store.hit('k', 60_000)).count).toBe(3);
    });

    it('İKİ ayrı bellek-içi instance sayacı PAYLAŞMAZ (dağıtık değil)', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const a = new RateLimitStore(null);
      const b = new RateLimitStore(null);
      await a.hit('k', 60_000);
      // b kendi belleğini kullanır -> yine 1, paylaşım yok.
      expect((await b.hit('k', 60_000)).count).toBe(1);
    });
  });

  describe('dağıtık (Upstash Redis) — paylaşımlı store simülasyonu', () => {
    it('distributed=true ve iki instance AYNI sayacı paylaşır', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const shared = new FakeSharedRedis();
      const instanceA = new RateLimitStore(shared);
      const instanceB = new RateLimitStore(shared);

      expect(instanceA.distributed).toBe(true);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('dağıtık'));

      // Farklı instance'lardan gelen istekler tek sayaçta birikir.
      expect((await instanceA.hit('same', 60_000)).count).toBe(1);
      expect((await instanceB.hit('same', 60_000)).count).toBe(2);
      expect((await instanceA.hit('same', 60_000)).count).toBe(3);
      log.mockRestore();
    });

    it('ttlMs pencereden gelir (PTTL)', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const store = new RateLimitStore(new FakeSharedRedis());
      const hit = await store.hit('k', 30_000);
      expect(hit.ttlMs).toBeGreaterThan(0);
      expect(hit.ttlMs).toBeLessThanOrEqual(30_000);
    });
  });
});
