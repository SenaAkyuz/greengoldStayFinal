import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Widget key başına ek hız sınırı (IP başına sınırın üstüne, spam/şişirme yavaşlatma).
 * Basit sabit-pencere sayaç (tek instance pilot için yeterli; dağıtık ortamda
 * paylaşımlı store'a taşınır). key yoksa geçer (IP throttler zaten korur).
 */
@Injectable()
export class WidgetKeyRateGuard implements CanActivate {
  private readonly LIMIT = 300;
  private readonly WINDOW_MS = 60_000;
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key =
      (req.headers['x-widget-key'] as string | undefined) ??
      (req.query?.key as string | undefined);
    if (!key) return true;

    const now = Date.now();
    const w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }
    if (w.count >= this.LIMIT) {
      throw new ThrottlerException();
    }
    w.count += 1;
    return true;
  }
}
