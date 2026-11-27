import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = { value: { access_token: 'TOKEN' } as { access_token: string } | null };
vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: async () => ({ data: { session: session.value } }) } }),
}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { calculatePeriodAction, publishMeasurementAction } from '../app/karbon-olcumu/actions';
import { CALC_IDLE, PUBLISH_IDLE } from '../lib/connecthub';
import { getSampleCalculation } from '../lib/sample/connecthub';

const MID = '11111111-1111-4111-8111-111111111111';
const STATUS = {
  api: 'connecthub', schema_ready: true, provider_configured: true, environment: 'sandbox',
  link: { id: 'link-1', unit_id: 'u', unit_name: 'U', environment: 'sandbox', linked_at: null, factor_inventory_id: null },
  environment_matches: true, write_key_ready: true, read_key_ready: true,
  profile: { country: 'Türkiye', country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000, meeting_area_m2: 600, updated_at: '' },
};
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null }));
const fail = (status: number, code: string) => new Response(JSON.stringify({ success: false, data: null, error: { code, message: 'iç ileti' } }), { status });

function router(calc: () => Response, status: unknown = STATUS) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    if (url.endsWith('/status')) return ok(status);
    if (url.endsWith('/calculate')) return calc();
    if (url.includes('/measurements/') && url.endsWith('/activate')) return ok({ measurement_id: MID, pricing: {} });
    return new Response('{}', { status: 404 });
  }));
  return calls;
}
const activations = (calls: { url: string }[]) => calls.filter((c) => c.url.endsWith('/activate'));
const form = (id = MID) => {
  const f = new FormData();
  f.set('measurementId', id);
  return f;
};

beforeEach(() => {
  session.value = { access_token: 'TOKEN' };
  revalidatePath.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  vi.stubEnv('NODE_ENV', 'development'); // örnek sonuçlar için
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('calculatePeriodAction', () => {
  it('sonucu döndürür; yalnız "calculated"da sayfalar yenilenir', async () => {
    router(() => ok(getSampleCalculation('onizleme')));
    const r = await calculatePeriodAction('2026-10', CALC_IDLE, new FormData());
    expect(r.status).toBe('result');
    expect(r.result?.status).toBe('preview_only');
    expect(revalidatePath).not.toHaveBeenCalled();
    router(() => ok(getSampleCalculation('hesaplandi')));
    await calculatePeriodAction('2026-10', CALC_IDLE, new FormData());
    expect(revalidatePath).toHaveBeenCalledWith('/karbon-olcumu/2026-10');
  });
  it('okuma anahtarı / profil yoksa sağlayıcıya istek yok', async () => {
    const calls = router(() => ok({}), { ...STATUS, read_key_ready: false });
    expect((await calculatePeriodAction('2026-10', CALC_IDLE, new FormData())).message).toMatch(/okuma yetkisi/);
    expect(calls.some((c) => c.url.endsWith('/calculate'))).toBe(false);
    const c2 = router(() => ok({}), { ...STATUS, profile: null });
    expect((await calculatePeriodAction('2026-10', CALC_IDLE, new FormData())).message).toMatch(/tesis profilini/);
    expect(c2.some((c) => c.url.endsWith('/calculate'))).toBe(false);
  });
  it('ay bitmediyse hesap yok', async () => {
    const calls = router(() => ok({}));
    expect((await calculatePeriodAction('2026-11', CALC_IDLE, new FormData())).status).toBe('error');
    expect(calls).toHaveLength(0);
  });
  it.each([
    [409, 'carbon_period_closed', /kapatılmış/],
    [400, 'carbon_occupancy_missing', /dolu oda-gece/],
    [503, 'carbon_provider_unavailable', /ulaşılamıyor/],
  ])('backend %s %s → kullanıcı metni', async (status, code, re) => {
    router(() => fail(status, code));
    expect((await calculatePeriodAction('2026-10', CALC_IDLE, new FormData())).message).toMatch(re);
  });
});

describe('publishMeasurementAction — mevcut widget fiyatı korunur', () => {
  it('yazılı izin: ülkesi doğrulanmış, Kapsam 1/2 güncel ölçüm yayına alınır (tek aktivasyon isteği)', async () => {
    const calls = router(() => ok(getSampleCalculation('hesaplandi')));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form());
    expect(r.status).toBe('success');
    expect(activations(calls)).toHaveLength(1);
    expect(activations(calls)[0]).toMatchObject({ method: 'POST' });
    expect(revalidatePath).toHaveBeenCalled();
  });
  it('Kapsam 3 içeren hesap → yayın yok, aktivasyon isteği GÖNDERİLMEZ', async () => {
    const base = getSampleCalculation('hesaplandi');
    const withScope3 =
      base.status === 'calculated'
        ? { ...base, calculation: { ...base.calculation, coverage: { ...base.calculation.coverage, scopes_calculated: [1, 2, 3] } } }
        : base;
    const calls = router(() => ok(withScope3));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form());
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Kapsam 1 ve 2/);
    expect(activations(calls)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('yalnız önizleme (yanlış ülke faktörü) → yayın yok', async () => {
    const calls = router(() => ok(getSampleCalculation('onizleme')));
    expect((await publishMeasurementAction('2026-10', PUBLISH_IDLE, form())).message).toMatch(/ülkesine uygunluğu doğrulanamadı/);
    expect(activations(calls)).toHaveLength(0);
  });
  it.each(['onay', 'eksik', 'veri-yok'] as const)('%s → yayın yok', async (s) => {
    const calls = router(() => ok(getSampleCalculation(s)));
    expect((await publishMeasurementAction('2026-10', PUBLISH_IDLE, form())).status).toBe('error');
    expect(activations(calls)).toHaveLength(0);
  });
  it('geçersiz ölçüm kimliği → hiçbir istek yok', async () => {
    const calls = router(() => ok({}));
    expect((await publishMeasurementAction('2026-10', PUBLISH_IDLE, form('../x'))).message).toBe('Geçersiz ölçüm.');
    expect(calls).toHaveLength(0);
  });
});
