/**
 * GEÇİCİ PLACEHOLDER — Green Gold metodoloji onayı olmadan gerçek otele
 * sunulmamalı.
 *
 * Otel tipi (city/premium/resort) yalnızca TANIMLAYICI bir alandır (şehir/premium
 * ayrımı — orijinal ürün gereksinimi). Karbon hesabını ETKİLEMEZ; tier bazlı
 * katsayı mapping'i YOKTUR (onaylanmamış sayılar kaldırıldı).
 *
 * Efektif gece başı tahmini katsayı SADECE otelin `estimated_co2_per_night_kg`
 * değerinden gelir. O NULL ise tek bir dokümante placeholder (8.30) fallback
 * kullanılır. Bu 8.30 da geçicidir ve Green Gold metodolojisi netleşince
 * gerçek değerle değiştirilecektir.
 */
export type HotelType = 'city' | 'premium' | 'resort';

export const HOTEL_TYPES: readonly HotelType[] = ['city', 'premium', 'resort'];

/** GEÇİCİ PLACEHOLDER katsayı (kg CO₂/gece). Onaylanmamış — metodoloji bekleniyor. */
export const PLACEHOLDER_CO2_PER_NIGHT_KG = 8.3;

export function normalizeHotelType(raw: unknown): HotelType {
  return raw === 'premium' || raw === 'resort' ? raw : 'city';
}

/**
 * Efektif gece başı tahmini katsayı:
 *   - otel override'ı (estimated_co2_per_night_kg) geçerli bir sayıysa o kazanır,
 *   - yoksa (NULL/geçersiz) tek dokümante placeholder (8.30).
 * hotel_type bu hesaba GİRMEZ.
 */
export function effectiveCo2PerNight(
  override: number | null | undefined,
): number {
  if (override !== null && override !== undefined) {
    const n = Number(override);
    if (Number.isFinite(n)) return n;
  }
  return PLACEHOLDER_CO2_PER_NIGHT_KG;
}
