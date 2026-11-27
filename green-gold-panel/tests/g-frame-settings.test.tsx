import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { envLabel, integrationModel, measurementHistory, type ConnectHubStatus, type PeriodList } from '../lib/connecthub';
import { getSampleOverview } from '../lib/sample/hotel-overview';
import { getSampleMeasurement } from '../lib/sample/connecthub';
import { ConnectHubSettingsView } from '../app/components/panel/ConnectHubSettingsView';

afterEach(() => vi.unstubAllEnvs());
const sample = () => {
  vi.stubEnv('NODE_ENV', 'development');
  return { status: getSampleOverview().carbonStatus as ConnectHubStatus, periods: getSampleMeasurement().periods };
};

/** G: kalan 9 sayfa yeni çerçevede; iç içe <main> yok; eski AppShell kullanılmıyor. */
describe('G · sayfaların yeni çerçeveye geçişi', () => {
  const PAGES = ['ayarlar', 'entegrasyon', 'funnel', 'karbon', 'misafir-onizleme', 'raporlar', 'rezervasyonlar', 'sertifikalar', 'tahsilatlar'];
  it.each(PAGES)('%s: HotelPanelFrame, <main> yok, AppShell yok', (page) => {
    const src = readFileSync(join(__dirname, '..', 'app', page, 'page.tsx'), 'utf8');
    expect(src).toContain('<HotelPanelFrame');
    expect(src).toMatch(/title="[^"]+"/);
    expect(src).not.toMatch(/AppShell/);
    expect(src).not.toMatch(/<main[\s>]/);
    expect(src).toContain('gg-page gg-page--framed');
  });
});

describe('G · Ayarlar → ölçüm ortağı durumu', () => {
  const base: ConnectHubStatus = {
    api: 'connecthub', schema_ready: true, provider_configured: true, environment: 'sandbox',
    link: { id: 'l', unit_id: 'u', unit_name: 'GG Test', environment: 'sandbox', linked_at: null, factor_inventory_id: null },
    environment_matches: true, write_key_ready: true, read_key_ready: true,
    profile: { country: 'Türkiye', country_code: 'TR', rooms: 96, total_area_m2: 9800, guestrooms_area_m2: 6000, meeting_area_m2: 600, updated_at: '' },
  };

  it('her şey hazırsa olumlu özet', () => {
    const m = integrationModel(base);
    expect(m.tone).toBe('success');
    expect(m.submitText).toBeNull();
    expect(m.calculateText).toBeNull();
    expect(m.facts.find((f) => f.key === 'link')!.value).toBe('GG Test');
  });

  it('okuma anahtarı yoksa: gönderim hazır, hesap gerekçesi', () => {
    const m = integrationModel({ ...base, read_key_ready: false });
    expect(m.tone).toBe('info');
    expect(m.calculateText).toMatch(/okuma yetkisi/);
    expect(m.facts.find((f) => f.key === 'read')!.value).toBe('Tanımlı değil');
  });

  it('ortam eşleşmiyorsa açıkça yazılır; bağlantı yoksa eksik', () => {
    expect(integrationModel({ ...base, environment_matches: false }).facts.find((f) => f.key === 'env-match')!.tone).toBe('danger');
    const m = integrationModel({ ...base, link: null });
    expect(m.tone).toBe('warning');
    expect(m.submitText).toMatch(/bağlanmadı/);
    expect(m.facts.some((f) => f.key === 'env-match')).toBe(false);
  });

  it('ülke kodu eksik profil uyarı tonunda', () => {
    const m = integrationModel({ ...base, profile: { ...base.profile!, country_code: null } });
    expect(m.facts.find((f) => f.key === 'profile')).toMatchObject({ tone: 'warning', value: 'Kayıtlı · ülke kodu eksik' });
  });

  it('ortam etiketi', () => {
    expect(envLabel('sandbox')).toBe('Test (sandbox)');
    expect(envLabel('production')).toBe('Canlı');
    expect(envLabel(null)).toBe('—');
  });

  it('ölçüm geçmişi yalnız kaydedilmiş ölçümü olan aylar, yeniden eskiye', () => {
    const list: PeriodList = {
      schema_ready: true,
      year: 2026,
      periods: [
        { period: '2026-08', status: 'calculated', needs_attention: false, records: { sending: 0, accepted: 1, rejected: 0, outcome_unknown: 0 }, occupied_room_nights: 1, measurement: { id: 'a', is_active: true, total_tonnes: 1.5 } },
        { period: '2026-09', status: 'submitted', needs_attention: false, records: { sending: 0, accepted: 1, rejected: 0, outcome_unknown: 0 }, occupied_room_nights: 1, measurement: null },
        { period: '2026-10', status: 'calculated', needs_attention: false, records: { sending: 0, accepted: 1, rejected: 0, outcome_unknown: 0 }, occupied_room_nights: 1, measurement: { id: 'b', is_active: false, total_tonnes: 2 } },
      ],
    } as PeriodList;
    expect(measurementHistory(list, (t) => `${t} t`)).toEqual([
      { period: '2026-10', totalText: '2 t', active: false },
      { period: '2026-08', totalText: '1.5 t', active: true },
    ]);
    expect(measurementHistory({ ...list, schema_ready: false }, String)).toEqual([]);
    expect(measurementHistory(null, String)).toEqual([]);
  });

  it('görünüm: anahtar değeri yok, durum + geçmiş + bağlantılar', () => {
    const { status, periods } = sample();
    const html = renderToStaticMarkup(
      <ConnectHubSettingsView status={status} periods={periods} year={2026} links={{ measurement: '/karbon-olcumu', profile: '/tesis-profili', period: (p) => `/karbon-olcumu/${p}` }} />,
    );
    expect(html).toContain('Ölçüm ortağı (3P Metrics ConnectHub)');
    expect(html).toContain('Veri gönderme yetkisi');
    expect(html).toContain('Ölçüm geçmişi · 2026');
    expect(html).toContain('href="/karbon-olcumu"');
    expect(html).not.toMatch(/GG_CH_|api[_-]?key/i);
  });

  it('durum okunamazsa hata metni; geçmiş boş durumu', () => {
    const html = renderToStaticMarkup(
      <ConnectHubSettingsView status={null} statusError="Durum okunamadı." periods={null} year={2026} links={{ measurement: '/m', profile: '/p', period: (p) => p }} />,
    );
    expect(html).toContain('Durum okunamadı.');
    expect(html).toContain('Bu yıl için kaydedilmiş ölçüm yok.');
  });
});
