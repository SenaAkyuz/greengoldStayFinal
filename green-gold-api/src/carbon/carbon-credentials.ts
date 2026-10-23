import { isValidSecretRef } from '../integrations/secret-resolver';
import type { ProviderCredentials } from './carbon-provider.interface';

/**
 * `carbon_provider_links.authorization_ref` (opak referans) -> 3pmetrics API
 * anahtarı.
 *
 * 3pmetrics API anahtarı MÜŞTERİ KAPSAMLIDIR (teknik ek §1.5: "Keys are scoped
 * to a customer") ve ORTAMA ÖZGÜDÜR (test anahtarı production'da çalışmaz).
 * Bu yüzden her bağlantının kendi referansı vardır; anahtar DB tablolarına,
 * panele veya loga ASLA açık metin yazılmaz.
 *
 * Çözüm sırası:
 *   1. Supabase Vault (migration 0016) — sandbox VE production için meşru.
 *      Anahtar veritabanında şifreli durur; yalnızca service_role'ün
 *      çağırabildiği SECURITY DEFINER fonksiyonla çözülür.
 *   2. Env değişkeni — YALNIZCA sandbox/lokal geliştirme için yedek.
 *      Production'da env ASLA okunmaz (bkz. secret-resolver.ts gerekçesi).
 */
const ENV_PREFIX = 'CARBON_PROVIDER_SECRET_';

export function carbonEnvVarNameForRef(ref: string): string {
  return `${ENV_PREFIX}${ref}`;
}

export interface CarbonCredentialResolver {
  readonly name: string;
  readonly supportedEnvironments: readonly string[];
  /** Anahtarı çözer; çözemezse null (çağıran taraf fail closed davranır). */
  resolve(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<ProviderCredentials | null>;
  /** Anahtar TANIMLI MI — panel durumu için, mümkünse şifre çözmeden. */
  has(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<boolean>;
}

function supports(resolver: CarbonCredentialResolver, environment: string) {
  return resolver.supportedEnvironments.includes(environment);
}

export class EnvCarbonCredentialResolver implements CarbonCredentialResolver {
  readonly name = 'env';
  readonly supportedEnvironments = ['sandbox'] as const;

  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  resolve(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<ProviderCredentials | null> {
    if (!supports(this, environment) || !isValidSecretRef(authorizationRef)) {
      return Promise.resolve(null);
    }
    const apiKey = this.env[carbonEnvVarNameForRef(authorizationRef as string)];
    return Promise.resolve(apiKey?.trim() ? { apiKey: apiKey.trim() } : null);
  }

  async has(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<boolean> {
    return (await this.resolve(authorizationRef, environment)) !== null;
  }
}

/** supabase-js istemcisinin burada kullanılan alt kümesi. */
export interface VaultRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export class VaultCarbonCredentialResolver implements CarbonCredentialResolver {
  readonly name = 'supabase-vault';
  readonly supportedEnvironments = ['sandbox', 'production'] as const;

  constructor(private readonly db: VaultRpcClient) {}

  async resolve(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<ProviderCredentials | null> {
    if (!supports(this, environment) || !isValidSecretRef(authorizationRef)) {
      return null;
    }
    // Hata (ör. migration 0016 uygulanmamış) -> null; değer/hata detayı loglanmaz.
    const { data, error } = await this.db.rpc('carbon_provider_secret_get', {
      p_ref: authorizationRef,
    });
    if (error || typeof data !== 'string' || !data.trim()) return null;
    return { apiKey: data.trim() };
  }

  async has(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<boolean> {
    if (!supports(this, environment) || !isValidSecretRef(authorizationRef)) {
      return false;
    }
    const { data, error } = await this.db.rpc('carbon_provider_secret_exists', {
      p_ref: authorizationRef,
    });
    return !error && data === true;
  }
}

/** Sırayla dener: ilk çözebilen kazanır. */
export class LayeredCarbonCredentialResolver implements CarbonCredentialResolver {
  readonly name: string;
  readonly supportedEnvironments: readonly string[];

  constructor(private readonly layers: CarbonCredentialResolver[]) {
    this.name = layers.map((layer) => layer.name).join('+');
    this.supportedEnvironments = [
      ...new Set(layers.flatMap((layer) => [...layer.supportedEnvironments])),
    ];
  }

  async resolve(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<ProviderCredentials | null> {
    for (const layer of this.layers) {
      const credentials = await layer.resolve(authorizationRef, environment);
      if (credentials) return credentials;
    }
    return null;
  }

  async has(
    authorizationRef: string | undefined,
    environment: string,
  ): Promise<boolean> {
    for (const layer of this.layers) {
      if (await layer.has(authorizationRef, environment)) return true;
    }
    return false;
  }
}
