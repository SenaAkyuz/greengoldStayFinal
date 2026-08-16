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
 * Webhook routing-id başına ek hız sınırı (IP başına ThrottlerGuard'ın üstüne).
 * WidgetKeyRateGuard ile AYNI desen: paylaşılan RateLimitStore, sabit-pencere.
 * routingId URL parametresinden gelir (route: /integrations/webhooks/:provider/:routingId).
 */
@Injectable()
export class IntegrationWebhookRateGuard implements CanActivate {
  private readonly LIMIT = 120;
  private readonly WINDOW_MS = 60_000;

  private readonly store: RateLimitStore;

  constructor(@Optional() store?: RateLimitStore) {
    this.store = store ?? rateLimitStore;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const routingId = req.params?.routingId;
    if (!routingId) return true;
    const key = Array.isArray(routingId) ? routingId[0] : routingId;

    const { count } = await this.store.hit(`iw:${key}`, this.WINDOW_MS);
    if (count > this.LIMIT) {
      throw new ThrottlerException();
    }
    return true;
  }
}
