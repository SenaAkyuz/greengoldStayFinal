import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getCarbonSummary } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppShell } from '../components/AppShell';
import { RangePills } from '../components/RangePills';

export default async function CarbonPage({
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

  const [carbonRes, hotelRes] = await Promise.all([
    getCarbonSummary(token, range),
    getHotel(token),
  ]);

  const hotel = hotelRes.data;
  const carbon = carbonRes.data;
  const loadError = carbonRes.error ?? hotelRes.error;

  // TR sayı biçimi
  const nf = (n: number, digits = 1) =>
    n.toLocaleString('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });

  const isEmpty =
    !!carbon &&
    carbon.contributions_count === 0 &&
    carbon.estimated_co2_kg === 0;

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="carbon"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div className="gg-page-header">
          <div>
            <div className="gg-kicker">Karbon etkisi özeti</div>
            <h1 className="gg-title">
              Karbon Etkisi
            </h1>
            <p className="gg-subtitle">
              Widget etkileşimlerine dayalı tahmini katkı
              {carbon?.period
                ? ` · ${carbon.period.from} – ${carbon.period.to}`
                : ''}
            </p>
          </div>
          <RangePills active={range} basePath="/karbon" />
        </div>

        {loadError && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Veriler yüklenemedi: {loadError}. API sunucusunun çalıştığından emin
            olun.
          </div>
        )}

        {carbon && (
          <>
            {/* Hero */}
            <section className="gg-card mt-7 overflow-hidden bg-gradient-to-br from-[#eaf4ec] via-white to-[#f4f2df] p-7 sm:p-9">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Tahmini
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-[Georgia] text-5xl font-medium tracking-tight text-[#0a493b] tabular-nums sm:text-6xl">
                  {nf(carbon.estimated_co2_kg)}
                </span>
                <span className="text-2xl font-medium text-[#377866]">
                  kg CO₂
                </span>
              </div>
              {/* Doğruluk ibaresi KORUNUR — sayı bir tahmindir ve tahsilat
                  değil tıklama sayar. Dil profesyonelleştirildi, iddia aynı. */}
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
                Misafirlerin widget üzerinden seçtiği katkılara ve otelinizin
                kayıtlı oda-gece katsayısına dayalı hesaplanır. Tahsil edilmiş
                tutarları veya doğrulanmış karbon dengelemesini göstermez.
              </p>
            </section>

            {isEmpty && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Henüz katkı verisi yok — misafirler widget&apos;tan katkı
                seçtikçe burada tahmini etki görünecek.
              </div>
            )}

            {/* Destek kartları */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SupportCard
                value={nf(carbon.contributions_count, 0)}
                label="katkı seçimi (tekil ziyaretçi)"
                hint={`${nf(carbon.total_selected_nights, 0)} oda-gece toplam`}
              />
              <SupportCard
                value={`≈ ${nf(carbon.tree_equivalent)}`}
                label="ağaç-yılı eşdeğeri"
                hint="21 kg CO₂/ağaç/yıl referans değeriyle"
              />
              <SupportCard
                value={nf(carbon.co2_per_night_kg, 2)}
                label="kg CO₂/oda-gece katsayısı"
                hint="otelinizin kayıtlı katsayısı"
              />
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function SupportCard({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="gg-card p-5">
      <div className="font-[Georgia] text-3xl font-medium tracking-tight text-[#102b22] tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-600">{label}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}
