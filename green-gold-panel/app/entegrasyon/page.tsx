import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getApiBaseUrl } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { IntegrationCard } from '../components/IntegrationCard';

export default async function IntegrationPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) redirect('/login');

  const hotelRes = await getHotel(token);
  const hotel = hotelRes.data;

  const embedCode = hotel
    ? `<script src="https://cdn.greengold.example/green-gold-widget.v1.js"></script>
<green-gold-widget data-key="${hotel.public_widget_key}" data-nights="1" data-lang="tr"
    data-api="${getApiBaseUrl()}"></green-gold-widget>`
    : '';

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="integration"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Kurulum ve bağlantı</div>
          <h1 className="gg-title">
            Entegrasyon
          </h1>
          <p className="gg-subtitle">
            Widget embed kodu ve izinli domain durumu
          </p>
        </div>

        {hotelRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Otel bilgileri yüklenemedi: {hotelRes.error}. API sunucusunun
            çalıştığından emin olun.
          </div>
        )}

        {hotel && (
          <div className="mt-6">
            <IntegrationCard
              embedCode={embedCode}
              allowedOrigins={hotel.allowed_origins}
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}
