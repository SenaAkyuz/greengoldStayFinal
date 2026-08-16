/**
 * Rezervasyon/ödeme durum geçiş kuralları (Faz 2 çekirdeği).
 *
 * Bu modül SAF bir karar fonksiyonudur — hiçbir DB erişimi yapmaz. Mevcut
 * (varsa) reservation/contribution "anlık görüntüsünü" ve gelen normalized
 * event'i alır, ne yapılması gerektiğine karar verir:
 *   - apply: reservation/contribution şu patch'lerle yazılabilir.
 *   - manual_review: veri riskli/belirsiz — YALNIZCA güvenli kısım (varsa
 *     reservation durumu) uygulanır, finansal alan (contribution) DOKUNULMAZ;
 *     delivery kaydı 'manual_review' olarak işaretlenir.
 *   - reject: event tamamen göz ardı edilir (ör. eski/out-of-order), hiçbir
 *     domain yazımı yapılmaz.
 *
 * Tasarım kararı — reservation_status ve payment_status BAĞIMSIZ boyutlardır:
 * normalized kontrat ikisini ayrı alanlar olarak taşır (reservation_status
 * üst seviyede, payment_status greengold içinde). Bu modül reservation_status'u
 * payment_status'tan ASLA türetmez (ör. "cancelled geldi -> otomatik refunded
 * say" YAPILMAZ) — payment durumunun tek kaynağı, sağlayıcının o event'te
 * bildirdiği greengold.payment_status'tur. Bu, senaryo #5 ("cancelled ->
 * contribution voided veya refund bekleyen politika")'ı şöyle çözer: cancel
 * event'i reservation'ı 'cancelled' yapar; contribution yalnızca event AÇIKÇA
 * 'refunded'/'voided'/'partially_refunded' derse değişir — aksi halde "henüz
 * tahsilat/iade bilgisi gelmedi" anlamına gelen mevcut durumunda kalır
 * (bekleyen/pending refund politikası).
 */

import type {
  NormalizedReservationEvent,
  PaymentStatus,
  ReservationStatus,
} from './normalized-event';

export interface ReservationSnapshot {
  booking_status: ReservationStatus;
  /** Son işlenen event'in occurred_at'i (ISO) — out-of-order tespiti için. */
  provider_updated_at: string | null;
}

export interface ContributionSnapshot {
  status: PaymentStatus;
  currency: string;
  amount_minor: number;
}

export interface ReservationPatch {
  booking_status: ReservationStatus;
  provider_updated_at: string;
}

export interface ContributionPatch {
  selected: boolean;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  line_item_reference: string | null;
  collected_at?: string;
  refunded_at?: string;
}

export type StateDecision =
  | {
      kind: 'apply';
      deliveryStatus: 'processed';
      reservationPatch: ReservationPatch;
      contributionPatch: ContributionPatch | null;
    }
  | {
      kind: 'manual_review';
      deliveryStatus: 'manual_review';
      errorCode: string;
      // Belirsizlik reservation GEÇİŞİNİN kendisiyse (invalid_reservation_transition)
      // null: hiçbir şey uygulanmaz, mevcut durum korunur. Belirsizlik yalnızca
      // finansal tarafsa (currency/no_show kararı) reservation durumu zaten
      // geçerli bir geçiş olarak doğrulanmıştır — o zaman patch uygulanır,
      // yalnızca contribution kasıtlı olarak DOKUNULMAZ.
      reservationPatch: ReservationPatch | null;
    }
  | {
      kind: 'reject';
      deliveryStatus: 'rejected_out_of_order' | 'rejected_invalid_payload';
      errorCode: string;
    };

const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> =
  {
    confirmed: ['confirmed', 'modified', 'cancelled', 'no_show', 'stayed'],
    modified: ['modified', 'cancelled', 'no_show', 'stayed'],
    // Terminal durumlar: aynı durumun tekrarı (idempotent re-apply) hariç yeni
    // geçiş kabul edilmez.
    cancelled: ['cancelled'],
    no_show: ['no_show'],
    stayed: ['stayed'],
  };

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['pending', 'collected', 'voided'],
  collected: ['collected', 'refunded', 'partially_refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  refunded: ['refunded'],
  voided: ['voided'],
};

function reservationPatchFrom(
  event: NormalizedReservationEvent,
): ReservationPatch {
  return {
    booking_status: event.reservation_status,
    provider_updated_at: event.occurred_at,
  };
}

function contributionPatchFrom(
  event: NormalizedReservationEvent,
  effectiveStatus: PaymentStatus,
  prev: ContributionSnapshot | null,
): ContributionPatch {
  const patch: ContributionPatch = {
    selected: event.greengold.selected,
    amount_minor: event.greengold.amount_minor,
    currency: event.greengold.currency,
    status: effectiveStatus,
    line_item_reference: event.greengold.line_item_reference ?? null,
  };
  if (effectiveStatus === 'collected' && prev?.status !== 'collected') {
    patch.collected_at = event.occurred_at;
  }
  if (
    (effectiveStatus === 'refunded' ||
      effectiveStatus === 'partially_refunded') &&
    prev?.status !== 'refunded' &&
    prev?.status !== 'partially_refunded'
  ) {
    patch.refunded_at = event.occurred_at;
  }
  return patch;
}

/**
 * Ana karar fonksiyonu.
 *
 * @param prevReservation Bu provider_reservation_id için mevcut satır (yoksa null).
 * @param prevContribution Bu rezervasyonun aktif (voided olmayan) katkısı (yoksa null).
 */
export function decideStateTransition(
  event: NormalizedReservationEvent,
  prevReservation: ReservationSnapshot | null,
  prevContribution: ContributionSnapshot | null,
): StateDecision {
  // 1) Out-of-order koruması: yeni event, son işlenenden ESKİYSE reddedilir —
  //    hiçbir alan güncellenmez (finansal toplam şişmesin / durum geriye
  //    kaymasın). Eşit zaman damgası idempotent re-apply sayılır (aşağı devam).
  if (
    prevReservation?.provider_updated_at &&
    Date.parse(event.occurred_at) <
      Date.parse(prevReservation.provider_updated_at)
  ) {
    return {
      kind: 'reject',
      deliveryStatus: 'rejected_out_of_order',
      errorCode: 'stale_event',
    };
  }

  // 2) Senaryo #10 — reservation hiç yoksa YALNIZCA 'confirmed' bir baseline
  //    kurabilir. Refund/cancel/modify gibi bir event confirmed'dan ÖNCE
  //    gelirse (kayıp/gecikmiş bir confirmed event ihtimali) insan gözden
  //    geçirmesi gerekir — sessizce reddedip kaybetmek yerine 'manual_review'
  //    ile iz bırakılır, hiçbir reservation/contribution satırı YARATILMAZ.
  if (!prevReservation && event.reservation_status !== 'confirmed') {
    return {
      kind: 'reject',
      deliveryStatus: 'rejected_invalid_payload',
      errorCode: 'no_baseline_reservation',
    };
  }

  // 3) Reservation durum geçişi geçerli mi?
  if (prevReservation) {
    const allowed = RESERVATION_TRANSITIONS[prevReservation.booking_status];
    const isSameStatus =
      event.reservation_status === prevReservation.booking_status;
    if (!isSameStatus && !allowed.includes(event.reservation_status)) {
      return {
        kind: 'manual_review',
        deliveryStatus: 'manual_review',
        errorCode: 'invalid_reservation_transition',
        // Geçişin kendisi şüpheli -> HİÇBİR ŞEY uygulanmaz (mevcut reservation
        // durumu korunur), insan gözden geçirmesi bekler.
        reservationPatch: null,
      };
    }
  }

  const reservationPatch = reservationPatchFrom(event);

  // 4) Senaryo #13 — para birimi uyuşmazlığı: mevcut aktif katkı zaten bir
  //    currency taşıyorsa ve gelen event FARKLI bir currency bildiriyorsa,
  //    finansal veriye DOKUNULMAZ (sessizce değiştirilmez/reddedilmez) —
  //    reservation durumu yine de güncellenir (parasal risk taşımaz),
  //    delivery 'manual_review' ile işaretlenir.
  if (
    prevContribution &&
    prevContribution.currency !== event.greengold.currency &&
    // amount_minor=0 + currency farklı olması pratikte anlamsız (seçilmemiş
    // satırda para birimi zaten önemsiz) — yalnızca gerçek tutar taşıyan
    // event'lerde currency uyuşmazlığını "riskli" sayarız.
    event.greengold.amount_minor > 0
  ) {
    return {
      kind: 'manual_review',
      deliveryStatus: 'manual_review',
      errorCode: 'currency_mismatch',
      reservationPatch,
    };
  }

  // 5) selected=false -> HER ZAMAN 'voided' (bkz. modül üstü not — provider'ın
  //    bildirdiği payment_status'tan bağımsız; "seçilmedi" tanım gereği aktif
  //    bir finansal kalem bırakmaz).
  const effectivePaymentStatus: PaymentStatus = event.greengold.selected
    ? event.greengold.payment_status
    : 'voided';

  // 6) Payment durum geçişi geçerli mi?
  if (prevContribution) {
    const allowed = PAYMENT_TRANSITIONS[prevContribution.status];
    const isSameStatus = effectivePaymentStatus === prevContribution.status;
    if (!isSameStatus && !allowed.includes(effectivePaymentStatus)) {
      return {
        kind: 'manual_review',
        deliveryStatus: 'manual_review',
        errorCode: 'invalid_payment_transition',
        reservationPatch,
      };
    }
  }

  // 7) Senaryo #8 — no_show: ürün kararı yoksa OTOMATİK VARSAYIM YAPMA.
  //    Rezervasyon no_show'a geçerken katkı hâlâ 'collected' ve event de
  //    hâlâ 'collected' diyorsa (yani provider "ne yapılacağını" henüz
  //    bildirmedi), reservation durumu uygulanır ama insan kararı beklendiği
  //    açıkça işaretlenir.
  if (
    event.reservation_status === 'no_show' &&
    prevContribution?.status === 'collected' &&
    effectivePaymentStatus === 'collected'
  ) {
    return {
      kind: 'manual_review',
      deliveryStatus: 'manual_review',
      errorCode: 'no_show_payment_decision_pending',
      reservationPatch,
    };
  }

  return {
    kind: 'apply',
    deliveryStatus: 'processed',
    reservationPatch,
    contributionPatch: contributionPatchFrom(
      event,
      effectivePaymentStatus,
      prevContribution,
    ),
  };
}
