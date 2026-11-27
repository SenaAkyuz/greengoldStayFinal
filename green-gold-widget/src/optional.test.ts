import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './main';

/**
 * Katkı TAMAMEN İSTEĞE BAĞLIDIR: varsayılan seçili gelmez, misafir hiçbir şey
 * yapmadan rezervasyonuna devam edebilir, widget otel sayfasının akışını
 * (form, buton, gezinme) engellemez; kendiliğinden seçim/katkı sinyali üretmez.
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

beforeEach(() => {
  events = [];
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/widget/impact')) return { ok: false, status: 404, json: async () => ({}) } as Response;
      if (u.includes('/widget/config')) return { ok: true, status: 200, json: async () => ({ success: true, data: CONFIG }) } as Response;
      if (u.includes('/widget/events')) {
        events.push((JSON.parse(String(init?.body)) as { event_type: string }).event_type);
        return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'e' } }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Otel sitesinin ödeme formunu taklit eder: widget formun İÇİNDE durur. */
async function mountInHostForm() {
  const form = document.createElement('form');
  form.id = 'checkout';
  const continueBtn = document.createElement('button');
  continueBtn.type = 'submit';
  continueBtn.textContent = 'Rezervasyonu tamamla';
  const el = document.createElement('green-gold-widget');
  for (const [k, v] of Object.entries({ 'data-key': 'k', 'data-api': API, 'data-nights': '2', 'data-lang': 'tr' })) el.setAttribute(k, v);
  const selected: Event[] = [];
  el.addEventListener('greengold:contribution-selected', (e) => selected.push(e));
  form.append(el, continueBtn);
  document.body.appendChild(form);
  await flush();
  return { form, continueBtn, el, root: el.shadowRoot!, selected };
}

describe('katkı isteğe bağlı', () => {
  it('varsayılan SEÇİLİ GELMEZ; kaydet butonu pasif; toplam katkı gösterilmez', async () => {
    const { root } = await mountInHostForm();
    const input = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(input.defaultChecked).toBe(false);
    expect(input.hasAttribute('checked')).toBe(false);
    expect((root.querySelector('button.btn') as HTMLButtonElement).disabled).toBe(true);
    expect(root.querySelector('.details')).toBeNull();
  });

  it('zorunlu alan yok: kutu `required` değil, widget içinde form yok', async () => {
    const { root } = await mountInHostForm();
    expect(root.querySelector('[required]')).toBeNull();
    expect(root.querySelector('form')).toBeNull();
    // Widget'ın düğmesi type="button": otel formunu göndermez/engellemez.
    expect((root.querySelector('button.btn') as HTMLButtonElement).type).toBe('button');
  });

  it('misafir katkı yapmadan devam eder: otel formu gönderilebilir, widget engellemez', async () => {
    const { form, continueBtn, selected } = await mountInHostForm();
    let submitted = false;
    form.addEventListener('submit', (e) => {
      submitted = true;
      e.preventDefault(); // test ortamında sayfa değişmesin
    });
    continueBtn.click();
    expect(submitted).toBe(true);
    expect(form.checkValidity()).toBe(true);
    // Hiçbir seçim/katkı sinyali üretilmedi; yalnız görüntülenme kaydı.
    expect(selected).toHaveLength(0);
    expect(events).toEqual(['widget_goruntulendi']);
  });

  it('seçip vazgeçmek serbest: kutu kaldırılınca toplam gizlenir, buton yine pasif, katkı sinyali yok', async () => {
    const { root, selected } = await mountInHostForm();
    const input = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(root.querySelector('.details')).toBeTruthy();
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(root.querySelector('.details')).toBeNull();
    expect((root.querySelector('button.btn') as HTMLButtonElement).disabled).toBe(true);
    expect(selected).toHaveLength(0);
    expect(events).not.toContain('katki_ekle_butonuna_basildi');
  });

  it('katkı yalnız misafirin İKİ açık adımıyla (seç + kaydet) bildirilir; ücret eklenmediği söylenir', async () => {
    const { root, selected } = await mountInHostForm();
    (root.querySelector('button.btn') as HTMLButtonElement).click(); // pasifken tıklama → etkisiz
    await flush();
    expect(selected).toHaveLength(0);
    const input = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(selected).toHaveLength(0);
    (root.querySelector('button.btn') as HTMLButtonElement).click();
    await flush();
    expect(selected).toHaveLength(1);
    expect(root.querySelector('.confirm')!.textContent).toMatch(/herhangi bir ücret eklenmedi/);
  });

  it('metin: tercih dili ("tercih ediyorum"), zorunluluk ifadesi yok', async () => {
    const { root } = await mountInHostForm();
    const text = (root.querySelector('.card')!.textContent ?? '').toLowerCase();
    expect(text).toContain('tercih');
    expect(text).not.toMatch(/zorunlu|gerekli|must|required/);
  });
});
