'use client';
import { useState, useTransition } from 'react';
import type {
  CarbonProviderStatus,
  HotelCarbonInput,
  HotelInfo,
  ImportMeasurementResult,
  ProviderImportInput,
} from '@/lib/api';
import {
  activateProviderMeasurement,
  importProviderMeasurement,
} from '../ayarlar/actions';
import { CarbonDataEntry } from './CarbonDataEntry';

/**
 * 3pmetrics ölçümü — OTEL YÖNETİCİSİNE görünen ekran.
 *
 * Akış:
 *   1. Otel emisyon verisini (fatura/sayaç miktarları) BU panelden girer;
 *      kayıt 3pmetrics'e yazılır, 3pmetrics emisyonu hesaplar
 *      (CarbonDataEntry). 3pmetrics arayüzünden girilen veri de sayılır.
 *   2. Dönemi + 3pmetrics'te OLMAYAN otel verisini (oda, dolu oda-gece,
 *      alanlar) girer, "3pmetrics sonucunu getir" der (Carbon Summary).
 *   3. Sonucu görür; onaylarsa "Widget fiyatına uygula" der.
 *
 * DİL KURALI: bu ekran otel müşterisine bakar, geliştirme ekibine değil.
 * Endpoint adı, migration numarası gibi proje içi terimler BURAYA YAZILMAZ.
 *
 * DÜRÜSTLÜK KURALI (korunur): bağlantı hazır değilse ekran "bağlı" görünmez
 * ve ölçüm sonucu için doğrulanmış dengeleme/sertifika iddiası kurulmaz.
 */

const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm text-[#17372d] focus:outline-none focus:ring-2 focus:ring-emerald-200';

type NumericField =
  | 'rooms'
  | 'occupied_room_nights'
  | 'total_area_m2'
  | 'guestrooms_area_m2'
  | 'meeting_area_m2';

const NUMERIC_FIELDS: [NumericField, string][] = [
  ['rooms', 'Oda sayısı'],
  ['occupied_room_nights', 'Dolu oda-gece (dönem toplamı)'],
  ['total_area_m2', 'Toplam kapalı alan (m²)'],
  ['guestrooms_area_m2', 'Oda alanı (m²)'],
  ['meeting_area_m2', 'Toplantı alanı (m²)'],
];

function initialForm(hotel: HotelInfo): Record<keyof ProviderImportInput, string> {
  // Otel daha önce "Otele özgü hesap" yaptıysa aynı oda/alan verisi önerilir.
  const prior = (hotel.carbon_pricing as { input?: HotelCarbonInput } | null)
    ?.input;
  const text = (n: number | undefined) => (n === undefined ? '' : String(n));
  return {
    period_start: prior?.period_start ?? '2025-01-01',
    period_end: prior?.period_end ?? '2025-12-31',
    country: prior?.country ?? 'Turkey',
    rooms: text(prior?.rooms),
    occupied_room_nights: text(prior?.occupied_room_nights),
    total_area_m2: text(prior?.total_area_m2),
    guestrooms_area_m2: text(prior?.guestrooms_area_m2),
    meeting_area_m2: text(prior?.meeting_area_m2),
  };
}

export function CarbonProviderPanel({
  hotel,
  status,
  disabled,
}: {
  hotel: HotelInfo;
  status: CarbonProviderStatus | null;
  disabled: boolean;
}) {
  const [form, setForm] = useState(() => initialForm(hotel));
  const [result, setResult] = useState<ImportMeasurementResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const ready =
    status?.provider_configured === true &&
    status.schema_ready &&
    status.link !== null &&
    status.credentials_ready;
  const isDemo = hotel.role === 'demo_viewer';
  const locked = disabled || pending || !ready || isDemo;
  const fmt = (n: number, digits = 2) =>
    n.toLocaleString('tr-TR', { maximumFractionDigits: digits });

  const fetchSummary = () =>
    startTransition(async () => {
      setMessage('');
      setError('');
      setResult(null);
      const numbers = Object.fromEntries(
        NUMERIC_FIELDS.map(([key]) => [key, Number(form[key])]),
      ) as Record<NumericField, number>;
      if (Object.values(numbers).some((n) => !Number.isFinite(n) || form.rooms === '')) {
        setError('Oda, dolu oda-gece ve alan bilgilerini eksiksiz girin.');
        return;
      }
      const response = await importProviderMeasurement({
        period_start: form.period_start,
        period_end: form.period_end,
        country: form.country,
        ...numbers,
      });
      if (response.error || !response.data) {
        setError(response.error ?? '3pmetrics verisi alınamadı.');
        return;
      }
      setResult(response.data);
      if (response.data.duplicate) {
        setMessage('Bu dönem ve bilgilerle aynı sonuç daha önce alınmıştı.');
      }
    });

  const apply = () =>
    startTransition(async () => {
      if (!result) return;
      setMessage('');
      setError('');
      const response = await activateProviderMeasurement(result.measurement.id);
      if (response.error || !response.data) {
        setError(response.error ?? 'Widget fiyatı güncellenemedi.');
        return;
      }
      setMessage(
        `Widget fiyatı güncellendi: gecelik ${fmt(response.data.pricing.amount_per_night)} ${response.data.pricing.currency}.`,
      );
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
          Tüketim verilerinizi buradan girersiniz; 3pmetrics emisyonu
          hesaplar. GreenGold Stay seçtiğiniz dönemin sonucunu alır, oda-gece
          katsayısına ve gecelik katkıya çevirir.
        </p>
      </header>

      <div className="space-y-6 p-6">
        {!ready && (
          <div className="rounded-xl border border-[#d8e1da] bg-[#f6f9f6] p-4">
            <p className="text-sm font-semibold text-[#17372d]">
              3pmetrics bağlantısı hazırlanıyor
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              {status?.link
                ? 'Hesabınız bulundu; erişim anahtarı tanımlandığında bu ekrandan ölçüm sonucunuzu alabilirsiniz.'
                : '3pmetrics müşterisiyseniz hesabınızın bağlanması için destek ekibimizle iletişime geçin. Bağlantı yapıldığında bu ekrandan ölçüm sonucunuzu alabilirsiniz.'}
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

        {status?.link && (
          <div className="rounded-xl border border-emerald-100 p-4 text-sm">
            <p className="text-xs text-neutral-500">Bağlı 3pmetrics hesabı</p>
            <p className="mt-1 font-medium text-[#17372d]">
              {status.link.external_property_name ??
                status.link.external_property_id}
            </p>
            {status.environment === 'sandbox' && (
              <p className="mt-1 text-xs text-amber-700">
                Test ortamı — sonuçlar örnek veridir.
              </p>
            )}
          </div>
        )}

        {ready && (
          <div>
            <h3 className="text-sm font-semibold text-[#17372d]">
              1. Tüketim verilerinizi girin
            </h3>
            <p className="mt-1 mb-4 text-xs text-neutral-500">
              Elektrik, doğalgaz, yakıt gibi kaynaklar 3pmetrics hesabınızdaki
              tanımlara göre listelenir. Her kayıt 3pmetrics&apos;e gönderilir
              ve emisyon orada hesaplanır.
            </p>
            <CarbonDataEntry
              locked={disabled || isDemo}
              environment={status?.environment}
            />
            {isDemo && (
              <p className="mt-2 text-xs text-neutral-500">
                Demo hesabı veri gönderemez.
              </p>
            )}
          </div>
        )}

        <div className={ready ? 'border-t border-neutral-100 pt-6' : ''}>
          <h3 className="text-sm font-semibold text-[#17372d]">
            {ready ? '2. ' : ''}Ölçüm sonucunu al
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Dönem, verilerini girdiğiniz tarihleri kapsamalı. Sonuç, 3pmetrics
            hesabınızdaki tüm tesislerin bu dönemdeki toplam emisyonudur. Oda ve
            alan bilgileri bu sonucu konaklamaya ayırmak ve dolu oda-geceye
            bölmek için kullanılır.
          </p>
          <fieldset disabled={locked} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Dönem başlangıcı
              <input
                className={inputClass}
                type="date"
                value={form.period_start}
                onChange={(e) =>
                  setForm((f) => ({ ...f, period_start: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Dönem bitişi
              <input
                className={inputClass}
                type="date"
                value={form.period_end}
                onChange={(e) =>
                  setForm((f) => ({ ...f, period_end: e.target.value }))
                }
              />
            </label>
            {NUMERIC_FIELDS.map(([key, label]) => (
              <label key={key} className="block text-sm font-medium text-neutral-700">
                {label}
                <input
                  className={inputClass}
                  type="number"
                  min={key === 'meeting_area_m2' ? 0 : 1}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={fetchSummary}
            disabled={locked}
            className="mt-4 rounded-lg bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && !result ? 'Alınıyor…' : '3pmetrics sonucunu getir'}
          </button>
          {isDemo && ready && (
            <p className="mt-2 text-xs text-neutral-500">
              Demo hesabı ölçüm alamaz.
            </p>
          )}
        </div>

        {result && (
          <div className="rounded-xl border border-emerald-100 p-4">
            <p className="text-xs text-neutral-500">
              {result.measurement.period_start} — {result.measurement.period_end}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {result.summary.scopes.map((scope) => (
                <li key={scope.scopeLabel} className="flex justify-between">
                  <span>{scope.scopeTitle}</span>
                  <span>{fmt(scope.total, 3)} tCO₂e</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-neutral-100 pt-1 font-medium text-[#17372d]">
                <span>Toplam</span>
                <span>{fmt(result.summary.totalEmissions, 3)} tCO₂e</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-neutral-600">
              Konaklama payı %{fmt(result.pricing.room_share * 100, 1)} · Doluluk %
              {fmt(result.pricing.occupancy_percent, 1)}
            </p>
            <p className="mt-1 text-sm font-medium text-[#17372d]">
              {fmt(result.pricing.coefficient_kg)} kgCO₂e / oda-gece · gecelik{' '}
              {fmt(result.pricing.amount_per_night)} {result.pricing.currency}
            </p>
            {result.pricing.warnings.map((warning) => (
              <p key={warning} className="mt-1 text-xs text-amber-700">
                {warning}
              </p>
            ))}
            <button
              type="button"
              onClick={apply}
              disabled={disabled || pending || isDemo}
              className="mt-4 rounded-lg bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Uygulanıyor…' : 'Widget fiyatına uygula'}
            </button>
          </div>
        )}

        {status?.active_measurement && (
          <div className="border-t border-neutral-100 pt-6">
            <p className="text-xs text-neutral-500">
              Widget fiyatını belirleyen ölçüm
            </p>
            <p className="mt-1 text-sm font-medium text-[#17372d]">
              {status.active_measurement.period_start} —{' '}
              {status.active_measurement.period_end}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {status.active_measurement.room_night_kg === null
                ? 'Oda-gece katsayısı türetilmedi.'
                : `${fmt(status.active_measurement.room_night_kg)} kgCO₂e / oda-gece`}
            </p>
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
            ölçüm kaydı dengeleme sertifikası yerine geçmez. */}
        <p className="text-xs text-neutral-500">
          Ölçüm sonucu, tesisinizin dönemsel emisyon hesabını belgeler. Ton
          başına katkı fiyatı temsilidir. Karbon kredisi itfası ve dengeleme
          sertifikası ayrı süreçlerdir.
        </p>
      </div>
    </section>
  );
}
