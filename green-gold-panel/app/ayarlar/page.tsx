import { requireAccessToken } from '@/lib/auth';
import { getHotel, getCarbonOptions, getCarbonProviderStatus } from '@/lib/api';
import { connecthub, userMessage } from '@/lib/connecthub';
import { PageHeader, Notice } from '../components/ui';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { ConnectHubSettingsView } from '../components/panel/ConnectHubSettingsView';
import { SettingsForm } from '../components/SettingsForm';

export default async function SettingsPage() {
  const token = await requireAccessToken();

  // providerStatus hatası ekranı BOZMAZ: sağlayıcı paneli null durumla
  // "bekleniyor" gösterir, mevcut hesaplayıcılar etkilenmez.
  // ConnectHub durumu ve ölçüm geçmişi salt okumadır (yerel veri); hata
  // verirse yalnız o kart uyarı gösterir, ayarlar formu etkilenmez.
  const year = new Date().getUTCFullYear();
  const [hotelRes, optionsRes, providerRes, chStatusRes, chPeriodsRes] = await Promise.all([
    getHotel(token),
    getCarbonOptions(token),
    getCarbonProviderStatus(token),
    connecthub.status(token),
    connecthub.periods(token, year),
  ]);
  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      title="Ayarlar"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <div className="gg-page gg-page--framed">
        <PageHeader
          size="compact"
          eyebrow="Otel yapılandırması"
          title="Ayarlar"
          description={<>Otel bilgileri, karbon tahmini ve oda-gece başına katkı hesabı</>}
        />

        {hotelRes.error && (
          <Notice tone="warning" className="mt-6">
            Ayarlar yüklenemedi: {hotelRes.error}. API sunucusunun çalıştığından
            emin olun.
          </Notice>
        )}

        <div className="mt-6">
          <ConnectHubSettingsView
            status={chStatusRes.data}
            statusError={chStatusRes.error ? userMessage(chStatusRes) : null}
            periods={chPeriodsRes.data}
            year={year}
            links={{ measurement: '/karbon-olcumu', profile: '/tesis-profili', period: (p) => `/karbon-olcumu/${p}` }}
          />
        </div>

        {hotel && (
          <SettingsForm
            hotel={hotel}
            carbonOptions={optionsRes.data}
            providerStatus={providerRes.data}
          />
        )}
      </div>
    </HotelPanelFrame>
  );
}
