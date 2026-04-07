import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { BotRegistry } from '../core/bot-registry.js';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

function ok(label: string, detail: string): void {
  console.log(`OK   ${label}: ${detail}`);
}

function fail(label: string, detail: string): void {
  console.log(`FAIL ${label}: ${detail}`);
}

function hasCommand(command: string): boolean {
  const result = spawnSync('which', [command], { encoding: 'utf-8' });
  return result.status === 0;
}

async function main(): Promise<void> {
  const config = loadConfig();
  let failed = false;

  if (fs.existsSync(config.botsConfigPath)) {
    ok('bot config', config.botsConfigPath);
  } else {
    failed = true;
    fail('bot config', `missing ${config.botsConfigPath}`);
  }

  try {
    const bots = new BotRegistry(config.botsConfigPath);
    ok('bot env', `${bots.list().length} bot(s) resolved`);
  } catch (error) {
    failed = true;
    fail('bot env', error instanceof Error ? error.message : String(error));
  }

  if (fs.existsSync(config.claudeExecutable)) {
    ok('claude executable', config.claudeExecutable);
  } else {
    failed = true;
    fail('claude executable', `missing ${config.claudeExecutable}`);
  }

  if (process.platform === 'darwin') {
    ok('sandbox backend', 'Seatbelt via Claude native sandbox');
  } else if (process.platform === 'linux') {
    if (hasCommand('bwrap')) {
      ok('sandbox backend', 'bubblewrap available');
    } else {
      failed = true;
      fail('sandbox backend', 'bubblewrap missing on Linux');
    }
  } else {
    failed = true;
    fail('sandbox backend', `unsupported platform ${process.platform}`);
  }

  const pool = new Pool({ connectionString: config.postgresUrl });
  try {
    await pool.query('select 1');
    ok('postgres', config.postgresUrl);
  } catch (error) {
    failed = true;
    fail('postgres', error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end().catch(() => undefined);
  }

  const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.ping();
    ok('redis', config.redisUrl);
  } catch (error) {
    failed = true;
    fail('redis', error instanceof Error ? error.message : String(error));
  } finally {
    await redis.quit().catch(async () => {
      await redis.disconnect();
    });
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log('READY all required dependencies passed');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
