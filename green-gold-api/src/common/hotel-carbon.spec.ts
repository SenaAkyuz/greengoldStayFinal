import { calculateHotelCarbon } from './hotel-carbon';

export const reportInput = {
  mode: 'report',
  country: 'Turkey',
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  rooms: 100,
  occupied_room_nights: 20000,
  total_area_m2: 10000,
  guestrooms_area_m2: 6000,
  meeting_area_m2: 2000,
  report_tonnes: 100,
  report_basis: 'hotel_total',
  report_reference: 'R-2025',
  assessor: 'Otel raporu',
};

describe('Hotel-specific calculation', () => {
  it('allocates common areas proportionally before dividing by occupied room-nights', () => {
    const result = calculateHotelCarbon(reportInput, 'EUR');
    expect(result.room_share).toBe(0.75);
    expect(result.guestrooms_kg).toBe(75000);
    expect(result.coefficient_kg).toBe(3.75);
    expect(result.amount_per_night).toBe(0.09);
    expect(result.verification).toBe('unverified');
  });
  it('does not allocate a guestrooms-only report twice', () => {
    const result = calculateHotelCarbon(
      { ...reportInput, report_basis: 'guestrooms' },
      'EUR',
    );
    expect(result.coefficient_kg).toBe(5);
    expect(result.room_share).toBe(1);
    expect(result.amount_per_night).toBe(0.13);
  });
  it('allocates all emissions to rooms when there is no meeting space', () => {
    expect(
      calculateHotelCarbon({ ...reportInput, meeting_area_m2: 0 }, 'EUR')
        .coefficient_kg,
    ).toBe(5);
  });
  it('uses sourced factors and preserves provenance without mixing in a report', () => {
    const result = calculateHotelCarbon(
      {
        ...reportInput,
        mode: 'consumption',
        electricity_connection: 'distribution',
        electricity_kwh: 100000,
        gas_kwh: 10000,
        diesel_litres: 100,
        other_emissions_kg: 0,
      },
      'EUR',
    );
    expect(result.total_kg).toBeCloseTo(48995.755, 6);
    expect(result.coefficient_kg).toBeCloseTo(1.8373408125, 8);
    expect(result.factors[0].year).toBe(2023);
    expect(result.input.report_tonnes).toBeUndefined();
  });
  it.each([
    { occupied_room_nights: 36501 },
    { occupied_room_nights: 0 },
    { rooms: 2.5 },
    { meeting_area_m2: 5000 },
    { period_start: '2025-02-30' },
    { period_end: '2024-12-31' },
    { period_end: '2099-12-31' },
    { report_tonnes: -1 },
    { report_tonnes: NaN },
    { assessor: '' },
    { coefficient_kg: 1 },
    { total_area_m2: null },
  ])('rejects inconsistent or injected input %j', (patch) => {
    expect(() =>
      calculateHotelCarbon({ ...reportInput, ...patch }, 'EUR'),
    ).toThrow();
  });
  it('does not apply Turkey electricity to another country', () => {
    expect(() =>
      calculateHotelCarbon(
        { ...reportInput, country: 'France', mode: 'consumption' },
        'EUR',
      ),
    ).toThrow();
  });
});
