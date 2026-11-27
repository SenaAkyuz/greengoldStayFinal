import type { ConnectHubStatus } from '@/lib/connecthub/types';
import { profileToInput } from '@/lib/carbon-ui/profile';
import { Card, CardHeader, Notice, PageHeader } from '../ui';
import { FacilityProfileForm } from './FacilityProfileForm';
import type { ProfileSaveState } from './profile-state';
import styles from './panel.module.css';

function dateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  }).format(d);
}

/**
 * TESİS PROFİLİ — gerçek sayfa ve önizleme ORTAK görünüm.
 * Durumlar yalnız `GET …/connecthub/status` alanlarından gösterilir:
 * şema yoksa form yerine açıklama; bağlantı yoksa bilgi notu (profil yine
 * kaydedilebilir — backend profil için bağlantı istemez).
 */
export function ProfileView({
  status,
  statusError,
  isDemo,
  action,
}: {
  status: ConnectHubStatus | null;
  /** Durum okunamadıysa kullanıcı metni. */
  statusError?: string | null;
  isDemo: boolean;
  action?: (prev: ProfileSaveState, form: FormData) => Promise<ProfileSaveState>;
}) {
  const profile = status?.profile ?? null;
  const updated = dateTime(profile?.updated_at);
  const legacyCountry = profile && !profile.country_code;

  return (
    <div className={styles.narrow}>
      <PageHeader
        size="compact"
        eyebrow="Yönetim"
        title="Tesis profili"
        description="Bir kez girilir ve her ayın karbon hesabında kullanılır. Değiştirdiğinizde sonraki hesaplar güncellenir."
      />
      <div className={styles.stack}>
        {statusError && (
          <Notice tone="warning" title="Profil bilgisi alınamadı">{statusError}</Notice>
        )}
        {status && !status.schema_ready && (
          <Notice tone="info" title="Karbon ölçümü henüz etkin değil">
            Bu ortamda ölçüm altyapısı kurulduğunda tesis profilini buradan girebilirsiniz.
          </Notice>
        )}
        {status?.schema_ready && !status.link && (
          <Notice tone="info">
            Tesisiniz henüz ölçüm ortağına bağlanmadı. Profili şimdi kaydedebilirsiniz; aylık hesaplar bağlantıdan sonra yapılır.
          </Notice>
        )}
        {legacyCountry && (
          <Notice tone="warning">
            Kayıtlı profilde ülke kodu yok. Ülkeyi seçip kaydedin; elektrik gibi ülkeye bağlı faktörler buna göre doğrulanır.
          </Notice>
        )}
        {status?.schema_ready && (
          <Card as="section" aria-labelledby="profile-title">
            <CardHeader
              id="profile-title"
              title="Tesis bilgileri"
              description={updated ? `Son güncelleme: ${updated}` : 'Henüz kaydedilmedi.'}
            />
            <FacilityProfileForm
              initial={profileToInput(profile)}
              action={action}
              readOnly={isDemo}
              readOnlyReason="Demo hesabında profil değiştirilemez."
            />
          </Card>
        )}
      </div>
    </div>
  );
}
