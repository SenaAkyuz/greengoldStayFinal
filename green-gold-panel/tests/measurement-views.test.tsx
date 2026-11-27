import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeasurementView } from '../app/components/panel/MeasurementView';
import { PeriodView, type PeriodViewProps } from '../app/components/panel/PeriodView';
import { getSampleOverview } from '../lib/sample/hotel-overview';
import { SAMPLE_NOW, SAMPLE_PERIOD, getSampleMeasurement } from '../lib/sample/connecthub';
import { overviewNextActions, LIVE_LINKS } from '../lib/panel/overview';

afterEach(() => vi.unstubAllEnvs());
const sample = () => {
  vi.stubEnv('NODE_ENV', 'development');
  return { ...getSampleMeasurement(), status: getSampleOverview().carbonStatus };
};
const links = { list: '/karbon-olcumu', profile: '/tesis-profili' };

function period(over: Partial<PeriodViewProps> = {}) {
  const s = sample();
  return renderToStaticMarkup(
    <PeriodView
      period={SAMPLE_PERIOD}
      editability="open"
      now={SAMPLE_NOW}
      isDemo={false}
      status={s.status}
      detail={s.detail(SAMPLE_PERIOD)}
      items={s.items}
      links={links}
      current={null}
      {...over}
    />,
  );
}

describe('PeriodView', () => {
  it('dinamik kalemler: yazılabilirde miktar + birim, otele özel birim aynen; yazılamayanda gerekçe', () => {
    const html = period();
    expect(html).toContain('name="q:ornek-elektrik"');
    expect(html).toContain('<option value="MWh"'); // çok birimli → seçim
    expect(html).toContain('>kg<'); // LPG tek birim → sabit etiket
    expect(html).toContain('name="u:ornek-lpg"');
    expect(html).not.toContain('name="q:ornek-arac"');
    expect(html).toContain('Bu kalem aylık değil');
    expect(html).toContain('yakıt/tür seçimi gerekiyor');
    expect(html).toContain('Faktör sonra kontrol edilir');
    expect(html).toContain('Kapsam 1 · doğrudan');
  });
  it('sağlayıcı faktörü paylaşamıyorsa (SOURCE_NOT_REDISTRIBUTABLE) giriş AÇIK; "Faktör bekleniyor" + anlaşılır not', () => {
    const s = sample();
    const items = s.items.map((i) =>
      i.id === 'ornek-elektrik'
        ? { ...i, factor_status: 'factor_unavailable' as const, factor_reason: 'SOURCE_NOT_REDISTRIBUTABLE' }
        : i,
    );
    const html = period({ items });
    expect(html).toContain('name="q:ornek-elektrik"');
    expect(html).toContain('Faktör bekleniyor');
    expect(html).toContain('lisans koşulları nedeniyle');
    expect(html).toContain('Kaydı yine de gönderebilirsiniz');
    expect(html).not.toContain('SOURCE_NOT_REDISTRIBUTABLE');
  });
  it('doluluk ve tüketim AYRI formlar; düğmeler ayrı; doluluk ölçüm ortağına gitmez notu', () => {
    const html = period();
    expect((html.match(/<form/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Doluluğu kaydet');
    expect(html).toContain('Ölçüm ortağına gönder');
    expect(html).not.toContain('Kaydet ve gönder');
    expect(html).toContain('ölçüm ortağına gönderilmez');
    expect(html).toContain('name="occupancy"');
  });
  it('ölçüm ortağındaki onaylı kayıtlar: kaynak etiketi; yerelde olmayan kalem için "onaylı" etiketi', () => {
    const s = sample();
    const html = period({ providerRecords: s.providerRecords(SAMPLE_PERIOD) });
    expect(html).toContain('Ölçüm ortağındaki onaylı kayıtlar');
    expect(html).toContain('Bu panelden');
    expect(html).toContain('Green Gold aracıyla gönderildi (panel dışı)');
    // Şebeke suyu panelden gönderilmedi ama ölçüm ortağında onaylı:
    expect(html).toContain('Ölçüm ortağında onaylı: 1.240 m³');
    // Elektrik yerelde var: tekrar etiketlenmez.
    expect(html).not.toContain('Ölçüm ortağında onaylı: 48.200');
    // Örnekte işlem bekleyen kayıt var: adımda öncelik onundur.
    expect(html).toContain('kayıt işlem bekliyor');
  });
  it('yerel kayıt yokken onaylı sağlayıcı kayıtları adımlara yansır; ondalık miktar yuvarlanmaz', () => {
    const s = sample();
    const html = period({
      detail: { ...s.detail(SAMPLE_PERIOD), records: [] },
      providerRecords: [
        { item_id: 'ornek-lpg', item_code: null, item_name: 'LPG (mutfak)', period: SAMPLE_PERIOD, quantity: 0.5, uom: 'kg', origin: 'provider' },
        { item_id: 'ornek-elektrik', item_code: null, item_name: 'Şebeke elektriği', period: SAMPLE_PERIOD, quantity: 1000, uom: 'kWh', origin: 'green_gold' },
      ],
    });
    expect(html).toContain('2 kayıt ölçüm ortağında');
    expect(html).toContain('2 onaylı kayıt');
    expect(html).toContain('Hesaplanabilir');
    expect(html).toContain('Ölçüm ortağında onaylı: 0,5 kg');
    expect(html).toContain('Ölçüm ortağında onaylı: 1.000 kWh');
    expect(html).toContain('Ölçüm ortağında doğrudan girildi');
  });
  it('onaylı kaydı olan kalemin faktörü bekleniyorsa Hesap adımı "Faktör bekleniyor"', () => {
    const s = sample();
    const items = s.items.map((i) =>
      i.id === 'ornek-elektrik' ? { ...i, factor_status: 'factor_unavailable' as const, factor_reason: 'SOURCE_NOT_REDISTRIBUTABLE' } : i,
    );
    const html = period({
      items,
      detail: { ...s.detail(SAMPLE_PERIOD), records: [] },
      providerRecords: [
        { item_id: 'ornek-elektrik', item_code: null, item_name: 'Şebeke elektriği', period: SAMPLE_PERIOD, quantity: 1000, uom: 'kWh', origin: 'green_gold' },
      ],
    });
    expect(html).toContain('Faktör bekleniyor: Şebeke elektriği');
    expect(html).not.toContain('Hesaplanabilir');
  });
  it('onaylı kayıtlar okunamazsa uyarı; hiç veri yoksa (bağlantı/anahtar yok) bölüm gizli', () => {
    expect(period({ providerRecords: null, providerRecordsError: 'Ölçüm ortağına şu anda ulaşılamıyor.' })).toContain('Onaylı kayıtlar alınamadı');
    expect(period({ providerRecords: null })).not.toContain('Ölçüm ortağındaki onaylı kayıtlar');
    expect(period({ providerRecords: [] })).toContain('henüz onaylı kayıt yok');
  });
  it('demo: doluluk ve tüketim formları pasif', () => {
    const html = period({ isDemo: true });
    expect(html).toContain('Demo hesabında veri kaydedilemez.');
    expect(html).toContain('Demo hesabında veri gönderilemez.');
  });
  it('kayıtlı değerler forma dolar (not dahil)', () => {
    const html = period();
    expect(html).toMatch(/name="q:ornek-elektrik"[^>]*value="48200"|value="48200"[^>]*name="q:ornek-elektrik"/);
    expect(html).toContain('Fatura 2026/10');
  });
  it('belirsiz kayıt için güvenli yeniden gönder; reddedilen için düzeltme yönlendirmesi', () => {
    const html = period();
    expect(html).toContain('1 kaydın sonucu belirsiz');
    expect(html).toContain('Güvenle yeniden gönder');
    expect(html).toContain('Değeri düzeltip yeniden gönderin');
  });
  it('ay sürüyorsa / gelecekse form yok', () => {
    expect(period({ editability: 'in_progress' })).toContain('Ay sürüyor');
    expect(period({ editability: 'future' })).not.toContain('Kaydet ve gönder');
  });
  it('demo ve bağlantısız tesiste form kilitli, gerekçe görünür', () => {
    expect(period({ isDemo: true })).toContain('Demo hesabında veri gönderilemez.');
    const s = sample();
    const html = period({ status: { ...s.status, link: null } });
    expect(html).toContain('henüz ölçüm ortağına bağlanmadı');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
  it('kalemler alınamazsa form yok ama gönderilen kayıtlar görünür', () => {
    const html = period({ items: null, itemsError: 'Ölçüm ortağına şu anda ulaşılamıyor.' });
    expect(html).toContain('Kalemler alınamadı');
    expect(html).not.toContain('Kaydet ve gönder');
    expect(html).toContain('Jeneratör dizel');
  });
});

describe('MeasurementView', () => {
  const render = (over = {}) => {
    const s = sample();
    return renderToStaticMarkup(
      <MeasurementView
        year={2026}
        years={[2026, 2025]}
        now={SAMPLE_NOW}
        status={s.status}
        periods={s.periods}
        links={{ period: (p) => `/karbon-olcumu/${p}`, year: (y) => `/karbon-olcumu?yil=${y}`, profile: '/tesis-profili' }}
        {...over}
      />,
    );
  };
  it('yalnız tamamlanmış aylar bağlantılı; dikkat gereken ay vurgulanır', () => {
    const html = render();
    expect(html).toContain('href="/karbon-olcumu/2026-10"');
    expect(html).not.toContain('href="/karbon-olcumu/2026-11"');
    expect(html).not.toContain('href="/karbon-olcumu/2026-12"');
    expect(html).toContain('İşlem bekleyen kayıtlar var');
    expect(html).toContain('Kontrol gerekli');
  });
  it('şema yoksa ay listesi yok', () => {
    const s = sample();
    expect(render({ periods: { ...s.periods, schema_ready: false } })).toContain('henüz etkin değil');
  });
});

describe('genel bakış — dönem maddeleri', () => {
  it('kontrol gereken ay ve eksik son ay listelenir', () => {
    const s = sample();
    const a = overviewNextActions({ hotel: null, carbon: s.status, periods: s.periods, links: LIVE_LINKS, now: SAMPLE_NOW });
    expect(a[0]).toMatchObject({ label: 'Ekim 2026: kontrol gereken kayıt', href: '/karbon-olcumu/2026-10' });
    const empty = { ...s.periods, periods: s.periods.periods.map((p) => (p.period === '2026-10' ? { ...p, status: 'empty' as const, needs_attention: false } : p)) };
    expect(overviewNextActions({ hotel: null, carbon: s.status, periods: empty, links: LIVE_LINKS, now: SAMPLE_NOW })[0])
      .toMatchObject({ label: 'Ekim 2026 verilerini girin' });
  });
});

describe('initialRows (UX-3.1)', () => {
  it('yerel kayıt yokken birim ve miktar ölçüm ortağındaki tek onaylı kayıttan gelir', async () => {
    const { initialRows } = await import('../app/components/panel/PeriodEntryForm');
    const items = [{ id: 'g', code: 'heating', name: 'Isınma', resolution: 'monthly', resolution_kind: 'monthly' as const, uoms: ['kWh', 'm3'], monthly: true, scope: 1, factor_status: 'available' as const, factor_reason: null, writable: true, blocked_reason: null }];
    const rows = initialRows(items, [], [{ item_id: 'g', item_code: 'heating', item_name: 'Isınma', period: '2026-10', quantity: 500, uom: 'm³', origin: 'green_gold' }]);
    expect(rows.g).toEqual({ quantity: '500', uom: 'm3', note: '' });
    expect(initialRows(items, [], null).g.uom).toBe('kWh');
  });
});
