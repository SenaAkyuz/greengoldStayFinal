import { describe, expect, it } from 'vitest';
import { deltaText, dayLabel, previousPeriod, safeRatio } from '../lib/panel/report';

describe('rapor mantığı (UX-5.x)', () => {
  it('önceki dönem: bu ay → önceki ayın aynı günleri; ay kısaysa ay sonu', () => {
    expect(previousPeriod('month', { from: '2026-11-01', to: '2026-11-27' })).toEqual({ from: '2026-10-01', to: '2026-10-27' });
    expect(previousPeriod('month', { from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousPeriod('month', { from: '2026-01-01', to: '2026-01-15' })).toEqual({ from: '2025-12-01', to: '2025-12-15' });
  });
  it('önceki dönem: son 7 gün → hemen önceki 7 gün', () => {
    expect(previousPeriod('7d', { from: '2026-11-21', to: '2026-11-27' })).toEqual({ from: '2026-11-14', to: '2026-11-20' });
    expect(previousPeriod('30d', null)).toBeNull();
  });
  it('oran: payda 0 → null ("—"), %0 değil', () => {
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(1, 4)).toBe(0.25);
  });
  it('değişim metni', () => {
    expect(deltaText(110, 100)).toBe('+%10');
    expect(deltaText(90, 100)).toBe('−%10');
    expect(deltaText(0, 0)).toBe('değişmedi');
    expect(deltaText(5, 0)).toBe('önceki dönemde yoktu');
    expect(deltaText(null, 3)).toBeNull();
  });
  it('gün etiketi Türkçe', () => {
    expect(dayLabel('2026-11-27')).toMatch(/27 Kas/);
  });
});
