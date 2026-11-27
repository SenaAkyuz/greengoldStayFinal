import {
  legacyMeasurementVersion,
  measurementVersion,
} from './measurement-version';

const rec = (
  over: Partial<{
    record_id: string;
    item: string;
    period: string;
    quantity: number;
    uom: string | null;
  }> = {},
) => ({
  record_id: 'r-1',
  item: 'item-gas',
  period: '2026-10',
  quantity: 500,
  uom: 'm3',
  ...over,
});
const ALLOC = { rooms: 31, occupied_room_nights: 2000 };

describe('ölçüm sürüm anahtarı (UX-3.11)', () => {
  it('sağlayıcı kayıt kimliği değişse de AYNI sürüm (yeniden gönderim + onay)', () => {
    expect(measurementVersion([rec()], 'h', ALLOC)).toBe(
      measurementVersion([rec({ record_id: 'r-YENI' })], 'h', ALLOC),
    );
    // Eski anahtar kimliğe bağlıydı — sorunun kaynağı:
    expect(legacyMeasurementVersion([rec()], 'h', ALLOC)).not.toBe(
      legacyMeasurementVersion([rec({ record_id: 'r-YENI' })], 'h', ALLOC),
    );
  });

  it('birim yazımı (m3 / m³ / M3) ve kayıt sırası sürümü değiştirmez', () => {
    const a = measurementVersion(
      [rec(), rec({ item: 'item-elec', uom: 'kWh', quantity: 1000 })],
      'h',
      ALLOC,
    );
    const b = measurementVersion(
      [
        rec({ item: 'item-elec', uom: 'kWh', quantity: 1000 }),
        rec({ uom: 'm³' }),
      ],
      'h',
      ALLOC,
    );
    expect(a).toBe(b);
    expect(measurementVersion([rec({ uom: 'M3' })], 'h', ALLOC)).toBe(
      measurementVersion([rec()], 'h', ALLOC),
    );
  });

  it('hesabı değiştiren girdi değişirse YENİ sürüm: miktar, faktör paketi, dağıtım', () => {
    const base = measurementVersion([rec()], 'h', ALLOC);
    expect(measurementVersion([rec({ quantity: 501 })], 'h', ALLOC)).not.toBe(
      base,
    );
    expect(measurementVersion([rec()], 'h2', ALLOC)).not.toBe(base);
    expect(
      measurementVersion([rec()], 'h', {
        ...ALLOC,
        occupied_room_nights: 2100,
      }),
    ).not.toBe(base);
  });

  it('16 karakter onaltılık', () => {
    expect(measurementVersion([rec()], 'h', ALLOC)).toMatch(/^[0-9a-f]{16}$/);
  });
});
