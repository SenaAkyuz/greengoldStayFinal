import { requireAccessToken } from '@/lib/auth';
import { getHotel, getApiBaseUrl } from '@/lib/api';
import { PageHeader, Notice } from '../components/ui';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { GuestDemoWidget } from '../components/GuestDemoWidget';

export default async function GuestPreviewPage() {
  const token = await requireAccessToken();

  const hotelRes = await getHotel(token);
  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      title="Misafir önizleme"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <div className="gg-page gg-page--framed">
        <PageHeader
          size="compact"
          eyebrow="Misafir deneyimi"
          title="Misafir önizleme"
          description={<>Widget’ın misafire nasıl göründüğünün canlı önizlemesi</>}
          actions={<>
          <span className="rounded-full border border-[var(--ds-color-border)] bg-[var(--ds-palette-sage-50)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ds-palette-pine-700)]">
            • Önizleme modu
          </span>
          </>}
        />

        <div className="gg-notice mt-7 flex items-center gap-3 px-5 py-4 text-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--ds-palette-pine-700)] font-semibold text-white">✓</span>
          <div>
            <div className="font-semibold">Güvenli önizleme modu</div>
            <div className="mt-0.5 text-xs text-[var(--ds-color-text-muted)]">Bu ekrandaki etkileşimler raporlara yansımaz ve ödeme alınmaz.</div>
          </div>
        </div>

        {hotelRes.error && (
          <Notice tone="warning" className="mt-6">
            Otel bilgileri yüklenemedi: {hotelRes.error}. API sunucusunun
            çalıştığından emin olun.
          </Notice>
        )}

        {hotel && (
          <GuestDemoWidget
            publicKey={hotel.public_widget_key}
            apiBase={getApiBaseUrl()}
            allowStoredPreview={hotel.role === 'demo_viewer'}
          />
        )}
      </div>
    </HotelPanelFrame>
  );
}
