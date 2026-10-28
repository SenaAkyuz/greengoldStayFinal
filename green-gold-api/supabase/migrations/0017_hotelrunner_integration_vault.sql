-- HotelRunner sağlayıcısı + entegrasyon secret'ları için Supabase Vault.
--
-- 1) hotel_integrations.provider CHECK'ine 'hotelrunner' eklenir
--    (src/integrations/provider-registry.ts ile birebir).
-- 2) Entegrasyon secret'ları (HotelRunner TOKEN, imzalı webhook secret'ları)
--    Vault'ta 'integration:<REF>' adıyla şifreli tutulur. Bu, production
--    secret resolver'ının kaynağıdır (src/integrations/secret-resolver.ts,
--    VaultIntegrationSecretResolver). Erişim modeli 0016 ile aynı: yalnızca
--    service_role, SECURITY DEFINER fonksiyonlar üzerinden.
--
-- <REF> = hotel_integrations.secret_ref (^[A-Z][A-Z0-9_]{2,63}$).

ALTER TABLE hotel_integrations DROP CONSTRAINT IF EXISTS hotel_integrations_provider_check;
ALTER TABLE hotel_integrations
  ADD CONSTRAINT hotel_integrations_provider_check
  CHECK (provider IN ('synxis', 'generic_signed_webhook', 'hotelrunner'));

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.integration_secret_set(p_ref TEXT, p_secret TEXT)
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
    IF p_secret IS NULL OR length(btrim(p_secret)) < 8 OR length(p_secret) > 512 THEN
        RAISE EXCEPTION 'gecersiz secret' USING ERRCODE = '22023';
    END IF;

    v_name := 'integration:' || p_ref;
    SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

    IF v_id IS NULL THEN
        v_id := vault.create_secret(btrim(p_secret), v_name, 'GreenGold booking entegrasyon secret''i');
    ELSE
        PERFORM vault.update_secret(v_id, btrim(p_secret));
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_get(p_ref TEXT)
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
     WHERE name = 'integration:' || p_ref
     LIMIT 1;
    RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_exists(p_ref TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'
       AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'integration:' || p_ref);
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_delete(p_ref TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE name = 'integration:' || p_ref;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.integration_secret_set(TEXT, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_secret_get(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_secret_exists(TEXT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_secret_delete(TEXT)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.integration_secret_set(TEXT, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_secret_get(TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_secret_exists(TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_secret_delete(TEXT)      TO service_role;
