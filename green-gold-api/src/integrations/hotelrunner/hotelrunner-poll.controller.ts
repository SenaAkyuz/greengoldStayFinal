import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../common/route-metadata';
import { HotelRunnerPollService } from './hotelrunner-poll.service';

/**
 * Zamanlanmış tarama ucu (Vercel Cron vb.). Vercel Cron, `CRON_SECRET`
 * tanımlıysa isteğe `Authorization: Bearer <CRON_SECRET>` ekler.
 * CRON_SECRET tanımlı değilse uç KAPALIDIR (fail closed).
 */
@Public()
@Controller('integrations/hotelrunner')
export class HotelRunnerPollController {
  constructor(private readonly poll: HotelRunnerPollService) {}

  // GET /integrations/hotelrunner/poll
  @Get('poll')
  async run(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('Tarama yapılandırılmadı.');
    }
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization ?? '');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException();
    }
    return { integrations: await this.poll.pollAll() };
  }
}
