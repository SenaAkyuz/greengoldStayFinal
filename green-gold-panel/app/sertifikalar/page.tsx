import { requireAccessToken } from '@/lib/auth';
import { getHotel } from '@/lib/api';
import { PageHeader } from '../components/ui';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import Link from 'next/link';

export default async function CertificatesPage() {
  const token = await requireAccessToken();

  const hotelRes = await getHotel(token);
  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} title="Sertifikalar" isDemo={hotel?.role === 'demo_viewer'}>
      <div className="gg-page gg-page--framed">
        <PageHeader
          size="compact"
          eyebrow="Belge arşivi"
          title="Sertifikalar"
          description={<>Karbon hesaplama kayıtları ve dengeleme belgeleri</>}
        />

        {hotelRes.error && <p role="alert" className="mt-6 text-sm text-red-700">Belgeler yüklenemedi: {hotelRes.error}</p>}
        <section className="gg-card mt-6 p-6">
          <h2 className="text-lg font-semibold text-[var(--ds-color-heading)]">Karbon hesaplama belgeleri</h2>
          {!hotel?.carbon_reports?.length ? <div className="mt-4"><p className="text-sm text-neutral-500">Henüz kayıtlı hesaplama belgesi yok.</p><Link href="/ayarlar" className="mt-4 inline-block rounded-lg bg-[var(--ds-palette-pine-700)] px-4 py-2.5 text-sm font-semibold text-white">Otel hesabını oluştur</Link></div> : <div className="mt-4 divide-y divide-neutral-100">{hotel.carbon_reports.map(report => <article key={report.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div><p className="font-medium text-[var(--ds-color-heading)]">{report.result.input.period_start} — {report.result.input.period_end}</p><p className="mt-1 text-sm text-neutral-500">{report.result.coefficient_kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kgCO₂e / oda-gece · {report.result.input.mode === 'report' ? 'Rapor beyanı' : 'Tüketim tahmini'}</p><p className="mt-1 font-mono text-xs text-neutral-400">{report.id}</p></div>
            <div className="flex flex-wrap gap-2"><a href={'/sertifikalar/' + report.id + '/belge'} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--ds-palette-pine-700)] px-4 py-2.5 text-sm font-medium text-white">Görüntüle / PDF</a><a href={'/sertifikalar/' + report.id + '/belge?download=1'} className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm">HTML indir</a></div>
          </article>)}</div>}
        </section>
        <section className="gg-card mt-5 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[var(--ds-color-heading)]">Dengeleme sertifikaları</h2><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">İtfa kaydı bekleniyor</span></div><p className="mt-3 text-sm text-neutral-500">Doğrulanmış kredi itfasına ait belgeler burada yer alacak.</p></section>

      </div>
    </HotelPanelFrame>
  );
}
