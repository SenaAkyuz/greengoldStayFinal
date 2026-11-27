import { ConflictException } from '@nestjs/common';

/**
 * Ölçümün widget fiyatına (gerçek misafirlere) uygulanma politikası.
 *
 * INTERNAL_USE: 3pmetrics faktör paketi "yalnız iç kullanım" notuyla gelir.
 * 2026-11-27: 3P Metrics (Selçuk Bey) YAZILI izin verdi — aşağıdaki koşullarla
 * hesaplanan TAHMİNİ emisyon ve gönüllü katkı tutarı misafire gösterilebilir
 * (izin metnini kullanıcı iletti; bkz. STATUS.md §8 / §4.16):
 *   1. Yalnız Kapsam 1 ve Kapsam 2. WTT (Kapsam 3 kat. 3) ve diğer Kapsam 3
 *      dahil EDİLMEZ → hesapta Kapsam 1/2 dışı satır varsa ya da kapsam
 *      bilgisi yoksa yayın engellenir (`carbon_measurement_scope_not_permitted`).
 *   2. Faktörlerin kendisi paylaşılmaz → widget yalnız kg CO₂e ve katkı tutarı
 *      alır (widget.service.ts; faktör/paket alanı public yanıtta yok, testli).
 *   3. Karbon nötrlüğü / doğrulanmış dengeleme iddiası yok → widget metinleri
 *      "tahmini, doğrulanmış beyan değildir" dilinde (widget i18n, testli).
 *   4. Seçenekli yakıt kayıtları API'de desteklenmiyor → hesap `OPTION_REQUIRED`
 *      ile durur (factor-calculation.ts), fiyat üretilmez.
 * Ülke/faktör uygunluğu doğrulanmayan sonuç (country_check.publishable=false)
 * izinden BAĞIMSIZ olarak asla yayınlanmaz.
 *
 * Sabit ortam değişkeniyle değiştirilemez. Panel tarafındaki eşi:
 * green-gold-panel/lib/connecthub/logic.ts → INTERNAL_USE_PUBLISH_ALLOWED,
 * PERMITTED_SCOPES.
 *
 * Eski CCA ölçümleri (verification_status = 'unverified', internal_use
 * işareti yok) bu politikadan ETKİLENMEZ.
 */
export const INTERNAL_USE_PUBLISH_ALLOWED = true;

/** Yazılı izinle misafire gösterilebilecek emisyon kapsamları. */
export const PERMITTED_SCOPES: readonly number[] = [1, 2];

export const INTERNAL_USE_PERMISSION = {
  granted_on: '2026-11-27',
  granted_by: '3P Metrics (yazılı izin, kullanıcı iletti)',
  scopes: PERMITTED_SCOPES,
  wtt_included: false,
  factors_disclosed: false,
  neutrality_claims: false,
} as const;

export type PublicationBlock =
  | 'carbon_measurement_internal_use'
  | 'carbon_measurement_country_unverified'
  | 'carbon_measurement_scope_not_permitted';

interface MeasurementLike {
  verification_status?: unknown;
  form_data?: unknown;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Ölçümde hesaplanan kapsamlar (pricing.coverage ya da calculation.coverage).
 * Bilinmiyorsa null — çağıran taraf izin dışı sayar (fail closed).
 */
export function calculatedScopes(
  form: Record<string, unknown> | null,
): number[] | null {
  const coverage =
    obj(obj(form?.pricing)?.coverage) ?? obj(obj(form?.calculation)?.coverage);
  const scopes = coverage?.scopes_calculated;
  if (!Array.isArray(scopes)) return null;
  if (!scopes.every((s) => typeof s === 'number' && Number.isInteger(s))) {
    return null;
  }
  return scopes as number[];
}

/** Kapsam listesi izin içinde mi? Boş liste (hiç hesaplanan kapsam yok) izin dışıdır. */
export function scopesPermitted(
  scopes: readonly number[] | null,
  permitted: readonly number[] = PERMITTED_SCOPES,
): boolean {
  return (
    !!scopes && scopes.length > 0 && scopes.every((s) => permitted.includes(s))
  );
}

/** Yayını engelleyen neden (yoksa null). Saf fonksiyon. */
export function publicationBlock(
  row: MeasurementLike,
  internalUseAllowed = INTERNAL_USE_PUBLISH_ALLOWED,
): PublicationBlock | null {
  const form = obj(row.form_data);
  const pricing = obj(form?.pricing);
  const countryCheck = obj(form?.country_check);
  // Ülke/faktör uygunluğu doğrulanmamış sonuç hiçbir koşulda yayınlanmaz.
  if (countryCheck && countryCheck.publishable === false) {
    return 'carbon_measurement_country_unverified';
  }
  const internalUse =
    row.verification_status === 'internal_use' ||
    pricing?.internal_use === true;
  if (!internalUse) return null;
  if (!internalUseAllowed) return 'carbon_measurement_internal_use';
  if (!scopesPermitted(calculatedScopes(form))) {
    return 'carbon_measurement_scope_not_permitted';
  }
  return null;
}

const MESSAGES: Record<PublicationBlock, string> = {
  carbon_measurement_internal_use:
    'Bu ölçüm ölçüm ortağının iç kullanım faktörleriyle hesaplandı; kullanım izni olmadan misafir fiyatına uygulanamaz.',
  carbon_measurement_country_unverified:
    'Bu ölçümde tesisin ülkesine uygunluğu doğrulanamayan faktör var; misafir fiyatına uygulanamaz.',
  carbon_measurement_scope_not_permitted:
    'Bu ölçüm Kapsam 1 ve 2 dışında (ya da kapsamı belirsiz) satır içeriyor; kullanım izni yalnız Kapsam 1 ve 2 için geçerli.',
};

/** Yayın engelliyse 409 fırlatır (kod panelde metne çevrilir). */
export function assertPublishable(row: MeasurementLike): void {
  const block = publicationBlock(row);
  if (block) {
    throw new ConflictException({ code: block, message: MESSAGES[block] });
  }
}
