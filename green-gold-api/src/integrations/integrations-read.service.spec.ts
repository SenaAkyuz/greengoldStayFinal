import { IntegrationsReadService } from './integrations-read.service';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

function hotelRow(over: Record<string, unknown> = {}) {
  return { id: 'hotel-A', timezone: 'Europe/Istanbul', ...over };
}

function makeService(dataset: FakeDataset) {
  const fake = makeFakeSupabase(dataset);
  return { service: new IntegrationsReadService(fake as never), fake };
}

const nowIso = new Date().toISOString();

describe('IntegrationsReadService.getReservations', () => {
  it('yalnızca kendi otelinin rezervasyonlarını döner (tenant izolasyonu)', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      reservations: [
        {
          id: 'r1',
          hotel_id: 'hotel-A',
          provider_reservation_id: 'PA-1',
          booking_status: 'confirmed',
          arrival_date: null,
          departure_date: null,
          provider_updated_at: nowIso,
          updated_at: nowIso,
        },
        {
          id: 'r2',
          hotel_id: 'hotel-B',
          provider_reservation_id: 'PB-1',
          booking_status: 'confirmed',
          arrival_date: null,
          departure_date: null,
          provider_updated_at: nowIso,
          updated_at: nowIso,
        },
      ],
      contributions: [],
    });
    const page = await service.getReservations('hotel-A', { range: 'month' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].provider_reservation_id).toBe('PA-1');
  });

  it("bağlı contribution'ı embed eder", async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      reservations: [
        {
          id: 'r1',
          hotel_id: 'hotel-A',
          provider_reservation_id: 'PA-1',
          booking_status: 'confirmed',
          arrival_date: null,
          departure_date: null,
          provider_updated_at: nowIso,
          updated_at: nowIso,
        },
      ],
      contributions: [
        {
          id: 'c1',
          hotel_id: 'hotel-A',
          reservation_id: 'r1',
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          status: 'collected',
          collected_at: nowIso,
          refunded_at: null,
        },
      ],
    });
    const page = await service.getReservations('hotel-A', { range: 'month' });
    expect(page.items[0].contribution).toEqual(
      expect.objectContaining({ amount_minor: 500, status: 'collected' }),
    );
  });
});

describe('IntegrationsReadService.getContributionsSummary', () => {
  it('Toplam Katkı yalnızca collected eksi refund/partial_refund; para birimi bazında ayrıştırılır', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      contributions: [
        {
          id: 'c1',
          hotel_id: 'hotel-A',
          currency: 'EUR',
          amount_minor: 500,
          status: 'collected',
          updated_at: nowIso,
        },
        {
          id: 'c2',
          hotel_id: 'hotel-A',
          currency: 'EUR',
          amount_minor: 300,
          status: 'collected',
          updated_at: nowIso,
        },
        {
          id: 'c3',
          hotel_id: 'hotel-A',
          currency: 'EUR',
          amount_minor: 200,
          status: 'refunded',
          updated_at: nowIso,
        },
        {
          id: 'c4',
          hotel_id: 'hotel-A',
          currency: 'USD',
          amount_minor: 100,
          status: 'collected',
          updated_at: nowIso,
        },
        // pending/voided hiç sayılmaz.
        {
          id: 'c5',
          hotel_id: 'hotel-A',
          currency: 'EUR',
          amount_minor: 999,
          status: 'pending',
          updated_at: nowIso,
        },
        // başka otel -> asla karışmaz.
        {
          id: 'c6',
          hotel_id: 'hotel-B',
          currency: 'EUR',
          amount_minor: 999,
          status: 'collected',
          updated_at: nowIso,
        },
      ],
    });
    const summary = await service.getContributionsSummary('hotel-A', {
      range: 'month',
    });
    const eur = summary.totals.find((t) => t.currency === 'EUR')!;
    expect(eur.collected_total_minor).toBe(800);
    expect(eur.refunded_total_minor).toBe(200);
    expect(eur.net_contribution_minor).toBe(600);

    const usd = summary.totals.find((t) => t.currency === 'USD')!;
    expect(usd.collected_total_minor).toBe(100);
    expect(usd.net_contribution_minor).toBe(100);
  });

  it('seçilmiş pending katkılar (HotelRunner) ayrı toplanır, net katkıya girmez', async () => {
    const pending = (id: string, amount: number, selected = true) => ({
      id,
      hotel_id: 'hotel-A',
      selected,
      currency: 'TRY',
      amount_minor: amount,
      status: 'pending',
      updated_at: nowIso,
    });
    const { service } = makeService({
      hotels: [hotelRow()],
      contributions: [
        pending('p1', 4500),
        pending('p2', 9000),
        // Ekstra seçilmemiş rezervasyon: tutar 0, sayılmaz.
        pending('p3', 0, false),
        { ...pending('p4', 4500), status: 'voided' },
      ],
    });
    const summary = await service.getContributionsSummary('hotel-A', {
      range: 'month',
    });
    expect(summary.pending_count).toBe(2);
    expect(summary.contributions_count).toBe(0);
    expect(summary.totals).toEqual([
      {
        currency: 'TRY',
        collected_total_minor: 0,
        refunded_total_minor: 0,
        net_contribution_minor: 0,
        pending_total_minor: 13500,
      },
    ]);
  });

  it('1000 satır sınırını aşan dönemde tüm katkıları sayar', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({
      id: `c${String(i).padStart(5, '0')}`,
      hotel_id: 'hotel-A',
      selected: true,
      currency: 'EUR',
      amount_minor: 100,
      status: 'collected',
      updated_at: nowIso,
    }));
    const fake = makeFakeSupabase(
      { hotels: [hotelRow()], contributions: rows },
      { maxRows: 1000 },
    );
    const service = new IntegrationsReadService(fake as never);
    const summary = await service.getContributionsSummary('hotel-A', {
      range: 'month',
    });
    expect(summary.contributions_count).toBe(1500);
    expect(summary.totals[0].collected_total_minor).toBe(150000);
  });
});

describe('IntegrationsReadService.getIntegrationHealth', () => {
  it('secret_ref/webhook_routing_id ASLA döndürmez, yalnızca kendi otelinin entegrasyonlarını gösterir', async () => {
    const { service } = makeService({
      hotels: [hotelRow()],
      hotel_integrations: [
        {
          id: 'integ-A',
          hotel_id: 'hotel-A',
          provider: 'generic_signed_webhook',
          environment: 'sandbox',
          status: 'active',
          external_property_id: 'prop-A',
          secret_ref: 'super-secret-ref',
          webhook_routing_id: 'routing-A',
          created_at: nowIso,
        },
        {
          id: 'integ-B',
          hotel_id: 'hotel-B',
          provider: 'generic_signed_webhook',
          environment: 'sandbox',
          status: 'active',
          external_property_id: 'prop-B',
          secret_ref: 'other-secret',
          webhook_routing_id: 'routing-B',
          created_at: nowIso,
        },
      ],
      integration_deliveries: [],
    });
    const health = await service.getIntegrationHealth('hotel-A');
    expect(health.integrations).toHaveLength(1);
    expect(health.integrations[0].id).toBe('integ-A');
    expect(JSON.stringify(health.integrations[0])).not.toContain('secret');
    expect(JSON.stringify(health.integrations[0])).not.toContain('routing-A');
  });
});
