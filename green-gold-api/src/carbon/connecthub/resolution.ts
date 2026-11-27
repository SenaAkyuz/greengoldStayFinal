/**
 * ConnectHub başlık çözünürlüğü ↔ kayıt dönemi biçimi.
 *
 * Kaynak: ConnectHub Geliştirici belgeleri, "Kurallar → Dönem":
 *   "Başlığın çözünürlüğüne göre: 2026-10-14, 2026-10 ya da 2026"
 * GET /v1/items canlı yanıtında görülen değerler: `monthly`, `daily`.
 *
 * Bilinmeyen çözünürlük → null: o başlığa yazma yapılmaz (tahmin yok).
 */

export type ResolutionKind = 'daily' | 'monthly' | 'yearly';

const ALIASES: Record<string, ResolutionKind> = {
  daily: 'daily',
  day: 'daily',
  d: 'daily',
  günlük: 'daily',
  monthly: 'monthly',
  month: 'monthly',
  m: 'monthly',
  ay: 'monthly',
  aylık: 'monthly',
  yearly: 'yearly',
  year: 'yearly',
  annual: 'yearly',
  annually: 'yearly',
  y: 'yearly',
  yıllık: 'yearly',
};

export function resolutionKind(
  raw: string | null | undefined,
): ResolutionKind | null {
  const key = (raw ?? '').trim().toLocaleLowerCase('tr-TR');
  return ALIASES[key] ?? null;
}

export const PERIOD_FORMAT_LABEL: Record<ResolutionKind, string> = {
  daily: 'YYYY-AA-GG (ör. 2026-10-14)',
  monthly: 'YYYY-AA (ör. 2026-10)',
  yearly: 'YYYY (ör. 2026)',
};

const PATTERN: Record<ResolutionKind, RegExp> = {
  daily: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  monthly: /^(\d{4})-(0[1-9]|1[0-2])$/,
  yearly: /^(\d{4})$/,
};

/** Dönem, başlığın çözünürlüğüne uygun ve takvimde gerçek bir tarih mi? */
export function isPeriodValidForResolution(
  kind: ResolutionKind,
  period: string,
): boolean {
  const match = PATTERN[kind].exec(period);
  if (!match) return false;
  if (kind !== 'daily') return true;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Dönemin son günü (YYYY-AA-GG); geçersizse null. */
export function periodEndDate(
  kind: ResolutionKind,
  period: string,
): string | null {
  if (!isPeriodValidForResolution(kind, period)) return null;
  if (kind === 'daily') return period;
  if (kind === 'yearly') return `${period}-12-31`;
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, '0')}`;
}
