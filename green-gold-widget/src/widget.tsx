import { useState } from 'preact/hooks';
import type { Lang, WidgetConfig } from './types';
import { I18N } from './i18n';

interface Props {
  config: WidgetConfig;
  nights: number;
  lang: Lang;
  /** Checkbox İLK kez işaretlendiğinde (açılınca) çağrılır. */
  onSelect: (amountTotal: number) => void;
  /** "Katkıyı ekle" butonuna basılınca çağrılır. */
  onAdd: (amountTotal: number) => void;
  /** Önizleme modu: etkileşim çalışır ama küçük bir "Önizleme" etiketi gösterilir. */
  preview?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const HEX6 = /^#[0-9a-fA-F]{6}$/;
// Yalnızca katı hex'i CSS değişkenine yaz — ham string style'a ASLA enjekte edilmez.
function accentStyle(color: string | null | undefined): string | undefined {
  return color && HEX6.test(color) ? `--gg-accent:${color}` : undefined;
}
function safeHttpsLogo(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function formatMoney(value: number, currency: string, lang: Lang): string {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20c0-8 6-14 16-14 0 10-6 14-14 14"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M8 16c3-3 6-4.5 9-5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Widget({ config, nights, lang, onSelect, onAdd, preview }: Props) {
  const t = I18N[lang];
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const amountTotal = round2(nights * config.amount_per_night);
  const co2Total = round2(nights * config.estimated_co2_per_night_kg);
  const money = (v: number) => formatMoney(v, config.currency, lang);
  const accent = accentStyle(config.brand_color);
  const logo = safeHttpsLogo(config.logo_url);

  const handleToggle = (e: Event) => {
    const next = (e.currentTarget as HTMLInputElement).checked;
    setChecked(next);
    if (next) onSelect(amountTotal);
  };

  const handleAdd = () => {
    if (!checked) return;
    onAdd(amountTotal);
    setConfirmed(true);
  };

  return (
    <div class={preview ? 'card preview' : 'card'} part="card" style={accent}>
      {preview && <span class="preview-badge">{t.previewBadge}</span>}
      <div class="header">
        <span class="leaf">
          {logo ? (
            <img class="logo" src={logo} alt="" />
          ) : (
            <LeafIcon />
          )}
        </span>
        <h3 class="heading">{t.heading}</h3>
      </div>
      <p class="subheading">{t.subheading(config.hotel_name)}</p>

      <label class="row">
        <input
          type="checkbox"
          checked={checked}
          disabled={confirmed}
          onChange={handleToggle}
        />
        <span class="row-body">
          <span class="row-label">{t.checkboxLabel}</span>
          <span class="row-sub">
            {t.perNight(money(config.amount_per_night), nights)}
          </span>
        </span>
      </label>

      {checked && !confirmed && (
        <div class="details" aria-live="polite">
          <div class="line">
            <span class="line-label">{t.totalLabel}</span>
            <span class="line-value">{money(amountTotal)}</span>
          </div>
          <div class="line">
            <span class="line-label">{t.co2Label}</span>
            <span class="line-value co2-value">
              <span>≈ {co2Total} kg CO₂</span>
              {config.is_estimated && (
                <span class="badge">{t.estimatedBadge}</span>
              )}
            </span>
          </div>
          {config.is_estimated && <p class="co2-note">{t.co2Note}</p>}
        </div>
      )}

      {!confirmed && (
        <button
          type="button"
          class="btn"
          disabled={!checked}
          onClick={handleAdd}
        >
          {t.addButton}
        </button>
      )}

      {confirmed && (
        <div class="confirm" role="status" aria-live="polite">
          <CheckIcon />
          <span>{t.confirmation}</span>
        </div>
      )}
    </div>
  );
}
