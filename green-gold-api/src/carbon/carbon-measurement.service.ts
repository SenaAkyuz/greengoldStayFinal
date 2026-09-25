import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CarbonProviderRegistryService,
  type RegisteredCarbonProvider,
} from './carbon-provider-registry';
import {
  CarbonProviderNotConfiguredError,
  type CarbonProviderAdapter,
  type ProviderProperty,
} from './carbon-provider.interface';
import { allocateRoomNight } from './room-night-allocation';

/** Panelin dürüst bir durum ekranı çizebilmesi için gereken her şey. */
export interface CarbonProviderStatus {
  provider: RegisteredCarbonProvider;
  /** Sağlayıcı sözleşmesi (API dokümanı / auth yöntemi / webhook) hazır mı. */
  provider_configured: boolean;
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

export interface StartMeasurementInput {
  period_start: string;
  period_end: string;
  /** Panel içi dönüş yolu (tam URL DEĞİL — açık redirect önlemi). */
  return_path?: string;
}

export interface StartMeasurementResult {
  session_id: string;
  /** Bizim ölçüm kimliğimiz — webhook/API yanıtında geri gelmesi beklenir. */
  measurement_ref: string;
  /** Otelin yönlendirileceği, süreli sağlayıcı form adresi. */
  form_url: string;
  expires_at: string;
  period: { start: string; end: string };
}

/** Postgres "relation does not exist" — migration 0015 henüz uygulanmamış. */
const UNDEFINED_TABLE = '42P01';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MEASUREMENT_COLUMNS =
  'id, external_measurement_id, external_version, period_start, period_end, result_status, total_emissions, total_emissions_unit, scope, methodology, methodology_version, verification_status, report_url, rooms, occupied_room_nights, guest_nights, room_night_kg, allocation_method, is_active, provider_updated_at, imported_at';

const LINK_COLUMNS =
  'id, provider, environment, status, external_property_id, external_property_name, linked_at, revoked_at';

/**
 * Aktif bağlantının SUNUCU İÇİ görünümü. `authorization_ref` yalnızca burada
 * taşınır; `CarbonProviderLinkView`'e (panele dönen şekil) hiç girmez.
 */
interface ActiveLink {
  external_property_id?: string;
  authorization_ref?: string;
}

@Injectable()
export class CarbonMeasurementService {
  private readonly logger = new Logger(CarbonMeasurementService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly registry: CarbonProviderRegistryService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Otelin karbon ölçüm sağlayıcısı durumu. Sağlayıcı yapılandırılmamış VEYA
   * migration uygulanmamış olsa bile HATA FIRLATMAZ — panel bu iki durumu
   * ayrı ayrı gösterebilsin diye bayrak döner.
   */
  async getStatus(
    hotelId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<CarbonProviderStatus> {
    const adapter = this.requireAdapter(provider);

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
    const active = rows.find((row) => row.is_active === true) ?? null;

    return {
      provider,
      provider_configured: adapter.configured,
      schema_ready: links !== null && measurements !== null,
      link: links?.length ? toLinkView(links[0]) : null,
      measurements_count: rows.length,
      active_measurement: active ? toMeasurementView(active) : null,
      active_source: active
        ? 'provider_measurement'
        : await this.fallbackSource(hotelId),
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
   * Faz 1 — "Ölçüme başla".
   *
   * Sıra bilinçlidir: girdiler ÖNCE doğrulanır (hatalı dönem/dönüş adresi
   * sağlayıcı hazır olsa da reddedilir), sonra sağlayıcı kapısı, en sonda
   * DB yazımı. Sağlayıcı yapılandırılmadan HİÇBİR satır yazılmaz — form
   * bağlantısı alınamayan bir oturum kaydı yalnızca çöp üretir.
   *
   * Oturum satırı sağlayıcı çağrısından ÖNCE yazılır: `measurement_ref` bizim
   * kimliğimizdir ve sağlayıcı webhook'u form açılmadan bile gelebilir.
   * Sağlayıcı çağrısı başarısız olursa satır 'failed' işaretlenir, silinmez
   * (denetim izi).
   */
  async startMeasurement(
    hotelId: string,
    input: StartMeasurementInput,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<StartMeasurementResult> {
    const adapter = this.requireAdapter(provider);

    this.assertPeriod(input.period_start, input.period_end);
    const returnUrl = this.resolveReturnUrl(input.return_path);
    if (!adapter.configured) throw this.notConfigured(provider);

    const hotel = await this.getHotelRow(hotelId);
    const link = await this.activeLink(hotelId, provider);
    const environment = this.environment();

    // `measurement_ref` DB default'una bırakılmaz, BURADA üretilir: sağlayıcıya
    // gönderilecek kimliği yazmadan önce bilmemiz gerekir ve değer uygulama
    // tarafında test edilebilir kalır (DB default'u yalnızca emniyet ağı).
    const measurementRef = randomUUID();

    const { data: session, error } = await this.supabase.db
      .from('carbon_measurement_sessions')
      .insert({
        hotel_id: hotelId,
        provider,
        environment,
        measurement_ref: measurementRef,
        period_start: input.period_start,
        period_end: input.period_end,
        return_url: returnUrl,
        status: 'created',
      })
      .select('id, measurement_ref')
      .single();

    if (error || !session) {
      if (error?.code === UNDEFINED_TABLE) throw this.schemaNotReady();
      throw new BadRequestException('Ölçüm oturumu oluşturulamadı.');
    }

    const sessionId = session.id as string;

    try {
      const created = await adapter.createSession({
        hotelRef: hotelId,
        measurementRef,
        period: { start: input.period_start, end: input.period_end },
        returnUrl,
        hotelName: hotel.name,
        externalPropertyId: link?.external_property_id,
      });
      this.assertSessionResult(created);

      await this.supabase.db
        .from('carbon_measurement_sessions')
        .update({
          external_session_id: created.externalSessionId,
          form_url: created.formUrl,
          expires_at: created.expiresAt,
          status: 'opened',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('hotel_id', hotelId);

      return {
        session_id: sessionId,
        measurement_ref: measurementRef,
        form_url: created.formUrl,
        expires_at: created.expiresAt,
        period: { start: input.period_start, end: input.period_end },
      };
    } catch (failure) {
      await this.markSessionFailed(sessionId, hotelId, failure);
      throw this.mapProviderError(provider, failure);
    }
  }

  /**
   * Faz 2 / madde 3 — otelin yetkili olduğu tesisleri listeler.
   * Yetkilendirme referansı yalnızca SUNUCUDA çözülür; panele hiç gitmez.
   */
  async listProviderProperties(
    hotelId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<ProviderProperty[]> {
    const adapter = this.requireAdapter(provider);
    if (!adapter.configured) throw this.notConfigured(provider);

    const link = await this.activeLink(hotelId, provider);
    const authorizationRef = link?.authorization_ref;
    if (!authorizationRef) {
      throw new BadRequestException(
        'Önce 3pmetrics hesabına erişim izni verilmeli.',
      );
    }
    try {
      return await adapter.listProperties(authorizationRef);
    } catch (failure) {
      throw this.mapProviderError(provider, failure);
    }
  }

  /**
   * Faz 2 — "Otel bağlantıyı kaldırdığında yeni veri aktarımı da durmalı."
   * Sağlayıcıdan BAĞIMSIZ çalışır: link `revoked` olduğunda ingestion bu
   * tesise ait bildirimi reddeder. Satır denetim izi için silinmez.
   */
  async revokeLink(
    hotelId: string,
    linkId: string,
  ): Promise<{ id: string; status: string }> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        linkId,
      )
    ) {
      throw new BadRequestException('Bağlantı kimliği geçersiz.');
    }
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
   * hiç bağlanmadan kontrol eder. Operatör/panel bir ölçümü widget fiyatına
   * uygulamadan önce eksik alanı BURADAN görür.
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

  private environment(): 'sandbox' | 'production' {
    return this.config.get<string>('CARBON_PROVIDER_ENVIRONMENT') ===
      'production'
      ? 'production'
      : 'sandbox';
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
  private mapProviderError(provider: string, failure: unknown) {
    if (failure instanceof CarbonProviderNotConfiguredError) {
      return this.notConfigured(provider);
    }
    if (failure instanceof BadRequestException) return failure;
    this.logger.error(
      `Karbon sağlayıcı çağrısı başarısız (provider=${provider})`,
      failure instanceof Error ? failure.stack : String(failure),
    );
    return new BadGatewayException({
      code: 'carbon_provider_unavailable',
      message:
        'Karbon ölçüm sağlayıcısına ulaşılamadı. Daha sonra tekrar deneyin.',
    });
  }

  private async markSessionFailed(
    sessionId: string,
    hotelId: string,
    failure: unknown,
  ): Promise<void> {
    const code =
      failure instanceof CarbonProviderNotConfiguredError
        ? failure.code
        : 'provider_call_failed';
    const { error } = await this.supabase.db
      .from('carbon_measurement_sessions')
      .update({
        status: 'failed',
        error_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('hotel_id', hotelId);
    if (error) {
      // Oturum işaretlenemese bile asıl hata kullanıcıya dönmeli.
      this.logger.warn(`Ölçüm oturumu 'failed' işaretlenemedi (${sessionId}).`);
    }
  }

  /** Sağlayıcı yanıtı güvenilmez girdidir: süresiz/eksik bağlantı kabul edilmez. */
  private assertSessionResult(result: {
    externalSessionId?: string;
    formUrl?: string;
    expiresAt?: string;
  }): void {
    if (!result?.externalSessionId || !result.formUrl || !result.expiresAt) {
      throw new Error('Sağlayıcı eksik oturum yanıtı döndü.');
    }
    let url: URL;
    try {
      url = new URL(result.formUrl);
    } catch {
      throw new Error('Sağlayıcı geçersiz form adresi döndü.');
    }
    if (url.protocol !== 'https:') {
      throw new Error('Form adresi yalnızca https olabilir.');
    }
    const expires = Date.parse(result.expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      throw new Error('Form bağlantısının geçerlilik süresi geçersiz.');
    }
  }

  private async getHotelRow(hotelId: string): Promise<{ name: string }> {
    const { data, error } = await this.supabase.db
      .from('hotels')
      .select('name')
      .eq('id', hotelId)
      .single();
    if (error || !data) throw new BadRequestException('Otel bulunamadı.');
    return { name: data.name as string };
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
      external_property_id:
        (row.external_property_id as string | null) ?? undefined,
      authorization_ref: (row.authorization_ref as string | null) ?? undefined,
    };
  }

  /** Sağlayıcı ölçümü yoksa widget fiyatı hangi mevcut yoldan geliyor. */
  private async fallbackSource(
    hotelId: string,
  ): Promise<'hotel_input' | 'regional_estimate' | 'none'> {
    const { data } = await this.supabase.db
      .from('hotels')
      .select('widget_settings')
      .eq('id', hotelId)
      .single();
    const pricing = (data?.widget_settings as Record<string, unknown> | null)
      ?.carbon_pricing as { provider?: string } | undefined;
    if (!pricing?.provider) return 'none';
    return pricing.provider === 'hotel-input-demo'
      ? 'hotel_input'
      : 'regional_estimate';
  }

  private assertPeriod(start: string, end: string): void {
    for (const value of [start, end]) {
      if (
        !value ||
        !ISO_DATE.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      ) {
        throw new BadRequestException('Geçerli bir ölçüm dönemi girin.');
      }
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    if (days < 1 || days > 366) {
      throw new BadRequestException('Ölçüm dönemi en fazla 366 gün olabilir.');
    }
    if (end > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('Ölçüm dönemi gelecek tarih içeremez.');
    }
  }

  /**
   * Dönüş adresi AÇIK REDIRECT olmamalı: sağlayıcıya gönderilen adres yalnızca
   * panelin KENDİ origin'i olabilir. Dışarıdan tam URL kabul edilmez, yalnızca
   * panel içi bir yol. Origin konfigüre edilmemişse bağlantı oluşturulmaz.
   */
  private resolveReturnUrl(returnPath: string | undefined): string {
    const base = (
      this.config.get<string>('PANEL_BASE_URL') ??
      this.config.get<string>('NEXT_PUBLIC_SITE_URL') ??
      ''
    ).replace(/\/+$/, '');
    if (!base) {
      throw new BadRequestException(
        'Dönüş adresi için panel adresi (PANEL_BASE_URL) yapılandırılmalı.',
      );
    }
    const path = returnPath ?? '/ayarlar';
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[\r\n\t]/.test(path)
    ) {
      throw new BadRequestException(
        'Dönüş adresi yalnızca panel içi bir yol olabilir.',
      );
    }
    return `${base}${path}`;
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
