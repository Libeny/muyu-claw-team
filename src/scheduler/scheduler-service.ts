import { randomUUID } from 'node:crypto';
import type { Orchestrator } from '../core/orchestrator.js';
import { PostgresStore } from '../store/postgres.js';
import type { AppConfig } from '../config.js';
import type { ScheduledTriggerEvent } from '../types.js';

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private config: AppConfig,
    private store: PostgresStore,
    private orchestrator: Orchestrator,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.schedulerPollSeconds * 1000);
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const due = await this.store.listDueSchedules(100);
    for (const schedule of due) {
      const event: ScheduledTriggerEvent = {
        source: 'scheduler',
        platform: schedule.platform,
        botId: schedule.botId,
        agentId: schedule.agentId,
        scope: 'scheduled',
        scheduleId: schedule.scheduleId,
        userId: schedule.ownerUserId,
        groupId: '',
        channelId: schedule.deliveryTarget.channelId,
        content: schedule.content,
        deliveryTarget: schedule.deliveryTarget,
        resumePolicy: schedule.resumePolicy,
      };
      const result = await this.orchestrator.ingestScheduled(event);
      await this.store.markScheduleTriggered(schedule, result.taskId || randomUUID());
    }
  }
}
