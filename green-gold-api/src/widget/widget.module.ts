import { Module } from '@nestjs/common';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import { WidgetKeyRateGuard } from '../common/widget-key-rate.guard';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  controllers: [WidgetController],
  providers: [WidgetService, WidgetKeyRateGuard],
})
export class WidgetModule {}
