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

  // GET /dashboard/widget-events-summary?from=YYYY-MM-DD&to=YYYY-MM-DD (auth'lı, otel bazlı)
  @Get('widget-events-summary')
  async widgetEventsSummary(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getWidgetEventsSummary(
      req.auth.hotelId,
      from,
      to,
    );
  }

  // GET /dashboard/carbon-summary?from=&to= (auth'lı) — tahmini CO₂, session-dedup
  @Get('carbon-summary')
  async carbonSummary(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getCarbonSummary(req.auth.hotelId, from, to);
  }
}
