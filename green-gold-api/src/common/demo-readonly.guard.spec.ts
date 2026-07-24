import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DemoReadOnlyGuard } from './demo-readonly.guard';

function ctx(
  method: string,
  role: string | undefined,
): ExecutionContext {
  const req = { method, auth: role ? { role } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('DemoReadOnlyGuard', () => {
  // Reflector: @AllowDemoWrite metadata'sı yok -> istisna tetiklenmez.
  const guard = new DemoReadOnlyGuard(new Reflector());

  it('demo_viewer + yazma metodu -> 403 demo_read_only', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      let thrown: unknown;
      try {
        guard.canActivate(ctx(m, 'demo_viewer'));
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ForbiddenException);
      const body = (thrown as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(body.code).toBe('demo_read_only');
    }
  });

  it('demo_viewer + GET -> izin (okuma serbest)', () => {
    expect(guard.canActivate(ctx('GET', 'demo_viewer'))).toBe(true);
  });

  it('otel_yoneticisi + PATCH -> izin', () => {
    expect(guard.canActivate(ctx('PATCH', 'otel_yoneticisi'))).toBe(true);
  });

  it('public uç (auth yok) + POST -> izin (kapsam dışı, ör. /widget/events)', () => {
    expect(guard.canActivate(ctx('POST', undefined))).toBe(true);
  });

  it('@AllowDemoWrite işaretli uç + demo_viewer + POST -> izin (açık istisna)', () => {
    const reflector = {
      getAllAndOverride: () => true,
    } as unknown as Reflector;
    const g = new DemoReadOnlyGuard(reflector);
    expect(g.canActivate(ctx('POST', 'demo_viewer'))).toBe(true);
  });
});
