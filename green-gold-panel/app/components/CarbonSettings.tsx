'use client';
import { useState } from 'react';
import type { CarbonOptions, CarbonProviderStatus, HotelInfo } from '@/lib/api';
import { CarbonPricingCalculator } from './CarbonPricingCalculator';
import { HotelCarbonCalculator } from './HotelCarbonCalculator';
import { CarbonProviderPanel } from './CarbonProviderPanel';

/**
 * Üç hesap kaynağı, önem sırasıyla:
 *   1. 3pmetrics ölçümü   — hedeflenen ana akış (sağlayıcı sözleşmesi bekliyor)
 *   2. Otele özgü hesap   — otelin kendi tüketim/rapor girdisi (çalışıyor)
 *   3. Bölgesel tahmin    — Greenview oda-gece katsayısı (çalışıyor)
 *
 * Varsayılan sekme, otelin O AN kullandığı kaynaktır — mevcut oteller için
 * davranış değişmez.
 */
type Mode = 'provider' | 'hotel' | 'regional';

function initialMode(hotel: HotelInfo, status: CarbonProviderStatus | null): Mode {
  if (status?.active_source === 'provider_measurement') return 'provider';
  return hotel.carbon_pricing?.provider === 'hotel-input-demo'
    ? 'hotel'
    : 'regional';
}

const TABS: [Mode, string][] = [
  ['provider', '3pmetrics ölçümü'],
  ['hotel', 'Otele özgü hesap'],
  ['regional', 'Bölgesel tahmin'],
];

export function CarbonSettings({
  hotel,
  options,
  providerStatus,
  disabled,
}: {
  hotel: HotelInfo;
  options: CarbonOptions | null;
  providerStatus: CarbonProviderStatus | null;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>(() => initialMode(hotel, providerStatus));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Hesap yöntemi">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-full px-5 py-2.5 text-sm font-medium ${mode === value ? 'bg-[#075442] text-white' : 'border border-neutral-200 bg-white text-neutral-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* 'provider' modunda form karbon alanı GÖNDERMEZ — ölçüm sağlayıcıdan
          gelir, panelden elle girilmez. */}
      <input type="hidden" name="carbon_mode" value={mode} />
      {mode === 'provider' ? (
        <CarbonProviderPanel
          hotel={hotel}
          status={providerStatus}
          disabled={disabled}
        />
      ) : mode === 'hotel' ? (
        <HotelCarbonCalculator hotel={hotel} options={options} disabled={disabled} />
      ) : (
        <CarbonPricingCalculator hotel={hotel} options={options} disabled={disabled} />
      )}
    </div>
  );
}
