import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Çerçeve istemci bileşeni: adres ve sunucu eylemi taklit edilir.
vi.mock('next/navigation', () => ({ usePathname: () => '/tesis-profili' }));
vi.mock('../app/actions', () => ({ signOut: async () => {} }));

import type { DashboardReport, HotelInfo } from '../lib/api';
import type { ConnectHubStatus } from '../lib/connecthub/types';
import {
  LIVE_LINKS,
  formatRange,
  integrationBadge,
  overviewHeadline,
  overviewNextActions,
  providerLabel,
} from '../lib/panel/overview';
import { OverviewView } from '../app/components/panel/OverviewView';
import { HotelPanelFrame, LIVE_NAV } from '../app/components/panel/HotelPanelFrame';
import { ProfileView } from '../app/components/panel/ProfileView';

const hotel = (over: Partial<HotelInfo> = {}): HotelInfo => ({
  hotel_name: 'Deneme Otel',
  city: 'İstanbul',
  status: 'active',
  timezone: 'Europe/Istanbul',
  currency: 'EUR',
  amount_per_night: 0.1,
  estimated_co2_per_night_kg: 4,
  commission_rate: 0,
  public_widget_key: 'k',
  allowed_origins: ['https://x.example'],
  hotel_type: 'city',
  logo_url: null,
  brand_color: null,
  role: 'hotel_admin',
  ...over,
});
const period = { from: '2026-11-01', to: '2026-11-26' };
const report = (views: number, selections: number): DashboardReport => ({
  period,
  summary: { period, views, selections, add_clicks: 0, conversion_rate_pct: 0 },
  funnel: { period, stages: { viewed: views, selected: selections, clicked: 0 }, rates: { view_to_select_pct: 0, select_to_button_pct: 0, view_to_button_pct: 0 } },
  carbon: { period, contributions_count: 0, total_selected_nights: 0, estimated_co2_kg: 0, tree_equivalent: 0, co2_per_night_kg: 4, is_estimated: true },
});
const carbon = (over: Partial<ConnectHubStatus> = {}): ConnectHubStatus => ({
  api: 'connecthub',
  schema_ready: true,
  provider_configured: true,
  environment: 'sandbox',
  link: null,
  environment_matches: null,
  write_key_ready: false,
  read_key_ready: false,
  profile: null,
  ...over,
});

describe('overviewNextActions — yalnız gerçek veriden', () => {
  it('domain yoksa uyarı; profil yoksa "doldurun"; misafir önizleme her zaman', () => {
    const a = overviewNextActions({ hotel: hotel({ allowed_origins: [] }), carbon: carbon(), links: LIVE_LINKS });
    expect(a.map((x) => x.key)).toEqual(['origin', 'profile', 'guest']);
    expect(a[1]).toMatchObject({ label: 'Tesis profilini doldurun', href: '/tesis-profili', status: { label: 'Eksik' } });
  });
  it('profil varsa "kontrol edin" (rozetsiz)', () => {
    const a = overviewNextActions({
      hotel: hotel(),
      carbon: carbon({ profile: { country: 'Türkiye', country_code: 'TR', rooms: 1, total_area_m2: 2, guestrooms_area_m2: 1, meeting_area_m2: 0, updated_at: '' } }),
      links: LIVE_LINKS,
    });
    expect(a.map((x) => x.key)).toEqual(['profile', 'guest']);
    expect(a[0].status).toBeUndefined();
  });
  it('ölçüm altyapısı yoksa ya da durum okunamadıysa profil maddesi yok', () => {
    expect(overviewNextActions({ hotel: hotel(), carbon: carbon({ schema_ready: false }), links: LIVE_LINKS }).map((x) => x.key)).toEqual(['guest']);
    expect(overviewNextActions({ hotel: null, carbon: null, links: LIVE_LINKS }).map((x) => x.key)).toEqual(['guest']);
  });
  it('var olmayan karbon ölçümü sayfasına bağlantı verilmez (E aşaması)', () => {
    const hrefs = overviewNextActions({ hotel: hotel({ allowed_origins: [] }), carbon: carbon(), links: LIVE_LINKS }).map((x) => x.href);
    expect(hrefs.every((h) => !h.includes('karbon-olcumu'))).toBe(true);
  });
});

describe('overviewHeadline — veriyle tutarlı başlık', () => {
  it('seçim varsa "katkıyı seçiyor", yoksa bu iddia kurulmaz', () => {
    expect(overviewHeadline('Avlu', report(10, 2)).emphasis).toBe('katkıyı seçiyor.');
    expect(overviewHeadline('Avlu', report(10, 0)).emphasis).toBe('görüntüleniyor.');
    expect(overviewHeadline(null, report(0, 0))).toEqual({ lead: 'Oteliniz için', emphasis: 'genel bakış.' });
    expect(overviewHeadline('Avlu', null).emphasis).toBe('genel bakış.');
  });
});

describe('biçim yardımcıları', () => {
  it('formatRange', () => {
    expect(formatRange(period)).toBe('1 – 26 Kasım 2026');
    expect(formatRange({ from: '2026-10-28', to: '2026-11-26' })).toBe('28 Ekim 2026 – 26 Kasım 2026');
    expect(formatRange(null)).toBeNull();
    expect(formatRange({ from: 'x', to: 'y' })).toBeNull();
  });
  it('entegrasyon rozeti ve sağlayıcı adı', () => {
    expect(integrationBadge({ status: 'active' }).label).toBe('Etkin');
    expect(integrationBadge({ status: 'paused' }).tone).toBe('warning');
    expect(providerLabel('hotelrunner')).toBe('HotelRunner');
    expect(providerLabel('baska')).toBe('baska');
  });
});

describe('OverviewView', () => {
  const render = (over: Partial<Parameters<typeof OverviewView>[0]['data']> = {}) =>
    renderToStaticMarkup(
      <OverviewView
        range="month"
        rangeHref={(r) => `/?range=${r}`}
        links={LIVE_LINKS}
        data={{ hotel: hotel(), report: report(100, 12), contributions: null, integrations: { integrations: [] }, nextActions: [], ...over }}
      />,
    );

  it('veri varsa huni ve metodoloji bağlantısı; eksik katkı kartı gizli', () => {
    const html = render();
    expect(html).toContain('Katkı hunisi');
    expect(html).toContain('href="/karbon"');
    expect(html).toContain('href="/funnel"');
    expect(html).not.toContain('Rezervasyon katkıları');
    expect(html).toContain('Henüz bağlı bir rezervasyon sistemi yok.');
  });
  it('görüntülenme 0 → dürüst boş durum + kontrol listesi', () => {
    const html = render({ report: report(0, 0), hotel: hotel({ allowed_origins: [], status: 'pending' }) });
    expect(html).toContain('henüz misafir etkileşimi yok');
    expect(html).toContain('İzinli domain eklendi');
    expect(html).not.toContain('Katkı hunisi');
  });
  it('rapor alınamazsa uyarı ve "—"', () => {
    const html = render({ report: null, loadError: 'HTTP 500' });
    expect(html).toContain('Veriler yüklenemedi');
    expect(html).toContain('—');
    expect(html).not.toContain('Katkı hunisi');
  });
  it('entegrasyon okunamazsa bunu söyler (bağlı değil demez)', () => {
    expect(render({ integrations: null })).toContain('Entegrasyon durumu şu anda alınamadı.');
  });
  it('katkı varsa kart: tahsil edilen ve bekleyen ayrı', () => {
    const html = render({
      contributions: {
        period,
        totals: [{ currency: 'EUR', collected_total_minor: 1000, refunded_total_minor: 0, net_contribution_minor: 1000, pending_total_minor: 500 }],
        contributions_count: 3,
        pending_count: 2,
      },
    });
    expect(html).toContain('Net tahsil edilen');
    expect(html).toContain('Tahsilatı bekleyen');
  });
});

describe('HotelPanelFrame — eski menüyle aynı adresler', () => {
  it('AppShell adreslerinin hepsi + Tesis profili; Faz 2 "Yakında"', () => {
    const items = LIVE_NAV.flatMap((g) => g.items);
    const hrefs = items.map((i) => i.href);
    for (const h of ['/', '/karbon-olcumu', '/misafir-onizleme', '/funnel', '/karbon', '/raporlar', '/entegrasyon', '/ayarlar', '/rezervasyonlar', '/tahsilatlar', '/sertifikalar', '/tesis-profili']) {
      expect(hrefs).toContain(h);
    }
    expect(items.filter((i) => i.soon).map((i) => i.href)).toEqual(['/rezervasyonlar', '/tahsilatlar', '/sertifikalar']);
  });
  it('demo: salt okunur rozeti + temsili veri şeridi; çıkış düğmeleri', () => {
    const html = renderToStaticMarkup(<HotelPanelFrame hotelName="Deneme Otel" isDemo>içerik</HotelPanelFrame>);
    expect(html).toContain('Demo modu — salt okunur');
    expect(html).toContain('temsilidir');
    expect(html).toContain('Hesap değiştir');
    expect(html).toContain('Güvenli çıkış');
    expect(html).toContain('aria-current="page"'); // /tesis-profili aktif
  });
  it('demo değilse rozet yok', () => {
    expect(renderToStaticMarkup(<HotelPanelFrame hotelName="X">x</HotelPanelFrame>)).not.toContain('salt okunur');
  });
});

describe('ProfileView — durumlar', () => {
  it('şema yoksa form yok, açıklama var', () => {
    const html = renderToStaticMarkup(<ProfileView status={carbon({ schema_ready: false })} isDemo={false} />);
    expect(html).toContain('henüz etkin değil');
    expect(html).not.toContain('Profili kaydet');
  });
  it('bağlantı yoksa bilgi notu; form var', () => {
    const html = renderToStaticMarkup(<ProfileView status={carbon()} isDemo={false} />);
    expect(html).toContain('henüz ölçüm ortağına bağlanmadı');
    expect(html).toContain('Profili kaydet');
    expect(html).toContain('Henüz kaydedilmedi.');
  });
  it('demo: form salt okunur', () => {
    const html = renderToStaticMarkup(<ProfileView status={carbon()} isDemo />);
    expect(html).toContain('Demo hesabında profil değiştirilemez.');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
  it('eski profil (ülke kodu yok) uyarısı; durum okunamadıysa hata', () => {
    const legacy = carbon({ profile: { country: 'Türkiye', country_code: null, rooms: 10, total_area_m2: 900, guestrooms_area_m2: 500, meeting_area_m2: 0, updated_at: '2026-11-01T10:00:00Z' } });
    expect(renderToStaticMarkup(<ProfileView status={legacy} isDemo={false} />)).toContain('ülke kodu yok');
    expect(renderToStaticMarkup(<ProfileView status={null} statusError="Sunucuya ulaşılamıyor." isDemo={false} />)).toContain('Profil bilgisi alınamadı');
  });
});

describe('misafir önizlemesi rezervasyon kabuğu (UX-4.6)', () => {
  it('EN seçildiğinde kabuk metinleri İngilizce; TR ile aynı alanlar', async () => {
    const { BOOKING_FRAME } = await import('../app/components/GuestDemoWidget');
    expect(BOOKING_FRAME.en.title).toBe('Complete your stay');
    expect(BOOKING_FRAME.en.stay(1, 3)).toBe('1 room · 3 nights · Taxes included');
    expect(BOOKING_FRAME.en.steps).toHaveLength(BOOKING_FRAME.tr.steps.length);
    expect(Object.keys(BOOKING_FRAME.en).sort()).toEqual(Object.keys(BOOKING_FRAME.tr).sort());
  });
});

describe('ReportsView (UX-5.x)', () => {
  const renderReports = async (views: number, sel: number, previous: DashboardReport | null = null) => {
    const { ReportsView } = await import('../app/components/panel/ReportsView');
    return renderToStaticMarkup(
      <ReportsView
        range="month"
        rangeHref={() => '/raporlar'}
        exportHref="/raporlar/export"
        links={{ integration: '/entegrasyon', carbon: '/karbon', payments: '/tahsilatlar' }}
        data={{ report: report(views, sel), previous, daily: null, contributions: null }}
      />,
    );
  };
  it('görüntülenme yoksa oran "—"; %0 gösterilmez; "session" yok, "oturum" var', async () => {
    const html = await renderReports(0, 0);
    expect(html).not.toContain('%0');
    expect(html).toContain('Görüntülenme yok — oran hesaplanmaz');
    expect(html).not.toMatch(/session/i);
    expect(html).toContain('oturum');
  });
  it('katkı niyeti, gerçek ödeme ve tahmini emisyon ayrı kartlarda; Türkçe tarih', async () => {
    const html = await renderReports(10, 2);
    expect(html).toContain('Misafir etkileşimi · katkı niyeti');
    expect(html).toContain('Gerçek ödeme');
    expect(html).toContain('Tahmini emisyon');
    expect(html).toContain('kg CO₂e');
    expect(html).toMatch(/Kasım 2026/);
    expect(html).not.toMatch(/ağaç-yılı/i);
  });
});

describe('Ürün ana sayfası (UX-1.x)', () => {
  it('örnek veriler etiketli; dengeleme/nötrlük iddiası yok; izni doğrulanmamış ortak logosu yok', async () => {
    const { LandingPage } = await import('../app/components/landing/LandingPage');
    const html = renderToStaticMarkup(<LandingPage />);
    expect(html).toContain('temsili veriler');
    expect(html).toContain('Örnek veri');
    expect(html).not.toMatch(/karbon nötr(dür|leştir)|dengeledik|offset edildi|carbon neutral/i);
    // KD-5: kullanım izni doğrulanmamış ortak logosu yayınlanmaz.
    const { PUBLISHED_PARTNERS } = await import('../lib/marketing-assets');
    const used = [...html.matchAll(/src="(\/partners\/[^"]+)"/g)].map((m) => m[1]);
    expect(used.sort()).toEqual(PUBLISHED_PARTNERS.map((p) => p.src).sort());
    // Savunmacı ifadeler yerine kurumsal dil (2026-11-27).
    expect(html).toContain('Konaklamada sürdürülebilirliğe');
    expect(html).not.toMatch(/baskı yapmadan|abartısız|dürüst dil/i);
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/demo"');
  });
});
