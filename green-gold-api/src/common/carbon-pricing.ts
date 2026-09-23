import { BadRequestException } from '@nestjs/common';
import { HFT_ROWS } from './hft-rows';

export const HFT_SOURCE = {
  provider: 'greenview-demo',
  version: '2026v1.1',
  data_year: 2024,
  retrieved: '2026-09-14',
  url: 'https://greenview.sg/resources/hotel-footprinting-tool/',
};

// Replace this provider boundary with the contracted API later.
export function carbonOptions() {
  return { source: HFT_SOURCE, rows: HFT_ROWS, demo_price_per_tonne: 25 };
}

export function calculateCarbonPricing(
  country: string,
  state: string,
  hotelClass: string,
  currency: string,
) {
  if (!['EUR', 'USD', 'TRY', 'GBP'].includes(currency)) {
    throw new BadRequestException(
      'Bu para birimi hesaplayıcıda desteklenmiyor.',
    );
  }
  const matches = HFT_ROWS.filter(
    (r) => r.country === country && r.state === state && r.class === hotelClass,
  );
  if (!country || !matches.length) {
    throw new BadRequestException(
      'Bu konum ve otel sınıfı için katsayı bulunamadı.',
    );
  }
  const coefficient =
    matches.reduce((sum, r) => sum + r.room, 0) / matches.length;
  // Synthetic demo price in the hotel's own currency, NOT a market quote or FX conversion.
  const price = carbonOptions().demo_price_per_tonne;
  const amount =
    Math.round(((coefficient / 1000) * price + Number.EPSILON) * 100) / 100;
  if (amount <= 0 || amount > 1000)
    throw new BadRequestException(
      'Hesaplanan tutar desteklenen aralıkta değil.',
    );
  return {
    ...HFT_SOURCE,
    country,
    state,
    hotel_class: hotelClass,
    coefficient_kg: coefficient,
    unit: 'kgCO2e/roomnight',
    calculation_method: [...new Set(matches.map((r) => r.room_method))].join(
      ' / ',
    ),
    price_per_tonne: price,
    price_is_demo: true,
    currency,
    amount_per_night: amount,
    calculated_at: new Date().toISOString(),
  };
}

export type CarbonPricing = ReturnType<typeof calculateCarbonPricing>;
