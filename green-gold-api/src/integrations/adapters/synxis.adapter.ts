import type { NormalizedReservationEvent } from '../normalized-event';
import type {
  ProviderAdapter,
  WebhookVerificationInput,
} from './provider-adapter.interface';

/**
 * SynXis dokümanı, sandbox ortamı ve credential'ı HENÜZ YOK. Bu adapter
 * BİLİNÇLİ OLARAK boş bırakılmıştır — gerçek endpoint/alan adı/imza şeması
 * UYDURULMAZ (görev talimatı). `configured = false` olduğu için
 * webhook-ingestion.service bu adapter'ı seçtiğinde imza doğrulamaya/parse'a
 * HİÇ geçmez, doğrudan 503 'provider_not_configured' döner.
 *
 * verifySignature/parseEvent yine de tanımlıdır (arayüzü sağlamak için) ama
 * çağrılırsa (savunma amaçlı — normalde asla çağrılmamalı) açıkça fırlatır.
 */
export class SynxisNotConfiguredAdapter implements ProviderAdapter {
  readonly provider = 'synxis';
  readonly configured = false;

  verifySignature(_input: WebhookVerificationInput): boolean {
    throw new SynxisNotConfiguredError();
  }

  parseEvent(_rawBody: Buffer): NormalizedReservationEvent {
    throw new SynxisNotConfiguredError();
  }
}

export class SynxisNotConfiguredError extends Error {
  readonly code = 'provider_not_configured';
  constructor() {
    super(
      'SynXis adapter henüz yapılandırılmadı — dokümantasyon/sandbox/credential bekleniyor.',
    );
    this.name = 'SynxisNotConfiguredError';
  }
}
