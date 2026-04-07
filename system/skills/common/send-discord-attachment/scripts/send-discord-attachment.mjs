#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function usage() {
  console.error(
    'Usage: send-discord-attachment.mjs --file <path> [--file <path> ...] [--content <text>] [--mention]',
  );
}

function parseArgs(argv) {
  const files = [];
  let content = '';
  let mention = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') {
      const value = argv[i + 1];
      if (!value) throw new Error('missing value for --file');
      files.push(value);
      i += 1;
      continue;
    }
    if (arg === '--content') {
      content = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--mention') {
      mention = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return { files, content, mention };
}

async function main() {
  const { files, content, mention } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    usage();
    throw new Error('at least one --file is required');
  }

  const token = process.env.MUYU_DISCORD_BOT_TOKEN || '';
  const channelId = process.env.MUYU_DISCORD_CHANNEL_ID || '';
  const userId = process.env.MUYU_DISCORD_USER_ID || '';
  const defaultMention = process.env.MUYU_DISCORD_MENTION_USER === '1';

  if (!token) throw new Error('MUYU_DISCORD_BOT_TOKEN is missing');
  if (!channelId) throw new Error('MUYU_DISCORD_CHANNEL_ID is missing');

  const form = new FormData();
  const mentionEnabled = mention || defaultMention;
  const finalContent = mentionEnabled && userId ? `<@${userId}> ${content}`.trim() : content.trim();
  const payload = {
    content: finalContent || undefined,
    allowed_mentions: mentionEnabled && userId ? { users: [userId] } : { parse: [] },
  };

  form.append('payload_json', JSON.stringify(payload));

  for (const [index, file] of files.entries()) {
    const resolved = path.resolve(file);
    const bytes = await fs.readFile(resolved);
    const blob = new Blob([bytes]);
    form.append(`files[${index}]`, blob, path.basename(resolved));
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`discord api error ${response.status}: ${text}`);
  }

  const json = await response.json();
  console.log(
    JSON.stringify({
      ok: true,
      message_id: json.id,
      channel_id: json.channel_id,
      attachment_count: Array.isArray(json.attachments) ? json.attachments.length : 0,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
