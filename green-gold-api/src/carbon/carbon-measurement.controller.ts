import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../common/auth.guard';
import { CarbonMeasurementService } from './carbon-measurement.service';
import { ImportMeasurementDto } from './dto/start-measurement.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import {
  CarbonDataEntryService,
  ENTRY_DOCUMENT_MAX_BYTES,
  type UploadedDocument,
} from './carbon-data-entry.service';

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
  constructor(
    private readonly measurement: CarbonMeasurementService,
    private readonly entries: CarbonDataEntryService,
  ) {}

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

  // --- Veri girişi: otel emisyon verisini panelden 3pmetrics'e yazar ---------

  // GET /dashboard/carbon-provider/units/:unitId/emission-resources
  @Get('units/:unitId/emission-resources')
  async emissionResources(
    @Req() req: AuthenticatedRequest,
    @Param('unitId') unitId: string,
  ) {
    return this.entries.listEmissionResources(req.auth.hotelId, unitId);
  }

  // GET /dashboard/carbon-provider/airports?query=ist — uçuş kaynakları için
  @Get('airports')
  async airports(
    @Req() req: AuthenticatedRequest,
    @Query('query') query: string,
  ) {
    return this.entries.lookupAirports(req.auth.hotelId, query);
  }

  // GET /dashboard/carbon-provider/entries — panelden gönderilen kayıtlar
  @Get('entries')
  async listEntries(@Req() req: AuthenticatedRequest) {
    return this.entries.listEntries(req.auth.hotelId);
  }

  // POST /dashboard/carbon-provider/entries — 3pmetrics'e yazar (GERİ ALINAMAZ)
  @Post('entries')
  async createEntry(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateEntryDto,
  ) {
    return this.entries.createEntry(req.auth.hotelId, req.auth.authUserId, dto);
  }

  // POST /dashboard/carbon-provider/entries/:id/documents — multipart `file`
  @Post('entries/:id/documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ENTRY_DOCUMENT_MAX_BYTES } }),
  )
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedDocument | undefined,
  ) {
    return this.entries.uploadDocument(req.auth.hotelId, id, file);
  }

  // POST /dashboard/carbon-provider/entries/:id/mark-deleted — 3pmetrics
  // arayüzünden silindiğini işaretler (API silme yapmaz).
  @Post('entries/:id/mark-deleted')
  async markDeleted(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.entries.markDeletedInProvider(req.auth.hotelId, id);
  }
}
