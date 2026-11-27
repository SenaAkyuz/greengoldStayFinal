import Link from 'next/link';
import { Card, CardHeader, DataTable, Notice, StatusPill } from '../ui';
import { emission, formatDateTimeTr, money, type MeasurementVersion } from '@/lib/connecthub';
import styles from './panel.module.css';

const kgPerNight = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * DÖNEMİN ÖLÇÜM GEÇMİŞİ — kayıtlı tüm hesap sürümleri (salt okuma ucu
 * `GET …/periods/:p/measurements`). "İncele" sürümü dönem sayfasında
 * yeniden hesaplamadan açar (`?surum=<id>`). Önceki sürümler yayına alınamaz.
 * Gerçek sayfa ve önizleme ORTAK kullanır.
 */
export function MeasurementVersionsView({
  versions,
  error,
  viewingId,
  links,
}: {
  versions: MeasurementVersion[] | null;
  error?: string | null;
  /** Ekranda incelenen sürüm (yoksa güncel). */
  viewingId: string | null;
  links: { version: (id: string | null) => string };
}) {
  if (!error && (!versions || versions.length === 0)) return null;
  return (
    <Card as="section" aria-labelledby="versions-title">
      <CardHeader
        id="versions-title"
        title="Ölçüm geçmişi"
        description="Bu dönem için kaydedilmiş hesap sürümleri. Aynı verilerle yeniden hesap yeni sürüm açmaz; her satır farklı bir veri kümesinin sonucudur."
      />
      {error && <Notice tone="warning">{error}</Notice>}
      {versions && versions.length > 0 && (
        <DataTable<MeasurementVersion>
          caption="Kayıtlı ölçüm sürümleri"
          captionHidden
          rows={versions}
          rowKey={(v) => v.id}
          columns={[
            {
              key: 'at',
              header: 'Hesap tarihi',
              primary: true,
              cell: (v) => formatDateTimeTr(v.calculated_at) ?? '—',
            },
            { key: 'total', header: 'Tesis toplamı', cell: (v) => (v.total_tonnes === null ? '—' : emission(v.total_tonnes * 1000)), align: 'end' },
            {
              key: 'night',
              header: 'Oda-gece başına',
              cell: (v) => (v.coefficient_kg === null ? '—' : `${kgPerNight.format(v.coefficient_kg)} kg CO₂e`),
              align: 'end',
              hideOnMobile: true,
            },
            {
              key: 'amount',
              header: 'Gece başı tahmini katkı',
              cell: (v) => (v.amount_per_night === null || !v.currency ? '—' : money(v.amount_per_night, v.currency)),
              align: 'end',
            },
            {
              key: 'state',
              header: 'Durum',
              cell: (v) => (
                <span className={styles.pillRow}>
                  {v.is_current ? <StatusPill tone="success">Güncel</StatusPill> : <StatusPill tone="neutral">Önceki</StatusPill>}
                  {v.is_active && <StatusPill tone="info">Misafir ekranında</StatusPill>}
                </span>
              ),
            },
            {
              key: 'open',
              header: 'İşlem',
              cell: (v) => {
                const viewing = viewingId ? v.id === viewingId : v.is_current;
                return viewing ? (
                  <span className={styles.small}>Görüntüleniyor</span>
                ) : (
                  <Link className={styles.textLink} href={links.version(v.is_current ? null : v.id)}>
                    İncele
                  </Link>
                );
              },
            },
          ]}
        />
      )}
    </Card>
  );
}
