import type {
  NormalizedEventValidationError,
  NormalizedReservationEvent,
} from '../normalized-event';

/**
 * Sağlayıcıya özgü davranışın YAŞADIĞI TEK SINIR. Çekirdek (webhook-ingestion,
 * state-machine, normalized-event) bu arayüzün ARKASINDA kalır — hiçbir
 * controller/service içinde `if (provider === 'synxis')` YAZILMAZ.
 */
export type WebhookQuery = Record<string, string | undefined>;

export interface WebhookVerificationInput {
  /** İmza doğrulaması İÇİN HAM (parse edilmemiş) body bytes — asla parse edilmiş JSON değil. */
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  /**
   * URL query parametreleri. İmza yerine URL'de paylaşılan anahtar taşıyan
   * sağlayıcılar (ör. HotelRunner `?token=&hr_id=`) bunu kullanır.
   */
  query: WebhookQuery;
  /** hotel_integrations.secret_ref üzerinden çözülmüş gerçek paylaşılan secret. */
  secret: string;
}

/** Parse için entegrasyon bağlamı — doğrulama SONRASI güvenilir değerler. */
export interface WebhookParseInput {
  rawBody: Buffer;
  query: WebhookQuery;
  /** hotel_integrations.product_code — booking engine'deki Green Gold ekstrasının kodu. */
  productCode: string;
}

/**
 * Tek bir bildirimin içindeki bir event'in sonucu. Bazı sağlayıcılar
 * (HotelRunner) tek istekte birden fazla rezervasyon gönderir; biri bozuksa
 * diğerleri yine işlenmelidir.
 */
export type ParsedEvent =
  | { ok: true; event: NormalizedReservationEvent }
  | {
      ok: false;
      error: NormalizedEventValidationError;
      /** Hata event kimliği çözüldükten sonra oluştuysa (audit için). */
      providerEventId?: string;
    };

export interface ProviderAdapter {
  readonly provider: string;
  /** false ise (ör. SynXis) bu adapter henüz kullanılamaz — dokümana/sandbox'a bağlıdır. */
  readonly configured: boolean;

  /** Ham body + header + query + secret ile sağlayıcının doğrulama şemasını uygular. */
  verifySignature(input: WebhookVerificationInput): boolean;

  /**
   * Doğrulaması ZATEN yapılmış bildirimi normalized event'lere çevirir.
   * Zarfın kendisi bozuksa (body okunamıyor) NormalizedEventValidationError
   * fırlatır; tek tek event hataları ise `ok: false` sonucu olarak döner.
   */
  parseEvents(input: WebhookParseInput): ParsedEvent[];
}
