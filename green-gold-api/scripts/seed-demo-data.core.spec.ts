import {
  generateDemoEvents,
  summarize,
  DEFAULT_SEED_OPTIONS,
  DEMO_SESSION_PREFIX,
  type SeedEvent,
} from './seed-demo-data.core';

const NOW = new Date('2026-07-23T12:00:00.000Z');
const OPTS = { ...DEFAULT_SEED_OPTIONS, now: NOW };

function bySession(events: SeedEvent[]) {
  const map = new Map<string, Set<string>>();
  for (const e of events) {
    const s = map.get(e.session_ref) ?? new Set<string>();
    s.add(e.event_type);
    map.set(e.session_ref, s);
  }
  return map;
}

describe('generateDemoEvents', () => {
  it('deterministik: aynı seed -> birebir aynı çıktı (idempotent)', () => {
    const a = generateDemoEvents(OPTS);
    const b = generateDemoEvents(OPTS);
    expect(a).toEqual(b);
    // session_ref'ler stabil ve prefix'li
    expect(a[0].session_ref.startsWith(DEMO_SESSION_PREFIX)).toBe(true);
  });

  it('huni MONOTON: selected ⊆ viewed, clicked ⊆ selected', () => {
    const events = generateDemoEvents(OPTS);
    for (const [, types] of bySession(events)) {
      if (types.has('checkbox_secildi')) {
        expect(types.has('widget_goruntulendi')).toBe(true);
      }
      if (types.has('katki_ekle_butonuna_basildi')) {
        expect(types.has('checkbox_secildi')).toBe(true);
      }
    }
  });

  it('dönüşüm %100 DEĞİL (bazı session yalnızca görüntüler)', () => {
    const s = summarize(generateDemoEvents(OPTS));
    expect(s.viewedSessions).toBe(OPTS.sessions);
    expect(s.selectedSessions).toBeLessThan(s.viewedSessions);
    expect(s.clickedSessions).toBeLessThan(s.selectedSessions);
    expect(s.selectRatePct).toBeGreaterThan(0);
    expect(s.selectRatePct).toBeLessThan(100);
  });

  it('nights 1..7 arası', () => {
    for (const e of generateDemoEvents(OPTS)) {
      expect(e.metadata.nights).toBeGreaterThanOrEqual(1);
      expect(e.metadata.nights).toBeLessThanOrEqual(7);
    }
  });

  it('created_at son ~days gün içinde (geçmiş, gelecekte değil)', () => {
    // Gün ofseti 1..days + günün saati (08-21) değişkenliği → 1 gün pay bırak.
    const min = new Date(NOW.getTime() - (OPTS.days + 1) * 86400000).getTime();
    const max = NOW.getTime();
    for (const e of generateDemoEvents(OPTS)) {
      const t = new Date(e.created_at).getTime();
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    }
  });
});
