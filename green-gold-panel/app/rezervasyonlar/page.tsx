import { requireAccessToken } from '@/lib/auth';
import { getHotel, getReservations, type ReservationSummary } from '@/lib/api';
import { formatMinorAmount } from '@/lib/money';
import { AppShell } from '../components/AppShell';
import { ComingSoon } from '../components/ComingSoon';

const BOOKING_STATUS_LABEL: Record<string, string> = {
  confirmed: 'Onaylandı',
  modified: 'Güncellendi',
  cancelled: 'İptal edildi',
  no_show: 'Gelmedi (no-show)',
  stayed: 'Konakladı',
};

// Katkı durumu: 'pending' tahsilat DEĞİL — misafir seçti, ücret otelin kendi
// ödeme sisteminden alınır (HotelRunner tahsilatı bildirmez).
const CONTRIBUTION_STATUS_LABEL: Record<string, string> = {
  pending: 'Seçildi · tahsilat otelde',
  collected: 'Tahsil edildi',
  refunded: 'İade edildi',
  partially_refunded: 'Kısmi iade',
  voided: 'Geçersiz (iptal)',
};

const BOOKING_STATUS_CLASS: Record<string, string> = {
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  modified: 'border-sky-200 bg-sky-50 text-sky-800',
  cancelled: 'border-red-200 bg-red-50 text-red-800',
  no_show: 'border-amber-200 bg-amber-50 text-amber-800',
  stayed: 'border-neutral-200 bg-neutral-50 text-neutral-700',
};

export default async function ReservationsPage() {
  const token = await requireAccessToken();

  const [hotelRes, reservationsRes] = await Promise.all([
    getHotel(token),
    getReservations(token, 'month'),
  ]);
  const hotel = hotelRes.data;
  const reservations = reservationsRes.data;
  const hasReservations = !!reservations && reservations.items.length > 0;

  return (
    <AppShell hotelName={hotel?.hotel_name} city={hotel?.city} active="reservations" isDemo={hotel?.role === 'demo_viewer'}>
      <main className="gg-page">
        <div>
          <div className="gg-kicker">Rezervasyon sistemi bağlantısı</div>
          <h1 className="gg-title">
            Rezervasyonlar
          </h1>
          <p className="gg-subtitle">
            Rezervasyon sisteminizden (ör. HotelRunner) gelen rezervasyonlar · bu ay
          </p>
        </div>

        {reservationsRes.error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Rezervasyonlar yüklenemedi: {reservationsRes.error}
          </div>
        )}

        {hasReservations ? (
          <ReservationsTable items={reservations!.items} truncated={reservations!.truncated} />
        ) : (
          !reservationsRes.error && (
            <ComingSoon
              title="Bu ay rezervasyon gelmedi"
              badge="Rezervasyon bağlantısı"
              whatItShows="Rezervasyon sisteminizden otomatik gelen rezervasyonlar; rezervasyon numarası, durum ve Green Gold katkısı seçilip seçilmediği. Misafirin adı, e-postası ve telefonu kaydedilmez."
              whyEmpty="Rezervasyon sistemi bağlantınız henüz kurulmadı ya da bu ay yeni/değişen rezervasyon olmadı. Widget'taki buton tıklaması bir rezervasyon değildir."
              requirements={[
                'HotelRunner kullanıyorsanız: Green Gold uygulamasının otel kimliği (HR_ID) ve anahtarı (TOKEN)',
                'Green Gold ekibinin ilettiği bildirim adresinin rezervasyon sisteminize girilmesi',
                'Bağlantının Green Gold ekibi tarafından etkinleştirilmesi',
              ]}
              ctaHref="/entegrasyon"
              ctaLabel="Entegrasyon sayfasına git"
            />
          )
        )}
      </main>
    </AppShell>
  );
}

// Misafir adı/e-posta/telefon YOK — API zaten döndürmüyor (bkz. reservations
// migration'ı: PII varsayılan olarak saklanmaz).
function ReservationsTable({
  items,
  truncated,
}: {
  items: ReservationSummary[];
  truncated: boolean;
}) {
  return (
    <section className="gg-card mt-6 overflow-hidden">
      {truncated && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Bu dönemde gösterilenden daha fazla rezervasyon var — liste ilk 200
          kayıtla sınırlıdır.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
              <th className="px-4 py-3">Rezervasyon no</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Green Gold seçildi mi?</th>
              <th className="px-4 py-3">Katkı tutarı</th>
              <th className="px-4 py-3">Katkı durumu</th>
              <th className="px-4 py-3">Son güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                  {r.provider_reservation_id}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_CLASS[r.booking_status] ?? 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}
                  >
                    {BOOKING_STATUS_LABEL[r.booking_status] ?? r.booking_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.contribution?.selected ? 'Evet' : 'Hayır'}
                </td>
                <td className="px-4 py-3">
                  {r.contribution
                    ? formatMinorAmount(r.contribution.amount_minor, r.contribution.currency)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {r.contribution
                    ? (CONTRIBUTION_STATUS_LABEL[r.contribution.status] ?? r.contribution.status)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(r.updated_at).toLocaleString('tr-TR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
