'use client';
import { useState, useTransition } from 'react';
import type { CarbonProviderStatus, HotelInfo } from '@/lib/api';
import { startProviderMeasurement } from '../ayarlar/actions';

/**
 * 3pmetrics ölçüm akışı — OTEL YÖNETİCİSİNE görünen ekran.
 *
 * DİL KURALI: bu ekran otel müşterisine bakar, geliştirme ekibine değil.
 * Sağlayıcı sözleşmesinin hangi maddelerini beklediğimiz, migration numarası,
 * "Faz 1/Faz 2" gibi proje içi terimler BURAYA YAZILMAZ — onların yeri
 * 3PMETRICS_ENTEGRASYON_RAPORU.md.
 *
 * DÜRÜSTLÜK KURALI (korunur): entegrasyon devreye alınmadan ekran "bağlı"
 * görünmez ve ölçüm sonucu için doğrulanmış dengeleme/sertifika iddiası
 * kurulmaz. Aynı ilke SynXis entegrasyonunda da geçerli.
 */

const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm text-[#17372d] focus:outline-none focus:ring-2 focus:ring-emerald-200';

export function CarbonProviderPanel({
  hotel,
  status,
  disabled,
}: {
  hotel: HotelInfo;
  status: CarbonProviderStatus | null;
  disabled: boolean;
}) {
  const [period, setPeriod] = useState({
    start: '2025-01-01',
    end: '2025-12-31',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const ready = status?.provider_configured === true;
  const isDemo = hotel.role === 'demo_viewer';
  const fmt = (n: number) =>
    n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

  const start = () =>
    startTransition(async () => {
      setMessage('');
      setError('');
      const response = await startProviderMeasurement({
        period_start: period.start,
        period_end: period.end,
      });
      if (response.error || !response.data) {
        setError(response.error ?? 'Ölçüm oturumu açılamadı.');
        return;
      }
      setMessage(
        `Ölçüm formu hazır. Bağlantı ${new Date(response.data.expires_at).toLocaleString('tr-TR')} tarihine kadar geçerli.`,
      );
      window.open(response.data.form_url, '_blank', 'noopener,noreferrer');
    });

  return (
    <section className="gg-card overflow-hidden">
      <header className="border-b border-emerald-100 bg-emerald-50/60 p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Karbon ölçümü
        </span>
        <h2 className="mt-2 text-xl font-semibold text-[#17372d]">
          3pmetrics ölçümü
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Veri girişi ve emisyon ölçümü 3pmetrics üzerinde yapılır; GreenGold
          Stay sonucu oda-gece katsayısına ve gecelik katkıya çevirir.
        </p>
      </header>

      <div className="space-y-6 p-6">
        {(!ready || (status !== null && !status.schema_ready)) && (
          <div className="rounded-xl border border-[#d8e1da] bg-[#f6f9f6] p-4">
            <p className="text-sm font-semibold text-[#17372d]">
              3pmetrics bağlantısı hazırlanıyor
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Ölçüm entegrasyonu devreye alındığında bu ekrandan yeni ölçüm
              başlatabilir veya mevcut 3pmetrics hesabınızı bağlayabilirsiniz.
              Devreye alındığında sizi bilgilendireceğiz.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              O zamana kadar karbon hesabınızı{' '}
              <strong className="font-medium text-[#17372d]">
                Otele özgü hesap
              </strong>{' '}
              veya{' '}
              <strong className="font-medium text-[#17372d]">
                Bölgesel tahmin
              </strong>{' '}
              sekmesinden oluşturabilirsiniz; widget fiyatınız oradan güncellenir.
            </p>
          </div>
        )}

        {/* Yeni ölçüm başlat */}
        <div>
          <h3 className="text-sm font-semibold text-[#17372d]">
            Yeni ölçüm başlat
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Ölçüm dönemini seçtiğinizde tesisinize özel bir form bağlantısı
            açılır. Formu tamamladıktan sonra sonuç panele otomatik işlenir;
            sayfayı kapatmanız sonucu etkilemez.
          </p>
          <fieldset
            disabled={disabled || pending || !ready || isDemo}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <label className="block text-sm font-medium text-neutral-700">
              Dönem başlangıcı
              <input
                className={inputClass}
                type="date"
                value={period.start}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, start: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Dönem bitişi
              <input
                className={inputClass}
                type="date"
                value={period.end}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, end: e.target.value }))
                }
              />
            </label>
          </fieldset>
          <button
            type="button"
            onClick={start}
            disabled={disabled || pending || !ready || isDemo}
            className="mt-4 rounded-lg bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Bağlantı hazırlanıyor…' : 'Ölçüme başla'}
          </button>
          {isDemo && ready && (
            <p className="mt-2 text-xs text-neutral-500">
              Demo hesabı ölçüm başlatamaz.
            </p>
          )}
        </div>

        {/* Mevcut hesabı bağla */}
        <div className="border-t border-neutral-100 pt-6">
          <h3 className="text-sm font-semibold text-[#17372d]">
            Mevcut 3pmetrics hesabınız
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            3pmetrics&apos;te ölçümünüz zaten varsa formu yeniden doldurmanız
            gerekmez. Erişim izni verdikten sonra tesisinizi seçersiniz; geçmiş
            ölçümleriniz ve raporlarınız panele aktarılır. 3pmetrics şifreniz
            GreenGold Stay tarafından istenmez.
          </p>
          {status?.link ? (
            <div className="mt-4 rounded-xl border border-emerald-100 p-4 text-sm">
              <p className="font-medium text-[#17372d]">
                {status.link.external_property_name ??
                  status.link.external_property_id}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Durum: {status.link.status} · Ortam: {status.link.environment}
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled
              title="Hesap bağlama yakında kullanıma açılacak."
              className="mt-4 rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-500 disabled:opacity-60"
            >
              Mevcut 3pmetrics hesabımı bağla
            </button>
          )}
        </div>

        {/* İçeri aktarılmış ölçümler */}
        {status && status.measurements_count > 0 && (
          <div className="border-t border-neutral-100 pt-6">
            <h3 className="text-sm font-semibold text-[#17372d]">
              İçeri aktarılan ölçümler ({status.measurements_count})
            </h3>
            {status.active_measurement && (
              <div className="mt-3 rounded-xl border border-emerald-100 p-4">
                <p className="text-xs text-neutral-500">
                  Widget fiyatını belirleyen ölçüm
                </p>
                <p className="mt-1 text-sm font-medium text-[#17372d]">
                  {status.active_measurement.period_start} —{' '}
                  {status.active_measurement.period_end}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {status.active_measurement.room_night_kg === null
                    ? 'Oda-gece katsayısı henüz türetilmedi.'
                    : `${fmt(status.active_measurement.room_night_kg)} kgCO₂e / oda-gece`}
                </p>
                <p className="mt-1 font-mono text-xs text-neutral-400">
                  {status.active_measurement.external_measurement_id} · v
                  {status.active_measurement.external_version}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p aria-live="polite" className="text-sm text-emerald-800">
            {message}
          </p>
        )}

        {/* Doğruluk ibaresi KORUNUR: ölçüm ile kredi itfası ayrı süreçlerdir,
            ölçüm kaydı dengeleme sertifikası yerine geçmez. Profesyonel dille
            yazılır, ama iddia büyütülmez. */}
        <p className="text-xs text-neutral-500">
          Ölçüm sonucu, tesisinizin dönemsel emisyon hesabını belgeler. Karbon
          kredisi itfası ve dengeleme sertifikası ayrı süreçlerdir.
        </p>
      </div>
    </section>
  );
}
