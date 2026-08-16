import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CreateWidgetEventDto,
  WIDGET_EVENT_TYPES,
  WidgetEventType,
} from './dto/create-widget-event.dto';
import { effectiveCo2PerNight, normalizeHotelType } from '../common/hotel-type';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  resolveWidgetSettings,
  type ContentOverrides,
} from '../common/widget-settings';

export interface WidgetConfig {
  hotel_name: string;
  city: string | null;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  is_estimated: boolean;
  logo_url: string | null;
  brand_color: string | null;
  hotel_type: string;
  // Pilot (Adım: Princes' Palace) — otel bazlı görünürlük. false iken widget
  // CO2/ağaç-yılı/aylık impact satırlarını HİÇ render etmez; bu yüzden
  // estimated_co2_per_night_kg de aynı satırda 0'a indirilir (aşağıda) —
  // istemciye yanıltıcı bir sayı asla gönderilmez.
  show_estimated_impact: boolean;
  // Otel bazlı TR/EN metin override'ları (yalnızca doğrulanmış düz metin,
  // HTML kabul edilmez — bkz. widget-settings.ts). Yoksa alan boş obje.
  content_overrides: ContentOverrides;
}

/**
 * Misafire gösterilen PUBLIC aylık tahmini etki — SADECE toplu (aggregate).
 * Misafir/kişisel veri yok. Sayılar carbon-summary ile birebir tutarlıdır
 * (aynı servis çağrılır).
 */
export interface WidgetImpact {
  month: string; // 'YYYY-MM'
  estimated_co2_kg: number;
  tree_equivalent: number;
  contributions_count: number;
  is_estimated: boolean;
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly dashboard: DashboardService,
  ) {}

  /**
   * Widget'ın gösterebileceği PUBLIC konfigürasyon. Hassas hiçbir alan dönmez.
   *   - key bulunamazsa -> 404
   *   - otel status <> 'active' ise -> 403
   */
  async getConfig(key: string | undefined): Promise<WidgetConfig> {
    if (!key) {
      throw new NotFoundException('Widget anahtarı gerekli.');
    }

    const { data: hotel, error } = await this.supabase.db
      .from('hotels')
      .select(
        'name, city, default_currency, contribution_amount_per_night, estimated_co2_per_night_kg, hotel_type, logo_url, brand_color, status, widget_settings',
      )
      .eq('public_widget_key', key)
      .single();

    if (error || !hotel) {
      throw new NotFoundException('Widget bulunamadı.');
    }

    if (hotel.status !== 'active') {
      throw new ForbiddenException('Widget aktif değil.');
    }

    const brandColor = hotel.brand_color as string | null;
    const settings = resolveWidgetSettings(hotel.widget_settings);

    return {
      hotel_name: hotel.name as string,
      city: (hotel.city as string | null) ?? null,
      currency: (hotel.default_currency as string) ?? 'EUR',
      amount_per_night: Number(hotel.contribution_amount_per_night),
      // Görünürlük kapalıysa yanıltıcı olabilecek sayıyı istemciye HİÇ
      // gönderme (widget zaten show_estimated_impact ile render etmeyecek —
      // bu ek bir savunma katmanı, örn. devtools/network'te sızmasın diye).
      estimated_co2_per_night_kg: settings.showEstimatedImpact
        ? effectiveCo2PerNight(hotel.estimated_co2_per_night_kg as number | null)
        : 0,
      // Faz 1'de her zaman true (pazarlama dürüstlüğü — karar #6).
      is_estimated: true,
      logo_url: (hotel.logo_url as string | null) ?? null,
      // Defans: yalnızca katı hex geçir (DB'ye zaten doğrulanmış yazılıyor).
      brand_color: /^#[0-9a-fA-F]{6}$/.test(brandColor ?? '') ? brandColor : null,
      hotel_type: normalizeHotelType(hotel.hotel_type),
      show_estimated_impact: settings.showEstimatedImpact,
      content_overrides: settings.contentOverrides,
    };
  }

  /**
   * Otelin BU AYKİ (otel tz) tahmini toplu etkisi. carbon-summary'nin public,
   * sadeleştirilmiş hali — aynı DashboardService.getCarbonSummary çağrılır ki
   * sayılar panelle birebir tutarlı olsun.
   *   - key yoksa/bulunamazsa -> 404
   *   - otel aktif değilse -> 403
   */
  async getImpact(key: string | undefined): Promise<WidgetImpact> {
    if (!key) {
      throw new NotFoundException('Widget anahtarı gerekli.');
    }

    const { data: hotel, error } = await this.supabase.db
      .from('hotels')
      .select('id, status, widget_settings')
      .eq('public_widget_key', key)
      .single();

    if (error || !hotel) {
      throw new NotFoundException('Widget bulunamadı.');
    }

    if (hotel.status !== 'active') {
      throw new ForbiddenException('Widget aktif değil.');
    }

    const settings = resolveWidgetSettings(hotel.widget_settings);
    const nowMonth = new Date().toISOString().slice(0, 7);

    // Görünürlük kapalıysa carbon-summary'yi hesaba bile gerek yok —
    // istemciye her zaman sıfırlanmış (yanıltmayan) sayılar dön. Widget
    // zaten estimated_co2_kg > 0 değilse satırı gizler.
    if (!settings.showEstimatedImpact) {
      return {
        month: nowMonth,
        estimated_co2_kg: 0,
        tree_equivalent: 0,
        contributions_count: 0,
        is_estimated: true,
      };
    }

    // Bu ay (otel tz'inde). Panel carbon-summary ile AYNI mantık.
    const carbon = await this.dashboard.getCarbonSummary(hotel.id as string, {
      range: 'month',
    });

    return {
      month: carbon.period.from.slice(0, 7), // 'YYYY-MM'
      estimated_co2_kg: carbon.estimated_co2_kg,
      tree_equivalent: carbon.tree_equivalent,
      contributions_count: carbon.contributions_count,
      is_estimated: true,
    };
  }

  async recordEvent(
    widgetKey: string | undefined,
    dto: CreateWidgetEventDto,
  ): Promise<{ id: string }> {
    // 1. X-Widget-Key yoksa -> 401
    if (!widgetKey) {
      throw new UnauthorizedException('X-Widget-Key header gerekli.');
    }

    // 2. hotels'ta public_widget_key = header ara. Yoksa -> 403
    const { data: hotel, error: hotelError } = await this.supabase.db
      .from('hotels')
      .select('id, status, widget_settings')
      .eq('public_widget_key', widgetKey)
      .single();

    if (hotelError || !hotel) {
      throw new ForbiddenException('Geçersiz widget anahtarı.');
    }

    // 2b. Otel aktif değilse (suspended/pending) event kabul etme -> 403
    // (config ucuyla tutarlı: pasif otel ne config verir ne event alır).
    if (hotel.status !== 'active') {
      throw new ForbiddenException('Widget aktif değil.');
    }

    // 3. event_type izinli değerlerden biri değilse -> 400
    //    (ValidationPipe zaten reddeder; bu servis-içi savunma katmanıdır.)
    if (
      !WIDGET_EVENT_TYPES.includes(dto?.event_type as WidgetEventType)
    ) {
      throw new BadRequestException(
        `event_type şunlardan biri olmalı: ${WIDGET_EVENT_TYPES.join(', ')}`,
      );
    }

    // 3b. booking_engine_clicked: otel bazlı feature flag KAPALIYSA (varsayılan
    // kapalı) bu event tipi bu otel için "bilinmiyor" muamelesi görür -> 400,
    // hiçbir satır insert edilmez. Diğer otellerin bayrağı bundan etkilenmez
    // (izolasyon: yalnızca BU widgetKey'in oteli okunur).
    if (dto.event_type === 'booking_engine_clicked') {
      const settings = resolveWidgetSettings(hotel.widget_settings);
      if (!settings.enableBookingClickTracking) {
        throw new BadRequestException(
          'booking_engine_clicked bu otel için etkin değil.',
        );
      }
    }

    // 4. widget_events'e insert (idempotent).
    const sessionRef = dto.session_ref ?? null;
    const { data: inserted, error: insertError } = await this.supabase.db
      .from('widget_events')
      .insert({
        hotel_id: hotel.id,
        event_type: dto.event_type,
        session_ref: sessionRef,
        metadata: dto.metadata ?? null,
      })
      .select('id')
      .single();

    if (insertError) {
      // Idempotency: aynı (hotel_id, session_ref, event_type) zaten kayıtlıysa
      // (unique index, session_ref not null) -> çift kayıt üretme, BAŞARI dön.
      const code = (insertError as { code?: string }).code;
      if (code === '23505' && sessionRef) {
        const { data: existing } = await this.supabase.db
          .from('widget_events')
          .select('id')
          .eq('hotel_id', hotel.id)
          .eq('session_ref', sessionRef)
          .eq('event_type', dto.event_type)
          .single();
        return { id: (existing?.id as string) ?? 'duplicate' };
      }
      throw new BadRequestException(
        insertError.message ?? 'Event kaydedilemedi.',
      );
    }

    if (!inserted) {
      throw new BadRequestException('Event kaydedilemedi.');
    }

    return { id: inserted.id as string };
  }
}
