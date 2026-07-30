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
          whatItShows="Otel hesabınıza doğrudan geçen, gerçek ödeme onayı almış tahsilatlar; tutar, tarih ve mutabakat durumuyla."
          whyEmpty="Ödeme altyapısı ve gerçek katkı iş modeli henüz devreye alınmadı. Widget'taki buton tıklaması bir tahsilat değildir."
          requirements={[
            'Katkı modeli kararı (gece başına sabit tutar, oran bazlı vb.)',
            'Otel merchant hesabı / IBAN bilgisi',
            'Ödeme sağlayıcısı entegrasyonu',
            'Komisyon oranı kararı',
          ]}
          notice="Henüz ödeme alınmıyor. 'Tahsil edildi' ifadesi yalnızca gerçek ödeme onayıyla kullanılacaktır."
          ctaHref="/entegrasyon"
          ctaLabel="Entegrasyon sayfasına git"
        />
      </main>
    </AppShell>
  );
}
