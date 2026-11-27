import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { connecthub, explainStored, isMeasurementId, publishGate, resultSource, storedToResult } from '../lib/connecthub';
import { getSampleCalculation, getSamplePreviousVersion, getSampleStored, getSampleVersions, type SampleScenario } from '../lib/sample/connecthub';
import { MeasurementVersionsView } from '../app/components/panel/MeasurementVersionsView';
import { CalculationPanel } from '../app/components/panel/CalculationPanel';

/**
 * Kaydedilmiş ölçüm (salt okuma ucu) ile yalnız önizleme sonuçlarının ayrımı:
 * sayfa yenilense de kayıtlı sonuç görünür; önizleme "kaydedilmedi" diye
 * açıkça etiketlenir; kayıttan sonra veri değiştiyse yayın düğmesi açılmaz.
 */
afterEach(() => vi.unstubAllEnvs());
const dev = () => vi.stubEnv('NODE_ENV', 'development');
const stored = (s: SampleScenario) => {
  dev();
  return getSampleStored(s)!;
};
const calc = (s: SampleScenario) => {
  dev();
  return getSampleCalculation(s);
};

describe('kaydedilmiş ölçüm ↔ önizleme', () => {
  it('kaydedilmiş ölçüm sonuç tipine çevrilir (yeniden hesap yok, yeni kayıt yok)', () => {
    const s = stored('kayitli');
    const r = storedToResult(s, '2026-10');
    expect(r).toMatchObject({ status: 'calculated', duplicate: true, measurement_id: s.id, period: '2026-10' });
    // Yayın kapısı aynı kuralla (izin + Kapsam 1/2 + ülke): kaydedilmiş güncel ölçüm yayınlanabilir.
    expect(publishGate(r).allowed).toBe(true);
  });

  it('kaynak etiketi: kayıtlı sonuç ile önizleme ayrı', () => {
    const s = stored('kayitli');
    const saved = resultSource(storedToResult(s, '2026-10'), s, true)!;
    expect(saved).toMatchObject({ kind: 'saved', label: 'Kaydedilmiş ölçüm', staleText: null });
    expect(saved.detail).toMatch(/Yeniden hesaplanmadı; ölçüm ortağına istek atılmadı/);
    expect(saved.detail).toMatch(/20 Kasım 2026/);

    const preview = resultSource(calc('onizleme'), s, false)!;
    expect(preview).toMatchObject({ kind: 'preview', label: 'Yalnız önizleme · kaydedilmedi' });
    expect(preview.detail).toMatch(/kaydedilmiş ölçümü \(20 Kasım 2026.*\) değişmedi/);

    const previewNoStored = resultSource(calc('onizleme'), null, false)!;
    expect(previewNoStored.detail).toMatch(/kaydedilmiş bir ölçüm yok/);

    const again = resultSource(calc('kayitli'), s, false)!;
    expect(again.detail).toMatch(/yeni kayıt veya sürüm oluşmadı/);

    const fresh = resultSource(calc('hesaplandi'), null, false)!;
    expect(fresh.detail).toBe('Az önce yeni ölçüm olarak kaydedildi.');
  });

  it('kayıttan sonra veri değiştiyse uyarı ve yayın kapalı', () => {
    const s = stored('kayitli-degisti');
    const src = resultSource(storedToResult(s, '2026-10'), s, true)!;
    expect(src.staleText).toMatch(/tüketim kayıtları, dolu oda-gece değişti/);
    const m = explainStored(s, '2026-10', 'Ekim 2026', 2140);
    expect(m.title).toBe('Kaydedilmiş hesap');
    expect(m.gate.allowed).toBe(false);
    expect(m.gateText).toMatch(/yeniden hesaplayın/);
  });

  it('panel açılışta kaydedilmiş sonucu gösterir (yenilemede kaybolmaz), "Yeniden hesapla" sunar', () => {
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement stored={stored('kayitli')} />,
    );
    expect(html).toContain('Kaydedilmiş ölçüm');
    expect(html).toContain('Kaydedilmiş hesap');
    expect(html).toContain('Gece başı tahmini katkı');
    expect(html).toContain('>Yeniden hesapla<');
    expect(html).not.toContain('Yalnız önizleme');
    // Yayın düğmesi bugün pasif (INTERNAL_USE).
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Misafir ekranına al/);
  });

  it('UX-3.10: kaydedilmiş ölçüm zaten yayındaysa "Yayında" gösterilir, yeniden aktivasyon düğmesi pasif', () => {
    const live = { ...stored('kayitli'), is_active: true };
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement stored={live} publishAction={async () => ({ status: 'idle', message: '' })} />,
    );
    expect(html).toContain('Şu an misafirde · bu ölçüm');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Yayında</);
    expect(html).not.toContain('Misafir ekranına al');
  });

  it('kaydedilmiş ölçüm yoksa eski davranış: yalnız "Hesapla"', () => {
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement={false} stored={null} />,
    );
    expect(html).toContain('>Hesapla<');
    expect(html).not.toContain('Kaydedilmiş ölçüm');
  });

  it('kayıtlı ölçüm okunamazsa uyarı görünür', () => {
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement storedError="Ölçüm okunamadı." />,
    );
    expect(html).toContain('Ölçüm okunamadı.');
  });

  it('örnek veri production’da kullanılamaz', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getSampleStored('kayitli')).toThrow();
  });
});

describe('ölçüm geçmişi · önceki sürümler (G2)', () => {
  it('önceki sürüm: ayrı etiket, yayın kapalı, değişiklik uyarısı gösterilmez', () => {
    dev();
    const prev = getSamplePreviousVersion('kayitli')!;
    const src = resultSource(storedToResult(prev, '2026-10'), prev, true)!;
    expect(src).toMatchObject({ label: 'Önceki sürüm', tone: 'neutral', staleText: null });
    expect(src.detail).toMatch(/12 Kasım 2026/);
    const m = explainStored(prev, '2026-10', 'Ekim 2026', 2140);
    expect(m.title).toBe('Önceki sürüm');
    expect(m.gate.allowed).toBe(false);
    expect(m.gateText).toMatch(/Önceki sürümler yayına alınamaz/);
  });

  it('panel önceki sürümü açılışta gösterir; yayın düğmesi pasif', () => {
    dev();
    const html = renderToStaticMarkup(
      <CalculationPanel period="2026-10" periodLabel="Ekim 2026" occupied={2140} current={null} hasStoredMeasurement stored={getSamplePreviousVersion('kayitli')} />,
    );
    expect(html).toContain('Önceki sürüm');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Misafir ekranına al/);
  });

  it('sürüm tablosu: güncel ve önceki, incelenen satır işaretli, bağlantı ?surum', () => {
    dev();
    const { versions } = getSampleVersions('kayitli');
    const html = renderToStaticMarkup(
      <MeasurementVersionsView versions={versions} viewingId={null} links={{ version: (id) => (id ? `/d?surum=${id}` : '/d') }} />,
    );
    expect(html).toContain('Ölçüm geçmişi');
    expect(html).toContain('Güncel');
    expect(html).toContain('Önceki');
    expect(html).toContain('Görüntüleniyor');
    expect(html).toContain(`/d?surum=${versions[1].id}`);
  });

  it('sürüm yoksa tablo gizli; hata varsa uyarı', () => {
    expect(renderToStaticMarkup(<MeasurementVersionsView versions={[]} viewingId={null} links={{ version: () => '/' }} />)).toBe('');
    expect(renderToStaticMarkup(<MeasurementVersionsView versions={null} error="Okunamadı." viewingId={null} links={{ version: () => '/' }} />)).toContain('Okunamadı.');
  });

  it('istemci geçersiz ölçüm kimliğini URL’e koymaz', () => {
    expect(isMeasurementId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isMeasurementId('../x')).toBe(false);
    expect(() => connecthub.measurementVersion('T', '2026-10', '../x')).toThrow(/Geçersiz ölçüm/);
  });
});
