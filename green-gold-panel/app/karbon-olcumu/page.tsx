import type { Metadata } from 'next';
import { requireAccessToken } from '@/lib/auth';
import { getHotel } from '@/lib/api';
import { connecthub, userMessage } from '@/lib/connecthub';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { MeasurementView } from '../components/panel/MeasurementView';

export const metadata: Metadata = { title: 'Karbon ölçümü' };

/** Karbon ölçümü — 12 aylık dönem listesi (E aşaması). */
export default async function MeasurementPage({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string | string[] }>;
}) {
  const token = await requireAccessToken();
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const sp = await searchParams;
  const raw = Number(Array.isArray(sp.yil) ? sp.yil[0] : sp.yil);
  // Yalnız bu yıl ve önceki iki yıl (sağlayıcı envanterleri yıllıktır).
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const year = years.includes(raw) ? raw : thisYear;

  const [hotelRes, statusRes, periodsRes] = await Promise.all([
    getHotel(token),
    connecthub.status(token),
    connecthub.periods(token, year),
  ]);
  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} isDemo={hotel?.role === 'demo_viewer'} title="Karbon ölçümü">
      <MeasurementView
        year={year}
        years={years}
        now={now}
        status={statusRes.data}
        statusError={statusRes.error ? userMessage(statusRes) : null}
        periods={periodsRes.data}
        periodsError={periodsRes.error ? userMessage(periodsRes) : null}
        links={{
          period: (p) => `/karbon-olcumu/${p}`,
          year: (y) => (y === thisYear ? '/karbon-olcumu' : `/karbon-olcumu?yil=${y}`),
          profile: '/tesis-profili',
        }}
      />
    </HotelPanelFrame>
  );
}
