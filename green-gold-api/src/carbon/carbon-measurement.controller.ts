import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth.guard';
import { CarbonMeasurementService } from './carbon-measurement.service';
import { StartMeasurementDto } from './dto/start-measurement.dto';

/**
 * Karbon ölçüm sağlayıcısı (3pmetrics) panel yüzeyi.
 *
 * Guard'lar GLOBAL (AppModule) — bu controller @Public DEĞİL, auth zorunlu.
 * hotel_id ASLA gövdeden/query'den okunmaz, yalnızca token'dan (req.auth).
 * Yazma metotları demo_viewer için DemoReadOnlyGuard tarafından 403 alır.
 *
 * Sağlayıcı sözleşmesi gelene kadar POST uçları 503
 * 'carbon_provider_not_configured' döner — panel bunu dürüst bir "bekleniyor"
 * durumu olarak gösterir, bağlıymış gibi davranmaz.
 */
@Controller('dashboard/carbon-provider')
export class CarbonMeasurementController {
  constructor(private readonly measurement: CarbonMeasurementService) {}

  // GET /dashboard/carbon-provider/status
  @Get('status')
  async status(@Req() req: AuthenticatedRequest) {
    return this.measurement.getStatus(req.auth.hotelId);
  }

  // GET /dashboard/carbon-provider/measurements
  @Get('measurements')
  async measurements(@Req() req: AuthenticatedRequest) {
    return this.measurement.listMeasurements(req.auth.hotelId);
  }

  // GET /dashboard/carbon-provider/properties — Faz 2, yetkili tesisler
  @Get('properties')
  async properties(@Req() req: AuthenticatedRequest) {
    return this.measurement.listProviderProperties(req.auth.hotelId);
  }

  // POST /dashboard/carbon-provider/sessions — Faz 1, "Ölçüme başla"
  @Post('sessions')
  async startMeasurement(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StartMeasurementDto,
  ) {
    return this.measurement.startMeasurement(req.auth.hotelId, dto);
  }

  // DELETE /dashboard/carbon-provider/links/:id — bağlantıyı kaldır
  @Delete('links/:id')
  async revokeLink(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.measurement.revokeLink(req.auth.hotelId, id);
  }
}
