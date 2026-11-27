/**
 * Entegrasyon ekranının saf mantığı (UX-6.x): yalnız GERÇEK sinyallerden
 * kurulum adımları. Ölçülemeyen adım (ör. "kod kopyalandı") listelenmez.
 */
import type { HotelInfo } from '../api';

export type SetupState = 'done' | 'pending' | 'unknown';

export interface SetupStep {
  key: string;
  label: string;
  state: SetupState;
  status: string;
}

/** Widget betik adresi gerçek bir https adresi mi (yer tutucu değil)? */
export function isWidgetSrcValid(src: string): boolean {
  if (!src || src.includes('<panel-domain>')) return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function widgetSetupSteps(args: {
  hotel: HotelInfo;
  widgetSrcValid: boolean;
  /** Son 30 günde görüntülenme: true/false; okunamadıysa null. */
  recentViews: boolean | null;
}): SetupStep[] {
  const { hotel, widgetSrcValid, recentViews } = args;
  const origins = hotel.allowed_origins.length;
  return [
    {
      key: 'src',
      label: 'Betik adresi',
      state: widgetSrcValid ? 'done' : 'pending',
      status: widgetSrcValid ? 'Yapılandırıldı' : 'Yapılandırılmadı',
    },
    {
      key: 'origins',
      label: 'İzinli domain',
      state: origins > 0 ? 'done' : 'pending',
      status: origins > 0 ? `${origins} domain` : 'Eklenmedi',
    },
    {
      key: 'active',
      label: 'Otel etkin',
      state: hotel.status === 'active' ? 'done' : 'pending',
      status: hotel.status === 'active' ? 'Aktif' : 'Beklemede',
    },
    {
      key: 'views',
      label: 'İlk görüntülenme',
      state: recentViews === null ? 'unknown' : recentViews ? 'done' : 'pending',
      status: recentViews === null ? 'Kontrol edilemedi' : recentViews ? 'Son 30 günde var' : 'Son 30 günde yok',
    },
  ];
}
