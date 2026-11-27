/**
 * ÖRNEK VERİ — karbon ölçümü önizlemesi (`/onizleme/panel/karbon-olcumu`).
 *
 * Şekiller GERÇEK ConnectHub panel tiplerinden (lib/connecthub/types.ts);
 * başlıklar ve ölçü birimleri otele özel olabilir — burada da sabit liste
 * yok, örnek otelin "açık" başlıkları var. Production'da hata fırlatır.
 */
import type {
  ActivityRecord,
  CalculatePeriodResult,
  CalculationLine,
  ConnectHubItem,
  CountryCheck,
  PeriodDetail,
  PeriodList,
  PeriodListEntry,
  ProviderRecord,
  MeasurementVersion,
  PeriodMeasurementVersions,
  StoredMeasurement,
} from '../connecthub/types';
import { isDevToolsEnabled } from '../dev-only';

/** Önizlemenin sabit "bugün"ü (durumlar buna göre tutarlı). */
export const SAMPLE_NOW = new Date('2026-11-26T12:00:00Z');
export const SAMPLE_PERIOD = '2026-10';

const item = (over: Partial<ConnectHubItem> & Pick<ConnectHubItem, 'id' | 'name'>): ConnectHubItem => ({
  code: null,
  resolution: 'monthly',
  resolution_kind: 'monthly',
  uoms: ['kWh'],
  monthly: true,
  scope: 1,
  factor_status: 'available',
  writable: true,
  blocked_reason: null,
  ...over,
});

const ITEMS: ConnectHubItem[] = [
  item({ id: 'ornek-elektrik', code: 'ELEK', name: 'Şebeke elektriği', uoms: ['kWh', 'MWh'], scope: 2 }),
  item({ id: 'ornek-dogalgaz', code: 'DG', name: 'Doğalgaz', uoms: ['m3', 'kWh'] }),
  item({ id: 'ornek-lpg', name: 'LPG (mutfak)', uoms: ['kg'] }),
  item({ id: 'ornek-jenerator', name: 'Jeneratör dizel', uoms: ['L'] }),
  item({ id: 'ornek-su', name: 'Şebeke suyu', uoms: ['m3'], scope: 3, factor_status: 'unknown' }),
  item({
    id: 'ornek-arac', name: 'Servis araçları', resolution: 'daily', resolution_kind: 'daily', uoms: ['L'],
    factor_status: 'option_required', writable: false, blocked_reason: 'not_monthly',
  }),
  item({
    id: 'ornek-sogutucu', name: 'Soğutucu gaz dolumu', resolution: 'yearly', resolution_kind: 'yearly', uoms: ['kg'],
    writable: false, blocked_reason: 'not_monthly',
  }),
  item({ id: 'ornek-isitma', name: 'Isıtma yakıtı', uoms: ['L'], factor_status: 'option_required', writable: false, blocked_reason: 'option_required' }),
];

const rec = (over: Partial<ActivityRecord> & Pick<ActivityRecord, 'id' | 'item_id' | 'item_name' | 'quantity' | 'uom'>): ActivityRecord => ({
  item_code: null,
  period: SAMPLE_PERIOD,
  note: null,
  status: 'accepted',
  provider_status: 'pending_approval',
  provider_record_id: 'ornek',
  error_code: null,
  error_message: null,
  warnings: [],
  sent_at: '2026-11-03T09:12:00Z',
  ...over,
});

const RECORDS: ActivityRecord[] = [
  rec({ id: 'r1', item_id: 'ornek-elektrik', item_name: 'Şebeke elektriği', quantity: 48_200, uom: 'kWh', provider_status: 'approved', note: 'Fatura 2026/10' }),
  rec({ id: 'r2', item_id: 'ornek-dogalgaz', item_name: 'Doğalgaz', quantity: 6_150, uom: 'm3' }),
  rec({
    id: 'r3', item_id: 'ornek-jenerator', item_name: 'Jeneratör dizel', quantity: 420, uom: 'L',
    status: 'outcome_unknown', provider_status: null, provider_record_id: null, error_code: 'outcome_unknown',
  }),
  rec({
    id: 'r4', item_id: 'ornek-lpg', item_name: 'LPG (mutfak)', quantity: 0.5, uom: 'kg',
    status: 'rejected', provider_status: null, provider_record_id: null, error_code: 'VALIDATION',
    error_message: 'Miktar beklenen aralığın dışında',
  }),
];

const counts = (rs: ActivityRecord[]) => ({
  sending: rs.filter((r) => r.status === 'sending').length,
  accepted: rs.filter((r) => r.status === 'accepted').length,
  rejected: rs.filter((r) => r.status === 'rejected').length,
  outcome_unknown: rs.filter((r) => r.status === 'outcome_unknown').length,
});

function entry(period: string): PeriodListEntry {
  const month = Number(period.slice(5));
  const empty = { sending: 0, accepted: 0, rejected: 0, outcome_unknown: 0 };
  if (month === 12) return { period, status: 'future', needs_attention: false, records: empty, occupied_room_nights: null, measurement: null };
  if (month === 11) return { period, status: 'in_progress', needs_attention: false, records: empty, occupied_room_nights: null, measurement: null };
  if (month === 10) return { period, status: 'submitted', needs_attention: true, records: counts(RECORDS), occupied_room_nights: 2_140, measurement: null };
  if (month === 9) return { period, status: 'empty', needs_attention: false, records: empty, occupied_room_nights: null, measurement: null };
  // Ocak–Ağustos: hesaplanmış (henüz yayına alınmamış)
  const t = [58.2, 54.9, 49.1, 41.7, 39.5, 44.8, 52.3, 55.6][month - 1];
  return {
    period, status: 'calculated', needs_attention: false,
    records: { ...empty, accepted: 3 }, occupied_room_nights: 1_800 + month * 40,
    measurement: { id: `ornek-olcum-${month}`, is_active: false, total_tonnes: t },
  };
}

export interface SampleMeasurement {
  items: ConnectHubItem[];
  periods: PeriodList;
  detail: (period: string) => PeriodDetail;
  /** Ölçüm ortağındaki onaylı kayıtlar (salt okuma bölümü). */
  providerRecords: (period: string) => ProviderRecord[];
}

// Ekim 2026: panelden onaylanmış elektrik + Green Gold aracıyla gönderilmiş
// (yerelde kaydı olmayan) şebeke suyu.
const PROVIDER_RECORDS: ProviderRecord[] = [
  { item_id: 'ornek-elektrik', item_code: 'ELEK', item_name: 'Şebeke elektriği', period: SAMPLE_PERIOD, quantity: 48_200, uom: 'kWh', origin: 'panel' },
  { item_id: 'ornek-su', item_code: null, item_name: 'Şebeke suyu', period: SAMPLE_PERIOD, quantity: 1_240, uom: 'm3', origin: 'green_gold' },
];

export function getSampleMeasurement(): SampleMeasurement {
  if (!isDevToolsEnabled()) {
    throw new Error('Örnek veri yalnızca geliştirme ortamında kullanılabilir.');
  }
  return {
    items: ITEMS,
    periods: {
      schema_ready: true,
      year: 2026,
      periods: Array.from({ length: 12 }, (_, i) => entry(`2026-${String(i + 1).padStart(2, '0')}`)),
    },
    detail: (period) => ({
      period,
      environment: 'sandbox',
      occupied_room_nights: period === SAMPLE_PERIOD ? 2_140 : null,
      measurement_id: null,
      records: period === SAMPLE_PERIOD ? RECORDS : [],
    }),
    providerRecords: (period) => (period === SAMPLE_PERIOD ? PROVIDER_RECORDS : []),
  };
}

// --- Hesap senaryoları (F önizlemesi) ---------------------------------------


export const SAMPLE_SCENARIOS = {
  onizleme: 'Yalnız önizleme (ülke)',
  hesaplandi: 'Hesaplandı',
  onay: 'Onay bekliyor',
  eksik: 'Faktör eksik',
  'veri-yok': 'Veri yok',
  kayitli: 'Kaydedilmiş ölçüm',
  'kayitli-degisti': 'Kaydedilmiş · veri değişti',
} as const;
export type SampleScenario = keyof typeof SAMPLE_SCENARIOS;

const SAMPLE_PROFILE = { rooms: 96, guest: 6_000, meeting: 600, occupied: 2_140 };

function line(over: Partial<CalculationLine> & Pick<CalculationLine, 'record_id' | 'item_name' | 'quantity' | 'uom' | 'kg_co2e' | 'scope'>): CalculationLine {
  return {
    external_id: null, source: 'api', item_id: over.record_id, item_code: null, period: SAMPLE_PERIOD, excluded: false,
    factor_id: 'ornek', factor_name: null, factor_uom: over.uom, quantity_in_factor_uom: over.quantity, method: 'kg_co2e_per_uom',
    biogenic_co2_kg: null, data_year: 2026, factor_country_code: null, company_declared: false,
    factor_source: { name: 'Örnek kaynak', version: '2026', license: null, attribution: null, url: null }, warnings: [],
    ...over,
  };
}

/** Örnek hesap sonucu — fiyat backend'in rapor modu formülüyle hesaplanır. */
export function getSampleCalculation(scenario: SampleScenario): CalculatePeriodResult {
  if (!isDevToolsEnabled()) throw new Error('Örnek veri yalnızca geliştirme ortamında kullanılabilir.');
  const period = SAMPLE_PERIOD;
  if (scenario === 'veri-yok') return { status: 'no_data', period };
  if (scenario === 'onay') {
    return {
      status: 'awaiting_approval',
      period,
      pending: [
        { item_name: 'Doğalgaz', quantity: 6_150, uom: 'm3', reason: "3pmetrics'te onay bekliyor." },
        { item_name: 'Jeneratör dizel', quantity: 420, uom: 'L', reason: 'Gönderim sonucu belli değil; kaydı tekrar gönderin.' },
      ],
    };
  }
  const preview = scenario === 'onizleme' || scenario === 'kayitli-degisti';
  const lines: CalculationLine[] = [
    line({
      record_id: 'c1', item_name: 'Şebeke elektriği', quantity: 48_200, uom: 'kWh', scope: 2,
      kg_co2e: preview ? 48_200 * 0.469657 : 48_200 * 0.44,
      factor_name: preview ? 'Şebeke elektriği (örnek, başka ülke)' : 'Şebeke elektriği (örnek)',
      factor_country_code: preview ? 'AE' : 'TR', warnings: preview ? ['FACTOR_COUNTRY_FALLBACK'] : [],
    }),
    line({ record_id: 'c2', item_name: 'Doğalgaz', quantity: 6_150, uom: 'm3', scope: 1, kg_co2e: 6_150 * 2.0667, factor_name: 'Doğalgaz yakma (örnek)', method: 'gases_per_tj' }),
    line({ record_id: 'c3', item_name: 'Jeneratör dizel', quantity: 420, uom: 'L', scope: 1, kg_co2e: 420 * 2.66, factor_name: 'Dizel yakma (örnek)', biogenic_co2_kg: 18.4 }),
  ];
  const s1 = lines.filter((l) => l.scope === 1).reduce((a, l) => a + l.kg_co2e, 0);
  const s2 = lines.filter((l) => l.scope === 2).reduce((a, l) => a + l.kg_co2e, 0);
  const calculation = {
    unit_id: 'ornek-birim', period,
    inventory: { id: 'ornek-envanter', name: 'Green Gold 2026 (örnek)', year: 2026, gwp_set: 'AR6', dataset: 'örnek', scope2_method: 'location' },
    release: { release_id: 'ornek', content_hash: 'ornek', generated_at: '2026-11-20T08:00:00Z' },
    lines,
    blocking: [] as { code: string; record_id: string; item_name: string; message: string }[],
    total_kg: s1 + s2,
    scope_totals_kg: { scope_1: s1, scope_2: s2, scope_3: 0, unscoped: 0 },
    biogenic_co2_kg: 18.4,
    notices: [],
    has_company_declared_factors: false,
    coverage: { scopes_calculated: [1, 2], wtt_scope3_cat3: 'not_in_package' as const, biogenic_co2: 'outside_scopes' as const, label: 'Kapsam 1 ve 2; WTT (Kapsam 3 kat. 3) dahil değil' },
  };
  if (scenario === 'eksik') {
    return {
      status: 'blocked',
      period,
      reason: 'Bazı kalemler için 3pmetrics faktörü uygulanamadı; tahmini değerle fiyat üretilmez.',
      calculation: {
        ...calculation,
        blocking: [
          { code: 'FACTOR_NOT_AVAILABLE', record_id: 'c1', item_name: 'Şebeke elektriği', message: 'No factor' },
          { code: 'OPTION_REQUIRED', record_id: 'c4', item_name: 'Isıtma yakıtı', message: 'Option required' },
        ],
      },
    };
  }
  const roomShare = SAMPLE_PROFILE.guest / (SAMPLE_PROFILE.guest + SAMPLE_PROFILE.meeting);
  const guestKg = calculation.total_kg * roomShare;
  const coefficient = guestKg / SAMPLE_PROFILE.occupied;
  const pricing = {
    coefficient_kg: coefficient,
    amount_per_night: (coefficient / 1000) * 25,
    currency: 'EUR',
    price_per_tonne: 25,
    price_is_demo: true,
    total_kg: calculation.total_kg,
    guestrooms_kg: guestKg,
    room_share: roomShare,
    occupancy_percent: (SAMPLE_PROFILE.occupied / (SAMPLE_PROFILE.rooms * 31)) * 100,
    warnings: [],
    calculation_method: 'örnek',
    internal_use: true,
  };
  const countryCheck: CountryCheck = {
    hotel_country_code: 'TR',
    hotel_country_status: 'valid',
    publishable: !preview,
    lines: [
      preview
        ? { record_id: 'c1', item_name: 'Şebeke elektriği', factor_country_code: 'AE', provider_country_fallback: true, status: 'country_mismatch', publishable: false, message: 'Şebeke elektriği: faktör Birleşik Arap Emirlikleri için; tesis Türkiye’de.' }
        : { record_id: 'c1', item_name: 'Şebeke elektriği', factor_country_code: 'TR', provider_country_fallback: false, status: 'country_match', publishable: true, message: 'Faktör tesisin ülkesine ait.' },
      { record_id: 'c2', item_name: 'Doğalgaz', factor_country_code: null, provider_country_fallback: false, status: 'country_independent', publishable: true, message: 'Ülkeden bağımsız faktör.' },
      { record_id: 'c3', item_name: 'Jeneratör dizel', factor_country_code: null, provider_country_fallback: false, status: 'country_independent', publishable: true, message: 'Ülkeden bağımsız faktör.' },
    ],
    messages: preview ? ['Şebeke elektriği faktörü tesisinizin ülkesine (Türkiye) ait değil; ölçüm ortağında tesis ülkesi düzeltilince yeniden hesaplayın.'] : [],
  };
  if (preview) {
    return { status: 'preview_only', period, reason: countryCheck.messages.join(' '), calculation, country_check: countryCheck, pricing, ignored_records: [] };
  }
  return {
    status: 'calculated', period, duplicate: scenario === 'kayitli', measurement_id: SAMPLE_MEASUREMENT_ID,
    calculation, country_check: countryCheck, pricing,
    ignored_records: [{ item: 'Soğutucu gaz dolumu', period: '2026', reason: 'Yıllık kayıt aylık hesaba dahil edilmedi.' }],
  };
}

const SAMPLE_MEASUREMENT_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Kaydedilmiş ölçüm örneği (salt okuma ucunun yanıtı). "kayitli": sayfa
 * açılışında kayıtlı sonuç; "Hesapla" aynı ölçümü bulur. "kayitli-degisti":
 * kayıttan sonra veri değişmiş; "Hesapla" yalnız önizleme döndürür ve kayıtlı
 * ölçüm değişmez.
 */
export function getSampleStored(scenario: SampleScenario): StoredMeasurement | null {
  if (!isDevToolsEnabled()) throw new Error('Örnek veri yalnızca geliştirme ortamında kullanılabilir.');
  if (scenario !== 'kayitli' && scenario !== 'kayitli-degisti') return null;
  const calc = getSampleCalculation('kayitli');
  if (calc.status !== 'calculated') return null;
  return {
    id: calc.measurement_id,
    status: 'calculated',
    is_current: true,
    is_active: false,
    calculated_at: '2026-11-20T09:30:00Z',
    calculation: calc.calculation,
    country_check: calc.country_check,
    pricing: calc.pricing,
    ignored_records: calc.ignored_records,
    publication_block: 'carbon_measurement_internal_use',
    changes: scenario === 'kayitli-degisti' ? ['records', 'occupancy'] : [],
  };
}

/** Önceki örnek sürüm (doğalgaz düzeltilmeden önceki hesap). */
export const SAMPLE_PREVIOUS_ID = '00000000-0000-4000-8000-000000000001';

/** Örnek sürüm listesi (salt okuma ucunun yanıtı): güncel + bir önceki sürüm. */
export function getSampleVersions(scenario: SampleScenario): PeriodMeasurementVersions {
  if (!isDevToolsEnabled()) throw new Error('Örnek veri yalnızca geliştirme ortamında kullanılabilir.');
  const current = getSampleStored(scenario);
  if (!current) return { period: SAMPLE_PERIOD, current_id: null, versions: [] };
  const row = (s: StoredMeasurement, at: string, over: Partial<MeasurementVersion> = {}): MeasurementVersion => ({
    id: s.id,
    calculated_at: at,
    is_current: s.is_current,
    is_active: s.is_active,
    version: 'ornek',
    total_tonnes: s.calculation.total_kg / 1000,
    coefficient_kg: s.pricing.coefficient_kg,
    amount_per_night: s.pricing.amount_per_night,
    currency: s.pricing.currency,
    occupied_room_nights: 2_140,
    inventory_name: s.calculation.inventory.name,
    release_id: s.calculation.release.release_id,
    country_publishable: s.country_check.publishable,
    ...over,
  });
  const prev = getSamplePreviousVersion(scenario)!;
  return {
    period: SAMPLE_PERIOD,
    current_id: current.id,
    versions: [row(current, current.calculated_at!), row(prev, prev.calculated_at!)],
  };
}

/** Önceki sürümün ayrıntısı: doğalgaz 5.900 m³ iken yapılan hesap. */
export function getSamplePreviousVersion(scenario: SampleScenario): StoredMeasurement | null {
  const current = getSampleStored(scenario);
  if (!current) return null;
  const lines = current.calculation.lines.map((l) =>
    l.item_name === 'Doğalgaz' ? { ...l, quantity: 5_900, kg_co2e: 5_900 * 2.0667 } : l,
  );
  const total = lines.reduce((a, l) => a + l.kg_co2e, 0);
  const s1 = lines.filter((l) => l.scope === 1).reduce((a, l) => a + l.kg_co2e, 0);
  const ratio = total / current.calculation.total_kg;
  return {
    ...current,
    id: SAMPLE_PREVIOUS_ID,
    is_current: false,
    calculated_at: '2026-11-12T08:15:00Z',
    calculation: { ...current.calculation, lines, total_kg: total, scope_totals_kg: { ...current.calculation.scope_totals_kg, scope_1: s1 } },
    pricing: {
      ...current.pricing,
      total_kg: total,
      guestrooms_kg: current.pricing.guestrooms_kg * ratio,
      coefficient_kg: current.pricing.coefficient_kg * ratio,
      amount_per_night: current.pricing.amount_per_night * ratio,
    },
    changes: ['records'],
  };
}
