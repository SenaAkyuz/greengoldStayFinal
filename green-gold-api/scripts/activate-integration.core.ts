/**
 * `activate-integration` operatör script'inin SAF çekirdeği — birim test edilir.
 *
 * Otelin `active` olması entegrasyonun otomatik `active` olması ANLAMINA
 * GELMEZ (inceleme bulgusu #4). Entegrasyon ayrı bir güvenlik kapısıdır ve
 * aşağıdaki kapıların HEPSİ geçilmeden `active` yapılamaz:
 *
 *   1. Provider adapter'ı `configured` olmalı (SynXis 'not_configured' iken ASLA)
 *   2. Secret ÇÖZÜLEBİLİR olmalı (fail closed)
 *   3. Secret resolver bu environment için MEŞRU olmalı
 *      -> production + env resolver = RED (gerçek secrets manager yok)
 *   4. external_property_id ve product_code dolu olmalı
 *   5. Sandbox'ta en az bir doğrulama eventi BAŞARIYLA işlenmiş olmalı
 *      (veya açık `--override-verification` politikası ile geçilmeli)
 */

export interface IntegrationRecord {
  id: string;
  hotelId: string;
  hotelName: string;
  provider: string;
  environment: string;
  status: string;
  externalPropertyId: string | null;
  productCode: string | null;
  secretRef: string;
  previousSecretRef: string | null;
  previousSecretExpiresAt: string | null;
}

export interface ActivateIntegrationDeps {
  getIntegration(id: string): Promise<IntegrationRecord | null>;
  /** Adapter registry'den: bu provider gerçekten yapılandırılmış mı? */
  isProviderConfigured(provider: string): boolean;
  /** Secret referansı gerçek bir secret'a çözülebiliyor mu (DEĞERİ dönmez!). */
  canResolveSecret(record: IntegrationRecord): boolean;
  /** Bu environment için secret resolver meşru mu (production -> false). */
  isResolverAllowed(environment: string): boolean;
  /** Bu entegrasyon için başarıyla işlenmiş ('processed') delivery var mı? */
  hasProcessedDelivery(integrationId: string): Promise<boolean>;
  setStatus(id: string, status: string): Promise<void>;
}

export interface ActivationGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ActivateIntegrationResult {
  integration: IntegrationRecord;
  gates: ActivationGate[];
  alreadyActive: boolean;
  activated: boolean;
}

export interface ActivateOptions {
  dryRun?: boolean;
  /**
   * Sandbox doğrulama eventi kapısını AÇIKÇA atlar. Diğer kapılar (adapter,
   * secret, environment) ASLA atlanamaz — onlar güvenlik sınırıdır.
   */
  overrideVerification?: boolean;
}

export function evaluateGates(
  record: IntegrationRecord,
  deps: ActivateIntegrationDeps,
  hasDelivery: boolean,
  opts: ActivateOptions = {},
): ActivationGate[] {
  const adapterConfigured = deps.isProviderConfigured(record.provider);
  const resolverAllowed = deps.isResolverAllowed(record.environment);
  const secretResolvable = deps.canResolveSecret(record);
  const fieldsPresent = !!(
    record.externalPropertyId?.trim() && record.productCode?.trim()
  );
  const verificationOk = hasDelivery || opts.overrideVerification === true;

  return [
    {
      name: 'adapter_configured',
      passed: adapterConfigured,
      detail: adapterConfigured
        ? `${record.provider} adapter'ı yapılandırılmış.`
        : `${record.provider} adapter'ı 'not_configured' — dokümantasyon/sandbox/credential bekleniyor.`,
    },
    {
      name: 'resolver_allowed_for_environment',
      passed: resolverAllowed,
      detail: resolverAllowed
        ? `${record.environment} için secret resolver meşru.`
        : `${record.environment} için MEŞRU BİR SECRET RESOLVER YOK. ` +
          'Env tabanlı çözüm yalnızca sandbox içindir; production gerçek bir secrets manager gerektirir.',
    },
    {
      name: 'secret_resolvable',
      passed: secretResolvable,
      detail: secretResolvable
        ? 'Secret referansı çözülebiliyor.'
        : `Secret çözülemedi (ref: ${record.secretRef}). Değer kaydedilmemiş olabilir.`,
    },
    {
      name: 'property_and_product_present',
      passed: fieldsPresent,
      detail: fieldsPresent
        ? 'external_property_id ve product_code dolu.'
        : 'external_property_id ve/veya product_code eksik.',
    },
    {
      name: 'verification_delivery',
      passed: verificationOk,
      detail: hasDelivery
        ? 'En az bir doğrulama eventi başarıyla işlenmiş.'
        : opts.overrideVerification
          ? '⚠️ Doğrulama eventi YOK — --override-verification ile AÇIKÇA atlandı.'
          : 'Henüz başarıyla işlenmiş bir doğrulama eventi yok. ' +
            "Sandbox'tan imzalı bir test eventi gönderin veya --override-verification kullanın.",
    },
  ];
}

export async function runActivateIntegration(
  integrationId: string,
  deps: ActivateIntegrationDeps,
  opts: ActivateOptions = {},
): Promise<ActivateIntegrationResult> {
  if (!integrationId || !integrationId.trim()) {
    throw new Error('Entegrasyon id gerekli (--integration-id).');
  }

  const record = await deps.getIntegration(integrationId.trim());
  if (!record) {
    throw new Error('Entegrasyon bulunamadı.');
  }

  if (record.status === 'active') {
    return {
      integration: record,
      gates: [],
      alreadyActive: true,
      activated: false,
    };
  }

  const hasDelivery = await deps.hasProcessedDelivery(record.id);
  const gates = evaluateGates(record, deps, hasDelivery, opts);
  const failed = gates.filter((g) => !g.passed);

  if (failed.length > 0) {
    const reasons = failed.map((g) => `  - [${g.name}] ${g.detail}`).join('\n');
    throw new Error(`Aktivasyon REDDEDİLDİ:\n${reasons}`);
  }

  if (!opts.dryRun) {
    await deps.setStatus(record.id, 'active');
  }

  return {
    integration: record,
    gates,
    alreadyActive: false,
    activated: !opts.dryRun,
  };
}
