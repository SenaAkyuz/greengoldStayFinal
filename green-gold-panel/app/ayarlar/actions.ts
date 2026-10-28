'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  updateHotel,
  previewCarbon,
  importCarbonMeasurement,
  activateCarbonMeasurement,
  getProviderUnits,
  getEmissionResources,
  searchAirports,
  getCarbonEntries,
  createCarbonEntry,
  uploadCarbonEntryDocument,
  markCarbonEntryDeleted,
  type CarbonEntryInput,
  type ProviderImportInput,
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
 * "3pmetrics verisini getir". Bağlantı/anahtar yoksa API 503 + açık mesaj
 * döner; mesaj kullanıcıya AYNEN yansıtılır (başarılıymış gibi davranılmaz).
 * Widget fiyatı burada DEĞİŞMEZ.
 */
export async function importProviderMeasurement(input: ProviderImportInput) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: 'Oturum bulunamadı.' };

  const response = await importCarbonMeasurement(session.access_token, input);
  if (response.data) revalidatePath('/ayarlar');
  return response;
}

/** İçeri alınmış 3pmetrics ölçümünü widget fiyatına uygular. */
export async function activateProviderMeasurement(measurementId: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { data: null, error: 'Oturum bulunamadı.' };

  const response = await activateCarbonMeasurement(
    session.access_token,
    measurementId,
  );
  if (response.data) {
    revalidatePath('/ayarlar');
    revalidatePath('/misafir-onizleme');
    revalidatePath('/karbon');
    revalidatePath('/sertifikalar');
  }
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

// --- 3pmetrics veri girişi ----------------------------------------------------
// Token yalnızca sunucuda okunur; hotel_id ve 3pmetrics müşteri kimliği
// ASLA istemciden gönderilmez (API token'dan çözer).

async function accessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

const NO_SESSION = { data: null, error: 'Oturum bulunamadı.' } as const;

export async function loadProviderUnits() {
  const token = await accessToken();
  return token ? getProviderUnits(token) : NO_SESSION;
}

export async function loadEmissionResources(unitId: string) {
  const token = await accessToken();
  return token ? getEmissionResources(token, unitId) : NO_SESSION;
}

export async function findAirports(query: string) {
  const token = await accessToken();
  return token ? searchAirports(token, query) : NO_SESSION;
}

export async function loadCarbonEntries() {
  const token = await accessToken();
  return token ? getCarbonEntries(token) : NO_SESSION;
}

/** 3pmetrics'e yazar — GERİ ALINAMAZ. 409 'carbon_entry_possible_duplicate' kodu döner. */
export async function submitCarbonEntry(input: CarbonEntryInput) {
  const token = await accessToken();
  if (!token) return { ...NO_SESSION, code: null };
  return createCarbonEntry(token, input);
}

/**
 * Kanıt belgesi yükler. Sınır: 4 MB (API Vercel'de, istek gövdesi 4.5 MB ile
 * sınırlı). next.config.ts'te serverActions.bodySizeLimit buna göre ayarlı.
 */
export async function attachCarbonEntryDocument(
  entryId: string,
  form: FormData,
) {
  const token = await accessToken();
  if (!token) return NO_SESSION;
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { data: null, error: 'Dosya seçilmedi.' };
  }
  const outbound = new FormData();
  outbound.append('file', file, file.name);
  return uploadCarbonEntryDocument(token, entryId, outbound);
}

export async function markEntryDeletedInProvider(entryId: string) {
  const token = await accessToken();
  return token ? markCarbonEntryDeleted(token, entryId) : NO_SESSION;
}
