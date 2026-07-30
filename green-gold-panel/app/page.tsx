import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { getHotel, getReport, type DashboardReport, type HotelInfo } from '@/lib/api';
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

  // Tek çağrı: summary + funnel + carbon aynı period için tutarlı gelsin.
  const [reportRes, hotelRes] = await Promise.all([
    getReport(token, range),
    getHotel(token),
  ]);

  const hotel = hotelRes.data;
  const report = reportRes.data;
  const loadError = reportRes.error ?? hotelRes.error;

  const conversion =
    report && report.summary.views > 0
      ? `%${report.summary.conversion_rate_pct.toLocaleString('tr-TR')}`
      : '—';

  const isEmpty = !!report && report.summary.views === 0;

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
              {report?.period
                ? ` · ${report.period.from} – ${report.period.to}`
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

        {report && (
          <>
            {/* Ana metrikler: Görüntülenme, Seçim, Dönüşüm, Tahmini CO₂ etkisi. */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Görüntülenme" value={nf(report.summary.views)} unit="oturum" />
              <MetricCard label="Katkı seçimi" value={nf(report.summary.selections)} unit="oturum" />
              <MetricCard
                label="Dönüşüm"
                value={conversion}
                hint="Seçim / Görüntülenme"
              />
              <MetricCard
                label="Tahmini CO₂ etkisi"
                value={nf(report.carbon.estimated_co2_kg)}
                unit="kg"
                hint="Tahmini · offset değildir"
              />
            </div>

            {isEmpty ? (
              <EmptyOverviewState hotel={hotel} />
            ) : (
              <>
                <ConversionStory report={report} />
                <EstimatedImpactSummary report={report} />
              </>
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

// Görüntülendi → Etkileşime girildi → Katkı seçildi. Sayı VE oran birlikte;
// anlam yalnızca renkle değil metinle taşınır. Mobilde tek sütun (doğal stack).
function ConversionStory({ report }: { report: DashboardReport }) {
  const { funnel } = report;
  const nf = (n: number) => n.toLocaleString('tr-TR');
  const pct = (n: number) => `%${n.toLocaleString('tr-TR')}`;

  const stages = [
    { label: 'Widget görüntülendi', count: funnel.stages.viewed },
    { label: 'Katkı seçeneği işaretlendi', count: funnel.stages.selected },
    { label: 'Katkı ekle butonuna basıldı', count: funnel.stages.clicked },
  ];
  const transitions = [funnel.rates.view_to_select_pct, funnel.rates.select_to_button_pct];
  const maxCount = Math.max(funnel.stages.viewed, 1);

  return (
    <section className="gg-card mt-8 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Dönüşüm hikâyesi</h2>
        <Link href="/funnel" className="text-xs font-semibold text-[#0b5c49] underline">
          Tüm dönüşüm hunisini gör →
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Session bazlı etkileşim akışı — ödeme/rezervasyon onayını göstermez.
      </p>

      <div className="mt-5 space-y-4">
        {stages.map((stage, i) => (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-neutral-700">{stage.label}</span>
              <span className="tabular-nums font-semibold text-neutral-900">
                {nf(stage.count)}
                <span className="ml-1 text-xs font-normal text-neutral-400">
                  tekil session
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-[#0b5c49]"
                style={{
                  width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 3 : 0)}%`,
                }}
              />
            </div>
            {i < transitions.length && (
              <div className="mt-1.5 pl-1 text-xs text-neutral-500">
                ↓ {pct(transitions[i])} bir sonraki adıma geçti
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Tahmini CO2 + ağaç eşdeğeri, metodoloji notuna bağlantı ve "offset değildir"
// uyarısıyla birlikte. Kaynak kırılımı YOK — API'de bu veri yok.
function EstimatedImpactSummary({ report }: { report: DashboardReport }) {
  const { carbon } = report;
  const nf = (n: number, digits = 1) =>
    n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });

  return (
    <section className="gg-card mt-6 bg-gradient-to-br from-[#eaf4ec] to-white p-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Tahmini etki özeti
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="font-[Georgia] text-3xl font-medium tracking-tight text-[#0a493b] tabular-nums">
            {nf(carbon.estimated_co2_kg)} kg CO₂
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Widget&apos;ta katkı butonuna basılmasına dayalı tahmin; ödeme veya
            rezervasyon onayı değildir.
          </p>
        </div>
        <div>
          <div className="font-[Georgia] text-3xl font-medium tracking-tight text-[#0a493b] tabular-nums">
            ≈ {nf(carbon.tree_equivalent)}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Ağaç-yılı eşdeğeri — bu da tahminidir, doğrulanmış bir karbon
            dengelemesi (offset) değildir.
          </p>
        </div>
      </div>
      <Link
        href="/karbon"
        className="mt-4 inline-block text-xs font-semibold text-[#0b5c49] underline"
      >
        Katsayı ve metodoloji notunu gör →
      </Link>
    </section>
  );
}

// Veri yoksa: dürüst boş durum + yalnızca GERÇEK otel verisinden türetilen
// kontrol listesi. Ölçülemeyen madde ("embed kodu kopyalandı" vb.) YOK.
function EmptyOverviewState({ hotel }: { hotel: HotelInfo | null }) {
  const hasOrigin = !!hotel && hotel.allowed_origins.length > 0;
  const isActive = hotel?.status === 'active';

  return (
    <section className="gg-card mt-6 p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Henüz veri yok</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Widget&apos;ınız sitenize eklenip ilk misafir etkileşimi geldiğinde
        veriler burada görünecek.
      </p>

      <ul className="mt-4 space-y-2 text-sm">
        <ChecklistItem done={hasOrigin} label="İzinli domain eklendi" />
        <ChecklistItem done={isActive} label="Otel aktifleştirildi" />
        <ChecklistItem done={false} label="İlk etkileşim bekleniyor" pending />
      </ul>

      <Link
        href="/entegrasyon"
        className="mt-5 inline-block rounded-lg bg-[#075442] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#043f34]"
      >
        Entegrasyon sekmesindeki kodu kullanın
      </Link>
    </section>
  );
}

function ChecklistItem({
  done,
  pending = false,
  label,
}: {
  done: boolean;
  pending?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={
          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ' +
          (done
            ? 'bg-emerald-100 text-emerald-700'
            : pending
              ? 'border border-dashed border-neutral-300 text-neutral-400'
              : 'border border-neutral-300 text-neutral-400')
        }
      >
        {done ? '✓' : pending ? '…' : ''}
      </span>
      <span className={done ? 'text-neutral-700' : 'text-neutral-500'}>
        {label}
        {done && <span className="sr-only"> (tamamlandı)</span>}
        {pending && <span className="sr-only"> (bekleniyor)</span>}
      </span>
    </li>
  );
}
