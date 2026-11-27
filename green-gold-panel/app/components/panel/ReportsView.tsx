import Link from 'next/link';
import type { ContributionsSummary, DailyInteraction, DashboardReport } from '@/lib/api';
import { RANGE_LABELS, type RangeKey } from '@/lib/range';
import { formatNumber, formatPercent } from '@/lib/carbon-ui/status';
import { formatRange } from '@/lib/panel/overview';
import { METRIC_GLOSSARY, dayLabel, deltaText, fmtMax, safeRatio } from '@/lib/panel/report';
import {
  Card,
  CardHeader,
  CardStrip,
  ColumnChart,
  EmptyState,
  MetricGrid,
  Notice,
  PageHeader,
  SegmentedTabs,
  StatusPill,
} from '../ui';
import { IconArrow } from './icons';
import styles from './panel.module.css';

const RANGES: RangeKey[] = ['month', '7d', '30d'];

export interface ReportsData {
  report: DashboardReport | null;
  /** Önceki dönem (karşılaştırma); okunamadıysa null. */
  previous: DashboardReport | null;
  daily: DailyInteraction | null;
  contributions: ContributionsSummary | null;
  error?: string | null;
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}

/**
 * RAPORLAR (UX-5.x). Üç kavram AYRI kartlarda: katkı niyeti (widget),
 * gerçek ödeme (rezervasyon sistemi) ve tahmini emisyon. Oranların paydası
 * 0 ise "—"; tarihler Türkçe; grafik ve karşılaştırma yalnız API verisinden.
 */
export function ReportsView({
  data,
  range,
  rangeHref,
  exportHref,
  links,
}: {
  data: ReportsData;
  range: RangeKey;
  rangeHref: (r: RangeKey) => string;
  exportHref: string;
  links: { integration: string; carbon: string; payments: string };
}) {
  const { report, previous, daily, contributions, error } = data;
  const s = report?.summary ?? null;
  const stages = report?.funnel.stages ?? null;
  const p = previous?.funnel.stages ?? null;
  const periodText = formatRange(report?.period);
  const prevText = formatRange(previous?.period);
  const compare = (cur: number | null | undefined, prev: number | null | undefined) => {
    const d = deltaText(cur, prev);
    return d && prevText ? `${d} · önceki dönem ${formatNumber(prev ?? 0)}` : null;
  };
  const selRate = stages ? safeRatio(stages.selected, stages.viewed) : null;
  const e2eRate = stages ? safeRatio(stages.clicked, stages.viewed) : null;
  const hasRealPayments = !!contributions && contributions.contributions_count + contributions.pending_count > 0;

  return (
    <div className={styles.stack}>
      <PageHeader
        size="compact"
        eyebrow="Veri özeti"
        title="Raporlar"
        description={`Misafir etkileşimi, katkı niyeti ve tahmini emisyon${periodText ? ` · ${periodText}` : ''}. Saatler otelin saat dilimine göredir.`}
        actions={
          <a href={exportHref} className={styles.csvLink} download>
            CSV indir <span className={styles.small}>(Excel uyumlu)</span>
          </a>
        }
      />
      <div className={styles.pageBar}>
        <SegmentedTabs
          label="Tarih aralığı"
          activeKey={range}
          items={RANGES.map((r) => ({ key: r, label: RANGE_LABELS[r], href: rangeHref(r) }))}
        />
        {prevText && <span className={styles.small}>Karşılaştırma: {prevText}</span>}
      </div>

      {error && <Notice tone="warning" title="Rapor yüklenemedi">{error}. API sunucusunun çalıştığından emin olun.</Notice>}

      {report && s && stages && (
        <>
          <Card padding="none" as="section" aria-labelledby="eng-title">
            <CardStrip
              title={<span id="eng-title">Misafir etkileşimi · katkı niyeti</span>}
              subtitle="Tekil oturum · widget verisi · ödeme değildir"
            />
            <MetricGrid
              items={[
                { key: 'v', label: 'Görüntülenme', value: formatNumber(stages.viewed), hint: compare(stages.viewed, p?.viewed) ?? 'Misafir ekranını gören oturum' },
                { key: 's', label: 'Katkı seçimi', value: formatNumber(stages.selected), hint: compare(stages.selected, p?.selected) ?? 'Seçeneği işaretleyen oturum' },
                { key: 'c', label: 'Katkı niyeti', value: formatNumber(stages.clicked), hint: compare(stages.clicked, p?.clicked) ?? 'Tercihini kaydeden oturum' },
                { key: 'r', label: 'Seçim oranı', value: formatPercent(selRate, 1), hint: selRate === null ? 'Görüntülenme yok — oran hesaplanmaz' : 'Katkı seçimi / görüntülenme' },
              ]}
            />
            <div className={styles.reportFoot}>
              <span>Uçtan uca oran: <strong>{formatPercent(e2eRate, 1) ?? '—'}</strong> <span className={styles.small}>(katkı niyeti / görüntülenme)</span></span>
              <details className={`${styles.details} ${styles.detailsInline}`}>
                <summary>Bu metrikler ne anlama gelir?</summary>
                <dl className={styles.glossary}>
                  {METRIC_GLOSSARY.map((g) => (
                    <div key={g.term}><dt>{g.term}</dt><dd>{g.text}</dd></div>
                  ))}
                </dl>
              </details>
            </div>
          </Card>

          <Card as="section" aria-labelledby="daily-title">
            <CardHeader
              id="daily-title"
              title="Günlük görüntülenme"
              headingLevel={2}
              description="Her gün misafir ekranını gören tekil oturum sayısı. Koyu sütun: katkı niyeti olan gün."
            />
            {daily && daily.days.some((d) => d.viewed > 0) ? (
              <ColumnChart
                caption="Günlük görüntülenme (tekil oturum)"
                legendLabels={{ on: 'Görüntülenme', current: 'Katkı niyeti olan gün', missing: null }}
                data={daily.days.map((d) => ({
                  key: d.date,
                  label: dayLabel(d.date),
                  value: d.viewed,
                  valueText: `${formatNumber(d.viewed)} görüntülenme · ${formatNumber(d.selected)} seçim · ${formatNumber(d.clicked)} katkı niyeti`,
                  current: d.clicked > 0,
                }))}
              />
            ) : (
              <EmptyState
                illustration="chart"
                headingLevel={3}
                title="Bu dönemde görüntülenme yok"
                description={daily ? 'Widget sitenizde göründükçe günlük seri burada oluşur.' : 'Günlük seri şu anda alınamadı.'}
                actions={<Link className={styles.textLink} href={links.integration}>Entegrasyonu kontrol edin <IconArrow /></Link>}
              />
            )}
          </Card>

          <div className={`${styles.grid3} ${styles.twoUp}`}>
            <Card as="section" aria-labelledby="pay-title">
              <CardHeader
                id="pay-title"
                title="Gerçek ödeme"
                headingLevel={2}
                description="Yalnız rezervasyon sisteminin bildirdiği tahsilatlar. Katkı niyetinden ayrıdır."
                actions={<StatusPill tone="neutral" dot={false}>Faz 2</StatusPill>}
              />
              {hasRealPayments && contributions ? (
                <dl className={styles.facts}>
                  {contributions.totals.map((t) => (
                    <div key={t.currency}><dt>Net tahsil edilen ({t.currency})</dt><dd>{money(t.net_contribution_minor, t.currency)}</dd></div>
                  ))}
                  <div><dt>Tahsilatı bekleyen kayıt</dt><dd>{formatNumber(contributions.pending_count)}</dd></div>
                </dl>
              ) : (
                <p className={styles.small}>
                  Henüz bağlı bir rezervasyon sistemi tahsilat bildirmedi. Widget’taki “katkı niyeti” bir ödeme değildir; gerçek tahsilat rezervasyon sistemi üzerinden yapılır.{' '}
                  <Link className={styles.textLink} href={links.payments}>Tahsilatlar</Link>
                </p>
              )}
            </Card>
            <Card as="section" aria-labelledby="co2-title">
              <CardHeader
                id="co2-title"
                title="Tahmini emisyon"
                headingLevel={2}
                description="Katkı niyeti bildiren konaklamaların tahmini emisyonu."
                actions={<Link className={styles.textLink} href={links.carbon}>Yöntem <IconArrow /></Link>}
              />
              <p className={styles.big}>
                {fmtMax(report.carbon.estimated_co2_kg, 1) ?? '—'}<span>kg CO₂e</span>
              </p>
              <p className={`${styles.small} ${styles.gapTopSm}`}>
                {formatNumber(report.carbon.total_selected_nights) ?? '—'} oda-gece × {fmtMax(report.carbon.co2_per_night_kg) ?? '—'} kg CO₂e/oda-gece.
                {previous ? ` Önceki dönem: ${fmtMax(previous.carbon.estimated_co2_kg, 1)} kg CO₂e.` : ''} Tahmindir; doğrulanmış emisyon beyanı ya da dengeleme değildir.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
