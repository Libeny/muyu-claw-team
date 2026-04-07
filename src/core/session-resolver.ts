import path from 'node:path';
import type { IngressEvent, ScheduledTriggerEvent, SessionResolution } from '../types.js';

export class SessionResolver {
  constructor(private projectRoot: string) {}

  resolve(event: IngressEvent): SessionResolution {
    const sessionsRoot = path.join(this.projectRoot, 'sessions');

    if (event.scope === 'private') {
      const sessionDir = path.join(sessionsRoot, 'private', event.userId, event.botId);
      return this.makeResolution('private', event, sessionDir);
    }

    if (event.scope === 'group') {
      const sessionDir = path.join(sessionsRoot, 'group', event.groupId, event.userId, event.botId);
      return this.makeResolution('group', event, sessionDir);
    }

    const scheduledEvent = event as ScheduledTriggerEvent;
    const sessionDir = path.join(sessionsRoot, 'scheduled', scheduledEvent.scheduleId, scheduledEvent.botId);
    return this.makeResolution('scheduled', scheduledEvent, sessionDir);
  }

  private makeResolution(
    scope: SessionResolution['scope'],
    event: IngressEvent | ScheduledTriggerEvent,
    sessionDir: string,
  ): SessionResolution {
    const sessionKey =
      scope === 'private'
        ? `${event.platform}:bot:${event.botId}:private:${event.userId}`
        : scope === 'group'
          ? `${event.platform}:bot:${event.botId}:group:${event.groupId}:user:${event.userId}`
          : `${event.platform}:bot:${event.botId}:scheduled:${(event as ScheduledTriggerEvent).scheduleId}`;

    return {
      sessionKey,
      sessionDir,
      workspaceDir: path.join(sessionDir, 'workspace'),
      homeDir: path.join(sessionDir, 'home'),
      scope,
    };
  }
}
