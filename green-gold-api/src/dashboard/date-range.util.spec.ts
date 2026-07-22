import { resolveRange } from './date-range.util';

const TZ = 'Europe/Istanbul';

/** İki YYYY-MM-DD arasındaki (dahil) gün sayısı. */
function inclusiveDays(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000) + 1;
}

describe('resolveRange (#7 sıkı tarih doğrulama)', () => {
  it('geçerli from/to aralığını çözer', () => {
    const r = resolveRange({ from: '2026-07-01', to: '2026-07-31' }, TZ);
    expect(r.fromLabel).toBe('2026-07-01');
    expect(r.toLabel).toBe('2026-07-31');
    expect(r.startUtc < r.endUtcExclusive).toBe(true);
  });

  it('var olmayan takvim tarihini reddeder (2026-02-31)', () => {
    expect(() =>
      resolveRange({ from: '2026-02-31', to: '2026-03-05' }, TZ),
    ).toThrow(/takvim tarihi/i);
  });

  it('artık-yıl olmayan 2026-02-29 reddedilir; 2024-02-29 kabul edilir', () => {
    expect(() =>
      resolveRange({ from: '2026-02-29', to: '2026-03-01' }, TZ),
    ).toThrow();
    expect(() =>
      resolveRange({ from: '2024-02-01', to: '2024-02-29' }, TZ),
    ).not.toThrow();
  });

  it('from > to reddedilir', () => {
    expect(() =>
      resolveRange({ from: '2026-07-31', to: '2026-07-01' }, TZ),
    ).toThrow(/from.*>.*to|Geçersiz aralık/i);
  });

  it('yalnızca from verilirse reddedilir (ikisi birlikte ya da hiçbiri)', () => {
    expect(() => resolveRange({ from: '2026-07-01' }, TZ)).toThrow(/birlikte/i);
  });

  it('yalnızca to verilirse reddedilir', () => {
    expect(() => resolveRange({ to: '2026-07-31' }, TZ)).toThrow(/birlikte/i);
  });

  it('geçersiz format reddedilir', () => {
    expect(() =>
      resolveRange({ from: '2026/07/01', to: '2026-07-31' }, TZ),
    ).toThrow(/format/i);
  });
});

describe('resolveRange (#8 range preset, otel tz\'inde)', () => {
  it('default (boş) -> içinde bulunulan ay (gün 01\'de başlar)', () => {
    const r = resolveRange({}, TZ);
    expect(r.fromLabel).toMatch(/^\d{4}-\d{2}-01$/);
    expect(r.startUtc < r.endUtcExclusive).toBe(true);
  });

  it("range='month' de aya düşer", () => {
    expect(resolveRange({ range: 'month' }, TZ).fromLabel).toMatch(/-01$/);
  });

  it("range='7d' -> bugün DAHİL 7 takvim günü", () => {
    const r = resolveRange({ range: '7d' }, TZ);
    expect(inclusiveDays(r.fromLabel, r.toLabel)).toBe(7);
  });

  it("range='30d' -> bugün DAHİL 30 takvim günü", () => {
    const r = resolveRange({ range: '30d' }, TZ);
    expect(inclusiveDays(r.fromLabel, r.toLabel)).toBe(30);
  });

  it('explicit from/to, range preset\'ini geçersiz kılar (override)', () => {
    const r = resolveRange(
      { range: '7d', from: '2026-01-01', to: '2026-01-31' },
      TZ,
    );
    expect(r.fromLabel).toBe('2026-01-01');
    expect(r.toLabel).toBe('2026-01-31');
  });

  it('farklı tz -> farklı UTC sınırları (İstanbul vs Los Angeles)', () => {
    const ist = resolveRange({ range: 'month' }, 'Europe/Istanbul');
    const la = resolveRange({ range: 'month' }, 'America/Los_Angeles');
    // Aynı yerel gün etiketi olsa bile yerel gece yarısının UTC karşılığı farklı.
    expect(ist.startUtc).not.toBe(la.startUtc);

    const ist7 = resolveRange({ range: '7d' }, 'Europe/Istanbul');
    const la7 = resolveRange({ range: '7d' }, 'America/Los_Angeles');
    expect(ist7.startUtc).not.toBe(la7.startUtc);
  });
});
