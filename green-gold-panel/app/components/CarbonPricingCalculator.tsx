'use client';

import { useEffect, useState } from 'react';
import type { CarbonOptions, HotelInfo } from '@/lib/api';

const input = 'mt-2 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm';
const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const classLabel = (value: string) => value === 'All Hotels' ? 'Tüm otel sınıfları' : value.replace(' Star', ' yıldız');

export function CarbonPricingCalculator({ hotel, options, disabled }: { hotel: HotelInfo; options: CarbonOptions | null; disabled: boolean }) {
  const saved = hotel.carbon_pricing;
  const rows = options?.rows ?? [];
  const savedCountry = rows.some(r => r.country === saved?.country) ? saved?.country ?? '' : '';
  const savedRegion = rows.some(r => r.country === savedCountry && r.state === saved?.state) ? saved?.state ?? '' : '';
  const savedClasses = rows.filter(r => r.country === savedCountry && r.state === savedRegion).map(r => r.class);
  const savedClass = savedClasses.includes(saved?.hotel_class ?? '')
    ? saved?.hotel_class ?? ''
    : savedClasses.includes('All Hotels') ? 'All Hotels' : savedClasses[0] ?? '';
  const [country, setCountry] = useState(savedCountry);
  const [region, setRegion] = useState(savedRegion);
  const [hotelClass, setHotelClass] = useState(savedClass);
  const [nights, setNights] = useState('3');
  if (!options) return <section role="alert" className="gg-card p-6">Karbon hesaplayıcı yüklenemedi. API bağlantısını kontrol edin. Mevcut gecelik tutar korunur.</section>;

  const countries = sorted(options.rows.map(r => r.country));
  const countryRows = options.rows.filter(r => r.country === country);
  const regions = sorted(countryRows.filter(r => r.state).map(r => r.state));
  const hasCountryWide = countryRows.some(r => !r.state);
  const classes = sorted(countryRows.filter(r => r.state === region).map(r => r.class));
  const matches = options.rows.filter(r => r.country === country && r.state === region && r.class === hotelClass);
  const coefficient = matches.length ? matches.reduce((sum, r) => sum + r.room, 0) / matches.length : null;
  const supported = ['EUR', 'USD', 'TRY', 'GBP'].includes(hotel.currency);
  const amount = coefficient === null ? null : Math.round((coefficient / 1000 * options.demo_price_per_tonne + Number.EPSILON) * 100) / 100;
  const valid = supported && amount !== null && amount > 0 && amount <= 1000;
  const count = Number(nights);
  const validNights = Number.isInteger(count) && count >= 1 && count <= 365;
  const money = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${hotel.currency}`;
  const num = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

  return <section className="gg-card overflow-hidden">
    {hotel.role === 'demo_viewer' && <DemoPreviewSync amount={valid ? amount : null} coefficient={valid ? coefficient : null} currency={hotel.currency} />}
    <div className="border-b border-emerald-100 bg-emerald-50/60 p-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Karbon ve katkı hesabı</span>
      <h2 className="mt-2 text-xl font-semibold text-[#17372d]">Oteliniz için gecelik katkıyı hesaplayın</h2>
      <p className="mt-2 text-sm text-neutral-600">Greenview bölgesel katsayısı.</p>
    </div>
    <fieldset disabled={disabled} className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">1. Ülke
          <select className={input} value={country} onChange={e => {
            const nextCountry = e.target.value;
            const nextRows = options.rows.filter(r => r.country === nextCountry);
            const nextRegions = sorted(nextRows.filter(r => r.state).map(r => r.state));
            const nextRegion = nextRows.some(r => !r.state) ? '' : nextRegions[0] ?? '';
            const nextClasses = sorted(nextRows.filter(r => r.state === nextRegion).map(r => r.class));
            setCountry(nextCountry);
            setRegion(nextRegion);
            setHotelClass(nextClasses.includes('All Hotels') ? 'All Hotels' : nextClasses[0] ?? '');
          }}>
            <option value="">Ülke seçin</option>
            {countries.map(c => <option key={c} value={c}>{c === 'Turkey' ? 'Türkiye' : c}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">2. Bölge / eyalet
          <select className={input} value={region} disabled={!country || !countryRows.length} onChange={e => {
            const nextRegion = e.target.value;
            const nextClasses = sorted(countryRows.filter(r => r.state === nextRegion).map(r => r.class));
            setRegion(nextRegion);
            setHotelClass(nextClasses.includes('All Hotels') ? 'All Hotels' : nextClasses[0] ?? '');
          }}>
            {hasCountryWide && <option value="">Ülke geneli</option>}
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">{country && hasCountryWide && !regions.length ? 'Bu ülke için hesap ülke genelinde yapılır.' : 'Yalnızca kaynakta bulunan bölgeler listelenir.'}</span>
        </label>
        <label className="text-sm font-medium">3. Otel sınıfı
          <select className={input} value={hotelClass} disabled={!country || !classes.length} onChange={e => setHotelClass(e.target.value)}>
            {!country && <option value="All Hotels">Önce ülke seçin</option>}
            {classes.map(c => <option key={c} value={c}>{classLabel(c)}</option>)}
          </select>
        </label>
      </div>
      {/* Doğruluk ibaresi KORUNUR: bu bir referans fiyattır, güncel karbon
          piyasası kotasyonu değildir. Dil profesyonelleştirildi. */}
      <p className="rounded-lg border border-[#d8e1da] bg-[#f6f9f6] p-3 text-sm text-neutral-600">Hesaplamada kullanılan ton fiyatı: <strong className="font-medium text-[#17372d]">{money(options.demo_price_per_tonne)} / tCO₂e</strong>. Sabit referans fiyattır; güncel karbon piyasası kotasyonu değildir.</p>
      <div aria-live="polite">
        {valid && coefficient !== null && amount !== null ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 p-5"><p className="text-sm text-neutral-500">Tahmini ayak izi / oda-gece</p><p className="mt-2 text-2xl font-semibold text-[#075442]">{num(coefficient)} <span className="text-sm">kgCO₂e</span></p></div>
            <div className="rounded-xl bg-[#075442] p-5 text-white"><p className="text-sm text-emerald-100">Hesaplanan katkı / oda-gece</p><p className="mt-2 text-2xl font-semibold">{money(amount)}</p></div>
          </div>
          <p className="mt-3 text-xs text-neutral-500">{num(coefficient)} ÷ 1.000 × {money(options.demo_price_per_tonne)}. </p>
          <p className="mt-2 text-xs text-neutral-500">Kaynak yöntemi: {[...new Set(matches.map(r => r.room_method ?? 'Belirtilmemiş'))].join(' / ')}.</p>
          <div className="mt-5 rounded-xl bg-neutral-50 p-4">
            <label className="text-sm font-medium">Widget önizlemesi · 1 oda için gece sayısı<input type="number" min="1" max="365" step="1" className={input} value={nights} onChange={e => setNights(e.target.value)} /></label>
            {validNights ? <p className="mt-3 text-sm">{money(amount)} × {count} gece = <strong>{money(Math.round(amount * count * 100) / 100)}</strong> · yaklaşık {num(coefficient * count)} kgCO₂e</p> : <p className="mt-3 text-sm">1–365 arasında tam gece sayısı girin.</p>}
          </div>
        </> : <p className="text-sm text-neutral-600">{!country ? 'Hesaplamak için otelinizin ülkesini seçin.' : !supported ? 'Bu para birimi hesaplayıcıda desteklenmiyor.' : 'Bu seçim için kullanılabilir hesap bulunamadı. Seçiminizi değiştirin.'}</p>}
      </div>
      <p className="text-xs text-neutral-500"><a className="underline" href={options.source.url} target="_blank" rel="noreferrer">Greenview HFT {options.source.version}</a> · {options.source.data_year}</p>
      <p className="text-sm text-neutral-600">{hotel.role === 'demo_viewer'
        ? 'Bu sonuç aynı sekmedeki Misafir Önizleme widget’ında kullanılacak.'
        : <>Kayıtlı widget fiyatı: <strong>{money(hotel.amount_per_night)} / oda-gece</strong>. Sayfanın altındaki Kaydet düğmesiyle widget’a uygulanır.</>}</p>
      {country && <>
        <input type="hidden" name="carbon_country" value={country} />
        <input type="hidden" name="carbon_state" value={region} />
        <input type="hidden" name="carbon_hotel_class" value={hotelClass} />
      </>}
    </fieldset>
  </section>;
}

function DemoPreviewSync({ amount, coefficient, currency }: { amount: number | null; coefficient: number | null; currency: string }) {
  useEffect(() => {
    if (amount === null || coefficient === null) {
      window.sessionStorage.removeItem('greengold_demo_carbon_preview');
      return;
    }
    window.sessionStorage.setItem('greengold_demo_carbon_preview', JSON.stringify({
      amount_per_night: amount,
      estimated_co2_per_night_kg: coefficient,
      currency,
      source: 'regional',
    }));
  }, [amount, coefficient, currency]);
  return null;
}
