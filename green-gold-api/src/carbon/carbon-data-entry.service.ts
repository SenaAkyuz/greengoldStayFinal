import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CarbonMeasurementService } from './carbon-measurement.service';
import type { RegisteredCarbonProvider } from './carbon-provider-registry';
import {
  CarbonProviderRequestError,
  FLIGHT_INPUT_MODE,
  type Airport,
  type EmissionReplyInput,
  type EmissionResource,
} from './carbon-provider.interface';
import { REPLY_DOCUMENT_EXTENSIONS } from './adapters/threepmetrics.adapter';
import type { CreateEntryDto } from './dto/create-entry.dto';

/**
 * Otelin emisyon verisini GreenGold panelinden 3pmetrics'e girmesi.
 *
 *   1. Birim (3pmetrics customer unit) seçilir — birimler 3pmetrics
 *      arayüzünde açılır, API ile açılamaz.
 *   2. Birimin emisyon kaynakları 3pmetrics'ten okunur; panel otelden YALNIZCA
 *      kaynağın istediği bilgiyi ister (miktar + seçenekler veya uçuş rotası).
 *   3. Kayıt `POST /cca/replies` ile 3pmetrics'e yazılır; 3pmetrics emisyonu
 *      hesaplar. Sonuç Carbon Summary ile alınır (CarbonMeasurementService).
 *
 * GERİ ALINAMAZLIK: 3pmetrics API'sinde silme yok. Bu yüzden:
 *   - otel göndermeden önce açıkça onaylar (DTO: confirm_irreversible),
 *   - form başına idempotency anahtarı çift gönderimi engeller,
 *   - aynı birim/kaynak/tarih/seçenek için kayıt varsa ayrıca onay istenir,
 *   - yazma ASLA otomatik tekrar edilmez; yanıt alınamazsa kayıt
 *     'outcome_unknown' olur ve otel 3pmetrics arayüzünden kontrol eder.
 */

/** Postgres "relation does not exist" — migration 0018 uygulanmamış. */
const UNDEFINED_TABLE = '42P01';
const UNIQUE_VIOLATION = '23505';

/**
 * Belge sınırı: 3pmetrics 10 MB kabul eder, ancak API Vercel'de çalışır ve
 * Vercel fonksiyon isteği 4.5 MB ile sınırlıdır. Multipart zarfı için pay bırakılır.
 */
export const ENTRY_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

const ENTRY_COLUMNS =
  'id, idempotency_key, external_unit_id, external_unit_name, resource_slug, resource_title, ghg_scope, entry_date, value, system_option_value, system_option_label, user_option_value, user_option_label, flight, status, external_reply_id, error_code, documents, environment, created_at, updated_at';

export interface CarbonEntryView {
  id: string;
  idempotency_key: string;
  unit_id: string;
  unit_name: string | null;
  resource_slug: string;
  resource_title: string | null;
  ghg_scope: string | null;
  date: string;
  value: number | null;
  system_option: { value: string; label: string | null } | null;
  user_option: { value: string; label: string | null } | null;
  flight: {
    passengerOrFlightName: string;
    departureIata: string;
    arrivalIata: string;
  } | null;
  status:
    'sending' | 'sent' | 'failed' | 'outcome_unknown' | 'deleted_in_provider';
  reply_id: number | null;
  error_code: string | null;
  documents: { file_name: string; uploaded_at: string }[];
  environment: string;
  created_at: string;
}

export interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class CarbonDataEntryService {
  private readonly logger = new Logger(CarbonDataEntryService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly measurement: CarbonMeasurementService,
  ) {}

  /** Seçilen birimin emisyon kaynakları — panel formu bunlardan çizilir. */
  async listEmissionResources(
    hotelId: string,
    unitId: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<EmissionResource[]> {
    const { adapter, link, credentials } =
      await this.measurement.requireConnection(hotelId, provider);
    try {
      return await adapter.listEmissionResources(
        credentials,
        link.external_property_id,
        unitId,
      );
    } catch (failure) {
      throw this.measurement.mapProviderError(provider, failure);
    }
  }

  /** Uçuş kaynakları için havalimanı araması (en az 2 karakter). */
  async lookupAirports(
    hotelId: string,
    query: string,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<Airport[]> {
    const q = (query ?? '').trim();
    if (q.length < 2 || q.length > 50) {
      throw new BadRequestException('Arama en az 2 karakter olmalı.');
    }
    const { adapter, credentials } = await this.measurement.requireConnection(
      hotelId,
      provider,
    );
    try {
      return await adapter.lookupAirports(credentials, q, 20);
    } catch (failure) {
      throw this.measurement.mapProviderError(provider, failure);
    }
  }

  async listEntries(
    hotelId: string,
  ): Promise<{ schema_ready: boolean; items: CarbonEntryView[] }> {
    const { data, error } = await this.supabase.db
      .from('carbon_provider_entries')
      .select(ENTRY_COLUMNS)
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { schema_ready: false, items: [] };
      }
      throw new BadRequestException('Gönderilen kayıtlar okunamadı.');
    }
    return {
      schema_ready: true,
      items: (data ?? []).map((row) =>
        toEntryView(row as Record<string, unknown>),
      ),
    };
  }

  /**
   * Bir emisyon verisini 3pmetrics'e yazar. Sıra bilinçlidir: girdi + kaynak
   * tanımı + mükerrer kontrolü 3pmetrics'e yazmadan ÖNCE yapılır; yerel kayıt
   * 'sending' olarak açılır, sonra tek bir yazma denemesi yapılır.
   */
  async createEntry(
    hotelId: string,
    authUserId: string,
    dto: CreateEntryDto,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<{ entry: CarbonEntryView; replayed: boolean }> {
    const previous = await this.findByIdempotencyKey(
      hotelId,
      dto.idempotency_key,
    );
    if (previous) return { entry: previous, replayed: true };

    assertEntryDate(dto.date);

    const { adapter, link, credentials } =
      await this.measurement.requireConnection(hotelId, provider);
    const customerSlug = link.external_property_id;

    let unitName: string | null = null;
    let resource: EmissionResource | undefined;
    try {
      const units = await adapter.listUnits(credentials, customerSlug);
      const unit = units.find((u) => u.externalUnitId === dto.unit_id);
      if (!unit) {
        throw new BadRequestException({
          code: 'carbon_entry_unknown_unit',
          message: 'Seçilen birim 3pmetrics hesabınızda bulunamadı.',
        });
      }
      unitName = unit.name;
      const resources = await adapter.listEmissionResources(
        credentials,
        customerSlug,
        dto.unit_id,
      );
      resource = resources.find((r) => r.slug === dto.resource_slug);
    } catch (failure) {
      throw this.measurement.mapProviderError(provider, failure);
    }
    if (!resource) {
      throw new BadRequestException({
        code: 'carbon_entry_unknown_resource',
        message: 'Seçilen emisyon kaynağı bu birimde bulunamadı.',
      });
    }

    const reply = buildReply(dto, resource, customerSlug);
    reply.memberId = await this.memberId(link.id);

    if (!dto.allow_duplicate) {
      const duplicate = await this.findSimilar(hotelId, dto, reply);
      if (duplicate) {
        throw new ConflictException({
          code: 'carbon_entry_possible_duplicate',
          message: `Bu birim, kaynak ve tarih için ${duplicate.created_at.slice(0, 10)} tarihinde zaten bir kayıt gönderilmiş. Gönderilen kayıtlar buradan silinemez; yine de göndermek istiyorsanız onaylayın.`,
        });
      }
    }

    const optionLabel = (
      group: EmissionResource['systemOptions'],
      value?: string,
    ) =>
      value === undefined
        ? null
        : (group?.options.find((o) => o.value === value)?.name ?? null);

    const now = new Date().toISOString();
    const inserted = await this.supabase.db
      .from('carbon_provider_entries')
      .insert({
        hotel_id: hotelId,
        link_id: link.id,
        provider,
        environment: link.environment,
        idempotency_key: dto.idempotency_key,
        external_account_id: customerSlug,
        external_unit_id: dto.unit_id,
        external_unit_name: unitName,
        resource_slug: resource.slug,
        resource_title: resource.title,
        ghg_scope: resource.ghgScope?.name ?? null,
        entry_date: dto.date,
        value: reply.flight ? null : Number(reply.value),
        system_option_value: reply.systemOptionValue ?? null,
        system_option_label: optionLabel(
          resource.systemOptions,
          reply.systemOptionValue,
        ),
        user_option_value: reply.userOptionValue ?? null,
        user_option_label: optionLabel(
          resource.userOptions,
          reply.userOptionValue,
        ),
        flight: reply.flight ?? null,
        status: 'sending',
        created_by: authUserId,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === UNDEFINED_TABLE) throw schemaNotReady();
      if (inserted.error?.code === UNIQUE_VIOLATION) {
        // Aynı form eşzamanlı iki kez gönderildi: ilk istek kazanır.
        const winner = await this.findByIdempotencyKey(
          hotelId,
          dto.idempotency_key,
        );
        if (winner) return { entry: winner, replayed: true };
      }
      throw new BadRequestException('Kayıt hazırlanamadı.');
    }
    const rawId: unknown = inserted.data.id;
    const entryId = String(rawId);

    let replyId: number;
    try {
      ({ replyId } = await adapter.createReply(credentials, reply));
    } catch (failure) {
      if (
        failure instanceof CarbonProviderRequestError &&
        failure.reason === 'outcome_unknown'
      ) {
        await this.updateEntry(hotelId, entryId, {
          status: 'outcome_unknown',
          error_code: 'outcome_unknown',
        });
        throw new HttpException(
          {
            code: 'carbon_entry_outcome_unknown',
            message:
              "3pmetrics'ten yanıt alınamadı; kayıt oluşmuş olabilir. Tekrar göndermeden önce 3pmetrics hesabınızdan kontrol edin.",
          },
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      await this.updateEntry(hotelId, entryId, {
        status: 'failed',
        error_code:
          failure instanceof CarbonProviderRequestError
            ? failure.reason
            : 'unknown',
      });
      throw this.entryError(provider, failure);
    }

    try {
      const entry = await this.updateEntry(hotelId, entryId, {
        status: 'sent',
        external_reply_id: replyId,
      });
      return { entry, replayed: false };
    } catch {
      this.logger.error(
        `3pmetrics kaydı oluştu ama yerel kayıt güncellenemedi (entry=${entryId}, replyId=${replyId})`,
      );
      // 3pmetrics kaydı OLUŞTU; yerel liste güncellenemedi. Otel tekrar
      // göndermesin diye bu açıkça söylenir (kayıt 'sending' kalır ve
      // mükerrer kontrolü onu yine görür).
      throw new HttpException(
        {
          code: 'carbon_entry_sent_not_recorded',
          message: `Kayıt 3pmetrics'e gönderildi (no ${replyId}) ancak listenize işlenemedi. Lütfen tekrar göndermeyin.`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Gönderilmiş bir kayda kanıt belgesi (fatura vb.) ekler. Opsiyoneldir. */
  async uploadDocument(
    hotelId: string,
    entryId: string,
    file: UploadedDocument | undefined,
    provider: RegisteredCarbonProvider = 'threepmetrics',
  ): Promise<CarbonEntryView> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Yüklenecek dosya seçilmedi.');
    }
    if (file.size > ENTRY_DOCUMENT_MAX_BYTES) {
      throw new PayloadTooLargeException('Belge en fazla 4 MB olabilir.');
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!(REPLY_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
      throw new BadRequestException(
        'Desteklenen biçimler: PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX.',
      );
    }

    const entry = await this.requireEntry(hotelId, entryId);
    if (entry.status !== 'sent' || entry.reply_id === null) {
      throw new BadRequestException(
        "Belge yalnızca 3pmetrics'e başarıyla gönderilmiş kayda eklenebilir.",
      );
    }

    const { adapter, credentials } = await this.measurement.requireConnection(
      hotelId,
      provider,
    );
    let fileName: string;
    try {
      ({ fileName } = await adapter.uploadReplyDocument(
        credentials,
        entry.reply_id,
        {
          fileName: file.originalname,
          contentType: file.mimetype || 'application/octet-stream',
          data: file.buffer,
        },
      ));
    } catch (failure) {
      throw this.entryError(provider, failure);
    }

    return this.updateEntry(hotelId, entryId, {
      documents: [
        ...entry.documents,
        { file_name: fileName, uploaded_at: new Date().toISOString() },
      ],
    });
  }

  /**
   * Otel kaydı 3pmetrics ARAYÜZÜNDEN sildiğini işaretler. API silme
   * yapmadığı için bu yalnızca yerel listenin doğru kalmasını sağlar.
   */
  async markDeletedInProvider(
    hotelId: string,
    entryId: string,
  ): Promise<CarbonEntryView> {
    const entry = await this.requireEntry(hotelId, entryId);
    if (entry.status !== 'sent' && entry.status !== 'outcome_unknown') {
      throw new BadRequestException(
        "Yalnızca 3pmetrics'e gönderilmiş kayıtlar işaretlenebilir.",
      );
    }
    return this.updateEntry(hotelId, entryId, {
      status: 'deleted_in_provider',
    });
  }

  private async memberId(linkId: string): Promise<string | undefined> {
    const { data } = await this.supabase.db
      .from('carbon_provider_links')
      .select('provider_member_id')
      .eq('id', linkId)
      .maybeSingle();
    const value = (data as { provider_member_id?: string | null } | null)
      ?.provider_member_id;
    return value?.trim() ? value.trim() : undefined;
  }

  private async findByIdempotencyKey(
    hotelId: string,
    key: string,
  ): Promise<CarbonEntryView | null> {
    const { data, error } = await this.supabase.db
      .from('carbon_provider_entries')
      .select(ENTRY_COLUMNS)
      .eq('hotel_id', hotelId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) {
      if (error.code === UNDEFINED_TABLE) throw schemaNotReady();
      throw new BadRequestException('Kayıt okunamadı.');
    }
    return data ? toEntryView(data) : null;
  }

  /** 3pmetrics'te muhtemelen zaten var olan (silinmemiş) aynı kayıt. */
  private async findSimilar(
    hotelId: string,
    dto: CreateEntryDto,
    reply: EmissionReplyInput,
  ): Promise<CarbonEntryView | null> {
    const { data } = await this.supabase.db
      .from('carbon_provider_entries')
      .select(ENTRY_COLUMNS)
      .eq('hotel_id', hotelId)
      .eq('external_unit_id', dto.unit_id)
      .eq('resource_slug', dto.resource_slug)
      .eq('entry_date', dto.date);
    const rows = ((data ?? []) as Record<string, unknown>[]).map(toEntryView);
    return (
      rows.find(
        (row) =>
          ['sending', 'sent', 'outcome_unknown'].includes(row.status) &&
          (row.system_option?.value ?? undefined) === reply.systemOptionValue &&
          (row.user_option?.value ?? undefined) === reply.userOptionValue,
      ) ?? null
    );
  }

  private async requireEntry(
    hotelId: string,
    entryId: string,
  ): Promise<CarbonEntryView> {
    if (!/^[0-9a-f-]{36}$/i.test(entryId)) {
      throw new BadRequestException('Kayıt kimliği geçersiz.');
    }
    const { data, error } = await this.supabase.db
      .from('carbon_provider_entries')
      .select(ENTRY_COLUMNS)
      .eq('hotel_id', hotelId)
      .eq('id', entryId)
      .maybeSingle();
    if (error?.code === UNDEFINED_TABLE) throw schemaNotReady();
    if (error || !data) throw new NotFoundException('Kayıt bulunamadı.');
    return toEntryView(data);
  }

  private async updateEntry(
    hotelId: string,
    entryId: string,
    patch: Record<string, unknown>,
  ): Promise<CarbonEntryView> {
    const { data, error } = await this.supabase.db
      .from('carbon_provider_entries')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('id', entryId)
      .select(ENTRY_COLUMNS)
      .single();
    if (error || !data) {
      // 3pmetrics yazımı başarılıysa bu hata kaydı kaybettirmemeli: loglanır.
      this.logger.error(
        `Karbon kaydı güncellenemedi (entry=${entryId}, patch=${Object.keys(patch).join(',')})`,
      );
      throw new BadRequestException('Kayıt durumu güncellenemedi.');
    }
    return toEntryView(data);
  }

  private entryError(provider: string, failure: unknown) {
    if (failure instanceof CarbonProviderRequestError) {
      if (failure.reason === 'invalid_request') {
        return new BadRequestException({
          code: 'carbon_entry_rejected',
          message:
            '3pmetrics kaydı kabul etmedi. Tarih, miktar ve seçenekleri kontrol edin.',
        });
      }
      if (failure.reason === 'no_data') {
        return new NotFoundException({
          code: 'carbon_entry_target_not_found',
          message: "Birim, emisyon kaynağı veya kayıt 3pmetrics'te bulunamadı.",
        });
      }
      if (failure.reason === 'too_large') {
        return new PayloadTooLargeException('Belge çok büyük.');
      }
      if (failure.reason === 'unsupported_media') {
        return new BadRequestException('Belge biçimi desteklenmiyor.');
      }
    }
    return this.measurement.mapProviderError(provider, failure);
  }
}

/** Kaynak tanımına göre girdiyi doğrular ve sağlayıcı isteğini kurar. */
export function buildReply(
  dto: CreateEntryDto,
  resource: EmissionResource,
  customerSlug: string,
): EmissionReplyInput {
  const reply: EmissionReplyInput = {
    customerSlug,
    customerUnitSlug: dto.unit_id,
    emissionResourceSlug: resource.slug,
    date: dto.date,
  };

  if (resource.inputMode === FLIGHT_INPUT_MODE) {
    if (dto.value !== undefined) {
      throw invalidEntry('Uçuş kaydında miktar gönderilmez.');
    }
    if (!dto.flight_name || !dto.departure_iata || !dto.arrival_iata) {
      throw invalidEntry(
        'Uçuş kaydı için uçuş kodu/yolcu adı, kalkış ve varış havalimanı zorunlu.',
      );
    }
    if (dto.departure_iata === dto.arrival_iata) {
      throw invalidEntry('Kalkış ve varış havalimanı aynı olamaz.');
    }
    reply.flight = {
      passengerOrFlightName: dto.flight_name.trim(),
      departureIata: dto.departure_iata,
      arrivalIata: dto.arrival_iata,
    };
  } else if (resource.inputMode && resource.inputMode !== FLIGHT_INPUT_MODE) {
    // Bilinmeyen giriş biçimi: alanlarını bilmeden yanlış kayıt YAZILMAZ.
    throw invalidEntry(
      'Bu emisyon kaynağının veri biçimi panelde henüz desteklenmiyor; veriyi 3pmetrics üzerinden girin.',
    );
  } else {
    if (dto.flight_name || dto.departure_iata || dto.arrival_iata) {
      throw invalidEntry('Bu kaynak uçuş bilgisi almaz.');
    }
    if (dto.value === undefined || !(Number(dto.value) > 0)) {
      throw invalidEntry('Miktar sıfırdan büyük olmalı.');
    }
    reply.value = dto.value;
  }

  reply.systemOptionValue = pickOption(
    resource.systemOptions,
    dto.system_option_value,
    true,
  );
  reply.userOptionValue = pickOption(
    resource.userOptions,
    dto.user_option_value,
    false,
  );
  return reply;
}

/**
 * Seçenek değeri kaynağın listesinde olmalı. Sistem seçeneği (ör. birim:
 * kWh/MWh, yakıt türü) varsa ZORUNLU: seçilmeden gönderilen miktar yanlış
 * birimle hesaplanabilir.
 */
function pickOption(
  group: EmissionResource['systemOptions'],
  value: string | undefined,
  requiredWhenPresent: boolean,
): string | undefined {
  if (!group) {
    if (value !== undefined) throw invalidEntry('Bu kaynak seçenek almaz.');
    return undefined;
  }
  if (value === undefined || value === '') {
    if (requiredWhenPresent) {
      throw invalidEntry(`${group.description || 'Seçenek'} seçilmeli.`);
    }
    return undefined;
  }
  if (!group.options.some((option) => option.value === value)) {
    throw invalidEntry('Seçilen seçenek bu kaynak için geçerli değil.');
  }
  return value;
}

function assertEntryDate(date: string): void {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  if (Number.isNaN(ms) || date > today || date < '2000-01-01') {
    throw invalidEntry('Tarih geçerli olmalı ve ileri bir tarih olamaz.');
  }
}

function invalidEntry(message: string): BadRequestException {
  return new BadRequestException({ code: 'carbon_entry_invalid', message });
}

function schemaNotReady(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'carbon_schema_not_ready',
    message:
      'Veri girişi tablosu henüz oluşturulmadı (migration 0018 uygulanmalı).',
  });
}

function toEntryView(row: Record<string, unknown>): CarbonEntryView {
  const option = (valueKey: string, labelKey: string) =>
    typeof row[valueKey] === 'string'
      ? {
          value: row[valueKey],
          label: (row[labelKey] as string | null) ?? null,
        }
      : null;
  const replyId = row.external_reply_id;
  return {
    id: row.id as string,
    idempotency_key: row.idempotency_key as string,
    unit_id: row.external_unit_id as string,
    unit_name: (row.external_unit_name as string | null) ?? null,
    resource_slug: row.resource_slug as string,
    resource_title: (row.resource_title as string | null) ?? null,
    ghg_scope: (row.ghg_scope as string | null) ?? null,
    date: row.entry_date as string,
    value:
      row.value === null || row.value === undefined ? null : Number(row.value),
    system_option: option('system_option_value', 'system_option_label'),
    user_option: option('user_option_value', 'user_option_label'),
    flight: (row.flight as CarbonEntryView['flight']) ?? null,
    status: row.status as CarbonEntryView['status'],
    reply_id:
      replyId === null || replyId === undefined ? null : Number(replyId),
    error_code: (row.error_code as string | null) ?? null,
    documents: Array.isArray(row.documents)
      ? (row.documents as CarbonEntryView['documents'])
      : [],
    environment: row.environment as string,
    created_at: row.created_at as string,
  };
}
