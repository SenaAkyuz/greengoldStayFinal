import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { WidgetModule } from './widget/widget.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // IP başına 60 istek / dakika (yalnızca /widget/* controller'ında uygulanır).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    SupabaseModule,
    HealthModule,
    WidgetModule,
    DashboardModule,
  ],
})
export class AppModule {}
