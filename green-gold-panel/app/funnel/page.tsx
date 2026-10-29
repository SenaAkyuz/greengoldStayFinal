import { requireAccessToken } from '@/lib/auth';
import { getHotel, getFunnel } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppShell } from '../components/AppShell';
import { formatPercent } from '@/lib/format';
import { RangePills } from '../components/RangePills';
import { FunnelBars } from '../components/FunnelBars';

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const token = await requireAccessToken();

  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const [funnelRes, hotelRes] = await Promise.all([
    getFunnel(token, range),
    getHotel(token),
  ]);

  const hotel = hotelRes.data;
  const funnel = funnelRes.data;
  const loadError = funnelRes.error ?? hotelRes.error;

  const isEmpty = !!funnel && funnel.stages.viewed === 0;

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="funnel"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div className="gg-page-header">
          <div>
            <div className="gg-kicker">Misafir etkileşimleri</div>
            <h1 className="gg-title">
              Dönüşüm
            </h1>
            <p className="gg-subtitle">
              Session bazlı etkileşim hunisi
              {funnel?.period
                ? ` · ${funnel.period.from} – ${funnel.period.to}`
                : ''}
            </p>
          </div>
          <RangePills active={range} basePath="/funnel" />
        </div>

        {loadError && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Veriler yüklenemedi: {loadError}. API sunucusunun çalıştığından emin
            olun.
          </div>
        )}

        {funnel && (
          <>
            {/* Vurgulu: Görüntülenme → Katkı butonu */}
            <section className="gg-card mt-7 bg-gradient-to-br from-[#eaf4ec] to-white p-7">
              <div className="text-sm font-medium text-emerald-800">
                Görüntülenme → Katkı butonu
              </div>
              <div className="mt-2 font-[Georgia] text-5xl font-medium tracking-tight text-[#0a493b] tabular-nums">
                {formatPercent(funnel.rates.view_to_button_pct)}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
                Session bazlı etkileşim hunisi — her aşama, o adıma ulaşan tekil
                ziyaretçi oturumunu sayar. Ödeme/rezervasyon onayını göstermez.
              </p>
            </section>

            {isEmpty ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Henüz etkileşim yok — misafirler widget&apos;ı gördükçe huni
                burada oluşacak.
              </div>
            ) : (
              <section className="gg-card mt-6 p-6">
                <FunnelBars
                  funnel={funnel}
                  labels={['Görüntülenme', 'Seçim', 'Katkı butonu tıklaması']}
                  variant="full"
                  className="space-y-4"
                />
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
