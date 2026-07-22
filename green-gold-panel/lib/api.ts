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
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  public_widget_key: string;
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

export function getWidgetEventsSummary(
  token: string,
  from?: string,
  to?: string,
) {
  const qs =
    from && to
      ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : '';
  return apiGet<WidgetEventsSummary>(
    `/dashboard/widget-events-summary${qs}`,
    token,
  );
}

export function getCarbonSummary(token: string, from?: string, to?: string) {
  const qs =
    from && to
      ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : '';
  return apiGet<CarbonSummary>(`/dashboard/carbon-summary${qs}`, token);
}

export function getHotel(token: string) {
  return apiGet<HotelInfo>('/dashboard/hotel', token);
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
