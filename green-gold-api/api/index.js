// Vercel serverless girişi — PLAIN JS (bilinçli).
//
// NEDEN JS + derlenmiş dist: @vercel/node kaynağı esbuild ile derler; esbuild
// `emitDecoratorMetadata`'yı DESTEKLEMEZ. NestJS DI ise bu metadata'ya dayanır.
// Bu yüzden TS/DI kodu `nest build` (tsc) ile önceden derlenir (metadata gömülür)
// ve buradan yalnızca derlenmiş `dist/bootstrap.js` require edilir. Bu dosya
// decorator içermez; esbuild'in onu derlemesi güvenlidir.
//
// Build: package.json "vercel-build": "nest build" -> dist/ üretir.
// Routing: vercel.json rewrites tüm yolları /api'ye getirir.

const { createApp } = require('../dist/bootstrap');

// Nest app'i modül seviyesinde bir kez oluştur/cache'le (cold-start başına 1).
// Eşzamanlı ilk isteklerde tek init için initPromise ile korunur. app.listen YOK.
let cachedHandler = null;
let initPromise = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;
  if (!initPromise) {
    initPromise = (async () => {
      const app = await createApp();
      await app.init(); // listen değil: yalnızca modülleri/handler'ı hazırla.
      cachedHandler = app.getHttpAdapter().getInstance();
      return cachedHandler;
    })();
  }
  return initPromise;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  handler(req, res);
};
