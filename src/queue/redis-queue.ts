import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisTaskQueue {
  private command: Redis;
  private blocking: Redis;
  private readonly queueKey = 'muyu:task_queue';

  constructor(redisUrl: string) {
    this.command = new Redis(redisUrl);
    this.blocking = new Redis(redisUrl);
  }

  async close(): Promise<void> {
    await this.command.quit();
    await this.blocking.quit();
  }

  async enqueue(taskId: string): Promise<void> {
    await this.command.rpush(this.queueKey, taskId);
  }

  async dequeue(timeoutSeconds = 5): Promise<string | null> {
    const result = await this.blocking.blpop(this.queueKey, timeoutSeconds);
    return result?.[1] ?? null;
  }

  async requeue(taskId: string): Promise<void> {
    await this.command.lpush(this.queueKey, taskId);
  }

  async withSessionLock<T>(sessionKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const lockKey = `muyu:lock:session:${sessionKey}`;
    const token = randomUUID();
    const ok = await this.command.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;

    try {
      return await fn();
    } finally {
      await this.command.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
    }
  }
}
