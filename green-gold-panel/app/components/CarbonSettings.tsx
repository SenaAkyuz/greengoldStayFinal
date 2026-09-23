'use client';
import { useState } from 'react';
import type { CarbonOptions, HotelInfo } from '@/lib/api';
import { CarbonPricingCalculator } from './CarbonPricingCalculator';
import { HotelCarbonCalculator } from './HotelCarbonCalculator';

export function CarbonSettings({ hotel, options, disabled }: { hotel: HotelInfo; options: CarbonOptions | null; disabled: boolean }) {
  const [mode, setMode] = useState(hotel.carbon_pricing?.provider === 'hotel-input-demo' ? 'hotel' : 'regional');
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Hesap yöntemi">
      {[['regional', 'Bölgesel tahmin'], ['hotel', 'Otele özgü hesap']].map(([value, label]) => <button key={value} type="button" disabled={disabled} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-full px-5 py-2.5 text-sm font-medium ${mode === value ? 'bg-[#075442] text-white' : 'border border-neutral-200 bg-white text-neutral-600'}`}>{label}</button>)}
    </div>
    <input type="hidden" name="carbon_mode" value={mode} />
    {mode === 'hotel' ? <HotelCarbonCalculator hotel={hotel} options={options} disabled={disabled} /> : <CarbonPricingCalculator hotel={hotel} options={options} disabled={disabled} />}
  </div>;
}
