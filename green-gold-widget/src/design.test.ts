import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './main';
import { contrastRatio, DEFAULT_ACCENT, resolveAccent } from './colors';
import { ensureFonts, fontBaseFrom, fontFaceCss, FONT_FAMILY } from './fonts';
import { STYLES } from './styles';

/**
 * W aşaması: referans tasarım (ürün sitesindeki misafir kartı), K2 yazı tipi,
 * K3 seçim öncesi tahmini ayak izi, K4 otel rengi + okunabilirlik.
 */
const API = 'http://api.test';
const CONFIG = {
  hotel_name: 'Avlu Han',
  city: 'İstanbul',
  currency: 'EUR',
  amount_per_night: 0.3,
  estimated_co2_per_night_kg: 12,
  is_estimated: true,
  show_estimated_impact: true,
};
const flush = () => new Promise((r) => setTimeout(r, 0));
let events: string[] = [];

function installFetch(config: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/widget/impact')) return { ok: false, status: 404, json: async () => ({}) } as Response;
      if (u.includes('/widget/config')) return { ok: true, status: 200, json: async () => ({ success: true, data: config }) } as Response;
      if (u.includes('/widget/events')) {
        events.push((JSON.parse(String(init?.body)) as { event_type: string }).event_type);
        return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'e' } }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
}

async function mount(config: Record<string, unknown>, attrs: Record<string, string> = {}) {
  installFetch(config);
  const el = document.createElement('green-gold-widget');
  for (const [k, v] of Object.entries({ 'data-key': 'k', 'data-api': API, 'data-nights': '2', 'data-lang': 'tr', ...attrs })) el.setAttribute(k, v);
  document.body.appendChild(el);
  await flush();
  return el.shadowRoot!;
}

beforeEach(() => {
  events = [];
  document.body.innerHTML = '';
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('K4 — otel rengi ve okunabilirlik', () => {
  it('kontrast hesabı (WCAG): siyah/beyaz 21, varsayılan çam yeşili ≥ 4,5', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio(DEFAULT_ACCENT, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('okunabilir otel rengi kullanılır; açık/okunaksız ya da geçersiz renk → güvenli varsayılan', () => {
    expect(resolveAccent('#1A4D8F')).toEqual({ accent: '#1a4d8f', fromHotel: true });
    expect(resolveAccent('#f3cc61')).toEqual({ accent: DEFAULT_ACCENT, fromHotel: false });
    expect(resolveAccent('#ffffff')).toEqual({ accent: DEFAULT_ACCENT, fromHotel: false });
    expect(resolveAccent('red;background:url(x)')).toEqual({ accent: DEFAULT_ACCENT, fromHotel: false });
    expect(resolveAccent(null)).toEqual({ accent: DEFAULT_ACCENT, fromHotel: false });
  });
  it('kartta: okunabilir renk butona yansır, okunaksız renk yansımaz (varsayılan kalır)', async () => {
    let root = await mount({ ...CONFIG, brand_color: '#1a4d8f' });
    expect((root.querySelector('.card') as HTMLElement).getAttribute('style')).toMatch(/--gg-accent:\s*#1a4d8f/);
    document.body.innerHTML = '';
    root = await mount({ ...CONFIG, brand_color: '#e8f5e0' });
    expect((root.querySelector('.card') as HTMLElement).getAttribute('style') ?? '').not.toContain('--gg-accent');
    expect(STYLES).toContain('--gg-accent: #006e64');
  });
});

describe('K3 — tahmini ayak izi seçimden önce', () => {
  it('izin verilen veriyle seçimden ÖNCE gösterilir: oda × gece × katsayı, "Tahmini" rozeti, not', async () => {
    const root = await mount(CONFIG, { 'data-rooms': '1' });
    const fp = root.querySelector('.footprint');
    expect(fp).toBeTruthy();
    expect(fp!.textContent).toContain('Tahmini ayak iziniz');
    expect(fp!.querySelector('.big')!.textContent).toContain('24'); // 2 gece × 12 kg
    expect(fp!.querySelector('.badge')!.textContent).toBe('Tahmini');
    expect(root.querySelector('.footprint-note')!.textContent).toMatch(/tahminidir/);
    // Seçim yapılmadan hiçbir seçim/katkı event'i gitmez.
    expect(events).toEqual(['widget_goruntulendi']);
  });
  it('show_estimated_impact kapalıysa (ve temsili fiyat modu yoksa) gösterilmez', async () => {
    const root = await mount({ ...CONFIG, show_estimated_impact: false });
    expect(root.querySelector('.footprint')).toBeNull();
    expect(root.querySelector('.co2-value')).toBeNull();
  });
  it('katsayı 0 ise gösterilmez (boş/uydurma değer yok)', async () => {
    const root = await mount({ ...CONFIG, estimated_co2_per_night_kg: 0 });
    expect(root.querySelector('.footprint')).toBeNull();
  });
});

describe('Referans kart düzeni', () => {
  it('başlık şeridi otel adı + Green Gold Stay; konaklama satırı; seçenek ve buton korunur', async () => {
    const root = await mount(CONFIG, { 'data-rooms': '2' });
    expect(root.querySelector('.head .hotel')!.textContent).toBe('Avlu Han');
    // KD-2: üstte otel kimliği, altta GreenGold Stay imzası.
    expect(root.querySelector('.head .brand-sub')!.textContent).not.toContain('GreenGold');
    expect(root.querySelector('.signature')!.textContent).toContain('GreenGold Stay');
    expect(root.querySelector('.stay .rowval-value')!.textContent).toBe('2 gece · 2 oda');
    expect(root.querySelector('input[type=checkbox]')).toBeTruthy();
    expect((root.querySelector('button.btn') as HTMLButtonElement).disabled).toBe(true);
  });
  it('seçim → toplam katkı satırı ve "checked" görünümü; kaydet → onay (event sırası aynı)', async () => {
    const root = await mount(CONFIG);
    const input = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(root.querySelector('.row')!.classList.contains('checked')).toBe(true);
    expect(root.querySelector('.details .line-label')!.textContent).toBe('Toplam katkı');
    (root.querySelector('button.btn') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('.confirm')).toBeTruthy();
    // UX-4.5: kaydedildikten sonra toplam katkı kaybolmaz.
    expect(root.querySelector('.details.saved .line-label')!.textContent).toBe('Seçtiğiniz katkı');
    expect(root.querySelector('.details.saved .line-value')!.textContent).toBeTruthy();
    expect(events).toEqual(['widget_goruntulendi', 'checkbox_secildi', 'katki_ekle_butonuna_basildi']);
  });
  it('EN metinleri; dengeleme/offset iddiası yok', async () => {
    const root = await mount(CONFIG, { 'data-lang': 'en' });
    const text = root.querySelector('.card')!.textContent ?? '';
    expect(text).toContain('Your estimated footprint');
    expect(text).toContain('Your stay');
    expect(text.toLowerCase()).not.toMatch(/offset/);
    document.body.innerHTML = '';
    const tr = (await mount(CONFIG)).querySelector('.card')!.textContent ?? '';
    expect(tr.toLowerCase()).not.toMatch(/dengele/);
  });
  it('logo varsa yuvarlak kesilmez (has-logo); yalnız https', async () => {
    let root = await mount({ ...CONFIG, logo_url: 'https://otel.test/logo.png' });
    expect(root.querySelector('.mark.has-logo img')).toBeTruthy();
    document.body.innerHTML = '';
    root = await mount({ ...CONFIG, logo_url: 'http://otel.test/logo.png' });
    expect(root.querySelector('.mark img')).toBeNull();
  });
  it('dar kapsayıcı kuralları ve Shadow DOM izolasyonu (tek <style>, :host reset)', async () => {
    expect(STYLES).toContain('container-type: inline-size');
    expect(STYLES).toContain('@container (max-width: 420px)');
    expect(STYLES).toContain('all: initial');
    const root = await mount(CONFIG);
    expect(root.querySelectorAll('style')).toHaveLength(1);
  });
});

describe('K2 — DM Sans kendi alan adımızdan, yedek sistem yazı tipi', () => {
  it('yazı tipi kökü betik adresinden; yalnız http/https', () => {
    expect(fontBaseFrom('https://www.greengoldstay.org/green-gold-widget.v1.js?v=1')).toBe(
      'https://www.greengoldstay.org/green-gold-widget-fonts/',
    );
    expect(fontBaseFrom('javascript:alert(1)')).toBeNull();
    expect(fontBaseFrom(null)).toBeNull();
  });
  it('@font-face yalnız bizim kökümüzü kullanır (Google yok); Türkçe alt küme dahil', () => {
    const css = fontFaceCss('https://www.greengoldstay.org/green-gold-widget-fonts/');
    expect(css).toContain(`font-family:"${FONT_FAMILY}"`);
    expect(css).toContain('dm-sans-latin.v1.woff2');
    expect(css).toContain('dm-sans-latin-ext.v1.woff2');
    expect(css).toContain('font-display:swap');
    expect(css).not.toMatch(/googleapis|gstatic/);
  });
  it('belgeye bir kez eklenir; kök yoksa hiç eklenmez (sistem yazı tipi)', () => {
    document.head.querySelector('#green-gold-widget-fonts')?.remove();
    expect(ensureFonts(null)).toBe(false);
    expect(document.getElementById('green-gold-widget-fonts')).toBeNull();
    expect(ensureFonts('https://x.test/green-gold-widget-fonts/')).toBe(true);
    expect(ensureFonts('https://x.test/green-gold-widget-fonts/')).toBe(true);
    expect(document.querySelectorAll('#green-gold-widget-fonts')).toHaveLength(1);
  });
  it('CSS yığını DM Sans → sistem yazı tipleri', () => {
    expect(STYLES).toMatch(/font-family: "GG DM Sans", system-ui/);
  });
});

describe('UX-4.7 hassasiyet', () => {
  it('para: kuruş tam sayısıyla, gecelik fiyat × gece × oda (HotelRunner ile aynı)', async () => {
    const { contributionTotal } = await import('./widget');
    expect(contributionTotal(0.02, 6, 1)).toBe(0.12);
    expect(contributionTotal(0.1, 3, 1)).toBe(0.3); // 0.30000000000000004 değil
    expect(contributionTotal(0.37, 7, 3)).toBe(7.77);
  });
  it('emisyon: hassas gecelik değerden, erken yuvarlama yok', async () => {
    const { footprintTotal } = await import('./widget');
    expect(footprintTotal(0.687, 6, 1)).toBeCloseTo(4.122, 9);
    expect(Math.round(footprintTotal(0.687, 6, 1) * 100) / 100).toBe(4.12);
  });
  it('ekranda: 0,687 kg × 6 gece ≈ 4,12 kg CO₂e', async () => {
    const root = await mount({ ...CONFIG, estimated_co2_per_night_kg: 0.687 }, { 'data-nights': '6' });
    expect(root.querySelector('.footprint .big')!.textContent).toContain('4,12');
  });
});
