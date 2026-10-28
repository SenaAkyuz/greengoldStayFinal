import type { HotelRunnerReservation } from '../adapters/hotelrunner.adapter';

/**
 * HotelRunner App Manager REST API istemcisi — YALNIZCA OKUMA.
 * https://developers.hotelrunner.com/custom-apps/rest-api
 *
 * Bilinçli olarak YOK: confirm delivery, reservation state update, inventory
 * update. Bunlar otelin PMS'inin işidir; Green Gold onları çağırırsa PMS'in
 * rezervasyon kuyruğunu bozar.
 *
 * Limitler (otel başına): günde 250, dakikada 5 istek. Token query'de gider —
 * hata mesajlarına URL/TOKEN ASLA yazılmaz.
 */
export const HOTELRUNNER_API_BASE = 'https://app.hotelrunner.com/api/v2/apps';
const TIMEOUT_MS = 15_000;

export interface HotelRunnerCredentials {
  token: string;
  hrId: string;
}

export interface HotelRunnerRoomInfo {
  rate_code?: string;
  inv_code?: string;
  name?: string;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class HotelRunnerApiError extends Error {
  constructor(public readonly status: number) {
    super(`HotelRunner API hatası (HTTP ${status}).`);
    this.name = 'HotelRunnerApiError';
  }
}

export class HotelRunnerClient {
  constructor(
    private readonly creds: HotelRunnerCredentials,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly baseUrl = HOTELRUNNER_API_BASE,
  ) {}

  private async get(
    path: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const qs = new URLSearchParams({
      token: this.creds.token,
      hr_id: this.creds.hrId,
      ...params,
    });
    const res = await this.fetchImpl(`${this.baseUrl}${path}?${qs}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new HotelRunnerApiError(res.status);
    return res.json();
  }

  async listRooms(): Promise<HotelRunnerRoomInfo[]> {
    const body = (await this.get('/rooms')) as { rooms?: unknown };
    return Array.isArray(body?.rooms)
      ? (body.rooms as HotelRunnerRoomInfo[])
      : [];
  }

  /**
   * Belirli bir tarihten sonra güncellenen rezervasyonlar. `undelivered=false`
   * ŞARTTIR: varsayılan (true) PMS'in teslim kuyruğunu okur; biz o kuyruğu
   * tüketmeyiz ve teslim onayı göndermeyiz.
   */
  async listReservationsUpdatedSince(
    fromDate: string,
    page: number,
    perPage: number,
  ): Promise<HotelRunnerReservation[]> {
    const body = (await this.get('/reservations', {
      undelivered: 'false',
      from_last_update_date: fromDate,
      per_page: String(perPage),
      page: String(page),
    })) as { reservations?: unknown };
    return Array.isArray(body?.reservations)
      ? (body.reservations as HotelRunnerReservation[])
      : [];
  }
}
