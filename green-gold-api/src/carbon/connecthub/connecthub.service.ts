import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import { calculateHotelCarbon } from '../../common/hotel-carbon';
import { CarbonMeasurementService } from '../carbon-measurement.service';
import { carbonProviderEnvironment } from '../carbon-provider-registry';
import {
  ConnectHubClient,
  ConnectHubError,
  type ApprovedRecord,
  type ConnectHubItem,
  type RecordInput,
  type RecordResult,
} from './connecthub.client';
import {
  calculateFromFactorPackage,
  itemFactorDetail,
  normalizeUom,
  type CalculationResult,
  type ItemFactorStatus,
} from './factor-calculation';
import { fetchAllRows } from '../../common/fetch-all-rows';
import {
  summarizePeriod,
  type LocalRecordStatus,
  type PeriodSummary,
} from './period-status';
import {
  isValidPeriod,
  type FacilityProfileDto,
  type SubmitPeriodDto,
} from './connecthub.dto';
import { resolutionKind } from './resolution';
import {
  legacyMeasurementVersion,
  measurementVersion,
} from './measurement-version';
import { publicationBlock } from '../publication-policy';
import {
  assessFactorCountries,
  normalizeCountryCode,
  type CountryCheck,
} from './country-check';

/**
 * 3pmetrics ConnectHub ölçüm akışı (otel başına bir 3pmetrics BİRİMİ).
 *
 *   1. Tesis profili bir kez girilir (oda, alanlar, ülke).
 *   2. Her ay: tüketim kayıtları + dolu oda-gece → POST /v1/records.
 *      external_id = gg:<birim>:<başlık>:<dönem> — aynı ayı tekrar göndermek
 *      3pmetrics'te kaydı GÜNCELLER, yeni kayıt açmaz (düzeltme = yeniden gönder).
 *   3. Hesap: 3pmetrics'teki ONAYLI kayıtlar (GET /v1/records) + envanterin
 *      faktör paketi → otelin dönem emisyonu (yalnızca bu birim).
 *      Panelden gönderilmiş ama henüz onaylanmamış kayıt varsa hesap YAPILMAZ
 *      (eksik toplamla yanlış fiyat üretmemek için).
 *   4. Sonuç carbon_measurements'a yazılır; otel onaylayınca mevcut
 *      `activateMeasurement` ile widget fiyatı olur.
 *
 * Tenant izolasyonu: hotel_id yalnızca token'dan; her sorgu hotel_id ile filtreli.
 */

const PROVIDER = 'threepmetrics';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703';
const UNIQUE_VIOLATION = '23505';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Bir dönem için listelenecek en fazla sürüm (sayfalama gerekmez). */
const MAX_VERSIONS = 50;

export interface ConnectHubLink {
  id: string;
  environment: string;
  unit_id: string;
  unit_name: string | null;
  write_ref: string | null;
  read_ref: string | null;
  factor_inventory_id: string | null;
  linked_at: string | null;
}

export interface FacilityProfile {
  country: string;
  /** ISO 3166-1 alpha-2 (ör. TR); faktör ülkesi doğrulaması için. */
  country_code: string | null;
  rooms: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
  updated_at: string;
}

export interface ActivityRecordView {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  period: string;
  quantity: number;
  uom: string;
  note: string | null;
  status: 'sending' | 'accepted' | 'rejected' | 'outcome_unknown';
  provider_status: string | null;
  provider_record_id: string | null;
  error_code: string | null;
  error_message: string | null;
  warnings: string[];
  sent_at: string | null;
}

export type CalculatePeriodResult =
  | {
      status: 'awaiting_approval';
      period: string;
      pending: {
        item_name: string | null;
        quantity: number;
        uom: string;
        reason: string;
      }[];
    }
  | { status: 'no_data'; period: string }
  | {
      status: 'blocked';
      period: string;
      reason: string;
      calculation: CalculationResult | null;
    }
  | {
      /**
       * Hesap yapıldı ama faktör uygunluğu (ör. ülke) doğrulanamadı: sonuç
       * gösterilir, ölçüm KAYDEDİLMEZ ve widget'a yayınlanamaz.
       */
      status: 'preview_only';
      period: string;
      reason: string;
      calculation: CalculationResult;
      country_check: CountryCheck;
      pricing: Record<string, unknown>;
      ignored_records: { item: string; period: string; reason: string }[];
    }
  | {
      status: 'calculated';
      period: string;
      duplicate: boolean;
      measurement_id: string;
      calculation: CalculationResult;
      country_check: CountryCheck;
      pricing: Record<string, unknown>;
      ignored_records: { item: string; period: string; reason: string }[];
    };

const RECORD_COLUMNS =
  'id, item_id, item_code, item_name, period, quantity, uom, note, status, provider_status, provider_record_id, error_code, error_message, warnings, sent_at';

function monthBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(last).padStart(2, '0')}`,
  };
}

/** Aylık hesapta sayılan kayıt dönemi: tam ay ("2026-10") veya ay içindeki gün. */
export function belongsToMonth(recordPeriod: string, period: string): boolean {
  if (recordPeriod === period) return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(recordPeriod) &&
    recordPeriod.startsWith(`${period}-`)
  );
}

export function externalIdFor(
  unitId: string,
  itemId: string,
  period: string,
): string {
  return `gg:${unitId}:${itemId}:${period}`;
}

function isMonthlyResolution(resolution: string): boolean {
  return resolutionKind(resolution) === 'monthly';
}

const PROFILE_COLUMNS =
  'country, country_code, rooms, total_area_m2, guestrooms_area_m2, meeting_area_m2, updated_at';
const PROFILE_COLUMNS_LEGACY =
  'country, rooms, total_area_m2, guestrooms_area_m2, meeting_area_m2, updated_at';

@Injectable()
export class ConnectHubService {
  private readonly logger = new Logger(ConnectHubService.name);
  /** Testler değiştirebilsin diye alan. */
  client: ConnectHubClient;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly measurement: CarbonMeasurementService,
  ) {
    this.client = new ConnectHubClient({
      baseUrl:
        config.get<string>('THREEPMETRICS_CONNECTHUB_BASE_URL') || undefined,
    });
  }

  private environment() {
    return carbonProviderEnvironment(this.config);
  }

  // --- Durum ------------------------------------------------------------------

  async getStatus(hotelId: string) {
    const environment = this.environment();
    let link: ConnectHubLink | null = null;
    let schemaReady = true;
    try {
      link = await this.findLink(hotelId);
    } catch (failure) {
      if (failure instanceof ServiceUnavailableException) schemaReady = false;
      else throw failure;
    }
    const profile = schemaReady ? await this.readProfile(hotelId) : null;
    const resolver = this.measurement.credentials;
    const writeReady =
      !!link &&
      link.environment === environment &&
      (await resolver.has(link.write_ref ?? undefined, link.environment));
    const readReady =
      !!link &&
      link.environment === environment &&
      (await resolver.has(link.read_ref ?? undefined, link.environment));
    return {
      api: 'connecthub' as const,
      schema_ready: schemaReady,
      provider_configured: this.client.configured,
      environment,
      link: link
        ? {
            id: link.id,
            unit_id: link.unit_id,
            unit_name: link.unit_name,
            environment: link.environment,
            linked_at: link.linked_at,
            factor_inventory_id: link.factor_inventory_id,
          }
        : null,
      environment_matches: link ? link.environment === environment : null,
      write_key_ready: writeReady,
      read_key_ready: readReady,
      profile,
    };
  }

  /**
   * Bağlı birim için açık başlıklar (form bunlardan çizilir).
   *
   * Mevcut alanlar aynen korunur; ek olarak her başlık için:
   *   resolution_kind  monthly | daily | yearly | null (tanınmayan)
   *   scope            faktör paketindeki kapsam (paket okunamazsa null)
   *   factor_status    available | option_required | excluded | factor_unavailable |
   *                    not_available | unknown (okuma anahtarı/paket yok)
   *   writable         panelden aylık veri girilebilir mi
   *   blocked_reason   writable=false ise gerekçe KODU (metin panelde):
   *                    not_monthly | option_required | excluded | no_factor
   * Faktör paketi okunamazsa uç HATA VERMEZ; factor_status 'unknown' olur.
   */
  async listItems(hotelId: string, year = new Date().getUTCFullYear()) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Yıl 2000–2100 arasında olmalı.');
    }
    const { link, apiKey } = await this.requireKey(hotelId, 'read_or_write');
    const items = await this.call(() => this.client.listItems(apiKey));
    const own = items.filter((item) => item.units.includes(link.unit_id));
    const pkgItems = await this.packageItemsForYear(hotelId, year);
    return own.map((item) => {
      const kind = resolutionKind(item.resolution);
      const pkgItem = pkgItems?.get(item.id) ?? null;
      const detail = pkgItem
        ? itemFactorDetail(pkgItem, link.unit_id, year)
        : null;
      const factor: ItemFactorStatus | 'unknown' =
        pkgItems === null ? 'unknown' : (detail?.status ?? 'not_available');
      const blocked_reason =
        kind !== 'monthly'
          ? ('not_monthly' as const)
          : factor === 'option_required'
            ? ('option_required' as const)
            : factor === 'excluded'
              ? ('excluded' as const)
              : factor === 'not_available'
                ? ('no_factor' as const)
                : null;
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        resolution: item.resolution,
        resolution_kind: kind,
        uoms: item.uoms,
        monthly: isMonthlyResolution(item.resolution),
        scope: pkgItem?.scope ?? null,
        factor_status: factor,
        // factor_unavailable: sağlayıcının gerekçe kodu (ör. SOURCE_NOT_REDISTRIBUTABLE).
        // Kayıt girilebilir; hesap bu kalemde durur (bkz. itemFactorDetail).
        factor_reason: detail?.reason ?? null,
        writable: blocked_reason === null,
        blocked_reason,
      };
    });
  }

  /**
   * Yılın faktör paketindeki başlıklar (id → başlık). Okuma anahtarı yoksa,
   * envanter çözülemezse veya sağlayıcı hata verirse null — çağıran taraf
   * "bilinmiyor" gösterir; hata yutulur ama loglanır.
   */
  private async packageItemsForYear(hotelId: string, year: number) {
    try {
      const { link, apiKey } = await this.requireKey(hotelId, 'read');
      const inventory = await this.resolveInventory(apiKey, link, year);
      if ('blocked' in inventory) return null;
      const fetched = await this.client.getFactorPackage(apiKey, inventory.id);
      if (fetched.notModified) return null;
      return new Map(fetched.pkg.items.map((i) => [i.id, i]));
    } catch (failure) {
      this.logger.warn(
        `Faktör paketi okunamadı (başlık bilgisi 'unknown'): ${failure instanceof Error ? failure.message : String(failure)}`,
      );
      return null;
    }
  }

  /**
   * Yılın 12 ayı için dönem özeti — YALNIZCA yerel veriler (sağlayıcıya
   * istek atmaz). Bkz. period-status.ts.
   */
  async listPeriods(hotelId: string, year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Yıl 2000–2100 arasında olmalı.');
    }
    const environment = this.environment();
    const from = `${year}-01`;
    const to = `${year + 1}-01`;
    const today = new Date().toISOString().slice(0, 10);

    const periods = await this.supabase.db
      .from('carbon_periods')
      .select('period, occupied_room_nights, measurement_id')
      .eq('hotel_id', hotelId)
      .eq('environment', environment)
      .gte('period', from)
      .lt('period', to);
    if (periods.error) {
      if (periods.error.code === UNDEFINED_TABLE) {
        return { schema_ready: false, year, periods: [] };
      }
      throw new BadRequestException('Dönemler okunamadı.');
    }
    const records = await fetchAllRows<Record<string, unknown>>((a, b) =>
      this.supabase.db
        .from('carbon_activity_records')
        .select('id, period, status')
        .eq('hotel_id', hotelId)
        .eq('environment', environment)
        .gte('period', from)
        .lt('period', to)
        .order('period', { ascending: true })
        .order('id', { ascending: true })
        .range(a, b),
    );
    if (records.error) throw new BadRequestException('Kayıtlar okunamadı.');

    const periodRows = (periods.data ?? []) as Record<string, unknown>[];
    const measurementIds = periodRows
      .map((p) => p.measurement_id as string | null)
      .filter((id): id is string => !!id);
    const measurements = new Map<
      string,
      { isActive: boolean; totalTonnes: number | null }
    >();
    if (measurementIds.length) {
      const m = await this.supabase.db
        .from('carbon_measurements')
        .select('id, is_active, total_emissions')
        .eq('hotel_id', hotelId)
        .eq('provider', PROVIDER)
        .in('id', measurementIds);
      if (m.error) throw new BadRequestException('Ölçümler okunamadı.');
      for (const row of (m.data ?? []) as Record<string, unknown>[]) {
        measurements.set(row.id as string, {
          isActive: row.is_active === true,
          totalTonnes:
            row.total_emissions === null || row.total_emissions === undefined
              ? null
              : Number(row.total_emissions),
        });
      }
    }

    const result: (PeriodSummary & {
      period: string;
      occupied_room_nights: number | null;
      measurement: {
        id: string;
        is_active: boolean;
        total_tonnes: number | null;
      } | null;
    })[] = [];
    for (let month = 1; month <= 12; month++) {
      const period = `${year}-${String(month).padStart(2, '0')}`;
      const row = periodRows.find((p) => p.period === period);
      const measurementId = (row?.measurement_id as string | null) ?? null;
      const measurement = measurementId
        ? (measurements.get(measurementId) ?? null)
        : null;
      const occupied =
        row &&
        row.occupied_room_nights !== null &&
        row.occupied_room_nights !== undefined
          ? Number(row.occupied_room_nights)
          : null;
      const statuses = records.data
        .filter((r) => r.period === period)
        .map((r) => r.status as LocalRecordStatus);
      result.push({
        period,
        occupied_room_nights: occupied,
        measurement:
          measurementId && measurement
            ? {
                id: measurementId,
                is_active: measurement.isActive,
                total_tonnes: measurement.totalTonnes,
              }
            : null,
        ...summarizePeriod({
          period,
          today,
          occupiedRoomNights: occupied,
          recordStatuses: statuses,
          measurement,
        }),
      });
    }
    return { schema_ready: true, year, periods: result };
  }

  // --- Tesis profili ------------------------------------------------------------

  async saveProfile(
    hotelId: string,
    userId: string,
    dto: FacilityProfileDto,
  ): Promise<FacilityProfile> {
    if (dto.guestrooms_area_m2 + dto.meeting_area_m2 > dto.total_area_m2) {
      throw new BadRequestException(
        'Oda ve toplantı alanlarının toplamı toplam kapalı alanı aşamaz.',
      );
    }
    // Ülke kodu isteğe bağlı: verilmezse mevcut değer korunur (upsert'e girmez).
    let countryCode: string | null | undefined;
    if (dto.country_code !== undefined) {
      const normalized = normalizeCountryCode(dto.country_code);
      if (normalized.status === 'invalid') {
        throw new BadRequestException({
          code: 'carbon_country_code_invalid',
          message: 'Ülke kodu ISO 3166-1 alpha-2 olmalı (ör. TR).',
        });
      }
      countryCode = normalized.code;
    }
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      hotel_id: hotelId,
      country: dto.country.trim(),
      rooms: dto.rooms,
      total_area_m2: dto.total_area_m2,
      guestrooms_area_m2: dto.guestrooms_area_m2,
      meeting_area_m2: dto.meeting_area_m2,
      updated_by: userId,
      updated_at: now,
    };
    if (countryCode !== undefined) row.country_code = countryCode;
    const write = (columns: string) =>
      this.supabase.db
        .from('carbon_facility_profiles')
        .upsert(row, { onConflict: 'hotel_id' })
        .select(columns)
        .single();
    let { data, error } = await write(PROFILE_COLUMNS);
    if (error?.code === UNDEFINED_COLUMN) {
      // Migration 0020 henüz uygulanmadı: ülke kodu yazılamaz.
      if (countryCode !== undefined) throw this.schemaNotReady('0020');
      ({ data, error } = await write(PROFILE_COLUMNS_LEGACY));
    }
    if (error || !data) {
      if (error?.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Tesis profili kaydedilemedi.');
    }
    return toProfile(data as unknown as Record<string, unknown>);
  }

  // --- Dönem ------------------------------------------------------------------------

  async getPeriod(hotelId: string, period: string) {
    this.assertPeriod(period);
    const environment = this.environment();
    const [periodRow, records] = await Promise.all([
      this.readPeriodRow(hotelId, environment, period),
      this.readRecords(hotelId, environment, period),
    ]);
    return {
      period,
      environment,
      occupied_room_nights: periodRow?.occupied_room_nights ?? null,
      measurement_id: periodRow?.measurement_id ?? null,
      records,
    };
  }

  /**
   * Ölçüm ortağındaki ONAYLI dönem kayıtları — salt okuma (GET /v1/records,
   * okuma anahtarı). Hesap bu kayıtlarla yapılır; panel, yerel tabloda
   * olmayan kayıtları (ör. operatör aracıyla ya da doğrudan ölçüm ortağında
   * girilmiş) da görebilsin diye. Kaynak:
   *   panel       → yerel `carbon_activity_records`'ta aynı dış kimlikli satır var
   *   green_gold  → bizim dış kimlik şemamız (gg:…) ama yerelde satır yok
   *                 (ör. operatör CLI'ı); panelden aynı kalem gönderilirse
   *                 bu kayıt GÜNCELLENİR
   *   provider    → başka kaynak (ölçüm ortağında doğrudan girilmiş vb.)
   * Hiçbir yere yazmaz; anahtar/faktör bilgisi dönmez.
   */
  async getProviderRecords(hotelId: string, period: string) {
    this.assertPeriod(period);
    const { link, apiKey } = await this.requireKey(hotelId, 'read');
    const [all, items, local] = await Promise.all([
      this.call(() =>
        this.client.readApprovedRecords(apiKey, { unit: link.unit_id }),
      ),
      this.call(() => this.client.listItems(apiKey)),
      this.readRecords(hotelId, link.environment, period),
    ]);
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const localExternal = new Set(
      local.map((r) => externalIdFor(link.unit_id, r.item_id, period)),
    );
    const records = all
      .filter(
        (r) => r.unit === link.unit_id && belongsToMonth(r.period, period),
      )
      .map((r) => {
        const ours =
          r.external_id === externalIdFor(link.unit_id, r.item, period);
        const origin: 'panel' | 'green_gold' | 'provider' =
          r.external_id && localExternal.has(r.external_id)
            ? 'panel'
            : ours
              ? 'green_gold'
              : 'provider';
        const item = itemsById.get(r.item);
        return {
          item_id: r.item,
          item_code: item?.code ?? null,
          item_name: item?.name ?? null,
          period: r.period,
          quantity: r.quantity,
          uom: r.uom,
          origin,
        };
      })
      .sort((a, b) =>
        (a.item_name ?? '').localeCompare(b.item_name ?? '', 'tr'),
      );
    return { period, environment: link.environment, records };
  }

  async setOccupancy(
    hotelId: string,
    userId: string,
    period: string,
    occupiedRoomNights: number,
  ) {
    this.assertPeriod(period);
    await this.upsertPeriod(hotelId, userId, period, occupiedRoomNights);
    return this.getPeriod(hotelId, period);
  }

  /**
   * Dönem kayıtlarını 3pmetrics'e yazar. Aynı başlık iki kez gönderilirse
   * (aynı dönem) 400 — tek ayda bir başlık için tek değer.
   */
  async submitPeriod(
    hotelId: string,
    userId: string,
    period: string,
    dto: SubmitPeriodDto,
  ) {
    this.assertPeriod(period, { notFuture: true });
    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.item_id)) {
        throw new BadRequestException(
          'Aynı başlık bir dönemde yalnızca bir kez gönderilebilir.',
        );
      }
      seen.add(line.item_id);
    }

    const { link, apiKey } = await this.requireKey(hotelId, 'write');
    const environment = link.environment;
    const items = await this.call(() => this.client.listItems(apiKey));
    const byId = new Map<string, ConnectHubItem>(items.map((i) => [i.id, i]));

    const inputs: RecordInput[] = [];
    const rows: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    for (const line of dto.lines) {
      const item = byId.get(line.item_id);
      if (!item || !item.units.includes(link.unit_id)) {
        throw new BadRequestException(
          'Başlık bu tesis (3pmetrics birimi) için açık değil.',
        );
      }
      if (!isMonthlyResolution(item.resolution)) {
        throw new BadRequestException(
          `"${item.name}" başlığı aylık değil (${item.resolution}); bu ekrandan gönderilemez.`,
        );
      }
      const uom = item.uoms.find((u) => u === line.uom);
      if (!uom) {
        throw new BadRequestException(
          `"${item.name}" için ölçü birimi ${item.uoms.join(', ')} olmalı.`,
        );
      }
      const externalId = externalIdFor(link.unit_id, item.id, period);
      const note = line.note?.trim() || null;
      inputs.push({
        item: item.id,
        unit: link.unit_id,
        period,
        quantity: line.quantity,
        uom,
        external_id: externalId,
        note,
      });
      rows.push({
        hotel_id: hotelId,
        link_id: link.id,
        environment,
        unit_id: link.unit_id,
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        period,
        quantity: line.quantity,
        uom,
        note,
        external_id: externalId,
        status: 'sending',
        provider_status: null,
        provider_record_id: null,
        error_code: null,
        error_message: null,
        warnings: [],
        sent_by: userId,
        sent_at: now,
        updated_at: now,
      });
    }

    if (dto.occupied_room_nights !== undefined) {
      await this.upsertPeriod(
        hotelId,
        userId,
        period,
        dto.occupied_room_nights,
      );
    }

    const { error: upsertError } = await this.supabase.db
      .from('carbon_activity_records')
      .upsert(rows, { onConflict: 'hotel_id,environment,external_id' });
    if (upsertError) {
      if (upsertError.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Kayıtlar hazırlanamadı.');
    }

    let results: RecordResult[] = [];
    let failure: ConnectHubError | null = null;
    try {
      results = (await this.client.writeRecords(apiKey, inputs)).results;
    } catch (error) {
      if (!(error instanceof ConnectHubError)) throw error;
      failure = error;
      results = error.writeResponse?.results ?? [];
    }

    const byExternal = new Map(
      results
        .filter((r) => r.external_id)
        .map((r) => [r.external_id as string, r]),
    );
    for (const input of inputs) {
      const result = byExternal.get(input.external_id);
      const patch = result
        ? result.error
          ? {
              status: 'rejected',
              provider_status: result.status,
              error_code: result.error.code,
              error_message: result.error.message.slice(0, 500),
              warnings: result.warnings,
            }
          : {
              status: 'accepted',
              provider_status: result.status,
              provider_record_id: result.record_id,
              error_code: null,
              error_message: null,
              warnings: result.warnings,
            }
        : failure?.reason === 'outcome_unknown'
          ? {
              status: 'outcome_unknown',
              error_code: 'outcome_unknown',
              error_message: failure.message.slice(0, 500),
            }
          : {
              status: 'rejected',
              error_code: failure?.reason ?? 'no_result',
              error_message: (
                failure?.message ?? '3pmetrics bu satır için sonuç döndürmedi.'
              ).slice(0, 500),
            };
      await this.supabase.db
        .from('carbon_activity_records')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('hotel_id', hotelId)
        .eq('environment', environment)
        .eq('external_id', input.external_id);
    }

    if (
      failure &&
      results.length === 0 &&
      ['unauthorized', 'forbidden', 'not_configured', 'rate_limited'].includes(
        failure.reason,
      )
    ) {
      throw this.mapError(failure);
    }

    const records = await this.readRecords(hotelId, environment, period);
    const sent = records.filter((r) => seen.has(r.item_id));
    return {
      period,
      accepted: sent.filter((r) => r.status === 'accepted').length,
      rejected: sent.filter((r) => r.status === 'rejected').length,
      outcome_unknown: sent.filter((r) => r.status === 'outcome_unknown')
        .length,
      period_closed: failure?.reason === 'period_closed',
      records,
    };
  }

  // --- Hesap ----------------------------------------------------------------------------

  async calculatePeriod(
    hotelId: string,
    period: string,
  ): Promise<CalculatePeriodResult> {
    this.assertPeriod(period, { notFuture: true });
    const { link, apiKey } = await this.requireKey(hotelId, 'read');
    const environment = link.environment;

    const profile = await this.readProfile(hotelId);
    if (!profile) {
      throw new BadRequestException({
        code: 'carbon_profile_missing',
        message: 'Önce tesis profilini (oda sayısı ve alanlar) kaydedin.',
      });
    }
    const periodRow = await this.readPeriodRow(hotelId, environment, period);
    if (!periodRow?.occupied_room_nights) {
      throw new BadRequestException({
        code: 'carbon_occupancy_missing',
        message: 'Bu dönemin dolu oda-gece sayısını girin.',
      });
    }

    const all = await this.call(() =>
      this.client.readApprovedRecords(apiKey, { unit: link.unit_id }),
    );
    const approved: ApprovedRecord[] = [];
    const ignored: { item: string; period: string; reason: string }[] = [];
    for (const record of all) {
      if (record.unit !== link.unit_id) continue;
      if (belongsToMonth(record.period, period)) approved.push(record);
      else if (
        /^\d{4}$/.test(record.period) &&
        period.startsWith(record.period)
      ) {
        ignored.push({
          item: record.item,
          period: record.period,
          reason: 'Yıllık kayıt aylık hesaba dahil edilmedi.',
        });
      }
    }

    // Panelden gönderilmiş ama 3pmetrics'te henüz onaylı görünmeyen kayıt varsa
    // hesap yapılmaz: eksik toplamla yanlış fiyat üretilmez.
    const local = await this.readRecords(hotelId, environment, period);
    const approvedByExternal = new Map(
      approved.filter((r) => r.external_id).map((r) => [r.external_id, r]),
    );
    const pending: {
      item_name: string | null;
      quantity: number;
      uom: string;
      reason: string;
    }[] = [];
    for (const row of local) {
      if (row.status === 'rejected') continue;
      const externalId = externalIdFor(link.unit_id, row.item_id, period);
      const match = approvedByExternal.get(externalId);
      if (row.status === 'sending' || row.status === 'outcome_unknown') {
        pending.push({
          item_name: row.item_name,
          quantity: row.quantity,
          uom: row.uom,
          reason: 'Gönderim sonucu belli değil; kaydı tekrar gönderin.',
        });
      } else if (!match) {
        pending.push({
          item_name: row.item_name,
          quantity: row.quantity,
          uom: row.uom,
          reason: "3pmetrics'te onay bekliyor.",
        });
      } else if (
        Math.abs(match.quantity - row.quantity) > 1e-9 ||
        normalizeUom(match.uom) !== normalizeUom(row.uom)
      ) {
        pending.push({
          item_name: row.item_name,
          quantity: row.quantity,
          uom: row.uom,
          reason:
            "Düzeltme 3pmetrics'te henüz onaylanmadı (onaylı değer farklı).",
        });
      }
    }
    if (pending.length) return { status: 'awaiting_approval', period, pending };
    if (!approved.length) return { status: 'no_data', period };

    const year = Number(period.slice(0, 4));
    const inventoryId = await this.resolveInventory(apiKey, link, year);
    if ('blocked' in inventoryId) {
      return {
        status: 'blocked',
        period,
        reason: inventoryId.blocked,
        calculation: null,
      };
    }
    const fetched = await this.call(() =>
      this.client.getFactorPackage(apiKey, inventoryId.id),
    );
    if (fetched.notModified) {
      throw new BadGatewayException(
        'Faktör paketi beklenmedik biçimde 304 döndü.',
      );
    }
    const calculation = calculateFromFactorPackage(
      fetched.pkg,
      link.unit_id,
      period,
      approved,
    );
    if (calculation.blocking.length) {
      return {
        status: 'blocked',
        period,
        reason:
          'Bazı kalemler için 3pmetrics faktörü uygulanamadı; tahmini değerle fiyat üretilmez.',
        calculation,
      };
    }
    if (!(calculation.total_kg > 0)) {
      return {
        status: 'blocked',
        period,
        reason: 'Dönemin hesaplanan emisyonu sıfır; fiyat üretilmez.',
        calculation,
      };
    }

    const bounds = monthBounds(period);
    const currency = await this.hotelCurrency(hotelId);
    const allocationInput = {
      mode: 'report' as const,
      country: profile.country,
      period_start: bounds.start,
      period_end: bounds.end,
      rooms: profile.rooms,
      occupied_room_nights: periodRow.occupied_room_nights,
      total_area_m2: profile.total_area_m2,
      guestrooms_area_m2: profile.guestrooms_area_m2,
      meeting_area_m2: profile.meeting_area_m2,
      report_tonnes: calculation.total_kg / 1000,
      report_basis: 'hotel_total' as const,
      report_reference:
        `3pmetrics faktör paketi · ${calculation.inventory.name} · ${link.unit_name ?? link.unit_id} · ${period}`.slice(
          0,
          300,
        ),
      assessor: '3pmetrics',
    };
    const base = calculateHotelCarbon(allocationInput, currency);
    const countryCheck = assessFactorCountries(
      calculation,
      profile.country_code,
    );
    const pricing = {
      ...base,
      provider: PROVIDER,
      version: 'threepmetrics-connecthub-factors-v1',
      calculation_method: `3pmetrics onaylı kayıtlar × envanter faktör paketi (${calculation.coverage.label}) × konaklama alan payı ÷ dolu oda-gece`,
      scope: `Tesisin 3pmetrics birimindeki onaylı kayıtları. Hesap kapsamı: ${calculation.coverage.label}. Resmi sonuç 3pmetrics envanter raporudur.`,
      coverage: calculation.coverage,
      country_check: {
        hotel_country_code: countryCheck.hotel_country_code,
        hotel_country_status: countryCheck.hotel_country_status,
        publishable: countryCheck.publishable,
      },
      external_account_id: link.unit_id,
      external_account_name: link.unit_name,
      factor_inventory: calculation.inventory,
      factor_release: calculation.release,
      internal_use: true,
    };

    // Faktör ülkesi doğrulanamadıysa: sonuç gösterilir ama ölçüm KAYDEDİLMEZ,
    // dolayısıyla aktive edilip widget'a yayınlanamaz.
    if (!countryCheck.publishable) {
      return {
        status: 'preview_only',
        period,
        reason: countryCheck.messages.join(' '),
        calculation,
        country_check: countryCheck,
        pricing,
        ignored_records: ignored,
      };
    }

    const externalMeasurementId = `connecthub:${link.unit_id}:${period}`;
    // Anlamsal sürüm anahtarı (UX-3.11): sağlayıcı kayıt kimliği/birim yazımı
    // değişse de aynı hesap aynı sürümdür. Eski anahtarla kaydedilmiş satır da
    // eşleşme sayılır (kural değişikliği tek başına yeni sürüm açmaz).
    const externalVersion = measurementVersion(
      approved,
      calculation.release.content_hash,
      allocationInput,
    );
    const versionKeys = [
      externalVersion,
      legacyMeasurementVersion(
        approved,
        calculation.release.content_hash,
        allocationInput,
      ),
    ];

    const existing = await this.supabase.db
      .from('carbon_measurements')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('provider', PROVIDER)
      .eq('external_measurement_id', externalMeasurementId)
      .in('external_version', versionKeys)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      throw new BadRequestException('Karbon ölçüm kayıtları okunamadı.');
    }

    let measurementId = (existing.data as { id?: string } | null)?.id ?? null;
    let duplicate = measurementId !== null;
    if (!measurementId) {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase.db
        .from('carbon_measurements')
        .insert({
          hotel_id: hotelId,
          provider: PROVIDER,
          environment,
          link_id: link.id,
          external_property_id: link.unit_id,
          external_measurement_id: externalMeasurementId,
          external_version: externalVersion,
          period_start: bounds.start,
          period_end: bounds.end,
          result_status: 'completed',
          total_emissions: calculation.total_kg / 1000,
          total_emissions_unit: 'tonCO2e',
          scope: 'hotel_total',
          methodology: `GHG Protocol · 3pmetrics faktör paketi (${calculation.inventory.gwp_set}, ${calculation.inventory.dataset})`,
          methodology_version: calculation.release.release_id,
          verification_status: 'internal_use',
          rooms: profile.rooms,
          occupied_room_nights: periodRow.occupied_room_nights,
          occupancy_percent: pricing.occupancy_percent,
          form_data: {
            api: 'connecthub',
            calculation,
            country_check: countryCheck,
            allocation_input: allocationInput,
            pricing,
            ignored_records: ignored,
          },
          room_night_kg: pricing.coefficient_kg,
          allocation_method: pricing.calculation_method,
          is_active: false,
          provider_updated_at: calculation.release.generated_at,
          imported_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        // Eşzamanlı iki hesap aynı sürümü yazmaya çalıştı (ör. iki sekme ya da
        // yayın öncesi yeniden hesap): benzersiz indeks ikinci satırı reddetti.
        // Mevcut satır kullanılır; yeni ölçüm/sürüm oluşmaz.
        const raced = await this.supabase.db
          .from('carbon_measurements')
          .select('id')
          .eq('hotel_id', hotelId)
          .eq('provider', PROVIDER)
          .eq('external_measurement_id', externalMeasurementId)
          .in('external_version', versionKeys)
          .order('imported_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const racedId = (raced.data as { id?: string } | null)?.id ?? null;
        if (raced.error || !racedId) {
          throw new BadRequestException('Ölçüm sonucu kaydedilemedi.');
        }
        measurementId = racedId;
        duplicate = true;
      } else if (error || !data) {
        throw new BadRequestException('Ölçüm sonucu kaydedilemedi.');
      } else {
        const inserted: { id: string } = data;
        measurementId = inserted.id;
      }
    }

    await this.supabase.db
      .from('carbon_periods')
      .update({
        measurement_id: measurementId,
        updated_at: new Date().toISOString(),
      })
      .eq('hotel_id', hotelId)
      .eq('environment', environment)
      .eq('period', period);

    return {
      status: 'calculated',
      period,
      duplicate,
      measurement_id: measurementId,
      calculation,
      country_check: countryCheck,
      pricing,
      ignored_records: ignored,
    };
  }

  // --- Kaydedilmiş ölçüm (salt okuma) ----------------------------------------------

  /**
   * Dönemin KAYDEDİLMİŞ hesabını okur — sayfa yenilense de sonuç kaybolmaz.
   *
   * Yalnız yerel veritabanı: sağlayıcıya istek atılmaz, hiçbir satır yazılmaz,
   * yeni ölçüm/sürüm oluşmaz. `preview_only` sonuçlar kaydedilmediği için
   * burada hiçbir zaman görünmez (yalnız `calculated` sonuçlar saklanır).
   *
   * `changes`: kayıttan sonra yerel girdiler değiştiyse (tüketim, doluluk,
   * tesis profili) belirtilir — içerik karşılaştırmasıyla, zamanla değil.
   * Sağlayıcı tarafındaki değişiklikler (faktör paketi, onay) burada
   * bilinemez; güncel sonuç için yeniden hesap gerekir.
   */
  async getPeriodMeasurement(hotelId: string, period: string) {
    this.assertPeriod(period);
    const environment = this.environment();
    const periodRow = await this.readPeriodRow(hotelId, environment, period);
    if (!periodRow?.measurement_id) return { period, measurement: null };
    return {
      period,
      measurement: await this.readStoredMeasurement(
        hotelId,
        environment,
        period,
        periodRow.measurement_id,
        periodRow,
      ),
    };
  }

  /**
   * Dönemin belirli bir KAYITLI SÜRÜMÜNÜ okur (önceki sürümler dahil).
   * Salt okuma; ölçüm bu otelin, bu ortamın ve bu dönemin ConnectHub ölçümü
   * değilse 404. `is_current`: dönemin bugün bağlı olduğu sürüm mü.
   */
  async getPeriodMeasurementVersion(
    hotelId: string,
    period: string,
    measurementId: string,
  ) {
    this.assertPeriod(period);
    if (!UUID_RE.test(measurementId)) {
      throw new BadRequestException('Geçersiz ölçüm kimliği.');
    }
    const environment = this.environment();
    const periodRow = await this.readPeriodRow(hotelId, environment, period);
    const measurement = await this.readStoredMeasurement(
      hotelId,
      environment,
      period,
      measurementId,
      periodRow,
    );
    if (!measurement) {
      throw new NotFoundException('Bu dönem için böyle bir ölçüm sürümü yok.');
    }
    return { period, measurement };
  }

  /**
   * Dönemin tüm KAYITLI ölçüm sürümleri, yeniden eskiye (salt okuma, yerel).
   * Aynı veriyle yeniden hesap yeni sürüm açmadığı için her satır gerçekten
   * farklı bir girdi kümesidir (onaylı kayıtlar, faktör paketi, dağıtım).
   */
  async listPeriodMeasurements(hotelId: string, period: string) {
    this.assertPeriod(period);
    const environment = this.environment();
    const start = monthBounds(period).start;
    const [periodRow, res] = await Promise.all([
      this.readPeriodRow(hotelId, environment, period),
      this.supabase.db
        .from('carbon_measurements')
        .select(
          'id, environment, period_start, is_active, external_version, total_emissions, occupied_room_nights, form_data, imported_at',
        )
        .eq('hotel_id', hotelId)
        .eq('provider', PROVIDER)
        .eq('environment', environment)
        .eq('period_start', start)
        .order('imported_at', { ascending: false })
        .limit(MAX_VERSIONS),
    ]);
    if (res.error) throw new BadRequestException('Ölçüm sürümleri okunamadı.');
    const currentId = periodRow?.measurement_id ?? null;
    const versions = ((res.data ?? []) as Record<string, unknown>[])
      .filter((row) => {
        const form = row.form_data as Record<string, unknown> | null;
        return form?.api === 'connecthub' && !!form.pricing;
      })
      .map((row) => {
        const form = row.form_data as Record<string, unknown>;
        const pricing = form.pricing as Record<string, unknown>;
        const calc = (form.calculation ?? {}) as Partial<CalculationResult>;
        const countryCheck = (form.country_check ??
          {}) as Partial<CountryCheck>;
        return {
          id: row.id as string,
          calculated_at: (row.imported_at as string | null) ?? null,
          is_current: row.id === currentId,
          is_active: row.is_active === true,
          version: (row.external_version as string | null) ?? null,
          total_tonnes:
            row.total_emissions === null || row.total_emissions === undefined
              ? null
              : Number(row.total_emissions),
          coefficient_kg:
            typeof pricing.coefficient_kg === 'number'
              ? pricing.coefficient_kg
              : null,
          amount_per_night:
            typeof pricing.amount_per_night === 'number'
              ? pricing.amount_per_night
              : null,
          currency:
            typeof pricing.currency === 'string' ? pricing.currency : null,
          occupied_room_nights:
            row.occupied_room_nights === null ||
            row.occupied_room_nights === undefined
              ? null
              : Number(row.occupied_room_nights),
          inventory_name: calc.inventory?.name ?? null,
          release_id: calc.release?.release_id ?? null,
          country_publishable: countryCheck.publishable !== false,
        };
      });
    return { period, current_id: currentId, versions };
  }

  private async readStoredMeasurement(
    hotelId: string,
    environment: string,
    period: string,
    measurementId: string,
    periodRow: {
      occupied_room_nights: number | null;
      measurement_id: string | null;
    } | null,
  ) {
    const { data, error } = await this.supabase.db
      .from('carbon_measurements')
      .select(
        'id, environment, external_property_id, period_start, is_active, verification_status, occupied_room_nights, form_data, imported_at',
      )
      .eq('hotel_id', hotelId)
      .eq('provider', PROVIDER)
      .eq('id', measurementId)
      .maybeSingle();
    if (error) throw new BadRequestException('Ölçüm okunamadı.');
    const row = data as Record<string, unknown> | null;
    const form = (row?.form_data ?? null) as Record<string, unknown> | null;
    // Yalnız bu dönemin, bu ortamın ConnectHub ölçümü kabul edilir.
    if (
      !row ||
      !form ||
      form.api !== 'connecthub' ||
      row.environment !== environment ||
      row.period_start !== monthBounds(period).start ||
      !form.calculation ||
      !form.pricing ||
      !form.country_check
    ) {
      return null;
    }

    const calculation = form.calculation as CalculationResult;
    const allocation = (form.allocation_input ?? {}) as Record<string, unknown>;
    const unitId = row.external_property_id as string;
    const [records, profile] = await Promise.all([
      this.readRecords(hotelId, environment, period),
      this.readProfile(hotelId),
    ]);

    const changes: ('records' | 'occupancy' | 'profile')[] = [];
    const counted = new Map(
      calculation.lines
        .filter((l) => l.external_id)
        .map((l) => [l.external_id as string, l]),
    );
    const recordsChanged = records
      .filter((r) => r.status !== 'rejected')
      .some((r) => {
        const line = counted.get(externalIdFor(unitId, r.item_id, period));
        return (
          !line ||
          Math.abs(line.quantity - r.quantity) > 1e-9 ||
          normalizeUom(line.uom) !== normalizeUom(r.uom)
        );
      });
    if (recordsChanged) changes.push('records');
    const savedOccupancy =
      row.occupied_room_nights === null ||
      row.occupied_room_nights === undefined
        ? null
        : Number(row.occupied_room_nights);
    if (savedOccupancy !== (periodRow?.occupied_room_nights ?? null)) {
      changes.push('occupancy');
    }
    if (
      !profile ||
      Number(allocation.rooms) !== profile.rooms ||
      Number(allocation.total_area_m2) !== profile.total_area_m2 ||
      Number(allocation.guestrooms_area_m2) !== profile.guestrooms_area_m2 ||
      Number(allocation.meeting_area_m2) !== profile.meeting_area_m2 ||
      allocation.country !== profile.country
    ) {
      changes.push('profile');
    }

    return {
      id: row.id as string,
      status: 'calculated' as const,
      is_current: row.id === (periodRow?.measurement_id ?? null),
      is_active: row.is_active === true,
      calculated_at: (row.imported_at as string | null) ?? null,
      calculation,
      country_check: form.country_check as CountryCheck,
      pricing: form.pricing as Record<string, unknown>,
      ignored_records: Array.isArray(form.ignored_records)
        ? (form.ignored_records as {
            item: string;
            period: string;
            reason: string;
          }[])
        : [],
      publication_block: publicationBlock(row),
      changes,
    };
  }

  // --- İç yardımcılar ----------------------------------------------------------------

  private async resolveInventory(
    apiKey: string,
    link: ConnectHubLink,
    year: number,
  ): Promise<{ id: string } | { blocked: string }> {
    if (link.factor_inventory_id) return { id: link.factor_inventory_id };
    const packages = await this.call(() =>
      this.client.listFactorPackages(apiKey, year),
    );
    const forYear = packages.filter((p) => p.year === year);
    if (forYear.length === 1) return { id: forYear[0].id };
    if (forYear.length === 0) {
      return {
        blocked: `${year} için faktör paketi verilebilecek bir envanter yok (3pmetrics'te envanter açılmalı ve okuma anahtarında "Faktörleri içer" açık olmalı).`,
      };
    }
    return {
      blocked: `${year} için birden fazla envanter var (${forYear.map((p) => p.name).join(', ')}); bağlantıda envanter seçilmeli.`,
    };
  }

  /** Aktif ConnectHub bağlantısı (yoksa null). Şema yoksa 503. */
  async findLink(hotelId: string): Promise<ConnectHubLink | null> {
    const { data, error } = await this.supabase.db
      .from('carbon_provider_links')
      .select(
        'id, environment, external_property_id, external_property_name, authorization_ref, read_authorization_ref, factor_inventory_id, linked_at',
      )
      .eq('hotel_id', hotelId)
      .eq('provider', PROVIDER)
      .eq('api', 'connecthub')
      .eq('status', 'active')
      .limit(1);
    if (error) {
      if (error.code === UNDEFINED_TABLE || error.code === UNDEFINED_COLUMN) {
        throw this.schemaNotReady();
      }
      throw new BadRequestException('Sağlayıcı bağlantısı okunamadı.');
    }
    const row = (data?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row.id as string,
      environment: row.environment as string,
      unit_id: row.external_property_id as string,
      unit_name: (row.external_property_name as string | null) ?? null,
      write_ref: (row.authorization_ref as string | null) ?? null,
      read_ref: (row.read_authorization_ref as string | null) ?? null,
      factor_inventory_id: (row.factor_inventory_id as string | null) ?? null,
      linked_at: (row.linked_at as string | null) ?? null,
    };
  }

  private async requireKey(
    hotelId: string,
    kind: 'write' | 'read' | 'read_or_write',
  ): Promise<{ link: ConnectHubLink; apiKey: string }> {
    if (!this.client.configured) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_not_configured',
        message: 'ConnectHub adresi bu ortam için yapılandırılmadı.',
      });
    }
    const link = await this.findLink(hotelId);
    if (!link) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_not_linked',
        message:
          'Tesisiniz henüz 3pmetrics ölçüm birimine bağlanmadı. Destek ekibiyle iletişime geçin.',
      });
    }
    if (link.environment !== this.environment()) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_environment_mismatch',
        message:
          '3pmetrics bağlantınız bu ortam için tanımlı değil. Destek ekibiyle iletişime geçin.',
      });
    }
    const refs =
      kind === 'write'
        ? [link.write_ref]
        : kind === 'read'
          ? [link.read_ref]
          : [link.read_ref, link.write_ref];
    for (const ref of refs) {
      const credentials = await this.measurement.credentials.resolve(
        ref ?? undefined,
        link.environment,
      );
      if (credentials) return { link, apiKey: credentials.apiKey };
    }
    throw new ServiceUnavailableException({
      code: 'carbon_provider_credentials_missing',
      message:
        kind === 'write'
          ? '3pmetrics yazma anahtarı tanımlı değil. Destek ekibiyle iletişime geçin.'
          : '3pmetrics okuma anahtarı tanımlı değil. Destek ekibiyle iletişime geçin.',
    });
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (failure) {
      throw this.mapError(failure);
    }
  }

  mapError(failure: unknown): HttpException {
    if (failure instanceof HttpException) return failure;
    if (!(failure instanceof ConnectHubError)) {
      this.logger.error(
        'ConnectHub çağrısı başarısız',
        failure instanceof Error ? failure.message : String(failure),
      );
      return new BadGatewayException({
        code: 'carbon_provider_unavailable',
        message: 'Karbon ölçüm sağlayıcısına ulaşılamadı.',
      });
    }
    this.logger.warn(`ConnectHub ${failure.reason}: ${failure.message}`);
    switch (failure.reason) {
      case 'not_configured':
        return new ServiceUnavailableException({
          code: 'carbon_provider_not_configured',
          message: failure.message,
        });
      case 'unauthorized':
      case 'forbidden':
        return new ServiceUnavailableException({
          code: 'carbon_provider_unauthorized',
          message:
            '3pmetrics anahtarı reddedildi (geçersiz, iptal edilmiş veya bu işlem için yetkisiz). Destek ekibiyle iletişime geçin.',
        });
      case 'not_found':
        return new NotFoundException({
          code: 'carbon_provider_not_found',
          message: "İstenen kayıt 3pmetrics'te bulunamadı.",
        });
      case 'period_closed':
        return new ConflictException({
          code: 'carbon_period_closed',
          message: failure.message,
        });
      case 'invalid_request':
        return new BadRequestException({
          code: 'carbon_provider_invalid_request',
          message: failure.message,
        });
      case 'rate_limited':
        return new HttpException(
          { code: 'carbon_provider_rate_limited', message: failure.message },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'invalid_response':
        return new BadGatewayException({
          code: 'carbon_provider_invalid_response',
          message:
            '3pmetrics yanıtı beklenen biçimde değil; sonuç fiyata dönüştürülmedi.',
        });
      default:
        return new BadGatewayException({
          code: 'carbon_provider_unavailable',
          message: failure.message,
        });
    }
  }

  private assertPeriod(period: string, opts: { notFuture?: boolean } = {}) {
    if (!isValidPeriod(period)) {
      throw new BadRequestException(
        'Dönem YYYY-AA biçiminde olmalı (ör. 2026-10).',
      );
    }
    if (opts.notFuture) {
      const end = monthBounds(period).end;
      const today = new Date().toISOString().slice(0, 10);
      if (end >= today) {
        throw new BadRequestException(
          'Yalnızca tamamlanmış aylar gönderilip hesaplanabilir.',
        );
      }
    }
  }

  private async readProfile(hotelId: string): Promise<FacilityProfile | null> {
    const read = (columns: string) =>
      this.supabase.db
        .from('carbon_facility_profiles')
        .select(columns)
        .eq('hotel_id', hotelId)
        .maybeSingle();
    let { data, error } = await read(PROFILE_COLUMNS);
    // Migration 0020 öncesi: ülke kodu sütunu yok → kod bilinmiyor sayılır.
    if (error?.code === UNDEFINED_COLUMN) {
      ({ data, error } = await read(PROFILE_COLUMNS_LEGACY));
    }
    if (error) {
      if (error.code === UNDEFINED_TABLE) return null;
      throw new BadRequestException('Tesis profili okunamadı.');
    }
    return data ? toProfile(data as unknown as Record<string, unknown>) : null;
  }

  private async readPeriodRow(
    hotelId: string,
    environment: string,
    period: string,
  ): Promise<{
    occupied_room_nights: number | null;
    measurement_id: string | null;
  } | null> {
    const { data, error } = await this.supabase.db
      .from('carbon_periods')
      .select('occupied_room_nights, measurement_id')
      .eq('hotel_id', hotelId)
      .eq('environment', environment)
      .eq('period', period)
      .maybeSingle();
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Dönem okunamadı.');
    }
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      occupied_room_nights:
        row.occupied_room_nights === null
          ? null
          : Number(row.occupied_room_nights),
      measurement_id: (row.measurement_id as string | null) ?? null,
    };
  }

  private async upsertPeriod(
    hotelId: string,
    userId: string,
    period: string,
    occupiedRoomNights: number,
  ) {
    const environment = this.environment();
    const profile = await this.readProfile(hotelId);
    if (profile) {
      const days = Number(monthBounds(period).end.slice(8, 10));
      if (occupiedRoomNights > profile.rooms * days) {
        throw new BadRequestException(
          `Dolu oda-gece bu ay için en fazla ${profile.rooms * days} olabilir (${profile.rooms} oda × ${days} gün).`,
        );
      }
    }
    const { error } = await this.supabase.db.from('carbon_periods').upsert(
      {
        hotel_id: hotelId,
        environment,
        period,
        occupied_room_nights: occupiedRoomNights,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id,environment,period' },
    );
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Dolu oda-gece kaydedilemedi.');
    }
  }

  private async readRecords(
    hotelId: string,
    environment: string,
    period: string,
  ): Promise<ActivityRecordView[]> {
    const { data, error } = await this.supabase.db
      .from('carbon_activity_records')
      .select(RECORD_COLUMNS)
      .eq('hotel_id', hotelId)
      .eq('environment', environment)
      .eq('period', period)
      .order('item_name', { ascending: true });
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Dönem kayıtları okunamadı.');
    }
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      item_id: row.item_id as string,
      item_code: (row.item_code as string | null) ?? null,
      item_name: (row.item_name as string | null) ?? null,
      period: row.period as string,
      quantity: Number(row.quantity),
      uom: row.uom as string,
      note: (row.note as string | null) ?? null,
      status: row.status as ActivityRecordView['status'],
      provider_status: (row.provider_status as string | null) ?? null,
      provider_record_id: (row.provider_record_id as string | null) ?? null,
      error_code: (row.error_code as string | null) ?? null,
      error_message: (row.error_message as string | null) ?? null,
      warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
      sent_at: (row.sent_at as string | null) ?? null,
    }));
  }

  private async hotelCurrency(hotelId: string): Promise<string> {
    const { data, error } = await this.supabase.db
      .from('hotels')
      .select('default_currency')
      .eq('id', hotelId)
      .single();
    if (error || !data) throw new BadRequestException('Otel bulunamadı.');
    return (
      (data as { default_currency?: string | null }).default_currency ?? 'EUR'
    );
  }

  private schemaNotReady(migration = '0019') {
    return new ServiceUnavailableException({
      code: 'carbon_schema_not_ready',
      message: `ConnectHub ölçüm şeması hazır değil (migration ${migration} uygulanmalı).`,
    });
  }
}

function toProfile(row: Record<string, unknown>): FacilityProfile {
  return {
    country: row.country as string,
    country_code:
      typeof row.country_code === 'string' && row.country_code
        ? row.country_code
        : null,
    rooms: Number(row.rooms),
    total_area_m2: Number(row.total_area_m2),
    guestrooms_area_m2: Number(row.guestrooms_area_m2),
    meeting_area_m2: Number(row.meeting_area_m2),
    updated_at: row.updated_at as string,
  };
}
