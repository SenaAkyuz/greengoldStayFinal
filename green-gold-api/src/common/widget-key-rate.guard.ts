import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';
import { RateLimitStore, rateLimitStore } from './rate-limit.store';

/**
 * Widget key başına ek hız sınırı (IP başına sınırın üstüne, spam/şişirme yavaşlatma).
 * Sabit-pencere sayaç, paylaşılan RateLimitStore üzerinden (Upstash Redis bağlıysa
 * dağıtık; yoksa bellek-içi best-effort). key yoksa geçer (IP throttler zaten korur).
 */
@Injectable()
export class WidgetKeyRateGuard implements CanActivate {
  private readonly LIMIT = 300;
  private readonly WINDOW_MS = 60_000;

  private readonly store: RateLimitStore;

  // @Optional(): RateLimitStore bir DI provider'ı değil (uygulama geneli singleton).
  // Nest guard'ı DI ile örneklerken store'u çözemez -> undefined gelir, singleton'a
  // düşülür. Testler ise fake store'u constructor'dan geçebilir.
  constructor(@Optional() store?: RateLimitStore) {
    this.store = store ?? rateLimitStore;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const key =
      (req.headers['x-widget-key'] as string | undefined) ??
      (req.query?.key as string | undefined);
    if (!key) return true;

    const { count } = await this.store.hit(`wk:${key}`, this.WINDOW_MS);
    if (count > this.LIMIT) {
      throw new ThrottlerException();
    }
    return true;
  }
}
