import { MeasurementView } from '@/app/components/panel/MeasurementView';
import { getSampleOverview } from '@/lib/sample/hotel-overview';
import { SAMPLE_NOW, getSampleMeasurement } from '@/lib/sample/connecthub';
import { BASE } from '../screens';

/**
 * Karbon ölçümü ÖNİZLEMESİ — gerçek `/karbon-olcumu` ile AYNI görünüm
 * (MeasurementView), yalnız veri örnektir.
 */
export default function MeasurementPreview() {
  const { carbonStatus } = getSampleOverview();
  const { periods } = getSampleMeasurement();
  const base = `${BASE}/karbon-olcumu`;
  return (
    <MeasurementView
      year={2026}
      years={[2026, 2025, 2024]}
      now={SAMPLE_NOW}
      status={carbonStatus}
      periods={periods}
      links={{ period: (p) => `${base}/${p}`, year: () => base, profile: `${BASE}/tesis-profili` }}
    />
  );
}
