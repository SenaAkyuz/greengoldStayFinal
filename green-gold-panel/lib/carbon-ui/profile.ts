/**
 * Tesis profili doğrulaması — görünümden bağımsız, saf fonksiyon.
 * Kurallar backend'deki tesis profili kurallarıyla aynıdır (oda ≥ 1,
 * alanlar > 0, oda + toplantı alanı ≤ toplam alan). Ülke kodu ISO 3166-1
 * alpha-2 biçiminde (ör. TR); bilinen bölge kontrolü backend'de yapılır.
 */

import { parseQuantity } from '../connecthub/logic';
import type { FacilityProfileInput } from '../connecthub/types';

export interface ProfileInput {
  countryCode: string;
  rooms: string;
  totalArea: string;
  roomsArea: string;
  meetingArea: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

export interface ProfileResult {
  errors: ProfileErrors;
  /** Konaklama alan payı (0–1); hesaplanamıyorsa null. */
  roomShare: number | null;
}

/**
 * Boş → null, geçersiz → NaN, değilse sayı. tr-TR binlik ayraç ("9.800"),
 * ondalık virgül ("12,5") ve ondalık nokta ("12.5") kabul edilir — sayı
 * okuma kuralı karbon formlarıyla ortak (`parseQuantity`).
 */
function parse(value: string): number | null {
  if (value.trim() === '') return null;
  return parseQuantity(value) ?? NaN;
}

export function validateProfile(input: ProfileInput): ProfileResult {
  const errors: ProfileErrors = {};
  if (!/^[A-Za-z]{2}$/.test(input.countryCode.trim())) {
    errors.countryCode = 'Ülkeyi listeden seçin.';
  }
  const rooms = parse(input.rooms);
  if (rooms === null) errors.rooms = 'Oda sayısını girin.';
  else if (!Number.isInteger(rooms) || rooms < 1) errors.rooms = 'Oda sayısı 1 veya daha büyük bir tam sayı olmalı.';

  const total = parse(input.totalArea);
  const roomsArea = parse(input.roomsArea);
  const meeting = parse(input.meetingArea);
  if (total === null) errors.totalArea = 'Toplam kapalı alanı girin.';
  else if (!(total > 0)) errors.totalArea = 'Toplam alan 0’dan büyük olmalı.';
  if (roomsArea === null) errors.roomsArea = 'Oda alanını girin.';
  else if (!(roomsArea > 0)) errors.roomsArea = 'Oda alanı 0’dan büyük olmalı.';
  if (meeting !== null && !(meeting >= 0)) errors.meetingArea = 'Toplantı alanı negatif olamaz.';

  if (
    !errors.totalArea && !errors.roomsArea && !errors.meetingArea &&
    total !== null && roomsArea !== null &&
    roomsArea + (meeting ?? 0) > total
  ) {
    errors.roomsArea = 'Oda ve toplantı alanlarının toplamı toplam alanı aşamaz.';
  }

  const roomShare =
    !errors.roomsArea && !errors.meetingArea && roomsArea !== null && roomsArea > 0
      ? roomsArea / (roomsArea + (meeting ?? 0))
      : null;
  return { errors, roomShare };
}

/**
 * Geçerli form → API gövdesi (`PUT …/connecthub/profile`); geçersizse null.
 * `country` backend'de rapor etiketi olarak tutulur (hesap ülke KODU ile
 * doğrulanır); ad, kodun Türkçe bölge adıdır (ör. TR → "Türkiye").
 */
export function profileToPayload(input: ProfileInput): FacilityProfileInput | null {
  if (Object.keys(validateProfile(input).errors).length) return null;
  const code = input.countryCode.trim().toUpperCase();
  return {
    country: regionName(code),
    country_code: code,
    rooms: parse(input.rooms) as number,
    total_area_m2: parse(input.totalArea) as number,
    guestrooms_area_m2: parse(input.roomsArea) as number,
    meeting_area_m2: parse(input.meetingArea) ?? 0,
  };
}

/** Kayıtlı profil → form alanları (sayılar tr-TR biçiminde değil, düz). */
export function profileToInput(profile: {
  country_code: string | null;
  rooms: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
} | null): ProfileInput {
  if (!profile) return { countryCode: '', rooms: '', totalArea: '', roomsArea: '', meetingArea: '' };
  const n = (v: number) => (Number.isFinite(v) ? String(v) : '');
  return {
    countryCode: profile.country_code ?? '',
    rooms: n(profile.rooms),
    totalArea: n(profile.total_area_m2),
    roomsArea: n(profile.guestrooms_area_m2),
    meetingArea: profile.meeting_area_m2 ? n(profile.meeting_area_m2) : '',
  };
}

/** ISO kodu → Türkçe bölge adı (bilinmiyorsa kodun kendisi). */
export function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Formdaki ülke listesi (sık kullanılanlar); kayıtlı kod listede yoksa eklenir. */
const REGION_CODES = 'TR DE GB FR IT ES NL GR AE SA QA AZ GE CY PT AT CH BE SE NO DK FI IE PL CZ HU RO BG HR US CA EG MA'.split(' ');

export function countryOptions(current?: string): { code: string; name: string }[] {
  const codes = new Set(REGION_CODES);
  const c = current?.trim().toUpperCase();
  if (c && /^[A-Z]{2}$/.test(c)) codes.add(c);
  return [...codes]
    .map((code) => ({ code, name: regionName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
