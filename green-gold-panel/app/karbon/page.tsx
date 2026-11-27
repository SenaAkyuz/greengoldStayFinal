import Link from 'next/link';
import { requireAccessToken } from '@/lib/auth';
import { getHotel, getCarbonSummary } from '@/lib/api';
import { RANGE_LABELS, normalizeRange, type RangeKey } from '@/lib/range';
import { formatNumber } from '@/lib/carbon-ui/status';
import { formatRange } from '@/lib/panel/overview';
import { fmtMax } from '@/lib/panel/report';
import { Card, CardHeader, EmptyState, HeroBand, Notice, SegmentedTabs } from '../components/ui';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { pricingSourceLabel } from '../components/panel/OverviewView';
import { IconArrow } from '../components/panel/icons';
import styles from '../components/panel/panel.module.css';

const RANGES: RangeKey[] = ['month', '7d', '30d'];

/**
 * Karbon etkisi (UX-5.6 / 5.7 / 5.8): katkı niyeti bildiren konaklamaların
 * TAHMİNİ emisyonu, yöntemi ve ağaç-yılı göstergesinin dayanağı. Ödeme ya da
 * doğrulanmış dengeleme göstermez; birim her yerde kg CO₂e.
 */
export default async function CarbonPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const token = await requireAccessToken();
  const sp = await searchParams;
  const range = normalizeRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const [carbonRes, hotelRes] = await Promise.all([getCarbonSummary(token, range), getHotel(token)]);
  const hotel = hotelRes.data;
  const carbon = carbonRes.data;
  const loadError = carbonRes.error ?? hotelRes.error;
  const isEmpty = !!carbon && carbon.contributions_count === 0;
  const periodText = formatRange(carbon?.period);

  return (
    <HotelPanelFrame hotelName={hotel?.hotel_name} city={hotel?.city} title="Karbon etkisi" isDemo={hotel?.role === 'demo_viewer'}>
      <div className={`gg-page gg-page--framed ${styles.stack}`}>
        <div className={styles.pageBar}>
          <SegmentedTabs
            label="Tarih aralığı"
            activeKey={range}
            items={RANGES.map((r) => ({ key: r, label: RANGE_LABELS[r], href: r === 'month' ? '/karbon' : `/karbon?range=${r}` }))}
          />
          {periodText && <span className={styles.small}>Dönem: {periodText}</span>}
        </div>

        {loadError && <Notice tone="warning" title="Veriler yüklenemedi">{loadError}. API sunucusunun çalıştığından emin olun.</Notice>}

        {carbon && (
          <>
            <HeroBand
              eyebrow="Karbon etkisi · tahmini"
              title={<>Seçilen konaklamaların <em>tahmini emisyonu</em></>}
              lead="Gönüllü katkı niyeti bildiren misafirlerin konaklamaları için hesaplanır. Tahsil edilmiş tutarları ya da doğrulanmış bir dengelemeyi göstermez."
              stats={[
                { key: 'co2', label: 'Tahmini emisyon', value: fmtMax(carbon.estimated_co2_kg, 1), unit: 'kg CO₂e' },
                { key: 'n', label: 'Oda-gece (katkı niyeti olan)', value: formatNumber(carbon.total_selected_nights) },
                { key: 'c', label: 'Katkı niyeti (tekil oturum)', value: formatNumber(carbon.contributions_count) },
              ]}
            />

            {isEmpty && (
              <Card>
                <EmptyState
                  illustration="leaf"
                  title="Bu dönemde katkı niyeti yok"
                  description="Misafirler widget’ta tercihlerini kaydettikçe, o konaklamaların tahmini emisyonu burada görünür."
                  actions={<Link className={styles.textLink} href="/misafir-onizleme">Misafir ekranını önizleyin <IconArrow /></Link>}
                />
              </Card>
            )}

            <div className={`${styles.grid3} ${styles.twoUp}`}>
              <Card as="section" aria-labelledby="method-title">
                <CardHeader id="method-title" title="Nasıl hesaplanır?" headingLevel={2} />
                <dl className={styles.facts}>
                  <div><dt>Gecelik tahmini emisyon</dt><dd>{fmtMax(carbon.co2_per_night_kg) ?? '—'} kg CO₂e / oda-gece</dd></div>
                  <div><dt>Katsayının kaynağı</dt><dd>{pricingSourceLabel(hotel?.carbon_pricing?.provider)}</dd></div>
                  <div><dt>Hesap</dt><dd>oda-gece × gecelik katsayı</dd></div>
                </dl>
                <p className={`${styles.small} ${styles.gapTop}`}>
                  Ölçüm ortağı verisine dayanan katsayı yalnız Kapsam 1 ve 2’yi (yakıt, gaz, satın alınan elektrik) içerir. Değerler tahmindir; resmi sonuç ölçüm ortağının envanter raporudur.{' '}
                  <Link className={styles.textLink} href="/karbon-olcumu">Karbon ölçümü</Link>
                </p>
              </Card>
              <Card as="section" aria-labelledby="tree-title">
                <CardHeader
                  id="tree-title"
                  title="Ağaç-yılı eşdeğeri"
                  headingLevel={2}
                  description="Yalnız büyüklük fikri vermek için kaba bir karşılaştırma."
                />
                <p className={styles.big}>≈ {fmtMax(carbon.tree_equivalent, 1) ?? '—'}<span>ağaç-yılı</span></p>
                <details className={styles.details}>
                  <summary>Bu gösterge neye dayanıyor?</summary>
                  <p className={styles.small}>
                    Tahmini emisyon (kg CO₂e) / 21 kg. 21 kg, bir ağacın bir yılda bağladığı CO₂ için sık kullanılan
                    yuvarlak bir ortalamadır; ağacın türüne, yaşına ve iklime göre büyük ölçüde değişir ve belirli bir
                    ölçüme dayanmaz. Ağaç dikildiği, emisyonun dengelendiği ya da nötrlendiği anlamına gelmez; bu nedenle
                    misafir ekranında ve raporlarda gösterilmez.
                  </p>
                </details>
              </Card>
            </div>
          </>
        )}
      </div>
    </HotelPanelFrame>
  );
}
