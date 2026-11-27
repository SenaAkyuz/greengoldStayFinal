import {
  makeFakeSupabase,
  type FakeDataset,
} from '../../../test/fake-supabase';
import { CarbonMeasurementService } from '../carbon-measurement.service';
import { CarbonProviderRegistryService } from '../carbon-provider-registry';
import type { CarbonCredentialResolver } from '../carbon-credentials';
import type {
  ApprovedRecord,
  ConnectHubItem,
  FactorPackage,
  RecordInput,
  WriteRecordsResponse,
} from './connecthub.client';
import { ConnectHubError } from './connecthub.client';
import { ConnectHubService, externalIdFor } from './connecthub.service';
import * as policy from '../publication-policy';
import { WidgetService } from '../../widget/widget.service';
import { DashboardService } from '../../dashboard/dashboard.service';

const UNIT = '7d4e5f6a-8b90-4e8a-9c21-3f2a9c1e5b7d';
const OTHER_UNIT = '11111111-1111-4111-8111-111111111111';
const ITEM_ELEC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_DIESEL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ITEM_YEARLY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UOM_KWH = 'a1000000-0000-4000-8000-000000000002';
const UOM_L = 'a1000000-0000-4000-8000-000000000001';
const INVENTORY = '5b7d3f2a-9c1e-4e8a-9c21-7d4e5f6a8b90';
const PERIOD = '2026-10';

const config = (env = 'sandbox') => ({
  get: (key: string) =>
    key === 'CARBON_PROVIDER_ENVIRONMENT' ? env : undefined,
});

const credentials: CarbonCredentialResolver = {
  name: 'fixed',
  supportedEnvironments: ['sandbox', 'production'],
  resolve: (ref) =>
    Promise.resolve(
      ref === 'GG_CH_WRITE'
        ? { apiKey: 'ch_live_write' }
        : ref === 'GG_CH_READ'
          ? { apiKey: 'ch_live_read' }
          : null,
    ),
  has: (ref) => Promise.resolve(ref === 'GG_CH_WRITE' || ref === 'GG_CH_READ'),
};

const items: ConnectHubItem[] = [
  {
    id: ITEM_ELEC,
    code: 'ELEK',
    name: 'Şebeke elektriği',
    resolution: 'month',
    uoms: ['kWh', 'MWh'],
    units: [UNIT, OTHER_UNIT],
  },
  {
    id: ITEM_DIESEL,
    code: 'DIZEL',
    name: 'Jeneratör dizel',
    resolution: 'month',
    uoms: ['L'],
    units: [UNIT],
  },
  {
    id: ITEM_YEARLY,
    code: 'SOGUTUCU',
    name: 'Soğutucu gaz',
    resolution: 'year',
    uoms: ['kg'],
    units: [UNIT],
  },
];

function factorPackage(): FactorPackage {
  const base = {
    kind: 'catalogue',
    shared: true,
    gwp_embedded: false,
    source_gwp_set: null,
    gases: null,
    factor_kind: null,
    includes_transmission_losses: null,
    data_year: 2026,
    publication_year: 2026,
    country_code: 'TR',
    biogenic_co2_kg_per_uom: null,
    company_declared: false,
    verification: null,
    source: null,
  };
  return {
    release: {
      schema_version: '1.0',
      release_id: '2026-abc',
      generated_at: '2026-11-18T09:00:00Z',
      content_hash: 'hash-1',
    },
    inventory: {
      id: INVENTORY,
      name: '2026',
      year: 2026,
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      gwp_set: 'AR6',
      gwp_ch4: 29.8,
      gwp_n2o: 273,
      dataset: 'defra',
      combustion_dataset: 'defra',
      default_country_code: 'TR',
      scope2_method: 'location_based',
    },
    items: [
      {
        id: ITEM_ELEC,
        code: 'ELEK',
        name: 'Şebeke elektriği',
        scope: 2,
        uoms: [{ id: UOM_KWH, code: 'kWh', name: 'kWh' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_KWH,
            factor_id: 'elec',
            error: null,
            warnings: [],
          },
          {
            unit_ids: [OTHER_UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_KWH,
            factor_id: 'elec-other',
            error: null,
            warnings: [],
          },
        ],
      },
      {
        id: ITEM_DIESEL,
        code: 'DIZEL',
        name: 'Jeneratör dizel',
        scope: 1,
        uoms: [{ id: UOM_L, code: 'L', name: 'Litre' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_L,
            factor_id: 'diesel',
            error: null,
            warnings: [],
          },
        ],
      },
    ],
    factors: [
      {
        ...base,
        id: 'elec',
        name: 'Electricity TR',
        kg_co2e_per_uom: 0.442,
        uom_id: UOM_KWH,
        uom_code: 'kWh',
        uom_name: 'kWh',
      },
      {
        ...base,
        id: 'elec-other',
        name: 'Other',
        kg_co2e_per_uom: 9,
        uom_id: UOM_KWH,
        uom_code: 'kWh',
        uom_name: 'kWh',
      },
      {
        ...base,
        id: 'diesel',
        name: 'Diesel',
        kg_co2e_per_uom: 2.66155,
        uom_id: UOM_L,
        uom_code: 'L',
        uom_name: 'Litre',
        gwp_embedded: true,
      },
    ],
    notices: [{ code: 'INTERNAL_USE', message: 'İç kullanım' }],
  };
}

/** Bellek-içi 3pmetrics: yazılanlar `pending_approval`, `approve()` ile onaylanır. */
class FakeConnectHub {
  configured = true;
  written: RecordInput[][] = [];
  store = new Map<string, ApprovedRecord & { approved: boolean }>();
  packages = [{ id: INVENTORY, name: '2026', year: 2026, content_hash: 'h' }];
  writeFailure: ConnectHubError | null = null;
  extraApproved: ApprovedRecord[] = [];
  /** Testin faktör paketini değiştirmesi için. */
  mutatePackage: ((pkg: FactorPackage) => void) | null = null;

  listItems(): Promise<ConnectHubItem[]> {
    return Promise.resolve(items);
  }
  writeRecords(
    _key: string,
    records: RecordInput[],
  ): Promise<WriteRecordsResponse> {
    this.written.push(records);
    if (this.writeFailure) return Promise.reject(this.writeFailure);
    for (const r of records) {
      const prev = this.store.get(r.external_id);
      this.store.set(r.external_id, {
        record_id:
          prev?.record_id ??
          `0000000${this.store.size}-0000-4000-8000-000000000000`,
        item: r.item,
        unit: r.unit,
        period: r.period,
        quantity: r.quantity,
        uom: r.uom,
        description: null,
        source: 'API · greengold',
        external_id: r.external_id,
        approved: false,
      });
    }
    return Promise.resolve({
      written: records.length,
      rejected: 0,
      results: records.map((r) => ({
        external_id: r.external_id,
        status: 'pending_approval',
        record_id: this.store.get(r.external_id)!.record_id,
        error: null,
        warnings: [],
      })),
    });
  }
  approveAll() {
    for (const r of this.store.values()) r.approved = true;
  }
  readApprovedRecords(
    _key: string,
    filter: { unit: string },
  ): Promise<ApprovedRecord[]> {
    const approved = [...this.store.values()]
      .filter((r) => r.approved && r.unit === filter.unit)
      .map(({ approved: _a, ...rest }) => rest);
    return Promise.resolve([
      ...approved,
      ...this.extraApproved.filter((r) => r.unit === filter.unit),
    ]);
  }
  listFactorPackages() {
    return Promise.resolve(this.packages);
  }
  getFactorPackage() {
    const pkg = factorPackage();
    this.mutatePackage?.(pkg);
    return Promise.resolve({
      notModified: false as const,
      etag: '"hash-1"',
      pkg,
    });
  }
}

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'link-ch',
  hotel_id: 'hotel-A',
  provider: 'threepmetrics',
  api: 'connecthub',
  environment: 'sandbox',
  external_property_id: UNIT,
  external_property_name: 'Test Otel',
  authorization_ref: 'GG_CH_WRITE',
  read_authorization_ref: 'GG_CH_READ',
  factor_inventory_id: null,
  status: 'active',
  linked_at: '2026-11-24T10:00:00Z',
  ...over,
});

const profileRow = {
  hotel_id: 'hotel-A',
  country: 'Turkey',
  rooms: 100,
  total_area_m2: 10_000,
  guestrooms_area_m2: 6_000,
  meeting_area_m2: 0,
  updated_at: '2026-11-24T10:00:00Z',
};

function setup(
  data: FakeDataset = {},
  opts: { uniqueBy?: Record<string, string[]> } = {},
) {
  const fake = makeFakeSupabase(
    {
      hotels: [{ id: 'hotel-A', default_currency: 'EUR', widget_settings: {} }],
      carbon_provider_links: [linkRow()],
      carbon_facility_profiles: [profileRow],
      carbon_periods: [],
      carbon_activity_records: [],
      carbon_measurements: [],
      ...data,
    },
    {
      uniqueBy: opts.uniqueBy,
      rpc: {
        activate_carbon_measurement: () =>
          Promise.resolve({
            data: null,
            error: { message: 'nf', code: 'PGRST202' } as never,
          }),
      },
    },
  );
  const cfg = config();
  const measurement = new CarbonMeasurementService(
    fake as never,
    new CarbonProviderRegistryService(cfg as never),
    cfg as never,
  );
  measurement.credentials = credentials;
  const service = new ConnectHubService(
    fake as never,
    cfg as never,
    measurement,
  );
  const hub = new FakeConnectHub();
  service.client = hub as never;
  return { fake, service, hub, measurement };
}

describe('ConnectHubService', () => {
  it('durum: bağlı birim, iki anahtar ve profil görünür', async () => {
    const { service } = setup();
    const status = await service.getStatus('hotel-A');
    expect(status).toMatchObject({
      schema_ready: true,
      link: { unit_id: UNIT, unit_name: 'Test Otel' },
      write_key_ready: true,
      read_key_ready: true,
      profile: { rooms: 100 },
    });
  });

  it('başlıklar yalnızca bu otelin birimine açık olanlar; aylık olmayan işaretlenir', async () => {
    const { service } = setup();
    const list = await service.listItems('hotel-A');
    expect(list.map((i) => [i.id, i.monthly])).toEqual([
      [ITEM_ELEC, true],
      [ITEM_DIESEL, true],
      [ITEM_YEARLY, false],
    ]);
  });

  it('kayıtları deterministik external_id ile yazar; düzeltme aynı kaydı günceller', async () => {
    const { service, hub, fake } = setup();
    const first = await service.submitPeriod('hotel-A', 'user-1', PERIOD, {
      occupied_room_nights: 2000,
      lines: [{ item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' }],
    });
    expect(first.accepted).toBe(1);
    expect(hub.written[0][0]).toMatchObject({
      unit: UNIT,
      period: PERIOD,
      external_id: externalIdFor(UNIT, ITEM_ELEC, PERIOD),
    });

    await service.submitPeriod('hotel-A', 'user-1', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 98_000, uom: 'kWh' }],
    });
    expect(hub.written[1][0].external_id).toBe(hub.written[0][0].external_id);
    expect(hub.store.size).toBe(1);
    const rows = fake.dataset.carbon_activity_records!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      quantity: 98_000,
      status: 'accepted',
      provider_status: 'pending_approval',
    });
  });

  it('birime açık olmayan, aylık olmayan veya yanlış birimli satırı göndermez', async () => {
    const { service, hub } = setup();
    await expect(
      service.submitPeriod('hotel-A', 'u', PERIOD, {
        lines: [{ item_id: ITEM_YEARLY, quantity: 3, uom: 'kg' }],
      }),
    ).rejects.toThrow('aylık değil');
    await expect(
      service.submitPeriod('hotel-A', 'u', PERIOD, {
        lines: [{ item_id: ITEM_ELEC, quantity: 3, uom: 'm3' }],
      }),
    ).rejects.toThrow('ölçü birimi');
    expect(hub.written).toHaveLength(0);
  });

  it('bağlantı koparsa satır outcome_unknown olur; tekrar göndermek aynı kaydı yazar', async () => {
    const { service, hub, fake } = setup();
    hub.writeFailure = new ConnectHubError('outcome_unknown', 'timeout');
    const res = await service.submitPeriod('hotel-A', 'u', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 1, uom: 'kWh' }],
    });
    expect(res.outcome_unknown).toBe(1);
    expect(fake.dataset.carbon_activity_records![0].status).toBe(
      'outcome_unknown',
    );

    hub.writeFailure = null;
    const retry = await service.submitPeriod('hotel-A', 'u', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 1, uom: 'kWh' }],
    });
    expect(retry.accepted).toBe(1);
    expect(fake.dataset.carbon_activity_records).toHaveLength(1);
  });

  it('içinde bulunulan / gelecek ay gönderilemez', async () => {
    const { service } = setup();
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await expect(
      service.submitPeriod('hotel-A', 'u', current, {
        lines: [{ item_id: ITEM_ELEC, quantity: 1, uom: 'kWh' }],
      }),
    ).rejects.toThrow('tamamlanmış');
  });

  it('onay bekleyen kayıt varsa hesap YAPILMAZ', async () => {
    const { service, fake } = setup();
    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [{ item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' }],
    });
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('awaiting_approval');
    expect(fake.dataset.carbon_measurements).toHaveLength(0);
  });

  it('onaylandıktan sonra yalnızca bu birimin kayıtlarıyla hesaplar ve fiyatı üretir', async () => {
    const { service, hub, fake, measurement } = setup();
    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [
        { item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' },
        { item_id: ITEM_DIESEL, quantity: 240, uom: 'L' },
      ],
    });
    hub.approveAll();
    // Aynı şirketteki BAŞKA otelin kaydı karışmamalı.
    hub.extraApproved.push({
      record_id: '99999999-0000-4000-8000-000000000000',
      item: ITEM_ELEC,
      unit: OTHER_UNIT,
      period: PERIOD,
      quantity: 5_000_000,
      uom: 'kWh',
      description: null,
      source: 'Manual',
      external_id: null,
    });

    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('calculated');
    if (res.status !== 'calculated') return;
    const expectedKg = 100_000 * 0.442 + 240 * 2.66155; // 44 838,772
    expect(res.calculation.total_kg).toBeCloseTo(expectedKg, 6);
    expect(res.calculation.scope_totals_kg.scope_2).toBeCloseTo(44_200, 6);
    expect(res.pricing).toMatchObject({
      provider: 'threepmetrics',
      internal_use: true,
      external_account_id: UNIT,
    });
    // meeting 0 → konaklama payı %100; ÷ 2000 dolu oda-gece
    expect(res.pricing.coefficient_kg).toBeCloseTo(expectedKg / 2000, 6);
    expect(res.pricing.amount_per_night).toBeCloseTo(0.56, 2);

    const rows = fake.dataset.carbon_measurements!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      external_property_id: UNIT,
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      verification_status: 'internal_use',
      is_active: false,
    });
    expect(Number(rows[0].total_emissions)).toBeCloseTo(expectedKg / 1000, 9);

    // Aynı veri ikinci kez → yeni satır yok.
    const again = await service.calculatePeriod('hotel-A', PERIOD);
    expect(again.status === 'calculated' && again.duplicate).toBe(true);
    expect(fake.dataset.carbon_measurements).toHaveLength(1);

    // UX-3.11: sağlayıcı kaydın kimliğini yenilese (yeniden gönderim + onay)
    // ve birimi farklı yazsa da hesap aynıysa yeni sürüm AÇILMAZ.
    for (const r of hub.store.values()) {
      r.record_id = r.record_id.replace(/^0/, '9');
      if (r.uom === 'm3') r.uom = 'm³';
    }
    const resent = await service.calculatePeriod('hotel-A', PERIOD);
    expect(resent.status === 'calculated' && resent.duplicate).toBe(true);
    expect(fake.dataset.carbon_measurements).toHaveLength(1);

    // Yazılı izin (2026-11-27, Kapsam 1+2): ülkesi doğrulanmış, yalnız
    // Kapsam 1/2 içeren güncel ölçüm widget fiyatına uygulanır.
    const pricing = (
      rows[0].form_data as {
        pricing: {
          coefficient_kg: number;
          amount_per_night: number;
          coverage: { scopes_calculated: number[] };
        };
      }
    ).pricing;
    expect(pricing.coefficient_kg).toBeCloseTo(expectedKg / 2000, 6);
    expect(pricing.coverage.scopes_calculated.every((s) => s <= 2)).toBe(true);
    const uuid = '66666666-6666-4666-8666-666666666666';
    rows[0].id = uuid;
    fake.dataset.carbon_periods![0].measurement_id = uuid;
    const activated = await measurement.activateMeasurement('hotel-A', uuid);
    expect(activated.measurement_id).toBe(uuid);
    expect(rows[0].is_active).toBe(true);
    expect(
      Number(fake.dataset.hotels![0].estimated_co2_per_night_kg),
    ).toBeCloseTo(pricing.coefficient_kg, 6);
    expect(Number(fake.dataset.hotels![0].contribution_amount_per_night)).toBe(
      pricing.amount_per_night,
    );
  });

  it("3pmetrics'te düzeltme henüz onaylanmadıysa (eski değer onaylı) hesap bekler", async () => {
    const { service, hub } = setup();
    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [{ item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' }],
    });
    hub.approveAll();
    // Otel değeri düzeltir; 3pmetrics yeni değeri henüz onaylamadı.
    const ext = externalIdFor(UNIT, ITEM_ELEC, PERIOD);
    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 90_000, uom: 'kWh' }],
    });
    hub.store.get(ext)!.approved = true;
    hub.store.get(ext)!.quantity = 100_000;
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('awaiting_approval');
  });

  it('profil veya dolu oda-gece yoksa açık hata verir', async () => {
    const { service } = setup({ carbon_facility_profiles: [] });
    await expect(
      service.calculatePeriod('hotel-A', PERIOD),
    ).rejects.toMatchObject({
      response: { code: 'carbon_profile_missing' },
    });
    const second = setup();
    await expect(
      second.service.calculatePeriod('hotel-A', PERIOD),
    ).rejects.toMatchObject({ response: { code: 'carbon_occupancy_missing' } });
  });

  it('yıla ait envanter yoksa sonuç üretmez', async () => {
    const { service, hub } = setup({
      carbon_periods: [
        {
          hotel_id: 'hotel-A',
          environment: 'sandbox',
          period: PERIOD,
          occupied_room_nights: 2000,
        },
      ],
    });
    hub.packages = [];
    hub.extraApproved.push({
      record_id: '88888888-0000-4000-8000-000000000000',
      item: ITEM_ELEC,
      unit: UNIT,
      period: PERIOD,
      quantity: 1000,
      uom: 'kWh',
      description: null,
      source: 'Manual',
      external_id: null,
    });
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('blocked');
  });

  it('başka otelin bağlantısını kullanmaz (tenant izolasyonu)', async () => {
    const { service } = setup({
      carbon_provider_links: [linkRow({ hotel_id: 'hotel-B' })],
    });
    await expect(service.listItems('hotel-A')).rejects.toMatchObject({
      response: { code: 'carbon_provider_not_linked' },
    });
  });

  it('eski CCA ekranı ConnectHub bağlantısını kendi bağlantısı sanmaz', async () => {
    const { measurement } = setup();
    const status = await measurement.getStatus('hotel-A');
    expect(status.link).toBeNull();
  });
});

describe('ConnectHubService · sağlayıcıdaki onaylı kayıtlar (salt okuma)', () => {
  it('panelden, operatör aracından ve doğrudan girilmiş onaylı kayıtları kaynağıyla döner; hiçbir şey yazmaz', async () => {
    const { service, hub, fake } = setup();
    await service.submitPeriod('hotel-A', 'user-1', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 1000, uom: 'kWh' }],
    });
    hub.approveAll();
    hub.extraApproved.push(
      {
        record_id: 'r-cli',
        item: ITEM_DIESEL,
        unit: UNIT,
        period: PERIOD,
        quantity: 500,
        uom: 'L',
        description: null,
        source: 'API',
        external_id: externalIdFor(UNIT, ITEM_DIESEL, PERIOD),
      },
      {
        record_id: 'r-manual',
        item: ITEM_DIESEL,
        unit: UNIT,
        period: '2026-10-14',
        quantity: 20,
        uom: 'L',
        description: null,
        source: 'Manual',
        external_id: null,
      },
      {
        record_id: 'r-other-month',
        item: ITEM_ELEC,
        unit: UNIT,
        period: '2026-09',
        quantity: 9,
        uom: 'kWh',
        description: null,
        source: 'API',
        external_id: null,
      },
      {
        record_id: 'r-other-unit',
        item: ITEM_ELEC,
        unit: 'other-unit',
        period: PERIOD,
        quantity: 7,
        uom: 'kWh',
        description: null,
        source: 'API',
        external_id: null,
      },
    );
    const writes = hub.written.length;
    const before = JSON.stringify(fake.dataset);
    const res = await service.getProviderRecords('hotel-A', PERIOD);
    expect(hub.written.length).toBe(writes);
    expect(JSON.stringify(fake.dataset)).toBe(before);
    expect(res.records.map((r) => [r.item_id, r.quantity, r.origin])).toEqual(
      expect.arrayContaining([
        [ITEM_ELEC, 1000, 'panel'],
        [ITEM_DIESEL, 500, 'green_gold'],
        [ITEM_DIESEL, 20, 'provider'],
      ]),
    );
    expect(res.records).toHaveLength(3);
    // Yanıtta sağlayıcı kayıt kimliği, dış kimlik veya anahtar yok.
    const json = JSON.stringify(res);
    expect(json).not.toContain('r-cli');
    expect(json).not.toContain('gg:');
  });

  it('başka otel bağlantısız → 503 not_linked; geçersiz dönem → 400', async () => {
    const { service } = setup();
    await expect(
      service.getProviderRecords('hotel-B', PERIOD),
    ).rejects.toMatchObject({
      response: { code: 'carbon_provider_not_linked' },
    });
    await expect(
      service.getProviderRecords('hotel-A', '2026-13'),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('ConnectHubService · faktör ülkesi ve yayın izni', () => {
  const FALLBACK = ['FACTOR_COUNTRY_FALLBACK', 'FACTOR_YEAR_FALLBACK'];

  /** Elektrik faktörünü verilen ülkeye çevirir, isteğe bağlı geri düşme uyarısı ekler. */
  const elecFactor =
    (country: string | null, warnings: string[]) => (pkg: FactorPackage) => {
      pkg.factors.find((f) => f.id === 'elec')!.country_code = country;
      pkg.items
        .find((i) => i.id === ITEM_ELEC)!
        .mappings.forEach((m) => (m.warnings = warnings));
    };

  async function approvedElecPeriod(
    profile: Record<string, unknown> = profileRow,
  ) {
    const ctx = setup({ carbon_facility_profiles: [profile] });
    await ctx.service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [{ item_id: ITEM_ELEC, quantity: 1000, uom: 'kWh' }],
    });
    ctx.hub.approveAll();
    return ctx;
  }

  it('faktör ülkesi doğrulanamazsa sonuç önizlenir ama ölçüm KAYDEDİLMEZ (widget yayını yok)', async () => {
    const { service, hub, fake } = await approvedElecPeriod();
    hub.mutatePackage = elecFactor('AE', FALLBACK);
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('preview_only');
    if (res.status !== 'preview_only') return;
    expect(res.calculation.total_kg).toBeCloseTo(442, 6);
    expect(res.country_check).toMatchObject({
      hotel_country_status: 'missing',
      publishable: false,
    });
    expect(res.country_check.lines[0].status).toBe('country_unverified');
    expect(res.pricing.coefficient_kg).toBeCloseTo(442 / 2000, 9);
    expect(res.reason).toContain('widget');
    expect(fake.dataset.carbon_measurements).toHaveLength(0);
    const period = fake.dataset.carbon_periods!.find(
      (p) => p.period === PERIOD,
    );
    expect(period?.measurement_id ?? null).toBeNull();
  });

  it('tesis profili TR ve faktör TR ise 3pmetrics geri düşme uyarısına rağmen hesap yayınlanabilir', async () => {
    const { service, hub, fake } = await approvedElecPeriod({
      ...profileRow,
      country_code: 'TR',
    });
    hub.mutatePackage = elecFactor('TR', FALLBACK);
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('calculated');
    if (res.status !== 'calculated') return;
    expect(res.country_check.lines[0].status).toBe('country_match');
    expect(res.pricing).toMatchObject({
      country_check: { hotel_country_code: 'TR', publishable: true },
    });
    expect(fake.dataset.carbon_measurements).toHaveLength(1);
  });

  it('tesis TR, faktör AE → yalnız önizleme (yanlış ülke faktörü yayınlanmaz)', async () => {
    const { service, hub, fake } = await approvedElecPeriod({
      ...profileRow,
      country_code: 'TR',
    });
    hub.mutatePackage = elecFactor('AE', FALLBACK);
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('preview_only');
    if (res.status !== 'preview_only') return;
    expect(res.country_check.lines[0].status).toBe('country_mismatch');
    expect(fake.dataset.carbon_measurements).toHaveLength(0);
  });

  it('hesap kapsamı fiyat açıklamasında açıkça yazılır', async () => {
    const { service, hub } = await approvedElecPeriod();
    hub.mutatePackage = (pkg) =>
      pkg.notices.push({ code: 'DERIVED_ROWS_NOT_INCLUDED', message: 'WTT' });
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('calculated');
    if (res.status !== 'calculated') return;
    expect(res.calculation.coverage.wtt_scope3_cat3).toBe('not_in_package');
    expect(String(res.pricing.scope)).toContain('Kapsam 2');
    expect(String(res.pricing.scope)).toContain('WTT');
  });

  it("DataHub'a elle girilmiş seçenekli (yakıt) kayıt hesabı durdurur, tahminle hesaplanmaz", async () => {
    const { service, hub, fake } = await approvedElecPeriod();
    const VEHICLES = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    hub.mutatePackage = (pkg) => {
      pkg.items.push({
        id: VEHICLES,
        code: 'vehicles-by-fuel',
        name: 'Operasyonel Araçlar',
        scope: 1,
        uoms: [{ id: UOM_L, code: 'L', name: 'Litre' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: null,
            uom_id: null,
            factor_id: null,
            error: { code: 'FACTOR_NOT_AVAILABLE', reason: 'OPTION_REQUIRED' },
            warnings: [],
          },
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: 'diesel',
            uom_id: UOM_L,
            factor_id: 'diesel',
            error: null,
            warnings: [],
          },
        ],
      });
    };
    hub.extraApproved.push({
      record_id: '88888888-0000-4000-8000-000000000000',
      item: VEHICLES,
      unit: UNIT,
      period: '2026-10-14',
      quantity: 40,
      uom: 'L',
      description: null,
      source: 'Manual',
      external_id: null,
    });
    const res = await service.calculatePeriod('hotel-A', PERIOD);
    expect(res.status).toBe('blocked');
    if (res.status !== 'blocked') return;
    expect(res.calculation?.blocking.map((b) => b.code)).toEqual([
      'OPTION_REQUIRED',
    ]);
    expect(fake.dataset.carbon_measurements).toHaveLength(0);
  });

  it('tesis profili ülke kodunu normalize ederek kaydeder; geçersiz kodu reddeder', async () => {
    const { service, fake } = setup({ carbon_facility_profiles: [] });
    const dto = {
      country: 'Türkiye',
      rooms: 100,
      total_area_m2: 10_000,
      guestrooms_area_m2: 6_000,
      meeting_area_m2: 500,
    };
    const saved = await service.saveProfile('hotel-A', 'u', {
      ...dto,
      country_code: 'tr',
    });
    expect(saved.country_code).toBe('TR');
    expect(fake.dataset.carbon_facility_profiles![0].country_code).toBe('TR');

    await expect(
      service.saveProfile('hotel-A', 'u', { ...dto, country_code: 'XX' }),
    ).rejects.toMatchObject({
      response: { code: 'carbon_country_code_invalid' },
    });
  });

  it('ülke kodu verilmeden profil güncellenirse mevcut kod korunur', async () => {
    const { service } = setup({
      carbon_facility_profiles: [{ ...profileRow, country_code: 'TR' }],
    });
    const saved = await service.saveProfile('hotel-A', 'u', {
      country: 'Türkiye',
      rooms: 120,
      total_area_m2: 10_000,
      guestrooms_area_m2: 6_000,
      meeting_area_m2: 0,
    });
    expect(saved.rooms).toBe(120);
    expect(saved.country_code).toBe('TR');
  });
});

describe('ConnectHubService · başlık zenginleştirme (B)', () => {
  it('mevcut alanlar korunur; faktör durumu ve yazılabilirlik eklenir', async () => {
    const { service } = setup();
    const items = await service.listItems('hotel-A', 2026);
    const elec = items.find((i) => i.id === ITEM_ELEC)!;
    expect(elec).toMatchObject({
      code: 'ELEK',
      resolution: 'month',
      monthly: true,
      resolution_kind: 'monthly',
      scope: 2,
      factor_status: 'available',
      writable: true,
      blocked_reason: null,
    });
    expect(items.find((i) => i.id === ITEM_YEARLY)).toMatchObject({
      resolution_kind: 'yearly',
      writable: false,
      blocked_reason: 'not_monthly',
    });
  });

  it('seçenekli başlık → option_required, yazılamaz', async () => {
    const { service, hub } = setup();
    hub.mutatePackage = (pkg) => {
      pkg.items
        .find((i) => i.id === ITEM_DIESEL)!
        .mappings.push({
          unit_ids: [UNIT],
          year: 2026,
          option_value: 'diesel',
          uom_id: UOM_L,
          factor_id: 'diesel',
          error: null,
          warnings: [],
        });
    };
    const diesel = (await service.listItems('hotel-A', 2026)).find(
      (i) => i.id === ITEM_DIESEL,
    )!;
    expect(diesel).toMatchObject({
      factor_status: 'option_required',
      writable: false,
      blocked_reason: 'option_required',
    });
  });

  it('pakette olmayan aylık başlık → no_factor', async () => {
    const { service, hub } = setup();
    hub.mutatePackage = (pkg) => {
      pkg.items = pkg.items.filter((i) => i.id !== ITEM_DIESEL);
    };
    const diesel = (await service.listItems('hotel-A', 2026)).find(
      (i) => i.id === ITEM_DIESEL,
    )!;
    expect(diesel).toMatchObject({
      factor_status: 'not_available',
      blocked_reason: 'no_factor',
      writable: false,
    });
  });

  it('sağlayıcı faktörü paylaşamıyorsa (SOURCE_NOT_REDISTRIBUTABLE) veri girişi AÇIK; gerekçe döner', async () => {
    const { service, hub } = setup();
    hub.mutatePackage = (pkg) => {
      for (const m of pkg.items.find((i) => i.id === ITEM_ELEC)!.mappings) {
        m.error = {
          code: 'FACTOR_NOT_AVAILABLE',
          reason: 'SOURCE_NOT_REDISTRIBUTABLE',
        };
        m.factor_id = null;
      }
    };
    const elec = (await service.listItems('hotel-A', 2026)).find(
      (i) => i.id === ITEM_ELEC,
    )!;
    expect(elec).toMatchObject({
      factor_status: 'factor_unavailable',
      factor_reason: 'SOURCE_NOT_REDISTRIBUTABLE',
      blocked_reason: null,
      writable: true,
    });
  });

  it('faktör paketi okunamazsa uç hata vermez; durum unknown, veri girişi açık kalır', async () => {
    const { service, hub } = setup();
    hub.getFactorPackage = () =>
      Promise.reject(new ConnectHubError('unavailable', 'kapalı'));
    const elec = (await service.listItems('hotel-A', 2026)).find(
      (i) => i.id === ITEM_ELEC,
    )!;
    expect(elec).toMatchObject({
      factor_status: 'unknown',
      scope: null,
      writable: true,
      blocked_reason: null,
    });
  });

  it('okuma anahtarı yoksa (yalnız yazma) durum unknown', async () => {
    const { service } = setup({
      carbon_provider_links: [linkRow({ read_authorization_ref: null })],
    });
    const elec = (await service.listItems('hotel-A', 2026)).find(
      (i) => i.id === ITEM_ELEC,
    )!;
    expect(elec.factor_status).toBe('unknown');
  });

  it('geçersiz yıl reddedilir', async () => {
    const { service } = setup();
    await expect(service.listItems('hotel-A', 1990)).rejects.toThrow(
      '2000–2100',
    );
  });
});

describe('ConnectHubService · dönem listesi (B)', () => {
  const MID = '77777777-7777-4777-8777-777777777777';
  const data = () => ({
    carbon_periods: [
      {
        hotel_id: 'hotel-A',
        environment: 'sandbox',
        period: '2025-03',
        occupied_room_nights: 2000,
        measurement_id: MID,
      },
      {
        hotel_id: 'hotel-A',
        environment: 'sandbox',
        period: '2025-05',
        occupied_room_nights: 1500,
        measurement_id: null,
      },
      // Başka otel ve başka ortam karışmamalı:
      {
        hotel_id: 'hotel-B',
        environment: 'sandbox',
        period: '2025-06',
        occupied_room_nights: 99,
        measurement_id: null,
      },
      {
        hotel_id: 'hotel-A',
        environment: 'production',
        period: '2025-07',
        occupied_room_nights: 99,
        measurement_id: null,
      },
    ],
    carbon_activity_records: [
      {
        id: 'r1',
        hotel_id: 'hotel-A',
        environment: 'sandbox',
        period: '2025-04',
        status: 'accepted',
      },
      {
        id: 'r2',
        hotel_id: 'hotel-A',
        environment: 'sandbox',
        period: '2025-04',
        status: 'outcome_unknown',
      },
      {
        id: 'r3',
        hotel_id: 'hotel-B',
        environment: 'sandbox',
        period: '2025-08',
        status: 'accepted',
      },
    ],
    carbon_measurements: [
      {
        id: MID,
        hotel_id: 'hotel-A',
        provider: 'threepmetrics',
        is_active: true,
        total_emissions: 1.503,
      },
    ],
  });

  it('12 ay; durumlar yalnız bu otelin yerel verilerinden', async () => {
    const { service } = setup(data());
    const res = await service.listPeriods('hotel-A', 2025);
    expect(res.schema_ready).toBe(true);
    expect(res.periods).toHaveLength(12);
    const by = Object.fromEntries(res.periods.map((p) => [p.period, p]));
    expect(by['2025-03']).toMatchObject({
      status: 'published',
      occupied_room_nights: 2000,
      measurement: { id: MID, is_active: true, total_tonnes: 1.503 },
    });
    expect(by['2025-04']).toMatchObject({
      status: 'submitted',
      needs_attention: true,
      records: { accepted: 1, outcome_unknown: 1, rejected: 0, sending: 0 },
    });
    expect(by['2025-05'].status).toBe('draft');
    expect(by['2025-06'].status).toBe('empty'); // hotel-B verisi sayılmadı
    expect(by['2025-07'].status).toBe('empty'); // başka ortam sayılmadı
    expect(by['2025-08'].status).toBe('empty'); // hotel-B kaydı sayılmadı
  });

  it('gelecek yıl tümüyle "future"; sağlayıcıya istek atılmaz', async () => {
    const { service, hub } = setup();
    hub.listItems = () => Promise.reject(new Error('çağrılmamalı'));
    const res = await service.listPeriods('hotel-A', 2099);
    expect(res.periods.every((p) => p.status === 'future')).toBe(true);
  });

  it('geçersiz yıl reddedilir', async () => {
    const { service } = setup();
    await expect(service.listPeriods('hotel-A', 1999)).rejects.toThrow(
      '2000–2100',
    );
  });
});

describe('ConnectHubService · kaydedilmiş ölçüm ve yeniden hesap', () => {
  async function approvedPeriod(
    opts: { uniqueBy?: Record<string, string[]> } = {},
  ) {
    const ctx = setup({}, opts);
    await ctx.service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [
        { item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' },
        { item_id: ITEM_DIESEL, quantity: 240, uom: 'L' },
      ],
    });
    ctx.hub.approveAll();
    return ctx;
  }

  it('hesap yoksa kaydedilmiş ölçüm boş döner; sağlayıcıya istek atılmaz', async () => {
    const { service, hub } = setup();
    const read = jest.spyOn(hub, 'readApprovedRecords');
    const pkg = jest.spyOn(hub, 'getFactorPackage');
    await expect(
      service.getPeriodMeasurement('hotel-A', PERIOD),
    ).resolves.toEqual({ period: PERIOD, measurement: null });
    expect(read).not.toHaveBeenCalled();
    expect(pkg).not.toHaveBeenCalled();
  });

  it('kaydedilmiş hesabı yeniden hesaplamadan okur (sayfa yenilense de kaybolmaz)', async () => {
    const { service, hub, fake } = await approvedPeriod();
    const calc = await service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('calculated');
    if (calc.status !== 'calculated') return;

    const read = jest.spyOn(hub, 'readApprovedRecords');
    const pkg = jest.spyOn(hub, 'getFactorPackage');
    const before = JSON.stringify(fake.dataset);
    const saved = await service.getPeriodMeasurement('hotel-A', PERIOD);
    expect(read).not.toHaveBeenCalled();
    expect(pkg).not.toHaveBeenCalled();
    // Salt okuma: veritabanında hiçbir şey değişmez.
    expect(JSON.stringify(fake.dataset)).toBe(before);

    expect(saved.measurement).toMatchObject({
      id: calc.measurement_id,
      status: 'calculated',
      is_active: false,
      changes: [],
      // Yazılı izin + ülke doğrulandı + yalnız Kapsam 1/2 → engel yok.
      publication_block: null,
    });
    expect(saved.measurement!.calculation.total_kg).toBeCloseTo(
      calc.calculation.total_kg,
      9,
    );
    expect(saved.measurement!.pricing).toEqual(calc.pricing);
    expect(saved.measurement!.country_check).toEqual(calc.country_check);
    expect(saved.measurement!.calculated_at).toEqual(expect.any(String));
  });

  it('kayıttan sonra değişen tüketim, doluluk ve profil belirtilir', async () => {
    const { service, fake } = await approvedPeriod();
    await service.calculatePeriod('hotel-A', PERIOD);

    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 1900,
      lines: [{ item_id: ITEM_ELEC, quantity: 99_000, uom: 'kWh' }],
    });
    fake.dataset.carbon_facility_profiles![0].rooms = 110;
    const saved = await service.getPeriodMeasurement('hotel-A', PERIOD);
    expect(saved.measurement!.changes).toEqual([
      'records',
      'occupancy',
      'profile',
    ]);
  });

  it('başka otelin veya başka dönemin ölçümünü göstermez', async () => {
    const { service, fake } = await approvedPeriod();
    const calc = await service.calculatePeriod('hotel-A', PERIOD);
    if (calc.status !== 'calculated') throw new Error('hesap yok');
    // Başka otelin dönem satırı aynı ölçüme işaret etse bile görünmez.
    fake.dataset.carbon_periods!.push({
      hotel_id: 'hotel-B',
      environment: 'sandbox',
      period: PERIOD,
      occupied_room_nights: 10,
      measurement_id: calc.measurement_id,
    });
    await expect(
      service.getPeriodMeasurement('hotel-B', PERIOD),
    ).resolves.toEqual({ period: PERIOD, measurement: null });
    // Ölçüm başka bir dönemin satırına bağlıysa kabul edilmez.
    fake.dataset.carbon_periods!.push({
      hotel_id: 'hotel-A',
      environment: 'sandbox',
      period: '2026-09',
      occupied_room_nights: 10,
      measurement_id: calc.measurement_id,
    });
    await expect(
      service.getPeriodMeasurement('hotel-A', '2026-09'),
    ).resolves.toEqual({ period: '2026-09', measurement: null });
  });

  it('geçersiz dönem reddedilir', async () => {
    const { service } = setup();
    await expect(
      service.getPeriodMeasurement('hotel-A', '2026-13'),
    ).rejects.toThrow('YYYY-AA');
  });

  it('yayın öncesi yeniden hesap aynı veride yeni ölçüm veya sürüm oluşturmaz', async () => {
    const { service, fake } = await approvedPeriod();
    const first = await service.calculatePeriod('hotel-A', PERIOD);
    if (first.status !== 'calculated') throw new Error('hesap yok');
    // Panel yayın eylemi hesabı sunucuda yeniden çalıştırır (tekrar tekrar dahi).
    for (let i = 0; i < 3; i++) {
      const again = await service.calculatePeriod('hotel-A', PERIOD);
      expect(again).toMatchObject({
        status: 'calculated',
        duplicate: true,
        measurement_id: first.measurement_id,
      });
    }
    expect(fake.dataset.carbon_measurements).toHaveLength(1);
    expect(fake.dataset.carbon_periods).toHaveLength(1);
    expect(fake.dataset.carbon_periods![0].measurement_id).toBe(
      first.measurement_id,
    );
    // Hesap tüketim kaydı yazmaz.
    expect(fake.dataset.carbon_activity_records).toHaveLength(2);
  });

  it('veri gerçekten değişince yeni sürüm açılır; eski satır silinmez, dönem yeni sürüme bağlanır', async () => {
    const { service, hub, fake } = await approvedPeriod();
    const first = await service.calculatePeriod('hotel-A', PERIOD);
    if (first.status !== 'calculated') throw new Error('hesap yok');
    await service.submitPeriod('hotel-A', 'u', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 90_000, uom: 'kWh' }],
    });
    hub.approveAll();
    const second = await service.calculatePeriod('hotel-A', PERIOD);
    if (second.status !== 'calculated') throw new Error('hesap yok');
    expect(second.duplicate).toBe(false);
    expect(second.measurement_id).not.toBe(first.measurement_id);
    expect(fake.dataset.carbon_measurements).toHaveLength(2);
    expect(fake.dataset.carbon_periods![0].measurement_id).toBe(
      second.measurement_id,
    );
    // Aynı yeni veriyle tekrar → yine yeni satır yok.
    await service.calculatePeriod('hotel-A', PERIOD);
    expect(fake.dataset.carbon_measurements).toHaveLength(2);
  });

  it('eşzamanlı iki hesap tek ölçüm satırı bırakır (benzersiz indeks yarışı)', async () => {
    const { service, fake } = await approvedPeriod({
      uniqueBy: {
        carbon_measurements: [
          'hotel_id',
          'provider',
          'external_measurement_id',
          'external_version',
        ],
      },
    });
    const [a, b] = await Promise.all([
      service.calculatePeriod('hotel-A', PERIOD),
      service.calculatePeriod('hotel-A', PERIOD),
    ]);
    expect(a.status).toBe('calculated');
    expect(b.status).toBe('calculated');
    if (a.status !== 'calculated' || b.status !== 'calculated') return;
    expect(a.measurement_id).toBe(b.measurement_id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(fake.dataset.carbon_measurements).toHaveLength(1);
  });
});

describe('ConnectHubService · ölçüm sürüm geçmişi (G2)', () => {
  const V1 = '11111111-1111-4111-8111-111111111111';
  const V2 = '22222222-2222-4222-8222-222222222222';

  /** İki gerçek sürüm: ilk hesap, sonra düzeltilmiş elektrikle ikinci hesap. */
  async function twoVersions() {
    const ctx = setup();
    // Ülke doğrulaması geçsin (yalnız INTERNAL_USE / sürüm kuralı sınansın).
    ctx.fake.dataset.carbon_facility_profiles![0].country_code = 'TR';
    await ctx.service.submitPeriod('hotel-A', 'u', PERIOD, {
      occupied_room_nights: 2000,
      lines: [{ item_id: ITEM_ELEC, quantity: 100_000, uom: 'kWh' }],
    });
    ctx.hub.approveAll();
    const first = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    if (first.status !== 'calculated') throw new Error('hesap yok');
    const rows = ctx.fake.dataset.carbon_measurements!;
    rows[0].id = V1;
    rows[0].imported_at = '2026-11-20T09:00:00Z';
    await ctx.service.submitPeriod('hotel-A', 'u', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 90_000, uom: 'kWh' }],
    });
    ctx.hub.approveAll();
    await ctx.service.calculatePeriod('hotel-A', PERIOD);
    rows[1].id = V2;
    rows[1].imported_at = '2026-11-25T09:00:00Z';
    ctx.fake.dataset.carbon_periods![0].measurement_id = V2;
    return ctx;
  }

  it('tüm kayıtlı sürümler yeniden eskiye; güncel sürüm işaretli; sağlayıcıya istek yok', async () => {
    const { service, hub, fake } = await twoVersions();
    const read = jest.spyOn(hub, 'readApprovedRecords');
    const before = JSON.stringify(fake.dataset);
    const res = await service.listPeriodMeasurements('hotel-A', PERIOD);
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(fake.dataset)).toBe(before);
    expect(res.current_id).toBe(V2);
    expect(res.versions.map((v) => [v.id, v.is_current])).toEqual([
      [V2, true],
      [V1, false],
    ]);
    expect(res.versions[1]).toMatchObject({
      is_active: false,
      occupied_room_nights: 2000,
      currency: 'EUR',
      country_publishable: true,
    });
    expect(res.versions[0].total_tonnes!).toBeLessThan(
      res.versions[1].total_tonnes!,
    );
  });

  it('önceki sürüm ayrıntısı okunur; güncel değil, değişiklikler güncel veriye göre', async () => {
    const { service } = await twoVersions();
    const old = await service.getPeriodMeasurementVersion(
      'hotel-A',
      PERIOD,
      V1,
    );
    expect(old.measurement).toMatchObject({
      id: V1,
      is_current: false,
      changes: ['records'],
    });
    const cur = await service.getPeriodMeasurement('hotel-A', PERIOD);
    expect(cur.measurement).toMatchObject({
      id: V2,
      is_current: true,
      changes: [],
    });
  });

  it('başka otelin, başka dönemin sürümü veya geçersiz kimlik okunamaz', async () => {
    const { service } = await twoVersions();
    await expect(
      service.getPeriodMeasurementVersion('hotel-B', PERIOD, V1),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.getPeriodMeasurementVersion('hotel-A', '2026-09', V1),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.getPeriodMeasurementVersion('hotel-A', PERIOD, 'abc'),
    ).rejects.toMatchObject({ status: 400 });
    const other = await service.listPeriodMeasurements('hotel-B', PERIOD);
    expect(other.versions).toEqual([]);
  });

  it('önceki sürüm doğrudan API çağrısıyla aktive edilemez (409 superseded)', async () => {
    const { measurement, fake } = await twoVersions();
    await expect(
      measurement.activateMeasurement('hotel-A', V1),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'carbon_measurement_superseded' },
    });
    // Önceki sürüm denemesi hiçbir şeyi değiştirmedi.
    expect(fake.dataset.carbon_measurements!.every((r) => !r.is_active)).toBe(
      true,
    );
    expect(fake.dataset.hotels![0].estimated_co2_per_night_kg).toBeUndefined();
    // Güncel sürüm bu kontrolü ve yayın politikasını (izin, Kapsam 1/2) geçer.
    const ok = await measurement.activateMeasurement('hotel-A', V2);
    expect(ok.measurement_id).toBe(V2);
  });

  it('kullanım izni açılsa bile önceki sürüm reddedilir; güncel sürüm uygulanır', async () => {
    const spy = jest
      .spyOn(policy, 'assertPublishable')
      .mockImplementation(() => undefined);
    try {
      const { measurement, fake } = await twoVersions();
      await expect(
        measurement.activateMeasurement('hotel-A', V1),
      ).rejects.toMatchObject({
        response: { code: 'carbon_measurement_superseded' },
      });
      expect(
        fake.dataset.hotels![0].estimated_co2_per_night_kg,
      ).toBeUndefined();
      const ok = await measurement.activateMeasurement('hotel-A', V2);
      expect(ok.measurement_id).toBe(V2);
      const rows = fake.dataset.carbon_measurements!;
      expect(rows.find((r) => r.id === V2)!.is_active).toBe(true);
      expect(rows.find((r) => r.id === V1)!.is_active).toBeFalsy();
    } finally {
      spy.mockRestore();
    }
  });

  it('CCA ölçümleri sürüm listesine karışmaz', async () => {
    const { service, fake } = await twoVersions();
    fake.dataset.carbon_measurements!.push({
      id: '33333333-3333-4333-8333-333333333333',
      hotel_id: 'hotel-A',
      provider: 'threepmetrics',
      environment: 'sandbox',
      period_start: '2026-10-01',
      form_data: { api: 'cca', pricing: {} },
      imported_at: '2026-11-26T09:00:00Z',
    });
    const res = await service.listPeriodMeasurements('hotel-A', PERIOD);
    expect(res.versions.map((v) => v.id)).toEqual([V2, V1]);
  });
});

/**
 * TR faktörü geldiğinde kalan tek adım "gerçek hesap + aktivasyon" olsun diye
 * tüm hattın MOCK paketle uçtan uca doğrulaması. Paketteki TR elektrik
 * faktörü (0,442 kg/kWh) TEST VERİSİDİR — gerçek faktör değildir, hiçbir yere
 * yazılmaz. Güvenlik kapıları (ülke, kapsam, sürüm, tenant) atlanmaz.
 */
describe('ConnectHubService · TR faktörü senaryoları (mock paket, uçtan uca)', () => {
  const trProfile = { ...profileRow, country_code: 'TR' };
  const hotelRows = [
    {
      id: 'hotel-A',
      name: 'Pilot Otel',
      default_currency: 'EUR',
      status: 'active',
      public_widget_key: 'pk-A',
      contribution_amount_per_night: 0.11,
      estimated_co2_per_night_kg: 4.3,
      widget_settings: {},
    },
    {
      id: 'hotel-B',
      name: 'Başka Otel',
      default_currency: 'EUR',
      status: 'active',
      public_widget_key: 'pk-B',
      contribution_amount_per_night: 0.2,
      estimated_co2_per_night_kg: 7,
      widget_settings: {},
    },
  ];

  /** Sahte DB kimliği → gerçekteki gibi UUID (ölçüm ve dönem satırında). */
  function uuidFor(ctx: ReturnType<typeof setup>, id: string): string {
    const uuid = '77777777-7777-4777-8777-777777777777';
    const row = ctx.fake.dataset.carbon_measurements!.find((r) => r.id === id)!;
    row.id = uuid;
    for (const p of ctx.fake.dataset.carbon_periods!) {
      if (p.measurement_id === id) p.measurement_id = uuid;
    }
    return uuid;
  }

  async function fill(ctx: ReturnType<typeof setup>) {
    await ctx.service.setOccupancy('hotel-A', 'user-1', PERIOD, 2000);
    await ctx.service.submitPeriod('hotel-A', 'user-1', PERIOD, {
      lines: [
        { item_id: ITEM_ELEC, quantity: 1000, uom: 'kWh' },
        { item_id: ITEM_DIESEL, quantity: 500, uom: 'L' },
      ],
    });
    ctx.hub.approveAll();
  }

  it('TR faktörü mevcut: hesap → kayıt → yayın kapısı açık → aktivasyon → widget ölçüm tabanlı, faktör sızmaz', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    await fill(ctx);

    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('calculated');
    if (calc.status !== 'calculated') return;
    expect(calc.country_check.publishable).toBe(true);
    expect(calc.calculation.coverage.scopes_calculated).toEqual([1, 2]);
    const elec = calc.calculation.lines.find((l) => l.item_id === ITEM_ELEC)!;
    expect(elec.factor_country_code).toBe('TR');
    expect(elec.kg_co2e).toBeCloseTo(1000 * 0.442, 6);

    const saved = await ctx.service.getPeriodMeasurement('hotel-A', PERIOD);
    expect(saved.measurement?.publication_block).toBeNull();

    // Aktivasyondan önce widget eski (hotel-input) fiyatı gösterir.
    const widget = new WidgetService(
      ctx.fake as never,
      new DashboardService(ctx.fake as never),
    );
    expect(
      (await widget.getConfig('pk-A')).carbon_estimate_basis,
    ).toBeUndefined();

    await ctx.measurement.activateMeasurement(
      'hotel-A',
      uuidFor(ctx, calc.measurement_id),
    );
    const hotelA = ctx.fake.dataset.hotels!.find((h) => h.id === 'hotel-A')!;
    expect(Number(hotelA.contribution_amount_per_night)).toBe(
      calc.pricing.amount_per_night,
    );
    expect(Number(hotelA.estimated_co2_per_night_kg)).toBeCloseTo(
      Number(calc.pricing.coefficient_kg),
      6,
    );
    // Diğer otel etkilenmez (tenant).
    const hotelB = ctx.fake.dataset.hotels!.find((h) => h.id === 'hotel-B')!;
    expect(hotelB.contribution_amount_per_night).toBe(0.2);
    expect(hotelB.estimated_co2_per_night_kg).toBe(7);

    const cfg = await widget.getConfig('pk-A');
    expect(cfg.carbon_estimate_basis).toBe('measured_scope_1_2');
    expect(cfg.amount_per_night).toBe(calc.pricing.amount_per_night);
    const json = JSON.stringify(cfg);
    for (const leak of [
      '0.442',
      'factor',
      'inventory',
      UNIT,
      'content_hash',
      'GG_CH',
    ]) {
      expect(json).not.toContain(leak);
    }
    expect(
      (await widget.getConfig('pk-B')).carbon_estimate_basis,
    ).toBeUndefined();
  });

  it('3P bildirimi (ETKB 2022, TR, FACTOR_YEAR_FALLBACK) gibi paket: hesap engellenmez, yayına uygun; değer paketten okunur; kaynak/lisans/atıf ölçümde saklanır', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    // Fikstür: değer YALNIZ test paketinde; üründe sabit faktör yok.
    ctx.hub.mutatePackage = (pkg) => {
      const f = pkg.factors.find((x) => x.id === 'elec')!;
      f.kg_co2e_per_uom = 0.478;
      f.country_code = 'TR';
      f.data_year = 2022;
      f.source = {
        code: 'ETKB_2022',
        name: 'ETKB',
        version: '2022',
        url: 'https://example.test/etkb',
        license: 'Test lisansı',
        attribution: 'Test atfı',
      };
      for (const m of pkg.items.find((i) => i.id === ITEM_ELEC)!.mappings) {
        m.warnings.push('FACTOR_YEAR_FALLBACK');
      }
    };
    await fill(ctx);
    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('calculated');
    if (calc.status !== 'calculated') return;
    const elec = calc.calculation.lines.find((l) => l.item_id === ITEM_ELEC)!;
    expect(elec.kg_co2e).toBeCloseTo(1000 * 0.478, 9);
    expect(elec.data_year).toBe(2022);
    expect(elec.warnings).toContain('FACTOR_YEAR_FALLBACK');
    expect(elec.factor_source).toEqual({
      name: 'ETKB',
      version: '2022',
      license: 'Test lisansı',
      attribution: 'Test atfı',
      url: 'https://example.test/etkb',
    });
    expect(calc.calculation.blocking).toEqual([]);
    expect(calc.country_check.publishable).toBe(true);
    const saved = await ctx.service.getPeriodMeasurement('hotel-A', PERIOD);
    expect(saved.measurement?.publication_block).toBeNull();
    const stored = ctx.fake.dataset.carbon_measurements![0].form_data as {
      calculation: { lines: { item_id: string; factor_source: unknown }[] };
    };
    expect(
      stored.calculation.lines.find((l) => l.item_id === ITEM_ELEC)!
        .factor_source,
    ).toMatchObject({ license: 'Test lisansı', attribution: 'Test atfı' });
  });

  it('aynı veriyle yeniden hesap yeni ölçüm/sürüm açmaz; aktif ölçüm aynı kalır', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    await fill(ctx);
    const first = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    if (first.status !== 'calculated') throw new Error(first.status);
    await ctx.measurement.activateMeasurement(
      'hotel-A',
      uuidFor(ctx, first.measurement_id),
    );
    const again = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(again.status === 'calculated' && again.duplicate).toBe(true);
    expect(ctx.fake.dataset.carbon_measurements).toHaveLength(1);
    expect(ctx.fake.dataset.carbon_measurements![0].is_active).toBe(true);
    // Mükerrer gönderim: aynı değerleri tekrar göndermek sağlayıcıda tek kayıt bırakır.
    await ctx.service.submitPeriod('hotel-A', 'user-1', PERIOD, {
      lines: [{ item_id: ITEM_ELEC, quantity: 1000, uom: 'kWh' }],
    });
    expect(
      [...ctx.hub.store.values()].filter((r) => r.item === ITEM_ELEC),
    ).toHaveLength(1);
    expect(
      ctx.fake.dataset.carbon_activity_records!.filter(
        (r) => r.item_id === ITEM_ELEC,
      ),
    ).toHaveLength(1);
  });

  it('başka otel ölçümü göremez, aktive edemez (tenant)', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    await fill(ctx);
    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    if (calc.status !== 'calculated') throw new Error(calc.status);
    await expect(
      ctx.measurement.activateMeasurement(
        'hotel-B',
        uuidFor(ctx, calc.measurement_id),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await ctx.service.getPeriodMeasurement('hotel-B', PERIOD)).measurement,
    ).toBeNull();
    expect(
      ctx.fake.dataset.hotels!.find((h) => h.id === 'hotel-B')!
        .estimated_co2_per_night_kg,
    ).toBe(7);
  });

  it('bugünkü durum (SOURCE_NOT_REDISTRIBUTABLE): hesap durur, ölçüm yazılmaz, fiyat değişmez', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    ctx.hub.mutatePackage = (pkg) => {
      for (const m of pkg.items.find((i) => i.id === ITEM_ELEC)!.mappings) {
        m.error = {
          code: 'FACTOR_NOT_AVAILABLE',
          reason: 'SOURCE_NOT_REDISTRIBUTABLE',
        };
        m.factor_id = null;
      }
    };
    await fill(ctx);
    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('blocked');
    if (calc.status !== 'blocked') return;
    expect(calc.calculation?.blocking).toEqual([
      expect.objectContaining({
        code: 'FACTOR_NOT_AVAILABLE',
        provider_reason: 'SOURCE_NOT_REDISTRIBUTABLE',
      }),
    ]);
    expect(ctx.fake.dataset.carbon_measurements).toHaveLength(0);
    expect(
      ctx.fake.dataset.hotels!.find((h) => h.id === 'hotel-A')!
        .estimated_co2_per_night_kg,
    ).toBe(4.3);
  });

  it('BAE faktörüne geri düşme (TR tesis): yalnız önizleme, kaydedilmez, yayınlanamaz', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    ctx.hub.mutatePackage = (pkg) => {
      pkg.factors.find((f) => f.id === 'elec')!.country_code = 'AE';
      pkg.items
        .find((i) => i.id === ITEM_ELEC)!
        .mappings.forEach((m) => m.warnings.push('FACTOR_COUNTRY_FALLBACK'));
    };
    await fill(ctx);
    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('preview_only');
    expect(ctx.fake.dataset.carbon_measurements).toHaveLength(0);
  });

  it('Kapsam 3 kalem içeren hesap kaydedilir ama yayına alınamaz (izin yalnız Kapsam 1/2)', async () => {
    const ctx = setup({
      hotels: hotelRows.map((h) => ({ ...h })),
      carbon_facility_profiles: [trProfile],
    });
    ctx.hub.mutatePackage = (pkg) => {
      pkg.items.find((i) => i.id === ITEM_DIESEL)!.scope = 3;
    };
    await fill(ctx);
    const calc = await ctx.service.calculatePeriod('hotel-A', PERIOD);
    expect(calc.status).toBe('calculated');
    if (calc.status !== 'calculated') return;
    expect(calc.calculation.coverage.scopes_calculated).toEqual([2, 3]);
    expect(
      (await ctx.service.getPeriodMeasurement('hotel-A', PERIOD)).measurement
        ?.publication_block,
    ).toBe('carbon_measurement_scope_not_permitted');
    await expect(
      ctx.measurement.activateMeasurement(
        'hotel-A',
        uuidFor(ctx, calc.measurement_id),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'carbon_measurement_scope_not_permitted' },
    });
    expect(
      ctx.fake.dataset.hotels!.find((h) => h.id === 'hotel-A')!
        .estimated_co2_per_night_kg,
    ).toBe(4.3);
  });
});
