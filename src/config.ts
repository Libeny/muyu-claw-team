import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(SRC_DIR, '..');

loadDotenv({ path: path.join(PROJECT_ROOT, '.env') });
loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local'), override: true });

const envSchema = z.object({
  APP_NAME: z.string().default('muyu-claw-team'),
  LOG_LEVEL: z.string().default('info'),
  POSTGRES_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:5432/muyu_claw_team'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379/0'),
  CLAUDE_EXECUTABLE: z.string().default('/opt/homebrew/bin/claude'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MERGE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  SCHEDULER_POLL_SECONDS: z.coerce.number().int().positive().default(15),
  GROUP_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.parse(process.env);

export interface AppConfig {
  appName: string;
  projectRoot: string;
  postgresUrl: string;
  redisUrl: string;
  claudeExecutable: string;
  workerConcurrency: number;
  mergeWindowSeconds: number;
  schedulerPollSeconds: number;
  groupContextMessageLimit: number;
  botsConfigPath: string;
}

export function loadConfig(): AppConfig {
  const localBots = path.join(PROJECT_ROOT, 'config', 'bots.local.json');
  const sharedBots = path.join(PROJECT_ROOT, 'config', 'bots.json');
  const botsConfigPath = fs.existsSync(localBots) ? localBots : sharedBots;

  return {
    appName: parsed.APP_NAME,
    projectRoot: PROJECT_ROOT,
    postgresUrl: parsed.POSTGRES_URL,
    redisUrl: parsed.REDIS_URL,
    claudeExecutable: parsed.CLAUDE_EXECUTABLE,
    workerConcurrency: parsed.WORKER_CONCURRENCY,
    mergeWindowSeconds: parsed.MERGE_WINDOW_SECONDS,
    schedulerPollSeconds: parsed.SCHEDULER_POLL_SECONDS,
    groupContextMessageLimit: parsed.GROUP_CONTEXT_MESSAGE_LIMIT,
    botsConfigPath,
  };
}
