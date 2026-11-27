import type { CalculationResult } from './factor-calculation';

/**
 * Faktör ülkesi ↔ tesis ülkesi uygunluğu.
 *
 * Paketten gelen sinyaller (3pmetrics faktör paketi notları):
 *   - `factors[].country_code`: faktörün ülkesi; null → ülkeye bağlı değil
 *     (ör. DEFRA yakıt yanma faktörleri).
 *   - `mappings[].warnings` içinde `FACTOR_COUNTRY_FALLBACK`: "No factor exists
 *     for the unit's country; another country's factor is used." Birimin
 *     ülkesi 3pmetrics'te boşsa da bu uyarı çıkar.
 *
 * Tesisin ülkesi Green Gold tesis profilinde ISO 3166-1 alpha-2 kodu olarak
 * tutulur (3pmetrics birim konumuna bağımlı kalmamak için).
 *
 * Satır kararları:
 *   country_match       faktör ülkesi = tesis ülkesi (sağlayıcı geri düşmüş
 *                        olsa bile doğru faktör) → yayınlanabilir
 *   country_independent faktörün ülkesi yok ve geri düşme uyarısı yok
 *                        → yayınlanabilir
 *   provider_matched    tesis ülkesi profilde YOK, ama sağlayıcı geri düşmeden
 *                        birimin ülkesine göre eşledi → yayınlanabilir
 *   country_mismatch    faktör ülkesi ≠ tesis ülkesi → yalnız önizleme
 *   country_unverified  geri düşme var ve doğrulanamıyor, ya da profil ülke
 *                        kodu geçersiz → yalnız önizleme
 *
 * Hesap hiçbir durumda durmaz; yalnızca widget'a yayın izni değişir.
 */

export type HotelCountryStatus = 'valid' | 'missing' | 'invalid';

export type LineCountryStatus =
  | 'country_match'
  | 'country_independent'
  | 'provider_matched'
  | 'country_mismatch'
  | 'country_unverified';

export interface LineCountryCheck {
  record_id: string;
  item_name: string;
  factor_country_code: string | null;
  provider_country_fallback: boolean;
  status: LineCountryStatus;
  publishable: boolean;
  message: string;
}

export interface CountryCheck {
  hotel_country_code: string | null;
  hotel_country_status: HotelCountryStatus;
  publishable: boolean;
  lines: LineCountryCheck[];
  messages: string[];
}

export const FACTOR_COUNTRY_FALLBACK = 'FACTOR_COUNTRY_FALLBACK';

let regionNames: Intl.DisplayNames | null | undefined;
function regionName(code: string): string | null {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  if (!regionNames) return null;
  try {
    return regionNames.of(code) ?? null;
  } catch {
    return null;
  }
}

/**
 * ISO 3166-1 alpha-2 kodunu doğrular ve büyük harfe çevirir.
 * Boş → missing; biçim yanlış veya bilinmeyen bölge → invalid.
 */
export function normalizeCountryCode(raw: string | null | undefined): {
  code: string | null;
  status: HotelCountryStatus;
} {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return { code: null, status: 'missing' };
  if (!/^[A-Z]{2}$/.test(value)) return { code: null, status: 'invalid' };
  const name = regionName(value);
  if (name !== null && (name === value || /unknown/i.test(name))) {
    return { code: null, status: 'invalid' };
  }
  return { code: value, status: 'valid' };
}

export function assessFactorCountries(
  calculation: CalculationResult,
  hotelCountryCode: string | null | undefined,
): CountryCheck {
  const hotel = normalizeCountryCode(hotelCountryCode);
  const lines: LineCountryCheck[] = [];

  for (const line of calculation.lines) {
    // Dışlanan veya hesaplanamayan (bloklu) satırlar ayrı yönetilir.
    if (line.excluded || line.method === null) continue;
    const factorCountry = line.factor_country_code;
    const fallback = line.warnings.includes(FACTOR_COUNTRY_FALLBACK);
    const base = {
      record_id: line.record_id,
      item_name: line.item_name,
      factor_country_code: factorCountry,
      provider_country_fallback: fallback,
    };

    if (factorCountry && hotel.status === 'valid') {
      if (factorCountry === hotel.code) {
        lines.push({
          ...base,
          status: 'country_match',
          publishable: true,
          message: fallback
            ? `Faktör ülkesi (${factorCountry}) tesis ülkesiyle eşleşiyor; 3pmetrics birim ülkesi eksik olduğu için sağlayıcı geri düşme uyarısı verdi.`
            : `Faktör ülkesi (${factorCountry}) tesis ülkesiyle eşleşiyor.`,
        });
      } else {
        lines.push({
          ...base,
          status: 'country_mismatch',
          publishable: false,
          message: `Faktör ${factorCountry} ülkesine ait, tesis ülkesi ${hotel.code}. Sonuç yalnız önizleme; 3pmetrics'te birimin ülkesi düzeltilmeli.`,
        });
      }
      continue;
    }

    if (!factorCountry && !fallback) {
      lines.push({
        ...base,
        status: 'country_independent',
        publishable: true,
        message: 'Faktör ülkeye bağlı değil.',
      });
      continue;
    }

    if (factorCountry && !fallback && hotel.status === 'missing') {
      lines.push({
        ...base,
        status: 'provider_matched',
        publishable: true,
        message: `Tesis profilinde ülke kodu yok; 3pmetrics faktörü birimin ülkesine (${factorCountry}) göre geri düşmeden eşledi.`,
      });
      continue;
    }

    lines.push({
      ...base,
      status: 'country_unverified',
      publishable: false,
      message:
        hotel.status === 'invalid'
          ? 'Tesis profilindeki ülke kodu geçersiz; faktörün ülkeye uygunluğu doğrulanamıyor. Sonuç yalnız önizleme.'
          : fallback
            ? `3pmetrics birimin ülkesi için faktör bulamadı ve ${factorCountry ?? 'ülkesi belirtilmemiş'} faktörüne geri düştü; tesis ülkesi profilde ${hotel.status === 'missing' ? 'yok' : 'farklı'}. Sonuç yalnız önizleme.`
            : 'Faktörün ülkeye uygunluğu doğrulanamıyor. Sonuç yalnız önizleme.',
    });
  }

  const messages: string[] = [];
  if (hotel.status === 'invalid') {
    messages.push(
      'Tesis profilindeki ülke kodu geçersiz (ISO 3166-1 alpha-2 olmalı, ör. TR).',
    );
  }
  const blocked = lines.filter((l) => !l.publishable);
  if (blocked.length) {
    messages.push(
      `${blocked.length} kalemde faktör ülkesi doğrulanamadı; hesap önizleme olarak gösterilir, widget'a yayınlanmaz.`,
    );
  }

  return {
    hotel_country_code: hotel.code,
    hotel_country_status: hotel.status,
    publishable: blocked.length === 0,
    lines,
    messages,
  };
}
