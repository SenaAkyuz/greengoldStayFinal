import { useState } from 'preact/hooks';
import type { Lang, WidgetConfig, WidgetImpact } from './types';
import { resolveStrings } from './i18n';
import { resolveAccent } from './colors';

interface Props {
  config: WidgetConfig;
  nights: number;
  /** Oda sayısı — tutar oda × gece × oran olarak hesaplanır. */
  rooms: number;
  lang: Lang;
  /** Checkbox İLK kez işaretlendiğinde (açılınca) çağrılır. */
  onSelect: (amountTotal: number) => void;
  /** "Katkıyı ekle" butonuna basılınca çağrılır. */
  onAdd: (amountTotal: number) => void;
  /** Önizleme modu: etkileşim çalışır ama küçük bir "Önizleme" etiketi gösterilir. */
  preview?: boolean;
  /** Aylık toplu tahmini etki (canlı sayaç). Yoksa/0 ise satır gösterilmez. */
  impact?: WidgetImpact | null;
  /**
   * GreenGold Stay marka imzasının logosu (betiğin kendi alan adından). Yoksa
   * ya da sitenin CSP'si görseli engellerse yerleşik amblem çizimi kullanılır.
   */
  brandLogo?: string | null;
}

/**
 * Para: gecelik katkı bir FİYATTIR (kuruş/cent; HotelRunner'daki gecelik
 * ekstra fiyatla aynı). Toplam = gecelik fiyat × gece × oda, kuruş tam
 * sayısıyla hesaplanır (kayan nokta artığı yok). UX-4.7.
 */
export function contributionTotal(perNight: number, nights: number, rooms: number): number {
  const cents = Math.round(perNight * 100);
  return (cents * nights * rooms) / 100;
}
/**
 * Emisyon: tahmindir; hassas gecelik değerden çarpılır, yalnız gösterimde
 * yuvarlanır (erken yuvarlama 6 × 0,69 = 4,14 yerine 6 × 0,687 = 4,12). UX-4.7.
 */
export function footprintTotal(perNightKg: number, nights: number, rooms: number): number {
  return perNightKg * nights * rooms;
}

// Yalnızca katı hex'i CSS değişkenine yaz — ham string style'a ASLA enjekte
// edilmez. K4: otel rengi buton zemini ve vurgu olur; beyazla kontrastı
// 4,5:1'in altındaysa güvenli varsayılan (çam yeşili) kullanılır (colors.ts).
export function accentStyle(color: string | null | undefined): string | undefined {
  const { accent, fromHotel } = resolveAccent(color);
  return fromHotel ? `--gg-accent:${accent}` : undefined;
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
    // Kuruşlu tutarlar her zaman iki haneyle (0,10 €; 0,1 € değil); tam
    // sayılar kısa (3 €).
    const whole = Number.isInteger(value);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
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

/** GreenGold Stay amblemi (logo yüklenemezse; resmi SVG gelince değiştirilecek). */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#0b393a" />
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="#d3a632" stroke-width="1.2" />
      <path d="M16 24v-9" stroke="#f3cc61" stroke-width="1.6" stroke-linecap="round" />
      <path d="M16 17c-3.6 0-5.6-2.2-5.6-5.4 3.4 0 5.6 2 5.6 5.4Zm0-1.6c0-3.4 2.2-5.6 5.6-5.6 0 3.4-2.2 5.6-5.6 5.6Z" fill="#8be3d1" />
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

export function Widget({
  config,
  nights,
  rooms,
  lang,
  onSelect,
  onAdd,
  preview,
  impact,
  brandLogo,
}: Props) {
  const t = resolveStrings(lang, config.content_overrides);
  // Ölçüm tabanlı (Kapsam 1–2) fiyat: ek dürüstlük notu; faktör hiç gösterilmez.
  const measured = config.carbon_estimate_basis === 'measured_scope_1_2';
  const numLocale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const fmtNum = (n: number, max = 1) =>
    n.toLocaleString(numLocale, { maximumFractionDigits: max });
  // config.show_estimated_impact ek savunma katmanı: API zaten kapalıyken
  // estimated_co2_kg'yi 0 döner, ama gösterim mantığı da flag'i doğrudan
  // kontrol eder — "hiç render etme" gereksinimi tek noktaya bağlı kalmasın.
  const showImpact =
    !!config.show_estimated_impact && !!impact && impact.estimated_co2_kg > 0;
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const amountTotal = contributionTotal(config.amount_per_night, nights, rooms);
  const co2Total = footprintTotal(config.estimated_co2_per_night_kg, nights, rooms);
  // K3: ayak izi SEÇİMDEN ÖNCE de görünür — yalnız misafire gösterilmesine
  // izin verilen veriyle (show_estimated_impact ya da temsili fiyat modu).
  const showFootprint =
    (!!config.show_estimated_impact || !!config.carbon_pricing_demo) && co2Total > 0;
  const money = (v: number) => formatMoney(v, config.currency, lang);
  const accent = accentStyle(config.brand_color);
  const logo = safeHttpsLogo(config.logo_url);
  const brandSrc = !logoFailed ? safeHttpsLogo(brandLogo) ?? null : null;

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
    <div class={preview ? 'card preview' : 'card'} part="card" style={accent} lang={lang}>
      {/* KD-2: üstte OTELİN kimliği (misafir otelin sitesinde). */}
      <div class="head">
        <span class={logo ? 'mark has-logo' : 'mark'}>
          {logo ? (
            <img class="logo" src={logo} alt="" />
          ) : (
            <span class="initial" aria-hidden="true">{initialOf(config.hotel_name)}</span>
          )}
        </span>
        <span class="brand">
          <span class="hotel">{config.hotel_name}</span>
          <span class="brand-sub">{config.city ? `${config.city} · ${t.brandLine}` : t.brandLine}</span>
        </span>
        {preview && <span class="preview-badge">{t.previewBadge}</span>}
      </div>

      <div class="body">
        <p class="eyebrow">{t.eyebrow}</p>
        <h3 class="heading">{t.heading}</h3>
        <p class="subheading">{t.subheading(config.hotel_name)}</p>

        <div class="summary">
          <div class="rowval stay">
            <span class="rowval-label">{t.stayLabel}</span>
            <span class="rowval-value">{t.stayValue(nights, rooms)}</span>
          </div>
          {showFootprint && (
            <div class="rowval footprint">
              <span class="rowval-label">
                <LeafIcon />
                {t.footprintLabel}
              </span>
              <span class="co2-value">
                <b class="big">≈ {fmtNum(co2Total, co2Total < 10 ? 2 : 1)}</b>
                <span class="unit">kg CO₂e</span>
                {config.is_estimated && <span class="badge">{t.estimatedBadge}</span>}
              </span>
            </div>
          )}
        </div>

        <label class={checked || confirmed ? 'row checked' : 'row'}>
          <input
            type="checkbox"
            checked={checked}
            disabled={confirmed}
            onChange={handleToggle}
          />
          <span class="row-body">
            <span class="row-label">{t.checkboxLabel}</span>
            <span class="row-sub">
              {t.perNight(money(config.amount_per_night), rooms, nights)}
            </span>
          </span>
        </label>

        {/* Toplam yalnız misafir seçince (katkı varsayılan değil); kaydedildikten
            sonra da görünür kalır (UX-4.5). */}
        {(checked || confirmed) && (
          <div class={confirmed ? 'details saved' : 'details'} aria-live="polite">
            <div class="line">
              <span class="line-label">{confirmed ? t.savedTotalLabel : t.totalLabel}</span>
              <span class="line-value">{money(amountTotal)}</span>
            </div>
          </div>
        )}

        {!confirmed && (
          <div class="actions">
            <button
              type="button"
              class="btn"
              disabled={!checked}
              onClick={handleAdd}
            >
              {t.addButton}
            </button>
          </div>
        )}

        {confirmed && (
          <div class="confirm" role="status" aria-live="polite">
            <CheckIcon />
            <span>{t.confirmation}</span>
          </div>
        )}

        <div class="notes">
          {showFootprint && config.is_estimated && <p class="footprint-note">{t.co2Note}</p>}
          {config.carbon_pricing_demo && (
            <p class="co2-note">
              {t.sourceNote(config.carbon_estimate_source, measured, rooms)}
            </p>
          )}
          {config.carbon_pricing_demo && measured && (
            <p class="co2-note measured-note">{t.measuredNote}</p>
          )}
          {showImpact && impact && (
            <p class="impact">
              <span>
                {t.impactLine(
                  fmtNum(impact.estimated_co2_kg),
                  fmtNum(impact.tree_equivalent),
                )}
              </span>
              <span class="badge">{t.estimatedBadge}</span>
            </p>
          )}
        </div>
      </div>

      {/* KD-2: altta GreenGold Stay imzası. */}
      <div class="signature">
        <span class="sig-mark">
          {brandSrc ? (
            <img src={brandSrc} alt="" onError={() => setLogoFailed(true)} />
          ) : (
            <BrandMark />
          )}
        </span>
        <span>
          {t.signatureLead} <b>GreenGold Stay</b>
        </span>
      </div>
    </div>
  );
}

function initialOf(name: string): string {
  return (name.trim()[0] ?? 'G').toLocaleUpperCase('tr-TR');
}
