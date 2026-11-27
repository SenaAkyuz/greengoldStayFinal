'use client';
import { useActionState, useMemo, useState } from 'react';
import { Button, Field, Meter, Notice, Select, TextInput } from '../ui';
import {
  countryOptions,
  validateProfile,
  type ProfileInput,
} from '@/lib/carbon-ui/profile';
import { formatPercent } from '@/lib/carbon-ui/status';
import { PROFILE_IDLE, type ProfileSaveState } from './profile-state';
import styles from './panel.module.css';

type SaveAction = (prev: ProfileSaveState, form: FormData) => Promise<ProfileSaveState>;

/**
 * Tesis profili formu — gerçek sayfa ve önizleme ORTAK kullanır.
 * `action` verilirse Server Action ile kaydeder; verilmezse (önizleme)
 * yalnız doğrular, hiçbir şey kaydetmez. `readOnly` (demo) kaydı kapatır.
 * Doğrulama kuralları backend ile aynı (`validateProfile`); sunucu yine
 * doğrular.
 */
export function FacilityProfileForm({
  initial,
  action,
  readOnly = false,
  readOnlyReason,
}: {
  initial: ProfileInput;
  action?: SaveAction;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const [form, setForm] = useState<ProfileInput>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileSaveState, FormData>(
    action ?? (async () => ({ status: 'success', message: 'Önizleme: profil geçerli. Gerçek ekranda bu adımda profil kaydedilir.' })),
    PROFILE_IDLE,
  );
  const { errors, roomShare } = useMemo(() => validateProfile(form), [form]);
  const countries = useMemo(() => countryOptions(initial.countryCode), [initial.countryCode]);
  const serverErrors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const show = (k: keyof ProfileInput) => (submitted ? errors[k] : undefined) ?? serverErrors[k];
  const set = (k: keyof ProfileInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const hasErrors = Object.keys(errors).length > 0;
  const disabled = readOnly || pending;

  return (
    <form
      noValidate
      action={formAction}
      onSubmit={(e) => {
        setSubmitted(true);
        if (hasErrors || readOnly) e.preventDefault();
      }}
    >
      {readOnly && readOnlyReason && (
        <div className={styles.gapBottom}>
          <Notice tone="info">{readOnlyReason}</Notice>
        </div>
      )}
      <fieldset disabled={readOnly} className={styles.fieldset}>
        <div className={styles.formGrid}>
          <Field id="country" label="Tesisin bulunduğu ülke" hint="Elektrik gibi ülkeye bağlı faktörlerin doğruluğu bununla kontrol edilir." error={show('countryCode')} required>
            {(c) => (
              <Select {...c} name="countryCode" value={form.countryCode} onChange={set('countryCode')}>
                <option value="">Ülke seçin…</option>
                {countries.map((ct) => <option key={ct.code} value={ct.code}>{ct.name}</option>)}
              </Select>
            )}
          </Field>
          <Field id="rooms" label="Oda sayısı" hint="Satışa açık oda sayısı." error={show('rooms')} required>
            {(c) => <TextInput {...c} name="rooms" numeric inputMode="numeric" value={form.rooms} onChange={set('rooms')} />}
          </Field>
          <Field id="total" label="Toplam kapalı alan (m²)" error={show('totalArea')} required>
            {(c) => <TextInput {...c} name="totalArea" numeric inputMode="decimal" value={form.totalArea} onChange={set('totalArea')} />}
          </Field>
          <Field id="roomsArea" label="Odaların toplam alanı (m²)" hint="Misafir odaları ve banyoları." error={show('roomsArea')} required>
            {(c) => <TextInput {...c} name="roomsArea" numeric inputMode="decimal" value={form.roomsArea} onChange={set('roomsArea')} />}
          </Field>
          <Field id="meeting" label="Toplantı / etkinlik alanı (m²)" hint="Yoksa boş bırakın." error={show('meetingArea')} optionalLabel>
            {(c) => <TextInput {...c} name="meetingArea" numeric inputMode="decimal" value={form.meetingArea} onChange={set('meetingArea')} />}
          </Field>
          <div className={styles.highlight}>
            <Meter label="Konaklamaya düşen pay" value={roomShare ?? 0} valueText={formatPercent(roomShare) ?? '—'} />
            <p className={styles.small}>Tesis emisyonunun bu oranı konaklamaya, kalanı toplantı alanlarına ayrılır.</p>
          </div>
        </div>
      </fieldset>
      {state.status !== 'idle' && !pending && (
        <div className={styles.gapTop} aria-live="polite">
          <Notice tone={state.status === 'success' ? 'success' : 'danger'}>{state.message}</Notice>
        </div>
      )}
      <div className={styles.actionsRow}>
        <Button type="submit" disabled={disabled} loading={pending} loadingLabel="Kaydediliyor…">
          Profili kaydet
        </Button>
      </div>
    </form>
  );
}
