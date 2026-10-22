import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AlertFeedStatus } from '@vighnaway/contracts';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404 } from '../common/validation';
import { AlertFeedService } from './alert-feed.service';

@Controller('scenarios/:id/alerts')
export class AlertsController {
  constructor(@Inject(AlertFeedService) private readonly feed: AlertFeedService) {}

  /** Rain-alert feed status for a scenario (running only for the live scenario with ALERT_FEED_URL set). */
  @Get()
  status(@Param('id') rawId: string): Promise<AlertFeedStatus> {
    return this.feed.feedStatus(parseIdOr404(rawId, 'scenario'));
  }

  /** Read the alert feed now (operator only). */
  @Post('poll')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async poll(@Param('id') rawId: string): Promise<AlertFeedStatus> {
    const id = parseIdOr404(rawId, 'scenario');
    await this.feed.pollNow(id);
    return this.feed.feedStatus(id);
  }
}
