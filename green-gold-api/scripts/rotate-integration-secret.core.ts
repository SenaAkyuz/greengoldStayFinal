/**
 * `rotate-integration-secret` operatör script'inin SAF çekirdeği.
 *
 * NEDEN İKİ AŞAMA (inceleme bulgusu #3): tek `secret_ref` kolonuyla
 * zero-downtime rotasyon MÜMKÜN DEĞİLDİR — secret'ı tek adımda değiştirirsek,
 * sağlayıcı kendi tarafını güncelleyene kadar gelen her webhook imza
 * doğrulamasından geçemez. Bu yüzden migration 0014 `previous_secret_ref` +
 * `previous_secret_expires_at` ekler ve rotasyon iki aşamada yapılır:
 *
 *   begin    : yeni ref primary olur, eski ref overlap penceresine taşınır.
 *              Pencere boyunca İKİ secret de kabul edilir.
 *   complete : eski ref temizlenir; artık yalnızca yeni secret kabul edilir.
 *              `secret_last_rotated_at` YALNIZCA BURADA set edilir.
 *
 * `secret_last_rotated_at`in yalnızca 'complete'te set edilmesi bilinçlidir:
 * yarım kalmış (begin yapılmış ama complete edilmemiş) bir rotasyon,
 * tamamlanmış gibi GÖRÜNMEMELİDİR.
 *
 * Bu çekirdek GERÇEK SECRET DEĞERİNİ ASLA görmez — yalnızca referanslarla
 * çalışır.
 */

import { isValidSecretRef } from '../src/integrations/secret-resolver';

export const DEFAULT_OVERLAP_MINUTES = 60;
const MAX_OVERLAP_MINUTES = 24 * 60;

export interface RotationRecord {
  id: string;
  provider: string;
  environment: string;
  status: string;
  secretRef: string;
  previousSecretRef: string | null;
  previousSecretExpiresAt: string | null;
}

export interface RotateSecretDeps {
  getIntegration(id: string): Promise<RotationRecord | null>;
  /** Secret DEĞERİ dönmez — yalnızca "bu ref çözülebiliyor mu". */
  canResolveRef(record: RotationRecord, ref: string): boolean;
  applyBegin(
    id: string,
    patch: {
      secret_ref: string;
      previous_secret_ref: string;
      previous_secret_expires_at: string;
    },
  ): Promise<void>;
  applyComplete(
    id: string,
    patch: {
      previous_secret_ref: null;
      previous_secret_expires_at: null;
      secret_last_rotated_at: string;
    },
  ): Promise<void>;
}

export interface RotationPlan {
  phase: 'begin' | 'complete';
  integrationId: string;
  currentRef: string;
  newRef?: string;
  overlapUntil?: string;
  warnings: string[];
}

export function validateOverlapMinutes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_OVERLAP_MINUTES;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_OVERLAP_MINUTES) {
    throw new Error(
      `--overlap-minutes 1..${MAX_OVERLAP_MINUTES} arası tam sayı olmalı.`,
    );
  }
  return n;
}

/**
 * Faz 1 — rotasyonu başlat. Yeni ref primary olur, eski ref overlap
 * penceresine taşınır.
 */
export async function beginRotation(
  integrationId: string,
  newRef: string,
  deps: RotateSecretDeps,
  opts: { dryRun?: boolean; overlapMinutes?: number; now?: Date } = {},
): Promise<RotationPlan> {
  if (!integrationId?.trim()) {
    throw new Error('Entegrasyon id gerekli (--integration-id).');
  }
  if (!isValidSecretRef(newRef)) {
    throw new Error(
      '--new-secret-ref yalnızca BÜYÜK harf, rakam ve alt çizgi içerebilir ve harfle başlamalı.',
    );
  }

  const record = await deps.getIntegration(integrationId.trim());
  if (!record) throw new Error('Entegrasyon bulunamadı.');

  if (record.secretRef === newRef) {
    throw new Error(
      '--new-secret-ref mevcut secret_ref ile AYNI — rotasyon anlamsız.',
    );
  }

  if (record.previousSecretRef) {
    throw new Error(
      `Zaten devam eden bir rotasyon var (previous_secret_ref=${record.previousSecretRef}, ` +
        `bitiş=${record.previousSecretExpiresAt}). Önce 'complete' ile tamamlayın.`,
    );
  }

  // Yeni secret KAYDEDİLMEDEN rotasyona başlamak, overlap penceresi dolduğunda
  // entegrasyonu tamamen kırar. Bu yüzden önden doğrulanır.
  if (!deps.canResolveRef(record, newRef)) {
    throw new Error(
      `Yeni secret referansı çözülemiyor (${newRef}). ` +
        'Rotasyona başlamadan ÖNCE yeni secret değerini kaydedin.',
    );
  }

  const overlapMinutes = opts.overlapMinutes ?? DEFAULT_OVERLAP_MINUTES;
  const now = opts.now ?? new Date();
  const overlapUntil = new Date(
    now.getTime() + overlapMinutes * 60_000,
  ).toISOString();

  const warnings: string[] = [];
  if (record.status !== 'active') {
    warnings.push(
      `Entegrasyon '${record.status}' durumunda — rotasyon yine de kaydedilir.`,
    );
  }

  if (!opts.dryRun) {
    await deps.applyBegin(record.id, {
      secret_ref: newRef,
      previous_secret_ref: record.secretRef,
      previous_secret_expires_at: overlapUntil,
    });
  }

  return {
    phase: 'begin',
    integrationId: record.id,
    currentRef: record.secretRef,
    newRef,
    overlapUntil,
    warnings,
  };
}

/**
 * Faz 2 — rotasyonu tamamla. Eski ref temizlenir ve `secret_last_rotated_at`
 * YALNIZCA burada set edilir.
 */
export async function completeRotation(
  integrationId: string,
  deps: RotateSecretDeps,
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<RotationPlan> {
  if (!integrationId?.trim()) {
    throw new Error('Entegrasyon id gerekli (--integration-id).');
  }

  const record = await deps.getIntegration(integrationId.trim());
  if (!record) throw new Error('Entegrasyon bulunamadı.');

  if (!record.previousSecretRef) {
    throw new Error("Devam eden bir rotasyon yok — önce 'begin' ile başlatın.");
  }

  // Tamamlamadan önce YENİ secret gerçekten çözülebiliyor olmalı; aksi halde
  // eski secret'ı silmek entegrasyonu tamamen kırardı.
  if (!deps.canResolveRef(record, record.secretRef)) {
    throw new Error(
      `Yeni secret referansı çözülemiyor (${record.secretRef}). ` +
        'Tamamlama REDDEDİLDİ — aksi halde entegrasyon tamamen kırılırdı.',
    );
  }

  const now = opts.now ?? new Date();
  const warnings: string[] = [];
  if (
    record.previousSecretExpiresAt &&
    Date.parse(record.previousSecretExpiresAt) < now.getTime()
  ) {
    warnings.push(
      'Overlap penceresi zaten dolmuştu — eski secret bir süredir reddediliyordu.',
    );
  }

  if (!opts.dryRun) {
    await deps.applyComplete(record.id, {
      previous_secret_ref: null,
      previous_secret_expires_at: null,
      // Rotasyon zaman damgası YALNIZCA gerçek tamamlanmada set edilir.
      secret_last_rotated_at: now.toISOString(),
    });
  }

  return {
    phase: 'complete',
    integrationId: record.id,
    currentRef: record.secretRef,
    warnings,
  };
}
