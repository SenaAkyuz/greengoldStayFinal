import Link from 'next/link';
import {
  ButtonLink, Card, CardHeader, ColumnChart, Notice, PageHeader, SegmentedTabs, StatusPill,
} from '../ui';
import {
  canCalculate,
  canSubmit,
  lastCompletedPeriod,
  periodEditability,
  periodUiStatus,
  readinessText,
  isLinkMissing,
  type ConnectHubStatus,
  type PeriodList,
  type PeriodListEntry,
} from '@/lib/connecthub';
import { formatEmission, formatNumber, formatPeriod, monthShort, periodStatusView } from '@/lib/carbon-ui/status';
import styles from './panel.module.css';

export interface MeasurementViewProps {
  year: number;
  years: number[];
  status: ConnectHubStatus | null;
  statusError?: string | null;
  periods: PeriodList | null;
  periodsError?: string | null;
  now: Date;
  links: { period: (p: string) => string; year: (y: number) => string; profile: string };
}

const tonnes = (t: number | null | undefined) => {
  const e = formatEmission(t === null || t === undefined ? null : t * 1000);
  return e.value ? `${e.value} ${e.unit}` : null;
};

/**
 * KARBON ÖLÇÜMÜ — 12 aylık dönem listesi (yalnız yerel veriden; sağlayıcı
 * durumu uydurulmaz). Gerçek sayfa ve önizleme ORTAK kullanır.
 */
export function MeasurementView(p: MeasurementViewProps) {
  const submit = p.status ? canSubmit(p.status) : null;
  const calc = p.status ? canCalculate(p.status) : null;
  const notReady = submit && !submit.ready ? readinessText(submit) : null;
  const calcNote = !notReady && calc && !calc.ready ? readinessText(calc) : null;
  const entries = p.periods?.periods ?? [];
  const attention = entries.filter((e) => e.needs_attention);
  const last = lastCompletedPeriod(p.now);
  const lastEntry = entries.find((e) => e.period === last);
  const measured = entries.filter((e) => e.measurement?.total_tonnes != null);

  return (
    <div className={styles.stack}>
      <PageHeader
        size="compact"
        eyebrow="Karbon ölçümü"
        title="Tesisinizin karbon ölçümü"
        description="Aylık tüketim ve doluluk bilgileriniz, ölçüm ortağımızın onaylı verileriyle oda-gece başına tahmini ayak izine dönüşür."
        actions={
          <>
            <ButtonLink href={p.links.profile} variant="secondary">Tesis profili</ButtonLink>
            {lastEntry && <ButtonLink href={p.links.period(last)}>{formatPeriod(last)} verileri</ButtonLink>}
          </>
        }
      />

      {p.statusError && <Notice tone="warning" title="Bağlantı durumu alınamadı">{p.statusError}</Notice>}
      {notReady && (
        <Notice tone="info" title={isLinkMissing(submit) ? 'Ölçüm ortağı bağlantısı yok' : undefined}>
          {notReady}
          {isLinkMissing(submit) && ' Bu sırada doluluğu kaydedebilir ve tesis profilini doldurabilirsiniz; destek için Green Gold ekibine yazın.'}
        </Notice>
      )}
      {calcNote && (
        <Notice tone="info" actions={calc && !calc.ready && calc.reason === 'profile' ? <ButtonLink href={p.links.profile} size="sm" variant="secondary">Profili doldur</ButtonLink> : undefined}>
          {calcNote}
        </Notice>
      )}
      {attention.length > 0 && (
        <Notice tone="warning" title="İşlem bekleyen kayıtlar var">
          {attention.map((e, i) => (
            <span key={e.period}>
              {i > 0 && ', '}
              <Link className={styles.textLink} href={p.links.period(e.period)}>{formatPeriod(e.period)}</Link>
            </span>
          ))}
          : reddedilen veya sonucu belirsiz kayıtları kontrol edin.
        </Notice>
      )}
      {p.periodsError && <Notice tone="danger" title="Dönemler alınamadı">{p.periodsError}</Notice>}
      {p.periods && !p.periods.schema_ready && (
        <Notice tone="info">Karbon ölçümü bu ortamda henüz etkin değil.</Notice>
      )}

      <div className={styles.pageBar}>
        <SegmentedTabs
          label="Yıl"
          activeKey={String(p.year)}
          items={p.years.map((y) => ({ key: String(y), label: String(y), href: p.links.year(y) }))}
        />
        <span className={styles.small}>Durumlar Green Gold kayıtlarından; onay bilgisi hesap sırasında ölçüm ortağından alınır.</span>
      </div>

      {p.periods?.schema_ready && (
        <Card as="section" aria-labelledby="months-title">
          <CardHeader id="months-title" title={`${p.year} dönemleri`} description="Tamamlanmış ayları açıp veri girin." />
          <ul className={styles.months}>
            {entries.map((e) => <MonthCard key={e.period} entry={e} p={p} current={e.period === last} />)}
          </ul>
        </Card>
      )}

      {measured.length > 0 && (
        <Card as="section" aria-labelledby="trend-title">
          <CardHeader id="trend-title" title={`${p.year} aylık hesaplanan emisyon`} description="Hesaplanmış aylar · tesis toplamı · tahmini" />
          <ColumnChart
            caption={`${p.year} aylık tahmini tesis emisyonu`}
            data={entries.map((e) => ({
              key: e.period,
              label: monthShort(e.period),
              value: e.measurement?.total_tonnes ?? null,
              valueText: tonnes(e.measurement?.total_tonnes) ?? 'Hesap yok',
              current: e.period === last,
            }))}
          />
        </Card>
      )}
    </div>
  );
}

function MonthCard({ entry, p, current }: { entry: PeriodListEntry; p: MeasurementViewProps; current: boolean }) {
  // Misafir ekranındaki ölçüm bu dönemdense durum her zaman "Yayında" (UX-3.10 ile tutarlı).
  const view = entry.measurement?.is_active ? periodStatusView('published') : periodStatusView(periodUiStatus(entry));
  const open = periodEditability(entry.period, p.now) === 'open';
  const sent = entry.records.accepted + entry.records.rejected + entry.records.outcome_unknown + entry.records.sending;
  const body = (
    <>
      <span className={styles.monthName}>{formatPeriod(entry.period)}</span>
      <span className={styles.inlineRow}>
        <StatusPill tone={view.tone}>{view.label}</StatusPill>
        {entry.needs_attention && <StatusPill tone="danger">Kontrol gerekli</StatusPill>}
      </span>
      <span className={styles.small}>
        {entry.occupied_room_nights ? `${formatNumber(entry.occupied_room_nights)} oda-gece` : open ? 'Doluluk girilmedi' : view.help}
        {sent > 0 ? ` · ${sent} kalem` : ''}
      </span>
      {entry.measurement?.total_tonnes != null && <span className={styles.monthValue}>{tonnes(entry.measurement.total_tonnes)}</span>}
    </>
  );
  return (
    <li>
      {open ? (
        <Link href={p.links.period(entry.period)} className={`${styles.month} ${current ? styles.monthCurrent : ''}`}>{body}</Link>
      ) : (
        <div className={`${styles.month} ${styles.monthMuted}`} aria-disabled="true">{body}</div>
      )}
    </li>
  );
}
