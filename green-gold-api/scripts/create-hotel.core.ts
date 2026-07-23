import { HOTEL_TYPES, type HotelType } from '../src/common/hotel-type';

/**
 * Otel oluşturma operatör script'inin SAF (I/O'suz) çekirdeği — birim test edilir.
 * Gerçek Supabase/Auth çağrıları deps üzerinden enjekte edilir.
 *
 * Akış: preflight (çakışma kontrolü) → hotels(pending) → auth davet linki
 * (generateLink 'invite', ŞİFRE YOK) → users (otele bağlı). Otel 'pending'
 * doğar; widget origin + embed + activate tamamlanana kadar ÇALIŞMAZ.
 */

export interface RawInput {
  name?: string;
  city?: string;
  timezone?: string;
  hotelType?: string;
  adminEmail?: string;
  adminName?: string;
}

export interface CreateHotelInput {
  name: string;
  city: string | null;
  timezone: string;
  hotelType: HotelType;
  adminEmail: string;
  adminName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateInput(raw: RawInput): CreateHotelInput {
  const name = (raw.name ?? '').trim();
  if (!name) throw new Error('Otel adı zorunlu (--name).');

  const adminEmail = (raw.adminEmail ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(adminEmail)) {
    throw new Error('Geçerli bir yönetici e-postası zorunlu (--email).');
  }

  const timezone = (raw.timezone ?? 'Europe/Istanbul').trim();
  if (!isValidTimezone(timezone)) {
    throw new Error(`Geçersiz timezone: ${timezone}`);
  }

  let hotelType: HotelType = 'city';
  if (raw.hotelType) {
    const t = raw.hotelType.trim();
    if (!HOTEL_TYPES.includes(t as HotelType)) {
      throw new Error(`Geçersiz hotel_type: ${t} (city | premium | resort)`);
    }
    hotelType = t as HotelType;
  }

  const city = (raw.city ?? '').trim() || null;
  const adminName = (raw.adminName ?? '').trim() || adminEmail.split('@')[0];

  return { name, city, timezone, hotelType, adminEmail, adminName };
}

/** Yazmadan ÖNCE çalışan salt-okunur çakışma kontrolleri. */
export interface PreflightDeps {
  authUserExists(email: string): Promise<boolean>;
  userProfileByEmail(email: string): Promise<{ hotelName: string | null } | null>;
  hotelNameExists(name: string): Promise<boolean>;
  hotelCodeExists(code: string): Promise<boolean>;
  genHotelCode(): string;
}

export interface WriteDeps {
  insertHotel(row: Record<string, unknown>): Promise<{
    id: string;
    public_widget_key: string;
  }>;
  deleteHotel(id: string): Promise<void>;
  /** generateLink('invite') — auth kullanıcı oluşturur (ŞİFRESİZ) + davet linki. */
  createAuthInvite(
    email: string,
    redirectTo: string,
  ): Promise<{ id: string; inviteLink: string }>;
  deleteAuthUser(id: string): Promise<void>;
  insertUser(row: Record<string, unknown>): Promise<{ id: string }>;
}

export type CreateHotelDeps = PreflightDeps & WriteDeps;

/**
 * Yazmadan önce çakışmaları netçe raporla; yarım kayıt bırakma. E-posta hem
 * public.users hem auth.users'ta, otel adı hotels'ta kontrol edilir.
 */
export async function preflight(
  input: CreateHotelInput,
  deps: PreflightDeps,
): Promise<void> {
  const profile = await deps.userProfileByEmail(input.adminEmail);
  if (profile) {
    throw new Error(
      `Bu e-posta zaten '${profile.hotelName ?? 'bir'}' oteline bağlı — yeni otel oluşturulmadı.`,
    );
  }
  if (await deps.authUserExists(input.adminEmail)) {
    throw new Error(
      `Bu e-posta Supabase Auth'ta zaten kayıtlı — yeni otel oluşturulmadı.`,
    );
  }
  if (await deps.hotelNameExists(input.name)) {
    throw new Error(
      `'${input.name}' adında bir otel zaten var — yeni otel oluşturulmadı.`,
    );
  }
}

async function uniqueHotelCode(deps: PreflightDeps): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = deps.genHotelCode();
    if (!(await deps.hotelCodeExists(code))) return code;
  }
  throw new Error('Benzersiz otel kodu üretilemedi (5 deneme).');
}

export interface CreateHotelPlan {
  name: string;
  city: string | null;
  timezone: string;
  hotelType: HotelType;
  hotelCode: string;
  status: 'pending';
  adminEmail: string;
  adminName: string;
}

/** DRY-RUN: doğrulama + preflight + kod üretimi; DB/Auth'a HİÇBİR yazma yapmaz. */
export async function planCreateHotel(
  input: CreateHotelInput,
  deps: PreflightDeps,
): Promise<CreateHotelPlan> {
  await preflight(input, deps);
  const hotelCode = await uniqueHotelCode(deps);
  return {
    name: input.name,
    city: input.city,
    timezone: input.timezone,
    hotelType: input.hotelType,
    hotelCode,
    status: 'pending',
    adminEmail: input.adminEmail,
    adminName: input.adminName,
  };
}

export interface CreateHotelResult {
  hotelId: string;
  hotelCode: string;
  publicWidgetKey: string;
  authUserId: string;
  inviteLink: string;
  adminEmail: string;
}

export async function runCreateHotel(
  input: CreateHotelInput,
  deps: CreateHotelDeps,
  redirectTo: string,
): Promise<CreateHotelResult> {
  await preflight(input, deps);
  const hotelCode = await uniqueHotelCode(deps);

  const hotel = await deps.insertHotel({
    name: input.name,
    city: input.city,
    timezone: input.timezone,
    hotel_type: input.hotelType,
    hotel_code: hotelCode,
    // 'pending' (şema varsayılanı): widget origin + embed + activate tamamlanana
    // kadar config/impact vermez.
    status: 'pending',
  });

  let auth: { id: string; inviteLink: string };
  try {
    auth = await deps.createAuthInvite(input.adminEmail, redirectTo);
  } catch (e) {
    await deps.deleteHotel(hotel.id);
    throw e;
  }

  try {
    await deps.insertUser({
      hotel_id: hotel.id,
      auth_user_id: auth.id,
      full_name: input.adminName,
      email: input.adminEmail,
      role: 'otel_yoneticisi',
    });
  } catch (e) {
    await deps.deleteAuthUser(auth.id);
    await deps.deleteHotel(hotel.id);
    throw e;
  }

  return {
    hotelId: hotel.id,
    hotelCode,
    publicWidgetKey: hotel.public_widget_key,
    authUserId: auth.id,
    inviteLink: auth.inviteLink,
    adminEmail: input.adminEmail,
  };
}
