/**
 * Güvenli CSV üretimi.
 *
 * CSV injection (formül enjeksiyonu) koruması: Excel/Sheets, hücre `=`, `+`, `-`,
 * `@` (veya tab/CR) ile başlıyorsa onu formül sayar. Böyle bir hücrenin BAŞINA
 * GERÇEK bir apostrof (U+0027, `'`) eklenir → değer daima düz metin olur.
 * Ek olarak, nötrlenen hücre çift tırnakla SARILIR ki apostrof alanın parçası
 * olarak kalsın ve farklı ayraç/locale (ör. noktalı virgül) yorumlarında bile
 * hücre bölünmesin. Ayrıca standart CSV alan kaçışı (virgül/tırnak/yeni satır).
 */

/** Apostrof: U+0027. Formül tetikleyen hücrenin önüne eklenir. */
const APOSTROPHE = "'";

/** Bir hücre bu karakterlerden biriyle BAŞLIYORSA formül riski taşır. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);

  const risky = FORMULA_START.test(s);
  if (risky) {
    // Gerçek apostrof başa eklenir — değer artık formül değil, metin.
    s = APOSTROPHE + s;
  }

  // Riskli hücreyi de (apostrofu korumak için) ve virgül/tırnak/yeni satır
  // içeren hücreleri çift tırnakla sar.
  if (risky || /[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Dosya adı için güvenli ASCII slug. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'otel';
}
