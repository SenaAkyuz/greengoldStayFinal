import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { SettingsForm } from '../components/SettingsForm';

export default async function SettingsPage() {
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

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="settings"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Otel yapılandırması</div>
          <h1 className="gg-title">
            Ayarlar
          </h1>
          <p className="gg-subtitle">
            Otel bilgileri ve gece başı katkı tutarı
          </p>
        </div>

        {hotelRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Ayarlar yüklenemedi: {hotelRes.error}. API sunucusunun çalıştığından
            emin olun.
          </div>
        )}

        {hotel && <SettingsForm hotel={hotel} />}
      </main>
    </AppShell>
  );
}
