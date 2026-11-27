import { createHash } from 'node:crypto';
import type { ApprovedRecord } from './connecthub.client';
import { normalizeUom } from './factor-calculation';

/**
 * Ölçüm SÜRÜM anahtarı (carbon_measurements.external_version).
 *
 * Aynı girdiler → aynı anahtar → yeni satır açılmaz (mevcut ölçüm kullanılır).
 *
 * UX-3.11 / KD-4: İlk sürüm anahtarı sağlayıcının kayıt kimliğini (`record_id`)
 * ve ham birim yazımını içeriyordu. Tüketim yeniden gönderilip onaylandığında
 * sağlayıcı kaydın kimliğini yenilerse ya da birimi farklı yazarsa (m3 / m³)
 * hesap AYNI olsa da yeni sürüm açılıyordu. Anlamsal anahtar yalnız hesabı
 * belirleyen girdileri kullanır: kalem, dönem, miktar, normalize birim,
 * faktör paketi içeriği ve dağıtım girdisi. Sağlayıcı kayıt kimlikleri
 * DENETİM için ölçümün form_data.calculation.lines alanında saklanmaya devam
 * eder; geçmiş satırlara dokunulmaz.
 *
 * Geçiş: eski anahtarla kaydedilmiş bir ölçüm de "aynı sürüm" sayılır
 * (`legacyMeasurementVersion`), böylece kural değişikliği tek başına yeni
 * sürüm üretmez.
 */
export function measurementVersion(
  approved: Pick<ApprovedRecord, 'item' | 'period' | 'quantity' | 'uom'>[],
  contentHash: string,
  allocation: Record<string, unknown>,
): string {
  const records = approved
    .map(
      (r) =>
        [r.item, r.period, Number(r.quantity), normalizeUom(r.uom)] as const,
    )
    .sort((a, b) =>
      a[0] !== b[0]
        ? a[0].localeCompare(b[0])
        : a[1] !== b[1]
          ? a[1].localeCompare(b[1])
          : a[2] - b[2],
    );
  return digest({
    v: 2,
    records,
    content_hash: contentHash,
    allocation: { ...allocation },
  });
}

/** İlk sürüm anahtarı (değiştirilmedi; yalnız eski satırları tanımak için). */
export function legacyMeasurementVersion(
  approved: Pick<
    ApprovedRecord,
    'record_id' | 'item' | 'period' | 'quantity' | 'uom'
  >[],
  contentHash: string,
  allocation: Record<string, unknown>,
): string {
  return digest({
    records: [...approved]
      .sort((a, b) => a.record_id.localeCompare(b.record_id))
      .map((r) => [r.record_id, r.item, r.period, r.quantity, r.uom]),
    content_hash: contentHash,
    allocation: { ...allocation },
  });
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}
