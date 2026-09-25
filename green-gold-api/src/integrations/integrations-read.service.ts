import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  resolveRange,
  type RangeParams,
  type ResolvedRange,
} from '../dashboard/date-range.util';

const MAX_RESERVATIONS = 200;

export interface ReservationContributionSummary {
  selected: boolean;
  amount_minor: number;
  currency: string;
  status: string;
  collected_at: string | null;
  refunded_at: string | null;
}

export interface ReservationSummary {
  id: string;
  // Panel'de göründüğü haliyle — istenirse UI tarafında maskelenebilir; API
  // hiçbir guest PII'ı döndürmez (tablo zaten tutmuyor).
  provider_reservation_id: string;
  booking_status: string;
  arrival_date: string | null;
  departure_date: string | null;
  provider_updated_at: string | null;
  updated_at: string;
  contribution: ReservationContributionSummary | null;
}

export interface ReservationsPage {
  period: { from: string; to: string };
  items: ReservationSummary[];
  truncated: boolean;
}

export interface CurrencyContributionTotals {
  currency: string;
  /** status='collected' satırlarının toplamı (şu an aktif tahsilat). */
  collected_total_minor: number;
  /** status IN ('refunded','partially_refunded') satırlarının toplamı. */
  refunded_total_minor: number;
  /**
   * Net katkı = collected_total_minor - refunded_total_minor. KONSERVATİF
   * formül: 'partially_refunded' satırının TAMAMI refunded_total'a sayılır
   * (normalized kontrat kısmi iade tutarını AYRI taşımıyor — bkz. yorum
   * altında). Bu, gerçek net katkıyı OLDUĞUNDAN DÜŞÜK gösterebilir ama asla
   * OLDUĞUNDAN YÜKSEK göstermez (dürüstlük ilkesi: abartmaktansa eksik göster).
   */
  net_contribution_minor: number;
}

export interface ContributionsSummary {
  period: { from: string; to: string };
  /**
   * Para birimi bazında ayrıştırılmış — hotel farklı rezervasyonlarda farklı
   * currency alabilir (guest booking currency'sine göre), TEK bir toplamda
   * BİRLEŞTİRİLMEZ (yanlış toplama karşı).
   */
  totals: CurrencyContributionTotals[];
  contributions_count: number;
}

export interface IntegrationHealthItem {
  id: string;
  provider: string;
  environment: string;
  status: string;
  external_property_id: string;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_signature_verified: boolean | null;
}

export interface IntegrationHealthSummary {
  integrations: IntegrationHealthItem[];
}

@Injectable()
export class IntegrationsReadService {
  constructor(private readonly supabase: SupabaseService) {}

  private async getHotelTz(hotelId: string): Promise<string> {
    const { data, error } = await this.supabase.db
      .from('hotels')
      .select('timezone')
      .eq('id', hotelId)
      .single();
    if (error || !data) throw new BadRequestException('Otel bulunamadı.');
    return (data.timezone as string) || 'Europe/Istanbul';
  }

  /**
   * Tenant-scoped rezervasyon listesi. hotelId auth guard'dan gelir — bu,
   * tenant izolasyonunun ASIL yeridir (service_role RLS'i bypass eder).
   * updated_at aralığına göre filtrelenir (panelde "son değişenler" mantığı).
   */
  async getReservations(
    hotelId: string,
    params: RangeParams = {},
  ): Promise<ReservationsPage> {
    const tz = await this.getHotelTz(hotelId);
    let range: ResolvedRange;
    try {
      range = resolveRange(params, tz);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const { data: reservations, error } = await this.supabase.db
      .from('reservations')
      .select(
        'id, provider_reservation_id, booking_status, arrival_date, departure_date, provider_updated_at, updated_at',
      )
      .eq('hotel_id', hotelId)
      .gte('updated_at', range.startUtc)
      .lt('updated_at', range.endUtcExclusive)
      .order('updated_at', { ascending: false })
      .limit(MAX_RESERVATIONS + 1);

    if (error) throw new BadRequestException(error.message);

    const rows = reservations ?? [];
    const truncated = rows.length > MAX_RESERVATIONS;
    const page = truncated ? rows.slice(0, MAX_RESERVATIONS) : rows;

    const contributionByReservation = await this.loadContributionsFor(
      page.map((r) => r.id as string),
    );

    return {
      period: { from: range.fromLabel, to: range.toLabel },
      truncated,
      items: page.map((r) => ({
        id: r.id as string,
        provider_reservation_id: r.provider_reservation_id as string,
        booking_status: r.booking_status as string,
        arrival_date: (r.arrival_date as string | null) ?? null,
        departure_date: (r.departure_date as string | null) ?? null,
        provider_updated_at: (r.provider_updated_at as string | null) ?? null,
        updated_at: r.updated_at as string,
        contribution: contributionByReservation.get(r.id as string) ?? null,
      })),
    };
  }

  private async loadContributionsFor(
    reservationIds: string[],
  ): Promise<Map<string, ReservationContributionSummary>> {
    const map = new Map<string, ReservationContributionSummary>();
    if (reservationIds.length === 0) return map;

    const { data, error } = await this.supabase.db
      .from('contributions')
      .select(
        'reservation_id, selected, amount_minor, currency, status, collected_at, refunded_at',
      )
      .in('reservation_id', reservationIds)
      .neq('status', 'voided');

    if (error) throw new BadRequestException(error.message);

    for (const row of data ?? []) {
      map.set(row.reservation_id as string, {
        selected: row.selected as boolean,
        amount_minor: row.amount_minor as number,
        currency: row.currency as string,
        status: row.status as string,
        collected_at: (row.collected_at as string | null) ?? null,
        refunded_at: (row.refunded_at as string | null) ?? null,
      });
    }
    return map;
  }

  /**
   * Tenant-scoped katkı/tahsilat özeti — yalnızca 'collected' ve
   * 'refunded'/'partially_refunded' durumundaki satırlardan hesaplanır
   * (bkz. CurrencyContributionTotals yorumları — net formülü konservatiftir).
   */
  async getContributionsSummary(
    hotelId: string,
    params: RangeParams = {},
  ): Promise<ContributionsSummary> {
    const tz = await this.getHotelTz(hotelId);
    let range: ResolvedRange;
    try {
      range = resolveRange(params, tz);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const { data, error } = await this.supabase.db
      .from('contributions')
      .select('currency, amount_minor, status, updated_at')
      .eq('hotel_id', hotelId)
      .gte('updated_at', range.startUtc)
      .lt('updated_at', range.endUtcExclusive);

    if (error) throw new BadRequestException(error.message);

    const byCurrency = new Map<
      string,
      { collected: number; refunded: number; count: number }
    >();
    for (const row of data ?? []) {
      const currency = row.currency as string;
      const status = row.status as string;
      const amount = row.amount_minor as number;
      const bucket = byCurrency.get(currency) ?? {
        collected: 0,
        refunded: 0,
        count: 0,
      };
      if (status === 'collected') {
        bucket.collected += amount;
        bucket.count += 1;
      } else if (status === 'refunded' || status === 'partially_refunded') {
        bucket.refunded += amount;
        bucket.count += 1;
      }
      byCurrency.set(currency, bucket);
    }

    const totals: CurrencyContributionTotals[] = [...byCurrency.entries()].map(
      ([currency, b]) => ({
        currency,
        collected_total_minor: b.collected,
        refunded_total_minor: b.refunded,
        net_contribution_minor: Math.max(0, b.collected - b.refunded),
      }),
    );

    const contributionsCount = [...byCurrency.values()].reduce(
      (sum, b) => sum + b.count,
      0,
    );

    return {
      period: { from: range.fromLabel, to: range.toLabel },
      totals,
      contributions_count: contributionsCount,
    };
  }

  /**
   * Entegrasyon sağlığı: secret_ref/webhook_routing_id ASLA döndürülmez
   * (allowlist select) — panel yalnızca durum + son delivery bilgisini görür.
   */
  async getIntegrationHealth(
    hotelId: string,
  ): Promise<IntegrationHealthSummary> {
    const { data: integrations, error } = await this.supabase.db
      .from('hotel_integrations')
      .select('id, provider, environment, status, external_property_id')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    const items: IntegrationHealthItem[] = [];
    for (const integ of integrations ?? []) {
      const { data: lastDelivery } = await this.supabase.db
        .from('integration_deliveries')
        .select('received_at, processing_status, signature_verified')
        .eq('integration_id', integ.id as string)
        .order('received_at', { ascending: false })
        .limit(1)
        .single();

      items.push({
        id: integ.id as string,
        provider: integ.provider as string,
        environment: integ.environment as string,
        status: integ.status as string,
        external_property_id: integ.external_property_id as string,
        last_delivery_at: (lastDelivery?.received_at as string | null) ?? null,
        last_delivery_status:
          (lastDelivery?.processing_status as string | null) ?? null,
        last_delivery_signature_verified:
          (lastDelivery?.signature_verified as boolean | null) ?? null,
      });
    }

    return { integrations: items };
  }
}
