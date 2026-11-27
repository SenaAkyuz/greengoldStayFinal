import Link from 'next/link';
import {
  ButtonLink, Card, CardHeader, DataTable, EmptyState, Notice, PageHeader, StatusPill, Stepper,
  type StepItem,
} from '../ui';
import {
  canCalculate,
  canSaveOccupancy,
  canSubmit,
  isSafeRetry,
  maxOccupancyFor,
  readinessText,
  isLinkMissing,
  LINK_MISSING_SHORT,
  recordDisplayStatus,
  recordNote,
  uomLabel,
  type ActivityRecord,
  type ConnectHubItem,
  type ConnectHubStatus,
  type CalcState,
  type CalculatePeriodResult,
  type MeasurementVersion,
  type StoredMeasurement,
  type EntryState,
  type PublishState,
  type PeriodDetail,
  type PeriodEditability,
  type ProviderRecord,
} from '@/lib/connecthub';
import { formatNumber, formatPeriod, recordStatusView } from '@/lib/carbon-ui/status';
import { PeriodEntryForm } from './PeriodEntryForm';
import { OccupancyForm } from './OccupancyForm';
import { ProviderRecordsView } from './ProviderRecordsView';
import { ResendUncertainForm } from './ResendUncertainForm';
import { CalculationPanel, type CurrentPrice } from './CalculationPanel';
import { MeasurementVersionsView } from './MeasurementVersionsView';
import { IconArrow } from './icons';
import styles from './panel.module.css';

type EntryAction = (prev: EntryState, form: FormData) => Promise<EntryState>;

const QTY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 });

export interface PeriodViewProps {
  period: string;
  editability: PeriodEditability;
  status: ConnectHubStatus | null;
  statusError?: string | null;
  detail: PeriodDetail | null;
  detailError?: string | null;
  items: ConnectHubItem[] | null;
  itemsError?: string | null;
  isDemo: boolean;
  now: Date;
  links: { list: string; profile: string };
  /** Misafir ekranındaki mevcut (aktif) tahmini katkı — `GET /dashboard/hotel`. */
  current: CurrentPrice | null;
  /** Ölçüm ortağındaki onaylı dönem kayıtları (salt okuma); okunamadıysa null. */
  providerRecords?: ProviderRecord[] | null;
  providerRecordsError?: string | null;
  actions?: {
    /** Yalnız doluluk (yerel; ölçüm ortağına istek yok). */
    occupancy: EntryAction;
    /** Tüketim kayıtlarını ölçüm ortağına gönderir. */
    submit: EntryAction;
    resend: EntryAction;
    calculate: (prev: CalcState, form: FormData) => Promise<CalcState>;
    publish: (prev: PublishState, form: FormData) => Promise<PublishState>;
  };
  /** Yalnız önizleme: "Hesapla"nın göstereceği örnek sonuç. */
  previewResult?: CalculatePeriodResult;
  /** Dönemin kaydedilmiş ölçümü (salt okuma ucu) ya da incelenen önceki sürüm; yoksa null. */
  stored?: StoredMeasurement | null;
  storedError?: string | null;
  /** Dönemin kayıtlı sürümleri (ölçüm geçmişi). */
  versions?: MeasurementVersion[] | null;
  versionsError?: string | null;
  /** İncelenen önceki sürüm (`?surum=`); yoksa güncel. */
  viewingVersionId?: string | null;
  versionHref?: (id: string | null) => string;
}

function steps(
  detail: PeriodDetail | null,
  providerRecords: ProviderRecord[] | null | undefined,
  stored: StoredMeasurement | null | undefined,
  items: ConnectHubItem[] | null,
  now: Date,
): StepItem[] {
  // Onaylı kaydı olan ama faktörü ölçüm ortağında paylaşılamayan kalemler: hesap bunlarda durur.
  const waitingFactor = [
    ...new Set(
      (providerRecords ?? [])
        .map((r) => items?.find((i) => i.id === r.item_id))
        .filter((i): i is ConnectHubItem => !!i && i.factor_status === 'factor_unavailable')
        .map((i) => i.name),
    ),
  ];
  const records = detail?.records ?? [];
  const occ = detail?.occupied_room_nights ?? null;
  const approved = providerRecords?.length ?? 0;
  const accepted = records.filter((r) => r.status === 'accepted').length;
  const problems = records.filter((r) => r.status === 'rejected' || isSafeRetry(r, now)).length;
  const hasUse = records.length > 0 || approved > 0;
  return [
    { key: 'occ', label: 'Doluluk', state: occ ? 'done' : 'current', status: occ ? `${formatNumber(occ)} oda-gece` : 'Girilmedi' },
    {
      key: 'use',
      label: 'Tüketim',
      state: hasUse ? 'done' : occ ? 'current' : 'upcoming',
      status: records.length
        ? `${records.length} kalem gönderildi`
        : approved
          ? `${approved} kayıt ölçüm ortağında`
          : 'Girilmedi',
    },
    {
      key: 'ok',
      label: 'Onay',
      state: problems ? 'blocked' : approved ? 'done' : accepted ? 'current' : 'upcoming',
      status: problems
        ? `${problems} kayıt işlem bekliyor`
        : approved
          ? `${approved} onaylı kayıt`
          : accepted
            ? 'Ölçüm ortağında onay bekleniyor'
            : '—',
    },
    detail?.measurement_id
      ? { key: 'calc', label: 'Hesap', state: 'done', status: 'Kaydedilmiş hesap var' }
      : waitingFactor.length
        ? { key: 'calc', label: 'Hesap', state: 'blocked', status: `Faktör bekleniyor: ${waitingFactor.join(', ')}` }
        : { key: 'calc', label: 'Hesap', state: approved && occ ? 'current' : 'upcoming', status: approved && occ ? 'Hesaplanabilir' : 'Kayıtlar onaylanınca' },
    stored?.is_active
      ? { key: 'pub', label: 'Misafir ekranı', state: 'done', status: 'Bu dönemin ölçümü yayında' }
      : { key: 'pub', label: 'Misafir ekranı', state: 'upcoming', status: 'Hesap sonrası yayına alınır' },
  ];
}

/**
 * DÖNEM SAYFASI — doluluk, dinamik tüketim kalemleri, gönderim ve kayıt
 * durumları. Gerçek sayfa ve önizleme ORTAK kullanır (`actions` yoksa
 * önizleme: hiçbir şey gönderilmez). Hesap sonucu ve yayın sonraki adımdadır.
 */
export function PeriodView(p: PeriodViewProps) {
  const title = `${formatPeriod(p.period)} verileri`;
  const header = (
    <PageHeader
      size="compact"
      eyebrow={<><Link href={p.links.list} className={styles.crumb}>Karbon ölçümü</Link> / Dönem</>}
      title={title}
      description="Doluluğu kaydedin, aylık tüketimi ölçüm ortağına gönderin. Onaylanan kayıtlarla dönemi hesaplayıp sonucu misafir ekranına alabilirsiniz."
      actions={<ButtonLink href={p.links.list} variant="secondary">Tüm dönemler</ButtonLink>}
    />
  );

  if (p.editability !== 'open') {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title={p.editability === 'future' ? 'Bu ay henüz başlamadı' : 'Ay sürüyor'}
            description="Veriler ay tamamlandıktan sonra girilebilir; faturalar ve doluluk raporu ay sonunda kesinleşir."
            actions={<ButtonLink href={p.links.list}>Dönemlere dön</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  const occReady = p.status ? canSaveOccupancy(p.status) : null;
  const occDisabled = p.isDemo || !p.detail || !!(occReady && !occReady.ready);
  const occDisabledReason = p.isDemo
    ? 'Demo hesabında veri kaydedilemez.'
    : occReady && !occReady.ready
      ? readinessText(occReady)
      : null;
  const readiness = p.status ? canSubmit(p.status) : null;
  const linkMissing = isLinkMissing(readiness);
  const notReady = readiness && !readiness.ready ? (linkMissing ? LINK_MISSING_SHORT : readinessText(readiness)) : null;
  const records = p.detail?.records ?? [];
  const uncertain = records.filter((r) => isSafeRetry(r, p.now));
  const formDisabled = p.isDemo || !!notReady || !p.detail || !p.items;
  const disabledReason = p.isDemo ? 'Demo hesabında veri gönderilemez.' : notReady;
  const calcReady = p.status ? canCalculate(p.status) : null;
  const calcDisabled = p.isDemo
    ? 'Demo hesabında hesaplama yapılamaz.'
    : !p.status
      ? 'Bağlantı durumu alınamadığı için hesaplanamıyor.'
      : calcReady && !calcReady.ready
        ? isLinkMissing(calcReady) ? LINK_MISSING_SHORT : readinessText(calcReady)
        : null;
  const itemName = (r: ActivityRecord) =>
    p.items?.find((i) => i.id === r.item_id)?.name ?? r.item_name ?? 'Kalem';

  return (
    <>
      {header}
      <div className={styles.stack}>
        {p.statusError && <Notice tone="warning" title="Bağlantı durumu alınamadı">{p.statusError}</Notice>}
        {p.detailError && <Notice tone="danger" title="Dönem bilgisi alınamadı">{p.detailError}</Notice>}
        {p.itemsError && (
          <Notice tone="warning" title="Kalemler alınamadı">
            {p.itemsError} Kalemler gelmeden tüketim girilemez; gönderilmiş kayıtlar aşağıda.
          </Notice>
        )}
        {linkMissing && readiness && !readiness.ready && (
          <Notice tone="info" title="Ölçüm ortağı bağlantısı yok">
            {readinessText(readiness)} Bu sırada doluluğu kaydedebilir ve tesis profilini doldurabilirsiniz; destek için Green Gold ekibine yazın.
          </Notice>
        )}
        {p.status?.schema_ready && !p.status.profile && (
          <Notice tone="info" actions={<ButtonLink href={p.links.profile} size="sm" variant="secondary">Tesis profili</ButtonLink>}>
            Doluluk üst sınırı ve hesaplama için tesis profilini doldurun.
          </Notice>
        )}

        <Card className={styles.stepperCard}>
          <Stepper label="Dönem adımları" steps={steps(p.detail, p.providerRecords, p.stored, p.items, p.now)} />
        </Card>

        {p.detail && (
          <OccupancyForm
            occupancy={p.detail.occupied_room_nights}
            maxOccupancy={maxOccupancyFor(p.period, p.status?.profile?.rooms)}
            disabled={occDisabled}
            disabledReason={occDisabledReason}
            action={p.actions?.occupancy}
          />
        )}

        {p.detail && p.items && (
          <PeriodEntryForm
            period={p.period}
            items={p.items}
            records={records}
            providerRecords={p.providerRecords}
            disabled={formDisabled}
            disabledReason={disabledReason}
            action={p.actions?.submit}
          />
        )}

        <Card as="section" aria-labelledby="sent-title">
          <CardHeader
            id="sent-title"
            title="3 · Panelden gönderdikleriniz"
            description="Bu panelden ölçüm ortağına iletilen kayıtlar ve iletim durumu. “Alındı”, kaydın ulaştığını gösterir; onay ölçüm ortağında ayrıca yapılır ve onaylı kayıtlar 4. bölümde listelenir."
          />
          {uncertain.length > 0 && (
            <ResendUncertainForm count={uncertain.length} disabled={formDisabled} action={p.actions?.resend} />
          )}
          <DataTable<ActivityRecord>
            caption={`${formatPeriod(p.period)} gönderilen kayıtlar`}
            captionHidden
            rows={records}
            rowKey={(r) => r.id}
            emptyText="Bu ay için henüz kayıt gönderilmedi."
            columns={[
              {
                key: 'name',
                header: 'Kalem',
                primary: true,
                cell: (r) => {
                  const note = recordNote(r, p.now);
                  return (
                    <>
                      {itemName(r)}
                      {note && (
                        <span className={`${styles.recordNote} ${r.status === 'rejected' ? styles.recordNoteDanger : ''}`}>{note}</span>
                      )}
                    </>
                  );
                },
              },
              { key: 'qty', header: 'Miktar', align: 'end', cell: (r) => `${QTY.format(r.quantity)} ${uomLabel(r.uom)}` },
              {
                key: 'st',
                header: 'Durum',
                cell: (r) => {
                  const v = recordStatusView(recordDisplayStatus(r, p.now));
                  return <StatusPill tone={v.tone}>{v.label}</StatusPill>;
                },
              },
            ]}
          />
          <p className={`${styles.small} ${styles.gapTop}`}>
            Hesapta kullanılan onaylı kayıtlar bir sonraki bölümdedir. <Link className={styles.textLink} href={p.links.list}>Dönemlere dön <IconArrow /></Link>
          </p>
        </Card>

        <ProviderRecordsView
          periodLabel={formatPeriod(p.period)}
          records={p.providerRecords ?? null}
          error={p.providerRecordsError ?? null}
        />

        <CalculationPanel
          key={p.stored?.id ?? 'none'}
          period={p.period}
          periodLabel={formatPeriod(p.period)}
          occupied={p.detail?.occupied_room_nights ?? null}
          current={p.current}
          hasStoredMeasurement={!!p.detail?.measurement_id}
          disabledReason={calcDisabled}
          calcAction={p.actions?.calculate}
          publishAction={p.actions?.publish}
          previewResult={p.previewResult}
          stored={p.stored ?? null}
          storedError={p.storedError ?? null}
        />

        {p.versionHref && (
          <MeasurementVersionsView
            versions={p.versions ?? null}
            error={p.versionsError ?? null}
            viewingId={p.viewingVersionId ?? null}
            links={{ version: p.versionHref }}
          />
        )}
      </div>
    </>
  );
}
