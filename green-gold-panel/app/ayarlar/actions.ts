'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { updateHotel, type HotelUpdate } from '@/lib/api';

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
  };
  const amountRaw = str('contribution_amount_per_night');
  if (amountRaw !== '') {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      return { status: 'error', message: 'Gece başı tutar sayı olmalı.' };
    }
    patch.contribution_amount_per_night = amount;
  }

  const { error } = await updateHotel(token, patch);
  if (error) {
    return { status: 'error', message: error };
  }

  revalidatePath('/ayarlar');
  return { status: 'success', message: 'Ayarlar kaydedildi.' };
}
