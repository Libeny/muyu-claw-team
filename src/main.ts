import path from 'node:path';
import { loadConfig } from './config.js';
import { AgentRegistry } from './core/agent-registry.js';
import { BotRegistry } from './core/bot-registry.js';
import { Orchestrator } from './core/orchestrator.js';
import { SessionResolver } from './core/session-resolver.js';
import { WorkspaceProjector } from './core/workspace-projector.js';
import { WorkerPool } from './core/worker.js';
import { DiscordBridge } from './bridge/discord-bridge.js';
import { DiscordDelivery } from './delivery/discord-delivery.js';
import { RedisTaskQueue } from './queue/redis-queue.js';
import { ClaudeService } from './runtime/claude-service.js';
import { SchedulerService } from './scheduler/scheduler-service.js';
import { PostgresStore } from './store/postgres.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new PostgresStore(config.postgresUrl, config.projectRoot);
  await store.init();
  const locked = await store.acquireAppLock();
  if (!locked) {
    throw new Error('another muyu-claw-team instance is already running');
  }

  const queue = new RedisTaskQueue(config.redisUrl);
  const agents = new AgentRegistry(config.projectRoot);
  const bots = new BotRegistry(config.botsConfigPath);
  const sessions = new SessionResolver(config.projectRoot);
  const projector = new WorkspaceProjector(config.projectRoot);
  const orchestrator = new Orchestrator(store, queue, sessions, config.mergeWindowSeconds);
  const bridge = new DiscordBridge(bots.list(), orchestrator);
  const delivery = new DiscordDelivery(bridge.clients);
  const claude = new ClaudeService();
  const workers = new WorkerPool(config, store, queue, bots, agents, projector, delivery, claude);
  const scheduler = new SchedulerService(config, store, orchestrator);

  await bridge.start();
  workers.start();
  scheduler.start();

  console.log(`[${config.appName}] started`);
  console.log(`[${config.appName}] root: ${config.projectRoot}`);
  console.log(`[${config.appName}] bots: ${bots.list().map((bot) => `${bot.id}->${bot.agentId}`).join(', ')}`);
  console.log(`[${config.appName}] common skills: ${path.join(config.projectRoot, 'system', 'skills', 'common')}`);
}

void main().catch((error) => {
  console.error('[muyu-claw-team] fatal:', error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
