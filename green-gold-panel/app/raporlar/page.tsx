import { requireAccessToken } from '@/lib/auth';
import { getContributionsSummary, getDaily, getHotel, getReport, getReportBetween } from '@/lib/api';
import { normalizeRange } from '@/lib/range';
import { previousPeriod } from '@/lib/panel/report';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { ReportsView } from '../components/panel/ReportsView';

/**
 * Raporlar (UX-5.x): seçili dönem + önceki dönem karşılaştırması + günlük
 * seri. Hepsi gerçek API verisi; karşılaştırma okunamazsa sessizce gizlenir.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const token = await requireAccessToken();
  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const [reportRes, hotelRes, dailyRes, contributionsRes] = await Promise.all([
    getReport(token, range),
    getHotel(token),
    getDaily(token, range),
    getContributionsSummary(token, range),
  ]);
  const prev = previousPeriod(range, reportRes.data?.period);
  const prevRes = prev ? await getReportBetween(token, prev.from, prev.to) : null;
  const hotel = hotelRes.data;

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} title="Raporlar" isDemo={hotel?.role === 'demo_viewer'}>
      <div className="gg-page gg-page--framed">
      <ReportsView
        range={range}
        rangeHref={(r) => (r === 'month' ? '/raporlar' : `/raporlar?range=${r}`)}
        exportHref={range === 'month' ? '/raporlar/export' : `/raporlar/export?range=${range}`}
        links={{ integration: '/entegrasyon', carbon: '/karbon', payments: '/tahsilatlar' }}
        data={{
          report: reportRes.data,
          previous: prevRes?.data ?? null,
          daily: dailyRes.data,
          contributions: contributionsRes.data,
          error: reportRes.error,
        }}
      />
      </div>
    </HotelPanelFrame>
  );
}
