import { resolveRange } from './date-range.util';

const TZ = 'Europe/Istanbul';

describe('resolveRange (#7 sıkı tarih doğrulama)', () => {
  it('geçerli from/to aralığını çözer', () => {
    const r = resolveRange('2026-07-01', '2026-07-31', TZ);
    expect(r.fromLabel).toBe('2026-07-01');
    expect(r.toLabel).toBe('2026-07-31');
    expect(r.startUtc < r.endUtcExclusive).toBe(true);
  });

  it('var olmayan takvim tarihini reddeder (2026-02-31)', () => {
    expect(() => resolveRange('2026-02-31', '2026-03-05', TZ)).toThrow(
      /takvim tarihi/i,
    );
  });

  it('artık-yıl olmayan 2026-02-29 reddedilir; 2024-02-29 kabul edilir', () => {
    expect(() => resolveRange('2026-02-29', '2026-03-01', TZ)).toThrow();
    expect(() => resolveRange('2024-02-01', '2024-02-29', TZ)).not.toThrow();
  });

  it('from > to reddedilir', () => {
    expect(() => resolveRange('2026-07-31', '2026-07-01', TZ)).toThrow(
      /from.*>.*to|Geçersiz aralık/i,
    );
  });

  it('yalnızca from verilirse reddedilir (ikisi birlikte ya da hiçbiri)', () => {
    expect(() => resolveRange('2026-07-01', undefined, TZ)).toThrow(
      /birlikte/i,
    );
  });

  it('yalnızca to verilirse reddedilir', () => {
    expect(() => resolveRange(undefined, '2026-07-31', TZ)).toThrow(/birlikte/i);
  });

  it('hiçbiri verilmezse içinde bulunulan aya düşer (hata yok)', () => {
    const r = resolveRange(undefined, undefined, TZ);
    expect(r.fromLabel).toMatch(/^\d{4}-\d{2}-01$/);
    expect(r.startUtc < r.endUtcExclusive).toBe(true);
  });

  it('geçersiz format reddedilir', () => {
    expect(() => resolveRange('2026/07/01', '2026-07-31', TZ)).toThrow(
      /format/i,
    );
  });
});
