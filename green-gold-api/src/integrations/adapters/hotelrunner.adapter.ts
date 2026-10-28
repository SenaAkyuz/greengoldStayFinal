import { timingSafeEqual } from 'crypto';
import {
  NormalizedEventValidationError,
  validateNormalizedReservationEvent,
  type NormalizedReservationEvent,
  type ReservationStatus,
} from '../normalized-event';
import type {
  ParsedEvent,
  ProviderAdapter,
  WebhookParseInput,
  WebhookVerificationInput,
} from './provider-adapter.interface';

/**
 * HotelRunner App Manager REST API adapter'ı.
 *
 * Kaynak: https://developers.hotelrunner.com/ (Realtime Push, Retrieve
 * Reservations). Bu API bir PMS entegrasyonu içindir: "inventory in,
 * reservations out". Green Gold yalnızca rezervasyonları OKUR — teslim onayı
 * (confirm delivery) ve durum güncellemesi (reservation state update) ASLA
 * gönderilmez; bunlar otelin PMS'inin işidir.
 *
 * Green Gold katkısı, otelin HotelRunner booking engine'ine tanımladığı bir
 * EKSTRA'dır. Rezervasyonda `rooms[].extras[]` içinde, `code` veya `name`
 * alanı hotel_integrations.product_code ile eşleşen satır Green Gold satırıdır.
 *
 * Doğrulama: HotelRunner push'u HMAC imzası taşımaz. Callback URL'i
 * `?token={TOKEN}&hr_id={HR_ID}` ile çağrılır; TOKEN, otelin uygulamamız için
 * ürettiği anahtardır ve secret_ref üzerinden çözülen secret ile sabit zamanlı
 * karşılaştırılır. URL'deki webhook_routing_id ayrıca tahmin edilemez bir yol
 * parçasıdır.
 */
export const HOTELRUNNER_PROVIDER = 'hotelrunner';

/** Push/Retrieve yanıtındaki rezervasyonun bu adapter'ın kullandığı alt kümesi. */
export interface HotelRunnerExtra {
  name?: unknown;
  code?: unknown;
  is_extra?: unknown;
  total?: unknown;
}

export interface HotelRunnerRoom {
  extras?: unknown;
}

export interface HotelRunnerReservation {
  hr_number?: unknown;
  state?: unknown;
  currency?: unknown;
  updated_at?: unknown;
  completed_at?: unknown;
  rooms?: unknown;
}

const ACTIVE_STATES = new Set(['reserved', 'confirmed']);
const CANCELLED_STATES = new Set(['canceled', 'cancelled']);

function fail(code: string, message: string): never {
  throw new NormalizedEventValidationError(code, message);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sameText(a: unknown, b: string): boolean {
  const s = nonEmptyString(a);
  return s !== null && s.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function mapStatus(state: string): ReservationStatus {
  if (ACTIVE_STATES.has(state)) return 'confirmed';
  if (CANCELLED_STATES.has(state)) return 'cancelled';
  fail('unsupported_reservation_state', `Desteklenmeyen durum: ${state}`);
}

/**
 * Bir HotelRunner rezervasyonunu normalized event'e çevirir. Push ve polling
 * aynı fonksiyonu kullanır.
 *
 * - `reserved`/`confirmed` -> 'confirmed'. HotelRunner her bildirimde
 *   rezervasyonun TAM halini gönderir; değişiklikler de 'confirmed' olarak
 *   yeniden uygulanır (aynı durum = idempotent, tutar güncellenir). 'modified'
 *   kullanılmaz çünkü baseline kaçırılmışsa çekirdek onu reddeder.
 * - `canceled` -> 'cancelled', katkı 'voided'.
 * - Ödeme: HotelRunner ekstranın tahsil edildiğini satır bazında bildirmez.
 *   Bu yüzden katkı ASLA 'collected' sayılmaz; 'pending' kalır.
 */
export function mapHotelRunnerReservation(
  raw: HotelRunnerReservation,
  ctx: { hrId: string; productCode: string },
): NormalizedReservationEvent {
  const hrNumber = nonEmptyString(raw.hr_number);
  if (!hrNumber) fail('invalid_payload', 'hr_number eksik.');

  const state = nonEmptyString(raw.state);
  if (!state) fail('invalid_payload', 'state eksik.');
  const reservationStatus = mapStatus(state.toLowerCase());

  const occurredAt =
    nonEmptyString(raw.updated_at) ?? nonEmptyString(raw.completed_at);
  if (!occurredAt) fail('invalid_payload', 'updated_at eksik.');

  const currency = nonEmptyString(raw.currency)?.toUpperCase() ?? '';

  let found = false;
  let total = 0;
  const rooms = Array.isArray(raw.rooms)
    ? (raw.rooms as HotelRunnerRoom[])
    : [];
  for (const room of rooms) {
    const extras = Array.isArray(room?.extras)
      ? (room.extras as HotelRunnerExtra[])
      : [];
    for (const extra of extras) {
      if (extra?.is_extra !== true) continue;
      if (
        !sameText(extra.code, ctx.productCode) &&
        !sameText(extra.name, ctx.productCode)
      ) {
        continue;
      }
      const lineTotal = Number(extra.total);
      if (!Number.isFinite(lineTotal) || lineTotal < 0) {
        fail('invalid_payload', 'Green Gold ekstra tutarı geçersiz.');
      }
      found = true;
      total += lineTotal;
    }
  }

  // HotelRunner tutarları ondalıklı gönderir (ör. 20.0). Minor unit = 2 hane
  // varsayımı TRY/EUR/USD/GBP için doğrudur.
  const amountMinor = found ? Math.round(total * 100) : 0;
  const cancelled = reservationStatus === 'cancelled';

  return validateNormalizedReservationEvent({
    schema_version: 1,
    provider: HOTELRUNNER_PROVIDER,
    // Her güncelleme yeni bir updated_at taşır -> event kimliği tekil kalır;
    // aynı bildirimin tekrarı (push + polling) aynı kimliği üretir.
    provider_event_id: `${hrNumber}:${occurredAt}:${state.toLowerCase()}`,
    provider_reservation_id: hrNumber,
    property_id: ctx.hrId,
    reservation_status: reservationStatus,
    greengold: {
      selected: found,
      amount_minor: amountMinor,
      currency,
      ...(found ? { line_item_reference: ctx.productCode } : {}),
      payment_status: cancelled ? 'voided' : 'pending',
    },
    occurred_at: occurredAt,
  });
}

/** Push gövdesi: application/x-www-form-urlencoded, `data=<JSON>`. */
export function readHotelRunnerPushBody(
  rawBody: Buffer,
): HotelRunnerReservation[] {
  const data = new URLSearchParams(rawBody.toString('utf8')).get('data');
  if (!data) fail('invalid_payload', "Form alanı 'data' eksik.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    fail('invalid_payload', "'data' geçerli JSON değil.");
  }
  const reservations = (parsed as { reservations?: unknown } | null)
    ?.reservations;
  if (!Array.isArray(reservations)) {
    fail('invalid_payload', "'reservations' dizisi eksik.");
  }
  return reservations as HotelRunnerReservation[];
}

export function mapHotelRunnerReservations(
  reservations: HotelRunnerReservation[],
  ctx: { hrId: string; productCode: string },
): ParsedEvent[] {
  return reservations.map((reservation) => {
    try {
      return {
        ok: true,
        event: mapHotelRunnerReservation(reservation, ctx),
      } as const;
    } catch (e) {
      if (e instanceof NormalizedEventValidationError) {
        return { ok: false, error: e } as const;
      }
      throw e;
    }
  });
}

export class HotelRunnerAdapter implements ProviderAdapter {
  readonly provider = HOTELRUNNER_PROVIDER;
  readonly configured = true;

  verifySignature(input: WebhookVerificationInput): boolean {
    const token = input.query.token;
    if (!token || !input.query.hr_id || !input.secret) return false;
    return constantTimeEqual(token, input.secret);
  }

  parseEvents(input: WebhookParseInput): ParsedEvent[] {
    const hrId = nonEmptyString(input.query.hr_id);
    if (!hrId) fail('invalid_payload', 'hr_id eksik.');
    return mapHotelRunnerReservations(readHotelRunnerPushBody(input.rawBody), {
      hrId,
      productCode: input.productCode,
    });
  }
}
