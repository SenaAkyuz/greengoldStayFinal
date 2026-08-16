import { createHash } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ProviderRegistryService } from './provider-registry';
import { resolverForEnvironment } from './secret-resolver';
import {
  NormalizedEventValidationError,
  type NormalizedReservationEvent,
} from './normalized-event';
import {
  decideStateTransition,
  type ContributionSnapshot,
  type ReservationSnapshot,
} from './state-machine';

// Gerçekçi bir rezervasyon/katkı payload'ının fersah fersah üzerinde ama
// bellek/DoS'a karşı sağlam bir tavan.
const MAX_BODY_BYTES = 256 * 1024;

/** Postgres serialization_failure — RPC'nin "kararın bayatladı, retry et" sinyali. */
const PG_SERIALIZATION_FAILURE = '40001';

interface HotelIntegrationRow {
  id: string;
  hotel_id: string;
  provider: string;
  environment: string;
  status: string;
  external_property_id: string;
  secret_ref: string;
  previous_secret_ref: string | null;
  previous_secret_expires_at: string | null;
}

interface ReservationRow {
  id: string;
  booking_status: ReservationSnapshot['booking_status'];
  provider_updated_at: string | null;
}

interface ContributionRow {
  id: string;
  status: ContributionSnapshot['status'];
  currency: string;
  amount_minor: number;
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Güvenli, PII'sız delivery audit alanları — normalized event ZATEN guest
 * bilgisi taşımadığı için ham haliyle saklanabilir (bkz. migration 0012 notu).
 */
function safeSnapshot(
  event: NormalizedReservationEvent,
): Record<string, unknown> {
  return {
    provider_reservation_id: event.provider_reservation_id,
    property_id: event.property_id,
    reservation_status: event.reservation_status,
    greengold: event.greengold,
    occurred_at: event.occurred_at,
  };
}

@Injectable()
export class WebhookIngestionService {
  private readonly logger = new Logger(WebhookIngestionService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly registry: ProviderRegistryService,
  ) {}

  async ingest(
    providerParam: string,
    routingId: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ status: string }> {
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Boş webhook body.');
    }
    if (rawBody.length > MAX_BODY_BYTES) {
      throw new PayloadTooLargeException('Webhook body çok büyük.');
    }

    const adapter = this.registry.resolve(providerParam);
    if (!adapter) {
      // Bilinmeyen provider -> enumeration'a karşı generic 404 (hangi
      // provider'ların var olduğunu sızdırma).
      throw new NotFoundException('Entegrasyon bulunamadı.');
    }
    if (!adapter.configured) {
      throw new ServiceUnavailableException({
        code: 'provider_not_configured',
        message: `${providerParam} adapter'ı henüz yapılandırılmadı.`,
      });
    }

    const integration = await this.findIntegration(providerParam, routingId);
    if (!integration) {
      throw new NotFoundException('Entegrasyon bulunamadı.');
    }
    if (integration.status !== 'active') {
      throw new ForbiddenException('Entegrasyon aktif değil.');
    }

    const payloadHash = sha256Hex(rawBody);

    // Secret çözümü environment'a göre: 'production' için resolver FAIL-CLOSED
    // (gerçek secrets manager yok) -> aday secret dönmez -> imza doğrulanamaz.
    const resolver = resolverForEnvironment(integration.environment);
    const { candidates } = resolver.resolve({
      secretRef: integration.secret_ref,
      previousSecretRef: integration.previous_secret_ref,
      previousSecretExpiresAt: integration.previous_secret_expires_at,
    });

    // Rotasyon overlap'i: adaylar sırayla denenir (önce güncel, sonra süresi
    // dolmamış eski). Herhangi biri doğrularsa imza geçerlidir.
    const signatureOk = candidates.some((secret) =>
      adapter.verifySignature({ rawBody, headers, secret }),
    );

    if (!signatureOk) {
      await this.logRejectedDelivery(integration, providerParam, payloadHash, {
        signatureVerified: false,
        processingStatus: 'rejected_bad_signature',
        errorCode:
          candidates.length === 0
            ? 'secret_not_resolvable'
            : 'signature_mismatch',
        providerEventId: null,
        normalizedSnapshot: null,
      });
      // Loga secret/imza DEĞERİ asla yazılmaz — yalnızca bu genel mesaj.
      throw new UnauthorizedException('Geçersiz imza.');
    }

    let event: NormalizedReservationEvent;
    try {
      event = adapter.parseEvent(rawBody);
    } catch (e) {
      const code =
        e instanceof NormalizedEventValidationError
          ? e.code
          : 'invalid_payload';
      await this.logRejectedDelivery(integration, providerParam, payloadHash, {
        signatureVerified: true,
        processingStatus: 'rejected_invalid_payload',
        errorCode: code,
        providerEventId: null,
        normalizedSnapshot: null,
      });
      throw new BadRequestException('Geçersiz payload.');
    }

    // Senaryo #12 — tenant çapraz saldırı koruması: event başka bir property'e
    // aitse (routing id doğru olsa bile) reddedilir, hiçbir domain yazımı yok.
    if (event.property_id !== integration.external_property_id) {
      await this.logRejectedDelivery(integration, providerParam, payloadHash, {
        signatureVerified: true,
        processingStatus: 'rejected_invalid_payload',
        errorCode: 'property_id_mismatch',
        providerEventId: event.provider_event_id,
        normalizedSnapshot: safeSnapshot(event),
      });
      throw new ForbiddenException('property_id bu entegrasyonla eşleşmiyor.');
    }

    return this.applyVerifiedEvent(integration, payloadHash, event);
  }

  /**
   * Doğrulanmış event'in domain'e uygulanması.
   *
   * Karar (state machine) burada, UYGULAMA katmanında verilir; ama yazımın
   * TAMAMI (delivery idempotency + reservation + contribution + delivery final
   * status) tek bir Postgres transaction'ında, `ingest_reservation_event`
   * RPC'si içinde gerçekleşir (bkz. migration 0013). Kararın dayandığı ön
   * koşul (`provider_updated_at` / rezervasyonun var olup olmaması) transaction
   * İÇİNDE yeniden doğrulanır; bayatlamışsa RPC 40001 fırlatır ve HİÇBİR kısmi
   * değişiklik kalmaz — sağlayıcının retry'ında taze durumla yeniden karar
   * verilir.
   *
   * TENANT BAĞI: `hotel_id` ve `provider` RPC'ye GÖNDERİLMEZ. RPC bu değerleri
   * `p_integration_id` ile kilitlediği `hotel_integrations` satırından KENDİSİ
   * türetir ve entegrasyonun `active` olduğunu transaction içinde doğrular.
   * Böylece bu servisteki olası bir programlama hatası (yanlış hotel_id
   * geçirmek) çapraz tenant kayıt üretemez.
   */
  private async applyVerifiedEvent(
    integration: HotelIntegrationRow,
    payloadHash: string,
    event: NormalizedReservationEvent,
  ): Promise<{ status: string }> {
    const reservation = await this.findReservation(
      integration.id,
      event.provider_reservation_id,
    );
    const contribution = reservation
      ? await this.findActiveContribution(reservation.id)
      : null;

    const decision = decideStateTransition(
      event,
      reservation
        ? {
            booking_status: reservation.booking_status,
            provider_updated_at: reservation.provider_updated_at,
          }
        : null,
      contribution
        ? {
            status: contribution.status,
            currency: contribution.currency,
            amount_minor: contribution.amount_minor,
          }
        : null,
    );

    const reservationPatch =
      decision.kind === 'reject' ? null : decision.reservationPatch;
    const contributionPatch =
      decision.kind === 'apply' ? decision.contributionPatch : null;
    const errorCode = decision.kind === 'apply' ? null : decision.errorCode;

    const rpcResult = (await this.supabase.db.rpc('ingest_reservation_event', {
      // hotel_id ve provider BİLEREK gönderilmiyor — RPC bunları integration
      // satırından kendisi türetir (çapraz tenant savunması).
      p_integration_id: integration.id,
      p_provider_event_id: event.provider_event_id,
      p_provider_reservation_id: event.provider_reservation_id,
      p_payload_hash: payloadHash,
      p_normalized_snapshot: safeSnapshot(event),
      p_delivery_status: decision.deliveryStatus,
      p_error_code: errorCode,
      // Optimistic concurrency temeli: kararı HANGİ duruma bakarak verdik.
      p_expected_provider_updated_at: reservation?.provider_updated_at ?? null,
      p_expected_reservation_exists: reservation !== null,
      p_reservation_patch: reservationPatch,
      p_contribution_patch: contributionPatch,
    })) as {
      data: { status?: string } | null;
      error: { code?: string; message: string } | null;
    };
    const { data, error } = rpcResult;

    if (error) {
      const code = error.code;
      if (code === PG_SERIALIZATION_FAILURE) {
        // Eşzamanlı bir event bizden önce durumu değiştirdi. Hiçbir kısmi
        // değişiklik yok. Sağlayıcı retry ettiğinde taze durumla yeniden
        // karar verilecek -> 409 (retryable).
        this.logger.warn(
          `Eszamanli event catismasi (hotel=${integration.hotel_id}, integration=${integration.id}) — retry bekleniyor.`,
        );
        throw new ServiceUnavailableException({
          code: 'concurrent_update_retry',
          message: 'Eşzamanlı güncelleme — lütfen tekrar deneyin.',
        });
      }
      this.logger.error(
        `Ingestion RPC hatasi (hotel=${integration.hotel_id}): ${error.message}`,
      );
      throw new BadRequestException('Event işlenemedi.');
    }

    return { status: data?.status ?? 'processed' };
  }

  private async findIntegration(
    provider: string,
    routingId: string,
  ): Promise<HotelIntegrationRow | null> {
    const { data, error } = await this.supabase.db
      .from('hotel_integrations')
      .select(
        'id, hotel_id, provider, environment, status, external_property_id, secret_ref, previous_secret_ref, previous_secret_expires_at',
      )
      .eq('webhook_routing_id', routingId)
      .eq('provider', provider)
      .single();
    if (error || !data) return null;
    return data;
  }

  private async findReservation(
    integrationId: string,
    providerReservationId: string,
  ): Promise<ReservationRow | null> {
    const { data, error } = await this.supabase.db
      .from('reservations')
      .select('id, booking_status, provider_updated_at')
      .eq('integration_id', integrationId)
      .eq('provider_reservation_id', providerReservationId)
      .single();
    if (error || !data) return null;
    return data;
  }

  private async findActiveContribution(
    reservationId: string,
  ): Promise<ContributionRow | null> {
    const { data, error } = await this.supabase.db
      .from('contributions')
      .select('id, status, currency, amount_minor')
      .eq('reservation_id', reservationId)
      .neq('status', 'voided')
      .single();
    if (error || !data) return null;
    return data;
  }

  /**
   * İmza/parse aşamasında reddedilen istekler için audit kaydı.
   *
   * Bu kayıt BİLEREK domain transaction'ının DIŞINDADIR: reddedilen bir event
   * hiçbir reservation/contribution yazımı yapmaz, dolayısıyla atomiklik
   * gereksinimi yoktur — burada tek bir insert vardır ve tek başına atomiktir.
   */
  private async logRejectedDelivery(
    integration: HotelIntegrationRow,
    provider: string,
    payloadHash: string,
    fields: {
      signatureVerified: boolean;
      processingStatus: string;
      errorCode: string;
      providerEventId: string | null;
      normalizedSnapshot: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const { error } = await this.supabase.db
      .from('integration_deliveries')
      .insert({
        hotel_id: integration.hotel_id,
        integration_id: integration.id,
        provider,
        provider_event_id: fields.providerEventId,
        payload_hash: payloadHash,
        signature_verified: fields.signatureVerified,
        processing_status: fields.processingStatus,
        error_code: fields.errorCode,
        normalized_snapshot: fields.normalizedSnapshot,
        processed_at: new Date().toISOString(),
      });
    if (error) {
      // Audit yazımı başarısız olsa bile isteği 401/400 ile reddetmeye devam
      // ederiz — audit hatası asla domain güvenliğini gevşetmemeli.
      this.logger.error(`Reddedilen delivery kaydedilemedi: ${error.message}`);
    }
  }
}
