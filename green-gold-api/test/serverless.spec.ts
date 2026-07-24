import type { Server } from 'http';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { SupabaseService } from '../src/supabase/supabase.service';
import { makeFakeSupabase } from './fake-supabase';

interface Envelope {
  success: boolean;
}

/**
 * Serverless girişinin (api/index.ts) kullandığı AYNI yapılandırma yolunu
 * (configureApp: /widget CORS + ValidationPipe + interceptor + filter, global
 * guard'lar AppModule'de) HTTP üzerinden doğrular: uçlar cevap veriyor mu, guard/
 * pipe/zarf devrede mi. SupabaseService fake ile override edilir (env gerekmez).
 */
describe('Serverless bootstrap (configureApp) — HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fake = makeFakeSupabase({ hotels: [] });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(fake)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app); // main.ts / serverless ile birebir aynı yapılandırma
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer() as Server;
  const body = (res: { body: unknown }) => res.body as Envelope;

  it('GET /internal/health -> 200, { success:true } zarfı (public)', async () => {
    const res = await request(server()).get('/internal/health');
    expect(res.status).toBe(200);
    expect(body(res).success).toBe(true);
  });

  it('GET /dashboard/hotel -> 401 (auth guard, token yok)', async () => {
    const res = await request(server()).get('/dashboard/hotel');
    expect(res.status).toBe(401);
    expect(body(res).success).toBe(false);
  });

  it('POST /widget/events (boş gövde) -> 400 (public route + ValidationPipe)', async () => {
    const res = await request(server()).post('/widget/events').send({});
    expect(res.status).toBe(400);
    expect(body(res).success).toBe(false);
  });

  it('bilinmeyen uç -> 404 zarflı', async () => {
    const res = await request(server()).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
