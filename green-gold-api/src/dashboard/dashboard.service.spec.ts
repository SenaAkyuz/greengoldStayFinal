import { DashboardService } from './dashboard.service';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

const FROM = '2026-07-01';
const TO = '2026-07-31';
const RANGE = { from: FROM, to: TO };

function hotel(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Otel ${id}`,
    city: 'İstanbul',
    status: 'active',
    default_currency: 'EUR',
    contribution_amount_per_night: 3,
    estimated_co2_per_night_kg: 8.3,
    public_widget_key: `key-${id}`,
    timezone: 'Europe/Istanbul',
    ...over,
  };
}

function event(
  hotelId: string,
  eventType: string,
  sessionRef: string | null,
  createdAt: string,
  metadata: Record<string, unknown> | null = null,
) {
  return {
    id: `ev-${hotelId}-${eventType}-${sessionRef ?? 'nil'}-${createdAt}`,
    hotel_id: hotelId,
    event_type: eventType,
    session_ref: sessionRef,
    metadata,
    created_at: createdAt,
  };
}

function pressEvent(
  hotelId: string,
  sessionRef: string | null,
  nights: number,
  createdAt: string,
  over: Record<string, unknown> = {},
) {
  return {
    ...event(hotelId, 'katki_ekle_butonuna_basildi', sessionRef, createdAt, {
      nights,
    }),
    ...over,
  };
}

function makeService(dataset: FakeDataset) {
  const fake = makeFakeSupabase(dataset);
  return { service: new DashboardService(fake as never), fake };
}

describe('DashboardService — tenant izolasyonu (a)', () => {
  const dataset: FakeDataset = {
    hotels: [hotel('A'), hotel('B')],
    widget_events: [
      // A: 1 session tam huni
      event('A', 'widget_goruntulendi', 'sA1', '2026-07-10T08:58:00.000Z'),
      event('A', 'checkbox_secildi', 'sA1', '2026-07-10T08:59:00.000Z'),
      pressEvent('A', 'sA1', 3, '2026-07-10T09:00:00.000Z'),
      // B: 2 session tam huni (cohort için view+select şart)
      event('B', 'widget_goruntulendi', 'sB1', '2026-07-11T08:58:00.000Z'),
      event('B', 'checkbox_secildi', 'sB1', '2026-07-11T08:59:00.000Z'),
      pressEvent('B', 'sB1', 5, '2026-07-11T09:00:00.000Z'),
      event('B', 'widget_goruntulendi', 'sB2', '2026-07-12T08:58:00.000Z'),
      event('B', 'checkbox_secildi', 'sB2', '2026-07-12T08:59:00.000Z'),
      pressEvent('B', 'sB2', 5, '2026-07-12T09:00:00.000Z'),
    ],
  };

  it("carbon-summary yalnızca kendi otelinin event'lerini sayar", async () => {
    const { service } = makeService(dataset);
    const a = await service.getCarbonSummary('A', RANGE);
    expect(a.contributions_count).toBe(1);
    expect(a.total_selected_nights).toBe(3);

    const b = await service.getCarbonSummary('B', RANGE);
    expect(b.contributions_count).toBe(2);
    expect(b.total_selected_nights).toBe(10);
  });

  it("getHotel A, B'nin bilgisini döndürmez", async () => {
    const { service } = makeService(dataset);
    const a = await service.getHotel('A');
    expect(a.hotel_name).toBe('Otel A');
    expect(a.public_widget_key).toBe('key-A');
  });

  it('updateHotel yalnızca token otelini günceller (tenant)', async () => {
    const { service, fake } = makeService(dataset);
    const updated = await service.updateHotel('A', {
      contribution_amount_per_night: 5,
    });
    expect(updated.amount_per_night).toBe(5);
    const rowA = fake.dataset.hotels!.find((h) => h.id === 'A');
    const rowB = fake.dataset.hotels!.find((h) => h.id === 'B');
    expect(Number(rowA!.contribution_amount_per_night)).toBe(5);
    expect(Number(rowB!.contribution_amount_per_night)).toBe(3); // B dokunulmadı
  });

  it('funnel otel bazlı izole', async () => {
    const { service } = makeService(dataset);
    const b = await service.getFunnel('B', RANGE);
    expect(b.stages.clicked).toBe(2);
  });
});

describe('DashboardService.getHotel / updateHotel', () => {
  it('getHotel timezone + commission_rate döner', async () => {
    const { service } = makeService({
      hotels: [hotel('A', { timezone: 'America/Los_Angeles', commission_rate: 15 })],
    });
    const h = await service.getHotel('A');
    expect(h.timezone).toBe('America/Los_Angeles');
    expect(h.commission_rate).toBe(15);
  });

  it('updateHotel yalnızca gelen alanları yazar + updated_at tazeler', async () => {
    const { service, fake } = makeService({ hotels: [hotel('A')] });
    const res = await service.updateHotel('A', { name: 'Deniz Otel', city: 'İzmir' });
    expect(res.hotel_name).toBe('Deniz Otel');
    expect(res.city).toBe('İzmir');
    const row = fake.dataset.hotels!.find((h) => h.id === 'A')!;
    expect(row.name).toBe('Deniz Otel');
    expect(row.updated_at).toBeDefined();
    // korumalı alanlar dokunulmadı
    expect(Number(row.estimated_co2_per_night_kg)).toBe(8.3);
  });

  it('updateHotel boş gövde -> no-op, mevcut oteli döner', async () => {
    const { service } = makeService({ hotels: [hotel('A')] });
    const res = await service.updateHotel('A', {});
    expect(res.hotel_name).toBe('Otel A');
  });
});

describe('DashboardService.getCarbonSummary — dedup & doğruluk (g)', () => {
  it("aynı session iki buton event'i -> count 1, deterministik SON nights", async () => {
    const dataset: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        pressEvent('A', 'sess-x', 2, '2026-07-10T08:00:00.000Z'),
        pressEvent('A', 'sess-x', 4, '2026-07-10T10:00:00.000Z'),
      ],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', RANGE);
    expect(r.contributions_count).toBe(1);
    expect(r.total_selected_nights).toBe(4);
    expect(r.estimated_co2_kg).toBe(Math.round(4 * 8.3 * 100) / 100);
  });

  it('DB satır sırasından bağımsız aynı sonuç (determinizm)', async () => {
    const rows = [
      pressEvent('A', 'sess-x', 4, '2026-07-10T10:00:00.000Z'),
      pressEvent('A', 'sess-x', 2, '2026-07-10T08:00:00.000Z'),
    ];
    const forward = makeService({ hotels: [hotel('A')], widget_events: rows });
    const reversed = makeService({
      hotels: [hotel('A')],
      widget_events: [...rows].reverse(),
    });
    const a = await forward.service.getCarbonSummary('A', RANGE);
    const b = await reversed.service.getCarbonSummary('A', RANGE);
    expect(a.total_selected_nights).toBe(b.total_selected_nights);
    expect(a.total_selected_nights).toBe(4);
  });

  it('bozuk/aşırı nights [1,365] aralığına clamp edilir', async () => {
    const dataset: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        pressEvent('A', 'sess-1', 0, '2026-07-10T09:00:00.000Z', {
          metadata: { nights: 999999 },
        }),
      ],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', RANGE);
    expect(r.total_selected_nights).toBe(365);
  });

  it('boş aralık -> sıfırlar, is_estimated true', async () => {
    const { service } = makeService({ hotels: [hotel('A')], widget_events: [] });
    const r = await service.getCarbonSummary('A', {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(r.contributions_count).toBe(0);
    expect(r.estimated_co2_kg).toBe(0);
    expect(r.is_estimated).toBe(true);
  });
});

describe('DashboardService — report & CSV export (11E)', () => {
  const dataset: FakeDataset = {
    hotels: [hotel('A', { name: '=Otel A' }), hotel('B')],
    widget_events: [
      event('A', 'widget_goruntulendi', 'sA1', '2026-07-10T09:00:00.000Z'),
      event('A', 'checkbox_secildi', 'sA1', '2026-07-10T09:01:00.000Z'),
      pressEvent('A', 'sA1', 3, '2026-07-10T09:02:00.000Z'),
      event('A', 'widget_goruntulendi', 'sA2', '2026-07-11T09:00:00.000Z'),
      // B (başka tenant) — A'nın CSV'sinde GÖRÜNMEMELİ
      event('B', 'widget_goruntulendi', 'sB1', '2026-07-10T09:00:00.000Z'),
      pressEvent('B', 'sB1', 9, '2026-07-10T09:02:00.000Z'),
    ],
  };

  it('getReport: özet + funnel + karbon tek yanıtta, tutarlı', async () => {
    const { service } = makeService(dataset);
    const r = await service.getReport('A', RANGE);
    expect(r.summary.views).toBe(2);
    expect(r.funnel.stages.viewed).toBe(2);
    expect(r.carbon.contributions_count).toBe(1);
    expect(r.summary.conversion_rate_pct).toBe(r.funnel.rates.view_to_select_pct);
  });

  it('exportCsv: tenant-scoped, günlük satırlar + özet + injection kaçışı', async () => {
    const { service } = makeService(dataset);
    const { filename, csv } = await service.exportCsv('A', RANGE);

    expect(filename).toMatch(/^green-gold-.*\.csv$/);
    expect(csv).toContain('Günlük etkileşim');
    expect(csv).toContain('2026-07-10,1,1,1,1');
    expect(csv).toContain('Katkı niyeti (tekil katkı butonu oturumu),1');
    // B tenant'ının 9 gecelik katkısı A'nın CSV'sinde yok
    expect(csv).not.toContain('Otel B');
    expect(csv).not.toContain(',9,');
  });

  it('exportCsv: title hücresi formülle başlamaz -> güvenli', async () => {
    const { service } = makeService(dataset);
    const { csv } = await service.exportCsv('A', RANGE);
    expect(csv.split('\r\n')[0]).toBe('Green Gold — =Otel A');
  });
});

describe('DashboardService — katsayı placeholder & marka (11C)', () => {
  it('override NULL -> tek dokümante placeholder (8.30); hotel_type ETKİLEMEZ', async () => {
    const dataset: FakeDataset = {
      hotels: [
        hotel('A', { estimated_co2_per_night_kg: null, hotel_type: 'resort' }),
      ],
      widget_events: [pressEvent('A', 'sess-1', 2, '2026-07-10T09:00:00.000Z')],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', RANGE);
    expect(r.co2_per_night_kg).toBe(8.3); // tip ne olursa olsun placeholder
    expect(r.total_selected_nights).toBe(2);
    expect(r.estimated_co2_kg).toBe(Math.round(2 * 8.3 * 100) / 100);
  });

  it('override dolu -> placeholder yerine otel değeri kullanılır', async () => {
    const dataset: FakeDataset = {
      hotels: [
        hotel('A', { estimated_co2_per_night_kg: 5, hotel_type: 'premium' }),
      ],
      widget_events: [pressEvent('A', 'sess-1', 2, '2026-07-10T09:00:00.000Z')],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', RANGE);
    expect(r.co2_per_night_kg).toBe(5);
    expect(r.estimated_co2_kg).toBe(10);
  });

  it('getHotel: hotel_type (tanımlayıcı) + marka alanları döner; katsayı placeholder', async () => {
    const { service } = makeService({
      hotels: [
        hotel('A', {
          estimated_co2_per_night_kg: null,
          hotel_type: 'premium',
          logo_url: 'https://cdn.example/logo.png',
          brand_color: '#aabbcc',
        }),
      ],
    });
    const h = await service.getHotel('A');
    expect(h.hotel_type).toBe('premium'); // yalnızca tanımlayıcı
    expect(h.estimated_co2_per_night_kg).toBe(8.3); // placeholder, tip'ten bağımsız
    expect(h.logo_url).toBe('https://cdn.example/logo.png');
    expect(h.brand_color).toBe('#aabbcc');
  });

  it('getHotel: DB\'deki geçersiz brand_color -> null (defans)', async () => {
    const { service } = makeService({
      hotels: [hotel('A', { brand_color: 'red' })],
    });
    const h = await service.getHotel('A');
    expect(h.brand_color).toBeNull();
  });

  it('updateHotel: logo_url + brand_color yazılır', async () => {
    const { service, fake } = makeService({ hotels: [hotel('A')] });
    const res = await service.updateHotel('A', {
      logo_url: 'https://cdn.example/l.png',
      brand_color: '#123456',
    });
    expect(res.logo_url).toBe('https://cdn.example/l.png');
    expect(res.brand_color).toBe('#123456');
    const row = fake.dataset.hotels!.find((h) => h.id === 'A')!;
    expect(row.logo_url).toBe('https://cdn.example/l.png');
    expect(row.brand_color).toBe('#123456');
  });
});

describe('DashboardService — etkileşim hunisi & tutarlılık', () => {
  // 3 viewed session, 2 selected, 1 clicked.
  const dataset: FakeDataset = {
    hotels: [hotel('A')],
    widget_events: [
      event('A', 'widget_goruntulendi', 's1', '2026-07-10T09:00:00.000Z'),
      event('A', 'widget_goruntulendi', 's2', '2026-07-10T09:01:00.000Z'),
      event('A', 'widget_goruntulendi', 's3', '2026-07-10T09:02:00.000Z'),
      event('A', 'checkbox_secildi', 's1', '2026-07-10T09:03:00.000Z'),
      event('A', 'checkbox_secildi', 's2', '2026-07-10T09:04:00.000Z'),
      pressEvent('A', 's1', 3, '2026-07-10T09:05:00.000Z'),
    ],
  };

  it('funnel stages tekil session sayar, oranlar doğru (payda>0)', async () => {
    const { service } = makeService(dataset);
    const f = await service.getFunnel('A', RANGE);
    expect(f.stages).toEqual({ viewed: 3, selected: 2, clicked: 1 });
    expect(f.rates.view_to_select_pct).toBe(66.7);
    expect(f.rates.select_to_button_pct).toBe(50);
    expect(f.rates.view_to_button_pct).toBe(33.3);
  });

  it('payda 0 -> oran 0 (viewed=0)', async () => {
    const { service } = makeService({ hotels: [hotel('A')], widget_events: [] });
    const f = await service.getFunnel('A', RANGE);
    expect(f.stages.viewed).toBe(0);
    expect(f.rates.view_to_select_pct).toBe(0);
    expect(f.rates.view_to_button_pct).toBe(0);
  });

  it('view olmadan select -> funnel oranı %100 aşmaz (sıralı cohort)', async () => {
    const dataset: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        event('A', 'widget_goruntulendi', 's1', '2026-07-10T09:00:00.000Z'),
        event('A', 'checkbox_secildi', 's1', '2026-07-10T09:01:00.000Z'),
        event('A', 'checkbox_secildi', 's2', '2026-07-10T09:02:00.000Z'), // view yok
      ],
    };
    const { service } = makeService(dataset);
    const f = await service.getFunnel('A', RANGE);
    expect(f.stages).toEqual({ viewed: 1, selected: 1, clicked: 0 });
    expect(f.rates.view_to_select_pct).toBe(100);
  });

  it('funnel aynı session ikinci görüntülenme -> viewed artmaz (dedup)', async () => {
    const withDup: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        ...dataset.widget_events!,
        event('A', 'widget_goruntulendi', 's1', '2026-07-10T10:00:00.000Z'),
      ],
    };
    const { service } = makeService(withDup);
    const f = await service.getFunnel('A', RANGE);
    expect(f.stages.viewed).toBe(3);
  });

  it('summary.conversion_rate_pct == funnel.view_to_select_pct (ortak helper, B)', async () => {
    const { service } = makeService(dataset);
    const s = await service.getWidgetEventsSummary('A', RANGE);
    const f = await service.getFunnel('A', RANGE);
    expect(s.conversion_rate_pct).toBe(f.rates.view_to_select_pct);
    expect(s.conversion_rate_pct).toBe(66.7);
    // Ham sayaçlar olduğu gibi (toplam etkileşim).
    expect(s.views).toBe(3);
    expect(s.selections).toBe(2);
    expect(s.add_clicks).toBe(1);
  });
});
