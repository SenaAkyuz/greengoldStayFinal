import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard';
import { ALLOW_DEMO_WRITE_KEY } from './route-metadata';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Deny-by-default (GLOBAL, auth'tan SONRA çalışır): rolü `demo_viewer` olan
 * kullanıcı için TÜM yazma metotları (POST/PATCH/PUT/DELETE) 403 döner —
 * endpoint listesi DEĞİL, metot bazlı genel kural. Yeni korumalı yazma uçları
 * otomatik kapalı kalır; bir ucu bilerek açmak için @AllowDemoWrite().
 *
 * Public uçlarda (auth yok → req.auth undefined) demo rolü olmadığından bu guard
 * karışmaz — ör. public POST /widget/events kapsam dışıdır (kasıtlı).
 */
@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = (req.method ?? 'GET').toUpperCase();

    if (!WRITE_METHODS.has(method)) return true;

    // Açık istisna: @AllowDemoWrite() işaretli uçlar demo'ya da açık.
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DEMO_WRITE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    if (req.auth?.role === 'demo_viewer') {
      throw new ForbiddenException({
        code: 'demo_read_only',
        message: 'Demo hesabı salt okunurdur.',
      });
    }
    return true;
  }
}
