import { render } from 'preact';
import { Widget } from './widget';
import { STYLES } from './styles';
import { fetchConfig, sendEvent } from './api';
import type { Lang, WidgetConfig } from './types';

const DEFAULT_API = 'http://localhost:3000';
const TAG = 'green-gold-widget';

function parseNights(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
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

class GreenGoldWidget extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['data-nights', 'data-lang'];
  }

  private mount?: HTMLDivElement;
  private config: WidgetConfig | null = null;
  private sessionRef = '';
  private key = '';
  private apiBase = DEFAULT_API;
  /** Bu session'da hangi event tipleri gönderildi — her tip en fazla bir kez. */
  private sentEvents = new Set<string>();

  async connectedCallback(): Promise<void> {
    // data-key yoksa hiçbir şey yapma — host sayfayı asla bozma.
    this.key = this.getAttribute('data-key') ?? '';
    if (!this.key) return;

    this.apiBase = this.getAttribute('data-api') ?? DEFAULT_API;
    // sessionRef ve gönderilen-event seti örnek ömrü boyunca KALICI:
    // element DOM'dan çıkıp tekrar eklenince aynı session sürer.
    if (!this.sessionRef) this.sessionRef = randomSessionRef();

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
  }

  /** Aynı event tipini session başına en fazla bir kez gönderir. */
  private sendOnce(
    type: 'widget_goruntulendi' | 'checkbox_secildi' | 'katki_ekle_butonuna_basildi',
    metadata: Record<string, unknown>,
  ): void {
    if (this.sentEvents.has(type)) return;
    this.sentEvents.add(type);
    sendEvent(this.apiBase, this.key, type, this.sessionRef, metadata);
  }

  attributeChangedCallback(name: string): void {
    // data-nights / data-lang host tarafından güncellenirse yeniden çiz.
    if (
      (name === 'data-nights' || name === 'data-lang') &&
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

  private rerender(): void {
    if (!this.config || !this.mount) return;
    const lang = parseLang(this.getAttribute('data-lang'));
    render(
      <Widget
        config={this.config}
        nights={this.nights()}
        lang={lang}
        onSelect={(amountTotal) =>
          this.sendOnce('checkbox_secildi', {
            nights: this.nights(),
            amount_total: amountTotal,
          })
        }
        onAdd={(amountTotal) => this.handleAdd(amountTotal)}
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
      amount_total: amountTotal,
    });
    this.dispatchEvent(
      new CustomEvent('greengold:contribution-selected', {
        bubbles: true,
        composed: true,
        detail: {
          session_ref: this.sessionRef,
          nights: this.nights(),
          amount_total: amountTotal,
          currency: this.config?.currency ?? null,
        },
      }),
    );
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, GreenGoldWidget);
}
