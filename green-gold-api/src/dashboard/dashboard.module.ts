import { Module } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, AuthGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
