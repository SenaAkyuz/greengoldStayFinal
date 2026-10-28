import { Injectable } from '@nestjs/common';
import type { ProviderAdapter } from './adapters/provider-adapter.interface';
import { SynxisNotConfiguredAdapter } from './adapters/synxis.adapter';
import { GenericSignedWebhookAdapter } from './adapters/generic-signed-webhook.adapter';
import { HotelRunnerAdapter } from './adapters/hotelrunner.adapter';

/**
 * Doğrulanmış sağlayıcı kayıt defteri. supabase/migrations/0009 (+0017 hotelrunner)
 * içindeki `provider` CHECK kısıtıyla BİREBİR aynı tutulmalı — yeni bir
 * sağlayıcı eklemek hem burada hem migration'da açık bir karar gerektirir.
 */
export const REGISTERED_PROVIDERS = [
  'synxis',
  'generic_signed_webhook',
  'hotelrunner',
] as const;
export type RegisteredProvider = (typeof REGISTERED_PROVIDERS)[number];

@Injectable()
export class ProviderRegistryService {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor() {
    this.register(new SynxisNotConfiguredAdapter());
    this.register(new GenericSignedWebhookAdapter());
    this.register(new HotelRunnerAdapter());
  }

  private register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /** Bilinmeyen provider -> undefined (çağıran taraf 400/404 üretir). */
  resolve(provider: string): ProviderAdapter | undefined {
    return this.adapters.get(provider);
  }
}
