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
    >
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Ayarlar
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
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
