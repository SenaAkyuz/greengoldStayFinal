import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getWidgetEventsSummary, getApiBaseUrl } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppHeader } from './components/AppHeader';
import { MetricCard } from './components/MetricCard';
import { RangePills } from './components/RangePills';
import { IntegrationCard } from './components/IntegrationCard';

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

  const embedCode = hotel
    ? `<script src="https://cdn.greengold.example/green-gold-widget.v1.js"></script>
<green-gold-widget data-key="${hotel.public_widget_key}" data-nights="1" data-lang="tr"
    data-api="${getApiBaseUrl()}"></green-gold-widget>`
    : '';

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
    <div className="min-h-full bg-neutral-50">
      <AppHeader
        hotelName={hotel?.hotel_name}
        city={hotel?.city}
        active="overview"
      />

      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              Genel Bakış
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
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
                Henüz veri yok — widget&apos;ınızı sitenize ekleyin. Aşağıdaki
                entegrasyon kodunu kullanabilirsiniz.
              </div>
            )}
          </>
        )}

        {hotel && (
          <div className="mt-8">
            <IntegrationCard embedCode={embedCode} />
          </div>
        )}
      </main>
    </div>
  );
}
