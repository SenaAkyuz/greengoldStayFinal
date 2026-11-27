import { describe, expect, it } from 'vitest';
import {
  INTERNAL_USE_PUBLISH_ALLOWED,
  PERMITTED_SCOPES,
  scopesPermitted,
  SENDING_STALE_MS,
  calculationUiStatus,
  canCalculate,
  canSubmit,
  parseQuantity,
  periodUiStatus,
  planSubmission,
  factorPendingNote,
  providerFactorReasonText,
  publishGate,
  publishGateText,
  recordUiStatus,
  resendDrafts,
  type ActivityRecord,
  type CalculatePeriodResult,
  type ConnectHubItem,
  type ConnectHubStatus,
} from '@/lib/connecthub';

const NOW = new Date('2026-11-26T12:00:00Z');
const ELEC = 'e1';
const GAS = 'g1';
const FUEL = 'f1';

const item = (over: Partial<ConnectHubItem>): ConnectHubItem => ({
  id: ELEC,
  code: 'ELEK',
  name: 'Elektrik',
  resolution: 'month',
  resolution_kind: 'monthly',
  uoms: ['kWh', 'MWh'],
  monthly: true,
  scope: 2,
  factor_status: 'available',
  writable: true,
  blocked_reason: null,
  ...over,
});
const ITEMS = [
  item({}),
  item({ id: GAS, code: 'DG', name: 'Doğalgaz', uoms: ['m3'], scope: 1 }),
  item({
    id: FUEL,
    code: 'ARAC',
    name: 'Araçlar',
    factor_status: 'option_required',
    writable: false,
    blocked_reason: 'option_required',
  }),
];
const rec = (over: Partial<ActivityRecord>): ActivityRecord => ({
  id: 'r',
  item_id: ELEC,
  item_code: 'ELEK',
  item_name: 'Elektrik',
  period: '2026-10',
  quantity: 1000,
  uom: 'kWh',
  note: null,
  status: 'accepted',
  provider_status: 'pending_approval',
  provider_record_id: 'p1',
  error_code: null,
  error_message: null,
  warnings: [],
  sent_at: '2026-11-01T10:00:00Z',
  ...over,
});
const plan = (drafts: { item_id: string; quantity: string; uom: string; note?: string }[], existing: ActivityRecord[] = [], occupancy?: string) =>
  planSubmission({ drafts, items: ITEMS, existing, occupancy, now: NOW });

describe('parseQuantity (tr-TR)', () => {
  it.each([
    ['1000', 1000],
    ['1.234,5', 1234.5],
    ['1234,5', 1234.5],
    ['1234.5', 1234.5],
    [' 12 500 ', 12500],
    ['0', 0],
  ])('%s → %s', (raw, n) => expect(parseQuantity(raw)).toBe(n));
  it.each(['', 'abc', '-5', '1,2,3', '1e5'])('%s → null', (raw) => expect(parseQuantity(raw)).toBeNull());
});

describe('planSubmission — mükerrer koruması', () => {
  it('yeni kayıt → new', () => {
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh' }]);
    expect(p.errors).toEqual([]);
    expect(p.lines).toEqual([{ item_id: ELEC, quantity: 1000, uom: 'kWh', action: 'new', item_name: 'Elektrik' }]);
    expect(p.needs_confirmation).toBe(false);
  });

  it('kabul edilmiş ve değişmemiş kayıt GÖNDERİLMEZ', () => {
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh' }], [rec({})]);
    expect(p.lines).toEqual([]);
    expect(p.skipped).toEqual([{ item_id: ELEC, item_name: 'Elektrik', reason: 'unchanged' }]);
  });

  it('kabul edilmiş kaydın değeri değişirse düzeltme → açık onay gerekir', () => {
    const p = plan([{ item_id: ELEC, quantity: '1200', uom: 'kWh' }], [rec({})]);
    expect(p.lines[0].action).toBe('correction');
    expect(p.needs_confirmation).toBe(true);
  });

  it('not değişikliği de düzeltmedir', () => {
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh', note: 'fatura #12' }], [rec({})]);
    expect(p.lines[0].action).toBe('correction');
  });

  it.each(['outcome_unknown', 'rejected'] as const)('%s kayıt aynı kimlikle yeniden gönderilir (onaysız)', (status) => {
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh' }], [rec({ status })]);
    expect(p.lines[0].action).toBe('resend');
    expect(p.needs_confirmation).toBe(false);
  });

  it('yolda olan kayıt süre dolmadan tekrar gönderilmez', () => {
    const recent = new Date(NOW.getTime() - SENDING_STALE_MS + 1000).toISOString();
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh' }], [rec({ status: 'sending', sent_at: recent })]);
    expect(p.lines).toEqual([]);
    expect(p.skipped[0].reason).toBe('in_flight');
  });

  it('takılmış (süresi dolmuş) gönderim yeniden gönderilebilir', () => {
    const old = new Date(NOW.getTime() - SENDING_STALE_MS).toISOString();
    const p = plan([{ item_id: ELEC, quantity: '1000', uom: 'kWh' }], [rec({ status: 'sending', sent_at: old })]);
    expect(p.lines[0].action).toBe('resend');
  });

  it('aynı kalem iki kez → hata', () => {
    const p = plan([
      { item_id: ELEC, quantity: '1', uom: 'kWh' },
      { item_id: ELEC, quantity: '2', uom: 'kWh' },
    ]);
    expect(p.errors).toHaveLength(1);
    expect(p.lines).toHaveLength(1);
  });

  it('boş satır atlanır; yazılamayan kaleme değer girilirse gerekçeli hata', () => {
    const p = plan([
      { item_id: GAS, quantity: '', uom: 'm3' },
      { item_id: FUEL, quantity: '50', uom: 'kWh' },
    ]);
    expect(p.skipped).toEqual([{ item_id: GAS, item_name: 'Doğalgaz', reason: 'empty' }]);
    expect(p.errors[0].message).toMatch(/seçim/);
  });

  it('geçersiz miktar, birim ve bilinmeyen kalem → hata', () => {
    const p = plan([
      { item_id: ELEC, quantity: 'abc', uom: 'kWh' },
      { item_id: GAS, quantity: '5', uom: 'kWh' },
      { item_id: 'x', quantity: '5', uom: 'kWh' },
    ]);
    expect(p.errors.map((e) => e.item_id)).toEqual([ELEC, GAS, 'x']);
    expect(p.lines).toEqual([]);
  });

  it('doluluk: geçerli tam sayı alınır, ondalık/sıfır hata', () => {
    expect(plan([], [], '2.150').occupied_room_nights).toBe(2150);
    expect(plan([], [], '0').errors[0].item_id).toBe('occupancy');
    expect(plan([], [], '12,5').errors[0].item_id).toBe('occupancy');
  });
});

describe('resendDrafts', () => {
  it('yalnız belirsiz ve takılmış kayıtlar, aynı değerlerle (reddedilen HARİÇ: aynı değer yine reddedilir)', () => {
    const recent = new Date(NOW.getTime() - 1000).toISOString();
    const drafts = resendDrafts(
      [
        rec({ item_id: 'a', status: 'outcome_unknown', note: 'n' }),
        rec({ item_id: 'b', status: 'rejected' }),
        rec({ item_id: 'c', status: 'accepted' }),
        rec({ item_id: 'd', status: 'sending', sent_at: recent }),
        rec({ item_id: 'e', status: 'sending', sent_at: null }),
      ],
      NOW,
    );
    expect(drafts.map((d) => d.item_id)).toEqual(['a', 'e']);
    expect(drafts[0]).toEqual({ item_id: 'a', quantity: '1000', uom: 'kWh', note: 'n' });
  });
});

describe('durum eşlemeleri', () => {
  it('kabul edilen kayıt sağlayıcı onaylamadıkça "onay bekliyor"', () => {
    expect(recordUiStatus({ status: 'accepted', provider_status: 'pending_approval' })).toBe('pending_approval');
    expect(recordUiStatus({ status: 'accepted', provider_status: null })).toBe('pending_approval');
    expect(recordUiStatus({ status: 'accepted', provider_status: 'approved' })).toBe('approved');
    expect(recordUiStatus({ status: 'outcome_unknown', provider_status: null })).toBe('outcome_unknown');
  });
  it('dönem listesi: submitted → onay bekliyor; diğerleri aynen', () => {
    expect(periodUiStatus({ status: 'submitted' })).toBe('awaiting_approval');
    expect(periodUiStatus({ status: 'published' })).toBe('published');
  });
  it('hesap sonucu → ekran durumu', () => {
    expect(calculationUiStatus({ status: 'no_data', period: '2026-10' })).toBe('empty');
    expect(calculationUiStatus({ status: 'blocked', period: '2026-10', reason: 'x', calculation: null })).toBe('blocked');
  });
});

const status = (over: Partial<ConnectHubStatus> = {}): ConnectHubStatus => ({
  api: 'connecthub',
  schema_ready: true,
  provider_configured: true,
  environment: 'sandbox',
  link: { id: 'l', unit_id: 'u', unit_name: 'GG', environment: 'sandbox', linked_at: null, factor_inventory_id: null },
  environment_matches: true,
  write_key_ready: true,
  read_key_ready: true,
  profile: {
    country: 'Türkiye',
    country_code: 'TR',
    rooms: 40,
    total_area_m2: 3000,
    guestrooms_area_m2: 2000,
    meeting_area_m2: 0,
    updated_at: '2026-11-01T00:00:00Z',
  },
  ...over,
});

describe('önkoşullar', () => {
  it('her şey hazır', () => {
    expect(canSubmit(status())).toEqual({ ready: true });
    expect(canCalculate(status())).toEqual({ ready: true });
  });
  it.each([
    [{ schema_ready: false }, 'schema'],
    [{ provider_configured: false }, 'not_configured'],
    [{ link: null }, 'not_linked'],
    [{ environment_matches: false }, 'environment'],
    [{ write_key_ready: false }, 'write_key'],
  ] as const)('gönderim %j → %s', (over, reason) => {
    expect(canSubmit(status(over))).toEqual({ ready: false, reason });
  });
  it('hesap okuma anahtarı ve profil ister; gönderim istemez', () => {
    expect(canCalculate(status({ read_key_ready: false }))).toEqual({ ready: false, reason: 'read_key' });
    expect(canCalculate(status({ profile: null }))).toEqual({ ready: false, reason: 'profile' });
    expect(canSubmit(status({ read_key_ready: false, profile: null }))).toEqual({ ready: true });
  });
});

describe('yayın kapısı (INTERNAL_USE yazılı izni: Kapsam 1+2)', () => {
  const calculated = (publishable: boolean, scopes: number[] | 'none' = [1, 2]): CalculatePeriodResult => ({
    status: 'calculated',
    period: '2026-10',
    duplicate: false,
    measurement_id: 'm',
    calculation: (scopes === 'none' ? {} : { coverage: { scopes_calculated: scopes } }) as never,
    country_check: { hotel_country_code: 'TR', hotel_country_status: 'valid', publishable, lines: [], messages: [] },
    pricing: {} as never,
    ignored_records: [],
  });

  it('yazılı izin açık (sabit, ortamla değişmez); ülke doğrulandı + Kapsam 1/2 → yayınlanabilir', () => {
    expect(INTERNAL_USE_PUBLISH_ALLOWED).toBe(true);
    expect([...PERMITTED_SCOPES]).toEqual([1, 2]);
    expect(publishGate(calculated(true))).toEqual({ allowed: true });
    expect(publishGate(calculated(true, [2]))).toEqual({ allowed: true });
    expect(publishGateText({ allowed: true })).toBeNull();
  });
  it('Kapsam 3 içeren ya da kapsamı bilinmeyen hesap → scope_not_permitted', () => {
    for (const scopes of [[1, 2, 3], [], 'none'] as const) {
      const gate = publishGate(calculated(true, scopes === 'none' ? 'none' : [...scopes]));
      expect(gate).toEqual({ allowed: false, reason: 'scope_not_permitted' });
      expect(publishGateText(gate)).toMatch(/Kapsam 1 ve 2/);
    }
    expect(scopesPermitted([1, 2])).toBe(true);
    expect(scopesPermitted([3])).toBe(false);
    expect(scopesPermitted(null)).toBe(false);
  });
  it('ülke kapısı kapsamdan önce gelir', () => {
    expect(publishGate(calculated(false, [1, 2, 3]))).toEqual({ allowed: false, reason: 'country_unverified' });
  });
  it('ülke doğrulanmadıysa veya önizlemeyse → country_unverified', () => {
    expect(publishGate(calculated(false))).toEqual({ allowed: false, reason: 'country_unverified' });
    expect(
      publishGate({
        status: 'preview_only',
        period: '2026-10',
        reason: 'x',
        calculation: {} as never,
        country_check: {} as never,
        pricing: {} as never,
        ignored_records: [],
      }),
    ).toEqual({ allowed: false, reason: 'country_unverified' });
  });
  it('hesap yoksa → not_calculated', () => {
    expect(publishGate(null)).toEqual({ allowed: false, reason: 'not_calculated' });
    expect(publishGate({ status: 'no_data', period: '2026-10' })).toEqual({ allowed: false, reason: 'not_calculated' });
  });
});

describe('sağlayıcı faktör gerekçeleri (kullanıcı dili)', () => {
  it('SOURCE_NOT_REDISTRIBUTABLE → lisans açıklaması; kod metne girmez', () => {
    const text = providerFactorReasonText('SOURCE_NOT_REDISTRIBUTABLE');
    expect(text).toMatch(/lisans koşulları nedeniyle/);
    expect(text).toMatch(/tahmini değer kullanılmaz/);
    expect(text).not.toContain('SOURCE_NOT_REDISTRIBUTABLE');
  });
  it('tanınmayan kod → genel metin + kod (destek için); kodsuz → genel metin', () => {
    expect(providerFactorReasonText('NEW_REASON')).toMatch(/gerekçe kodu: NEW_REASON/);
    expect(providerFactorReasonText(null)).not.toMatch(/gerekçe kodu/);
  });
  it('form notu: gönderim mümkün olduğu söylenir', () => {
    expect(factorPendingNote('SOURCE_NOT_REDISTRIBUTABLE')).toMatch(/Kaydı yine de gönderebilirsiniz/);
  });
});

describe('planSubmission — ölçüm ortağındaki onaylı kayıtlar (UX-3.2 / UX-3.3)', () => {
  const approved = (quantity: number, uom: string | null, item_id = GAS) => ({
    item_id, item_code: 'GAZ', item_name: 'Doğalgaz', period: '2026-10', quantity, uom, origin: 'green_gold' as const,
  });
  const run = (drafts: { item_id: string; quantity: string; uom: string }[], ap: ReturnType<typeof approved>[]) =>
    planSubmission({ drafts, items: ITEMS, existing: [], approved: ap, now: NOW });

  it('yerelde kayıt yok, ölçüm ortağında AYNI değer onaylı → gönderilmez (birim yazımı farkı önemsiz)', () => {
    const gas = ITEMS.find((i) => i.id === GAS)!;
    const uom = gas.uoms[0];
    const p = run([{ item_id: GAS, quantity: '500', uom }], [approved(500, uom.replace('3', '³'))]);
    expect(p.lines).toEqual([]);
    expect(p.skipped).toEqual([{ item_id: GAS, item_name: gas.name, reason: 'unchanged' }]);
    expect(p.needs_confirmation).toBe(false);
  });

  it('farklı değer → düzeltme + açık onay (yeniden onay gerekir), önceki değer sağlayıcıdan', () => {
    const gas = ITEMS.find((i) => i.id === GAS)!;
    const p = run([{ item_id: GAS, quantity: '600', uom: gas.uoms[0] }], [approved(500, gas.uoms[0])]);
    expect(p.needs_confirmation).toBe(true);
    expect(p.lines[0]).toMatchObject({ action: 'correction', previous: { quantity: 500 }, previous_from_provider: true });
  });

  it('onaylı kayıt verilmezse eski davranış (yeni kayıt)', () => {
    const gas = ITEMS.find((i) => i.id === GAS)!;
    const p = planSubmission({ drafts: [{ item_id: GAS, quantity: '500', uom: gas.uoms[0] }], items: ITEMS, existing: [], now: NOW });
    expect(p.lines[0].action).toBe('new');
  });
});
