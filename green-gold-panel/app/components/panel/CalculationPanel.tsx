'use client';
import { useActionState, useMemo, useRef, useState } from 'react';
import { Button, Card, CardHeader, ConfirmDialog, Notice, StatusPill } from '../ui';
import {
  CALC_IDLE,
  GUEST_DISCLOSURE,
  PUBLISH_IDLE,
  explainResult,
  explainStored,
  priceComparison,
  resultSource,
  storedToResult,
  type CalcState,
  type CalculatePeriodResult,
  type PublishState,
  type StoredMeasurement,
} from '@/lib/connecthub';
import { CalculationResultView } from './CalculationResultView';
import styles from './panel.module.css';

type CalcAction = (prev: CalcState, form: FormData) => Promise<CalcState>;
type PublishAction = (prev: PublishState, form: FormData) => Promise<PublishState>;

export interface CurrentPrice {
  amount_per_night: number;
  currency: string;
  estimated_co2_per_night_kg: number;
}

/**
 * 4 · HESAP ve 5 · MİSAFİR EKRANI.
 *
 * "Hesapla" açık bir eylemdir (sayfa açılışında sağlayıcıya istek atılmaz).
 * Yayın düğmesi yalnız `publishGate` izin verirse etkindir; sunucu eylemi
 * hesabı yeniden çalıştırıp kapıyı tekrar kontrol eder, backend de ayrıca
 * 409 ile korur. Mevcut widget fiyatı yalnız başarılı aktivasyonla değişir.
 * `calcAction` yoksa (önizleme) `previewResult` gösterilir, hiçbir şey
 * kaydedilmez.
 *
 * Kaydedilmiş ölçüm (`stored`, salt okuma ucu) sayfa açılışında gösterilir;
 * yeni hesap yapılınca ekrandaki sonucun kaynağı rozetle ayrılır:
 * "Kaydedilmiş ölçüm" ↔ "Yalnız önizleme · kaydedilmedi".
 */
export function CalculationPanel({
  period,
  periodLabel,
  occupied,
  current,
  disabledReason,
  hasStoredMeasurement,
  stored = null,
  storedError = null,
  calcAction,
  publishAction,
  previewResult,
}: {
  period: string;
  periodLabel: string;
  occupied: number | null;
  current: CurrentPrice | null;
  disabledReason?: string | null;
  hasStoredMeasurement: boolean;
  /** Dönemin kaydedilmiş ölçümü (GET …/measurement); yoksa null. */
  stored?: StoredMeasurement | null;
  storedError?: string | null;
  calcAction?: CalcAction;
  publishAction?: PublishAction;
  previewResult?: CalculatePeriodResult;
}) {
  const [calc, runCalc, calculating] = useActionState<CalcState, FormData>(
    calcAction ?? (async () => (previewResult ? { status: 'result', result: previewResult } : { status: 'error', message: 'Önizleme sonucu yok.' })),
    CALC_IDLE,
  );
  const [pub, runPublish, publishing] = useActionState<PublishState, FormData>(
    publishAction ?? (async () => ({ status: 'error', message: 'Önizlemede yayın yapılmaz.' })),
    PUBLISH_IDLE,
  );
  const [confirm, setConfirm] = useState(false);
  const publishRef = useRef<HTMLFormElement>(null);
  const fresh = calc.status === 'result' && calc.result ? calc.result : null;
  const fromStored = !fresh && !!stored;
  const shown = fresh ?? (stored ? storedToResult(stored, period) : null);
  const model = useMemo(
    () =>
      fresh
        ? explainResult(fresh, periodLabel, occupied)
        : stored
          ? explainStored(stored, period, periodLabel, occupied)
          : null,
    [fresh, stored, period, periodLabel, occupied],
  );
  const source = shown ? resultSource(shown, stored, fromStored) : null;
  const pricing = shown && (shown.status === 'calculated' || shown.status === 'preview_only') ? shown.pricing : null;
  const cmp = priceComparison(current, pricing);
  // UX-3.10: bu ölçüm zaten misafir ekranındaysa yeniden aktivasyon istenmez.
  const isLive =
    (!!stored?.is_active && !!model?.measurementId && stored.id === model.measurementId) ||
    pub.status === 'success';
  const canPublish = !!model?.gate.allowed && !!model.measurementId && !!publishAction && !isLive;

  return (
    <Card as="section" aria-labelledby="calc-title">
      <CardHeader
        id="calc-title"
        title="5 · Hesap ve misafir ekranı"
        description="Ölçüm ortağımızdaki onaylı kayıtlar ve envanter faktörleriyle hesaplanır. Hesaplamak misafir ekranını değiştirmez."
        actions={
          <form action={runCalc}>
            <Button type="submit" disabled={!!disabledReason || calculating} loading={calculating} loadingLabel="Hesaplanıyor…">
              {model ? 'Yeniden hesapla' : 'Hesapla'}
            </Button>
          </form>
        }
      />
      <div className={styles.stack}>
        {disabledReason && <Notice tone="info">{disabledReason}</Notice>}
        {!model && !disabledReason && calc.status !== 'error' && (
          <p className={styles.small}>
            {hasStoredMeasurement
              ? 'Bu dönem için kaydedilmiş bir hesap var. Güncel sonucu ve ayrıntıları görmek için hesaplayın.'
              : 'Kayıtlar onaylandıktan sonra hesaplayın. Onay bekleyen kayıt varsa hesap yapılmaz ve hangi kayıtların beklediği gösterilir.'}
          </p>
        )}
        {calc.status === 'error' && !calculating && <Notice tone="danger" title="Hesaplanamadı">{calc.message}</Notice>}
        {storedError && !model && <Notice tone="warning">{storedError}</Notice>}
        {source && !calculating && (
          <div className={styles.sourceRow}>
            <StatusPill tone={source.tone}>{source.label}</StatusPill>
            <span className={styles.small}>{source.detail}</span>
          </div>
        )}
        {source?.staleText && !calculating && <Notice tone="warning">{source.staleText}</Notice>}
        {model && !calculating && <CalculationResultView model={model} />}

        {model && pricing && !calculating && (
          <div className={styles.publishBox}>
            <div className={styles.inlineRow}>
              <p className={styles.groupTitle} style={{ margin: 0 }}>Misafir ekranı</p>
              {isLive && <StatusPill tone="success">Yayında</StatusPill>}
            </div>
            {isLive ? (
              <div className={`${styles.priceCard} ${styles.priceCardLive}`}>
                <span className={styles.priceLabel}>Şu an misafirde · bu ölçüm</span>
                <strong>{cmp.next ?? cmp.current ?? '—'}</strong>
              </div>
            ) : (
              <div className={styles.compare}>
                <div className={styles.priceCard}>
                  <span className={styles.priceLabel}>Şu an misafirde</span>
                  <strong>{cmp.current ?? '—'}</strong>
                </div>
                <div className={`${styles.priceCard} ${model.gate.allowed ? styles.priceCardNext : styles.priceCardBlocked}`}>
                  <span className={styles.priceLabel}>
                    {model.gate.allowed ? <>Yayına alınırsa <StatusPill tone="info" dot={false}>Yeni</StatusPill></> : 'Bu hesaba göre · yayınlanamaz'}
                  </span>
                  <strong>{cmp.next ?? '—'}</strong>
                  {model.gate.allowed && !cmp.changes && <span className={styles.small}>Gecelik katkı değişmiyor.</span>}
                </div>
              </div>
            )}
            {model.gateText && <Notice tone="info">{model.gateText}</Notice>}
            {model.gate.allowed && (
              <details className={styles.details}>
                <summary>Misafir ne görür?</summary>
                <p className={styles.small}>{GUEST_DISCLOSURE}</p>
              </details>
            )}
            {pub.status !== 'idle' && !publishing && (
              <Notice tone={pub.status === 'success' ? 'success' : 'danger'}>{pub.message}</Notice>
            )}
            <form ref={publishRef} action={runPublish} className={styles.publishRow}>
              <input type="hidden" name="measurementId" value={model.measurementId ?? ''} />
              <p className={`${styles.small} ${styles.grow}`}>
                {isLive
                  ? 'Bu ölçüm misafir ekranında; yeniden yayına almanız gerekmez. Yeni bir dönem hesaplandığında buradan güncelleyebilirsiniz.'
                  : 'Mevcut tahmini katkı, yalnız bu düğmeyle ve tüm kontroller geçerse değişir.'}
              </p>
              <Button
                type="button"
                disabled={!canPublish || publishing}
                loading={publishing}
                loadingLabel="Yayına alınıyor…"
                onClick={() => setConfirm(true)}
              >
                {isLive ? 'Yayında' : 'Misafir ekranına al'}
              </Button>
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Misafir ekranı güncellensin mi?"
        confirmLabel="Yayına al"
        cancelLabel="Vazgeç"
        busy={publishing}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          publishRef.current?.requestSubmit();
        }}
      >
        <dl className={styles.facts}>
          <div><dt>Şu an</dt><dd>{cmp.current ?? '—'}</dd></div>
          <div><dt>Yeni</dt><dd>{cmp.next ?? '—'}</dd></div>
        </dl>
        <p>{periodLabel} ölçümüne dayanır; misafir yalnız tahmini emisyonu ve gönüllü katkı tutarını görür.</p>
      </ConfirmDialog>
    </Card>
  );
}
