/**
 * ÖRNEK VERİ — genel bakış önizlemesi (`/onizleme/panel`).
 *
 * Şekiller panelin GERÇEK API tiplerinden alınır (lib/api.ts): önizlemede
 * API'nin vermediği bir metrik gösterilemez (derleme hatası verir).
 * Production'da `getSampleOverview()` hata fırlatır.
 */
import type {
  ContributionsSummary,
  DashboardReport,
  HotelInfo,
  IntegrationHealthSummary,
} from '../api';
import type { ConnectHubStatus } from '../connecthub/types';
import { isDevToolsEnabled } from '../dev-only';

export interface SampleOverview {
  hotel: HotelInfo;
  /** Karbon ölçümü durumu (sıradaki işlemler ve tesis profili önizlemesi için). */
  carbonStatus: ConnectHubStatus;
  report: DashboardReport;
  contributions: ContributionsSummary;
  integrations: IntegrationHealthSummary;
}

const period = { from: '2026-11-01', to: '2026-11-26' };

const SAMPLE: SampleOverview = {
  hotel: {
    hotel_name: 'Avlu Han',
    city: 'Örnek şehir',
    status: 'active',
    timezone: 'Europe/Istanbul',
    currency: 'EUR',
    amount_per_night: 0.11,
    estimated_co2_per_night_kg: 4.3,
    commission_rate: 0,
    public_widget_key: 'ornek-widget-anahtari',
    allowed_origins: ['https://ornek-otel.example'],
    hotel_type: 'city',
    logo_url: null,
    brand_color: null,
    role: 'hotel_admin',
  },
  carbonStatus: {
    api: 'connecthub',
    schema_ready: true,
    provider_configured: true,
    environment: 'sandbox',
    link: {
      id: 'ornek-baglanti',
      unit_id: 'ornek-birim',
      unit_name: 'Avlu Han (örnek)',
      environment: 'sandbox',
      linked_at: '2026-11-01T09:00:00Z',
      factor_inventory_id: null,
    },
    environment_matches: true,
    write_key_ready: true,
    read_key_ready: true,
    profile: {
      country: 'Türkiye',
      country_code: 'TR',
      rooms: 96,
      total_area_m2: 9_800,
      guestrooms_area_m2: 6_000,
      meeting_area_m2: 600,
      updated_at: '2026-11-03T10:15:00Z',
    },
  },
  report: {
    period,
    summary: { period, views: 4_820, selections: 612, add_clicks: 388, conversion_rate_pct: 12.7 },
    funnel: {
      period,
      stages: { viewed: 4_820, selected: 612, clicked: 388 },
      rates: { view_to_select_pct: 12.7, select_to_button_pct: 63.4, view_to_button_pct: 8.0 },
    },
    carbon: {
      period,
      contributions_count: 612,
      total_selected_nights: 1_486,
      estimated_co2_kg: 6_389.8,
      tree_equivalent: 304.3,
      co2_per_night_kg: 4.3,
      is_estimated: true,
    },
  },
  contributions: {
    period,
    totals: [
      {
        currency: 'EUR',
        collected_total_minor: 41_800,
        refunded_total_minor: 1_200,
        net_contribution_minor: 40_600,
        pending_total_minor: 9_600,
      },
    ],
    contributions_count: 214,
    pending_count: 48,
  },
  integrations: {
    integrations: [
      {
        id: 'sample-int-1',
        provider: 'hotelrunner',
        environment: 'sandbox',
        status: 'active',
        external_property_id: 'örnek-tesis',
        last_delivery_at: '2026-11-26T08:42:00Z',
        last_delivery_status: 'processed',
        last_delivery_signature_verified: true,
      },
    ],
  },
};

export function getSampleOverview(): SampleOverview {
  if (!isDevToolsEnabled()) {
    throw new Error('Örnek veri yalnızca geliştirme ortamında kullanılabilir.');
  }
  return SAMPLE;
}
