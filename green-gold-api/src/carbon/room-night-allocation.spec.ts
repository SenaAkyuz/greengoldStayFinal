import {
  allocateRoomNight,
  estimateReservationCo2,
  resolveScopeBasis,
  toKilograms,
} from './room-night-allocation';

describe('toKilograms', () => {
  it('kg ve ton birimlerini tanır', () => {
    expect(toKilograms(120, 'kgCO2e')).toBe(120);
    expect(toKilograms(1.5, 'tCO2e')).toBe(1500);
    expect(toKilograms(2, 'tonnes')).toBe(2000);
  });

  it('bilinmeyen birimi TAHMİN ETMEZ', () => {
    // kg mı ton mu belirsiz bir sayı 1000 kat hatalı fiyat üretir.
    expect(toKilograms(100, 'CO2')).toBeNull();
    expect(toKilograms(100, undefined)).toBeNull();
    expect(toKilograms(100, 'lbs')).toBeNull();
  });

  it('pozitif olmayan değeri reddeder', () => {
    expect(toKilograms(0, 'kgCO2e')).toBeNull();
    expect(toKilograms(-5, 'tCO2e')).toBeNull();
  });
});

describe('resolveScopeBasis', () => {
  it('tanıdığı kapsamları eşler', () => {
    expect(resolveScopeBasis('guestrooms')).toBe('guestrooms');
    expect(resolveScopeBasis('Guest Rooms')).toBe('guestrooms');
    expect(resolveScopeBasis('hotel total')).toBe('hotel_total');
  });

  it('tanımadığı kapsamı unknown bırakır (otel toplamı VARSAYMAZ)', () => {
    expect(resolveScopeBasis('scope 1+2')).toBe('unknown');
    expect(resolveScopeBasis(undefined)).toBe('unknown');
  });
});

describe('allocateRoomNight', () => {
  it('konaklamaya ayrılmış ölçümü dolu oda-geceye böler', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 1_500,
      totalEmissionsUnit: 'tCO2e',
      scope: 'guestrooms',
      occupiedRoomNights: 50_000,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 1500 t = 1_500_000 kg; 1_500_000 / 50_000 = 30 kg/oda-gece
    expect(outcome.coefficientKg).toBe(30);
    expect(outcome.guestroomShare).toBe(1);
    expect(outcome.scopeBasis).toBe('guestrooms');
  });

  it('konaklama kapsamlı sonucu İKİNCİ KEZ dağıtmaz', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 1_000_000,
      totalEmissionsUnit: 'kgCO2e',
      scope: 'guestrooms',
      occupiedRoomNights: 20_000,
      // Oran verilse bile konaklama kapsamına uygulanmaz.
      guestroomShare: 0.5,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.guestroomShare).toBe(1);
    expect(outcome.coefficientKg).toBe(50);
  });

  it('otel toplamını dağıtım oranı olmadan fiyata çevirmez', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 2_000,
      totalEmissionsUnit: 'tCO2e',
      scope: 'hotel_total',
      occupiedRoomNights: 40_000,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('missing_guestroom_share');
  });

  it('otel toplamını verilen oranla dağıtır', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 2_000,
      totalEmissionsUnit: 'tCO2e',
      scope: 'hotel_total',
      occupiedRoomNights: 40_000,
      guestroomShare: 0.8,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 2_000_000 kg * 0.8 = 1_600_000; / 40_000 = 40
    expect(outcome.coefficientKg).toBe(40);
    expect(outcome.allocationMethod).toContain('dağıtım oranı');
  });

  it('tanınmayan kapsamı reddeder', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 100,
      totalEmissionsUnit: 'tCO2e',
      scope: 'Scope 1 & 2',
      occupiedRoomNights: 10_000,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unknown_scope');
  });

  it('bilinmeyen birimi reddeder', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 100,
      totalEmissionsUnit: 'CO2',
      scope: 'guestrooms',
      occupiedRoomNights: 10_000,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unknown_unit');
  });

  it('dolu oda-gece yoksa reddeder (oda sayısı payda DEĞİLDİR)', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 100,
      totalEmissionsUnit: 'tCO2e',
      scope: 'guestrooms',
      occupiedRoomNights: undefined,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('missing_room_nights');
  });

  it('olağan dışı yüksek katsayıyı aralık dışı sayar', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 5_000,
      totalEmissionsUnit: 'tCO2e',
      scope: 'guestrooms',
      occupiedRoomNights: 100,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('out_of_range');
  });

  it('geniş kontrol aralığının dışındaki sonucu uyarı ile geçirir', () => {
    const outcome = allocateRoomNight({
      totalEmissions: 300_000,
      totalEmissionsUnit: 'kgCO2e',
      scope: 'guestrooms',
      occupiedRoomNights: 1_000,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.coefficientKg).toBe(300);
    expect(outcome.warnings).toHaveLength(1);
  });
});

describe('estimateReservationCo2', () => {
  it('katsayıyı oda x gece ile çarpar', () => {
    expect(estimateReservationCo2(12.5, 2, 3)).toBe(75);
  });

  it('geçersiz girdide null döner', () => {
    expect(estimateReservationCo2(0, 1, 1)).toBeNull();
    expect(estimateReservationCo2(10, 0, 1)).toBeNull();
    expect(estimateReservationCo2(10, 1, 400)).toBeNull();
    expect(estimateReservationCo2(10, 1.5, 2)).toBeNull();
  });
});
