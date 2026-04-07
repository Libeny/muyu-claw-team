import fs from 'node:fs';
import type { BotConfig } from '../types.js';

export interface ResolvedBotConfig extends BotConfig {
  token: string;
}

export class BotRegistry {
  private bots = new Map<string, ResolvedBotConfig>();

  constructor(configPath: string) {
    if (!configPath || !fs.existsSync(configPath)) {
      throw new Error(`bot config not found: ${configPath}. Copy config/bots.example.json to config/bots.local.json first.`);
    }

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as BotConfig[];
    for (const bot of raw) {
      const token = process.env[bot.tokenEnv] || '';
      if (!token) {
        throw new Error(`missing env ${bot.tokenEnv} for bot ${bot.id}`);
      }
      this.bots.set(bot.id, { ...bot, token });
    }
  }

  list(): ResolvedBotConfig[] {
    return [...this.bots.values()];
  }

  get(botId: string): ResolvedBotConfig {
    const bot = this.bots.get(botId);
    if (!bot) throw new Error(`unknown bot: ${botId}`);
    return bot;
  }
}
