/**
 * Bir ayın (raporlama döneminin) durumu — YALNIZCA kendi veritabanımızdaki
 * bilgilerden türetilir (doluluk, yerel kayıt durumları, ölçümler).
 * Sağlayıcıya bağlı durumlar (ör. 3pmetrics'te onay bekliyor) burada
 * uydurulmaz; onlar dönem hesabında (`calculatePeriod`) ortaya çıkar.
 */

export type PeriodLifecycle =
  | 'future' // ay başlamadı
  | 'in_progress' // ay sürüyor (gönderim/hesap yapılamaz)
  | 'empty' // tamamlanmış ay, hiçbir bilgi yok
  | 'draft' // doluluk girildi ya da kayıt var ama gönderilmiş kabul yok
  | 'submitted' // en az bir kayıt 3pmetrics'e kabul edildi
  | 'calculated' // ölçüm kaydedildi (yayında değil)
  | 'published'; // bu dönemin ölçümü widget fiyatında aktif

export type LocalRecordStatus =
  'sending' | 'accepted' | 'rejected' | 'outcome_unknown';

export interface PeriodFacts {
  period: string; // YYYY-AA
  today: string; // YYYY-AA-GG (UTC; dönem kontrolüyle aynı)
  occupiedRoomNights: number | null;
  recordStatuses: LocalRecordStatus[];
  measurement: { isActive: boolean } | null;
}

export interface PeriodSummary {
  status: PeriodLifecycle;
  /** Kullanıcı işlemi gereken kayıt var mı (reddedildi / sonucu belirsiz / takılı). */
  needs_attention: boolean;
  records: Record<LocalRecordStatus, number>;
}

export function summarizePeriod(f: PeriodFacts): PeriodSummary {
  const records: Record<LocalRecordStatus, number> = {
    sending: 0,
    accepted: 0,
    rejected: 0,
    outcome_unknown: 0,
  };
  for (const s of f.recordStatuses) {
    if (s in records) records[s] += 1;
  }
  const needs_attention =
    records.rejected + records.outcome_unknown + records.sending > 0;

  const currentMonth = f.today.slice(0, 7);
  let status: PeriodLifecycle;
  if (f.period > currentMonth) status = 'future';
  else if (f.period === currentMonth) status = 'in_progress';
  else if (f.measurement?.isActive) status = 'published';
  else if (f.measurement) status = 'calculated';
  else if (records.accepted > 0) status = 'submitted';
  else if (f.occupiedRoomNights !== null || f.recordStatuses.length > 0)
    status = 'draft';
  else status = 'empty';

  return { status, needs_attention, records };
}
