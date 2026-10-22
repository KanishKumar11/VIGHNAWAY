import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { FeedStatus } from '@vighnaway/contracts';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404 } from '../common/validation';
import { type PollResult, TrafficFeedService } from './traffic-feed.service';

@Controller('scenarios/:id/feed')
export class TrafficController {
  constructor(@Inject(TrafficFeedService) private readonly feed: TrafficFeedService) {}

  /** Live traffic feed status for a scenario (enabled only for the live scenario with a key). */
  @Get()
  status(@Param('id') rawId: string): Promise<FeedStatus> {
    return this.feed.feedStatus(parseIdOr404(rawId, 'scenario'));
  }

  /** Poll TomTom now (operator only), e.g. right before a live demo. */
  @Post('poll')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async poll(@Param('id') rawId: string): Promise<{ result: PollResult; status: FeedStatus }> {
    const id = parseIdOr404(rawId, 'scenario');
    const result = await this.feed.pollNow(id);
    return { result, status: await this.feed.feedStatus(id) };
  }
}
