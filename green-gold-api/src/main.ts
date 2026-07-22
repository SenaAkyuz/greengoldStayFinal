import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { SupabaseService } from './supabase/supabase.service';
import { createWidgetCors } from './common/widget-cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
