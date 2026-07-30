import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getHotel,
  getApiBaseUrl,
  getWidgetEmbedSrc,
  getWidgetEventsSummary,
  type HotelInfo,
} from '@/lib/api';
import { AppShell } from '../components/AppShell';
import { IntegrationCard } from '../components/IntegrationCard';

export default async function IntegrationPage() {
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

  // Son 30 gün etkileşim sinyali — API'de tüm-zamanlar endpoint'i yok, bu
  // yüzden "ilk etkileşim" değil yalnızca "son 30 günde etkileşim" iddia
  // ediyoruz. Üç durum: istek başarısızsa/veri yoksa 'unknown' (nötr,
  // "etkileşim yok" VARSAYILMAZ); views===0 ise 'pending'; views>0 ise 'done'.
  const [hotelRes, summaryRes] = await Promise.all([
    getHotel(token),
    getWidgetEventsSummary(token, '30d'),
  ]);
  const hotel = hotelRes.data;
  const recentActivity: CheckState =
    summaryRes.error || !summaryRes.data
      ? 'unknown'
      : summaryRes.data.views > 0
        ? 'done'
        : 'pending';

  const widgetSrc = getWidgetEmbedSrc();
  const widgetSrcConfigured = !widgetSrc.includes('<panel-domain>');
  const apiBaseUrl = getApiBaseUrl();

  const embedCode = hotel
    ? `<script src="${widgetSrc}"></script>
<green-gold-widget data-key="${hotel.public_widget_key}" data-nights="1" data-lang="tr"
    data-api="${apiBaseUrl}"></green-gold-widget>`
    : '';

  return (
    <AppShell
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      active="integration"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <main className="gg-page">
        <div className="gg-page-header">
          <div>
            <div className="gg-kicker">Kurulum ve bağlantı</div>
            <h1 className="gg-title">
              Entegrasyon
            </h1>
            <p className="gg-subtitle">
              Widget embed kodu ve izinli domain durumu
            </p>
          </div>
          {hotel && <StatusBadge status={hotel.status} />}
        </div>

        {hotelRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Otel bilgileri yüklenemedi: {hotelRes.error}. API sunucusunun
            çalıştığından emin olun.
          </div>
        )}

        {hotel && (
          <>
            <div className="mt-6">
              <IntegrationCard
                embedCode={embedCode}
                allowedOrigins={hotel.allowed_origins}
                widgetSrc={widgetSrc}
                apiBaseUrl={apiBaseUrl}
                publicKey={hotel.public_widget_key}
                widgetSrcConfigured={widgetSrcConfigured}
              />
            </div>

            <SetupChecklist
              hotel={hotel}
              widgetSrcConfigured={widgetSrcConfigured}
              recentActivity={recentActivity}
            />
          </>
        )}
      </main>
    </AppShell>
  );
}

// Otel durumu — yalnızca API'nin döndürdüğü 3 gerçek değer.
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: 'Aktif',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    pending: {
      label: 'Beklemede',
      cls: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    suspended: {
      label: 'Askıya alındı',
      cls: 'border-red-200 bg-red-50 text-red-800',
    },
  };
  const s = map[status] ?? {
    label: status,
    cls: 'border-neutral-200 bg-neutral-50 text-neutral-600',
  };
  return (
    <span
      className={`inline-flex h-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${s.cls}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      Otel durumu: {s.label}
    </span>
  );
}

type CheckState = 'done' | 'pending' | 'unknown';

// Sağlık göstergeleri + onboarding kontrol listesi tek bir listede
// birleştirildi: ikisi de aynı gerçek sinyallere dayanıyor, ayrı ayrı
// göstermek aynı bilgiyi tekrar eder (bkz. 14F "kalabalık kontrolü").
// Ölçülemeyen madde (ör. "embed kodu kopyalandı") YOK — otomatik
// tamamlanmış gösterilmiyor, listeye hiç eklenmiyor.
function SetupChecklist({
  hotel,
  widgetSrcConfigured,
  recentActivity,
}: {
  hotel: HotelInfo;
  widgetSrcConfigured: boolean;
  recentActivity: CheckState;
}) {
  const items: { state: CheckState; label: string }[] = [
    {
      state: widgetSrcConfigured ? 'done' : 'pending',
      label: 'Widget script adresi yapılandırıldı',
    },
    {
      state: hotel.public_widget_key ? 'done' : 'pending',
      label: 'Widget anahtarı üretildi',
    },
    {
      state: hotel.allowed_origins.length > 0 ? 'done' : 'pending',
      label: 'İzinli domain eklendi',
    },
    {
      state: hotel.status === 'active' ? 'done' : 'pending',
      label: 'Otel aktifleştirildi',
    },
    {
      state: recentActivity,
      // 30 günlük veri "ilk" etkileşimi kanıtlamaz — yalnızca bu pencerede
      // etkileşim olup olmadığını söyler.
      label:
        recentActivity === 'unknown'
          ? 'Son 30 gün etkileşim durumu kontrol edilemedi'
          : 'Son 30 günde etkileşim alındı',
    },
  ];

  return (
    <section className="gg-card mt-6 p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Kurulum durumu</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Yalnızca gerçekten doğrulanabilen adımlar işaretlenir.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((it) => (
          <ChecklistRow key={it.label} state={it.state} label={it.label} />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({ state, label }: { state: CheckState; label: string }) {
  const iconCls =
    state === 'done'
      ? 'bg-emerald-100 text-emerald-700'
      : state === 'unknown'
        ? 'border border-dashed border-neutral-300 text-neutral-400'
        : 'border border-neutral-300 text-neutral-400';
  const icon = state === 'done' ? '✓' : state === 'unknown' ? '?' : '';
  const srSuffix =
    state === 'done'
      ? ' (tamamlandı)'
      : state === 'unknown'
        ? ' (kontrol edilemedi)'
        : ' (bekleniyor)';

  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${iconCls}`}
      >
        {icon}
      </span>
      <span className={state === 'done' ? 'text-neutral-700' : 'text-neutral-500'}>
        {label}
        <span className="sr-only">{srSuffix}</span>
      </span>
    </li>
  );
}
