import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel } from '@/lib/api';
import { AppShell } from '../components/AppShell';
import Link from 'next/link';

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
          <div className="gg-kicker">Belge arşivi</div>
          <h1 className="gg-title">
            Sertifikalar
          </h1>
          <p className="gg-subtitle">
            Karbon hesaplama kayıtları ve dengeleme belgeleri
          </p>
        </div>

        {hotelRes.error && <p role="alert" className="mt-6 text-sm text-red-700">Belgeler yüklenemedi: {hotelRes.error}</p>}
        <section className="gg-card mt-6 p-6">
          <h2 className="text-lg font-semibold text-[#17372d]">Karbon hesaplama belgeleri</h2>
          {!hotel?.carbon_reports?.length ? <div className="mt-4"><p className="text-sm text-neutral-500">Henüz kayıtlı hesaplama belgesi yok.</p><Link href="/ayarlar" className="mt-4 inline-block rounded-lg bg-[#075442] px-4 py-2.5 text-sm font-semibold text-white">Otel hesabını oluştur</Link></div> : <div className="mt-4 divide-y divide-neutral-100">{hotel.carbon_reports.map(report => <article key={report.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div><p className="font-medium text-[#17372d]">{report.result.input.period_start} — {report.result.input.period_end}</p><p className="mt-1 text-sm text-neutral-500">{report.result.coefficient_kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kgCO₂e / oda-gece · {report.result.input.mode === 'report' ? 'Rapor beyanı' : 'Tüketim tahmini'}</p><p className="mt-1 font-mono text-xs text-neutral-400">{report.id}</p></div>
            <div className="flex flex-wrap gap-2"><a href={'/sertifikalar/' + report.id + '/belge'} target="_blank" rel="noreferrer" className="rounded-lg bg-[#075442] px-4 py-2.5 text-sm font-medium text-white">Görüntüle / PDF</a><a href={'/sertifikalar/' + report.id + '/belge?download=1'} className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm">HTML indir</a></div>
          </article>)}</div>}
        </section>
        <section className="gg-card mt-5 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#17372d]">Dengeleme sertifikaları</h2><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">İtfa kaydı bekleniyor</span></div><p className="mt-3 text-sm text-neutral-500">Doğrulanmış kredi itfasına ait belgeler burada yer alacak.</p></section>

      </main>
    </AppShell>
  );
}
