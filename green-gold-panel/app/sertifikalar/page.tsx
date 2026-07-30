import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

export default async function CertificatesPage() {
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
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="certificates" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Doğrulama bekleniyor</div>
          <h1 className="gg-title">
            Sertifikalar
          </h1>
          <p className="gg-subtitle">
            Doğrulanmış katkılara dayalı sertifikalar
          </p>
        </div>

        <ComingSoon
          title="Sertifika üretimi henüz hazır değil"
          badge="Entegrasyon bekleniyor"
          whatItShows="Doğrulanmış katkılara dayalı, misafir ve otel adına üretilen dijital sertifikalar."
          whyEmpty="Karbon doğrulama/kredi metodolojisi ve sertifika üretim altyapısı henüz hazır değil."
          requirements={[
            'Karbon hesaplama/doğrulama metodolojisi',
            'Bağımsız doğrulayıcı kurum',
            'Kredi/offset kaynağının belirlenmesi',
            'Sertifika belge standardı',
          ]}
          notice="Tahmini değer sertifika değildir."
          ctaHref="/entegrasyon"
          ctaLabel="Entegrasyon sayfasına git"
        />
      </main>
    </AppShell>
  );
}
