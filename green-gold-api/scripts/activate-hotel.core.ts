/**
 * Otel aktivasyonu operatör script'inin SAF çekirdeği — birim test edilir.
 *
 * Otel 'pending' oluşturulur; domain(ler) allowed_origins'e eklendikten SONRA
 * bu script status'ü 'active' yapar. En az bir GEÇERLİ allowed_origin yoksa
 * aktivasyonu REDDEDER (widget izinsiz domain'de çalışmasın).
 */

/** Geçerli origin: http/https, host var, yol/query/fragment YOK. */
export function isValidOrigin(o: unknown): boolean {
  if (typeof o !== 'string' || !o.trim()) return false;
  try {
    const u = new URL(o.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.pathname !== '/' || u.search || u.hash) return false;
    // "https://x.com" ↔ URL "https://x.com/" — sondaki '/' farkını normalize et.
    return (
      u.href.replace(/\/$/, '').toLowerCase() ===
      o.trim().replace(/\/$/, '').toLowerCase()
    );
  } catch {
    return false;
  }
}

export function hasValidOrigin(
  origins: string[] | null | undefined,
): boolean {
  return Array.isArray(origins) && origins.some(isValidOrigin);
}

export interface ActivateHotelDeps {
  getHotelByKey(key: string): Promise<{
    id: string;
    name: string;
    status: string;
    allowed_origins: string[] | null;
  } | null>;
  setStatus(id: string, status: string): Promise<void>;
}

export interface ActivateResult {
  id: string;
  name: string;
  alreadyActive: boolean;
  changed: boolean;
}

export async function runActivateHotel(
  key: string,
  deps: ActivateHotelDeps,
  opts: { dryRun?: boolean } = {},
): Promise<ActivateResult> {
  if (!key || !key.trim()) {
    throw new Error('Otel anahtarı gerekli (--key).');
  }

  const hotel = await deps.getHotelByKey(key.trim());
  if (!hotel) {
    throw new Error('Otel bulunamadı (verilen --key ile eşleşme yok).');
  }

  if (!hasValidOrigin(hotel.allowed_origins)) {
    throw new Error(
      'Aktivasyon reddedildi: en az bir geçerli allowed_origin gerekli. ' +
        "Önce panelde Ayarlar'dan otelin domain'ini ekleyin.",
    );
  }

  if (hotel.status === 'active') {
    return { id: hotel.id, name: hotel.name, alreadyActive: true, changed: false };
  }

  if (!opts.dryRun) {
    await deps.setStatus(hotel.id, 'active');
  }

  return {
    id: hotel.id,
    name: hotel.name,
    alreadyActive: false,
    changed: !opts.dryRun,
  };
}
