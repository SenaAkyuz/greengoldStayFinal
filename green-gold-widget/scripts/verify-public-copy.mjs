// Bayat widget koruması: `npm run build` çıktısının (dist) panel'e kopyalanan
// sürümle (green-gold-panel/public) BİREBİR aynı olduğunu sha256 ile doğrular.
// Farklıysa hata verir — bayat kopyanın canlıya sızmasını engeller.
//
// Kullanım: `npm run check:widget` (önce build eder, sonra bunu çalıştırır).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = 'green-gold-widget.v1.js';
const distFile = resolve(here, '..', 'dist', FILE);
const publicFile = resolve(
  here,
  '..',
  '..',
  'green-gold-panel',
  'public',
  FILE,
);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!existsSync(distFile)) {
  console.error(
    `[check:widget] Build çıktısı yok: ${distFile}\n` +
      `  Önce çalıştırın: npm run build`,
  );
  process.exit(1);
}

if (!existsSync(publicFile)) {
  console.error(
    `[check:widget] Panel kopyası yok: ${publicFile}\n` +
      `  Kopyalayın: cp dist/${FILE} ../green-gold-panel/public/${FILE}`,
  );
  process.exit(1);
}

const distHash = sha256(distFile);
const publicHash = sha256(publicFile);

if (distHash !== publicHash) {
  console.error(
    `[check:widget] BAYAT KOPYA — panel/public widget'ı güncel build ile eşleşmiyor.\n` +
      `  dist   : ${distHash}\n` +
      `  public : ${publicHash}\n` +
      `  Düzelt : cp dist/${FILE} ../green-gold-panel/public/${FILE}\n` +
      `  (İçeriği bilerek değiştirdiyseniz v2 olarak yayınlayın: dosya adı + NEXT_PUBLIC_WIDGET_SRC.)`,
  );
  process.exit(1);
}

console.log(
  `[check:widget] OK — panel/public widget güncel build ile eşleşiyor (sha256 ${distHash.slice(0, 12)}…).`,
);
