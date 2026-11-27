import type {
  ApprovedRecord,
  FactorPackage,
  FactorPackageFactor,
} from './connecthub.client';
import {
  calculateFromFactorPackage,
  convertQuantity,
  itemFactorDetail,
  itemFactorStatus,
  itemRequiresOption,
  selectMapping,
} from './factor-calculation';

const UNIT = '7d4e5f6a-8b90-4e8a-9c21-3f2a9c1e5b7d';
const OTHER_UNIT = '11111111-1111-4111-8111-111111111111';
const ITEM_FUEL = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const ITEM_ELEC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_GAS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_WASTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** Gerçek paketteki `vehicles-by-fuel` gibi çok yakıtlı başlık. */
const ITEM_VEHICLES = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UOM_L = 'a1000000-0000-4000-8000-000000000001';
const UOM_KWH = 'a1000000-0000-4000-8000-000000000002';
const UOM_MWH = 'a1000000-0000-4000-8000-000000000003';
const UOM_M3 = 'a1000000-0000-4000-8000-000000000004';
const UOM_T = 'a1000000-0000-4000-8000-000000000005';

function factor(over: Partial<FactorPackageFactor>): FactorPackageFactor {
  return {
    id: 'f',
    kind: 'catalogue',
    shared: true,
    name: null,
    kg_co2e_per_uom: null,
    uom_id: null,
    uom_code: null,
    uom_name: null,
    gwp_embedded: false,
    source_gwp_set: null,
    gases: null,
    factor_kind: null,
    includes_transmission_losses: null,
    data_year: 2025,
    publication_year: 2025,
    country_code: null,
    biogenic_co2_kg_per_uom: null,
    company_declared: false,
    verification: null,
    source: null,
    ...over,
  };
}

/** Belgelerdeki örnek paketi temel alır (DEFRA 2025, AR6). */
function pkg(): FactorPackage {
  return {
    release: {
      schema_version: '1.0',
      release_id: '2025-9f2c41d07b3a',
      generated_at: '2026-11-18T09:00:00Z',
      content_hash: '9f2c',
    },
    inventory: {
      id: '5b7d3f2a-9c1e-4e8a-9c21-7d4e5f6a8b90',
      name: '2025',
      year: 2025,
      period_start: '2025-01-01',
      period_end: '2026-12-31',
      gwp_set: 'AR6',
      gwp_ch4: 29.8,
      gwp_n2o: 273,
      dataset: 'defra',
      combustion_dataset: 'defra',
      default_country_code: 'TR',
      scope2_method: 'location_based',
    },
    items: [
      {
        id: ITEM_FUEL,
        code: 'YKT-JEN',
        name: 'Jeneratör dizeli',
        scope: 1,
        uoms: [{ id: UOM_L, code: 'L', name: 'Litre' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: null,
            uom_id: UOM_L,
            factor_id: '0193',
            error: null,
            warnings: [],
          },
        ],
      },
      {
        id: ITEM_ELEC,
        code: 'ELEK',
        name: 'Şebeke elektriği',
        scope: 2,
        uoms: [
          { id: UOM_KWH, code: 'kWh', name: 'Kilovatsaat' },
          { id: UOM_MWH, code: 'MWh', name: 'Megavatsaat' },
        ],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: null,
            uom_id: UOM_KWH,
            factor_id: 'elec',
            error: null,
            warnings: [],
          },
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: null,
            uom_id: UOM_MWH,
            factor_id: 'elec',
            error: null,
            warnings: [],
          },
          // Başka otelin birimi — bu otele UYGULANMAMALI.
          {
            unit_ids: [OTHER_UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_KWH,
            factor_id: 'elec-other',
            error: null,
            warnings: [],
          },
        ],
      },
      {
        id: ITEM_GAS,
        code: 'DGAZ',
        name: 'Doğalgaz',
        scope: 1,
        uoms: [{ id: UOM_M3, code: 'm³', name: 'Metreküp' }],
        mappings: [
          {
            unit_ids: [],
            year: 2025,
            option_value: null,
            uom_id: UOM_M3,
            factor_id: 'gas',
            error: null,
            warnings: [],
          },
        ],
      },
      {
        id: ITEM_WASTE,
        code: 'ATIK',
        name: 'Atık',
        scope: 3,
        uoms: [{ id: UOM_T, code: 't', name: 'Ton' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: null,
            uom_id: UOM_T,
            factor_id: null,
            error: { code: 'EXCLUDED_FROM_INVENTORY', reason: 'EXCLUDED' },
            warnings: [],
          },
        ],
      },
      {
        // 26.11.2026 canlı paketindeki yapı: varsayılan eşleme OPTION_REQUIRED,
        // faktörler yalnızca seçenekli (diesel/lpg) eşlemelerde.
        id: ITEM_VEHICLES,
        code: 'vehicles-by-fuel',
        name: 'Operasyonel Araçlar',
        scope: 1,
        uoms: [{ id: UOM_L, code: 'L', name: 'Litre' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: null,
            uom_id: null,
            factor_id: null,
            error: { code: 'FACTOR_NOT_AVAILABLE', reason: 'OPTION_REQUIRED' },
            warnings: [],
          },
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: 'diesel',
            uom_id: UOM_L,
            factor_id: '0193',
            error: null,
            warnings: [],
          },
          {
            unit_ids: [UNIT],
            year: 2025,
            option_value: 'lpg',
            uom_id: UOM_L,
            factor_id: null,
            error: { code: 'FACTOR_NOT_AVAILABLE', reason: 'UNVERIFIED' },
            warnings: [],
          },
        ],
      },
    ],
    factors: [
      factor({
        id: '0193',
        name: 'Fuels › Diesel',
        kg_co2e_per_uom: 2.66155,
        uom_id: UOM_L,
        uom_code: 'L',
        gwp_embedded: true,
        source_gwp_set: 'AR5',
        source: {
          code: 'DEFRA_2025',
          name: 'DEFRA 2025',
          version: 'v1.1',
          url: 'https://www.gov.uk/',
          license: 'Open Government Licence v3.0',
          attribution: 'Contains public sector information',
        },
      }),
      factor({
        id: 'elec',
        name: 'Electricity TR',
        kg_co2e_per_uom: 0.442,
        uom_id: UOM_KWH,
        uom_code: 'kWh',
        country_code: 'TR',
      }),
      factor({
        id: 'elec-other',
        kg_co2e_per_uom: 99,
        uom_id: UOM_KWH,
        uom_code: 'kWh',
      }),
      factor({
        id: 'gas',
        name: 'Natural gas',
        kg_co2e_per_uom: 2.0,
        uom_id: UOM_M3,
        uom_code: 'm³',
        gases: {
          basis: 'per_tj',
          co2: 56100,
          ch4: 1,
          n2o: 0.1,
          other_co2e: null,
          ncv_tj_per_uom: 0.0000343,
          ncv_source: 'IPCC',
        },
        biogenic_co2_kg_per_uom: 0.5,
      }),
    ],
    notices: [{ code: 'INTERNAL_USE', message: 'İç kullanım' }],
  };
}

function rec(over: Partial<ApprovedRecord>): ApprovedRecord {
  return {
    record_id: `r-${Math.random().toString(36).slice(2)}`,
    item: ITEM_FUEL,
    unit: UNIT,
    period: '2025-10',
    quantity: 240,
    uom: 'L',
    description: null,
    source: 'API · greengold',
    external_id: null,
    ...over,
  };
}

describe('convertQuantity — yalnızca belgelenmiş aynı-boyut dönüşümleri', () => {
  it.each([
    [1, 'MWh', 'kWh', 1000],
    [1, 'GJ', 'kWh', 277.7777777778],
    [1, 'ton', 'kg', 1000],
    [1, 'm³', 'L', 1000],
    [1, 'gal', 'litre', 3.785411784],
    [1, 'mile', 'km', 1.609344],
    [500, 'kWh', 'MWh', 0.5],
  ])('%p %s → %s = %p', (q, from, to, expected) => {
    expect(convertQuantity(q, from, to)).toBeCloseTo(expected, 9);
  });

  it('farklı boyut veya bilinmeyen birim → null (tahmin yok)', () => {
    expect(convertQuantity(1, 'L', 'kg')).toBeNull();
    expect(convertQuantity(1, 'kWh', 'm3')).toBeNull();
    expect(convertQuantity(1, 'Sm3', 'm3')).toBeNull();
  });
});

describe('selectMapping', () => {
  const item = pkg().items[1];

  it('başka birimin eşlemesini asla seçmez', () => {
    expect(selectMapping(item, UNIT, UOM_KWH, 2026)?.mapping.factor_id).toBe(
      'elec',
    );
  });

  it('kayıt yılı yoksa en yakın ÖNCEKİ yıl (FACTOR_YEAR_FALLBACK)', () => {
    const selected = selectMapping(item, UNIT, UOM_KWH, 2026);
    expect(selected?.fallbackYear).toBe(true);
    expect(selected?.mapping.year).toBe(2025);
  });

  it('sonraki yılın faktörünü ASLA kullanmaz', () => {
    expect(selectMapping(item, UNIT, UOM_KWH, 2024)).toBeNull();
  });

  it('seçenekli eşlemeleri değil varsayılanı (option_value: null) seçer', () => {
    const fuel = pkg().items[0];
    fuel.mappings.unshift({
      ...fuel.mappings[0],
      option_value: 'diesel',
      factor_id: 'baska',
    });
    const selected = selectMapping(fuel, UNIT, UOM_L, 2025);
    expect(selected?.mapping.option_value).toBeNull();
    expect(selected?.mapping.factor_id).toBe('0193');
  });
});

describe('calculateFromFactorPackage', () => {
  it('belgedeki örnek: 240 L dizel × 2,66155 = 638,772 kg CO₂e (Kapsam 1)', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({}),
    ]);
    expect(result.blocking).toEqual([]);
    expect(result.total_kg).toBeCloseTo(638.772, 6);
    expect(result.scope_totals_kg.scope_1).toBeCloseTo(638.772, 6);
    expect(result.lines[0]).toMatchObject({
      method: 'kg_co2e_per_uom',
      factor_id: '0193',
      factor_uom: 'L',
      company_declared: false,
      factor_source: { license: 'Open Government Licence v3.0' },
    });
  });

  it('MWh girilen elektrik faktörün kWh birimine çevrilir', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_ELEC, quantity: 182.4, uom: 'MWh' }),
    ]);
    expect(result.blocking).toEqual([]);
    expect(result.lines[0].quantity_in_factor_uom).toBeCloseTo(182_400, 6);
    expect(result.total_kg).toBeCloseTo(182_400 * 0.442, 6);
    expect(result.scope_totals_kg.scope_2).toBeCloseTo(182_400 * 0.442, 6);
  });

  it('gases doluysa per_tj formülü envanterin GWP setiyle uygulanır; biyojenik toplama girmez', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_GAS, quantity: 15_460, uom: 'm³' }),
    ]);
    const expected = 15_460 * 0.0000343 * (56100 + 1 * 29.8 + 0.1 * 273);
    expect(result.blocking).toEqual([]);
    expect(result.lines[0].method).toBe('gases_per_tj');
    expect(result.total_kg).toBeCloseTo(expected, 6);
    // kg_co2e_per_uom (2.0) KULLANILMADI
    expect(result.total_kg).not.toBeCloseTo(15_460 * 2, 0);
    expect(result.biogenic_co2_kg).toBeCloseTo(15_460 * 0.5, 6);
  });

  it('per_uom formülü other_co2e dahil hesaplanır', () => {
    const p = pkg();
    p.factors[3].gases = {
      basis: 'per_uom',
      co2: 1.8,
      ch4: 0.001,
      n2o: 0.0001,
      other_co2e: 0.05,
      ncv_tj_per_uom: null,
      ncv_source: null,
    };
    const result = calculateFromFactorPackage(p, UNIT, '2025-10', [
      rec({ item: ITEM_GAS, quantity: 100, uom: 'm³' }),
    ]);
    expect(result.total_kg).toBeCloseTo(
      100 * (1.8 + 0.001 * 29.8 + 0.0001 * 273 + 0.05),
      9,
    );
  });

  it('FACTOR_NOT_AVAILABLE → hesap durur, tahmin yapılmaz', () => {
    const p = pkg();
    p.items[1].mappings[0].error = {
      code: 'FACTOR_NOT_AVAILABLE',
      reason: 'SOURCE_NOT_REDISTRIBUTABLE',
    };
    p.items[1].mappings[0].factor_id = null;
    const result = calculateFromFactorPackage(p, UNIT, '2025-10', [
      rec({}),
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
    ]);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({
      code: 'FACTOR_NOT_AVAILABLE',
      item_name: 'Şebeke elektriği',
      provider_reason: 'SOURCE_NOT_REDISTRIBUTABLE',
    });
    // Diğer engel türleri gerekçe alanı taşımaz.
    const other = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_VEHICLES, quantity: 50, uom: 'L' }),
    ]);
    expect(other.blocking[0]).not.toHaveProperty('provider_reason');
  });

  it('EXCLUDED_FROM_INVENTORY kaydı sayılmaz ama listede görünür', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({}),
      rec({ item: ITEM_WASTE, quantity: 18.4, uom: 't' }),
    ]);
    expect(result.blocking).toEqual([]);
    expect(result.lines.find((l) => l.item_id === ITEM_WASTE)?.excluded).toBe(
      true,
    );
    expect(result.total_kg).toBeCloseTo(638.772, 6);
    expect(result.scope_totals_kg.scope_3).toBe(0);
  });

  it('kayıt yılının faktörü yoksa önceki yıl kullanılır ve uyarı eklenir', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2026-03', [
      rec({ item: ITEM_ELEC, period: '2026-03', quantity: 1000, uom: 'kWh' }),
    ]);
    expect(result.blocking).toEqual([]);
    expect(result.lines[0].warnings).toContain('FACTOR_YEAR_FALLBACK');
    expect(result.total_kg).toBeCloseTo(442, 9);
  });

  it('başlığın tanımadığı ölçü birimi → UOM_UNKNOWN', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ uom: 'kg' }),
    ]);
    expect(result.blocking[0].code).toBe('UOM_UNKNOWN');
  });

  it('pakette olmayan başlık → ITEM_NOT_IN_PACKAGE', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: '99999999-9999-4999-8999-999999999999' }),
    ]);
    expect(result.blocking[0].code).toBe('ITEM_NOT_IN_PACKAGE');
  });

  it('envanter dönemi dışındaki ay → PERIOD_OUTSIDE_INVENTORY', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2027-01', [
      rec({ period: '2027-01' }),
    ]);
    expect(result.blocking[0].code).toBe('PERIOD_OUTSIDE_INVENTORY');
  });

  it('kapsam kırılımı toplamla tutarlıdır', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({}),
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
      rec({ item: ITEM_GAS, quantity: 100, uom: 'm³' }),
    ]);
    const s = result.scope_totals_kg;
    expect(s.scope_1 + s.scope_2 + s.scope_3 + s.unscoped).toBeCloseTo(
      result.total_kg,
      9,
    );
    expect(result.notices).toEqual([
      { code: 'INTERNAL_USE', message: 'İç kullanım' },
    ]);
  });
});

describe('seçenekli başlıklar (ör. yakıt türü)', () => {
  it('canlı paket yapısı: varsayılan eşleme OPTION_REQUIRED → hesap durur', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_VEHICLES, quantity: 100, uom: 'L' }),
    ]);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({
      code: 'OPTION_REQUIRED',
      item_name: 'Operasyonel Araçlar',
    });
    expect(result.total_kg).toBe(0);
    expect(result.lines[0].method).toBeNull();
  });

  it('varsayılan eşlemede faktör olsa bile seçenekli başlık tahminle hesaplanmaz', () => {
    const p = pkg();
    const vehicles = p.items[4];
    vehicles.mappings[0] = {
      ...vehicles.mappings[0],
      uom_id: UOM_L,
      factor_id: '0193',
      error: null,
    };
    const result = calculateFromFactorPackage(p, UNIT, '2025-10', [
      rec({ item: ITEM_VEHICLES, quantity: 100, uom: 'L' }),
    ]);
    expect(result.blocking[0]?.code).toBe('OPTION_REQUIRED');
    expect(result.total_kg).toBe(0);
  });

  it('tek seçenekli başlık (ör. jeneratör dizeli) normal hesaplanır', () => {
    expect(itemRequiresOption(pkg().items[0])).toBe(false);
    expect(itemRequiresOption(pkg().items[4])).toBe(true);
  });

  it('seçenekli başlık diğer kalemleri sessizce düşürmez: blocking listesinde görünür', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
      rec({ item: ITEM_VEHICLES, quantity: 50, uom: 'L' }),
    ]);
    expect(result.blocking.map((b) => b.code)).toEqual(['OPTION_REQUIRED']);
    expect(result.lines).toHaveLength(2);
  });
});

describe('hesap kapsamı (coverage)', () => {
  it('hesaplanan kapsamlar satırlardan çıkar; DERIVED_ROWS_NOT_INCLUDED → WTT pakette yok', () => {
    const p = pkg();
    p.notices.push({ code: 'DERIVED_ROWS_NOT_INCLUDED', message: 'WTT yok' });
    const result = calculateFromFactorPackage(p, UNIT, '2025-10', [
      rec({}),
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
      rec({ item: ITEM_WASTE, quantity: 1, uom: 't' }), // envanter dışı
    ]);
    expect(result.coverage).toMatchObject({
      scopes_calculated: [1, 2],
      wtt_scope3_cat3: 'not_in_package',
      biogenic_co2: 'outside_scopes',
    });
    expect(result.coverage.label).toContain('Kapsam 1 + Kapsam 2');
    expect(result.coverage.label).toContain('WTT');
  });

  it('not yoksa WTT durumu "not_flagged" olur', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
    ]);
    expect(result.coverage.wtt_scope3_cat3).toBe('not_flagged');
    expect(result.coverage.scopes_calculated).toEqual([2]);
  });

  it('ileride pakete Kapsam 3 (WTT) faktörü eklenirse kod değişmeden toplama girer', () => {
    const p = pkg();
    const WTT_ITEM = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    p.items.push({
      id: WTT_ITEM,
      code: 'wtt-natural-gas',
      name: 'Doğalgaz WTT',
      scope: 3,
      uoms: [{ id: UOM_M3, code: 'm³', name: 'Metreküp' }],
      mappings: [
        {
          unit_ids: [],
          year: 2025,
          option_value: null,
          uom_id: UOM_M3,
          factor_id: 'wtt-gas',
          error: null,
          warnings: [],
        },
      ],
    });
    p.factors.push(
      factor({
        id: 'wtt-gas',
        kg_co2e_per_uom: 0.34,
        uom_id: UOM_M3,
        uom_code: 'm³',
      }),
    );
    const result = calculateFromFactorPackage(p, UNIT, '2025-10', [
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
      rec({ item: WTT_ITEM, quantity: 100, uom: 'm³' }),
    ]);
    expect(result.blocking).toEqual([]);
    expect(result.scope_totals_kg.scope_3).toBeCloseTo(34, 9);
    expect(result.coverage.scopes_calculated).toEqual([2, 3]);
  });

  it('satır faktör ülkesini taşır (null → ülkeden bağımsız)', () => {
    const result = calculateFromFactorPackage(pkg(), UNIT, '2025-10', [
      rec({}),
      rec({ item: ITEM_ELEC, quantity: 1000, uom: 'kWh' }),
    ]);
    expect(result.lines[0].factor_country_code).toBeNull();
    expect(result.lines[1].factor_country_code).toBe('TR');
  });
});

describe('itemFactorStatus — veri girişi öncesi faktör durumu', () => {
  it('birime bağlı faktörlü eşleme → available (önceki yıl dahil)', () => {
    expect(itemFactorStatus(pkg().items[1], UNIT, 2026)).toBe('available');
    expect(itemFactorStatus(pkg().items[1], UNIT, 2025)).toBe('available');
  });
  it('yalnız sonraki yıl eşlemesi varsa → not_available', () => {
    expect(itemFactorStatus(pkg().items[1], UNIT, 2024)).toBe('not_available');
  });
  it('şirket geneli eşleme birime de uygulanır', () => {
    expect(itemFactorStatus(pkg().items[2], UNIT, 2025)).toBe('available');
  });
  it('seçenekli başlık → option_required', () => {
    expect(itemFactorStatus(pkg().items[4], UNIT, 2025)).toBe(
      'option_required',
    );
  });
  it('envanter dışı → excluded', () => {
    expect(itemFactorStatus(pkg().items[3], UNIT, 2025)).toBe('excluded');
  });
  it('FACTOR_NOT_AVAILABLE hatalı eşleme → factor_unavailable + sağlayıcı gerekçesi', () => {
    const p = pkg();
    for (const m of p.items[1].mappings) {
      m.error = {
        code: 'FACTOR_NOT_AVAILABLE',
        reason: 'SOURCE_NOT_REDISTRIBUTABLE',
      };
      m.factor_id = null;
    }
    expect(itemFactorStatus(p.items[1], UNIT, 2025)).toBe('factor_unavailable');
    expect(itemFactorDetail(p.items[1], UNIT, 2025)).toEqual({
      status: 'factor_unavailable',
      reason: 'SOURCE_NOT_REDISTRIBUTABLE',
    });
  });
  it('eşlemelerden biri faktörlü ise available (hatalı olan yok sayılır)', () => {
    const p = pkg();
    p.items[1].mappings[0].error = {
      code: 'FACTOR_NOT_AVAILABLE',
      reason: 'SOURCE_NOT_REDISTRIBUTABLE',
    };
    expect(itemFactorDetail(p.items[1], UNIT, 2026).status).toBe('available');
  });
  it('başka hata kodu (FACTOR_NOT_AVAILABLE değil) → not_available', () => {
    const p = pkg();
    for (const m of p.items[1].mappings) {
      m.error = { code: 'SOMETHING_ELSE', reason: 'X' };
    }
    expect(itemFactorDetail(p.items[1], UNIT, 2025)).toEqual({
      status: 'not_available',
      reason: null,
    });
  });
  it('başka birimin eşlemesi bu birime sayılmaz', () => {
    expect(itemFactorStatus(pkg().items[1], OTHER_UNIT, 2026)).toBe(
      'available',
    );
    const p = pkg();
    p.items[1].mappings = p.items[1].mappings.filter((m) =>
      m.unit_ids.includes(OTHER_UNIT),
    );
    expect(itemFactorStatus(p.items[1], UNIT, 2026)).toBe('not_available');
  });
});
