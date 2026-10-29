import { requireAccessToken } from '@/lib/auth';
import { getHotel, getContributionsSummary, type CurrencyContributionTotals } from '@/lib/api';
import { formatMinorAmount } from '@/lib/money';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

export default async function PaymentsPage() {
  const token = await requireAccessToken();

  const [hotelRes, summaryRes] = await Promise.all([
    getHotel(token),
    getContributionsSummary(token, 'month'),
  ]);
  const hotel = hotelRes.data;
  const summary = summaryRes.data;
  const hasContributions =
    !!summary && (summary.contributions_count > 0 || summary.pending_count > 0);

  return (
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="payments" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Rezervasyon sisteminden gelen katkılar</div>
          <h1 className="gg-title">
            Tahsilatlar
          </h1>
          <p className="gg-subtitle">
            Misafirin rezervasyonda seçtiği katkılar ve doğrulanmış tahsilatlar · bu ay
          </p>
        </div>

        {summaryRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Katkı verisi yüklenemedi: {summaryRes.error}
          </div>
        )}

        {hasContributions ? (
          <ContributionsSummaryView
            totals={summary!.totals}
            count={summary!.contributions_count}
            pendingCount={summary!.pending_count}
          />
        ) : (
          !summaryRes.error && (
            <ComingSoon
              title="Bu ay katkı içeren rezervasyon yok"
              badge="Rezervasyon bağlantısı"
              whatItShows="Misafirin rezervasyon sırasında seçtiği Green Gold katkıları (ör. HotelRunner'daki Green Gold ekstrası) ve ödeme sistemi tahsilatı bildirdiğinde doğrulanmış tutarlar."
              whyEmpty="Bu ay, rezervasyon sisteminizden Green Gold katkısı seçilmiş bir rezervasyon gelmedi ya da rezervasyon sistemi bağlantınız henüz kurulmadı. Widget'taki buton tıklaması burada sayılmaz."
              requirements={[
                'Rezervasyon sisteminizle (ör. HotelRunner) bağlantının kurulması',
                "Rezervasyon motorunuzda Green Gold ekstrasının tanımlı olması",
                'Misafirin rezervasyonda ekstrayı seçmesi',
              ]}
              notice="'Tahsil edildi' ifadesi yalnızca ödeme sisteminden gelen gerçek tahsilat bildirimiyle kullanılır."
              ctaHref="/entegrasyon"
              ctaLabel="Entegrasyon sayfasına git"
            />
          )
        )}
      </main>
    </AppShell>
  );
}

function ContributionsSummaryView({
  totals,
  count,
  pendingCount,
}: {
  totals: CurrencyContributionTotals[];
  count: number;
  pendingCount: number;
}) {
  const hasPartialRefund = totals.some((t) => t.refunded_total_minor > 0);
  return (
    <section className="gg-card mt-6 p-6">
      <p className="text-sm text-neutral-500">
        Bu ay: <strong>{pendingCount}</strong> seçilmiş katkı ·{' '}
        <strong>{count}</strong> doğrulanmış tahsilat/iade satırı
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {totals.map((t) => (
          <div key={t.currency} className="rounded-xl border border-neutral-200 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
              {t.currency}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#102b22]">
              {formatMinorAmount(t.pending_total_minor + t.net_contribution_minor, t.currency)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Misafirlerin seçtiği toplam katkı
            </div>
            <dl className="mt-3 space-y-1 text-xs text-neutral-600">
              <div className="flex justify-between">
                <dt>Seçildi · tahsilat otelin ödeme sisteminde</dt>
                <dd>{formatMinorAmount(t.pending_total_minor, t.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tahsilatı doğrulandı (net)</dt>
                <dd>{formatMinorAmount(t.net_contribution_minor, t.currency)}</dd>
              </div>
              {t.refunded_total_minor > 0 && (
                <div className="flex justify-between">
                  <dt>İade edilen / kısmi iade</dt>
                  <dd>{formatMinorAmount(t.refunded_total_minor, t.currency)}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
      <div
        role="status"
        className="mt-6 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs leading-relaxed text-sky-900"
      >
        &quot;Seçildi&quot; satırları, misafirin rezervasyonda Green Gold katkısını
        seçtiğini gösterir. Ücret odayla birlikte otelin kendi ödeme sisteminden
        alınır; HotelRunner tahsilatı bize bildirmediği için bu tutarlar
        &quot;tahsil edildi&quot; olarak işaretlenmez. İptal edilen
        rezervasyonların katkısı otomatik olarak düşülür.
      </div>
      {hasPartialRefund && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800"
        >
          Kısmi iadelerde iade edilen tutar ayrı bildirilmediği için satırın
          tamamı iade edilmiş sayılır; net katkı hiçbir zaman olduğundan yüksek
          gösterilmez.
        </div>
      )}
    </section>
  );
}
