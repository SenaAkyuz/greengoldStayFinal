import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHotel, getFunnel } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { AppShell } from '../components/AppShell';
import { RangePills } from '../components/RangePills';

export default async function FunnelPage({
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

  const [funnelRes, hotelRes] = await Promise.all([
    getFunnel(token, range),
    getHotel(token),
  ]);

  const hotel = hotelRes.data;
  const funnel = funnelRes.data;
  const loadError = funnelRes.error ?? hotelRes.error;

  const pct = (n: number) => `%${n.toLocaleString('tr-TR')}`;
  const nf = (n: number) => n.toLocaleString('tr-TR');

  const isEmpty = !!funnel && funnel.stages.viewed === 0;

  const stages = funnel
    ? [
        { key: 'viewed', label: 'Görüntülenme', count: funnel.stages.viewed },
        { key: 'selected', label: 'Seçim', count: funnel.stages.selected },
        {
          key: 'clicked',
          label: 'Katkı butonu tıklaması',
          count: funnel.stages.clicked,
        },
      ]
    : [];
  const maxCount = funnel
    ? Math.max(funnel.stages.viewed, funnel.stages.selected, funnel.stages.clicked, 1)
    : 1;
  // Aşamalar arası geçiş oranı etiketleri (bar aralarına).
  const transitions = funnel
    ? [funnel.rates.view_to_select_pct, funnel.rates.select_to_button_pct]
    : [];

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="funnel"
    >
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              Dönüşüm
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
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
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
              <div className="text-sm font-medium text-emerald-800">
                Görüntülenme → Katkı butonu
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight text-emerald-900 tabular-nums">
                {pct(funnel.rates.view_to_button_pct)}
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
              <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="space-y-4">
                  {stages.map((stage, i) => (
                    <div key={stage.key}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-neutral-700">
                          {stage.label}
                        </span>
                        <span className="tabular-nums font-semibold text-neutral-900">
                          {nf(stage.count)}
                          <span className="ml-1 text-xs font-normal text-neutral-400">
                            tekil session
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-8 w-full overflow-hidden rounded-lg bg-neutral-100">
                        <div
                          className="h-full rounded-lg bg-emerald-600 transition-all"
                          style={{
                            width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)}%`,
                            opacity: 1 - i * 0.18,
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
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
