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

export interface WidgetConfig {
  hotel_name: string;
  city: string | null;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  is_estimated: boolean;
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
        'name, city, default_currency, contribution_amount_per_night, estimated_co2_per_night_kg, status',
      )
      .eq('public_widget_key', key)
      .single();

    if (error || !hotel) {
      throw new NotFoundException('Widget bulunamadı.');
    }

    if (hotel.status !== 'active') {
      throw new ForbiddenException('Widget aktif değil.');
    }

    return {
      hotel_name: hotel.name as string,
      city: (hotel.city as string | null) ?? null,
      currency: (hotel.default_currency as string) ?? 'EUR',
      amount_per_night: Number(hotel.contribution_amount_per_night),
      estimated_co2_per_night_kg: Number(hotel.estimated_co2_per_night_kg),
      // Faz 1'de her zaman true (pazarlama dürüstlüğü — karar #6).
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

    // 4. widget_events'e insert
    const { data: inserted, error: insertError } = await this.supabase.db
      .from('widget_events')
      .insert({
        hotel_id: hotel.id,
        event_type: dto.event_type,
        session_ref: dto.session_ref ?? null,
        metadata: dto.metadata ?? null,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      throw new BadRequestException(
        insertError?.message ?? 'Event kaydedilemedi.',
      );
    }

    // TODO (Faz 2): rate limiting, origin allow-list, key rotation.
    return { id: inserted.id as string };
  }
}
