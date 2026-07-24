import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RateLimitStore, rateLimitStore } from './rate-limit.store';

// @nestjs/throttler root'tan export etmiyor; increment'in döndürmesi gereken kayıt.
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * @nestjs/throttler için ThrottlerStorage — sayacı paylaşılan RateLimitStore'a
 * (Upstash Redis / bellek fallback) taşır. Böylece IP başına throttle Vercel'de
 * instance'lar arası tutarlı olur.
 *
 * Sabit-pencere semantiği: count > limit olduğunda isBlocked=true (guard yalnızca
 * isBlocked'ta 429 atar). Blok, pencere sıfırlanınca (ttl bitince) kalkar.
 */
@Injectable()
export class DistributedThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly store: RateLimitStore = rateLimitStore) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const { count, ttlMs } = await this.store.hit(`thr:${key}`, ttl);
    const timeToExpire = Math.ceil(ttlMs / 1000);
    const isBlocked = count > limit;
    return {
      totalHits: count,
      timeToExpire,
      isBlocked,
      // Sabit-pencerede blok, pencere bitişiyle aynı anda kalkar.
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
