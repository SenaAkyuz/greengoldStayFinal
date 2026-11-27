/**
 * Hesap sonucu → kullanıcının anlayacağı görünüm modeli (saf fonksiyon).
 *
 * Ekran yalnız bunu çizer. Kurallar:
 *  - Sonuç durumları backend'den gelir (awaiting_approval / no_data /
 *    blocked / preview_only / calculated); burada yeniden karar verilmez.
 *  - Faktör yoksa tahmin yok: blocked'da tutar GÖSTERİLMEZ.
 *  - preview_only ve INTERNAL_USE yayın kapısı `publishGate`'ten gelir;
 *    backend aktivasyon ucu da aynı kuralla 409 verir (publication-policy.ts).
 *  - "Tahmini" dili korunur; dengeleme/sertifika iddiası yok.
 */
import type { UiTone } from '../carbon-ui/status';
import {
  calculationUiStatus,
  providerFactorReasonText,
  publishGate,
  publishGateText,
  uomLabel,
  type PublishGate,
} from './logic';
import type {
  BlockingCode,
  CalculatePeriodResult,
  CalculationLine,
  CalculationPricing,
  LineCountryStatus,
  StoredMeasurement,
  StoredMeasurementChange,
} from './types';

const BLOCKING_TEXT: Record<BlockingCode, string> = {
  ITEM_NOT_IN_PACKAGE: 'Bu kalem ölçüm ortağının faktör paketinde yok.',
  UOM_UNKNOWN: 'Kaydın ölçü birimi faktör paketinde tanımlı değil.',
  NO_MAPPING: 'Bu kalem için tesisinize uygun faktör eşlemesi yok.',
  OPTION_REQUIRED: 'Bu kalem için yakıt/tür seçimi gerekiyor; seçimsiz kayıt hesaplanamaz.',
  FACTOR_NOT_AVAILABLE: 'Bu kalem için emisyon faktörü mevcut değil.',
  FACTOR_MISSING: 'Eşlenen faktör pakette bulunamadı.',
  UOM_CONVERSION_UNSUPPORTED: 'Kaydın birimi faktörün birimine dönüştürülemiyor.',
  NO_FACTOR_VALUE: 'Faktörün değeri tanımlı değil.',
  PERIOD_OUTSIDE_INVENTORY: 'Kaydın dönemi faktör envanterinin yılı dışında.',
  INVALID_QUANTITY: 'Kaydın miktarı geçersiz.',
};

/**
 * Backend'in bilinen bekleme nedenleri panel diliyle; tanınmayan metin aynen.
 */
export function pendingReason(reason: string): string {
  if (/sonucu belli değil|sonucu belirsiz/i.test(reason)) {
    return 'Gönderim sonucu belirsiz; dönem sayfasında güvenle yeniden gönderin.';
  }
  if (/onay bekliyor/i.test(reason)) return 'Ölçüm ortağımızda onay bekliyor.';
  return reason;
}

export function blockingText(code: string, providerReason?: string | null): string {
  if (code === 'FACTOR_NOT_AVAILABLE' && providerReason) return providerFactorReasonText(providerReason);
  return BLOCKING_TEXT[code as BlockingCode] ?? 'Bu kalem için faktör uygulanamadı.';
}

const COUNTRY_VIEW: Record<LineCountryStatus, { label: string; tone: UiTone }> = {
  country_match: { label: 'Ülke uygun', tone: 'success' },
  country_independent: { label: 'Ülkeden bağımsız', tone: 'neutral' },
  provider_matched: { label: 'Ortak eşledi', tone: 'info' },
  country_mismatch: { label: 'Başka ülkenin faktörü', tone: 'warning' },
  country_unverified: { label: 'Ülke doğrulanamadı', tone: 'warning' },
};

export function countryView(status: LineCountryStatus) {
  return COUNTRY_VIEW[status];
}

export function regionNameTr(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function scopeLabel(scope: number | null): string {
  if (scope === 1) return 'Kapsam 1 · doğrudan';
  if (scope === 2) return 'Kapsam 2 · satın alınan enerji';
  if (scope === 3) return 'Kapsam 3 · diğer dolaylı';
  return 'Kapsam belirtilmemiş';
}

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });

/** kg → okunur ("469,7 kg CO₂e" / "35,35 t CO₂e"). */
export function emission(kg: number): string {
  return Math.abs(kg) >= 1000 ? `${nf(2, 2).format(kg / 1000)} t CO₂e` : `${nf(1, 1).format(kg)} kg CO₂e`;
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${nf(2, 2).format(amount)} ${currency}`;
  }
}

const percent = (ratio: number) => `%${nf(0, 1).format(ratio * 100)}`;

export interface ResultLine {
  record_id: string;
  name: string;
  scope: string;
  amount: string;
  kg: number;
  kgText: string;
  excluded: boolean;
  factor: string | null;
  /** Kaynak, sürüm ve veri yılı (ör. "DEFRA 2025 · veri yılı 2025"). */
  factorSource: string | null;
  /**
   * Kaynağın lisans ve atıf metni (paketteki `source.license` / `attribution`,
   * aynen). Faktörün DEĞERİ değildir; yalnız otel panelinde gösterilir,
   * misafire gitmez.
   */
  factorCredit: string | null;
  /** Kaynak bağlantısı — yalnız https ise (sağlayıcı verisi güvenilmez girdi). */
  factorUrl: string | null;
  country: { label: string; tone: UiTone; message: string; factorCountry: string | null } | null;
  notes: string[];
}

export interface ResultModel {
  status: ReturnType<typeof calculationUiStatus>;
  title: string;
  message: string;
  tone: UiTone;
  pending?: { name: string; amount: string; reason: string }[];
  blocking?: { name: string; text: string }[];
  /** Tutar ve emisyon yalnız preview_only / calculated'da dolu. */
  totals?: {
    totalText: string;
    scopes: { key: string; label: string; kgText: string; share: string }[];
    coverage: string;
    biogenic: string | null;
  };
  lines?: ResultLine[];
  allocation?: {
    roomShare: string;
    guestroomsText: string;
    perNightKg: string;
    amount: string;
    pricePerTonne: string;
    occupancy: string;
    sentence: string;
  };
  countryMessages: string[];
  warnings: string[];
  ignored: string[];
  inventory?: string;
  measurementId?: string;
  duplicate?: boolean;
  gate: PublishGate;
  gateText: string | null;
}

function lineModel(line: CalculationLine, country: ResultLine['country']): ResultLine {
  const src = line.factor_source;
  const sourceParts = [src ? [src.name, src.version].filter(Boolean).join(' ') : null, line.data_year ? `veri yılı ${line.data_year}` : null]
    .filter(Boolean)
    .join(' · ');
  const notes: string[] = [];
  if (line.excluded) notes.push('Envanter dışı; toplama girmez.');
  if (line.warnings.includes('FACTOR_YEAR_FALLBACK')) notes.push(line.data_year ? `Kayıt yılının faktörü henüz yok; en güncel yıl (${line.data_year}) kullanıldı.` : 'Kayıt yılının faktörü henüz yok; önceki yılın faktörü kullanıldı.');
  if (line.company_declared) notes.push('Şirket tarafından beyan edilen faktör.');
  if (line.biogenic_co2_kg) notes.push(`Biyojenik CO₂ ${emission(line.biogenic_co2_kg)} (kapsam dışı, toplama girmez).`);
  return {
    record_id: line.record_id,
    name: line.item_name,
    scope: scopeLabel(line.scope),
    amount: `${nf(0, 6).format(line.quantity)} ${uomLabel(line.uom)}`,
    kg: line.kg_co2e,
    kgText: emission(line.kg_co2e),
    excluded: line.excluded,
    factor: line.factor_name,
    factorSource: sourceParts || null,
    factorCredit:
      [src?.license ? `Lisans: ${src.license}` : null, src?.attribution ? `Atıf: ${src.attribution}` : null]
        .filter(Boolean)
        .join(' · ') || null,
    factorUrl: src?.url && /^https:\/\//i.test(src.url) ? src.url : null,
    country,
    notes,
  };
}

function allocationModel(pricing: CalculationPricing, period: string, occupied: number | null) {
  const perNight = nf(2, 2).format(pricing.coefficient_kg);
  const amount = money(pricing.amount_per_night, pricing.currency);
  return {
    roomShare: percent(pricing.room_share),
    guestroomsText: emission(pricing.guestrooms_kg),
    perNightKg: `${perNight} kg CO₂e`,
    amount,
    pricePerTonne: `${money(pricing.price_per_tonne, pricing.currency)} / t (temsili)`,
    occupancy: `%${nf(0, 1).format(pricing.occupancy_percent)}`,
    sentence:
      `Tesisin ${period} tahmini emisyonu ${emission(pricing.total_kg)}. ` +
      `Alan payına göre bunun ${percent(pricing.room_share)}'i (${emission(pricing.guestrooms_kg)}) konaklamaya düşer` +
      (occupied ? ` ve ${nf(0, 0).format(occupied)} dolu oda-geceye bölünür` : '') +
      `: oda-gece başına ${perNight} kg CO₂e. ` +
      `Ton başına ${money(pricing.price_per_tonne, pricing.currency)} temsili fiyatla gece başı tahmini katkı ${amount}.`,
  };
}

/**
 * @param periodLabel  ör. "Ekim 2026"
 * @param occupied     dönemin dolu oda-gecesi (cümle için; yoksa null)
 */
export function explainResult(result: CalculatePeriodResult, periodLabel: string, occupied: number | null): ResultModel {
  const gate = publishGate(result);
  const base = {
    status: calculationUiStatus(result),
    countryMessages: [] as string[],
    warnings: [] as string[],
    ignored: [] as string[],
    gate,
    gateText: publishGateText(gate),
  };
  switch (result.status) {
    case 'awaiting_approval':
      return {
        ...base,
        tone: 'pending',
        title: 'Onay bekleyen kayıtlar var',
        message:
          'Eksik toplamla yanlış katkı tutarı üretmemek için hesap yapılmadı. Kayıtlar ölçüm ortağımızda onaylanınca yeniden hesaplayın.',
        pending: result.pending.map((p) => ({
          name: p.item_name ?? 'Kalem',
          amount: `${nf(0, 6).format(p.quantity)} ${uomLabel(p.uom)}`,
          reason: pendingReason(p.reason),
        })),
      };
    case 'no_data':
      return {
        ...base,
        tone: 'neutral',
        title: 'Hesaplanacak onaylı kayıt yok',
        message: `${periodLabel} için ölçüm ortağımızda onaylanmış kayıt bulunamadı. Tüketimi gönderip onaylandıktan sonra hesaplayın.`,
      };
    case 'blocked': {
      const calc = result.calculation;
      return {
        ...base,
        tone: 'danger',
        title: 'Hesap tamamlanamadı',
        message: calc?.blocking.length
          ? 'Bazı kalemler için ölçüm ortağının emisyon faktörü uygulanamadı. Tahmini bir değer kullanılmaz; bu ay için katkı tutarı üretilmedi.'
          : `${result.reason} Tahmini bir değer kullanılmaz; bu ay için katkı tutarı üretilmedi.`,
        blocking: (calc?.blocking ?? []).map((b) => ({ name: b.item_name, text: blockingText(b.code, b.provider_reason) })),
        inventory: calc ? `${calc.inventory.name} (${calc.inventory.year})` : undefined,
      };
    }
    case 'preview_only':
    case 'calculated': {
      const calc = result.calculation;
      const byRecord = new Map(result.country_check.lines.map((l) => [l.record_id, l]));
      const total = calc.total_kg;
      const share = (kg: number) => (total > 0 ? percent(kg / total) : '—');
      const scopes = [
        { key: 's1', label: 'Kapsam 1 · doğrudan', kg: calc.scope_totals_kg.scope_1 },
        { key: 's2', label: 'Kapsam 2 · satın alınan enerji', kg: calc.scope_totals_kg.scope_2 },
        { key: 's3', label: 'Kapsam 3 · diğer dolaylı', kg: calc.scope_totals_kg.scope_3 },
        { key: 'sx', label: 'Kapsam belirtilmemiş', kg: calc.scope_totals_kg.unscoped },
      ].filter((s) => s.kg > 0);
      const preview = result.status === 'preview_only';
      return {
        ...base,
        tone: preview ? 'info' : 'success',
        title: preview ? 'Hesaplandı — yalnız önizleme' : 'Hesaplandı',
        message: preview
          ? 'Bir faktörün tesisinizin ülkesine uygunluğu doğrulanamadı. Sonucu inceleyebilirsiniz; ölçüm kaydedilmedi ve misafir ekranına alınamaz.'
          : result.duplicate
            ? 'Aynı verilerle daha önce hesaplanmış; yeni ölçüm kaydı oluşturulmadı.'
            : 'Ölçüm kaydedildi. Misafir ekranındaki katkı, ancak siz yayına aldığınızda değişir.',
        totals: {
          totalText: emission(total),
          scopes: scopes.map((s) => ({ key: s.key, label: s.label, kgText: emission(s.kg), share: share(s.kg) })),
          coverage: `Hesap kapsamı: ${calc.coverage.label}.`,
          biogenic: calc.biogenic_co2_kg > 0 ? `Biyojenik CO₂ ${emission(calc.biogenic_co2_kg)} ayrıca raporlanır; kapsamlar dışındadır.` : null,
        },
        lines: calc.lines.map((l) => {
          const c = byRecord.get(l.record_id);
          return lineModel(
            l,
            c
              ? { ...countryView(c.status), message: c.message, factorCountry: regionNameTr(c.factor_country_code) }
              : null,
          );
        }),
        allocation: allocationModel(result.pricing, periodLabel, occupied),
        countryMessages: result.country_check.messages,
        warnings: result.pricing.warnings,
        ignored: result.ignored_records.map((r) => `${r.item} (${r.period}): ${r.reason}`),
        inventory: `${calc.inventory.name} (${calc.inventory.year})`,
        measurementId: result.status === 'calculated' ? result.measurement_id : undefined,
        duplicate: result.status === 'calculated' ? result.duplicate : undefined,
      };
    }
  }
}

/** Misafir ekranındaki mevcut değer ile yeni değerin karşılaştırması. */
export function priceComparison(
  current: { amount_per_night: number; currency: string; estimated_co2_per_night_kg: number } | null,
  next: CalculationPricing | null,
): { current: string | null; next: string | null; changes: boolean } {
  const cur = current ? `${money(current.amount_per_night, current.currency)} · ${nf(2, 2).format(current.estimated_co2_per_night_kg)} kg CO₂e / oda-gece` : null;
  const nx = next ? `${money(next.amount_per_night, next.currency)} · ${nf(2, 2).format(next.coefficient_kg)} kg CO₂e / oda-gece` : null;
  return {
    current: cur,
    next: nx,
    changes: !!current && !!next && (Math.abs(current.amount_per_night - next.amount_per_night) > 0.0001 || current.currency !== next.currency),
  };
}

/** Hesap eyleminin sonucu (Server Action ↔ ekran). */
export interface CalcState {
  status: 'idle' | 'error' | 'result';
  message?: string;
  result?: CalculatePeriodResult;
}
export const CALC_IDLE: CalcState = { status: 'idle' };

/** Yayın eyleminin sonucu. */
export interface PublishState {
  status: 'idle' | 'error' | 'success';
  message: string;
}
export const PUBLISH_IDLE: PublishState = { status: 'idle', message: '' };

// --- Kaydedilmiş ölçüm ↔ önizleme ayrımı ---------------------------------------

/**
 * Kaydedilmiş ölçümü ekranın tek sonuç tipine çevirir (yeniden hesap yok).
 * `duplicate: true` → "yeni ölçüm kaydı oluşturulmadı" dili korunur.
 */
export function storedToResult(stored: StoredMeasurement, period: string): CalculatePeriodResult {
  return {
    status: 'calculated',
    period,
    duplicate: true,
    measurement_id: stored.id,
    calculation: stored.calculation,
    country_check: stored.country_check,
    pricing: stored.pricing,
    ignored_records: stored.ignored_records,
  };
}

const CHANGE_TEXT: Record<StoredMeasurementChange, string> = {
  records: 'tüketim kayıtları',
  occupancy: 'dolu oda-gece',
  profile: 'tesis profili',
};

export function formatDateTimeTr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/** Ekranda gösterilen sonucun KAYNAĞI: kaydedilmiş ölçüm mü, yalnız önizleme mi. */
export interface ResultSource {
  kind: 'saved' | 'preview';
  /** Rozet: "Kaydedilmiş ölçüm" / "Yalnız önizleme · kaydedilmedi". */
  label: string;
  tone: UiTone;
  /** Kısa açıklama (ne zaman kaydedildi / neden kaydedilmedi). */
  detail: string;
  /** Kayıttan sonra değişen girdiler varsa uyarı. */
  staleText: string | null;
}

/**
 * @param shown    ekrandaki sonuç (yeni hesap ya da kaydedilmiş ölçüm)
 * @param stored   dönemin kaydedilmiş ölçümü (varsa)
 * @param fromStored  ekrandaki sonuç kaydedilmiş ölçümden mi okundu
 */
export function resultSource(
  shown: CalculatePeriodResult,
  stored: StoredMeasurement | null,
  fromStored: boolean,
): ResultSource | null {
  if (shown.status === 'preview_only') {
    const savedAt = stored ? formatDateTimeTr(stored.calculated_at) : null;
    return {
      kind: 'preview',
      label: 'Yalnız önizleme · kaydedilmedi',
      tone: 'info',
      detail:
        'Bu sonuç ölçüm olarak kaydedilmedi ve sayfa yenilenince görünmez. ' +
        (stored
          ? `Dönemin kaydedilmiş ölçümü${savedAt ? ` (${savedAt})` : ''} değişmedi.`
          : 'Bu dönem için kaydedilmiş bir ölçüm yok.'),
      staleText: null,
    };
  }
  if (shown.status !== 'calculated') return null;
  const isStored = fromStored || (!!stored && stored.id === shown.measurement_id);
  const at = isStored && stored ? formatDateTimeTr(stored.calculated_at) : null;
  const changes = fromStored && stored ? stored.changes : [];
  if (fromStored && stored && stored.is_current === false) {
    return {
      kind: 'saved',
      label: stored.is_active ? 'Önceki sürüm · misafir ekranında' : 'Önceki sürüm',
      tone: 'neutral',
      detail: `Bu dönemin önceki kayıtlı sürümü${at ? ` · hesap: ${at}` : ''}. Yalnız inceleme içindir; yeniden hesaplanmadı.`,
      staleText: null,
    };
  }
  return {
    kind: 'saved',
    label: stored?.is_active && stored.id === shown.measurement_id ? 'Kaydedilmiş ölçüm · misafir ekranında' : 'Kaydedilmiş ölçüm',
    tone: 'success',
    detail: fromStored
      ? `Kayıtlı sonuç gösteriliyor${at ? ` · hesap: ${at}` : ''}. Yeniden hesaplanmadı; ölçüm ortağına istek atılmadı.`
      : shown.duplicate
        ? `Aynı verilerle kaydedilmiş ölçüm${at ? ` (${at})` : ''} kullanıldı; yeni kayıt veya sürüm oluşmadı.`
        : 'Az önce yeni ölçüm olarak kaydedildi.',
    staleText: changes.length
      ? `Bu hesaptan sonra ${changes.map((c) => CHANGE_TEXT[c]).join(', ')} değişti. Kayıtlı sonuç değişmez; güncel sonuç için yeniden hesaplayın.`
      : null,
  };
}

/**
 * Kaydedilmiş ölçümün görünüm modeli. Kayıttan sonra girdiler değiştiyse
 * yayın düğmesi bu sonuçtan açılmaz (yayın eylemi zaten yeniden hesaplayıp
 * ölçüm kimliğini karşılaştırır; burada yalnız erken ve açık uyarı).
 */
export function explainStored(
  stored: StoredMeasurement,
  period: string,
  periodLabel: string,
  occupied: number | null,
): ResultModel {
  const model = explainResult(storedToResult(stored, period), periodLabel, occupied);
  if (stored.is_current === false) {
    return {
      ...model,
      title: 'Önceki sürüm',
      message: 'Dönemin daha önce kaydedilmiş bir hesabı. Sonraki bir hesap bu sürümün yerini aldı.',
      tone: 'neutral',
      gate: { allowed: false, reason: 'not_calculated' },
      gateText: 'Önceki sürümler yayına alınamaz; yalnız dönemin güncel hesabı yayına alınabilir.',
    };
  }
  const base: ResultModel = {
    ...model,
    title: 'Kaydedilmiş hesap',
    message: stored.is_active
      ? 'Bu dönemin kaydedilmiş ölçümü misafir ekranında kullanılıyor.'
      : 'Bu dönemin kaydedilmiş ölçümü. Misafir ekranındaki katkı, ancak siz yayına aldığınızda değişir.',
  };
  if (!stored.changes.length) return base;
  return {
    ...base,
    gate: { allowed: false, reason: 'not_calculated' },
    gateText: 'Kayıttan sonra veriler değişti; yayına almadan önce dönemi yeniden hesaplayın.',
  };
}
