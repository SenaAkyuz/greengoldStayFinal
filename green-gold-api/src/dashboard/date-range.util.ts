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

/** "now"un otelin timezone'undaki YYYY, MM değerlerini verir. */
function currentYearMonthInTz(tz: string): { y: number; m: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = dtf.formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month) };
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

/**
 * from/to parametrelerini çözer. Yoksa: otelin timezone'una göre içinde
 * bulunulan ay. Sorgu aralığı [start, end) yarı-açık, tz'nin yerel günlerine göre.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  tz: string,
): ResolvedRange {
  let fromY: number, fromM: number, fromD: number;
  let toY: number, toM: number, toD: number;

  // İkisi birlikte ya da hiçbiri: yalnızca biri verilirse sessizce aya düşme, reddet.
  if ((from && !to) || (!from && to)) {
    throw new Error(
      'from ve to birlikte verilmelidir (ikisi birlikte ya da hiçbiri).',
    );
  }

  if (from && to) {
    ({ y: fromY, m: fromM, d: fromD } = parseYmd(from));
    ({ y: toY, m: toM, d: toD } = parseYmd(to));
    // from > to reddedilir.
    if (
      Date.UTC(fromY, fromM - 1, fromD) > Date.UTC(toY, toM - 1, toD)
    ) {
      throw new Error(`Geçersiz aralık: from (${from}) > to (${to}).`);
    }
  } else {
    const { y, m } = currentYearMonthInTz(tz);
    fromY = y;
    fromM = m;
    fromD = 1;
    toY = y;
    toM = m;
    toD = new Date(Date.UTC(y, m, 0)).getUTCDate(); // ayın son günü
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
