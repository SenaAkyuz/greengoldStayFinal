import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const WIDGET_EVENT_TYPES = [
  'widget_goruntulendi',
  'checkbox_secildi',
  'katki_ekle_butonuna_basildi',
] as const;

export type WidgetEventType = (typeof WIDGET_EVENT_TYPES)[number];

// Karbon/analitik hesaplarının güvenebileceği sınırlar. whitelist + forbidNonWhitelisted
// sayesinde bilinmeyen alanlar (ör. enjekte edilmiş "amount" spoof'u) reddedilir.
export class WidgetEventMetadataDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  nights?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  amount_total?: number;
}

export class CreateWidgetEventDto {
  @IsIn(WIDGET_EVENT_TYPES as unknown as string[])
  event_type!: WidgetEventType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  session_ref?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WidgetEventMetadataDto)
  metadata?: WidgetEventMetadataDto;
}
