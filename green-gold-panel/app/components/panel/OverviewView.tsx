import Link from 'next/link';
import type {
  ContributionsSummary,
  DashboardReport,
  HotelInfo,
  IntegrationHealthSummary,
} from '@/lib/api';
import { RANGE_LABELS, type RangeKey } from '@/lib/range';
import { formatEmission, formatNumber, formatPercent, formatPeriod } from '@/lib/carbon-ui/status';
import type { ConnectHubStatus, PeriodList } from '@/lib/connecthub/types';
import {
  formatRange,
  integrationBadge,
  overviewHeadline,
  providerLabel,
  type NextAction,
  type OverviewLinks,
} from '@/lib/panel/overview';
import { fmtMax } from '@/lib/panel/report';
import {
  BarList,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  CardStrip,
  EmptyState,
  HeroBand,
  MetricGrid,
  Notice,
  SegmentedTabs,
  StatusPill,
} from '../ui';
import { IconArrow } from './icons';
import styles from './panel.module.css';

const RANGES: RangeKey[] = ['month', '7d', '30d'];

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}
/** Misafir ekranındaki tahminin kaynağı (yalnız API'deki sağlayıcı alanından). */
export function pricingSourceLabel(provider: string | undefined | null): string {
  switch (provider) {
    case 'threepmetrics':
      return 'Ölçüm ortağının onaylı verisi (3P Metrics)';
    case 'hotel-input-demo':
      return 'Otelin girdiği tüketim verisiyle tahmin';
    case 'greenview-demo':
      return 'Bölgesel ortalama (temsili)';
    default:
      return 'Henüz seçilmedi';
  }
}
function dateTime(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
}

export interface OverviewData {
  hotel: HotelInfo | null;
  report: DashboardReport | null;
  contributions: ContributionsSummary | null;
  integrations: IntegrationHealthSummary | null;
  nextActions: NextAction[];
  /** Karbon ölçümü bağlantı durumu (okunamadıysa null). */
  carbonStatus?: ConnectHubStatus | null;
  /** Ölçüm dönemleri — yayındaki ölçümü bulmak için (okunamadıysa null). */
  periods?: PeriodList | null;
  /** Rapor veya otel bilgisi alınamadıysa API iletisi. */
  loadError?: string | null;
}

/**
 * GENEL BAKIŞ — misafir tarafı performansı (karbon ölçümünden ayrı).
 * Yalnız /dashboard/report, /contributions-summary, /hotel ve
 * /integration-health alanları gösterilir; olmayan veri "—".
 * Gerçek sayfa (`/`) ve önizleme (`/onizleme/panel`) bu bileşeni ORTAK
 * kullanır; fark yalnız veri kaynağı ve bağlantı adresleridir.
 */
export function OverviewView({
  data,
  range,
  rangeHref,
  links,
}: {
  data: OverviewData;
  range: RangeKey;
  rangeHref: (range: RangeKey) => string;
  links: OverviewLinks;
}) {
  const { hotel, report, contributions, integrations, nextActions, loadError, carbonStatus, periods } = data;
  const activeMeasurement = periods?.schema_ready
    ? [...periods.periods].reverse().find((e) => e.measurement?.is_active) ?? null
    : null;
  const lastMeasured = periods?.schema_ready
    ? [...periods.periods].reverse().find((e) => e.measurement?.total_tonnes != null) ?? null
    : null;
  const s = report?.summary ?? null;
  const conversion = s && s.views > 0 ? s.selections / s.views : null;
  const headline = overviewHeadline(hotel?.hotel_name, report);
  const periodText = formatRange(report?.period);
  const hasContributions =
    !!contributions && contributions.pending_count + contributions.contributions_count > 0;
  const integration = integrations?.integrations[0] ?? null;

  return (
    <div className={styles.stack}>
      <div className={styles.pageBar}>
        <SegmentedTabs
          label="Tarih aralığı"
          activeKey={range}
          items={RANGES.map((r) => ({ key: r, label: RANGE_LABELS[r], href: rangeHref(r) }))}
        />
        {periodText && <span className={styles.small}>Dönem: {periodText} · otel saat dilimine göre</span>}
      </div>

      {loadError && (
        <Notice tone="warning" title="Veriler yüklenemedi">
          {loadError}. API sunucusunun çalıştığından emin olun.
        </Notice>
      )}

      <HeroBand
        eyebrow="Sürdürülebilir konaklama"
        title={<>{headline.lead} <em>{headline.emphasis}</em></>}
        lead="Misafir ekranındaki gönüllü katkı seçimlerinin özeti. Widget etkileşimine dayanır; ödeme veya tahsilat göstermez."
        actions={
          <>
            <ButtonLink href={links.guestPreview} variant="inverse">Misafir ekranını önizle</ButtonLink>
            <ButtonLink href={links.funnel}>Dönüşüm hunisi</ButtonLink>
          </>
        }
        stats={[
          { key: 'views', label: 'Widget görüntülenme (oturum)', value: s ? formatNumber(s.views) : null },
          { key: 'sel', label: 'Katkı seçimi (oturum)', value: s ? formatNumber(s.selections) : null },
          {
            key: 'co2',
            label: 'Seçilen konaklamaların tahmini emisyonu',
            value: report ? formatNumber(report.carbon.estimated_co2_kg) : null,
            unit: 'kg CO₂e',
          },
        ]}
      />

      {report && s && s.views === 0 && (
        <Card as="section" aria-labelledby="empty-title">
          <EmptyState
            illustration="chart"
            title={<span id="empty-title">Bu dönemde henüz misafir etkileşimi yok</span>}
            headingLevel={2}
            description="Widget sitenize eklenip ilk misafir onu gördüğünde görüntülenme, seçim ve dönüşüm burada görünür. Aşağıdaki adımları tamamlayın."
            actions={<ButtonLink href={links.integration}>Entegrasyon kodunu kullanın</ButtonLink>}
          />
          <ul className={`${styles.checklist} ${styles.gapTop}`}>
            <li className={styles.checkRow}>
              <span>İzinli domain eklendi</span>
              <StatusPill tone={hotel && hotel.allowed_origins.length > 0 ? 'success' : 'neutral'}>
                {hotel && hotel.allowed_origins.length > 0 ? 'Tamam' : 'Bekliyor'}
              </StatusPill>
            </li>
            <li className={styles.checkRow}>
              <span>Otel aktifleştirildi</span>
              <StatusPill tone={hotel?.status === 'active' ? 'success' : 'neutral'}>
                {hotel?.status === 'active' ? 'Tamam' : 'Bekliyor'}
              </StatusPill>
            </li>
            <li className={styles.checkRow}>
              <span>İlk etkileşim</span>
              <StatusPill tone="pending">Bekleniyor</StatusPill>
            </li>
          </ul>
        </Card>
      )}

      {report && s && s.views > 0 && (
        <Card padding="none" as="section" aria-labelledby="engagement-title">
          <CardStrip
            title={<span id="engagement-title">Misafir etkileşimi</span>}
            subtitle="Widget oturumları · seçilen tarih aralığı"
            actions={<Link className={styles.textLink} href={links.funnel}>Tüm dönüşüm hunisi <IconArrow /></Link>}
          />
          <MetricGrid
            items={[
              { key: 'vs', label: 'Seçim oranı', value: formatPercent(conversion, 1), hint: 'Katkı seçimi / görüntülenme' },
              {
                key: 'sb',
                label: 'Butona geçiş',
                value: report.funnel.stages.selected > 0 ? formatPercent(report.funnel.rates.select_to_button_pct / 100, 1) : null,
                hint: 'Katkı ekle / katkı seçimi',
              },
              { key: 'vb', label: 'Uçtan uca dönüşüm', value: formatPercent(report.funnel.rates.view_to_button_pct / 100, 1), hint: 'Katkı ekle / görüntülenme' },
            ]}
          />
          <CardBody className={styles.bodyRule}>
            <div className={styles.reportBody}>
              <div>
                <h2 className={styles.h3}>Katkı hunisi</h2>
                <BarList
                  layout="stacked"
                  label="Widget etkileşim hunisi"
                  rows={[
                    { key: 'v', label: 'Widget görüntülendi', primary: report.funnel.stages.viewed, valueText: formatNumber(report.funnel.stages.viewed) ?? '—' },
                    { key: 's', label: 'Katkı seçeneği işaretlendi', primary: report.funnel.stages.selected, valueText: formatNumber(report.funnel.stages.selected) ?? '—' },
                    { key: 'c', label: 'Katkı ekle butonuna basıldı', primary: report.funnel.stages.clicked, valueText: formatNumber(report.funnel.stages.clicked) ?? '—' },
                  ]}
                />
                <p className={`${styles.small} ${styles.gapTop}`}>Oturum bazlı etkileşim akışı — ödeme veya rezervasyon onayını göstermez.</p>
              </div>
              <div className={styles.highlight}>
                <div>
                  <p className={styles.muted}>Seçilen konaklamaların tahmini emisyonu</p>
                  <p className={styles.big}>{formatNumber(report.carbon.estimated_co2_kg) ?? '—'}<span>kg CO₂e</span></p>
                  <p className={`${styles.small} ${styles.gapTopSm}`}>
                    {formatNumber(report.carbon.total_selected_nights) ?? '—'} oda-gece × {fmtMax(report.carbon.co2_per_night_kg) ?? '—'} kg CO₂e/oda-gece. Tahmindir; doğrulanmış bir emisyon beyanı değildir.
                  </p>
                </div>
                <Link className={styles.textLink} href={links.carbon}>Hesap yöntemi <IconArrow /></Link>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {hotel && (
        <div className={`${styles.grid3} ${styles.twoUp}`}>
          <Card as="section" aria-labelledby="price-title">
            <CardHeader
              id="price-title"
              title="Misafir ekranındaki katkı"
              headingLevel={2}
              description="Misafirin şu anda gördüğü gecelik değerler."
              actions={<Link className={styles.textLink} href={links.guestPreview}>Önizle <IconArrow /></Link>}
            />
            <dl className={styles.facts}>
              <div><dt>Gecelik gönüllü katkı</dt><dd>{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: hotel.currency || 'EUR', maximumFractionDigits: 4 }).format(hotel.amount_per_night)}</dd></div>
              <div><dt>Tahmini emisyon / oda-gece</dt><dd>{hotel.estimated_co2_per_night_kg > 0 ? `${fmtMax(hotel.estimated_co2_per_night_kg)} kg CO₂e` : '—'}</dd></div>
              <div><dt>Tahminin kaynağı</dt><dd>{pricingSourceLabel(hotel.carbon_pricing?.provider)}</dd></div>
              <div>
                <dt>Widget durumu</dt>
                <dd><StatusPill tone={hotel.status === 'active' ? 'success' : 'neutral'}>{hotel.status === 'active' ? 'Yayında' : 'Kapalı'}</StatusPill></dd>
              </div>
            </dl>
          </Card>
          <Card as="section" aria-labelledby="measure-title">
            <CardHeader
              id="measure-title"
              title="Karbon ölçümü"
              headingLevel={2}
              description="Ölçüm ortağının onaylı verileriyle yapılan aylık hesaplar."
              actions={<Link className={styles.textLink} href={links.measurement}>Dönemler <IconArrow /></Link>}
            />
            <dl className={styles.facts}>
              <div>
                <dt>Ölçüm ortağı bağlantısı</dt>
                <dd>
                  {carbonStatus === undefined || carbonStatus === null
                    ? '—'
                    : <StatusPill tone={carbonStatus.link ? 'success' : 'neutral'}>{carbonStatus.link ? 'Bağlı' : 'Bağlı değil'}</StatusPill>}
                </dd>
              </div>
              <div>
                <dt>Misafir ekranındaki ölçüm</dt>
                <dd>{activeMeasurement ? <><StatusPill tone="success">Yayında</StatusPill> {formatPeriod(activeMeasurement.period)}</> : 'Yok'}</dd>
              </div>
              <div>
                <dt>Son hesaplanan dönem</dt>
                <dd>
                  {lastMeasured
                    ? `${formatPeriod(lastMeasured.period)} · ${formatEmission((lastMeasured.measurement?.total_tonnes ?? 0) * 1000).value} ${formatEmission((lastMeasured.measurement?.total_tonnes ?? 0) * 1000).unit}`
                    : 'Henüz yok'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      <div className={hasContributions && contributions ? styles.grid3 : `${styles.grid3} ${styles.twoUp}`}>
        {hasContributions && contributions && (
          <Card as="section" aria-labelledby="res-title">
            <CardHeader
              id="res-title"
              title="Rezervasyon katkıları"
              headingLevel={2}
              description="Rezervasyon sisteminden gelen katkılar; widget sayılarından ayrıdır."
              actions={<Link className={styles.textLink} href={links.payments}>Ayrıntılar <IconArrow /></Link>}
            />
            <dl className={styles.facts}>
              {contributions.totals.map((t) => (
                <div key={`net-${t.currency}`}>
                  <dt>Net tahsil edilen{contributions.totals.length > 1 ? ` (${t.currency})` : ''}</dt>
                  <dd>{money(t.net_contribution_minor, t.currency)}</dd>
                </div>
              ))}
              {contributions.totals.map((t) => (
                <div key={`pending-${t.currency}`}>
                  <dt>Tahsilatı bekleyen{contributions.totals.length > 1 ? ` (${t.currency})` : ''}</dt>
                  <dd>{money(t.pending_total_minor, t.currency)}</dd>
                </div>
              ))}
              <div><dt>Bekleyen katkı</dt><dd>{formatNumber(contributions.pending_count)}</dd></div>
              <div><dt>Tahsil/iade kaydı</dt><dd>{formatNumber(contributions.contributions_count)}</dd></div>
            </dl>
          </Card>
        )}
        <Card as="section" aria-labelledby="int-title">
          <CardHeader
            id="int-title"
            title="Entegrasyon"
            headingLevel={2}
            description="Embed kodu, izinli domainler ve rezervasyon sistemi bildirimleri."
            actions={<Link className={styles.textLink} href={links.integration}>Entegrasyon <IconArrow /></Link>}
          />
          {integration ? (
            <dl className={styles.facts}>
              <div>
                <dt>Sağlayıcı</dt>
                <dd>
                  {providerLabel(integration.provider)}{' '}
                  <StatusPill tone={integrationBadge(integration).tone}>{integrationBadge(integration).label}</StatusPill>
                </dd>
              </div>
              <div><dt>Son bildirim</dt><dd>{dateTime(integration.last_delivery_at) ?? 'Henüz yok'}</dd></div>
              <div>
                <dt>İmza doğrulaması</dt>
                <dd>
                  {integration.last_delivery_signature_verified === null
                    ? '—'
                    : integration.last_delivery_signature_verified
                      ? 'Doğrulandı'
                      : 'Doğrulanmadı'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.small}>
              {integrations ? 'Henüz bağlı bir rezervasyon sistemi yok.' : 'Entegrasyon durumu şu anda alınamadı.'}
            </p>
          )}
        </Card>
        <Card as="section" variant="muted" aria-labelledby="next-title">
          <CardHeader id="next-title" title="Sıradaki işlemler" headingLevel={2} />
          {nextActions.length === 0 && <p className={styles.small}>Şu anda bekleyen bir işlem yok.</p>}
          <ul className={styles.todo}>
            {nextActions.map((a) => (
              <li key={a.key}>
                <Link href={a.href}>
                  <span>{a.label}</span>
                  {a.status ? <StatusPill tone={a.status.tone}>{a.status.label}</StatusPill> : <IconArrow />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
