import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getContributionsSummary, type CurrencyContributionTotals } from '@/lib/api';
import { formatMinorAmount } from '@/lib/money';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

export default async function PaymentsPage() {
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

  const [hotelRes, summaryRes] = await Promise.all([
    getHotel(token),
    getContributionsSummary(token, 'month'),
  ]);
  const hotel = hotelRes.data;
  const summary = summaryRes.data;
  const hasContributions = !!summary && summary.contributions_count > 0;

  return (
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="payments" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Ödeme doğrulaması</div>
          <h1 className="gg-title">
            Tahsilatlar
          </h1>
          <p className="gg-subtitle">
            Gerçekten tahsil edilmiş katkılar
          </p>
        </div>

        {hasContributions ? (
          <ContributionsSummaryView totals={summary!.totals} count={summary!.contributions_count} />
        ) : (
          <ComingSoon
            title="Henüz tahsilat hattı yok"
            badge="Faz 2"
            whatItShows="Otel hesabınıza doğrudan geçen, gerçek ödeme onayı almış tahsilatlar; tutar, tarih ve mutabakat durumuyla."
            whyEmpty="Ödeme altyapısı ve gerçek katkı iş modeli henüz devreye alınmadı. Widget'taki buton tıklaması bir tahsilat değildir."
            requirements={[
              'Katkı modeli kararı (gece başına sabit tutar, oran bazlı vb.)',
              'Otel merchant hesabı / IBAN bilgisi',
              'Ödeme sağlayıcısı entegrasyonu',
              'Komisyon oranı kararı',
            ]}
            notice="Henüz ödeme alınmıyor. 'Tahsil edildi' ifadesi yalnızca gerçek ödeme onayıyla kullanılacaktır."
            ctaHref="/entegrasyon"
            ctaLabel="Entegrasyon sayfasına git"
          />
        )}
      </main>
    </AppShell>
  );
}

function ContributionsSummaryView({
  totals,
  count,
}: {
  totals: CurrencyContributionTotals[];
  count: number;
}) {
  return (
    <section className="gg-card mt-6 p-6">
      <p className="text-sm text-neutral-500">
        Bu ay işlenen katkı satırı: <strong>{count}</strong>
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {totals.map((t) => (
          <div key={t.currency} className="rounded-xl border border-neutral-200 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
              {t.currency}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#102b22]">
              {formatMinorAmount(t.net_contribution_minor, t.currency)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Toplam Katkı (net) = tahsil edilen − iade edilen/kısmi iade edilen
            </div>
            <dl className="mt-3 space-y-1 text-xs text-neutral-600">
              <div className="flex justify-between">
                <dt>Tahsil edilen</dt>
                <dd>{formatMinorAmount(t.collected_total_minor, t.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>İade edilen / kısmi iade</dt>
                <dd>{formatMinorAmount(t.refunded_total_minor, t.currency)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div
        role="status"
        className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800"
      >
        Kısmi iadelerde (partially_refunded), normalized event kontratı iade
        edilen KISMI tutarı ayrı taşımaz — bu satırın TAMAMI konservatif olarak
        iade edilmiş sayılır (net katkı olduğundan yüksek asla gösterilmez).
      </div>
    </section>
  );
}
