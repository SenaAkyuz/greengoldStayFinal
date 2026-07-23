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
}

@Injectable()
export class WidgetService {
  constructor(private readonly supabase: SupabaseService) {}

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
        'name, city, default_currency, contribution_amount_per_night, estimated_co2_per_night_kg, hotel_type, logo_url, brand_color, status',
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

    return {
      hotel_name: hotel.name as string,
      city: (hotel.city as string | null) ?? null,
      currency: (hotel.default_currency as string) ?? 'EUR',
      amount_per_night: Number(hotel.contribution_amount_per_night),
      // Override yoksa dokümante placeholder (hotel_type hesaba girmez).
      estimated_co2_per_night_kg: effectiveCo2PerNight(
        hotel.estimated_co2_per_night_kg as number | null,
      ),
      // Faz 1'de her zaman true (pazarlama dürüstlüğü — karar #6).
      is_estimated: true,
      logo_url: (hotel.logo_url as string | null) ?? null,
      // Defans: yalnızca katı hex geçir (DB'ye zaten doğrulanmış yazılıyor).
      brand_color: /^#[0-9a-fA-F]{6}$/.test(brandColor ?? '') ? brandColor : null,
      hotel_type: normalizeHotelType(hotel.hotel_type),
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
      .select('id, status')
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

    // 3. event_type üç izinli değerden biri değilse -> 400
    //    (ValidationPipe zaten reddeder; bu servis-içi savunma katmanıdır.)
    if (
      !WIDGET_EVENT_TYPES.includes(dto?.event_type as WidgetEventType)
    ) {
      throw new BadRequestException(
        `event_type şunlardan biri olmalı: ${WIDGET_EVENT_TYPES.join(', ')}`,
      );
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
