import { render } from 'preact';
import { Widget } from './widget';
import { STYLES } from './styles';
import { fetchConfig, fetchImpact, sendEvent } from './api';
import { ensureFonts, fontBaseFrom } from './fonts';
import type { Lang, WidgetConfig, WidgetEventType, WidgetImpact } from './types';

const DEFAULT_API = 'http://localhost:3000';
const TAG = 'green-gold-widget';

// Betiğin kendi adresi (IIFE yüklenirken bir kez okunur): DM Sans bu kökten
// servis edilir (panel public/green-gold-widget-fonts). Bilinemezse sistem
// yazı tipi kullanılır.
const FONT_BASE = fontBaseFrom(
  typeof document !== 'undefined'
    ? (document.currentScript as HTMLScriptElement | null)?.src
    : null,
);

// GreenGold Stay imza logosu: betiği servis eden panelin public/brand klasörü.
const BRAND_LOGO = FONT_BASE
  ? FONT_BASE.replace(/green-gold-widget-fonts\/$/, 'brand/greengold-logo.png')
  : null;

// API'nin olay doğrulamasıyla AYNI sınırlar (green-gold-api
// src/widget/dto/create-widget-event.dto.ts: nights ≤ 365, rooms ≤ 1000).
// Aralık dışı değer (ör. host sayfanın tarih farkını milisaniye vermesi)
// geçersiz sayılır ve 1'e düşer: ekranda saçma toplam gösterilmez, olay da
// API'de sessizce reddedilmez.
const MAX_NIGHTS = 365;
const MAX_ROOMS = 1000;

function parseCount(raw: string | null, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  const whole = Math.floor(n);
  return whole <= max ? whole : 1;
}

function parseNights(raw: string | null): number {
  return parseCount(raw, MAX_NIGHTS);
}

function parseRooms(raw: string | null): number {
  return parseCount(raw, MAX_ROOMS);
}

function parseLang(raw: string | null): Lang {
  return raw === 'en' ? 'en' : 'tr';
}

function randomSessionRef(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const JOURNEY_STORAGE_KEY = 'greengold_journey_id';
const MAX_JOURNEY_ID_LEN = 100; // API session_ref MaxLength(100) ile tutarlı

/**
 * Kişisel veri İÇERMEYEN, sayfalar arası devam eden yolculuk kimliği.
 *   1) `data-journey-id` host tarafından verilmişse (kendi kimliğini
 *      yönetmek isteyen bir WordPress entegrasyonu) -> o kullanılır.
 *   2) Yoksa first-party `sessionStorage` (aynı sekme/oturum boyunca kalıcı,
 *      üçüncü taraf izleme YOK, sekme kapanınca temizlenir) -> ilk sayfada
 *      üretilir, sonraki sayfalarda okunur.
 *   3) Storage erişilemezse (gizli mod/engellenmiş) -> bu örnek ömrü boyunca
 *      geçerli rastgele bir kimliğe GÜVENLE düşer (host sayfa asla bozulmaz).
 */
function resolveJourneyId(attrValue: string | null): string {
  const attr = attrValue?.trim();
  if (attr && attr.length <= MAX_JOURNEY_ID_LEN) return attr;

  try {
    const existing = window.sessionStorage.getItem(JOURNEY_STORAGE_KEY);
    if (existing) return existing;
    const created = randomSessionRef();
    window.sessionStorage.setItem(JOURNEY_STORAGE_KEY, created);
    return created;
  } catch {
    return randomSessionRef();
  }
}

class GreenGoldWidget extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['data-nights', 'data-rooms', 'data-lang', 'data-preview-amount', 'data-preview-co2', 'data-preview-currency', 'data-preview-source', 'data-preview-basis'];
  }

  private mount?: HTMLDivElement;
  private config: WidgetConfig | null = null;
  private impact: WidgetImpact | null = null;
  private sessionRef = '';
  private key = '';
  private apiBase = DEFAULT_API;
  /** Önizleme modu: hiç event POST'lanmaz (panel açan yönetici analitiği şişirmesin). */
  private preview = false;
  /**
   * Tracker-only modu (`data-tracker-only="true"`): yalnızca
   * `trackBookingEngineClick()` çağrılabilsin diye "key + sessionRef" hazırlığı
   * yapılır — kart RENDER EDİLMEZ, config/impact ÇEKİLMEZ, `widget_goruntulendi`
   * ASLA gönderilmez. Header/nav gibi Book bağlantısı olan ama sürdürülebilirlik
   * kartının görünmesi istenmeyen sayfalarda kullanılır; gizli bir kart sahte
   * "görüntülenme" üretmesin diye ayrı bir mod olarak tasarlandı (bkz. kök
   * WordPress dokümanı §5, §9). Reaktif olması gerekmediği için
   * `observedAttributes`'e eklenmedi — yalnızca ilk bağlanmada okunur.
   */
  private trackerOnly = false;
  /** Bu session'da hangi event tipleri gönderildi — her tip en fazla bir kez. */
  private sentEvents = new Set<string>();

  async connectedCallback(): Promise<void> {
    // data-key yoksa hiçbir şey yapma — host sayfayı asla bozma.
    this.key = this.getAttribute('data-key') ?? '';
    if (!this.key) return;

    this.apiBase = this.getAttribute('data-api') ?? DEFAULT_API;
    this.preview = this.getAttribute('data-preview') === 'true';
    this.trackerOnly = this.getAttribute('data-tracker-only') === 'true';
    // sessionRef ve gönderilen-event seti örnek ömrü boyunca KALICI:
    // element DOM'dan çıkıp tekrar eklenince aynı session sürer.
    if (!this.sessionRef) {
      this.sessionRef = resolveJourneyId(this.getAttribute('data-journey-id'));
    }

    // Tracker-only: yalnızca trackBookingEngineClick() için gereken (key +
    // sessionRef) hazır. Kart yok, config/impact isteği yok, görüntülenme
    // event'i yok — gizli bir element sahte görüntülenme/funnel verisi
    // üretmesin.
    if (this.trackerOnly) return;

    // Görünen kart için yazı tipi (belgeye bir kez; hata → sistem yazı tipi).
    ensureFonts(FONT_BASE);

    // Tek shadow root: remove+append'te attachShadow tekrar çağrılırsa patlar.
    // Yalnızca yoksa kur -> element güvenle yeniden bağlanabilir.
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLES;
      this.mount = document.createElement('div');
      shadow.append(style, this.mount);
    } else if (!this.mount) {
      this.mount =
        (this.shadowRoot.querySelector('div') as HTMLDivElement) ?? undefined;
    }

    // Config bir kez çekilir; yeniden bağlanınca yalnızca render edilir.
    if (!this.config) {
      const config = await fetchConfig(this.apiBase, this.key);
      if (!config) return; // geçersiz key / hata -> sessizce render etme
      this.config = config;
    }

    this.rerender();

    // widget_goruntulendi session başına yalnızca BİR kez.
    this.sendOnce('widget_goruntulendi', { nights: this.nights() });

    // Canlı sayaç (aylık toplu tahmini etki). Config gibi okunur (event DEĞİL),
    // preview modda da çekilir. Başarısızsa satır sessizce gizli kalır.
    void this.loadImpact();
  }

  private async loadImpact(): Promise<void> {
    if (this.impact) return; // örnek ömrü boyunca bir kez yeter
    const impact = await fetchImpact(this.apiBase, this.key);
    if (impact) {
      this.impact = impact;
      this.rerender();
    }
  }

  /** Aynı event tipini session başına en fazla bir kez gönderir. */
  private sendOnce(type: WidgetEventType, metadata: Record<string, unknown>): void {
    // Önizleme: etkileşim çalışır, callback'ler tetiklenir; ama analitik yok.
    if (this.preview) return;
    if (this.sentEvents.has(type)) return;
    this.sentEvents.add(type);
    sendEvent(this.apiBase, this.key, type, this.sessionRef, metadata);
  }

  attributeChangedCallback(name: string): void {
    // data-nights / data-rooms / data-lang host tarafından güncellenirse yeniden çiz.
    if (
      GreenGoldWidget.observedAttributes.includes(name) &&
      this.config &&
      this.mount
    ) {
      this.rerender();
    }
  }

  disconnectedCallback(): void {
    if (this.mount) render(null, this.mount);
  }

  private nights(): number {
    return parseNights(this.getAttribute('data-nights'));
  }

  private withPreviewOverride(config: WidgetConfig): WidgetConfig {
    if (!this.preview) return config;
    const amount = Number(this.getAttribute('data-preview-amount'));
    const co2 = Number(this.getAttribute('data-preview-co2'));
    const currency = this.getAttribute('data-preview-currency');
    const source = this.getAttribute('data-preview-source') === 'regional' ? 'regional' : 'hotel';
    // Önizleme fiyatı başka bir kaynaktan olabilir: ölçüm tabanı yalnız açıkça istenirse.
    const basis =
      this.getAttribute('data-preview-basis') === 'measured_scope_1_2' ? 'measured_scope_1_2' : undefined;
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(co2) || co2 <= 0 || !currency) return config;
    return {
      ...config,
      amount_per_night: amount,
      estimated_co2_per_night_kg: co2,
      currency,
      carbon_pricing_demo: true,
      carbon_estimate_source: source,
      carbon_estimate_basis: basis,
    };
  }

  /** Oda sayısı — host rezervasyon formundan besler; yoksa 1 (geriye uyum). */
  private rooms(): number {
    return parseRooms(this.getAttribute('data-rooms'));
  }

  private rerender(): void {
    if (!this.config || !this.mount) return;
    const lang = parseLang(this.getAttribute('data-lang'));
    render(
      <Widget
        config={this.withPreviewOverride(this.config)}
        nights={this.nights()}
        rooms={this.rooms()}
        lang={lang}
        onSelect={(amountTotal) =>
          this.sendOnce('checkbox_secildi', {
            nights: this.nights(),
            rooms: this.rooms(),
            amount_total: amountTotal,
          })
        }
        onAdd={(amountTotal) => this.handleAdd(amountTotal)}
        preview={this.preview}
        impact={this.impact}
        brandLogo={BRAND_LOGO}
      />,
      this.mount,
    );
  }

  /**
   * Katkı butonu: analitik event'i (session başına tek) + host callback.
   * Widget "başardım/ödedim" DEMEZ; kontrolü otele devreder — host sayfa
   * kendi checkout'unda tutarı gerçekten ekleyip Faz 2'de doğrulanmış işlem yollar.
   */
  private handleAdd(amountTotal: number): void {
    this.sendOnce('katki_ekle_butonuna_basildi', {
      nights: this.nights(),
      rooms: this.rooms(),
      amount_total: amountTotal,
    });
    this.dispatchEvent(
      new CustomEvent('greengold:contribution-selected', {
        bubbles: true,
        composed: true,
        detail: {
          session_ref: this.sessionRef,
          nights: this.nights(),
          rooms: this.rooms(),
          amount_total: amountTotal,
          currency: this.config?.currency ?? null,
        },
      }),
    );
  }

  /**
   * PUBLIC method — host sayfanın (ör. WordPress ana sitesi) SynXis booking
   * engine bağlantısına yönlendiren "Book" linkine tıklamayı ölçmesi için.
   *
   *   document.querySelector('green-gold-widget')?.trackBookingEngineClick();
   *
   * Bu bir rezervasyon/ödeme onayı DEĞİLDİR — yalnızca "misafir Book
   * bağlantısına tıkladı" bilgisini kaydeder (event: booking_engine_clicked).
   * Otel bazlı feature flag KAPALIYSA API isteği **400** ile reddeder; bu
   * istek `sendEvent()` üzerinden fire-and-forget gönderildiği için (yanıtı
   * bekletmez/kontrol etmez) host sayfa bu 400'ü hiç görmez — Book linkinin
   * navigasyonu bundan ASLA etkilenmez/geciktirilmez.
   * Element henüz bağlanmamışsa (data-key yok) ya da preview modundaysa
   * sessizce no-op — host sayfa hiçbir zaman bozulmaz.
   */
  trackBookingEngineClick(): void {
    if (!this.key) return;
    this.sendOnce('booking_engine_clicked', {});
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, GreenGoldWidget);
}

