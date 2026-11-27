'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { activateCarbonMeasurement } from '@/lib/api';
import {
  canCalculate,
  canSaveOccupancy,
  canSubmit,
  publishGate,
  publishGateText,
  type CalcState,
  type PublishState,
  connecthub,
  draftsFromForm,
  entryStateFromOutcome,
  occupancyStateFromOutcome,
  saveOccupancyOnly,
  isValidPeriod,
  maxOccupancyFor,
  periodEditability,
  readinessText,
  resendUncertainRecords,
  submitPlannedPeriod,
  userMessage,
  type EntryState,
} from '@/lib/connecthub';

/**
 * Karbon ölçümü — dönem gönderim eylemleri (Server Action).
 *
 * Güvenlik: hotel_id ASLA gönderilmez (backend token'dan çözer); demo
 * hesabı backend'de 403 alır. Her çağrıda dönem, ayın açıklığı ve gönderim
 * hazırlığı SUNUCUDA yeniden doğrulanır (istemci atlatılabilir).
 * Mükerrer koruma: lib/connecthub/logic.ts başı (sabit kayıt kimliği + plan +
 * eşzamanlı gönderim kilidi).
 */

async function prepare(period: string, kind: 'submit' | 'calculate' | 'occupancy' = 'submit'): Promise<
  | { ok: false; state: EntryState }
  | { ok: true; token: string; lockScope: string; maxOccupancy?: number }
> {
  if (!isValidPeriod(period)) {
    return { ok: false, state: { status: 'error', message: 'Geçersiz dönem.' } };
  }
  if (periodEditability(period, new Date()) !== 'open') {
    return {
      ok: false,
      state: { status: 'error', message: 'Bu ay henüz tamamlanmadı; veriler ay bittikten sonra gönderilebilir.' },
    };
  }
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, state: { status: 'error', message: 'Oturum bulunamadı, tekrar giriş yapın.' } };

  const status = await connecthub.status(token);
  if (status.error || !status.data) {
    return { ok: false, state: { status: 'error', message: userMessage(status) } };
  }
  const ready =
    kind === 'submit'
      ? canSubmit(status.data)
      : kind === 'occupancy'
        ? canSaveOccupancy(status.data)
        : canCalculate(status.data);
  if (!ready.ready) return { ok: false, state: { status: 'error', message: readinessText(ready)! } };
  return {
    ok: true,
    token,
    // Bağlantı otel başına tektir; kilit anahtarı olarak yeterli (doluluk kaydı bağlantı gerektirmez).
    lockScope: status.data.link?.id ?? 'no-link',
    maxOccupancy: maxOccupancyFor(period, status.data.profile?.rooms),
  };
}

function refresh(period: string) {
  revalidatePath(`/karbon-olcumu/${period}`);
  revalidatePath('/karbon-olcumu');
  revalidatePath('/');
}

/**
 * YALNIZ doluluğu kaydeder (yerel; ölçüm ortağına istek yok). Tüketim
 * gönderiminden ayrıdır — 3pmetrics anahtarı/bağlantısı gerekmez.
 */
export async function saveOccupancyAction(
  period: string,
  _prev: EntryState,
  formData: FormData,
): Promise<EntryState> {
  const ctx = await prepare(period, 'occupancy');
  if (!ctx.ok) return ctx.state;
  const outcome = await saveOccupancyOnly({
    token: ctx.token,
    period,
    occupancy: formData.get('occupancy')?.toString() ?? '',
    maxOccupancy: ctx.maxOccupancy,
  });
  if (outcome.kind === 'saved') refresh(period);
  return occupancyStateFromOutcome(outcome);
}

/**
 * Formdaki TÜKETİM değerlerini ölçüm ortağına gönderir. Doluluk bu eylemle
 * gönderilmez (ayrı eylem: saveOccupancyAction); formda olsa bile okunmaz.
 */
export async function submitPeriodEntries(
  period: string,
  _prev: EntryState,
  formData: FormData,
): Promise<EntryState> {
  const ctx = await prepare(period);
  if (!ctx.ok) return ctx.state;
  const outcome = await submitPlannedPeriod({
    token: ctx.token,
    lockScope: ctx.lockScope,
    period,
    maxOccupancy: ctx.maxOccupancy,
    drafts: draftsFromForm(formData),
    confirmCorrections: formData.get('confirmCorrections') === '1',
  });
  if (outcome.kind === 'sent' || outcome.kind === 'occupancy_saved') refresh(period);
  return entryStateFromOutcome(outcome);
}

/** Sonucu belirsiz / takılmış kayıtları kayıtlı değerleriyle yeniden gönderir. */
export async function resendUncertain(
  period: string,
  _prev: EntryState,
  _formData: FormData,
): Promise<EntryState> {
  const ctx = await prepare(period);
  if (!ctx.ok) return ctx.state;
  const outcome = await resendUncertainRecords({ token: ctx.token, lockScope: ctx.lockScope, period });
  if (outcome.kind === 'sent') refresh(period);
  if (outcome.kind === 'nothing_to_send') {
    return { status: 'info', message: 'Yeniden gönderilecek belirsiz kayıt kalmadı.' };
  }
  return entryStateFromOutcome(outcome);
}

/**
 * Dönemi hesaplar (POST …/calculate). Sağlayıcıdan yalnız OKUR (onaylı
 * kayıtlar + faktör paketi); widget fiyatına DOKUNMAZ. preview_only sonuç
 * kaydedilmez; calculated sonuç ölçüm olarak kaydedilir ama aktif değildir.
 */
export async function calculatePeriodAction(
  period: string,
  _prev: CalcState,
  _formData: FormData,
): Promise<CalcState> {
  const ctx = await prepare(period, 'calculate');
  if (!ctx.ok) return { status: 'error', message: ctx.state.message };
  const res = await connecthub.calculate(ctx.token, period);
  if (res.error || !res.data) return { status: 'error', message: userMessage(res) };
  if (res.data.status === 'calculated') refresh(period);
  return { status: 'result', result: res.data };
}

/**
 * Hesaplanan ölçümü misafir ekranına (widget fiyatına) uygular.
 *
 * Güvenlik: istemcinin gönderdiği sonuca GÜVENİLMEZ. Hesap sunucuda yeniden
 * çalıştırılır; yayın kapısı (`publishGate`: ülke doğrulaması + INTERNAL_USE)
 * ve ölçüm kimliği eşleşmesi burada tekrar kontrol edilir. Kapı kapalıysa
 * aktivasyon isteği HİÇ gönderilmez ve mevcut widget fiyatı değişmez.
 * Backend de aynı kuralı ayrıca uygular (publication-policy.ts → 409).
 */
export async function publishMeasurementAction(
  period: string,
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const measurementId = formData.get('measurementId')?.toString() ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(measurementId)) return { status: 'error', message: 'Geçersiz ölçüm.' };
  const ctx = await prepare(period, 'calculate');
  if (!ctx.ok) return { status: 'error', message: ctx.state.message };
  const res = await connecthub.calculate(ctx.token, period);
  if (res.error || !res.data) return { status: 'error', message: userMessage(res) };
  const gate = publishGate(res.data);
  if (!gate.allowed) return { status: 'error', message: publishGateText(gate)! };
  if (res.data.status !== 'calculated' || res.data.measurement_id !== measurementId) {
    return {
      status: 'error',
      message: 'Veriler değişmiş; yayına almadan önce dönemi yeniden hesaplayın.',
    };
  }
  const act = await activateCarbonMeasurement(ctx.token, measurementId);
  if (act.error || !act.data) {
    return { status: 'error', message: userMessage({ code: act.code ?? null, status: null, error: act.error }) };
  }
  refresh(period);
  return { status: 'success', message: 'Ölçüm misafir ekranına alındı. Yeni tahmini katkı tutarı widget’ta kullanılıyor.' };
}
