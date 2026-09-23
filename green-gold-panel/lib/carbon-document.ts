import type { CarbonReport } from './api';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

export function renderCarbonDocument(report: CarbonReport) {
  const r = report.result;
  const i = r.input;
  const row = (label: string, value: unknown) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`;
  const fields = [
    row('Ülke', i.country === 'Turkey' ? 'Türkiye' : i.country),
    row('Dönem', `${i.period_start} — ${i.period_end}`),
    row('Oda sayısı', i.rooms), row('Dolu oda-gece', number(i.occupied_room_nights)),
    row('Kapalı alan', `${number(i.total_area_m2)} m²`), row('Odalar ve koridorlar', `${number(i.guestrooms_area_m2)} m²`),
    row('Toplantı alanı', `${number(i.meeting_area_m2)} m²`),
    row('Konaklamaya ayrılan pay', `%${number(r.room_share * 100)}`),
    ...(i.mode === 'consumption' ? [row('Şebeke elektriği', `${number(i.electricity_kwh ?? 0)} kWh`), row('Doğalgaz (üst ısıl değer)', `${number(i.gas_kwh ?? 0)} kWh`), row('Motorin', `${number(i.diesel_litres ?? 0)} litre`), row('Diğer emisyonlar', `${number(i.other_emissions_kg ?? 0)} kgCO₂e`), row('Ek kaynak referansı', i.other_reference || '—')] : [row('Beyan edilen rapor', i.report_reference), row('Hesabı yapan kurum', i.assessor), row('Rapor kapsamı', i.report_basis === 'guestrooms' ? 'Konaklama' : 'Otel toplamı')]),
  ].join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Karbon Hesaplama Belgesi · ${escape(report.hotel_name)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#edf1ed;color:#17372d;font:15px/1.5 Arial,sans-serif}.toolbar{max-width:880px;margin:24px auto;text-align:right}button{background:#075442;color:white;padding:12px 20px;border:0;border-radius:8px;cursor:pointer}.document{max-width:880px;margin:24px auto;padding:56px;background:#fff;border-top:8px solid #075442}.brand{font-weight:700;letter-spacing:3px;font-size:16px}.eyebrow{color:#697970;font-size:11px;letter-spacing:2px;margin-top:36px}h1{font-size:32px;line-height:1.15;margin:8px 0 20px}h2{font-size:19px;margin:28px 0 12px}h3{font-size:15px}.hotel{font-size:23px;font-weight:600}.muted{color:#617168;font-size:12px}.metrics{display:flex;gap:20px;margin:28px 0;padding:24px;background:#f1f6f1}.metric{flex:1}.metric strong{display:block;font-size:25px}.metric span{font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #e1e8e2;vertical-align:top}th{font-weight:500;color:#637167;width:50%}.sources{font-size:11px;overflow-wrap:anywhere}.notice{margin-top:28px;padding-top:16px;border-top:1px solid #bbcbbb;font-size:12px;color:#596a60}a{color:#075442}.foot{font-size:10px;color:#78867c;margin-top:18px}@media print{@page{size:A4;margin:15mm}body{background:white}.toolbar{display:none}.document{margin:0;padding:18px;max-width:none}.metrics, tr{break-inside:avoid}h2{break-after:avoid}a{color:inherit;text-decoration:none}}@media(max-width:600px){.document{margin:0;padding:24px}.metrics{flex-direction:column}.toolbar{margin:12px}}
</style></head><body><div class="toolbar"><button onclick="window.print()">PDF / Yazdır</button></div><main class="document">
<div class="brand">GREENGOLD STAY</div><p class="eyebrow">KARBON HESAPLAMA BELGESİ</p><h1>Konaklamanın karbon ayak izi</h1><div class="hotel">${escape(report.hotel_name)}</div><div class="muted">${escape(report.city || '')}</div>
<p class="muted">Belge No: ${escape(report.id)}<br>Oluşturulma: ${escape(r.calculated_at.slice(0, 10))} · ${escape(r.version)}</p>
<div class="metrics"><div class="metric"><span>ODA-GECE BAŞINA</span><strong>${escape(number(r.coefficient_kg))}</strong><span>kgCO₂e</span></div><div class="metric"><span>DÖNEM KONAKLAMA EMİSYONU</span><strong>${escape(number(r.guestrooms_kg / 1000))}</strong><span>tCO₂e</span></div></div>
<p class="muted">${escape(r.calculation_method)} · Bağımsız doğrulama yapılmamıştır.</p>
<h2>Hesap bilgileri</h2><table>${fields}</table>
<h2>Emisyon dökümü</h2><table>${r.breakdown.map(item => row(item.label, `${number(item.kg)} kgCO₂e`)).join('')}${row(i.mode === 'report' && i.report_basis === 'guestrooms' ? 'Rapor konaklama toplamı' : 'Hesaba dahil toplam', `${number(r.total_kg)} kgCO₂e`)}</table>
<h2>Yöntem ve kaynaklar</h2><p class="sources">Konaklamaya ayrılan emisyon ÷ dolu oda-gece. Otel toplamından dağıtımda oda/koridor alanının oda/koridor + toplantı alanına oranı kullanılır; ortak alan payı bu oranla dağıtılır. Konaklama kapsamlı rapora ikinci kez alan dağıtımı uygulanmaz.</p>
<p class="sources">Kapsam: ${escape(r.scope)}</p>
${r.factors.map(f => `<p class="sources">${escape(f.source)} · ${escape(f.value)} ${escape(f.unit)} · Faktör yılı ${escape(f.year)}<br><a href="${escape(f.url)}">${escape(f.url)}</a></p>`).join('')}
${i.mode === 'consumption' ? '<p class="sources">Türkiye elektrik faktörleri 2023; yakıt faktörleri 2025 UK verisinden vekil değerlerdir. Rapor dönemiyle birebir eşleşmeyebilir. Bu sürüm market-based elektrik, özel alan tüketim ayrıştırması ve tam HCMI envanteri sağlamaz.</p>' : ''}
<p class="sources">Dağıtım yaklaşımı: HCMI v1.2, §6.3 ve §7.1. Bu belge HCMI / ISO uygunluk sertifikası değildir.</p>
<h2>Katkı hesabı</h2><table>${row('Ton başına temsili fiyat', `${r.price_per_tonne} ${r.currency}`)}${row('Oda-gece başına katkı', `${r.amount_per_night.toFixed(2)} ${r.currency}`)}</table>
<p class="notice">Bu belge, otelin beyan ettiği verilerle üretilen hesaplama kaydıdır. Karbon kredisi alımı veya itfasını belgelemez; dengeleme sertifikası değildir. Katkı hesabında kullanılan ton fiyatı temsili olup piyasa kotasyonu değildir.</p><p class="foot">GreenGold Stay · Belge düzenlendikten sonraki hesap değişiklikleri bu kaydı değiştirmez.</p>
</main></body></html>`;
}
