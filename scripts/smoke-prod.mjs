#!/usr/bin/env node
// Green Gold — ADIM 13G prod smoke testi (otomatikleştirilebilir kısım).
//
// Dokümandaki 15 maddenin makineyle doğrulanabilir olanlarını koşar. Oturum
// gerektirenler (4-8, 13, 14) elle yapılır; script onları "MANUEL" diye listeler.
//
// Kullanım:
//   node scripts/smoke-prod.mjs \
//     --panel=https://panel.vercel.app \
//     --api=https://api.vercel.app \
//     --key=<demo_public_widget_key>
//
// Ek bayraklar:
//   --events    POST /widget/events dener (DEMO TENANT'A GERÇEK KAYIT YAZAR)
//   --burst     ardışık istekle 429 (rate limit) doğrular — throttle tetikler
//   --bad-origin=https://izinsiz.example   (varsayılan bu)
//
// Bağımlılık yok; Node 18+ (global fetch) yeter.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_WIDGET = join(HERE, '..', 'green-gold-panel', 'public', 'green-gold-widget.v1.js');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const stripSlash = (u) => String(u).replace(/\/+$/, '');
const PANEL = args.panel ? stripSlash(args.panel) : null;
const API = args.api ? stripSlash(args.api) : null;
const KEY = args.key || null;
const BAD_ORIGIN = args['bad-origin'] || 'https://izinsiz.example';

if (!PANEL || !API) {
  console.error(
    'Kullanım: node scripts/smoke-prod.mjs --panel=<panel-url> --api=<api-url> [--key=<demo_key>] [--events] [--burst]',
  );
  process.exit(2);
}

const results = [];
function record(no, title, ok, detail) {
  results.push({ no, title, ok, detail });
  const tag = ok === null ? '\x1b[33mATLANDI\x1b[0m' : ok ? '\x1b[32mGEÇTİ  \x1b[0m' : '\x1b[31mKALDI  \x1b[0m';
  console.log(`${tag} ${no}. ${title}`);
  if (detail) console.log(`         ${detail.replace(/\n/g, '\n         ')}`);
}

async function safeFetch(url, init) {
  try {
    return { res: await fetch(url, { redirect: 'manual', ...init }), err: null };
  } catch (e) {
    return { res: null, err: e.message };
  }
}

// ---------------------------------------------------------------- 1) widget bundle
{
  const url = `${PANEL}/green-gold-widget.v1.js`;
  const { res, err } = await safeFetch(url);
  if (!res) {
    record(1, 'Widget bundle erişilebilir', false, `İstek hatası: ${err}`);
  } else {
    const ct = res.headers.get('content-type') || '';
    const cc = res.headers.get('cache-control') || '';
    const problems = [];
    if (res.status !== 200) problems.push(`HTTP ${res.status} (beklenen 200)`);
    if (res.status >= 300 && res.status < 400)
      problems.push(`YÖNLENDİRME var → ${res.headers.get('location')} (proxy matcher'ı widget'ı dışlamıyor)`);
    if (!/javascript|ecmascript/i.test(ct)) problems.push(`Content-Type: ${ct || '(yok)'}`);
    if (!/max-age=300/.test(cc) || !/must-revalidate/.test(cc))
      problems.push(`Cache-Control: ${cc || '(yok)'} (beklenen: public, max-age=300, must-revalidate)`);
    record(1, 'GET /green-gold-widget.v1.js → 200 + doğru başlıklar', problems.length === 0,
      problems.length ? problems.join('\n') : `Content-Type: ${ct} | Cache-Control: ${cc}`);

    // 1b) bayat kopya: prod'daki bundle lokal public/ kopyasıyla aynı mı?
    if (res.status === 200) {
      const body = Buffer.from(await res.arrayBuffer());
      const remote = createHash('sha256').update(body).digest('hex');
      let local = null;
      try {
        local = createHash('sha256').update(readFileSync(LOCAL_WIDGET)).digest('hex');
      } catch {
        /* lokal kopya yoksa atla */
      }
      record('1b', 'Prod widget bundle = repodaki public/ kopyası (bayat değil)',
        local ? remote === local : null,
        local
          ? `prod sha256 ${remote.slice(0, 12)}… | repo sha256 ${local.slice(0, 12)}…`
          : 'Lokal kopya okunamadı, karşılaştırma atlandı.');
    }
  }
}

// ---------------------------------------------------------------- 2) /demo public
{
  const { res, err } = await safeFetch(`${PANEL}/demo`);
  if (!res) record(2, '/demo girişsiz açılıyor', false, `İstek hatası: ${err}`);
  else {
    const loc = res.headers.get('location') || '';
    const redirected = res.status >= 300 && res.status < 400;
    record(2, '/demo → 200 (girişsiz, /login\'e yönlenmiyor)',
      res.status === 200 && !redirected,
      redirected ? `HTTP ${res.status} → ${loc}` : `HTTP ${res.status}`);
    if (res.status === 200) {
      const html = await res.text();
      const hasKeyWidget = /green-gold-widget/i.test(html) || /Demo şu an kullanılamıyor/.test(html);
      const missingKey = /Demo şu an kullanılamıyor/.test(html);
      record('2b', '/demo sayfasında widget önizlemesi var (NEXT_PUBLIC_DEMO_WIDGET_KEY dolu)',
        hasKeyWidget && !missingKey,
        missingKey ? 'Sayfa "Demo şu an kullanılamıyor" diyor → NEXT_PUBLIC_DEMO_WIDGET_KEY boş, panel redeploy gerekli.' : '');
      record('2c', 'Dürüstlük ibareleri görünür ("tahmini" / "önizleme")',
        /tahmini/i.test(html) && /önizleme/i.test(html), '');
    }
  }
}

// ---------------------------------------------------------------- 3) korumalı sayfa
{
  const { res, err } = await safeFetch(`${PANEL}/`);
  if (!res) record(3, '/ korumalı', false, `İstek hatası: ${err}`);
  else {
    const loc = res.headers.get('location') || '';
    record(3, '/ (korumalı) → /login\'e yönleniyor',
      res.status >= 300 && res.status < 400 && /\/login/.test(loc),
      `HTTP ${res.status}${loc ? ` → ${loc}` : ''}`);
  }
}

// ---------------------------------------------------------------- 4) login demo butonu
{
  const { res, err } = await safeFetch(`${PANEL}/login`);
  if (!res) record(4, '/login açılıyor', false, `İstek hatası: ${err}`);
  else {
    const html = res.status === 200 ? await res.text() : '';
    record(4, '/login → 200 ve "Demo panelini görüntüle" butonu var',
      res.status === 200 && /Demo panelini görüntüle/.test(html),
      res.status !== 200
        ? `HTTP ${res.status}`
        : /Demo panelini görüntüle/.test(html)
          ? 'Butonun tıklanması + panel içeriği MANUEL doğrulanacak (madde 4-6).'
          : 'Buton yok → DEMO_LOGIN_ENABLED=true değil (runtime env; redeploy şart değil).');
  }
}

// ---------------------------------------------------------------- 5) API health
{
  const { res, err } = await safeFetch(`${API}/internal/health`);
  if (!res) record(5, 'API /internal/health', false, `İstek hatası: ${err}`);
  else {
    const text = await res.text();
    let ok = false;
    try {
      ok = res.status === 200 && JSON.parse(text).success === true;
    } catch {
      /* JSON değil */
    }
    record(5, 'GET <api>/internal/health → {"success":true}', ok,
      ok ? text.slice(0, 160) : `HTTP ${res.status} — ${text.slice(0, 300)}\n(500/DI hatası ise: 13C serverless dist kurgusu — raporla)`);
  }
}

// ---------------------------------------------------------------- 6-8) CORS / widget API
if (!KEY) {
  record(6, 'Widget CORS testleri', null, '--key verilmedi (demo public_widget_key). Atlandı.');
} else {
  // 6) izinli origin (panel) → 200 + ACAO
  {
    const { res, err } = await safeFetch(`${API}/widget/config?key=${encodeURIComponent(KEY)}`, {
      headers: { Origin: PANEL },
    });
    if (!res) record(6, 'İzinli origin → /widget/config', false, `İstek hatası: ${err}`);
    else {
      const acao = res.headers.get('access-control-allow-origin') || '';
      const body = await res.text();
      record(6, `İzinli origin (${PANEL}) → GET /widget/config 200 + ACAO`,
        res.status === 200 && acao === PANEL,
        res.status === 403
          ? `403 → demo otelin allowed_origins'inde ${PANEL} YOK (Tur 2.1). /demo prod'da 403 alır.`
          : `HTTP ${res.status} | ACAO: ${acao || '(yok)'} | ${body.slice(0, 120)}`);
    }
  }

  // 7) izinsiz origin → 403
  {
    const { res, err } = await safeFetch(`${API}/widget/config?key=${encodeURIComponent(KEY)}`, {
      headers: { Origin: BAD_ORIGIN },
    });
    if (!res) record(7, 'İzinsiz origin → 403', false, `İstek hatası: ${err}`);
    else {
      const acao = res.headers.get('access-control-allow-origin') || '';
      record(7, `İzinsiz origin (${BAD_ORIGIN}) → 403, ACAO yok`,
        res.status === 403 && !acao,
        `HTTP ${res.status}${acao ? ` | ACAO SIZDI: ${acao}` : ''}`);
    }
  }

  // 8) preflight
  {
    const { res, err } = await safeFetch(`${API}/widget/events`, {
      method: 'OPTIONS',
      headers: {
        Origin: PANEL,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-widget-key,content-type',
      },
    });
    if (!res) record(8, 'Preflight', false, `İstek hatası: ${err}`);
    else {
      const acao = res.headers.get('access-control-allow-origin') || '';
      const ach = res.headers.get('access-control-allow-headers') || '';
      record(8, 'OPTIONS /widget/events (panel origin) → 204 + ACAO + X-Widget-Key izinli',
        res.status === 204 && acao === PANEL && /x-widget-key/i.test(ach),
        `HTTP ${res.status} | ACAO: ${acao || '(yok)'} | Allow-Headers: ${ach || '(yok)'}`);
    }
  }

  // 9) gerçek event yazımı (opt-in — demo tenant'a KAYIT DÜŞER)
  if (args.events) {
    const { res, err } = await safeFetch(`${API}/widget/events`, {
      method: 'POST',
      headers: { Origin: PANEL, 'Content-Type': 'application/json', 'X-Widget-Key': KEY },
      body: JSON.stringify({
        event_type: 'widget_goruntulendi',
        session_ref: `smoke-${Date.now()}`,
        metadata: { nights: 1 },
      }),
    });
    if (!res) record(9, 'POST /widget/events', false, `İstek hatası: ${err}`);
    else {
      const body = await res.text();
      record(9, 'İzinli origin → POST /widget/events → 201',
        res.status === 201, `HTTP ${res.status} | ${body.slice(0, 200)}\nPanelde sayının arttığını MANUEL doğrula.`);
    }

    // 10) izinsiz origin'den yazma → 403
    const bad = await safeFetch(`${API}/widget/events`, {
      method: 'POST',
      headers: { Origin: BAD_ORIGIN, 'Content-Type': 'application/json', 'X-Widget-Key': KEY },
      body: JSON.stringify({ event_type: 'widget_goruntulendi' }),
    });
    if (bad.res) {
      record(10, `İzinsiz origin → POST /widget/events → 403`,
        bad.res.status === 403, `HTTP ${bad.res.status}`);
    }
  } else {
    record(9, 'POST /widget/events (201) + izinsiz origin (403)', null,
      '--events verilmedi. Demo tenant\'a gerçek kayıt yazdığı için varsayılan kapalı.');
  }

  // 11) rate limit (opt-in)
  if (args.burst) {
    const N = 80; // IP başına 60/dk sınırının üstü
    let got429 = 0;
    let first429At = null;
    for (let i = 0; i < N; i++) {
      const { res } = await safeFetch(`${API}/widget/config?key=${encodeURIComponent(KEY)}`, {
        headers: { Origin: PANEL },
      });
      if (res && res.status === 429) {
        got429++;
        if (first429At === null) first429At = i + 1;
      }
    }
    record(11, `Hızlı ardışık ${N} istek → 429 geliyor`, got429 > 0,
      got429 ? `İlk 429: ${first429At}. istekte, toplam ${got429}` : 'Hiç 429 gelmedi — throttler devrede mi?');
  } else {
    record(11, 'Rate limit (429)', null, '--burst verilmedi. Atlandı (throttle tetikler, ~1 dk sürer).');
  }
}

// ---------------------------------------------------------------- özet
const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const passed = results.filter((r) => r.ok === true);

console.log('\n' + '═'.repeat(70));
console.log(`OTOMATİK KISIM — Geçti: ${passed.length}  |  Kaldı: ${failed.length}  |  Atlandı: ${skipped.length}`);
if (failed.length) {
  console.log('\nKALANLAR:');
  for (const f of failed) console.log(`  ✗ ${f.no}. ${f.title}`);
}
if (skipped.length) {
  console.log('\nATLANANLAR (bayrak verilmedi / girdi eksik):');
  for (const s of skipped) console.log(`  – ${s.no}. ${s.title}`);
}

// -------------------------------------------------- MANUEL DOĞRULA (zorunlu)
// Bu blok HER ZAMAN basılır — özellikle her şey yeşilken. Yeşil çıktı yalnızca
// "oturumsuz HTTP yüzeyi sağlam" demektir; aşağıdakiler test EDİLMEMİŞTİR.
const MANUAL = [
  ['4-5', 'Demo giriş akışı',
    '/login → "Demo panelini görüntüle" → panele giriyor; görünen veri DEMO tenant\'ınki (pilot otelinki DEĞİL); "Demo modu — salt okunur" rozeti + temsili veri şeridi var.'],
  ['6', 'Demo salt-okunurluk',
    '/ayarlar formu disabled; API\'ye yazma denemesi → 403 demo_read_only.'],
  ['7', 'Gerçek kullanıcı girişi',
    'E-posta/şifre ile giriş çalışıyor.'],
  ['8', 'Şifre sıfırlama e2e',
    '/forgot-password → mail GELİYOR → /auth/callback → /reset-password → yeni şifre → yeni şifreyle giriş. (Mail gelmiyorsa Supabase SMTP; login\'e sekiyorsa Redirect URL birebir eşleşmiyor.)'],
  ['9', 'Panelde sayaç artışı',
    'Widget etkileşimi sonrası paneldeki görüntülenme/seçim sayısı artıyor. (--events sadece 201 döndüğünü görür, panele yansımasını GÖRMEZ.)'],
  ['12', 'Upstash gerçekten bağlı',
    'API log\'unda "UYARI: rate limit bellek içi (best-effort)" satırı ÇIKMIYOR. Çıkıyorsa rate limit dağıtık değil — Vercel instance\'ları sayaç paylaşmaz, --burst yeşil olsa bile koruma zayıf.'],
  ['13', 'CSV export',
    'Rapor CSV\'si iniyor ve İÇERİĞİ tenant-scoped (başka otelin satırı yok).'],
  ['14', 'Gerçek mobil cihaz',
    'Kendi telefonundan gerçek Safari/Chrome: /demo, panel sayfaları, drawer, widget. (Masaüstü responsive modu SAYILMAZ.)'],
  ['15', 'Dürüstlük ibareleri',
    'Panel içi sayfalarda da "tahmini" / "temsili" ibareleri görünür. (Script yalnızca /demo\'yu kontrol eder.)'],
];

console.log('\n' + '═'.repeat(70));
console.log('MANUEL DOĞRULA — bu maddeler OTOMATİK KOŞULAMAZ (oturum/tarayıcı/log gerekir)');
console.log('Yukarısı tamamen yeşil olsa bile aşağıdakiler TEST EDİLMEMİŞTİR.');
console.log('═'.repeat(70));
for (const [no, title, detail] of MANUAL) {
  console.log(`\n  [ ] ${no}. ${title}`);
  console.log(`      ${detail}`);
}
console.log('\n' + '═'.repeat(70));
console.log(
  failed.length
    ? `SONUÇ: otomatik kısımda ${failed.length} madde KALDI — önce onları düzelt, sonra manuel listeye geç.`
    : `SONUÇ: otomatik kısım temiz. 13G BİTMEDİ — yukarıdaki ${MANUAL.length} manuel madde elle doğrulanmalı.`,
);
console.log('═'.repeat(70) + '\n');

process.exit(failed.length ? 1 : 0);
