import {
  CarbonProviderNotConfiguredError,
  CarbonProviderRequestError,
  type CarbonProviderAdapter,
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
 *   - Yalnızca OKUMA uçları kullanılır (customers, customer-units,
 *     carbon-summary/by-ghg). Veri yazma (`POST /cca/replies`) bu adapter'da
 *     YOK — otel verisini 3pmetrics'te kendi hesabıyla girer.
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
    signal?: AbortSignal;
  },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

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

  private async get(
    path: string,
    credentials: ProviderCredentials,
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
        method: 'GET',
        headers: {
          // Dokümana göre iki kimlik yönteminden YALNIZCA biri gönderilir.
          'X-Integration-Api-Key': credentials.apiKey,
          Accept: 'application/json',
          'Accept-Language': this.language,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (failure) {
      throw new CarbonProviderRequestError(
        'unavailable',
        `3pmetrics'e ulaşılamadı: ${failure instanceof Error ? failure.name : 'bilinmeyen hata'}`,
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
