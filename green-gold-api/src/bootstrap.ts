import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { SupabaseService } from './supabase/supabase.service';
import { createWidgetCors } from './common/widget-cors';

/**
 * Lokal (main.ts, app.listen) ve serverless girişi (api/index.ts) AYNI
 * yapılandırmayı paylaşsın diye tek yer. Global guard'lar zaten AppModule'de
 * (APP_GUARD). Burada: /widget CORS, ValidationPipe, response interceptor,
 * exception filter. app.listen ÇAĞRILMAZ — onu çağıran karar verir.
 */
export function configureApp(app: INestApplication): void {
  // CORS KİLİDİ (Adım 8): global açık CORS YOK. Yalnızca /widget/* için
  // per-hotel origin allow-list. /dashboard/* server-side çağrılır -> CORS gereksiz.
  app.use('/widget', createWidgetCors(app.get(SupabaseService)));

  // Runtime DTO doğrulaması: bilinmeyen alanları reddet, tipleri dönüştür.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Ortak zarf: başarı -> { success, data, error }, hata -> { success:false, ... }
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}

/** Yapılandırılmış ama HENÜZ dinlemeyen bir Nest uygulaması oluşturur. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  return app;
}
