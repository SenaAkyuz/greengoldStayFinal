import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * ConnectHub ölçüm akışının panel girdileri. whitelist + forbidNonWhitelisted
 * global olduğundan tanımsız alan 400 olur; hotel_id ASLA gövdeden okunmaz.
 */

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Tesis profili — bir kez girilir, her dönem hesabında kullanılır. */
export class FacilityProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country!: string;

  /**
   * ISO 3166-1 alpha-2 (ör. TR). İsteğe bağlı; faktör ülkesini doğrulamak için.
   * Biçim burada, bilinen bölge olup olmadığı serviste kontrol edilir.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'country_code ISO 3166-1 alpha-2 olmalı (ör. TR).',
  })
  country_code?: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  rooms!: number;

  @IsNumber()
  @Min(1)
  @Max(1e9)
  total_area_m2!: number;

  @IsNumber()
  @Min(1)
  @Max(1e9)
  guestrooms_area_m2!: number;

  @IsNumber()
  @Min(0)
  @Max(1e9)
  meeting_area_m2!: number;
}

export class ActivityLineDto {
  @IsUUID()
  item_id!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1e12)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  uom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Bir dönemin (ay) tüketim kayıtları + dolu oda-gece. */
export class SubmitPeriodDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40_000_000)
  occupied_room_nights?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ActivityLineDto)
  lines!: ActivityLineDto[];
}

export class PeriodOccupancyDto {
  @IsInt()
  @Min(1)
  @Max(40_000_000)
  occupied_room_nights!: number;
}

export function isValidPeriod(value: string): boolean {
  return PERIOD_RE.test(value);
}
