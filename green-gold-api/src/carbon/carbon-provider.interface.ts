/**
 * Harici karbon ÖLÇÜM sağlayıcısı sınırı — GreenGold Stay'in 3pmetrics (veya
 * benzeri bir sağlayıcı) için ihtiyaç duyduğu TEK kontrat.
 *
 * Bu dosya aynı zamanda sağlayıcıdan istenen API yüzeyinin yazılı hâlidir:
 * her metot, yönergedeki bir maddeye birebir karşılık gelir. Gerçek endpoint
 * adları, alan adları, imza şeması ve kimlik doğrulama yöntemi BİLİNÇLİ OLARAK
 * burada YOK — çünkü 3pmetrics'in resmi dokümanı henüz elimizde değil ve
 * uydurulmuş bir şema "bağlıymış gibi" görünen ama çalışmayan kod üretir.
 *
 * Çekirdek (carbon-measurement.service) bu arayüzün ARKASINDA kalır; hiçbir
 * controller/service içinde `if (provider === 'threepmetrics')` YAZILMAZ —
 * `src/integrations/adapters/provider-adapter.interface.ts` ile aynı desen.
 */

/** Sağlayıcıdan istenen ölçüm dönemi (ISO tarih, YYYY-MM-DD). */
export interface MeasurementPeriod {
  start: string;
  end: string;
}

/**
 * Faz 1 / madde 1 — "Ölçüm oturumu oluşturma".
 * Kendi tesis kimliğimiz (hotelRef), kendi ölçüm kimliğimiz (measurementRef),
 * dönem ve dönüş adresi iletilir; otele özel, SÜRELİ ve tekrar giriş
 * gerektirmeyen bir form bağlantısı beklenir.
 */
export interface CreateMeasurementSessionRequest {
  /** GreenGold hotel_id (bizim tesis kimliğimiz). */
  hotelRef: string;
  /** GreenGold ölçüm kimliği — webhook/API yanıtında geri gelmesi beklenir. */
  measurementRef: string;
  period: MeasurementPeriod;
  /** Otelin form sonrası döneceği GreenGold adresi. */
  returnUrl: string;
  /** Panelde görünen otel adı (sağlayıcı formunda gösterim için). */
  hotelName?: string;
  /** Faz 2'de bağlanmış tesis varsa sağlayıcının kendi tesis kimliği. */
  externalPropertyId?: string;
}

export interface CreateMeasurementSessionResult {
  /** Sağlayıcının oturum kimliği. */
  externalSessionId: string;
  /** Otelin yönlendirileceği form adresi. */
  formUrl: string;
  /** Bağlantının geçerlilik sonu (ISO). Süresiz bağlantı KABUL EDİLMEZ. */
  expiresAt: string;
}

/**
 * Faz 1 / madde 2 — "Form verilerini alma".
 * Yönerge: "Yalnızca hesaplama sonucu yeterli değil; oda sayısı, doluluk, dolu
 * oda-gece/misafir-gece ve tüketim verilerine de ihtiyacımız var."
 *
 * `fields` ham alan listesidir: her alan için tanım, birim ve dönem beklenir.
 * Adı bilinen alanlar ayrıca tiplenmiş olarak istenir — dağıtım hesabı (oda-gece
 * katsayısı) bunlara dayanır ve `form_data` içinde arama yapmak kırılgan olurdu.
 */
export interface MeasurementFormField {
  key: string;
  label?: string;
  value: number | string | boolean | null;
  unit?: string;
  period?: MeasurementPeriod;
  category?: string;
}

export interface MeasurementFormData {
  period: MeasurementPeriod;
  rooms?: number;
  occupiedRoomNights?: number;
  guestNights?: number;
  occupancyPercent?: number;
  fields: MeasurementFormField[];
}

/**
 * Faz 1 / madde 3 — "Hesaplama sonucunu alma".
 * Birim ÇEVRİLMEZ: sağlayıcının verdiği birim aynen taşınır; kg/ton dönüşümü
 * `room-night-allocation.ts` içinde açık ve tek bir yerde yapılır.
 */
export interface MeasurementResult {
  externalMeasurementId: string;
  /** Revizyon takibi için sürüm. Sağlayıcı sürüm vermiyorsa '1' kullanılır. */
  externalVersion: string;
  externalPropertyId: string;
  period: MeasurementPeriod;
  status: 'draft' | 'submitted' | 'calculating' | 'completed' | 'failed';
  totalEmissions?: number;
  /** Ör. 'tCO2e' veya 'kgCO2e'. Bilinmeyen birim hesaba SOKULMAZ. */
  totalEmissionsUnit?: string;
  /** Emisyonun kapsamı (ör. otel toplamı / konaklamaya ayrılmış). */
  scope?: string;
  methodology?: string;
  methodologyVersion?: string;
  verificationStatus?: string;
  reportUrl?: string;
  providerUpdatedAt?: string;
}

/** Faz 2 / madde 3 — "Yetkili olduğu tesisler API üzerinden listelenir." */
export interface ProviderProperty {
  externalPropertyId: string;
  name?: string;
  city?: string;
  country?: string;
  externalAccountId?: string;
}

/** Faz 2 / madde 6 — "Güncellenen kayıtları sorgulama" (periyodik kontrol). */
export interface ListMeasurementsQuery {
  externalPropertyId: string;
  /** Yalnızca bu andan sonra güncellenmiş kayıtlar (ISO). */
  updatedSince?: string;
}

/**
 * Webhook doğrulama girdisi — `WebhookVerificationInput` ile aynı kural:
 * imza HAM body bytes üzerinde doğrulanır, parse edilmiş JSON üzerinde ASLA.
 */
export interface CarbonWebhookVerificationInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  secret: string;
}

/** Faz 1 / madde 4 — "Durum bildirimleri" (webhook). */
export interface CarbonWebhookEvent {
  providerEventId: string;
  eventType: 'form_submitted' | 'measurement_completed' | 'measurement_updated';
  /** Bizim ölçüm kimliğimiz — oturumu/oteli çözmenin TEK güvenilir yolu. */
  measurementRef?: string;
  externalMeasurementId: string;
  externalVersion: string;
  externalPropertyId: string;
  occurredAt: string;
}

export interface CarbonProviderAdapter {
  readonly provider: string;
  /**
   * false ise sağlayıcı sözleşmesi (API dokümanı / auth yöntemi / sandbox)
   * henüz yok — çekirdek hiçbir çağrı denemez, doğrudan
   * 503 'carbon_provider_not_configured' döner.
   */
  readonly configured: boolean;

  createSession(
    request: CreateMeasurementSessionRequest,
  ): Promise<CreateMeasurementSessionResult>;

  getFormData(externalMeasurementId: string): Promise<MeasurementFormData>;

  getResult(externalMeasurementId: string): Promise<MeasurementResult>;

  listProperties(authorizationRef: string): Promise<ProviderProperty[]>;

  listMeasurements(query: ListMeasurementsQuery): Promise<MeasurementResult[]>;

  verifyWebhookSignature(input: CarbonWebhookVerificationInput): boolean;

  parseWebhookEvent(rawBody: Buffer): CarbonWebhookEvent;
}

/**
 * Sağlayıcı sözleşmesi gelmeden herhangi bir metot çağrılırsa fırlatılır.
 * `code` HTTP katmanında 503 + 'carbon_provider_not_configured' olur.
 */
export class CarbonProviderNotConfiguredError extends Error {
  readonly code = 'carbon_provider_not_configured';
  constructor(provider: string) {
    super(
      `${provider} karbon ölçüm sağlayıcısı henüz yapılandırılmadı — API dokümanı, kimlik doğrulama yöntemi ve test erişimi bekleniyor.`,
    );
    this.name = 'CarbonProviderNotConfiguredError';
  }
}
