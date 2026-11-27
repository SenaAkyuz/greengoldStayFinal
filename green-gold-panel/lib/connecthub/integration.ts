/**
 * Ayarlar → "Ölçüm ortağı (ConnectHub)" durumu ve ölçüm geçmişi (saf fonksiyonlar).
 *
 * Kurallar:
 *  - Yalnız `GET …/connecthub/status` ve `GET …/connecthub/periods` (yerel veri)
 *    kullanılır; sağlayıcıya istek atılmaz, bir şey yazılmaz.
 *  - Anahtar DEĞERLERİ hiçbir zaman gelmez/gösterilmez; yalnız "hazır mı".
 *  - Ölçüm geçmişi = her ayın GÜNCEL kaydedilmiş ölçümü (dönem satırının
 *    bağlı olduğu ölçüm). Aynı ayın eski sürümlerini listeleyen bir uç yok;
 *    burada uydurulmaz.
 */
import type { UiTone } from '../carbon-ui/status';
import { canCalculate, canSubmit, readinessText } from './logic';
import type { ConnectHubStatus, PeriodList } from './types';

export interface StatusFact {
  key: string;
  label: string;
  value: string;
  tone: UiTone;
}

export interface IntegrationModel {
  /** Tek satırlık özet ve tonu. */
  headline: string;
  tone: UiTone;
  facts: StatusFact[];
  submitText: string | null;
  calculateText: string | null;
}

const yesNo = (ok: boolean, yes: string, no: string, noTone: UiTone = 'warning'): Pick<StatusFact, 'value' | 'tone'> =>
  ok ? { value: yes, tone: 'success' } : { value: no, tone: noTone };

const ENV_LABEL: Record<string, string> = { sandbox: 'Test (sandbox)', production: 'Canlı' };

export function envLabel(env: string | null | undefined): string {
  if (!env) return '—';
  return ENV_LABEL[env] ?? env;
}

export function integrationModel(status: ConnectHubStatus): IntegrationModel {
  const submit = canSubmit(status);
  const calc = canCalculate(status);
  const facts: StatusFact[] = [];

  facts.push({
    key: 'schema',
    label: 'Ölçüm altyapısı',
    ...yesNo(status.schema_ready, 'Etkin', 'Bu ortamda henüz etkin değil'),
  });
  facts.push({
    key: 'link',
    label: 'Tesis bağlantısı',
    ...(status.link
      ? { value: status.link.unit_name ?? 'Bağlı', tone: 'success' as const }
      : { value: 'Bağlı değil', tone: 'warning' as const }),
  });
  facts.push({ key: 'env', label: 'Ortam', value: envLabel(status.environment), tone: 'neutral' });
  if (status.link) {
    facts.push({
      key: 'env-match',
      label: 'Bağlantı ortamı',
      ...(status.environment_matches === false
        ? { value: `${envLabel(status.link.environment)} · eşleşmiyor`, tone: 'danger' as const }
        : { value: `${envLabel(status.link.environment)} · uygun`, tone: 'success' as const }),
    });
  }
  facts.push({ key: 'write', label: 'Veri gönderme yetkisi', ...yesNo(status.write_key_ready, 'Hazır', 'Tanımlı değil') });
  facts.push({ key: 'read', label: 'Okuma yetkisi (hesap)', ...yesNo(status.read_key_ready, 'Hazır', 'Tanımlı değil') });
  facts.push({
    key: 'profile',
    label: 'Tesis profili',
    ...(status.profile
      ? status.profile.country_code
        ? { value: `Kayıtlı · ${status.profile.rooms} oda`, tone: 'success' as const }
        : { value: 'Kayıtlı · ülke kodu eksik', tone: 'warning' as const }
      : { value: 'Doldurulmadı', tone: 'warning' as const }),
  });

  const ok = submit.ready && calc.ready;
  return {
    headline: ok
      ? 'Ölçüm ortağı bağlantısı hazır: veri gönderebilir ve hesaplayabilirsiniz.'
      : submit.ready
        ? 'Veri gönderebilirsiniz; hesaplama için eksik var.'
        : 'Ölçüm ortağı bağlantısı henüz tamamlanmadı.',
    tone: ok ? 'success' : submit.ready ? 'info' : 'warning',
    facts,
    submitText: readinessText(submit),
    calculateText: submit.ready ? readinessText(calc) : null,
  };
}

export interface HistoryRow {
  period: string;
  totalText: string;
  active: boolean;
}

/** Kaydedilmiş ölçümü olan aylar, yeniden eskiye. */
export function measurementHistory(list: PeriodList | null, format: (tonnes: number) => string): HistoryRow[] {
  if (!list?.schema_ready) return [];
  return list.periods
    .filter((p) => p.measurement && p.measurement.total_tonnes !== null)
    .map((p) => ({
      period: p.period,
      totalText: format(p.measurement!.total_tonnes as number),
      active: p.measurement!.is_active,
    }))
    .sort((a, b) => b.period.localeCompare(a.period));
}
