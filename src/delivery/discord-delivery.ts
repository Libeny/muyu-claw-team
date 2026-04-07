import { ChannelType, type Client } from 'discord.js';
import type { DeliveryTarget } from '../types.js';

function splitMessage(text: string, limit = 1800): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    chunks.push(rest.slice(0, limit));
    rest = rest.slice(limit);
  }
  if (rest) chunks.push(rest);
  return chunks.length > 0 ? chunks : ['(empty response)'];
}

export class DiscordDelivery {
  constructor(private clients: Map<string, Client>) {}

  async send(botId: string, target: DeliveryTarget, text: string): Promise<void> {
    const client = this.clients.get(botId);
    if (!client) throw new Error(`discord client missing for bot ${botId}`);

    const channel = await client.channels.fetch(target.channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`text channel not found: ${target.channelId}`);
    }
    if (!channel.isSendable()) {
      throw new Error(`channel is not sendable: ${target.channelId}`);
    }

    const content = target.mentionUser ? `<@${target.userId}> ${text}` : text;
    for (const chunk of splitMessage(content)) {
      await channel.send(chunk);
    }
  }
}
