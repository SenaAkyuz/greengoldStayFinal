import { notFound } from 'next/navigation';
import { PeriodView } from '@/app/components/panel/PeriodView';
import { SegmentedTabs } from '@/app/components/ui';
import { isValidPeriod, periodEditability } from '@/lib/connecthub';
import { getSampleOverview } from '@/lib/sample/hotel-overview';
import {
  SAMPLE_NOW,
  SAMPLE_PERIOD,
  SAMPLE_SCENARIOS,
  getSampleCalculation,
  getSampleStored,
  getSampleVersions,
  getSamplePreviousVersion,
  getSampleMeasurement,
  type SampleScenario,
} from '@/lib/sample/connecthub';
import { BASE } from '../../screens';
import styles from '@/app/components/panel/panel.module.css';

/**
 * Dönem ÖNİZLEMESİ — gerçek `/karbon-olcumu/[donem]` ile AYNI görünüm
 * (PeriodView). `actions` verilmez: form doğrular, "Hesapla" seçili örnek
 * senaryoyu gösterir; hiçbir şey gönderilmez veya kaydedilmez.
 */
export default async function PeriodPreview({
  params,
  searchParams,
}: {
  params: Promise<{ donem: string }>;
  searchParams: Promise<{ senaryo?: string; surum?: string }>;
}) {
  const { donem } = await params;
  if (!isValidPeriod(donem)) notFound();
  const { senaryo, surum } = await searchParams;
  const scenario: SampleScenario = senaryo && senaryo in SAMPLE_SCENARIOS ? (senaryo as SampleScenario) : 'onizleme';
  const { carbonStatus, hotel } = getSampleOverview();
  const sample = getSampleMeasurement();
  const here = `${BASE}/karbon-olcumu/${donem}`;
  const viewingPrevious = surum === 'onceki';
  const stored = donem === SAMPLE_PERIOD ? (viewingPrevious ? getSamplePreviousVersion(scenario) : getSampleStored(scenario)) : null;
  const versions = donem === SAMPLE_PERIOD ? getSampleVersions(scenario) : null;
  const detail = sample.detail(donem);
  return (
    <>
      {donem === SAMPLE_PERIOD && (
        <div className={`${styles.pageBar} ${styles.gapBottom}`}>
          <SegmentedTabs
            label="Örnek hesap senaryosu"
            activeKey={scenario}
            items={(Object.keys(SAMPLE_SCENARIOS) as SampleScenario[]).map((k) => ({
              key: k,
              label: SAMPLE_SCENARIOS[k],
              href: `${here}?senaryo=${k}`,
            }))}
          />
          <span className={styles.small}>Önizleme: “Hesapla” seçili senaryoyu gösterir.</span>
        </div>
      )}
      <PeriodView
        key={scenario}
        period={donem}
        editability={periodEditability(donem, SAMPLE_NOW)}
        now={SAMPLE_NOW}
        isDemo={false}
        status={carbonStatus}
        detail={stored ? { ...detail, measurement_id: stored.id } : detail}
        stored={stored}
        versions={versions?.versions ?? null}
        viewingVersionId={viewingPrevious ? stored?.id ?? null : null}
        versionHref={(id) => `${here}?senaryo=${scenario}${id ? '&surum=onceki' : ''}`}
        items={sample.items}
        providerRecords={sample.providerRecords(donem)}
        links={{ list: `${BASE}/karbon-olcumu`, profile: `${BASE}/tesis-profili` }}
        current={{
          amount_per_night: hotel.amount_per_night,
          currency: hotel.currency,
          estimated_co2_per_night_kg: hotel.estimated_co2_per_night_kg,
        }}
        previewResult={donem === SAMPLE_PERIOD ? getSampleCalculation(scenario) : undefined}
      />
    </>
  );
}
