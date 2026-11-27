/**
 * Backend hata kodu → otel kullanıcısına gösterilecek metin.
 *
 * Metinler teknik terim, uç adı veya anahtar bilgisi içermez. Bilinmeyen kod
 * genel metne düşer; backend iletisi ekrana AYNEN basılmaz (iç ayrıntı
 * sızmasın diye) — yalnız doğrulama (400) iletileri, kullanıcı girdisine
 * dair olduğundan gösterilebilir.
 */
import type { ApiResult } from './client';

const MESSAGES: Record<string, string> = {
  network: 'Sunucuya şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.',
  carbon_schema_not_ready: 'Karbon ölçümü bu ortamda henüz etkin değil.',
  carbon_provider_not_configured: 'Ölçüm ortağı bağlantısı bu ortamda yapılandırılmamış.',
  carbon_provider_not_linked: 'Tesisiniz henüz ölçüm ortağına bağlanmadı.',
  carbon_provider_environment_mismatch:
    'Tesis bağlantısı başka bir ortama ait (test/canlı). Bağlantının yenilenmesi gerekiyor.',
  carbon_provider_credentials_missing: 'Ölçüm ortağı erişim bilgisi tanımlı değil.',
  carbon_provider_unauthorized: 'Ölçüm ortağı erişimi reddedildi. Bağlantının yenilenmesi gerekiyor.',
  carbon_provider_not_found: 'Ölçüm ortağında ilgili kayıt bulunamadı.',
  carbon_provider_invalid_request: 'Ölçüm ortağı gönderilen bilgiyi kabul etmedi.',
  carbon_provider_rate_limited: 'Çok sayıda istek gönderildi. Bir dakika bekleyip tekrar deneyin.',
  carbon_provider_invalid_response: 'Ölçüm ortağından beklenmeyen bir yanıt alındı.',
  carbon_provider_unavailable: 'Ölçüm ortağına şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.',
  carbon_period_closed: 'Bu dönem ölçüm ortağında kapatılmış; değişiklik yapılamaz.',
  carbon_profile_missing: 'Hesaplama için önce tesis profilini doldurun.',
  carbon_occupancy_missing: 'Hesaplama için bu ayın dolu oda-gece sayısını girin.',
  carbon_country_code_invalid: 'Ülke kodu tanınmadı (ör. TR).',
  unauthorized: 'Oturumunuzun süresi doldu. Tekrar giriş yapın.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  demo_read_only: 'Demo hesabında değişiklik yapılamaz.',
  carbon_measurement_internal_use:
    'Ölçüm ortağının faktör kullanım izni olmadan bu ölçüm misafir ekranına alınamaz.',
  carbon_measurement_scope_not_permitted:
    'Bu ölçüm Kapsam 1 ve 2 dışında satır içeriyor; kullanım izni yalnız Kapsam 1 ve 2 için geçerli olduğundan misafir ekranına alınamaz.',
  carbon_measurement_country_unverified:
    'Bu ölçümde tesisinizin ülkesine uygunluğu doğrulanamayan bir faktör var; misafir ekranına alınamaz.',
  carbon_measurement_superseded:
    'Bu ölçüm dönemin güncel hesabı değil (önceki sürüm); misafir ekranına alınamaz. Dönemi yeniden hesaplayın.',
};

export const GENERIC_ERROR = 'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.';

export function userMessage(result: Pick<ApiResult<unknown>, 'code' | 'status' | 'error'>): string {
  if (result.code && MESSAGES[result.code]) return MESSAGES[result.code];
  if (result.status === 401) return MESSAGES.unauthorized;
  if (result.status === 403) return MESSAGES.forbidden;
  // 400 doğrulama iletileri kullanıcının girdisine dairdir (ör. ölçü birimi).
  if (result.status === 400 && result.error) return result.error;
  return GENERIC_ERROR;
}
