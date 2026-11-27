import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR,
  connecthub,
  submitPlannedPeriod,
  summarizeSent,
  userMessage,
  type ActivityRecord,
  type ApiResult,
  type ConnectHubItem,
  type PeriodDetail,
  type SubmitPeriodInput,
} from '@/lib/connecthub';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('connecthub istemcisi', () => {
  it('Bearer token gönderir, hotel_id göndermez, önbelleğe almaz', async () => {
    const fn = stubFetch(200, { success: true, data: { ok: 1 }, error: null });
    await connecthub.periods('TOKEN', 2026);
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/dashboard\/carbon-provider\/connecthub\/periods\?year=2026$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    expect(init.cache).toBe('no-store');
    expect(url).not.toMatch(/hotel/);
  });

  it('PUT/POST gövdesi JSON', async () => {
    const fn = stubFetch(200, { success: true, data: {}, error: null });
    await connecthub.setOccupancy('T', '2026-10', 2000);
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/periods\/2026-10\/occupancy$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ occupied_room_nights: 2000 });
  });

  it('geçersiz dönem URL\'e girmez', () => {
    stubFetch(200, {});
    expect(() => connecthub.period('T', '2026-10/../x')).toThrow(/Geçersiz dönem/);
    expect(() => connecthub.items('T', 20.5)).toThrow(/Geçersiz yıl/);
  });

  it('hata zarfındaki kod korunur', async () => {
    stubFetch(409, { success: false, data: null, error: { code: 'carbon_period_closed', message: 'closed' } });
    const r = await connecthub.calculate('T', '2026-10');
    expect(r).toMatchObject({ data: null, code: 'carbon_period_closed', status: 409 });
    expect(userMessage(r)).toMatch(/kapatılmış/);
  });

  it('ağ hatası ve JSON olmayan yanıt güvenli döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const a = await connecthub.status('T');
    expect(a.code).toBe('network');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    const b = await connecthub.status('T');
    expect(b).toMatchObject({ code: 'internal_error', status: 502 });
    expect(userMessage(b)).toBe(GENERIC_ERROR);
  });

  it('bilinmeyen 500 iletisi ekrana basılmaz; 400 doğrulama iletisi basılır', () => {
    expect(userMessage({ code: 'x', status: 500, error: 'stack trace' })).toBe(GENERIC_ERROR);
    expect(userMessage({ code: 'bad_request', status: 400, error: 'Ölçü birimi kWh olmalı.' })).toBe('Ölçü birimi kWh olmalı.');
    expect(userMessage({ code: 'demo_read_only', status: 403, error: 'x' })).toMatch(/Demo/);
    expect(userMessage({ code: 'carbon_measurement_internal_use', status: 409, error: 'x' })).toMatch(/kullanım izni/);
  });
});

// --- Gönderim akışı -------------------------------------------------------

const ok = <T,>(data: T): ApiResult<T> => ({ data, error: null, code: null, status: 200 });
const ITEMS: ConnectHubItem[] = [
  {
    id: 'e1', code: 'ELEK', name: 'Elektrik', resolution: 'month', resolution_kind: 'monthly',
    uoms: ['kWh'], monthly: true, scope: 2, factor_status: 'available', writable: true, blocked_reason: null,
  },
];
const accepted: ActivityRecord = {
  id: 'r', item_id: 'e1', item_code: 'ELEK', item_name: 'Elektrik', period: '2026-10', quantity: 1000,
  uom: 'kWh', note: null, status: 'accepted', provider_status: 'pending_approval', provider_record_id: 'p',
  error_code: null, error_message: null, warnings: [], sent_at: '2026-11-01T00:00:00Z',
};

function fakeApi(records: ActivityRecord[] = [], occupancy: number | null = null) {
  const detail: PeriodDetail = { period: '2026-10', environment: 'sandbox', occupied_room_nights: occupancy, measurement_id: null, records };
  const submitted: SubmitPeriodInput[] = [];
  const waiting: (() => void)[] = [];
  const gate = { hold: false };
  const api = {
    items: vi.fn(async () => ok(ITEMS)),
    period: vi.fn(async () => ok(detail)),
    setOccupancy: vi.fn(async () => ok(detail)),
    submitRecords: vi.fn(async (_t: string, _p: string, body: SubmitPeriodInput) => {
      submitted.push(body);
      if (gate.hold) await new Promise<void>((r) => waiting.push(r));
      return ok({ period: '2026-10', accepted: body.lines.length, rejected: 0, outcome_unknown: 0, period_closed: false, records });
    }),
  };
  return { api, submitted, gate, release: () => waiting.shift()?.() };
}
const base = { token: 'T', lockScope: 'hotel-A', period: '2026-10', now: new Date('2026-11-26T12:00:00Z') };

describe('submitPlannedPeriod', () => {
  it('yalnız plandaki satırlar gönderilir; doluluk değiştiyse eklenir', async () => {
    const f = fakeApi();
    const r = await submitPlannedPeriod({ ...base, api: f.api, drafts: [{ item_id: 'e1', quantity: '1.000', uom: 'kWh' }], occupancy: '2000', confirmCorrections: false });
    expect(r.kind).toBe('sent');
    expect(f.submitted).toEqual([{ occupied_room_nights: 2000, lines: [{ item_id: 'e1', quantity: 1000, uom: 'kWh' }] }]);
  });

  it('değişmemiş kabul edilmiş kayıt → sağlayıcıya istek YOK', async () => {
    const f = fakeApi([accepted], 2000);
    const r = await submitPlannedPeriod({ ...base, api: f.api, drafts: [{ item_id: 'e1', quantity: '1000', uom: 'kWh' }], occupancy: '2000', confirmCorrections: false });
    expect(r.kind).toBe('nothing_to_send');
    expect(f.api.submitRecords).not.toHaveBeenCalled();
    expect(f.api.setOccupancy).not.toHaveBeenCalled();
  });

  it('yalnız doluluk değiştiyse sağlayıcıya gitmeden kaydedilir', async () => {
    const f = fakeApi([accepted], 2000);
    await submitPlannedPeriod({ ...base, api: f.api, drafts: [], occupancy: '2100', confirmCorrections: false });
    expect(f.api.setOccupancy).toHaveBeenCalledWith('T', '2026-10', 2100);
    expect(f.api.submitRecords).not.toHaveBeenCalled();
  });

  it('düzeltme onaysız gönderilmez, onayla gönderilir', async () => {
    const f = fakeApi([accepted]);
    const drafts = [{ item_id: 'e1', quantity: '1200', uom: 'kWh' }];
    expect((await submitPlannedPeriod({ ...base, api: f.api, drafts, confirmCorrections: false })).kind).toBe('needs_confirmation');
    expect(f.api.submitRecords).not.toHaveBeenCalled();
    expect((await submitPlannedPeriod({ ...base, api: f.api, drafts, confirmCorrections: true })).kind).toBe('sent');
  });

  it('geçersiz form → invalid, istek yok', async () => {
    const f = fakeApi();
    const r = await submitPlannedPeriod({ ...base, api: f.api, drafts: [{ item_id: 'e1', quantity: 'x', uom: 'kWh' }], confirmCorrections: false });
    expect(r.kind).toBe('invalid');
    expect(f.api.submitRecords).not.toHaveBeenCalled();
  });

  it('aynı otel+dönem için eşzamanlı ikinci gönderim → busy (çift tıklama)', async () => {
    const f = fakeApi();
    f.gate.hold = true;
    const drafts = [{ item_id: 'e1', quantity: '1000', uom: 'kWh' }];
    const first = submitPlannedPeriod({ ...base, api: f.api, drafts, confirmCorrections: false });
    await vi.waitFor(() => expect(f.api.submitRecords).toHaveBeenCalledTimes(1));
    const second = await submitPlannedPeriod({ ...base, api: f.api, drafts, confirmCorrections: false });
    expect(second.kind).toBe('busy');
    // Başka otel kilitlenmez:
    const other = submitPlannedPeriod({ ...base, lockScope: 'hotel-B', api: f.api, drafts, confirmCorrections: false });
    await vi.waitFor(() => expect(f.api.submitRecords).toHaveBeenCalledTimes(2));
    f.release();
    expect((await first).kind).toBe('sent');
    f.release();
    await other;
    // Kilit bırakıldı:
    f.gate.hold = false;
    expect((await submitPlannedPeriod({ ...base, api: f.api, drafts, confirmCorrections: false })).kind).toBe('sent');
  });

  it('okuma hatası kullanıcı metnine çevrilir; kilit yine bırakılır', async () => {
    const f = fakeApi();
    f.api.items.mockResolvedValueOnce({ data: null, error: 'x', code: 'carbon_provider_unavailable', status: 503 });
    const r = await submitPlannedPeriod({ ...base, api: f.api, drafts: [], confirmCorrections: false });
    expect(r).toEqual({ kind: 'error', message: expect.stringMatching(/ulaşılamıyor/) });
    expect((await submitPlannedPeriod({ ...base, api: f.api, drafts: [], confirmCorrections: false })).kind).toBe('nothing_to_send');
  });

  it('summarizeSent', () => {
    expect(summarizeSent({ period: '2026-10', accepted: 2, rejected: 1, outcome_unknown: 1, period_closed: false, records: [] }))
      .toBe('2 kayıt alındı, onay bekliyor · 1 kayıt kabul edilmedi · 1 kaydın sonucu belirsiz (yeniden göndermek güvenli)');
  });
});
