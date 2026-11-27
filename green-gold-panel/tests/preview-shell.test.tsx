import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColumnChart, HeroBand, Notice, resolveActiveKey } from '../app/components/ui';
import { getSampleOverview } from '../lib/sample/hotel-overview';

afterEach(() => vi.unstubAllEnvs());

describe('resolveActiveKey', () => {
  const items = [
    { key: 'home', href: '/onizleme/panel' },
    { key: 'olcum', href: '/onizleme/panel/karbon-olcumu' },
    { key: 'root', href: '/' },
  ];
  it('en uzun eşleşen adres kazanır (alt sayfalar dahil)', () => {
    expect(resolveActiveKey('/onizleme/panel/karbon-olcumu/2026-10', items)).toBe('olcum');
    expect(resolveActiveKey('/onizleme/panel', items)).toBe('home');
    expect(resolveActiveKey('/onizleme/panel/', items)).toBe('home');
  });
  it('"/" yalnız tam eşleşmede; benzer önek eşleşmez', () => {
    expect(resolveActiveKey('/', items)).toBe('root');
    expect(resolveActiveKey('/onizleme/panelx', items)).toBeNull();
    expect(resolveActiveKey('/baska', items)).toBeNull();
  });
  it('sorgu dizgisi yok sayılır', () => {
    expect(resolveActiveKey('/onizleme/panel?range=7d', items)).toBe('home');
  });
});

describe('genel bakış örnek verisi', () => {
  it('production ve test ortamında dönmez', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getSampleOverview()).toThrow();
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => getSampleOverview()).toThrow();
  });
  it('development: huni ve özet tutarlı', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { report } = getSampleOverview();
    expect(report.funnel.stages.viewed).toBe(report.summary.views);
    expect(report.funnel.stages.selected).toBe(report.summary.selections);
    expect(report.funnel.stages.clicked).toBeLessThanOrEqual(report.funnel.stages.selected);
  });
});

describe('ColumnChart', () => {
  const out = renderToStaticMarkup(
    <ColumnChart
      caption="Aylık"
      data={[
        { key: 'a', label: 'Oca', value: 10, valueText: '10 kg' },
        { key: 'b', label: 'Şub', value: null, valueText: 'Sonuç yok' },
      ]}
    />,
  );
  it('değerler ekran okuyucu tablosunda da var', () => {
    expect(out).toContain('<caption>Aylık</caption>');
    expect(out).toContain('Sonuç yok');
  });
  it('eksik ay 0 yüksekliğinde sütun olarak çizilmez', () => {
    expect(out.match(/height:/g)).toHaveLength(1);
  });
});

describe('HeroBand ve Notice', () => {
  it('HeroBand tek h1 ve dt→dd sırası', () => {
    const out = renderToStaticMarkup(
      <HeroBand title="Başlık" stats={[{ key: 'x', label: 'Etiket', value: null }]} />,
    );
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out.indexOf('<dt')).toBeLessThan(out.indexOf('<dd'));
    expect(out).toContain('—');
  });
  it('Notice eylemi gövdenin dışında ve rolü korunur', () => {
    const out = renderToStaticMarkup(<Notice tone="warning" title="T" actions={<button>Aç</button>}>Metin</Notice>);
    expect(out).toContain('role="alert"');
    expect(out).toContain('<strong');
  });
});
