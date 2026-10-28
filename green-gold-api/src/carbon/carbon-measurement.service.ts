import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { calculateHotelCarbon } from '../common/hotel-carbon';
import {
  CarbonProviderRegistryService,
  carbonProviderEnvironment,
  type RegisteredCarbonProvider,
} from './carbon-provider-registry';
import {
  CarbonProviderNotConfiguredError,
  CarbonProviderRequestError,
  type CarbonProviderAdapter,
  type CarbonSummary,
  type ProviderCredentials,
  type ProviderUnit,
} from './carbon-provider.interface';
import {
  EnvCarbonCredentialResolver,
  LayeredCarbonCredentialResolver,
  VaultCarbonCredentialResolver,
  type CarbonCredentialResolver,
} from './carbon-credentials';
import { allocateRoomNight } from './room-night-allocation';

/** Panelin dürüst bir durum ekranı çizebilmesi için gereken her şey. */
export interface CarbonProviderStatus {
  provider: RegisteredCarbonProvider;
  /** Sağlayıcıya bu ortamda çağrı yapılabilir mi (base URL). */
  provider_configured: boolean;
  /** Bu otelin bağlantısı için API anahtarı sunucuda çözülebiliyor mu. */
  credentials_ready: boolean;
  environment: 'sandbox' | 'production';
  /** 0015 migration'ı uygulanmış mı. Uygulanmadıysa panel "kurulum bekliyor" der. */
  schema_ready: boolean;
  link: CarbonProviderLinkView | null;
  measurements_count: number;
  active_measurement: CarbonMeasurementView | null;
  /** Bugün widget fiyatını hangi kaynak belirliyor. */
  active_source:
    'provider_measurement' | 'hotel_input' | 'regional_estimate' | 'none';
}

/** Panele dönen link görünümü — `authorization_ref` ASLA dönmez. */
export interface CarbonProviderLinkView {
  id: string;
  provider: string;
  environment: string;
  status: string;
  external_property_id: string;
  external_property_name: string | null;
  linked_at: string | null;
  revoked_at: string | null;
}

export interface CarbonMeasurementView {
  id: string;
  external_measurement_id: string;
  external_version: string;
  period_start: string;
  period_end: string;
  result_status: string;
  total_emissions: number | null;
  total_emissions_unit: string | null;
  scope: string | null;
  methodology: string | null;
  methodology_version: string | null;
  verification_status: string | null;
  report_url: string | null;
  rooms: number | null;
  occupied_room_nights: number | null;
  guest_nights: number | null;
  room_night_kg: number | null;
  allocation_method: string | null;
  is_active: boolean;
  provider_updated_at: string | null;
  imported_at: string;
}

/**
 * "3pmetrics verisini getir" girdisi. Emisyon 3pmetrics'ten gelir; oda-geceye
 * dağıtım için gereken OTEL verisi (oda, dolu oda-gece, alanlar) 3pmetrics
 * API'sinde YOKTUR ve otelden alınır.
 */
export interface ImportMeasurementInput {
  period_start: string;
  period_end: string;
  country: string;
  rooms: number;
  occupied_room_nights: number;
  total_area_m2: number;
  guestrooms_area_m2: number;
  meeting_area_m2: number;
}

export interface ImportMeasurementResult {
  measurement: CarbonMeasurementView;
  summary: Pick<
    CarbonSummary,
    'totalEmissions' | 'totalEmissionsUnit' | 'scopes' | 'lines'
  >;
  pricing: ProviderPricing;
  /** Aynı veri + aynı girdi daha önce içeri alınmışsa true (yeni satır yazılmaz). */
  duplicate: boolean;
}

/** `widget_settings.carbon_pricing` içine yazılan şekil (hotel-carbon ile aynı). */
export type ProviderPricing = ReturnType<typeof calculateHotelCarbon> & {
  external_account_id: string;
  external_account_name: string | null;
};

/** Postgres "relation does not exist" — migration 0015 henüz uygulanmamış. */
const UNDEFINED_TABLE = '42P01';

const PRICING_PROVIDER = 'threepmetrics';

const MEASUREMENT_COLUMNS =
  'id, external_measurement_id, external_version, period_start, period_end, result_status, total_emissions, total_emissions_unit, scope, methodology, methodology_version, verification_status, report_url, rooms, occupied_room_nights, guest_nights, room_night_kg, allocation_method, is_active, provider_updated_at, imported_at';

const LINK_COLUMNS =
  'id, provider, environment, status, external_property_id, external_property_name, linked_at, revoked_at';

/**
 * Aktif bağlantının SUNUCU İÇİ görünümü. `authorization_ref` yalnızca burada
 * taşınır; `CarbonProviderLinkView`'e (panele dönen şekil) hiç girmez.
 */
export interface ActiveLink {
  id: string;
  environment: string;
  external_property_id: string;
  external_property_name: string | null;
  authorization_ref?: string;
}

@Injectable()
export class CarbonMeasurementService {
  private readonly logger = new Logger(CarbonMeasurementService.name);

  /**
   * API anahtarı çözücüsü: önce Supabase Vault (sandbox + production), sonra
   * yalnızca sandbox için env yedeği. DI token'ı değil, alan — testler bu
   * alanı değiştirir.
   */
  credentials: CarbonCredentialResolver;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly registry: CarbonProviderRegistryService,
    private readonly config: ConfigService,
  ) {
    this.credentials = new LayeredCarbonCredentialResolver([
      new VaultCarbonCredentialResolver(supabase.db),
      new EnvCarbonCredentialResolver(),
    ]);
  }

  /**
   * Otelin karbon ölçüm sağlayıcısı durumu. Sağlayıcı yapılandırılmamış VEYA
   * migration uygulanmamış olsa bile HATA FIRLATMAZ — panel bu durumları
   * ayrı ayrı gösterebilsin diye bayrak döner.
   */
  async getStatus(
    hotelId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<CarbonProviderStatus> {
    const adapter = this.requireAdapter(provider);
    const environment = this.environment();

    const links = await this.trySelect(
      'carbon_provider_links',
      LINK_COLUMNS,
      hotelId,
      provider,
      'revoked',
    );
    const measurements = await this.trySelect(
      'carbon_measurements',
      MEASUREMENT_COLUMNS,
      hotelId,
      provider,
    );

    const rows = measurements ?? [];
    const pricingProvider = await this.currentPricingProvider(hotelId);
    // Otel sonradan başka bir hesap yöntemine geçtiyse `is_active` satırı
    // widget fiyatını artık BELİRLEMİYOR — yanlış kaynak gösterilmez.
    const active =
      pricingProvider === PRICING_PROVIDER
        ? (rows.find((row) => row.is_active === true) ?? null)
        : null;

    const link =
      links === null ? null : await this.activeLink(hotelId, provider);

    return {
      provider,
      provider_configured: adapter.configured,
      credentials_ready:
        link !== null &&
        link.environment === environment &&
        (await this.credentials.has(link.authorization_ref, link.environment)),
      environment,
      schema_ready: links !== null && measurements !== null,
      link: links?.length ? toLinkView(links[0]) : null,
      measurements_count: rows.length,
      active_measurement: active ? toMeasurementView(active) : null,
      active_source: active
        ? 'provider_measurement'
        : fallbackSource(pricingProvider),
    };
  }

  /** Otelin içeri aktarılmış ölçümleri (yeni dönem en üstte). */
  async listMeasurements(
    hotelId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<{ schema_ready: boolean; items: CarbonMeasurementView[] }> {
    this.requireAdapter(provider);
    const rows = await this.trySelect(
      'carbon_measurements',
      MEASUREMENT_COLUMNS,
      hotelId,
      provider,
    );
    if (rows === null) return { schema_ready: false, items: [] };
    return {
      schema_ready: true,
      items: rows
        .map(toMeasurementView)
        .sort((a, b) => b.period_end.localeCompare(a.period_end)),
    };
  }

  /**
   * Bağlı 3pmetrics müşterisinin birimleri (tesisleri). Çok tesisli bir
   * hesapta Carbon Summary API'nin birim parametresi YOK — panel bu listeyi
   * otele "özet tüm birimleri kapsar" uyarısı için gösterir.
   */
  async listProviderUnits(
    hotelId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<ProviderUnit[]> {
    const { adapter, link, credentials } = await this.requireConnection(
      hotelId,
      provider,
    );
    try {
      return await adapter.listUnits(credentials, link.external_property_id);
    } catch (failure) {
      throw this.mapProviderError(provider, failure);
    }
  }

  /**
   * "3pmetrics verisini getir".
   *
   * Sıra bilinçlidir: girdiler ÖNCE doğrulanır (hatalı dönem/oda-gece sağlayıcı
   * hazır olsa da reddedilir), sonra bağlantı + anahtar, sonra sağlayıcı
   * çağrısı, en sonda DB yazımı. Widget fiyatı BURADA DEĞİŞMEZ — otel sonucu
   * gördükten sonra `activateMeasurement` ile uygular.
   *
   * Oda-gece hesabı `calculateHotelCarbon` (rapor modu, otel toplamı) ile
   * yapılır: 3pmetrics özeti otelin TÜM emisyonudur; konaklama payı oda ve
   * toplantı alanı oranıyla ayrılır, dolu oda-geceye bölünür. Mevcut "otele
   * özgü hesap" ile aynı matematik — iki yol aynı birimi üretir.
   */
  async importMeasurement(
    hotelId: string,
    input: ImportMeasurementInput,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<ImportMeasurementResult> {
    const currency = await this.hotelCurrency(hotelId);
    // Sağlayıcıya gitmeden önce otel girdisini doğrula (geçici rapor değeriyle).
    calculateHotelCarbon(this.reportInput(input, 1, 'doğrulama'), currency);

    const { adapter, link, credentials } = await this.requireConnection(
      hotelId,
      provider,
    );

    let summary: CarbonSummary;
    try {
      summary = await adapter.getCarbonSummary(credentials, {
        start: input.period_start,
        end: input.period_end,
      });
    } catch (failure) {
      throw this.mapProviderError(provider, failure);
    }

    if (!(summary.totalEmissions > 0)) {
      throw new HttpException(
        {
          code: 'carbon_provider_no_data',
          message:
            'Bu dönem için 3pmetrics hesabınızda emisyon verisi bulunamadı. Verilerinizi 3pmetrics üzerinde girdikten sonra tekrar deneyin.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const reference = `3pmetrics GHG özeti · ${link.external_property_name ?? link.external_property_id} · ${input.period_start}/${input.period_end}`;
    const base = calculateHotelCarbon(
      this.reportInput(input, summary.totalEmissions, reference),
      currency,
    );
    const pricing: ProviderPricing = {
      ...base,
      provider: PRICING_PROVIDER,
      version: 'threepmetrics-carbon-summary-v1',
      calculation_method:
        '3pmetrics GHG özeti (Kapsam 1-2-3) × konaklama alan payı ÷ dolu oda-gece',
      scope:
        '3pmetrics hesabındaki tüm emisyon kaynakları (GHG Protokolü kapsamları). Konaklama payı alan oranıyla ayrılır.',
      external_account_id: link.external_property_id,
      external_account_name: link.external_property_name,
    };

    const externalMeasurementId = `ghg:${link.external_property_id}:${input.period_start}:${input.period_end}`;
    // Sürüm = sağlayıcı verisi + dağıtım girdisi. Aynı ikili ikinci kez satır
    // üretmez; 3pmetrics'te veri değişirse yeni sürüm olarak kaydedilir.
    const externalVersion = createHash('sha256')
      .update(
        JSON.stringify({
          lines: summary.lines,
          input: { ...input },
        }),
      )
      .digest('hex')
      .slice(0, 16);

    const summaryView = {
      totalEmissions: summary.totalEmissions,
      totalEmissionsUnit: summary.totalEmissionsUnit,
      scopes: summary.scopes,
      lines: summary.lines,
    };

    const existing = await this.findMeasurement(hotelId, provider, {
      external_measurement_id: externalMeasurementId,
      external_version: externalVersion,
    });
    if (existing) {
      return {
        measurement: toMeasurementView(existing),
        summary: summaryView,
        pricing,
        duplicate: true,
      };
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase.db
      .from('carbon_measurements')
      .insert({
        hotel_id: hotelId,
        provider,
        environment: link.environment,
        link_id: link.id,
        external_property_id: link.external_property_id,
        external_measurement_id: externalMeasurementId,
        external_version: externalVersion,
        period_start: input.period_start,
        period_end: input.period_end,
        result_status: 'completed',
        total_emissions: summary.totalEmissions,
        total_emissions_unit: summary.totalEmissionsUnit,
        scope: 'hotel_total',
        methodology: 'GHG Protocol (3pmetrics carbon-summary/by-ghg)',
        methodology_version: 'carbon-summary-api-1.0',
        verification_status: 'unverified',
        rooms: input.rooms,
        occupied_room_nights: input.occupied_room_nights,
        occupancy_percent: pricing.occupancy_percent,
        form_data: { summary: summaryView, allocation_input: input, pricing },
        room_night_kg: pricing.coefficient_kg,
        allocation_method: pricing.calculation_method,
        is_active: false,
        imported_at: now,
        updated_at: now,
      })
      .select(MEASUREMENT_COLUMNS)
      .single();

    if (error || !data) {
      if (error?.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('3pmetrics ölçümü kaydedilemedi.');
    }

    return {
      measurement: toMeasurementView(data),
      summary: summaryView,
      pricing,
      duplicate: false,
    };
  }

  /**
   * İçeri alınmış bir ölçümü widget fiyatına uygular. Otel başına en fazla
   * BİR aktif ölçüm olur (DB'de partial unique index): önce diğerleri pasife
   * çekilir, sonra bu satır aktifleşir, en sonda otel fiyatı yazılır.
   */
  async activateMeasurement(
    hotelId: string,
    measurementId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<{ measurement_id: string; pricing: ProviderPricing }> {
    this.requireAdapter(provider);
    assertUuid(measurementId, 'Ölçüm kimliği geçersiz.');

    const { data: row, error } = await this.supabase.db
      .from('carbon_measurements')
      .select(`${MEASUREMENT_COLUMNS}, form_data`)
      // hotel_id filtresi ZORUNLU — service_role RLS'i bypass eder.
      .eq('hotel_id', hotelId)
      .eq('provider', provider)
      .eq('id', measurementId)
      .maybeSingle();
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Ölçüm okunamadı.');
    }
    if (!row) throw new NotFoundException('Ölçüm bulunamadı.');

    const pricing = (row.form_data as { pricing?: ProviderPricing } | null)
      ?.pricing;
    if (
      !pricing ||
      pricing.provider !== PRICING_PROVIDER ||
      !(pricing.coefficient_kg > 0) ||
      !(pricing.amount_per_night > 0)
    ) {
      throw new BadRequestException(
        'Bu ölçümden oda-gece katsayısı türetilemedi; fiyata uygulanamaz.',
      );
    }

    const now = new Date().toISOString();
    await this.supabase.db
      .from('carbon_measurements')
      .update({ is_active: false, updated_at: now })
      .eq('hotel_id', hotelId)
      .eq('is_active', true);
    await this.supabase.db
      .from('carbon_measurements')
      .update({ is_active: true, updated_at: now })
      .eq('hotel_id', hotelId)
      .eq('id', measurementId);

    const { data: hotel } = await this.supabase.db
      .from('hotels')
      .select('widget_settings')
      .eq('id', hotelId)
      .single();
    const settings =
      (hotel?.widget_settings as Record<string, unknown> | null) ?? {};
    const { error: updateError } = await this.supabase.db
      .from('hotels')
      .update({
        contribution_amount_per_night: pricing.amount_per_night,
        estimated_co2_per_night_kg: pricing.coefficient_kg,
        widget_settings: { ...settings, carbon_pricing: pricing },
        updated_at: now,
      })
      .eq('id', hotelId);
    if (updateError) {
      throw new BadRequestException('Widget fiyatı güncellenemedi.');
    }

    return { measurement_id: measurementId, pricing };
  }

  /**
   * "Otel bağlantıyı kaldırdığında yeni veri aktarımı da durmalı."
   * Sağlayıcıdan BAĞIMSIZ çalışır: link `revoked` olduğunda yeni özet
   * çekilmez. Satır denetim izi için silinmez.
   */
  async revokeLink(
    hotelId: string,
    linkId: string,
  ): Promise<{ id: string; status: string }> {
    assertUuid(linkId, 'Bağlantı kimliği geçersiz.');
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.db
      .from('carbon_provider_links')
      .update({ status: 'revoked', revoked_at: now, updated_at: now })
      .eq('id', linkId)
      // hotel_id filtresi ZORUNLU — service_role RLS'i bypass eder.
      .eq('hotel_id', hotelId)
      .neq('status', 'revoked')
      .select('id, status')
      .maybeSingle();

    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Bağlantı kaldırılamadı.');
    }
    if (!data) throw new NotFoundException('Aktif bağlantı bulunamadı.');
    return { id: data.id as string, status: data.status as string };
  }

  /**
   * Bir ölçümün oda-gece katsayısına çevrilebilir olup olmadığını, sağlayıcıya
   * hiç bağlanmadan kontrol eder.
   */
  previewAllocation(
    measurement: Pick<
      CarbonMeasurementView,
      | 'total_emissions'
      | 'total_emissions_unit'
      | 'scope'
      | 'occupied_room_nights'
    >,
    guestroomShare?: number,
  ) {
    return allocateRoomNight({
      totalEmissions: measurement.total_emissions ?? undefined,
      totalEmissionsUnit: measurement.total_emissions_unit ?? undefined,
      scope: measurement.scope ?? undefined,
      occupiedRoomNights: measurement.occupied_room_nights ?? undefined,
      guestroomShare,
    });
  }

  // --- yardımcılar ---------------------------------------------------------

  private requireAdapter(provider: string): CarbonProviderAdapter {
    const adapter = this.registry.resolve(provider);
    if (!adapter) throw new NotFoundException('Bilinmeyen karbon sağlayıcısı.');
    return adapter;
  }

  /** Sağlayıcı + aktif bağlantı + çözülebilir anahtar; biri yoksa açık hata. */
  async requireConnection(
    hotelId: string,
    provider: RegisteredCarbonProvider,
  ): Promise<{
    adapter: CarbonProviderAdapter;
    link: ActiveLink;
    credentials: ProviderCredentials;
  }> {
    const adapter = this.requireAdapter(provider);
    if (!adapter.configured) throw this.notConfigured(provider);

    const link = await this.activeLink(hotelId, provider);
    if (!link) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_not_linked',
        message:
          '3pmetrics hesabınız henüz GreenGold Stay paneline bağlanmadı. Bağlantı için destek ekibiyle iletişime geçin.',
      });
    }
    if (link.environment !== this.environment()) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_environment_mismatch',
        message:
          '3pmetrics bağlantınız bu ortam için tanımlı değil. Destek ekibiyle iletişime geçin.',
      });
    }
    const credentials = await this.credentials.resolve(
      link.authorization_ref,
      link.environment,
    );
    if (!credentials) {
      throw new ServiceUnavailableException({
        code: 'carbon_provider_credentials_missing',
        message:
          '3pmetrics bağlantınızın erişim anahtarı henüz tanımlanmadı. Destek ekibiyle iletişime geçin.',
      });
    }
    return { adapter, link, credentials };
  }

  private environment(): 'sandbox' | 'production' {
    return carbonProviderEnvironment(this.config);
  }

  private notConfigured(provider: string): ServiceUnavailableException {
    const error = new CarbonProviderNotConfiguredError(provider);
    return new ServiceUnavailableException({
      code: error.code,
      message: error.message,
    });
  }

  private schemaNotReady(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'carbon_schema_not_ready',
      message:
        'Karbon ölçüm tabloları henüz oluşturulmadı (migration 0015 uygulanmalı).',
    });
  }

  /**
   * Sağlayıcı hatasını HTTP'ye çevirir. Sağlayıcı mesajı kullanıcıya AYNEN
   * geçirilmez (iç detay/kimlik sızıntısı olmasın); yalnızca loglanır.
   */
  mapProviderError(provider: string, failure: unknown) {
    if (failure instanceof CarbonProviderNotConfiguredError) {
      return this.notConfigured(provider);
    }
    if (failure instanceof HttpException) return failure;

    this.logger.error(
      `Karbon sağlayıcı çağrısı başarısız (provider=${provider})`,
      failure instanceof Error ? failure.message : String(failure),
    );

    if (failure instanceof CarbonProviderRequestError) {
      switch (failure.reason) {
        case 'unauthorized':
        case 'forbidden':
          return new ServiceUnavailableException({
            code: 'carbon_provider_unauthorized',
            message:
              '3pmetrics erişim anahtarı reddedildi (geçersiz, iptal edilmiş veya bu ortam için değil). Destek ekibiyle iletişime geçin.',
          });
        case 'no_data':
          return new HttpException(
            {
              code: 'carbon_provider_no_data',
              message:
                'Bu dönem için 3pmetrics hesabınızda emisyon verisi bulunamadı.',
            },
            HttpStatus.NOT_FOUND,
          );
        case 'invalid_request':
          return new BadRequestException({
            code: 'carbon_provider_invalid_request',
            message:
              '3pmetrics seçilen dönemi kabul etmedi. Tarihleri kontrol edin.',
          });
        case 'too_large':
          return new HttpException(
            { code: 'carbon_provider_too_large', message: 'Belge çok büyük.' },
            HttpStatus.PAYLOAD_TOO_LARGE,
          );
        case 'unsupported_media':
          return new BadRequestException({
            code: 'carbon_provider_unsupported_media',
            message: 'Belge biçimi desteklenmiyor.',
          });
        case 'invalid_response':
          return new BadGatewayException({
            code: 'carbon_provider_invalid_response',
            message:
              '3pmetrics yanıtı beklenen biçimde değil; sonuç fiyata dönüştürülmedi.',
          });
        default:
          break;
      }
    }
    return new BadGatewayException({
      code: 'carbon_provider_unavailable',
      message:
        'Karbon ölçüm sağlayıcısına ulaşılamadı. Daha sonra tekrar deneyin.',
    });
  }

  private reportInput(
    input: ImportMeasurementInput,
    reportTonnes: number,
    reference: string,
  ) {
    return {
      mode: 'report' as const,
      country: input.country,
      period_start: input.period_start,
      period_end: input.period_end,
      rooms: input.rooms,
      occupied_room_nights: input.occupied_room_nights,
      total_area_m2: input.total_area_m2,
      guestrooms_area_m2: input.guestrooms_area_m2,
      meeting_area_m2: input.meeting_area_m2,
      report_tonnes: reportTonnes,
      report_basis: 'hotel_total' as const,
      report_reference: reference.slice(0, 300),
      assessor: '3pmetrics',
    };
  }

  private async hotelCurrency(hotelId: string): Promise<string> {
    const { data, error } = await this.supabase.db
      .from('hotels')
      .select('default_currency')
      .eq('id', hotelId)
      .single();
    if (error || !data) throw new BadRequestException('Otel bulunamadı.');
    return (data.default_currency as string | null) ?? 'EUR';
  }

  private async findMeasurement(
    hotelId: string,
    provider: string,
    identity: { external_measurement_id: string; external_version: string },
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.supabase.db
      .from('carbon_measurements')
      .select(MEASUREMENT_COLUMNS)
      .eq('hotel_id', hotelId)
      .eq('provider', provider)
      .eq('external_measurement_id', identity.external_measurement_id)
      .eq('external_version', identity.external_version)
      .limit(1);
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Karbon ölçüm kayıtları okunamadı.');
    }
    return data?.[0] ?? null;
  }

  private async activeLink(
    hotelId: string,
    provider: string,
  ): Promise<ActiveLink | null> {
    const { data, error } = await this.supabase.db
      .from('carbon_provider_links')
      .select(`${LINK_COLUMNS}, authorization_ref`)
      .eq('hotel_id', hotelId)
      .eq('provider', provider)
      .eq('status', 'active')
      .limit(1);
    if (error) {
      if (error.code === UNDEFINED_TABLE) return null;
      throw new BadRequestException('Sağlayıcı bağlantısı okunamadı.');
    }
    if (!data?.length) return null;
    const row = data[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      environment: row.environment as string,
      external_property_id: row.external_property_id as string,
      external_property_name:
        (row.external_property_name as string | null) ?? null,
      authorization_ref: (row.authorization_ref as string | null) ?? undefined,
    };
  }

  /** Widget fiyatını bugün hangi hesap yöntemi belirliyor. */
  private async currentPricingProvider(
    hotelId: string,
  ): Promise<string | undefined> {
    const { data } = await this.supabase.db
      .from('hotels')
      .select('widget_settings')
      .eq('id', hotelId)
      .single();
    const pricing = (data?.widget_settings as Record<string, unknown> | null)
      ?.carbon_pricing as { provider?: string } | undefined;
    return pricing?.provider;
  }

  /**
   * Tabloyu okumayı dener; tablo YOKSA (migration uygulanmamış) `null` döner —
   * çağıran taraf bunu "schema_ready: false" olarak gösterir, 500 üretmez.
   */
  private async trySelect(
    table: string,
    columns: string,
    hotelId: string,
    provider: string,
    excludeStatus?: string,
  ): Promise<Record<string, unknown>[] | null> {
    let query = this.supabase.db
      .from(table)
      .select(columns)
      // hotel_id filtresi ZORUNLU — service_role RLS'i bypass eder.
      .eq('hotel_id', hotelId)
      .eq('provider', provider);
    if (excludeStatus) query = query.neq('status', excludeStatus);

    const { data, error } = await query;
    if (error) {
      if (error.code === UNDEFINED_TABLE) return null;
      throw new BadRequestException('Karbon ölçüm kayıtları okunamadı.');
    }
    return (data ?? []) as unknown as Record<string, unknown>[];
  }
}

/** Sağlayıcı ölçümü yoksa widget fiyatı hangi mevcut yoldan geliyor. */
function fallbackSource(
  pricingProvider: string | undefined,
): 'hotel_input' | 'regional_estimate' | 'none' {
  if (!pricingProvider || pricingProvider === PRICING_PROVIDER) return 'none';
  return pricingProvider === 'hotel-input-demo'
    ? 'hotel_input'
    : 'regional_estimate';
}

function assertUuid(value: string, message: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(message);
  }
}

function toLinkView(row: Record<string, unknown>): CarbonProviderLinkView {
  return {
    id: row.id as string,
    provider: row.provider as string,
    environment: row.environment as string,
    status: row.status as string,
    external_property_id: row.external_property_id as string,
    external_property_name:
      (row.external_property_name as string | null) ?? null,
    linked_at: (row.linked_at as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
  };
}

function toMeasurementView(
  row: Record<string, unknown>,
): CarbonMeasurementView {
  const num = (key: string) =>
    row[key] === null || row[key] === undefined ? null : Number(row[key]);
  const str = (key: string) => (row[key] as string | null) ?? null;
  return {
    id: row.id as string,
    external_measurement_id: row.external_measurement_id as string,
    external_version: row.external_version as string,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    result_status: row.result_status as string,
    total_emissions: num('total_emissions'),
    total_emissions_unit: str('total_emissions_unit'),
    scope: str('scope'),
    methodology: str('methodology'),
    methodology_version: str('methodology_version'),
    verification_status: str('verification_status'),
    report_url: str('report_url'),
    rooms: num('rooms'),
    occupied_room_nights: num('occupied_room_nights'),
    guest_nights: num('guest_nights'),
    room_night_kg: num('room_night_kg'),
    allocation_method: str('allocation_method'),
    is_active: row.is_active === true,
    provider_updated_at: str('provider_updated_at'),
    imported_at: row.imported_at as string,
  };
}
