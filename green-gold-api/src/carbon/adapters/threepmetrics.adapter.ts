import {
  CarbonProviderNotConfiguredError,
  CarbonProviderRequestError,
  type Airport,
  type CarbonProviderAdapter,
  type EmissionReplyInput,
  type EmissionReplyResult,
  type EmissionResource,
  type EmissionResourceOptionGroup,
  type ReplyDocument,
  type CarbonSummary,
  type CarbonSummaryLine,
  type CarbonSummaryScopeTotal,
  type MeasurementPeriod,
  type ProviderAccount,
  type ProviderCredentials,
  type ProviderUnit,
} from '../carbon-provider.interface';

/**
 * 3pmetrics Integration API adapter'ı.
 *
 * Kaynak dokümanlar (connect.3pmetrics.io/docs):
 *   - carbonsummary/carbon-summary-api-guide.md (v1.0, 18 Mart 2026)
 *   - cca-api-documentation.md, cca-api-technical-addendum-en.md (22 Ocak 2026)
 *
 * Bilinçli sınırlar:
 *   - Okuma: customers, customer-units, emission-resources, lookups/airports,
 *     carbon-summary/by-ghg. Yazma: `POST /cca/replies` ve
 *     `POST /cca/replies/{replyId}/documents` — otel verisini GreenGold
 *     panelinden girer, 3pmetrics hesaplar.
 *   - Yazma GERİ ALINAMAZ: API'de silme yok (3pmetrics teyidi); kayıt yalnızca
 *     3pmetrics arayüzünden silinebilir. Bu yüzden yazma çağrıları ASLA
 *     otomatik tekrar edilmez; zaman aşımı `outcome_unknown` olarak döner.
 *   - Alan adları bu dosyanın DIŞINA sızmaz; yanıt kontrat tiplerine map edilir.
 *   - Sağlayıcı yanıtı güvenilmez girdidir: şema/birim beklenenden farklıysa
 *     sayı TAHMİN EDİLMEZ, `invalid_response` fırlatılır (yanlış fiyat üretmek
 *     yerine açık hata).
 */

export const THREEPMETRICS_BASE_URLS = {
  sandbox: 'https://connect-test.3pmetrics.io',
  production: 'https://connect.3pmetrics.io',
} as const;

/** Dokümana göre `unit` her zaman bu değerdir. */
export const THREEPMETRICS_UNIT = 'tonCO2e';

const DEFAULT_TIMEOUT_MS = 15_000;

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | FormData;
    signal?: AbortSignal;
  },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** Dokümandaki belge kısıtları (POST /cca/replies/{replyId}/documents). */
export const REPLY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const REPLY_DOCUMENT_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'doc',
  'docx',
  'xls',
  'xlsx',
] as const;

export interface ThreePMetricsAdapterOptions {
  /** Boşsa adapter `configured = false` olur ve hiçbir çağrı yapmaz. */
  baseUrl: string | undefined;
  /** Yanıt dili — emisyon kaynağı başlıkları bu dilde gelir. */
  language?: 'tr' | 'en';
  timeoutMs?: number;
  /** Testler için enjekte edilebilir; varsayılan global fetch. */
  fetchImpl?: FetchLike;
}

export class ThreePMetricsAdapter implements CarbonProviderAdapter {
  readonly provider = 'threepmetrics';
  readonly configured: boolean;

  private readonly baseUrl: string;
  private readonly language: 'tr' | 'en';
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ThreePMetricsAdapterOptions) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.configured = /^https:\/\//.test(this.baseUrl);
    this.language = options.language ?? 'tr';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async listAccounts(
    credentials: ProviderCredentials,
  ): Promise<ProviderAccount[]> {
    const body = await this.get('/cca/customers', credentials);
    if (!Array.isArray(body)) throw invalid('Müşteri listesi dizi değil.');
    return body.map((item) => {
      const row = asRecord(item);
      return {
        externalAccountId: requireString(row, 'slug'),
        name: requireString(row, 'name'),
      };
    });
  }

  async listUnits(
    credentials: ProviderCredentials,
    externalAccountId: string,
  ): Promise<ProviderUnit[]> {
    const body = await this.get(
      `/cca/customers/${encodeURIComponent(externalAccountId)}/customer-units`,
      credentials,
    );
    if (!Array.isArray(body)) throw invalid('Birim listesi dizi değil.');
    return body.map((item) => {
      const row = asRecord(item);
      return {
        externalUnitId: requireString(row, 'slug'),
        name: requireString(row, 'name'),
        type: optionalString(row, 'type') ?? '',
      };
    });
  }

  /**
   * GHG Protokolü gruplaması kullanılır. `by-iso` aynı emisyon kaynaklarının
   * ISO 14064 gruplamasıdır — ikisi TOPLANMAZ (çift sayım).
   */
  async getCarbonSummary(
    credentials: ProviderCredentials,
    period: MeasurementPeriod,
  ): Promise<CarbonSummary> {
    const query = new URLSearchParams({
      language: this.language,
      dateFrom: period.start,
      dateTo: period.end,
    });
    const body = await this.get(
      `/cca/carbon-summary/by-ghg?${query.toString()}`,
      credentials,
    );
    return parseGhgSummary(body, period);
  }

  async listEmissionResources(
    credentials: ProviderCredentials,
    externalAccountId: string,
    externalUnitId: string,
  ): Promise<EmissionResource[]> {
    const body = await this.get(
      `/cca/customers/${encodeURIComponent(externalAccountId)}/customer-units/${encodeURIComponent(externalUnitId)}/emission-resources`,
      credentials,
    );
    if (!Array.isArray(body)) {
      throw invalid('Emisyon kaynağı listesi dizi değil.');
    }
    return body.map(parseEmissionResource);
  }

  async lookupAirports(
    credentials: ProviderCredentials,
    query: string,
    limit: number,
  ): Promise<Airport[]> {
    const params = new URLSearchParams({ query, limit: String(limit) });
    const body = await this.get(
      `/cca/lookups/airports?${params.toString()}`,
      credentials,
    );
    if (!Array.isArray(body)) throw invalid('Havalimanı listesi dizi değil.');
    return body.map((item) => {
      const row = asRecord(item);
      const iata = requireString(row, 'iata');
      return {
        iata,
        name: optionalString(row, 'name') ?? iata,
        city: optionalString(row, 'city') ?? null,
        country: optionalString(row, 'country') ?? null,
      };
    });
  }

  async createReply(
    credentials: ProviderCredentials,
    input: EmissionReplyInput,
  ): Promise<EmissionReplyResult> {
    const payload: Record<string, unknown> = {
      customerSlug: input.customerSlug,
      customerUnitSlug: input.customerUnitSlug,
      emissionResourceSlug: input.emissionResourceSlug,
      date: input.date,
      systemOptionValue: input.systemOptionValue ?? null,
      userOptionValue: input.userOptionValue ?? null,
    };
    // Uçuş kaynaklarında `value` GÖNDERİLMEZ (dokümana göre).
    if (input.flight) payload.flight = input.flight;
    else payload.value = input.value;
    if (input.memberId) payload.memberId = input.memberId;

    const body = await this.request(
      'POST',
      '/cca/replies',
      credentials,
      JSON.stringify(payload),
      'application/json',
    );
    const row = asRecord(body);
    const replyId = row.replyId;
    if (typeof replyId !== 'number' || !Number.isInteger(replyId)) {
      throw invalid('`replyId` yok.');
    }
    return { replyId, message: optionalString(row, 'message') ?? '' };
  }

  async uploadReplyDocument(
    credentials: ProviderCredentials,
    replyId: number,
    document: ReplyDocument,
  ): Promise<{ fileName: string }> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(document.data)], { type: document.contentType }),
      document.fileName,
    );
    const body = await this.request(
      'POST',
      `/cca/replies/${replyId}/documents`,
      credentials,
      form,
    );
    const row = asRecord(body);
    return { fileName: optionalString(row, 'fileName') ?? document.fileName };
  }

  private get(path: string, credentials: ProviderCredentials) {
    return this.request('GET', path, credentials);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    credentials: ProviderCredentials,
    body?: string | FormData,
    contentType?: string,
  ): Promise<unknown> {
    if (!this.configured) {
      throw new CarbonProviderNotConfiguredError(this.provider);
    }
    if (!credentials?.apiKey) {
      throw new CarbonProviderRequestError(
        'unauthorized',
        'API anahtarı çözülemedi.',
      );
    }

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          // Dokümana göre iki kimlik yönteminden YALNIZCA biri gönderilir.
          'X-Integration-Api-Key': credentials.apiKey,
          Accept: 'application/json',
          'Accept-Language': this.language,
          // multipart sınırını (boundary) fetch kendisi koyar.
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (failure) {
      const name = failure instanceof Error ? failure.name : 'bilinmeyen hata';
      // Yazma isteği yola çıktıysa sonucu bilinmez: kayıt oluşmuş olabilir.
      if (method === 'POST') {
        throw new CarbonProviderRequestError(
          'outcome_unknown',
          `3pmetrics yanıtı alınamadı (${name}); kayıt oluşmuş olabilir.`,
        );
      }
      throw new CarbonProviderRequestError(
        'unavailable',
        `3pmetrics'e ulaşılamadı: ${name}`,
      );
    }

    if (!response.ok) throw classifyStatus(response.status);

    try {
      return await response.json();
    } catch {
      throw invalid('Yanıt JSON değil.');
    }
  }
}

function classifyStatus(status: number): CarbonProviderRequestError {
  if (status === 401) {
    return new CarbonProviderRequestError(
      'unauthorized',
      'API anahtarı eksik veya geçersiz.',
      status,
    );
  }
  if (status === 403) {
    return new CarbonProviderRequestError(
      'forbidden',
      'Bu müşteri/birim için yetki yok.',
      status,
    );
  }
  if (status === 404) {
    return new CarbonProviderRequestError(
      'no_data',
      'İlgili hesap için veri bulunamadı.',
      status,
    );
  }
  if (status === 413) {
    return new CarbonProviderRequestError(
      'too_large',
      'Belge 10 MB sınırını aşıyor.',
      status,
    );
  }
  if (status === 415) {
    return new CarbonProviderRequestError(
      'unsupported_media',
      'Belge biçimi desteklenmiyor.',
      status,
    );
  }
  if (status === 400 || status === 422) {
    return new CarbonProviderRequestError(
      'invalid_request',
      'Sağlayıcı isteği doğrulamadı.',
      status,
    );
  }
  return new CarbonProviderRequestError(
    'unavailable',
    `Sağlayıcı ${status} döndü.`,
    status,
  );
}

/**
 * `GET /cca/carbon-summary/by-ghg` yanıtını kontrata çevirir.
 *
 *   { scopes: [{ scopeTitle, scopeLabel,
 *       categories: [{ categoryTitle, categoryLabel,
 *         emissionSources: [{ title, totalCarbonValue, unit }] }] }] }
 *
 * Toplam alanı yanıtta YOKTUR; satırlar toplanır. Her satırın birimi
 * 'tonCO2e' olmalıdır — farklı bir birim görülürse özet REDDEDİLİR.
 */
export function parseGhgSummary(
  body: unknown,
  period: MeasurementPeriod,
): CarbonSummary {
  const root = asRecord(body);
  if (!Array.isArray(root.scopes)) throw invalid('`scopes` dizisi yok.');

  const lines: CarbonSummaryLine[] = [];
  const scopes: CarbonSummaryScopeTotal[] = [];

  for (const rawScope of root.scopes) {
    const scope = asRecord(rawScope);
    const scopeLabel = requireString(scope, 'scopeLabel');
    const scopeTitle = optionalString(scope, 'scopeTitle') ?? scopeLabel;
    const categories = scope.categories ?? [];
    if (!Array.isArray(categories)) throw invalid('`categories` dizi değil.');

    let scopeTotal = 0;
    for (const rawCategory of categories) {
      const category = asRecord(rawCategory);
      const categoryLabel = requireString(category, 'categoryLabel');
      const categoryTitle =
        optionalString(category, 'categoryTitle') ?? categoryLabel;
      const sources = category.emissionSources ?? [];
      if (!Array.isArray(sources)) {
        throw invalid('`emissionSources` dizi değil.');
      }

      for (const rawSource of sources) {
        const source = asRecord(rawSource);
        const value = source.totalCarbonValue;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw invalid('`totalCarbonValue` sayı değil.');
        }
        if (value < 0) throw invalid('Negatif emisyon değeri.');
        const unit = requireString(source, 'unit');
        if (unit !== THREEPMETRICS_UNIT) {
          throw invalid(`Beklenmeyen birim: ${unit}`);
        }
        lines.push({
          scopeLabel,
          scopeTitle,
          categoryLabel,
          categoryTitle,
          source: optionalString(source, 'title') ?? '',
          value,
          unit,
        });
        scopeTotal += value;
      }
    }
    scopes.push({ scopeLabel, scopeTitle, total: scopeTotal });
  }

  return {
    period,
    basis: 'ghg',
    totalEmissions: lines.reduce((sum, line) => sum + line.value, 0),
    totalEmissionsUnit: THREEPMETRICS_UNIT,
    scopes,
    lines,
  };
}

/**
 * Emisyon kaynağı tanımını kontrata çevirir. Doküman iki farklı şekil
 * gösteriyor; ikisi de kabul edilir:
 *   - Referans: `systemOptions: { description, options: [{ name, value }] }`
 *   - İş akışı örneği: `systemOptions: [{ id, value, label }]` — burada
 *     sağlayıcıya geri gönderilen değer `id`'dir (örnekte id 1 -> "1").
 */
export function parseEmissionResource(item: unknown): EmissionResource {
  const row = asRecord(item);
  const scope =
    row.ghgScope && typeof row.ghgScope === 'object'
      ? asRecord(row.ghgScope)
      : null;
  const requiredFields = Array.isArray(row.requiredFields)
    ? row.requiredFields.filter((f): f is string => typeof f === 'string')
    : [];
  const slug = requireString(row, 'slug');
  return {
    slug,
    title: optionalString(row, 'title') ?? slug,
    header: optionalString(row, 'header') ?? null,
    description: optionalString(row, 'description') ?? null,
    ghgScope: scope
      ? {
          id: typeof scope.id === 'number' ? scope.id : null,
          name: optionalString(scope, 'name') ?? '',
        }
      : null,
    systemOptions: parseOptionGroup(row.systemOptions),
    userOptions: parseOptionGroup(row.userOptions),
    inputMode: optionalString(row, 'inputMode') ?? null,
    requiredFields,
  };
}

function parseOptionGroup(raw: unknown): EmissionResourceOptionGroup | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return {
      description: '',
      options: raw.map((item) => {
        const option = asRecord(item);
        const id = option.id;
        const value =
          typeof id === 'number' || typeof id === 'string'
            ? String(id)
            : requireString(option, 'value');
        return {
          name:
            optionalString(option, 'label') ??
            optionalString(option, 'name') ??
            value,
          value,
        };
      }),
    };
  }
  const group = asRecord(raw);
  const options = Array.isArray(group.options) ? group.options : [];
  if (options.length === 0) return null;
  return {
    description: optionalString(group, 'description') ?? '',
    options: options.map((item) => {
      const option = asRecord(item);
      const rawValue = option.value;
      const value =
        typeof rawValue === 'number'
          ? String(rawValue)
          : requireString(option, 'value');
      return { name: optionalString(option, 'name') ?? value, value };
    }),
  };
}

function invalid(detail: string): CarbonProviderRequestError {
  return new CarbonProviderRequestError(
    'invalid_response',
    `3pmetrics yanıtı beklenen şemada değil: ${detail}`,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('nesne bekleniyordu.');
  }
  return value as Record<string, unknown>;
}

function requireString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw invalid(`\`${key}\` alanı yok.`);
  }
  return value;
}

function optionalString(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
