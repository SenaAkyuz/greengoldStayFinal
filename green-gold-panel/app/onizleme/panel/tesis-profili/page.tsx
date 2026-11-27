import { ProfileView } from '@/app/components/panel/ProfileView';
import { getSampleOverview } from '@/lib/sample/hotel-overview';

/**
 * Tesis profili ÖNİZLEMESİ — gerçek `/tesis-profili` ile AYNI görünüm.
 * `action` verilmez: form yalnız doğrular, hiçbir şey kaydetmez.
 */
export default function ProfilePreview() {
  const { carbonStatus } = getSampleOverview();
  return <ProfileView status={carbonStatus} isDemo={false} />;
}
