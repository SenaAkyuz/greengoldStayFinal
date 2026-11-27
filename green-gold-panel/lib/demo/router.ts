/**
 * Demo hesabı yönlendiricisi (yalnız OKUMA uçları).
 *
 * Güvenlik: Demo verisine geçiş kararı, API'nin bu oturum için döndürdüğü
 * role dayanır (`GET /dashboard/hotel` → `role === 'demo_viewer'`); istemcinin
 * gönderebileceği bir bayrak yoktur. Gerçek otel oturumları hiçbir zaman demo
 * verisi görmez. Yalnız GET istekleri taklit edilir; yazma istekleri her zaman
 * API'ye gider (demo için API 403 döner — DemoReadOnlyGuard).
 */
import { cache } from 'react';
import type { HotelInfo } from '../api';
import {
  DEMO_INTEGRATIONS,
  DEMO_ITEMS,
  demoContributions,
  demoDaily,
  demoHotel,
  demoMeasurement,
  demoMeasurementVersion,
  demoPeriodDetail,
  demoPeriods,
  demoProviderRecords,
  demoReport,
  demoStatus,
  demoVersions,
  resolveDemoRange,
  todayYmd,
} from './dataset';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

/** Oturumun otel kaydı — istek başına bir kez okunur (getHotel ile ortak). */
export const fetchHotelRaw = cache(
  async (base: string, token: string): Promise<{ data: HotelInfo | null; error: string | null; status: number | null }> => {
    try {
      const res = await fetch(`${base}/dashboard/hotel`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = (await res.json()) as Envelope<HotelInfo>;
      if (!res.ok || !json.success || json.data === null) {
        return { data: null, error: json.error?.message ?? `HTTP ${res.status}`, status: res.status };
      }
      return { data: json.data, error: null, status: res.status };
    } catch {
      return { data: null, error: 'API sunucusuna ulaşılamadı.', status: null };
    }
  },
);

export function isDemoHotel(hotel: HotelInfo | null | undefined): boolean {
  return hotel?.role === 'demo_viewer';
}

const DASH = '/dashboard';
const CH = '/dashboard/carbon-provider/connecthub';
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Bu yol demo verisiyle karşılanabilir mi (rol sorgusu yalnız bunlarda yapılır)? */
function handles(pathname: string): boolean {
  return (
    [`${DASH}/report`, `${DASH}/widget-events-summary`, `${DASH}/funnel`, `${DASH}/carbon-summary`, `${DASH}/daily`,
      `${DASH}/contributions-summary`, `${DASH}/integration-health`].includes(pathname) || pathname.startsWith(`${CH}/`)
  );
}

/** Demo verisi; `found: false` → gerçek API'ye git. */
function demoData(path: string, now: Date = new Date()): { found: boolean; data: unknown } {
  const url = new URL(path, 'http://demo.local');
  const p = url.pathname;
  const q = url.searchParams;
  const range = () => resolveDemoRange(q, now);
  const year = () => (Number(q.get('year')) || Number(todayYmd(now).slice(0, 4)));
  switch (p) {
    case `${DASH}/report`: return { found: true, data: demoReport(range()) };
    case `${DASH}/widget-events-summary`: return { found: true, data: demoReport(range()).summary };
    case `${DASH}/funnel`: return { found: true, data: demoReport(range()).funnel };
    case `${DASH}/carbon-summary`: return { found: true, data: demoReport(range()).carbon };
    case `${DASH}/daily`: return { found: true, data: demoDaily(range()) };
    case `${DASH}/contributions-summary`: return { found: true, data: demoContributions(range()) };
    case `${DASH}/integration-health`: return { found: true, data: DEMO_INTEGRATIONS };
    case `${CH}/status`: return { found: true, data: demoStatus(now) };
    case `${CH}/items`: return { found: true, data: DEMO_ITEMS };
    case `${CH}/periods`: return { found: true, data: demoPeriods(year(), now) };
  }
  const m = p.startsWith(`${CH}/periods/`) ? p.slice(`${CH}/periods/`.length).split('/') : null;
  if (m && PERIOD.test(m[0])) {
    const [period, a, b] = m;
    if (!a) return { found: true, data: demoPeriodDetail(period, now) };
    if (a === 'provider-records' && !b) return { found: true, data: { period, environment: 'production', records: demoProviderRecords(period, now) } };
    if (a === 'measurement' && !b) return { found: true, data: demoMeasurement(period, now) };
  }
  return { found: false, data: undefined };
}

/**
 * GET isteği için demo yanıtı. Demo oturumu değilse ya da yol karşılanmıyorsa
 * `null` → çağıran gerçek API'ye gider.
 */
export async function demoGet<T>(base: string, path: string, token: string): Promise<{ data: T | null; error: string | null } | null> {
  const pathname = new URL(path, 'http://demo.local').pathname;
  if (!handles(pathname)) return null;
  const hotel = await fetchHotelRaw(base, token);
  if (!isDemoHotel(hotel.data)) return null;
  const r = demoResolve(path);
  if (!r.found) return null;
  return r.data === null ? { data: null, error: 'Kayıt bulunamadı.' } : { data: r.data as T, error: null };
}

/** demoData + sürüm uçları (tek giriş noktası). */
export function demoResolve(path: string, now: Date = new Date()): { found: boolean; data: unknown } {
  const url = new URL(path, 'http://demo.local');
  const parts = url.pathname.startsWith(`${CH}/periods/`) ? url.pathname.slice(`${CH}/periods/`.length).split('/') : null;
  if (parts && PERIOD.test(parts[0]) && parts[1] === 'measurements') {
    if (!parts[2]) return { found: true, data: demoVersions(parts[0], now) };
    if (!parts[3]) return { found: true, data: demoMeasurementVersion(parts[0], parts[2], now) };
  }
  return demoData(path, now);
}

/** getHotel için: demo oturumunda temsili fiyat alanlarıyla birlikte. */
export function hotelForSession(hotel: HotelInfo, now: Date = new Date()): HotelInfo {
  return isDemoHotel(hotel) ? demoHotel(hotel, now) : hotel;
}
