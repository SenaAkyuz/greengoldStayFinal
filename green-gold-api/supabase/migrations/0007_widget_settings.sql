-- Princes' Palace pilot hazırlığı: otel bazlı widget konfigürasyonu.
--
-- Tek küçük JSONB kolonu tercih edildi (ayrı `hotel_widget_settings` tablosu
-- bu ölçekte aşırı mühendislik olurdu — satır başına tek otel, ilişkisel
-- sorgu ihtiyacı yok). Sürüm alanı (`version`) ileride şema değişince kod
-- tarafında geriye dönük okunabilirlik sağlar.
--
-- Güvenli varsayılan: sürdürülebilirlik etki sayıları ve booking-click
-- tracking KAPALI (false) — yeni/gerçek bir otel yanlışlıkla placeholder
-- karbon sayıları veya beklenmeyen event üretmeye başlamaz. Değerler her
-- zaman `src/common/widget-settings.ts::resolveWidgetSettings` üzerinden
-- okunur (savunmacı: bozuk/eksik JSON -> güvenli varsayılan).
--
-- Beklenen şekil (uygulama tarafında doğrulanır, bu CHECK yalnızca en dış
-- katman — "nesne mi" — için savunma sağlar):
--   {
--     "version": 1,
--     "pilot_mode": false,
--     "show_estimated_impact": false,
--     "enable_booking_click_tracking": false,
--     "content_overrides": { "tr": {...}, "en": {...} }
--   }

ALTER TABLE hotels
  ADD COLUMN widget_settings JSONB NOT NULL DEFAULT '{
    "version": 1,
    "pilot_mode": false,
    "show_estimated_impact": false,
    "enable_booking_click_tracking": false,
    "content_overrides": {}
  }'::jsonb;

ALTER TABLE hotels
  ADD CONSTRAINT hotels_widget_settings_is_object
  CHECK (jsonb_typeof(widget_settings) = 'object');
