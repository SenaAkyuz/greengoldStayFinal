'use client';
import { useActionState, useState } from 'react';
import { Button, Card, Field, Notice, TextInput } from '../ui';
import { ENTRY_IDLE, planSubmission, type EntryState } from '@/lib/connecthub';
import { formatNumber } from '@/lib/carbon-ui/status';
import styles from './panel.module.css';

type EntryAction = (prev: EntryState, form: FormData) => Promise<EntryState>;

/**
 * DÖNEM — 1 · Doluluk (tüketim gönderiminden AYRI form ve eylem).
 *
 * Yalnız yerel `carbon_periods` satırına yazılır; ölçüm ortağına hiçbir şey
 * gönderilmez ve 3pmetrics anahtarı gerekmez. Değer hesap adımında
 * (oda-gece başına emisyon) kullanılır. `action` yoksa (önizleme) yalnız
 * doğrulama çalışır.
 */
export function OccupancyForm({
  occupancy,
  maxOccupancy,
  disabled = false,
  disabledReason,
  action,
}: {
  occupancy: number | null;
  maxOccupancy?: number;
  disabled?: boolean;
  disabledReason?: string | null;
  action?: EntryAction;
}) {
  const [value, setValue] = useState(occupancy !== null ? String(occupancy) : '');
  const previewAction: EntryAction = async () => {
    const plan = planSubmission({ drafts: [], items: [], existing: [], occupancy: value, maxOccupancy, now: new Date() });
    if (!value.trim()) return { status: 'error', message: 'Dolu oda-gece sayısını girin.' };
    if (plan.errors.length) return { status: 'error', message: plan.errors[0].message };
    return { status: 'info', message: 'Önizleme: gerçek ekranda bu değer kaydedilir. Ölçüm ortağına bir şey gönderilmez.' };
  };
  const [state, formAction, pending] = useActionState<EntryState, FormData>(action ?? previewAction, ENTRY_IDLE);
  const fieldError = state.status === 'error' ? state.issues?.find((i) => i.item_id === 'occupancy')?.message ?? state.message : undefined;

  return (
    <Card as="section" aria-labelledby="occ-title" className={styles.inlineCard}>
      <div>
        <h2 id="occ-title" className={styles.h3}>1 · Doluluk</h2>
        <p className={styles.small}>
          Bu ay satılan (dolu) oda-gece sayısı. PMS’inizin aylık doluluk raporunda bulunur. Yalnız panelde saklanır; ölçüm ortağına gönderilmez.
        </p>
      </div>
      <form action={formAction} noValidate className={styles.occForm}>
        <fieldset disabled={disabled} className={styles.fieldset}>
          <div className={styles.occRow}>
            <Field
              id="occupancy"
              label="Dolu oda-gece"
              hint={maxOccupancy ? `En fazla ${formatNumber(maxOccupancy)} (oda × gün).` : 'Tesis profilindeki oda sayısıyla kontrol edilir.'}
              error={fieldError}
            >
              {(c) => (
                <TextInput {...c} name="occupancy" numeric inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
              )}
            </Field>
            <Button type="submit" variant="secondary" disabled={disabled || pending} loading={pending} loadingLabel="Kaydediliyor…">
              Doluluğu kaydet
            </Button>
          </div>
        </fieldset>
        {disabled && disabledReason && <Notice tone="info">{disabledReason}</Notice>}
        {state.status !== 'idle' && state.status !== 'error' && !pending && (
          <div aria-live="polite">
            <Notice tone={state.status === 'confirm' ? 'info' : state.status}>{state.message}</Notice>
          </div>
        )}
      </form>
    </Card>
  );
}
