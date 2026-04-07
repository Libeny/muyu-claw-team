import path from 'node:path';
import type { AgentRegistry } from './agent-registry.js';
import type { BotRegistry } from './bot-registry.js';
import { DiscordDelivery } from '../delivery/discord-delivery.js';
import { ClaudeService } from '../runtime/claude-service.js';
import { PostgresStore } from '../store/postgres.js';
import { RedisTaskQueue } from '../queue/redis-queue.js';
import { WorkspaceProjector } from './workspace-projector.js';
import type { AppConfig } from '../config.js';

export class WorkerPool {
  private running = false;

  constructor(
    private config: AppConfig,
    private store: PostgresStore,
    private queue: RedisTaskQueue,
    private bots: BotRegistry,
    private agents: AgentRegistry,
    private projector: WorkspaceProjector,
    private delivery: DiscordDelivery,
    private claude: ClaudeService,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.config.workerConcurrency; i += 1) {
      void this.loop(i);
    }
  }

  private async loop(_index: number): Promise<void> {
    while (this.running) {
      const taskId = await this.queue.dequeue(5);
      if (!taskId) continue;
      await this.handleTask(taskId);
    }
  }

  private async handleTask(taskId: string): Promise<void> {
    const task = await this.store.loadTask(taskId);
    if (!task) return;

    const locked = await this.queue.withSessionLock(task.sessionKey, 15 * 60 * 1000, async () => {
      const claimed = await this.store.claimTask(taskId);
      if (!claimed) return;

      try {
        const agent = this.agents.get(claimed.agentId);
        const bot = this.bots.get(claimed.botId);
        const sessionDir = this.resolveSessionDir(claimed);
        const session = {
          sessionKey: claimed.sessionKey,
          scope: claimed.sessionScope,
          sessionDir,
          workspaceDir: path.join(sessionDir, 'workspace'),
          homeDir: path.join(sessionDir, 'home'),
        };
        const { workspaceDir, homeDir, userDir } = this.projector.prepare(session, agent, claimed.userId);

        const binding = await this.store.getSessionBinding(claimed.sessionKey);
        const parts = await this.store.listTaskParts(taskId);
        const prompt = await this.buildPrompt(claimed.botId, claimed.groupId, parts.map((part) => part.content));

        const result = await this.claude.run({
          projectRoot: this.config.projectRoot,
          claudeExecutable: this.config.claudeExecutable,
          agent,
          prompt,
          workspaceDir,
          homeDir,
          sessionDir,
          userDir,
          systemDir: path.join(this.config.projectRoot, 'system'),
          runtimeEnv: {
            MUYU_DISCORD_BOT_TOKEN: bot.token,
            MUYU_DISCORD_CHANNEL_ID: claimed.deliveryTarget.channelId,
            MUYU_DISCORD_USER_ID: claimed.deliveryTarget.userId,
            MUYU_DISCORD_MENTION_USER: claimed.deliveryTarget.mentionUser ? '1' : '0',
            MUYU_SESSION_DIR: sessionDir,
          },
          resumeSessionId: binding?.runtimeSessionId || undefined,
        });

        await this.store.upsertSessionBinding({
          sessionKey: claimed.sessionKey,
          platform: claimed.platform,
          botId: claimed.botId,
          agentId: claimed.agentId,
          sessionScope: claimed.sessionScope,
          userId: claimed.userId,
          groupId: claimed.groupId,
          channelId: claimed.channelId,
          workspaceDir,
          homeDir,
          runtimeSessionId: result.sessionId,
        });
        await this.store.markTaskDone(taskId);
        await this.delivery.send(claimed.botId, claimed.deliveryTarget, result.text || '(Claude 未返回文本输出)');
      } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        await this.store.markTaskFailed(taskId, message);
        await this.delivery.send(
          claimed.botId,
          claimed.deliveryTarget,
          `处理失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    if (locked === null) {
      await this.queue.requeue(taskId);
    }
  }

  private resolveSessionDir(task: { sessionScope: string; userId: string; botId: string; groupId: string; sessionKey: string }): string {
    const root = path.join(this.config.projectRoot, 'sessions');
    if (task.sessionScope === 'private') {
      return path.join(root, 'private', task.userId, task.botId);
    }
    if (task.sessionScope === 'group') {
      return path.join(root, 'group', task.groupId, task.userId, task.botId);
    }
    const scheduleId = task.sessionKey.split(':').at(-1) || 'unknown';
    return path.join(root, 'scheduled', scheduleId, task.botId);
  }

  private async buildPrompt(botId: string, groupId: string, parts: string[]): Promise<string> {
    const mergedUserContent = parts.map((part, index) => `[${index + 1}] ${part}`).join('\n');
    if (!groupId) {
      return `用户连续发送了以下消息，请合并理解后统一处理：\n\n${mergedUserContent}`;
    }

    const summary = await this.store.getGroupSummary('discord', botId, groupId);
    const recent = await this.store.getRecentGroupMessages('discord', botId, groupId, this.config.groupContextMessageLimit);
    const recentText = recent
      .slice(-this.config.groupContextMessageLimit)
      .map((item) => `${item.userId}: ${item.content}`)
      .join('\n');

    const context = [
      '以下是该群的共享讨论记录，只作为参考输入，不代表共享运行时上下文。',
      summary ? `\n群摘要：\n${summary}` : '',
      recentText ? `\n最近群消息：\n${recentText}` : '',
      `\n当前用户的请求：\n${mergedUserContent}`,
    ]
      .filter(Boolean)
      .join('\n');

    return context;
  }
}
