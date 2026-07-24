import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { getHotel, getWidgetEventsSummary } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppShell } from './components/AppShell';
import { MetricCard } from './components/MetricCard';
import { RangePills } from './components/RangePills';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
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

  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const [summaryRes, hotelRes] = await Promise.all([
    getWidgetEventsSummary(token, range),
    getHotel(token),
  ]);

  const hotel = hotelRes.data;
  const summary = summaryRes.data;
  const loadError = summaryRes.error ?? hotelRes.error;

  const conversion =
    summary && summary.views > 0
      ? `%${summary.conversion_rate_pct.toLocaleString('tr-TR')}`
      : '—';

  const isEmpty =
    !!summary &&
    summary.views === 0 &&
    summary.selections === 0 &&
    summary.add_clicks === 0;

  const nf = (n: number) => n.toLocaleString('tr-TR');

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="overview"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div className="gg-page-header">
          <div>
            <div className="gg-kicker">Green Stay performansı</div>
            <h1 className="gg-title">
              Genel Bakış
            </h1>
            <p className="gg-subtitle">
              Widget etkileşim özeti
              {summary?.period
                ? ` · ${summary.period.from} – ${summary.period.to}`
                : ''}
            </p>
          </div>
          <RangePills active={range} />
        </div>

        {loadError && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Veriler yüklenemedi: {loadError}. API sunucusunun çalıştığından emin
            olun.
          </div>
        )}

        {summary && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Görüntülenme" value={nf(summary.views)} />
              <MetricCard label="Seçim" value={nf(summary.selections)} />
              <MetricCard
                label="Katkı butonu tıklaması"
                value={nf(summary.add_clicks)}
              />
              <MetricCard
                label="Dönüşüm"
                value={conversion}
                hint="Seçim / Görüntülenme"
              />
            </div>

            {isEmpty && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Henüz veri yok — widget&apos;ınızı sitenize ekleyin.{' '}
                <Link href="/entegrasyon" className="font-semibold underline">
                  Entegrasyon
                </Link>{' '}
                sekmesindeki kodu kullanabilirsiniz.
              </div>
            )}
          </>
        )}

        {hotel && (
          <section className="gg-card mt-8 flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                Entegrasyon
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Embed kodu ve izinli domain durumu artık Entegrasyon
                sekmesinde.
              </p>
            </div>
            <Link
              href="/entegrasyon"
              className="shrink-0 rounded-lg bg-[#075442] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#043f34]"
            >
              Entegrasyon sayfasına git
            </Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
