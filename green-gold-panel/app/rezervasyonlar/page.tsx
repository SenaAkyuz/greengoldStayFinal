import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

export default async function ReservationsPage() {
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
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="reservations">
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Rezervasyonlar
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Booking Engine ile onaylanmış gerçek rezervasyonlar
          </p>
        </div>

        <ComingSoon
          title="Henüz rezervasyon bağlantısı yok"
          badge="Faz 2"
          description="Booking Engine’den 'rezervasyon tamamlandı' bildirimi bağlandığında, doğrulanmış rezervasyonlar burada listelenecek. Widget buton tıklaması bir rezervasyon değildir."
        />
      </main>
    </AppShell>
  );
}
