/**
 * `create-integration` operatör script'inin SAF çekirdeği — birim test edilir.
 *
 * NEDEN create-hotel'DEN AYRI (inceleme bulgusu #2): otel oluşturulurken
 * provider, external property ID ve product code ÇOĞUNLUKLA HENÜZ BİLİNMEZ;
 * ayrıca bir otelin birden fazla provider/environment entegrasyonu olabilir.
 * Bu yüzden `webhook_routing_id`/`secret_ref` create-hotel'e zorunlu alan
 * olarak EKLENMEZ — entegrasyon ayrı bir yaşam döngüsüdür.
 *
 * GÜVENLİK NOTLARI:
 *   - Bu çekirdek GERÇEK SECRET'I ASLA görmez/döndürmez/DB'ye yazmaz. Yalnızca
 *     `secret_ref` (opak referans) ile çalışır. Tek seferlik secret gösterimi
 *     varsa yalnızca CLI sunum sınırında yapılır (bkz. create-integration.ts).
 *   - `webhook_routing_id` DB tarafında `gen_random_uuid()` ile üretilir
 *     (kriptografik rastgele, tahmin edilemez). Routing ID bir AUTH DEĞİLDİR —
 *     yalnızca hangi entegrasyona ait olduğunu söyler; gerçek doğrulama imza
 *     ile yapılır.
 *   - Entegrasyon her zaman `pending` doğar; aktivasyon ayrı bir kapıdır
 *     (bkz. activate-integration.core.ts).
 */

import { isValidSecretRef } from '../src/integrations/secret-resolver';

/** Migration 0009'daki `provider` CHECK kısıtıyla BİREBİR aynı tutulmalı. */
export const ALLOWED_PROVIDERS = ['synxis', 'generic_signed_webhook'] as const;
export type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

export const ALLOWED_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type AllowedEnvironment = (typeof ALLOWED_ENVIRONMENTS)[number];

export interface RawIntegrationInput {
  hotelKey?: string;
  provider?: string;
  environment?: string;
  externalPropertyId?: string;
  productCode?: string;
  secretRef?: string;
}

export interface IntegrationInput {
  hotelKey: string;
  provider: AllowedProvider;
  environment: AllowedEnvironment;
  externalPropertyId: string;
  productCode: string;
  secretRef: string;
}

const MAX_ID_LEN = 200;

function requireField(value: string | undefined, flag: string): string {
  const v = (value ?? '').trim();
  if (!v) throw new Error(`${flag} zorunludur.`);
  if (v.length > MAX_ID_LEN) {
    throw new Error(`${flag} en fazla ${MAX_ID_LEN} karakter olabilir.`);
  }
  return v;
}

export function validateIntegrationInput(
  raw: RawIntegrationInput,
): IntegrationInput {
  const hotelKey = requireField(raw.hotelKey, '--hotel-key');

  const provider = (raw.provider ?? '').trim();
  if (!ALLOWED_PROVIDERS.includes(provider as AllowedProvider)) {
    throw new Error(
      `--provider şunlardan biri olmalı: ${ALLOWED_PROVIDERS.join(', ')}`,
    );
  }

  const environment = (raw.environment ?? 'sandbox').trim();
  if (!ALLOWED_ENVIRONMENTS.includes(environment as AllowedEnvironment)) {
    throw new Error(
      `--environment şunlardan biri olmalı: ${ALLOWED_ENVIRONMENTS.join(', ')}`,
    );
  }

  const externalPropertyId = requireField(
    raw.externalPropertyId,
    '--external-property-id',
  );
  const productCode = requireField(raw.productCode, '--product-code');
  const secretRef = requireField(raw.secretRef, '--secret-ref');

  if (!isValidSecretRef(secretRef)) {
    throw new Error(
      '--secret-ref yalnızca BÜYÜK harf, rakam ve alt çizgi içerebilir, ' +
        'harfle başlamalı (3-64 karakter). Örn: PRINCES_PALACE_SANDBOX. ' +
        'Bu bir env değişkeni adının parçası olacağı için tire/küçük harf kabul edilmez.',
    );
  }

  return {
    hotelKey,
    provider: provider as AllowedProvider,
    environment: environment as AllowedEnvironment,
    externalPropertyId,
    productCode,
    secretRef,
  };
}

export interface HotelRef {
  id: string;
  name: string;
  hotelCode: string;
}

export interface ExistingIntegration {
  id: string;
  provider: string;
  environment: string;
  externalPropertyId: string;
  status: string;
}

export interface CreateIntegrationDeps {
  /**
   * Oteli EXACT eşleşme ile bulur (public_widget_key VEYA hotel_code).
   * İsim/LIKE araması KULLANILMAZ — yanlış tenant'a entegrasyon açma riski.
   */
  findHotelByExactKey(key: string): Promise<HotelRef | null>;
  /** Bu otelin mevcut entegrasyonları (çakışma kontrolü için). */
  listIntegrationsForHotel(hotelId: string): Promise<ExistingIntegration[]>;
  insertIntegration(row: {
    hotel_id: string;
    provider: string;
    environment: string;
    external_property_id: string;
    product_code: string;
    secret_ref: string;
    status: string;
  }): Promise<{ id: string; webhook_routing_id: string }>;
}

export interface CreateIntegrationPlan {
  hotel: HotelRef;
  provider: AllowedProvider;
  environment: AllowedEnvironment;
  externalPropertyId: string;
  productCode: string;
  secretRef: string;
  status: 'pending';
  /** Bu provider adapter'ı henüz yapılandırılmadıysa aktive edilemez. */
  activationBlockedReason: string | null;
}

/**
 * Adapter'ı yapılandırılmamış sağlayıcılar. SynXis dokümanı/sandbox/credential
 * gelene kadar bu listede kalır — entegrasyon KAYDI oluşturulabilir (hazırlık
 * için) ama `active` YAPILAMAZ.
 */
export const UNCONFIGURED_PROVIDERS: readonly string[] = ['synxis'];

export function activationBlockedReasonFor(
  provider: string,
  environment: string,
): string | null {
  if (UNCONFIGURED_PROVIDERS.includes(provider)) {
    return `${provider} adapter'ı 'not_configured' — dokümantasyon/sandbox/credential gelene kadar aktive EDİLEMEZ.`;
  }
  if (environment === 'production') {
    return 'production ortamı için gerçek bir secrets manager YOK (env resolver production için meşru değil) — aktive EDİLEMEZ.';
  }
  return null;
}

function assertNoConflict(
  input: IntegrationInput,
  existing: ExistingIntegration[],
): void {
  // Migration 0009'daki unique index ile aynı kapsam:
  // (hotel_id, provider, environment, external_property_id)
  const clash = existing.find(
    (e) =>
      e.provider === input.provider &&
      e.environment === input.environment &&
      e.externalPropertyId === input.externalPropertyId,
  );
  if (clash) {
    throw new Error(
      `Bu otel için aynı kapsamda entegrasyon ZATEN VAR ` +
        `(provider=${input.provider}, environment=${input.environment}, ` +
        `property=${input.externalPropertyId}, status=${clash.status}). ` +
        'Yenisini oluşturmak yerine mevcut kaydı güncelleyin/aktive edin.',
    );
  }
}

export async function planCreateIntegration(
  input: IntegrationInput,
  deps: CreateIntegrationDeps,
): Promise<CreateIntegrationPlan> {
  const hotel = await deps.findHotelByExactKey(input.hotelKey);
  if (!hotel) {
    throw new Error(
      'Otel bulunamadı — --hotel-key public_widget_key veya hotel_code ile TAM eşleşmeli.',
    );
  }

  const existing = await deps.listIntegrationsForHotel(hotel.id);
  assertNoConflict(input, existing);

  return {
    hotel,
    provider: input.provider,
    environment: input.environment,
    externalPropertyId: input.externalPropertyId,
    productCode: input.productCode,
    secretRef: input.secretRef,
    status: 'pending',
    activationBlockedReason: activationBlockedReasonFor(
      input.provider,
      input.environment,
    ),
  };
}

export interface CreateIntegrationResult extends CreateIntegrationPlan {
  integrationId: string;
  webhookRoutingId: string;
}

export async function runCreateIntegration(
  input: IntegrationInput,
  deps: CreateIntegrationDeps,
): Promise<CreateIntegrationResult> {
  // Plan aşaması çakışmaları önden yakalar -> yarım kayıt oluşmaz.
  const plan = await planCreateIntegration(input, deps);

  const inserted = await deps.insertIntegration({
    hotel_id: plan.hotel.id,
    provider: plan.provider,
    environment: plan.environment,
    external_property_id: plan.externalPropertyId,
    product_code: plan.productCode,
    secret_ref: plan.secretRef,
    // Her zaman pending — aktivasyon AYRI bir kapıdır.
    status: 'pending',
  });

  return {
    ...plan,
    integrationId: inserted.id,
    webhookRoutingId: inserted.webhook_routing_id,
  };
}

/** Webhook URL'i YALNIZCA API public URL + provider + routing ID'den üretilir. */
export function webhookUrlFor(
  apiBaseUrl: string,
  provider: string,
  routingId: string,
): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/integrations/webhooks/${provider}/${routingId}`;
}
