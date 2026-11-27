/**
 * Gönderim sonucu → ekran durumu (saf fonksiyon). Ekran yalnız bunu çizer.
 * Metinler otel kullanıcısına yöneliktir; teknik terim içermez.
 */
import { uomLabel, type PlanIssue, type SubmissionPlan } from './logic';
import { summarizeSent, type OccupancyOutcome, type SubmitOutcome } from './submit';

export interface EntryCorrection {
  item_id: string;
  item_name: string;
  from: string;
  to: string;
}

export interface EntryState {
  status: 'idle' | 'success' | 'info' | 'warning' | 'error' | 'confirm';
  message: string;
  /** Kalem bazında hatalar (alanın altında gösterilir). */
  issues?: PlanIssue[];
  /** Onay bekleyen düzeltmeler. */
  corrections?: EntryCorrection[];
  /** Gönderilmeden atlanan kalemler için kısa not. */
  skippedNote?: string;
}

export const ENTRY_IDLE: EntryState = { status: 'idle', message: '' };

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 });
const amount = (q: number, uom: string) => `${nf.format(q)} ${uomLabel(uom)}`;

function skippedNote(plan: SubmissionPlan): string | undefined {
  const unchanged = plan.skipped.filter((s) => s.reason === 'unchanged').length;
  const inFlight = plan.skipped.filter((s) => s.reason === 'in_flight').map((s) => s.item_name);
  const parts: string[] = [];
  if (unchanged) parts.push(`${unchanged} kalem değişmediği için yeniden gönderilmedi`);
  if (inFlight.length) parts.push(`${inFlight.join(', ')} hâlâ gönderiliyor; birkaç dakika sonra tekrar deneyin`);
  return parts.length ? `${parts.join('. ')}.` : undefined;
}

/** Doluluk kaydı sonucu → ekran durumu. */
export function occupancyStateFromOutcome(outcome: OccupancyOutcome): EntryState {
  switch (outcome.kind) {
    case 'invalid':
      return {
        status: 'error',
        message: outcome.message,
        issues: [{ item_id: 'occupancy', item_name: 'Dolu oda-gece', message: outcome.message }],
      };
    case 'error':
      return { status: 'error', message: outcome.message };
    case 'unchanged':
      return { status: 'info', message: 'Dolu oda-gece zaten bu değerle kayıtlı.' };
    case 'saved':
      return {
        status: 'success',
        message: `Dolu oda-gece kaydedildi (${nf.format(outcome.occupied_room_nights)}). Ölçüm ortağına bir şey gönderilmedi.`,
      };
  }
}

export function entryStateFromOutcome(outcome: SubmitOutcome): EntryState {
  switch (outcome.kind) {
    case 'busy':
      return {
        status: 'warning',
        message: 'Bu dönem için bir gönderim zaten sürüyor. Tamamlanınca sayfa yenilenecek; tekrar göndermenize gerek yok.',
      };
    case 'error':
      return { status: 'error', message: outcome.message };
    case 'invalid':
      return {
        status: 'error',
        message: 'Bazı değerler gönderilemedi. İşaretli alanları düzeltin; hiçbir kayıt gönderilmedi.',
        issues: outcome.plan.errors,
      };
    case 'needs_confirmation':
      return {
        status: 'confirm',
        message: 'Ölçüm ortağında onaylı değerleri değiştiriyorsunuz. Değişiklik aynı kaydı günceller (yeni kayıt açılmaz) ama kayıt yeniden onaya düşer: onaylanana kadar bu dönem hesaplanamaz. Misafir ekranındaki mevcut fiyat değişmez.',
        corrections: outcome.plan.lines
          .filter((l) => l.action === 'correction' && l.previous)
          .map((l) => ({
            item_id: l.item_id,
            item_name: l.item_name,
            from: amount(l.previous!.quantity, l.previous!.uom),
            to: amount(l.quantity, l.uom),
          })),
      };
    case 'occupancy_saved':
      return { status: 'success', message: 'Dolu oda-gece kaydedildi.', skippedNote: skippedNote(outcome.plan) };
    case 'nothing_to_send':
      return {
        status: 'info',
        message: outcome.plan.skipped.some((s) => s.reason !== 'empty')
          ? 'Gönderilecek yeni değer yok.'
          : 'Gönderilecek değer girilmedi.',
        skippedNote: skippedNote(outcome.plan),
      };
    case 'sent': {
      const r = outcome.result;
      const problem = r.rejected > 0 || r.outcome_unknown > 0 || r.period_closed;
      return {
        status: problem ? 'warning' : 'success',
        message: summarizeSent(r),
        skippedNote: skippedNote(outcome.plan),
      };
    }
  }
}
