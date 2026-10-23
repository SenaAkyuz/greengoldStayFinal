import {
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * "3pmetrics verisini getir" girdisi.
 *
 * whitelist + forbidNonWhitelisted (bkz. main.ts) sayesinde buradaki alanlar
 * DIŞINDA gelen her şey 400 olur — özellikle `hotel_id` gövdeden ASLA okunmaz
 * (yalnızca token'dan çözülür).
 *
 * Emisyon değeri bu DTO'da YOK: o 3pmetrics'ten gelir, panelden elle
 * girilmez. Buradaki alanlar 3pmetrics API'sinde bulunmayan ve oda-geceye
 * dağıtım için zorunlu olan OTEL verileridir. Mantıksal kontroller
 * (dönem ≤ 366 gün, dolu oda-gece ≤ oda × gün, alan tutarlılığı)
 * `calculateHotelCarbon` içinde, mevcut otel hesabıyla aynı kurallarla yapılır.
 */
export class ImportMeasurementDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'period_start YYYY-MM-DD biçiminde olmalı.',
  })
  period_start!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'period_end YYYY-MM-DD biçiminde olmalı.',
  })
  period_end!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country!: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  rooms!: number;

  @IsInt()
  @Min(1)
  @Max(40_000_000)
  occupied_room_nights!: number;

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
