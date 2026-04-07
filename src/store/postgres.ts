import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type {
  DeliveryTarget,
  DueSchedule,
  GroupMessageRecord,
  SessionBinding,
  SessionScope,
  TaskPartRecord,
  TaskRecord,
  TaskStatus,
} from '../types.js';

function mapTask(row: Record<string, unknown>): TaskRecord {
  return {
    taskId: String(row.task_id),
    platform: 'discord',
    botId: String(row.bot_id),
    agentId: String(row.agent_id),
    sessionKey: String(row.session_key),
    sessionScope: String(row.session_scope) as SessionScope,
    userId: String(row.user_id),
    groupId: String(row.group_id || ''),
    channelId: String(row.channel_id),
    deliveryTarget: row.delivery_target as DeliveryTarget,
    status: String(row.status) as TaskStatus,
    mergedCount: Number(row.merged_count),
    createdAt: new Date(String(row.created_at)),
    startedAt: row.started_at ? new Date(String(row.started_at)) : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
    lastError: String(row.last_error || ''),
  };
}

export class PostgresStore {
  readonly pool: Pool;
  private appLockClient: PoolClient | null = null;

  constructor(databaseUrl: string, private projectRoot: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    const schemaPath = path.join(this.projectRoot, 'infra', 'postgres', 'init.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    if (this.appLockClient) {
      this.appLockClient.release();
      this.appLockClient = null;
    }
    await this.pool.end();
  }

  async acquireAppLock(lockId = 1851040701): Promise<boolean> {
    if (this.appLockClient) {
      return true;
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
      if (!result.rows[0]?.locked) {
        client.release();
        return false;
      }
      this.appLockClient = client;
      return true;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async recordGroupMessage(record: Omit<GroupMessageRecord, 'createdAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO group_messages(platform, bot_id, group_id, channel_id, user_id, message_id, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [record.platform, record.botId, record.groupId, record.channelId, record.userId, record.messageId, record.content],
    );
  }

  async findMergeablePendingTask(sessionKey: string, mergeWindowSeconds: number): Promise<TaskRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM tasks
       WHERE session_key = $1
         AND status = 'pending'
         AND started_at IS NULL
         AND created_at >= NOW() - ($2::text || ' seconds')::interval
       ORDER BY created_at ASC
       LIMIT 1`,
      [sessionKey, mergeWindowSeconds],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async findTaskBySourceMessageId(sourceMessageId: string): Promise<TaskRecord | null> {
    if (!sourceMessageId) return null;

    const result = await this.pool.query(
      `SELECT t.*
       FROM task_parts p
       JOIN tasks t ON t.task_id = p.task_id
       WHERE p.source_message_id = $1
       ORDER BY p.created_at ASC
       LIMIT 1`,
      [sourceMessageId],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async createTask(input: {
    platform: 'discord';
    botId: string;
    agentId: string;
    sessionKey: string;
    sessionScope: SessionScope;
    userId: string;
    groupId: string;
    channelId: string;
    deliveryTarget: DeliveryTarget;
    content: string;
    sourceMessageId: string;
  }): Promise<string> {
    const taskId = randomUUID();
    const partId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO tasks(task_id, platform, bot_id, agent_id, session_key, session_scope, user_id, group_id, channel_id, delivery_target)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          taskId,
          input.platform,
          input.botId,
          input.agentId,
          input.sessionKey,
          input.sessionScope,
          input.userId,
          input.groupId,
          input.channelId,
          input.deliveryTarget,
        ],
      );
      await client.query(
        `INSERT INTO task_parts(part_id, task_id, author_id, source_message_id, content)
         VALUES ($1,$2,$3,$4,$5)`,
        [partId, taskId, input.userId, input.sourceMessageId, input.content],
      );
      await client.query('COMMIT');
      return taskId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendTaskPart(taskId: string, part: {
    authorId: string;
    sourceMessageId: string;
    content: string;
    deliveryTarget: DeliveryTarget;
    channelId: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO task_parts(part_id, task_id, author_id, source_message_id, content)
         VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), taskId, part.authorId, part.sourceMessageId, part.content],
      );
      await client.query(
        `UPDATE tasks
         SET merged_count = merged_count + 1,
             delivery_target = $2,
             channel_id = $3
         WHERE task_id = $1`,
        [taskId, part.deliveryTarget, part.channelId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadTask(taskId: string): Promise<TaskRecord | null> {
    const result = await this.pool.query(`SELECT * FROM tasks WHERE task_id = $1`, [taskId]);
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async listTaskParts(taskId: string): Promise<TaskPartRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM task_parts WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    return result.rows.map((row) => ({
      partId: String(row.part_id),
      taskId: String(row.task_id),
      authorId: String(row.author_id),
      sourceMessageId: String(row.source_message_id || ''),
      content: String(row.content),
      createdAt: new Date(String(row.created_at)),
    }));
  }

  async claimTask(taskId: string): Promise<TaskRecord | null> {
    const result = await this.pool.query(
      `UPDATE tasks
       SET status = 'processing', started_at = NOW()
       WHERE task_id = $1 AND status = 'pending' AND started_at IS NULL
       RETURNING *`,
      [taskId],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async markTaskDone(taskId: string): Promise<void> {
    await this.pool.query(
      `UPDATE tasks SET status = 'done', finished_at = NOW() WHERE task_id = $1`,
      [taskId],
    );
  }

  async markTaskFailed(taskId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE tasks SET status = 'failed', finished_at = NOW(), last_error = $2 WHERE task_id = $1`,
      [taskId, errorMessage.slice(0, 4000)],
    );
  }

  async getSessionBinding(sessionKey: string): Promise<SessionBinding | null> {
    const result = await this.pool.query(`SELECT * FROM session_bindings WHERE session_key = $1`, [sessionKey]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionKey: String(row.session_key),
      platform: 'discord',
      botId: String(row.bot_id),
      agentId: String(row.agent_id),
      sessionScope: String(row.session_scope) as SessionScope,
      userId: String(row.user_id),
      groupId: String(row.group_id || ''),
      channelId: String(row.channel_id),
      workspaceDir: String(row.workspace_dir),
      homeDir: String(row.home_dir),
      runtimeSessionId: String(row.runtime_session_id || ''),
      updatedAt: new Date(String(row.updated_at)),
    };
  }

  async upsertSessionBinding(binding: Omit<SessionBinding, 'updatedAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_bindings(
        session_key, platform, bot_id, agent_id, session_scope, user_id, group_id, channel_id, workspace_dir, home_dir, runtime_session_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(session_key) DO UPDATE SET
        bot_id = EXCLUDED.bot_id,
        agent_id = EXCLUDED.agent_id,
        channel_id = EXCLUDED.channel_id,
        workspace_dir = EXCLUDED.workspace_dir,
        home_dir = EXCLUDED.home_dir,
        runtime_session_id = EXCLUDED.runtime_session_id,
        updated_at = NOW()`,
      [
        binding.sessionKey,
        binding.platform,
        binding.botId,
        binding.agentId,
        binding.sessionScope,
        binding.userId,
        binding.groupId,
        binding.channelId,
        binding.workspaceDir,
        binding.homeDir,
        binding.runtimeSessionId,
      ],
    );
  }

  async getRecentGroupMessages(platform: 'discord', botId: string, groupId: string, limit: number): Promise<GroupMessageRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM group_messages
       WHERE platform = $1 AND bot_id = $2 AND group_id = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [platform, botId, groupId, limit],
    );
    return result.rows.reverse().map((row) => ({
      platform: 'discord',
      botId: String(row.bot_id),
      groupId: String(row.group_id),
      channelId: String(row.channel_id),
      userId: String(row.user_id),
      messageId: String(row.message_id),
      content: String(row.content),
      createdAt: new Date(String(row.created_at)),
    }));
  }

  async getGroupSummary(platform: 'discord', botId: string, groupId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT summary FROM group_summaries WHERE platform = $1 AND bot_id = $2 AND group_id = $3`,
      [platform, botId, groupId],
    );
    return String(result.rows[0]?.summary || '');
  }

  async listDueSchedules(limit = 100): Promise<DueSchedule[]> {
    const result = await this.pool.query(
      `SELECT * FROM schedules
       WHERE enabled = TRUE
         AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      scheduleId: String(row.schedule_id),
      platform: 'discord',
      botId: String(row.bot_id),
      agentId: String(row.agent_id),
      ownerUserId: String(row.owner_user_id),
      deliveryTarget: row.delivery_target as DeliveryTarget,
      content: String(row.content),
      resumePolicy: String(row.resume_policy) as 'sticky' | 'fresh',
      nextRunAt: new Date(String(row.next_run_at)),
      intervalSeconds: row.interval_seconds === null ? null : Number(row.interval_seconds),
    }));
  }

  async markScheduleTriggered(schedule: DueSchedule, taskId: string): Promise<void> {
    const runId = randomUUID();
    const nextRunAt = schedule.intervalSeconds
      ? new Date(schedule.nextRunAt.getTime() + schedule.intervalSeconds * 1000)
      : null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO schedule_runs(run_id, schedule_id, task_id, status)
         VALUES ($1,$2,$3,'queued')`,
        [runId, schedule.scheduleId, taskId],
      );

      if (nextRunAt) {
        await client.query(
          `UPDATE schedules
           SET next_run_at = $2, last_enqueued_at = NOW(), updated_at = NOW()
           WHERE schedule_id = $1`,
          [schedule.scheduleId, nextRunAt],
        );
      } else {
        await client.query(
          `UPDATE schedules
           SET enabled = FALSE, last_enqueued_at = NOW(), updated_at = NOW()
           WHERE schedule_id = $1`,
          [schedule.scheduleId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
