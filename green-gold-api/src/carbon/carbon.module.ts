import { Module } from '@nestjs/common';
import { CarbonMeasurementController } from './carbon-measurement.controller';
import { CarbonMeasurementService } from './carbon-measurement.service';
import { CarbonProviderRegistryService } from './carbon-provider-registry';

/**
 * Harici karbon ölçüm sağlayıcısı modülü (Faz 1 + Faz 2).
 *
 * `IntegrationsModule`'den AYRI tutulur: booking engine/PMS rezervasyon olayı
 * ile karbon ölçümü farklı alanlardır ve aynı kontratı paylaşmazlar. Mevcut
 * karbon hesaplayıcıları (`common/carbon-pricing.ts`, `common/hotel-carbon.ts`)
 * DEĞİŞTİRİLMEDİ — sağlayıcı ölçümü üçüncü bir kaynak olarak yanlarına gelir.
 */
@Module({
  controllers: [CarbonMeasurementController],
  providers: [CarbonMeasurementService, CarbonProviderRegistryService],
  exports: [CarbonMeasurementService, CarbonProviderRegistryService],
})
export class CarbonModule {}
