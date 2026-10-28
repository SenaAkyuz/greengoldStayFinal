import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Panelden 3pmetrics'e gönderilecek TEK emisyon verisi kaydı
 * (`POST /cca/replies` karşılığı).
 *
 * Hangi alanın zorunlu olduğu emisyon kaynağına göre değişir (uçuş kaynağında
 * miktar yerine rota istenir, seçenek grubu olan kaynakta seçenek istenir);
 * bu kurallar sağlayıcının kaynak tanımına göre SERVİSTE uygulanır.
 * `hotel_id` ve 3pmetrics müşteri slug'ı gövdeden ASLA okunmaz.
 */
export class CreateEntryDto {
  /** Panelin form başına ürettiği anahtar — çift gönderimde ikinci kayıt oluşmaz. */
  @IsUUID()
  idempotency_key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  unit_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  resource_slug!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı.' })
  date!: string;

  /** Uçuş dışı kaynaklarda zorunlu. Ondalık ayırıcı nokta. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,6})?$/, {
    message: 'value pozitif bir sayı olmalı (ör. 1250.50).',
  })
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  system_option_value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  user_option_value?: string;

  /** Uçuş kaynakları (flight-route-v1): uçuş kodu veya yolcu adı. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  flight_name?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Kalkış IATA kodu 3 harf olmalı.' })
  departure_iata?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Varış IATA kodu 3 harf olmalı.' })
  arrival_iata?: string;

  /**
   * 3pmetrics'e yazılan kayıt API'den SİLİNEMEZ; yalnızca 3pmetrics
   * arayüzünden silinir. Otel bunu açıkça onaylamadan gönderim yapılmaz.
   */
  @Equals(true, {
    message:
      'Gönderilen kayıt buradan silinemez; göndermeden önce onaylamalısınız.',
  })
  confirm_irreversible!: boolean;

  /** Aynı birim/kaynak/tarih için kayıt zaten varsa yine de gönder. */
  @IsOptional()
  @IsBoolean()
  allow_duplicate?: boolean;
}
