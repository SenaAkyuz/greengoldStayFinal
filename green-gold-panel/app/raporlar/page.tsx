import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getReport, getHotel } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppShell } from '../components/AppShell';
import { MetricCard } from '../components/MetricCard';
import { RangePills } from '../components/RangePills';

export default async function ReportsPage({
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

  const [reportRes, hotelRes] = await Promise.all([
    getReport(token, range),
    getHotel(token),
  ]);
  const report = reportRes.data;
  const hotel = hotelRes.data;

  const exportHref =
    range === 'month' ? '/raporlar/export' : `/raporlar/export?range=${range}`;

  const nf = (n: number) => n.toLocaleString('tr-TR');
  const conversion =
    report && report.summary.views > 0
      ? `%${report.summary.conversion_rate_pct.toLocaleString('tr-TR')}`
      : '—';

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="reports"
    >
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              Raporlar
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Etkileşim, dönüşüm ve tahmini karbon özeti
              {report?.period
                ? ` · ${report.period.from} – ${report.period.to}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RangePills active={range} basePath="/raporlar" />
            <a
              href={exportHref}
              className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              CSV indir
            </a>
          </div>
        </div>

        {reportRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Rapor yüklenemedi: {reportRes.error}. API sunucusunun çalıştığından
            emin olun.
          </div>
        )}

        {report && (
          <>
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-neutral-700">
                Etkileşim
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Görüntülenme" value={nf(report.summary.views)} />
                <MetricCard label="Seçim" value={nf(report.summary.selections)} />
                <MetricCard
                  label="Katkı butonu tıklaması"
                  value={nf(report.summary.add_clicks)}
                />
                <MetricCard
                  label="Dönüşüm"
                  value={conversion}
                  hint="Seçim / Görüntülenme"
                />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold text-neutral-700">
                Tahmini karbon
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Tahmini CO₂"
                  value={`≈ ${nf(report.carbon.estimated_co2_kg)} kg`}
                  hint="Tahmini"
                />
                <MetricCard
                  label="Ağaç-yılı eşdeğeri"
                  value={`≈ ${nf(report.carbon.tree_equivalent)}`}
                  hint="Tahmini"
                />
                <MetricCard
                  label="Katkı niyeti"
                  value={nf(report.carbon.contributions_count)}
                  hint="Tekil katkı butonu oturumu (ödeme değil)"
                />
              </div>
            </section>

            <p className="mt-6 text-xs text-neutral-400">
              Veriler widget etkileşimlerine dayalıdır; ödeme/rezervasyon onayı
              içermez. Karbon değerleri tahminidir.
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
