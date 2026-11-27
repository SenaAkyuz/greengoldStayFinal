/**
 * DEMO HESABI VERİ SETİ (yalnız `demo_viewer` rolü).
 *
 * Demo panelinin boş görünmemesi için tutarlı, TEMSİLİ veriler üretir. Hiçbir
 * şey veritabanına yazılmaz; gerçek otellerin verisi okunmaz ya da değişmez.
 * Bu modül yalnız API'nin kendi döndürdüğü rolü `demo_viewer` olan oturumlarda
 * devreye girer (bkz. `lib/demo/router.ts`). Yazma uçları hiç taklit edilmez:
 * demo kullanıcının yazma istekleri API'ye gider ve 403 ile reddedilir.
 *
 * Senaryo (ana sayfa örneğiyle aynı): gecelik tahmini emisyon 60 kg CO₂e,
 * gecelik gönüllü katkı 1,50 EUR (25 EUR/t temsili ton fiyatı) → 2 gece:
 * 120 kg CO₂e ve 3,00 EUR. Tüm sayılar aynı kaynaktan türetilir: günlük seri
 * → raporlar/huni/karbon özeti; aylık tüketim → ölçüm → misafir fiyatı.
 * Faz 2 (rezervasyon motoru tahsilatı) çalışıyormuş gibi gösterilmez.
 */
import type {
  CarbonSummary,
  ContributionsSummary,
  DailyInteraction,
  DashboardReport,
  HotelInfo,
  IntegrationHealthSummary,
  InteractionFunnel,
  WidgetEventsSummary,
} from '../api';
import type {
  ActivityRecord,
  CalculationLine,
  ConnectHubItem,
  ConnectHubStatus,
  CountryCheck,
  MeasurementVersion,
  PeriodDetail,
  PeriodList,
  PeriodListEntry,
  PeriodMeasurementVersions,
  ProviderRecord,
  StoredMeasurement,
} from '../connecthub/types';

export const DEMO_CO2_PER_NIGHT_KG = 60;
export const DEMO_AMOUNT_PER_NIGHT = 1.5;
export const DEMO_CURRENCY = 'EUR';
const PRICE_PER_TONNE = 25;

/** Misafir ekranı önizlemesi (demo paneli ve /demo): 2 gece → 120 kg CO₂e, 3,00 EUR. */
export const DEMO_WIDGET_PREVIEW = {
  amount_per_night: 1.5,
  estimated_co2_per_night_kg: 60,
  currency: 'EUR',
  source: 'hotel' as const,
};
const TZ = 'Europe/Istanbul';

// ---- Tarih yardımcıları (otel saat dilimi) --------------------------------
const DAY = 86_400_000;
export function todayYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Panelin `range` / `from`–`to` parametrelerini API ile aynı kurala göre çözer. */
export function resolveDemoRange(params: URLSearchParams, now: Date): { from: string; to: string } {
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) return { from, to };
  const today = todayYmd(now);
  const range = params.get('range');
  if (range === '7d') return { from: ymd(new Date(toDate(today).getTime() - 6 * DAY)), to: today };
  if (range === '30d') return { from: ymd(new Date(toDate(today).getTime() - 29 * DAY)), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

// ---- Günlük etkileşim (tek kaynak) -----------------------------------------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
/** Bir günün tekil oturum sayıları — tarihten deterministik (yenilemede değişmez). */
export function demoDay(date: string): { viewed: number; selected: number; clicked: number; nights: number } {
  const r = hash(date);
  const dow = toDate(date).getUTCDay();
  const weekend = dow === 5 || dow === 6 ? 1.25 : 1;
  const viewed = Math.round((34 + r * 30) * weekend);
  const selected = Math.round(viewed * (0.13 + hash(`${date}s`) * 0.05));
  const clicked = Math.round(selected * (0.32 + hash(`${date}c`) * 0.14));
  // Ortalama ~2 gece: bazı tercihler 3 gecelik.
  const nights = clicked * 2 + Math.round(clicked * hash(`${date}n`) * 0.5);
  return { viewed, selected, clicked, nights };
}

export function demoDaily(range: { from: string; to: string }): DailyInteraction {
  const days: DailyInteraction['days'] = [];
  for (let t = toDate(range.from).getTime(); t <= toDate(range.to).getTime(); t += DAY) {
    const date = ymd(new Date(t));
    const d = demoDay(date);
    days.push({ date, viewed: d.viewed, selected: d.selected, clicked: d.clicked });
  }
  return { period: range, days };
}

function totals(range: { from: string; to: string }) {
  let viewed = 0, selected = 0, clicked = 0, nights = 0;
  for (let t = toDate(range.from).getTime(); t <= toDate(range.to).getTime(); t += DAY) {
    const d = demoDay(ymd(new Date(t)));
    viewed += d.viewed; selected += d.selected; clicked += d.clicked; nights += d.nights;
  }
  return { viewed, selected, clicked, nights };
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 100 : 0);

export function demoReport(range: { from: string; to: string }): DashboardReport {
  const t = totals(range);
  const summary: WidgetEventsSummary = { period: range, views: t.viewed, selections: t.selected, add_clicks: t.clicked, conversion_rate_pct: pct(t.selected, t.viewed) };
  const funnel: InteractionFunnel = {
    period: range,
    stages: { viewed: t.viewed, selected: t.selected, clicked: t.clicked },
    rates: { view_to_select_pct: pct(t.selected, t.viewed), select_to_button_pct: pct(t.clicked, t.selected), view_to_button_pct: pct(t.clicked, t.viewed) },
  };
  const co2 = t.nights * DEMO_CO2_PER_NIGHT_KG;
  const carbon: CarbonSummary = {
    period: range, contributions_count: t.clicked, total_selected_nights: t.nights, estimated_co2_kg: co2,
    tree_equivalent: Math.round((co2 / 21) * 10) / 10, co2_per_night_kg: DEMO_CO2_PER_NIGHT_KG, is_estimated: true,
  };
  return { period: range, summary, funnel, carbon };
}

/** Faz 2: rezervasyon motoru bağlı değil → gerçek tahsilat YOK (çalışıyormuş gibi gösterilmez). */
export function demoContributions(range: { from: string; to: string }): ContributionsSummary {
  return { period: range, totals: [], contributions_count: 0, pending_count: 0 };
}
export const DEMO_INTEGRATIONS: IntegrationHealthSummary = { integrations: [] };

// ---- Karbon ölçümü ----------------------------------------------------------
const PROFILE = { country: 'Türkiye', country_code: 'TR', rooms: 96, total_area_m2: 9_800, guestrooms_area_m2: 6_860, meeting_area_m2: 420 };
const ROOM_SHARE = PROFILE.guestrooms_area_m2 / (PROFILE.guestrooms_area_m2 + PROFILE.meeting_area_m2);

const ITEM = {
  elec: 'demo-elektrik', gas: 'demo-dogalgaz', diesel: 'demo-jenerator', lpg: 'demo-lpg', veh: 'demo-arac',
} as const;
const it = (over: Partial<ConnectHubItem> & Pick<ConnectHubItem, 'id' | 'name'>): ConnectHubItem => ({
  code: null, resolution: 'monthly', resolution_kind: 'monthly', uoms: ['kWh'], monthly: true, scope: 1,
  factor_status: 'available', factor_reason: null, writable: true, blocked_reason: null, ...over,
});
export const DEMO_ITEMS: ConnectHubItem[] = [
  it({ id: ITEM.elec, code: 'grid-electricity', name: 'Şebeke elektriği', uoms: ['kWh', 'MWh'], scope: 2 }),
  it({ id: ITEM.gas, code: 'heating', name: 'Isınma amaçlı doğalgaz', uoms: ['m3', 'kWh'] }),
  it({ id: ITEM.diesel, name: 'Jeneratör dizel', uoms: ['L'] }),
  it({ id: ITEM.lpg, name: 'LPG (mutfak)', uoms: ['kg'] }),
  it({ id: ITEM.veh, code: 'vehicles', name: 'Araçlar', resolution: 'daily', resolution_kind: 'daily', uoms: ['L'], factor_status: 'option_required', writable: false, blocked_reason: 'not_monthly' }),
];

/** Ay bazında doluluk ve tüketim (Ocak–Aralık; mevsimsel). */
function monthData(month: number) {
  const occ = [0.48, 0.5, 0.56, 0.66, 0.78, 0.88, 0.94, 0.95, 0.84, 0.66, 0.52, 0.5][month - 1];
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const occupied = Math.round(PROFILE.rooms * days * occ);
  // Gecelik katsayı 60 kg CO₂e olacak şekilde tesis toplamı (konaklama payı ile).
  const totalKg = (DEMO_CO2_PER_NIGHT_KG * occupied) / ROOM_SHARE;
  const elecKwh = Math.round((totalKg * 0.52) / 0.478 / 100) * 100;
  const dieselL = month >= 6 && month <= 9 ? 380 : 220;
  const lpgKg = 640;
  const elecKg = elecKwh * 0.478;
  const dieselKg = dieselL * 2.66;
  const lpgKg_co2 = lpgKg * 2.94;
  const gasKg = totalKg - elecKg - dieselKg - lpgKg_co2;
  const gasM3 = Math.round(gasKg / 2.0667 / 10) * 10;
  return { occupied, totalKg, elecKwh, elecKg, gasM3, gasKg, dieselL, dieselKg, lpgKg, lpgKg_co2 };
}

const pad = (n: number) => String(n).padStart(2, '0');
const measurementId = (period: string, v = 1) => `d000000${v}-${period.slice(0, 4)}-4${period.slice(5, 7).padStart(3, '0')}-8000-000000000000`;

function lastCompleted(now: Date): string {
  const t = todayYmd(now);
  const y = Number(t.slice(0, 4)); const m = Number(t.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

function periodState(period: string, now: Date): 'future' | 'in_progress' | 'done' {
  const cur = todayYmd(now).slice(0, 7);
  return period > cur ? 'future' : period === cur ? 'in_progress' : 'done';
}

export function demoPeriods(year: number, now: Date): PeriodList {
  const active = lastCompleted(now);
  const empty = { sending: 0, accepted: 0, rejected: 0, outcome_unknown: 0 };
  const periods: PeriodListEntry[] = Array.from({ length: 12 }, (_, i) => {
    const period = `${year}-${pad(i + 1)}`;
    const st = periodState(period, now);
    if (st !== 'done') return { period, status: st, needs_attention: false, records: empty, occupied_room_nights: null, measurement: null };
    const d = monthData(i + 1);
    return {
      period,
      status: period === active ? 'published' : 'calculated',
      needs_attention: false,
      records: { ...empty, accepted: 4 },
      occupied_room_nights: d.occupied,
      measurement: { id: measurementId(period), is_active: period === active, total_tonnes: d.totalKg / 1000 },
    };
  });
  return { schema_ready: true, year, periods };
}

const sentAt = (period: string) => `${nextMonth(period)}-04T09:15:00Z`;
function nextMonth(period: string) {
  const y = Number(period.slice(0, 4)); const m = Number(period.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

function records(period: string): ActivityRecord[] {
  const d = monthData(Number(period.slice(5, 7)));
  const r = (id: string, item_id: string, item_name: string, quantity: number, uom: string, note: string | null = null): ActivityRecord => ({
    id: `${period}-${id}`, item_id, item_code: null, item_name, period, quantity, uom, note, status: 'accepted',
    provider_status: 'approved', provider_record_id: `demo-${period}-${id}`, error_code: null, error_message: null, warnings: [], sent_at: sentAt(period),
  });
  return [
    r('e', ITEM.elec, 'Şebeke elektriği', d.elecKwh, 'kWh', 'Fatura'),
    r('g', ITEM.gas, 'Isınma amaçlı doğalgaz', d.gasM3, 'm3'),
    r('d', ITEM.diesel, 'Jeneratör dizel', d.dieselL, 'L'),
    r('l', ITEM.lpg, 'LPG (mutfak)', d.lpgKg, 'kg'),
  ];
}

export function demoPeriodDetail(period: string, now: Date): PeriodDetail {
  const done = periodState(period, now) === 'done';
  return {
    period, environment: 'production',
    occupied_room_nights: done ? monthData(Number(period.slice(5, 7))).occupied : null,
    measurement_id: done ? measurementId(period) : null,
    records: done ? records(period) : [],
  };
}

export function demoProviderRecords(period: string, now: Date): ProviderRecord[] {
  if (periodState(period, now) !== 'done') return [];
  return records(period).map((r) => ({ item_id: r.item_id, item_code: r.item_code, item_name: r.item_name, period, quantity: r.quantity, uom: r.uom, origin: 'panel' as const }));
}

function line(period: string, id: string, item_id: string, item_name: string, scope: number, quantity: number, uom: string, kg: number, factor: string, country: string | null, year: number): CalculationLine {
  return {
    record_id: `demo-${period}-${id}`, external_id: null, source: 'api', item_id, item_code: null, item_name, scope, period, quantity, uom, excluded: false,
    factor_id: `demo-${id}`, factor_name: factor, factor_uom: uom, quantity_in_factor_uom: quantity, method: 'kg_co2e_per_uom', kg_co2e: kg,
    biogenic_co2_kg: null, data_year: year, factor_country_code: country, company_declared: false,
    factor_source: { name: country ? 'ETKB' : 'DEFRA', version: String(year), license: null, attribution: null, url: null },
    warnings: country && year < Number(period.slice(0, 4)) ? ['FACTOR_YEAR_FALLBACK'] : [],
  } as CalculationLine;
}

function stored(period: string, now: Date, version: 1 | 2): StoredMeasurement {
  const d = monthData(Number(period.slice(5, 7)));
  // Sürüm 1: doğalgaz faturası düzeltilmeden önceki hesap (denetim geçmişi örneği).
  const gasM3 = version === 1 ? d.gasM3 : Math.round(d.gasM3 * 0.96 / 10) * 10;
  const gasKg = version === 1 ? d.gasKg : d.gasKg * (gasM3 / d.gasM3);
  const lines = [
    line(period, 'e', ITEM.elec, 'Şebeke elektriği', 2, d.elecKwh, 'kWh', d.elecKg, 'Şebeke elektriği (Türkiye)', 'TR', 2022),
    line(period, 'g', ITEM.gas, 'Isınma amaçlı doğalgaz', 1, gasM3, 'm3', gasKg, 'Doğalgaz yakma', null, 2026),
    line(period, 'd', ITEM.diesel, 'Jeneratör dizel', 1, d.dieselL, 'L', d.dieselKg, 'Dizel yakma', null, 2026),
    line(period, 'l', ITEM.lpg, 'LPG (mutfak)', 1, d.lpgKg, 'kg', d.lpgKg_co2, 'LPG yakma', null, 2026),
  ];
  const s1 = lines.filter((l) => l.scope === 1).reduce((a, l) => a + l.kg_co2e, 0);
  const s2 = lines.filter((l) => l.scope === 2).reduce((a, l) => a + l.kg_co2e, 0);
  const total = s1 + s2;
  const guestKg = total * ROOM_SHARE;
  const coefficient = guestKg / d.occupied;
  const active = version === 1 && period === lastCompleted(now);
  const countryCheck: CountryCheck = {
    hotel_country_code: 'TR', hotel_country_status: 'valid', publishable: true,
    lines: lines.map((l) => ({
      record_id: l.record_id, item_name: l.item_name, factor_country_code: l.factor_country_code, provider_country_fallback: false,
      status: l.factor_country_code ? 'country_match' : 'country_independent', publishable: true,
      message: l.factor_country_code ? 'Faktör tesisin ülkesine ait.' : 'Ülkeden bağımsız faktör.',
    })),
    messages: [],
  } as CountryCheck;
  return {
    id: measurementId(period, version),
    status: 'calculated',
    is_current: version === 1,
    is_active: active,
    calculated_at: version === 1 ? `${nextMonth(period)}-05T10:20:00Z` : `${nextMonth(period)}-04T16:05:00Z`,
    calculation: {
      unit_id: 'demo-birim', period,
      inventory: { id: 'demo-envanter', name: 'GreenGold Stay envanteri', year: Number(period.slice(0, 4)), gwp_set: 'AR6', dataset: '3P Metrics', scope2_method: 'location' },
      release: { release_id: `demo-${period}`, content_hash: 'demo', generated_at: `${nextMonth(period)}-01T08:00:00Z` },
      lines, blocking: [], total_kg: total,
      scope_totals_kg: { scope_1: s1, scope_2: s2, scope_3: 0, unscoped: 0 },
      biogenic_co2_kg: 0, notices: [], has_company_declared_factors: false,
      coverage: { scopes_calculated: [1, 2], wtt_scope3_cat3: 'not_in_package', biogenic_co2: 'outside_scopes', label: 'Kapsam 1 ve 2; WTT (Kapsam 3 kat. 3) dahil değil' },
    },
    country_check: countryCheck,
    pricing: {
      coefficient_kg: coefficient, amount_per_night: Math.round((coefficient / 1000) * PRICE_PER_TONNE * 100) / 100, currency: DEMO_CURRENCY,
      price_per_tonne: PRICE_PER_TONNE, price_is_demo: true, total_kg: total, guestrooms_kg: guestKg, room_share: ROOM_SHARE,
      occupancy_percent: (d.occupied / (PROFILE.rooms * 30.5)) * 100, warnings: [], calculation_method: 'report', internal_use: true,
    },
    ignored_records: [],
    publication_block: null,
    changes: [],
  } as StoredMeasurement;
}

export function demoMeasurement(period: string, now: Date) {
  return { period, measurement: periodState(period, now) === 'done' ? stored(period, now, 1) : null };
}

export function demoMeasurementVersion(period: string, id: string, now: Date) {
  if (periodState(period, now) !== 'done') return null;
  const m = [stored(period, now, 1), stored(period, now, 2)].find((s) => s.id === id);
  return m ? { period, measurement: m } : null;
}

export function demoVersions(period: string, now: Date): PeriodMeasurementVersions {
  if (periodState(period, now) !== 'done') return { period, current_id: null, versions: [] };
  const row = (s: StoredMeasurement): MeasurementVersion => ({
    id: s.id, calculated_at: s.calculated_at, is_current: s.is_current, is_active: s.is_active, version: s.calculation.release.release_id,
    total_tonnes: s.calculation.total_kg / 1000, coefficient_kg: s.pricing.coefficient_kg, amount_per_night: s.pricing.amount_per_night,
    currency: s.pricing.currency, occupied_room_nights: monthData(Number(period.slice(5, 7))).occupied, inventory_name: s.calculation.inventory.name,
    release_id: s.calculation.release.release_id, country_publishable: true,
  });
  const current = stored(period, now, 1);
  return { period, current_id: current.id, versions: [row(current), row(stored(period, now, 2))] };
}

export function demoStatus(now: Date): ConnectHubStatus {
  const updated = `${todayYmd(now).slice(0, 4)}-01-12T10:15:00Z`;
  return {
    api: 'connecthub', schema_ready: true, provider_configured: true, environment: 'production',
    link: { id: 'demo-baglanti', unit_id: 'demo-birim', unit_name: 'Demo Otel (temsili)', environment: 'production', linked_at: updated, factor_inventory_id: 'demo-envanter' },
    environment_matches: true, write_key_ready: true, read_key_ready: true,
    profile: { ...PROFILE, updated_at: updated },
  };
}

/** Gerçek demo otelin kimliği korunur (ad, şehir, widget anahtarı, rol); fiyat alanları temsili. */
export function demoHotel(real: HotelInfo, now: Date): HotelInfo {
  return {
    ...real,
    status: 'active',
    currency: DEMO_CURRENCY,
    amount_per_night: DEMO_AMOUNT_PER_NIGHT,
    estimated_co2_per_night_kg: DEMO_CO2_PER_NIGHT_KG,
    carbon_pricing: {
      provider: 'threepmetrics', country: 'Turkey', state: '', hotel_class: '',
      coefficient_kg: DEMO_CO2_PER_NIGHT_KG, amount_per_night: DEMO_AMOUNT_PER_NIGHT, currency: DEMO_CURRENCY,
      price_per_tonne: PRICE_PER_TONNE, calculated_at: `${nextMonth(lastCompleted(now))}-05T10:20:00Z`,
    },
  };
}
