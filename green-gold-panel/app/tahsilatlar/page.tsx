import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

export default async function PaymentsPage() {
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
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="payments" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Ödeme doğrulaması</div>
          <h1 className="gg-title">
            Tahsilatlar
          </h1>
          <p className="gg-subtitle">
            Gerçekten tahsil edilmiş katkılar
          </p>
        </div>

        <ComingSoon
          title="Henüz tahsilat hattı yok"
          badge="Faz 2"
          description="Ödeme hattı ve gerçek katkı iş modeli devreye girdiğinde, doğrulanmış tahsilatlar burada görünecek. Buton tıklaması tahsilat değildir; 'tahsil edildi' yalnızca gerçek ödeme onayıyla söylenir."
        />
      </main>
    </AppShell>
  );
}
