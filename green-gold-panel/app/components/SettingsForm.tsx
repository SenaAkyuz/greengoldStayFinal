'use client';

import { useActionState, useState } from 'react';
import type { HotelInfo } from '@/lib/api';
import { saveSettings, type SettingsState } from '../ayarlar/actions';

const COMMON_TZ = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo',
];

const initialState: SettingsState = { status: 'idle', message: '' };

export function SettingsForm({ hotel }: { hotel: HotelInfo }) {
  const [state, formAction, isPending] = useActionState(
    saveSettings,
    initialState,
  );
  const [origins, setOrigins] = useState<string[]>(hotel.allowed_origins ?? []);
  const [originDraft, setOriginDraft] = useState('');
  const [logoUrl, setLogoUrl] = useState(hotel.logo_url ?? '');
  const [brandColor, setBrandColor] = useState(hotel.brand_color ?? '');

  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  const validColor = HEX6.test(brandColor) ? brandColor : '';
  const accent = validColor || '#1a7f5a';
  const validLogo = /^https:\/\//.test(logoUrl) ? logoUrl : '';
  const hotelTypeLabel =
    hotel.hotel_type === 'premium'
      ? 'Premium'
      : hotel.hotel_type === 'resort'
        ? 'Resort'
        : 'Şehir (city)';

  const addOrigin = () => {
    const v = originDraft.trim().replace(/\/+$/, '');
    if (v && !origins.includes(v)) setOrigins([...origins, v]);
    setOriginDraft('');
  };
  const removeOrigin = (o: string) =>
    setOrigins(origins.filter((x) => x !== o));

  return (
    <form action={formAction} className="mt-6 space-y-8">
      {/* Düzenlenebilir */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">
          Otel bilgileri
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Otel adı" htmlFor="name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={hotel.hotel_name}
              className={inputCls}
            />
          </Field>

          <Field label="Şehir" htmlFor="city">
            <input
              id="city"
              name="city"
              type="text"
              maxLength={120}
              defaultValue={hotel.city ?? ''}
              className={inputCls}
            />
          </Field>

          <Field
            label="Zaman dilimi"
            htmlFor="timezone"
            hint="Raporların gün/ay sınırları bu diline göre hesaplanır."
          >
            <input
              id="timezone"
              name="timezone"
              type="text"
              list="tz-list"
              required
              defaultValue={hotel.timezone}
              className={inputCls}
            />
            <datalist id="tz-list">
              {COMMON_TZ.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Gece başı katkı tutarı"
            htmlFor="amount"
            hint="Değişiklik, widget yeniden yüklendiğinde (yeni açılışta) geçerli olur."
          >
            <div className="flex items-center gap-2">
              <input
                id="amount"
                name="contribution_amount_per_night"
                type="number"
                min={0}
                max={1000}
                step="0.01"
                required
                defaultValue={hotel.amount_per_night}
                className={inputCls}
              />
              <span className="text-sm text-neutral-500">{hotel.currency}</span>
            </div>
          </Field>
        </div>
      </section>

      {/* İzin verilen origin'ler */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">
          İzin verilen alan adları (origin)
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Widget yalnızca bu domain&apos;lerden çalışır. Canlıya almadan önce
          otelin sitesini ekleyin (ör. <code>https://oteliniz.com</code>).
        </p>

        {/* Hidden input'lar: origins formData ile gider (boşsa temizlenir). */}
        {origins.map((o) => (
          <input key={o} type="hidden" name="allowed_origins" value={o} />
        ))}

        <div className="mt-4 flex flex-wrap gap-2">
          {origins.length === 0 && (
            <span className="text-sm text-neutral-400">
              Henüz origin yok — widget hiçbir sitede çalışmaz.
            </span>
          )}
          {origins.map((o) => (
            <span
              key={o}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800"
            >
              <span className="font-mono text-xs">{o}</span>
              <button
                type="button"
                onClick={() => removeOrigin(o)}
                aria-label={`${o} kaldır`}
                className="text-emerald-600 hover:text-emerald-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={originDraft}
            onChange={(e) => setOriginDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOrigin();
              }
            }}
            placeholder="https://oteliniz.com"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addOrigin}
            className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Ekle
          </button>
        </div>
      </section>

      {/* Marka (otel düzenleyebilir) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Marka</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Logo ve aksan rengi widget’ta görünür. Logo yalnızca{' '}
          <code>https</code> adres olabilir; renk 6 haneli hex (#RRGGBB).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Logo URL (https)"
            htmlFor="logo_url"
            hint="Boş bırakılırsa varsayılan yaprak simgesi kullanılır."
          >
            <input
              id="logo_url"
              type="url"
              inputMode="url"
              maxLength={500}
              placeholder="https://oteliniz.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.currentTarget.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Marka rengi" htmlFor="brand_color_text">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Renk seçici"
                value={accent}
                onChange={(e) => setBrandColor(e.currentTarget.value)}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-0.5"
              />
              <input
                id="brand_color_text"
                type="text"
                maxLength={7}
                placeholder="#1a7f5a"
                value={brandColor}
                onChange={(e) => setBrandColor(e.currentTarget.value)}
                className={inputCls}
              />
              {brandColor && (
                <button
                  type="button"
                  onClick={() => setBrandColor('')}
                  className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Temizle
                </button>
              )}
            </div>
            {brandColor && !validColor && (
              <span className="mt-1 block text-xs text-amber-600">
                Geçersiz renk — #RRGGBB biçiminde olmalı.
              </span>
            )}
          </Field>
        </div>

        {/* boşsa gönderme: action boş değeri atlar, backend'e geçersiz gitmez */}
        <input type="hidden" name="logo_url" value={validLogo} />
        <input type="hidden" name="brand_color" value={validColor} />

        {/* Canlı küçük önizleme */}
        <div className="mt-5">
          <span className="text-xs font-medium text-neutral-500">Önizleme</span>
          <div className="mt-2 inline-flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3 py-2">
            <span
              className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg text-white"
              style={{ backgroundColor: accent }}
            >
              {validLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={validLogo}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <LeafGlyph />
              )}
            </span>
            <span className="text-sm font-semibold" style={{ color: accent }}>
              Katkıyı ekle
            </span>
          </div>
        </div>
      </section>

      {/* Read-only / korumalı */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">
          Sabit alanlar
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Bu alanlar panelden değiştirilemez.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ReadOnlyField
            label="Para birimi"
            value={hotel.currency}
            note="Şimdilik sabit (çoklu para birimi Faz 2)."
          />
          <ReadOnlyField
            label="Komisyon oranı"
            value={`%${hotel.commission_rate.toLocaleString('tr-TR')}`}
            note="Green Gold sözleşmesi; buradan değiştirilemez."
          />
          <ReadOnlyField
            label="Otel tipi"
            value={hotelTypeLabel}
            note="Tanımlayıcı alan (şehir/premium ayrımı); Green Gold belirler."
          />
          <ReadOnlyField
            label="Tahmini CO₂ katsayısı"
            value={`${hotel.estimated_co2_per_night_kg.toLocaleString('tr-TR')} kg/gece`}
            note="GEÇİCİ PLACEHOLDER — Green Gold metodoloji onayı olmadan gerçek otele sunulmamalı."
          />
          <ReadOnlyField
            label="Widget anahtarı"
            value={hotel.public_widget_key}
            note="Entegrasyon kodundaki genel anahtar."
            mono
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-60"
        >
          {isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        {state.status === 'success' && (
          <span className="text-sm font-medium text-emerald-700">
            {state.message}
          </span>
        )}
        {state.status === 'error' && (
          <span className="text-sm font-medium text-amber-700">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';

function LeafGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20c0-8 6-14 16-14 0 10-6 14-14 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 16c3-3 6-4.5 9-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  note,
  mono,
}: {
  label: string;
  value: string;
  note: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <div className="mt-1.5">
        <input
          type="text"
          value={value}
          disabled
          readOnly
          className={
            'w-full cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 ' +
            (mono ? 'font-mono text-xs' : '')
          }
        />
      </div>
      <span className="mt-1 block text-xs text-neutral-400">{note}</span>
    </div>
  );
}
