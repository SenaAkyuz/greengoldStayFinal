// Panel -> NestJS API çağrıları. Her zaman server tarafında, Bearer token ile.
// Tenant izolasyonu + summary mantığı NestJS guard/serviste tek yerde kalır.

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export interface WidgetEventsSummary {
  period: { from: string; to: string };
  views: number;
  selections: number;
  add_clicks: number;
  conversion_rate_pct: number;
}

export interface CarbonRow { country: string; state: string; class: string; room: number; room_method: string | null }
export interface CarbonOptions { source: { version: string; data_year: number; url: string }; rows: CarbonRow[]; demo_price_per_tonne: number }
export interface HotelCarbonInput {
 mode: 'consumption' | 'report'; country: string; period_start: string; period_end: string;
 rooms: number; occupied_room_nights: number; total_area_m2: number; guestrooms_area_m2: number; meeting_area_m2: number;
 electricity_connection?: 'distribution' | 'transmission'; electricity_kwh?: number; gas_kwh?: number; diesel_litres?: number;
 other_emissions_kg?: number; other_reference?: string; report_tonnes?: number; report_basis?: 'hotel_total' | 'guestrooms'; report_reference?: string; assessor?: string;
}
export interface HotelCarbonResult extends CarbonPricing {
 input: HotelCarbonInput; total_kg: number; guestrooms_kg: number; room_share: number; occupancy_percent: number; intensity_kg_m2: number;
 factors: { value: number; unit: string; year: number; source: string; url: string }[];
 breakdown: { label: string; kg: number }[]; verification: 'unverified'; scope: string;
}
export interface CarbonReport { id: string; hotel_name: string; city: string | null; result: HotelCarbonResult }
export interface CarbonPricing { provider?: string; input?: HotelCarbonInput; version?: string; calculation_method?: string; country: string; state: string; hotel_class: string; coefficient_kg: number; amount_per_night: number; currency: string; price_per_tonne: number; calculated_at: string }
export function getCarbonOptions(token: string) { return apiGet<CarbonOptions>('/dashboard/carbon-options', token); }

export interface HotelInfo {
  carbon_reports?: CarbonReport[];
  carbon_pricing?: CarbonPricing | null;
  hotel_name: string;
  city: string | null;
  status: string;
  timezone: string;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  commission_rate: number;
  public_widget_key: string;
  allowed_origins: string[];
  hotel_type: string;
  logo_url: string | null;
  brand_color: string | null;
  // Giriş yapan kullanıcının rolü (demo modu UI'ı için). 'demo_viewer' = salt okunur.
  role: string;
}

export interface HotelUpdate {
  hotel_carbon?: HotelCarbonInput;
  carbon_country?: string;
  carbon_state?: string;
  carbon_hotel_class?: string;
  name?: string;
  city?: string;
  timezone?: string;
  contribution_amount_per_night?: number;
  allowed_origins?: string[];
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface CarbonSummary {
  period: { from: string; to: string };
  contributions_count: number;
  total_selected_nights: number;
  estimated_co2_kg: number;
  tree_equivalent: number;
  co2_per_night_kg: number;
  is_estimated: boolean;
}

export interface InteractionFunnel {
  period: { from: string; to: string };
  stages: { viewed: number; selected: number; clicked: number };
  rates: {
    view_to_select_pct: number;
    select_to_button_pct: number;
    view_to_button_pct: number;
  };
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

async function apiGet<T>(
  path: string,
  token: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.success || json.data === null) {
      return { data: null, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: 'API sunucusuna ulaşılamadı.' };
  }
}

// Panel yalnızca `range` (month|7d|30d) geçer; tarih çözümü backend'de (otel tz).
function rangeQs(range?: string) {
  return range ? `?range=${encodeURIComponent(range)}` : '';
}

export function getWidgetEventsSummary(token: string, range?: string) {
  return apiGet<WidgetEventsSummary>(
    `/dashboard/widget-events-summary${rangeQs(range)}`,
    token,
  );
}

export function getCarbonSummary(token: string, range?: string) {
  return apiGet<CarbonSummary>(
    `/dashboard/carbon-summary${rangeQs(range)}`,
    token,
  );
}

export function getFunnel(token: string, range?: string) {
  return apiGet<InteractionFunnel>(`/dashboard/funnel${rangeQs(range)}`, token);
}

export interface DashboardReport {
  period: { from: string; to: string };
  summary: WidgetEventsSummary;
  funnel: InteractionFunnel;
  carbon: CarbonSummary;
}

export function getReport(token: string, range?: string) {
  return apiGet<DashboardReport>(`/dashboard/report${rangeQs(range)}`, token);
}

export function getHotel(token: string) {
  return apiGet<HotelInfo>('/dashboard/hotel', token);
}

export async function updateHotel(
  token: string,
  patch: HotelUpdate,
): Promise<{ data: HotelInfo | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/dashboard/hotel`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
      cache: 'no-store',
    });
    const json = (await res.json()) as Envelope<HotelInfo>;
    if (!res.ok || !json.success || json.data === null) {
      return { data: null, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: 'API sunucusuna ulaşılamadı.' };
  }
}

// Faz 2 — booking engine/PMS entegrasyon çekirdeği (bkz. green-gold-api
// src/integrations/*). Yalnızca imzası doğrulanmış server-to-server event'lerden
// yazılan gerçek kayıtlar; widget click event'i DEĞİL.
export interface ReservationContributionSummary {
  selected: boolean;
  amount_minor: number;
  currency: string;
  status: string;
  collected_at: string | null;
  refunded_at: string | null;
}

export interface ReservationSummary {
  id: string;
  provider_reservation_id: string;
  booking_status: string;
  arrival_date: string | null;
  departure_date: string | null;
  provider_updated_at: string | null;
  updated_at: string;
  contribution: ReservationContributionSummary | null;
}

export interface ReservationsPage {
  period: { from: string; to: string };
  items: ReservationSummary[];
  truncated: boolean;
}

export interface CurrencyContributionTotals {
  currency: string;
  collected_total_minor: number;
  refunded_total_minor: number;
  net_contribution_minor: number;
}

export interface ContributionsSummary {
  period: { from: string; to: string };
  totals: CurrencyContributionTotals[];
  contributions_count: number;
}

export interface IntegrationHealthItem {
  id: string;
  provider: string;
  environment: string;
  status: string;
  external_property_id: string;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_signature_verified: boolean | null;
}

export interface IntegrationHealthSummary {
  integrations: IntegrationHealthItem[];
}

export function getReservations(token: string, range?: string) {
  return apiGet<ReservationsPage>(`/dashboard/reservations${rangeQs(range)}`, token);
}

export function getContributionsSummary(token: string, range?: string) {
  return apiGet<ContributionsSummary>(
    `/dashboard/contributions-summary${rangeQs(range)}`,
    token,
  );
}

export function getIntegrationHealth(token: string) {
  return apiGet<IntegrationHealthSummary>('/dashboard/integration-health', token);
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

/**
 * Embed kodundaki <script src>. Otelin DIŞ sitesinde çalışacağı için MUTLAK URL
 * olmalı (göreli /green-gold-widget.v1.js otelin domain'ine bakar, yanlış).
 * Öncelik NEXT_PUBLIC_WIDGET_SRC; yoksa panel origin'inden türet; ikisi de yoksa
 * config eksik olduğunu belli eden placeholder. Hardcode CDN adresi YOK.
 */
export function getWidgetEmbedSrc() {
  const explicit = process.env.NEXT_PUBLIC_WIDGET_SRC;
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return `${site.replace(/\/+$/, '')}/green-gold-widget.v1.js`;
  return 'https://<panel-domain>/green-gold-widget.v1.js';
}

export function previewCarbon(token: string, input: HotelCarbonInput) { return apiGet<HotelCarbonResult>('/dashboard/carbon-preview?input=' + encodeURIComponent(JSON.stringify(input)), token); }

// --- Harici karbon ölçüm sağlayıcısı (3pmetrics) -----------------------------
// Bkz. green-gold-api/src/carbon/*. Otel emisyon verisini BU panelden girer
// (API -> 3pmetrics POST /cca/replies); 3pmetrics hesaplar, API seçilen
// dönemin emisyon özetini (tonCO2e) çeker. Bağlantı/anahtar
// yoksa POST uçları 503 + açık `code` döner; panel bunu DÜRÜST bir "bekleniyor"
// durumu olarak gösterir, bağlıymış gibi davranmaz.

export interface CarbonProviderLinkView {
  id: string;
  provider: string;
  environment: string;
  status: string;
  external_property_id: string;
  external_property_name: string | null;
  linked_at: string | null;
  revoked_at: string | null;
}

export interface CarbonMeasurementView {
  id: string;
  external_measurement_id: string;
  external_version: string;
  period_start: string;
  period_end: string;
  result_status: string;
  total_emissions: number | null;
  total_emissions_unit: string | null;
  scope: string | null;
  methodology: string | null;
  methodology_version: string | null;
  verification_status: string | null;
  report_url: string | null;
  rooms: number | null;
  occupied_room_nights: number | null;
  guest_nights: number | null;
  room_night_kg: number | null;
  allocation_method: string | null;
  is_active: boolean;
  provider_updated_at: string | null;
  imported_at: string;
}

export interface CarbonProviderStatus {
  provider: string;
  /** Sağlayıcıya bu ortamda çağrı yapılabilir mi. */
  provider_configured: boolean;
  /** Otelin bağlantısı için API anahtarı sunucuda tanımlı mı. */
  credentials_ready: boolean;
  environment: 'sandbox' | 'production';
  /** Karbon ölçüm tabloları (migration 0015) uygulanmış mı. */
  schema_ready: boolean;
  link: CarbonProviderLinkView | null;
  measurements_count: number;
  active_measurement: CarbonMeasurementView | null;
  active_source:
    | 'provider_measurement'
    | 'hotel_input'
    | 'regional_estimate'
    | 'none';
}

/** 3pmetrics özetini içeri alırken otelden istenen dağıtım verisi. */
export interface ProviderImportInput {
  period_start: string;
  period_end: string;
  country: string;
  rooms: number;
  occupied_room_nights: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
}

export interface ProviderSummaryScope {
  scopeLabel: string;
  scopeTitle: string;
  total: number;
}

export interface ProviderPricing extends HotelCarbonResult {
  warnings: string[];
  external_account_id: string;
  external_account_name: string | null;
}

export interface ImportMeasurementResult {
  measurement: CarbonMeasurementView;
  summary: {
    totalEmissions: number;
    totalEmissionsUnit: string;
    scopes: ProviderSummaryScope[];
    lines: {
      scopeLabel: string;
      categoryTitle: string;
      source: string;
      value: number;
      unit: string;
    }[];
  };
  pricing: ProviderPricing;
  duplicate: boolean;
}

export function getCarbonProviderStatus(token: string) {
  return apiGet<CarbonProviderStatus>('/dashboard/carbon-provider/status', token);
}

export function getCarbonMeasurements(token: string) {
  return apiGet<{ schema_ready: boolean; items: CarbonMeasurementView[] }>(
    '/dashboard/carbon-provider/measurements',
    token,
  );
}

/** Seçilen dönemin 3pmetrics özetini içeri alır. Widget fiyatını DEĞİŞTİRMEZ. */
export function importCarbonMeasurement(
  token: string,
  body: ProviderImportInput,
) {
  return apiPost<ImportMeasurementResult>(
    '/dashboard/carbon-provider/measurements',
    token,
    body,
  );
}

/** İçeri alınmış ölçümü widget fiyatına uygular. */
export function activateCarbonMeasurement(token: string, measurementId: string) {
  return apiPost<{ measurement_id: string; pricing: ProviderPricing }>(
    `/dashboard/carbon-provider/measurements/${encodeURIComponent(measurementId)}/activate`,
    token,
    {},
  );
}

// --- 3pmetrics veri girişi ----------------------------------------------------
// 3pmetrics'e yazılan kayıt API'den SİLİNEMEZ (yalnızca 3pmetrics arayüzünden).

export interface ProviderUnit {
  externalUnitId: string;
  name: string;
  type: string;
}

export interface EmissionOptionGroup {
  description: string;
  options: { name: string; value: string }[];
}

export interface EmissionResource {
  slug: string;
  title: string;
  header: string | null;
  description: string | null;
  ghgScope: { id: number | null; name: string } | null;
  systemOptions: EmissionOptionGroup | null;
  userOptions: EmissionOptionGroup | null;
  /** 'flight-route-v1' ise miktar yerine uçuş rotası girilir. */
  inputMode: string | null;
  requiredFields: string[];
}

export interface Airport {
  iata: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface CarbonEntryInput {
  idempotency_key: string;
  unit_id: string;
  resource_slug: string;
  date: string;
  value?: string;
  system_option_value?: string;
  user_option_value?: string;
  flight_name?: string;
  departure_iata?: string;
  arrival_iata?: string;
  confirm_irreversible: true;
  allow_duplicate?: boolean;
}

export interface CarbonEntry {
  id: string;
  idempotency_key: string;
  unit_id: string;
  unit_name: string | null;
  resource_slug: string;
  resource_title: string | null;
  ghg_scope: string | null;
  date: string;
  value: number | null;
  system_option: { value: string; label: string | null } | null;
  user_option: { value: string; label: string | null } | null;
  flight: {
    passengerOrFlightName: string;
    departureIata: string;
    arrivalIata: string;
  } | null;
  status:
    | 'sending'
    | 'sent'
    | 'failed'
    | 'outcome_unknown'
    | 'deleted_in_provider';
  reply_id: number | null;
  error_code: string | null;
  documents: { file_name: string; uploaded_at: string }[];
  environment: string;
  created_at: string;
}

export function getProviderUnits(token: string) {
  return apiGet<ProviderUnit[]>('/dashboard/carbon-provider/units', token);
}

export function getEmissionResources(token: string, unitId: string) {
  return apiGet<EmissionResource[]>(
    `/dashboard/carbon-provider/units/${encodeURIComponent(unitId)}/emission-resources`,
    token,
  );
}

export function searchAirports(token: string, query: string) {
  return apiGet<Airport[]>(
    `/dashboard/carbon-provider/airports?query=${encodeURIComponent(query)}`,
    token,
  );
}

export function getCarbonEntries(token: string) {
  return apiGet<{ schema_ready: boolean; items: CarbonEntry[] }>(
    '/dashboard/carbon-provider/entries',
    token,
  );
}

/** Emisyon verisini 3pmetrics'e yazar. GERİ ALINAMAZ. */
export function createCarbonEntry(token: string, body: CarbonEntryInput) {
  return apiPost<{ entry: CarbonEntry; replayed: boolean }>(
    '/dashboard/carbon-provider/entries',
    token,
    body,
  );
}

/** Gönderilmiş kayda kanıt belgesi ekler (multipart `file`). */
export function uploadCarbonEntryDocument(
  token: string,
  entryId: string,
  form: FormData,
) {
  return apiSend<CarbonEntry>(
    `/dashboard/carbon-provider/entries/${encodeURIComponent(entryId)}/documents`,
    token,
    'POST',
    form,
  );
}

/** Kaydın 3pmetrics arayüzünden silindiğini işaretler (API silme yapmaz). */
export function markCarbonEntryDeleted(token: string, entryId: string) {
  return apiPost<CarbonEntry>(
    `/dashboard/carbon-provider/entries/${encodeURIComponent(entryId)}/mark-deleted`,
    token,
    {},
  );
}

export function revokeCarbonProviderLink(token: string, linkId: string) {
  return apiSend<{ id: string; status: string }>(
    `/dashboard/carbon-provider/links/${encodeURIComponent(linkId)}`,
    token,
    'DELETE',
  );
}

function apiPost<T>(path: string, token: string, body: unknown) {
  return apiSend<T>(path, token, 'POST', body);
}

async function apiSend<T>(
  path: string,
  token: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<{ data: T | null; error: string | null; code?: string | null }> {
  // FormData (belge yükleme) olduğu gibi gider; sınırı fetch koyar.
  const isForm = body instanceof FormData;
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined || isForm
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.success || json.data === null) {
      return {
        data: null,
        error: json.error?.message ?? `HTTP ${res.status}`,
        code: json.error?.code ?? null,
      };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: 'API sunucusuna ulaşılamadı.' };
  }
}
