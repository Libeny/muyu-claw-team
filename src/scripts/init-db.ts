import { loadConfig } from '../config.js';
import { PostgresStore } from '../store/postgres.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new PostgresStore(config.postgresUrl, config.projectRoot);
  await store.init();
  await store.close();
  console.log('[muyu-claw-team] database initialized');
}

void main();
