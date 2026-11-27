import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { ConnectHubService } from './connecthub.service';
import {
  FacilityProfileDto,
  PeriodOccupancyDto,
  SubmitPeriodDto,
} from './connecthub.dto';

/**
 * 3pmetrics ConnectHub ölçüm akışı — panel yüzeyi.
 *
 * Guard'lar GLOBAL: auth zorunlu, hotel_id yalnızca token'dan, yazma uçları
 * demo_viewer için 403 (DemoReadOnlyGuard). Ölçümü widget fiyatına uygulamak
 * mevcut `POST /dashboard/carbon-provider/measurements/:id/activate` ile yapılır.
 */
@Controller('dashboard/carbon-provider/connecthub')
export class ConnectHubController {
  constructor(private readonly connecthub: ConnectHubService) {}

  // GET /dashboard/carbon-provider/connecthub/status
  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    return this.connecthub.getStatus(req.auth.hotelId);
  }

  // GET /dashboard/carbon-provider/connecthub/items?year=2026 — tesisin açık
  // başlıkları + faktör durumu (year verilmezse içinde bulunulan yıl)
  @Get('items')
  items(
    @Req() req: AuthenticatedRequest,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.connecthub.listItems(req.auth.hotelId, year);
  }

  // GET /dashboard/carbon-provider/connecthub/periods?year=2026 — 12 ayın
  // yerel durumu (sağlayıcıya istek atmaz)
  @Get('periods')
  periods(
    @Req() req: AuthenticatedRequest,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.connecthub.listPeriods(
      req.auth.hotelId,
      year ?? new Date().getUTCFullYear(),
    );
  }

  // PUT /dashboard/carbon-provider/connecthub/profile — tesis profili
  @Put('profile')
  saveProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: FacilityProfileDto,
  ) {
    return this.connecthub.saveProfile(
      req.auth.hotelId,
      req.auth.authUserId,
      dto,
    );
  }

  // GET /dashboard/carbon-provider/connecthub/periods/2026-10
  @Get('periods/:period')
  period(@Req() req: AuthenticatedRequest, @Param('period') period: string) {
    return this.connecthub.getPeriod(req.auth.hotelId, period);
  }

  // PUT /dashboard/carbon-provider/connecthub/periods/2026-10/occupancy
  @Put('periods/:period/occupancy')
  occupancy(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Body() dto: PeriodOccupancyDto,
  ) {
    return this.connecthub.setOccupancy(
      req.auth.hotelId,
      req.auth.authUserId,
      period,
      dto.occupied_room_nights,
    );
  }

  // POST /dashboard/carbon-provider/connecthub/periods/2026-10/records
  @Post('periods/:period/records')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Body() dto: SubmitPeriodDto,
  ) {
    return this.connecthub.submitPeriod(
      req.auth.hotelId,
      req.auth.authUserId,
      period,
      dto,
    );
  }

  // GET /dashboard/carbon-provider/connecthub/periods/2026-10/provider-records —
  // ölçüm ortağındaki ONAYLI dönem kayıtları (salt okuma; hesap bunlarla yapılır)
  @Get('periods/:period/provider-records')
  providerRecords(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
  ) {
    return this.connecthub.getProviderRecords(req.auth.hotelId, period);
  }

  // GET /dashboard/carbon-provider/connecthub/periods/2026-10/measurement —
  // dönemin kaydedilmiş hesabı (salt okuma; sağlayıcıya istek yok, yazma yok)
  @Get('periods/:period/measurement')
  measurement(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
  ) {
    return this.connecthub.getPeriodMeasurement(req.auth.hotelId, period);
  }

  // GET …/periods/2026-10/measurements — dönemin tüm kayıtlı sürümleri
  // (salt okuma, yeniden eskiye)
  @Get('periods/:period/measurements')
  measurements(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
  ) {
    return this.connecthub.listPeriodMeasurements(req.auth.hotelId, period);
  }

  // GET …/periods/2026-10/measurements/:id — belirli bir sürümün ayrıntısı
  @Get('periods/:period/measurements/:id')
  measurementVersion(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Param('id') id: string,
  ) {
    return this.connecthub.getPeriodMeasurementVersion(
      req.auth.hotelId,
      period,
      id,
    );
  }

  // POST /dashboard/carbon-provider/connecthub/periods/2026-10/calculate
  @Post('periods/:period/calculate')
  calculate(@Req() req: AuthenticatedRequest, @Param('period') period: string) {
    return this.connecthub.calculatePeriod(req.auth.hotelId, period);
  }
}
