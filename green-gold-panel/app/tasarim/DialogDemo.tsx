'use client';
import { useState } from 'react';
import { Button, ConfirmDialog } from '../components/ui';

/** Galeri için onay penceresi örneği (hiçbir işlem yapmaz). */
export function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Onay penceresini aç
      </Button>
      <ConfirmDialog
        open={open}
        title="Bu işlemi onaylıyor musunuz?"
        confirmLabel="Onayla"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setOpen(false);
          }, 900);
        }}
      >
        Örnek açıklama metni. Geri alınması zor işlemlerden önce kullanıcıya
        ne olacağı sade bir dille anlatılır.
      </ConfirmDialog>
    </>
  );
}
