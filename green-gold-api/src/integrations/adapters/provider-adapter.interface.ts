import type { NormalizedReservationEvent } from '../normalized-event';

/**
 * Sağlayıcıya özgü davranışın YAŞADIĞI TEK SINIR. Çekirdek (webhook-ingestion,
 * state-machine, normalized-event) bu arayüzün ARKASINDA kalır — hiçbir
 * controller/service içinde `if (provider === 'synxis')` YAZILMAZ.
 */
export interface WebhookVerificationInput {
  /** İmza doğrulaması İÇİN HAM (parse edilmemiş) body bytes — asla parse edilmiş JSON değil. */
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  /** hotel_integrations.secret_ref üzerinden çözülmüş gerçek paylaşılan secret. */
  secret: string;
}

export interface ProviderAdapter {
  readonly provider: string;
  /** false ise (ör. SynXis) bu adapter henüz kullanılamaz — dokümana/sandbox'a bağlıdır. */
  readonly configured: boolean;

  /** Ham body + header + secret ile sağlayıcının imza şemasını doğrular. */
  verifySignature(input: WebhookVerificationInput): boolean;

  /**
   * İmzası ZATEN doğrulanmış ham body'yi normalized event'e çevirir.
   * Geçersiz payload'da NormalizedEventValidationError fırlatır.
   */
  parseEvent(rawBody: Buffer): NormalizedReservationEvent;
}
