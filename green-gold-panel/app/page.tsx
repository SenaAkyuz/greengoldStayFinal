import type { Metadata } from 'next';
import { requireAccessToken } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LandingPage } from './components/landing/LandingPage';
import {
  getContributionsSummary,
  getHotel,
  getIntegrationHealth,
  getReport,
} from '@/lib/api';
import { connecthub, lastCompletedPeriod } from '@/lib/connecthub';
import { normalizeRange } from '@/lib/range';
import { LIVE_LINKS, overviewNextActions } from '@/lib/panel/overview';
import { HotelPanelFrame } from './components/panel/HotelPanelFrame';
import { OverviewView } from './components/panel/OverviewView';

/**
 * Genel bakış (D aşaması: yeni tasarım). Veri çağrıları önceki sürümle aynı
 * (/dashboard/report, /hotel, /contributions-summary); ek olarak entegrasyon
 * sağlığı, karbon ölçümü durumu ve dönem listesi yalnız "sıradaki işlemler" ve entegrasyon
 * kartı için okunur — biri hata verirse ilgili parça sessizce gizlenir.
 */
/** Girişsiz ziyaretçi ürün ana sayfasını görür (KD-1); başlık ona göre. */
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { title: 'Genel bakış · GreenGold Stay' };
  return {
    title: 'GreenGold Stay · Oteller için tahmini karbon ayak izi ve gönüllü katkı',
    description:
      'Misafir, rezervasyon adımında konaklamasının tahmini karbon ayak izini görür ve isterse gönüllü katkı verir. Tahmin, otelin onaylı enerji tüketimine (Kapsam 1 ve 2) dayanır.',
    openGraph: {
      title: 'GreenGold Stay',
      description: 'Oteller için tahmini karbon ayak izi ve isteğe bağlı gönüllü katkı.',
      type: 'website',
      locale: 'tr_TR',
      images: [{ url: '/marketing/og-greengold-stay.jpg', width: 1200, height: 630, alt: 'GreenGold Stay' }],
    },
    twitter: { card: 'summary_large_image', images: ['/marketing/og-greengold-stay.jpg'] },
  };
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  // KD-1: aynı adres — girişsiz ziyaretçi ürün ana sayfası, otel yöneticisi
  // genel bakış. Oturum sunucuda doğrulanır (getUser).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <LandingPage />;

  const token = await requireAccessToken();

  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const now = new Date();
  // Tek rapor çağrısı: summary + funnel + carbon aynı dönem için tutarlı gelsin.
  const [reportRes, hotelRes, contributionsRes, integrationsRes, carbonRes, periodsRes] =
    await Promise.all([
      getReport(token, range),
      getHotel(token),
      getContributionsSummary(token, range),
      getIntegrationHealth(token),
      connecthub.status(token),
      // Yalnız "sıradaki işlemler" için; yerel veri, sağlayıcıya istek atmaz.
      connecthub.periods(token, Number(lastCompletedPeriod(now).slice(0, 4))),
    ]);

  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      isDemo={hotel?.role === 'demo_viewer'}
      title="Genel bakış"
    >
      <OverviewView
        range={range}
        rangeHref={(r) => (r === 'month' ? '/' : `/?range=${r}`)}
        links={LIVE_LINKS}
        data={{
          hotel,
          report: reportRes.data,
          contributions: contributionsRes.data,
          integrations: integrationsRes.data,
          nextActions: overviewNextActions({ hotel, carbon: carbonRes.data, periods: periodsRes.data, links: LIVE_LINKS, now }),
          carbonStatus: carbonRes.data,
          periods: periodsRes.data,
          loadError: reportRes.error ?? hotelRes.error,
        }}
      />
    </HotelPanelFrame>
  );
}
