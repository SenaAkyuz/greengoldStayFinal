import { csvCell, toCsv, slugify } from './csv.util';

describe('csvCell — CSV injection & kaçış', () => {
  it('=, +, -, @ ile başlayan hücre GERÇEK apostrofla nötrlenir (sarılmış)', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-cmd')).toBe('"\'-cmd"');
    expect(csvCell('@import')).toBe('"\'@import"');
  });

  it('nötrlenen değerin ilk anlamlı karakteri gerçekten apostrof (U+0027)', () => {
    // Dış çift tırnak kabuğunun HEMEN içinde apostrof olmalı.
    const out = csvCell('=danger');
    expect(out.startsWith('"')).toBe(true);
    expect(out.charCodeAt(1)).toBe(39); // 39 = "'"
  });

  it('tehlikeli olmayan değer olduğu gibi kalır (sarılmaz)', () => {
    expect(csvCell('Otel A')).toBe('Otel A');
    expect(csvCell('2026-07-10')).toBe('2026-07-10');
    expect(csvCell(42)).toBe('42');
  });

  it('virgül/tırnak/yeni satır çift tırnakla sarılır', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('hem injection hem virgül: apostrof + tırnak sarma', () => {
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
  });

  it('null/undefined -> boş', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('satırları CRLF, hücreleri virgülle birleştirir', () => {
    const csv = toCsv([
      ['a', 'b'],
      [1, 2],
    ]);
    expect(csv).toBe('a,b\r\n1,2');
  });
});

describe('slugify', () => {
  it('küçük harf + tire; baş/son tire temizlenir', () => {
    expect(slugify('Deniz Otel')).toBe('deniz-otel');
    expect(slugify('  Otel!! ')).toBe('otel');
  });
  it('boşsa fallback', () => {
    expect(slugify('###')).toBe('otel');
  });
});
