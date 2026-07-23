export interface WidgetConfig {
  hotel_name: string;
  city: string | null;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  is_estimated: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
  hotel_type?: string;
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
  | 'katki_ekle_butonuna_basildi';
