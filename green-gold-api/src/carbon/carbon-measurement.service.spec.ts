import { CarbonMeasurementService } from './carbon-measurement.service';
import { CarbonProviderRegistryService } from './carbon-provider-registry';
import {
  ThreePMetricsAdapter,
  parseGhgSummary,
} from './adapters/threepmetrics.adapter';
import {
  CarbonProviderRequestError,
  type CarbonProviderAdapter,
  type CarbonSummary,
  type MeasurementPeriod,
  type ProviderCredentials,
} from './carbon-provider.interface';
import {
  EnvCarbonCredentialResolver,
  LayeredCarbonCredentialResolver,
  VaultCarbonCredentialResolver,
  type CarbonCredentialResolver,
} from './carbon-credentials';
import { toKilograms } from './room-night-allocation';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

const LINK_ID = '11111111-1111-4111-8111-111111111111';
const API_KEY = 'test-key-not-real';

function fakeConfig(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as never;
}

function registryWith(adapter: CarbonProviderAdapter) {
  return {
    resolve: (provider: string) =>
      provider === adapter.provider ? adapter : undefined,
    statuses: () => [
      { provider: adapter.provider, configured: adapter.configured },
    ],
  } as unknown as CarbonProviderRegistryService;
}

/** Dokümandaki by-ghg yanıt şeması (tonCO2e). */
const ghgBody = (values = { s1: 120, s2: 280, s3: 100 }) => ({
  scopes: [
    {
      scopeTitle: 'Kapsam 1',
      scopeLabel: 'scope-1',
      categories: [
        {
          categoryTitle: 'Sabit Yanma',
          categoryLabel: 'stationary-combustion',
          emissionSources: [
            { title: 'Doğalgaz', totalCarbonValue: values.s1, unit: 'tonCO2e' },
          ],
        },
      ],
    },
    {
      scopeTitle: 'Kapsam 2',
      scopeLabel: 'scope-2',
      categories: [
        {
          categoryTitle: 'Satın Alınan Elektrik',
          categoryLabel: 'purchased-electricity',
          emissionSources: [
            { title: 'Elektrik', totalCarbonValue: values.s2, unit: 'tonCO2e' },
          ],
        },
      ],
    },
    {
      scopeTitle: 'Kapsam 3',
      scopeLabel: 'scope-3',
      categories: [
        {
          categoryTitle: 'Atık',
          categoryLabel: 'waste',
          emissionSources: [
            { title: 'Atık', totalCarbonValue: values.s3, unit: 'tonCO2e' },
          ],
        },
      ],
    },
  ],
});

/** Gerçek adapter'ın yerine geçen, çağrıları kaydeden sahte sağlayıcı. */
class FakeAdapter implements CarbonProviderAdapter {
  readonly provider = 'threepmetrics';
  readonly summaryCalls: {
    credentials: ProviderCredentials;
    period: MeasurementPeriod;
  }[] = [];

  constructor(
    readonly configured = true,
    private readonly body: unknown = ghgBody(),
    private readonly failWith?: Error,
  ) {}

  listAccounts() {
    return Promise.resolve([{ externalAccountId: 'otel-a', name: 'Otel A' }]);
  }
  listUnits() {
    return Promise.resolve([
      { externalUnitId: 'merkez', name: 'Merkez', type: 'Other' },
    ]);
  }
  getCarbonSummary(
    credentials: ProviderCredentials,
    period: MeasurementPeriod,
  ): Promise<CarbonSummary> {
    this.summaryCalls.push({ credentials, period });
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(parseGhgSummary(this.body, period));
  }
  // Veri girişi uçları carbon-data-entry.service.spec.ts'te test edilir.
  listEmissionResources() {
    return Promise.resolve([]);
  }
  lookupAirports() {
    return Promise.resolve([]);
  }
  createReply(): Promise<never> {
    return Promise.reject(new Error('bu testte kullanılmaz'));
  }
  uploadReplyDocument(): Promise<never> {
    return Promise.reject(new Error('bu testte kullanılmaz'));
  }
}

const fixedCredentials = (
  key: string | null = API_KEY,
): CarbonCredentialResolver => ({
  name: 'test',
  supportedEnvironments: ['sandbox'],
  resolve: () => Promise.resolve(key ? { apiKey: key } : null),
  has: () => Promise.resolve(key !== null),
});

function makeService(
  dataset: FakeDataset,
  adapter: CarbonProviderAdapter = new FakeAdapter(),
  credentials: CarbonCredentialResolver = fixedCredentials(),
  config = fakeConfig(),
) {
  const fake = makeFakeSupabase(dataset);
  const service = new CarbonMeasurementService(
    fake as never,
    registryWith(adapter),
    config,
  );
  service.credentials = credentials;
  return { service, fake, adapter };
}

const hotelRow = (over: Record<string, unknown> = {}) => ({
  id: 'hotel-A',
  name: 'Otel A',
  default_currency: 'EUR',
  widget_settings: null,
  ...over,
});

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: LINK_ID,
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  environment: 'sandbox',
  status: 'active',
  external_property_id: 'otel-a',
  external_property_name: 'Otel A',
  authorization_ref: 'PILOT_HOTEL',
  linked_at: '2026-10-01T00:00:00.000Z',
  revoked_at: null,
  ...over,
});

const measurementRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  external_measurement_id: 'ghg:otel-a:2025-01-01:2025-12-31',
  external_version: 'abc',
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  result_status: 'completed',
  total_emissions: 500,
  total_emissions_unit: 'tonCO2e',
  scope: 'hotel_total',
  methodology: 'GHG Protocol',
  methodology_version: '1.0',
  verification_status: 'unverified',
  report_url: null,
  rooms: 200,
  occupied_room_nights: 50_000,
  guest_nights: null,
  room_night_kg: 8,
  allocation_method: 'x',
  is_active: true,
  provider_updated_at: null,
  imported_at: '2026-01-05T00:00:00.000Z',
  ...over,
});

/** 200 oda, %68 doluluk, oda alanı payı 0.8. */
const importInput = (over: Record<string, unknown> = {}) => ({
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  country: 'Turkey',
  rooms: 200,
  occupied_room_nights: 50_000,
  total_area_m2: 20_000,
  guestrooms_area_m2: 8_000,
  meeting_area_m2: 2_000,
  ...over,
});

// ---------------------------------------------------------------------------

describe('parseGhgSummary (3pmetrics by-ghg şeması)', () => {
  const period = { start: '2025-01-01', end: '2025-12-31' };

  it('kaynak satırlarını toplar ve kapsam toplamlarını çıkarır', () => {
    const summary = parseGhgSummary(ghgBody(), period);
    expect(summary.totalEmissions).toBe(500);
    expect(summary.totalEmissionsUnit).toBe('tonCO2e');
    expect(summary.scopes.map((s) => [s.scopeLabel, s.total])).toEqual([
      ['scope-1', 120],
      ['scope-2', 280],
      ['scope-3', 100],
    ]);
    expect(summary.lines).toHaveLength(3);
  });

  it('beklenmeyen birimi TAHMİN ETMEZ, özeti reddeder', () => {
    const body = ghgBody();
    body.scopes[0].categories[0].emissionSources[0].unit = 'kgCO2e';
    expect(() => parseGhgSummary(body, period)).toThrow(
      CarbonProviderRequestError,
    );
  });

  it('şema dışı yanıtı reddeder', () => {
    expect(() => parseGhgSummary({ categories: [] }, period)).toThrow(/scopes/);
    const body = ghgBody();
    (
      body.scopes[1].categories[0].emissionSources[0] as Record<string, unknown>
    ).totalCarbonValue = '280';
    expect(() => parseGhgSummary(body, period)).toThrow(/sayı değil/);
  });

  it('boş hesap 0 toplam döner (hata değil; servis bunu "veri yok" sayar)', () => {
    expect(parseGhgSummary({ scopes: [] }, period).totalEmissions).toBe(0);
  });
});

describe('ThreePMetricsAdapter', () => {
  const okFetch = (body: unknown, status = 200) => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (
      url: string,
      init: { headers: Record<string, string> },
    ) => {
      calls.push({ url, headers: init.headers });
      return Promise.resolve({
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body),
      });
    };
    return { calls, fetchImpl };
  };

  it('dokümandaki uca, anahtarı X-Integration-Api-Key ile gönderir', async () => {
    const { calls, fetchImpl } = okFetch(ghgBody());
    const adapter = new ThreePMetricsAdapter({
      baseUrl: 'https://connect-test.3pmetrics.io/',
      fetchImpl,
    });
    const summary = await adapter.getCarbonSummary(
      { apiKey: API_KEY },
      { start: '2025-01-01', end: '2025-12-31' },
    );
    expect(summary.totalEmissions).toBe(500);
    expect(calls[0].url).toBe(
      'https://connect-test.3pmetrics.io/cca/carbon-summary/by-ghg?language=tr&dateFrom=2025-01-01&dateTo=2025-12-31',
    );
    expect(calls[0].headers['X-Integration-Api-Key']).toBe(API_KEY);
    // İki kimlik yöntemi aynı anda gönderilmez.
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'no_data'],
    [422, 'invalid_request'],
    [500, 'unavailable'],
  ])('HTTP %i -> %s', async (status, reason) => {
    const { fetchImpl } = okFetch({}, status);
    const adapter = new ThreePMetricsAdapter({
      baseUrl: 'https://connect-test.3pmetrics.io',
      fetchImpl,
    });
    await expect(
      adapter.getCarbonSummary(
        { apiKey: API_KEY },
        { start: '2025-01-01', end: '2025-01-31' },
      ),
    ).rejects.toMatchObject({ reason });
  });

  it('müşteri ve birim listesini kontrata çevirir', async () => {
    const { fetchImpl, calls } = okFetch([{ name: 'Otel A', slug: 'otel-a' }]);
    const adapter = new ThreePMetricsAdapter({
      baseUrl: 'https://connect-test.3pmetrics.io',
      fetchImpl,
    });
    await expect(adapter.listAccounts({ apiKey: API_KEY })).resolves.toEqual([
      { externalAccountId: 'otel-a', name: 'Otel A' },
    ]);
    expect(calls[0].url).toBe(
      'https://connect-test.3pmetrics.io/cca/customers',
    );
  });

  it('base URL yoksa yapılandırılmamış sayılır ve çağrı yapmaz', async () => {
    const { fetchImpl, calls } = okFetch(ghgBody());
    const adapter = new ThreePMetricsAdapter({ baseUrl: '', fetchImpl });
    expect(adapter.configured).toBe(false);
    await expect(adapter.listAccounts({ apiKey: API_KEY })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('EnvCarbonCredentialResolver', () => {
  const env = { CARBON_PROVIDER_SECRET_PILOT_HOTEL: API_KEY };

  it('sandbox referansını env değişkeninden çözer', async () => {
    const resolver = new EnvCarbonCredentialResolver(env);
    await expect(resolver.resolve('PILOT_HOTEL', 'sandbox')).resolves.toEqual({
      apiKey: API_KEY,
    });
  });

  it('production için env çözmez (fail closed)', async () => {
    const resolver = new EnvCarbonCredentialResolver(env);
    await expect(
      resolver.resolve('PILOT_HOTEL', 'production'),
    ).resolves.toBeNull();
    await expect(resolver.has('PILOT_HOTEL', 'production')).resolves.toBe(
      false,
    );
  });

  it('güvensiz referans biçimini reddeder', async () => {
    const resolver = new EnvCarbonCredentialResolver(env);
    await expect(
      resolver.resolve('pilot-hotel', 'sandbox'),
    ).resolves.toBeNull();
    await expect(resolver.resolve(undefined, 'sandbox')).resolves.toBeNull();
  });
});

describe('VaultCarbonCredentialResolver', () => {
  const vault = (secrets: Record<string, string>, fail = false) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const db = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fail) {
          return Promise.resolve({
            data: null,
            error: { message: 'function does not exist' },
          });
        }
        const value = secrets[args.p_ref as string];
        return Promise.resolve({
          data:
            fn === 'carbon_provider_secret_exists'
              ? value !== undefined
              : (value ?? null),
          error: null,
        });
      },
    };
    return { db, calls };
  };

  it('production anahtarını Vault fonksiyonundan çözer', async () => {
    const { db, calls } = vault({ GREENGOLD: API_KEY });
    const resolver = new VaultCarbonCredentialResolver(db);
    await expect(resolver.resolve('GREENGOLD', 'production')).resolves.toEqual({
      apiKey: API_KEY,
    });
    expect(calls[0]).toEqual({
      fn: 'carbon_provider_secret_get',
      args: { p_ref: 'GREENGOLD' },
    });
  });

  it('varlık kontrolünde şifre çözmez', async () => {
    const { db, calls } = vault({ GREENGOLD: API_KEY });
    const resolver = new VaultCarbonCredentialResolver(db);
    await expect(resolver.has('GREENGOLD', 'production')).resolves.toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(['carbon_provider_secret_exists']);
  });

  it('güvensiz referansla Vault çağrısı yapmaz', async () => {
    const { db, calls } = vault({});
    const resolver = new VaultCarbonCredentialResolver(db);
    await expect(
      resolver.resolve("x'; drop", 'production'),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('Vault hatasında (migration yok) null döner, env yedeğine düşer — yalnızca sandbox', async () => {
    const layered = new LayeredCarbonCredentialResolver([
      new VaultCarbonCredentialResolver(vault({}, true).db),
      new EnvCarbonCredentialResolver({
        CARBON_PROVIDER_SECRET_GREENGOLD: API_KEY,
      }),
    ]);
    await expect(layered.resolve('GREENGOLD', 'sandbox')).resolves.toEqual({
      apiKey: API_KEY,
    });
    await expect(
      layered.resolve('GREENGOLD', 'production'),
    ).resolves.toBeNull();
  });
});

describe('toKilograms', () => {
  it("3pmetrics birimi 'tonCO2e'yi tona göre çevirir", () => {
    expect(toKilograms(1.5, 'tonCO2e')).toBe(1500);
  });
});

describe('CarbonMeasurementService.getStatus', () => {
  it('bağlantı yoksa anahtar hazır görünmez', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.provider_configured).toBe(true);
    expect(status.credentials_ready).toBe(false);
    expect(status.link).toBeNull();
    expect(status.active_measurement).toBeNull();
  });

  it('aktif bağlantı + çözülebilir anahtar -> credentials_ready', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [linkRow()],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.credentials_ready).toBe(true);
    expect(status.link?.external_property_name).toBe('Otel A');
    // authorization_ref panele ASLA dönmez.
    expect(JSON.stringify(status)).not.toContain('PILOT_HOTEL');
  });

  it('anahtar çözülemezse bağlantı hazır görünmez', async () => {
    const { service } = makeService(
      {
        hotels: [hotelRow()],
        carbon_provider_links: [linkRow()],
        carbon_measurements: [],
      },
      new FakeAdapter(),
      fixedCredentials(null),
    );
    expect((await service.getStatus('hotel-A')).credentials_ready).toBe(false);
  });

  it('yalnızca kendi otelinin ölçümlerini sayar (tenant izolasyonu)', async () => {
    const { service } = makeService({
      hotels: [
        hotelRow({
          widget_settings: { carbon_pricing: { provider: 'threepmetrics' } },
        }),
      ],
      carbon_provider_links: [],
      carbon_measurements: [
        measurementRow(),
        measurementRow({ id: 'm2', hotel_id: 'hotel-B' }),
      ],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.measurements_count).toBe(1);
    expect(status.active_measurement?.id).toBe('m1');
    expect(status.active_source).toBe('provider_measurement');
  });

  it('otel başka hesap yöntemine geçtiyse 3pmetrics ölçümünü aktif göstermez', async () => {
    const { service } = makeService({
      hotels: [
        hotelRow({
          widget_settings: { carbon_pricing: { provider: 'hotel-input-demo' } },
        }),
      ],
      carbon_provider_links: [],
      carbon_measurements: [measurementRow()],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.active_measurement).toBeNull();
    expect(status.active_source).toBe('hotel_input');
  });

  it('bölgesel tahmini de ayırt eder', async () => {
    const { service } = makeService({
      hotels: [
        hotelRow({
          widget_settings: { carbon_pricing: { provider: 'greenview-demo' } },
        }),
      ],
      carbon_provider_links: [],
      carbon_measurements: [],
    });
    expect((await service.getStatus('hotel-A')).active_source).toBe(
      'regional_estimate',
    );
  });

  it('kaldırılmış bağlantıyı aktif bağlantı gibi göstermez', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [
        linkRow({ status: 'revoked', revoked_at: '2026-02-01T00:00:00.000Z' }),
      ],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.link).toBeNull();
    expect(status.credentials_ready).toBe(false);
  });
});

describe('CarbonMeasurementService.importMeasurement', () => {
  const dataset = (): FakeDataset => ({
    hotels: [hotelRow()],
    carbon_provider_links: [linkRow()],
    carbon_measurements: [],
  });

  it('3pmetrics özetini oda-gece katsayısına çevirir ve fiyatı DEĞİŞTİRMEDEN kaydeder', async () => {
    const { service, fake, adapter } = makeService(dataset());
    const result = await service.importMeasurement('hotel-A', importInput());

    // 500 t × (8000 / (8000 + 2000)) / 50 000 oda-gece = 8 kg
    expect(result.summary.totalEmissions).toBe(500);
    expect(result.pricing.coefficient_kg).toBeCloseTo(8, 6);
    expect(result.pricing.provider).toBe('threepmetrics');
    expect(result.pricing.amount_per_night).toBeCloseTo(0.2, 2);
    expect(result.duplicate).toBe(false);

    const rows = fake.dataset.carbon_measurements!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hotel_id: 'hotel-A',
      external_property_id: 'otel-a',
      total_emissions_unit: 'tonCO2e',
      scope: 'hotel_total',
      is_active: false,
    });
    // Anahtar çağrıda kullanılır ama hiçbir satıra yazılmaz.
    expect((adapter as FakeAdapter).summaryCalls[0].credentials.apiKey).toBe(
      API_KEY,
    );
    expect(JSON.stringify(fake.dataset)).not.toContain(API_KEY);
    // Widget fiyatı yalnızca activate ile değişir.
    expect(
      fake.dataset.hotels![0].contribution_amount_per_night,
    ).toBeUndefined();
  });

  it('aynı veri + aynı girdi ikinci kez satır üretmez', async () => {
    const { service, fake } = makeService(dataset());
    await service.importMeasurement('hotel-A', importInput());
    const second = await service.importMeasurement('hotel-A', importInput());
    expect(second.duplicate).toBe(true);
    expect(fake.dataset.carbon_measurements).toHaveLength(1);
  });

  it('geçersiz otel girdisini sağlayıcıya GİTMEDEN reddeder', async () => {
    const { service, adapter } = makeService(dataset());
    await expect(
      service.importMeasurement(
        'hotel-A',
        importInput({ occupied_room_nights: 200 * 365 + 1 }),
      ),
    ).rejects.toThrow(/Dolu oda-gece/);
    await expect(
      service.importMeasurement(
        'hotel-A',
        importInput({ period_end: '2099-01-01' }),
      ),
    ).rejects.toThrow();
    expect((adapter as FakeAdapter).summaryCalls).toHaveLength(0);
  });

  it('bağlantı yoksa 503 carbon_provider_not_linked döner', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurements: [],
    });
    await expect(
      service.importMeasurement('hotel-A', importInput()),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'carbon_provider_not_linked' },
    });
  });

  it('anahtar çözülemezse sağlayıcıyı çağırmaz', async () => {
    const adapter = new FakeAdapter();
    const { service } = makeService(dataset(), adapter, fixedCredentials(null));
    await expect(
      service.importMeasurement('hotel-A', importInput()),
    ).rejects.toMatchObject({
      response: { code: 'carbon_provider_credentials_missing' },
    });
    expect(adapter.summaryCalls).toHaveLength(0);
  });

  it('başka ortamın bağlantısıyla çağrı yapmaz', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [linkRow({ environment: 'production' })],
      carbon_measurements: [],
    });
    await expect(
      service.importMeasurement('hotel-A', importInput()),
    ).rejects.toMatchObject({
      response: { code: 'carbon_provider_environment_mismatch' },
    });
  });

  it('dönemde veri yoksa 404 carbon_provider_no_data döner ve satır yazmaz', async () => {
    const { service, fake } = makeService(
      dataset(),
      new FakeAdapter(true, { scopes: [] }),
    );
    await expect(
      service.importMeasurement('hotel-A', importInput()),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'carbon_provider_no_data' },
    });
    expect(fake.dataset.carbon_measurements).toHaveLength(0);
  });

  it('401 hatasını anlamlı bir koda çevirir, iç mesajı sızdırmaz', async () => {
    const { service } = makeService(
      dataset(),
      new FakeAdapter(
        true,
        ghgBody(),
        new CarbonProviderRequestError('unauthorized', 'iç detay xyz', 401),
      ),
    );
    const failure = await service
      .importMeasurement('hotel-A', importInput())
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({
      response: { code: 'carbon_provider_unauthorized' },
    });
    expect(JSON.stringify(failure)).not.toContain('xyz');
  });

  it('sağlayıcı yapılandırılmadıysa 503 döner', async () => {
    const { service } = makeService(dataset(), new FakeAdapter(false));
    await expect(
      service.importMeasurement('hotel-A', importInput()),
    ).rejects.toMatchObject({
      response: { code: 'carbon_provider_not_configured' },
    });
  });
});

describe('CarbonMeasurementService.activateMeasurement', () => {
  it('ölçümü widget fiyatına uygular ve tek aktif ölçüm bırakır', async () => {
    const { service, fake } = makeService({
      hotels: [hotelRow({ widget_settings: { theme: 'light' } })],
      carbon_provider_links: [linkRow()],
      carbon_measurements: [measurementRow({ id: 'old', is_active: true })],
    });
    const imported = await service.importMeasurement('hotel-A', importInput());
    const id = imported.measurement.id;
    // fake id'ler UUID değil — gerçek DB'de UUID; testte satırı UUID'ye çevir.
    const uuid = '22222222-2222-4222-8222-222222222222';
    fake.dataset.carbon_measurements!.find((r) => r.id === id)!.id = uuid;

    const result = await service.activateMeasurement('hotel-A', uuid);
    expect(result.pricing.coefficient_kg).toBeCloseTo(8, 6);

    const hotel = fake.dataset.hotels![0];
    expect(hotel.estimated_co2_per_night_kg).toBeCloseTo(8, 6);
    expect(hotel.contribution_amount_per_night).toBeCloseTo(0.2, 2);
    expect(hotel.widget_settings).toMatchObject({
      theme: 'light',
      carbon_pricing: { provider: 'threepmetrics' },
    });
    const active = fake.dataset.carbon_measurements!.filter((r) => r.is_active);
    expect(active.map((r) => r.id as string)).toEqual([uuid]);
  });

  it('başka otelin ölçümünü uygulamaz (tenant izolasyonu)', async () => {
    const uuid = '33333333-3333-4333-8333-333333333333';
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_measurements: [measurementRow({ id: uuid, hotel_id: 'hotel-B' })],
    });
    await expect(service.activateMeasurement('hotel-A', uuid)).rejects.toThrow(
      'Ölçüm bulunamadı.',
    );
  });

  it('geçersiz kimliği reddeder', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.activateMeasurement('hotel-A', 'not-a-uuid'),
    ).rejects.toThrow('Ölçüm kimliği geçersiz.');
  });
});

describe('CarbonMeasurementService.revokeLink', () => {
  it('bağlantıyı kaldırır ve satırı silmez', async () => {
    const { service, fake } = makeService({
      carbon_provider_links: [linkRow()],
    });
    const result = await service.revokeLink('hotel-A', LINK_ID);
    expect(result.status).toBe('revoked');
    expect(fake.dataset.carbon_provider_links).toHaveLength(1);
  });

  it('başka otelin bağlantısını kaldırmaz (tenant izolasyonu)', async () => {
    const { service, fake } = makeService({
      carbon_provider_links: [linkRow({ hotel_id: 'hotel-B' })],
    });
    await expect(service.revokeLink('hotel-A', LINK_ID)).rejects.toThrow(
      'Aktif bağlantı bulunamadı.',
    );
    expect(fake.dataset.carbon_provider_links![0].status).toBe('active');
  });

  it('geçersiz kimliği reddeder', async () => {
    const { service } = makeService({ carbon_provider_links: [] });
    await expect(service.revokeLink('hotel-A', 'x')).rejects.toThrow(
      'Bağlantı kimliği geçersiz.',
    );
  });
});

describe('CarbonProviderRegistryService', () => {
  it('ortama göre resmi 3pmetrics adresini kullanır', () => {
    const sandbox = new CarbonProviderRegistryService(fakeConfig());
    expect(sandbox.resolve('threepmetrics')?.configured).toBe(true);
    expect(sandbox.resolve('baska')).toBeUndefined();
    expect(sandbox.statuses()).toEqual([
      { provider: 'threepmetrics', configured: true },
    ]);
  });
});
