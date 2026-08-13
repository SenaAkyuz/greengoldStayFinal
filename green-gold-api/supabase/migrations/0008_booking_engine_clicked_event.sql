-- Princes' Palace pilot hazırlığı: WordPress ana sitesinden SynXis booking
-- engine'e yönlendirme TIKLAMASINI ölçen yeni event tipi.
--
-- ÖNEMLİ ANLAM: 'booking_engine_clicked' yalnızca "misafir Book bağlantısına
-- tıkladı" demektir. Rezervasyon başladı/tamamlandı veya ödeme yapıldı ANLAMINA
-- GELMEZ (bkz. src/widget/dto/create-widget-event.dto.ts).
--
-- Otel bazlı feature flag (`hotels.widget_settings.enable_booking_click_tracking`,
-- varsayılan false) API katmanında (WidgetService.recordEvent) uygulanır — bu
-- migration yalnızca DB'nin izin verdiği event_type kümesini genişletir.

-- 0003'te isimsiz (inline) tanımlanan CHECK -> Postgres varsayılan adı
-- '<tablo>_<kolon>_check'. İleride adı değişmiş olabilir ihtimaline karşı
-- dinamik bul + kaldır, sonra açık isimli yeni kısıtı ekle.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'widget_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%event_type%IN%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE widget_events DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE widget_events
  ADD CONSTRAINT widget_events_event_type_chk
  CHECK (event_type IN (
    'widget_goruntulendi',
    'checkbox_secildi',
    'katki_ekle_butonuna_basildi',
    'booking_engine_clicked'
  ));
