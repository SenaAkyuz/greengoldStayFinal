// Build sonrası zorunlu doğrulama: serverless girişinin (api/index.js) require
// ettiği derleme çıktısı gerçekten üretildi mi?
//
// NEDEN: `nest build` derleme çıktısı üretmeden de exit 0 verebilir (incremental
// tsc + deleteOutDir birlikte bayat bir tsbuildinfo görürse hiç emit etmez).
// O durumda deploy "başarılı" görünür, hata ancak PROD'da ilk istekte
// "Cannot find module '../dist/bootstrap'" olarak çıkar. Bu script hatayı
// runtime'dan BUILD zamanına çeker.

import { existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(apiRoot, 'dist');

// api/index.js'in require ettiği giriş + Nest'in ihtiyaç duyduğu kök modül.
const REQUIRED = ['bootstrap.js', 'app.module.js'];

function fail(msg) {
  console.error(`\n[verify-dist] ✗ BUILD DOĞRULAMASI BAŞARISIZ\n${msg}\n`);
  console.error(
    'Olası neden: bayat tsbuildinfo yüzünden tsc hiç emit etmedi.\n' +
      'Çözüm: dist/ ve tsconfig.build.tsbuildinfo silinip yeniden build edilmeli\n' +
      '(Vercel: Redeploy sırasında "Use existing Build Cache" KAPATILMALI).\n',
  );
  process.exit(1);
}

if (!existsSync(dist)) fail('dist/ klasörü hiç oluşmamış.');

const entries = readdirSync(dist);
if (entries.length === 0) fail('dist/ BOŞ — tsc hiçbir dosya üretmemiş.');

const missing = REQUIRED.filter((f) => !existsSync(resolve(dist, f)));
if (missing.length) {
  fail(
    `dist/ içinde beklenen dosya(lar) yok: ${missing.join(', ')}\n` +
      `dist/ içeriği: ${entries.slice(0, 15).join(', ')}${entries.length > 15 ? ' …' : ''}`,
  );
}

const empty = REQUIRED.filter((f) => statSync(resolve(dist, f)).size === 0);
if (empty.length) fail(`Boyutu 0 olan çıktı dosyası: ${empty.join(', ')}`);

console.log(
  `[verify-dist] ✓ dist/ doğrulandı (${entries.length} girdi; ${REQUIRED.join(', ')} mevcut).`,
);
