/**
 * Demo kullanıcısını Demo Otel tenant'ına yeniden bağlar (SAF çekirdek).
 *
 * YENİ KULLANICI OLUŞTURMAZ — mevcut demo_viewer Auth kullanıcısı zaten var.
 * Demo Otel'i bulur/oluşturur ve kullanıcının public.users satırını bu otele
 * bağlar (hotel_id günceller, role='demo_viewer' teyit eder, auth_user_id bağlar).
 * İdempotent; yetim (fazla/yanlış) public.users satırlarını temizler → pilot
 * otelde demo kullanıcısına ait kalıntı bırakmaz.
 */

export interface RebindInput {
  demoEmail: string;
  hotelName: string;
  city: string | null;
  timezone: string;
}

export interface DemoHotelRow {
  id: string;
}

export interface UserProfile {
  id: string;
  hotel_id: string;
  auth_user_id: string | null;
  role: string;
}

export interface RebindDeps {
  findAuthUserByEmail(email: string): Promise<{ id: string } | null>;
  findDemoHotelByName(name: string): Promise<DemoHotelRow | null>;
  createDemoHotel(input: RebindInput): Promise<DemoHotelRow>;
  listUserProfilesByEmail(email: string): Promise<UserProfile[]>;
  insertUserProfile(row: Record<string, unknown>): Promise<{ id: string }>;
  updateUserProfile(id: string, patch: Record<string, unknown>): Promise<void>;
  deleteUserProfile(id: string): Promise<void>;
}

export interface RebindResult {
  authUserId: string;
  hotelId: string;
  hotelCreated: boolean;
  profileId: string;
  action: 'created' | 'rebound';
  deletedOrphans: number;
}

export async function runRebindDemoUser(
  input: RebindInput,
  deps: RebindDeps,
  opts: { dryRun?: boolean } = {},
): Promise<RebindResult> {
  const email = input.demoEmail.trim().toLowerCase();
  const dryRun = !!opts.dryRun;

  // 1) Demo Auth kullanıcısı MUTLAKA olmalı (yeni oluşturmuyoruz).
  const authUser = await deps.findAuthUserByEmail(email);
  if (!authUser) {
    throw new Error(
      `Demo Auth kullanıcısı bulunamadı: ${email}. ` +
        'Önce create-hotel ile (--role demo_viewer --password ...) oluşturun.',
    );
  }

  // 2) Demo Otel'i bul veya oluştur.
  let hotel = await deps.findDemoHotelByName(input.hotelName);
  let hotelCreated = false;
  if (!hotel) {
    if (dryRun) {
      hotel = { id: '(dry-run: yeni otel)' };
    } else {
      hotel = await deps.createDemoHotel(input);
      hotelCreated = true;
    }
  }

  // 3) Bu e-postaya ait tüm public.users satırlarını al.
  const profiles = await deps.listUserProfilesByEmail(email);

  // Kanonik satır: önce auth_user_id eşleşeni, yoksa ilki.
  const canonical =
    profiles.find((p) => p.auth_user_id === authUser.id) ?? profiles[0];

  const patch = {
    hotel_id: hotel.id,
    role: 'demo_viewer',
    auth_user_id: authUser.id,
  };

  let action: 'created' | 'rebound';
  let profileId: string;

  if (!canonical) {
    // Hiç profil yok → tek bir tane oluştur (yine kullanıcı OLUŞTURMUYORUZ,
    // yalnızca profil satırı; auth kullanıcı zaten var).
    action = 'created';
    if (dryRun) {
      profileId = '(dry-run: yeni profil)';
    } else {
      const ins = await deps.insertUserProfile({
        ...patch,
        email,
        full_name: 'Demo Görüntüleyici',
      });
      profileId = ins.id;
    }
  } else {
    action = 'rebound';
    profileId = canonical.id;
    if (!dryRun) {
      await deps.updateUserProfile(canonical.id, patch);
    }
  }

  // 4) Yetim temizliği: kanonik dışındaki tüm satırları sil (pilot vb. kalıntı).
  let deletedOrphans = 0;
  for (const p of profiles) {
    if (canonical && p.id === canonical.id) continue;
    deletedOrphans++;
    if (!dryRun) await deps.deleteUserProfile(p.id);
  }

  return {
    authUserId: authUser.id,
    hotelId: hotel.id,
    hotelCreated,
    profileId,
    action,
    deletedOrphans,
  };
}
