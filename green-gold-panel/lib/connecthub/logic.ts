/**
 * ConnectHub ölçüm akışının panel iş mantığı — saf fonksiyonlar (ağ yok,
 * React yok); ekranlar yalnızca bunların sonucunu çizer.
 *
 * MÜKERRER KAYIT KORUMASI — katmanlar:
 *  1. Sağlayıcı: her (birim, başlık, dönem) için sabit external_id
 *     (gg:<birim>:<başlık>:<dönem>). Aynı kaydı yeniden göndermek 3P
 *     Metrics'te YENİ kayıt açmaz, mevcut kaydı günceller.
 *  2. Yerel veritabanı: kayıtlar (otel, ortam, external_id) üzerinden upsert
 *     edilir; yerelde de tek satır kalır.
 *  3. Panel (bu dosya): `planSubmission`
 *     - Değişmemiş ve kabul edilmiş kaydı göndermez (gereksiz istek yok).
 *     - Yolda olan ("gönderiliyor") kaydı, takılma süresi dolmadan tekrar
 *       göndermez — iki eşzamanlı istek yarışmasın.
 *     - Sonucu belirsiz / reddedilen kaydı yeniden göndermeye izin verir
 *       (1. madde sayesinde güvenli), bunu "yeniden gönderim" diye işaretler.
 *     - Kabul edilmiş bir kaydın DEĞERİNİ değiştirmek "düzeltme"dir; açık
 *       onay olmadan gönderilmez.
 *  4. Sunucu eylemi: aynı otel+dönem için eşzamanlı gönderim kilidi
 *     (`submit.ts`).
 */
import type {
  ActivityRecord,
  CalculatePeriodResult,
  ConnectHubItem,
  ConnectHubStatus,
  ItemBlockedReason,
  PeriodDetail,
  PeriodListEntry,
  SubmitLine,
  ProviderRecord,
} from './types';
import type { PeriodStatus, RecordStatus } from '../carbon-ui/status';

/**
 * "Gönderiliyor" durumunda kalan kaydın takılmış sayılacağı süre. Bu süre
 * içinde aynı kayıt yeniden gönderilmez (istek hâlâ sürüyor olabilir);
 * sonrasında yeniden gönderim, sabit kayıt kimliği sayesinde güvenlidir.
 * Değer panelin istek zaman aşımından (fetch) uzun tutulur.
 */
export const SENDING_STALE_MS = 5 * 60 * 1000;

/**
 * INTERNAL_USE: 3P Metrics faktör paketi "yalnız iç kullanım" notuyla
 * geliyor. 2026-11-27: 3P Metrics YAZILI izin verdi — hesaplanan tahmini
 * emisyon ve gönüllü katkı misafire gösterilebilir; koşullar: yalnız
 * Kapsam 1 ve 2 (WTT/Kapsam 3 yok), faktörler paylaşılmaz, karbon nötrlüğü /
 * doğrulanmış dengeleme iddiası yok. Ortam değişkeniyle değiştirilemez.
 * API eşi: green-gold-api/src/carbon/publication-policy.ts (aynı kurallar,
 * aktivasyon ucunda ikinci katman).
 */
export const INTERNAL_USE_PUBLISH_ALLOWED = true;

/**
 * Yayın öncesi otele gösterilen açıklama: misafirin neyi göreceği ve izin
 * koşulları (widget metniyle aynı içerik — green-gold-widget/src/i18n.ts).
 */
export const GUEST_DISCLOSURE =
  'Misafir yalnız tahmini karbon etkisini (kg CO₂e) ve gönüllü katkı tutarını görür; emisyon faktörleri gösterilmez. Widget notu: "Ölçülen enerji tüketimine dayalı tahmin (Kapsam 1 ve 2) · Doğrulanmış bir emisyon beyanı değildir." Widget ayrıca karbon nötrlüğü garanti etmediğini söyler.';

/** Yazılı izinle misafire gösterilebilecek kapsamlar. */
export const PERMITTED_SCOPES: readonly number[] = [1, 2];

/** Hesaplanan kapsamlar izin içinde mi? Boş/bilinmeyen → hayır (fail closed). */
export function scopesPermitted(scopes: readonly number[] | null | undefined): boolean {
  return !!scopes && scopes.length > 0 && scopes.every((s) => PERMITTED_SCOPES.includes(s));
}

// --- Kayıt durumu -----------------------------------------------------------

/**
 * Yerel kayıt → ekran durumu. "accepted" yalnızca sağlayıcının kaydı aldığını
 * söyler; onay ayrı bir adımdır ve yalnız sağlayıcı "approved" dediyse
 * "Onaylandı" gösterilir — varsayımla onaylı denmez.
 */
export function recordUiStatus(record: Pick<ActivityRecord, 'status' | 'provider_status'>): RecordStatus {
  switch (record.status) {
    case 'accepted':
      return record.provider_status === 'approved' ? 'approved' : 'pending_approval';
    case 'sending':
      return 'sending';
    case 'rejected':
      return 'rejected';
    case 'outcome_unknown':
      return 'outcome_unknown';
  }
}

/** Ekranda gösterilecek durum: takılmış gönderim "sonuç belirsiz" sayılır. */
export function recordDisplayStatus(
  record: Pick<ActivityRecord, 'status' | 'provider_status' | 'sent_at'>,
  now: Date,
): RecordStatus {
  if (record.status === 'sending' && isSendingStale(record.sent_at, now)) return 'outcome_unknown';
  return recordUiStatus(record);
}

export function isSendingStale(sentAt: string | null, now: Date): boolean {
  if (!sentAt) return true;
  const t = Date.parse(sentAt);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t >= SENDING_STALE_MS;
}

// --- Başlıklar ------------------------------------------------------------

const BLOCKED_TEXT: Record<ItemBlockedReason, string> = {
  not_monthly:
    'Bu kalem aylık değil (ör. araçlar günlük ve yakıt türüyle girilir); bu ekrandan girilemez. Ölçüm ortağının API\'si henüz yakıt türü seçimini desteklemediği için bu kalem şimdilik hesabımıza dahil edilmez.',
  option_required:
    'Bu kalem için yakıt/tür seçimi gerekiyor; ölçüm ortağının API\'si seçimi henüz desteklemediği için girilemez ve hesaba dahil edilmez.',
  excluded: 'Bu kalem karbon envanterine dahil değil.',
  no_factor: 'Bu kalem için bu yıl emisyon faktörü yok.',
};

/**
 * Sağlayıcının "faktör verilemiyor" gerekçe kodları → kullanıcı dili.
 * Tanınmayan kod genel metinle döner (kod parantez içinde, destek için).
 */
const PROVIDER_FACTOR_REASON_TEXT: Record<string, string> = {
  SOURCE_NOT_REDISTRIBUTABLE:
    'Ölçüm ortağı bu kalemin emisyon faktörünü lisans koşulları nedeniyle bizimle paylaşamıyor (ör. Türkiye şebeke elektriği). Ölçüm ortağı paylaşılabilir bir faktör sağlayana kadar bu kalem hesaba katılamaz; tahmini değer kullanılmaz.',
  OPTION_REQUIRED:
    'Bu kalem için yakıt/tür seçimi gerekiyor; ölçüm ortağının kayıt arayüzü seçimi henüz desteklemiyor.',
  UNVERIFIED: 'Ölçüm ortağı bu faktörü henüz doğrulamadı; doğrulanana kadar hesaba katılamaz.',
};

export function providerFactorReasonText(reason: string | null | undefined): string {
  if (reason && PROVIDER_FACTOR_REASON_TEXT[reason]) return PROVIDER_FACTOR_REASON_TEXT[reason];
  return `Ölçüm ortağı bu kalem için şu anda emisyon faktörü veremiyor${reason ? ` (gerekçe kodu: ${reason})` : ''}. Faktör sağlanana kadar bu kalem hesaba katılamaz; tahmini değer kullanılmaz.`;
}

/** Veri girişi açık ama faktör bekleniyor: formda gösterilen not. */
export function factorPendingNote(reason: string | null | undefined): string {
  return `${providerFactorReasonText(reason)} Kaydı yine de gönderebilirsiniz; ölçüm ortağının envanterinde yer alır.`;
}

export function blockedReasonText(reason: ItemBlockedReason): string {
  return BLOCKED_TEXT[reason];
}

/** Formda veri girilebilir kalemler (sıra korunur). */
export function writableItems(items: ConnectHubItem[]): ConnectHubItem[] {
  return items.filter((i) => i.writable);
}

// --- Gönderim planı ------------------------------------------------------

export interface DraftLine {
  item_id: string;
  /** Formdan ham metin (tr-TR virgül kabul edilir); boş = girilmedi. */
  quantity: string;
  uom: string;
  note?: string;
}

export type PlanAction =
  | 'new' // ilk kez gönderiliyor
  | 'resend' // sonucu belirsiz / reddedilmiş / takılmış — aynı kimlikle
  | 'correction'; // kabul edilmiş / ölçüm ortağında onaylı kaydın değeri değişiyor (onay gerekir)

export interface PlannedLine extends SubmitLine {
  action: PlanAction;
  item_name: string;
  /** Düzeltmede kabul edilmiş önceki değer (onay ekranı için). */
  previous?: { quantity: number; uom: string; note: string | null };
  /** Önceki değer ölçüm ortağındaki onaylı kayıttan mı (yerelde kayıt yok). */
  previous_from_provider?: boolean;
}

export type SkipReason =
  | 'empty' // değer girilmedi
  | 'unchanged' // kabul edilmiş, aynı değer
  | 'in_flight'; // gönderiliyor, süre dolmadı

export interface PlanIssue {
  item_id: string;
  item_name: string;
  message: string;
}

export interface SubmissionPlan {
  lines: PlannedLine[];
  skipped: { item_id: string; item_name: string; reason: SkipReason }[];
  errors: PlanIssue[];
  /** Düzeltme satırı varsa kullanıcıdan açık onay gerekir. */
  needs_confirmation: boolean;
  occupied_room_nights?: number;
}

/** "1.234,5" / "1234.5" / "1234,5" → sayı; geçersizse null. */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.'); // 1.234,5
  } else if (/^\d+(,\d+)?$/.test(s)) {
    normalized = s.replace(',', '.'); // 1234,5
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    normalized = s; // 1234.5
  } else {
    return null;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const MAX_QUANTITY = 1e12;

/** Birim yazımları (m3 / m³ / M3) aynı birim sayılır. */
export function sameUom(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (u: string | null | undefined) => (u ?? '').trim().toLowerCase().replace('³', '3').replace('²', '2');
  return n(a) === n(b);
}

function sameValue(record: ActivityRecord, line: SubmitLine): boolean {
  return (
    record.quantity === line.quantity &&
    record.uom === line.uom &&
    (record.note ?? '') === (line.note ?? '')
  );
}

/**
 * Formdaki satırları mevcut kayıtlarla karşılaştırıp neyin gönderileceğini
 * belirler. Ağ çağrısı yapmaz; aynı girdi aynı planı üretir.
 */
export function planSubmission(args: {
  drafts: DraftLine[];
  items: ConnectHubItem[];
  existing: ActivityRecord[];
  occupancy?: string;
  /** Dolu oda-gece üst sınırı (oda × ayın gün sayısı); profil yoksa verilmez. */
  maxOccupancy?: number;
  /**
   * Ölçüm ortağındaki onaylı kayıtlar (UX-3.2). Yerelde kaydı olmayan bir
   * kalemde aynı değer zaten onaylıysa yeniden gönderilmez; farklı değer
   * gönderimi yeniden onay gerektirdiği için kullanıcı onayı istenir.
   */
  approved?: ProviderRecord[] | null;
  now: Date;
}): SubmissionPlan {
  const byItem = new Map(args.items.map((i) => [i.id, i]));
  const byRecord = new Map(args.existing.map((r) => [r.item_id, r]));
  const plan: SubmissionPlan = { lines: [], skipped: [], errors: [], needs_confirmation: false };
  const seen = new Set<string>();

  if (args.occupancy !== undefined && args.occupancy.trim() !== '') {
    const occ = parseQuantity(args.occupancy);
    if (occ === null || !Number.isInteger(occ) || occ < 1 || occ > 40_000_000) {
      plan.errors.push({
        item_id: 'occupancy',
        item_name: 'Dolu oda-gece',
        message: 'Dolu oda-gece 1 veya daha büyük bir tam sayı olmalı.',
      });
    } else if (args.maxOccupancy !== undefined && occ > args.maxOccupancy) {
      plan.errors.push({
        item_id: 'occupancy',
        item_name: 'Dolu oda-gece',
        message: `Dolu oda-gece bu ay için en fazla ${args.maxOccupancy.toLocaleString('tr-TR')} olabilir (oda × gün).`,
      });
    } else {
      plan.occupied_room_nights = occ;
    }
  }

  for (const draft of args.drafts) {
    const item = byItem.get(draft.item_id);
    const name = item?.name ?? 'Bilinmeyen kalem';
    if (!item) {
      plan.errors.push({ item_id: draft.item_id, item_name: name, message: 'Bu kalem tesisiniz için açık değil.' });
      continue;
    }
    if (seen.has(item.id)) {
      plan.errors.push({ item_id: item.id, item_name: name, message: 'Aynı kalem bir ayda yalnızca bir kez girilebilir.' });
      continue;
    }
    seen.add(item.id);

    if (draft.quantity.trim() === '') {
      plan.skipped.push({ item_id: item.id, item_name: name, reason: 'empty' });
      continue;
    }
    if (!item.writable) {
      plan.errors.push({
        item_id: item.id,
        item_name: name,
        message: item.blocked_reason ? blockedReasonText(item.blocked_reason) : 'Bu kalem girilemez.',
      });
      continue;
    }
    const quantity = parseQuantity(draft.quantity);
    if (quantity === null || quantity < 0 || quantity > MAX_QUANTITY) {
      plan.errors.push({ item_id: item.id, item_name: name, message: 'Geçerli bir miktar girin (0 veya daha büyük).' });
      continue;
    }
    if (!item.uoms.includes(draft.uom)) {
      plan.errors.push({
        item_id: item.id,
        item_name: name,
        message: `Ölçü birimi ${item.uoms.join(', ')} olmalı.`,
      });
      continue;
    }
    const note = draft.note?.trim() ? draft.note.trim().slice(0, 500) : undefined;
    const line: SubmitLine = { item_id: item.id, quantity, uom: draft.uom, ...(note ? { note } : {}) };

    const record = byRecord.get(item.id);
    let action: PlanAction = 'new';
    let previous: PlannedLine['previous'];
    let previousFromProvider = false;
    const approved = record ? [] : (args.approved ?? []).filter((r) => r.item_id === item.id);
    if (!record && approved.length > 0) {
      if (approved.length === 1 && approved[0].quantity === quantity && sameUom(approved[0].uom, line.uom)) {
        plan.skipped.push({ item_id: item.id, item_name: name, reason: 'unchanged' });
        continue;
      }
      // Farklı değer: ölçüm ortağında yeniden onay gerekir → açık onay.
      action = 'correction';
      previous = {
        quantity: approved.reduce((s, r) => s + r.quantity, 0),
        uom: approved[0].uom ?? line.uom,
        note: null,
      };
      previousFromProvider = true;
      plan.needs_confirmation = true;
    }
    if (record) {
      if (record.status === 'sending' && !isSendingStale(record.sent_at, args.now)) {
        plan.skipped.push({ item_id: item.id, item_name: name, reason: 'in_flight' });
        continue;
      }
      if (record.status === 'accepted') {
        if (sameValue(record, line)) {
          plan.skipped.push({ item_id: item.id, item_name: name, reason: 'unchanged' });
          continue;
        }
        action = 'correction';
        previous = { quantity: record.quantity, uom: record.uom, note: record.note };
        plan.needs_confirmation = true;
      } else {
        action = 'resend'; // rejected | outcome_unknown | takılmış sending
      }
    }
    plan.lines.push({
      ...line,
      action,
      item_name: name,
      ...(previous ? { previous } : {}),
      ...(previousFromProvider ? { previous_from_provider: true } : {}),
    });
  }
  return plan;
}

/**
 * Güvenle AYNI değerle yeniden gönderilebilecek kayıt mı? Yalnız sonucu
 * belirsiz ve takılmış ("gönderiliyor"da süresi dolmuş) kayıtlar. Reddedilmiş
 * kayıt aynı değerle yine reddedilir: kullanıcı değeri formda düzeltip
 * gönderir (bu da aynı kimlikle gider, mükerrer oluşmaz).
 */
export function isSafeRetry(record: Pick<ActivityRecord, 'status' | 'sent_at'>, now: Date): boolean {
  return (
    record.status === 'outcome_unknown' ||
    (record.status === 'sending' && isSendingStale(record.sent_at, now))
  );
}

/** Sonucu belirsiz / takılmış kayıtları aynı değerlerle yeniden gönderme taslağı. */
export function resendDrafts(records: ActivityRecord[], now: Date): DraftLine[] {
  return records
    .filter((r) => isSafeRetry(r, now))
    .map((r) => ({
      item_id: r.item_id,
      quantity: String(r.quantity),
      uom: r.uom,
      ...(r.note ? { note: r.note } : {}),
    }));
}

// --- Önkoşullar ve dönem durumu --------------------------------------

export type Readiness =
  | { ready: true }
  | { ready: false; reason: 'schema' | 'not_configured' | 'not_linked' | 'environment' | 'write_key' | 'read_key' | 'profile' };

/** Veri girişi (gönderim) yapılabilir mi? */
export function canSubmit(status: ConnectHubStatus): Readiness {
  if (!status.schema_ready) return { ready: false, reason: 'schema' };
  if (!status.provider_configured) return { ready: false, reason: 'not_configured' };
  if (!status.link) return { ready: false, reason: 'not_linked' };
  if (status.environment_matches === false) return { ready: false, reason: 'environment' };
  if (!status.write_key_ready) return { ready: false, reason: 'write_key' };
  return { ready: true };
}

/** Doluluk kaydedilebilir mi? Yalnız yerel kayıt: şema yeterli (ölçüm ortağı/anahtar gerekmez). */
export function canSaveOccupancy(status: ConnectHubStatus): Readiness {
  if (!status.schema_ready) return { ready: false, reason: 'schema' };
  return { ready: true };
}

/** Hesaplama yapılabilir mi? (okuma anahtarı + profil gerekir) */
export function canCalculate(status: ConnectHubStatus): Readiness {
  if (!status.schema_ready) return { ready: false, reason: 'schema' };
  if (!status.provider_configured) return { ready: false, reason: 'not_configured' };
  if (!status.link) return { ready: false, reason: 'not_linked' };
  if (status.environment_matches === false) return { ready: false, reason: 'environment' };
  if (!status.read_key_ready) return { ready: false, reason: 'read_key' };
  if (!status.profile) return { ready: false, reason: 'profile' };
  return { ready: true };
}

/** Dönem listesi girdisi → ekran durumu (yalnız yerel veriden). */
export function periodUiStatus(entry: Pick<PeriodListEntry, 'status'>): PeriodStatus {
  switch (entry.status) {
    case 'submitted':
      // Sağlayıcı onayı yerelde bilinmez; "gönderildi, onay bekleniyor".
      return 'awaiting_approval';
    default:
      return entry.status;
  }
}

/** Hesap sonucu → ekran durumu (dönem sayfasında, hesaplamadan sonra). */
export function calculationUiStatus(result: CalculatePeriodResult): PeriodStatus {
  switch (result.status) {
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'no_data':
      return 'empty';
    case 'blocked':
      return 'blocked';
    case 'preview_only':
      return 'preview_only';
    case 'calculated':
      return 'calculated';
  }
}

/** Dönemde dikkat isteyen kayıt var mı (ekranda uyarı şeridi için). */
export function periodNeedsAttention(detail: PeriodDetail, now: Date): boolean {
  return detail.records.some(
    (r) =>
      r.status === 'rejected' ||
      r.status === 'outcome_unknown' ||
      (r.status === 'sending' && isSendingStale(r.sent_at, now)),
  );
}

// --- Yayın kapısı ---------------------------------------------------------

export type PublishGate =
  | { allowed: true }
  | { allowed: false; reason: 'not_calculated' | 'country_unverified' | 'internal_use' | 'scope_not_permitted' };

/**
 * Hesaplanan ölçüm widget fiyatına (misafire) uygulanabilir mi?
 * Sıra: hesap yoksa → ülke/faktör doğrulanmadıysa → INTERNAL_USE izni yoksa →
 * hesapta Kapsam 1/2 dışı (ya da bilinmeyen) kapsam varsa.
 */
export function publishGate(result: CalculatePeriodResult | null): PublishGate {
  if (!result || result.status !== 'calculated') {
    return {
      allowed: false,
      reason: result?.status === 'preview_only' ? 'country_unverified' : 'not_calculated',
    };
  }
  if (!result.country_check.publishable) return { allowed: false, reason: 'country_unverified' };
  if (!INTERNAL_USE_PUBLISH_ALLOWED) return { allowed: false, reason: 'internal_use' };
  if (!scopesPermitted(result.calculation.coverage?.scopes_calculated)) {
    return { allowed: false, reason: 'scope_not_permitted' };
  }
  return { allowed: true };
}

const GATE_TEXT: Record<Exclude<PublishGate, { allowed: true }>['reason'], string> = {
  not_calculated: 'Önce bu dönemin hesabını tamamlayın.',
  country_unverified:
    'Bir emisyon faktörünün tesisinizin ülkesine uygunluğu doğrulanamadı; sonuç yalnız önizleme olarak gösterilir.',
  internal_use:
    'Ölçüm ortağının faktör kullanım izni olmadan hesaplanan değer misafir ekranına alınmaz. Misafir ekranı mevcut tahmini katkıyı göstermeye devam eder.',
  scope_not_permitted:
    'Bu hesap Kapsam 1 ve 2 dışında (ör. Kapsam 3) satır içeriyor. Ölçüm ortağının kullanım izni yalnız Kapsam 1 ve 2 için geçerli; sonuç misafir ekranına alınamaz.',
};

export function publishGateText(gate: PublishGate): string | null {
  return gate.allowed ? null : GATE_TEXT[gate.reason];
}

// --- Dönem ve form yardımcıları (E) -------------------------------------

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidPeriod(period: string): boolean {
  const m = PERIOD_RE.exec(period);
  return !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100;
}

export function daysInPeriod(period: string): number {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ayın girişe açıklığı — backend'in UTC "bugün" kuralıyla aynı. */
export type PeriodEditability = 'future' | 'in_progress' | 'open';

export function periodEditability(period: string, now: Date): PeriodEditability {
  const current = now.toISOString().slice(0, 7);
  if (period > current) return 'future';
  if (period === current) return 'in_progress';
  return 'open';
}

/** Tamamlanmış son ay (ör. 26 Kasım → "2026-10"). */
export function lastCompletedPeriod(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function maxOccupancyFor(period: string, rooms: number | null | undefined): number | undefined {
  return rooms && rooms > 0 ? rooms * daysInPeriod(period) : undefined;
}

const UOM_LABELS: Record<string, string> = {
  m3: 'm³',
  'm³': 'm³',
  kwh: 'kWh',
  mwh: 'MWh',
  gj: 'GJ',
  l: 'Litre',
  litre: 'Litre',
  liter: 'Litre',
  kg: 'kg',
  t: 'ton',
  ton: 'ton',
  tonne: 'ton',
  gallon: 'Galon (ABD)',
  'us gallon': 'Galon (ABD)',
  km: 'km',
  mile: 'mil',
};

/**
 * Ölçü birimi kodu → okunur etiket. Bilinmeyen kod OLDUĞU GİBİ gösterilir;
 * gönderilen değer her zaman API'nin verdiği koddur (otele özel birimler
 * desteklenir).
 */
export function uomLabel(code: string): string {
  return UOM_LABELS[code.trim().toLowerCase()] ?? code;
}

export interface ItemGroup {
  key: string;
  title: string;
  items: ConnectHubItem[];
}

const SCOPE_TITLES: Record<number, string> = {
  1: 'Kapsam 1 · doğrudan (yakıt, gaz)',
  2: 'Kapsam 2 · satın alınan enerji',
  3: 'Kapsam 3 · diğer dolaylı',
};

/**
 * Otelin açık başlıklarını kapsama göre gruplar (API'den geldiği gibi —
 * sabit başlık listesi yok). Aylık ve yazılabilir olanlar önce; kapsamı
 * bilinmeyenler "Diğer kalemler"de.
 */
export function groupItems(items: ConnectHubItem[]): ItemGroup[] {
  const order = (i: ConnectHubItem) => (i.writable ? 0 : 1);
  const groups = new Map<string, ItemGroup>();
  for (const item of items) {
    const key = item.scope && SCOPE_TITLES[item.scope] ? `s${item.scope}` : 'other';
    if (!groups.has(key)) {
      groups.set(key, { key, title: item.scope && SCOPE_TITLES[item.scope] ? SCOPE_TITLES[item.scope] : 'Diğer kalemler', items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()]
    .sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : a.key.localeCompare(b.key)))
    .map((g) => ({
      ...g,
      items: g.items.slice().sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'tr')),
    }));
}

/** Form alan adları (kalem kimliği UUID; ayraç güvenli). */
export const FIELD = {
  quantity: (id: string) => `q:${id}`,
  uom: (id: string) => `u:${id}`,
  note: (id: string) => `n:${id}`,
};

/** FormData → taslak satırlar (yalnız formda alanı olan kalemler). */
export function draftsFromForm(form: { get(name: string): FormDataEntryValue | null; keys(): IterableIterator<string> }): DraftLine[] {
  const ids: string[] = [];
  for (const key of form.keys()) {
    if (key.startsWith('q:')) {
      const id = key.slice(2);
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.map((id) => {
    const str = (k: string) => (form.get(k)?.toString() ?? '');
    const note = str(FIELD.note(id)).trim();
    return {
      item_id: id,
      quantity: str(FIELD.quantity(id)),
      uom: str(FIELD.uom(id)),
      ...(note ? { note } : {}),
    };
  });
}

const READINESS_TEXT: Record<Exclude<Readiness, { ready: true }>['reason'], string> = {
  schema: 'Karbon ölçümü bu ortamda henüz etkin değil.',
  not_configured: 'Ölçüm ortağı bağlantısı bu ortamda yapılandırılmamış.',
  not_linked: 'Tesisiniz henüz ölçüm ortağına bağlanmadı. Bağlantıyı Green Gold ekibi kurar; kurulana kadar tüketim gönderilemez ve hesaplama yapılamaz.',
  environment: 'Tesis bağlantısı başka bir ortama ait (test/canlı); bağlantının yenilenmesi gerekiyor.',
  write_key: 'Ölçüm ortağına veri gönderme yetkisi tanımlı değil.',
  read_key: 'Ölçüm ortağından okuma yetkisi tanımlı değil; hesaplama yapılamaz.',
  profile: 'Hesaplama için önce tesis profilini doldurun.',
};

/** Bağlantı eksikliği (kullanıcının panelden çözemeyeceği durumlar) — tek bilgi kartıyla anlatılır. */
export function isLinkMissing(r: Readiness | null | undefined): boolean {
  return !!r && !r.ready && (r.reason === 'not_linked' || r.reason === 'not_configured' || r.reason === 'environment');
}

/** Bağlantı eksikken düğmelerin yanında tekrar edilen kısa gerekçe (uzun metin üstteki kartta). */
export const LINK_MISSING_SHORT = 'Ölçüm ortağı bağlantısı kurulunca kullanılabilir.';

export function readinessText(r: Readiness): string | null {
  return r.ready ? null : READINESS_TEXT[r.reason];
}

/** Kayıt için kullanıcıya gösterilecek açıklama (durum + varsa sağlayıcı iletisi). */
export function recordNote(record: ActivityRecord, now: Date): string | null {
  switch (record.status) {
    case 'rejected':
      return record.error_message
        ? `Ölçüm ortağı kabul etmedi: ${record.error_message}. Değeri düzeltip yeniden gönderin.`
        : 'Ölçüm ortağı kaydı kabul etmedi. Değeri kontrol edip yeniden gönderin.';
    case 'outcome_unknown':
      return 'Bağlantı yanıt vermeden kesildi. Yeniden göndermek güvenlidir; mükerrer kayıt oluşmaz.';
    case 'sending':
      return isSendingStale(record.sent_at, now)
        ? 'Gönderim tamamlanmadı. Yeniden göndermek güvenlidir.'
        : 'Gönderiliyor. Birkaç dakika sonra sayfayı yenileyin.';
    case 'accepted':
      return record.warnings.length ? `Uyarı: ${record.warnings.join(', ')}` : null;
  }
}
