import { ConnectHubSettingsView } from '@/app/components/panel/ConnectHubSettingsView';
import { getSampleOverview } from '@/lib/sample/hotel-overview';
import { getSampleMeasurement } from '@/lib/sample/connecthub';
import { BASE } from '../screens';

/**
 * Ayarlar ÖNİZLEMESİ — yalnız yeni "Ölçüm ortağı" kartı (gerçek `/ayarlar`
 * ile AYNI bileşen). Otel ayarları formu ve eski 3pmetrics (CCA) paneli
 * değişmediği için burada örneklenmez; gerçek sayfada kartın altındadır.
 */
export default function SettingsPreview() {
  const { carbonStatus } = getSampleOverview();
  const { periods } = getSampleMeasurement();
  return (
    <ConnectHubSettingsView
      status={carbonStatus}
      periods={periods}
      year={periods.year}
      links={{
        measurement: `${BASE}/karbon-olcumu`,
        profile: `${BASE}/tesis-profili`,
        period: (p) => `${BASE}/karbon-olcumu/${p}`,
      }}
    />
  );
}
