/**
 * ConnectHub (3P Metrics) panel uçlarının yanıt tipleri.
 *
 * green-gold-api/src/carbon/connecthub/* dönüşlerinin BİREBİR aynasıdır;
 * burada alan uydurulmaz. Backend'de değişen bir alan önce orada, sonra
 * burada güncellenir.
 */

export type Environment = 'sandbox' | 'production';

export interface FacilityProfile {
  country: string;
  country_code: string | null;
  rooms: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
  updated_at: string;
}

export interface FacilityProfileInput {
  country: string;
  country_code?: string;
  rooms: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
}

/** GET …/connecthub/status */
export interface ConnectHubStatus {
  api: 'connecthub';
  schema_ready: boolean;
  provider_configured: boolean;
  environment: Environment;
  link: {
    id: string;
    unit_id: string;
    unit_name: string | null;
    environment: string;
    linked_at: string | null;
    factor_inventory_id: string | null;
  } | null;
  environment_matches: boolean | null;
  write_key_ready: boolean;
  read_key_ready: boolean;
  profile: FacilityProfile | null;
}

export type ResolutionKind = 'monthly' | 'daily' | 'yearly' | null;
export type ItemFactorStatus =
  | 'available'
  | 'option_required'
  | 'excluded'
  /** Eşleme var ama sağlayıcı faktörü veremiyor (ör. kaynak lisansı); kayıt girilebilir, hesap durur. */
  | 'factor_unavailable'
  | 'not_available'
  | 'unknown';
export type ItemBlockedReason =
  | 'not_monthly'
  | 'option_required'
  | 'excluded'
  | 'no_factor';

/** GET …/connecthub/items?year= */
export interface ConnectHubItem {
  id: string;
  code: string | null;
  name: string;
  resolution: string;
  resolution_kind: ResolutionKind;
  uoms: string[];
  monthly: boolean;
  scope: number | null;
  factor_status: ItemFactorStatus;
  /** factor_unavailable ise sağlayıcının gerekçe kodu (ör. SOURCE_NOT_REDISTRIBUTABLE). */
  factor_reason?: string | null;
  writable: boolean;
  blocked_reason: ItemBlockedReason | null;
}

/** Yerel kayıt durumu (carbon_activity_records.status). */
export type LocalRecordStatus =
  | 'sending'
  | 'accepted'
  | 'rejected'
  | 'outcome_unknown';

export interface ActivityRecord {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  period: string;
  quantity: number;
  uom: string;
  note: string | null;
  status: LocalRecordStatus;
  /** Sağlayıcının yazma yanıtındaki durum (ör. pending_approval). */
  provider_status: string | null;
  provider_record_id: string | null;
  error_code: string | null;
  error_message: string | null;
  warnings: string[];
  sent_at: string | null;
}

/** GET …/connecthub/periods/:period */
export interface PeriodDetail {
  period: string;
  environment: string;
  occupied_room_nights: number | null;
  measurement_id: string | null;
  records: ActivityRecord[];
}

/**
 * GET …/periods/:p/provider-records — ölçüm ortağındaki ONAYLI dönem
 * kayıtları (salt okuma). Hesap bu kayıtlarla yapılır.
 *   panel      → panelden gönderildi (yerel kayıt var)
 *   green_gold → Green Gold aracıyla gönderildi (ör. kurulum testi); panelden
 *                aynı kalem gönderilirse bu kayıt güncellenir
 *   provider   → doğrudan ölçüm ortağında girildi
 */
export type ProviderRecordOrigin = 'panel' | 'green_gold' | 'provider';

export interface ProviderRecord {
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  period: string;
  quantity: number;
  uom: string | null;
  origin: ProviderRecordOrigin;
}

export interface ProviderRecordList {
  period: string;
  environment: string;
  records: ProviderRecord[];
}

export type PeriodLifecycle =
  | 'future'
  | 'in_progress'
  | 'empty'
  | 'draft'
  | 'submitted'
  | 'calculated'
  | 'published';

export interface PeriodListEntry {
  period: string;
  status: PeriodLifecycle;
  needs_attention: boolean;
  records: Record<LocalRecordStatus, number>;
  occupied_room_nights: number | null;
  measurement: {
    id: string;
    is_active: boolean;
    total_tonnes: number | null;
  } | null;
}

/** GET …/connecthub/periods?year= */
export interface PeriodList {
  schema_ready: boolean;
  year: number;
  periods: PeriodListEntry[];
}

export interface SubmitLine {
  item_id: string;
  quantity: number;
  uom: string;
  note?: string;
}

export interface SubmitPeriodInput {
  occupied_room_nights?: number;
  lines: SubmitLine[];
}

/** POST …/connecthub/periods/:period/records */
export interface SubmitPeriodResult {
  period: string;
  accepted: number;
  rejected: number;
  outcome_unknown: number;
  period_closed: boolean;
  records: ActivityRecord[];
}

export type CalculationMethod = 'kg_co2e_per_uom' | 'gases_per_uom' | 'gases_per_tj';

export interface CalculationLine {
  record_id: string;
  external_id: string | null;
  /** Kaydın kaynağı (ör. API, 3P Metrics arayüzü). */
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
  /** Faktörün ülkesi; null → ülkeden bağımsız. */
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

export type BlockingCode =
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
  blocking: {
    code: BlockingCode | string;
    record_id: string;
    item_name: string;
    message: string;
    /** FACTOR_NOT_AVAILABLE'da sağlayıcının gerekçe kodu. */
    provider_reason?: string | null;
  }[];
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
  coverage: {
    scopes_calculated: number[];
    wtt_scope3_cat3: 'not_in_package' | 'not_flagged';
    biogenic_co2: 'outside_scopes';
    label: string;
  };
}

export type LineCountryStatus =
  | 'country_match'
  | 'country_independent'
  | 'provider_matched'
  | 'country_mismatch'
  | 'country_unverified';

export interface CountryCheck {
  hotel_country_code: string | null;
  hotel_country_status: 'valid' | 'missing' | 'invalid' | string;
  publishable: boolean;
  lines: {
    record_id: string;
    item_name: string;
    factor_country_code: string | null;
    provider_country_fallback: boolean;
    status: LineCountryStatus;
    publishable: boolean;
    message: string;
  }[];
  messages: string[];
}

/**
 * Hesap sonucundaki fiyatlandırma (backend `calculateHotelCarbon` rapor modu
 * + ConnectHub ekleri). Yalnız panelin gösterdiği alanlar tiplenir.
 */
export interface CalculationPricing {
  coefficient_kg: number;
  amount_per_night: number;
  currency: string;
  price_per_tonne: number;
  price_is_demo?: boolean;
  total_kg: number;
  guestrooms_kg: number;
  room_share: number;
  occupancy_percent: number;
  warnings: string[];
  calculation_method: string;
  internal_use?: boolean;
}

export type IgnoredRecord = { item: string; period: string; reason: string };

/** POST …/connecthub/periods/:period/calculate */
export type CalculatePeriodResult =
  | {
      status: 'awaiting_approval';
      period: string;
      pending: { item_name: string | null; quantity: number; uom: string; reason: string }[];
    }
  | { status: 'no_data'; period: string }
  | { status: 'blocked'; period: string; reason: string; calculation: CalculationResult | null }
  | {
      status: 'preview_only';
      period: string;
      reason: string;
      calculation: CalculationResult;
      country_check: CountryCheck;
      pricing: CalculationPricing;
      ignored_records: IgnoredRecord[];
    }
  | {
      status: 'calculated';
      period: string;
      duplicate: boolean;
      measurement_id: string;
      calculation: CalculationResult;
      country_check: CountryCheck;
      pricing: CalculationPricing;
      ignored_records: IgnoredRecord[];
    };

/** Kayıttan sonra değişen yerel girdiler (içerik karşılaştırması). */
export type StoredMeasurementChange = 'records' | 'occupancy' | 'profile';

/**
 * GET …/connecthub/periods/:period/measurement — dönemin KAYDEDİLMİŞ hesabı.
 * Salt okuma: sağlayıcıya istek atılmaz, yeni ölçüm/sürüm oluşmaz.
 * Yalnız `calculated` sonuçlar saklanır; `preview_only` hiçbir zaman burada değildir.
 */
export interface StoredMeasurement {
  id: string;
  status: 'calculated';
  /** Dönemin bugün bağlı olduğu sürüm mü (false → önceki sürüm). */
  is_current: boolean;
  is_active: boolean;
  calculated_at: string | null;
  calculation: CalculationResult;
  country_check: CountryCheck;
  pricing: CalculationPricing;
  ignored_records: IgnoredRecord[];
  /** Backend yayın politikasının kararı (publication-policy.ts); null → engel yok. */
  publication_block:
    | 'carbon_measurement_internal_use'
    | 'carbon_measurement_country_unverified'
    | 'carbon_measurement_scope_not_permitted'
    | null;
  changes: StoredMeasurementChange[];
}

export interface PeriodMeasurement {
  period: string;
  measurement: StoredMeasurement | null;
}

/** GET …/periods/:period/measurements — dönemin kayıtlı sürümleri (yeniden eskiye). */
export interface MeasurementVersion {
  id: string;
  calculated_at: string | null;
  is_current: boolean;
  is_active: boolean;
  version: string | null;
  total_tonnes: number | null;
  coefficient_kg: number | null;
  amount_per_night: number | null;
  currency: string | null;
  occupied_room_nights: number | null;
  inventory_name: string | null;
  release_id: string | null;
  country_publishable: boolean;
}

export interface PeriodMeasurementVersions {
  period: string;
  current_id: string | null;
  versions: MeasurementVersion[];
}
