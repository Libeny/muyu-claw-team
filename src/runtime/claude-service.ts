import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition } from '../types.js';
import { buildSandboxPlan } from './sandbox.js';

interface ClaudeRunInput {
  projectRoot: string;
  claudeExecutable: string;
  agent: AgentDefinition;
  prompt: string;
  workspaceDir: string;
  homeDir: string;
  sessionDir: string;
  userDir: string;
  systemDir: string;
  runtimeEnv?: Record<string, string>;
  resumeSessionId?: string;
}

export interface ClaudeRunResult {
  sessionId: string;
  text: string;
}

export class ClaudeService {
  async run(input: ClaudeRunInput): Promise<ClaudeRunResult> {
    const sandbox = buildSandboxPlan({
      sessionDir: input.sessionDir,
      workspaceDir: input.workspaceDir,
      homeDir: input.homeDir,
      userDir: input.userDir,
      systemDir: input.systemDir,
      allowedTools: input.agent.profile.allowed_tools,
    });

    const stream = query({
      prompt: input.prompt,
      options: {
        cwd: input.workspaceDir,
        resume: input.resumeSessionId || undefined,
        model: input.agent.profile.model || undefined,
        allowedTools: input.agent.profile.allowed_tools || undefined,
        disallowedTools: input.agent.profile.disallowed_tools || undefined,
        permissionMode: sandbox.permissionMode,
        sandbox: sandbox.sdkSandbox,
        settings: sandbox.settings,
        settingSources: ['project'],
        pathToClaudeCodeExecutable: input.claudeExecutable,
        includePartialMessages: true,
        env: {
          ...(input.agent.profile.env || {}),
          ...(input.runtimeEnv || {}),
          ...process.env,
          ...sandbox.env,
        },
      },
    });

    let streamedText = '';
    let finalAssistantText = '';
    let sessionId = input.resumeSessionId || '';

    for await (const message of stream) {
      this.handleMessage(message, {
        onStreamText: (chunk) => {
          streamedText += chunk;
        },
        onAssistantText: (chunk) => {
          finalAssistantText += chunk;
        },
        onSession: (value) => {
          sessionId = value || sessionId;
        },
      });
    }

    return {
      sessionId,
      text: (streamedText || finalAssistantText).trim(),
    };
  }

  private handleMessage(
    message: SDKMessage,
    hooks: {
      onStreamText: (chunk: string) => void;
      onAssistantText: (chunk: string) => void;
      onSession: (sessionId: string) => void;
    },
  ): void {
    if (message.type === 'system' && message.subtype === 'init') {
      hooks.onSession(message.session_id);
      return;
    }

    if (
      message.type === 'stream_event' &&
      message.event.type === 'content_block_delta' &&
      message.event.delta.type === 'text_delta'
    ) {
      hooks.onStreamText(message.event.delta.text);
      return;
    }

    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          hooks.onAssistantText(block.text);
        }
      }
      return;
    }

    if (message.type === 'result') {
      if ('session_id' in message && message.session_id) {
        hooks.onSession(message.session_id);
      }
      if (message.subtype !== 'success') {
        const errors =
          'errors' in message && Array.isArray(message.errors) ? message.errors.join('; ') : 'Claude query failed';
        throw new Error(errors);
      }
    }
  }
}
