import { describe, expect, it, vi } from 'vitest';
import {
  ENTRY_IDLE,
  FIELD,
  draftsFromForm,
  entryStateFromOutcome,
  groupItems,
  isSafeRetry,
  isValidPeriod,
  lastCompletedPeriod,
  maxOccupancyFor,
  periodEditability,
  planSubmission,
  readinessText,
  recordDisplayStatus,
  recordNote,
  resendUncertainRecords,
  submitPlannedPeriod,
  uomLabel,
  type ActivityRecord,
  type ApiResult,
  type ConnectHubItem,
  type PeriodDetail,
  type SubmitPeriodInput,
} from '@/lib/connecthub';

const NOW = new Date('2026-11-26T12:00:00Z');
const item = (over: Partial<ConnectHubItem> & Pick<ConnectHubItem, 'id' | 'name'>): ConnectHubItem => ({
  code: null, resolution: 'month', resolution_kind: 'monthly', uoms: ['kWh'], monthly: true, scope: 1,
  factor_status: 'available', writable: true, blocked_reason: null, ...over,
});
const rec = (over: Partial<ActivityRecord> & Pick<ActivityRecord, 'item_id'>): ActivityRecord => ({
  id: `r-${over.item_id}`, item_code: null, item_name: 'X', period: '2026-10', quantity: 10, uom: 'kWh', note: null,
  status: 'accepted', provider_status: 'pending_approval', provider_record_id: 'p', error_code: null, error_message: null,
  warnings: [], sent_at: '2026-11-01T00:00:00Z', ...over,
});

describe('dönem kuralları', () => {
  it('geçerli dönem biçimi ve yıl aralığı', () => {
    expect(isValidPeriod('2026-10')).toBe(true);
    for (const p of ['2026-13', '2026-1', '1999-01', '2101-01', '2026-10/x', '']) expect(isValidPeriod(p)).toBe(false);
  });
  it('ayın açıklığı UTC "bugün"e göre (backend ile aynı)', () => {
    expect(periodEditability('2026-10', NOW)).toBe('open');
    expect(periodEditability('2026-11', NOW)).toBe('in_progress');
    expect(periodEditability('2026-12', NOW)).toBe('future');
    expect(periodEditability('2026-11', new Date('2026-12-01T00:30:00Z'))).toBe('open');
  });
  it('son tamamlanmış ay ve yıl dönümü', () => {
    expect(lastCompletedPeriod(NOW)).toBe('2026-10');
    expect(lastCompletedPeriod(new Date('2027-01-05T00:00:00Z'))).toBe('2026-12');
  });
  it('doluluk üst sınırı: oda × gün (şubat, artık yıl)', () => {
    expect(maxOccupancyFor('2026-10', 40)).toBe(1240);
    expect(maxOccupancyFor('2028-02', 10)).toBe(290);
    expect(maxOccupancyFor('2026-10', null)).toBeUndefined();
  });
  it('plan doluluk üst sınırını uygular', () => {
    const items = [item({ id: 'e', name: 'Elektrik' })];
    const p = planSubmission({ drafts: [], items, existing: [], occupancy: '1241', maxOccupancy: 1240, now: NOW });
    expect(p.errors[0]).toMatchObject({ item_id: 'occupancy', message: expect.stringMatching(/en fazla 1\.240/) });
    expect(planSubmission({ drafts: [], items, existing: [], occupancy: '1240', maxOccupancy: 1240, now: NOW }).occupied_room_nights).toBe(1240);
  });
});

describe('dinamik kalemler', () => {
  const items = [
    item({ id: 'su', name: 'Şebeke suyu', scope: 3, uoms: ['m3'] }),
    item({ id: 'ozel', name: 'Otele özel kalem', scope: null, uoms: ['palet'] }),
    item({ id: 'arac', name: 'Araçlar', writable: false, blocked_reason: 'not_monthly' }),
    item({ id: 'gaz', name: 'Doğalgaz', scope: 1 }),
    item({ id: 'elk', name: 'Elektrik', scope: 2 }),
  ];
  it('kapsama göre gruplar; kapsamı olmayan "Diğer" en sonda; yazılabilirler önce', () => {
    const g = groupItems(items);
    expect(g.map((x) => x.key)).toEqual(['s1', 's2', 's3', 'other']);
    expect(g[0].items.map((i) => i.id)).toEqual(['gaz', 'arac']);
    expect(g[3]).toMatchObject({ title: 'Diğer kalemler', items: [{ id: 'ozel' }] });
  });
  it('ölçü birimi etiketi; bilinmeyen (otele özel) kod aynen', () => {
    expect(uomLabel('m3')).toBe('m³');
    expect(uomLabel('KWH')).toBe('kWh');
    expect(uomLabel('L')).toBe('Litre');
    expect(uomLabel('palet')).toBe('palet');
  });
  it('otele özel birim API listesinde olduğu sürece kabul edilir; başka birim reddedilir', () => {
    const ok = planSubmission({ drafts: [{ item_id: 'ozel', quantity: '3', uom: 'palet' }], items, existing: [], now: NOW });
    expect(ok.lines[0]).toMatchObject({ item_id: 'ozel', uom: 'palet', quantity: 3 });
    const bad = planSubmission({ drafts: [{ item_id: 'ozel', quantity: '3', uom: 'kg' }], items, existing: [], now: NOW });
    expect(bad.errors[0].message).toMatch(/palet/);
  });
  it('FormData → taslaklar (boş not atlanır, alan adları kimlikle)', () => {
    const f = new FormData();
    f.set(FIELD.quantity('a-1'), '1.200,5');
    f.set(FIELD.uom('a-1'), 'kWh');
    f.set(FIELD.note('a-1'), '  fatura 12 ');
    f.set(FIELD.quantity('b'), '');
    f.set(FIELD.uom('b'), 'm3');
    f.set(FIELD.note('b'), '   ');
    f.set('occupancy', '2000');
    expect(draftsFromForm(f)).toEqual([
      { item_id: 'a-1', quantity: '1.200,5', uom: 'kWh', note: 'fatura 12' },
      { item_id: 'b', quantity: '', uom: 'm3' },
    ]);
  });
});

describe('güvenli yeniden gönderim', () => {
  it('yalnız belirsiz ve takılmış; reddedilen ve yoldaki değil', () => {
    expect(isSafeRetry({ status: 'outcome_unknown', sent_at: null }, NOW)).toBe(true);
    expect(isSafeRetry({ status: 'sending', sent_at: '2026-11-26T11:50:00Z' }, NOW)).toBe(true);
    expect(isSafeRetry({ status: 'sending', sent_at: '2026-11-26T11:58:00Z' }, NOW)).toBe(false);
    expect(isSafeRetry({ status: 'rejected', sent_at: null }, NOW)).toBe(false);
    expect(isSafeRetry({ status: 'accepted', sent_at: null }, NOW)).toBe(false);
  });
  it('takılmış gönderim ekranda "sonuç belirsiz"', () => {
    expect(recordDisplayStatus({ status: 'sending', provider_status: null, sent_at: '2026-11-26T11:00:00Z' }, NOW)).toBe('outcome_unknown');
    expect(recordDisplayStatus({ status: 'sending', provider_status: null, sent_at: '2026-11-26T11:59:00Z' }, NOW)).toBe('sending');
  });
  it('kayıt notları kullanıcı dilinde', () => {
    expect(recordNote(rec({ item_id: 'x', status: 'rejected', error_message: 'Out of range' }), NOW)).toMatch(/kabul etmedi: Out of range\. Değeri düzeltip/);
    expect(recordNote(rec({ item_id: 'x', status: 'outcome_unknown' }), NOW)).toMatch(/mükerrer kayıt oluşmaz/);
    expect(recordNote(rec({ item_id: 'x' }), NOW)).toBeNull();
  });
  it('hazırlık metinleri', () => {
    expect(readinessText({ ready: false, reason: 'not_linked' })).toMatch(/bağlanmadı/);
    expect(readinessText({ ready: true })).toBeNull();
  });
});

// --- Sunucu akışı ------------------------------------------------------

const ok = <T,>(data: T): ApiResult<T> => ({ data, error: null, code: null, status: 200 });
const ITEMS = [item({ id: 'e', name: 'Elektrik' }), item({ id: 'g', name: 'Doğalgaz', uoms: ['m3'] }), item({ id: 'j', name: 'Jeneratör', uoms: ['L'] })];
function api(records: ActivityRecord[]) {
  const detail: PeriodDetail = { period: '2026-10', environment: 'sandbox', occupied_room_nights: 1000, measurement_id: null, records };
  const sent: SubmitPeriodInput[] = [];
  return {
    sent,
    api: {
      items: vi.fn(async () => ok(ITEMS)),
      period: vi.fn(async () => ok(detail)),
      setOccupancy: vi.fn(async () => ok(detail)),
      submitRecords: vi.fn(async (_t: string, _p: string, body: SubmitPeriodInput) => {
        sent.push(body);
        return ok({ period: '2026-10', accepted: body.lines.length, rejected: 0, outcome_unknown: 0, period_closed: false, records });
      }),
    },
  };
}
const base = { token: 'T', lockScope: 'link-1', period: '2026-10', now: NOW };

describe('resendUncertainRecords', () => {
  it('yalnız belirsiz/takılmış kayıtları KAYITLI değerleriyle gönderir; reddedilene dokunmaz', async () => {
    const f = api([
      rec({ item_id: 'e', status: 'accepted' }),
      rec({ item_id: 'g', status: 'outcome_unknown', quantity: 500, uom: 'm3', note: 'n1' }),
      rec({ item_id: 'j', status: 'rejected', quantity: 1, uom: 'L' }),
    ]);
    const r = await resendUncertainRecords({ ...base, api: f.api });
    expect(r.kind).toBe('sent');
    expect(f.sent).toEqual([{ lines: [{ item_id: 'g', quantity: 500, uom: 'm3', note: 'n1' }] }]);
  });
  it('belirsiz kayıt yoksa istek yok', async () => {
    const f = api([rec({ item_id: 'e' })]);
    expect((await resendUncertainRecords({ ...base, api: f.api })).kind).toBe('nothing_to_send');
    expect(f.api.submitRecords).not.toHaveBeenCalled();
  });
  it('form gönderimiyle aynı kilidi paylaşır (çift gönderim yok)', async () => {
    const f = api([rec({ item_id: 'g', status: 'outcome_unknown', uom: 'm3' })]);
    let release!: () => void;
    f.api.submitRecords.mockImplementationOnce(async (_t, _p, body) => {
      await new Promise<void>((res) => (release = res));
      return ok({ period: '2026-10', accepted: body.lines.length, rejected: 0, outcome_unknown: 0, period_closed: false, records: [] });
    });
    const first = submitPlannedPeriod({ ...base, api: f.api, drafts: [{ item_id: 'e', quantity: '5', uom: 'kWh' }], confirmCorrections: false });
    await vi.waitFor(() => expect(f.api.submitRecords).toHaveBeenCalledTimes(1));
    expect((await resendUncertainRecords({ ...base, api: f.api })).kind).toBe('busy');
    release();
    await first;
  });
  it('yalnız doluluk değişirse occupancy_saved', async () => {
    const f = api([]);
    expect((await submitPlannedPeriod({ ...base, api: f.api, drafts: [], occupancy: '1100', confirmCorrections: false })).kind).toBe('occupancy_saved');
  });
});

describe('entryStateFromOutcome — kullanıcı dostu sonuç', () => {
  it('düzeltme onayı: eski → yeni değer listelenir', () => {
    const plan = planSubmission({
      drafts: [{ item_id: 'g', quantity: '6.200', uom: 'm3' }],
      items: ITEMS,
      existing: [rec({ item_id: 'g', quantity: 6150, uom: 'm3' })],
      now: NOW,
    });
    const s = entryStateFromOutcome({ kind: 'needs_confirmation', plan });
    expect(s.status).toBe('confirm');
    expect(s.corrections).toEqual([{ item_id: 'g', item_name: 'Doğalgaz', from: '6.150 m³', to: '6.200 m³' }]);
    expect(s.message).toMatch(/yeni kayıt açılmaz/);
  });
  it('geçersiz: hiçbir kayıt gönderilmedi + kalem hataları', () => {
    const plan = planSubmission({ drafts: [{ item_id: 'e', quantity: 'abc', uom: 'kWh' }], items: ITEMS, existing: [], now: NOW });
    const s = entryStateFromOutcome({ kind: 'invalid', plan });
    expect(s).toMatchObject({ status: 'error', message: expect.stringMatching(/hiçbir kayıt gönderilmedi/), issues: [{ item_id: 'e' }] });
  });
  it('gönderildi: sorun varsa uyarı tonu; atlanan kalemler not edilir', () => {
    const plan = planSubmission({
      drafts: [{ item_id: 'e', quantity: '10', uom: 'kWh' }, { item_id: 'g', quantity: '5', uom: 'm3' }],
      items: ITEMS, existing: [rec({ item_id: 'e' })], now: NOW,
    });
    const s = entryStateFromOutcome({ kind: 'sent', plan, result: { period: '2026-10', accepted: 0, rejected: 0, outcome_unknown: 1, period_closed: false, records: [] } });
    expect(s.status).toBe('warning');
    expect(s.message).toMatch(/sonucu belirsiz/);
    expect(s.skippedNote).toMatch(/1 kalem değişmediği için/);
  });
  it('meşgul ve boş durumlar', () => {
    expect(entryStateFromOutcome({ kind: 'busy' }).message).toMatch(/zaten sürüyor/);
    const empty = planSubmission({ drafts: [{ item_id: 'e', quantity: '', uom: 'kWh' }], items: ITEMS, existing: [], now: NOW });
    expect(entryStateFromOutcome({ kind: 'nothing_to_send', plan: empty }).message).toBe('Gönderilecek değer girilmedi.');
    expect(ENTRY_IDLE.status).toBe('idle');
  });
});
