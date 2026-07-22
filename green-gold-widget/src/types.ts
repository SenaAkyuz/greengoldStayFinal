export interface WidgetConfig {
  hotel_name: string;
  city: string | null;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  is_estimated: boolean;
}

export type Lang = 'tr' | 'en';

export type WidgetEventType =
  | 'widget_goruntulendi'
  | 'checkbox_secildi'
  | 'katki_ekle_butonuna_basildi';
