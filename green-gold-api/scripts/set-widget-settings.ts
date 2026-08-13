/**
 * Operatör script'i — bir otelin widget_settings'ini (pilot_mode,
 * show_estimated_impact, enable_booking_click_tracking, content_overrides)
 * kısmi olarak günceller. Panelde bu ayarlar için UI YOK (bilinçli tercih —
 * bkz. set-widget-settings.core.ts başındaki not).
 *
 *   npm run set-widget-settings -- --key <public_widget_key> \
 *     [--pilot-mode true|false] \
 *     [--show-estimated-impact true|false] \
 *     [--enable-booking-click-tracking true|false] \
 *     [--content-tr-heading "..."] [--content-tr-checkbox-label "..."] \
 *     [--content-tr-add-button "..."] [--content-tr-confirmation "..."] \
 *     [--content-en-heading "..."] [--content-en-checkbox-label "..."] \
 *     [--content-en-add-button "..."] [--content-en-confirmation "..."] \
 *     [--clear-content-overrides] \
 *     [--dry-run]
 *
 * ⚠️ YALNIZCA LOKAL/OPERATÖR. service_role ile çalışır.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertValidOverrideText } from '../src/common/widget-settings';
import {
  runSetWidgetSettings,
  type SetWidgetSettingsDeps,
  type SetWidgetSettingsPatch,
} from './set-widget-settings.core';

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

function parseBool(raw: string, flag: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${flag} değeri 'true' veya 'false' olmalı (geldi: ${raw}).`);
}

function parseArgs(argv: string[]): {
  key: string;
  patch: SetWidgetSettingsPatch;
  dryRun: boolean;
} {
  let key = '';
  let dryRun = false;
  const patch: SetWidgetSettingsPatch = {};
  const contentTr: Record<string, string> = {};
  const contentEn: Record<string, string> = {};

  const textFlag = (
    flag: string,
    field: 'heading' | 'checkboxLabel' | 'addButton' | 'confirmation',
    target: Record<string, string>,
    value: string,
  ) => {
    assertValidOverrideText(flag, value);
    target[field] = value.trim();
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--key':
        key = argv[++i] ?? '';
        break;
      case '--pilot-mode':
        patch.pilotMode = parseBool(argv[++i] ?? '', a);
        break;
      case '--show-estimated-impact':
        patch.showEstimatedImpact = parseBool(argv[++i] ?? '', a);
        break;
      case '--enable-booking-click-tracking':
        patch.enableBookingClickTracking = parseBool(argv[++i] ?? '', a);
        break;
      case '--clear-content-overrides':
        patch.clearContentOverrides = true;
        break;
      case '--content-tr-heading':
        textFlag(a, 'heading', contentTr, argv[++i] ?? '');
        break;
      case '--content-tr-checkbox-label':
        textFlag(a, 'checkboxLabel', contentTr, argv[++i] ?? '');
        break;
      case '--content-tr-add-button':
        textFlag(a, 'addButton', contentTr, argv[++i] ?? '');
        break;
      case '--content-tr-confirmation':
        textFlag(a, 'confirmation', contentTr, argv[++i] ?? '');
        break;
      case '--content-en-heading':
        textFlag(a, 'heading', contentEn, argv[++i] ?? '');
        break;
      case '--content-en-checkbox-label':
        textFlag(a, 'checkboxLabel', contentEn, argv[++i] ?? '');
        break;
      case '--content-en-add-button':
        textFlag(a, 'addButton', contentEn, argv[++i] ?? '');
        break;
      case '--content-en-confirmation':
        textFlag(a, 'confirmation', contentEn, argv[++i] ?? '');
        break;
      default:
        throw new Error(`Bilinmeyen bayrak: ${a}`);
    }
  }

  if (Object.keys(contentTr).length > 0) patch.contentTr = contentTr;
  if (Object.keys(contentEn).length > 0) patch.contentEn = contentEn;

  return { key, patch, dryRun };
}

function makeDeps(db: SupabaseClient): SetWidgetSettingsDeps {
  return {
    getHotelByKey: async (key) => {
      const { data } = await db
        .from('hotels')
        .select('id, name, widget_settings')
        .eq('public_widget_key', key)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id as string,
        name: data.name as string,
        widget_settings: data.widget_settings,
      };
    },
    updateWidgetSettings: async (id, settings) => {
      const { error } = await db
        .from('hotels')
        .update({ widget_settings: settings, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`widget_settings güncellenemedi: ${error.message}`);
    },
  };
}

async function main(): Promise<void> {
  loadEnv();

  const { key, patch, dryRun } = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).',
    );
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const res = await runSetWidgetSettings(key, patch, makeDeps(db), { dryRun });

  const label = dryRun ? '🧪 DRY-RUN' : res.changed ? '✅ Güncellendi' : 'ℹ️  Değişiklik yok';
  console.log(`\n${label} — '${res.hotelName}'\n`);
  console.log('Önce:', JSON.stringify(res.before, null, 2));
  console.log('Sonra:', JSON.stringify(res.after, null, 2));
  if (dryRun) console.log('\n(dry-run: hiçbir şey yazılmadı)\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
