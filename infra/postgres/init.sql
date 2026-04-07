CREATE TABLE IF NOT EXISTS tasks (
  task_id UUID PRIMARY KEY,
  platform TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  session_scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL,
  delivery_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  merged_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tasks_session_status_created
  ON tasks(session_key, status, created_at);

CREATE TABLE IF NOT EXISTS task_parts (
  part_id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_parts_task_created
  ON task_parts(task_id, created_at);

WITH ranked_parts AS (
  SELECT
    part_id,
    task_id,
    ROW_NUMBER() OVER (
      PARTITION BY source_message_id
      ORDER BY created_at ASC, part_id ASC
    ) AS rn
  FROM task_parts
  WHERE source_message_id <> ''
),
duplicate_parts AS (
  SELECT part_id, task_id
  FROM ranked_parts
  WHERE rn > 1
)
DELETE FROM task_parts
WHERE part_id IN (SELECT part_id FROM duplicate_parts);

DELETE FROM tasks
WHERE NOT EXISTS (
  SELECT 1
  FROM task_parts
  WHERE task_parts.task_id = tasks.task_id
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_parts_source_message_id
  ON task_parts(source_message_id)
  WHERE source_message_id <> '';

CREATE TABLE IF NOT EXISTS session_bindings (
  session_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL,
  workspace_dir TEXT NOT NULL,
  home_dir TEXT NOT NULL,
  runtime_session_id TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_messages (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_lookup
  ON group_messages(platform, bot_id, group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_summaries (
  platform TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_message_id TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(platform, bot_id, group_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id UUID PRIMARY KEY,
  platform TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  delivery_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  content TEXT NOT NULL,
  resume_policy TEXT NOT NULL DEFAULT 'sticky',
  next_run_at TIMESTAMPTZ NOT NULL,
  interval_seconds INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_enqueued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_due
  ON schedules(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS schedule_runs (
  run_id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  task_id UUID,
  status TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT NOT NULL DEFAULT ''
);
