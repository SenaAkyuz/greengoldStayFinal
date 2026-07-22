import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CreateWidgetEventDto } from './dto/create-widget-event.dto';
import { WidgetService } from './widget.service';
import { WidgetKeyRateGuard } from '../common/widget-key-rate.guard';

// /widget/* public yüzey: IP başına 60/dk (ThrottlerGuard) + key başına 300/dk.
@UseGuards(ThrottlerGuard, WidgetKeyRateGuard)
@Controller('widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  // GET /widget/config?key=<public_widget_key> — public. Widget'ın gösterdiği config.
  @Get('config')
  async getConfig(@Query('key') key?: string) {
    return this.widgetService.getConfig(key);
  }

  // POST /widget/events — public. Header: X-Widget-Key: <public_widget_key>
  @Post('events')
  async createEvent(
    @Headers('x-widget-key') widgetKey: string | undefined,
    @Body() dto: CreateWidgetEventDto,
  ) {
    return this.widgetService.recordEvent(widgetKey, dto);
  }
}
