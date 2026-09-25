import { BadRequestException } from '@nestjs/common';

export const HOTEL_FACTORS = {
  electricity_distribution: {
    value: 0.469,
    unit: 'kgCO2e/kWh',
    year: 2023,
    source: 'ETKB 2023 — dağıtım bağlantısı',
    url: 'https://enerji.gov.tr/evced-cevre-ve-iklim-elektrik-uretim-tuketim-emisyon-faktorleri',
  },
  electricity_transmission: {
    value: 0.436,
    unit: 'kgCO2e/kWh',
    year: 2023,
    source: 'ETKB 2023 — iletim bağlantısı',
    url: 'https://enerji.gov.tr/evced-cevre-ve-iklim-elektrik-uretim-tuketim-emisyon-faktorleri',
  },
  gas: {
    value: 0.18296,
    unit: 'kgCO2e/kWh (Gross CV)',
    year: 2025,
    source: 'DESNZ 2025 — Natural gas, 1_100_1004_6_1 (UK proxy)',
    url: 'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025',
  },
  diesel: {
    value: 2.66155,
    unit: 'kgCO2e/litre',
    year: 2025,
    source: 'DESNZ 2025 — mineral diesel, 1_101_1012_8_1 (UK proxy)',
    url: 'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025',
  },
};

export interface HotelCarbonInput {
  mode: 'consumption' | 'report';
  country: string;
  period_start: string;
  period_end: string;
  rooms: number;
  occupied_room_nights: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
  electricity_connection?: 'distribution' | 'transmission';
  electricity_kwh?: number;
  gas_kwh?: number;
  diesel_litres?: number;
  other_emissions_kg?: number;
  other_reference?: string;
  report_tonnes?: number;
  report_basis?: 'hotel_total' | 'guestrooms';
  report_reference?: string;
  assessor?: string;
}

const fail = (message: string): never => {
  throw new BadRequestException(message);
};
export function calculateHotelCarbon(
  raw: unknown,
  currency: string,
  now = new Date(),
) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return fail('Hesap bilgileri geçersiz.');
  const r = raw as Record<string, unknown>;
  const numeric = [
    'rooms',
    'occupied_room_nights',
    'total_area_m2',
    'guestrooms_area_m2',
    'meeting_area_m2',
    'electricity_kwh',
    'gas_kwh',
    'diesel_litres',
    'other_emissions_kg',
    'report_tonnes',
  ];
  const textual = [
    'mode',
    'country',
    'period_start',
    'period_end',
    'electricity_connection',
    'other_reference',
    'report_basis',
    'report_reference',
    'assessor',
  ];
  if (Object.keys(r).some((k) => ![...numeric, ...textual].includes(k)))
    return fail('Hesapta tanımsız alan var.');
  for (const key of textual)
    if (
      r[key] !== undefined &&
      (typeof r[key] !== 'string' || r[key].length > 300)
    )
      return fail('Metin alanları geçersiz.');
  for (const key of numeric)
    if (
      r[key] !== undefined &&
      (typeof r[key] !== 'number' ||
        !Number.isFinite(r[key]) ||
        r[key] < 0 ||
        r[key] > 1e9)
    )
      return fail('Tüketim ve alanlar negatif olmayan sayılar olmalı.');
  const i = { ...r } as unknown as HotelCarbonInput;
  if (!['consumption', 'report'].includes(i.mode) || !i.country?.trim())
    return fail('Hesap yöntemi ve ülke gerekli.');
  if (!['EUR', 'USD', 'TRY', 'GBP'].includes(currency))
    return fail('Para birimi desteklenmiyor.');
  for (const key of ['period_start', 'period_end'] as const) {
    const d = i[key];
    if (
      !d ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d).toISOString().slice(0, 10) !== d
    )
      return fail('Geçerli bir hesap dönemi girin.');
  }
  const days =
    (Date.parse(i.period_end) - Date.parse(i.period_start)) / 86400000 + 1;
  if (days < 1 || days > 366 || i.period_end > now.toISOString().slice(0, 10))
    return fail('Dönem en fazla 366 gün olmalı ve gelecek tarih içermemeli.');
  if (!Number.isInteger(i.rooms) || i.rooms <= 0)
    return fail('Oda sayısı pozitif bir tam sayı olmalı.');
  if (!Number.isInteger(i.occupied_room_nights) || i.occupied_room_nights <= 0)
    return fail('Dolu oda-gece pozitif bir tam sayı olmalı.');
  if (i.occupied_room_nights > i.rooms * days)
    return fail(
      `Dolu oda-gece bu dönem için en fazla ${i.rooms * days} olabilir.`,
    );
  if (
    !(i.total_area_m2 > 0) ||
    !(i.guestrooms_area_m2 > 0) ||
    i.meeting_area_m2 === undefined ||
    i.guestrooms_area_m2 + i.meeting_area_m2 > i.total_area_m2
  )
    return fail('Oda ve toplantı alanlarını toplam kapalı alana uygun girin.');
  const roomShare =
    i.guestrooms_area_m2 / (i.guestrooms_area_m2 + i.meeting_area_m2);
  let totalKg: number;
  let roomKg: number;
  let factors: (typeof HOTEL_FACTORS)[keyof typeof HOTEL_FACTORS][] = [];
  let breakdown: { label: string; kg: number }[] = [];
  if (i.mode === 'consumption') {
    if (i.country !== 'Turkey')
      return fail('Tüketim hesabı şu an Türkiye için kullanılabilir.');
    if (
      !['distribution', 'transmission'].includes(i.electricity_connection ?? '')
    )
      return fail('Elektrik bağlantı türünü seçin.');
    if (
      i.electricity_kwh === undefined ||
      i.gas_kwh === undefined ||
      i.diesel_litres === undefined ||
      i.other_emissions_kg === undefined
    )
      return fail('Kullanılmayan tüketimlere 0 girin.');
    if (i.other_emissions_kg > 0 && !i.other_reference?.trim())
      return fail('Diğer emisyonlar için kaynak belirtin.');
    const electricity =
      i.electricity_connection === 'transmission'
        ? HOTEL_FACTORS.electricity_transmission
        : HOTEL_FACTORS.electricity_distribution;
    factors = [
      electricity,
      ...(i.gas_kwh > 0 ? [HOTEL_FACTORS.gas] : []),
      ...(i.diesel_litres > 0 ? [HOTEL_FACTORS.diesel] : []),
    ];
    breakdown = [
      { label: 'Elektrik', kg: i.electricity_kwh * electricity.value },
      { label: 'Doğalgaz', kg: i.gas_kwh * HOTEL_FACTORS.gas.value },
      { label: 'Motorin', kg: i.diesel_litres * HOTEL_FACTORS.diesel.value },
      { label: 'Diğer kaynaklar', kg: i.other_emissions_kg },
    ];
    totalKg = breakdown.reduce((sum, item) => sum + item.kg, 0);
    roomKg = totalKg * roomShare;
    delete i.report_tonnes;
    delete i.report_basis;
    delete i.report_reference;
    delete i.assessor;
  } else {
    if (
      !(i.report_tonnes! > 0) ||
      !i.report_reference?.trim() ||
      !i.assessor?.trim() ||
      !['hotel_total', 'guestrooms'].includes(i.report_basis ?? '')
    )
      return fail('Rapor miktarı, kapsamı, kurum ve referans gerekli.');
    totalKg = i.report_tonnes! * 1000;
    roomKg = i.report_basis === 'guestrooms' ? totalKg : totalKg * roomShare;
    breakdown = [
      {
        label:
          i.report_basis === 'guestrooms'
            ? 'Konaklama emisyonu (rapor)'
            : 'Otel emisyonu (rapor)',
        kg: totalKg,
      },
    ];
    delete i.electricity_connection;
    delete i.electricity_kwh;
    delete i.gas_kwh;
    delete i.diesel_litres;
    delete i.other_emissions_kg;
    delete i.other_reference;
  }
  const coefficient = roomKg / i.occupied_room_nights;
  const amount =
    Math.round(((coefficient / 1000) * 25 + Number.EPSILON) * 100) / 100;
  if (
    !Number.isFinite(coefficient) ||
    coefficient <= 0 ||
    coefficient > 1000 ||
    amount > 1000
  )
    return fail(
      'Hesaplanan emisyon olağan dışı. Dönem, tüketim ve dolu oda-gece verilerini kontrol edin.',
    );
  const occupancyPercent = (i.occupied_room_nights / (i.rooms * days)) * 100;
  const intensityKgM2 = totalKg / i.total_area_m2;
  const annualizedIntensityKgM2 = intensityKgM2 * (365 / days);
  const warnings: string[] = [];
  if (occupancyPercent < 10)
    warnings.push(
      'Doluluk %10’un altında; oda-gece sonucu çok yüksek görünebilir.',
    );
  if (coefficient < 1 || coefficient > 200)
    warnings.push(
      'Oda-gece emisyonu geniş kontrol aralığının dışında; kaynak verileri yeniden kontrol edin.',
    );
  if (annualizedIntensityKgM2 > 1000)
    warnings.push(
      'Yıllıklandırılmış alan emisyon yoğunluğu çok yüksek; tüketim birimlerini kontrol edin.',
    );
  return {
    provider: 'hotel-input-demo',
    version: 'hotel-input-v1',
    country: i.country,
    state: '',
    hotel_class: '',
    data_year: Number(i.period_end.slice(0, 4)),
    url: '',
    unit: 'kgCO2e/roomnight',
    coefficient_kg: coefficient,
    amount_per_night: amount,
    price_per_tonne: 25,
    price_is_demo: true,
    currency,
    calculated_at: now.toISOString(),
    calculation_method:
      i.mode === 'report' ? 'Beyan edilen rapor' : 'Girilen tüketimler',
    input: i,
    total_kg: totalKg,
    guestrooms_kg: roomKg,
    room_share:
      i.mode === 'report' && i.report_basis === 'guestrooms' ? 1 : roomShare,
    occupancy_percent: occupancyPercent,
    intensity_kg_m2: intensityKgM2,
    factors,
    breakdown,
    warnings,
    verification: 'unverified' as const,
    scope:
      i.mode === 'report'
        ? 'Kullanıcı tarafından beyan edilen rapor kapsamı'
        : 'Girilen elektrik, doğalgaz, motorin ve ek emisyonlar; tam otel envanteri değildir.',
  };
}

export type HotelCarbonResult = ReturnType<typeof calculateHotelCarbon>;
