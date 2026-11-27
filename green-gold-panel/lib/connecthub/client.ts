/**
 * ConnectHub panel uçları için HTTP istemcisi — YALNIZ SUNUCU TARAFINDA
 * (Server Component / Server Action) çağrılır; token tarayıcıya inmez.
 *
 * Güvenlik kuralları (lib/api.ts ile aynı):
 *  - hotel_id ASLA gönderilmez; backend token'dan çözer (tenant izolasyonu).
 *  - API anahtarları backend'de; panel yalnız "hazır mı" bayrağını görür.
 *  - Hata yanıtındaki `code` korunur; ekran metni `errors.ts`'ten gelir.
 */
import type {
  CalculatePeriodResult,
  ConnectHubItem,
  ConnectHubStatus,
  FacilityProfile,
  FacilityProfileInput,
  PeriodDetail,
  PeriodList,
  PeriodMeasurement,
  PeriodMeasurementVersions,
  ProviderRecordList,
  StoredMeasurement,
  SubmitPeriodInput,
  SubmitPeriodResult,
} from './types';

export interface ApiResult<T> {
  data: T | null;
  /** Backend'in iletisi (yalnız günlük/teşhis; ekran errors.ts'i kullanır). */
  error: string | null;
  /** Backend hata kodu (ör. carbon_period_closed) veya ağ hatasında 'network'. */
  code: string | null;
  /** HTTP durumu; ağ hatasında null. */
  status: number | null;
}

const BASE = '/dashboard/carbon-provider/connecthub';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function apiBase() {
  return process.env.API_BASE_URL ?? 'http://localhost:3000';
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

export async function request<T>(
  path: string,
  token: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { data: null, error: 'API sunucusuna ulaşılamadı.', code: 'network', status: null };
  }
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || !json.success || json.data === null) {
    return {
      data: null,
      error: json?.error?.message ?? `HTTP ${res.status}`,
      code: json?.error?.code ?? (res.status >= 500 ? 'internal_error' : null),
      status: res.status,
    };
  }
  return { data: json.data, error: null, code: null, status: res.status };
}

/** Ölçüm kimliği (UUID) — URL'e girmeden doğrulanır. */
export function isMeasurementId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function periodPath(period: string, suffix = '') {
  // Dönem, URL'e girmeden önce doğrulanır (yol enjeksiyonu yok).
  if (!PERIOD_RE.test(period)) throw new Error(`Geçersiz dönem: ${period}`);
  return `${BASE}/periods/${period}${suffix}`;
}

function yearQs(year?: number) {
  if (year === undefined) return '';
  if (!Number.isInteger(year)) throw new Error(`Geçersiz yıl: ${year}`);
  return `?year=${year}`;
}

export const connecthub = {
  status: (token: string) => request<ConnectHubStatus>(`${BASE}/status`, token),

  items: (token: string, year?: number) =>
    request<ConnectHubItem[]>(`${BASE}/items${yearQs(year)}`, token),

  periods: (token: string, year?: number) =>
    request<PeriodList>(`${BASE}/periods${yearQs(year)}`, token),

  period: (token: string, period: string) =>
    request<PeriodDetail>(periodPath(period), token),

  saveProfile: (token: string, body: FacilityProfileInput) =>
    request<FacilityProfile>(`${BASE}/profile`, token, 'PUT', body),

  setOccupancy: (token: string, period: string, occupied_room_nights: number) =>
    request<PeriodDetail>(periodPath(period, '/occupancy'), token, 'PUT', {
      occupied_room_nights,
    }),

  /**
   * Kayıtları sağlayıcıya yazar. Doğrudan çağırmayın: mükerrer koruması
   * için `submit.ts` → `submitPlannedPeriod` kullanılır.
   */
  submitRecords: (token: string, period: string, body: SubmitPeriodInput) =>
    request<SubmitPeriodResult>(periodPath(period, '/records'), token, 'POST', body),

  /** Ölçüm ortağındaki onaylı dönem kayıtları (salt okuma; hesap bunlarla yapılır). */
  providerRecords: (token: string, period: string) =>
    request<ProviderRecordList>(periodPath(period, '/provider-records'), token),

  /** Kaydedilmiş hesap (salt okuma; sayfa yenilense de sonuç kaybolmaz). */
  measurement: (token: string, period: string) =>
    request<PeriodMeasurement>(periodPath(period, '/measurement'), token),

  /** Dönemin tüm kayıtlı sürümleri (salt okuma). */
  measurements: (token: string, period: string) =>
    request<PeriodMeasurementVersions>(periodPath(period, '/measurements'), token),

  /** Belirli bir kayıtlı sürüm (salt okuma; önceki sürümler dahil). */
  measurementVersion: (token: string, period: string, id: string) => {
    if (!isMeasurementId(id)) throw new Error(`Geçersiz ölçüm kimliği: ${id}`);
    return request<{ period: string; measurement: StoredMeasurement }>(periodPath(period, `/measurements/${id}`), token);
  },

  calculate: (token: string, period: string) =>
    request<CalculatePeriodResult>(periodPath(period, '/calculate'), token, 'POST', {}),
};
