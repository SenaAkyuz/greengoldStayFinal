/**
 * `hotel_integrations.secret_ref` (opak referans) -> gerçek paylaşılan secret.
 *
 * ⚠️ ÜRETİMDE GERÇEK BİR SECRETS MANAGER YOK. Bu dosya bir INTERFACE tanımlar
 * ve YALNIZCA local/sandbox için bir env implementasyonu sağlar. Production
 * ortamı için implementasyon YOKTUR ve bu bilinçli olarak FAIL-CLOSED
 * bırakılmıştır: production bir entegrasyon secret'ı çözemez, dolayısıyla
 * aktive edilemez ve webhook'ları doğrulanamaz. Bu bir eksiklik değil, açık
 * bir KAPIDIR — gerçek bir secrets manager (Vault / AWS Secrets Manager /
 * per-integration KMS vb.) entegre edilene kadar production akışı açılmamalıdır.
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
  resolve(refs: IntegrationSecretRefs): ResolvedSecrets;
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

  resolve(refs: IntegrationSecretRefs): ResolvedSecrets {
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

  resolve(_refs: IntegrationSecretRefs): ResolvedSecrets {
    return { candidates: [], previousAccepted: false };
  }
}

/**
 * Environment'a göre resolver seçer. 'production' için fail-closed resolver
 * döner — çağıran taraf ayrıca `isResolverAllowedFor` ile kapıyı kontrol
 * etmelidir (ör. activate-integration).
 */
export function resolverForEnvironment(environment: string): SecretResolver {
  return environment === 'sandbox'
    ? new EnvSecretResolver()
    : new UnavailableProductionSecretResolver();
}

/** Bu resolver bu environment için MEŞRU mu (aktivasyon kapısı bunu sorar). */
export function isResolverAllowedFor(
  resolver: SecretResolver,
  environment: string,
): boolean {
  return resolver.supportedEnvironments.includes(environment);
}
