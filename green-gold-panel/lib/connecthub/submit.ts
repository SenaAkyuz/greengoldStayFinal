/**
 * Dönem kayıtlarını gönderme — sunucu tarafı akış (Server Action içinden
 * çağrılır). Formu doğrudan sağlayıcıya yollamaz; önce güncel kayıtları
 * okur, `planSubmission` ile plan çıkarır, yalnız gerekeni gönderir.
 *
 * Eşzamanlı gönderim kilidi: aynı otel+dönem için ikinci gönderim, ilki
 * bitene kadar reddedilir (çift tıklama / iki sekme). Kilit süreç içidir;
 * birden fazla sunucu örneğinde asıl güvence sabit kayıt kimliği ve yerel
 * upsert'tir (bkz. logic.ts başı) — kilit yalnız gereksiz yarışı azaltır.
 */
import { connecthub, type ApiResult } from './client';
import { userMessage } from './errors';
import { planSubmission, resendDrafts, type DraftLine, type SubmissionPlan } from './logic';
import type { ActivityRecord, SubmitPeriodResult } from './types';

const inFlight = new Set<string>();

export type SubmitOutcome =
  | { kind: 'error'; message: string; plan?: SubmissionPlan }
  | { kind: 'invalid'; plan: SubmissionPlan }
  | { kind: 'needs_confirmation'; plan: SubmissionPlan }
  | { kind: 'nothing_to_send'; plan: SubmissionPlan }
  | { kind: 'occupancy_saved'; plan: SubmissionPlan }
  | { kind: 'busy' }
  | { kind: 'sent'; plan: SubmissionPlan; result: SubmitPeriodResult };

type SubmitApi = Pick<typeof connecthub, 'items' | 'period' | 'submitRecords' | 'setOccupancy'> &
  Partial<Pick<typeof connecthub, 'providerRecords'>>;

interface CommonArgs {
  token: string;
  /** Kilit anahtarı (ör. bağlantı kimliği); backend yine token'dan çözer. */
  lockScope: string;
  period: string;
  /** Dolu oda-gece üst sınırı (oda × gün); profil yoksa verilmez. */
  maxOccupancy?: number;
  now?: Date;
  api?: SubmitApi;
}

export type OccupancyOutcome =
  | { kind: 'invalid'; message: string }
  | { kind: 'unchanged'; occupied_room_nights: number }
  | { kind: 'saved'; occupied_room_nights: number }
  | { kind: 'error'; message: string };

/**
 * YALNIZ doluluk (dolu oda-gece) kaydı — tüketim gönderiminden AYRI.
 * Ölçüm ortağına hiçbir istek gitmez: yalnız `PUT …/occupancy` (yerel
 * `carbon_periods`). Değer değişmediyse istek de atılmaz.
 */
export async function saveOccupancyOnly(args: {
  token: string;
  period: string;
  occupancy: string;
  maxOccupancy?: number;
  api?: Pick<typeof connecthub, 'period' | 'setOccupancy'>;
}): Promise<OccupancyOutcome> {
  const api = args.api ?? connecthub;
  if (!args.occupancy.trim()) return { kind: 'invalid', message: 'Dolu oda-gece sayısını girin.' };
  const plan = planSubmission({
    drafts: [],
    items: [],
    existing: [],
    occupancy: args.occupancy,
    maxOccupancy: args.maxOccupancy,
    now: new Date(),
  });
  if (plan.errors.length || plan.occupied_room_nights === undefined) {
    return { kind: 'invalid', message: plan.errors[0]?.message ?? 'Dolu oda-gece geçersiz.' };
  }
  const detail = await api.period(args.token, args.period);
  if (detail.error || !detail.data) return { kind: 'error', message: userMessage(detail) };
  if (detail.data.occupied_room_nights === plan.occupied_room_nights) {
    return { kind: 'unchanged', occupied_room_nights: plan.occupied_room_nights };
  }
  const saved = await api.setOccupancy(args.token, args.period, plan.occupied_room_nights);
  if (saved.error) return { kind: 'error', message: userMessage(saved) };
  return { kind: 'saved', occupied_room_nights: plan.occupied_room_nights };
}

/** Formdaki değerleri gönderir (yeni, düzeltme veya yeniden gönderim). */
export function submitPlannedPeriod(
  args: CommonArgs & {
    drafts: DraftLine[];
    occupancy?: string;
    /** Kullanıcı düzeltmeyi (kabul edilmiş kaydın değerini değiştirmeyi) onayladı mı. */
    confirmCorrections: boolean;
  },
): Promise<SubmitOutcome> {
  return run(args, () => ({ drafts: args.drafts, occupancy: args.occupancy }), args.confirmCorrections, true);
}

/**
 * Sonucu belirsiz / takılmış kayıtları KAYITLI değerleriyle, aynı kimlikle
 * yeniden gönderir (mükerrer oluşmaz). Değerleri güncel kayıtlardan okur;
 * formdaki değerlere bakmaz. Reddedilmiş kayıtlara dokunmaz.
 */
export function resendUncertainRecords(args: CommonArgs): Promise<SubmitOutcome> {
  const now = args.now ?? new Date();
  return run({ ...args, now }, (records) => ({ drafts: resendDrafts(records, now) }), false);
}

async function run(
  args: CommonArgs,
  source: (records: ActivityRecord[]) => { drafts: DraftLine[]; occupancy?: string },
  confirmCorrections: boolean,
  /** Ölçüm ortağındaki onaylı kayıtlarla da karşılaştır (form gönderimi). */
  withApproved = false,
): Promise<SubmitOutcome> {
  const api = args.api ?? connecthub;
  const key = `${args.lockScope}:${args.period}`;
  if (inFlight.has(key)) return { kind: 'busy' };
  inFlight.add(key);
  try {
    const year = Number(args.period.slice(0, 4));
    const [items, detail, approved] = await Promise.all([
      api.items(args.token, year),
      api.period(args.token, args.period),
      // Okunamazsa karşılaştırma yalnız yerel kayıtlarla yapılır (eski davranış).
      withApproved && api.providerRecords
        ? api.providerRecords(args.token, args.period).catch(() => null)
        : Promise.resolve(null),
    ]);
    const failed = firstError(items, detail);
    if (failed) return { kind: 'error', message: userMessage(failed) };

    const { drafts, occupancy } = source(detail.data!.records);
    const plan = planSubmission({
      drafts,
      items: items.data!,
      existing: detail.data!.records,
      approved: approved && !approved.error ? approved.data?.records ?? null : null,
      occupancy,
      maxOccupancy: args.maxOccupancy,
      now: args.now ?? new Date(),
    });
    if (plan.errors.length) return { kind: 'invalid', plan };
    if (plan.needs_confirmation && !confirmCorrections) {
      return { kind: 'needs_confirmation', plan };
    }

    const occupancyChanged =
      plan.occupied_room_nights !== undefined &&
      plan.occupied_room_nights !== detail.data!.occupied_room_nights;

    if (!plan.lines.length) {
      // Kayıt yok ama doluluk değiştiyse yalnız onu kaydet (sağlayıcıya gitmez).
      if (occupancyChanged) {
        const saved = await api.setOccupancy(args.token, args.period, plan.occupied_room_nights!);
        if (saved.error) return { kind: 'error', message: userMessage(saved), plan };
        return { kind: 'occupancy_saved', plan };
      }
      return { kind: 'nothing_to_send', plan };
    }

    const sent = await api.submitRecords(args.token, args.period, {
      ...(occupancyChanged ? { occupied_room_nights: plan.occupied_room_nights } : {}),
      lines: plan.lines.map(({ item_id, quantity, uom, note }) => ({
        item_id,
        quantity,
        uom,
        ...(note ? { note } : {}),
      })),
    });
    if (sent.error || !sent.data) return { kind: 'error', message: userMessage(sent), plan };
    return { kind: 'sent', plan, result: sent.data };
  } finally {
    inFlight.delete(key);
  }
}

function firstError(...results: ApiResult<unknown>[]) {
  return results.find((r) => r.error !== null || r.data === null) ?? null;
}

/** Gönderim sonucunun kullanıcı özeti (ekranda tek satır). */
export function summarizeSent(result: SubmitPeriodResult): string {
  const parts: string[] = [];
  if (result.accepted) parts.push(`${result.accepted} kayıt alındı, onay bekliyor`);
  if (result.rejected) parts.push(`${result.rejected} kayıt kabul edilmedi`);
  if (result.outcome_unknown) {
    parts.push(`${result.outcome_unknown} kaydın sonucu belirsiz (yeniden göndermek güvenli)`);
  }
  if (result.period_closed) parts.push('dönem ölçüm ortağında kapatılmış');
  return parts.length ? parts.join(' · ') : 'Gönderilecek kayıt yoktu.';
}
