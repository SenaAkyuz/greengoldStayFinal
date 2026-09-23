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

export interface WidgetConfig {
  carbon_pricing_demo?: boolean;
  carbon_estimate_source?: 'hotel' | 'regional';
  hotel_name: string;
  city: string | null;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  is_estimated: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
  hotel_type?: string;
  // Pilot (Princes' Palace): otel bazlı görünürlük. false ise CO2/ağaç-yılı/
  // aylık impact satırları HİÇ render edilmez.
  show_estimated_impact: boolean;
  // Otel bazlı TR/EN düz metin override'ları (bkz. i18n.ts OverridableField).
  content_overrides?: ContentOverrides;
}

export interface WidgetImpact {
  month: string;
  estimated_co2_kg: number;
  tree_equivalent: number;
  contributions_count: number;
  is_estimated: boolean;
}

export type Lang = 'tr' | 'en';

export type WidgetEventType =
  | 'widget_goruntulendi'
  | 'checkbox_secildi'
  | 'katki_ekle_butonuna_basildi'
  // Ana site (WordPress) -> SynXis booking engine yönlendirme tıklaması.
  // Rezervasyon başladı/tamamlandı ANLAMINA GELMEZ. Otel bazlı feature flag
  // ile korunur (varsayılan kapalı) — bkz. WidgetService.recordEvent.
  | 'booking_engine_clicked';
