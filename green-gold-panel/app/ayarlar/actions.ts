'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  updateHotel,
  previewCarbon,
  startCarbonMeasurement,
  type HotelCarbonInput,
  type HotelCarbonResult,
  type HotelUpdate,
} from '@/lib/api';

export type SettingsState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

/**
 * /ayarlar formunu kaydeder (Server Action). Token'ı @supabase/ssr server
 * client'tan alır, PATCH /dashboard/hotel'i Bearer ile çağırır. hotel_id ASLA
 * gönderilmez (backend token'dan çözer). Backend validation hatası kullanıcıya
 * aynen yansıtılır.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { status: 'error', message: 'Oturum bulunamadı, tekrar giriş yapın.' };
  }

  const str = (k: string) => (formData.get(k)?.toString() ?? '').trim();

  const patch: HotelUpdate = {
    name: str('name'),
    city: str('city'),
    timezone: str('timezone'),
    // Tüm origin'ler (boş liste = temizle). Doğrulama backend'de (400 yansıtılır).
    allowed_origins: formData
      .getAll('allowed_origins')
      .map((v) => v.toString().trim())
      .filter((v) => v !== ''),
  };
  if (str('carbon_mode') === 'hotel') {
    const raw = str('hotel_carbon');
    if (!raw) return { status: 'error', message: 'Kaydetmeden önce karbon hesabını tamamlayın.' };
    try { patch.hotel_carbon = JSON.parse(raw); } catch { return { status: 'error', message: 'Hesap bilgileri okunamadı.' }; }
  } else if (str('carbon_country')) {
    patch.carbon_country = str('carbon_country');
    patch.carbon_state = str('carbon_state');
    patch.carbon_hotel_class = str('carbon_hotel_class');
  }

  // Marka: boş -> null (temizle), dolu -> değer. Değer client'ta ön-doğrulanır;
  // asıl doğrulama backend'de (geçersiz -> 400 yansıtılır).
  const logo = str('logo_url');
  patch.logo_url = logo === '' ? null : logo;
  const color = str('brand_color');
  patch.brand_color = color === '' ? null : color;

  const { error } = await updateHotel(token, patch);
  if (error) {
    return { status: 'error', message: error };
  }

  revalidatePath('/ayarlar');
  revalidatePath('/misafir-onizleme');
  revalidatePath('/karbon');
  revalidatePath('/sertifikalar');
  return { status: 'success', message: 'Ayarlar kaydedildi.' };
}

/**
 * Faz 1 — "Ölçüme başla". Sağlayıcı sözleşmesi gelene kadar API 503
 * 'carbon_provider_not_configured' döner; mesaj kullanıcıya AYNEN yansıtılır
 * (başarılıymış gibi davranılmaz).
 */
export async function startProviderMeasurement(input: {
  period_start: string;
  period_end: string;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: 'Oturum bulunamadı.' };

  const response = await startCarbonMeasurement(session.access_token, {
    ...input,
    // Panel içi YOL — origin'i API kendi PANEL_BASE_URL'inden ekler.
    return_path: '/ayarlar',
  });
  if (response.data) revalidatePath('/ayarlar');
  return response;
}

export async function previewHotelCarbon(input: HotelCarbonInput) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: 'Oturum bulunamadı.' };
  return previewCarbon(session.access_token, input);
}

export async function calculateAndApplyHotelCarbon(input: HotelCarbonInput) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: 'Oturum bulunamadı.' };

  const response = await updateHotel(session.access_token, { hotel_carbon: input });
  if (response.error || !response.data) {
    return { data: null, error: response.error ?? 'Karbon hesabı kaydedilemedi.' };
  }

  const pricing = response.data.carbon_pricing;
  if (!pricing || pricing.provider !== 'hotel-input-demo' || !pricing.input) {
    return { data: null, error: 'Kaydedilen karbon hesabı okunamadı.' };
  }

  revalidatePath('/ayarlar');
  revalidatePath('/misafir-onizleme');
  revalidatePath('/karbon');
  revalidatePath('/sertifikalar');
  return { data: pricing as HotelCarbonResult, error: null };
}
