import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getApiBaseUrl } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { GuestDemoWidget } from '../components/GuestDemoWidget';

export default async function GuestDemoPage() {
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
      active="guest-demo"
    >
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Misafir Demo
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Widget’ın misafire nasıl göründüğünün canlı önizlemesi
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600">
          Bu bir önizlemedir; buradaki etkileşimler raporlara yansımaz.
        </div>

        {hotelRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Otel bilgileri yüklenemedi: {hotelRes.error}. API sunucusunun
            çalıştığından emin olun.
          </div>
        )}

        {hotel && (
          <GuestDemoWidget
            publicKey={hotel.public_widget_key}
            apiBase={getApiBaseUrl()}
          />
        )}
      </main>
    </AppShell>
  );
}
