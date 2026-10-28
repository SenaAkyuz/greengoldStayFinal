/**
 * `hotel_integrations.secret_ref` (opak referans) -> gerçek paylaşılan secret.
 *
 * Production secrets manager = Supabase Vault (migration 0017,
 * `integration_secret_get`): secret veritabanında şifreli durur, yalnızca
 * service_role çağırabilir. Vault istemcisi verilmeyen yerde production
 * FAIL-CLOSED kalır (UnavailableProductionSecretResolver).
 *
 * Env yaklaşımının neden production çözümü OLMADIĞI:
 *   - secret_ref bazlı per-hotel rotasyon/erişim denetimi/audit sağlamaz,
 *   - otel sayısı arttıkça env değişkeni yönetimi ölçeklenmez,
 *   - secret'ı okuyan her process tüm otellerin secret'ını görebilir.
 */

/** Rotasyon overlap'i dahil, bir entegrasyonun secret referans durumu. */
export interface IntegrationSecretRefs {
  secretRef: string;
  /** Rotasyon overlap penceresindeki ESKİ referans (yoksa null). */
  previousSecretRef?: string | null;
  /** Eski referansın kabul edilmeyi bırakacağı an (ISO). */
  previousSecretExpiresAt?: string | null;
}

export interface ResolvedSecrets {
  /** Doğrulamada denenecek secret'lar — sırayla (önce güncel). */
  candidates: string[];
  /** Overlap penceresi aktif mi (audit/log için; secret DEĞERİ asla loglanmaz). */
  previousAccepted: boolean;
}

export interface SecretResolver {
  /** Bu resolver'ın adı — loglarda/operatör çıktısında görünür (secret değeri ASLA). */
  readonly name: string;
  /** Bu resolver hangi environment'lar için MEŞRU bir çözümdür. */
  readonly supportedEnvironments: readonly string[];
  /**
   * Referansları gerçek secret'lara çözer. Çözemezse boş candidates döner —
   * çağıran taraf bunu "imza doğrulanamaz" olarak ele almalıdır (fail closed).
   */
  resolve(refs: IntegrationSecretRefs): Promise<ResolvedSecrets>;
}

const ENV_PREFIX = 'INTEGRATION_SECRET_';

/**
 * Env değişkeni adı olarak GÜVENLİ referans formatı: büyük harfle başlar,
 * yalnızca büyük harf/rakam/alt çizgi. Tire ve küçük harf REDDEDİLİR —
 * `INTEGRATION_SECRET_hotel-a-ref` birçok kabukta geçerli bir değişken adı
 * değildir (bkz. migration 0014, aynı kısıt DB tarafında da uygulanır).
 */
export const SECRET_REF_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

export function isValidSecretRef(ref: unknown): boolean {
  return typeof ref === 'string' && SECRET_REF_RE.test(ref);
}

/** secret_ref -> saklanması gereken env değişkeni adı (operatör çıktısı için). */
export function envVarNameForRef(ref: string): string {
  return `${ENV_PREFIX}${ref}`;
}

/**
 * LOCAL/SANDBOX resolver — secret'ı process.env'den okur.
 * Production için MEŞRU DEĞİLDİR (supportedEnvironments'a 'production' dahil
 * edilmemiştir); aktivasyon kapısı bunu kontrol eder.
 */
export class EnvSecretResolver implements SecretResolver {
  readonly name = 'env';
  readonly supportedEnvironments = ['sandbox'] as const;

  resolve(refs: IntegrationSecretRefs): Promise<ResolvedSecrets> {
    const candidates: string[] = [];

    if (isValidSecretRef(refs.secretRef)) {
      const current = process.env[envVarNameForRef(refs.secretRef)];
      if (current) candidates.push(current);
    }

    // Rotasyon overlap'i: eski secret YALNIZCA süresi dolmadıysa kabul edilir.
    let previousAccepted = false;
    if (
      refs.previousSecretRef &&
      isValidSecretRef(refs.previousSecretRef) &&
      refs.previousSecretExpiresAt &&
      Date.parse(refs.previousSecretExpiresAt) > Date.now()
    ) {
      const previous = process.env[envVarNameForRef(refs.previousSecretRef)];
      if (previous) {
        candidates.push(previous);
        previousAccepted = true;
      }
    }

    return Promise.resolve({ candidates, previousAccepted });
  }
}

/** supabase-js istemcisinin burada kullanılan alt kümesi. */
export interface IntegrationVaultClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * PRODUCTION (ve sandbox) resolver — Supabase Vault (migration 0017).
 * Hata (ör. migration uygulanmamış) -> aday yok -> fail closed. Değer ve
 * hata ayrıntısı loglanmaz.
 */
export class VaultIntegrationSecretResolver implements SecretResolver {
  readonly name = 'supabase-vault';
  readonly supportedEnvironments = ['sandbox', 'production'] as const;

  constructor(private readonly db: IntegrationVaultClient) {}

  private async get(ref: string): Promise<string | null> {
    if (!isValidSecretRef(ref)) return null;
    const { data, error } = await this.db.rpc('integration_secret_get', {
      p_ref: ref,
    });
    if (error || typeof data !== 'string' || !data.trim()) return null;
    return data.trim();
  }

  async resolve(refs: IntegrationSecretRefs): Promise<ResolvedSecrets> {
    const candidates: string[] = [];
    const current = await this.get(refs.secretRef);
    if (current) candidates.push(current);

    let previousAccepted = false;
    if (
      refs.previousSecretRef &&
      refs.previousSecretExpiresAt &&
      Date.parse(refs.previousSecretExpiresAt) > Date.now()
    ) {
      const previous = await this.get(refs.previousSecretRef);
      if (previous) {
        candidates.push(previous);
        previousAccepted = true;
      }
    }
    return { candidates, previousAccepted };
  }
}

/**
 * PRODUCTION resolver — BİLİNÇLİ OLARAK UYGULANMAMIŞ (fail closed).
 *
 * Gerçek bir secrets manager entegre edilene kadar production entegrasyonlar
 * secret çözemez: webhook imzası doğrulanamaz (401) ve aktivasyon reddedilir.
 * Bu sınıfı "geçici olarak" env'e düşürmek YASAKTIR — o, production secret'ını
 * env'e koymayı normalleştirir ve bu dosyanın var oluş sebebini ortadan kaldırır.
 */
export class UnavailableProductionSecretResolver implements SecretResolver {
  readonly name = 'unavailable_production';
  readonly supportedEnvironments = [] as const;

  resolve(_refs: IntegrationSecretRefs): Promise<ResolvedSecrets> {
    return Promise.resolve({ candidates: [], previousAccepted: false });
  }
}

/**
 * Environment'a göre resolver seçer. Sandbox env'den okur (değişmedi).
 * Production yalnızca Vault istemcisi verilirse Vault'tan okur; verilmezse
 * fail-closed resolver döner. Çağıran taraf ayrıca `isResolverAllowedFor`
 * ile kapıyı kontrol etmelidir (ör. activate-integration).
 */
export function resolverForEnvironment(
  environment: string,
  vault?: IntegrationVaultClient,
): SecretResolver {
  if (environment === 'sandbox') return new EnvSecretResolver();
  if (environment === 'production' && vault) {
    return new VaultIntegrationSecretResolver(vault);
  }
  return new UnavailableProductionSecretResolver();
}

/** Bu resolver bu environment için MEŞRU mu (aktivasyon kapısı bunu sorar). */
export function isResolverAllowedFor(
  resolver: SecretResolver,
  environment: string,
): boolean {
  return resolver.supportedEnvironments.includes(environment);
}
