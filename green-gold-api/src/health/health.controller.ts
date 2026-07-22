import { Controller, Get } from '@nestjs/common';

@Controller('internal')
export class HealthController {
  // GET /internal/health — auth yok. Interceptor { success, data, error } zarfına sarar.
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
