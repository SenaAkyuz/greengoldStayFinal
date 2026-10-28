import { Module } from '@nestjs/common';
import { WebhookIngestionController } from './webhook-ingestion.controller';
import { WebhookIngestionService } from './webhook-ingestion.service';
import { DashboardIntegrationsController } from './dashboard-integrations.controller';
import { IntegrationsReadService } from './integrations-read.service';
import { ProviderRegistryService } from './provider-registry';
import { HotelRunnerPollController } from './hotelrunner/hotelrunner-poll.controller';
import { HotelRunnerPollService } from './hotelrunner/hotelrunner-poll.service';

// AuthGuard + DemoReadOnlyGuard GLOBAL (AppModule). WebhookIngestionController
// @Public — auth muafiyeti orada tanımlı. DashboardIntegrationsController
// @Public DEĞİL -> global AuthGuard uygulanır (Supabase Bearer token zorunlu).
@Module({
  controllers: [
    WebhookIngestionController,
    DashboardIntegrationsController,
    HotelRunnerPollController,
  ],
  providers: [
    WebhookIngestionService,
    IntegrationsReadService,
    ProviderRegistryService,
    HotelRunnerPollService,
  ],
})
export class IntegrationsModule {}
