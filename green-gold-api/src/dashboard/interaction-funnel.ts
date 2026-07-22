/**
 * Session bazlı ETKİLEŞİM hunisi — funnel ucu + Genel Bakış dönüşümü tek
 * kaynaktan beslensin diye ortak saf fonksiyonlar. (Gerçekleşen katkı/tahsilat
 * DEĞİL; yalnızca widget etkileşimi — Faz 1 dürüstlük çerçevesiyle uyumlu.)
 *
 * Her aşama, o event'i üreten TEKİL session'ı sayar: COALESCE(session_ref, id).
 * Widget Adım 5'te session başına tek event gönderiyor; yine de burada dedup
 * yaparız (savunma — eski/bozuk kayıtlar şişirmesin).
 */

export interface FunnelEventRow {
  id: string;
  session_ref: string | null;
  event_type: string;
}

export interface FunnelStages {
  viewed: number;
  selected: number;
  clicked: number;
}

export interface FunnelRates {
  view_to_select_pct: number;
  select_to_button_pct: number;
  view_to_button_pct: number;
}

const STAGE_BY_TYPE: Record<string, keyof FunnelStages> = {
  widget_goruntulendi: 'viewed',
  checkbox_secildi: 'selected',
  katki_ekle_butonuna_basildi: 'clicked',
};

/**
 * Gerçek SIRALI cohort huni — her aşama bir öncekinin ALT KÜMESİ:
 *   selected = viewed ∩ selected
 *   clicked  = viewed ∩ selected ∩ clicked
 * Böylece viewed ≥ selected ≥ clicked (monoton) ve tüm oranlar ≤ %100.
 *
 * Not: Bağımsız sayım (aşamaları ayrı ayrı) yanlıştı — `select` yollayıp `view`
 * yollamamış bir session `selected > viewed` yapıp oranı %100'ün üstüne çıkarabilirdi.
 * Strict kesişimde, üst-aşama event'i kayıp bir session o aşamadan itibaren
 * sayılmaz (widget UI sırayı zorladığı için bu ancak event kaybıyla oluşur).
 */
export function distinctSessionStages(rows: FunnelEventRow[]): FunnelStages {
  const raw: Record<keyof FunnelStages, Set<string>> = {
    viewed: new Set(),
    selected: new Set(),
    clicked: new Set(),
  };
  for (const row of rows) {
    const stage = STAGE_BY_TYPE[row.event_type];
    if (!stage) continue;
    const key = row.session_ref ?? row.id;
    raw[stage].add(key);
  }

  // Sıralı kesişim.
  const selectedCohort = new Set(
    [...raw.selected].filter((k) => raw.viewed.has(k)),
  );
  const clickedCohort = [...raw.clicked].filter((k) => selectedCohort.has(k));

  return {
    viewed: raw.viewed.size,
    selected: selectedCohort.size,
    clicked: clickedCohort.length,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Geçiş oranları — payda 0 → 0. */
export function funnelRates(s: FunnelStages): FunnelRates {
  return {
    view_to_select_pct: s.viewed > 0 ? round1((s.selected / s.viewed) * 100) : 0,
    select_to_button_pct:
      s.selected > 0 ? round1((s.clicked / s.selected) * 100) : 0,
    view_to_button_pct: s.viewed > 0 ? round1((s.clicked / s.viewed) * 100) : 0,
  };
}
