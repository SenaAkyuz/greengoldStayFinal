import { CarbonMeasurementService } from './carbon-measurement.service';
import { CarbonProviderRegistryService } from './carbon-provider-registry';
import { ThreePMetricsNotConfiguredAdapter } from './adapters/threepmetrics.adapter';
import {
  CarbonProviderNotConfiguredError,
  type CarbonProviderAdapter,
  type CreateMeasurementSessionRequest,
  type CreateMeasurementSessionResult,
} from './carbon-provider.interface';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

const PANEL = 'https://panel.example.com';

function fakeConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string) => ({ PANEL_BASE_URL: PANEL, ...values })[key],
  } as never;
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

/** Sözleşme geldiğinde adapter'ın yerine geçecek davranış — seam'i kanıtlar. */
class FakeConfiguredAdapter implements CarbonProviderAdapter {
  readonly provider = 'threepmetrics';
  readonly configured = true;
  readonly sessionRequests: CreateMeasurementSessionRequest[] = [];

  constructor(
    private readonly sessionResult: Partial<CreateMeasurementSessionResult> = {},
    private readonly failWith?: Error,
  ) {}

  createSession(
    request: CreateMeasurementSessionRequest,
  ): Promise<CreateMeasurementSessionResult> {
    this.sessionRequests.push(request);
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve({
      externalSessionId: 'sess-1',
      formUrl: 'https://forms.example.com/m/abc',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      ...this.sessionResult,
    });
  }

  getFormData(): never {
    throw new Error('kullanılmadı');
  }
  getResult(): never {
    throw new Error('kullanılmadı');
  }
  listProperties() {
    return Promise.resolve([
      { externalPropertyId: 'prop-1', name: 'Otel A' },
      { externalPropertyId: 'prop-2', name: 'Otel B' },
    ]);
  }
  listMeasurements() {
    return Promise.resolve([]);
  }
  verifyWebhookSignature(): boolean {
    return false;
  }
  parseWebhookEvent(): never {
    throw new Error('kullanılmadı');
  }
}

function makeService(
  dataset: FakeDataset,
  adapter: CarbonProviderAdapter = new ThreePMetricsNotConfiguredAdapter(),
  config = fakeConfig(),
) {
  const fake = makeFakeSupabase(dataset);
  return {
    service: new CarbonMeasurementService(
      fake as never,
      registryWith(adapter),
      config,
    ),
    fake,
    adapter,
  };
}

const hotelRow = (over: Record<string, unknown> = {}) => ({
  id: 'hotel-A',
  name: 'Otel A',
  widget_settings: null,
  ...over,
});

const measurementRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  external_measurement_id: 'EXT-1',
  external_version: '1',
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  result_status: 'completed',
  total_emissions: 1500,
  total_emissions_unit: 'tCO2e',
  scope: 'guestrooms',
  methodology: 'HCMI',
  methodology_version: '1.2',
  verification_status: 'unverified',
  report_url: null,
  rooms: 200,
  occupied_room_nights: 50_000,
  guest_nights: 90_000,
  room_night_kg: 30,
  allocation_method: 'guestrooms',
  is_active: true,
  provider_updated_at: null,
  imported_at: '2026-01-05T00:00:00.000Z',
  ...over,
});

describe('CarbonMeasurementService.getStatus', () => {
  it('sağlayıcı yapılandırılmadığında bunu DÜRÜSTÇE bildirir', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.provider_configured).toBe(false);
    expect(status.active_measurement).toBeNull();
    expect(status.measurements_count).toBe(0);
  });

  it('yalnızca kendi otelinin ölçümlerini sayar (tenant izolasyonu)', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurements: [
        measurementRow(),
        measurementRow({ id: 'm2', hotel_id: 'hotel-B', is_active: true }),
      ],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.measurements_count).toBe(1);
    expect(status.active_measurement?.id).toBe('m1');
  });

  it('kaldırılmış bağlantıyı aktif bağlantı gibi göstermez', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      carbon_provider_links: [
        {
          id: 'l1',
          hotel_id: 'hotel-A',
          provider: 'threepmetrics',
          environment: 'sandbox',
          status: 'revoked',
          external_property_id: 'prop-1',
          external_property_name: 'Otel A',
          linked_at: null,
          revoked_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
    expect(status.link).toBeNull();
  });

  it('sağlayıcı ölçümü yoksa mevcut hesap kaynağını bildirir', async () => {
    const { service } = makeService({
      hotels: [
        hotelRow({
          widget_settings: { carbon_pricing: { provider: 'hotel-input-demo' } },
        }),
      ],
      carbon_provider_links: [],
      carbon_measurements: [],
    });
    const status = await service.getStatus('hotel-A');
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

  it('migration uygulanmadıysa 500 üretmez, schema_ready:false döner', async () => {
    // Karbon tabloları YOK (42P01), `hotels` var: panel iki durumu ayırt edebilsin.
    const undefinedTable = { data: null, error: { code: '42P01' } };
    const builder = (table: string) => {
      const result =
        table === 'hotels'
          ? { data: { widget_settings: null }, error: null }
          : undefinedTable;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        limit: () => chain,
        single: () => Promise.resolve(result),
        then: (onfulfilled: (v: unknown) => unknown) =>
          Promise.resolve(result).then(onfulfilled),
      };
      return chain;
    };
    const service = new CarbonMeasurementService(
      { db: { from: builder } } as never,
      registryWith(new ThreePMetricsNotConfiguredAdapter()),
      fakeConfig(),
    );
    const status = await service.getStatus('hotel-A');
    expect(status.schema_ready).toBe(false);
    expect(status.active_source).toBe('none');
  });
});

describe('CarbonMeasurementService.startMeasurement', () => {
  const validPeriod = { period_start: '2025-01-01', period_end: '2025-12-31' };

  it('sağlayıcı hazır olmasa bile GEÇERSİZ dönemi reddeder', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.startMeasurement('hotel-A', {
        period_start: '2025-13-01',
        period_end: '2025-12-31',
      }),
    ).rejects.toThrow('Geçerli bir ölçüm dönemi girin.');
  });

  it('gelecek tarihli dönemi reddeder', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.startMeasurement('hotel-A', {
        period_start: '2099-01-01',
        period_end: '2099-12-31',
      }),
    ).rejects.toThrow('gelecek tarih');
  });

  it('366 günden uzun dönemi reddeder', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.startMeasurement('hotel-A', {
        period_start: '2023-01-01',
        period_end: '2024-12-31',
      }),
    ).rejects.toThrow('366');
  });

  it('panel dışı bir dönüş adresini reddeder (açık redirect önlemi)', async () => {
    const { service } = makeService(
      { hotels: [hotelRow()] },
      new FakeConfiguredAdapter(),
    );
    await expect(
      service.startMeasurement('hotel-A', {
        ...validPeriod,
        return_path: '//evil.example.com',
      }),
    ).rejects.toThrow('panel içi bir yol');
  });

  it('panel adresi yapılandırılmadıysa oturum açmaz', async () => {
    const { service } = makeService(
      { hotels: [hotelRow()] },
      new FakeConfiguredAdapter(),
      { get: () => undefined } as never,
    );
    await expect(
      service.startMeasurement('hotel-A', validPeriod),
    ).rejects.toThrow('PANEL_BASE_URL');
  });

  it('sağlayıcı yapılandırılmadıysa 503 döner ve HİÇBİR satır yazmaz', async () => {
    const dataset: FakeDataset = {
      hotels: [hotelRow()],
      carbon_measurement_sessions: [],
    };
    const { service } = makeService(dataset);
    await expect(
      service.startMeasurement('hotel-A', validPeriod),
    ).rejects.toMatchObject({ status: 503 });
    expect(dataset.carbon_measurement_sessions).toHaveLength(0);
  });

  it('sağlayıcı hazır olduğunda oturumu yazar ve form adresini döner', async () => {
    const adapter = new FakeConfiguredAdapter();
    const dataset: FakeDataset = {
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurement_sessions: [],
    };
    const { service } = makeService(dataset, adapter);

    const result = await service.startMeasurement('hotel-A', validPeriod);

    expect(result.form_url).toBe('https://forms.example.com/m/abc');
    expect(result.measurement_ref).toMatch(/^[0-9a-f-]{36}$/);
    // Dönüş adresi panel origin'inden türetilir, istekten alınmaz.
    expect(adapter.sessionRequests[0].returnUrl).toBe(`${PANEL}/ayarlar`);
    // Ölçüm kimliği sağlayıcıya iletilir — webhook'u otele bağlamanın tek yolu.
    expect(adapter.sessionRequests[0].measurementRef).toBe(
      result.measurement_ref,
    );

    const session = dataset.carbon_measurement_sessions![0];
    expect(session.status).toBe('opened');
    expect(session.hotel_id).toBe('hotel-A');
    expect(session.return_url).toBe(`${PANEL}/ayarlar`);
  });

  it('süresiz/eksik sağlayıcı yanıtını kabul etmez', async () => {
    const adapter = new FakeConfiguredAdapter({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const dataset: FakeDataset = {
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurement_sessions: [],
    };
    const { service } = makeService(dataset, adapter);
    await expect(
      service.startMeasurement('hotel-A', validPeriod),
    ).rejects.toMatchObject({ status: 502 });
    // Oturum silinmez, 'failed' işaretlenir (denetim izi).
    expect(dataset.carbon_measurement_sessions![0].status).toBe('failed');
  });

  it('http form adresini reddeder', async () => {
    const adapter = new FakeConfiguredAdapter({
      formUrl: 'http://forms.example.com/m/abc',
    });
    const dataset: FakeDataset = {
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurement_sessions: [],
    };
    const { service } = makeService(dataset, adapter);
    await expect(
      service.startMeasurement('hotel-A', validPeriod),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('sağlayıcı hatasının iç mesajını kullanıcıya sızdırmaz', async () => {
    const adapter = new FakeConfiguredAdapter(
      {},
      new Error('upstream token abc123 expired'),
    );
    const dataset: FakeDataset = {
      hotels: [hotelRow()],
      carbon_provider_links: [],
      carbon_measurement_sessions: [],
    };
    const { service } = makeService(dataset, adapter);
    let failure: { status: number; response: { message: string } } | null =
      null;
    try {
      await service.startMeasurement('hotel-A', validPeriod);
    } catch (thrown) {
      failure = thrown as { status: number; response: { message: string } };
    }
    expect(failure).not.toBeNull();
    expect(failure!.status).toBe(502);
    expect(failure!.response.message).not.toContain('abc123');
    expect(failure!.response.message).toContain('ulaşılamadı');
  });

  it('bilinmeyen sağlayıcı 404 döner', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.startMeasurement('hotel-A', validPeriod, 'other' as never),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('CarbonMeasurementService.listProviderProperties', () => {
  it('sağlayıcı yapılandırılmadıysa 503 döner', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(
      service.listProviderProperties('hotel-A'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('yetkilendirme yoksa tesis listelemez', async () => {
    const { service } = makeService(
      { hotels: [hotelRow()], carbon_provider_links: [] },
      new FakeConfiguredAdapter(),
    );
    await expect(service.listProviderProperties('hotel-A')).rejects.toThrow(
      'erişim izni',
    );
  });

  it('yetkilendirme varsa tesisleri döner', async () => {
    const { service } = makeService(
      {
        hotels: [hotelRow()],
        carbon_provider_links: [
          {
            id: 'l1',
            hotel_id: 'hotel-A',
            provider: 'threepmetrics',
            environment: 'sandbox',
            status: 'active',
            external_property_id: 'prop-1',
            external_property_name: null,
            authorization_ref: 'HOTEL_A_3PM',
            linked_at: null,
            revoked_at: null,
          },
        ],
      },
      new FakeConfiguredAdapter(),
    );
    const properties = await service.listProviderProperties('hotel-A');
    expect(properties.map((p) => p.externalPropertyId)).toEqual([
      'prop-1',
      'prop-2',
    ]);
  });
});

describe('CarbonMeasurementService.revokeLink', () => {
  const link = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    hotel_id: 'hotel-A',
    provider: 'threepmetrics',
    environment: 'sandbox',
    status: 'active',
    external_property_id: 'prop-1',
    revoked_at: null,
    ...over,
  });

  it('bağlantıyı kaldırır ve satırı silmez', async () => {
    const dataset: FakeDataset = { carbon_provider_links: [link()] };
    const { service } = makeService(dataset);
    const result = await service.revokeLink(
      'hotel-A',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.status).toBe('revoked');
    expect(dataset.carbon_provider_links).toHaveLength(1);
    expect(dataset.carbon_provider_links![0].revoked_at).toBeTruthy();
  });

  it('başka otelin bağlantısını kaldırmaz (tenant izolasyonu)', async () => {
    const dataset: FakeDataset = {
      carbon_provider_links: [link({ hotel_id: 'hotel-B' })],
    };
    const { service } = makeService(dataset);
    await expect(
      service.revokeLink('hotel-A', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ status: 404 });
    expect(dataset.carbon_provider_links![0].status).toBe('active');
  });

  it('geçersiz kimliği reddeder', async () => {
    const { service } = makeService({ carbon_provider_links: [] });
    await expect(service.revokeLink('hotel-A', 'not-a-uuid')).rejects.toThrow(
      'geçersiz',
    );
  });
});

describe('ThreePMetricsNotConfiguredAdapter', () => {
  const adapter = new ThreePMetricsNotConfiguredAdapter();

  it('yapılandırılmamış olarak kayıtlıdır', () => {
    expect(adapter.provider).toBe('threepmetrics');
    expect(adapter.configured).toBe(false);
  });

  it('her çağrıda açık bir hata verir — sessizce yanlış veri ÜRETMEZ', async () => {
    await expect(adapter.getResult('x')).rejects.toBeInstanceOf(
      CarbonProviderNotConfiguredError,
    );
    await expect(adapter.getFormData('x')).rejects.toBeInstanceOf(
      CarbonProviderNotConfiguredError,
    );
    await expect(
      adapter.listMeasurements({ externalPropertyId: 'x' }),
    ).rejects.toBeInstanceOf(CarbonProviderNotConfiguredError);
    expect(() => adapter.parseWebhookEvent(Buffer.from('{}'))).toThrow(
      CarbonProviderNotConfiguredError,
    );
    expect(() =>
      adapter.verifyWebhookSignature({
        rawBody: Buffer.from('{}'),
        headers: {},
        secret: 's',
      }),
    ).toThrow(CarbonProviderNotConfiguredError);
  });
});

describe('CarbonProviderRegistryService', () => {
  const registry = new CarbonProviderRegistryService();

  it('yalnızca kayıtlı sağlayıcıyı çözer', () => {
    expect(registry.resolve('threepmetrics')?.provider).toBe('threepmetrics');
    expect(registry.resolve('synxis')).toBeUndefined();
    expect(registry.resolve('unknown')).toBeUndefined();
  });

  it('sağlayıcı durumlarını dürüstçe listeler', () => {
    expect(registry.statuses()).toEqual([
      { provider: 'threepmetrics', configured: false },
    ]);
  });
});
