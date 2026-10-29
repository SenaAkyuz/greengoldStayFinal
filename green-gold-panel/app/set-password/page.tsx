'use client';

import { PasswordSetupForm } from '../components/PasswordSetupForm';

// Davet akışı: yeni yönetici ilk şifresini belirler. Recovery (/reset-password)
// akışından AYRI — davet linki tek kullanımlık ve hassastır.
export default function SetPasswordPage() {
  return (
    <PasswordSetupForm
      copy={{
        kicker: 'Hesap etkinleştirme',
        title: 'Hesabınızı etkinleştirin',
        intro: 'Panele erişmek için bir şifre belirleyin (en az 8 karakter).',
        invalidLink:
          'Davet bağlantısı geçersiz veya süresi dolmuş. Bu bağlantı tek kullanımlıktır — operatörden yeni bir davet linki isteyin.',
        invalidLinkHref: '/login',
        invalidLinkLabel: 'Girişe dön',
        updateError:
          'Şifre belirlenemedi. Davet linkinin süresi dolmuş olabilir; operatörden yeni link isteyin.',
        passwordLabel: 'Şifre',
        confirmLabel: 'Şifre (tekrar)',
        submitLabel: 'Şifreyi belirle ve gir',
        submittingLabel: 'Kaydediliyor…',
        successHref: '/login?welcome=1',
      }}
    />
  );
}
