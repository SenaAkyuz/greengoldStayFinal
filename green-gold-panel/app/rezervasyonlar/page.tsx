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
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="reservations" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Booking Engine bağlantısı</div>
          <h1 className="gg-title">
            Rezervasyonlar
          </h1>
          <p className="gg-subtitle">
            Booking Engine ile onaylanmış gerçek rezervasyonlar
          </p>
        </div>

        <ComingSoon
          title="Henüz rezervasyon bağlantısı yok"
          badge="Faz 2"
          whatItShows="Booking Engine/PMS tarafından onaylanmış gerçek rezervasyonlar; misafir, tarih ve durum bilgisiyle."
          whyEmpty="Otelinizin Booking Engine/PMS sistemiyle henüz bir webhook bağlantısı kurulmadı. Widget'taki buton tıklaması bir rezervasyon değildir."
          requirements={[
            'Booking Engine/PMS sağlayıcınızın webhook dokümantasyonu',
            "'Rezervasyon tamamlandı' olayı için paylaşılan bir secret/anahtar",
            'Green Gold API tarafında webhook uç noktasının etkinleştirilmesi',
          ]}
          ctaHref="/entegrasyon"
          ctaLabel="Entegrasyon sayfasına git"
        />
      </main>
    </AppShell>
  );
}
