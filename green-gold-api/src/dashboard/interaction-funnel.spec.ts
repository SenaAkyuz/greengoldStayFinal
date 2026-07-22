import {
  distinctSessionStages,
  funnelRates,
  type FunnelEventRow,
} from './interaction-funnel';

function row(
  eventType: string,
  session: string | null,
  id = `id-${Math.random()}`,
): FunnelEventRow {
  return { id, session_ref: session, event_type: eventType };
}

describe('distinctSessionStages — sıralı cohort', () => {
  it('iyi sıralı veride aşamalar doğru sayılır', () => {
    const rows = [
      row('widget_goruntulendi', 's1'),
      row('checkbox_secildi', 's1'),
      row('katki_ekle_butonuna_basildi', 's1'),
      row('widget_goruntulendi', 's2'),
      row('checkbox_secildi', 's2'),
      row('widget_goruntulendi', 's3'),
    ];
    expect(distinctSessionStages(rows)).toEqual({
      viewed: 3,
      selected: 2,
      clicked: 1,
    });
  });

  it('view olmadan select -> oran %100 aşmaz (cohort düzeltmesi)', () => {
    // Bağımsız sayım: viewed=1, selected=3 -> %300 (YANLIŞ).
    const rows = [
      row('widget_goruntulendi', 's1'),
      row('checkbox_secildi', 's1'),
      row('checkbox_secildi', 's2'), // view yok
      row('checkbox_secildi', 's3'), // view yok
    ];
    const stages = distinctSessionStages(rows);
    expect(stages).toEqual({ viewed: 1, selected: 1, clicked: 0 });
    expect(funnelRates(stages).view_to_select_pct).toBe(100);
  });

  it('monoton: viewed >= selected >= clicked (her zaman)', () => {
    const rows = [
      row('checkbox_secildi', 'a'),
      row('katki_ekle_butonuna_basildi', 'a'),
      row('katki_ekle_butonuna_basildi', 'b'),
      row('widget_goruntulendi', 'c'),
    ];
    const s = distinctSessionStages(rows);
    expect(s.viewed).toBeGreaterThanOrEqual(s.selected);
    expect(s.selected).toBeGreaterThanOrEqual(s.clicked);
  });

  it('select olmadan click, clicked cohort\'a girmez', () => {
    const rows = [
      row('widget_goruntulendi', 's1'),
      row('checkbox_secildi', 's1'),
      row('katki_ekle_butonuna_basildi', 's1'),
      row('widget_goruntulendi', 's2'),
      row('katki_ekle_butonuna_basildi', 's2'), // select yok
    ];
    expect(distinctSessionStages(rows)).toEqual({
      viewed: 2,
      selected: 1,
      clicked: 1, // yalnızca s1
    });
  });

  it('null session_ref -> id ile ayrışır (kesişmez)', () => {
    const rows = [
      row('widget_goruntulendi', null, 'v1'),
      row('checkbox_secildi', null, 's1'),
    ];
    // Farklı id'ler -> kesişim yok -> selected cohort 0.
    expect(distinctSessionStages(rows)).toEqual({
      viewed: 1,
      selected: 0,
      clicked: 0,
    });
  });
});

describe('funnelRates — payda 0 -> 0', () => {
  it('viewed 0 iken oranlar 0', () => {
    expect(funnelRates({ viewed: 0, selected: 0, clicked: 0 })).toEqual({
      view_to_select_pct: 0,
      select_to_button_pct: 0,
      view_to_button_pct: 0,
    });
  });

  it('oranlar 1 ondalığa yuvarlanır', () => {
    const r = funnelRates({ viewed: 3, selected: 2, clicked: 1 });
    expect(r.view_to_select_pct).toBe(66.7);
    expect(r.view_to_button_pct).toBe(33.3);
    expect(r.select_to_button_pct).toBe(50);
  });
});
