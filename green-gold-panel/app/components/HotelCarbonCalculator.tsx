'use client';
import { useState, useTransition } from 'react';
import type { CarbonOptions, HotelInfo, HotelCarbonInput, HotelCarbonResult } from '@/lib/api';
import { calculateAndApplyHotelCarbon, previewHotelCarbon } from '../ayarlar/actions';

const inputClass = 'mt-1.5 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm text-[#17372d] focus:outline-none focus:ring-2 focus:ring-emerald-200';
const numeric = new Set(['rooms', 'occupied_room_nights', 'total_area_m2', 'guestrooms_area_m2', 'meeting_area_m2', 'electricity_kwh', 'gas_kwh', 'diesel_litres', 'other_emissions_kg', 'report_tonnes']);
const wholeNumbers = new Set(['rooms', 'occupied_room_nights']);

function parseFormNumber(value: string, wholeNumber: boolean) {
  const compact = value.trim().replace(/\s/g, '');
  if (wholeNumber) return Number(compact.replace(/[.,]/g, ''));
  if (compact.includes(',') && compact.includes('.')) {
    return compact.lastIndexOf(',') > compact.lastIndexOf('.')
      ? Number(compact.replace(/\./g, '').replace(',', '.'))
      : Number(compact.replace(/,/g, ''));
  }
  return Number(compact.replace(',', '.'));
}

export function HotelCarbonCalculator({ hotel, options, disabled }: { hotel: HotelInfo; options: CarbonOptions | null; disabled: boolean }) {
  const existing = hotel.carbon_pricing?.provider === 'hotel-input-demo' ? hotel.carbon_pricing as HotelCarbonResult : null;
  const [values, setValues] = useState<Record<string, string>>(() => ({ mode: 'consumption', country: 'Turkey', period_start: '2025-01-01', period_end: '2025-12-31', meeting_area_m2: '0', gas_kwh: '0', diesel_litres: '0', other_emissions_kg: '0', electricity_connection: 'distribution', report_basis: 'hotel_total', ...Object.fromEntries(Object.entries(existing?.input ?? {}).map(([k, v]) => [k, String(v)])) }));
  const [result, setResult] = useState<HotelCarbonResult | null>(existing);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [nights, setNights] = useState('3');
  const change = (key: string, value: string) => { setValues(v => ({ ...v, [key]: value })); setResult(null); setError(''); };
  const countries = [...new Set(options?.rows.map(r => r.country) ?? ['Turkey'])].sort();
  const money = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${hotel.currency}`;
  const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const field = (key: string, label: string, type = 'number') => {
    const isWholeNumber = wholeNumbers.has(key);
    const inputType = isWholeNumber ? 'text' : type;
    return <label key={key} className="block text-sm font-medium text-neutral-700">{label}<input className={inputClass} type={inputType} inputMode={isWholeNumber ? 'numeric' : undefined} pattern={isWholeNumber ? '[0-9., ]*' : undefined} min={inputType === 'number' ? 0 : undefined} max={inputType === 'number' ? 1e9 : undefined} maxLength={inputType === 'text' ? 300 : undefined} step={inputType === 'number' ? 'any' : undefined} value={values[key] ?? ''} onChange={e => change(key, e.target.value)} /></label>;
  };
  const preview = () => startTransition(async () => {
    const payload: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(values)) if (v.trim()) payload[k] = numeric.has(k) ? parseFormNumber(v, wholeNumbers.has(k)) : v.trim();
    const input = payload as unknown as HotelCarbonInput;
    const response = hotel.role === 'demo_viewer'
      ? await previewHotelCarbon(input)
      : await calculateAndApplyHotelCarbon(input);
    setResult(response.data); setError(response.error ?? '');
    if (hotel.role === 'demo_viewer' && response.data) {
      try {
        window.sessionStorage.setItem('greengold_demo_carbon_preview', JSON.stringify({
          amount_per_night: response.data.amount_per_night,
          estimated_co2_per_night_kg: response.data.coefficient_kg,
          currency: response.data.currency,
          source: 'hotel',
        }));
      } catch { /* Önizleme storage olmadan da çalışır. */ }
    }
  });
  const count = Number(nights);

  return <section className="gg-card overflow-hidden">
    <header className="border-b border-emerald-100 bg-emerald-50/60 p-6"><span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Karbon hesabı</span><h2 className="mt-2 text-xl font-semibold text-[#17372d]">Otele özel hesap</h2></header>
    <fieldset disabled={disabled || pending} className="space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Veri kaynağı<select className={inputClass} value={values.mode} onChange={e => change('mode', e.target.value)}><option value="consumption">Tüketim bilgileri</option><option value="report">Mevcut emisyon raporu</option></select></label>
        <label className="text-sm font-medium">Ülke<select className={inputClass} value={values.country} onChange={e => change('country', e.target.value)}>{countries.map(c => <option key={c} value={c}>{c === 'Turkey' ? 'Türkiye' : c}</option>)}</select></label>
        {field('period_start', 'Dönem başlangıcı', 'date')}{field('period_end', 'Dönem bitişi', 'date')}
      </div>
      <p className="text-xs text-neutral-500">Tüketimler ve dolu oda-gece aynı tarih aralığına ait olmalı. En sağlıklı sonuç için normal işleyişi temsil eden 12 aylık dönem kullanın.</p>
      <div><h3 className="mb-3 text-sm font-semibold text-[#17372d]">Tesis ve doluluk</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field('rooms', 'Oda sayısı')}{field('occupied_room_nights', 'Dolu oda-gece')}{field('total_area_m2', 'Toplam kapalı alan · m²')}{field('guestrooms_area_m2', 'Odalar ve koridorlar · m²')}{field('meeting_area_m2', 'Toplantı alanı · m²')}
      </div><p className="mt-2 text-xs text-neutral-500">Dolu oda-gece = kullanılan oda sayılarının gece toplamı. 15.330 veya 15330 şeklinde girebilirsiniz.</p></div>
      {values.mode === 'consumption' ? <div><h3 className="mb-3 text-sm font-semibold text-[#17372d]">Dönem tüketimleri</h3><div className="grid gap-4 sm:grid-cols-2">
        {field('electricity_kwh', 'Şebeke elektriği · kWh')}
        <label className="text-sm font-medium">Elektrik bağlantısı<select className={inputClass} value={values.electricity_connection} onChange={e => change('electricity_connection', e.target.value)}><option value="distribution">Dağıtım şebekesi</option><option value="transmission">İletim şebekesi</option></select></label>
        {field('gas_kwh', 'Doğalgaz · kWh (üst ısıl değer)')}{field('diesel_litres', 'Motorin · litre')}
      </div><details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-emerald-800">Diğer emisyon kaynakları</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{field('other_emissions_kg', 'Ek emisyon · kgCO₂e')}{field('other_reference', 'Hesap / rapor referansı', 'text')}</div><p className="mt-2 text-xs text-neutral-500">Örn. dış çamaşırhane ve soğutucu gazların hesaplanmış toplamı. Yukarıdaki tüketimleri tekrar eklemeyin.</p></details>
        <p className="mt-3 text-xs text-neutral-500">Kaynaklar: ETKB elektrik 2023 · DESNZ yakıt 2025.</p>
      </div> : <div className="grid gap-4 sm:grid-cols-2">
        {field('report_tonnes', 'Rapordaki emisyon · tCO₂e')}
        <label className="text-sm font-medium">Rapor kapsamı<select className={inputClass} value={values.report_basis} onChange={e => change('report_basis', e.target.value)}><option value="hotel_total">Otel toplamı</option><option value="guestrooms">Konaklamaya ayrılmış emisyon</option></select></label>
        {field('assessor', 'Hesabı yapan kurum', 'text')}{field('report_reference', 'Rapor numarası', 'text')}
      </div>}
      <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={preview} disabled={pending} className="rounded-lg bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Hesaplanıyor…' : hotel.role === 'demo_viewer' ? 'Hesapla' : 'Hesapla ve widget’a uygula'}</button><span className="text-xs text-neutral-500">Hesaplama ton fiyatı: {money(25)} · piyasa fiyatı değildir</span></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {result && <div aria-live="polite" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Emisyon / oda-gece" value={`${fmt(result.coefficient_kg)} kgCO₂e`} /><Metric label="Katkı / oda-gece" value={money(result.amount_per_night)} /><Metric label="Dönem doluluğu" value={`%${fmt(result.occupancy_percent)}`} /></div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-neutral-50 p-4"><label className="text-sm">Gece <input aria-label="Önizleme gece sayısı" className="ml-2 w-20 rounded border border-neutral-200 p-2" type="number" min={1} max={365} step={1} value={nights} onChange={e => setNights(e.target.value)} /></label>{Number.isInteger(count) && count >= 1 && count <= 365 && <strong className="text-sm">1 oda · {money(Math.round(result.amount_per_night * count * 100) / 100)} · {fmt(result.coefficient_kg * count)} kgCO₂e</strong>}</div>
        {((result as HotelCarbonResult & { warnings?: string[] }).warnings ?? []).length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><strong>Veri kontrolü:</strong><ul className="mt-1 list-disc pl-5">{(result as HotelCarbonResult & { warnings?: string[] }).warnings!.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
        <p className="text-xs text-neutral-500">{result.input.mode === 'report' ? 'Rapor beyanına dayalı hesap' : 'Tüketim tahmini'} · {hotel.role === 'demo_viewer' ? 'Bu sonuç aynı sekmedeki Misafir Önizleme widget’ında kullanılacak.' : 'Widget tutarı ve hesaplama belgesi güncellendi.'}</p>
      </div>}
    </fieldset>
    {result && <input type="hidden" name="hotel_carbon" value={JSON.stringify(result.input)} />}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-emerald-100 p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-2 text-lg font-semibold text-[#075442]">{value}</p></div>; }
