import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { CreateWidgetEventDto } from './dto/create-widget-event.dto';
import { WidgetService } from './widget.service';

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
