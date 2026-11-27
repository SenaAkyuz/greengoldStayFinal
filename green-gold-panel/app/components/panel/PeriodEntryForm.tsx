'use client';
import { useActionState, useMemo, useRef, useState } from 'react';
import {
  Button, Card, CardHeader, ConfirmDialog, ControlGroup, Field, Notice, Select, StatusPill, TextInput,
} from '../ui';
import {
  ENTRY_IDLE,
  FIELD,
  blockedReasonText,
  factorPendingNote,
  entryStateFromOutcome,
  groupItems,
  planSubmission,
  sameUom,
  recordDisplayStatus,
  uomLabel,
  type ActivityRecord,
  type ConnectHubItem,
  type EntryState,
  type ProviderRecord,
} from '@/lib/connecthub';
import { recordStatusView } from '@/lib/carbon-ui/status';
import styles from './panel.module.css';

type EntryAction = (prev: EntryState, form: FormData) => Promise<EntryState>;

interface Row {
  quantity: string;
  uom: string;
  note: string;
}

const RESOLUTION_TEXT: Record<string, string> = { monthly: 'Aylık', daily: 'Günlük', yearly: 'Yıllık' };
const QTY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 });

/**
 * Formun başlangıç değerleri. Öncelik: Green Gold'un yerel kaydı → ölçüm
 * ortağındaki tek onaylı kayıt (UX-3.1: birim de oradan, ör. doğalgazda m³)
 * → boş + kalemin ilk birimi. Onaylı değer önceden doldurulduğu için
 * değiştirilmeden gönderilirse plan onu "değişmedi" sayar (UX-3.2).
 */
export function initialRows(
  items: ConnectHubItem[],
  records: ActivityRecord[],
  providerRecords?: ProviderRecord[] | null,
): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const item of items) {
    const rec = records.find((r) => r.item_id === item.id);
    const approved = (providerRecords ?? []).filter((r) => r.item_id === item.id);
    const single = !rec && approved.length === 1 ? approved[0] : null;
    const approvedUom = single ? item.uoms.find((u) => sameUom(u, single.uom)) : undefined;
    out[item.id] = {
      // tr-TR ondalık virgül (ör. 0,5); okuma kuralı noktayı da kabul eder.
      quantity: rec ? String(rec.quantity).replace('.', ',') : single ? String(single.quantity).replace('.', ',') : '',
      uom: rec && item.uoms.includes(rec.uom) ? rec.uom : approvedUom ?? item.uoms[0] ?? '',
      note: rec?.note ?? '',
    };
  }
  return out;
}

/**
 * DÖNEM VERİ GİRİŞİ — 2 · Tüketim (ölçüm ortağına gönderim).
 * Doluluk ayrı formdadır (OccupancyForm) ve bu gönderime girmez.
 *
 * Başlıklar ve ölçü birimleri tamamen API'den (`GET …/items`) gelir: otele
 * özel başlık/birim olduğu gibi gösterilir ve gönderilir; sabit liste yok.
 * Gönderimden önce aynı `planSubmission` kuralı tarayıcıda çalışır (anında
 * hata), sunucu yine baştan doğrular. Kabul edilmiş kaydı değiştirmek açık
 * onay ister. `action` yoksa (önizleme) hiçbir şey gönderilmez.
 */
export function PeriodEntryForm({
  period,
  items,
  records,
  providerRecords,
  disabled = false,
  disabledReason,
  action,
}: {
  period: string;
  items: ConnectHubItem[];
  records: ActivityRecord[];
  /** Ölçüm ortağındaki onaylı kayıtlar (yerelde olmayanları kalemde göstermek için). */
  providerRecords?: ProviderRecord[] | null;
  disabled?: boolean;
  disabledReason?: string | null;
  action?: EntryAction;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(() => initialRows(items, records, providerRecords));
  const [local, setLocal] = useState<EntryState | null>(null);
  const [dismissedConfirm, setDismissedConfirm] = useState<EntryState | null>(null);

  const previewAction: EntryAction = async (_prev, form) => {
    // Önizleme: yalnız gerçek plan kuralı çalışır, hiçbir şey gönderilmez.
    const plan = planSubmission({
      drafts: items.filter((i) => i.writable).map((i) => ({ item_id: i.id, quantity: rows[i.id].quantity, uom: rows[i.id].uom, note: rows[i.id].note })),
      items, existing: records, approved: providerRecords, now: new Date(),
    });
    if (plan.errors.length) return entryStateFromOutcome({ kind: 'invalid', plan });
    if (plan.needs_confirmation && form.get('confirmCorrections') !== '1') return entryStateFromOutcome({ kind: 'needs_confirmation', plan });
    if (!plan.lines.length) return entryStateFromOutcome({ kind: 'nothing_to_send', plan });
    return { status: 'info', message: `Önizleme: ${plan.lines.length} kalem gönderilecekti. Gerçek ekranda bu adımda ölçüm ortağına gönderilir.` };
  };
  const [state, formAction, pending] = useActionState<EntryState, FormData>(action ?? previewAction, ENTRY_IDLE);
  const shown = local ?? state;
  const issues = useMemo(
    () => new Map((shown.status === 'error' ? shown.issues ?? [] : []).map((i) => [i.item_id, i.message])),
    [shown],
  );
  const groups = useMemo(() => groupItems(items), [items]);
  const writable = items.filter((i) => i.writable);
  const now = new Date();
  const confirmOpen = state.status === 'confirm' && dismissedConfirm !== state && !pending;
  const set = (id: string, k: keyof Row) => (e: { target: { value: string } }) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], [k]: e.target.value } }));

  return (
    <form
      ref={formRef}
      noValidate
      action={formAction}
      onSubmit={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        const plan = planSubmission({
          drafts: writable.map((i) => ({ item_id: i.id, ...rows[i.id] })),
          items, existing: records, approved: providerRecords, now: new Date(),
        });
        if (plan.errors.length) {
          e.preventDefault();
          setLocal(entryStateFromOutcome({ kind: 'invalid', plan }));
          return;
        }
        // Düzeltme varsa sunucu aynı kararı verir; onay penceresi onun yanıtıyla açılır.
        setLocal(null);
      }}
    >
      <input ref={confirmRef} type="hidden" name="confirmCorrections" defaultValue="0" />
      {disabled && disabledReason && (
        <div className={styles.gapBottom}>
          <Notice tone="info">{disabledReason}</Notice>
        </div>
      )}
      <fieldset disabled={disabled} className={styles.fieldset}>
        <div className={styles.stack}>
          <Card as="section" aria-labelledby="use-title">
            <CardHeader
              id="use-title"
              title="2 · Tüketim"
              description="Tesisiniz için ölçüm ortağında açık kalemler. Faturadaki aylık toplamı ve birimini girin; kullanmadığınız kalemi boş bırakın. Gönderilen değerler ölçüm ortağında onaylandıktan sonra hesaba katılır."
            />
            {items.length === 0 && <p className={styles.small}>Tesisiniz için açık kalem yok. Kalemler ölçüm ortağımızda tanımlandığında burada görünür.</p>}
            {groups.map((group) => (
              <div key={group.key}>
                <p className={styles.groupTitle}>{group.title}</p>
                <ul className={styles.items}>
                  {group.items.map((item) => {
                    const rec = records.find((r) => r.item_id === item.id);
                    const recView = rec ? recordStatusView(recordDisplayStatus(rec, now)) : null;
                    // Yerelde kayıt yok ama ölçüm ortağında onaylı kayıt var (ör. kurulum testi).
                    const approvedElsewhere = !rec
                      ? (providerRecords ?? []).filter((r) => r.item_id === item.id && r.origin !== 'panel')
                      : [];
                    const row = rows[item.id];
                    const qId = `q-${item.id}`;
                    return (
                      <li key={item.id} className={styles.item}>
                        <div>
                          <p className={styles.itemName}>{item.name}</p>
                          <div className={styles.itemMeta}>
                            <StatusPill tone="neutral" dot={false}>{item.scope ? `Kapsam ${item.scope}` : 'Kapsam bilinmiyor'}</StatusPill>
                            {item.resolution_kind && <StatusPill tone="neutral" dot={false}>{RESOLUTION_TEXT[item.resolution_kind]}</StatusPill>}
                            {item.factor_status === 'unknown' && <StatusPill tone="pending" dot={false}>Faktör sonra kontrol edilir</StatusPill>}
                            {item.factor_status === 'factor_unavailable' && <StatusPill tone="warning" dot={false}>Faktör bekleniyor</StatusPill>}
                            {recView && <StatusPill tone={recView.tone}>{recView.label}</StatusPill>}
                            {approvedElsewhere.length > 0 && (
                              <StatusPill tone="success" dot={false}>
                                Ölçüm ortağında onaylı: {approvedElsewhere.map((r) => `${QTY.format(r.quantity)} ${r.uom ? uomLabel(r.uom) : ''}`.trim()).join(' + ')}
                              </StatusPill>
                            )}
                          </div>
                        </div>
                        {!item.writable ? (
                          <p className={styles.disabledNote}>{item.blocked_reason ? blockedReasonText(item.blocked_reason) : 'Bu kalem girilemez.'}</p>
                        ) : (
                          <div className={styles.entryCol}>
                            <Field id={qId} label={`${item.name} miktarı`} hint={approvedElsewhere.length === 1 ? 'Ölçüm ortağındaki onaylı değer · değiştirmezseniz gönderilmez' : 'Faturadaki aylık toplam'} error={issues.get(item.id)} optionalLabel className={styles.srLabel}>
                              {(c) => (
                                <ControlGroup>
                                  <TextInput {...c} name={FIELD.quantity(item.id)} numeric inputMode="decimal" placeholder="Miktar" value={row.quantity} onChange={set(item.id, 'quantity')} />
                                  {item.uoms.length > 1 ? (
                                    <Select aria-label={`${item.name} ölçü birimi`} name={FIELD.uom(item.id)} value={row.uom} onChange={set(item.id, 'uom')}>
                                      {item.uoms.map((u) => <option key={u} value={u}>{uomLabel(u)}</option>)}
                                    </Select>
                                  ) : (
                                    <>
                                      <span className={styles.uomFixed}>{uomLabel(row.uom)}</span>
                                      <input type="hidden" name={FIELD.uom(item.id)} value={row.uom} />
                                    </>
                                  )}
                                </ControlGroup>
                              )}
                            </Field>
                            <TextInput
                              aria-label={`${item.name} notu (isteğe bağlı)`}
                              name={FIELD.note(item.id)}
                              placeholder="Not (isteğe bağlı, ör. fatura no)"
                              maxLength={500}
                              value={row.note}
                              onChange={set(item.id, 'note')}
                              className={styles.noteInput}
                            />
                            {item.factor_status === 'factor_unavailable' && (
                              <p className={styles.disabledNote}>{factorPendingNote(item.factor_reason)}</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {shown.status !== 'idle' && shown.status !== 'confirm' && !pending && (
              <div className={styles.gapTop} aria-live="polite">
                <Notice tone={shown.status === 'error' ? 'danger' : shown.status} title={shown.message}>
                  {shown.skippedNote}
                </Notice>
              </div>
            )}
            <div className={styles.actionsRow}>
              <p className={`${styles.small} ${styles.grow}`}>
                Yalnız yeni veya değişen değerler gönderilir; onaylı değerle aynı olanlar atlanır. Onaylı bir değeri değiştirmek kaydı günceller (mükerrer oluşmaz) ama ölçüm ortağında <strong>yeniden onay</strong> gerektirir.
              </p>
              <Button type="submit" disabled={disabled || pending} loading={pending} loadingLabel="Gönderiliyor…">
                Ölçüm ortağına gönder
              </Button>
            </div>
          </Card>
        </div>
      </fieldset>
      <ConfirmDialog
        open={confirmOpen}
        title="Onaylı değerler değişiyor"
        confirmLabel="Gönder ve yeniden onaya sun"
        cancelLabel="Vazgeç"
        busy={pending}
        onCancel={() => setDismissedConfirm(state)}
        onConfirm={() => {
          setDismissedConfirm(state);
          if (confirmRef.current) confirmRef.current.value = '1';
          formRef.current?.requestSubmit();
          if (confirmRef.current) {
            const ref = confirmRef.current;
            setTimeout(() => (ref.value = '0'), 0);
          }
        }}
      >
        <p>{state.message}</p>
        <ul className={styles.correctionList}>
          {(state.corrections ?? []).map((c) => (
            <li key={c.item_id}>
              <strong>{c.item_name}</strong>: {c.from} → {c.to}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
      <input type="hidden" name="period" value={period} />
    </form>
  );
}
