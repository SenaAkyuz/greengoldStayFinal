/**
 * Demo tenant için GERÇEKÇİ, DETERMİNİSTİK widget_events üretici (saf, I/O'suz).
 *
 * Determinizm (sabit seed) → aynı session_ref/created_at → idempotent (tekrar
 * çalıştırınca çoğaltmaz). Huni MONOTON: her session önce widget_goruntulendi,
 * bir kısmı checkbox_secildi, onun bir kısmı katki_ekle_butonuna_basildi.
 * Dönüşüm %100 DEĞİL (bazı session'lar yalnızca görüntüler).
 */

export type DemoEventType =
  | 'widget_goruntulendi'
  | 'checkbox_secildi'
  | 'katki_ekle_butonuna_basildi';

export interface SeedEvent {
  session_ref: string;
  event_type: DemoEventType;
  created_at: string;
  metadata: { nights: number };
}

export interface SeedOptions {
  now: Date;
  days: number; // son ~N güne yay
  sessions: number; // toplam session sayısı
  selectRate: number; // viewed -> selected
  clickRate: number; // selected -> clicked
  seed: number; // deterministik PRNG tohumu
}

export const DEFAULT_SEED_OPTIONS: Omit<SeedOptions, 'now'> = {
  days: 60,
  sessions: 240,
  selectRate: 0.34, // ~%34 seçim
  clickRate: 0.65, // seçenlerin ~%65'i buton
  seed: 1337,
};

export const DEMO_SESSION_PREFIX = 'demo-sess-';

/** mulberry32 — küçük, deterministik PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoEvents(opts: SeedOptions): SeedEvent[] {
  const rand = mulberry32(opts.seed);
  const events: SeedEvent[] = [];

  for (let i = 0; i < opts.sessions; i++) {
    const session_ref = `${DEMO_SESSION_PREFIX}${i}`;
    const nights = 1 + Math.floor(rand() * 7); // 1..7
    const dayOffset = 1 + Math.floor(rand() * opts.days); // 1..days (hep geçmiş)
    const hour = 8 + Math.floor(rand() * 14); // 08..21
    const minute = Math.floor(rand() * 60);

    const base = new Date(opts.now.getTime());
    base.setUTCDate(base.getUTCDate() - dayOffset);
    base.setUTCHours(hour, minute, 0, 0);
    const at = (addMin: number) =>
      new Date(base.getTime() + addMin * 60000).toISOString();

    const metadata = { nights };

    // 1) Görüntülenme — HER session.
    events.push({
      session_ref,
      event_type: 'widget_goruntulendi',
      created_at: at(0),
      metadata,
    });

    // 2) Seçim — bir kısmı.
    if (rand() < opts.selectRate) {
      events.push({
        session_ref,
        event_type: 'checkbox_secildi',
        created_at: at(2),
        metadata,
      });

      // 3) Buton — seçenlerin bir kısmı.
      if (rand() < opts.clickRate) {
        events.push({
          session_ref,
          event_type: 'katki_ekle_butonuna_basildi',
          created_at: at(5),
          metadata,
        });
      }
    }
  }

  return events;
}

export interface SeedSummary {
  total: number;
  viewedSessions: number;
  selectedSessions: number;
  clickedSessions: number;
  selectRatePct: number;
  clickRatePct: number;
}

export function summarize(events: SeedEvent[]): SeedSummary {
  const viewed = new Set<string>();
  const selected = new Set<string>();
  const clicked = new Set<string>();
  for (const e of events) {
    if (e.event_type === 'widget_goruntulendi') viewed.add(e.session_ref);
    else if (e.event_type === 'checkbox_secildi') selected.add(e.session_ref);
    else clicked.add(e.session_ref);
  }
  const pct = (a: number, b: number) =>
    b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
  return {
    total: events.length,
    viewedSessions: viewed.size,
    selectedSessions: selected.size,
    clickedSessions: clicked.size,
    selectRatePct: pct(selected.size, viewed.size),
    clickRatePct: pct(clicked.size, selected.size),
  };
}
