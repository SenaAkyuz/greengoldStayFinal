import { Body, Controller, Get, Patch, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/auth.guard';
import { DashboardService } from './dashboard.service';
import { UpdateHotelDto } from './dto/update-hotel.dto';

// Guard'lar GLOBAL (AppModule): AuthGuard req.auth'ı doldurur; DemoReadOnlyGuard
// demo_viewer için tüm yazma metotlarını 403 'demo_read_only' ile reddeder.
// Bu controller @Public değil → auth korumalı.
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /dashboard/hotel (auth'lı) — giriş yapan kullanıcının otel bilgisi + rolü
  @Get('hotel')
  async hotel(@Req() req: AuthenticatedRequest) {
    const hotel = await this.dashboardService.getHotel(req.auth.hotelId);
    // role panelin demo modu rozeti/disable UI'ı için gerekli (yazma yetkisi değil).
    return { ...hotel, role: req.auth.role };
  }

  // PATCH /dashboard/hotel (auth'lı) — otelin düzenlenebilir alanlarını günceller.
  // Demo yazma engeli DemoReadOnlyGuard'da (metot bazlı). hotel_id yalnızca token'dan.
  @Patch('hotel')
  async updateHotel(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateHotelDto,
  ) {
    return this.dashboardService.updateHotel(req.auth.hotelId, dto);
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

  // GET /dashboard/report?range=&from=&to= (auth'lı) — özet+funnel+karbon tek yanıt
  @Get('report')
  async report(
    @Req() req: AuthenticatedRequest,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getReport(req.auth.hotelId, {
      range,
      from,
      to,
    });
  }

  // GET /dashboard/export.csv?range=&from=&to= (auth'lı) — tenant-scoped CSV indirme.
  // @Res kullanıldığı için ortak zarf (interceptor) devreye girmez; ham CSV döner.
  @Get('export.csv')
  async exportCsv(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const { filename, csv } = await this.dashboardService.exportCsv(
      req.auth.hotelId,
      { range, from, to },
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    // BOM: Excel'in UTF-8 (Türkçe karakter) doğru okuması için.
    res.send('﻿' + csv);
  }
}
