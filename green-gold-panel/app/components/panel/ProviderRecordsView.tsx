import { Card, CardHeader, DataTable, Notice, StatusPill } from '../ui';
import { uomLabel, type ProviderRecord, type ProviderRecordOrigin } from '@/lib/connecthub';
import styles from './panel.module.css';

const QTY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 });

const ORIGIN: Record<ProviderRecordOrigin, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  panel: { label: 'Bu panelden', tone: 'success' },
  green_gold: { label: 'Green Gold aracıyla gönderildi (panel dışı)', tone: 'info' },
  provider: { label: 'Ölçüm ortağında doğrudan girildi', tone: 'neutral' },
};

/**
 * Ölçüm ortağındaki ONAYLI dönem kayıtları (salt okuma). Hesap bu
 * kayıtlarla yapılır — panelden gönderilmemiş (ör. kurulum testinde
 * gönderilmiş ya da doğrudan ölçüm ortağında girilmiş) kayıtlar da görünür.
 * `records === null` ve hata yoksa bölüm gösterilmez (okuma anahtarı yok).
 */
export function ProviderRecordsView({
  periodLabel,
  records,
  error,
}: {
  periodLabel: string;
  records: ProviderRecord[] | null;
  error?: string | null;
}) {
  if (records === null && !error) return null;
  const rows = records ?? [];
  return (
    <Card as="section" aria-labelledby="provider-title">
      <CardHeader
        id="provider-title"
        title="4 · Ölçüm ortağındaki onaylı kayıtlar"
        description="Hesapta yalnız bu kayıtlar kullanılır. Kaynak sütunu kaydın nereden geldiğini gösterir; panelden göndermedikleriniz de burada görünür. Aynı kalemi panelden gönderirseniz kayıt güncellenir (yeni kayıt açılmaz) ve yeniden onaya düşer."
      />
      {error ? (
        <Notice tone="warning" title="Onaylı kayıtlar alınamadı">
          {error} Hesaplama sırasında kayıtlar yeniden okunur.
        </Notice>
      ) : (
        <>
        <div className={styles.gapBottom}><StatusPill tone="success" dot={false}>Hesapta kullanılan kayıtlar</StatusPill></div>
        <DataTable<ProviderRecord & { key: string }>
          caption={`${periodLabel} ölçüm ortağındaki onaylı kayıtlar`}
          captionHidden
          rows={rows.map((r, i) => ({ ...r, key: `${r.item_id}:${r.period}:${i}` }))}
          rowKey={(r) => r.key}
          emptyText="Bu ay için ölçüm ortağında henüz onaylı kayıt yok."
          columns={[
            {
              key: 'name',
              header: 'Kalem',
              primary: true,
              cell: (r) => (
                <>
                  {r.item_name ?? 'Kalem'}
                  {r.period.length > 7 && <span className={styles.recordNote}>Günlük kayıt · {r.period}</span>}
                </>
              ),
            },
            { key: 'qty', header: 'Miktar', align: 'end', cell: (r) => `${QTY.format(r.quantity)} ${r.uom ? uomLabel(r.uom) : ''}`.trim() },
            {
              key: 'origin',
              header: 'Kaynak',
              cell: (r) => (
                <StatusPill tone={ORIGIN[r.origin].tone} dot={false}>
                  {ORIGIN[r.origin].label}
                </StatusPill>
              ),
            },
          ]}
        />
        </>
      )}
    </Card>
  );
}
