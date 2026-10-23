-- Karbon olcum saglayicisi (3pmetrics) API anahtarlari icin SECRETS MANAGER.
--
-- NEDEN SUPABASE VAULT
-- --------------------
-- Env degiskeni production icin mesru degildi (bkz. src/integrations/secret-resolver.ts):
-- otel basina rotasyon/erisim denetimi yok, her process tum anahtarlari gorur.
-- Supabase Vault anahtari VERITABANINDA SIFRELI (libsodium/pgsodium, anahtari
-- Supabase tarafinda, DB disinda) tutar; yedeklerde ve replikasyonda da sifreli
-- kalir. Projenin zaten kullandigi altyapidir, yeni bir servis gerektirmez.
--
-- ERISIM MODELI
-- -------------
-- `vault` semasi PostgREST'e acik DEGILDIR. Uygulama anahtara YALNIZCA asagidaki
-- SECURITY DEFINER fonksiyonlar uzerinden ve YALNIZCA service_role ile ulasir.
-- anon/authenticated (panel kullanicisi) bu fonksiyonlari CAGIRAMAZ.
--
-- Secret adi: 'carbon_provider:<REF>'. <REF>, carbon_provider_links.authorization_ref
-- ile ayni format kisitina tabidir (^[A-Z][A-Z0-9_]{2,63}$).
--
-- Bu migration mevcut hicbir tabloyu/kolonu/policy'yi DEGISTIRMEZ.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Anahtari yazar veya gunceller (rotasyon). Operator script'i kullanir.
CREATE OR REPLACE FUNCTION public.carbon_provider_secret_set(p_ref TEXT, p_secret TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name TEXT;
    v_id   UUID;
BEGIN
    IF p_ref IS NULL OR p_ref !~ '^[A-Z][A-Z0-9_]{2,63}$' THEN
        RAISE EXCEPTION 'gecersiz referans' USING ERRCODE = '22023';
    END IF;
    IF p_secret IS NULL OR length(btrim(p_secret)) < 16 OR length(p_secret) > 512 THEN
        RAISE EXCEPTION 'gecersiz anahtar' USING ERRCODE = '22023';
    END IF;

    v_name := 'carbon_provider:' || p_ref;
    SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

    IF v_id IS NULL THEN
        v_id := vault.create_secret(btrim(p_secret), v_name, 'GreenGold karbon saglayici API anahtari');
    ELSE
        PERFORM vault.update_secret(v_id, btrim(p_secret));
    END IF;
    RETURN v_id;
END;
$$;

-- Anahtari cozer. YALNIZCA API sunucusu (service_role) cagirir; deger asla loglanmaz.
CREATE OR REPLACE FUNCTION public.carbon_provider_secret_get(p_ref TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    IF p_ref IS NULL OR p_ref !~ '^[A-Z][A-Z0-9_]{2,63}$' THEN
        RETURN NULL;
    END IF;
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'carbon_provider:' || p_ref
     LIMIT 1;
    RETURN v_secret;
END;
$$;

-- Panel durum ekrani icin: anahtar TANIMLI MI (sifre cozmeden).
CREATE OR REPLACE FUNCTION public.carbon_provider_secret_exists(p_ref TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'
       AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'carbon_provider:' || p_ref);
$$;

-- Anahtari kaldirir (otel baglantisi bittiginde).
CREATE OR REPLACE FUNCTION public.carbon_provider_secret_delete(p_ref TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE name = 'carbon_provider:' || p_ref;
    RETURN FOUND;
END;
$$;

-- Supabase public semasindaki yeni fonksiyonlara anon/authenticated'a varsayilan
-- EXECUTE verir — ACIKCA geri alinir. Yalnizca service_role cagirabilir.
REVOKE ALL ON FUNCTION public.carbon_provider_secret_set(TEXT, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carbon_provider_secret_get(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carbon_provider_secret_exists(TEXT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carbon_provider_secret_delete(TEXT)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.carbon_provider_secret_set(TEXT, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.carbon_provider_secret_get(TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION public.carbon_provider_secret_exists(TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.carbon_provider_secret_delete(TEXT)      TO service_role;
