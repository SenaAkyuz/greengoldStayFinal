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
