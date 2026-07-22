import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateHotelDto } from './update-hotel.dto';

const OPTS = { whitelist: true, forbidNonWhitelisted: true };

function toDto(payload: unknown) {
  return plainToInstance(UpdateHotelDto, payload);
}
async function errorsFor(payload: unknown) {
  return validate(toDto(payload) as object, OPTS);
}

describe('UpdateHotelDto', () => {
  it('kısmi güncelleme geçerli (yalnızca name)', async () => {
    expect(await errorsFor({ name: 'Yeni Otel' })).toHaveLength(0);
  });

  it('boş gövde geçerli (no-op)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('yalnızca boşluktan oluşan ad reddedilir (trim + boş kontrolü)', async () => {
    const errs = await errorsFor({ name: '   ' });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].property).toBe('name');
  });

  it('ad trim edilir (baştaki/sondaki boşluk kırpılır)', async () => {
    const dto = toDto({ name: '  Deniz Otel  ' });
    expect(dto.name).toBe('Deniz Otel');
    expect(await validate(dto as object, OPTS)).toHaveLength(0);
  });

  it('geçersiz timezone reddedilir (Mars/Base)', async () => {
    expect((await errorsFor({ timezone: 'Mars/Base' })).length).toBeGreaterThan(
      0,
    );
  });

  it('geçerli IANA timezone kabul edilir', async () => {
    expect(await errorsFor({ timezone: 'America/Los_Angeles' })).toHaveLength(0);
  });

  it('tutar sınır dışı reddedilir (-5 ve 9999)', async () => {
    expect(
      (await errorsFor({ contribution_amount_per_night: -5 })).length,
    ).toBeGreaterThan(0);
    expect(
      (await errorsFor({ contribution_amount_per_night: 9999 })).length,
    ).toBeGreaterThan(0);
  });

  it('geçerli tutar kabul edilir (5)', async () => {
    expect(
      await errorsFor({ contribution_amount_per_night: 5 }),
    ).toHaveLength(0);
  });

  it('korumalı alan commission_rate -> 400 (forbidNonWhitelisted)', async () => {
    expect(
      (await errorsFor({ commission_rate: 0 })).length,
    ).toBeGreaterThan(0);
  });

  it('korumalı alan estimated_co2_per_night_kg -> 400', async () => {
    expect(
      (await errorsFor({ estimated_co2_per_night_kg: 999 })).length,
    ).toBeGreaterThan(0);
  });

  it('gövdede hotel_id -> KESİN 400 (yalnızca token\'dan gelir)', async () => {
    const errs = await errorsFor({ hotel_id: 'baska-otel' });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].property).toBe('hotel_id');
  });
});
