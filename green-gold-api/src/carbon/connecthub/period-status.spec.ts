import { summarizePeriod, type PeriodFacts } from './period-status';

const base: PeriodFacts = {
  period: '2026-10',
  today: '2026-11-26',
  occupiedRoomNights: null,
  recordStatuses: [],
  measurement: null,
};

describe('summarizePeriod — yalnız yerel verilerden ay durumu', () => {
  it.each([
    [{}, 'empty'],
    [{ occupiedRoomNights: 2000 }, 'draft'],
    [{ recordStatuses: ['rejected'] }, 'draft'],
    [{ recordStatuses: ['accepted', 'rejected'] }, 'submitted'],
    [
      { recordStatuses: ['accepted'], measurement: { isActive: false } },
      'calculated',
    ],
    [
      { recordStatuses: ['accepted'], measurement: { isActive: true } },
      'published',
    ],
    [{ period: '2026-11' }, 'in_progress'],
    [{ period: '2026-12' }, 'future'],
    [{ period: '2027-01', measurement: { isActive: true } }, 'future'],
  ] as const)('%j → %s', (over, status) => {
    expect(summarizePeriod({ ...base, ...over } as PeriodFacts).status).toBe(
      status,
    );
  });

  it('reddedilen, sonucu belirsiz veya takılı kayıt dikkat ister', () => {
    for (const s of ['rejected', 'outcome_unknown', 'sending'] as const) {
      expect(
        summarizePeriod({ ...base, recordStatuses: ['accepted', s] })
          .needs_attention,
      ).toBe(true);
    }
    expect(
      summarizePeriod({ ...base, recordStatuses: ['accepted'] })
        .needs_attention,
    ).toBe(false);
  });

  it('kayıt sayıları durum bazında verilir', () => {
    const r = summarizePeriod({
      ...base,
      recordStatuses: ['accepted', 'accepted', 'outcome_unknown'],
    });
    expect(r.records).toEqual({
      sending: 0,
      accepted: 2,
      rejected: 0,
      outcome_unknown: 1,
    });
  });
});
