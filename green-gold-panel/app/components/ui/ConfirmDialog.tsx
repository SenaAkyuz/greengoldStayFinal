'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

/**
 * Geri alınması zor işlemler için onay penceresi (yerel <dialog>: odak
 * tuzağı, Esc ile kapanma ve arka plan erişilmezliği tarayıcıdan gelir).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={styles.inner}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children && (
          <div id={bodyId} className={styles.body}>
            {children}
          </div>
        )}
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            loadingLabel="İşleniyor…"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
