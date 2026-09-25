import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Faz 1 "Ölçüme başla" girdisi.
 *
 * whitelist + forbidNonWhitelisted (bkz. main.ts) sayesinde buradaki alanlar
 * DIŞINDA gelen her şey 400 olur — özellikle `hotel_id` gövdeden ASLA okunmaz
 * (yalnızca token'dan çözülür).
 *
 * `return_path` tam URL DEĞİL, panel içi bir yoldur. Tam URL kabul etmek açık
 * redirect açığı olurdu; origin sunucuda PANEL_BASE_URL'den eklenir.
 */
export class StartMeasurementDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^\/[A-Za-z0-9\-._~/?=&%]*$/, {
    message: 'return_path panel içi bir yol olmalı (ör. /ayarlar).',
  })
  return_path?: string;
}
