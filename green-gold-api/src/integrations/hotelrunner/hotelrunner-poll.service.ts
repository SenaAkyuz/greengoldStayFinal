import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  HOTELRUNNER_PROVIDER,
  mapHotelRunnerReservations,
} from '../adapters/hotelrunner.adapter';
import {
  HOTEL_INTEGRATION_COLUMNS,
  WebhookIngestionService,
  sha256Hex,
  type HotelIntegrationRow,
} from '../webhook-ingestion.service';
import {
  HotelRunnerClient,
  type HotelRunnerCredentials,
} from './hotelrunner.client';

/**
 * Push'un YEDEĞİ: aktif HotelRunner entegrasyonlarının son günlerde güncellenen
 * rezervasyonlarını çeker ve push ile AYNI eşleme + çekirdek üzerinden uygular.
 * Push zaten işlediyse provider_event_id aynı olduğu için tekrar uygulanmaz.
 *
 * Kota: otel başına günde 250 istek. Bir tur en fazla MAX_PAGES istek yapar;
 * 15 dakikada bir çalışırsa günde ~96 istek harcanır.
 */
const LOOKBACK_DAYS = 2;
const PER_PAGE = 50;
const MAX_PAGES = 2;

export interface PollIntegrationResult {
  integration_id: string;
  status: 'ok' | 'secret_not_resolvable' | 'api_error' | 'retry_needed';
  reservations: number;
}

@Injectable()
export class HotelRunnerPollService {
  private readonly logger = new Logger(HotelRunnerPollService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly ingestion: WebhookIngestionService,
  ) {}

  async pollAll(now = new Date()): Promise<PollIntegrationResult[]> {
    const { data, error } = await this.supabase.db
      .from('hotel_integrations')
      .select(HOTEL_INTEGRATION_COLUMNS)
      .eq('provider', HOTELRUNNER_PROVIDER)
      .eq('status', 'active');
    if (error) {
      this.logger.error(
        `HotelRunner entegrasyonları okunamadı: ${error.message}`,
      );
      return [];
    }

    const results: PollIntegrationResult[] = [];
    for (const integration of (data ?? []) as HotelIntegrationRow[]) {
      results.push(await this.pollOne(integration, now));
    }
    return results;
  }

  /** Testlerde sahte HTTP ile değiştirilir. */
  protected createClient(creds: HotelRunnerCredentials): HotelRunnerClient {
    return new HotelRunnerClient(creds);
  }

  private async pollOne(
    integration: HotelIntegrationRow,
    now: Date,
  ): Promise<PollIntegrationResult> {
    const base = { integration_id: integration.id, reservations: 0 };
    const { candidates } = await this.ingestion.resolveSecrets(integration);
    if (candidates.length === 0) {
      return { ...base, status: 'secret_not_resolvable' };
    }

    const client = this.createClient({
      token: candidates[0],
      hrId: integration.external_property_id,
    });
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    let count = 0;
    let retryNeeded = false;
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const reservations = await client.listReservationsUpdatedSince(
          since,
          page,
          PER_PAGE,
        );
        count += reservations.length;
        if (reservations.length > 0) {
          const parsed = mapHotelRunnerReservations(reservations, {
            hrId: integration.external_property_id,
            productCode: integration.product_code,
          });
          try {
            await this.ingestion.applyTrustedEvents(
              integration,
              sha256Hex(Buffer.from(JSON.stringify(reservations))),
              parsed,
            );
          } catch {
            // Eşzamanlı çakışma: bir sonraki turda tekrar denenir.
            retryNeeded = true;
          }
        }
        if (reservations.length < PER_PAGE) break;
      }
    } catch (e) {
      // Token/URL loglanmaz — yalnızca HTTP durumu (HotelRunnerApiError mesajı).
      this.logger.warn(
        `HotelRunner taraması başarısız (integration=${integration.id}): ${
          e instanceof Error ? e.message : 'bilinmeyen hata'
        }`,
      );
      return { ...base, reservations: count, status: 'api_error' };
    }

    return {
      ...base,
      reservations: count,
      status: retryNeeded ? 'retry_needed' : 'ok',
    };
  }
}
