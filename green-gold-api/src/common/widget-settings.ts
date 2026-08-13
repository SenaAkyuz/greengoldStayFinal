/**
 * Otel bazlı widget konfigürasyonu — `hotels.widget_settings` (JSONB) için tek
 * doğrulama/normalizasyon noktası. Sürüm bilinçli, tek küçük JSONB kolonu
 * (ayrı bir `hotel_widget_settings` tablosu bu ölçekte aşırı mühendislik olur;
 * satır başına tek otel, ilişkisel sorgu ihtiyacı yok).
 *
 * Savunma katmanı: bu değer yalnızca operatör script'i veya bu modüldeki
 * validator'dan geçerek yazılsa da, DB'den okurken YİNE savunmacı davranırız —
 * bozuk/eksik/yabancı bir satır asla widget'ı veya diğer oteli etkilemez;
 * eksik/geçersiz alan sessizce güvenli varsayılana düşer.
 */

export const WIDGET_SETTINGS_VERSION = 1;

/** Yalnızca düz metin — HTML/etiket YOK. XSS'e karşı serbest HTML asla kabul edilmez. */
export interface ContentOverrideStrings {
  heading?: string;
  checkboxLabel?: string;
  addButton?: string;
  confirmation?: string;
}

export interface ContentOverrides {
  tr?: ContentOverrideStrings;
  en?: ContentOverrideStrings;
}

export interface WidgetSettings {
  version: number;
  pilotMode: boolean;
  showEstimatedImpact: boolean;
  enableBookingClickTracking: boolean;
  contentOverrides: ContentOverrides;
}

export const SAFE_DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  version: WIDGET_SETTINGS_VERSION,
  pilotMode: false,
  showEstimatedImpact: false,
  enableBookingClickTracking: false,
  contentOverrides: {},
};

const OVERRIDABLE_FIELDS = [
  'heading',
  'checkboxLabel',
  'addButton',
  'confirmation',
] as const;

const MAX_OVERRIDE_TEXT_LEN = 200;
// Katı: '<' veya '>' içeren HERHANGİ bir metin reddedilir (HTML/etiket enjeksiyonu yok).
const HTML_LIKE = /[<>]/;

/** Tek bir override alanını doğrular: düz metin, uzunluk sınırı, HTML yok. */
function sanitizeOverrideText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_OVERRIDE_TEXT_LEN) return undefined;
  if (HTML_LIKE.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * CLI/operatör girişi için SESSİZCE düşürmek yerine FIRLATAN doğrulama —
 * yanlış yazılmış/HTML içeren bir değer operatöre net bir hatayla geri
 * bildirilsin, veritabanına yazılıp sonra sessizce okunmaz olmasın.
 */
export function assertValidOverrideText(field: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} boş olamaz.`);
  }
  if (trimmed.length > MAX_OVERRIDE_TEXT_LEN) {
    throw new Error(
      `${field} en fazla ${MAX_OVERRIDE_TEXT_LEN} karakter olabilir.`,
    );
  }
  if (HTML_LIKE.test(trimmed)) {
    throw new Error(`${field} HTML/etiket içeremez ('<' veya '>').`);
  }
}

function sanitizeOverrideGroup(raw: unknown): ContentOverrideStrings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: ContentOverrideStrings = {};
  for (const field of OVERRIDABLE_FIELDS) {
    const s = sanitizeOverrideText(r[field]);
    if (s) out[field] = s;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Ham (DB'den gelen veya operatör girdisi) bir değeri güvenli, tip'li
 * `WidgetSettings`'e çevirir. Girdi bulunamazsa/bozuksa -> güvenli platform
 * varsayılanları (Faz 1 karar #6 ile tutarlı: sürdürülebilirlik/tracking
 * varsayılan KAPALI).
 */
export function resolveWidgetSettings(raw: unknown): WidgetSettings {
  const safe: WidgetSettings = {
    ...SAFE_DEFAULT_WIDGET_SETTINGS,
    contentOverrides: {},
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return safe;

  const r = raw as Record<string, unknown>;
  if (typeof r.pilot_mode === 'boolean') safe.pilotMode = r.pilot_mode;
  if (typeof r.show_estimated_impact === 'boolean') {
    safe.showEstimatedImpact = r.show_estimated_impact;
  }
  if (typeof r.enable_booking_click_tracking === 'boolean') {
    safe.enableBookingClickTracking = r.enable_booking_click_tracking;
  }

  const co = r.content_overrides;
  if (co && typeof co === 'object' && !Array.isArray(co)) {
    const coR = co as Record<string, unknown>;
    const tr = sanitizeOverrideGroup(coR.tr);
    const en = sanitizeOverrideGroup(coR.en);
    if (tr) safe.contentOverrides.tr = tr;
    if (en) safe.contentOverrides.en = en;
  }

  return safe;
}

/** `WidgetSettings` -> DB'ye/istemciye yazılacak düz JSON şekli. */
export function toStoredWidgetSettings(
  settings: WidgetSettings,
): Record<string, unknown> {
  return {
    version: WIDGET_SETTINGS_VERSION,
    pilot_mode: settings.pilotMode,
    show_estimated_impact: settings.showEstimatedImpact,
    enable_booking_click_tracking: settings.enableBookingClickTracking,
    content_overrides: settings.contentOverrides,
  };
}
