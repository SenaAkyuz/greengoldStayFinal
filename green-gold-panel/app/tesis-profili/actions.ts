'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { connecthub, userMessage } from '@/lib/connecthub';
import { profileToPayload, validateProfile, type ProfileInput } from '@/lib/carbon-ui/profile';
import type { ProfileSaveState } from '../components/panel/profile-state';

/**
 * Tesis profilini kaydeder (PUT /dashboard/carbon-provider/connecthub/profile).
 * hotel_id ASLA gönderilmez (backend token'dan çözer). Demo hesabı backend'de
 * 403 alır; ekranda da kayıt kapalıdır. Doğrulama burada TEKRAR yapılır
 * (istemci atlatılabilir), asıl kurallar backend'dedir.
 */
export async function saveFacilityProfile(
  _prev: ProfileSaveState,
  formData: FormData,
): Promise<ProfileSaveState> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { status: 'error', message: 'Oturum bulunamadı, tekrar giriş yapın.' };

  const str = (k: string) => (formData.get(k)?.toString() ?? '').trim();
  const input: ProfileInput = {
    countryCode: str('countryCode'),
    rooms: str('rooms'),
    totalArea: str('totalArea'),
    roomsArea: str('roomsArea'),
    meetingArea: str('meetingArea'),
  };
  const { errors } = validateProfile(input);
  const payload = profileToPayload(input);
  if (!payload) {
    return { status: 'error', message: 'Formdaki hataları düzeltin.', fieldErrors: errors };
  }

  const result = await connecthub.saveProfile(token, payload);
  if (result.error || !result.data) {
    return { status: 'error', message: userMessage(result) };
  }
  revalidatePath('/tesis-profili');
  revalidatePath('/');
  return {
    status: 'success',
    message: 'Tesis profili kaydedildi. Sonraki karbon hesapları bu bilgileri kullanır.',
  };
}
