-- Giriş yapmış kullanıcının hotel_id'sini döndürür.
-- SECURITY DEFINER olduğu için fonksiyon içi sorgu RLS'e takılmaz -> recursion önlenir.
CREATE OR REPLACE FUNCTION public.current_hotel_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hotel_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

ALTER TABLE hotels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_events ENABLE ROW LEVEL SECURITY;

-- Kullanıcı yalnızca kendi otelini görür
CREATE POLICY hotels_tenant_select ON hotels
    FOR SELECT USING (id = public.current_hotel_id());

-- Kullanıcı yalnızca kendi otelinin kullanıcılarını görür
CREATE POLICY users_tenant_select ON users
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- Kullanıcı yalnızca kendi otelinin eventlerini okur
CREATE POLICY widget_events_tenant_select ON widget_events
    FOR SELECT USING (hotel_id = public.current_hotel_id());

-- NOT: INSERT/UPDATE/DELETE için authenticated/anon rolüne policy TANIMLAMIYORUZ.
-- RLS deny-by-default olduğu için bu komutlar normal kullanıcıya kapalı olur.
-- Yazma işlemleri backend'den service_role ile yapılır (RLS bypass) — bu bilinçli bir tercih.
