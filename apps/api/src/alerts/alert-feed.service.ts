import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AlertFeedStatus, Scenario } from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { scenarios } from '../db/schema';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimClockService } from '../scenarios/sim-clock.service';
import { AlertFeedError, readAlertFeed } from './alert-feed';

type Status = Pick<AlertFeedStatus, 'enabled' | 'reason' | 'lastPollAtS' | 'lastSuccessAtS' | 'lastError' | 'activeAlerts' | 'lastStats'>;

/**
 * Read-only rain alerts for the live scenario (P2-5.b). Polls a CAP 1.2 feed named by ALERT_FEED_URL and writes the
 * active Mumbai rain alerts into the live scenario's `alerts[]` (each with its sender as provenance), so the engine's
 * "rain alert active" and "no alert information" rules see real data. The simulated demo is never touched: it keeps
 * its own labelled alert. When the feed fails the last alerts stay and the status says how long ago it last worked.
 */
@Injectable()
export class AlertFeedService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('AlertFeed');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<Status> | null = null;
  private status: Status = { enabled: false, reason: null, lastPollAtS: null, lastSuccessAtS: null, lastError: null, activeAlerts: 0, lastStats: null };

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const a = this.config.alerts;
    const row = await this.scenarios.getRow(a.scenarioId);
    if (!a.url) this.status = { ...this.status, enabled: false, reason: 'ALERT_FEED_URL not set' };
    else if (!row) this.status = { ...this.status, enabled: false, reason: `Scenario ${a.scenarioId} not found (run db:seed)` };
    else if (this.scenarios.definition(row).mode !== 'live') this.status = { ...this.status, enabled: false, reason: `Scenario ${a.scenarioId} is not a live scenario` };
    else {
      this.status = { ...this.status, enabled: true, reason: null };
      if (a.pollSeconds > 0) {
        const first = setTimeout(() => void this.pollNow().catch(() => undefined), 3000);
        first.unref?.();
        this.timer = setInterval(() => void this.pollNow().catch(() => undefined), a.pollSeconds * 1000);
        this.timer.unref?.();
      }
    }
    this.logger.log(this.status.enabled ? `Alert feed on for ${a.scenarioId}, every ${a.pollSeconds} s` : `Alert feed off: ${this.status.reason}`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async feedStatus(scenarioId: string): Promise<AlertFeedStatus> {
    const row = await this.scenarios.requireRow(scenarioId);
    const own = scenarioId === this.config.alerts.scenarioId && this.scenarios.definition(row).mode === 'live';
    return {
      scenarioId,
      enabled: own && this.status.enabled,
      reason: own ? this.status.reason : 'The alert feed only runs for the live scenario',
      pollIntervalS: Math.max(1, this.config.alerts.pollSeconds),
      lastPollAtS: own ? this.status.lastPollAtS : null,
      lastSuccessAtS: own ? this.status.lastSuccessAtS : null,
      lastError: own ? this.status.lastError : null,
      activeAlerts: own ? this.status.activeAlerts : 0,
      lastStats: own ? this.status.lastStats : null,
      nowS: await this.clock.nowS(scenarioId),
    };
  }

  /** One poll; concurrent callers share the in-flight poll. */
  pollNow(scenarioId = this.config.alerts.scenarioId): Promise<Status> {
    if (scenarioId !== this.config.alerts.scenarioId) return Promise.reject(new ApiException('CONFLICT', 'The alert feed only runs for the live scenario'));
    if (!this.status.enabled) return Promise.reject(new ApiException('CONFLICT', `The alert feed is off: ${this.status.reason ?? 'disabled'}`));
    if (!this.running) {
      this.running = this.poll(scenarioId).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async poll(scenarioId: string): Promise<Status> {
    const nowS = await this.clock.nowS(scenarioId);
    this.status.lastPollAtS = nowS;
    const row = await this.scenarios.requireRow(scenarioId);
    const def = this.scenarios.definition(row);
    try {
      const parsed = await readAlertFeed(this.config.alerts.url, def.clockStartsAt, new Date());
      const next: Scenario = { ...def, alerts: parsed.alerts, hasAlertInformation: true };
      await this.db.update(scenarios).set({ definition: next }).where(eq(scenarios.id, scenarioId));
      this.status = { ...this.status, lastSuccessAtS: nowS, lastError: null, activeAlerts: parsed.alerts.length, lastStats: parsed.stats };
    } catch (e) {
      // A failed read keeps the alerts already stored: the status carries the error and the age of the last success.
      const message = e instanceof AlertFeedError ? e.message : 'The alert feed could not be read';
      this.status = { ...this.status, lastError: message };
      this.logger.warn(message);
    }
    return this.status;
  }
}
