import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth.guard';
import { IntegrationsReadService } from './integrations-read.service';

// Guard'lar GLOBAL (AppModule) — bu controller @Public DEĞİL, auth zorunlu.
// DashboardController ile aynı 'dashboard' path prefix'ini paylaşır (ayrı
// modül, ayrı dosya — Faz 2 çekirdeğini widget-analitik koddan ayrı tutmak için).
@Controller('dashboard')
export class DashboardIntegrationsController {
  constructor(private readonly integrationsRead: IntegrationsReadService) {}

  // GET /dashboard/reservations?range=&from=&to= (auth'lı, tenant-scoped)
  @Get('reservations')
  async reservations(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.integrationsRead.getReservations(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }

  // GET /dashboard/contributions-summary?range=&from=&to= (auth'lı, tenant-scoped)
  @Get('contributions-summary')
  async contributionsSummary(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.integrationsRead.getContributionsSummary(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }

  // GET /dashboard/integration-health (auth'lı, tenant-scoped) — secret asla dönmez.
  @Get('integration-health')
  async integrationHealth(@Req() req: AuthenticatedRequest) {
    return this.integrationsRead.getIntegrationHealth(req.auth.hotelId);
  }
}
