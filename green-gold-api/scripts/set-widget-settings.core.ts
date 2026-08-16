/**
 * Bir otelin `widget_settings`'ini (pilot_mode, show_estimated_impact,
 * enable_booking_click_tracking, content_overrides) düzenleyen operatör
 * script'inin SAF çekirdeği — birim test edilir.
 *
 * NEDEN panel UI değil: bu bayraklar Green Gold operasyon ekibinin kontrolünde
 * kalmalı (ör. sürdürülebilirlik sayılarının ne zaman gösterileceği bir ürün/
 * hukuk kararı) — otel yöneticisinin kendi kendine açıp kapatabileceği bir
 * ayar değil. Panelde yeni bir ayar bölümü eklemek bu pilotun kapsamını
 * büyütür; bunun yerine mevcut operatör script'i deseniyle (activate-hotel,
 * rebind-demo-user) tutarlı, denetlenebilir bir CLI tercih edildi.
 *
 * Yalnızca AÇIKÇA verilen bayraklar değişir (kısmi güncelleme); verilmeyenler
 * mevcut değerinde kalır. Yazmadan önce mevcut değer `resolveWidgetSettings`
 * ile normalize edilir (bozuk bir satır asla yarı-güncellenmiş karışık bir
 * duruma düşmez).
 */
import {
  resolveWidgetSettings,
  toStoredWidgetSettings,
  type ContentOverrideStrings,
  type WidgetSettings,
} from '../src/common/widget-settings';

export interface SetWidgetSettingsPatch {
  pilotMode?: boolean;
  showEstimatedImpact?: boolean;
  enableBookingClickTracking?: boolean;
  contentTr?: Partial<ContentOverrideStrings>;
  contentEn?: Partial<ContentOverrideStrings>;
  clearContentOverrides?: boolean;
}

export interface HotelWidgetSettingsRow {
  id: string;
  name: string;
  widget_settings: unknown;
}

export interface SetWidgetSettingsDeps {
  getHotelByKey(key: string): Promise<HotelWidgetSettingsRow | null>;
  updateWidgetSettings(
    id: string,
    settings: Record<string, unknown>,
  ): Promise<void>;
}

export interface SetWidgetSettingsResult {
  hotelId: string;
  hotelName: string;
  before: WidgetSettings;
  after: WidgetSettings;
  changed: boolean;
}

const OVERRIDABLE_FIELDS = [
  'heading',
  'checkboxLabel',
  'addButton',
  'confirmation',
] as const;

function mergeOverrideGroup(
  current: ContentOverrideStrings | undefined,
  patch: Partial<ContentOverrideStrings> | undefined,
): ContentOverrideStrings | undefined {
  if (!patch) return current;
  const merged: ContentOverrideStrings = { ...current };
  for (const field of OVERRIDABLE_FIELDS) {
    const v = patch[field];
    if (v === undefined) continue;
    if (v === '') {
      delete merged[field]; // boş string -> o alanı override'dan kaldır
    } else {
      merged[field] = v;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function applyPatch(
  current: WidgetSettings,
  patch: SetWidgetSettingsPatch,
): WidgetSettings {
  const next: WidgetSettings = {
    ...current,
    contentOverrides: { ...current.contentOverrides },
  };

  if (patch.pilotMode !== undefined) next.pilotMode = patch.pilotMode;
  if (patch.showEstimatedImpact !== undefined) {
    next.showEstimatedImpact = patch.showEstimatedImpact;
  }
  if (patch.enableBookingClickTracking !== undefined) {
    next.enableBookingClickTracking = patch.enableBookingClickTracking;
  }

  if (patch.clearContentOverrides) {
    next.contentOverrides = {};
  } else {
    const tr = mergeOverrideGroup(next.contentOverrides.tr, patch.contentTr);
    const en = mergeOverrideGroup(next.contentOverrides.en, patch.contentEn);
    next.contentOverrides = {
      ...(tr ? { tr } : {}),
      ...(en ? { en } : {}),
    };
  }

  return next;
}

export async function runSetWidgetSettings(
  key: string,
  patch: SetWidgetSettingsPatch,
  deps: SetWidgetSettingsDeps,
  opts: { dryRun?: boolean } = {},
): Promise<SetWidgetSettingsResult> {
  if (!key || !key.trim()) {
    throw new Error('Otel anahtarı gerekli (--key).');
  }

  const hotel = await deps.getHotelByKey(key.trim());
  if (!hotel) {
    throw new Error('Otel bulunamadı (verilen --key ile eşleşme yok).');
  }

  const before = resolveWidgetSettings(hotel.widget_settings);
  const after = applyPatch(before, patch);
  const changed = JSON.stringify(before) !== JSON.stringify(after);

  if (changed && !opts.dryRun) {
    await deps.updateWidgetSettings(hotel.id, toStoredWidgetSettings(after));
  }

  return { hotelId: hotel.id, hotelName: hotel.name, before, after, changed };
}
