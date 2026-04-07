import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
} from 'discord.js';
import type { ResolvedBotConfig } from '../core/bot-registry.js';
import type { Orchestrator } from '../core/orchestrator.js';
import type { ChatIngressEvent } from '../types.js';

export class DiscordBridge {
  readonly clients = new Map<string, Client>();

  constructor(private bots: ResolvedBotConfig[], private orchestrator: Orchestrator) {}

  async start(): Promise<void> {
    for (const bot of this.bots) {
      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Channel],
      });

      client.on('clientReady', () => {
        console.log(`[discord] bot ready: ${bot.id} as ${client.user?.tag}`);
      });

      client.on('messageCreate', (message) => {
        void this.handleMessage(bot, message);
      });

      await client.login(bot.token);
      this.clients.set(bot.id, client);
    }
  }

  private async handleMessage(bot: ResolvedBotConfig, message: Message): Promise<void> {
    if (message.author.bot) return;

    const isPrivate = message.channel.type === ChannelType.DM;
    const isMentioned = message.mentions.users.has(message.client.user.id);
    if (!isPrivate && !isMentioned) return;

    const content = this.normalizeContent(message);
    if (!content) return;

    console.log(
      `[discord] inbound bot=${bot.id} scope=${isPrivate ? 'private' : 'group'} user=${message.author.id} channel=${message.channelId} message=${message.id}`,
    );

    const event: ChatIngressEvent = {
      source: 'discord',
      platform: 'discord',
      botId: bot.id,
      agentId: bot.agentId,
      scope: isPrivate ? 'private' : 'group',
      userId: message.author.id,
      username: message.author.username,
      groupId: message.guildId || '',
      channelId: message.channelId,
      messageId: message.id,
      content,
      deliveryTarget: {
        kind: 'discord',
        channelId: message.channelId,
        userId: message.author.id,
        mentionUser: !isPrivate,
      },
    };

    const result = await this.orchestrator.ingest(event);
    if (!result.shouldAck) {
      return;
    }

    if (!message.channel.isSendable()) {
      throw new Error(`channel is not sendable: ${message.channelId}`);
    }
    await message.channel.send(result.ackText);
  }

  private normalizeContent(message: Message): string {
    let content = (message.content || '').trim();
    const selfId = message.client.user.id;
    content = content
      .replace(new RegExp(`<@!?${selfId}>`, 'g'), '')
      .trim();
    return content;
  }
}
