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
import { ImportMeasurementDto } from './dto/start-measurement.dto';

/**
 * Karbon ölçüm sağlayıcısı (3pmetrics) panel yüzeyi.
 *
 * Guard'lar GLOBAL (AppModule) — bu controller @Public DEĞİL, auth zorunlu.
 * hotel_id ASLA gövdeden/query'den okunmaz, yalnızca token'dan (req.auth).
 * Yazma metotları demo_viewer için DemoReadOnlyGuard tarafından 403 alır.
 *
 * Bağlantı/anahtar yoksa POST uçları 503 ve açık bir `code` döner — panel bunu
 * dürüst bir "bekleniyor" durumu olarak gösterir, bağlıymış gibi davranmaz.
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

  // GET /dashboard/carbon-provider/units — bağlı 3pmetrics hesabının birimleri
  @Get('units')
  async units(@Req() req: AuthenticatedRequest) {
    return this.measurement.listProviderUnits(req.auth.hotelId);
  }

  // POST /dashboard/carbon-provider/measurements — dönem özetini içeri al
  @Post('measurements')
  async importMeasurement(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportMeasurementDto,
  ) {
    return this.measurement.importMeasurement(req.auth.hotelId, dto);
  }

  // POST /dashboard/carbon-provider/measurements/:id/activate — widget fiyatına uygula
  @Post('measurements/:id/activate')
  async activate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.measurement.activateMeasurement(req.auth.hotelId, id);
  }

  // DELETE /dashboard/carbon-provider/links/:id — bağlantıyı kaldır
  @Delete('links/:id')
  async revokeLink(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.measurement.revokeLink(req.auth.hotelId, id);
  }
}
