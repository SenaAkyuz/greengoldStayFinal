import type {
  ApprovedRecord,
  FactorPackage,
  FactorPackageFactor,
} from './connecthub.client';
import { calculateFromFactorPackage } from './factor-calculation';
import {
  FACTOR_COUNTRY_FALLBACK,
  assessFactorCountries,
  normalizeCountryCode,
} from './country-check';

/**
 * Fikstür, 26.11.2026'da "Green Gold Test – 2026" envanterinden indirilen
 * gerçek paketin yapısını izler: elektrik Ember şebeke faktörü (ülkeye bağlı),
 * doğalgaz DEFRA yanma faktörü (country_code: null).
 */
const UNIT = '054caeeb-a602-4ac8-f193-08df4a2b430d';
const ITEM_ELEC = '01a00f9a-3470-7993-9650-878b8de75f15';
const ITEM_GAS = '01a00f95-9552-7ef7-a9e0-28cccc4a32d9';
const UOM_KWH = '0199f000-0101-7000-8000-000000000001';
const UOM_M3 = '0199f000-0302-7000-8000-000000000001';

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
    gwp_embedded: true,
    source_gwp_set: null,
    gases: null,
    factor_kind: null,
    includes_transmission_losses: null,
    data_year: 2025,
    publication_year: 2026,
    country_code: null,
    biogenic_co2_kg_per_uom: null,
    company_declared: false,
    verification: null,
    source: null,
    ...over,
  };
}

function pkg(elec: {
  country: string | null;
  warnings: string[];
}): FactorPackage {
  return {
    release: {
      schema_version: '1.0',
      release_id: '2026-6720a7fdd0e2',
      generated_at: '2026-11-26T08:48:57Z',
      content_hash: '6720a7fd',
    },
    inventory: {
      id: '01a216d1-714d-7a2f-898e-9cdb3f21014b',
      name: 'Green Gold Test – 2026',
      year: 2026,
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      gwp_set: 'AR6',
      gwp_ch4: 29.8,
      gwp_n2o: 273,
      dataset: 'defra',
      combustion_dataset: 'defra',
      default_country_code: null,
      scope2_method: 'location_based',
    },
    items: [
      {
        id: ITEM_ELEC,
        code: 'grid-electricity',
        name: 'Şebeke Elektriği',
        scope: 2,
        uoms: [{ id: UOM_KWH, code: 'kWh', name: 'kWh' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_KWH,
            factor_id: 'elec',
            error: null,
            warnings: elec.warnings,
          },
        ],
      },
      {
        id: ITEM_GAS,
        code: 'natural-gas-by-purpose',
        name: 'Isınma Amaçlı',
        scope: 1,
        uoms: [{ id: UOM_M3, code: 'm3', name: 'm³' }],
        mappings: [
          {
            unit_ids: [UNIT],
            year: 2026,
            option_value: null,
            uom_id: UOM_M3,
            factor_id: 'gas',
            error: null,
            warnings: ['FACTOR_YEAR_FALLBACK'],
          },
        ],
      },
    ],
    factors: [
      factor({
        id: 'elec',
        name: 'Elektrik › Şebeke ortalaması',
        kg_co2e_per_uom: 0.469657,
        uom_id: UOM_KWH,
        uom_code: 'kWh',
        country_code: elec.country,
      }),
      factor({
        id: 'gas',
        name: 'Fuels › Gaseous fuels › Natural gas',
        kg_co2e_per_uom: 2.06672,
        uom_id: UOM_M3,
        uom_code: 'm3',
        country_code: null,
      }),
    ],
    notices: [],
  };
}

const rec = (item: string, quantity: number, uom: string): ApprovedRecord => ({
  record_id: `r-${item.slice(0, 4)}`,
  item,
  unit: UNIT,
  period: '2026-10',
  quantity,
  uom,
  description: null,
  source: 'API · GreenGold Test Yazma',
  external_id: null,
});

function calc(
  elec: { country: string | null; warnings: string[] },
  withGas = true,
) {
  const records = [rec(ITEM_ELEC, 1000, 'kWh')];
  if (withGas) records.push(rec(ITEM_GAS, 500, 'm3'));
  return calculateFromFactorPackage(pkg(elec), UNIT, '2026-10', records);
}

const FALLBACK = [FACTOR_COUNTRY_FALLBACK, 'FACTOR_YEAR_FALLBACK'];

describe('normalizeCountryCode', () => {
  it.each([
    ['TR', 'TR', 'valid'],
    [' tr ', 'TR', 'valid'],
    ['gb', 'GB', 'valid'],
    ['', null, 'missing'],
    [null, null, 'missing'],
    [undefined, null, 'missing'],
    ['TUR', null, 'invalid'],
    ['T1', null, 'invalid'],
    ['XX', null, 'invalid'],
    ['ZZ', null, 'invalid'],
  ])('%p → %p (%s)', (raw, code, status) => {
    expect(normalizeCountryCode(raw)).toEqual({
      code,
      status,
    });
  });
});

describe('assessFactorCountries', () => {
  it('hesap ülke ne olursa olsun yapılır; yalnızca yayın izni değişir', () => {
    const result = calc({ country: 'AE', warnings: FALLBACK });
    expect(result.blocking).toEqual([]);
    expect(result.total_kg).toBeCloseTo(469.657 + 1033.36, 6);
  });

  it('ülke mevcut + faktör aynı ülke (geri düşme yok) → yayınlanabilir', () => {
    const check = assessFactorCountries(
      calc({ country: 'TR', warnings: [] }),
      'TR',
    );
    expect(check.publishable).toBe(true);
    expect(check.hotel_country_status).toBe('valid');
    expect(check.lines.map((l) => l.status)).toEqual([
      'country_match',
      'country_independent',
    ]);
  });

  it('3pmetrics birim ülkesi boş ama faktör açıkça tesis ülkesine ait → yayınlanabilir', () => {
    const check = assessFactorCountries(
      calc({ country: 'TR', warnings: FALLBACK }),
      'TR',
    );
    expect(check.publishable).toBe(true);
    expect(check.lines[0]).toMatchObject({
      status: 'country_match',
      provider_country_fallback: true,
    });
  });

  it('bugünkü gerçek durum: tesis TR, faktör AE (geri düşme) → yalnız önizleme', () => {
    const check = assessFactorCountries(
      calc({ country: 'AE', warnings: FALLBACK }),
      'TR',
    );
    expect(check.publishable).toBe(false);
    expect(check.lines[0]).toMatchObject({
      item_name: 'Şebeke Elektriği',
      factor_country_code: 'AE',
      status: 'country_mismatch',
      publishable: false,
    });
    // Ülkeden bağımsız doğalgaz satırı etkilenmez.
    expect(check.lines[1]).toMatchObject({
      status: 'country_independent',
      publishable: true,
    });
    expect(check.messages.join(' ')).toContain('widget');
  });

  it('geri düşme olmasa da faktör başka ülkeye aitse → yalnız önizleme', () => {
    const check = assessFactorCountries(
      calc({ country: 'DE', warnings: [] }),
      'TR',
    );
    expect(check.publishable).toBe(false);
    expect(check.lines[0].status).toBe('country_mismatch');
  });

  it('ülke eksik + sağlayıcı geri düştü → doğrulanamaz, yalnız önizleme', () => {
    const check = assessFactorCountries(
      calc({ country: 'AE', warnings: FALLBACK }),
      null,
    );
    expect(check.hotel_country_status).toBe('missing');
    expect(check.publishable).toBe(false);
    expect(check.lines[0].status).toBe('country_unverified');
  });

  it('ülke eksik + sağlayıcı geri düşmeden birim ülkesine eşledi → yayınlanabilir', () => {
    const check = assessFactorCountries(
      calc({ country: 'TR', warnings: [] }),
      '',
    );
    expect(check.publishable).toBe(true);
    expect(check.lines[0].status).toBe('provider_matched');
  });

  it('ülke eksik ama yalnızca ülkeden bağımsız faktörler → yayınlanabilir', () => {
    const result = calculateFromFactorPackage(
      pkg({ country: 'AE', warnings: FALLBACK }),
      UNIT,
      '2026-10',
      [rec(ITEM_GAS, 500, 'm3')],
    );
    const check = assessFactorCountries(result, undefined);
    expect(check.publishable).toBe(true);
    expect(check.lines).toHaveLength(1);
    expect(check.lines[0].status).toBe('country_independent');
  });

  it('faktörün ülkesi yok ama sağlayıcı geri düştüğünü söylüyor → doğrulanamaz', () => {
    const check = assessFactorCountries(
      calc({ country: null, warnings: FALLBACK }),
      'TR',
    );
    expect(check.publishable).toBe(false);
    expect(check.lines[0].status).toBe('country_unverified');
  });

  it('geçersiz ülke kodu → ülkeye bağlı satır doğrulanamaz, bağımsız satır etkilenmez', () => {
    const check = assessFactorCountries(
      calc({ country: 'TR', warnings: [] }),
      'XX',
    );
    expect(check.hotel_country_status).toBe('invalid');
    expect(check.hotel_country_code).toBeNull();
    expect(check.publishable).toBe(false);
    expect(check.lines.map((l) => l.status)).toEqual([
      'country_unverified',
      'country_independent',
    ]);
    expect(check.messages[0]).toContain('geçersiz');
  });

  it('küçük harf / boşluklu kod normalize edilir', () => {
    const check = assessFactorCountries(
      calc({ country: 'tr', warnings: [] }),
      ' tr ',
    );
    expect(check.publishable).toBe(true);
    expect(check.lines[0].status).toBe('country_match');
  });

  it('hesaplanamayan (bloklu) satırlar ülke değerlendirmesine girmez', () => {
    const result = calculateFromFactorPackage(
      pkg({ country: 'TR', warnings: [] }),
      UNIT,
      '2026-10',
      [rec(ITEM_ELEC, 1000, 'MJ')], // tanımsız birim → UOM_UNKNOWN
    );
    expect(result.blocking[0].code).toBe('UOM_UNKNOWN');
    const check = assessFactorCountries(result, 'TR');
    expect(check.lines).toEqual([]);
  });
});
