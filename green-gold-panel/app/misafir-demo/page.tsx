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
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div className="gg-page-header">
          <div>
          <div className="gg-kicker">Misafir deneyimi demosu</div>
          <h1 className="gg-title">
            Misafir Demo
          </h1>
          <p className="gg-subtitle">
            Widget’ın misafire nasıl göründüğünün canlı önizlemesi
          </p>
          </div>
          <span className="rounded-full border border-[#cfe2d4] bg-[#edf6ee] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#17614f]">
            • Demo modu
          </span>
        </div>

        <div className="gg-notice mt-7 flex items-center gap-3 px-5 py-4 text-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#075442] font-semibold text-white">✓</span>
          <div>
            <div className="font-semibold">Güvenli önizleme modu</div>
            <div className="mt-0.5 text-xs text-[#5e776f]">Bu ekrandaki etkileşimler raporlara yansımaz ve ödeme alınmaz.</div>
          </div>
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
