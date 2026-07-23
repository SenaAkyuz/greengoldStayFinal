import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsIanaTimeZone } from '../../common/is-iana-timezone.validator';
import { IsOriginArray } from '../../common/is-origin.validator';

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

  // Widget'ın POST edebileceği origin'ler. Geçersiz/wildcard/https-değil -> 400.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsOriginArray()
  allowed_origins?: string[];

  // Marka logosu: YALNIZCA https URL. http/data:/javascript: reddedilir (400).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_host: true },
    { message: 'logo_url yalnızca geçerli bir https URL olabilir.' },
  )
  logo_url?: string;

  // Marka rengi: katı hex (#RRGGBB). CSS injection önleme — başka hiçbir biçim yok.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'brand_color #RRGGBB biçiminde 6 haneli hex olmalı.',
  })
  brand_color?: string;
}
