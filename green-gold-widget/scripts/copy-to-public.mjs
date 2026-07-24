// Widget build çıktısını panel'in public/ klasörüne kopyalar (dağıtım akışı).
// Kullanım: `npm run build && npm run copy:public` (veya doğrudan copy:public
// önce build gerektirir). Sonra `npm run check:widget` ile doğrulanabilir.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = 'green-gold-widget.v1.js';
const distFile = resolve(here, '..', 'dist', FILE);
const publicDir = resolve(here, '..', '..', 'green-gold-panel', 'public');
const publicFile = resolve(publicDir, FILE);

if (!existsSync(distFile)) {
  console.error(
    `[copy:public] Build çıktısı yok: ${distFile}\n  Önce: npm run build`,
  );
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(distFile, publicFile);
console.log(`[copy:public] dist/${FILE} -> green-gold-panel/public/${FILE}`);
