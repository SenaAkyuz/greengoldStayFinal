import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsIanaTimeZone } from '../../common/is-iana-timezone.validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Otelin panelden düzenleyebildiği alanlar. TÜMÜ opsiyonel (kısmi güncelleme).
 * whitelist + forbidNonWhitelisted: buradaki alanlar DIŞINDA gelen her şey (ör.
 * commission_rate, estimated_co2_per_night_kg, currency, status, hotel_id) -> 400.
 * hotel_id ASLA gövdeden okunmaz (yalnızca token'dan).
 */
export class UpdateHotelDto {
  // Otel adı: trim sonrası boş olamaz ("   " reddedilir).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Otel adı boş olamaz.' })
  @MaxLength(120)
  name?: string;

  // Şehir: trim; boş olabilir (temizleme). Opsiyonel.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsIanaTimeZone()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  contribution_amount_per_night?: number;
}
