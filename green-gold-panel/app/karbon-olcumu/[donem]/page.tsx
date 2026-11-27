import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAccessToken } from '@/lib/auth';
import { getHotel } from '@/lib/api';
import { connecthub, isMeasurementId, isValidPeriod, periodEditability, userMessage } from '@/lib/connecthub';
import { formatPeriod } from '@/lib/carbon-ui/status';
import { HotelPanelFrame } from '../../components/panel/HotelPanelFrame';
import { PeriodView } from '../../components/panel/PeriodView';
import {
  calculatePeriodAction,
  publishMeasurementAction,
  resendUncertain,
  saveOccupancyAction,
  submitPeriodEntries,
} from '../actions';

export async function generateMetadata({ params }: { params: Promise<{ donem: string }> }): Promise<Metadata> {
  const { donem } = await params;
  return { title: isValidPeriod(donem) ? `${formatPeriod(donem)} · Karbon ölçümü` : 'Karbon ölçümü' };
}

/** Dönem sayfası: doluluk, dinamik kalemler, gönderim, kayıt durumları, kaydedilmiş hesap + yeni hesap/yayın. */
export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ donem: string }>;
  searchParams: Promise<{ surum?: string }>;
}) {
  const { donem } = await params;
  const { surum } = await searchParams;
  // Önceki sürümü incele (?surum=<ölçüm kimliği>); geçersiz kimlik yok sayılır.
  const versionId = surum && isMeasurementId(surum) ? surum : null;
  if (!isValidPeriod(donem)) notFound();
  const token = await requireAccessToken();
  const now = new Date();
  const editability = periodEditability(donem, now);
  const year = Number(donem.slice(0, 4));

  const [hotelRes, statusRes, detailRes, itemsRes, storedRes, versionsRes, providerRes] = await Promise.all([
    getHotel(token),
    connecthub.status(token),
    editability === 'open' ? connecthub.period(token, donem) : Promise.resolve(null),
    editability === 'open' ? connecthub.items(token, year) : Promise.resolve(null),
    // Kaydedilmiş hesap: salt okuma, sağlayıcıya istek yok — yenilemede sonuç kaybolmaz.
    editability === 'open'
      ? versionId
        ? connecthub.measurementVersion(token, donem, versionId)
        : connecthub.measurement(token, donem)
      : Promise.resolve(null),
    // Ölçüm geçmişi: kayıtlı tüm sürümler (salt okuma).
    editability === 'open' ? connecthub.measurements(token, donem) : Promise.resolve(null),
    // Ölçüm ortağındaki onaylı kayıtlar (salt okuma; panelden gönderilmeyenler dahil).
    editability === 'open' ? connecthub.providerRecords(token, donem) : Promise.resolve(null),
  ]);
  // Bağlantı/okuma anahtarı yoksa bölüm gizlenir (hata değil; durum kartı zaten söyler).
  const providerHidden =
    !!providerRes?.error && ['carbon_provider_not_linked', 'carbon_provider_credentials_missing', 'carbon_provider_not_configured'].includes(providerRes.code ?? '');
  const hotel = hotelRes.data;
  const isDemo = hotel?.role === 'demo_viewer';

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} isDemo={isDemo} title="Karbon ölçümü">
      <PeriodView
        period={donem}
        editability={editability}
        now={now}
        isDemo={isDemo}
        status={statusRes.data}
        statusError={statusRes.error ? userMessage(statusRes) : null}
        detail={detailRes?.data ?? null}
        detailError={detailRes?.error ? userMessage(detailRes) : null}
        items={itemsRes?.data ?? null}
        itemsError={itemsRes?.error ? userMessage(itemsRes) : null}
        stored={storedRes?.data?.measurement ?? null}
        storedError={storedRes?.error ? userMessage(storedRes) : null}
        versions={versionsRes?.data?.versions ?? null}
        providerRecords={providerRes?.data?.records ?? null}
        providerRecordsError={providerRes?.error && !providerHidden ? userMessage(providerRes) : null}
        versionsError={versionsRes?.error ? userMessage(versionsRes) : null}
        viewingVersionId={versionId}
        versionHref={(id) => (id ? `/karbon-olcumu/${donem}?surum=${id}` : `/karbon-olcumu/${donem}`)}
        links={{ list: '/karbon-olcumu', profile: '/tesis-profili' }}
        current={
          hotel
            ? {
                amount_per_night: hotel.amount_per_night,
                currency: hotel.currency,
                estimated_co2_per_night_kg: hotel.estimated_co2_per_night_kg,
              }
            : null
        }
        actions={{
          occupancy: saveOccupancyAction.bind(null, donem),
          submit: submitPeriodEntries.bind(null, donem),
          resend: resendUncertain.bind(null, donem),
          calculate: calculatePeriodAction.bind(null, donem),
          publish: publishMeasurementAction.bind(null, donem),
        }}
      />
    </HotelPanelFrame>
  );
}
