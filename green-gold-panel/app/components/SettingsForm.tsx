'use client';

import { useActionState } from 'react';
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
            label="Tahmini CO₂ katsayısı"
            value={`${hotel.estimated_co2_per_night_kg.toLocaleString('tr-TR')} kg/gece`}
            note="Metodoloji parametresi; Green Gold tarafından belirlenir (tahmini)."
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
