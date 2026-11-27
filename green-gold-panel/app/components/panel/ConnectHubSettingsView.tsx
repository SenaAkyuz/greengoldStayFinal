import Link from 'next/link';
import { ButtonLink, Card, CardHeader, DataTable, Notice, StatusPill } from '../ui';
import {
  integrationModel,
  measurementHistory,
  type ConnectHubStatus,
  type HistoryRow,
  type PeriodList,
} from '@/lib/connecthub';
import { formatEmission, formatPeriod } from '@/lib/carbon-ui/status';
import styles from './panel.module.css';

const tonnes = (t: number) => {
  const e = formatEmission(t * 1000);
  return e.value ? `${e.value} ${e.unit}` : '—';
};

/**
 * AYARLAR → Ölçüm ortağı (ConnectHub) durumu + ölçüm geçmişi.
 * Gerçek sayfa ve önizleme ORTAK kullanır. Salt okuma: anahtar değerleri yok,
 * sağlayıcıya istek yok. Eski 3pmetrics (CCA) paneli ayrı ve değişmeden kalır.
 */
export function ConnectHubSettingsView({
  status,
  statusError,
  periods,
  year,
  links,
}: {
  status: ConnectHubStatus | null;
  statusError?: string | null;
  periods: PeriodList | null;
  year: number;
  links: { measurement: string; profile: string; period: (p: string) => string };
}) {
  const model = status ? integrationModel(status) : null;
  const history = measurementHistory(periods, tonnes);

  return (
    <Card as="section" aria-labelledby="ch-settings-title">
      <CardHeader
        id="ch-settings-title"
        title="Ölçüm ortağı (3P Metrics ConnectHub)"
        description="Aylık tüketim verilerinin gönderildiği ve hesaplandığı yeni ölçüm hattı. Anahtarlar sunucuda saklanır; burada yalnız hazır olup olmadıkları görünür."
        actions={
          <>
            <ButtonLink href={links.profile} variant="secondary">Tesis profili</ButtonLink>
            <ButtonLink href={links.measurement}>Karbon ölçümü</ButtonLink>
          </>
        }
      />
      <div className={styles.stack}>
        {statusError && <Notice tone="danger">{statusError}</Notice>}
        {model && (
          <>
            <Notice tone={model.tone}>{model.headline}</Notice>
            <dl className={styles.facts}>
              {model.facts.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd><StatusPill tone={f.tone}>{f.value}</StatusPill></dd>
                </div>
              ))}
            </dl>
            {model.submitText && <p className={styles.small}>{model.submitText}</p>}
            {model.calculateText && <p className={styles.small}>{model.calculateText}</p>}
          </>
        )}

        <div>
          <p className={styles.groupTitle}>Ölçüm geçmişi · {year}</p>
          <DataTable<HistoryRow>
            caption={`${year} yılında kaydedilmiş ölçümler`}
            captionHidden
            rows={history}
            rowKey={(r) => r.period}
            emptyText="Bu yıl için kaydedilmiş ölçüm yok."
            columns={[
              {
                key: 'period',
                header: 'Dönem',
                cell: (r) => <Link className={styles.textLink} href={links.period(r.period)}>{formatPeriod(r.period)}</Link>,
              },
              { key: 'total', header: 'Tesis toplamı', cell: (r) => r.totalText },
              {
                key: 'state',
                header: 'Misafir ekranı',
                cell: (r) =>
                  r.active ? <StatusPill tone="success">Kullanılıyor</StatusPill> : <StatusPill tone="neutral">Kayıtlı · yayında değil</StatusPill>,
              },
            ]}
          />
          <p className={`${styles.small} ${styles.gapTopSm}`}>
            Her ay için en son kaydedilmiş ölçüm gösterilir. Ayrıntı ve hesap dökümü dönem sayfasındadır.
          </p>
        </div>
      </div>
    </Card>
  );
}
