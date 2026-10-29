'use client';

import { PasswordSetupForm } from '../components/PasswordSetupForm';

// Recovery akışı: "şifremi unuttum" bağlantısıyla gelen kullanıcı yeni şifre belirler.
export default function ResetPasswordPage() {
  return (
    <PasswordSetupForm
      copy={{
        kicker: 'Şifre kurtarma',
        title: 'Yeni şifre belirle',
        intro: 'Hesabın için yeni bir şifre gir (en az 8 karakter).',
        invalidLink:
          'Bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir sıfırlama bağlantısı iste.',
        invalidLinkHref: '/forgot-password',
        invalidLinkLabel: 'Yeni bağlantı iste',
        updateError:
          'Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir, yeniden isteyin.',
        passwordLabel: 'Yeni şifre',
        confirmLabel: 'Yeni şifre (tekrar)',
        submitLabel: 'Şifreyi güncelle',
        submittingLabel: 'Güncelleniyor…',
        successHref: '/login?reset=success',
      }}
    />
  );
}
