import { Module } from '@nestjs/common';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import { WidgetKeyRateGuard } from '../common/widget-key-rate.guard';

@Module({
  controllers: [WidgetController],
  providers: [WidgetService, WidgetKeyRateGuard],
})
export class WidgetModule {}
