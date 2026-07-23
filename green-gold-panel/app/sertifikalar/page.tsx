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
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="certificates">
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Sertifikalar
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Doğrulanmış katkılara dayalı sertifikalar
          </p>
        </div>

        <ComingSoon
          title="Sertifika üretimi henüz hazır değil"
          badge="Entegrasyon bekleniyor"
          description="Gerçek karbon doğrulama/kredi metodolojisi ve sertifika üretimi hazır olduğunda, doğrulanmış katkılara dayalı sertifikalar burada oluşturulacak. Tahmini rakamlar sertifika yerine geçmez."
        />
      </main>
    </AppShell>
  );
}
