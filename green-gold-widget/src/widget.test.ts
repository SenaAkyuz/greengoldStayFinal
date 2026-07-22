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
};

interface EventBody {
  event_type: string;
  session_ref: string;
  metadata: Record<string, unknown>;
}

let eventCalls: EventBody[] = [];

function installFetch(opts: { invalidKey?: boolean } = {}) {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/widget/config')) {
      if (opts.invalidKey) {
        return { ok: false, status: 404, json: async () => ({ success: false, data: null }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: CONFIG }) } as Response;
    }
    if (u.includes('/widget/events')) {
      eventCalls.push(JSON.parse(String(init?.body)) as EventBody);
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'ev-1' } }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fn);
}

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

  it('(c) geçersiz key: render yok, host sayfa yaşıyor', async () => {
    installFetch({ invalidKey: true });
    const el = await mountWidget(baseAttrs());
    expect(el.shadowRoot!.querySelector('.card')).toBeNull();
    expect(document.body.contains(el)).toBe(true);
    // Geçersiz key event üretmez.
    expect(eventCalls).toHaveLength(0);
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
      amount_total: 9, // 3 gece × 3/gece
      currency: 'EUR',
    });
    expect(typeof detail!.session_ref).toBe('string');

    // button-press analitik event'i de gitmeli.
    const presses = eventCalls.filter((e) => e.event_type === 'katki_ekle_butonuna_basildi');
    expect(presses).toHaveLength(1);
  });
});
