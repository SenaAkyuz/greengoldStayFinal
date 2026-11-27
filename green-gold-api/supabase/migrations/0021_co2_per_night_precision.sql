-- 0021 — Gecelik tahmini emisyonun hassasiyeti (UX-4.7 / KD-3)
--
-- UYGULANMADI: Bu dosya yalnız hazırlandı. Ortak veritabanına kullanıcının
-- açık onayıyla uygulanır (Supabase SQL düzenleyicisi veya migration aracı).
--
-- Neden: hotels.estimated_co2_per_night_kg NUMERIC(10,2) idi; ölçümden gelen
-- 0,687 kg CO₂e / oda-gece 0,69 olarak saklanıyor ve widget toplamı bu
-- yuvarlanmış değerle çarpılıyordu (6 oda-gece: 4,14 kg; doğrusu 4,12 kg).
-- Hassas katsayı zaten ölçümde (carbon_measurements.room_night_kg, NUMERIC)
-- ve widget_settings.carbon_pricing.coefficient_kg içinde duruyor; burada
-- yalnız misafire sunulan güncel skalerin hassasiyeti artırılır.
--
-- Para tarafı DEĞİŞMEZ: contribution_amount_per_night NUMERIC(10,2) kalır.
-- Gecelik katkı bir fiyattır (kuruş/cent); HotelRunner'daki gecelik ekstra
-- fiyatla birebir aynı olmalı. Toplam = gecelik fiyat × gece × oda.
--
-- Geriye uyumlu: tür genişletmesi; mevcut değerler aynen korunur (0,69 → 0,690000).
-- Uygulama sütun türünden bağımsız çalışır. Tekrar çalıştırılabilir.

ALTER TABLE public.hotels
  ALTER COLUMN estimated_co2_per_night_kg TYPE NUMERIC(14,6);

COMMENT ON COLUMN public.hotels.estimated_co2_per_night_kg IS
  'Misafire gösterilen tahmini emisyon, kg CO2e / oda-gece (6 ondalık; gösterimde yuvarlanır, toplam hassas değerden hesaplanır).';

-- Aktif ConnectHub ölçümü olan otellerde hassas değeri geri yükle (yalnız
-- 2 ondalığa yuvarlanmış kopyası olan satırlar; değer zaten aynı ölçümden).
UPDATE public.hotels h
   SET estimated_co2_per_night_kg = m.room_night_kg
  FROM public.carbon_measurements m
 WHERE m.hotel_id = h.id
   AND m.is_active
   AND m.room_night_kg IS NOT NULL
   AND round(m.room_night_kg, 2) = h.estimated_co2_per_night_kg
   AND m.room_night_kg <> h.estimated_co2_per_night_kg;
