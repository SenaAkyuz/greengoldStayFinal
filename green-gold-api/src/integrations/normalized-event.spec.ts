import {
  NormalizedEventValidationError,
  validateNormalizedReservationEvent,
} from './normalized-event';

function validEvent(over: Record<string, unknown> = {}) {
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

describe('validateNormalizedReservationEvent', () => {
  it('geçerli event -> kabul edilir', () => {
    const event = validateNormalizedReservationEvent(validEvent());
    expect(event.provider_reservation_id).toBe('res-1');
    expect(event.greengold.amount_minor).toBe(500);
  });

  it('nesne değilse reddedilir', () => {
    expect(() => validateNormalizedReservationEvent('not-an-object')).toThrow(
      NormalizedEventValidationError,
    );
    expect(() => validateNormalizedReservationEvent(null)).toThrow(
      NormalizedEventValidationError,
    );
    expect(() => validateNormalizedReservationEvent([1, 2])).toThrow(
      NormalizedEventValidationError,
    );
  });

  it('bilinmeyen üst düzey alan -> reddedilir', () => {
    expect(() =>
      validateNormalizedReservationEvent(validEvent({ extra_field: 'x' })),
    ).toThrow(/Bilinmeyen alan/);
  });

  it('bilinmeyen greengold alanı -> reddedilir', () => {
    const bad = validEvent();
    (bad.greengold as Record<string, unknown>).card_number = '4111';
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /Bilinmeyen greengold alanı/,
    );
  });

  it('desteklenmeyen schema_version -> reddedilir', () => {
    expect(() =>
      validateNormalizedReservationEvent(validEvent({ schema_version: 2 })),
    ).toThrow(/schema_version/);
  });

  it('reservation_status geçersiz -> reddedilir', () => {
    expect(() =>
      validateNormalizedReservationEvent(
        validEvent({ reservation_status: 'checked_in' }),
      ),
    ).toThrow(NormalizedEventValidationError);
  });

  it('occurred_at geçersiz timestamp -> reddedilir', () => {
    expect(() =>
      validateNormalizedReservationEvent(
        validEvent({ occurred_at: 'yesterday' }),
      ),
    ).toThrow(/occurred_at/);
  });

  it('amount_minor negatif -> reddedilir', () => {
    const bad = validEvent();
    (bad.greengold as Record<string, unknown>).amount_minor = -1;
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /amount_minor/,
    );
  });

  it('amount_minor ondalık (tam sayı değil) -> reddedilir', () => {
    const bad = validEvent();
    (bad.greengold as Record<string, unknown>).amount_minor = 5.5;
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /amount_minor/,
    );
  });

  it('amount_minor güvenli üst sınırı aşarsa -> reddedilir', () => {
    const bad = validEvent();
    (bad.greengold as Record<string, unknown>).amount_minor = 999_999_999;
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /amount_minor/,
    );
  });

  it('selected=false iken amount_minor 0 olmalı — değilse reddedilir (#2)', () => {
    const bad = validEvent({
      greengold: {
        selected: false,
        amount_minor: 5,
        currency: 'EUR',
        payment_status: 'pending',
      },
    });
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /selected=false/,
    );
  });

  it('selected=false + amount_minor=0 -> kabul edilir (#2)', () => {
    const event = validateNormalizedReservationEvent(
      validEvent({
        greengold: {
          selected: false,
          amount_minor: 0,
          currency: 'EUR',
          payment_status: 'pending',
        },
      }),
    );
    expect(event.greengold.selected).toBe(false);
    expect(event.greengold.amount_minor).toBe(0);
  });

  it('currency 3 büyük harf değilse reddedilir', () => {
    for (const bad of ['eur', 'EU', 'EURO', '123']) {
      const evt = validEvent();
      (evt.greengold as Record<string, unknown>).currency = bad;
      expect(() => validateNormalizedReservationEvent(evt)).toThrow(/currency/);
    }
  });

  it('payment_status geçersiz -> reddedilir', () => {
    const bad = validEvent();
    (bad.greengold as Record<string, unknown>).payment_status = 'paid';
    expect(() => validateNormalizedReservationEvent(bad)).toThrow(
      /payment_status/,
    );
  });

  it('line_item_reference opsiyonel — verilirse string olmalı', () => {
    const event = validateNormalizedReservationEvent(
      validEvent({
        greengold: {
          selected: true,
          amount_minor: 500,
          currency: 'EUR',
          payment_status: 'collected',
          line_item_reference: 'LI-42',
        },
      }),
    );
    expect(event.greengold.line_item_reference).toBe('LI-42');
  });
});
