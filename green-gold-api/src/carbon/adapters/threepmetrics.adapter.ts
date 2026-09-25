import {
  CarbonProviderNotConfiguredError,
  type CarbonProviderAdapter,
  type CarbonWebhookEvent,
  type CarbonWebhookVerificationInput,
  type CreateMeasurementSessionRequest,
  type CreateMeasurementSessionResult,
  type ListMeasurementsQuery,
  type MeasurementFormData,
  type MeasurementResult,
  type ProviderProperty,
} from '../carbon-provider.interface';

/**
 * 3pmetrics API dokümanı, kimlik doğrulama yöntemi, webhook sözleşmesi, örnek
 * JSON'ları ve test erişimi HENÜZ YOK. Bu adapter — `SynxisNotConfiguredAdapter`
 * ile aynı desende — BİLİNÇLİ OLARAK boş bırakılmıştır.
 *
 * Gerçek endpoint adı / alan adı / imza şeması UYDURULMAZ: uydurulmuş bir şema
 * derlenir, testten geçer ve panelde "bağlı" görünür — ama ilk gerçek çağrıda
 * çöker. `configured = false` olduğu için çekirdek hiçbir çağrı denemez ve
 * kullanıcıya dürüst bir "sağlayıcı bekleniyor" durumu gösterilir.
 *
 * BU DOSYA NASIL TAMAMLANIR (sözleşme geldiğinde):
 *   1. `configured = true` yapılır.
 *   2. Her metot 3pmetrics'in gerçek endpoint'ine bağlanır; yanıt
 *      `carbon-provider.interface.ts` tiplerine MAP EDİLİR (alan adları bu
 *      dosyanın dışına sızmaz).
 *   3. `verifyWebhookSignature` sağlayıcının imza şemasını HAM body üzerinde
 *      doğrular; secret `secret-resolver.ts` üzerinden çözülür.
 *   4. Production için gerçek bir secrets manager gerekir — env resolver
 *      production'da MEŞRU DEĞİLDİR (bkz. secret-resolver.ts).
 */
export class ThreePMetricsNotConfiguredAdapter implements CarbonProviderAdapter {
  readonly provider = 'threepmetrics';
  readonly configured = false;

  createSession(
    _request: CreateMeasurementSessionRequest,
  ): Promise<CreateMeasurementSessionResult> {
    return Promise.reject(this.notConfigured());
  }

  getFormData(_externalMeasurementId: string): Promise<MeasurementFormData> {
    return Promise.reject(this.notConfigured());
  }

  getResult(_externalMeasurementId: string): Promise<MeasurementResult> {
    return Promise.reject(this.notConfigured());
  }

  listProperties(_authorizationRef: string): Promise<ProviderProperty[]> {
    return Promise.reject(this.notConfigured());
  }

  listMeasurements(
    _query: ListMeasurementsQuery,
  ): Promise<MeasurementResult[]> {
    return Promise.reject(this.notConfigured());
  }

  verifyWebhookSignature(_input: CarbonWebhookVerificationInput): boolean {
    throw this.notConfigured();
  }

  parseWebhookEvent(_rawBody: Buffer): CarbonWebhookEvent {
    throw this.notConfigured();
  }

  private notConfigured(): CarbonProviderNotConfiguredError {
    return new CarbonProviderNotConfiguredError(this.provider);
  }
}
