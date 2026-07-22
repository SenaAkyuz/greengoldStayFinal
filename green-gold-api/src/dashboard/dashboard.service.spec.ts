import { DashboardService } from './dashboard.service';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

const FROM = '2026-07-01';
const TO = '2026-07-31';

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

function pressEvent(
  hotelId: string,
  sessionRef: string | null,
  nights: number,
  createdAt: string,
  over: Record<string, unknown> = {},
) {
  return {
    id: `ev-${hotelId}-${sessionRef ?? 'nil'}-${createdAt}`,
    hotel_id: hotelId,
    event_type: 'katki_ekle_butonuna_basildi',
    session_ref: sessionRef,
    metadata: { nights },
    created_at: createdAt,
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
      pressEvent('A', 'sA1', 3, '2026-07-10T09:00:00.000Z'),
      pressEvent('B', 'sB1', 5, '2026-07-11T09:00:00.000Z'),
      pressEvent('B', 'sB2', 5, '2026-07-12T09:00:00.000Z'),
    ],
  };

  it('carbon-summary yalnızca kendi otelinin event\'lerini sayar', async () => {
    const { service } = makeService(dataset);
    const a = await service.getCarbonSummary('A', FROM, TO);
    expect(a.contributions_count).toBe(1);
    expect(a.total_selected_nights).toBe(3);

    const b = await service.getCarbonSummary('B', FROM, TO);
    expect(b.contributions_count).toBe(2);
    expect(b.total_selected_nights).toBe(10);
  });

  it('getHotel A, B\'nin bilgisini döndürmez', async () => {
    const { service } = makeService(dataset);
    const a = await service.getHotel('A');
    expect(a.hotel_name).toBe('Otel A');
    expect(a.public_widget_key).toBe('key-A');
  });

  it('widget-events-summary otel bazlı izole', async () => {
    const { service } = makeService(dataset);
    const b = await service.getWidgetEventsSummary('B', FROM, TO);
    expect(b.add_clicks).toBe(2);
  });
});

describe('DashboardService.getCarbonSummary — dedup & doğruluk (g)', () => {
  it('aynı session iki buton event\'i -> count 1, deterministik SON nights', async () => {
    // Aynı session, iki farklı nights; en son (created_at DESC) = 4 esas alınmalı.
    const dataset: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        pressEvent('A', 'sess-x', 2, '2026-07-10T08:00:00.000Z'),
        pressEvent('A', 'sess-x', 4, '2026-07-10T10:00:00.000Z'), // sonraki
      ],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', FROM, TO);
    expect(r.contributions_count).toBe(1);
    expect(r.total_selected_nights).toBe(4); // son basış
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
    const a = await forward.service.getCarbonSummary('A', FROM, TO);
    const b = await reversed.service.getCarbonSummary('A', FROM, TO);
    expect(a.total_selected_nights).toBe(b.total_selected_nights);
    expect(a.total_selected_nights).toBe(4);
  });

  it('checkbox_secildi karbon sayısına DAHİL edilmez', async () => {
    const dataset: FakeDataset = {
      hotels: [hotel('A')],
      widget_events: [
        pressEvent('A', 'sess-1', 3, '2026-07-10T09:00:00.000Z'),
        {
          id: 'cb-1',
          hotel_id: 'A',
          event_type: 'checkbox_secildi',
          session_ref: 'sess-2',
          metadata: { nights: 10 },
          created_at: '2026-07-10T09:30:00.000Z',
        },
      ],
    };
    const { service } = makeService(dataset);
    const r = await service.getCarbonSummary('A', FROM, TO);
    expect(r.contributions_count).toBe(1);
    expect(r.total_selected_nights).toBe(3);
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
    const r = await service.getCarbonSummary('A', FROM, TO);
    expect(r.total_selected_nights).toBe(365);
  });

  it('boş aralık -> sıfırlar, is_estimated true', async () => {
    const { service } = makeService({ hotels: [hotel('A')], widget_events: [] });
    const r = await service.getCarbonSummary('A', '2026-08-01', '2026-08-31');
    expect(r.contributions_count).toBe(0);
    expect(r.estimated_co2_kg).toBe(0);
    expect(r.is_estimated).toBe(true);
  });
});
