import {
  isPeriodValidForResolution,
  periodEndDate,
  resolutionKind,
} from './resolution';

describe('resolutionKind', () => {
  it.each([
    ['monthly', 'monthly'],
    ['Monthly', 'monthly'],
    ['month', 'monthly'],
    ['aylık', 'monthly'],
    ['daily', 'daily'],
    ['günlük', 'daily'],
    ['yearly', 'yearly'],
    ['year', 'yearly'],
    ['annual', 'yearly'],
  ])('%s → %s', (raw, kind) => {
    expect(resolutionKind(raw)).toBe(kind);
  });

  it('bilinmeyen çözünürlük → null (o başlığa yazılmaz)', () => {
    expect(resolutionKind('weekly')).toBeNull();
    expect(resolutionKind('')).toBeNull();
    expect(resolutionKind(null)).toBeNull();
  });
});

describe('isPeriodValidForResolution (belgedeki biçimler: 2026-10-14, 2026-10, 2026)', () => {
  it.each([
    ['monthly', '2026-10', true],
    ['monthly', '2026-13', false],
    ['monthly', '2026-10-14', false],
    ['monthly', '10.2026', false],
    ['daily', '2026-10-14', true],
    ['daily', '2026-02-30', false],
    ['daily', '2028-02-29', true],
    ['daily', '2026-02-29', false],
    ['daily', '2026-10', false],
    ['yearly', '2026', true],
    ['yearly', '2026-10', false],
  ] as const)('%s · %s → %s', (kind, period, ok) => {
    expect(isPeriodValidForResolution(kind, period)).toBe(ok);
  });

  it('dönem sonu', () => {
    expect(periodEndDate('monthly', '2026-02')).toBe('2026-02-28');
    expect(periodEndDate('monthly', '2028-02')).toBe('2028-02-29');
    expect(periodEndDate('daily', '2026-10-14')).toBe('2026-10-14');
    expect(periodEndDate('yearly', '2026')).toBe('2026-12-31');
    expect(periodEndDate('daily', '2026-02-30')).toBeNull();
  });
});
