import type { IngressEvent, ScheduledTriggerEvent, TaskIngestResult } from '../types.js';
import { SessionResolver } from './session-resolver.js';
import { PostgresStore } from '../store/postgres.js';
import { RedisTaskQueue } from '../queue/redis-queue.js';

export class Orchestrator {
  constructor(
    private store: PostgresStore,
    private queue: RedisTaskQueue,
    private sessions: SessionResolver,
    private mergeWindowSeconds: number,
  ) {}

  async ingest(event: IngressEvent): Promise<TaskIngestResult> {
    const session = this.sessions.resolve(event);
    if (event.scope !== 'scheduled') {
      const duplicate = await this.store.findTaskBySourceMessageId(event.messageId);
      if (duplicate) {
        console.log(`[queue] duplicate message ignored source=${event.messageId} task=${duplicate.taskId}`);
        return {
          taskId: duplicate.taskId,
          merged: true,
          ackText: '',
          shouldAck: false,
        };
      }
    }

    if (event.scope === 'group') {
      await this.store.recordGroupMessage({
        platform: event.platform,
        botId: event.botId,
        groupId: event.groupId,
        channelId: event.channelId,
        userId: event.userId,
        messageId: event.messageId,
        content: event.content,
      });
    }

    const mergeable = await this.store.findMergeablePendingTask(session.sessionKey, this.mergeWindowSeconds);
    if (mergeable) {
      await this.store.appendTaskPart(mergeable.taskId, {
        authorId: event.userId,
        sourceMessageId: event.scope === 'scheduled' ? '' : event.messageId,
        content: event.content,
        deliveryTarget: event.deliveryTarget,
        channelId: event.channelId,
      });
      console.log(`[queue] merged task=${mergeable.taskId} session=${session.sessionKey}`);
      return {
        taskId: mergeable.taskId,
        merged: true,
        ackText: '已收到补充信息，我继续处理 👌',
        shouldAck: true,
      };
    }

    const taskId = await this.store.createTask({
      platform: event.platform,
      botId: event.botId,
      agentId: event.agentId,
      sessionKey: session.sessionKey,
      sessionScope: session.scope,
      userId: event.userId,
      groupId: event.groupId,
      channelId: event.channelId,
      deliveryTarget: event.deliveryTarget,
      content: event.content,
      sourceMessageId: event.scope === 'scheduled' ? '' : event.messageId,
    });
    await this.queue.enqueue(taskId);
    console.log(`[queue] enqueued task=${taskId} session=${session.sessionKey}`);

    return {
      taskId,
      merged: false,
      ackText: '收到啦，正在处理 👌',
      shouldAck: true,
    };
  }

  async ingestScheduled(event: ScheduledTriggerEvent): Promise<TaskIngestResult> {
    return this.ingest(event);
  }
}
