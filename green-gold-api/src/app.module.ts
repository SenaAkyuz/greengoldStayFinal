import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { WidgetModule } from './widget/widget.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthGuard } from './common/auth.guard';
import { DemoReadOnlyGuard } from './common/demo-readonly.guard';
import { DistributedThrottlerStorage } from './common/distributed-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // IP başına 60 istek / dakika (yalnızca /widget/* controller'ında uygulanır).
    // storage: paylaşılan RateLimitStore (Upstash Redis bağlıysa dağıtık; yoksa
    // bellek-içi fallback + uyarı) — Vercel'de instance'lar arası tutarlılık için.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
      storage: new DistributedThrottlerStorage(),
    }),
    SupabaseModule,
    HealthModule,
    WidgetModule,
    DashboardModule,
  ],
  // Global guard sırası ÖNEMLİ: önce AuthGuard (req.auth'ı doldurur / @Public'i
  // atlar), sonra DemoReadOnlyGuard (rolü çözülmüş kullanıcıda yazmayı reddeder).
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: DemoReadOnlyGuard },
  ],
})
export class AppModule {}
