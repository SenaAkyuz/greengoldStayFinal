import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveRange } from './date-range.util';

export interface WidgetEventsSummary {
  period: { from: string; to: string };
  views: number;
  selections: number;
  add_clicks: number;
  conversion_rate_pct: number;
}

export interface HotelInfo {
  hotel_name: string;
  city: string | null;
  status: string;
  currency: string;
  amount_per_night: number;
  estimated_co2_per_night_kg: number;
  public_widget_key: string;
}

export interface CarbonSummary {
  period: { from: string; to: string };
  contributions_count: number;
  total_selected_nights: number;
  estimated_co2_kg: number;
  tree_equivalent: number;
  co2_per_night_kg: number;
  is_estimated: boolean;
}

// ~21 kg CO₂ / ağaç / yıl kaba değeri (yaklaşık — panel "yaklaşık" etiketiyle gösterir).
const KG_CO2_PER_TREE_YEAR = 21;

const MIN_NIGHTS = 1;
const MAX_NIGHTS = 365;

/**
 * metadata->>'nights' güvenli cast + clamp: pozitif tam sayı değilse/yoksa 1;
 * [1,365] aralığına sıkıştırılır (DTO artık girişte sınırlar ama eski/bozuk
 * kayıtlara karşı ek savunma — hesap asla şişmez).
 */
function parseNights(metadata: unknown): number {
  if (metadata && typeof metadata === 'object') {
    const raw = (metadata as Record<string, unknown>).nights;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(Math.floor(n), MAX_NIGHTS);
    }
  }
  return MIN_NIGHTS;
}

@Injectable()
export class DashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Giriş yapan kullanıcının otelinin panel için gereken temel bilgisi.
   * hotelId auth guard'dan gelir (tenant izolasyonu). public_widget_key otelin
   * KENDİ public anahtarı — embed kodunda zaten görünür, dönmesi güvenli.
   */
  async getHotel(hotelId: string): Promise<HotelInfo> {
    const { data: hotel, error } = await this.supabase.db
      .from('hotels')
      .select(
        'name, city, status, default_currency, contribution_amount_per_night, estimated_co2_per_night_kg, public_widget_key',
      )
      .eq('id', hotelId)
      .single();

    if (error || !hotel) {
      throw new BadRequestException('Otel bulunamadı.');
    }

    return {
      hotel_name: hotel.name as string,
      city: (hotel.city as string | null) ?? null,
      status: hotel.status as string,
      currency: (hotel.default_currency as string) ?? 'EUR',
      amount_per_night: Number(hotel.contribution_amount_per_night),
      estimated_co2_per_night_kg: Number(hotel.estimated_co2_per_night_kg),
      public_widget_key: hotel.public_widget_key as string,
    };
  }

  /**
   * Otel bazlı widget event özeti.
   * hotelId auth guard'dan gelir — tenant izolasyonunun ASIL yeri burasıdır
   * (service_role kullandığımız için RLS devreye girmez, filtreleme kodda zorunlu).
   */
  async getWidgetEventsSummary(
    hotelId: string,
    from?: string,
    to?: string,
  ): Promise<WidgetEventsSummary> {
    // Otelin timezone'unu al (varsayılan aralık ve gün sınırları için).
    const { data: hotel, error: hotelError } = await this.supabase.db
      .from('hotels')
      .select('timezone')
      .eq('id', hotelId)
      .single();

    if (hotelError || !hotel) {
      throw new BadRequestException('Otel bulunamadı.');
    }

    const tz = (hotel.timezone as string) || 'Europe/Istanbul';

    let range;
    try {
      range = resolveRange(from, to, tz);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // hotel_id ile filtreli (tenant izolasyonu) + tarih aralığı [start, end).
    const { data: events, error: eventsError } = await this.supabase.db
      .from('widget_events')
      .select('event_type')
      .eq('hotel_id', hotelId)
      .gte('created_at', range.startUtc)
      .lt('created_at', range.endUtcExclusive);

    if (eventsError) {
      throw new BadRequestException(eventsError.message);
    }

    let views = 0;
    let selections = 0;
    let addClicks = 0;
    for (const row of events ?? []) {
      switch (row.event_type) {
        case 'widget_goruntulendi':
          views++;
          break;
        case 'checkbox_secildi':
          selections++;
          break;
        case 'katki_ekle_butonuna_basildi':
          addClicks++;
          break;
      }
    }

    const conversionRatePct =
      views > 0 ? Math.round((selections / views) * 10000) / 100 : 0;

    return {
      period: { from: range.fromLabel, to: range.toLabel },
      views,
      selections,
      add_clicks: addClicks,
      conversion_rate_pct: conversionRatePct,
    };
  }

  /**
   * TAHMİNİ karbon özeti. Ham event toplamı KULLANILMAZ — session bazlı tekilleştirilir.
   *   - Temel sinyal: SADECE 'katki_ekle_butonuna_basildi' (checkbox_secildi dahil DEĞİL).
   *   - Tekilleştirme: COALESCE(session_ref, id) başına bir katkı.
   *   - nights: metadata->>'nights' (sayı değilse 1).
   *   - estimated_co2_kg = Σ nights × hotels.estimated_co2_per_night_kg.
   * Faz 1: gerçek offset/kredi YOK — is_estimated her zaman true.
   */
  async getCarbonSummary(
    hotelId: string,
    from?: string,
    to?: string,
  ): Promise<CarbonSummary> {
    const { data: hotel, error: hotelError } = await this.supabase.db
      .from('hotels')
      .select('timezone, estimated_co2_per_night_kg')
      .eq('id', hotelId)
      .single();

    if (hotelError || !hotel) {
      throw new BadRequestException('Otel bulunamadı.');
    }

    const tz = (hotel.timezone as string) || 'Europe/Istanbul';
    const co2PerNight = Number(hotel.estimated_co2_per_night_kg);

    let range;
    try {
      range = resolveRange(from, to, tz);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Yalnızca button-press event'leri, bu otel + aralık.
    // Deterministik dedup için created_at DESC, id DESC ile çek (misafirin SON
    // buton basışı esas alınır); DB sırasına güvenmemek için JS'te de sıralarız.
    const { data: events, error: eventsError } = await this.supabase.db
      .from('widget_events')
      .select('id, session_ref, metadata, created_at')
      .eq('hotel_id', hotelId)
      .eq('event_type', 'katki_ekle_butonuna_basildi')
      .gte('created_at', range.startUtc)
      .lt('created_at', range.endUtcExclusive)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (eventsError) {
      throw new BadRequestException(eventsError.message);
    }

    // Determinizm: (created_at, id) DESC — DB sırasından bağımsız garanti.
    const rows = [...(events ?? [])].sort((a, b) => {
      const at = String(a.created_at ?? '');
      const bt = String(b.created_at ?? '');
      if (at !== bt) return at < bt ? 1 : -1; // created_at DESC
      const ai = String(a.id ?? '');
      const bi = String(b.id ?? '');
      return ai < bi ? 1 : ai > bi ? -1 : 0; // id DESC
    });

    // session_ref (yoksa id) başına TEK katkı — DESC sıralı olduğu için
    // ilk görülen = misafirin EN SON buton basışının nights'i.
    const perSession = new Map<string, number>();
    for (const row of rows) {
      const key = (row.session_ref as string | null) ?? (row.id as string);
      if (!perSession.has(key)) {
        perSession.set(key, parseNights(row.metadata));
      }
    }

    const contributionsCount = perSession.size;
    let totalSelectedNights = 0;
    for (const nights of perSession.values()) totalSelectedNights += nights;

    const estimatedCo2Kg =
      Math.round(totalSelectedNights * co2PerNight * 100) / 100;
    const treeEquivalent =
      Math.round((estimatedCo2Kg / KG_CO2_PER_TREE_YEAR) * 10) / 10;

    return {
      period: { from: range.fromLabel, to: range.toLabel },
      contributions_count: contributionsCount,
      total_selected_nights: totalSelectedNights,
      estimated_co2_kg: estimatedCo2Kg,
      tree_equivalent: treeEquivalent,
      co2_per_night_kg: co2PerNight,
      is_estimated: true,
    };
  }
}
