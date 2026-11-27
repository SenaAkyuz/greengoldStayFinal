import { describe, expect, it } from 'vitest';
import { countryOptions, profileToInput, profileToPayload, validateProfile } from '../lib/carbon-ui/profile';

const ok = { countryCode: 'TR', rooms: '96', totalArea: '9.800', roomsArea: '6000', meetingArea: '600' };

describe('tesis profili doğrulaması', () => {
  it('geçerli profil: hata yok, alan payı hesaplanır (tr-TR binlik ayraç)', () => {
    const r = validateProfile(ok);
    expect(r.errors).toEqual({});
    expect(r.roomShare).toBeCloseTo(6000 / 6600, 9);
  });
  it('toplantı alanı boşsa 0 sayılır', () => {
    expect(validateProfile({ ...ok, meetingArea: '' }).roomShare).toBe(1);
  });
  it('oda + toplantı > toplam → hata, pay gösterilmez', () => {
    const r = validateProfile({ ...ok, totalArea: '6000' });
    expect(r.errors.roomsArea).toContain('aşamaz');
  });
  it.each([
    ['countryCode', ''],
    ['countryCode', 'TUR'],
    ['rooms', '0'],
    ['rooms', '12,5'],
    ['rooms', 'abc'],
    ['totalArea', '0'],
    ['roomsArea', ''],
    ['meetingArea', '-5'],
  ])('%s = %p → hata', (field, value) => {
    const r = validateProfile({ ...ok, [field]: value });
    expect(r.errors[field as keyof typeof ok]).toBeTruthy();
  });
  it('ondalık virgül kabul edilir', () => {
    expect(validateProfile({ ...ok, roomsArea: '6000,5' }).errors).toEqual({});
  });
});

describe('tesis profili — API dönüşümü (D)', () => {
  it('ondalık nokta da kabul edilir (12.5 → 12,5; 125 değil)', () => {
    const r = validateProfile({ ...ok, totalArea: '9800', roomsArea: '6000.5', meetingArea: '12.5' });
    expect(r.errors).toEqual({});
    expect(r.roomShare).toBeCloseTo(6000.5 / 6013, 9);
  });
  it('geçerli form → API gövdesi (kod büyük harf, Türkçe ülke adı, boş toplantı 0)', () => {
    expect(profileToPayload({ ...ok, countryCode: 'tr', meetingArea: '' })).toEqual({
      country: 'Türkiye',
      country_code: 'TR',
      rooms: 96,
      total_area_m2: 9800,
      guestrooms_area_m2: 6000,
      meeting_area_m2: 0,
    });
  });
  it('geçersiz form → null', () => {
    expect(profileToPayload({ ...ok, rooms: '0' })).toBeNull();
  });
  it('kayıtlı profil → form; boş profil → boş form', () => {
    expect(profileToInput({ country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000.5, meeting_area_m2: 0 }))
      .toEqual({ countryCode: 'TR', rooms: '96', totalArea: '9800', roomsArea: '6000.5', meetingArea: '' });
    expect(profileToInput(null).rooms).toBe('');
    // Kayıtlı değer tekrar doğrulamadan geçer (gidiş-dönüş):
    expect(validateProfile(profileToInput({ country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000.5, meeting_area_m2: 12.5 })).errors).toEqual({});
  });
  it('ülke listesi: kayıtlı kod listede yoksa eklenir', () => {
    expect(countryOptions('JP').some((c) => c.code === 'JP')).toBe(true);
    expect(countryOptions().some((c) => c.code === 'JP')).toBe(false);
    expect(countryOptions().find((c) => c.code === 'TR')?.name).toBe('Türkiye');
  });
});
