import { NormalizedEventValidationError } from '../normalized-event';
import {
  HotelRunnerAdapter,
  mapHotelRunnerReservation,
} from './hotelrunner.adapter';
import { hrPushBody, hrReservation } from '../../../test/hotelrunner-fixtures';

const CTX = { hrId: '12345', productCode: 'GREENGOLD' };

describe('mapHotelRunnerReservation', () => {
  it('kodu eşleşen ekstra -> seçili katkı, kuruş cinsinden tutar', () => {
    const event = mapHotelRunnerReservation(hrReservation(), CTX);
    expect(event).toEqual({
      schema_version: 1,
      provider: 'hotelrunner',
      provider_event_id: 'R377873409:2026-02-23T16:32:20.000+03:00:reserved',
      provider_reservation_id: 'R377873409',
      property_id: '12345',
      reservation_status: 'confirmed',
      greengold: {
        selected: true,
        amount_minor: 3750,
        currency: 'TRY',
        line_item_reference: 'GREENGOLD',
        payment_status: 'pending',
      },
      occurred_at: '2026-02-23T13:32:20.000Z',
    });
  });

  it('kod boşsa ada göre eşleşir (büyük/küçük harf duyarsız)', () => {
    const event = mapHotelRunnerReservation(hrReservation(), {
      hrId: '12345',
      productCode: 'green gold karbon katkısı',
    });
    expect(event.greengold.selected).toBe(true);
    expect(event.greengold.amount_minor).toBe(3750);
  });

  it('birden fazla odadaki satırlar toplanır', () => {
    const room = (total: number) => ({
      extras: [{ code: 'GREENGOLD', is_extra: true, total }],
    });
    const event = mapHotelRunnerReservation(
      hrReservation({ rooms: [room(10.1), room(20.2)] }),
      CTX,
    );
    expect(event.greengold.amount_minor).toBe(3030);
  });

  it('ekstra seçilmemişse selected=false, tutar 0', () => {
    const event = mapHotelRunnerReservation(
      hrReservation({ rooms: [{ extras: [] }] }),
      CTX,
    );
    expect(event.greengold).toEqual({
      selected: false,
      amount_minor: 0,
      currency: 'TRY',
      payment_status: 'pending',
    });
  });

  it('is_extra olmayan (vergi) satırı Green Gold sayılmaz', () => {
    const event = mapHotelRunnerReservation(
      hrReservation({
        rooms: [{ extras: [{ name: 'GREENGOLD', total: 5 }] }],
      }),
      CTX,
    );
    expect(event.greengold.selected).toBe(false);
  });

  it('confirmed -> confirmed; canceled -> cancelled + voided', () => {
    expect(
      mapHotelRunnerReservation(hrReservation({ state: 'confirmed' }), CTX)
        .reservation_status,
    ).toBe('confirmed');
    const cancelled = mapHotelRunnerReservation(
      hrReservation({ state: 'canceled' }),
      CTX,
    );
    expect(cancelled.reservation_status).toBe('cancelled');
    expect(cancelled.greengold.payment_status).toBe('voided');
  });

  it('bilinmeyen durum -> unsupported_reservation_state', () => {
    const err = (() => {
      try {
        mapHotelRunnerReservation(hrReservation({ state: 'checked_in' }), CTX);
      } catch (e) {
        return e as NormalizedEventValidationError;
      }
    })();
    expect(err?.code).toBe('unsupported_reservation_state');
  });

  it('hr_number yoksa reddedilir', () => {
    expect(() =>
      mapHotelRunnerReservation(hrReservation({ hr_number: null }), CTX),
    ).toThrow(NormalizedEventValidationError);
  });

  it('negatif tutar reddedilir', () => {
    expect(() =>
      mapHotelRunnerReservation(
        hrReservation({
          rooms: [
            { extras: [{ code: 'GREENGOLD', is_extra: true, total: -1 }] },
          ],
        }),
        CTX,
      ),
    ).toThrow(NormalizedEventValidationError);
  });
});

describe('HotelRunnerAdapter', () => {
  const adapter = new HotelRunnerAdapter();
  const base = { rawBody: Buffer.from(''), headers: {} };

  it('URL token secret ile eşleşirse doğrular', () => {
    expect(
      adapter.verifySignature({
        ...base,
        query: { token: 'hr-token-123', hr_id: '12345' },
        secret: 'hr-token-123',
      }),
    ).toBe(true);
  });

  it('yanlış/eksik token veya hr_id -> reddedilir', () => {
    const secret = 'hr-token-123';
    expect(
      adapter.verifySignature({
        ...base,
        query: { token: 'hr-token-124', hr_id: '12345' },
        secret,
      }),
    ).toBe(false);
    expect(
      adapter.verifySignature({ ...base, query: { hr_id: '12345' }, secret }),
    ).toBe(false);
    expect(
      adapter.verifySignature({ ...base, query: { token: secret }, secret }),
    ).toBe(false);
  });

  it('push gövdesindeki her rezervasyon ayrı sonuç üretir; bozuk olan diğerini durdurmaz', () => {
    const results = adapter.parseEvents({
      rawBody: hrPushBody([
        hrReservation(),
        hrReservation({ hr_number: 'R2', state: 'mystery' }),
      ]),
      query: { hr_id: '12345' },
      productCode: 'GREENGOLD',
    });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    const second = results[1];
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error.code).toBe(
      'unsupported_reservation_state',
    );
  });

  it("form alanı 'data' yoksa veya JSON bozuksa zarf hatası fırlatır", () => {
    const parse = (raw: string) => () =>
      adapter.parseEvents({
        rawBody: Buffer.from(raw),
        query: { hr_id: '12345' },
        productCode: 'GREENGOLD',
      });
    expect(parse('foo=bar')).toThrow(NormalizedEventValidationError);
    expect(parse('data=%7Bbroken')).toThrow(NormalizedEventValidationError);
    expect(parse('data=%7B%7D')).toThrow(NormalizedEventValidationError);
  });
});
