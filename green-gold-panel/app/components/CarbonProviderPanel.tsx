'use client';
import { useState, useTransition } from 'react';
import type { CarbonProviderStatus, HotelInfo } from '@/lib/api';
import { startProviderMeasurement } from '../ayarlar/actions';

/**
 * 3pmetrics ölçüm akışı (Faz 1 + Faz 2).
 *
 * DÜRÜSTLÜK KURALI: sağlayıcı sözleşmesi (API dokümanı, kimlik doğrulama
 * yöntemi, webhook dokümanı, örnek JSON, test erişimi) elimize geçmeden bu ekran
 * "bağlı" görünmez. `provider_configured=false` iken butonlar pasiftir ve eksik
 * olanın NE olduğu açıkça yazılır — aynı desen SynXis entegrasyonunda da
 * kullanılıyor (bkz. Entegrasyon ekranı).
 */

const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm text-[#17372d] focus:outline-none focus:ring-2 focus:ring-emerald-200';

const REQUIRED_FROM_PROVIDER = [
  'API dokümanı ve kimlik doğrulama yöntemi',
  'Ölçüm oturumu oluşturma ucu (tesis kimliği, ölçüm kimliği, dönem, dönüş adresi → süreli form bağlantısı)',
  'Form verilerini alma ucu (alan tanımı, birim, dönem; oda sayısı, doluluk, dolu oda-gece/misafir-gece, tüketimler)',
  'Hesaplama sonucu ucu (toplam emisyon, birim, dönem, kapsam, yöntem/sürüm, sonuç durumu, rapor bağlantısı)',
  'Webhook dokümanı (form gönderildi / ölçüm tamamlandı / kayıt güncellendi) ve imza şeması',
  'Faz 2: yetkili tesisleri listeleme, tesisin ölçümlerini listeleme, ölçüm detayı, güncellenen kayıtları sorgulama',
  'Sandbox/test erişimi ve örnek form + sonuç JSON’ları',
];

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
        {!ready && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Sağlayıcı bağlantısı henüz açılmadı.
            </p>
            <p className="mt-2 text-sm text-amber-800">
              3pmetrics tarafından paylaşılması beklenenler:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
              {REQUIRED_FROM_PROVIDER.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-700">
              Bu bilgiler gelmeden akış &quot;bağlı&quot; gösterilmez; uydurulmuş
              bir uç noktaya bağlanmaz.
            </p>
          </div>
        )}

        {status && !status.schema_ready && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            Ölçüm kayıt tabloları henüz oluşturulmadı (migration{' '}
            <code className="font-mono text-xs">0015</code> uygulanmalı). Bu
            adıma kadar ölçüm geçmişi saklanamaz.
          </div>
        )}

        {/* Faz 1 — Ölçüme başla */}
        <div>
          <h3 className="text-sm font-semibold text-[#17372d]">
            Faz 1 · Yeni ölçüm
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Dönem bilgisiyle otele özel bir form bağlantısı açılır. Sonuç
            sunucular arasında aktarılır — otel sayfayı kapatsa bile ölçüm bize
            ulaşır.
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

        {/* Faz 2 — mevcut hesabı bağla */}
        <div className="border-t border-neutral-100 pt-6">
          <h3 className="text-sm font-semibold text-[#17372d]">
            Faz 2 · Mevcut 3pmetrics hesabı
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Halihazırda ölçümü olan oteller formu yeniden doldurmaz. Yetki
            verildikten sonra tesis seçilir, geçmiş ölçümler içeri aktarılır.
            3pmetrics şifresi GreenGold Stay tarafından İSTENMEZ.
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
              title={
                ready
                  ? 'Yetkilendirme akışı hazırlanıyor.'
                  : 'Sağlayıcı yetkilendirme yöntemi bekleniyor.'
              }
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

        <p className="text-xs text-neutral-500">
          Ölçüm sonucu bir hesaplama kaydıdır; doğrulanmış karbon dengelemesi
          veya kredi itfası değildir.
        </p>
      </div>
    </section>
  );
}
