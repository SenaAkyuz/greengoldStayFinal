import { Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

/**
 * Dağıtık rate-limit sayacı — hem @nestjs/throttler storage'ı hem
 * widget-key-rate.guard AYNI store'u paylaşır.
 *
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN varsa: Upstash Redis (REST).
 *   Sabit-pencere: INCR + ilk vuruşta PEXPIRE, tek atomik round-trip (Lua).
 *   Vercel'de instance'lar arası PAYLAŞILIR — Adım 8 koruması dağıtık kalır.
 * - Env yoksa: bellek-içi fallback + başlangıçta UYARI logu. Best-effort, tek
 *   instance'ta geçerli — çok-instance deploy'da güvenilir değildir.
 */
export interface RateHit {
  /** Bu penceredeki güncel toplam vuruş. */
  count: number;
  /** Pencerenin bitişine kalan süre (ms). */
  ttlMs: number;
}

/** @upstash/redis Redis client'ının kullandığımız alt kümesi (test için injectable). */
export interface RedisLike {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown>;
}

// Atomik sabit-pencere: INCR; ilk vuruşsa PEXPIRE ile pencereyi başlat; kalan PTTL.
const INCR_WINDOW_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
return {c, redis.call('PTTL', KEYS[1])}
`;

export class RateLimitStore {
  private readonly logger = new Logger('RateLimitStore');
  private readonly redis: RedisLike | null;
  private readonly mem = new Map<string, { count: number; resetAt: number }>();

  /**
   * @param injectedRedis Testte sahte/paylaşımlı client vermek için; verilmezse
   * env'den Upstash client kurulur, o da yoksa bellek-içi fallback'e düşülür.
   */
  constructor(injectedRedis?: RedisLike | null) {
    if (injectedRedis !== undefined) {
      this.redis = injectedRedis;
    } else {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      this.redis = url && token ? new Redis({ url, token }) : null;
    }

    if (this.redis) {
      this.logger.log('Rate limit: dağıtık (Upstash Redis) aktif.');
    } else {
      this.logger.warn(
        'UYARI: rate limit bellek içi (best-effort) — dağıtık değil. ' +
          'Çok-instance deploy için UPSTASH_REDIS_REST_URL/TOKEN ayarlayın.',
      );
    }
  }

  /** Aktif store dağıtık mı (Upstash bağlı mı). */
  get distributed(): boolean {
    return this.redis !== null;
  }

  /** key için pencerede bir vuruş kaydeder ve güncel sayacı döndürür. */
  async hit(key: string, windowMs: number): Promise<RateHit> {
    if (this.redis) {
      const res = (await this.redis.eval(
        INCR_WINDOW_LUA,
        [key],
        [windowMs],
      )) as [number, number];
      const count = Number(res[0]);
      const pttl = Number(res[1]);
      // PTTL: -1 (süre yok) / -2 (key yok) durumunda pencereyi baz al.
      return { count, ttlMs: pttl >= 0 ? pttl : windowMs };
    }
    return this.hitMemory(key, windowMs);
  }

  private hitMemory(key: string, windowMs: number): RateHit {
    const now = Date.now();
    const w = this.mem.get(key);
    if (!w || now >= w.resetAt) {
      this.mem.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, ttlMs: windowMs };
    }
    w.count += 1;
    return { count: w.count, ttlMs: w.resetAt - now };
  }
}

/**
 * Uygulama genelinde tek örnek — throttler storage ve widget-key-rate guard
 * bunu paylaşır. Env import anında okunur (serverless soğuk başlangıçta hazır).
 */
export const rateLimitStore = new RateLimitStore();
