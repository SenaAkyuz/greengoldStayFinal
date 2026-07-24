import type { Request, Response } from 'express';
import { createApp } from '../src/bootstrap';

/**
 * Vercel serverless girişi. NestJS doğrudan çalışmaz; Express instance'ını handler
 * olarak veririz. app.listen YOK (serverless'ta port dinlenmez).
 *
 * Nest uygulaması MODÜL SEVİYESİNDE bir kez oluşturulup cache'lenir — her istekte
 * yeniden kurmak cold-start maliyeti demektir. Eşzamanlı ilk isteklerde tek init
 * için initPromise ile korunur.
 */
type ExpressHandler = (req: Request, res: Response) => void;

let cachedHandler: ExpressHandler | null = null;
let initPromise: Promise<ExpressHandler> | null = null;

async function getHandler(): Promise<ExpressHandler> {
  if (cachedHandler) return cachedHandler;
  if (!initPromise) {
    initPromise = (async () => {
      const app = await createApp();
      await app.init(); // listen değil: yalnızca modülleri/handler'ı hazırla.
      const instance = app.getHttpAdapter().getInstance() as ExpressHandler;
      cachedHandler = instance;
      return instance;
    })();
  }
  return initPromise;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const app = await getHandler();
  app(req, res);
}
