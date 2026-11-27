'use client';
import { useRef, useState } from 'react';
import { signOut } from '../../actions';
import { ConfirmDialog } from '../ui';
import styles from './panel.module.css';

/**
 * Oturum kapatma (UX-2.7). Panelde "hesap değiştirmek" = bu tarayıcıdaki
 * oturumu kapatıp başka e-postayla giriş yapmak; aynı anda iki hesap açık
 * tutulmaz. Bunu tek tıkla sürpriz yapmamak için önce onay penceresi açılır.
 */
export function SignOutControl({ variant }: { variant: 'top' | 'side' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const top = variant === 'top';
  return (
    <>
      <form ref={form} action={signOut} className={top ? styles.hideXs : undefined}>
        <button
          type="button"
          className={top ? styles.topAction : styles.sideAction}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {top ? 'Hesap değiştir' : '↪ Güvenli çıkış'}
        </button>
      </form>
      <ConfirmDialog
        open={open}
        busy={busy}
        title={top ? 'Hesap değiştirmek için çıkış yapılır' : 'Oturum kapatılsın mı?'}
        confirmLabel={top ? 'Çıkış yap ve girişe git' : 'Çıkış yap'}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setBusy(true);
          form.current?.requestSubmit();
        }}
      >
        <p>
          Bu tarayıcıdaki oturumunuz kapatılır ve giriş sayfasına yönlendirilirsiniz.
          {top && ' Diğer otel hesabının e-posta adresi ve şifresiyle giriş yapın.'}
        </p>
        <p>Kaydetmediğiniz form değişiklikleri kaybolur.</p>
      </ConfirmDialog>
    </>
  );
}
