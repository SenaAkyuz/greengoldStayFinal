import { afterEach, describe, expect, it, vi } from 'vitest';
import { connecthub } from '../lib/connecthub/client';
import { getHotel, getReport } from '../lib/api';
import {
  demoMeasurement,
  demoPeriods,
  demoReport,
  demoDaily,
  todayYmd,
} from '../lib/demo/dataset';

const NOW = new Date('2026-11-27T12:00:00Z');
const hotel = (role: string) => ({
  hotel_name: 'Demo Otel',
  city: 'Antalya',
  status: 'pending',
  timezone: 'Europe/Istanbul',
  currency: 'TRY',
  amount_per_night: 0,
  estimated_co2_per_night_kg: 0,
  commission_rate: 0,
  public_widget_key: 'pk_demo',
  allowed_origins: [],
  hotel_type: 'city',
  logo_url: null,
  brand_color: null,
  role,
});
function stub(role: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const data = url.endsWith('/dashboard/hotel')
        ? hotel(role)
        : { real: true };
      return new Response(
        JSON.stringify({ success: true, data, error: null }),
        { status: 200 },
      );
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('demo hesabı verisi — yalnız demo_viewer, yalnız okuma', () => {
  it('demo rolü: okuma uçları temsili veriyle; gerçek uca gidilmez', async () => {
    const calls = stub('demo_viewer');
    const r = await getReport('T', 'month');
    expect(r.data?.summary.views).toBeGreaterThan(0);
    expect(calls.every((c) => c.url.endsWith('/dashboard/hotel'))).toBe(true);
    const h = await getHotel('T');
    expect(h.data).toMatchObject({
      hotel_name: 'Demo Otel',
      public_widget_key: 'pk_demo',
      amount_per_night: 1.5,
      estimated_co2_per_night_kg: 60,
      currency: 'EUR',
    });
  });

  it('gerçek otel rolü: demo verisi ASLA dönmez', async () => {
    const calls = stub('hotel_admin');
    const r = await getReport('T', 'month');
    expect(r.data).toEqual({ real: true });
    expect(calls.some((c) => c.url.includes('/dashboard/report'))).toBe(true);
    expect((await getHotel('T')).data?.amount_per_night).toBe(0);
  });

  it("yazma istekleri taklit edilmez: demo da API'ye gider (API 403 verir)", async () => {
    const calls = stub('demo_viewer');
    await connecthub.setOccupancy('T', '2026-10', 1000);
    expect(
      calls.some(
        (c) =>
          c.init.method === 'PUT' &&
          c.url.endsWith('/periods/2026-10/occupancy'),
      ),
    ).toBe(true);
  });

  it('tutarlılık: günlük seri = rapor toplamı; emisyon = oda-gece × 60; aktif ölçüm 60 kg / 1,50 EUR', () => {
    const range = { from: '2026-11-01', to: todayYmd(NOW) };
    const rep = demoReport(range);
    const daily = demoDaily(range);
    expect(daily.days.reduce((a, d) => a + d.viewed, 0)).toBe(
      rep.summary.views,
    );
    expect(daily.days.reduce((a, d) => a + d.clicked, 0)).toBe(
      rep.funnel.stages.clicked,
    );
    expect(rep.carbon.estimated_co2_kg).toBe(
      rep.carbon.total_selected_nights * 60,
    );
    const list = demoPeriods(2026, NOW);
    const active = list.periods.filter((p) => p.measurement?.is_active);
    expect(active.map((p) => p.period)).toEqual(['2026-10']);
    expect(list.periods.find((p) => p.period === '2026-11')?.status).toBe(
      'in_progress',
    );
    const m = demoMeasurement('2026-10', NOW).measurement!;
    expect(m.pricing.coefficient_kg).toBeCloseTo(60, 6);
    expect(m.pricing.amount_per_night).toBe(1.5);
    expect(m.is_active).toBe(true);
  });
});
