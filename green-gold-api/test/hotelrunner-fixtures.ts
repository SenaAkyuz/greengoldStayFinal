import type { HotelRunnerReservation } from '../src/integrations/adapters/hotelrunner.adapter';

/** HotelRunner dokümanındaki örnek rezervasyonun bu adapter'ı ilgilendiren kısmı. */
export function hrReservation(
  over: Record<string, unknown> = {},
): HotelRunnerReservation {
  return {
    hr_number: 'R377873409',
    state: 'reserved',
    currency: 'TRY',
    completed_at: '2026-02-23T16:28:12.000+03:00',
    updated_at: '2026-02-23T16:32:20.000+03:00',
    rooms: [
      {
        extras: [
          {
            name: 'Airport Transfer',
            price: 20.0,
            code: '',
            is_extra: true,
            total: 20.0,
          },
          {
            name: 'Green Gold Karbon Katkısı',
            code: 'GREENGOLD',
            is_extra: true,
            total: 37.5,
          },
          {
            name: 'VAT10 (10.0% Included in price)',
            price: 11.6,
            included_in_price: true,
          },
        ],
      },
    ],
    ...over,
  };
}

export function hrPushBody(reservations: unknown[]): Buffer {
  return Buffer.from(
    new URLSearchParams({
      data: JSON.stringify({ reservations }),
    }).toString(),
  );
}
