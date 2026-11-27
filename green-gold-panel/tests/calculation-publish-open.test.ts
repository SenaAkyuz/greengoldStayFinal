/**
 * Yayın yolunun (aktivasyon isteği, güncel kimlik eşleşmesi, backend 409)
 * güvenli olduğunu, panel kapısından BAĞIMSIZ doğrular: kapı burada test için
 * açık taklit edilir. Gerçek kapı (yazılı izin, Kapsam 1+2, ülke) ayrı
 * testlerde (connecthub-logic, calculation-actions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'T' } } }) } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../lib/connecthub', async (orig) => {
  const real = await orig<typeof import('../lib/connecthub')>();
  return { ...real, publishGate: () => ({ allowed: true }) };
});

import { publishMeasurementAction } from '../app/karbon-olcumu/actions';
import { INTERNAL_USE_PUBLISH_ALLOWED, PUBLISH_IDLE } from '../lib/connecthub';
import { getSampleCalculation } from '../lib/sample/connecthub';

const MID = '11111111-1111-4111-8111-111111111111';
const STATUS = {
  api: 'connecthub', schema_ready: true, provider_configured: true, environment: 'sandbox',
  link: { id: 'l', unit_id: 'u', unit_name: 'U', environment: 'sandbox', linked_at: null, factor_inventory_id: null },
  environment_matches: true, write_key_ready: true, read_key_ready: true,
  profile: { country: 'Türkiye', country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000, meeting_area_m2: 600, updated_at: '' },
};
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null }));

function router(activate: () => Response) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    if (url.endsWith('/status')) return ok(STATUS);
    if (url.endsWith('/calculate')) return ok(getSampleCalculation('hesaplandi'));
    if (url.endsWith('/activate')) return activate();
    return new Response('{}', { status: 404 });
  }));
  return urls;
}
const form = (id: string) => {
  const f = new FormData();
  f.set('measurementId', id);
  return f;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  vi.stubEnv('NODE_ENV', 'development');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('yayın yolu (kapı test için açık)', () => {
  it('gerçek sabit: yazılı izinle açık', () => {
    expect(INTERNAL_USE_PUBLISH_ALLOWED).toBe(true);
  });
  it('kimlik güncel hesapla eşleşirse aktivasyon çağrılır', async () => {
    const urls = router(() => ok({ measurement_id: MID, pricing: {} }));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form(MID));
    expect(r.status).toBe('success');
    expect(urls.filter((u) => u.endsWith(`/measurements/${MID}/activate`))).toHaveLength(1);
  });
  it('veriler değişmişse (kimlik eşleşmiyor) aktivasyon yok', async () => {
    const urls = router(() => ok({}));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form('22222222-2222-4222-8222-222222222222'));
    expect(r.message).toMatch(/yeniden hesaplayın/);
    expect(urls.some((u) => u.endsWith('/activate'))).toBe(false);
  });
  it.each([
    ['carbon_measurement_internal_use', /kullanım izni olmadan/],
    ['carbon_measurement_scope_not_permitted', /Kapsam 1 ve 2/],
    ['carbon_measurement_country_unverified', /ülkesine uygunluğu/],
  ])('backend 409 (%s) verirse kullanıcı metni; başarı sayılmaz', async (code, re) => {
    router(() => new Response(JSON.stringify({ success: false, data: null, error: { code, message: 'x' } }), { status: 409 }));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form(MID));
    expect(r).toEqual({ status: 'error', message: expect.stringMatching(re) });
  });
  it('kaydedilmiş ölçümden yayın: tek yeniden hesap, kayıt gönderimi yok, aynı ölçüm etkinleşir', async () => {
    const urls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      urls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/status')) return ok(STATUS);
      // Aynı veri → backend mevcut ölçümü bulur (duplicate), yeni satır açmaz.
      if (url.endsWith('/calculate')) return ok(getSampleCalculation('kayitli'));
      if (url.endsWith('/activate')) return ok({ measurement_id: MID, pricing: {} });
      return new Response('{}', { status: 404 });
    }));
    const r = await publishMeasurementAction('2026-10', PUBLISH_IDLE, form(MID));
    expect(r.status).toBe('success');
    expect(urls.filter((u) => u.url.endsWith('/calculate'))).toHaveLength(1);
    expect(urls.some((u) => u.url.includes('/records') || u.url.includes('/occupancy'))).toBe(false);
    expect(urls.filter((u) => u.url.endsWith(`/measurements/${MID}/activate`))).toHaveLength(1);
  });
});
