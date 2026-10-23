import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CarbonProviderAdapter } from './carbon-provider.interface';
import {
  THREEPMETRICS_BASE_URLS,
  ThreePMetricsAdapter,
} from './adapters/threepmetrics.adapter';

/**
 * Doğrulanmış karbon ölçüm sağlayıcısı kayıt defteri.
 * supabase/migrations/0015_carbon_measurement_provider.sql içindeki `provider`
 * CHECK kısıtıyla BİREBİR aynı tutulmalı — yeni sağlayıcı eklemek hem burada
 * hem migration'da açık bir karar gerektirir.
 *
 * `src/integrations/provider-registry.ts` ile aynı desen; booking engine
 * sağlayıcılarından AYRI tutulur çünkü ikisi farklı alanlardır (rezervasyon
 * olayı ve karbon ölçümü aynı kontratı paylaşmaz).
 */
export const REGISTERED_CARBON_PROVIDERS = ['threepmetrics'] as const;
export type RegisteredCarbonProvider =
  (typeof REGISTERED_CARBON_PROVIDERS)[number];

/** Panelin/otelin bugün kullanabildiği hesap kaynakları. */
export const CARBON_SOURCES = [
  'provider_measurement',
  'hotel_input',
  'regional_estimate',
] as const;
export type CarbonSource = (typeof CARBON_SOURCES)[number];

export type CarbonProviderEnvironment = 'sandbox' | 'production';

export function carbonProviderEnvironment(
  config: Pick<ConfigService, 'get'>,
): CarbonProviderEnvironment {
  return config.get<string>('CARBON_PROVIDER_ENVIRONMENT') === 'production'
    ? 'production'
    : 'sandbox';
}

@Injectable()
export class CarbonProviderRegistryService {
  private readonly adapters = new Map<string, CarbonProviderAdapter>();

  constructor(config: ConfigService) {
    const environment = carbonProviderEnvironment(config);
    this.register(
      new ThreePMetricsAdapter({
        // Override yalnızca test/proxy içindir; boşsa resmi adres kullanılır.
        baseUrl:
          config.get<string>('THREEPMETRICS_BASE_URL') ||
          THREEPMETRICS_BASE_URLS[environment],
      }),
    );
  }

  private register(adapter: CarbonProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /** Bilinmeyen provider -> undefined (çağıran taraf 404 üretir). */
  resolve(provider: string): CarbonProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  /** Panelin sağlayıcı durumunu dürüst gösterebilmesi için. */
  statuses(): { provider: string; configured: boolean }[] {
    return [...this.adapters.values()].map((adapter) => ({
      provider: adapter.provider,
      configured: adapter.configured,
    }));
  }
}
