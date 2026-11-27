import type {
  ApprovedRecord,
  FactorPackage,
  FactorPackageFactor,
  FactorPackageItem,
  FactorPackageMapping,
} from './connecthub.client';

/**
 * 3pmetrics faktör paketiyle bir birimin (otelin) dönem emisyonunu hesaplar.
 *
 * Kurallar ConnectHub Geliştirici belgelerindeki "Hesap" bölümünden birebir:
 *
 *  1. Eşlemeyi seç: kaydın birimi, yılı ve girildiği ölçü birimiyle eşleşen
 *     `option_value: null` mapping. ConnectHub kayıtları seçenek (ör. yakıt
 *     türü) TAŞIMAZ: başlıkta seçenekli eşleme varsa ya da varsayılan eşleme
 *     `OPTION_REQUIRED` diyorsa kaydın gerçek seçeneği bilinemez → hesap
 *     `OPTION_REQUIRED` ile durur (varsayılan faktörle tahmin YAPILMAZ).
 *  2. Tek CO₂e değeri: kg CO₂e = miktar × kg_co2e_per_uom. Miktar faktörün
 *     kendi ölçü biriminde olmalı; eşlemedeki birim farklıysa önce o birime
 *     çevrilir. Paket birim dönüşümü vermez; dönüşümler yalnızca aynı fiziksel
 *     boyut içindedir (yoğunluk/kalorifik değer gerekmez):
 *       1 MWh = 1000 kWh · 1 GJ = 277,7777777778 kWh · 1 ton = 1000 kg ·
 *       1 m³ = 1000 litre · 1 galon (ABD) = 3,785411784 litre · 1 mil = 1,609344 km
 *  3. Gaz kırılımı ve GWP: gases doluysa
 *       per_tj : miktar × ncv_tj_per_uom × (co2 + ch4×gwp_ch4 + n2o×gwp_n2o)
 *       per_uom: miktar × (co2 + ch4×gwp_ch4 + n2o×gwp_n2o + other_co2e)
 *     GWP değerleri ENVANTERİN setinden (inventory.gwp_ch4 / gwp_n2o) gelir.
 *     gwp_embedded: true olan kg_co2e_per_uom başka bir GWP setine çevrilmez.
 *  4. Uyarılar:
 *       FACTOR_NOT_AVAILABLE   → tahmini değer KULLANILMAZ; hesap durur.
 *       EXCLUDED_FROM_INVENTORY→ rapor saymaz, biz de saymayız.
 *       FACTOR_YEAR_FALLBACK   → kayıt yılının faktörü yoksa en yakın ÖNCEKİ yıl,
 *                                sonraki yıl ASLA.
 *       Biyojenik CO₂ ayrı alandır, toplama girmez.
 *
 * Saf fonksiyondur: ağ/DB yok. Bir kalem bile güvenle hesaplanamazsa sonuç
 * `blocking` listesiyle döner ve çağıran taraf fiyat ÜRETMEZ.
 */

export type CalculationMethod =
  'kg_co2e_per_uom' | 'gases_per_uom' | 'gases_per_tj';

export interface CalculationLine {
  record_id: string;
  external_id: string | null;
  source: string;
  item_id: string;
  item_code: string | null;
  item_name: string;
  scope: number | null;
  period: string;
  quantity: number;
  uom: string;
  excluded: boolean;
  factor_id: string | null;
  factor_name: string | null;
  factor_uom: string | null;
  quantity_in_factor_uom: number | null;
  method: CalculationMethod | null;
  kg_co2e: number;
  biogenic_co2_kg: number | null;
  data_year: number | null;
  /** Faktörün ülkesi (paketteki `country_code`); null → ülkeden bağımsız. */
  factor_country_code: string | null;
  company_declared: boolean;
  factor_source: {
    name: string;
    version: string | null;
    license: string | null;
    attribution: string | null;
    url: string | null;
  } | null;
  warnings: string[];
}

export interface BlockingIssue {
  code:
    | 'ITEM_NOT_IN_PACKAGE'
    | 'UOM_UNKNOWN'
    | 'NO_MAPPING'
    | 'OPTION_REQUIRED'
    | 'FACTOR_NOT_AVAILABLE'
    | 'FACTOR_MISSING'
    | 'UOM_CONVERSION_UNSUPPORTED'
    | 'NO_FACTOR_VALUE'
    | 'PERIOD_OUTSIDE_INVENTORY'
    | 'INVALID_QUANTITY';
  record_id: string;
  item_name: string;
  message: string;
  /**
   * Yalnız FACTOR_NOT_AVAILABLE: sağlayıcının eşlemedeki gerekçe kodu
   * (ör. SOURCE_NOT_REDISTRIBUTABLE — faktörün kaynağı lisans gereği pakette
   * paylaşılamıyor). Panel bunu kullanıcı diline çevirir.
   */
  provider_reason?: string | null;
}

export interface CalculationResult {
  unit_id: string;
  period: string;
  inventory: {
    id: string;
    name: string;
    year: number;
    gwp_set: string;
    dataset: string;
    scope2_method: string;
  };
  release: { release_id: string; content_hash: string; generated_at: string };
  lines: CalculationLine[];
  blocking: BlockingIssue[];
  total_kg: number;
  scope_totals_kg: {
    scope_1: number;
    scope_2: number;
    scope_3: number;
    unscoped: number;
  };
  biogenic_co2_kg: number;
  notices: { code: string; message: string }[];
  has_company_declared_factors: boolean;
  coverage: CalculationCoverage;
}

/**
 * Hesabın kapsamı — sonuçla birlikte açıkça gösterilir. Paket ileride WTT
 * (Kapsam 3 kat. 3) faktörlerini başlık/eşleme olarak verirse bu satırlar
 * normal akışla `scope_3` toplamına girer ve `scopes_calculated` değişir;
 * hesap kodunda ayrı bir dal gerekmez.
 */
export interface CalculationCoverage {
  /** Hesaplanan (dışlanmamış, faktörü uygulanmış) satırların kapsamları. */
  scopes_calculated: number[];
  /** Pakette `DERIVED_ROWS_NOT_INCLUDED` notu varsa WTT pakette yoktur. */
  wtt_scope3_cat3: 'not_in_package' | 'not_flagged';
  /** Biyojenik CO₂ kapsamlar dışıdır, toplama girmez. */
  biogenic_co2: 'outside_scopes';
  label: string;
}

const DERIVED_ROWS_NOT_INCLUDED = 'DERIVED_ROWS_NOT_INCLUDED';
const OPTION_REQUIRED = 'OPTION_REQUIRED';

/** Başlık seçenek (ör. yakıt türü) gerektiriyor mu? */
export function itemRequiresOption(item: FactorPackageItem): boolean {
  return item.mappings.some(
    (m) =>
      m.option_value !== null ||
      m.error?.reason === OPTION_REQUIRED ||
      m.error?.code === OPTION_REQUIRED,
  );
}

/**
 * Bir başlığın bu birim ve yıl için faktör durumu (veri girişinden ÖNCE
 * kullanıcıya göstermek için). Hesap sırasında asıl karar
 * `calculateFromFactorPackage` içinde verilir; bu fonksiyon onu taklit etmez,
 * yalnızca paketteki eşlemelere bakar:
 *   option_required → kayıtlar seçenek taşımadığı için hesaplanamaz
 *   excluded        → envanter dışı (hesaba katılmaz)
 *   available          → kayıt yılı veya önceki bir yıl için faktörlü eşleme var
 *   factor_unavailable → eşleme VAR ama sağlayıcı faktörü veremiyor
 *                        (`error.code = FACTOR_NOT_AVAILABLE`, ör. kaynak
 *                        lisansı paylaşıma kapalı). Kayıt sağlayıcının kendi
 *                        envanteri için geçerlidir, girilebilir; bizim hesap
 *                        bu kalemde durur (tahmin yapılmaz).
 *   not_available      → uygun eşleme/faktör yok
 */
export type ItemFactorStatus =
  | 'available'
  | 'option_required'
  | 'excluded'
  | 'factor_unavailable'
  | 'not_available';

export interface ItemFactorDetail {
  status: ItemFactorStatus;
  /** factor_unavailable ise sağlayıcının gerekçe kodu (yoksa null). */
  reason: string | null;
}

const FACTOR_NOT_AVAILABLE = 'FACTOR_NOT_AVAILABLE';

export function itemFactorDetail(
  item: FactorPackageItem,
  unitId: string,
  year: number,
): ItemFactorDetail {
  if (itemRequiresOption(item))
    return { status: 'option_required', reason: null };
  const own = item.mappings.filter((m) => m.unit_ids.includes(unitId));
  const pool = (
    own.length ? own : item.mappings.filter((m) => m.unit_ids.length === 0)
  ).filter((m) => m.option_value === null && m.year <= year);
  if (!pool.length) return { status: 'not_available', reason: null };
  const isExcluded = (m: FactorPackageMapping) =>
    m.error?.code === EXCLUDED || m.warnings.includes(EXCLUDED);
  if (pool.every(isExcluded)) return { status: 'excluded', reason: null };
  if (pool.some((m) => !isExcluded(m) && !m.error && m.factor_id)) {
    return { status: 'available', reason: null };
  }
  const unavailable = pool.find(
    (m) => !isExcluded(m) && m.error?.code === FACTOR_NOT_AVAILABLE,
  );
  return unavailable
    ? {
        status: 'factor_unavailable',
        reason: unavailable.error?.reason || null,
      }
    : { status: 'not_available', reason: null };
}

export function itemFactorStatus(
  item: FactorPackageItem,
  unitId: string,
  year: number,
): ItemFactorStatus {
  return itemFactorDetail(item, unitId, year).status;
}

export function describeCoverage(
  lines: CalculationLine[],
  notices: { code: string }[],
): CalculationCoverage {
  const scopes = [
    ...new Set(
      lines
        .filter((l) => !l.excluded && l.method !== null && l.scope !== null)
        .map((l) => l.scope as number),
    ),
  ].sort((a, b) => a - b);
  const wtt = notices.some((n) => n.code === DERIVED_ROWS_NOT_INCLUDED)
    ? 'not_in_package'
    : 'not_flagged';
  const scopeText = scopes.length
    ? scopes.map((s) => `Kapsam ${s}`).join(' + ')
    : 'hesaplanan kapsam yok';
  const label =
    wtt === 'not_in_package'
      ? `${scopeText} · WTT (Kapsam 3 kat. 3) ve biyojenik CO₂ dahil değil`
      : `${scopeText} · biyojenik CO₂ dahil değil`;
  return {
    scopes_calculated: scopes,
    wtt_scope3_cat3: wtt,
    biogenic_co2: 'outside_scopes',
    label,
  };
}

// --- Birim dönüşümü -----------------------------------------------------------

type Dimension = 'energy' | 'mass' | 'volume' | 'distance';
const UOM_TABLE: Record<string, { dim: Dimension; toBase: number }> = {
  kwh: { dim: 'energy', toBase: 1 },
  mwh: { dim: 'energy', toBase: 1000 },
  gj: { dim: 'energy', toBase: 277.7777777778 },
  kg: { dim: 'mass', toBase: 1 },
  t: { dim: 'mass', toBase: 1000 },
  ton: { dim: 'mass', toBase: 1000 },
  tonne: { dim: 'mass', toBase: 1000 },
  tonnes: { dim: 'mass', toBase: 1000 },
  l: { dim: 'volume', toBase: 1 },
  lt: { dim: 'volume', toBase: 1 },
  litre: { dim: 'volume', toBase: 1 },
  liter: { dim: 'volume', toBase: 1 },
  m3: { dim: 'volume', toBase: 1000 },
  gal: { dim: 'volume', toBase: 3.785411784 },
  gallon: { dim: 'volume', toBase: 3.785411784 },
  km: { dim: 'distance', toBase: 1 },
  mi: { dim: 'distance', toBase: 1.609344 },
  mile: { dim: 'distance', toBase: 1.609344 },
};

export function normalizeUom(code: string | null | undefined): string {
  return (code ?? '')
    .trim()
    .toLowerCase()
    .replace('m³', 'm3')
    .replace(/\s+/g, '');
}

/**
 * `quantity` değerini `fromCode` biriminden `toCode` birimine çevirir.
 * Aynı kod → aynen. Farklı boyut veya bilinmeyen kod → null (tahmin yok).
 */
export function convertQuantity(
  quantity: number,
  fromCode: string | null | undefined,
  toCode: string | null | undefined,
): number | null {
  const from = normalizeUom(fromCode);
  const to = normalizeUom(toCode);
  if (!from || !to) return null;
  if (from === to) return quantity;
  const a = UOM_TABLE[from];
  const b = UOM_TABLE[to];
  if (!a || !b || a.dim !== b.dim) return null;
  return (quantity * a.toBase) / b.toBase;
}

// --- Eşleme seçimi --------------------------------------------------------------

const EXCLUDED = 'EXCLUDED_FROM_INVENTORY';
const YEAR_FALLBACK = 'FACTOR_YEAR_FALLBACK';

function appliesToUnit(mapping: FactorPackageMapping, unitId: string): boolean {
  return mapping.unit_ids.includes(unitId);
}

/**
 * Birim + ölçü birimi + yıl için mapping. Önce kayıt yılı; yoksa en yakın
 * ÖNCEKİ yıl (FACTOR_YEAR_FALLBACK). Seçenek her zaman varsayılan (null).
 * Birime açıkça bağlı eşleme yoksa unit_ids'i boş (şirket geneli) olanlar denenir.
 */
export function selectMapping(
  item: FactorPackageItem,
  unitId: string,
  uomId: string,
  year: number,
): { mapping: FactorPackageMapping; fallbackYear: boolean } | null {
  const scoped = item.mappings.filter(
    (m) => m.uom_id === uomId && m.option_value === null,
  );
  const forUnit = scoped.filter((m) => appliesToUnit(m, unitId));
  const pool = forUnit.length
    ? forUnit
    : scoped.filter((m) => m.unit_ids.length === 0);
  if (!pool.length) return null;

  const exact = pool.find((m) => m.year === year);
  if (exact) return { mapping: exact, fallbackYear: false };

  const earlier = pool
    .filter((m) => m.year < year)
    .sort((a, b) => b.year - a.year)[0];
  return earlier ? { mapping: earlier, fallbackYear: true } : null;
}

// --- Ana hesap ----------------------------------------------------------------------

function periodBounds(period: string): { start: string; end: string } | null {
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      start: `${month[1]}-${month[2]}-01`,
      end: `${month[1]}-${month[2]}-${String(last).padStart(2, '0')}`,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return { start: period, end: period };
  if (/^\d{4}$/.test(period)) {
    return { start: `${period}-01-01`, end: `${period}-12-31` };
  }
  return null;
}

function computeKg(
  factor: FactorPackageFactor,
  quantity: number,
  gwpCh4: number,
  gwpN2o: number,
): { kg: number; method: CalculationMethod } | null {
  const gases = factor.gases;
  if (gases) {
    const gwpSum = gases.co2 + gases.ch4 * gwpCh4 + gases.n2o * gwpN2o;
    const basis = gases.basis.trim().toLowerCase();
    if (basis === 'per_tj') {
      if (gases.ncv_tj_per_uom === null) return null;
      return {
        kg: quantity * gases.ncv_tj_per_uom * gwpSum,
        method: 'gases_per_tj',
      };
    }
    if (basis === 'per_uom') {
      return {
        kg: quantity * (gwpSum + (gases.other_co2e ?? 0)),
        method: 'gases_per_uom',
      };
    }
    // Bilinmeyen basis: tahmin yok — tek değer varsa ona düş.
  }
  if (factor.kg_co2e_per_uom !== null) {
    return {
      kg: quantity * factor.kg_co2e_per_uom,
      method: 'kg_co2e_per_uom',
    };
  }
  return null;
}

export function calculateFromFactorPackage(
  pkg: FactorPackage,
  unitId: string,
  period: string,
  records: ApprovedRecord[],
): CalculationResult {
  const items = new Map(pkg.items.map((item) => [item.id, item]));
  const factors = new Map(pkg.factors.map((factor) => [factor.id, factor]));
  const inv = pkg.inventory;

  const lines: CalculationLine[] = [];
  const blocking: BlockingIssue[] = [];

  const bounds = periodBounds(period);
  const outsideInventory =
    !bounds ||
    bounds.start < inv.period_start ||
    (inv.period_end !== null && bounds.end > inv.period_end);

  for (const record of records) {
    const item = items.get(record.item);
    const itemName = item?.name ?? record.item;
    const base: CalculationLine = {
      record_id: record.record_id,
      external_id: record.external_id,
      source: record.source,
      item_id: record.item,
      item_code: item?.code ?? null,
      item_name: itemName,
      scope: item?.scope ?? null,
      period: record.period,
      quantity: record.quantity,
      uom: record.uom ?? '',
      excluded: false,
      factor_id: null,
      factor_name: null,
      factor_uom: null,
      quantity_in_factor_uom: null,
      method: null,
      kg_co2e: 0,
      biogenic_co2_kg: null,
      data_year: null,
      factor_country_code: null,
      company_declared: false,
      factor_source: null,
      warnings: [],
    };
    const block = (
      code: BlockingIssue['code'],
      message: string,
      providerReason?: string | null,
    ) => {
      blocking.push({
        code,
        record_id: record.record_id,
        item_name: itemName,
        message,
        ...(providerReason !== undefined
          ? { provider_reason: providerReason }
          : {}),
      });
      lines.push(base);
    };

    if (!(record.quantity >= 0) || !Number.isFinite(record.quantity)) {
      block('INVALID_QUANTITY', 'Kayıt miktarı geçersiz.');
      continue;
    }
    if (outsideInventory) {
      block(
        'PERIOD_OUTSIDE_INVENTORY',
        `Dönem ${period}, envanter dönemi (${inv.period_start} – ${inv.period_end ?? 'açık'}) dışında.`,
      );
      continue;
    }
    if (!item) {
      block(
        'ITEM_NOT_IN_PACKAGE',
        'Başlık faktör paketinde yok (okuma anahtarının kapsamına eklenmemiş olabilir).',
      );
      continue;
    }

    const recordUom = item.uoms.find(
      (u) => normalizeUom(u.code) === normalizeUom(record.uom),
    );
    if (!recordUom) {
      block(
        'UOM_UNKNOWN',
        `Ölçü birimi "${record.uom ?? ''}" bu başlıkta tanımlı değil.`,
      );
      continue;
    }

    if (itemRequiresOption(item)) {
      block(
        'OPTION_REQUIRED',
        'Başlık seçenek (ör. yakıt türü) gerektiriyor; ConnectHub kayıtları seçenek taşımadığı için doğru faktör seçilemez. Tahmini/varsayılan faktör kullanılmaz.',
      );
      continue;
    }

    const year = Number((bounds?.start ?? record.period).slice(0, 4));
    const selected = selectMapping(item, unitId, recordUom.id, year);
    if (!selected) {
      block(
        'NO_MAPPING',
        `${year} yılı ve "${recordUom.code ?? recordUom.name}" birimi için eşleme yok.`,
      );
      continue;
    }
    const { mapping, fallbackYear } = selected;
    base.warnings.push(...mapping.warnings);
    if (fallbackYear && !base.warnings.includes(YEAR_FALLBACK)) {
      base.warnings.push(YEAR_FALLBACK);
    }

    if (
      mapping.error?.code === EXCLUDED ||
      mapping.warnings.includes(EXCLUDED)
    ) {
      base.excluded = true;
      lines.push(base);
      continue;
    }
    if (mapping.error) {
      block(
        'FACTOR_NOT_AVAILABLE',
        `Faktör verilemiyor (${mapping.error.code}: ${mapping.error.reason}). Tahmini değer kullanılmaz.`,
        mapping.error.reason || null,
      );
      continue;
    }

    const factor = mapping.factor_id
      ? factors.get(mapping.factor_id)
      : undefined;
    if (!factor) {
      block('FACTOR_MISSING', 'Eşlemedeki faktör pakette bulunamadı.');
      continue;
    }

    const factorUomCode =
      factor.uom_code ??
      item.uoms.find((u) => u.id === factor.uom_id)?.code ??
      null;
    const quantityInFactorUom =
      factor.uom_id && factor.uom_id === recordUom.id
        ? record.quantity
        : convertQuantity(record.quantity, recordUom.code, factorUomCode);
    if (quantityInFactorUom === null) {
      block(
        'UOM_CONVERSION_UNSUPPORTED',
        `"${recordUom.code ?? ''}" → "${factorUomCode ?? ''}" dönüşümü tanımlı değil (yoğunluk/kalorifik değer gerekir).`,
      );
      continue;
    }

    const computed = computeKg(
      factor,
      quantityInFactorUom,
      inv.gwp_ch4,
      inv.gwp_n2o,
    );
    if (!computed || !Number.isFinite(computed.kg) || computed.kg < 0) {
      block('NO_FACTOR_VALUE', 'Faktörde kullanılabilir bir değer yok.');
      continue;
    }

    base.factor_id = factor.id;
    base.factor_name = factor.name;
    base.factor_uom = factorUomCode;
    base.quantity_in_factor_uom = quantityInFactorUom;
    base.method = computed.method;
    base.kg_co2e = computed.kg;
    base.biogenic_co2_kg =
      factor.biogenic_co2_kg_per_uom === null
        ? null
        : quantityInFactorUom * factor.biogenic_co2_kg_per_uom;
    base.data_year = factor.data_year;
    base.factor_country_code = factor.country_code
      ? factor.country_code.trim().toUpperCase()
      : null;
    base.company_declared = factor.company_declared;
    base.factor_source = factor.source
      ? {
          name: factor.source.name,
          version: factor.source.version,
          license: factor.source.license,
          attribution: factor.source.attribution,
          url: factor.source.url,
        }
      : null;
    lines.push(base);
  }

  const scope_totals_kg = { scope_1: 0, scope_2: 0, scope_3: 0, unscoped: 0 };
  let total = 0;
  let biogenic = 0;
  for (const line of lines) {
    if (line.excluded) continue;
    total += line.kg_co2e;
    biogenic += line.biogenic_co2_kg ?? 0;
    if (line.scope === 1) scope_totals_kg.scope_1 += line.kg_co2e;
    else if (line.scope === 2) scope_totals_kg.scope_2 += line.kg_co2e;
    else if (line.scope === 3) scope_totals_kg.scope_3 += line.kg_co2e;
    else scope_totals_kg.unscoped += line.kg_co2e;
  }

  return {
    unit_id: unitId,
    period,
    inventory: {
      id: inv.id,
      name: inv.name,
      year: inv.year,
      gwp_set: inv.gwp_set,
      dataset: inv.dataset,
      scope2_method: inv.scope2_method,
    },
    release: {
      release_id: pkg.release.release_id,
      content_hash: pkg.release.content_hash,
      generated_at: pkg.release.generated_at,
    },
    lines,
    blocking,
    total_kg: total,
    scope_totals_kg,
    biogenic_co2_kg: biogenic,
    notices: pkg.notices,
    has_company_declared_factors: lines.some((l) => l.company_declared),
    coverage: describeCoverage(lines, pkg.notices),
  };
}
