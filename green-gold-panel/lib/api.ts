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

export interface HotelInfo {
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
}

export interface HotelUpdate {
  name?: string;
  city?: string;
  timezone?: string;
  contribution_amount_per_night?: number;
  allowed_origins?: string[];
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

export function getApiBaseUrl() {
  return API_BASE_URL;
}
