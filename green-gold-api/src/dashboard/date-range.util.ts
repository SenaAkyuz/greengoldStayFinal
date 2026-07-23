/**
 * Zaman dilimi (timezone) farkındalı tarih yardımcıları.
 * widget_events.created_at TIMESTAMPTZ olduğu için, otelin yerel gününü
 * doğru UTC aralığına çevirmemiz gerekir.
 */

/** Verilen instant için tz offset'ini ms cinsinden döndürür (tz - UTC). */
function getTimezoneOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUTC - date.getTime();
}

/** tz'deki bir duvar saatini (wall time) UTC instant'a çevirir. */
function zonedWallTimeToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const offset = getTimezoneOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

/**
 * YYYY-MM-DD doğrulaması ve parçalama. Yalnızca formatı değil, GERÇEK takvim
 * tarihini de doğrular: round-trip kontrolüyle 2026-02-31 gibi var olmayan
 * tarihler reddedilir (aksi halde sessizce Mart'a taşardı).
 */
function parseYmd(value: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Geçersiz tarih formatı: ${value} (YYYY-MM-DD bekleniyor)`);
  }
  const [, y, m, d] = match;
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  // Round-trip: UTC'de kurulan tarih girdiyle birebir aynı mı?
  const probe = new Date(Date.UTC(yy, mm - 1, dd));
  if (
    probe.getUTCFullYear() !== yy ||
    probe.getUTCMonth() !== mm - 1 ||
    probe.getUTCDate() !== dd
  ) {
    throw new Error(`Geçersiz takvim tarihi: ${value}`);
  }
  return { y: yy, m: mm, d: dd };
}

/** Verilen instant'ın otel tz'indeki YYYY-MM-DD gününü döndürür (günlük gruplama). */
export function ymdInTz(instant: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** "now"un otelin timezone'undaki YYYY-MM-DD değerlerini verir. */
function currentYmdInTz(tz: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

interface YmdRange {
  fromY: number;
  fromM: number;
  fromD: number;
  toY: number;
  toM: number;
  toD: number;
}

/**
 * Preset aralığı otel tz'inde çözer (tarih hesabı backend'de, #8):
 *   - 'month' (varsayılan): tz'de içinde bulunulan ay.
 *   - '7d': tz'de bugün DAHİL son 7 takvim günü.
 *   - '30d': tz'de bugün DAHİL son 30 takvim günü.
 */
function presetToYmd(range: string | undefined, tz: string): YmdRange {
  const today = currentYmdInTz(tz);

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    // Gün sayımı için UTC anchor (yalnızca Y/M/D etiketlerini üretmek amacıyla).
    const anchor = new Date(Date.UTC(today.y, today.m - 1, today.d));
    anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
    return {
      fromY: anchor.getUTCFullYear(),
      fromM: anchor.getUTCMonth() + 1,
      fromD: anchor.getUTCDate(),
      toY: today.y,
      toM: today.m,
      toD: today.d,
    };
  }

  // month (varsayılan)
  const lastDay = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
  return {
    fromY: today.y,
    fromM: today.m,
    fromD: 1,
    toY: today.y,
    toM: today.m,
    toD: lastDay,
  };
}

export interface ResolvedRange {
  /** Kullanıcıya gösterilecek from (YYYY-MM-DD). */
  fromLabel: string;
  /** Kullanıcıya gösterilecek to (YYYY-MM-DD, dahil). */
  toLabel: string;
  /** Sorgu için başlangıç (dahil) — UTC ISO. */
  startUtc: string;
  /** Sorgu için bitiş (hariç) — UTC ISO. to gününün ertesi 00:00 tz. */
  endUtcExclusive: string;
}

export interface RangeParams {
  /** 'month' | '7d' | '30d' — from/to yoksa kullanılır (varsayılan 'month'). */
  range?: string;
  /** Explicit başlangıç (YYYY-MM-DD). Verilirse range'i geçersiz kılar. */
  from?: string;
  /** Explicit bitiş (YYYY-MM-DD, dahil). */
  to?: string;
}

/**
 * Aralığı otelin timezone'una göre çözer. Sorgu aralığı [start, end) yarı-açık,
 * tz'nin yerel günlerine göre.
 *   - Explicit from/to verilirse: sıkı doğrulama (gerçek tarih, from>to,
 *     tek-uçlu → hata) uygulanır ve o kullanılır (override).
 *   - Aksi halde `range` preset'i (default 'month') tz'de çözülür (#8).
 */
export function resolveRange(params: RangeParams, tz: string): ResolvedRange {
  const { range, from, to } = params;
  let fromY: number, fromM: number, fromD: number;
  let toY: number, toM: number, toD: number;

  // İkisi birlikte ya da hiçbiri: yalnızca biri verilirse reddet.
  if ((from && !to) || (!from && to)) {
    throw new Error(
      'from ve to birlikte verilmelidir (ikisi birlikte ya da hiçbiri).',
    );
  }

  if (from && to) {
    ({ y: fromY, m: fromM, d: fromD } = parseYmd(from));
    ({ y: toY, m: toM, d: toD } = parseYmd(to));
    // from > to reddedilir.
    if (Date.UTC(fromY, fromM - 1, fromD) > Date.UTC(toY, toM - 1, toD)) {
      throw new Error(`Geçersiz aralık: from (${from}) > to (${to}).`);
    }
  } else {
    ({ fromY, fromM, fromD, toY, toM, toD } = presetToYmd(range, tz));
  }

  const start = zonedWallTimeToUtc(fromY, fromM, fromD, 0, 0, 0, tz);
  // to günü DAHİL olmalı -> ertesi günün 00:00'ı (hariç sınır).
  const endBase = new Date(Date.UTC(toY, toM - 1, toD));
  endBase.setUTCDate(endBase.getUTCDate() + 1);
  const endExclusive = zonedWallTimeToUtc(
    endBase.getUTCFullYear(),
    endBase.getUTCMonth() + 1,
    endBase.getUTCDate(),
    0,
    0,
    0,
    tz,
  );

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    fromLabel: `${fromY}-${pad(fromM)}-${pad(fromD)}`,
    toLabel: `${toY}-${pad(toM)}-${pad(toD)}`,
    startUtc: start.toISOString(),
    endUtcExclusive: endExclusive.toISOString(),
  };
}
