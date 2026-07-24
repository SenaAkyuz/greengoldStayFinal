import { ExecutionContext, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { WidgetKeyRateGuard } from './widget-key-rate.guard';
import { RateLimitStore } from './rate-limit.store';

function ctx(
  headers: Record<string, string> = {},
  query: Record<string, unknown> = {},
) {
  const req = { headers, query };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('WidgetKeyRateGuard', () => {
  let guard: WidgetKeyRateGuard;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    guard = new WidgetKeyRateGuard(new RateLimitStore(null));
  });

  it('key yoksa geçer (IP throttler zaten korur), sayaç tüketmez', async () => {
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('limit içindeki isteklere izin verir', async () => {
    for (let i = 0; i < 300; i++) {
      await expect(
        guard.canActivate(ctx({ 'x-widget-key': 'key-a' })),
      ).resolves.toBe(true);
    }
  });

  it('key başına limiti (300/dk) aşınca ThrottlerException atar', async () => {
    for (let i = 0; i < 300; i++) {
      await guard.canActivate(ctx({ 'x-widget-key': 'key-b' }));
    }
    await expect(
      guard.canActivate(ctx({ 'x-widget-key': 'key-b' })),
    ).rejects.toThrow(ThrottlerException);
  });

  it('farklı keyler bağımsız sayılır', async () => {
    for (let i = 0; i < 300; i++) {
      await guard.canActivate(ctx({ 'x-widget-key': 'key-c' }));
    }
    // key-c doldu ama key-d taze:
    await expect(
      guard.canActivate(ctx({ 'x-widget-key': 'key-d' })),
    ).resolves.toBe(true);
  });

  it('key query parametresinden de okunur', async () => {
    await expect(guard.canActivate(ctx({}, { key: 'key-q' }))).resolves.toBe(
      true,
    );
  });
});
