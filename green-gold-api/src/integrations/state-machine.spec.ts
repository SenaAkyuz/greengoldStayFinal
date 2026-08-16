import { decideStateTransition } from './state-machine';
import type { NormalizedReservationEvent } from './normalized-event';

function event(
  over: Partial<NormalizedReservationEvent> = {},
): NormalizedReservationEvent {
  return {
    schema_version: 1,
    provider: 'generic_signed_webhook',
    provider_event_id: 'evt-1',
    provider_reservation_id: 'res-1',
    property_id: 'prop-1',
    reservation_status: 'confirmed',
    occurred_at: '2026-01-01T10:00:00.000Z',
    greengold: {
      selected: true,
      amount_minor: 500,
      currency: 'EUR',
      payment_status: 'collected',
    },
    ...over,
  };
}

describe('decideStateTransition', () => {
  it('#1 confirmed + selected + collected -> apply (yeni rezervasyon + katkı)', () => {
    const decision = decideStateTransition(event(), null, null);
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.reservationPatch.booking_status).toBe('confirmed');
      expect(decision.contributionPatch?.status).toBe('collected');
      expect(decision.contributionPatch?.collected_at).toBeTruthy();
    }
  });

  it('#2 confirmed + not selected + amount 0 -> apply, contribution "voided" olarak yazılır', () => {
    const decision = decideStateTransition(
      event({
        greengold: {
          selected: false,
          amount_minor: 0,
          currency: 'EUR',
          payment_status: 'pending',
        },
      }),
      null,
      null,
    );
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.contributionPatch?.status).toBe('voided');
      expect(decision.contributionPatch?.selected).toBe(false);
    }
  });

  it('#3 aynı durumun tekrarı (idempotent re-apply) -> apply, hata değil', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T10:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event(),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
  });

  it('#4 modified: tutar değişmeden güncelleme -> apply', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({ reservation_status: 'modified' }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.reservationPatch.booking_status).toBe('modified');
      expect(decision.contributionPatch?.amount_minor).toBe(500);
    }
  });

  it('#5 cancelled: event payment_status hâlâ collected ise contribution DOKUNULMAZ değil, verilen değerle güncellenir (bekleyen refund politikası olay bazlı)', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({
        reservation_status: 'cancelled',
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          payment_status: 'collected',
        },
      }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.reservationPatch.booking_status).toBe('cancelled');
      // Provider henüz refund bildirmedi -> collected olarak kalır (icat edilmiş refund yok).
      expect(decision.contributionPatch?.status).toBe('collected');
    }
  });

  it('#6 refunded event -> collected -> refunded, refunded_at set edilir', () => {
    const prevReservation = {
      booking_status: 'cancelled' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({
        reservation_status: 'cancelled',
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          payment_status: 'refunded',
        },
      }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.contributionPatch?.status).toBe('refunded');
      expect(decision.contributionPatch?.refunded_at).toBeTruthy();
    }
  });

  it('#7 kısmi iade -> collected -> partially_refunded', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          payment_status: 'partially_refunded',
        },
      }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
    if (decision.kind === 'apply') {
      expect(decision.contributionPatch?.status).toBe('partially_refunded');
    }
  });

  it('#8 no_show + hâlâ collected + karar bildirilmedi -> manual_review, contribution dokunulmaz', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({ reservation_status: 'no_show' }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('manual_review');
    if (decision.kind === 'manual_review') {
      expect(decision.errorCode).toBe('no_show_payment_decision_pending');
      expect(decision.reservationPatch?.booking_status).toBe('no_show');
    }
  });

  it('#8b no_show + provider AÇIKÇA refunded diyorsa -> apply (karar zaten verilmiş)', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({
        reservation_status: 'no_show',
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          payment_status: 'refunded',
        },
      }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('apply');
  });

  it('#9 stayed -> apply', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const decision = decideStateTransition(
      event({ reservation_status: 'stayed' }),
      prevReservation,
      null,
    );
    expect(decision.kind).toBe('apply');
  });

  it('#10 out-of-order: rezervasyon hiç yoksa yalnızca confirmed baseline kurabilir', () => {
    const decision = decideStateTransition(
      event({ reservation_status: 'cancelled' }),
      null,
      null,
    );
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') {
      expect(decision.errorCode).toBe('no_baseline_reservation');
    }
  });

  it('eski (stale) event -> reddedilir, hiçbir alan güncellenmez', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-02T00:00:00.000Z',
    };
    const decision = decideStateTransition(
      event({ occurred_at: '2026-01-01T00:00:00.000Z' }),
      prevReservation,
      null,
    );
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') {
      expect(decision.deliveryStatus).toBe('rejected_out_of_order');
    }
  });

  it('#13 currency uyuşmazlığı -> manual_review, reservation güncellenir ama contribution dokunulmaz', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'collected' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({
        reservation_status: 'modified',
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'USD',
          payment_status: 'collected',
        },
      }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('manual_review');
    if (decision.kind === 'manual_review') {
      expect(decision.errorCode).toBe('currency_mismatch');
      expect(decision.reservationPatch?.booking_status).toBe('modified');
    }
  });

  it('geçersiz reservation geçişi (terminal durumdan geri) -> manual_review, HİÇBİR ŞEY uygulanmaz', () => {
    const prevReservation = {
      booking_status: 'stayed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const decision = decideStateTransition(
      event({
        reservation_status: 'confirmed',
        occurred_at: '2026-01-02T00:00:00.000Z',
      }),
      prevReservation,
      null,
    );
    expect(decision.kind).toBe('manual_review');
    if (decision.kind === 'manual_review') {
      expect(decision.errorCode).toBe('invalid_reservation_transition');
      expect(decision.reservationPatch).toBeNull();
    }
  });

  it('geçersiz payment geçişi (refunded -> collected) -> manual_review', () => {
    const prevReservation = {
      booking_status: 'confirmed' as const,
      provider_updated_at: '2026-01-01T09:00:00.000Z',
    };
    const prevContribution = {
      status: 'refunded' as const,
      currency: 'EUR',
      amount_minor: 500,
    };
    const decision = decideStateTransition(
      event({ occurred_at: '2026-01-02T00:00:00.000Z' }),
      prevReservation,
      prevContribution,
    );
    expect(decision.kind).toBe('manual_review');
    if (decision.kind === 'manual_review') {
      expect(decision.errorCode).toBe('invalid_payment_transition');
    }
  });
});
