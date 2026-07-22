import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { AuthenticatedRequest } from '../common/auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /dashboard/hotel (auth'lı) — giriş yapan kullanıcının otel bilgisi
  @Get('hotel')
  async hotel(@Req() req: AuthenticatedRequest) {
    return this.dashboardService.getHotel(req.auth.hotelId);
  }

  // GET /dashboard/widget-events-summary?range=&from=&to= (auth'lı, otel bazlı)
  @Get('widget-events-summary')
  async widgetEventsSummary(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getWidgetEventsSummary(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }

  // GET /dashboard/carbon-summary?range=&from=&to= (auth'lı) — tahmini CO₂, session-dedup
  @Get('carbon-summary')
  async carbonSummary(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getCarbonSummary(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }

  // GET /dashboard/funnel?range=&from=&to= (auth'lı) — session bazlı etkileşim hunisi
  @Get('funnel')
  async funnel(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getFunnel(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }
}
