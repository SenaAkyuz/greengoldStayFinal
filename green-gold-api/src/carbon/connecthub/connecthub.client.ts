/**
 * 3pmetrics ConnectHub API (v1) istemcisi.
 *
 * Kaynak: ConnectHub OpenAPI 3.1.1 (`connecthub-api-v1.json`) + Geliştirici
 * belgeleri (gateway.3pmetrics.io/connecthub/api/docs).
 *
 *   POST /v1/records                 yazma anahtarı · en fazla 1.000 kayıt
 *   GET  /v1/records                 okuma · ONAYLI kayıtlar (item, unit, from, to, offset, limit)
 *   GET  /v1/items, /v1/units        ikisi
 *   GET  /v1/factor-packages?year=   okuma + "Faktörleri içer"
 *   GET  /v1/factor-packages/{id}    okuma + "Faktörleri içer", ETag / If-None-Match
 *
 * Kimlik: `X-Api-Key: ch_live_…` (anahtar yalnızca sunucuda çözülür).
 *
 * Kurallar (belgelerden):
 *   - Aynı external_id ikinci kez gelirse kayıt GÜNCELLENİR → yazma idempotenttir.
 *   - 201 hepsi yazıldı · 207 bazıları reddedildi · 422 hiçbiri yazılamadı ·
 *     409 kapalı dönem.
 *   - Şirkette onay açıksa kayıt `pending_approval` olur; GET /v1/records
 *     yalnızca ONAYLI kayıtları döndürür.
 *   - Dakikada 600 istek.
 *
 * Sağlayıcı yanıtı güvenilmez girdidir: şema beklenenden farklıysa sayı TAHMİN
 * EDİLMEZ, `invalid_response` fırlatılır.
 */

export const CONNECTHUB_DEFAULT_BASE_URL = 'https://connect.3pmetrics.io';
export const CONNECTHUB_MAX_RECORDS_PER_REQUEST = 1000;
const DEFAULT_TIMEOUT_MS = 20_000;
const READ_PAGE_SIZE = 500;
const MAX_READ_PAGES = 40;

export type ConnectHubErrorReason =
  | 'not_configured'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'period_closed'
  | 'invalid_request'
  | 'rate_limited'
  | 'invalid_response'
  | 'unavailable'
  | 'outcome_unknown';

export class ConnectHubError extends Error {
  constructor(
    readonly reason: ConnectHubErrorReason,
    message: string,
    readonly status?: number,
    /** 422/409 gövdesi WriteRecordsResponse ise satır sonuçları. */
    readonly writeResponse?: WriteRecordsResponse,
  ) {
    super(message);
    this.name = 'ConnectHubError';
  }
}

export interface ConnectHubUnit {
  id: string;
  code: string | null;
  name: string;
}

export interface ConnectHubItem {
  id: string;
  code: string | null;
  name: string;
  /** Dönem çözünürlüğü (ör. month). */
  resolution: string;
  /** Kabul edilen ölçü birimi kodları (ör. ["kWh", "MWh"]). */
  uoms: string[];
  /** Başlığın açık olduğu birimler. */
  units: string[];
}

export interface RecordInput {
  item: string;
  unit: string;
  period: string;
  quantity: number;
  uom: string;
  external_id: string;
  description?: string | null;
  note?: string | null;
}

export interface RecordResult {
  external_id: string | null;
  status: string;
  record_id: string | null;
  error: { code: string; message: string } | null;
  warnings: string[];
}

export interface WriteRecordsResponse {
  written: number;
  rejected: number;
  results: RecordResult[];
}

export interface ApprovedRecord {
  record_id: string;
  item: string;
  unit: string;
  period: string;
  quantity: number;
  uom: string | null;
  description: string | null;
  source: string;
  external_id: string | null;
}

export interface FactorPackageSummary {
  id: string;
  name: string;
  year: number;
  content_hash: string;
}

export interface FactorPackageUom {
  id: string;
  code: string | null;
  name: string;
}

export interface FactorPackageMapping {
  unit_ids: string[];
  year: number;
  option_value: string | null;
  uom_id: string | null;
  factor_id: string | null;
  error: { code: string; reason: string } | null;
  warnings: string[];
}

export interface FactorPackageItem {
  id: string;
  code: string | null;
  name: string;
  scope: number | null;
  uoms: FactorPackageUom[];
  mappings: FactorPackageMapping[];
}

export interface FactorPackageGases {
  basis: string;
  co2: number;
  ch4: number;
  n2o: number;
  other_co2e: number | null;
  ncv_tj_per_uom: number | null;
  ncv_source: string | null;
}

export interface FactorPackageFactor {
  id: string;
  kind: string;
  shared: boolean;
  name: string | null;
  kg_co2e_per_uom: number | null;
  uom_id: string | null;
  uom_code: string | null;
  uom_name: string | null;
  gwp_embedded: boolean;
  source_gwp_set: string | null;
  gases: FactorPackageGases | null;
  factor_kind: string | null;
  includes_transmission_losses: boolean | null;
  data_year: number | null;
  publication_year: number | null;
  country_code: string | null;
  biogenic_co2_kg_per_uom: number | null;
  company_declared: boolean;
  verification: {
    status: string;
    verified_on: string | null;
    source_url: string | null;
  } | null;
  source: {
    code: string | null;
    name: string;
    version: string | null;
    url: string | null;
    license: string | null;
    attribution: string | null;
  } | null;
}

export interface FactorPackage {
  release: {
    schema_version: string;
    release_id: string;
    generated_at: string;
    content_hash: string;
  };
  inventory: {
    id: string;
    name: string;
    year: number;
    period_start: string;
    period_end: string | null;
    gwp_set: string;
    gwp_ch4: number;
    gwp_n2o: number;
    dataset: string;
    combustion_dataset: string;
    default_country_code: string | null;
    scope2_method: string;
  };
  items: FactorPackageItem[];
  factors: FactorPackageFactor[];
  notices: { code: string; message: string }[];
}

type FetchResponse = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};
export type ConnectHubFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

export interface ConnectHubClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: ConnectHubFetch;
}

export class ConnectHubClient {
  readonly configured: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: ConnectHubFetch;

  constructor(options: ConnectHubClientOptions = {}) {
    this.baseUrl = (options.baseUrl || CONNECTHUB_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.configured = /^https:\/\//.test(this.baseUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async listUnits(apiKey: string): Promise<ConnectHubUnit[]> {
    const { body } = await this.request('GET', '/v1/units', apiKey);
    return dataArray(body).map((raw) => {
      const row = rec(raw);
      return {
        id: str(row, 'id'),
        code: nullableStr(row, 'code'),
        name: str(row, 'name'),
      };
    });
  }

  async listItems(apiKey: string): Promise<ConnectHubItem[]> {
    const { body } = await this.request('GET', '/v1/items', apiKey);
    return dataArray(body).map((raw) => {
      const row = rec(raw);
      return {
        id: str(row, 'id'),
        code: nullableStr(row, 'code'),
        name: str(row, 'name'),
        resolution: str(row, 'resolution'),
        uoms: strArray(row, 'uoms'),
        units: strArray(row, 'units'),
      };
    });
  }

  /**
   * Kayıtları yazar. 201 ve 207 normal yanıttır (satır bazlı sonuç döner).
   * 409/422 gövdesi satır sonuçlarını içeriyorsa `ConnectHubError.writeResponse`
   * ile taşınır. Bağlantı koparsa `outcome_unknown` — external_id sabit olduğu
   * için aynı kaydı TEKRAR göndermek güvenlidir (yeni kayıt açılmaz).
   */
  async writeRecords(
    apiKey: string,
    records: RecordInput[],
  ): Promise<WriteRecordsResponse> {
    if (records.length === 0) return { written: 0, rejected: 0, results: [] };
    if (records.length > CONNECTHUB_MAX_RECORDS_PER_REQUEST) {
      throw new ConnectHubError(
        'invalid_request',
        `Tek istekte en fazla ${CONNECTHUB_MAX_RECORDS_PER_REQUEST} kayıt gönderilebilir.`,
      );
    }
    const { status, body } = await this.request(
      'POST',
      '/v1/records',
      apiKey,
      JSON.stringify({ records }),
      { acceptStatuses: [201, 207] },
    );
    void status;
    return parseWriteResponse(body);
  }

  /** Bir birimin ONAYLI kayıtları (tüm sayfalar). */
  async readApprovedRecords(
    apiKey: string,
    filter: { unit: string; item?: string; from?: string; to?: string },
  ): Promise<ApprovedRecord[]> {
    const out: ApprovedRecord[] = [];
    for (let page = 0; page < MAX_READ_PAGES; page++) {
      const query = new URLSearchParams({ unit: filter.unit });
      if (filter.item) query.set('item', filter.item);
      if (filter.from) query.set('from', filter.from);
      if (filter.to) query.set('to', filter.to);
      query.set('offset', String(page * READ_PAGE_SIZE));
      query.set('limit', String(READ_PAGE_SIZE));
      const { body } = await this.request(
        'GET',
        `/v1/records?${query.toString()}`,
        apiKey,
      );
      const rows = dataArray(body).map(parseApprovedRecord);
      out.push(...rows);
      if (rows.length < READ_PAGE_SIZE) return out;
    }
    throw new ConnectHubError(
      'invalid_response',
      'Kayıt listesi beklenenden uzun; sayfalama sınırı aşıldı.',
    );
  }

  async listFactorPackages(
    apiKey: string,
    year?: number,
  ): Promise<FactorPackageSummary[]> {
    const path =
      year === undefined
        ? '/v1/factor-packages'
        : `/v1/factor-packages?year=${encodeURIComponent(String(year))}`;
    const { body } = await this.request('GET', path, apiKey);
    return dataArray(body).map((raw) => {
      const row = rec(raw);
      return {
        id: str(row, 'id'),
        name: str(row, 'name'),
        year: int(row, 'year'),
        content_hash: str(row, 'content_hash'),
      };
    });
  }

  /** `etag` verilirse ve içerik değişmediyse `{ notModified: true }` döner. */
  async getFactorPackage(
    apiKey: string,
    inventoryId: string,
    etag?: string,
  ): Promise<
    | { notModified: true }
    | { notModified: false; etag: string | null; pkg: FactorPackage }
  > {
    const { status, body, headers } = await this.request(
      'GET',
      `/v1/factor-packages/${encodeURIComponent(inventoryId)}`,
      apiKey,
      undefined,
      {
        acceptStatuses: [200, 304],
        extraHeaders: etag ? { 'If-None-Match': etag } : undefined,
      },
    );
    if (status === 304) return { notModified: true };
    return {
      notModified: false,
      etag: headers.get('etag'),
      pkg: parseFactorPackage(body),
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    apiKey: string,
    body?: string,
    opts: {
      acceptStatuses?: number[];
      extraHeaders?: Record<string, string>;
    } = {},
  ): Promise<{
    status: number;
    body: unknown;
    headers: FetchResponse['headers'];
  }> {
    if (!this.configured) {
      throw new ConnectHubError(
        'not_configured',
        'ConnectHub adresi yapılandırılmadı.',
      );
    }
    if (!apiKey?.trim()) {
      throw new ConnectHubError('unauthorized', 'API anahtarı çözülemedi.');
    }

    let response: FetchResponse;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'X-Api-Key': apiKey.trim(),
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.extraHeaders ?? {}),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (failure) {
      const name = failure instanceof Error ? failure.name : 'bilinmeyen hata';
      if (method === 'POST') {
        throw new ConnectHubError(
          'outcome_unknown',
          `ConnectHub yanıtı alınamadı (${name}); kayıtlar yazılmış olabilir. Aynı kayıtları tekrar göndermek güvenlidir.`,
        );
      }
      throw new ConnectHubError(
        'unavailable',
        `ConnectHub'a ulaşılamadı: ${name}`,
      );
    }

    const accept = opts.acceptStatuses ?? [200];
    if (accept.includes(response.status)) {
      if (response.status === 304) {
        return { status: 304, body: null, headers: response.headers };
      }
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new ConnectHubError('invalid_response', 'Yanıt JSON değil.');
      }
      return {
        status: response.status,
        body: parsed,
        headers: response.headers,
      };
    }

    // Hata: gövdeyi okumayı dene (422/409'da satır sonuçları olabilir).
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw classifyError(response.status, errorBody);
  }
}

function classifyError(status: number, body: unknown): ConnectHubError {
  let writeResponse: WriteRecordsResponse | undefined;
  try {
    writeResponse = body ? parseWriteResponse(body) : undefined;
  } catch {
    writeResponse = undefined;
  }
  const detail = problemDetail(body);
  const suffix = detail ? ` (${detail})` : '';
  switch (status) {
    case 401:
      return new ConnectHubError(
        'unauthorized',
        `API anahtarı eksik, geçersiz veya iptal edilmiş${suffix}.`,
        status,
      );
    case 403:
      return new ConnectHubError(
        'forbidden',
        `Anahtarın bu işlem için yetkisi yok (yön/kapsam veya "Faktörleri içer")${suffix}.`,
        status,
      );
    case 404:
      return new ConnectHubError('not_found', `Bulunamadı${suffix}.`, status);
    case 409:
      return new ConnectHubError(
        'period_closed',
        `Dönem 3pmetrics'te kapalı; dönem yeniden açılırsa tekrar gönderin${suffix}.`,
        status,
        writeResponse,
      );
    case 400:
    case 422:
      return new ConnectHubError(
        'invalid_request',
        `Kayıtlar doğrulanamadı${suffix}.`,
        status,
        writeResponse,
      );
    case 429:
      return new ConnectHubError(
        'rate_limited',
        'İstek sınırı aşıldı (dakikada 600). Biraz sonra tekrar deneyin.',
        status,
      );
    default:
      return new ConnectHubError(
        'unavailable',
        `ConnectHub ${status} döndü${suffix}.`,
        status,
      );
  }
}

function problemDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const parts = [row.title, row.detail].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return parts.length ? parts.join(': ').slice(0, 300) : null;
}

// --- Ayrıştırıcılar (export: testler doğrudan kullanır) ----------------------

export function parseWriteResponse(body: unknown): WriteRecordsResponse {
  const row = rec(body);
  if (!Array.isArray(row.results)) invalid('`results` dizisi yok.');
  return {
    written: int(row, 'written'),
    rejected: int(row, 'rejected'),
    results: (row.results as unknown[]).map((raw) => {
      const r = rec(raw);
      const error =
        r.error && typeof r.error === 'object'
          ? {
              code: str(rec(r.error), 'code'),
              message: nullableStr(rec(r.error), 'message') ?? '',
            }
          : null;
      return {
        external_id: nullableStr(r, 'external_id'),
        status: str(r, 'status'),
        record_id: nullableStr(r, 'record_id'),
        error,
        warnings: Array.isArray(r.warnings)
          ? r.warnings.filter((w): w is string => typeof w === 'string')
          : [],
      };
    }),
  };
}

export function parseApprovedRecord(raw: unknown): ApprovedRecord {
  const row = rec(raw);
  return {
    record_id: str(row, 'record_id'),
    item: str(row, 'item'),
    unit: str(row, 'unit'),
    period: str(row, 'period'),
    quantity: num(row, 'quantity'),
    uom: nullableStr(row, 'uom'),
    description: nullableStr(row, 'description'),
    source: nullableStr(row, 'source') ?? '',
    external_id: nullableStr(row, 'external_id'),
  };
}

export function parseFactorPackage(body: unknown): FactorPackage {
  const root = rec(body);
  const release = rec(root.release);
  const inventory = rec(root.inventory);
  if (!Array.isArray(root.items)) invalid('`items` dizisi yok.');
  if (!Array.isArray(root.factors)) invalid('`factors` dizisi yok.');
  return {
    release: {
      schema_version: str(release, 'schema_version'),
      release_id: str(release, 'release_id'),
      generated_at: str(release, 'generated_at'),
      content_hash: str(release, 'content_hash'),
    },
    inventory: {
      id: str(inventory, 'id'),
      name: str(inventory, 'name'),
      year: int(inventory, 'year'),
      period_start: str(inventory, 'period_start'),
      period_end: nullableStr(inventory, 'period_end'),
      gwp_set: str(inventory, 'gwp_set'),
      gwp_ch4: num(inventory, 'gwp_ch4'),
      gwp_n2o: num(inventory, 'gwp_n2o'),
      dataset: nullableStr(inventory, 'dataset') ?? '',
      combustion_dataset: nullableStr(inventory, 'combustion_dataset') ?? '',
      default_country_code: nullableStr(inventory, 'default_country_code'),
      scope2_method: nullableStr(inventory, 'scope2_method') ?? '',
    },
    items: (root.items as unknown[]).map((raw) => {
      const item = rec(raw);
      return {
        id: str(item, 'id'),
        code: nullableStr(item, 'code'),
        name: str(item, 'name'),
        scope: nullableInt(item, 'scope'),
        uoms: arr(item, 'uoms').map((u) => {
          const uom = rec(u);
          return {
            id: str(uom, 'id'),
            code: nullableStr(uom, 'code'),
            name: nullableStr(uom, 'name') ?? '',
          };
        }),
        mappings: arr(item, 'mappings').map((m) => {
          const mapping = rec(m);
          const error =
            mapping.error && typeof mapping.error === 'object'
              ? {
                  code: str(rec(mapping.error), 'code'),
                  reason: nullableStr(rec(mapping.error), 'reason') ?? '',
                }
              : null;
          return {
            unit_ids: strArray(mapping, 'unit_ids'),
            year: int(mapping, 'year'),
            option_value: nullableStr(mapping, 'option_value'),
            uom_id: nullableStr(mapping, 'uom_id'),
            factor_id: nullableStr(mapping, 'factor_id'),
            error,
            warnings: Array.isArray(mapping.warnings)
              ? mapping.warnings.filter(
                  (w): w is string => typeof w === 'string',
                )
              : [],
          };
        }),
      };
    }),
    factors: (root.factors as unknown[]).map((raw) => {
      const f = rec(raw);
      const gases =
        f.gases && typeof f.gases === 'object'
          ? (() => {
              const g = rec(f.gases);
              return {
                basis: str(g, 'basis'),
                co2: num(g, 'co2'),
                ch4: num(g, 'ch4'),
                n2o: num(g, 'n2o'),
                other_co2e: nullableNum(g, 'other_co2e'),
                ncv_tj_per_uom: nullableNum(g, 'ncv_tj_per_uom'),
                ncv_source: nullableStr(g, 'ncv_source'),
              };
            })()
          : null;
      const verification =
        f.verification && typeof f.verification === 'object'
          ? {
              status: nullableStr(rec(f.verification), 'status') ?? '',
              verified_on: nullableStr(rec(f.verification), 'verified_on'),
              source_url: nullableStr(rec(f.verification), 'source_url'),
            }
          : null;
      const source =
        f.source && typeof f.source === 'object'
          ? {
              code: nullableStr(rec(f.source), 'code'),
              name: nullableStr(rec(f.source), 'name') ?? '',
              version: nullableStr(rec(f.source), 'version'),
              url: nullableStr(rec(f.source), 'url'),
              license: nullableStr(rec(f.source), 'license'),
              attribution: nullableStr(rec(f.source), 'attribution'),
            }
          : null;
      return {
        id: str(f, 'id'),
        kind: nullableStr(f, 'kind') ?? '',
        shared: f.shared === true,
        name: nullableStr(f, 'name'),
        kg_co2e_per_uom: nullableNum(f, 'kg_co2e_per_uom'),
        uom_id: nullableStr(f, 'uom_id'),
        uom_code: nullableStr(f, 'uom_code'),
        uom_name: nullableStr(f, 'uom_name'),
        gwp_embedded: f.gwp_embedded === true,
        source_gwp_set: nullableStr(f, 'source_gwp_set'),
        gases,
        factor_kind: nullableStr(f, 'factor_kind'),
        includes_transmission_losses:
          typeof f.includes_transmission_losses === 'boolean'
            ? f.includes_transmission_losses
            : null,
        data_year: nullableInt(f, 'data_year'),
        publication_year: nullableInt(f, 'publication_year'),
        country_code: nullableStr(f, 'country_code'),
        biogenic_co2_kg_per_uom: nullableNum(f, 'biogenic_co2_kg_per_uom'),
        company_declared: f.company_declared === true,
        verification,
        source,
      };
    }),
    notices: Array.isArray(root.notices)
      ? root.notices.map((raw) => {
          const n = rec(raw);
          return {
            code: str(n, 'code'),
            message: nullableStr(n, 'message') ?? '',
          };
        })
      : [],
  };
}

// --- küçük yardımcılar --------------------------------------------------------

function invalid(detail: string): never {
  throw new ConnectHubError(
    'invalid_response',
    `ConnectHub yanıtı beklenen şemada değil: ${detail}`,
  );
}

function rec(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('nesne bekleniyordu.');
  }
  return value as Record<string, unknown>;
}

function dataArray(body: unknown): unknown[] {
  const root = rec(body);
  if (!Array.isArray(root.data)) invalid('`data` dizisi yok.');
  return root.data as unknown[];
}

function arr(row: Record<string, unknown>, key: string): unknown[] {
  const value = row[key];
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) invalid(`\`${key}\` dizi değil.`);
  return value as unknown[];
}

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) invalid(`\`${key}\` yok.`);
  return value;
}

function nullableStr(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid(`\`${key}\` metin değil.`);
  return value.trim() ? value : null;
}

function strArray(row: Record<string, unknown>, key: string): string[] {
  return arr(row, key).map((v) => {
    if (typeof v !== 'string') invalid(`\`${key}\` metin dizisi değil.`);
    return v;
  });
}

function num(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`\`${key}\` sayı değil.`);
  }
  return value;
}

function nullableNum(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return num(row, key);
}

function int(row: Record<string, unknown>, key: string): number {
  const value = num(row, key);
  if (!Number.isInteger(value)) invalid(`\`${key}\` tam sayı değil.`);
  return value;
}

function nullableInt(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return int(row, key);
}
