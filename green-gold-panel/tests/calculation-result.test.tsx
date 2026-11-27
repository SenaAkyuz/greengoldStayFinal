import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  blockingText,
  emission,
  explainResult,
  money,
  pendingReason,
  priceComparison,
  publishGate,
} from '../lib/connecthub';
import { getSampleCalculation, type SampleScenario } from '../lib/sample/connecthub';
import { CalculationResultView } from '../app/components/panel/CalculationResultView';
import { CalculationPanel } from '../app/components/panel/CalculationPanel';

afterEach(() => vi.unstubAllEnvs());
const sample = (s: SampleScenario) => {
  vi.stubEnv('NODE_ENV', 'development');
  return getSampleCalculation(s);
};

describe('explainResult — durumlar', () => {
  it('onay bekliyor: tutar yok, bekleyen kayıtlar listelenir', () => {
    const m = explainResult(sample('onay'), 'Ekim 2026', 2140);
    expect(m.title).toBe('Onay bekleyen kayıtlar var');
    expect(m.message).toMatch(/Eksik toplamla yanlış katkı tutarı üretmemek/);
    expect(m.pending).toEqual([
      { name: 'Doğalgaz', amount: '6.150 m³', reason: 'Ölçüm ortağımızda onay bekliyor.' },
      { name: 'Jeneratör dizel', amount: '420 Litre', reason: expect.stringMatching(/güvenle yeniden gönderin/) },
    ]);
    expect(m.allocation).toBeUndefined();
    expect(m.gate).toEqual({ allowed: false, reason: 'not_calculated' });
  });

  it('faktör eksik: tahmin yok, tutar yok, kalem bazında neden', () => {
    const m = explainResult(sample('eksik'), 'Ekim 2026', 2140);
    expect(m.tone).toBe('danger');
    expect(m.message).toBe('Bazı kalemler için ölçüm ortağının emisyon faktörü uygulanamadı. Tahmini bir değer kullanılmaz; bu ay için katkı tutarı üretilmedi.');
    expect(m.allocation).toBeUndefined();
    expect(m.totals).toBeUndefined();
    expect(m.blocking).toEqual([
      { name: 'Şebeke elektriği', text: 'Bu kalem için emisyon faktörü mevcut değil.' },
      { name: 'Isıtma yakıtı', text: expect.stringMatching(/yakıt\/tür seçimi/) },
    ]);
  });

  it('veri yok', () => {
    expect(explainResult(sample('veri-yok'), 'Ekim 2026', null).title).toBe('Hesaplanacak onaylı kayıt yok');
  });

  it('yalnız önizleme (yanlış ülke faktörü): sonuç görünür, kaydedilmez, yayın kapalı', () => {
    const r = sample('onizleme');
    const m = explainResult(r, 'Ekim 2026', 2140);
    expect(m.title).toBe('Hesaplandı — yalnız önizleme');
    expect(m.message).toMatch(/ölçüm kaydedilmedi ve misafir ekranına alınamaz/);
    expect(m.measurementId).toBeUndefined();
    expect(m.gate).toEqual({ allowed: false, reason: 'country_unverified' });
    const elec = m.lines!.find((l) => l.name === 'Şebeke elektriği')!;
    expect(elec.country).toMatchObject({ label: 'Başka ülkenin faktörü', tone: 'warning', factorCountry: 'Birleşik Arap Emirlikleri' });
    expect(m.countryMessages[0]).toMatch(/Türkiye/);
  });

  it('hesaplandı: kapsam, faktör kaynağı, dağıtım cümlesi; yazılı izinle yayın kapısı açık', () => {
    const r = sample('hesaplandi');
    const m = explainResult(r, 'Ekim 2026', 2140);
    expect(m.measurementId).toBe('11111111-1111-4111-8111-111111111111');
    expect(m.gate).toEqual({ allowed: true });
    expect(m.gateText).toBeNull();
    expect(m.totals!.coverage).toBe('Hesap kapsamı: Kapsam 1 ve 2; WTT (Kapsam 3 kat. 3) dahil değil.');
    expect(m.totals!.scopes.map((s) => s.label)).toEqual(['Kapsam 1 · doğrudan', 'Kapsam 2 · satın alınan enerji']);
    expect(m.totals!.biogenic).toMatch(/kapsamlar dışındadır/);
    expect(m.lines![0].factorSource).toBe('Örnek kaynak 2026 · veri yılı 2026');
    expect(m.allocation!.sentence).toMatch(/konaklamaya düşer ve 2\.140 dolu oda-geceye bölünür: oda-gece başına .* kg CO₂e\. Ton başına .*25,00.* temsili fiyatla gece başı tahmini katkı/);
    expect(m.ignored[0]).toMatch(/Soğutucu gaz dolumu/);
    // Ekrandaki sayılar backend fiyatıyla aynı (yeniden hesaplanmaz):
    if (r.status === 'calculated') expect(m.allocation!.amount).toBe(money(r.pricing.amount_per_night, 'EUR'));
  });

  it('tanınmayan bekleme nedeni aynen gösterilir', () => {
    expect(pendingReason('Başka bir neden.')).toBe('Başka bir neden.');
  });

  it('bilinmeyen engel kodu genel metne düşer; biçimler', () => {
    expect(blockingText('YENI_KOD')).toBe('Bu kalem için faktör uygulanamadı.');
    expect(emission(469.657)).toBe('469,7 kg CO₂e');
    expect(emission(35347.8)).toBe('35,35 t CO₂e');
  });
});

describe('priceComparison — mevcut misafir fiyatı', () => {
  it('mevcut ve yeni değer; değişim bayrağı', () => {
    const r = sample('hesaplandi');
    if (r.status !== 'calculated') throw new Error();
    const c = priceComparison({ amount_per_night: 0.11, currency: 'EUR', estimated_co2_per_night_kg: 4.3 }, r.pricing);
    expect(c.current).toMatch(/0,11.*4,30 kg CO₂e \/ oda-gece/);
    expect(c.changes).toBe(true);
    expect(priceComparison(null, null)).toEqual({ current: null, next: null, changes: false });
  });
});

describe('görünümler', () => {
  it('önizleme sonucu: ülke rozeti, faktör ülkesi, uyarı; tutar gösterilir', () => {
    const html = renderToStaticMarkup(<CalculationResultView model={explainResult(sample('onizleme'), 'Ekim 2026', 2140)} />);
    expect(html).toContain('Başka ülkenin faktörü');
    expect(html).toContain('Faktör: Birleşik Arap Emirlikleri');
    expect(html).toContain('Gece başı tahmini katkı');
    expect(html).toContain('Kontroller · ');
    expect(html).toContain('resmi sonuç ölçüm ortağımızın envanter raporudur');
  });
  it('engelli sonuçta tutar alanları yok', () => {
    const html = renderToStaticMarkup(<CalculationResultView model={explainResult(sample('eksik'), 'Ekim 2026', 2140)} />);
    expect(html).not.toContain('Gece başı tahmini katkı');
    expect(html).toContain('Hesaplanamayan kalemler');
  });
  it('panel ilk durumda sağlayıcıya istek atmaz; yalnız "Hesapla" düğmesi', () => {
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement={false} />,
    );
    expect(html).toContain('>Hesapla<');
    expect(html).not.toContain('Misafir ekranına al');
  });
  it('hazır değilse düğme pasif ve gerekçe görünür', () => {
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={null} current={null} hasStoredMeasurement disabledReason="Demo hesabında hesaplama yapılamaz." />,
    );
    expect(html).toContain('Demo hesabında hesaplama yapılamaz.');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Hesapla/);
  });
  it('publishGate: hesaplandı (Kapsam 1/2, ülke doğrulandı) yayınlanabilir; önizleme yayınlanamaz', () => {
    expect(publishGate(sample('hesaplandi')).allowed).toBe(true);
    expect(publishGate(sample('onizleme')).allowed).toBe(false);
  });
});

describe('engel metinleri (blockingText)', () => {
  it('FACTOR_NOT_AVAILABLE + SOURCE_NOT_REDISTRIBUTABLE → anlaşılır lisans metni', async () => {
    const { blockingText } = await import('../lib/connecthub');
    expect(blockingText('FACTOR_NOT_AVAILABLE', 'SOURCE_NOT_REDISTRIBUTABLE')).toMatch(/lisans koşulları/);
    expect(blockingText('FACTOR_NOT_AVAILABLE')).toBe('Bu kalem için emisyon faktörü mevcut değil.');
    expect(blockingText('OPTION_REQUIRED', 'X')).toMatch(/yakıt\/tür seçimi/);
    expect(blockingText('BILINMEYEN')).toBe('Bu kalem için faktör uygulanamadı.');
  });
});

describe('faktör kaynağı: lisans ve atıf (otel paneli)', () => {
  it('lisans + atıf aynen gösterilir; yalnız https bağlantı; faktör değeri yok', async () => {
    const { explainResult } = await import('../lib/connecthub');
    const base = sample('hesaplandi');
    if (base.status !== 'calculated') throw new Error('örnek');
    const withSource = (url: string | null) => ({
      ...base,
      calculation: {
        ...base.calculation,
        lines: base.calculation.lines.map((l, i) =>
          i === 0
            ? { ...l, data_year: 2022, warnings: ['FACTOR_YEAR_FALLBACK'], factor_country_code: 'TR',
                factor_source: { name: 'ETKB', version: '2022', license: 'Açık veri (örnek)', attribution: 'T.C. Enerji ve Tabii Kaynaklar Bakanlığı (örnek)', url } }
            : l,
        ),
      },
    });
    const m = explainResult(withSource('https://enerji.gov.tr/ornek'), 'Ekim 2026', 2000);
    const line = m.lines![0];
    expect(line.factorSource).toBe('ETKB 2022 · veri yılı 2022');
    expect(line.factorCredit).toBe('Lisans: Açık veri (örnek) · Atıf: T.C. Enerji ve Tabii Kaynaklar Bakanlığı (örnek)');
    expect(line.factorUrl).toBe('https://enerji.gov.tr/ornek');
    expect(line.notes).toContain('Kayıt yılının faktörü henüz yok; en güncel yıl (2022) kullanıldı.');
    // Yıl geri düşmesi yayını engellemez (ülke uygun + Kapsam 1/2).
    expect(m.gate).toEqual({ allowed: true });
    expect(explainResult(withSource('javascript:alert(1)'), 'Ekim 2026', 2000).lines![0].factorUrl).toBeNull();
  });
});
