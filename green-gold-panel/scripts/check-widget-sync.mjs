// Panel prebuild guard'ı: panel build edilmeden önce widget'ın panel/public'teki
// kopyasının güncel widget kaynağıyla eşleştiğini doğrular (bayat widget koruması).
//
// VERCEL-GÜVENLİ: Panel'in Vercel root directory'si green-gold-panel olduğundan
// izole build'de ../green-gold-widget bulunmaz. Widget kaynağı YA DA node_modules
// yoksa kontrol sessizce ATLANIR (build'i bozmaz). Lokal/CI'da (widget mevcut)
// gerçekten çalışır ve bayat kopyada build'i durdurur.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const widgetDir = resolve(here, '..', '..', 'green-gold-widget');

if (
  !existsSync(widgetDir) ||
  !existsSync(resolve(widgetDir, 'node_modules'))
) {
  console.log(
    '[prebuild] widget kaynağı/bağımlılıkları yok (izole build?) — check:widget atlandı.',
  );
  process.exit(0);
}

try {
  console.log('[prebuild] widget senkron kontrolü (check:widget)…');
  execSync('npm run check:widget', { cwd: widgetDir, stdio: 'inherit' });
} catch {
  console.error(
    '[prebuild] check:widget BAŞARISIZ — panel/public widget bayat. Build durduruldu.',
  );
  process.exit(1);
}
