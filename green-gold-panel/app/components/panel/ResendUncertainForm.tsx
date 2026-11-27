'use client';
import { useActionState } from 'react';
import { Button, Notice } from '../ui';
import { ENTRY_IDLE, type EntryState } from '@/lib/connecthub';
import styles from './panel.module.css';

/**
 * Sonucu belirsiz / takılmış kayıtları KAYITLI değerleriyle yeniden gönderir.
 * Sabit kayıt kimliği sayesinde güvenlidir (mükerrer oluşmaz). `action`
 * yoksa (önizleme) gönderim yapılmaz.
 */
export function ResendUncertainForm({
  count,
  disabled = false,
  action,
}: {
  count: number;
  disabled?: boolean;
  action?: (prev: EntryState, form: FormData) => Promise<EntryState>;
}) {
  const [state, formAction, pending] = useActionState<EntryState, FormData>(
    action ?? (async () => ({ status: 'info', message: 'Önizleme: gerçek ekranda belirsiz kayıtlar aynı kimlikle yeniden gönderilir.' })),
    ENTRY_IDLE,
  );
  return (
    <form action={formAction} className={styles.resendForm}>
      <Notice
        tone="warning"
        title={`${count} kaydın sonucu belirsiz`}
        actions={
          <Button type="submit" size="sm" variant="secondary" disabled={disabled || pending} loading={pending} loadingLabel="Gönderiliyor…">
            Güvenle yeniden gönder
          </Button>
        }
      >
        Bağlantı yanıt vermeden kesildi. Kayıtlı değerler aynı kimlikle yeniden gönderilir; mükerrer kayıt oluşmaz.
      </Notice>
      {state.status !== 'idle' && !pending && (
        <div className={styles.gapTopSm} aria-live="polite">
          <Notice tone={state.status === 'error' ? 'danger' : state.status === 'confirm' ? 'warning' : state.status}>{state.message}</Notice>
        </div>
      )}
    </form>
  );
}
