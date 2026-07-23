/**
 * Operatör script'i — pilot otel + yönetici (davet linki) oluşturur.
 *
 *   npm run create-hotel -- --name "Deniz Otel" --email yonetici@otel.com \
 *     --city "İzmir" --tz Europe/Istanbul --type city [--dry-run]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role anahtarıyla çalışır (RLS bypass).
 * Public self-service kayıt DEĞİLDİR. Otel 'pending' doğar; aktivasyon için
 * bkz. activate-hotel.ts. Yönetici ŞİFRESİ YOK — davet linkiyle kendi belirler.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validateInput,
  planCreateHotel,
  runCreateHotel,
  type RawInput,
  type CreateHotelDeps,
} from './create-hotel.core';

function loadEnv(): void {
  const p = resolve(__dirname, '..', '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1] in process.env) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function parseArgs(argv: string[]): { raw: RawInput; dryRun: boolean } {
  const out: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run') {
      dryRun = true;
      continue;
    }
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    out[key] = val;
  }
  return {
    dryRun,
    raw: {
      name: out.name,
      city: out.city,
      timezone: out.tz ?? out.timezone,
      hotelType: out.type ?? out['hotel-type'],
      adminEmail: out.email,
      adminName: out['admin-name'],
    },
  };
}

function genHotelCode(): string {
  return `HTL-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function authUserExists(
  db: SupabaseClient,
  email: string,
): Promise<boolean> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`Auth kontrolü başarısız: ${error.message}`);
    if (data.users.some((u) => (u.email ?? '').toLowerCase() === email)) {
      return true;
    }
    if (data.users.length < 200) return false;
  }
  return false;
}

function makeDeps(db: SupabaseClient): CreateHotelDeps {
  return {
    genHotelCode,
    authUserExists: (email) => authUserExists(db, email),
    userProfileByEmail: async (email) => {
      const { data } = await db
        .from('users')
        .select('hotel_id')
        .eq('email', email)
        .maybeSingle();
      if (!data) return null;
      const { data: h } = await db
        .from('hotels')
        .select('name')
        .eq('id', data.hotel_id)
        .maybeSingle();
      return { hotelName: (h?.name as string | undefined) ?? null };
    },
    hotelNameExists: async (name) => {
      const { data } = await db
        .from('hotels')
        .select('id')
        .eq('name', name)
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    hotelCodeExists: async (code) => {
      const { data } = await db
        .from('hotels')
        .select('id')
        .eq('hotel_code', code)
        .maybeSingle();
      return !!data;
    },
    insertHotel: async (row) => {
      const { data, error } = await db
        .from('hotels')
        .insert(row)
        .select('id, public_widget_key')
        .single();
      if (error || !data) {
        throw new Error(`Otel eklenemedi: ${error?.message ?? 'bilinmeyen'}`);
      }
      return {
        id: data.id as string,
        public_widget_key: data.public_widget_key as string,
      };
    },
    deleteHotel: async (id) => {
      await db.from('hotels').delete().eq('id', id);
    },
    createAuthInvite: async (email, redirectTo) => {
      // generateLink('invite'): auth kullanıcı oluşturur (ŞİFRESİZ) + davet linki.
      // NOT: bu çağrı e-POSTA GÖNDERMEZ, yalnızca linki döndürür. Mail göndermek
      // istenirse ayrıca auth.admin.inviteUserByEmail kullanılmalı.
      const { data, error } = await db.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo },
      });
      if (error || !data?.user || !data.properties?.action_link) {
        throw new Error(
          `Davet linki üretilemedi: ${error?.message ?? 'bilinmeyen'}`,
        );
      }
      return { id: data.user.id, inviteLink: data.properties.action_link };
    },
    deleteAuthUser: async (id) => {
      await db.auth.admin.deleteUser(id);
    },
    insertUser: async (row) => {
      const { data, error } = await db
        .from('users')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`Profil eklenemedi: ${error?.message ?? 'bilinmeyen'}`);
      }
      return { id: data.id as string };
    },
  };
}

function embedCode(widgetKey: string, apiBase: string): string {
  return `<script src="https://cdn.greengold.example/green-gold-widget.v1.js"></script>
<green-gold-widget data-key="${widgetKey}" data-nights="1" data-lang="tr"
    data-api="${apiBase}"></green-gold-widget>`;
}

async function main(): Promise<void> {
  loadEnv();

  const { raw, dryRun } = parseArgs(process.argv.slice(2));
  const input = validateInput(raw);

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).',
    );
  }

  const apiBase = process.env.API_PUBLIC_URL ?? 'http://localhost:3000';
  const panelUrl = process.env.PANEL_URL ?? 'http://localhost:3001';
  const redirectTo = `${panelUrl}/auth/callback?next=/set-password`;

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deps = makeDeps(db);

  if (dryRun) {
    const plan = await planCreateHotel(input, deps);
    console.log('\n🧪 DRY-RUN — hiçbir kayıt yazılmadı\n');
    console.log(`  Otel adı        : ${plan.name}`);
    console.log(`  Şehir           : ${plan.city ?? '-'}`);
    console.log(`  Timezone        : ${plan.timezone}`);
    console.log(`  Otel tipi       : ${plan.hotelType}`);
    console.log(`  Otel kodu       : ${plan.hotelCode}`);
    console.log(`  Status          : ${plan.status} (yayında değil)`);
    console.log(`  Yönetici e-posta: ${plan.adminEmail}`);
    console.log('\n  Embed kodu (widget key gerçek oluşturmada üretilir):\n');
    console.log(embedCode('<WIDGET_KEY_OLUSTURULACAK>', apiBase));
    console.log('\n  DRY-RUN bitti. Gerçek oluşturma için --dry-run\'ı kaldırın.\n');
    return;
  }

  const res = await runCreateHotel(input, deps, redirectTo);

  console.log('\n✅ Otel oluşturuldu (status: pending — henüz yayında değil)\n');
  console.log(`  Otel adı        : ${input.name}`);
  console.log(`  Otel id         : ${res.hotelId}`);
  console.log(`  Otel kodu       : ${res.hotelCode}`);
  console.log(`  Widget key      : ${res.publicWidgetKey}`);
  console.log(`  Yönetici e-posta: ${res.adminEmail}`);
  console.log('\n  Embed kodu:\n');
  console.log(embedCode(res.publicWidgetKey, apiBase));
  console.log('\n  🔗 Davet / şifre-belirleme linki (BİR KEZ gösterilir, hassas):\n');
  console.log(`     ${res.inviteLink}`);
  console.log(
    '\n  (Bu link e-posta GÖNDERMEZ; yöneticiye güvenli kanaldan iletin.',
  );
  console.log(
    '   Panelde /set-password akışına yönlenir, kullanıcı kendi şifresini koyar.)',
  );
  console.log('\n  Sonraki adımlar:');
  console.log('   1) Yönetici davet linkiyle /set-password\'de şifresini belirler.');
  console.log("   2) Panelde Ayarlar > izinli domain'lere otelin sitesini ekleyin.");
  console.log('   3) Embed kodunu otelin ödeme (checkout) sayfasına yapıştırın.');
  console.log(
    `   4) Aktive edin:  npm run activate-hotel -- --key ${res.publicWidgetKey}\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
