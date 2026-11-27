import { OverviewView } from '@/app/components/panel/OverviewView';
import { normalizeRange } from '@/lib/range';
import { getSampleOverview } from '@/lib/sample/hotel-overview';
import { overviewNextActions, type OverviewLinks } from '@/lib/panel/overview';
import { SAMPLE_NOW, getSampleMeasurement } from '@/lib/sample/connecthub';
import { BASE } from './screens';

/** Önizleme adresleri (gerçek sayfa LIVE_LINKS kullanır). */
const PREVIEW_LINKS: OverviewLinks = {
  guestPreview: `${BASE}/misafir-onizleme`,
  funnel: `${BASE}/donusum`,
  carbon: `${BASE}/karbon-etkisi`,
  payments: `${BASE}/tahsilatlar`,
  integration: `${BASE}/entegrasyon`,
  profile: `${BASE}/tesis-profili`,
  measurement: `${BASE}/karbon-olcumu`,
  period: (p) => `${BASE}/karbon-olcumu/${p}`,
};

/**
 * Genel bakış ÖNİZLEMESİ — gerçek `/` sayfasıyla AYNI bileşen (OverviewView),
 * yalnız veri örnektir. Sıradaki işlemler de gerçek kuraldan üretilir.
 */
export default async function OverviewPreview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const sample = getSampleOverview();
  return (
    <OverviewView
      range={range}
      rangeHref={(r) => (r === 'month' ? BASE : `${BASE}?range=${r}`)}
      links={PREVIEW_LINKS}
      data={{
        hotel: sample.hotel,
        report: sample.report,
        contributions: sample.contributions,
        integrations: sample.integrations,
        carbonStatus: sample.carbonStatus,
        periods: getSampleMeasurement().periods,
        nextActions: overviewNextActions({
          hotel: sample.hotel,
          carbon: sample.carbonStatus,
          periods: getSampleMeasurement().periods,
          now: SAMPLE_NOW,
          links: PREVIEW_LINKS,
        }),
      }}
    />
  );
}
