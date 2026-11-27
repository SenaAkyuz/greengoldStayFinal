/**
 * Genel bakış ekranının saf mantığı — yalnız GERÇEK API verisinden türetir.
 * Ölçülemeyen bir madde (ör. "embed kodu kopyalandı") listeye girmez.
 */
import type { DashboardReport, HotelInfo, IntegrationHealthItem } from '../api';
import type { ConnectHubStatus, PeriodList } from '../connecthub/types';
import { lastCompletedPeriod } from '../connecthub/logic';
import { formatPeriod } from '../carbon-ui/status';
import type { UiTone } from '../carbon-ui/status';

export interface OverviewLinks {
  guestPreview: string;
  funnel: string;
  carbon: string;
  payments: string;
  integration: string;
  profile: string;
  /** Karbon ölçümü dönem listesi. */
  measurement: string;
  /** Karbon ölçümü dönem sayfası adresi. */
  period: (period: string) => string;
}

export const LIVE_LINKS: OverviewLinks = {
  guestPreview: '/misafir-onizleme',
  funnel: '/funnel',
  carbon: '/karbon',
  payments: '/tahsilatlar',
  integration: '/entegrasyon',
  profile: '/tesis-profili',
  measurement: '/karbon-olcumu',
  period: (p) => `/karbon-olcumu/${p}`,
};

export interface NextAction {
  key: string;
  label: string;
  href: string;
  status?: { tone: UiTone; label: string };
}

/**
 * Sıradaki işlemler — yalnız gerçek veriden: domain, profil, dönem kayıtları
 * (işlem bekleyen kayıtlar ve verisi eksik son tamamlanmış ay).
 */
export function overviewNextActions(args: {
  hotel: HotelInfo | null;
  carbon: ConnectHubStatus | null;
  links: OverviewLinks;
  /** Son tamamlanmış ayın yılına ait dönem listesi (okunamadıysa null). */
  periods?: PeriodList | null;
  now?: Date;
}): NextAction[] {
  const { hotel, carbon, links } = args;
  const out: NextAction[] = [];
  const periods = carbon?.schema_ready && args.periods?.schema_ready ? args.periods.periods : [];
  for (const e of periods.filter((p) => p.needs_attention)) {
    out.push({
      key: `attn-${e.period}`,
      label: `${formatPeriod(e.period)}: kontrol gereken kayıt`,
      href: links.period(e.period),
      status: { tone: 'danger', label: 'Kontrol' },
    });
  }
  const last = lastCompletedPeriod(args.now ?? new Date());
  const lastEntry = periods.find((p) => p.period === last);
  if (carbon?.link && lastEntry && (lastEntry.status === 'empty' || lastEntry.status === 'draft')) {
    out.push({
      key: `last-${last}`,
      label: `${formatPeriod(last)} verilerini ${lastEntry.status === 'empty' ? 'girin' : 'tamamlayın'}`,
      href: links.period(last),
      status: { tone: 'warning', label: lastEntry.status === 'empty' ? 'Bekliyor' : 'Eksik' },
    });
  }
  if (hotel && hotel.allowed_origins.length === 0) {
    out.push({
      key: 'origin',
      label: 'İzinli domain ekleyin',
      href: links.integration,
      status: { tone: 'warning', label: 'Gerekli' },
    });
  }
  // Ölçüm altyapısı bu ortamda yoksa profil maddesi gösterilmez.
  if (carbon?.schema_ready) {
    out.push(
      carbon.profile
        ? { key: 'profile', label: 'Tesis profilini kontrol edin', href: links.profile }
        : {
            key: 'profile',
            label: 'Tesis profilini doldurun',
            href: links.profile,
            status: { tone: 'warning', label: 'Eksik' },
          },
    );
  }
  out.push({ key: 'guest', label: 'Misafir ekranını önizleyin', href: links.guestPreview });
  return out;
}

/** Hero başlığı: seçim yoksa "katkıyı seçiyor" iddiası kurulmaz. */
export function overviewHeadline(hotelName: string | null | undefined, report: DashboardReport | null): {
  lead: string;
  emphasis: string;
} {
  const name = hotelName?.trim() || 'Oteliniz';
  if (report && report.summary.selections > 0) {
    return { lead: `${name} misafirleri`, emphasis: 'katkıyı seçiyor.' };
  }
  if (report && report.summary.views > 0) {
    return { lead: `${name} misafir ekranı`, emphasis: 'görüntüleniyor.' };
  }
  return { lead: `${name} için`, emphasis: 'genel bakış.' };
}

const PROVIDERS: Record<string, string> = { hotelrunner: 'HotelRunner', synxis: 'SynXis' };

export function providerLabel(provider: string): string {
  return PROVIDERS[provider] ?? provider;
}

/** Entegrasyon durumu → rozet (yalnız `status` alanından; varsayım yok). */
export function integrationBadge(item: Pick<IntegrationHealthItem, 'status'>): { tone: UiTone; label: string } {
  return item.status === 'active'
    ? { tone: 'success', label: 'Etkin' }
    : { tone: 'warning', label: 'Kontrol gerekli' };
}

/** "2026-11-01" … "2026-11-26" → "1 – 26 Kasım 2026" (tr-TR). */
export function formatRange(period: { from: string; to: string } | null | undefined): string | null {
  if (!period) return null;
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const f = d(period.from);
  const t = d(period.to);
  if (!Number.isFinite(f.getTime()) || !Number.isFinite(t.getTime())) return null;
  const day = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (f.getUTCFullYear() === t.getUTCFullYear() && f.getUTCMonth() === t.getUTCMonth()) {
    return `${day.format(f)} – ${full.format(t)}`;
  }
  return `${full.format(f)} – ${full.format(t)}`;
}
