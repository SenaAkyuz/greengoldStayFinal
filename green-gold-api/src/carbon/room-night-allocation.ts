/**
 * Sağlayıcı ölçümünü oda-gece katsayısına çeviren TEK yer.
 *
 * Yönerge: "GreenGold Stay'de bu verileri kullanarak oda-gece ve rezervasyon
 * bazlı emisyon tahmini hesaplayacağız. Kullanılacak emisyon kapsamını ve
 * oda-geceye dağıtım yöntemini sizinle birlikte netleştireceğiz."
 *
 * Bu modül CARBON_METHODOLOGY_REVIEW.md'deki kararı uygular ve değiştirmez:
 *   - konaklamaya ayrılmış dönem emisyonu (kgCO2e) ÷ AYNI dönemin dolu oda-gecesi
 *   - fiziksel oda sayısı veya misafir sayısı payda DEĞİLDİR
 *   - otel toplamı kapsamlı bir sonuç, kapsam/dağıtım kontrolü olmadan bu
 *     formüle KONMAZ -> dağıtım oranı açıkça verilmezse hesap REDDEDİLİR
 *   - konaklamaya ayrılmış sonuç ikinci kez alanla dağıtılmaz
 *
 * `hotel-carbon.ts` (otelin elle girdiği hesap) ile aynı matematiktir; orada
 * dağıtım oranı otelin girdiği alanlardan gelir, burada sağlayıcının verdiği
 * kapsam bilgisinden. İki yol da aynı birimi üretir: kgCO2e/oda-gece.
 */

/** Sağlayıcının verdiği birimden kgCO2e'ye açık dönüşüm. Bilinmeyen birim -> null. */
export function toKilograms(
  value: number,
  unit: string | undefined,
): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  switch ((unit ?? '').trim().toLowerCase()) {
    case 'kgco2e':
    case 'kg co2e':
    case 'kg':
      return value;
    case 'tco2e':
    case 't co2e':
    case 'tonne':
    case 'tonnes':
    case 'ton':
    case 't':
      return value * 1000;
    default:
      // Birim bilinmiyorsa TAHMİN EDİLMEZ. kg mi ton mu belirsiz bir sayıyı
      // hesaba sokmak 1000 kat hatalı bir fiyat üretebilir.
      return null;
  }
}

/**
 * Sağlayıcı kapsam metninden dağıtım davranışı. Serbest metin OLDUĞU İÇİN
 * yalnızca AÇIKÇA tanıdığımız değerler kabul edilir; tanınmayan kapsam
 * 'unknown' döner ve hesap reddedilir (sessizce otel toplamı varsayılmaz).
 */
export type MeasurementScopeBasis = 'guestrooms' | 'hotel_total' | 'unknown';

const GUESTROOM_SCOPES = new Set([
  'guestrooms',
  'guest_rooms',
  'guest-rooms',
  'rooms',
  'accommodation',
  'konaklama',
]);

const HOTEL_TOTAL_SCOPES = new Set([
  'hotel_total',
  'hotel-total',
  'hotel',
  'total',
  'whole_hotel',
  'otel_toplami',
]);

export function resolveScopeBasis(
  scope: string | undefined,
): MeasurementScopeBasis {
  const key = (scope ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (GUESTROOM_SCOPES.has(key)) return 'guestrooms';
  if (HOTEL_TOTAL_SCOPES.has(key)) return 'hotel_total';
  return 'unknown';
}

export interface AllocationInput {
  /** Sağlayıcının verdiği toplam emisyon ve birimi. */
  totalEmissions: number | undefined;
  totalEmissionsUnit: string | undefined;
  /** Sağlayıcının verdiği kapsam metni. */
  scope: string | undefined;
  /** Aynı dönemin dolu oda-gecesi (payda). */
  occupiedRoomNights: number | undefined;
  /**
   * Otel toplamı kapsamlı bir sonucu konaklamaya dağıtmak için oran (0, 1].
   * Yönergedeki "dağıtım yöntemini sizinle birlikte netleştireceğiz" maddesi
   * netleşene kadar bu değer VERİLMEZSE otel toplamı hesaba sokulmaz.
   */
  guestroomShare?: number;
}

export interface AllocationSuccess {
  ok: true;
  /** kgCO2e / dolu oda-gece. */
  coefficientKg: number;
  totalKg: number;
  guestroomsKg: number;
  guestroomShare: number;
  scopeBasis: Exclude<MeasurementScopeBasis, 'unknown'>;
  allocationMethod: string;
  warnings: string[];
}

export interface AllocationFailure {
  ok: false;
  reason: AllocationFailureReason;
  message: string;
}

export type AllocationFailureReason =
  | 'missing_total'
  | 'unknown_unit'
  | 'unknown_scope'
  | 'missing_room_nights'
  | 'missing_guestroom_share'
  | 'out_of_range';

export type AllocationOutcome = AllocationSuccess | AllocationFailure;

const fail = (
  reason: AllocationFailureReason,
  message: string,
): AllocationFailure => ({ ok: false, reason, message });

/**
 * Ölçümü oda-gece katsayısına çevirir. HİÇBİR eksik veriyi varsayılanla
 * doldurmaz — eksikse açık bir sebeple reddeder, çünkü bu değer doğrudan
 * misafire gösterilen fiyata dönüşür.
 */
export function allocateRoomNight(input: AllocationInput): AllocationOutcome {
  if (input.totalEmissions === undefined || input.totalEmissions === null) {
    return fail('missing_total', 'Ölçümde toplam emisyon değeri yok.');
  }

  const totalKg = toKilograms(input.totalEmissions, input.totalEmissionsUnit);
  if (totalKg === null) {
    return fail(
      'unknown_unit',
      `Emisyon birimi tanınmadı (${input.totalEmissionsUnit ?? 'birim yok'}). kgCO2e veya tCO2e bekleniyor.`,
    );
  }

  const scopeBasis = resolveScopeBasis(input.scope);
  if (scopeBasis === 'unknown') {
    return fail(
      'unknown_scope',
      `Ölçüm kapsamı tanınmadı (${input.scope ?? 'kapsam yok'}). Otel toplamı mı konaklamaya ayrılmış mı olduğu belirtilmeli.`,
    );
  }

  const roomNights = input.occupiedRoomNights;
  if (
    roomNights === undefined ||
    !Number.isInteger(roomNights) ||
    roomNights <= 0
  ) {
    return fail(
      'missing_room_nights',
      'Aynı döneme ait dolu oda-gece değeri yok; oda-gece katsayısı hesaplanamaz.',
    );
  }

  let guestroomShare: number;
  if (scopeBasis === 'guestrooms') {
    // Konaklamaya ayrılmış sonuç İKİNCİ KEZ dağıtılmaz.
    guestroomShare = 1;
  } else {
    const share = input.guestroomShare;
    if (
      share === undefined ||
      !Number.isFinite(share) ||
      share <= 0 ||
      share > 1
    ) {
      return fail(
        'missing_guestroom_share',
        'Otel toplamı kapsamlı ölçüm için konaklama dağıtım oranı gerekli; dağıtım yöntemi netleşmeden bu sonuç fiyata dönüştürülmez.',
      );
    }
    guestroomShare = share;
  }

  const guestroomsKg = totalKg * guestroomShare;
  const coefficientKg = guestroomsKg / roomNights;

  if (
    !Number.isFinite(coefficientKg) ||
    coefficientKg <= 0 ||
    coefficientKg > 1000
  ) {
    return fail(
      'out_of_range',
      'Hesaplanan oda-gece emisyonu desteklenen aralıkta değil. Dönem, kapsam ve dolu oda-gece verilerini kontrol edin.',
    );
  }

  // Uyarılar `hotel-carbon.ts` ile AYNI kontrol aralığını kullanır.
  const warnings: string[] = [];
  if (coefficientKg < 1 || coefficientKg > 200) {
    warnings.push(
      'Oda-gece emisyonu geniş kontrol aralığının dışında; ölçüm kapsamını ve dolu oda-gece verisini yeniden kontrol edin.',
    );
  }

  return {
    ok: true,
    coefficientKg,
    totalKg,
    guestroomsKg,
    guestroomShare,
    scopeBasis,
    allocationMethod:
      scopeBasis === 'guestrooms'
        ? 'Konaklamaya ayrılmış emisyon / dolu oda-gece'
        : 'Otel toplamı x konaklama dağıtım oranı / dolu oda-gece',
    warnings,
  };
}

/**
 * Yönerge: "oda-gece ve REZERVASYON bazlı emisyon tahmini".
 * Katsayı x (oda x gece). Rezervasyon anındaki katsayı SNAPSHOT olarak
 * saklanır (bkz. migration 0015 reservation_carbon_estimates) — geçmiş
 * rezervasyonlar sonraki bir ölçümle geriye dönük değişmez.
 */
export function estimateReservationCo2(
  coefficientKg: number,
  rooms: number,
  nights: number,
): number | null {
  if (!Number.isFinite(coefficientKg) || coefficientKg <= 0) return null;
  if (!Number.isInteger(rooms) || rooms <= 0) return null;
  if (!Number.isInteger(nights) || nights <= 0 || nights > 365) return null;
  const roomNights = rooms * nights;
  return Math.round(coefficientKg * roomNights * 1000) / 1000;
}
