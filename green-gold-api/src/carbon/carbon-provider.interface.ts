/**
 * Harici karbon ÖLÇÜM sağlayıcısı sınırı — GreenGold Stay'in 3pmetrics (veya
 * benzeri bir sağlayıcı) için ihtiyaç duyduğu TEK kontrat.
 *
 * Bu kontrat 3pmetrics'in RESMİ dokümanına göre şekillendirildi:
 *   - Carbon Summary API (v1.0, 18 Mart 2026):
 *     GET /cca/carbon-summary/by-ghg | by-iso  (language, dateFrom, dateTo)
 *   - CCA API + Technical Addendum (v1.0, 22 Ocak 2026):
 *     GET /cca/customers, GET /cca/customers/{slug}/customer-units
 *   - Kimlik: `X-Integration-Api-Key` (müşteri kapsamlı, ortama özgü).
 *
 * Sağlayıcı modeli "ölçüm oturumu + form + webhook" DEĞİLDİR (dokümanda yok,
 * teknik ek "No push/webhook support" diyor). Otel verisini 3pmetrics'te kendi
 * hesabıyla girer; biz bir dönem için emisyon ÖZETİNİ çekeriz (pull).
 *
 * Çekirdek (carbon-measurement.service) bu arayüzün ARKASINDA kalır; hiçbir
 * controller/service içinde `if (provider === 'threepmetrics')` YAZILMAZ —
 * `src/integrations/adapters/provider-adapter.interface.ts` ile aynı desen.
 */

/** Sağlayıcıdan istenen ölçüm dönemi (ISO tarih, YYYY-MM-DD, iki uç dahil). */
export interface MeasurementPeriod {
  start: string;
  end: string;
}

/**
 * Bir çağrının kimlik bilgisi. Değer yalnızca SUNUCUDA çözülür
 * (bkz. carbon-credentials.ts); panele, loga veya DB'ye ASLA gitmez.
 */
export interface ProviderCredentials {
  apiKey: string;
}

/** Anahtarın bağlı olduğu sağlayıcı müşterisi (3pmetrics: customer). */
export interface ProviderAccount {
  /** 3pmetrics customer slug. */
  externalAccountId: string;
  name: string;
}

/** Müşteri içindeki birim/tesis (3pmetrics: customer unit). */
export interface ProviderUnit {
  externalUnitId: string;
  name: string;
  type: string;
}

/** Özetteki tek bir emisyon kaynağı satırı. */
export interface CarbonSummaryLine {
  /** Ör. 'scope-1' — sağlayıcının makine okunur etiketi, aynen taşınır. */
  scopeLabel: string;
  scopeTitle: string;
  categoryLabel: string;
  categoryTitle: string;
  source: string;
  value: number;
  /** Sağlayıcı birimi aynen ('tonCO2e'). */
  unit: string;
}

export interface CarbonSummaryScopeTotal {
  scopeLabel: string;
  scopeTitle: string;
  total: number;
}

/**
 * Bir dönemin emisyon özeti. Sağlayıcı toplam alanı VERMEZ — toplam,
 * adapter içinde satırlar toplanarak türetilir ve birimi tek tip olmalıdır.
 */
export interface CarbonSummary {
  period: MeasurementPeriod;
  /** Gruplama yöntemi: GHG Protokolü kapsamları. */
  basis: 'ghg';
  totalEmissions: number;
  /** Tüm satırların ORTAK birimi ('tonCO2e'); karışık birim kabul edilmez. */
  totalEmissionsUnit: string;
  scopes: CarbonSummaryScopeTotal[];
  lines: CarbonSummaryLine[];
}

/** Emisyon kaynağının seçenek grubu (3pmetrics: systemOptions / userOptions). */
export interface EmissionResourceOptionGroup {
  /** Grubun etiketi (ör. "Birim Seçimi", "Yakıt Türü", "Araç Plakası"). */
  description: string;
  /** `value` sağlayıcıya AYNEN geri gönderilir (systemOptionValue/userOptionValue). */
  options: { name: string; value: string }[];
}

/**
 * Bir birim (tesis) için veri girilebilecek emisyon kaynağı. Panelin otelden
 * HANGİ bilgiyi isteyeceğini bu tanım belirler; alanlar sağlayıcıdan gelir,
 * GreenGold uydurmaz.
 */
export interface EmissionResource {
  slug: string;
  title: string;
  header: string | null;
  description: string | null;
  ghgScope: { id: number | null; name: string } | null;
  systemOptions: EmissionResourceOptionGroup | null;
  userOptions: EmissionResourceOptionGroup | null;
  /** `flight-route-v1` ise miktar yerine uçuş rotası istenir. Diğerlerinde null. */
  inputMode: string | null;
  requiredFields: string[];
}

export const FLIGHT_INPUT_MODE = 'flight-route-v1';

export interface Airport {
  iata: string;
  name: string;
  city: string | null;
  country: string | null;
}

/** `POST /cca/replies` girdisi (sağlayıcı alan adlarıyla birebir değil, kontrat adıyla). */
export interface EmissionReplyInput {
  customerSlug: string;
  customerUnitSlug: string;
  emissionResourceSlug: string;
  /** YYYY-MM-DD */
  date: string;
  /** Uçuş dışı kaynaklarda zorunlu; sayısal metin. */
  value?: string;
  systemOptionValue?: string;
  userOptionValue?: string;
  flight?: {
    passengerOrFlightName: string;
    departureIata: string;
    arrivalIata: string;
  };
  /** Anahtarın üye kapsamı yoksa gereken üye kimliği (link'te tanımlıysa). */
  memberId?: string;
}

export interface EmissionReplyResult {
  replyId: number;
  message: string;
}

export interface ReplyDocument {
  fileName: string;
  contentType: string;
  data: Buffer;
}

export interface CarbonProviderAdapter {
  readonly provider: string;
  /**
   * false ise bu ortam için sağlayıcıya çağrı YAPILAMAZ (ör. base URL yok) —
   * çekirdek hiçbir çağrı denemez, doğrudan
   * 503 'carbon_provider_not_configured' döner.
   */
  readonly configured: boolean;

  /** Anahtarın erişebildiği müşteri(ler). API key ile tek müşteri beklenir. */
  listAccounts(credentials: ProviderCredentials): Promise<ProviderAccount[]>;

  listUnits(
    credentials: ProviderCredentials,
    externalAccountId: string,
  ): Promise<ProviderUnit[]>;

  getCarbonSummary(
    credentials: ProviderCredentials,
    period: MeasurementPeriod,
  ): Promise<CarbonSummary>;

  listEmissionResources(
    credentials: ProviderCredentials,
    externalAccountId: string,
    externalUnitId: string,
  ): Promise<EmissionResource[]>;

  lookupAirports(
    credentials: ProviderCredentials,
    query: string,
    limit: number,
  ): Promise<Airport[]>;

  /**
   * Emisyon verisini sağlayıcıya YAZAR. GERİ ALINAMAZ: sağlayıcı API'sinde
   * silme yoktur, kayıt yalnızca sağlayıcının kendi arayüzünden silinebilir.
   */
  createReply(
    credentials: ProviderCredentials,
    input: EmissionReplyInput,
  ): Promise<EmissionReplyResult>;

  uploadReplyDocument(
    credentials: ProviderCredentials,
    replyId: number,
    document: ReplyDocument,
  ): Promise<{ fileName: string }>;
}

/**
 * Sağlayıcı bu ortam için yapılandırılmamışsa fırlatılır.
 * `code` HTTP katmanında 503 + 'carbon_provider_not_configured' olur.
 */
export class CarbonProviderNotConfiguredError extends Error {
  readonly code = 'carbon_provider_not_configured';
  constructor(provider: string) {
    super(
      `${provider} karbon ölçüm sağlayıcısı bu ortam için yapılandırılmadı.`,
    );
    this.name = 'CarbonProviderNotConfiguredError';
  }
}

/**
 * Sağlayıcı çağrısının SINIFLANDIRILMIŞ hatası. Sağlayıcının ham mesajı
 * kullanıcıya geçirilmez; yalnızca `reason` üzerinden anlamlı bir mesaj üretilir.
 *
 *   unauthorized    401 — anahtar eksik/geçersiz/iptal edilmiş
 *   forbidden       403 — müşteri/birim yetkisi yok (ör. test IP'si whitelist'te değil)
 *   no_data         404 — "İlgili hesap için veri bulunamadı"
 *   invalid_request 400/422 — tarih/biçim doğrulama hatası
 *   invalid_response — yanıt beklenen şemada değil (ör. bilinmeyen birim)
 *   outcome_unknown yazma isteği gönderildi ama yanıt alınamadı (zaman aşımı) —
 *                   kayıt sağlayıcıda OLUŞMUŞ olabilir; otomatik tekrar YAPILMAZ
 *   too_large       413 — belge 10 MB üstü
 *   unsupported_media 415 — belge biçimi desteklenmiyor
 *   unavailable     5xx / ağ hatası / zaman aşımı
 */
export type CarbonProviderErrorReason =
  | 'outcome_unknown'
  | 'too_large'
  | 'unsupported_media'
  | 'unauthorized'
  | 'forbidden'
  | 'no_data'
  | 'invalid_request'
  | 'invalid_response'
  | 'unavailable';

export class CarbonProviderRequestError extends Error {
  constructor(
    readonly reason: CarbonProviderErrorReason,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CarbonProviderRequestError';
  }
}
