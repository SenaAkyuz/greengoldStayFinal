/**
 * Provider-neutral normalized event kontratı (Faz 2 çekirdeği).
 *
 * BU BİR SynXis PAYLOAD'I DEĞİLDİR. SynXis dokümanı/sandbox/credential henüz
 * yok — bu yalnızca adapter sınırının (src/integrations/adapters/*) çekirdeğe
 * verdiği İÇ, provider-bağımsız kontrattır. Her adapter kendi sağlayıcısının
 * ham payload'ını bu şekle çevirmekten sorumludur; çekirdek (bu dosya, state
 * machine, webhook ingestion) SynXis'in veya başka bir sağlayıcının alan
 * adlarını/endpoint'lerini HİÇ bilmez.
 *
 * Misafir PII'ı (ad/e-posta/telefon) BİLEREK bu kontrata dahil edilmedi —
 * reservations/integration_deliveries tabloları varsayılan olarak PII
 * saklamaz (bkz. migration 0010/0012 yorumları).
 */

export const NORMALIZED_EVENT_SCHEMA_VERSION = 1 as const;

export const RESERVATION_STATUSES = [
  'confirmed',
  'modified',
  'cancelled',
  'no_show',
  'stayed',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'collected',
  'refunded',
  'voided',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface NormalizedGreenGoldLineItem {
  selected: boolean;
  /** Integer minor units (500 = 5.00). Floating point KULLANILMAZ. */
  amount_minor: number;
  /** ISO 4217, üç harf büyük (ör. 'EUR'). */
  currency: string;
  line_item_reference?: string;
  payment_status: PaymentStatus;
}

export interface NormalizedReservationEvent {
  schema_version: 1;
  provider: string;
  provider_event_id: string;
  provider_reservation_id: string;
  /** Sağlayıcının property/hotel kimliği — hotel_integrations.external_property_id ile eşleşmeli. */
  property_id: string;
  reservation_status: ReservationStatus;
  greengold: NormalizedGreenGoldLineItem;
  /** ISO 8601 timestamp — sağlayıcıda event'in GERÇEKTEN oluştuğu an. */
  occurred_at: string;
}

/** Delivery log'a yazılabilecek makine-okunur, güvenli (secret/PII içermeyen) hata kodu. */
export class NormalizedEventValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NormalizedEventValidationError';
  }
}

// Güvenli üst sınır: 100.000,00 birim (minor units). Gerçekçi bir optional-extra
// tutarının fersah fersah üzerinde ama taşma/overflow'a karşı sağlam bir tavan.
const MAX_AMOUNT_MINOR = 100_000_00;

const TOP_LEVEL_FIELDS = new Set([
  'schema_version',
  'provider',
  'provider_event_id',
  'provider_reservation_id',
  'property_id',
  'reservation_status',
  'greengold',
  'occurred_at',
]);

const GREENGOLD_FIELDS = new Set([
  'selected',
  'amount_minor',
  'currency',
  'line_item_reference',
  'payment_status',
]);

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_ID_LEN = 200;

function fail(code: string, message: string): never {
  throw new NormalizedEventValidationError(code, message);
}

function requireNonEmptyString(
  value: unknown,
  field: string,
  maxLen = MAX_ID_LEN,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('invalid_payload', `${field} zorunlu bir metin olmalı.`);
  }
  const s = value;
  if (s.length > maxLen) {
    fail('invalid_payload', `${field} çok uzun (maks ${maxLen}).`);
  }
  return s;
}

/**
 * Ham (adapter'ın parse ettiği) bir nesneyi doğrulanmış NormalizedReservationEvent'e
 * çevirir. Herhangi bir kural ihlalinde NormalizedEventValidationError fırlatır —
 * ÇAĞIRAN taraf bunu integration_deliveries'e 'rejected_invalid_payload' olarak
 * kaydeder, hiçbir domain (reservations/contributions) yazımı yapılmaz.
 */
export function validateNormalizedReservationEvent(
  raw: unknown,
): NormalizedReservationEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('invalid_payload', 'Event bir JSON nesnesi olmalı.');
  }
  const r = raw as Record<string, unknown>;

  // Bilinmeyen üst düzey alanları reddet (açık versioning: schema_version
  // ileride artarsa yeni bir doğrulama dalı eklenir, sessizce genişletilmez).
  for (const key of Object.keys(r)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      fail('invalid_payload', `Bilinmeyen alan: ${key}`);
    }
  }

  if (r.schema_version !== NORMALIZED_EVENT_SCHEMA_VERSION) {
    fail(
      'unsupported_schema_version',
      `Desteklenmeyen schema_version: ${String(r.schema_version)}`,
    );
  }

  const provider = requireNonEmptyString(r.provider, 'provider', 50);
  const providerEventId = requireNonEmptyString(
    r.provider_event_id,
    'provider_event_id',
  );
  const providerReservationId = requireNonEmptyString(
    r.provider_reservation_id,
    'provider_reservation_id',
  );
  const propertyId = requireNonEmptyString(r.property_id, 'property_id');

  if (
    !RESERVATION_STATUSES.includes(r.reservation_status as ReservationStatus)
  ) {
    fail(
      'invalid_payload',
      `reservation_status şunlardan biri olmalı: ${RESERVATION_STATUSES.join(', ')}`,
    );
  }
  const reservationStatus = r.reservation_status as ReservationStatus;

  if (typeof r.occurred_at !== 'string') {
    fail('invalid_payload', 'occurred_at zorunlu bir ISO 8601 metin olmalı.');
  }
  const occurredAtMs = Date.parse(r.occurred_at);
  if (Number.isNaN(occurredAtMs)) {
    fail(
      'invalid_payload',
      `occurred_at geçerli bir timestamp değil: ${r.occurred_at}`,
    );
  }

  if (
    !r.greengold ||
    typeof r.greengold !== 'object' ||
    Array.isArray(r.greengold)
  ) {
    fail('invalid_payload', 'greengold zorunlu bir nesne olmalı.');
  }
  const gg = r.greengold as Record<string, unknown>;
  for (const key of Object.keys(gg)) {
    if (!GREENGOLD_FIELDS.has(key)) {
      fail('invalid_payload', `Bilinmeyen greengold alanı: ${key}`);
    }
  }

  if (typeof gg.selected !== 'boolean') {
    fail('invalid_payload', 'greengold.selected boolean olmalı.');
  }
  const selected = gg.selected;

  if (
    typeof gg.amount_minor !== 'number' ||
    !Number.isInteger(gg.amount_minor) ||
    gg.amount_minor < 0 ||
    gg.amount_minor > MAX_AMOUNT_MINOR
  ) {
    fail(
      'invalid_payload',
      `greengold.amount_minor 0..${MAX_AMOUNT_MINOR} arası tam sayı olmalı.`,
    );
  }
  const amountMinor = gg.amount_minor;

  // Seçilmediyse tutar KESİNLİKLE 0 olmalı (DB CHECK'i ile aynı kural, ikinci
  // savunma katmanı burada da uygulanır).
  if (!selected && amountMinor !== 0) {
    fail(
      'invalid_payload',
      'selected=false iken greengold.amount_minor 0 olmalı.',
    );
  }

  if (typeof gg.currency !== 'string' || !CURRENCY_RE.test(gg.currency)) {
    fail(
      'invalid_payload',
      'greengold.currency tam 3 büyük harf ISO 4217 kodu olmalı (ör. EUR).',
    );
  }
  const currency = gg.currency;

  let lineItemReference: string | undefined;
  if (gg.line_item_reference !== undefined) {
    lineItemReference = requireNonEmptyString(
      gg.line_item_reference,
      'greengold.line_item_reference',
    );
  }

  if (!PAYMENT_STATUSES.includes(gg.payment_status as PaymentStatus)) {
    fail(
      'invalid_payload',
      `greengold.payment_status şunlardan biri olmalı: ${PAYMENT_STATUSES.join(', ')}`,
    );
  }
  const paymentStatus = gg.payment_status as PaymentStatus;

  return {
    schema_version: NORMALIZED_EVENT_SCHEMA_VERSION,
    provider,
    provider_event_id: providerEventId,
    provider_reservation_id: providerReservationId,
    property_id: propertyId,
    reservation_status: reservationStatus,
    greengold: {
      selected,
      amount_minor: amountMinor,
      currency,
      ...(lineItemReference ? { line_item_reference: lineItemReference } : {}),
      payment_status: paymentStatus,
    },
    occurred_at: new Date(occurredAtMs).toISOString(),
  };
}
