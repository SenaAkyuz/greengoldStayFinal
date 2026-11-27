import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = { value: { access_token: 'TOKEN' } as { access_token: string } | null };
vi.mock('../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: async () => ({ data: { session: session.value } }) } }),
}));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { resendUncertain, saveOccupancyAction, submitPeriodEntries } from '../app/karbon-olcumu/actions';
import { ENTRY_IDLE } from '../lib/connecthub';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null }));
const STATUS = {
  api: 'connecthub', schema_ready: true, provider_configured: true, environment: 'sandbox',
  link: { id: 'link-1', unit_id: 'u', unit_name: 'U', environment: 'sandbox', linked_at: null, factor_inventory_id: null },
  environment_matches: true, write_key_ready: true, read_key_ready: true,
  profile: { country: 'Türkiye', country_code: 'TR', rooms: 40, total_area_m2: 3000, guestrooms_area_m2: 2000, meeting_area_m2: 0, updated_at: '' },
};
const ITEMS = [
  { id: 'e', code: 'E', name: 'Elektrik', resolution: 'month', resolution_kind: 'monthly', uoms: ['kWh'], monthly: true, scope: 2, factor_status: 'available', writable: true, blocked_reason: null },
];
const REC = (status: string) => ({
  id: 'r', item_id: 'e', item_code: 'E', item_name: 'Elektrik', period: '2026-10', quantity: 100, uom: 'kWh', note: null,
  status, provider_status: status === 'accepted' ? 'pending_approval' : null, provider_record_id: null, error_code: null, error_message: null, warnings: [], sent_at: '2026-11-01T00:00:00Z',
});

function router(over: { status?: unknown; records?: unknown[]; occupancy?: number | null; occupancyFail?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/status')) return ok(over.status ?? STATUS);
    if (url.includes('/items')) return ok(ITEMS);
    if (url.endsWith('/records') && init.method === 'POST') {
      return ok({ period: '2026-10', accepted: 1, rejected: 0, outcome_unknown: 0, period_closed: false, records: [] });
    }
    if (url.endsWith('/periods/2026-10/occupancy') && init.method === 'PUT') {
      if (over.occupancyFail) {
        return new Response(JSON.stringify({ success: false, data: null, error: { code: 'demo_read_only', message: 'x' } }), { status: over.occupancyFail });
      }
      const body = JSON.parse(init.body as string) as { occupied_room_nights: number };
      return ok({ period: '2026-10', environment: 'sandbox', occupied_room_nights: body.occupied_room_nights, measurement_id: null, records: [] });
    }
    if (url.endsWith('/periods/2026-10')) {
      return ok({ period: '2026-10', environment: 'sandbox', occupied_room_nights: over.occupancy ?? null, measurement_id: null, records: over.records ?? [] });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

beforeEach(() => {
  session.value = { access_token: 'TOKEN' };
  revalidatePath.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('submitPeriodEntries (Server Action)', () => {
  it('geçerli giriş: YALNIZ tüketim gönderilir (doluluk formda olsa bile okunmaz), hotel_id yok, sayfalar yenilenir', async () => {
    const calls = router();
    const s = await submitPeriodEntries('2026-10', ENTRY_IDLE, form({ occupancy: '1.000', 'q:e': '1.234,5', 'u:e': 'kWh', 'n:e': '' }));
    expect(s.status).toBe('success');
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(post.url).toMatch(/\/periods\/2026-10\/records$/);
    const body = JSON.parse(post.init.body as string);
    expect(body).toEqual({ lines: [{ item_id: 'e', quantity: 1234.5, uom: 'kWh' }] });
    expect(calls.some((c) => c.url.endsWith('/occupancy'))).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/hotel/);
    expect(revalidatePath).toHaveBeenCalledWith('/karbon-olcumu/2026-10');
  });

  it.each(['2026-11', '2026-12', '2026-13', 'abc'])('kapalı/geçersiz dönem %s → istek yok', async (p) => {
    const calls = router();
    expect((await submitPeriodEntries(p, ENTRY_IDLE, form({ 'q:e': '1', 'u:e': 'kWh' }))).status).toBe('error');
    expect(calls).toHaveLength(0);
  });

  it('bağlantı yoksa (sunucu kontrolü) kayıt gönderilmez', async () => {
    const calls = router({ status: { ...STATUS, link: null } });
    const s = await submitPeriodEntries('2026-10', ENTRY_IDLE, form({ 'q:e': '1', 'u:e': 'kWh' }));
    expect(s.message).toMatch(/bağlanmadı/);
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });

  it('tüketim boşsa (yalnız doluluk girilmiş) ölçüm ortağına hiçbir şey gönderilmez', async () => {
    const calls = router();
    const s = await submitPeriodEntries('2026-10', ENTRY_IDLE, form({ occupancy: '2000', 'q:e': '', 'u:e': 'kWh' }));
    expect(s.status).toBe('info');
    expect(calls.some((c) => c.init.method === 'POST' || c.init.method === 'PUT')).toBe(false);
  });

  it('kabul edilmiş kaydı değiştirmek onay ister; onayla gönderilir', async () => {
    let calls = router({ records: [REC('accepted')] });
    const first = await submitPeriodEntries('2026-10', ENTRY_IDLE, form({ 'q:e': '150', 'u:e': 'kWh' }));
    expect(first.status).toBe('confirm');
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
    calls = router({ records: [REC('accepted')] });
    const second = await submitPeriodEntries('2026-10', ENTRY_IDLE, form({ 'q:e': '150', 'u:e': 'kWh', confirmCorrections: '1' }));
    expect(second.status).toBe('success');
  });

  it('oturum yoksa istek yok', async () => {
    session.value = null;
    const calls = router();
    expect((await submitPeriodEntries('2026-10', ENTRY_IDLE, form({}))).message).toMatch(/Oturum/);
    expect(calls).toHaveLength(0);
  });
});

describe('saveOccupancyAction (yalnız doluluk — ölçüm ortağına istek yok)', () => {
  const requests = (calls: { url: string; init: RequestInit }[]) =>
    calls.map((c) => `${c.init.method ?? 'GET'} ${c.url.replace(/^.*\/connecthub/, '')}`);

  it('geçerli değer: yalnız PUT …/occupancy; kalem listesi, kayıt gönderimi YOK; sayfalar yenilenir', async () => {
    const calls = router();
    const s = await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '1.000' }));
    expect(s.status).toBe('success');
    expect(s.message).toMatch(/Ölçüm ortağına bir şey gönderilmedi/);
    expect(requests(calls)).toEqual(['GET /status', 'GET /periods/2026-10', 'PUT /periods/2026-10/occupancy']);
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(JSON.parse(put.init.body as string)).toEqual({ occupied_room_nights: 1000 });
    expect(revalidatePath).toHaveBeenCalledWith('/karbon-olcumu/2026-10');
  });

  it('değer değişmediyse PUT de atılmaz', async () => {
    const calls = router({ occupancy: 1000 });
    const s = await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '1000' }));
    expect(s.status).toBe('info');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('oda × gün sınırı (40 × 31 = 1.240) aşılırsa istek yok; alan hatası', async () => {
    const calls = router();
    const s = await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '1241' }));
    expect(s.status).toBe('error');
    expect(s.issues?.[0].item_id).toBe('occupancy');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it.each(['', '0', '-3', '12,5', 'abc'])('geçersiz değer %j → istek yok', async (v) => {
    const calls = router();
    expect((await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: v }))).status).toBe('error');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it('ölçüm ortağı bağlantısı/anahtarı olmasa da kaydedilir (yerel kayıt)', async () => {
    const calls = router({ status: { ...STATUS, link: null, write_key_ready: false, read_key_ready: false } });
    expect((await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '900' }))).status).toBe('success');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(true);
  });

  it('şema hazır değilse kaydedilmez', async () => {
    const calls = router({ status: { ...STATUS, schema_ready: false } });
    expect((await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '900' }))).status).toBe('error');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it('backend 403 (demo) → kullanıcı metni, başarı sayılmaz', async () => {
    router({ occupancyFail: 403 });
    const s = await saveOccupancyAction('2026-10', ENTRY_IDLE, form({ occupancy: '900' }));
    expect(s).toEqual({ status: 'error', message: 'Demo hesabında değişiklik yapılamaz.' });
  });

  it.each(['2026-11', 'abc'])('kapalı/geçersiz dönem %s → istek yok', async (p) => {
    const calls = router();
    expect((await saveOccupancyAction(p, ENTRY_IDLE, form({ occupancy: '900' }))).status).toBe('error');
    expect(calls).toHaveLength(0);
  });
});

describe('resendUncertain (Server Action)', () => {
  it('belirsiz kaydı kayıtlı değeriyle yeniden gönderir', async () => {
    const calls = router({ records: [REC('outcome_unknown')] });
    const s = await resendUncertain('2026-10', ENTRY_IDLE, new FormData());
    expect(s.status).toBe('success');
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(JSON.parse(post.init.body as string)).toEqual({ lines: [{ item_id: 'e', quantity: 100, uom: 'kWh' }] });
  });
  it('reddedilen kayıt otomatik yeniden gönderilmez', async () => {
    const calls = router({ records: [REC('rejected')] });
    const s = await resendUncertain('2026-10', ENTRY_IDLE, new FormData());
    expect(s).toEqual({ status: 'info', message: 'Yeniden gönderilecek belirsiz kayıt kalmadı.' });
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });
});
