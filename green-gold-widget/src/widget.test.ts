import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import './main'; // custom element'i kaydeder (green-gold-widget)

const TAG = 'green-gold-widget';
const API = 'http://api.test';

const CONFIG = {
  hotel_name: 'Test Otel',
  city: 'İstanbul',
  currency: 'EUR',
  amount_per_night: 3,
  estimated_co2_per_night_kg: 8.3,
  is_estimated: true,
  show_estimated_impact: true,
};

interface EventBody {
  event_type: string;
  session_ref: string;
  metadata: Record<string, unknown>;
}

let eventCalls: EventBody[] = [];

function installFetch(
  opts: {
    invalidKey?: boolean;
    impact?: Record<string, unknown> | null;
    config?: Record<string, unknown>;
  } = {},
) {
  const config = opts.config ?? CONFIG;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    // Not: /widget/config kontrolü impact'ten ÖNCE gelmemeli — ikisi de "config"
    // içermez, ayrı path'ler; impact'i önce eşleştir.
    if (u.includes('/widget/impact')) {
      if (opts.impact) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: opts.impact }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({ success: false, data: null }) } as Response;
    }
    if (u.includes('/widget/config')) {
      if (opts.invalidKey) {
        return { ok: false, status: 404, json: async () => ({ success: false, data: null }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: config }) } as Response;
    }
    if (u.includes('/widget/events')) {
      eventCalls.push(JSON.parse(String(init?.body)) as EventBody);
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'ev-1' } }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fn);
}

const IMPACT = {
  month: '2026-07',
  estimated_co2_kg: 16.6,
  tree_equivalent: 0.8,
  contributions_count: 4,
  is_estimated: true,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mountWidget(attrs: Record<string, string>) {
  const el = document.createElement(TAG);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await flush();
  return el;
}

function baseAttrs() {
  return { 'data-key': 'key-1', 'data-api': API, 'data-nights': '3', 'data-lang': 'tr' };
}

beforeEach(() => {
  eventCalls = [];
  document.body.innerHTML = '';
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('green-gold-widget', () => {
  it('(a) remove + append: hata yok, TEK shadow root (#5)', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());
    expect(el.shadowRoot).toBeTruthy();
    expect(el.shadowRoot!.querySelectorAll('style')).toHaveLength(1);
    expect(el.shadowRoot!.querySelector('.card')).toBeTruthy();

    // DOM'dan çıkar ve tekrar ekle — attachShadow tekrar çağrılmamalı.
    document.body.removeChild(el);
    document.body.appendChild(el);
    await flush();

    expect(el.shadowRoot!.querySelectorAll('style')).toHaveLength(1);
    expect(el.shadowRoot!.querySelector('.card')).toBeTruthy();
  });

  it('(b) checkbox iki kez açılınca tek checkbox_secildi (#6)', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());
    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const selects = eventCalls.filter((e) => e.event_type === 'checkbox_secildi');
    expect(selects).toHaveLength(1);
  });

  it('(b2) önizleme modu: tüm etkileşimler çalışır ama HİÇ event POST edilmez', async () => {
    installFetch();
    const el = await mountWidget({ ...baseAttrs(), 'data-preview': 'true' });

    // Render oldu + "Önizleme" etiketi var.
    expect(el.shadowRoot!.querySelector('.card')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.preview-badge')).toBeTruthy();

    // Checkbox + buton: etkileşim tam çalışıyor.
    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    let dispatched = false;
    document.addEventListener('greengold:contribution-selected', () => { dispatched = true; }, { once: true });
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    btn.click();
    await flush();

    // Callback/CustomEvent çalışır ama analitik event'i sıfır.
    expect(dispatched).toBe(true);
    expect(eventCalls).toHaveLength(0);
  });

  it('(c) geçersiz key: render yok, host sayfa yaşıyor', async () => {
    installFetch({ invalidKey: true });
    const el = await mountWidget(baseAttrs());
    expect(el.shadowRoot!.querySelector('.card')).toBeNull();
    expect(document.body.contains(el)).toBe(true);
    // Geçersiz key event üretmez.
    expect(eventCalls).toHaveLength(0);
  });

  it('(e) canlı sayaç: impact > 0 -> satır + "Tahmini" rozeti', async () => {
    installFetch({ impact: IMPACT });
    const el = await mountWidget(baseAttrs());
    await flush(); // impact fetch + rerender

    const impact = el.shadowRoot!.querySelector('.impact');
    expect(impact).toBeTruthy();
    expect(impact!.textContent).toContain('16,6'); // tr-TR biçimi
    expect(impact!.querySelector('.badge')).toBeTruthy();
  });

  it('(f) impact yok/0 -> satır gizli (boş övünme yok)', async () => {
    installFetch({ impact: { ...IMPACT, estimated_co2_kg: 0 } });
    const el = await mountWidget(baseAttrs());
    await flush();
    expect(el.shadowRoot!.querySelector('.impact')).toBeNull();
  });

  it('(g) preview modda da canlı sayaç görünür ama event yok', async () => {
    installFetch({ impact: IMPACT });
    const el = await mountWidget({ ...baseAttrs(), 'data-preview': 'true' });
    await flush();
    expect(el.shadowRoot!.querySelector('.impact')).toBeTruthy();
    expect(eventCalls).toHaveLength(0); // impact bir GET, analitik event DEĞİL
  });

  it('(d) butona basınca greengold:contribution-selected yayınlanır (#4)', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());

    // Önce checkbox'ı işaretle (buton yalnızca seçiliyken aktif).
    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    let detail: Record<string, unknown> | null = null;
    document.addEventListener(
      'greengold:contribution-selected',
      (e) => {
        detail = (e as CustomEvent).detail;
      },
      { once: true },
    );

    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    btn.click();
    await flush();

    expect(detail).not.toBeNull();
    expect(detail!).toMatchObject({
      nights: 3,
      rooms: 1, // data-rooms verilmedi -> varsayılan 1 (geriye uyum)
      amount_total: 9, // 1 oda × 3 gece × 3/oda-gece
      currency: 'EUR',
    });
    expect(typeof detail!.session_ref).toBe('string');

    // button-press analitik event'i de gitmeli.
    const presses = eventCalls.filter((e) => e.event_type === 'katki_ekle_butonuna_basildi');
    expect(presses).toHaveLength(1);
  });
});

describe("green-gold-widget — dürüstlük metinleri (Princes' Palace Hedef 1)", () => {
  it('karbon-nötr/offset iddiası kalmadı; yeni tercih metni gösterilir', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());
    const text = el.shadowRoot!.textContent ?? '';

    expect(text).toContain('Daha sürdürülebilir bir konaklamayı destekle');
    expect(text).toContain('Bu seçeneği tercih ediyorum');
    expect(text).not.toMatch(/karbon-nötr/i);
    expect(text).not.toMatch(/dengeledik/i);
  });

  it('İngilizce metinlerde de karbon-nötr iddiası yok', async () => {
    installFetch();
    const el = await mountWidget({ ...baseAttrs(), 'data-lang': 'en' });
    const text = el.shadowRoot!.textContent ?? '';

    expect(text).toContain('Support a more sustainable stay');
    expect(text).not.toMatch(/carbon-neutral/i);
  });

  it('otel bazlı content override uygulanır; belirtilmeyen alanlar platform varsayılanında kalır', async () => {
    installFetch({
      config: {
        ...CONFIG,
        content_overrides: { tr: { addButton: 'Katkımı onayla' } },
      },
    });
    const el = await mountWidget(baseAttrs());
    const text = el.shadowRoot!.textContent ?? '';

    expect(text).toContain('Katkımı onayla'); // override
    expect(text).toContain('Daha sürdürülebilir bir konaklamayı destekle'); // platform varsayılanı
  });
});

describe("green-gold-widget — show_estimated_impact görünürlüğü (Princes' Palace Hedef 2)", () => {
  it('false iken: checkbox açılsa bile CO2 satırı/notu render edilmez', async () => {
    installFetch({ config: { ...CONFIG, show_estimated_impact: false } });
    const el = await mountWidget(baseAttrs());

    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(el.shadowRoot!.querySelector('.co2-value')).toBeNull();
    expect(el.shadowRoot!.querySelector('.co2-note')).toBeNull();
    // Katkı tutarı satırı (finansal niyet) buna rağmen görünür kalır.
    expect(el.shadowRoot!.querySelector('.line-value')).toBeTruthy();
  });

  it('false iken: aylık toplu impact satırı da hiç render edilmez (API 0 dönse dahi)', async () => {
    installFetch({
      config: { ...CONFIG, show_estimated_impact: false },
      impact: { ...IMPACT, estimated_co2_kg: 0, tree_equivalent: 0 },
    });
    const el = await mountWidget(baseAttrs());
    await flush();
    expect(el.shadowRoot!.querySelector('.impact')).toBeNull();
  });

  it('true iken: mevcut demo davranışı (CO2 satırı + impact) çalışmaya devam eder', async () => {
    installFetch({ config: { ...CONFIG, show_estimated_impact: true }, impact: IMPACT });
    const el = await mountWidget(baseAttrs());
    await flush();

    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(el.shadowRoot!.querySelector('.co2-value')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.impact')).toBeTruthy();
  });
});

interface TrackableElement extends HTMLElement {
  trackBookingEngineClick?: () => void;
}

describe("green-gold-widget — booking_engine_clicked public method (Princes' Palace Hedef 3)", () => {
  it('metod çağrılınca tam olarak bir booking_engine_clicked event gider', async () => {
    installFetch();
    const el = (await mountWidget(baseAttrs())) as TrackableElement;
    el.trackBookingEngineClick!();
    await flush();

    const clicks = eventCalls.filter((e) => e.event_type === 'booking_engine_clicked');
    expect(clicks).toHaveLength(1);
  });

  it('idempotency: iki kez çağrılsa da tek event (mevcut sendOnce modeli)', async () => {
    installFetch();
    const el = (await mountWidget(baseAttrs())) as TrackableElement;
    el.trackBookingEngineClick!();
    el.trackBookingEngineClick!();
    await flush();

    const clicks = eventCalls.filter((e) => e.event_type === 'booking_engine_clicked');
    expect(clicks).toHaveLength(1);
  });

  it('preview modda hiçbir event POST edilmez', async () => {
    installFetch();
    const el = (await mountWidget({ ...baseAttrs(), 'data-preview': 'true' })) as TrackableElement;
    el.trackBookingEngineClick!();
    await flush();
    expect(eventCalls).toHaveLength(0);
  });

  it('data-key olmadan (bağlanmamış element) çağrılırsa sessizce no-op — host sayfa bozulmaz', async () => {
    installFetch();
    const el = document.createElement(TAG) as TrackableElement;
    // data-key kasıtlı olarak YOK -> connectedCallback erken döner, key boş kalır.
    document.body.appendChild(el);
    await flush();
    expect(() => el.trackBookingEngineClick!()).not.toThrow();
    expect(eventCalls).toHaveLength(0);
  });
});

describe("green-gold-widget — data-tracker-only modu (inceleme düzeltmesi: sahte görüntülenme üretmemeli)", () => {
  it('kart render edilmez, shadow root kurulmaz, config/impact/widget_goruntulendi ÜRETİLMEZ', async () => {
    installFetch({ impact: IMPACT });
    const el = await mountWidget({ ...baseAttrs(), 'data-tracker-only': 'true' });
    await flush();

    expect(el.shadowRoot).toBeNull();
    expect(eventCalls).toHaveLength(0); // özellikle widget_goruntulendi YOK
  });

  it('trackBookingEngineClick() çağrılınca tam olarak bir event gider', async () => {
    installFetch();
    const el = (await mountWidget({ ...baseAttrs(), 'data-tracker-only': 'true' })) as TrackableElement;
    el.trackBookingEngineClick!();
    await flush();

    const clicks = eventCalls.filter((e) => e.event_type === 'booking_engine_clicked');
    expect(clicks).toHaveLength(1);
    expect(eventCalls).toHaveLength(1); // başka HİÇBİR event yok (özellikle widget_goruntulendi)
  });

  it('idempotency: iki çağrıda tek event', async () => {
    installFetch();
    const el = (await mountWidget({ ...baseAttrs(), 'data-tracker-only': 'true' })) as TrackableElement;
    el.trackBookingEngineClick!();
    el.trackBookingEngineClick!();
    await flush();

    const clicks = eventCalls.filter((e) => e.event_type === 'booking_engine_clicked');
    expect(clicks).toHaveLength(1);
  });

  it('preview + tracker-only birlikte: hiçbir event gitmez', async () => {
    installFetch();
    const el = (await mountWidget({
      ...baseAttrs(),
      'data-tracker-only': 'true',
      'data-preview': 'true',
    })) as TrackableElement;
    el.trackBookingEngineClick!();
    await flush();
    expect(eventCalls).toHaveLength(0);
  });

  it('geçersiz key/origin durumunda host sayfa bozulmaz (element sessizce durur)', async () => {
    installFetch({ invalidKey: true });
    const el = document.createElement(TAG) as TrackableElement;
    for (const [k, v] of Object.entries({ ...baseAttrs(), 'data-tracker-only': 'true' })) {
      el.setAttribute(k, v);
    }
    expect(() => document.body.appendChild(el)).not.toThrow();
    await flush();
    expect(document.body.contains(el)).toBe(true);
    expect(() => el.trackBookingEngineClick!()).not.toThrow();
  });

  it('görünür normal widget davranışı değişmedi: tracker-only OLMAYAN element hâlâ görüntülenme event\'i üretir', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());
    await flush();

    expect(el.shadowRoot).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.card')).toBeTruthy();
    const views = eventCalls.filter((e) => e.event_type === 'widget_goruntulendi');
    expect(views).toHaveLength(1);
  });
});

describe("green-gold-widget — journey_id (Princes' Palace Hedef 4)", () => {
  it('data-journey-id verilirse event\'lerde session_ref olarak kullanılır', async () => {
    installFetch();
    await mountWidget({ ...baseAttrs(), 'data-journey-id': 'wp-journey-abc' });
    await flush();

    const views = eventCalls.filter((e) => e.event_type === 'widget_goruntulendi');
    expect(views).toHaveLength(1);
    expect(views[0].session_ref).toBe('wp-journey-abc');
  });

  it('data-journey-id yoksa sessionStorage üzerinden İKİ AYRI element (simüle edilen sayfa geçişi) AYNI kimliği paylaşır', async () => {
    installFetch();
    const el1 = await mountWidget(baseAttrs());
    document.body.removeChild(el1);

    await mountWidget(baseAttrs());

    const refs = eventCalls
      .filter((e) => e.event_type === 'widget_goruntulendi')
      .map((e) => e.session_ref);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]); // sessionStorage'dan kalıcı, sayfalar arası aynı
  });

  it('sessionStorage erişilemezse (gizli mod vb.) widget yine de sessizce çalışır', async () => {
    installFetch();
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      const el = await mountWidget(baseAttrs());
      expect(el.shadowRoot!.querySelector('.card')).toBeTruthy();
      const views = eventCalls.filter((e) => e.event_type === 'widget_goruntulendi');
      expect(views).toHaveLength(1);
      expect(typeof views[0].session_ref).toBe('string');
      expect(views[0].session_ref.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: original,
      });
    }
  });

  it('aşırı uzun data-journey-id yok sayılır, sessionStorage yoluna düşer', async () => {
    installFetch();
    await mountWidget({ ...baseAttrs(), 'data-journey-id': 'x'.repeat(101) });
    await flush();
    const views = eventCalls.filter((e) => e.event_type === 'widget_goruntulendi');
    expect(views[0].session_ref).not.toBe('x'.repeat(101));
  });
});

describe('green-gold-widget — oda-gece hesabı (rooms × nights × oran)', () => {
  it('data-rooms=2 + data-nights=3 -> toplam 2 × 3 × oran ve alt etiket oda içerir', async () => {
    installFetch();
    const el = await mountWidget({ ...baseAttrs(), 'data-rooms': '2' });

    const sub = el.shadowRoot!.querySelector('.row-sub')!.textContent ?? '';
    expect(sub).toContain('2 oda');
    expect(sub).toContain('3 gece');

    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Toplam satırı: 2 oda × 3 gece × 3 EUR = 18
    const total = el.shadowRoot!.querySelector('.line-value')!.textContent ?? '';
    expect(total).toContain('18');

    // checkbox_secildi metadata'sında rooms + oda-gece tutarı.
    const select = eventCalls.find((e) => e.event_type === 'checkbox_secildi')!;
    expect(select.metadata).toMatchObject({ nights: 3, rooms: 2, amount_total: 18 });

    let detail: Record<string, unknown> | null = null;
    document.addEventListener(
      'greengold:contribution-selected',
      (e) => {
        detail = (e as CustomEvent).detail;
      },
      { once: true },
    );
    (el.shadowRoot!.querySelector('button') as HTMLButtonElement).click();
    await flush();

    expect(detail!).toMatchObject({ rooms: 2, nights: 3, amount_total: 18, currency: 'EUR' });

    const press = eventCalls.find((e) => e.event_type === 'katki_ekle_butonuna_basildi')!;
    expect(press.metadata).toMatchObject({ nights: 3, rooms: 2, amount_total: 18 });
  });

  it('data-rooms yok -> varsayılan 1; davranış eskisiyle birebir aynı (geriye uyum)', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());

    const sub = el.shadowRoot!.querySelector('.row-sub')!.textContent ?? '';
    expect(sub).toContain('3 gece');
    expect(sub).not.toContain('oda'); // tek odada oda ifadesi gösterilmez

    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // 1 oda × 3 gece × 3 EUR = 9 (eski davranış)
    expect(el.shadowRoot!.querySelector('.line-value')!.textContent).toContain('9');
    const select = eventCalls.find((e) => e.event_type === 'checkbox_secildi')!;
    expect(select.metadata).toMatchObject({ nights: 3, rooms: 1, amount_total: 9 });
  });

  it('geçersiz data-rooms (0 / metin) -> güvenle 1e düşer, host sayfa bozulmaz', async () => {
    installFetch();
    const el = await mountWidget({ ...baseAttrs(), 'data-rooms': 'abc' });
    const input = el.shadowRoot!.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(eventCalls.find((e) => e.event_type === 'checkbox_secildi')!.metadata).toMatchObject({
      rooms: 1,
      amount_total: 9,
    });
  });

  it('data-rooms canlı güncellenince yeniden çizer (observedAttributes)', async () => {
    installFetch();
    const el = await mountWidget(baseAttrs());
    el.setAttribute('data-rooms', '4');
    await flush();

    const sub = el.shadowRoot!.querySelector('.row-sub')!.textContent ?? '';
    expect(sub).toContain('4 oda');
  });

  it('EN: birden çok oda için "rooms" ifadesi gösterilir', async () => {
    installFetch();
    const el = await mountWidget({ ...baseAttrs(), 'data-lang': 'en', 'data-rooms': '2' });
    const sub = el.shadowRoot!.querySelector('.row-sub')!.textContent ?? '';
    expect(sub).toContain('2 rooms');
    expect(sub).toContain('3 nights');
  });
});
